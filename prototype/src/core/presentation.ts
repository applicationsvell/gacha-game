import type { Rng } from "./rng.ts";
import type { PackResult } from "./gacha.ts";
import type { Rarity } from "./types.ts";

/*
 * 開封演出の段取り(提案書 4.5節)。画面から切り離して、テストできるようにしている。
 *
 * - 封を切ったときに漏れる光の色で、中の最高レア度を予告する。
 * - SR 以上のパックの一部では、最初は1段低い色を見せ、最後の1枚の直前に色を上げる(昇格)。
 * - 実際より低く見せたあと上げることはあっても、実際より高く見せることはない(格下げに見える演出はしない)。
 */

/** 光の色の段階。0: 白(C/U) 1: 青(R) 2: 紫(SR) 3: 金(SSR) 4: 虹(UR) */
export type Tier = 0 | 1 | 2 | 3 | 4;

export const TIER_OF: Record<Rarity, Tier> = { C: 0, U: 0, R: 1, SR: 2, SSR: 3, UR: 4 };
export const TIER_NAMES = ["白", "青", "紫", "金", "虹"] as const;

/** SR 以上のパックで昇格演出を出す割合 */
export const PROMOTE_RATE = 0.25;

export type Pace = "fast" | "normal" | "suspense" | "cinematic";

export interface RevealStep {
  /** 元のパック内での位置 */
  index: number;
  tier: Tier;
  pace: Pace;
}

export interface RevealPlan {
  /** 本当の最高段階 */
  maxTier: Tier;
  /** 封を切ったときに見せる色 */
  initialTell: Tier;
  /** 最後の1枚の直前に色が上がるか */
  promotion: boolean;
  god: boolean;
  /** めくる順番(低い物から、最高の1枚を最後に) */
  steps: RevealStep[];
}

export function planReveal(result: PackResult, rng: Rng): RevealPlan {
  const tiers = result.cards.map((c) => TIER_OF[c.rarity]);
  const maxTier = Math.max(...tiers) as Tier;
  const promotion = maxTier >= 2 && rng.next() < PROMOTE_RATE;
  const initialTell = (promotion ? maxTier - 1 : maxTier) as Tier;

  // 並べ替えは安定ソート。通常のパックはもともとレア枠が最後なので順番は変わらない
  const order = tiers.map((tier, index) => ({ tier, index })).sort((a, b) => a.tier - b.tier);
  const steps = order.map(({ tier, index }): RevealStep => {
    let pace: Pace = "fast";
    if (tier === 4) pace = "cinematic";
    else if (tier >= 2) pace = "suspense";
    else if (tier === 1) pace = "normal";
    return { index, tier, pace };
  });

  return { maxTier, initialTell, promotion, god: result.god, steps };
}
