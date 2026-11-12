import type { Rng } from "./rng.ts";
import { TRIBES } from "./types.ts";
import type { CardDef, Finish, Rarity, Tribe } from "./types.ts";

/*
 * 経済(提案書 7章)と店(5.2節)。
 * - 卸(買取)は、いつでもその場で売れる安い値段。
 * - 店では、客の好みと相場に合えば卸より高く売れる。ただし客の数と予算に上限がある。
 */

/** 第1セット(パック100G)での買取価格。パックを全部卸に売ると還元率は約59% */
export const BUYLIST: Record<Rarity, number> = { C: 1, U: 3, R: 10, SR: 40, SSR: 120, UR: 800 };
export const FINISH_VALUE: Record<Finish, number> = { normal: 1, holo: 2, full: 4, gold: 20 };
/** 店頭での基準価格は買取価格の何倍か */
export const RETAIL_MULT = 2;

/** 卸に売る値段。新しいセットほどパックが高いので、買取価格もパック価格に比例させる */
export function buylistPrice(card: CardDef, finish: Finish, packPrice: number): number {
  return Math.max(1, Math.round((BUYLIST[card.rarity] * FINISH_VALUE[finish] * packPrice) / 100));
}

// ---------------------------------------------------------------------------
// 相場
// ---------------------------------------------------------------------------

export const MARKET_MIN = 0.6;
export const MARKET_MAX = 1.6;
/** 1日ごとに基準(1.0)へ戻る強さ */
export const MARKET_REVERT = 0.3;
/** 1日の揺れ幅(±半分) */
export const MARKET_NOISE = 0.16;
export const BOOM_CHANCE = 0.1;
export const BOOM_MULT = 1.5;
export const BOOM_DAYS = 3;

export interface MarketState {
  day: number;
  index: Record<Tribe, number>;
  /** 「竜ブーム」のような一時的な出来事 */
  boom: { tribe: Tribe; mult: number; daysLeft: number } | null;
}

export function newMarket(): MarketState {
  return {
    day: 1,
    index: Object.fromEntries(TRIBES.map((t) => [t, 1])) as Record<Tribe, number>,
    boom: null,
  };
}

export function advanceMarket(m: MarketState, rng: Rng): void {
  m.day += 1;
  for (const t of TRIBES) {
    const v = m.index[t] + MARKET_REVERT * (1 - m.index[t]) + (rng.next() - 0.5) * MARKET_NOISE;
    m.index[t] = Math.min(MARKET_MAX, Math.max(MARKET_MIN, v));
  }
  if (m.boom) {
    m.boom.daysLeft -= 1;
    if (m.boom.daysLeft <= 0) m.boom = null;
  } else if (rng.next() < BOOM_CHANCE) {
    const tribe = TRIBES[rng.int(TRIBES.length)] as Tribe;
    m.boom = { tribe, mult: BOOM_MULT, daysLeft: BOOM_DAYS };
  }
}

export function tribeMultiplier(m: MarketState, tribe: Tribe): number {
  return m.index[tribe] * (m.boom?.tribe === tribe ? m.boom.mult : 1);
}

/** 店頭での相場価格 */
export function marketValue(card: CardDef, finish: Finish, packPrice: number, m: MarketState): number {
  return Math.max(1, Math.round(buylistPrice(card, finish, packPrice) * RETAIL_MULT * tribeMultiplier(m, card.tribe)));
}

// ---------------------------------------------------------------------------
// 客
// ---------------------------------------------------------------------------

export interface Customer {
  id: number;
  wantTribe: Tribe | null;
  wantRarity: Rarity | null;
  budget: number;
  /** 気分。払ってもよい額にかかる倍率 */
  mood: number;
}

/** 店の格(0〜)に応じた1日の客数 */
export function customersPerDay(shopLevel: number): number {
  return Math.min(15, 6 + 3 * shopLevel);
}

export function generateCustomers(count: number, baseBudget: number, rng: Rng): Customer[] {
  const rarities: Rarity[] = ["U", "R", "SR", "SSR"];
  return Array.from({ length: count }, (_, i): Customer => {
    const kind = rng.next();
    return {
      id: i + 1,
      wantTribe: kind < 0.5 ? (TRIBES[rng.int(TRIBES.length)] as Tribe) : null,
      wantRarity: kind >= 0.5 && kind < 0.8 ? (rarities[rng.int(rarities.length)] as Rarity) : null,
      budget: Math.round(baseBudget * (0.5 + rng.next() * 1.5)),
      mood: 0.85 + rng.next() * 0.3,
    };
  });
}

/** 好みに合う品なら、相場より高くても買う */
export const WANT_PREMIUM = 1.3;
/** 好みでない品に興味を持つ確率 */
export const CASUAL_INTEREST = 0.35;
/** 払ってもよい額をどこまで超えていたら、値切りを持ちかけるか */
export const HAGGLE_RANGE = 1.25;

export type Decision = { kind: "buy"; price: number } | { kind: "haggle"; offer: number } | { kind: "pass" };

export function matchesWant(c: Customer, card: CardDef): boolean {
  return c.wantTribe === card.tribe || c.wantRarity === card.rarity;
}

/** 客が、値札のついた品にどう応じるか */
export function decide(c: Customer, card: CardDef, price: number, value: number, rng: Rng): Decision {
  const match = matchesWant(c, card);
  if (!match && rng.next() >= CASUAL_INTEREST) return { kind: "pass" };
  const limit = Math.min(c.budget, value * (match ? WANT_PREMIUM : 1) * c.mood);
  if (price <= limit) return { kind: "buy", price };
  if (price <= limit * HAGGLE_RANGE && limit >= 1) return { kind: "haggle", offer: Math.floor(limit) };
  return { kind: "pass" };
}

/**
 * 値切りに対して、こちらが値を返したときに客が受ける確率。
 * 客の提示額に近いほど受けやすく、提示額の2割増しで0になる。
 */
export function counterAcceptChance(offer: number, counter: number): number {
  if (counter <= offer) return 1;
  return Math.max(0, 1 - (counter - offer) / (offer * 0.2));
}
