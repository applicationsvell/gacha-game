import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../src/core/rng.ts";
import {
  expectedCopiesPerPack,
  newPackState,
  openPack,
  openStarterPacks,
  topChance,
  TOP_HARD,
  UR_HARD,
} from "../src/core/gacha.ts";
import { buylistPrice } from "../src/core/economy.ts";
import { SET1 } from "../src/data/index.ts";
import type { Rarity } from "../src/core/types.ts";

const isTop = (r: Rarity) => r === "SSR" || r === "UR";

test("パックは5枚入りで、最後の1枚がレア枠(R以上)", () => {
  const rng = createRng(1);
  const st = newPackState();
  for (let i = 0; i < 2000; i++) {
    const { cards, god } = openPack(SET1, st, rng);
    assert.equal(cards.length, 5);
    if (!god) {
      for (const c of cards.slice(0, 3)) assert.ok(c.rarity === "C" || c.rarity === "U");
      assert.ok(cards[3]!.rarity === "U" || cards[3]!.rarity === "R");
      assert.ok(["R", "SR", "SSR", "UR"].includes(cards[4]!.rarity));
    }
    for (const c of cards) assert.equal(SET1.byId.get(c.cardId)?.rarity, c.rarity);
  }
  assert.equal(st.opened, 2000);
  assert.equal(st.points, 2000);
});

test("同じシードなら同じ中身が出る", () => {
  const a = openPack(SET1, newPackState(), createRng(99));
  const b = openPack(SET1, newPackState(), createRng(99));
  assert.deepEqual(a, b);
});

test(`SSR以上は${TOP_HARD}パック以内、URは${UR_HARD}パック以内に必ず出る`, () => {
  const rng = createRng(2);
  const st = newPackState();
  let sinceTop = 0;
  let sinceUr = 0;
  let maxTop = 0;
  let maxUr = 0;
  let hitUrPity = 0;
  for (let i = 0; i < 100_000; i++) {
    const r = openPack(SET1, st, rng);
    sinceTop += 1;
    sinceUr += 1;
    if (r.cards.some((c) => isTop(c.rarity))) {
      maxTop = Math.max(maxTop, sinceTop);
      sinceTop = 0;
    }
    if (r.cards.some((c) => c.rarity === "UR")) {
      maxUr = Math.max(maxUr, sinceUr);
      sinceUr = 0;
    }
    if (r.hitUrPity) hitUrPity += 1;
  }
  assert.ok(maxTop <= TOP_HARD, `SSR以上まで最大 ${maxTop}`);
  assert.ok(maxUr <= UR_HARD, `URまで最大 ${maxUr}`);
  assert.ok(hitUrPity > 0, "UR天井が一度も働いていない");
});

test("天井込みの実効値が tools/gacha_sim.py と一致する", () => {
  const rng = createRng(3);
  const st = newPackState();
  const n = 300_000;
  let topPacks = 0;
  let srPacks = 0;
  let urCards = 0;
  let gods = 0;
  let value = 0;
  for (let i = 0; i < n; i++) {
    const r = openPack(SET1, st, rng);
    if (r.god) gods += 1;
    if (r.cards.some((c) => isTop(c.rarity))) topPacks += 1;
    if (r.cards.some((c) => c.rarity === "SR" || isTop(c.rarity))) srPacks += 1;
    for (const c of r.cards) {
      if (c.rarity === "UR") urCards += 1;
      value += buylistPrice(SET1.byId.get(c.cardId)!, c.finish, SET1.packPrice);
    }
  }
  // シミュレーション(100万パック)の値: SR以上 33.9% / SSR以上 8.36% / UR 0.879枚% / 還元率 58.5%
  const near = (actual: number, expected: number, tol: number, label: string) =>
    assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual.toFixed(4)}(期待 ${expected})`);
  near(srPacks / n, 0.339, 0.004, "SR以上が入る率");
  near(topPacks / n, 0.0836, 0.002, "SSR以上が入る率");
  near(urCards / n, 0.00879, 0.0006, "1パックあたりのUR枚数");
  near(gods / n, 0.001, 0.0003, "ゴッドパック");
  near(value / n / SET1.packPrice, 0.585, 0.03, "卸への還元率");
});

test("topChance は21パック目から上がり、30パック目で1になる", () => {
  const st = newPackState();
  assert.equal(topChance(st), 0.065);
  st.sinceTop = 19; // 次が20パック目
  assert.equal(topChance(st), 0.065);
  st.sinceTop = 20; // 次が21パック目
  assert.ok(Math.abs(topChance(st) - 0.155) < 1e-9);
  st.sinceTop = TOP_HARD - 1;
  assert.equal(topChance(st), 1);
});

test("最初の5パックで SSR 以上が必ず1枚以上出る", () => {
  for (let seed = 0; seed < 500; seed++) {
    const results = openStarterPacks(SET1, newPackState(), createRng(seed));
    assert.equal(results.length, 5);
    assert.ok(results.some((r) => r.cards.some((c) => isTop(c.rarity))), `seed ${seed}`);
  }
});

test("表示用の排出率は合計5枚で、同じレア度のカードは同じ値", () => {
  const exp = expectedCopiesPerPack(SET1);
  const total = [...exp.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 5) < 1e-9);
  const ssr = SET1.byRarity.SSR.map((c) => exp.get(c.id));
  assert.ok(ssr.every((v) => v === ssr[0]));
});

test("仕上げの出方: ホロは1パック平均約0.4枚、ホロ入りは約2.9パックに1回。ゴールドは SSR 以上だけ", () => {
  const rng = createRng(4);
  const st = newPackState();
  const n = 200_000;
  let holoCards = 0;
  let holoPacks = 0;
  for (let i = 0; i < n; i++) {
    const r = openPack(SET1, st, rng);
    const h = r.cards.filter((c) => c.finish === "holo").length;
    holoCards += h;
    if (h > 0) holoPacks += 1;
    for (const c of r.cards) {
      if (c.finish === "gold") assert.ok(isTop(c.rarity));
      if (c.finish === "full") assert.ok(c.rarity !== "C" && c.rarity !== "U" && c.rarity !== "R");
    }
  }
  assert.ok(Math.abs(holoCards / n - 0.4) < 0.01, `ホロ ${(holoCards / n).toFixed(3)} 枚/パック`);
  assert.ok(Math.abs(n / holoPacks - 2.9) < 0.1, `ホロ入り 1/${(n / holoPacks).toFixed(2)}`);
});
