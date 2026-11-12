export const RARITIES = ["C", "U", "R", "SR", "SSR", "UR"] as const;
export type Rarity = (typeof RARITIES)[number];

/** 仕上げ。性能には影響しない */
export const FINISHES = ["normal", "holo", "full", "gold"] as const;
export type Finish = (typeof FINISHES)[number];

export const TRIBES = ["slime", "beast", "dragon", "machine", "spirit", "plant"] as const;
export type Tribe = (typeof TRIBES)[number];

export const TRIBE_NAMES: Record<Tribe, string> = {
  slime: "スライム",
  beast: "獣",
  dragon: "竜",
  machine: "機械",
  spirit: "霊",
  plant: "植物",
};

export type Star = 1 | 2 | 3;

/** 能力が発動するきっかけ */
export type Trigger = "battleStart" | "turnStart" | "attack" | "faint" | "win";

/** 能力の効果。戦闘エンジンが解釈する */
export type Effect =
  /** 倒れた位置に分身を出す */
  | { kind: "summon"; atk: number; hp: number; count: number }
  /** すぐ後ろの味方の攻撃力を上げる */
  | { kind: "buffBehind"; atk: number }
  /** 先頭の味方に盾を張る。perRelic はレリック1個あたりの追加分 */
  | { kind: "shieldFront"; amount: number; perRelic?: number }
  /** 味方全員の体力を回復する(最大体力まで) */
  | { kind: "healAll"; amount: number }
  /** 自分を強化する */
  | { kind: "buffSelf"; atk: number; hp: number }
  /** 敵の先頭にダメージを与える */
  | { kind: "damageFront"; amount: number }
  /** 味方全員(種族指定ならその種族)を強化する */
  | { kind: "rally"; atk: number; hp: number; tribe?: Tribe }
  /** 勝ったときにもらえるゴールドを増やす(商才) */
  | { kind: "gold"; amount: number }
  /** ★1の味方を★2として扱う */
  | { kind: "promoteAllies" };

export interface Ability {
  trigger: Trigger;
  effect: Effect;
}

export interface CardDef {
  id: string;
  setId: string;
  name: string;
  rarity: Rarity;
  tribe: Tribe;
  atk: number;
  hp: number;
  ability?: Ability;
}

export interface RelicDef {
  id: string;
  name: string;
  tier: "common" | "rare" | "jackpot";
  atkAll?: number;
  hpAll?: number;
  shieldFront?: number;
  goldBonus?: number;
}
