/*
 * カード絵を Google の Gemini API(無料枠あり)で作る。
 *
 *   GEMINI_API_KEY=... node scripts/gen-art.ts                 # 絵がないカードを全部
 *   node scripts/gen-art.ts --only s1-001,s1-060 --variants 3  # 指定カードを3案ずつ
 *   node scripts/gen-art.ts --model gemini-2.5-flash-image     # モデルを指定
 *
 * 生成した画像は art-raw/ に保存する。そのあと scripts/import_art.py で縮小して src/art/ に入れる。
 * 無料枠には1日・1分あたりの回数制限があるので、1枚ずつ間をあけて呼ぶ。
 */
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SET1 } from "../src/data/index.ts";
import { buildPrompt } from "../src/data/artPrompts.ts";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY が設定されていません。環境の設定で登録してください。");
  process.exit(1);
}
const model = opt("model") ?? "gemini-2.5-flash-image";
const variants = Number(opt("variants") ?? 1);
const only = opt("only")?.split(",");
const force = args.includes("--force");
const waitMs = Number(opt("wait") ?? 7000);
const RAW = "art-raw";
const FINAL = join("src", "art");
mkdirSync(RAW, { recursive: true });

async function generate(prompt: string, aspect: boolean): Promise<{ data: Buffer; mime: string }> {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], ...(aspect ? { imageConfig: { aspectRatio: "5:4" } } : {}) },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key as string },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`), { status: res.status });
  const json = JSON.parse(text);
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: { inlineData?: { data: string } }) => p.inlineData?.data);
  if (!img) throw new Error(`画像が返ってこなかった: ${text.slice(0, 400)}`);
  return { data: Buffer.from(img.inlineData.data, "base64"), mime: img.inlineData.mimeType ?? "image/png" };
}

const targets = SET1.cards.filter((c) => (only ? only.includes(c.id) : true));
let made = 0;
let useAspect = true;
for (const card of targets) {
  if (!force && !only && existsSync(join(FINAL, `${card.id}.webp`))) continue;
  for (let v = 1; v <= variants; v++) {
    const prompt = buildPrompt(card);
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const { data, mime } = await generate(prompt, useAspect);
        const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
        const file = join(RAW, variants > 1 ? `${card.id}-${v}.${ext}` : `${card.id}.${ext}`);
        writeFileSync(file, data);
        made += 1;
        console.log(`✓ ${card.id} ${card.name} → ${file}`);
        break;
      } catch (e) {
        const err = e as Error & { status?: number };
        // 縦横比の指定が通らないモデルなら、指定なしでやり直す
        if (err.status === 400 && useAspect && /aspect|imageConfig/i.test(err.message)) {
          useAspect = false;
          continue;
        }
        if (err.status === 429 && attempt < 4) {
          console.log(`… 回数制限。${attempt * 30}秒待つ`);
          await new Promise((r) => setTimeout(r, attempt * 30000));
          continue;
        }
        console.error(`✗ ${card.id} ${card.name}: ${err.message}`);
        if (err.status === 401 || err.status === 403) process.exit(1);
        break;
      }
    }
    await new Promise((r) => setTimeout(r, waitMs));
  }
}
console.log(`${made} 枚つくった。次に python3 scripts/import_art.py ${RAW} で取り込む`);
