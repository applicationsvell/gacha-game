import "./styles.css";
import { Game } from "./state.ts";
import { Fx } from "./fx.ts";
import { playBox, playSingle } from "./opening.ts";
import type { Deps, NextAction } from "./opening.ts";
import { setMuted, sfx, unlockAudio } from "./sound.ts";
import { cardEl, attachTilt } from "./cardView.ts";
import { monsterSvg } from "./art.ts";
import { completion, copies, exchange } from "../core/collection.ts";
import {
  expectedCopiesPerPack,
  FINISH_RATES,
  GOD_PACK_RATE,
  POINT_COST,
  STARTER_PACKS,
  TOP_HARD,
  TOP_SOFT_START,
  topChance,
  UR_HARD,
} from "../core/gacha.ts";
import { RARITIES } from "../core/types.ts";
import type { CardDef } from "../core/types.ts";

const game = new Game();
setMuted(game.s.muted);

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const app = $("#app");
const fx = new Fx($<HTMLCanvasElement>("#fx"));
const deps: Deps = { game, fx, stage: $("#stage"), shakeEl: document.body, flashEl: $("#flash") };
const modal = $<HTMLDialogElement>("#modal");
let busy = false;

function renderHud(): void {
  const s = game.s;
  $("#gold").textContent = s.gold.toLocaleString();
  const top = s.pack.sinceTop;
  const ur = s.pack.sinceUr;
  $("#pity-ssr").style.width = `${(top / TOP_HARD) * 100}%`;
  $("#pity-ssr-t").textContent = `${top}/${TOP_HARD}`;
  $("#pity-ur").style.width = `${(ur / UR_HARD) * 100}%`;
  $("#pity-ur-t").textContent = `${ur}/${UR_HARD}`;
  $("#pity-ssr").parentElement?.classList.toggle("hot", top + 1 >= TOP_SOFT_START);
  $("#chance").textContent = `次のパックの SSR 以上: ${(topChance(s.pack) * 100).toFixed(1)}%`;
  $("#pts").textContent = String(s.pack.points);
  const c = completion(s.col, game.set);
  $("#dex").textContent = `${c.owned}/${c.total}`;
  $("#stats").innerHTML = `開けたパック <b>${s.stats.packs}</b> ・ SSR <b>${s.stats.ssr}</b> ・ UR <b>${s.stats.ur}</b> ・ ゴールド仕上げ <b>${s.stats.gold}</b> ・ ゴッドパック <b>${s.stats.god}</b>`;
  $("#sound").textContent = s.muted ? "🔇 音なし" : "🔊 音あり";

  const actions = $("#actions");
  if (!s.starterDone) {
    actions.innerHTML = `<button class="btn primary big" data-act="starter">おばあちゃんの ${STARTER_PACKS} パックを開ける</button>
      <p class="note">露店を継いだお祝いの${STARTER_PACKS}パック。最後までに SSR 以上が1枚確定。</p>`;
  } else {
    actions.innerHTML = `
      <button class="btn primary big" data-act="one" ${game.canBuy(1) ? "" : "disabled"}>1パック開ける <small>${game.set.packPrice}G</small></button>
      <button class="btn gold big" data-act="box" ${game.canBuy(10) ? "" : "disabled"}>10パック まとめて <small>${(game.set.packPrice * 10).toLocaleString()}G</small></button>
      <button class="btn ghost" data-act="earn">＋${(1000).toLocaleString()}G 稼ぐ <small>(試作用。遠征と店は次の段階)</small></button>`;
  }
}

async function runOpenings(first: NextAction | "starter"): Promise<void> {
  if (busy) return;
  busy = true;
  unlockAudio();
  app.classList.add("hide");
  try {
    let next: NextAction | "starter" = first;
    while (next !== "close") {
      if (next === "starter") {
        const { results, newIds } = game.starter();
        for (let i = 0; i < results.length; i++) {
          await playSingle(deps, results[i]!, newIds, { label: `おばあちゃんの${STARTER_PACKS}パック ${i + 1}/${results.length}`, allowAgain: false });
        }
        next = "close";
      } else if (next === "again") {
        const r = game.buy(1);
        if (!r) break;
        next = await playSingle(deps, r.results[0]!, r.newIds);
      } else {
        const r = game.buy(10);
        if (!r) break;
        next = await playBox(deps, r.results, r.newIds);
      }
      renderHud();
    }
  } finally {
    busy = false;
    app.classList.remove("hide");
    renderHud();
  }
}

// ---------------------------------------------------------------------------
// 図鑑と排出率
// ---------------------------------------------------------------------------

function openModal(html: string): HTMLElement {
  modal.innerHTML = `<div class="modal-inner"><button class="close" aria-label="閉じる">✕</button>${html}</div>`;
  modal.querySelector(".close")?.addEventListener("click", () => modal.close());
  modal.showModal();
  return modal.querySelector(".modal-inner") as HTMLElement;
}

function openBinder(): void {
  const c = completion(game.s.col, game.set);
  const inner = openModal(`<h2>図鑑 <small>${game.set.name} ${c.owned}/${c.total}</small></h2>
    <p class="note">持っていないカードは、交換ポイントでもらえます(所持 <b>${game.s.pack.points}</b>pt)。</p>
    <div class="binder"></div>`);
  const grid = inner.querySelector(".binder") as HTMLElement;
  for (const card of game.set.cards) {
    const own = game.s.col.cards[card.id];
    const n = copies(game.s.col, card.id);
    const cell = document.createElement("div");
    cell.className = "slot";
    if (own && (n > 0 || own.star > 1)) {
      const best = (["gold", "full", "holo", "normal"] as const).find((f) => own.counts[f] > 0) ?? "normal";
      const el = cardEl(card, { finish: best, star: own.star, tilt: true });
      el.classList.add("mini");
      cell.appendChild(el);
      const tag = document.createElement("div");
      tag.className = "slot-tag";
      tag.textContent = `×${n}`;
      cell.appendChild(tag);
    } else {
      const cost = POINT_COST[card.rarity];
      cell.innerHTML = `<div class="silhouette r-${card.rarity}"><div class="sil-art">${monsterSvg(card)}</div><span>${card.rarity}</span></div>
        <button class="btn tiny" ${game.s.pack.points >= cost ? "" : "disabled"}>交換 ${cost}pt</button>`;
      cell.querySelector("button")?.addEventListener("click", () => {
        exchange(game.s.col, game.set, game.s.pack, card.id);
        game.save();
        sfx.reveal(Math.min(3, RARITIES.indexOf(card.rarity) - 1));
        renderHud();
        openBinder();
      });
    }
    grid.appendChild(cell);
  }
}

function openRates(): void {
  const exp = expectedCopiesPerPack(game.set);
  const rows = RARITIES.map((r) => {
    const cards = game.set.byRarity[r];
    const each = exp.get((cards[0] as CardDef).id) ?? 0;
    const fin = Object.entries(FINISH_RATES[r])
      .map(([f, p]) => `${({ holo: "ホロ", full: "フルアート", gold: "ゴールド" } as Record<string, string>)[f]} ${(p * 100).toFixed(0)}%`)
      .join(" / ");
    return `<tr><th>${r}</th><td>${cards.length}種</td><td>${(each * 100).toFixed(3)}%</td><td>${(each * cards.length * 100).toFixed(2)}%</td><td>${fin}</td></tr>`;
  }).join("");
  openModal(`<h2>排出率</h2>
    <table class="rates"><thead><tr><th>レア度</th><th>種類</th><th>1種あたり</th><th>レア度全体</th><th>仕上げ</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">数値は1パック(5枚)あたりに出る枚数の期待値です(天井を含まない素の値)。</p>
    <ul class="rules">
      <li>レア枠(5枚目): R 67.5% / SR 26% / SSR 6% / UR 0.5%</li>
      <li>SSR 以上が出ないまま ${TOP_SOFT_START} パック目から確率が上がり、${TOP_HARD} パック目で確定</li>
      <li>UR が出ないまま ${UR_HARD} パック目で UR 確定</li>
      <li>ゴッドパック(5枚すべて SR 以上): ${(GOD_PACK_RATE * 100).toFixed(1)}%</li>
      <li>1パックで交換ポイント1。C 1 / U 2 / R 5 / SR 15 / SSR 50 / UR 150 で好きなカードと交換</li>
      <li>リアルマネーで引く手段はありません</li>
    </ul>`);
}

// ---------------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------------

const hero = $("#hero-pack");
hero.innerHTML = `<div class="pack-body"><div class="pack-art">${monsterSvg(game.set.byRarity.UR[0] as CardDef, true)}</div>
  <div class="pack-logo">PACK<br>MONGER</div><div class="pack-set">${game.set.name}</div><div class="pack-count">5 CARDS</div><div class="pack-foil"></div></div>
  <div class="pack-top"><div class="crimp"></div></div>`;
attachTilt(hero);

document.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!t || busy) return;
  unlockAudio();
  switch (t.dataset.act) {
    case "starter":
      void runOpenings("starter");
      break;
    case "one":
      void runOpenings("again");
      break;
    case "box":
      void runOpenings("box");
      break;
    case "earn":
      game.addDebugGold();
      sfx.coin();
      renderHud();
      break;
    case "binder":
      openBinder();
      break;
    case "rates":
      openRates();
      break;
    case "sound":
      game.s.muted = !game.s.muted;
      setMuted(game.s.muted);
      game.save();
      renderHud();
      break;
    case "reset":
      if (confirm("保存データを消して、最初からやり直しますか?")) {
        game.reset();
        renderHud();
      }
      break;
  }
});

renderHud();
// 動作確認用(自動テストから使う)
(window as unknown as { __game: Game }).__game = game;
