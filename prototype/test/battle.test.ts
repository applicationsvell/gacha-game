import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateBattle, MAX_ROUNDS } from "../src/core/battle.ts";
import type { BattleContext, Team, TeamSlot } from "../src/core/battle.ts";
import { BATTLE_CONTEXT, SET1 } from "../src/data/index.ts";
import type { Ability, CardDef, RelicDef, Star, Tribe } from "../src/core/types.ts";

// 仕組みを確かめるための、テスト専用のカード
let n = 0;
function card(atk: number, hp: number, tribe: Tribe, ability?: Ability): CardDef {
  n += 1;
  return { id: `t-${n}`, setId: "t", name: `テスト${n}`, rarity: "C", tribe, atk, hp, ...(ability ? { ability } : {}) };
}
const plainA = card(3, 5, "beast");
const plainB = card(2, 4, "plant");
const beastX = card(1, 1, "beast");
const splitter = card(1, 1, "slime", { trigger: "faint", effect: { kind: "summon", atk: 1, hp: 1, count: 1 } });
const wall = card(5, 10, "plant");
const zeroA = card(0, 5, "machine");
const zeroB = card(0, 5, "spirit");
const sniper = card(1, 3, "beast", { trigger: "battleStart", effect: { kind: "damageFront", amount: 2 } });
const fragile = card(9, 2, "dragon");
const healer = card(1, 3, "plant", { trigger: "turnStart", effect: { kind: "healAll", amount: 2 } });
const noHealer = card(1, 3, "plant");
const ghost = card(1, 1, "spirit", { trigger: "faint", effect: { kind: "damageFront", amount: 4 } });
const promoter = card(1, 9, "dragon", { trigger: "battleStart", effect: { kind: "promoteAllies" } });
const ally = card(2, 3, "machine");
const neko = card(3, 4, "beast", { trigger: "win", effect: { kind: "gold", amount: 12 } });
const weak = card(1, 1, "slime");

const relics: RelicDef[] = [
  { id: "shield2", name: "盾", tier: "common", shieldFront: 2 },
  { id: "coin", name: "コイン", tier: "common", goldBonus: 5 },
];
const ctx: BattleContext = {
  cards: new Map(
    [plainA, plainB, beastX, splitter, wall, zeroA, zeroB, sniper, fragile, healer, noHealer, ghost, promoter, ally, neko, weak].map(
      (c) => [c.id, c],
    ),
  ),
  relics: new Map(relics.map((r) => [r.id, r])),
};

const team = (cards: CardDef[], relicIds: string[] = [], star: Star = 1): Team => ({
  slots: cards.map((c): TeamSlot => ({ cardId: c.id, star })),
  relicIds,
});

test("先頭どうしが同時に攻撃し、先に全滅した側が負ける", () => {
  const r = simulateBattle(team([plainA]), team([plainB]), ctx);
  // 1回目: B 4→1、A 5→3。2回目: B が倒れる
  assert.equal(r.outcome, "win");
  assert.equal(r.rounds, 2);
  assert.equal(r.survivorsA, 1);
});

test("相打ちは引き分け", () => {
  const r = simulateBattle(team([fragile]), team([fragile]), ctx);
  assert.equal(r.outcome, "draw");
  assert.equal(r.rounds, 1);
});

test(`${MAX_ROUNDS}回で決着しなければ引き分け`, () => {
  const r = simulateBattle(team([zeroA]), team([zeroB]), ctx);
  assert.equal(r.outcome, "draw");
  assert.equal(r.rounds, MAX_ROUNDS);
});

test("同じ種族が2体いると、その種族に +1/+1", () => {
  const r = simulateBattle(team([plainA, beastX]), team([wall]), ctx);
  assert.equal(r.initialA[0]!.atk, 4);
  assert.equal(r.initialA[0]!.hp, 6);
  assert.equal(r.initialA[1]!.atk, 2);
});

test("★2 は数値が1.5倍(四捨五入)", () => {
  const r = simulateBattle(team([plainA], [], 2), team([wall]), ctx);
  assert.equal(r.initialA[0]!.atk, 5); // 4.5 → 5
  assert.equal(r.initialA[0]!.hp, 8); // 7.5 → 8
});

test("倒れたときに分身が出て、戦い続ける", () => {
  const r = simulateBattle(team([splitter]), team([wall]), ctx);
  assert.equal(r.outcome, "lose");
  assert.equal(r.rounds, 2);
  assert.ok(r.events.some((e) => e.t === "summon"));
});

test("盾はダメージを先に受け止める", () => {
  const r = simulateBattle(team([plainA], ["shield2"]), team([plainB]), ctx);
  const dmg = r.events.find((e) => e.t === "damage" && e.uid === r.initialA[0]!.uid);
  assert.deepEqual(dmg, { t: "damage", uid: r.initialA[0]!.uid, amount: 2, absorbed: 2 });
});

test("戦闘開始時のダメージで、攻撃の前に倒せる", () => {
  const r = simulateBattle(team([sniper]), team([fragile]), ctx);
  assert.equal(r.outcome, "win");
  assert.equal(r.rounds, 0);
});

test("回復は最大体力を超えない", () => {
  // healer(1/3)は毎ターン2回復するが、無傷なので体力は3のまま
  const r = simulateBattle(team([healer]), team([zeroB]), ctx);
  assert.equal(r.outcome, "win");
  const u = r.finalA[0]!;
  assert.equal(u.hp, 3);
  assert.equal(u.maxHp, 3);
});

test("傷を負った味方は回復する", () => {
  // plainB(2/4)の攻撃を受けながら、healer(1/3)は2回復する。回復がなければ2回目の攻撃で倒れる
  const withHeal = simulateBattle(team([healer]), team([plainB]), ctx);
  const without = simulateBattle(team([noHealer]), team([plainB]), ctx);
  assert.equal(withHeal.outcome, "win");
  assert.equal(without.outcome, "lose");
});

test("倒れたときの能力で、相手も道連れにできる", () => {
  // ゴースト(1/1)は1回目で倒れ、敵の先頭に4ダメージ。fragile(9/2)は攻撃の1と合わせて倒れる
  const r = simulateBattle(team([ghost]), team([fragile]), ctx);
  assert.equal(r.outcome, "draw");
});

test("封印竜の能力で、★1の味方が★2の数値になる", () => {
  // ally(2/3)は ★2 の 3/5 になる。相手は1回で倒れるので、ally は攻撃を受けない
  const r = simulateBattle(team([promoter, ally]), team([weak]), ctx);
  assert.equal(r.outcome, "win");
  const a = r.finalA[1]!;
  assert.equal(a.star, 2);
  assert.equal(a.atk, 3);
  assert.equal(a.hp, 5);
  assert.equal(r.finalA[0]!.star, 1, "封印竜自身は変わらない");
});

test("勝つと、商才とレリックのゴールドが入る。負けたら入らない", () => {
  const win = simulateBattle(team([neko], ["coin"], 2), team([weak]), ctx);
  assert.equal(win.outcome, "win");
  assert.equal(win.bonusGold, 18 + 5);
  const lose = simulateBattle(team([neko], ["coin"]), team([wall]), ctx);
  assert.equal(lose.outcome, "lose");
  assert.equal(lose.bonusGold, 0);
});

test("第1セットのカードどうしの戦闘は、同じ入力なら同じ結果", () => {
  const pick = (names: string[]): Team => ({
    slots: names.map((nm) => ({ cardId: SET1.cards.find((c) => c.name === nm)!.id, star: 1 as Star })),
    relicIds: ["r-02"],
  });
  const a = pick(["キングスライム", "ぶんれつスライム", "ぷるスライム", "スライムの親分", "千年樹の番人"]);
  const b = pick(["くれないりゅう", "ほのおりゅう", "ひのこトカゲ", "封印竜アルカ", "たいほうロボ"]);
  const r1 = simulateBattle(a, b, BATTLE_CONTEXT);
  const r2 = simulateBattle(a, b, BATTLE_CONTEXT);
  assert.deepEqual(r1, r2);
  assert.ok(r1.rounds <= MAX_ROUNDS);
});

test("第1セットの全カードの組み合わせで、例外が出ず必ず終わる", () => {
  const cards = SET1.cards;
  for (let i = 0; i < cards.length; i++) {
    const a: Team = { slots: [0, 1, 2, 3, 4].map((k) => ({ cardId: cards[(i + k) % 60]!.id, star: 1 })), relicIds: [] };
    const b: Team = {
      slots: [0, 1, 2, 3, 4].map((k) => ({ cardId: cards[(i * 7 + k * 13) % 60]!.id, star: 3 })),
      relicIds: ["r-01", "r-06"],
    };
    const r = simulateBattle(a, b, BATTLE_CONTEXT);
    assert.ok(["win", "lose", "draw"].includes(r.outcome));
    assert.ok(r.rounds <= MAX_ROUNDS);
  }
});

test("編成が空、または6体以上ならエラー", () => {
  assert.throws(() => simulateBattle({ slots: [], relicIds: [] }, team([wall]), ctx));
  assert.throws(() => simulateBattle(team([weak, weak, weak, weak, weak, weak]), team([wall]), ctx));
});
