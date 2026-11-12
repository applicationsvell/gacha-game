import type { RegionDef } from "../core/expedition.ts";

/** 遠征先。試作では2地域。層ごとの選択肢は提案書 5.1節の「分岐マップ」 */
export const REGIONS: RegionDef[] = [
  {
    id: "forest",
    name: "芽吹きの森",
    tribes: ["slime", "beast", "plant"],
    level: 0,
    bossCardId: "s1-050", // ぎんろうおう
    layout: [
      ["battle", "battle", "treasure"],
      ["battle", "event", "elite"],
      ["camp"],
      ["battle", "elite", "event"],
      ["battle", "treasure", "elite"],
      ["camp"],
      ["boss"],
    ],
  },
  {
    id: "mine",
    name: "鉄錆の坑道",
    tribes: ["machine", "dragon", "spirit"],
    level: 1,
    bossCardId: "s1-052", // くれないりゅう
    requires: "forest",
    layout: [
      ["battle", "elite", "treasure"],
      ["battle", "event", "elite"],
      ["camp"],
      ["elite", "battle", "event"],
      ["battle", "treasure", "elite"],
      ["camp"],
      ["boss"],
    ],
  },
];
