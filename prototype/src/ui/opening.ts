import type { PackResult, PulledCard } from "../core/gacha.ts";
import { planReveal, TIER_OF } from "../core/presentation.ts";
import type { Tier } from "../core/presentation.ts";
import { copies, STAR_COST } from "../core/collection.ts";
import { marketValue } from "../core/economy.ts";
import type { CardDef } from "../core/types.ts";
import type { Game } from "./state.ts";
import { cardEl, FINISH_LABEL } from "./cardView.ts";
import { Fx, flash, REDUCED, shake, TIER_COLORS, wait } from "./fx.ts";
import { monsterSvg } from "./art.ts";
import { sfx } from "./sound.ts";

/*
 * 開封演出(提案書 4.5節)。
 * 選ぶ → 封をなぞって切る(光の色で予告) → 1枚ずつめくる → レア度ごとの演出 → 結果
 */

export interface Deps {
  game: Game;
  fx: Fx;
  /** 開封画面のルート */
  stage: HTMLElement;
  /** 揺らす対象 */
  shakeEl: HTMLElement;
  /** 閃光を出す対象 */
  flashEl: HTMLElement;
}

export type NextAction = "again" | "box" | "close";

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

function tellColors(tier: Tier, god = false): string[] {
  if (god || tier === 4) return ["#ff4f6d", "#ffe94f", "#5bff7a", "#4fd2ff", "#ff4fd8"];
  return TIER_COLORS[tier] ?? ["#fff", "#fff"];
}

class Director {
  private skipping = false;
  private tapResolvers: (() => void)[] = [];
  readonly d: Deps;
  readonly center: HTMLElement;
  readonly row: HTMLElement;
  readonly hint: HTMLElement;
  readonly bannerEl: HTMLElement;
  readonly skipBtn: HTMLButtonElement;

  constructor(d: Deps) {
    this.d = d;
    d.stage.innerHTML = `
      <div class="stage-bg"></div>
      <div class="blackout"></div>
      <canvas class="fx-back" aria-hidden="true"></canvas>
      <div class="stage-grid"></div>
      <div class="stage-center"></div>
      <div class="stage-row"></div>
      <div class="stage-hint" aria-live="polite"></div>
      <div class="stage-banner"></div>
      <div class="letterbox top"></div><div class="letterbox bottom"></div>
      <div class="stage-title"></div>
      <button class="skip" type="button">スキップ ▶▶</button>`;
    d.stage.hidden = false;
    d.stage.className = "stage";
    this.center = $(d.stage, ".stage-center");
    this.row = $(d.stage, ".stage-row");
    this.hint = $(d.stage, ".stage-hint");
    this.bannerEl = $(d.stage, ".stage-banner");
    this.skipBtn = $(d.stage, ".skip");
    d.fx.setBackCanvas($<HTMLCanvasElement>(d.stage, ".fx-back"));
    this.skipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.skipping = true;
      this.releaseTaps();
    });
    d.stage.addEventListener("pointerdown", this.onTap);
    addEventListener("keydown", this.onKey);
  }

  get skipped(): boolean {
    return this.skipping;
  }

  private onTap = (e: Event): void => {
    if ((e.target as HTMLElement).closest("button")) return;
    this.releaseTaps();
  };
  private onKey = (e: KeyboardEvent): void => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      this.releaseTaps();
    }
    if (e.key === "Escape") {
      this.skipping = true;
      this.releaseTaps();
    }
  };
  private releaseTaps(): void {
    const rs = this.tapResolvers;
    this.tapResolvers = [];
    rs.forEach((r) => r());
  }

  tap(hint = "タップで進む"): Promise<void> {
    if (this.skipping) return Promise.resolve();
    this.hint.textContent = hint;
    this.hint.classList.add("show");
    return new Promise((res) =>
      this.tapResolvers.push(() => {
        this.hint.classList.remove("show");
        res();
      }),
    );
  }

  sleep(ms: number): Promise<void> {
    if (this.skipping) return Promise.resolve();
    // 演出の待ち時間はタップでは縮めない(タップは「次へ進む」の合図に使う)
    return new Promise((res) => setTimeout(res, ms));
  }

  setTell(tier: Tier, god = false): void {
    const [a, b] = tellColors(tier, god);
    this.d.stage.style.setProperty("--tell", a ?? "#fff");
    this.d.stage.style.setProperty("--tell2", b ?? "#fff");
    this.d.stage.dataset.tell = god ? "god" : String(tier);
  }

  banner(text: string, cls = ""): void {
    if (this.skipping) return;
    const el = document.createElement("div");
    el.className = `banner ${cls}`;
    el.textContent = text;
    this.bannerEl.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  centerPoint(el?: Element): { x: number; y: number } {
    const r = (el ?? this.center).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  close(): void {
    removeEventListener("keydown", this.onKey);
    this.d.stage.removeEventListener("pointerdown", this.onTap);
    this.d.fx.clear();
    this.d.fx.setBackCanvas(null);
    this.d.stage.hidden = true;
    this.d.stage.innerHTML = "";
  }
}

// ---------------------------------------------------------------------------
// パック
// ---------------------------------------------------------------------------

function packEl(game: Game, god: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = `pack${god ? " god" : ""}`;
  const face = game.set.byRarity.UR[0] as CardDef;
  el.innerHTML = `
    <div class="pack-body">
      <div class="pack-art">${monsterSvg(face, true)}</div>
      <div class="pack-logo">PACK<br>MONGER</div>
      <div class="pack-set">${game.set.name}</div>
      <div class="pack-count">5 CARDS</div>
      <div class="pack-foil"></div>
    </div>
    <div class="pack-top"><div class="crimp"></div></div>
    <div class="cut"><div class="cut-glow"></div></div>
    <div class="leak"></div>`;
  return el;
}

/** 封をなぞって切る。指を横に動かした量で進む。ボタンでも開けられる */
async function tear(dir: Director, pack: HTMLElement): Promise<void> {
  if (dir.skipped) return;
  let progress = 0;
  let lastX: number | null = null;
  let lastTick = 0;
  dir.hint.innerHTML = `封を <b>なぞって</b> 切る ⟶`;
  dir.hint.classList.add("show");
  const guide = document.createElement("div");
  guide.className = "tear-guide";
  pack.appendChild(guide);
  const autoBtn = document.createElement("button");
  autoBtn.type = "button";
  autoBtn.className = "auto-tear";
  autoBtn.textContent = "タップで開ける";
  dir.d.stage.appendChild(autoBtn);

  await new Promise<void>((done) => {
    const set = (p: number) => {
      progress = Math.min(1, p);
      pack.style.setProperty("--p", progress.toFixed(3));
      if (progress - lastTick >= 0.08) {
        lastTick = progress;
        sfx.tearTick(progress);
      }
      if (progress >= 0.85) finish();
    };
    const down = (e: PointerEvent) => {
      lastX = e.clientX;
      pack.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (lastX === null) return;
      const w = pack.getBoundingClientRect().width;
      set(progress + (Math.abs(e.clientX - lastX) / w) * 1.1);
      lastX = e.clientX;
    };
    const up = () => (lastX = null);
    const auto = async (e: Event) => {
      e.stopPropagation();
      autoBtn.disabled = true;
      for (let p = progress; p < 0.86; p += 0.06) {
        set(p);
        await wait(28);
      }
      set(1);
    };
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      pack.removeEventListener("pointerdown", down);
      pack.removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      autoBtn.remove();
      guide.remove();
      dir.hint.classList.remove("show");
      done();
    };
    pack.addEventListener("pointerdown", down);
    pack.addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    autoBtn.addEventListener("click", auto);
    const skipWatch = setInterval(() => {
      if (dir.skipped) {
        clearInterval(skipWatch);
        finish();
      }
    }, 100);
  });
}

async function burstOpen(dir: Director, pack: HTMLElement, tier: Tier, god: boolean): Promise<void> {
  const { fx } = dir.d;
  pack.style.setProperty("--p", "1");
  pack.classList.add("torn");
  sfx.tearOpen();
  const top = pack.getBoundingClientRect();
  const x = top.left + top.width / 2;
  const y = top.top + top.height * 0.08;
  const cols = tellColors(tier, god);
  fx.ring(x, y, cols[0] ?? "#fff", { speed: 18, width: 8 });
  fx.burst(x, y, { count: 60 + tier * 60, colors: cols, speed: 10 + tier * 2, gravity: 0.05 });
  flash(dir.d.flashEl, cols[0] ?? "#fff", 300 + tier * 120);
  if (tier >= 2 || god) {
    fx.godRays(x, y, cols, { life: 120 + tier * 40, count: 10 + tier * 2 });
    shake(dir.d.shakeEl, tier >= 3 ? "l" : "m");
  }
  if (god) {
    sfx.promote();
    dir.banner("GOD PACK!!", "god");
    fx.confettiRain(220);
    await dir.sleep(1600);
  }
  await dir.sleep(700);
  pack.classList.add("leave");
  sfx.whoosh();
  await dir.sleep(450);
  pack.remove();
}

// ---------------------------------------------------------------------------
// めくる
// ---------------------------------------------------------------------------

function cardOf(game: Game, p: PulledCard): CardDef {
  return game.set.byId.get(p.cardId) as CardDef;
}

function badgeLine(game: Game, p: PulledCard, isNew: boolean): string {
  const card = cardOf(game, p);
  const own = game.s.col.cards[card.id];
  const n = copies(game.s.col, card.id);
  const star = own?.star ?? 1;
  let starText = "★3 最大";
  if (star < 3) {
    const need = STAR_COST[(star + 1) as 2 | 3] + 1;
    starText = n >= need ? `★${star + 1} にできる!` : `★${star + 1} まで ${n}/${need}`;
  }
  const price = marketValue(card, p.finish, game.set.packPrice, game.s.market);
  return `${isNew ? `<span class="tag-new">NEW</span>` : ""}<span class="tag-star">${starText}</span><span class="tag-price">${price}G</span>`;
}

async function revealEffect(dir: Director, el: HTMLElement, tier: Tier, p: PulledCard, isNew: boolean): Promise<void> {
  const { fx } = dir.d;
  const { x, y } = dir.centerPoint(el);
  const cols = tellColors(tier);
  if (dir.skipped) return;
  switch (tier) {
    case 0:
      sfx.flip();
      fx.burst(x, y, { count: 14, colors: ["#ffffff", "#cfd8ff"], speed: 5, kind: "glitter", gravity: 0.02, size: 2 });
      break;
    case 1:
      sfx.reveal(1);
      fx.ring(x, y, cols[0] ?? "#4aa8ff", { speed: 12 });
      fx.burst(x, y, { count: 60, colors: cols, speed: 8 });
      break;
    case 2:
      sfx.reveal(2);
      flash(dir.d.flashEl, cols[0] ?? "#b05cff", 450);
      fx.ring(x, y, cols[0] ?? "#fff", { speed: 16, width: 10 });
      setTimeout(() => fx.ring(x, y, cols[1] ?? "#fff", { speed: 11, width: 6 }), 120);
      fx.burst(x, y, { count: 180, colors: cols, speed: 13 });
      fx.burst(x, y, { count: 50, colors: ["#fff", ...cols], speed: 6, kind: "glitter", gravity: 0.01 });
      shake(dir.d.shakeEl, "m");
      dir.banner("SR", "t2");
      break;
    case 3:
      sfx.reveal(3);
      flash(dir.d.flashEl, "#fffbe6", 700);
      fx.godRays(x, y, ["#ffd23d", "#fff2a8", "#ff9d2e"], { life: 320, count: 18 });
      fx.ring(x, y, "#ffe27a", { speed: 20, width: 12, life: 55 });
      setTimeout(() => fx.ring(x, y, "#fff", { speed: 14, width: 6 }), 150);
      fx.burst(x, y, { count: 320, colors: ["#ffd23d", "#fff2a8", "#ffffff", "#ff9d2e"], speed: 16 });
      fx.burst(x, y, { count: 120, colors: ["#fff2a8", "#ffffff"], speed: 7, kind: "glitter", gravity: 0.01, size: 3 });
      fx.confettiRain(180, ["#ffd23d", "#fff2a8", "#ff9d2e", "#ffffff", "#ff6b6b"]);
      fx.emit(2600, () => {
        if (Math.random() < 0.5)
          fx.burst(x + (Math.random() - 0.5) * 260, y + (Math.random() - 0.5) * 340, {
            count: 2,
            colors: ["#fff2a8", "#ffffff"],
            kind: "glitter",
            speed: 1,
            gravity: 0,
            size: 3,
            life: 60,
          });
      });
      shake(dir.d.shakeEl, "l");
      dir.banner("SSR", "t3");
      break;
    case 4:
      break; // 専用演出
  }
  // 仕上げ
  if (p.finish === "holo") {
    setTimeout(() => sfx.sparkle(), 250);
    fx.burst(x, y, { count: 50, colors: fx.rainbow, speed: 6, kind: "glitter", gravity: 0.01 });
  } else if (p.finish === "full") {
    setTimeout(() => sfx.sparkle(), 250);
    setTimeout(() => dir.banner("FULL ART", "finish"), 500);
  } else if (p.finish === "gold") {
    setTimeout(() => {
      sfx.reveal(3);
      flash(dir.d.flashEl, "#ffd23d", 600);
      dir.banner("GOLD!!", "gold");
      fx.emit(4000, () =>
        fx.burst(x + (Math.random() - 0.5) * 300, y + (Math.random() - 0.5) * 380, {
          count: 3,
          colors: ["#ffd23d", "#fff2a8"],
          kind: "glitter",
          speed: 1.5,
          gravity: 0.02,
          size: 3.5,
          life: 70,
        }),
      );
    }, 700);
  }
  if (isNew) {
    const tag = document.createElement("div");
    tag.className = "new-pop";
    tag.textContent = "NEW!";
    el.appendChild(tag);
  }
}

/** UR の専用演出(10〜20秒)。スキップできる */
async function urCinematic(dir: Director, el: HTMLElement, card: CardDef, p: PulledCard, isNew: boolean): Promise<void> {
  const { fx, stage } = dir.d;
  stage.classList.add("cinema");
  const black = $(stage, ".blackout");
  black.classList.add("on");
  el.classList.add("hidden-for-cinema");
  await dir.sleep(700);

  const sigil = document.createElement("div");
  sigil.className = "sigil";
  sigil.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="92" class="s1"/><circle cx="100" cy="100" r="70" class="s2"/><circle cx="100" cy="100" r="44" class="s3"/>
    <path d="M100 8 L180 146 L20 146Z" class="s2"/><path d="M100 192 L20 54 L180 54Z" class="s2"/>
    <text x="100" y="108" text-anchor="middle" class="rune">封</text>
    <g class="cracks"></g></svg>`;
  stage.appendChild(sigil);
  const title = $(stage, ".stage-title");
  title.className = "stage-title whisper";
  title.textContent = "……封印が、解ける";
  sfx.riser(3.2);
  await dir.sleep(1600);

  const cracks = sigil.querySelector(".cracks") as SVGGElement;
  const crackPaths = [
    "M100 100 L72 60 L60 22",
    "M100 100 L140 84 L176 70 L190 92",
    "M100 100 L112 146 L96 182",
    "M100 100 L58 118 L18 132",
  ];
  for (const d of crackPaths) {
    if (dir.skipped) break;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    cracks.appendChild(path);
    sfx.crack();
    shake(dir.d.shakeEl, "s");
    flash(dir.d.flashEl, "#ffffff", 160);
    const c = dir.centerPoint(sigil);
    fx.burst(c.x, c.y, { count: 40, colors: fx.rainbow, speed: 9 });
    await dir.sleep(650);
  }

  sfx.shatter();
  flash(dir.d.flashEl, "#ffffff", 1100);
  shake(dir.d.shakeEl, "l");
  const c = dir.centerPoint(sigil);
  sigil.classList.add("shatter");
  fx.ring(c.x, c.y, "#ffffff", { speed: 26, width: 16, life: 60 });
  setTimeout(() => fx.ring(c.x, c.y, "#ff4fd8", { speed: 18, width: 10, life: 60 }), 120);
  setTimeout(() => fx.ring(c.x, c.y, "#4ffff0", { speed: 12, width: 8, life: 60 }), 240);
  fx.burst(c.x, c.y, { count: 500, colors: fx.rainbow, speed: 22, gravity: 0.06 });
  title.textContent = "";
  await dir.sleep(900);
  sigil.remove();
  black.classList.remove("on");
  black.classList.add("rainbow");

  el.classList.remove("hidden-for-cinema");
  el.classList.add("ur-descend", "flipped");
  const pt = dir.centerPoint(el);
  fx.godRays(pt.x, pt.y, fx.rainbow, { life: 700, count: 24 });
  fx.confettiRain(360);
  fx.emit(7000, () => {
    if (Math.random() < 0.7)
      fx.burst(pt.x + (Math.random() - 0.5) * innerWidth * 0.8, pt.y + (Math.random() - 0.5) * innerHeight * 0.8, {
        count: 2,
        colors: fx.rainbow,
        kind: "glitter",
        speed: 1,
        gravity: 0,
        size: 3.5,
        life: 80,
      });
  });
  sfx.fanfare();
  await dir.sleep(900);
  dir.banner("UR", "t4");
  title.className = "stage-title ur-name";
  title.innerHTML = `<small>ULTRA RARE</small>${card.name}`;
  await revealEffect(dir, el, 4, p, isNew);
  await dir.sleep(1800);
  await dir.tap("タップで進む");
  title.className = "stage-title";
  title.textContent = "";
  black.classList.remove("rainbow");
  stage.classList.remove("cinema");
}

async function revealOne(
  dir: Director,
  p: PulledCard,
  tier: Tier,
  isNew: boolean,
  opts: { isLast: boolean; promotion: boolean; tellNow: Tier; maxTier: Tier; quick: boolean },
): Promise<HTMLElement> {
  const { game, fx } = dir.d;
  const card = cardOf(game, p);
  const el = cardEl(card, { finish: p.finish, faceDown: true, tilt: true, star: game.s.col.cards[card.id]?.star ?? 1 });
  el.classList.add("focus", "enter");
  if (opts.isLast && opts.tellNow > 0) el.classList.add(`glow-${opts.tellNow}`);
  dir.center.appendChild(el);
  await dir.sleep(opts.quick ? 60 : 220);

  if (tier >= 2 && !dir.skipped) {
    // 溜め
    const stage = dir.d.stage;
    stage.classList.add("dim");
    el.classList.add("tremble");
    const { x, y } = dir.centerPoint(el);
    sfx.heartbeat();
    fx.implode(x, y, 70, tellColors(opts.tellNow)[0] ?? "#fff");
    await dir.sleep(900);
    sfx.heartbeat();
    if (opts.isLast && opts.promotion) {
      await dir.sleep(500);
      // 昇格: 光の色が1段上がる
      sfx.promote();
      dir.setTell(opts.maxTier);
      el.classList.remove(`glow-${opts.tellNow}`);
      el.classList.add(`glow-${opts.maxTier}`, "promote");
      flash(dir.d.flashEl, tellColors(opts.maxTier)[0] ?? "#fff", 500);
      fx.ring(x, y, tellColors(opts.maxTier)[0] ?? "#fff", { speed: 22, width: 14 });
      fx.burst(x, y, { count: 160, colors: tellColors(opts.maxTier), speed: 14 });
      shake(dir.d.shakeEl, "m");
      dir.banner("!!", "promote");
      await dir.sleep(900);
    }
    sfx.riser(1.1);
    await dir.tap("タップでめくる");
    el.classList.remove("tremble");
    stage.classList.remove("dim");
  } else if (!opts.quick) {
    await dir.tap(tier === 1 ? "タップでめくる…!" : "タップでめくる");
  }

  if (tier === 4 && !dir.skipped) {
    await urCinematic(dir, el, card, p, isNew);
  } else {
    el.classList.add("flipped");
    await revealEffect(dir, el, tier, p, isNew);
    await dir.sleep(opts.quick ? 80 : tier >= 3 ? 1700 : tier === 2 ? 1100 : tier === 1 ? 520 : 320);
    if (tier >= 2) await dir.tap("タップで次へ");
  }
  if (dir.skipped) {
    el.classList.add("flipped");
    if (isNew && !el.querySelector(".new-pop")) {
      const tag = document.createElement("div");
      tag.className = "new-pop";
      tag.textContent = "NEW!";
      el.appendChild(tag);
    }
  }
  return el;
}

/** めくり終えたカードを下の列に送る */
function sendToRow(dir: Director, el: HTMLElement): void {
  el.classList.remove("focus", "enter", "tremble", "promote", "ur-descend");
  el.classList.add("mini", "landed");
  dir.row.appendChild(el);
}

// ---------------------------------------------------------------------------
// 結果
// ---------------------------------------------------------------------------

async function summary(
  dir: Director,
  pulled: PulledCard[],
  newIds: Set<string>,
  label: string,
  allowAgain: boolean,
): Promise<NextAction> {
  const { game } = dir.d;
  dir.skipBtn.remove();
  dir.center.innerHTML = "";
  dir.row.innerHTML = "";
  dir.d.stage.classList.add("summary-mode");
  const total = pulled.reduce((s, p) => s + marketValue(cardOf(game, p), p.finish, game.set.packPrice, game.s.market), 0);
  const best = pulled.reduce((b, p) => Math.max(b, TIER_OF[p.rarity]), 0);
  const wrap = document.createElement("div");
  wrap.className = `summary ${pulled.length > 5 ? "many" : ""}`;
  wrap.innerHTML = `
    <h2>${label}</h2>
    <div class="sum-stats"><span>NEW ${[...new Set(pulled.filter((p) => newIds.has(p.cardId)).map((p) => p.cardId))].length}種</span>
      <span>SR以上 ${pulled.filter((p) => TIER_OF[p.rarity] >= 2).length}枚</span><span>相場の合計 <b>${total.toLocaleString()}G</b></span></div>
    <div class="sum-grid"></div>
    <div class="sum-actions">
      ${allowAgain ? `<button class="btn primary" data-a="again" ${game.canBuy(1) ? "" : "disabled"}>もう1パック <small>100G</small></button>
      <button class="btn gold" data-a="box" ${game.canBuy(10) ? "" : "disabled"}>10パック <small>1,000G</small></button>` : ""}
      <button class="btn" data-a="close">${allowAgain ? "閉じる" : "次へ"}</button>
    </div>`;
  const grid = $(wrap, ".sum-grid");
  const sorted = pulled.length > 5 ? [...pulled].sort((a, b) => TIER_OF[b.rarity] - TIER_OF[a.rarity]) : pulled;
  const seenNew = new Set<string>();
  sorted.forEach((p, i) => {
    const card = cardOf(game, p);
    const cell = document.createElement("div");
    cell.className = "sum-cell";
    const isNew = newIds.has(p.cardId) && !seenNew.has(p.cardId);
    if (isNew) seenNew.add(p.cardId);
    const el = cardEl(card, { finish: p.finish, tilt: true, star: game.s.col.cards[card.id]?.star ?? 1 });
    el.classList.add("mini");
    if (TIER_OF[p.rarity] >= 3) el.classList.add("best");
    cell.style.animationDelay = `${Math.min(i, 30) * 35}ms`;
    cell.appendChild(el);
    const tags = document.createElement("div");
    tags.className = "tags";
    tags.innerHTML = badgeLine(game, p, isNew) + (p.finish !== "normal" ? `<span class="tag-finish">${FINISH_LABEL[p.finish]}</span>` : "");
    cell.appendChild(tags);
    grid.appendChild(cell);
  });
  dir.center.appendChild(wrap);
  if (best >= 3) dir.d.fx.confettiRain(80, ["#ffd23d", "#fff2a8", "#ffffff"]);
  sfx.coin();
  return new Promise((res) => {
    wrap.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        res(b.dataset.a as NextAction);
      }),
    );
  });
}

// ---------------------------------------------------------------------------
// 1パック
// ---------------------------------------------------------------------------

export async function playSingle(
  deps: Deps,
  result: PackResult,
  newIds: Set<string>,
  opts: { label?: string; allowAgain?: boolean } = {},
): Promise<NextAction> {
  const dir = new Director(deps);
  try {
    const plan = planReveal(result, deps.game.rng);
    dir.setTell(0);
    const pack = packEl(deps.game, false);
    pack.classList.add("enter");
    dir.center.appendChild(pack);
    sfx.whoosh();
    if (opts.label) dir.banner(opts.label, "label");
    await dir.sleep(500);
    pack.style.setProperty("--leak", tellColors(plan.initialTell, plan.god)[0] ?? "#fff");
    pack.style.setProperty("--leak2", tellColors(plan.initialTell, plan.god)[1] ?? "#fff");
    if (plan.god) pack.classList.add("god-leak");
    await tear(dir, pack);
    dir.setTell(plan.initialTell, plan.god);
    await burstOpen(dir, pack, plan.initialTell, plan.god);

    let tellNow = plan.initialTell;
    const shownNew = new Set<string>();
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]!;
      const p = result.cards[step.index]!;
      const isNew = newIds.has(p.cardId) && !shownNew.has(p.cardId);
      if (isNew) shownNew.add(p.cardId);
      const isLast = i === plan.steps.length - 1;
      const el = await revealOne(dir, p, step.tier, isNew, {
        isLast,
        promotion: plan.promotion,
        tellNow,
        maxTier: plan.maxTier,
        quick: dir.skipped,
      });
      if (isLast && plan.promotion) tellNow = plan.maxTier;
      sendToRow(dir, el);
    }
    await dir.sleep(400);
    return await summary(dir, result.cards, newIds, opts.label ?? "開封結果", opts.allowAgain ?? true);
  } finally {
    dir.close();
  }
}

// ---------------------------------------------------------------------------
// まとめて10パック
// ---------------------------------------------------------------------------

export async function playBox(deps: Deps, results: PackResult[], newIds: Set<string>): Promise<NextAction> {
  const dir = new Director(deps);
  try {
    const { game, fx } = deps;
    const all = results.flatMap((r) => r.cards);
    const god = results.some((r) => r.god);
    const maxTier = Math.max(...all.map((c) => TIER_OF[c.rarity])) as Tier;
    const promotion = maxTier >= 2 && game.rng.next() < 0.25;
    const tell = (promotion ? maxTier - 1 : maxTier) as Tier;
    dir.setTell(0);

    const box = document.createElement("div");
    box.className = "box enter";
    box.innerHTML = `<div class="box-lid">PACK MONGER</div><div class="box-body"><span>BOOSTER BOX</span><b>×10</b></div>`;
    box.style.setProperty("--leak", tellColors(tell, god)[0] ?? "#fff");
    dir.center.appendChild(box);
    sfx.whoosh();
    await dir.sleep(400);
    await dir.tap("タップでボックスを開ける");
    box.classList.add("open");
    dir.setTell(tell, god);
    sfx.tearOpen();
    const b = dir.centerPoint(box);
    fx.ring(b.x, b.y, tellColors(tell, god)[0] ?? "#fff", { speed: 20, width: 10 });
    fx.burst(b.x, b.y, { count: 120 + tell * 80, colors: tellColors(tell, god), speed: 14 });
    if (tell >= 2 || god) fx.godRays(b.x, b.y, tellColors(tell, god), { life: 180 });
    flash(deps.flashEl, tellColors(tell, god)[0] ?? "#fff", 500);
    shake(deps.shakeEl, tell >= 3 ? "l" : "m");
    if (god) {
      dir.banner("GOD PACK!!", "god");
      fx.confettiRain(200);
    }
    await dir.sleep(1100);
    box.remove();

    // 50枚を裏向きで並べる
    const grid = $(deps.stage, ".stage-grid");
    grid.classList.add("show");
    const cells = all.map((p) => {
      const card = cardOf(game, p);
      const el = cardEl(card, { finish: p.finish, faceDown: true, star: game.s.col.cards[card.id]?.star ?? 1 });
      el.classList.add("micro");
      grid.appendChild(el);
      return el;
    });
    await dir.sleep(500);

    // C〜R は波のように一気にめくる
    const order = all.map((p, i) => ({ p, i, tier: TIER_OF[p.rarity] }));
    const low = order.filter((o) => o.tier < 2);
    let k = 0;
    for (const o of low) {
      const el = cells[o.i]!;
      el.classList.add("flipped");
      if (k % 3 === 0) sfx.flip();
      if (o.tier === 1) {
        const pt = dir.centerPoint(el);
        fx.burst(pt.x, pt.y, { count: 10, colors: tellColors(1), speed: 4 });
      }
      if (!dir.skipped && k++ % 2 === 0) await wait(REDUCED ? 5 : 22);
    }
    await dir.sleep(500);

    // SR 以上は1枚ずつ大きく見せる
    const high = order.filter((o) => o.tier >= 2).sort((a, b) => a.tier - b.tier);
    let tellNow = tell;
    const shownNew = new Set<string>();
    for (let j = 0; j < high.length; j++) {
      const o = high[j]!;
      const cell = cells[o.i]!;
      cell.classList.add("pick");
      const isLast = j === high.length - 1;
      const isNew = newIds.has(o.p.cardId) && !shownNew.has(o.p.cardId);
      if (isNew) shownNew.add(o.p.cardId);
      grid.classList.add("behind");
      const el = await revealOne(dir, o.p, o.tier as Tier, isNew, {
        isLast,
        promotion,
        tellNow: (isLast ? tellNow : o.tier) as Tier,
        maxTier,
        quick: dir.skipped,
      });
      if (isLast && promotion) tellNow = maxTier;
      el.remove();
      grid.classList.remove("behind");
      cell.classList.add("flipped", "hit");
    }
    await dir.sleep(600);
    grid.classList.remove("show");
    grid.innerHTML = "";
    return await summary(dir, all, newIds, "10パックの結果", true);
  } finally {
    dir.close();
  }
}
