import type { Ability, CardDef, Rarity, RelicDef, Tribe } from "../core/types.ts";

/**
 * 第1セット「芽吹きの枝」。60種(C20 / U16 / R12 / SR8 / SSR3 / UR1)。
 * 能力と数値は試作用の仮置きで、プレイテストで調整する。
 */
export const SET1_ID = "s1";
export const SET1_NAME = "芽吹きの枝";
export const SET1_PACK_PRICE = 100;

type Row = [name: string, rarity: Rarity, tribe: Tribe, atk: number, hp: number, ability?: Ability];

const faint = (effect: Ability["effect"]): Ability => ({ trigger: "faint", effect });
const start = (effect: Ability["effect"]): Ability => ({ trigger: "battleStart", effect });
const turn = (effect: Ability["effect"]): Ability => ({ trigger: "turnStart", effect });
const onAttack = (effect: Ability["effect"]): Ability => ({ trigger: "attack", effect });
const onWin = (amount: number): Ability => ({ trigger: "win", effect: { kind: "gold", amount } });

const ROWS: Row[] = [
  // C (20)
  ["ぷるスライム", "C", "slime", 2, 3, faint({ kind: "summon", atk: 1, hp: 1, count: 1 })],
  ["しずくスライム", "C", "slime", 1, 4, start({ kind: "buffSelf", atk: 1, hp: 1 })],
  ["どろスライム", "C", "slime", 2, 4],
  ["あわスライム", "C", "slime", 1, 3, faint({ kind: "damageFront", amount: 1 })],
  ["こいぬ", "C", "beast", 3, 2],
  ["のねずみ", "C", "beast", 2, 2, start({ kind: "damageFront", amount: 1 })],
  ["いのしし", "C", "beast", 3, 3, onAttack({ kind: "buffSelf", atk: 1, hp: 0 })],
  ["ちびトカゲ", "C", "dragon", 2, 3, turn({ kind: "buffSelf", atk: 1, hp: 0 })],
  ["たまごりゅう", "C", "dragon", 1, 4, faint({ kind: "summon", atk: 3, hp: 2, count: 1 })],
  ["こばんトカゲ", "C", "dragon", 2, 3, onWin(3)],
  ["ねじ虫", "C", "machine", 2, 3, start({ kind: "shieldFront", amount: 1 })],
  ["はぐるま", "C", "machine", 2, 4],
  ["ブリキ兵", "C", "machine", 3, 3],
  ["ひとだま", "C", "spirit", 2, 2, faint({ kind: "damageFront", amount: 2 })],
  ["こだま", "C", "spirit", 1, 3, faint({ kind: "rally", atk: 1, hp: 0 })],
  ["ざしきわらし", "C", "spirit", 1, 3, onWin(4)],
  ["ふたば", "C", "plant", 1, 4, turn({ kind: "buffSelf", atk: 0, hp: 1 })],
  ["どんぐり", "C", "plant", 2, 3],
  ["きのこ", "C", "plant", 2, 2, faint({ kind: "summon", atk: 1, hp: 2, count: 1 })],
  ["つぼみ", "C", "plant", 1, 3, turn({ kind: "healAll", amount: 1 })],
  // U (16)
  ["ぶんれつスライム", "U", "slime", 2, 4, faint({ kind: "summon", atk: 1, hp: 1, count: 2 })],
  ["よろいスライム", "U", "slime", 2, 5, start({ kind: "buffSelf", atk: 0, hp: 3 })],
  ["スライムの親分", "U", "slime", 3, 4, start({ kind: "rally", atk: 1, hp: 1, tribe: "slime" })],
  ["かけるオオカミ", "U", "beast", 4, 3, start({ kind: "damageFront", amount: 2 })],
  ["ちからグマ", "U", "beast", 3, 5, onAttack({ kind: "buffSelf", atk: 1, hp: 0 })],
  ["まねきこぎつね", "U", "beast", 2, 4, onWin(6)],
  ["ひのこトカゲ", "U", "dragon", 3, 3, onAttack({ kind: "buffBehind", atk: 1 })],
  ["こりゅう", "U", "dragon", 2, 5, turn({ kind: "buffSelf", atk: 1, hp: 0 })],
  ["わかりゅう", "U", "dragon", 4, 4, faint({ kind: "rally", atk: 1, hp: 0, tribe: "dragon" })],
  ["ばねロボ", "U", "machine", 3, 4, start({ kind: "shieldFront", amount: 2 })],
  ["ほうだい", "U", "machine", 2, 4, start({ kind: "damageFront", amount: 3 })],
  ["しゅうりロボ", "U", "machine", 2, 5, turn({ kind: "healAll", amount: 1 })],
  ["ゆうれい", "U", "spirit", 3, 3, faint({ kind: "damageFront", amount: 3 })],
  ["おにび", "U", "spirit", 2, 3, faint({ kind: "rally", atk: 1, hp: 1 })],
  ["つるくさ", "U", "plant", 2, 5, turn({ kind: "buffSelf", atk: 0, hp: 2 })],
  ["ひまわり", "U", "plant", 2, 4, start({ kind: "rally", atk: 0, hp: 2, tribe: "plant" })],
  // R (12)
  ["キングスライム", "R", "slime", 3, 6, faint({ kind: "summon", atk: 2, hp: 2, count: 2 })],
  ["ぷるぷる大将", "R", "slime", 3, 5, start({ kind: "rally", atk: 2, hp: 0, tribe: "slime" })],
  ["まねきネコ", "R", "beast", 3, 4, onWin(12)],
  ["はやてヒョウ", "R", "beast", 5, 3, start({ kind: "damageFront", amount: 3 })],
  ["ほのおりゅう", "R", "dragon", 4, 5, onAttack({ kind: "buffBehind", atk: 2 })],
  ["いわりゅう", "R", "dragon", 3, 7, turn({ kind: "buffSelf", atk: 1, hp: 0 })],
  ["たてロボ", "R", "machine", 3, 6, start({ kind: "shieldFront", amount: 3, perRelic: 1 })],
  ["ちょきん箱ロボ", "R", "machine", 2, 6, onWin(10)],
  ["さまよう鎧", "R", "spirit", 4, 4, faint({ kind: "summon", atk: 2, hp: 2, count: 1 })],
  ["たたりがみ", "R", "spirit", 3, 4, faint({ kind: "damageFront", amount: 5 })],
  ["いやしの花", "R", "plant", 2, 6, turn({ kind: "healAll", amount: 2 })],
  ["しんじゅの木", "R", "plant", 3, 7, turn({ kind: "buffSelf", atk: 0, hp: 2 })],
  // SR (8)
  ["スライムの王冠", "SR", "slime", 4, 6, start({ kind: "rally", atk: 2, hp: 2, tribe: "slime" })],
  ["ぎんろうおう", "SR", "beast", 6, 5, onAttack({ kind: "buffSelf", atk: 2, hp: 0 })],
  ["こがねギツネ", "SR", "beast", 3, 6, onWin(25)],
  ["くれないりゅう", "SR", "dragon", 5, 6, turn({ kind: "buffSelf", atk: 2, hp: 0 })],
  ["ねじまき番兵", "SR", "machine", 3, 7, start({ kind: "shieldFront", amount: 3, perRelic: 2 })],
  ["たいほうロボ", "SR", "machine", 4, 6, start({ kind: "damageFront", amount: 5 })],
  ["しにがみ", "SR", "spirit", 4, 5, faint({ kind: "rally", atk: 2, hp: 2 })],
  ["よつばの精", "SR", "plant", 3, 7, turn({ kind: "healAll", amount: 2 })],
  // SSR (3)
  ["万年スライム", "SSR", "slime", 5, 8, faint({ kind: "summon", atk: 3, hp: 3, count: 2 })],
  ["千年樹の番人", "SSR", "plant", 4, 10, turn({ kind: "healAll", amount: 3 })],
  ["てんくうの機兵", "SSR", "machine", 6, 8, start({ kind: "rally", atk: 2, hp: 2, tribe: "machine" })],
  // UR (1)
  ["封印竜アルカ", "UR", "dragon", 7, 9, start({ kind: "promoteAllies" })],
];

export const SET1_CARDS: CardDef[] = ROWS.map(([name, rarity, tribe, atk, hp, ability], i) => ({
  id: `${SET1_ID}-${String(i + 1).padStart(3, "0")}`,
  setId: SET1_ID,
  name,
  rarity,
  tribe,
  atk,
  hp,
  ...(ability ? { ability } : {}),
}));

export const RELICS: RelicDef[] = [
  { id: "r-01", name: "木の盾", tier: "common", shieldFront: 2 },
  { id: "r-02", name: "力のバンダナ", tier: "common", atkAll: 1 },
  { id: "r-03", name: "薬草ぶくろ", tier: "common", hpAll: 1 },
  { id: "r-04", name: "幸運のコイン", tier: "common", goldBonus: 5 },
  { id: "r-05", name: "竜のうろこ", tier: "rare", hpAll: 2 },
  { id: "r-06", name: "戦旗", tier: "rare", atkAll: 1, hpAll: 1 },
  { id: "r-07", name: "黄金の王冠", tier: "jackpot", atkAll: 2, hpAll: 2, goldBonus: 20 },
];

/** 第1カプセルマシン。50個入り、目玉は黄金の王冠1個 */
export const CAPSULE1 = {
  id: "cap1",
  name: "はじまりのカプセル",
  price: 60,
  contents: [
    { relicId: "r-01", count: 12 },
    { relicId: "r-02", count: 12 },
    { relicId: "r-03", count: 12 },
    { relicId: "r-04", count: 6 },
    { relicId: "r-05", count: 4 },
    { relicId: "r-06", count: 3 },
    { relicId: "r-07", count: 1 },
  ],
};
