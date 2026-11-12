import type { CardDef, Tribe } from "../core/types.ts";

/*
 * 仮のカード絵。カードIDから決まる、手続き生成の SVG モンスター。
 * 本番の絵が入るまでのつなぎで、種族ごとに形を変え、レア度が高いほど飾りを足す。
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRIBE_HUE: Record<Tribe, number> = { slime: 150, beast: 30, dragon: 0, machine: 210, spirit: 270, plant: 100 };

function body(tribe: Tribe, r: () => number, c1: string, c2: string): string {
  const wob = (n: number) => (r() - 0.5) * n;
  switch (tribe) {
    case "slime":
      return `<path d="M50 ${118 + wob(6)} C${48 + wob(8)} 80 ${78 + wob(10)} ${40 + wob(10)} 100 ${42 + wob(8)} C${124 + wob(10)} ${40 + wob(10)} ${152 + wob(8)} 80 150 118 C150 132 50 132 50 118Z" fill="url(#bg1)" stroke="${c2}" stroke-width="3"/>
        <ellipse cx="78" cy="68" rx="9" ry="5" fill="#fff" opacity=".6" transform="rotate(-30 78 68)"/>`;
    case "beast":
      return `<path d="M58 ${60 + wob(8)} L66 ${28 + wob(10)} L84 52Z M142 ${60 + wob(8)} L134 ${28 + wob(10)} L116 52Z" fill="${c1}" stroke="${c2}" stroke-width="3"/>
        <ellipse cx="100" cy="84" rx="${46 + wob(6)}" ry="${40 + wob(6)}" fill="url(#bg1)" stroke="${c2}" stroke-width="3"/>
        <ellipse cx="100" cy="100" rx="18" ry="12" fill="#fff" opacity=".7"/>`;
    case "dragon":
      return `<path d="M40 ${70 + wob(10)} Q20 40 ${48 + wob(6)} 30 Q60 50 66 64Z M160 ${70 + wob(10)} Q180 40 ${152 + wob(6)} 30 Q140 50 134 64Z" fill="${c2}" opacity=".8"/>
        <path d="M78 46 L${70 + wob(8)} ${20 + wob(8)} L88 42Z M122 46 L${130 + wob(8)} ${20 + wob(8)} L112 42Z" fill="#fff4cf" stroke="${c2}" stroke-width="2"/>
        <path d="M60 80 Q60 44 100 44 Q140 44 140 80 Q140 122 100 124 Q60 122 60 80Z" fill="url(#bg1)" stroke="${c2}" stroke-width="3"/>
        <path d="M70 110 Q100 ${126 + wob(6)} 130 110" fill="none" stroke="${c2}" stroke-width="3"/>`;
    case "machine":
      return `<line x1="100" y1="36" x2="100" y2="${18 + wob(8)}" stroke="${c2}" stroke-width="3"/><circle cx="100" cy="${16 + wob(4)}" r="6" fill="#ff5d5d"/>
        <rect x="${54 + wob(6)}" y="38" width="${92 + wob(8)}" height="80" rx="12" fill="url(#bg1)" stroke="${c2}" stroke-width="3"/>
        <rect x="66" y="56" width="68" height="30" rx="6" fill="#1b2433" opacity=".85"/>
        <circle cx="64" cy="106" r="4" fill="${c2}"/><circle cx="136" cy="106" r="4" fill="${c2}"/>`;
    case "spirit":
      return `<path d="M58 120 Q54 50 100 ${40 + wob(8)} Q146 50 142 120 L${130 + wob(6)} 108 L118 124 L106 108 L94 124 L82 108 L70 124Z" fill="url(#bg1)" stroke="${c2}" stroke-width="3" opacity=".92"/>
        <circle cx="${150 + wob(10)}" cy="${40 + wob(10)}" r="7" fill="${c2}" opacity=".7"/><circle cx="${48 + wob(10)}" cy="${44 + wob(10)}" r="5" fill="${c2}" opacity=".6"/>`;
    case "plant":
      return `<path d="M100 48 Q${70 + wob(10)} 10 ${58 + wob(10)} 40 Q78 44 100 48Z M100 48 Q${130 + wob(10)} 10 ${142 + wob(10)} 40 Q122 44 100 48Z" fill="#5fcf6a" stroke="#2f7a3a" stroke-width="2"/>
        <ellipse cx="100" cy="88" rx="${44 + wob(6)}" ry="${40 + wob(6)}" fill="url(#bg1)" stroke="${c2}" stroke-width="3"/>
        <circle cx="70" cy="104" r="6" fill="#ff8fa8" opacity=".6"/><circle cx="130" cy="104" r="6" fill="#ff8fa8" opacity=".6"/>`;
  }
}

function face(tribe: Tribe, r: () => number): string {
  const eyeY = tribe === "machine" ? 71 : 80;
  const gap = 18 + r() * 8;
  const size = 5 + r() * 5;
  if (tribe === "machine") {
    return `<rect x="${100 - gap - 6}" y="${eyeY - 6}" width="12" height="12" rx="2" fill="#7dfcff"/><rect x="${100 + gap - 6}" y="${eyeY - 6}" width="12" height="12" rx="2" fill="#7dfcff"/>`;
  }
  const mouthY = eyeY + 16;
  const mouth =
    r() < 0.5
      ? `<path d="M92 ${mouthY} Q100 ${mouthY + 8} 108 ${mouthY}" fill="none" stroke="#2a1630" stroke-width="3" stroke-linecap="round"/>`
      : `<path d="M94 ${mouthY} L100 ${mouthY + 5} L106 ${mouthY}" fill="none" stroke="#2a1630" stroke-width="3" stroke-linejoin="round"/>`;
  return `<circle cx="${100 - gap}" cy="${eyeY}" r="${size}" fill="#1c1030"/><circle cx="${100 + gap}" cy="${eyeY}" r="${size}" fill="#1c1030"/>
    <circle cx="${100 - gap + 2}" cy="${eyeY - 2}" r="${size * 0.35}" fill="#fff"/><circle cx="${100 + gap + 2}" cy="${eyeY - 2}" r="${size * 0.35}" fill="#fff"/>${mouth}`;
}

/** 取り込んだカード絵(src/art/<カードID>.webp)。ない場合は手続き生成の仮の絵を使う */
const ART_FILES = import.meta.glob("../art/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const ART_URL = new Map(Object.entries(ART_FILES).map(([path, url]) => [path.split("/").pop()?.replace(".webp", "") ?? "", url]));

export function hasArt(cardId: string): boolean {
  return ART_URL.has(cardId);
}

const cache = new Map<string, string>();
let instance = 0;
const instantiate = (template: string) => template.replaceAll("__U__", String(++instance));

/** カードの絵(SVG文字列)。full はフルアート用に背景を広げる */
export function monsterSvg(card: CardDef, full = false): string {
  const url = ART_URL.get(card.id);
  if (url) return `<img class="card-img" src="${url}" alt="" decoding="async" draggable="false">`;
  const key = `${card.id}:${full}`;
  const hit = cache.get(key);
  if (hit) return instantiate(hit);
  const r = seeded(hash(card.id));
  const hue = (TRIBE_HUE[card.tribe] + (r() - 0.5) * 50 + 360) % 360;
  const c1 = `hsl(${hue} 75% 62%)`;
  const c2 = `hsl(${hue} 60% 28%)`;
  const bgA = `hsl(${(hue + 180) % 360} 45% ${full ? 22 : 82}%)`;
  const bgB = `hsl(${(hue + 210) % 360} 55% ${full ? 10 : 66}%)`;
  const rank = ["C", "U", "R", "SR", "SSR", "UR"].indexOf(card.rarity);
  const crown =
    rank >= 4
      ? `<path d="M76 ${card.tribe === "machine" ? 30 : 34} l8 -16 l8 10 l8 -16 l8 16 l8 -10 l8 16Z" fill="#ffd54a" stroke="#a66b00" stroke-width="2"/>`
      : "";
  const aura = rank >= 3 ? `<circle cx="100" cy="80" r="70" fill="url(#aura)"/>` : "";
  const stars = Array.from({ length: full ? 18 : 6 }, () => {
    const x = r() * 200;
    const y = r() * 160;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(r() * 1.8 + 0.4).toFixed(1)}" fill="#fff" opacity="${(r() * 0.6 + 0.2).toFixed(2)}"/>`;
  }).join("");
  const svg = `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="bg0" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></radialGradient>
      <radialGradient id="bg1" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="hsl(${hue} 90% 80%)"/><stop offset="1" stop-color="${c1}"/></radialGradient>
      <radialGradient id="aura"><stop offset="0" stop-color="#fff6c0" stop-opacity=".9"/><stop offset="1" stop-color="#fff6c0" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="200" height="160" fill="url(#bg0)"/>${stars}${aura}
    <g transform="translate(0 ${full ? 8 : 4})">${body(card.tribe, r, c1, c2)}${face(card.tribe, r)}${crown}</g>
  </svg>`;
  // 同じページに同じ絵を何枚も置き、隠れた要素も残るので、グラデーションのIDは描画ごとに分ける
  const template = svg.replace(/\b(bg0|bg1|aura)\b/g, (m) => `${m}-__U__`);
  cache.set(key, template);
  return instantiate(template);
}
