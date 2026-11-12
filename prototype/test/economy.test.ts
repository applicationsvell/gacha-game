import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceMarket,
  buylistPrice,
  counterAcceptChance,
  customersPerDay,
  decide,
  generateCustomers,
  marketValue,
  MARKET_MAX,
  MARKET_MIN,
  newMarket,
} from "../src/core/economy.ts";
import type { Customer } from "../src/core/economy.ts";
import { createRng } from "../src/core/rng.ts";
import { TRIBES } from "../src/core/types.ts";
import { SET1 } from "../src/data/index.ts";

const ssr = SET1.byRarity.SSR[0]!;
const common = SET1.byRarity.C[0]!;

test("買取価格は、仕上げとパック価格に比例する", () => {
  assert.equal(buylistPrice(ssr, "normal", 100), 120);
  assert.equal(buylistPrice(ssr, "gold", 100), 2400);
  assert.equal(buylistPrice(ssr, "normal", 180), 216);
  assert.equal(buylistPrice(common, "normal", 100), 1);
});

test("相場は上下限の中で動き、基準の1.0付近に戻る", () => {
  const m = newMarket();
  const rng = createRng(1);
  let sum = 0;
  let booms = 0;
  const days = 5000;
  for (let i = 0; i < days; i++) {
    advanceMarket(m, rng);
    for (const t of TRIBES) {
      assert.ok(m.index[t] >= MARKET_MIN && m.index[t] <= MARKET_MAX);
      sum += m.index[t];
    }
    if (m.boom?.daysLeft === 3) booms += 1;
  }
  assert.equal(m.day, days + 1);
  assert.ok(Math.abs(sum / (days * TRIBES.length) - 1) < 0.02);
  assert.ok(booms > 100, `ブームが ${booms} 回`);
});

test("ブーム中の種族は、店頭の相場が1.5倍", () => {
  const m = newMarket();
  const base = marketValue(ssr, "normal", 100, m);
  m.boom = { tribe: ssr.tribe, mult: 1.5, daysLeft: 3 };
  assert.equal(marketValue(ssr, "normal", 100, m), Math.round(base * 1.5));
  assert.equal(base, 240); // 買取120 × 店頭2倍
});

const fan: Customer = { id: 1, wantTribe: ssr.tribe, wantRarity: null, budget: 10_000, mood: 1 };

test("好みに合う客は、相場の1.3倍まで払う", () => {
  const rng = createRng(1);
  assert.deepEqual(decide(fan, ssr, 312, 240, rng), { kind: "buy", price: 312 });
  assert.deepEqual(decide(fan, ssr, 350, 240, rng), { kind: "haggle", offer: 312 });
  assert.deepEqual(decide(fan, ssr, 500, 240, rng), { kind: "pass" });
});

test("予算を超える物は買わない", () => {
  const poor: Customer = { ...fan, budget: 200 };
  assert.deepEqual(decide(poor, ssr, 240, 240, createRng(1)), { kind: "haggle", offer: 200 });
});

test("値切りへの返し値は、提示額に近いほど受けてもらえる", () => {
  assert.equal(counterAcceptChance(100, 100), 1);
  assert.equal(counterAcceptChance(100, 110), 0.5);
  assert.equal(counterAcceptChance(100, 120), 0);
});

test("客の数は店の格で増え、15人で頭打ち", () => {
  assert.equal(customersPerDay(0), 6);
  assert.equal(customersPerDay(1), 9);
  assert.equal(customersPerDay(10), 15);
  const cs = generateCustomers(15, 300, createRng(1));
  assert.equal(cs.length, 15);
  for (const c of cs) assert.ok(c.budget >= 150 && c.budget <= 600 && c.mood >= 0.85 && c.mood <= 1.15);
});
