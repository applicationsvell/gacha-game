import {
  campChoice,
  currentOptions,
  isOver,
  NODE_LABEL,
  resolveNode,
  startExpedition,
} from "../core/expedition.ts";
import type { Expedition, MapNode, NodeKind, RegionDef } from "../core/expedition.ts";
import type { Team } from "../core/battle.ts";
import { copies } from "../core/collection.ts";
import { scale } from "../core/cards.ts";
import { SYNERGY_BONUS } from "../core/battle.ts";
import { TIER_OF } from "../core/presentation.ts";
import type { PulledCard } from "../core/gacha.ts";
import { TRIBE_NAMES } from "../core/types.ts";
import type { CardDef, Star, Tribe } from "../core/types.ts";
import { BATTLE_CONTEXT } from "../data/index.ts";
import { REGIONS } from "../data/regions.ts";
import type { Game } from "./state.ts";
import { cardEl } from "./cardView.ts";
import { monsterSvg } from "./art.ts";
import { playBattle } from "./battleView.ts";
import { Fx, flash, TIER_COLORS, wait } from "./fx.ts";
import { sfx } from "./sound.ts";

/*
 * 遠征の画面(提案書 3.1節の「昼」と 5.1節)。
 * 準備(地域と編成) → 地図で道を選ぶ → 戦闘・宝・出来事 → 野営地(帰る/奥へ) → 精算
 */

export interface ExpDeps {
  game: Game;
  fx: Fx;
  root: HTMLElement;
  shakeEl: HTMLElement;
  flashEl: HTMLElement;
}

const NODE_ICON: Record<NodeKind, string> = { battle: "⚔", elite: "💀", treasure: "💰", event: "❓", camp: "🔥", boss: "👑" };
const TRIBE_ICON: Record<Tribe, string> = { slime: "💧", beast: "🐾", dragon: "🔥", machine: "⚙", spirit: "👻", plant: "🌿" };
const RARITY_ORDER = ["C", "U", "R", "SR", "SSR", "UR"];

const card = (id: string) => BATTLE_CONTEXT.cards.get(id) as CardDef;

function starOf(game: Game, id: string): Star {
  return game.s.col.cards[id]?.star ?? 1;
}

/** 編成の強さの目安(攻撃+体力、★込み) */
function power(slots: readonly { cardId: string; star: Star }[]): number {
  return slots.reduce((s, x) => {
    const c = card(x.cardId);
    return s + scale(c.atk, x.star) + scale(c.hp, x.star);
  }, 0);
}

function teamOf(game: Game, ids: string[]): Team {
  return { slots: ids.map((id) => ({ cardId: id, star: starOf(game, id) })), relicIds: [] };
}

function owned(game: Game): CardDef[] {
  return [...BATTLE_CONTEXT.cards.values()]
    .filter((c) => copies(game.s.col, c.id) > 0)
    .sort(
      (a, b) =>
        RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) ||
        scale(b.atk + b.hp, starOf(game, b.id)) - scale(a.atk + a.hp, starOf(game, a.id)),
    );
}

/** おまかせ編成: 強い5体を選び、体力の多い順に前へ */
function autoTeam(game: Game): string[] {
  const best = owned(game)
    .map((c) => ({ c, p: scale(c.atk, starOf(game, c.id)) * 1.2 + scale(c.hp, starOf(game, c.id)) + RARITY_ORDER.indexOf(c.rarity) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 5);
  return best.sort((a, b) => scale(b.c.hp, starOf(game, b.c.id)) - scale(a.c.hp, starOf(game, a.c.id))).map((x) => x.c.id);
}

function synergyChips(ids: string[]): string {
  const count = new Map<Tribe, number>();
  for (const id of ids) count.set(card(id).tribe, (count.get(card(id).tribe) ?? 0) + 1);
  const chips = [...count.entries()]
    .filter(([, n]) => n >= 2)
    .map(([t, n]) => {
      const b = SYNERGY_BONUS[Math.min(n, 5)] ?? 0;
      return `<span class="chip on">${TRIBE_ICON[t]} ${TRIBE_NAMES[t]}×${n} <b>+${b}/+${b}</b></span>`;
    });
  return chips.length ? chips.join("") : `<span class="chip">同じ種族を2体以上入れると連携ボーナス</span>`;
}

// ---------------------------------------------------------------------------
// 編成の部品(準備画面と野営地で使う)
// ---------------------------------------------------------------------------

function teamEditor(host: HTMLElement, game: Game, ids: string[], onChange: () => void): void {
  const draw = () => {
    host.innerHTML = `
      <div class="team-slots"></div>
      <div class="synergy">${synergyChips(ids)}</div>
      <div class="team-tools"><span class="power">強さの目安 <b>${power(ids.map((id) => ({ cardId: id, star: starOf(game, id) })))}</b></span>
        <button class="btn tiny" data-t="auto">おまかせ編成</button><button class="btn tiny" data-t="clear">外す</button></div>
      <p class="hint-line">下の手持ちをタップして入れる。編成のカードをタップすると外れ、◀ で前に出る。左が先頭。</p>
      <div class="pool"></div>`;
    const slots = host.querySelector(".team-slots") as HTMLElement;
    for (let i = 0; i < 5; i++) {
      const id = ids[i];
      const slot = document.createElement("div");
      slot.className = "team-slot";
      if (id) {
        const el = cardEl(card(id), { star: starOf(game, id) });
        el.classList.add("mini");
        el.addEventListener("click", () => {
          ids.splice(i, 1);
          sfx.step();
          changed();
        });
        slot.appendChild(el);
        if (i > 0) {
          const left = document.createElement("button");
          left.className = "move-left";
          left.textContent = "◀";
          left.setAttribute("aria-label", `${card(id).name}を前へ`);
          left.addEventListener("click", (e) => {
            e.stopPropagation();
            [ids[i - 1], ids[i]] = [ids[i] as string, ids[i - 1] as string];
            sfx.step();
            changed();
          });
          slot.appendChild(left);
        }
        if (i === 0) slot.insertAdjacentHTML("beforeend", `<span class="front-tag">先頭</span>`);
      } else {
        slot.innerHTML = `<div class="empty-slot">${i + 1}</div>`;
      }
      slots.appendChild(slot);
    }
    const pool = host.querySelector(".pool") as HTMLElement;
    for (const c of owned(game)) {
      const el = cardEl(c, { star: starOf(game, c.id) });
      el.classList.add("mini");
      if (ids.includes(c.id)) el.classList.add("picked");
      el.addEventListener("click", () => {
        if (ids.includes(c.id)) ids.splice(ids.indexOf(c.id), 1);
        else if (ids.length < 5) ids.push(c.id);
        else return sfx.error();
        sfx.step();
        changed();
      });
      pool.appendChild(el);
    }
    host.querySelectorAll<HTMLButtonElement>("[data-t]").forEach((b) =>
      b.addEventListener("click", () => {
        const next = b.dataset.t === "auto" ? autoTeam(game) : [];
        ids.splice(0, ids.length, ...next);
        sfx.step();
        changed();
      }),
    );
  };
  const changed = () => {
    game.setTeam(ids);
    draw();
    onChange();
  };
  draw();
}

// ---------------------------------------------------------------------------
// 準備
// ---------------------------------------------------------------------------

function prepare(d: ExpDeps): Promise<{ region: RegionDef; ids: string[] } | null> {
  const { game, root } = d;
  const ids = game.s.team.filter((id) => copies(game.s.col, id) > 0);
  if (ids.length === 0) ids.push(...autoTeam(game));
  let region = REGIONS.find((r) => !r.requires || game.s.cleared.includes(r.requires)) as RegionDef;
  root.innerHTML = `
    <div class="exp-screen">
      <header class="exp-head"><h2>遠征の準備</h2><button class="btn ghost" data-x="close">町に戻る</button></header>
      <section><h3>行き先</h3><div class="regions"></div></section>
      <section><h3>編成 <small>最大5体</small></h3><div class="editor"></div></section>
      <footer class="exp-foot"><button class="btn primary big" data-x="go">出発する ▶</button></footer>
    </div>`;
  const drawRegions = () => {
    const box = root.querySelector(".regions") as HTMLElement;
    box.innerHTML = "";
    for (const r of REGIONS) {
      const locked = !!r.requires && !game.s.cleared.includes(r.requires);
      const b = document.createElement("button");
      b.className = `region${r === region ? " on" : ""}`;
      b.disabled = locked;
      const boss = card(r.bossCardId);
      b.innerHTML = `<div class="region-art">${monsterSvg(boss)}</div>
        <div class="region-text"><b>${r.name}</b>
        <span>${r.tribes.map((t) => `${TRIBE_ICON[t]}${TRIBE_NAMES[t]}`).join(" ")}</span>
        <span>難しさ ${"★".repeat(r.level + 1)}${"☆".repeat(2 - r.level)} ・ ボス ${boss.name}</span>
        <span class="region-state">${locked ? `🔒 ${REGIONS.find((x) => x.id === r.requires)?.name}のボスを倒すと開く` : game.s.cleared.includes(r.id) ? "✓ クリア済み" : "未踏"}</span></div>`;
      b.addEventListener("click", () => {
        region = r;
        sfx.step();
        drawRegions();
      });
      box.appendChild(b);
    }
  };
  drawRegions();
  const go = root.querySelector("[data-x='go']") as HTMLButtonElement;
  const update = () => (go.disabled = ids.length === 0);
  teamEditor(root.querySelector(".editor") as HTMLElement, game, ids, update);
  update();
  return new Promise((res) => {
    root.querySelector("[data-x='close']")?.addEventListener("click", () => res(null));
    go.addEventListener("click", () => res({ region, ids }));
  });
}

// ---------------------------------------------------------------------------
// 地図
// ---------------------------------------------------------------------------

function lootLine(exp: Expedition): string {
  return `<span class="loot">🪙 <b>${exp.loot.gold.toLocaleString()}</b>G</span><span class="loot">🎴 ドロップパック <b>${exp.loot.packs}</b></span>${exp.blessing ? `<span class="loot bless">✨ 祝福</span>` : ""}`;
}

function danger(game: Game, ids: string[], node: MapNode): { label: string; cls: string } {
  if (!node.enemy) return { label: "", cls: "" };
  const ratio = power(node.enemy.slots) / Math.max(1, power(ids.map((id) => ({ cardId: id, star: starOf(game, id) }))));
  if (ratio <= 0.7) return { label: "余裕", cls: "easy" };
  if (ratio <= 1.1) return { label: "互角", cls: "even" };
  return { label: "危険", cls: "hard" };
}

function chooseNode(d: ExpDeps, exp: Expedition, region: RegionDef, ids: string[]): Promise<MapNode> {
  const { root, game } = d;
  const layers = exp.map
    .map((layer, i) => {
      const cls = i < exp.layer ? "past" : i === exp.layer ? "now" : "future";
      const nodes = layer
        .map((n) => `<span class="dot ${exp.path.includes(n.id) ? "taken" : ""}" title="${NODE_LABEL[n.kind]}">${NODE_ICON[n.kind]}</span>`)
        .join("");
      return `<div class="layer ${cls}"><span class="ln">${i + 1}</span>${nodes}</div>`;
    })
    .reverse()
    .join("");
  root.innerHTML = `
    <div class="exp-screen">
      <header class="exp-head"><h2>${region.name} <small>${exp.layer + 1} / ${exp.map.length} 層</small></h2><div class="loots">${lootLine(exp)}</div></header>
      <div class="map-wrap"><div class="trail">${layers}</div>
        <section class="choices"><h3>どの道を行く?</h3><div class="options"></div></section></div>
    </div>`;
  const box = root.querySelector(".options") as HTMLElement;
  return new Promise((res) => {
    for (const n of currentOptions(exp)) {
      const dg = danger(game, ids, n);
      const b = document.createElement("button");
      b.className = `option k-${n.kind}`;
      const rewards = [n.reward.gold ? `🪙 ${n.reward.gold}G` : "", n.reward.packs ? `🎴 ×${n.reward.packs}` : ""].filter(Boolean).join(" ");
      const enemy = n.enemy
        ? `<div class="foes">${n.enemy.slots.map((s) => `<span class="foe" title="${card(s.cardId).name}">${monsterSvg(card(s.cardId))}${s.star > 1 ? `<i>★${s.star}</i>` : ""}</span>`).join("")}</div>`
        : "";
      const desc: Record<NodeKind, string> = {
        battle: "野生のモンスター",
        elite: "手ごわい群れ。ドロップパックを落とす",
        treasure: "何かが光っている",
        event: "何が起きるかは行ってみないとわからない",
        camp: "ひと休み。戦利品を持って帰れる",
        boss: `${card(region.bossCardId).name}が待っている`,
      };
      b.innerHTML = `<span class="o-icon">${NODE_ICON[n.kind]}</span><span class="o-name">${NODE_LABEL[n.kind]}${dg.label ? ` <em class="dg ${dg.cls}">${dg.label}</em>` : ""}</span>
        <span class="o-desc">${desc[n.kind]}</span>${enemy}<span class="o-reward">${n.kind === "event" ? "?" : rewards || ""}</span>`;
      b.addEventListener("click", () => {
        sfx.step();
        res(n);
      });
      box.appendChild(b);
    }
  });
}

// ---------------------------------------------------------------------------
// ドロップパック
// ---------------------------------------------------------------------------

async function revealDrop(d: ExpDeps, host: HTMLElement, pulled: PulledCard[], newIds: Set<string>): Promise<void> {
  const row = document.createElement("div");
  row.className = "drop-row";
  host.appendChild(row);
  const els = pulled.map((p) => {
    const el = cardEl(card(p.cardId), { finish: p.finish, faceDown: true, tilt: true, star: starOf(d.game, p.cardId) });
    el.classList.add("drop-card");
    row.appendChild(el);
    return el;
  });
  sfx.tearOpen();
  await wait(350);
  for (let i = 0; i < pulled.length; i++) {
    const p = pulled[i] as PulledCard;
    const el = els[i] as HTMLElement;
    const tier = TIER_OF[p.rarity];
    if (tier >= 2) {
      el.classList.add(`glow-${tier}`, "tremble");
      sfx.heartbeat();
      await wait(650);
      el.classList.remove("tremble");
    }
    el.classList.add("flipped");
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const cols = TIER_COLORS[tier] ?? ["#fff", "#fff"];
    if (tier === 0) sfx.flip();
    else sfx.reveal(tier);
    d.fx.burst(x, y, { count: 16 + tier * 50, colors: cols, speed: 4 + tier * 3 });
    if (tier >= 2) {
      d.fx.ring(x, y, cols[0] ?? "#fff", { speed: 12 });
      flash(d.flashEl, cols[0] ?? "#fff", 350);
    }
    if (tier >= 3) d.fx.confettiRain(90, ["#ffd23d", "#fff2a8", "#ffffff"]);
    if (newIds.has(p.cardId)) {
      el.insertAdjacentHTML("beforeend", `<div class="new-pop">NEW!</div>`);
      newIds.delete(p.cardId);
    }
    await wait(tier >= 2 ? 700 : 300);
  }
}

// ---------------------------------------------------------------------------
// 1か所の結果
// ---------------------------------------------------------------------------

function panel(root: HTMLElement, html: string, buttons: { label: string; cls?: string; value: string }[]): Promise<string> {
  const p = document.createElement("div");
  p.className = "exp-panel";
  p.innerHTML = `<div class="exp-panel-inner">${html}<div class="panel-actions">${buttons
    .map((b) => `<button class="btn ${b.cls ?? ""}" data-v="${b.value}">${b.label}</button>`)
    .join("")}</div></div>`;
  root.appendChild(p);
  return new Promise((res) =>
    p.querySelectorAll<HTMLButtonElement>("[data-v]").forEach((b) =>
      b.addEventListener("click", () => {
        p.remove();
        res(b.dataset.v as string);
      }),
    ),
  );
}

function gainedText(g: { gold: number; packs: number }): string {
  const parts: string[] = [];
  if (g.gold) parts.push(`🪙 ${g.gold > 0 ? "+" : ""}${g.gold}G`);
  if (g.packs) parts.push(`🎴 ドロップパック ${g.packs > 0 ? "+" : ""}${g.packs}`);
  return parts.length ? parts.join("  ") : "なし";
}

async function visit(d: ExpDeps, exp: Expedition, region: RegionDef, ids: string[], node: MapNode): Promise<void> {
  const { game, root } = d;
  const r = resolveNode(exp, node.id, teamOf(game, ids), BATTLE_CONTEXT, game.rng);
  game.save();
  if (r.battle) {
    root.innerHTML = `<div class="exp-screen battle-screen"><header class="exp-head"><h2>${NODE_ICON[node.kind]} ${NODE_LABEL[node.kind]}</h2><div class="loots">${lootLine(exp)}</div></header><div class="battle-host"></div></div>`;
    await playBattle(
      { root: root.querySelector(".battle-host") as HTMLElement, fx: d.fx, ctx: BATTLE_CONTEXT, shakeEl: d.shakeEl, flashEl: d.flashEl },
      r.battle,
      { enemy: node.kind === "boss" ? `ボス ${card(region.bossCardId).name}` : node.kind === "elite" ? "強敵" : "野生のモンスター" },
    );
    if (r.battle.outcome === "win") sfx.coin();
    await panel(
      root,
      `<h3>${r.text}</h3><p class="gain">${gainedText(r.gained)}</p>${r.battle.bonusGold ? `<p class="note">うち商才のボーナス ${r.battle.bonusGold}G</p>` : ""}
       <p class="loots">${lootLine(exp)}</p>`,
      [{ label: isOver(exp) ? "結果へ" : "次へ ▶", cls: "primary", value: "ok" }],
    );
    return;
  }
  if (node.kind === "camp") return;
  root.innerHTML = `<div class="exp-screen"><header class="exp-head"><h2>${NODE_ICON[node.kind]} ${NODE_LABEL[node.kind]}</h2><div class="loots">${lootLine(exp)}</div></header><div class="event-art">${NODE_ICON[node.kind]}</div></div>`;
  const art = root.querySelector(".event-art") as HTMLElement;
  const rr = art.getBoundingClientRect();
  const x = rr.left + rr.width / 2;
  const y = rr.top + rr.height / 2;
  if (r.gained.gold > 0) {
    sfx.coin();
    d.fx.burst(x, y, { count: 70, colors: ["#ffd23d", "#fff2a8", "#ffb03d"], speed: 9, kind: "glitter" });
  } else if (r.gained.packs > 0) {
    sfx.reveal(1);
    d.fx.burst(x, y, { count: 70, colors: ["#4aa8ff", "#9fe0ff", "#ffffff"], speed: 9 });
  } else {
    sfx.sparkle();
    d.fx.burst(x, y, { count: 60, colors: ["#7affb0", "#ffffff"], speed: 7, kind: "glitter" });
  }
  await panel(root, `<h3>${r.text}</h3><p class="gain">${gainedText(r.gained)}</p>`, [{ label: "次へ ▶", cls: "primary", value: "ok" }]);
}

// ---------------------------------------------------------------------------
// 野営地と精算
// ---------------------------------------------------------------------------

async function camp(d: ExpDeps, exp: Expedition, region: RegionDef, ids: string[]): Promise<void> {
  const { game, root } = d;
  sfx.sparkle();
  root.innerHTML = `
    <div class="exp-screen camp">
      <header class="exp-head"><h2>🔥 野営地 <small>${exp.layer + 1} / ${exp.map.length} 層</small></h2><div class="loots">${lootLine(exp)}</div></header>
      <section class="drops"><h3>ドロップパック</h3><p class="note">ここで開けたカードは、負けても失わない。すぐ編成に入れられる。</p>
        <button class="btn gold" data-x="open">ドロップパックを開ける <small>残り ${exp.loot.packs}</small></button><div class="drop-host"></div></section>
      <section><h3>編成を見直す</h3><div class="editor"></div></section>
      <footer class="exp-foot camp-foot">
        <button class="btn big" data-x="retreat">帰る <small>🪙 ${exp.loot.gold}G と残りのパックを持ち帰る</small></button>
        <button class="btn primary big" data-x="continue">奥へ進む ▶ <small>負けると戦利品の半分を失う</small></button>
      </footer>
    </div>`;
  const openBtn = root.querySelector("[data-x='open']") as HTMLButtonElement;
  const host = root.querySelector(".drop-host") as HTMLElement;
  const editorHost = root.querySelector(".editor") as HTMLElement;
  const contBtn = root.querySelector("[data-x='continue']") as HTMLButtonElement;
  const refreshTop = () => {
    (root.querySelector(".exp-head .loots") as HTMLElement).innerHTML = lootLine(exp);
    openBtn.disabled = exp.loot.packs <= 0;
    (openBtn.querySelector("small") as HTMLElement).textContent = `残り ${exp.loot.packs}`;
    contBtn.disabled = ids.length === 0;
  };
  const drawEditor = () => teamEditor(editorHost, game, ids, refreshTop);
  drawEditor();
  refreshTop();
  openBtn.addEventListener("click", async () => {
    if (exp.loot.packs <= 0) return;
    openBtn.disabled = true;
    exp.loot.packs -= 1;
    host.innerHTML = "";
    const { cards, newIds } = game.openDrop(region.tribes);
    await revealDrop(d, host, cards, newIds);
    drawEditor();
    refreshTop();
  });
  const choice = await new Promise<"retreat" | "continue">((res) => {
    root.querySelector("[data-x='retreat']")?.addEventListener("click", () => res("retreat"));
    contBtn.addEventListener("click", () => res("continue"));
  });
  campChoice(exp, choice);
}

async function settle(d: ExpDeps, exp: Expedition, region: RegionDef): Promise<void> {
  const { game, root } = d;
  const title = { cleared: "👑 遠征クリア!", retreated: "🏠 無事に帰還", lost: "💀 全滅…", active: "", camp: "" }[exp.status];
  const note = {
    cleared: `${region.name}のボスを倒した。${REGIONS.find((r) => r.requires === region.id) && !game.s.cleared.includes(region.id) ? `新しい地域「${REGIONS.find((r) => r.requires === region.id)?.name}」が開いた!` : ""}`,
    retreated: "戦利品を全部持ち帰った。",
    lost: "戦利品の半分を落としてしまった。カードは失っていない。",
    active: "",
    camp: "",
  }[exp.status];
  game.finishExpedition(region.id, exp.loot.gold, exp.status === "cleared");
  root.innerHTML = `
    <div class="exp-screen settle">
      <h2 class="settle-title ${exp.status}">${title}</h2>
      <p>${note}</p>
      <p class="gain big">🪙 +${exp.loot.gold.toLocaleString()}G <small>(所持 ${game.s.gold.toLocaleString()}G)</small></p>
      <div class="drop-host"></div>
      <footer class="exp-foot"><button class="btn primary big" data-x="home" ${exp.loot.packs > 0 ? "disabled" : ""}>町に戻ってパックを開ける</button></footer>
    </div>`;
  if (exp.status !== "lost") {
    sfx.win();
    d.fx.confettiRain(exp.status === "cleared" ? 220 : 80);
  } else sfx.lose();
  const host = root.querySelector(".drop-host") as HTMLElement;
  if (exp.loot.packs > 0) {
    host.insertAdjacentHTML("beforeend", `<h3>持ち帰ったドロップパック ×${exp.loot.packs}</h3>`);
    while (exp.loot.packs > 0) {
      exp.loot.packs -= 1;
      const { cards, newIds } = game.openDrop(region.tribes);
      await revealDrop(d, host, cards, newIds);
    }
    (root.querySelector("[data-x='home']") as HTMLButtonElement).disabled = false;
  }
  await new Promise<void>((res) => root.querySelector("[data-x='home']")?.addEventListener("click", () => res()));
}

/** 遠征を最初から最後まで */
export async function runExpedition(d: ExpDeps): Promise<void> {
  d.root.hidden = false;
  try {
    const plan = await prepare(d);
    if (!plan) return;
    const { region, ids } = plan;
    const exp = startExpedition(region, d.game.set, d.game.rng);
    d.game.save();
    sfx.whoosh();
    while (!isOver(exp)) {
      if (exp.status === "camp") {
        await camp(d, exp, region, ids);
        continue;
      }
      const node = await chooseNode(d, exp, region, ids);
      await visit(d, exp, region, ids, node);
    }
    await settle(d, exp, region);
  } finally {
    d.fx.clear();
    d.root.hidden = true;
    d.root.innerHTML = "";
  }
}
