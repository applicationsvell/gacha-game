import { pickWeighted } from "./rng.ts";
import type { Rng } from "./rng.ts";
import { simulateBattle, TEAM_SIZE } from "./battle.ts";
import type { BattleContext, BattleResult, Team, TeamSlot } from "./battle.ts";
import { rollFinish } from "./gacha.ts";
import type { PulledCard } from "./gacha.ts";
import type { CardSet } from "./cards.ts";
import type { CardDef, Rarity, RelicDef, Star, Tribe } from "./types.ts";

/*
 * 遠征(提案書 5.1節)。
 * - 分岐する道を1層ずつ選んで進む。戦闘はオートバトル。
 * - 野営地で「帰る(戦利品を持ち帰る)」か「奥へ進む」かを選ぶ。
 * - 負けると、その遠征で拾った戦利品の半分を失う。カードは失わない。
 * - ドロップパック(3枚入り、その地域の種族だけ)は野営地で開けられ、出たカードをすぐ編成に入れられる。
 */

export type NodeKind = "battle" | "elite" | "treasure" | "event" | "camp" | "boss";
export type EventKind = "blessing" | "found" | "stray";

export interface RegionDef {
  id: string;
  name: string;
  /** 敵とドロップパックに出る種族 */
  tribes: Tribe[];
  /** 強さの段階(0から) */
  level: number;
  bossCardId: string;
  /** 層ごとの選択肢 */
  layout: NodeKind[][];
  /** この地域を開くのに必要な、先の地域のクリア */
  requires?: string;
}

export interface Loot {
  gold: number;
  packs: number;
}

export interface MapNode {
  id: string;
  layer: number;
  kind: NodeKind;
  enemy?: Team;
  reward: Loot;
  event?: EventKind;
}

export type ExpeditionStatus = "active" | "camp" | "cleared" | "retreated" | "lost";

export interface Expedition {
  regionId: string;
  layer: number;
  map: MapNode[][];
  loot: Loot;
  status: ExpeditionStatus;
  /** 次の戦闘だけ、味方全員 +1/+1 */
  blessing: boolean;
  /** 通った道 */
  path: string[];
}

export interface NodeResult {
  node: MapNode;
  battle?: BattleResult;
  /** この場所で増えた戦利品(負けたときは失った分がマイナス) */
  gained: Loot;
  text: string;
}

/** 祝福(イベント)を、戦闘エンジンに渡すレリックとして表す */
export const BLESSING: RelicDef = { id: "blessing", name: "森の祝福", tier: "common", atkAll: 1, hpAll: 1 };

export const NODE_LABEL: Record<NodeKind, string> = {
  battle: "戦闘",
  elite: "強敵",
  treasure: "宝",
  event: "出来事",
  camp: "野営地",
  boss: "ボス",
};

// ---------------------------------------------------------------------------
// 敵と報酬
// ---------------------------------------------------------------------------

function enemyRarityTable(strength: number): Partial<Record<Rarity, number>> {
  if (strength < 1) return { C: 1 }; // 最初の層は、どの手札でも勝てるようにコモンだけ
  if (strength < 2) return { C: 0.75, U: 0.25 };
  if (strength < 4) return { C: 0.35, U: 0.5, R: 0.15 };
  if (strength < 6) return { U: 0.5, R: 0.4, SR: 0.1 };
  return { U: 0.25, R: 0.5, SR: 0.25 };
}

function pickCard(set: CardSet, tribes: readonly Tribe[], rarity: Rarity, rng: Rng): CardDef {
  const inRegion = set.byRarity[rarity].filter((c) => tribes.includes(c.tribe));
  const pool = inRegion.length ? inRegion : set.byRarity[rarity];
  return pool[rng.int(pool.length)] as CardDef;
}

export function enemyTeam(region: RegionDef, set: CardSet, layer: number, kind: NodeKind, rng: Rng): Team {
  const strength = region.level * 3 + layer;
  const table = enemyRarityTable(strength) as Record<Rarity, number>;
  const slots: TeamSlot[] = [];
  let count: number;
  if (kind === "boss") count = TEAM_SIZE - 1;
  else if (kind === "elite") count = Math.min(TEAM_SIZE, 3 + Math.floor(layer / 2));
  else count = Math.min(TEAM_SIZE, 2 + Math.floor(layer / 2) + region.level);
  for (let i = 0; i < count; i++) {
    const card = pickCard(set, region.tribes, pickWeighted(table, rng), rng);
    let star: Star = 1;
    if (kind === "elite" && i === 0) star = 2;
    if (kind === "boss" && region.level > 0) star = 2;
    slots.push({ cardId: card.id, star });
  }
  if (kind === "boss") slots.push({ cardId: region.bossCardId, star: region.level > 0 ? 3 : 2 });
  return { slots, relicIds: [] };
}

function nodeReward(region: RegionDef, layer: number, kind: NodeKind, rng: Rng): { reward: Loot; event?: EventKind } {
  const lv = region.level;
  switch (kind) {
    case "battle":
      return { reward: { gold: 60 + 25 * layer + 60 * lv, packs: 0 } };
    case "elite":
      return { reward: { gold: 120 + 40 * layer + 100 * lv, packs: 1 } };
    case "treasure":
      return rng.next() < 0.5
        ? { reward: { gold: 100 + 30 * layer + 80 * lv, packs: 0 } }
        : { reward: { gold: 0, packs: 1 } };
    case "event": {
      const x = rng.next();
      if (x < 0.4) return { reward: { gold: 0, packs: 0 }, event: "blessing" };
      if (x < 0.75) return { reward: { gold: 70 + rng.int(80) + 60 * lv, packs: 0 }, event: "found" };
      return { reward: { gold: 0, packs: 1 }, event: "stray" };
    }
    case "camp":
      return { reward: { gold: 0, packs: 0 } };
    case "boss":
      return { reward: { gold: 300 + 200 * lv, packs: 2 } };
  }
}

// ---------------------------------------------------------------------------
// 遠征の進行
// ---------------------------------------------------------------------------

export function startExpedition(region: RegionDef, set: CardSet, rng: Rng): Expedition {
  const map = region.layout.map((kinds, layer) =>
    kinds.map((kind, i): MapNode => {
      const { reward, event } = nodeReward(region, layer, kind, rng);
      const fights = kind === "battle" || kind === "elite" || kind === "boss";
      return {
        id: `${layer}-${i}`,
        layer,
        kind,
        reward,
        ...(fights ? { enemy: enemyTeam(region, set, layer, kind, rng) } : {}),
        ...(event ? { event } : {}),
      };
    }),
  );
  return { regionId: region.id, layer: 0, map, loot: { gold: 0, packs: 0 }, status: "active", blessing: false, path: [] };
}

export function currentOptions(exp: Expedition): MapNode[] {
  return exp.status === "active" ? (exp.map[exp.layer] ?? []) : [];
}

function advance(exp: Expedition): void {
  exp.layer += 1;
  if (exp.layer >= exp.map.length) exp.status = "cleared";
}

/** 選んだ場所に進み、戦闘や宝を処理する */
export function resolveNode(exp: Expedition, nodeId: string, team: Team, ctx: BattleContext, rng: Rng): NodeResult {
  if (exp.status !== "active") throw new Error("いまは進めない");
  const node = currentOptions(exp).find((n) => n.id === nodeId);
  if (!node) throw new Error(`この層に ${nodeId} はない`);
  exp.path.push(node.id);
  void rng;

  if (node.kind === "camp") {
    exp.status = "camp";
    return { node, gained: { gold: 0, packs: 0 }, text: "野営地に着いた。帰るか、奥へ進むかを選ぶ" };
  }

  if (node.enemy) {
    const relicIds = exp.blessing ? [...team.relicIds, BLESSING.id] : [...team.relicIds];
    const ctxWithBlessing: BattleContext = { cards: ctx.cards, relics: new Map(ctx.relics).set(BLESSING.id, BLESSING) };
    const battle = simulateBattle({ slots: team.slots, relicIds }, node.enemy, ctxWithBlessing);
    exp.blessing = false;
    if (battle.outcome === "win") {
      const gained = { gold: node.reward.gold + battle.bonusGold, packs: node.reward.packs };
      exp.loot.gold += gained.gold;
      exp.loot.packs += gained.packs;
      advance(exp);
      return { node, battle, gained, text: node.kind === "boss" ? "ボスを倒した!" : "勝った!" };
    }
    if (battle.outcome === "draw") {
      advance(exp);
      return { node, battle, gained: { gold: 0, packs: 0 }, text: "引き分け。戦利品はなし" };
    }
    const lost = { gold: Math.ceil(exp.loot.gold / 2), packs: Math.ceil(exp.loot.packs / 2) };
    exp.loot.gold -= lost.gold;
    exp.loot.packs -= lost.packs;
    exp.status = "lost";
    return { node, battle, gained: { gold: -lost.gold, packs: -lost.packs }, text: "全滅…。戦利品の半分を落とした" };
  }

  // 宝と出来事
  exp.loot.gold += node.reward.gold;
  exp.loot.packs += node.reward.packs;
  let text = "";
  if (node.kind === "treasure") text = node.reward.packs ? "宝箱からドロップパック!" : `宝箱から ${node.reward.gold}G!`;
  else if (node.event === "blessing") {
    exp.blessing = true;
    text = "森の祝福。次の戦闘だけ、味方全員 +1/+1";
  } else if (node.event === "found") text = `落とし物を拾った。${node.reward.gold}G`;
  else text = "迷子のモンスターが、ドロップパックをくれた";
  advance(exp);
  return { node, gained: { ...node.reward }, text };
}

/** 野営地での選択 */
export function campChoice(exp: Expedition, choice: "retreat" | "continue"): void {
  if (exp.status !== "camp") throw new Error("野営地にいない");
  if (choice === "retreat") {
    exp.status = "retreated";
  } else {
    exp.status = "active";
    advance(exp);
  }
}

export function isOver(exp: Expedition): boolean {
  return exp.status === "cleared" || exp.status === "retreated" || exp.status === "lost";
}

// ---------------------------------------------------------------------------
// ドロップパック
// ---------------------------------------------------------------------------

const DROP_SLOTS: Partial<Record<Rarity, number>>[] = [
  { C: 0.75, U: 0.25 },
  { C: 0.4, U: 0.45, R: 0.15 },
  { R: 0.7, SR: 0.25, SSR: 0.05 },
];

/** 3枚入り。その地域の種族だけが出る。天井と交換ポイントには数えない */
export function openDropPack(set: CardSet, tribes: readonly Tribe[], rng: Rng): PulledCard[] {
  return DROP_SLOTS.map((table) => {
    const rarity = pickWeighted(table as Record<Rarity, number>, rng);
    const card = pickCard(set, tribes, rarity, rng);
    return { cardId: card.id, rarity, finish: rollFinish(rarity, rng) };
  });
}
