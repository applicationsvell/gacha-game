import { test } from "node:test";
import assert from "node:assert/strict";
import { SET1, CAPSULES, BATTLE_CONTEXT } from "../src/data/index.ts";
import { RELICS } from "../src/data/set1.ts";
import { describeAbility } from "../src/core/cards.ts";
import { TRIBES } from "../src/core/types.ts";

test("第1セットは60種で、レア度ごとの数が提案書と同じ", () => {
  assert.equal(SET1.cards.length, 60);
  const expected = { C: 20, U: 16, R: 12, SR: 8, SSR: 3, UR: 1 };
  for (const [r, n] of Object.entries(expected)) {
    assert.equal(SET1.byRarity[r as keyof typeof expected].length, n, r);
  }
});

test("6種族すべてにカードがある", () => {
  for (const t of TRIBES) assert.ok(SET1.cards.some((c) => c.tribe === t), t);
});

test("カードの数値は正で、能力の説明文が作れる", () => {
  for (const c of SET1.cards) {
    assert.ok(c.atk >= 1 && c.hp >= 1, c.name);
    if (c.ability) {
      for (const star of [1, 2, 3] as const) assert.ok(describeAbility(c.ability, star).length > 0);
    }
  }
});

test("説明文は★に応じて数値が変わる", () => {
  const neko = SET1.cards.find((c) => c.name === "まねきネコ");
  assert.ok(neko?.ability);
  assert.equal(describeAbility(neko.ability, 1), "勝ったとき、ゴールド+12(商才)");
  assert.equal(describeAbility(neko.ability, 3), "勝ったとき、ゴールド+24(商才)");
});

test("カプセルの中身は既存のレリックで、合計50個・目玉1個", () => {
  const cap = CAPSULES[0]!;
  const ids = new Set(RELICS.map((r) => r.id));
  for (const c of cap.contents) assert.ok(ids.has(c.relicId), c.relicId);
  assert.equal(cap.contents.reduce((s, c) => s + c.count, 0), 50);
  const jackpots = cap.contents.filter((c) => BATTLE_CONTEXT.relics.get(c.relicId)?.tier === "jackpot");
  assert.deepEqual(jackpots.map((c) => c.count), [1]);
});
