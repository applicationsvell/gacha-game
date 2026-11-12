import { makeSet, relicMap } from "../core/cards.ts";
import type { BattleContext } from "../core/battle.ts";
import { CAPSULE1, RELICS, SET1_CARDS, SET1_ID, SET1_NAME, SET1_PACK_PRICE } from "./set1.ts";

export const SET1 = makeSet(SET1_ID, SET1_NAME, SET1_PACK_PRICE, SET1_CARDS);
export const SETS = [SET1];
export const CAPSULES = [CAPSULE1];

/** 戦闘エンジンに渡す、全セットのカードとレリックの索引 */
export const BATTLE_CONTEXT: BattleContext = {
  cards: new Map(SETS.flatMap((s) => s.cards.map((c) => [c.id, c] as const))),
  relics: relicMap(RELICS),
};
