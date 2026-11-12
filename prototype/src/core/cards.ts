import { RARITIES, TRIBE_NAMES } from "./types.ts";
import type { Ability, CardDef, Rarity, RelicDef, Star } from "./types.ts";

/** カードのセット。パックはセット単位で売る */
export interface CardSet {
  id: string;
  name: string;
  packPrice: number;
  cards: readonly CardDef[];
  byRarity: Readonly<Record<Rarity, readonly CardDef[]>>;
  byId: ReadonlyMap<string, CardDef>;
}

export function makeSet(id: string, name: string, packPrice: number, cards: readonly CardDef[]): CardSet {
  const byRarity = Object.fromEntries(RARITIES.map((r) => [r, cards.filter((c) => c.rarity === r)])) as Record<
    Rarity,
    CardDef[]
  >;
  for (const r of RARITIES) {
    if (byRarity[r].length === 0) throw new Error(`セット ${id} に ${r} のカードがない`);
  }
  const byId = new Map(cards.map((c) => [c.id, c]));
  if (byId.size !== cards.length) throw new Error(`セット ${id} にIDの重複がある`);
  return { id, name, packPrice, cards, byRarity, byId };
}

/** ★による倍率。★2で1.5倍、★3で2倍 */
export const STAR_MULT: Record<Star, number> = { 1: 1, 2: 1.5, 3: 2 };

export function scale(n: number, star: Star): number {
  return Math.round(n * STAR_MULT[star]);
}

const TRIGGER_TEXT: Record<Ability["trigger"], string> = {
  battleStart: "戦闘開始時",
  turnStart: "自分のターンごとに",
  attack: "攻撃するたび",
  faint: "倒れたとき",
  win: "勝ったとき",
};

const signed = (atk: number, hp: number): string => `+${atk}/+${hp}`;

/** 能力の説明文を、★に応じた数値で作る */
export function describeAbility(ability: Ability, star: Star = 1): string {
  const e = ability.effect;
  const s = (n: number) => scale(n, star);
  let body: string;
  switch (e.kind) {
    case "summon":
      body = `${s(e.atk)}/${s(e.hp)} の分身を${e.count}体出す`;
      break;
    case "buffBehind":
      body = `すぐ後ろの味方の攻撃力を+${s(e.atk)}`;
      break;
    case "shieldFront":
      body = `先頭の味方に盾${s(e.amount)}を張る` + (e.perRelic ? `(レリック1個につき+${s(e.perRelic)})` : "");
      break;
    case "healAll":
      body = `味方全員の体力を${s(e.amount)}回復`;
      break;
    case "buffSelf":
      body = `自分を${signed(s(e.atk), s(e.hp))}`;
      break;
    case "damageFront":
      body = `敵の先頭に${s(e.amount)}ダメージ`;
      break;
    case "rally":
      body = `${e.tribe ? TRIBE_NAMES[e.tribe] + "の" : ""}味方全員を${signed(s(e.atk), s(e.hp))}`;
      break;
    case "gold":
      body = `ゴールド+${s(e.amount)}(商才)`;
      break;
    case "promoteAllies":
      body = "★1の味方を★2として扱う";
      break;
  }
  return `${TRIGGER_TEXT[ability.trigger]}、${body}`;
}

export function relicMap(relics: readonly RelicDef[]): ReadonlyMap<string, RelicDef> {
  return new Map(relics.map((r) => [r.id, r]));
}
