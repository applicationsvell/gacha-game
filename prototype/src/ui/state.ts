import { createRng } from "../core/rng.ts";
import type { Rng } from "../core/rng.ts";
import { newPackState, openPack, openStarterPacks } from "../core/gacha.ts";
import type { PackResult, PackState } from "../core/gacha.ts";
import { addPulled, newCollection } from "../core/collection.ts";
import type { Collection } from "../core/collection.ts";
import { newMarket } from "../core/economy.ts";
import type { MarketState } from "../core/economy.ts";
import { SET1 } from "../data/index.ts";
import { openDropPack } from "../core/expedition.ts";
import type { PulledCard } from "../core/gacha.ts";
import type { Tribe } from "../core/types.ts";

/*
 * 試作の画面で使う状態。ブラウザに保存し、再読み込みしても続きから遊べる。
 * 稼ぐ遊び(遠征と店)はまだないので、ゴールドは試作用のボタンで補充する。
 */

const KEY = "packmonger-proto-v1";
export const START_GOLD = 1000;
export const DEBUG_GOLD = 1000;

export interface Stats {
  packs: number;
  ssr: number;
  ur: number;
  god: number;
  gold: number;
}

export interface GameState {
  gold: number;
  pack: PackState;
  col: Collection;
  market: MarketState;
  starterDone: boolean;
  rngState: number;
  stats: Stats;
  muted: boolean;
  /** 遠征の編成(カードID、先頭から) */
  team: string[];
  /** ボスを倒した地域 */
  cleared: string[];
  expeditions: number;
}

function fresh(): GameState {
  return {
    gold: 0,
    pack: newPackState(),
    col: newCollection(),
    market: newMarket(),
    starterDone: false,
    rngState: (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0,
    stats: { packs: 0, ssr: 0, ur: 0, god: 0, gold: 0 },
    muted: false,
    team: [],
    cleared: [],
    expeditions: 0,
  };
}

export class Game {
  s: GameState;
  rng: Rng;

  constructor() {
    this.s = this.load();
    this.rng = createRng(this.s.rngState);
  }

  private load(): GameState {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...fresh(), ...(JSON.parse(raw) as GameState) };
    } catch {
      // 保存できない環境(プライベートモードなど)でも遊べるようにする
    }
    return fresh();
  }

  save(): void {
    this.s.rngState = this.rng.state();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      // 保存できなくても続ける
    }
  }

  reset(): void {
    this.s = fresh();
    this.rng = createRng(this.s.rngState);
    this.save();
  }

  get set() {
    return SET1;
  }

  canBuy(n: number): boolean {
    return this.s.gold >= SET1.packPrice * n;
  }

  private record(results: PackResult[]): void {
    for (const r of results) {
      this.s.stats.packs += 1;
      if (r.god) this.s.stats.god += 1;
      for (const c of r.cards) {
        if (c.rarity === "SSR") this.s.stats.ssr += 1;
        if (c.rarity === "UR") this.s.stats.ur += 1;
        if (c.finish === "gold") this.s.stats.gold += 1;
      }
    }
  }

  /** 開けたパックと、そのとき初めて手に入れたカードID */
  starter(): { results: PackResult[]; newIds: Set<string> } {
    const results = openStarterPacks(SET1, this.s.pack, this.rng);
    const newIds = new Set(results.flatMap((r) => addPulled(this.s.col, r.cards).newCardIds));
    this.s.starterDone = true;
    this.s.gold += START_GOLD;
    this.record(results);
    this.save();
    return { results, newIds };
  }

  buy(n: number): { results: PackResult[]; newIds: Set<string> } | null {
    if (!this.canBuy(n)) return null;
    this.s.gold -= SET1.packPrice * n;
    const results = Array.from({ length: n }, () => openPack(SET1, this.s.pack, this.rng));
    const newIds = new Set(results.flatMap((r) => addPulled(this.s.col, r.cards).newCardIds));
    this.record(results);
    this.save();
    return { results, newIds };
  }

  /** 遠征のドロップパックを開ける(天井と交換ポイントには数えない) */
  openDrop(tribes: readonly Tribe[]): { cards: PulledCard[]; newIds: Set<string> } {
    const cards = openDropPack(SET1, tribes, this.rng);
    const newIds = new Set(addPulled(this.s.col, cards).newCardIds);
    this.save();
    return { cards, newIds };
  }

  /** 遠征から帰ったときの精算 */
  finishExpedition(regionId: string, gold: number, cleared: boolean): void {
    this.s.gold += gold;
    this.s.expeditions += 1;
    if (cleared && !this.s.cleared.includes(regionId)) this.s.cleared.push(regionId);
    this.save();
  }

  /** 編成を保存する。持っていないカードは外す */
  setTeam(ids: string[]): void {
    this.s.team = ids.filter((id) => (this.s.col.cards[id] ? true : false)).slice(0, 5);
    this.save();
  }

  addDebugGold(): void {
    this.s.gold += DEBUG_GOLD;
    this.save();
  }
}
