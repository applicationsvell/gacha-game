import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, LOOKS } from "../src/data/artPrompts.ts";
import { SET1 } from "../src/data/index.ts";

test("全カードに絵の指示文があり、余分な定義もない", () => {
  for (const c of SET1.cards) {
    const p = buildPrompt(c);
    assert.ok(p.includes(LOOKS[c.name]!), c.name);
    assert.ok(/no text/i.test(p), "文字を描かせない指定が入っている");
  }
  const names = new Set(SET1.cards.map((c) => c.name));
  assert.deepEqual(Object.keys(LOOKS).filter((n) => !names.has(n)), []);
});
