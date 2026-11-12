import { scale, describeAbility } from "./cards.ts";
import type { Ability, CardDef, RelicDef, Star, Tribe } from "./types.ts";

/*
 * 編成バトル(提案書 6.1節)。乱数を使わないので、同じ入力からは必ず同じ結果になる。
 *
 * - 5体を1列に並べ、先頭どうしが同時に攻撃する。倒れたら次が前に出る。
 * - 能力は battleStart → (turnStart → 攻撃 → attack) の繰り返しで発動する。倒れたら faint。
 * - 同じ種族が2体以上いると、その種族に連携ボーナスがつく。
 * - レリックはチーム全体にかかる。
 */

export const TEAM_SIZE = 5;
export const MAX_ROUNDS = 40;
/** 同じ種族の数ごとの連携ボーナス(攻撃と体力に加算) */
export const SYNERGY_BONUS = [0, 0, 1, 2, 2, 3] as const;

export interface TeamSlot {
  cardId: string;
  star: Star;
}

export interface Team {
  slots: readonly TeamSlot[];
  relicIds: readonly string[];
}

export interface BattleContext {
  cards: ReadonlyMap<string, CardDef>;
  relics: ReadonlyMap<string, RelicDef>;
}

export type Side = "A" | "B";

export interface BattleUnit {
  uid: number;
  side: Side;
  name: string;
  tribe: Tribe;
  /** 分身は null */
  cardId: string | null;
  baseAtk: number;
  baseHp: number;
  atk: number;
  hp: number;
  maxHp: number;
  shield: number;
  star: Star;
  ability: Ability | null;
}

export type BattleEvent =
  | { t: "ability"; uid: number; side: Side; name: string; text: string }
  | { t: "attack"; a: number; b: number; dmgToB: number; dmgToA: number }
  | { t: "damage"; uid: number; amount: number; absorbed: number }
  | { t: "faint"; uid: number; side: Side; name: string }
  | { t: "summon"; uid: number; side: Side; name: string; atk: number; hp: number }
  | { t: "round"; n: number }
  /** その時点の並びと数値(画面の再生用)。能力・攻撃・退場のたびに記録する */
  | { t: "state"; A: UnitSnap[]; B: UnitSnap[] };

export interface UnitSnap {
  uid: number;
  name: string;
  cardId: string | null;
  tribe: Tribe;
  atk: number;
  hp: number;
  maxHp: number;
  shield: number;
  star: Star;
}

export type Outcome = "win" | "lose" | "draw";

export interface BattleResult {
  /** A(プレイヤー側)から見た結果 */
  outcome: Outcome;
  rounds: number;
  events: BattleEvent[];
  /** 勝ったときにもらえる追加ゴールド(商才とレリック) */
  bonusGold: number;
  survivorsA: number;
  survivorsB: number;
  /** 開始時の並び(能力の発動前。UI の描画用) */
  initialA: BattleUnit[];
  initialB: BattleUnit[];
  /** 終了時に残っている並び */
  finalA: BattleUnit[];
  finalB: BattleUnit[];
}

export function validateTeam(team: Team, ctx: BattleContext): void {
  if (team.slots.length < 1 || team.slots.length > TEAM_SIZE) throw new Error(`編成は1〜${TEAM_SIZE}体`);
  for (const s of team.slots) if (!ctx.cards.has(s.cardId)) throw new Error(`不明なカード ${s.cardId}`);
  for (const r of team.relicIds) if (!ctx.relics.has(r)) throw new Error(`不明なレリック ${r}`);
}

export function simulateBattle(teamA: Team, teamB: Team, ctx: BattleContext): BattleResult {
  validateTeam(teamA, ctx);
  validateTeam(teamB, ctx);
  const events: BattleEvent[] = [];
  let nextUid = 1;

  const build = (team: Team, side: Side): BattleUnit[] => {
    const defs = team.slots.map((s) => ctx.cards.get(s.cardId) as CardDef);
    const tribeCount = new Map<Tribe, number>();
    for (const d of defs) tribeCount.set(d.tribe, (tribeCount.get(d.tribe) ?? 0) + 1);
    const relics = team.relicIds.map((id) => ctx.relics.get(id) as RelicDef);
    const atkAll = relics.reduce((s, r) => s + (r.atkAll ?? 0), 0);
    const hpAll = relics.reduce((s, r) => s + (r.hpAll ?? 0), 0);
    const line = team.slots.map((slot, i): BattleUnit => {
      const d = defs[i] as CardDef;
      const syn = SYNERGY_BONUS[Math.min(tribeCount.get(d.tribe) ?? 0, 5)] ?? 0;
      const hp = scale(d.hp, slot.star) + syn + hpAll;
      return {
        uid: nextUid++,
        side,
        name: d.name,
        tribe: d.tribe,
        cardId: d.id,
        baseAtk: d.atk,
        baseHp: d.hp,
        atk: scale(d.atk, slot.star) + syn + atkAll,
        hp,
        maxHp: hp,
        shield: 0,
        star: slot.star,
        ability: d.ability ?? null,
      };
    });
    const shield = relics.reduce((s, r) => s + (r.shieldFront ?? 0), 0);
    if (line[0]) line[0].shield += shield;
    return line;
  };

  const lines: Record<Side, BattleUnit[]> = { A: build(teamA, "A"), B: build(teamB, "B") };
  const relicCount: Record<Side, number> = { A: teamA.relicIds.length, B: teamB.relicIds.length };
  const initialA = lines.A.map((u) => ({ ...u }));
  const initialB = lines.B.map((u) => ({ ...u }));
  const other = (side: Side): Side => (side === "A" ? "B" : "A");

  const snapUnit = (u: BattleUnit): UnitSnap => ({
    uid: u.uid,
    name: u.name,
    cardId: u.cardId,
    tribe: u.tribe,
    atk: u.atk,
    hp: u.hp,
    maxHp: u.maxHp,
    shield: u.shield,
    star: u.star,
  });
  const snap = (): void => {
    events.push({ t: "state", A: lines.A.map(snapUnit), B: lines.B.map(snapUnit) });
  };

  const takeDamage = (u: BattleUnit, amount: number): void => {
    if (amount <= 0) return;
    const absorbed = Math.min(u.shield, amount);
    u.shield -= absorbed;
    u.hp -= amount - absorbed;
    events.push({ t: "damage", uid: u.uid, amount, absorbed });
  };

  /** 能力を発動する。pos は faint のときの、倒れた位置 */
  const fire = (u: BattleUnit, trigger: Ability["trigger"], pos?: number): void => {
    const ab = u.ability;
    if (!ab || ab.trigger !== trigger) return;
    const e = ab.effect;
    const s = (n: number) => scale(n, u.star);
    const allies = lines[u.side];
    const enemies = lines[other(u.side)];
    events.push({ t: "ability", uid: u.uid, side: u.side, name: u.name, text: describeAbility(ab, u.star) });
    switch (e.kind) {
      case "summon": {
        let at = pos ?? Math.max(0, allies.indexOf(u));
        for (let i = 0; i < e.count && allies.length < TEAM_SIZE; i++) {
          const hp = s(e.hp);
          const token: BattleUnit = {
            uid: nextUid++,
            side: u.side,
            name: `${u.name}の分身`,
            tribe: u.tribe,
            cardId: null,
            baseAtk: e.atk,
            baseHp: e.hp,
            atk: s(e.atk),
            hp,
            maxHp: hp,
            shield: 0,
            star: 1,
            ability: null,
          };
          allies.splice(at++, 0, token);
          events.push({ t: "summon", uid: token.uid, side: u.side, name: token.name, atk: token.atk, hp });
        }
        break;
      }
      case "buffBehind": {
        const behind = allies[allies.indexOf(u) + 1];
        if (behind) behind.atk += s(e.atk);
        break;
      }
      case "shieldFront": {
        const front = allies[0];
        if (front) front.shield += s(e.amount) + s(e.perRelic ?? 0) * relicCount[u.side];
        break;
      }
      case "healAll":
        for (const a of allies) if (a.hp > 0) a.hp = Math.min(a.maxHp, a.hp + s(e.amount));
        break;
      case "buffSelf":
        u.atk += s(e.atk);
        u.hp += s(e.hp);
        u.maxHp += s(e.hp);
        break;
      case "damageFront": {
        const front = enemies[0];
        if (front) takeDamage(front, s(e.amount));
        break;
      }
      case "rally":
        for (const a of allies) {
          if (a.hp <= 0 || (e.tribe && a.tribe !== e.tribe)) continue;
          a.atk += s(e.atk);
          a.hp += s(e.hp);
          a.maxHp += s(e.hp);
        }
        break;
      case "gold":
        break; // 戦闘後に集計する
      case "promoteAllies":
        for (const a of allies) {
          if (a === u || a.cardId === null || a.star !== 1) continue;
          const dAtk = scale(a.baseAtk, 2) - scale(a.baseAtk, 1);
          const dHp = scale(a.baseHp, 2) - scale(a.baseHp, 1);
          a.atk += dAtk;
          a.hp += dHp;
          a.maxHp += dHp;
          a.star = 2;
        }
        break;
    }
    snap();
  };

  /** 倒れた者を列から外し、faint を発動する。連鎖が止まるまで繰り返す */
  const resolveDeaths = (): void => {
    for (;;) {
      let found = false;
      for (const side of ["A", "B"] as const) {
        const line = lines[side];
        const idx = line.findIndex((x) => x.hp <= 0);
        if (idx < 0) continue;
        found = true;
        const [dead] = line.splice(idx, 1);
        if (!dead) continue;
        events.push({ t: "faint", uid: dead.uid, side, name: dead.name });
        snap();
        fire(dead, "faint", idx);
      }
      if (!found) return;
    }
  };

  const fireAll = (trigger: "battleStart" | "turnStart"): void => {
    for (const side of ["A", "B"] as const) {
      for (const u of [...lines[side]]) if (u.hp > 0) fire(u, trigger);
    }
    resolveDeaths();
  };

  const finished = () => lines.A.length === 0 || lines.B.length === 0;

  snap();
  fireAll("battleStart");
  let round = 0;
  while (!finished() && round < MAX_ROUNDS) {
    round += 1;
    events.push({ t: "round", n: round });
    fireAll("turnStart");
    if (finished()) break;
    const fa = lines.A[0] as BattleUnit;
    const fb = lines.B[0] as BattleUnit;
    const dmgToB = fa.atk;
    const dmgToA = fb.atk;
    events.push({ t: "attack", a: fa.uid, b: fb.uid, dmgToB, dmgToA });
    takeDamage(fb, dmgToB);
    takeDamage(fa, dmgToA);
    snap();
    fire(fa, "attack");
    fire(fb, "attack");
    resolveDeaths();
  }

  let outcome: Outcome;
  if (lines.A.length === 0 && lines.B.length === 0) outcome = "draw";
  else if (lines.B.length === 0) outcome = "win";
  else if (lines.A.length === 0) outcome = "lose";
  else outcome = "draw";

  let bonusGold = 0;
  if (outcome === "win") {
    for (const slot of teamA.slots) {
      const ab = ctx.cards.get(slot.cardId)?.ability;
      if (ab?.trigger === "win" && ab.effect.kind === "gold") bonusGold += scale(ab.effect.amount, slot.star);
    }
    for (const id of teamA.relicIds) bonusGold += ctx.relics.get(id)?.goldBonus ?? 0;
  }

  return {
    outcome,
    rounds: round,
    events,
    bonusGold,
    survivorsA: lines.A.length,
    survivorsB: lines.B.length,
    initialA,
    initialB,
    finalA: lines.A,
    finalB: lines.B,
  };
}
