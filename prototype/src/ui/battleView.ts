import type { BattleContext, BattleEvent, BattleResult, Side, UnitSnap } from "../core/battle.ts";
import { TRIBE_NAMES } from "../core/types.ts";
import type { CardDef, Tribe } from "../core/types.ts";
import { monsterSvg } from "./art.ts";
import { Fx, flash, shake, wait } from "./fx.ts";
import { sfx } from "./sound.ts";

/*
 * オートバトルの再生(提案書 6.1節)。戦闘エンジンが記録した出来事を順に描く。
 * 敵が上、味方が下。左端が先頭で、先頭どうしがぶつかる。
 */

const TRIBE_ICON: Record<Tribe, string> = { slime: "💧", beast: "🐾", dragon: "🔥", machine: "⚙", spirit: "👻", plant: "🌿" };

export interface BattleViewDeps {
  root: HTMLElement;
  fx: Fx;
  ctx: BattleContext;
  shakeEl: HTMLElement;
  flashEl: HTMLElement;
}

type Speed = 1 | 2 | 4;
let speed: Speed = 1;

function unitEl(u: UnitSnap, card: CardDef | undefined): HTMLElement {
  const el = document.createElement("div");
  el.className = `unit${u.cardId ? ` r-${card?.rarity ?? "C"}` : " token"}`;
  el.dataset.uid = String(u.uid);
  const art = card ? monsterSvg(card) : "";
  el.innerHTML = `
    <div class="u-art">${art || `<div class="u-token">${TRIBE_ICON[u.tribe]}</div>`}</div>
    <div class="u-name"></div>
    <div class="u-star"></div>
    <div class="u-shield" hidden>🛡<b></b></div>
    <div class="u-stats"><span class="u-atk">⚔<b></b></span><span class="u-hp">♥<b></b></span></div>
    <div class="u-bar"><i></i></div>`;
  (el.querySelector(".u-name") as HTMLElement).textContent = u.name;
  el.title = `${u.name}(${TRIBE_NAMES[u.tribe]})`;
  return el;
}

function setStats(el: HTMLElement, u: UnitSnap, prev?: UnitSnap): void {
  const atk = el.querySelector(".u-atk b") as HTMLElement;
  const hp = el.querySelector(".u-hp b") as HTMLElement;
  atk.textContent = String(u.atk);
  hp.textContent = String(Math.max(0, u.hp));
  (el.querySelector(".u-star") as HTMLElement).textContent = "★".repeat(u.star);
  const sh = el.querySelector(".u-shield") as HTMLElement;
  sh.hidden = u.shield <= 0;
  (sh.querySelector("b") as HTMLElement).textContent = String(u.shield);
  (el.querySelector(".u-bar i") as HTMLElement).style.width = `${Math.max(0, Math.min(1, u.hp / Math.max(1, u.maxHp))) * 100}%`;
  if (prev) {
    const pulse = (cls: string) => {
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    };
    if (u.atk > prev.atk) pulse("buff-atk");
    if (u.hp > prev.hp || u.maxHp > prev.maxHp) pulse("buff-hp");
    if (u.shield > prev.shield) pulse("buff-shield");
  }
}

function floatText(root: HTMLElement, target: HTMLElement, text: string, cls: string): void {
  const r = target.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  const t = document.createElement("div");
  t.className = `float ${cls}`;
  t.textContent = text;
  t.style.left = `${r.left - rr.left + r.width / 2}px`;
  t.style.top = `${r.top - rr.top + r.height * 0.3}px`;
  root.appendChild(t);
  setTimeout(() => t.remove(), 1100);
}

/** 戦闘を再生する。スキップされたら最後の状態まで一気に進める */
export async function playBattle(d: BattleViewDeps, result: BattleResult, labels: { enemy: string }): Promise<void> {
  const { root, fx, ctx } = d;
  root.innerHTML = `
    <div class="arena">
      <div class="arena-top"><span class="round">準備</span>
        <div class="speeds" role="group" aria-label="再生の速さ">
          <button data-speed="1">×1</button><button data-speed="2">×2</button><button data-speed="4">×4</button>
          <button class="skip-battle">結果へ ▶▶</button>
        </div>
      </div>
      <div class="side-label enemy">${labels.enemy}</div>
      <div class="line line-B"></div>
      <div class="clash" aria-hidden="true">VS</div>
      <div class="line line-A"></div>
      <div class="side-label ally">あなたの編成</div>
      <div class="ability-log" aria-live="polite"></div>
    </div>`;
  const lines: Record<Side, HTMLElement> = {
    A: root.querySelector(".line-A") as HTMLElement,
    B: root.querySelector(".line-B") as HTMLElement,
  };
  const roundEl = root.querySelector(".round") as HTMLElement;
  const log = root.querySelector(".ability-log") as HTMLElement;
  const els = new Map<number, HTMLElement>();
  const last = new Map<number, UnitSnap>();
  let skipped = false;

  const markSpeed = () =>
    root.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((b) => b.classList.toggle("on", Number(b.dataset.speed) === speed));
  root.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((b) =>
    b.addEventListener("click", () => {
      speed = Number(b.dataset.speed) as Speed;
      markSpeed();
    }),
  );
  markSpeed();
  (root.querySelector(".skip-battle") as HTMLElement).addEventListener("click", () => (skipped = true));
  const pause = (ms: number) => (skipped ? Promise.resolve() : wait(ms / speed));
  const center = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const render = (A: UnitSnap[], B: UnitSnap[]) => {
    for (const [side, units] of [["A", A], ["B", B]] as const) {
      const line = lines[side];
      units.forEach((u, i) => {
        let el = els.get(u.uid);
        if (!el) {
          el = unitEl(u, u.cardId ? ctx.cards.get(u.cardId) : undefined);
          el.classList.add("appear");
          els.set(u.uid, el);
          if (last.size > 0 && !skipped) sfx.summon();
        }
        if (line.children[i] !== el) line.insertBefore(el, line.children[i] ?? null);
        el.classList.toggle("front", i === 0);
        setStats(el, u, last.get(u.uid));
        last.set(u.uid, u);
      });
      const alive = new Set(units.map((u) => u.uid));
      for (const child of [...line.children] as HTMLElement[]) {
        if (!alive.has(Number(child.dataset.uid)) && !child.classList.contains("dying")) child.remove();
      }
    }
  };

  const say = (text: string, side: Side) => {
    const p = document.createElement("p");
    p.className = `log-${side}`;
    p.textContent = text;
    log.prepend(p);
    while (log.children.length > 4) log.lastElementChild?.remove();
  };

  const finalState = [...result.events].reverse().find((e) => e.t === "state") as Extract<BattleEvent, { t: "state" }> | undefined;

  for (const e of result.events) {
    if (skipped) break;
    switch (e.t) {
      case "state":
        render(e.A, e.B);
        await pause(70);
        break;
      case "round":
        roundEl.textContent = `ラウンド ${e.n}`;
        await pause(160);
        break;
      case "ability": {
        const el = els.get(e.uid);
        say(`${e.name}: ${e.text}`, e.side);
        if (el) {
          el.classList.remove("casting");
          void el.offsetWidth;
          el.classList.add("casting");
          const p = center(el);
          fx.burst(p.x, p.y, { count: 18, colors: e.side === "A" ? ["#7affb0", "#ffffff"] : ["#ff8a7a", "#ffffff"], speed: 4, kind: "glitter", gravity: 0, size: 2, life: 40 });
        }
        if (/盾/.test(e.text)) sfx.shield();
        else if (/回復/.test(e.text)) sfx.heal();
        else sfx.ability();
        await pause(520);
        break;
      }
      case "attack": {
        const a = els.get(e.a);
        const b = els.get(e.b);
        a?.classList.remove("lunge-up");
        b?.classList.remove("lunge-down");
        void a?.offsetWidth;
        a?.classList.add("lunge-up");
        b?.classList.add("lunge-down");
        await pause(180);
        const big = Math.max(e.dmgToA, e.dmgToB);
        sfx.hit(big >= 6 ? 3 : big >= 4 ? 2 : 1);
        if (a && b) {
          const pa = center(a);
          const pb = center(b);
          const mx = (pa.x + pb.x) / 2;
          const my = (pa.y + pb.y) / 2;
          fx.burst(mx, my, { count: 20 + big * 6, colors: ["#fff4c2", "#ffb03d", "#ffffff"], speed: 6 + big, gravity: 0.15 });
          fx.ring(mx, my, "#ffffff", { speed: 8, width: 4, life: 22 });
        }
        if (big >= 6) shake(d.shakeEl, "s");
        await pause(260);
        break;
      }
      case "damage": {
        const el = els.get(e.uid);
        if (el) {
          const real = e.amount - e.absorbed;
          if (e.absorbed > 0) floatText(root, el, `🛡${e.absorbed}`, "blocked");
          if (real > 0) floatText(root, el, `-${real}`, real >= 6 ? "dmg big" : "dmg");
          el.classList.remove("hurt");
          void el.offsetWidth;
          el.classList.add("hurt");
        }
        break;
      }
      case "faint": {
        const el = els.get(e.uid);
        if (el) {
          el.classList.add("dying");
          const p = center(el);
          fx.burst(p.x, p.y, { count: 30, colors: ["#8a82b5", "#ffffff", "#c9c3e6"], speed: 5, gravity: 0.2 });
          setTimeout(() => el.remove(), 420);
        }
        sfx.faint();
        say(`${e.name} が倒れた`, e.side);
        await pause(380);
        break;
      }
      case "summon":
        say(`${e.name} が現れた`, e.side);
        break;
    }
  }
  if (skipped && finalState) {
    for (const el of els.values()) el.classList.remove("dying");
    lines.A.innerHTML = "";
    lines.B.innerHTML = "";
    els.clear();
    last.clear();
    render(finalState.A, finalState.B);
  }
  await wait(250);

  // 勝敗
  const banner = document.createElement("div");
  banner.className = `battle-end ${result.outcome}`;
  banner.textContent = result.outcome === "win" ? "WIN!" : result.outcome === "lose" ? "全滅…" : "DRAW";
  root.querySelector(".arena")?.appendChild(banner);
  const c = center(banner);
  if (result.outcome === "win") {
    sfx.win();
    flash(d.flashEl, "#fff2a8", 400);
    fx.burst(c.x, c.y, { count: 160, colors: ["#ffd23d", "#fff2a8", "#ffffff", "#7affb0"], speed: 12 });
    fx.confettiRain(60, ["#ffd23d", "#fff2a8", "#7affb0", "#ffffff"]);
  } else if (result.outcome === "lose") {
    sfx.lose();
    shake(d.shakeEl, "m");
  } else {
    sfx.step();
  }
  await wait(900);
}
