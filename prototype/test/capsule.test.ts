import { test } from "node:test";
import assert from "node:assert/strict";
import { chanceOf, createMachine, drawCapsule, remainingCounts } from "../src/core/capsule.ts";
import { createRng } from "../src/core/rng.ts";
import { CAPSULES } from "../src/data/index.ts";

const def = CAPSULES[0]!;

test("最後まで引くと、中身がちょうど全部出る", () => {
  const m = createMachine(def);
  const rng = createRng(1);
  const got = new Map<string, number>();
  for (let i = 0; i < 50; i++) {
    const id = drawCapsule(m, rng);
    got.set(id, (got.get(id) ?? 0) + 1);
  }
  for (const c of def.contents) assert.equal(got.get(c.relicId), c.count, c.relicId);
  assert.equal(m.remaining.length, 0);
  assert.throws(() => drawCapsule(m, rng));
});

test("引くほど目玉の確率が上がる", () => {
  const m = createMachine(def);
  assert.equal(chanceOf(m, "r-07"), 1 / 50);
  // 目玉以外を40個抜く
  const others: string[] = m.remaining.filter((id) => id !== "r-07").slice(0, 9);
  m.remaining = ["r-07", ...others];
  assert.equal(chanceOf(m, "r-07"), 1 / 10);
  assert.equal(remainingCounts(m).get("r-07"), 1);
});

test("目玉までの回数は平均約25.5回、最悪50回", () => {
  const rng = createRng(2);
  let sum = 0;
  const trials = 4000;
  for (let t = 0; t < trials; t++) {
    const m = createMachine(def);
    let k = 0;
    for (;;) {
      k += 1;
      if (drawCapsule(m, rng) === "r-07") break;
    }
    assert.ok(k <= 50);
    sum += k;
  }
  assert.ok(Math.abs(sum / trials - 25.5) < 1, `平均 ${sum / trials}`);
});
