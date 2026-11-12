import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campChoice,
  currentOptions,
  isOver,
  openDropPack,
  resolveNode,
  startExpedition,
} from "../src/core/expedition.ts";
import type { Expedition } from "../src/core/expedition.ts";
import type { Team } from "../src/core/battle.ts";
import { createRng } from "../src/core/rng.ts";
import { BATTLE_CONTEXT, SET1 } from "../src/data/index.ts";
import { REGIONS } from "../src/data/regions.ts";

const forest = REGIONS[0]!;
const byName = (n: string) => SET1.cards.find((c) => c.name === n)!.id;
/** とても強い編成(★3のSSR・UR) */
const strong: Team = {
  slots: ["封印竜アルカ", "千年樹の番人", "万年スライム", "てんくうの機兵", "ねじまき番兵"].map((n) => ({ cardId: byName(n), star: 3 })),
  relicIds: ["r-07"],
};
/** とても弱い編成 */
const weak: Team = { slots: [{ cardId: byName("あわスライム"), star: 1 }], relicIds: [] };

function runToEnd(exp: Expedition, team: Team, seed: number, atCamp: "retreat" | "continue" = "continue") {
  const rng = createRng(seed);
  const results = [];
  while (!isOver(exp)) {
    if (exp.status === "camp") {
      campChoice(exp, atCamp);
      continue;
    }
    results.push(resolveNode(exp, currentOptions(exp)[0]!.id, team, BATTLE_CONTEXT, rng));
  }
  return results;
}

test("地図は地域の並びどおりで、戦う場所には敵の編成がある", () => {
  const exp = startExpedition(forest, SET1, createRng(1));
  assert.equal(exp.map.length, forest.layout.length);
  exp.map.forEach((layer, i) => {
    assert.deepEqual(layer.map((n) => n.kind), forest.layout[i]);
    for (const n of layer) {
      const fights = n.kind === "battle" || n.kind === "elite" || n.kind === "boss";
      assert.equal(!!n.enemy, fights, n.id);
      if (n.enemy) assert.ok(n.enemy.slots.length >= 1 && n.enemy.slots.length <= 5);
    }
  });
  const boss = exp.map.at(-1)![0]!.enemy!;
  assert.equal(boss.slots.at(-1)!.cardId, forest.bossCardId);
});

test("同じシードなら同じ地図", () => {
  assert.deepEqual(startExpedition(forest, SET1, createRng(5)), startExpedition(forest, SET1, createRng(5)));
});

test("強い編成ならボスまで倒し、戦利品を全部持ち帰る", () => {
  const exp = startExpedition(forest, SET1, createRng(2));
  const results = runToEnd(exp, strong, 2);
  assert.equal(exp.status, "cleared");
  const total = results.reduce((s, r) => s + r.gained.gold, 0);
  assert.equal(exp.loot.gold, total);
  assert.ok(exp.loot.packs >= 2, "ボスのドロップパック2個");
  assert.ok(results.at(-1)!.battle?.outcome === "win");
});

test("負けると、拾った戦利品の半分(切り上げ)を失って終わる", () => {
  const exp = startExpedition(forest, SET1, createRng(3));
  exp.loot = { gold: 301, packs: 3 };
  const node = currentOptions(exp).find((n) => n.enemy)!;
  const r = resolveNode(exp, node.id, weak, BATTLE_CONTEXT, createRng(3));
  assert.equal(r.battle?.outcome, "lose");
  assert.equal(exp.status, "lost");
  assert.deepEqual(exp.loot, { gold: 150, packs: 1 });
  assert.deepEqual(r.gained, { gold: -151, packs: -2 });
  assert.throws(() => resolveNode(exp, node.id, weak, BATTLE_CONTEXT, createRng(3)));
});

test("野営地で帰ると、戦利品はそのまま", () => {
  const exp = startExpedition(forest, SET1, createRng(4));
  runToEnd(exp, strong, 4, "retreat");
  assert.equal(exp.status, "retreated");
  assert.equal(exp.layer, 2, "最初の野営地で帰った");
  assert.ok(exp.loot.gold > 0);
});

test("祝福は次の戦闘だけ効く", () => {
  const exp = startExpedition(forest, SET1, createRng(6));
  exp.blessing = true;
  const node = currentOptions(exp).find((n) => n.enemy)!;
  const r = resolveNode(exp, node.id, strong, BATTLE_CONTEXT, createRng(6));
  const front = r.battle!.initialA[0]!;
  assert.equal(front.atk, 14 + 2 + 1, "★3(7×2) + 王冠2 + 祝福1");
  assert.equal(exp.blessing, false);
});

test("この層にない場所は選べない", () => {
  const exp = startExpedition(forest, SET1, createRng(7));
  assert.throws(() => resolveNode(exp, "6-0", strong, BATTLE_CONTEXT, createRng(7)));
});

test("ドロップパックは3枚で、地域の種族だけが出る", () => {
  const rng = createRng(8);
  for (let i = 0; i < 2000; i++) {
    const cards = openDropPack(SET1, forest.tribes, rng);
    assert.equal(cards.length, 3);
    for (const c of cards) assert.ok(forest.tribes.includes(SET1.byId.get(c.cardId)!.tribe));
    assert.ok(["R", "SR", "SSR"].includes(cards[2]!.rarity));
  }
});

test("最初の5パックで組める編成なら、森の最初の戦闘には必ず勝てる", () => {
  for (let seed = 0; seed < 100; seed++) {
    const exp = startExpedition(forest, SET1, createRng(seed));
    const team: Team = {
      slots: ["ぷるスライム", "こいぬ", "どんぐり", "ふたば", "のねずみ"].map((n) => ({ cardId: byName(n), star: 1 })),
      relicIds: [],
    };
    const node = currentOptions(exp).find((n) => n.kind === "battle")!;
    const r = resolveNode(exp, node.id, team, BATTLE_CONTEXT, createRng(seed));
    assert.equal(r.battle?.outcome, "win", `seed ${seed}`);
  }
});

test("戦闘の記録には、画面で再生するための状態が入っている", () => {
  const exp = startExpedition(forest, SET1, createRng(9));
  const node = currentOptions(exp).find((n) => n.enemy)!;
  const r = resolveNode(exp, node.id, strong, BATTLE_CONTEXT, createRng(9));
  const states = r.battle!.events.filter((e) => e.t === "state");
  assert.ok(states.length >= 2);
  const last = states.at(-1)!;
  assert.ok(last.t === "state" && last.B.length === 0, "最後の状態で敵は全滅している");
});
