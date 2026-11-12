import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addCard,
  addPulled,
  canUpgradeStar,
  completion,
  copies,
  exchange,
  newCollection,
  removeCopy,
  upgradeStar,
} from "../src/core/collection.ts";
import { newPackState, openPack } from "../src/core/gacha.ts";
import { createRng } from "../src/core/rng.ts";
import { SET1 } from "../src/data/index.ts";

const c1 = SET1.byRarity.C[0]!.id;
const ur = SET1.byRarity.UR[0]!.id;

test("開けたカードが手持ちに入り、初めての物がわかる", () => {
  const col = newCollection();
  const rng = createRng(1);
  const st = newPackState();
  const first = openPack(SET1, st, rng);
  const { newCardIds } = addPulled(col, first.cards);
  assert.ok(newCardIds.length >= 1);
  assert.equal(
    first.cards.length,
    Object.values(col.cards).reduce((s, e) => s + copies(col, e.cardId), 0),
  );
  const again = addPulled(col, first.cards);
  assert.deepEqual(again.newCardIds, []);
});

test("3枚で★2、9枚で★3。素材は安い仕上げから使い、良い仕上げを残す", () => {
  const col = newCollection();
  addCard(col, c1, "gold");
  addCard(col, c1, "normal");
  assert.equal(canUpgradeStar(col, c1), false); // 2枚では足りない
  addCard(col, c1, "holo");
  assert.equal(upgradeStar(col, c1), 2);
  assert.equal(copies(col, c1), 1);
  assert.equal(col.cards[c1]!.counts.gold, 1, "ゴールドが残る");

  for (let i = 0; i < 5; i++) addCard(col, c1);
  assert.equal(canUpgradeStar(col, c1), false); // 6枚では足りない(6枚吸収+1枚残す)
  addCard(col, c1);
  assert.equal(upgradeStar(col, c1), 3);
  assert.equal(copies(col, c1), 1);
  assert.equal(canUpgradeStar(col, c1), false);
});

test("★は、カードを売っても下がらず、図鑑にも残る", () => {
  const col = newCollection();
  for (let i = 0; i < 3; i++) addCard(col, c1);
  upgradeStar(col, c1);
  removeCopy(col, c1, "normal");
  assert.equal(copies(col, c1), 0);
  assert.equal(col.cards[c1]!.star, 2);
  assert.equal(completion(col, SET1).owned, 1);
  assert.throws(() => removeCopy(col, c1, "normal"));
});

test("交換ポイントで好きなカードをもらえる。足りなければ失敗する", () => {
  const col = newCollection();
  const st = newPackState();
  st.points = 149;
  assert.throws(() => exchange(col, SET1, st, ur));
  assert.equal(st.points, 149);
  st.points = 150;
  exchange(col, SET1, st, ur);
  assert.equal(st.points, 0);
  assert.equal(copies(col, ur), 1);
  assert.throws(() => exchange(col, SET1, st, "no-such-card"));
});

test("交換ポイントを併用すると、約110パックで全60種がそろう(シミュレーションの中央値112)", () => {
  const needed: number[] = [];
  for (let seed = 0; seed < 200; seed++) {
    const col = newCollection();
    const st = newPackState();
    const rng = createRng(seed);
    for (;;) {
      addPulled(col, openPack(SET1, st, rng).cards);
      // 足りないカードを全部交換できるだけのポイントがあるか
      const missing = SET1.cards.filter((c) => copies(col, c.id) === 0);
      const cost = missing.reduce((s, c) => s + ({ C: 1, U: 2, R: 5, SR: 15, SSR: 50, UR: 150 } as const)[c.rarity], 0);
      if (cost <= st.points) {
        for (const c of missing) exchange(col, SET1, st, c.id);
        break;
      }
    }
    assert.equal(completion(col, SET1).owned, 60);
    needed.push(st.opened);
  }
  needed.sort((a, b) => a - b);
  const median = needed[100]!;
  assert.ok(median >= 95 && median <= 130, `中央値 ${median}`);
  assert.ok(needed.at(-1)! <= 200, `最大 ${needed.at(-1)}`);
});
