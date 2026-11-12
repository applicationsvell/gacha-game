import { describeAbility } from "../core/cards.ts";
import { TRIBE_NAMES } from "../core/types.ts";
import type { CardDef, Finish, Star } from "../core/types.ts";
import { monsterSvg } from "./art.ts";
import { REDUCED } from "./fx.ts";

export const FINISH_LABEL: Record<Finish, string> = { normal: "", holo: "ホロ", full: "フルアート", gold: "ゴールド" };

const TRIBE_ICON = { slime: "💧", beast: "🐾", dragon: "🔥", machine: "⚙", spirit: "👻", plant: "🌿" } as const;

export interface CardViewOptions {
  finish?: Finish;
  star?: Star;
  faceDown?: boolean;
  /** 指の位置に合わせて傾ける */
  tilt?: boolean;
}

/** カード1枚の DOM。.flipped を付けると表を向く */
export function cardEl(card: CardDef, opts: CardViewOptions = {}): HTMLElement {
  const finish = opts.finish ?? "normal";
  const star = opts.star ?? 1;
  const el = document.createElement("div");
  el.className = `card r-${card.rarity} f-${finish}${opts.faceDown ? "" : " flipped"}`;
  el.dataset.cardId = card.id;
  const ability = card.ability ? describeAbility(card.ability, star) : "能力なし";
  const full = finish === "full" || finish === "gold";
  el.innerHTML = `
    <div class="card-inner">
      <div class="card-back"><div class="back-emblem"><span>P</span></div></div>
      <div class="card-front${full ? " is-full" : ""}">
        <div class="art">${monsterSvg(card, full)}</div>
        <div class="frame">
          <div class="top"><span class="name"></span><span class="rar">${card.rarity}</span></div>
          <div class="meta"><span class="tribe">${TRIBE_ICON[card.tribe]} ${TRIBE_NAMES[card.tribe]}</span><span class="stars">${"★".repeat(star)}</span></div>
          <div class="ability"></div>
          <div class="stats"><span class="atk">⚔${card.atk}</span><span class="hp">♥${card.hp}</span></div>
        </div>
        <div class="sheen"></div>
        <div class="glare"></div>
        ${finish !== "normal" ? `<div class="finish-tag">${FINISH_LABEL[finish]}</div>` : ""}
      </div>
    </div>`;
  (el.querySelector(".name") as HTMLElement).textContent = card.name;
  (el.querySelector(".ability") as HTMLElement).textContent = ability;
  if (opts.tilt && !REDUCED) attachTilt(el);
  return el;
}

/** 指やマウスの位置でカードを傾け、ホロの光を動かす */
export function attachTilt(el: HTMLElement): void {
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    el.style.setProperty("--rx", `${((0.5 - y) * 18).toFixed(1)}deg`);
    el.style.setProperty("--ry", `${((x - 0.5) * 22).toFixed(1)}deg`);
  };
  const leave = () => {
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);
}
