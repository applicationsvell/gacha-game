/*
 * 手作業で絵を作るときの指示文一覧(art/PROMPTS.md)を書き出す。
 *   node scripts/print-prompts.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { SET1 } from "../src/data/index.ts";
import { buildPrompt } from "../src/data/artPrompts.ts";

const lines = [
  "# カード絵の指示文",
  "",
  "無料の画像生成サービス(Gemini アプリ、Google AI Studio、ChatGPT、Bing Image Creator など)に1枚ずつ貼って使う。",
  "できた画像は、カードID(例 `s1-001.png`)かカード名(例 `ぷるスライム.png`)のファイル名で保存し、",
  "`python3 scripts/import_art.py <フォルダ>` で取り込む。横長(5:4 前後)で作ると切り抜きが少ない。",
  "",
  "このファイルは `node scripts/print-prompts.ts` で作り直せる。指示文の元は `src/data/artPrompts.ts`。",
  "",
];
for (const c of SET1.cards) {
  lines.push(`## ${c.id} ${c.name}(${c.rarity})`, "", "```", buildPrompt(c), "```", "");
}
mkdirSync("art", { recursive: true });
writeFileSync("art/PROMPTS.md", lines.join("\n"));
console.log(`art/PROMPTS.md に ${SET1.cards.length} 件を書いた`);
