import { pickWeighted } from "./rng.ts";
import type { Rng } from "./rng.ts";
import type { CardSet } from "./cards.ts";
import type { Finish, Rarity } from "./types.ts";

/*
 * ブースターパック(提案書 4.2〜4.4節)。数値は tools/gacha_sim.py と同じ。
 */

/** 1〜3枚目 */
export const COMMON_SLOT = { C: 0.8, U: 0.2 } as const;
/** 4枚目 */
export const UNCOMMON_SLOT = { U: 0.7, R: 0.3 } as const;
/** 5枚目(レア枠) */
export const RARE_SLOT = { R: 0.675, SR: 0.26, SSR: 0.06, UR: 0.005 } as const;
/** ゴッドパック: 5枚すべて SR 以上 */
export const GOD_PACK_RATE = 1 / 1000;
export const GOD_SLOT = { SR: 0.8, SSR: 0.18, UR: 0.02 } as const;

/** SSR以上が出ないまま、この番目のパックから確率が上がる */
export const TOP_SOFT_START = 21;
/** この番目のパックで SSR 以上が確定 */
export const TOP_HARD = 30;
/** 天井域に入ってからの、1パックごとの上昇幅 */
export const TOP_SOFT_STEP = 0.09;
/** この番目のパックで UR が確定 */
export const UR_HARD = 200;

/** 交換ポイントの必要数(1パック = 1ポイント) */
export const POINT_COST: Record<Rarity, number> = { C: 1, U: 2, R: 5, SR: 15, SSR: 50, UR: 150 };

/** 仕上げの出方。残りは normal */
export const FINISH_RATES: Record<Rarity, Partial<Record<Exclude<Finish, "normal">, number>>> = {
  C: { holo: 0.08 },
  U: { holo: 0.08 },
  R: { holo: 0.08 },
  SR: { holo: 0.1, full: 0.08 },
  SSR: { holo: 0.1, full: 0.08, gold: 0.02 },
  UR: { holo: 0.1, full: 0.08, gold: 0.02 },
};

/** セットごとの天井カウンタと交換ポイント。途中でやめても消えない */
export interface PackState {
  opened: number;
  /** SSR以上が出ていない連続パック数 */
  sinceTop: number;
  /** URが出ていない連続パック数 */
  sinceUr: number;
  points: number;
}

export function newPackState(): PackState {
  return { opened: 0, sinceTop: 0, sinceUr: 0, points: 0 };
}

export interface PulledCard {
  cardId: string;
  rarity: Rarity;
  finish: Finish;
}

export interface PackResult {
  cards: PulledCard[];
  god: boolean;
  /** 確定天井で SSR 以上が出た */
  hitTopPity: boolean;
  /** 確定天井で UR が出た */
  hitUrPity: boolean;
}

/** 次に開けるパックのレア枠で SSR 以上が出る確率(UI のカウンタ表示用) */
export function topChance(state: PackState): number {
  if (state.sinceUr + 1 >= UR_HARD) return 1;
  const n = state.sinceTop + 1;
  const base = RARE_SLOT.SSR + RARE_SLOT.UR;
  if (n >= TOP_HARD) return 1;
  if (n >= TOP_SOFT_START) return Math.min(1, base + (n - TOP_SOFT_START + 1) * TOP_SOFT_STEP);
  return base;
}

function rollRareSlot(state: PackState, rng: Rng, forceTop: boolean): { rarity: Rarity; pity: "top" | "ur" | null } {
  if (state.sinceUr + 1 >= UR_HARD) return { rarity: "UR", pity: "ur" };
  const n = state.sinceTop + 1;
  const p = forceTop ? 1 : topChance(state);
  if (rng.next() < p) {
    const urShare = RARE_SLOT.UR / (RARE_SLOT.SSR + RARE_SLOT.UR);
    const rarity: Rarity = rng.next() < urShare ? "UR" : "SSR";
    return { rarity, pity: n >= TOP_HARD || forceTop ? "top" : null };
  }
  const rest = RARE_SLOT.R + RARE_SLOT.SR;
  return { rarity: rng.next() < RARE_SLOT.R / rest ? "R" : "SR", pity: null };
}

function rollFinish(rarity: Rarity, rng: Rng): Finish {
  const x = rng.next();
  let acc = 0;
  for (const [finish, p] of Object.entries(FINISH_RATES[rarity]) as [Finish, number][]) {
    acc += p;
    if (x < acc) return finish;
  }
  return "normal";
}

export interface OpenOptions {
  /** レア枠を SSR 以上に固定する(最初の5パックの保証用) */
  guaranteeTop?: boolean;
}

/**
 * パックを1つ開ける。state(天井カウンタと交換ポイント)を更新する。
 */
export function openPack(set: CardSet, state: PackState, rng: Rng, opts: OpenOptions = {}): PackResult {
  // 保証つきのパックはゴッドパックにしない(ゴッドパックは SR だけのこともあり、保証が外れる)
  const godRoll = rng.next();
  const god = !opts.guaranteeTop && godRoll < GOD_PACK_RATE;
  let rarities: Rarity[];
  let pity: "top" | "ur" | null = null;
  if (god) {
    rarities = Array.from({ length: 5 }, () => pickWeighted(GOD_SLOT, rng));
  } else {
    rarities = [pickWeighted(COMMON_SLOT, rng), pickWeighted(COMMON_SLOT, rng), pickWeighted(COMMON_SLOT, rng)];
    rarities.push(pickWeighted(UNCOMMON_SLOT, rng));
    const rare = rollRareSlot(state, rng, opts.guaranteeTop ?? false);
    rarities.push(rare.rarity);
    pity = rare.pity;
  }

  const hasTop = rarities.some((r) => r === "SSR" || r === "UR");
  const hasUr = rarities.includes("UR");
  state.opened += 1;
  state.points += 1;
  state.sinceTop = hasTop ? 0 : state.sinceTop + 1;
  state.sinceUr = hasUr ? 0 : state.sinceUr + 1;

  const cards = rarities.map((rarity): PulledCard => {
    const pool = set.byRarity[rarity];
    const card = pool[rng.int(pool.length)];
    if (!card) throw new Error(`${rarity} のカードがない`);
    return { cardId: card.id, rarity, finish: rollFinish(rarity, rng) };
  });

  return { cards, god, hitTopPity: pity === "top", hitUrPity: pity === "ur" };
}

/** 最初に配るパックの数。最後の1パックで SSR 以上を保証する */
export const STARTER_PACKS = 5;

export function openStarterPacks(set: CardSet, state: PackState, rng: Rng): PackResult[] {
  const results: PackResult[] = [];
  let gotTop = false;
  for (let i = 0; i < STARTER_PACKS; i++) {
    const last = i === STARTER_PACKS - 1;
    const r = openPack(set, state, rng, { guaranteeTop: last && !gotTop });
    gotTop ||= r.cards.some((c) => c.rarity === "SSR" || c.rarity === "UR");
    results.push(r);
  }
  return results;
}

/**
 * 表示用の排出率。天井を除いた素の値で、1パックあたりに各カードが出る枚数の期待値を返す。
 * 合計は5になる。
 */
export function expectedCopiesPerPack(set: CardSet): Map<string, number> {
  const perRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, SR: 0, SSR: 0, UR: 0 };
  const normal = 1 - GOD_PACK_RATE;
  for (const [r, p] of Object.entries(COMMON_SLOT) as [Rarity, number][]) perRarity[r] += 3 * p * normal;
  for (const [r, p] of Object.entries(UNCOMMON_SLOT) as [Rarity, number][]) perRarity[r] += p * normal;
  for (const [r, p] of Object.entries(RARE_SLOT) as [Rarity, number][]) perRarity[r] += p * normal;
  for (const [r, p] of Object.entries(GOD_SLOT) as [Rarity, number][]) perRarity[r] += 5 * p * GOD_PACK_RATE;
  const out = new Map<string, number>();
  for (const card of set.cards) out.set(card.id, perRarity[card.rarity] / set.byRarity[card.rarity].length);
  return out;
}
