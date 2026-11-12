import { FINISHES } from "./types.ts";
import type { Finish, Star } from "./types.ts";
import type { CardSet } from "./cards.ts";
import { POINT_COST } from "./gacha.ts";
import type { PackState, PulledCard } from "./gacha.ts";

/*
 * 手持ちのカード(提案書 4.3節の交換、4.6節のダブり)。
 * ★は、同じカードを素材として吸収して上げる。一度上げた★は、カードを売っても下がらない。
 */

export interface OwnedCard {
  cardId: string;
  counts: Record<Finish, number>;
  star: Star;
}

export interface Collection {
  cards: Record<string, OwnedCard>;
}

export function newCollection(): Collection {
  return { cards: {} };
}

/** ★を上げるのに吸収する枚数。合計で ★2 は3枚、★3 は9枚になる */
export const STAR_COST: Record<2 | 3, number> = { 2: 2, 3: 6 };

function entry(col: Collection, cardId: string): OwnedCard {
  let e = col.cards[cardId];
  if (!e) {
    e = { cardId, counts: { normal: 0, holo: 0, full: 0, gold: 0 }, star: 1 };
    col.cards[cardId] = e;
  }
  return e;
}

export function copies(col: Collection, cardId: string): number {
  const e = col.cards[cardId];
  return e ? FINISHES.reduce((sum, f) => sum + e.counts[f], 0) : 0;
}

export function addCard(col: Collection, cardId: string, finish: Finish = "normal"): void {
  entry(col, cardId).counts[finish] += 1;
}

export function addPulled(col: Collection, pulled: readonly PulledCard[]): { newCardIds: string[] } {
  const newCardIds: string[] = [];
  for (const p of pulled) {
    if (!col.cards[p.cardId] && !newCardIds.includes(p.cardId)) newCardIds.push(p.cardId);
    addCard(col, p.cardId, p.finish);
  }
  return { newCardIds };
}

export function removeCopy(col: Collection, cardId: string, finish: Finish): void {
  const e = col.cards[cardId];
  if (!e || e.counts[finish] <= 0) throw new Error(`${cardId}(${finish})を持っていない`);
  e.counts[finish] -= 1;
}

export function canUpgradeStar(col: Collection, cardId: string): boolean {
  const e = col.cards[cardId];
  if (!e || e.star >= 3) return false;
  const next = (e.star + 1) as 2 | 3;
  // 吸収した後も1枚は手元に残す
  return copies(col, cardId) >= STAR_COST[next] + 1;
}

/** ★を1段上げる。素材は仕上げの安いものから使い、良い仕上げを残す */
export function upgradeStar(col: Collection, cardId: string): Star {
  if (!canUpgradeStar(col, cardId)) throw new Error(`${cardId} の★は上げられない`);
  const e = entry(col, cardId);
  const next = (e.star + 1) as 2 | 3;
  let need = STAR_COST[next];
  for (const f of FINISHES) {
    while (need > 0 && e.counts[f] > 0 && copies(col, cardId) > 1) {
      e.counts[f] -= 1;
      need -= 1;
    }
  }
  e.star = next;
  return next;
}

/** 交換ポイントで、同じセットの好きなカードを1枚もらう */
export function exchange(col: Collection, set: CardSet, state: PackState, cardId: string): void {
  const card = set.byId.get(cardId);
  if (!card) throw new Error(`${cardId} はセット ${set.id} にない`);
  const cost = POINT_COST[card.rarity];
  if (state.points < cost) throw new Error(`ポイントが足りない(必要 ${cost}、所持 ${state.points})`);
  state.points -= cost;
  addCard(col, cardId);
}

/** 図鑑の埋まり具合。一度でも手に入れたカード(★を上げた物を含む)を数える */
export function completion(col: Collection, set: CardSet): { owned: number; total: number } {
  const owned = set.cards.filter((c) => {
    const e = col.cards[c.id];
    return e !== undefined && (copies(col, c.id) > 0 || e.star > 1);
  }).length;
  return { owned, total: set.cards.length };
}
