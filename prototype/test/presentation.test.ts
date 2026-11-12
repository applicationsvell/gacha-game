import { test } from "node:test";
import assert from "node:assert/strict";
import { planReveal, PROMOTE_RATE, TIER_OF } from "../src/core/presentation.ts";
import { newPackState, openPack } from "../src/core/gacha.ts";
import type { PackResult } from "../src/core/gacha.ts";
import { createRng } from "../src/core/rng.ts";
import { SET1 } from "../src/data/index.ts";

test("予告の色は本当の最高段階を超えず、昇格したら最後は本当の色になる", () => {
  const rng = createRng(1);
  const st = newPackState();
  for (let i = 0; i < 50_000; i++) {
    const r = openPack(SET1, st, rng);
    const plan = planReveal(r, rng);
    const realMax = Math.max(...r.cards.map((c) => TIER_OF[c.rarity]));
    assert.equal(plan.maxTier, realMax);
    assert.ok(plan.initialTell <= plan.maxTier, "実際より高く見せてはいけない");
    if (plan.promotion) {
      assert.ok(plan.maxTier >= 2, "昇格は SR 以上だけ");
      assert.equal(plan.initialTell, plan.maxTier - 1, "昇格は1段だけ");
    } else {
      assert.equal(plan.initialTell, plan.maxTier);
    }
  }
});

test(`SR 以上のパックの約${PROMOTE_RATE * 100}%で昇格演出が出る`, () => {
  const rng = createRng(2);
  const st = newPackState();
  let high = 0;
  let promoted = 0;
  for (let i = 0; i < 100_000; i++) {
    const plan = planReveal(openPack(SET1, st, rng), rng);
    if (plan.maxTier >= 2) high += 1;
    if (plan.promotion) promoted += 1;
  }
  assert.ok(Math.abs(promoted / high - PROMOTE_RATE) < 0.01, `${(promoted / high).toFixed(3)}`);
});

test("めくる順番は低い物からで、最高の1枚が最後。全部のカードを1回ずつめくる", () => {
  const rng = createRng(3);
  const st = newPackState();
  for (let i = 0; i < 5000; i++) {
    const r = openPack(SET1, st, rng);
    const plan = planReveal(r, rng);
    assert.deepEqual([...plan.steps.map((s) => s.index)].sort(), [0, 1, 2, 3, 4]);
    for (let k = 1; k < plan.steps.length; k++) assert.ok(plan.steps[k - 1]!.tier <= plan.steps[k]!.tier);
    assert.equal(plan.steps.at(-1)!.tier, plan.maxTier);
  }
});

test("演出の速さはレア度で決まる。UR は専用演出", () => {
  const fake: PackResult = {
    god: true,
    hitTopPity: false,
    hitUrPity: false,
    cards: (["UR", "C", "R", "SR", "SSR"] as const).map((rarity) => ({
      cardId: SET1.byRarity[rarity][0]!.id,
      rarity,
      finish: "normal" as const,
    })),
  };
  const plan = planReveal(fake, createRng(4));
  assert.deepEqual(
    plan.steps.map((s) => s.pace),
    ["fast", "normal", "suspense", "suspense", "cinematic"],
  );
  assert.equal(plan.steps.at(-1)!.index, 0);
  assert.equal(plan.god, true);
});
