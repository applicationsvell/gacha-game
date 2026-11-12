import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng, pickWeighted } from "../src/core/rng.ts";

test("同じシードからは同じ列が出る", () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test("state() から続きを再開できる", () => {
  const a = createRng(7);
  for (let i = 0; i < 10; i++) a.next();
  const b = createRng(a.state());
  for (let i = 0; i < 10; i++) assert.equal(a.next(), b.next());
});

test("値は [0, 1) に収まり、平均は約0.5", () => {
  const r = createRng(1);
  let sum = 0;
  const n = 100_000;
  for (let i = 0; i < n; i++) {
    const x = r.next();
    assert.ok(x >= 0 && x < 1);
    sum += x;
  }
  assert.ok(Math.abs(sum / n - 0.5) < 0.01);
});

test("int(n) は 0〜n-1 をまんべんなく出す", () => {
  const r = createRng(3);
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 40_000; i++) counts[r.int(4)]! += 1;
  for (const c of counts) assert.ok(Math.abs(c - 10_000) < 500, `偏り: ${counts}`);
});

test("pickWeighted は重みどおりに選ぶ", () => {
  const r = createRng(5);
  const counts = { a: 0, b: 0, c: 0 };
  const n = 100_000;
  for (let i = 0; i < n; i++) counts[pickWeighted({ a: 0.7, b: 0.2, c: 0.1 }, r)] += 1;
  assert.ok(Math.abs(counts.a / n - 0.7) < 0.01);
  assert.ok(Math.abs(counts.b / n - 0.2) < 0.01);
  assert.ok(Math.abs(counts.c / n - 0.1) < 0.01);
});
