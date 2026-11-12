/*
 * 画面全体の特殊効果。Canvas に粒子・光線・衝撃波を描き、DOM で揺れと閃光を出す。
 * 「動きを減らす」設定の端末では、粒子を減らし、揺れを止める。
 */

export const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 光の段階ごとの色 [主色, 副色] */
export const TIER_COLORS: [string, string][] = [
  ["#f4f1ff", "#b9c3d6"],
  ["#4aa8ff", "#9fe0ff"],
  ["#b05cff", "#ff7ef2"],
  ["#ffc83d", "#fff2a8"],
  ["#ff4fd8", "#4ffff0"],
];
const RAINBOW = ["#ff4f6d", "#ffa63d", "#ffe94f", "#5bff7a", "#4fd2ff", "#7a5bff", "#ff4fd8"];

type Kind = "spark" | "confetti" | "glitter" | "ember";
interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  drag: number;
  gravity: number;
}
interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  max: number;
  color: string;
  width: number;
}
interface Rays {
  x: number;
  y: number;
  life: number;
  max: number;
  colors: string[];
  count: number;
  spin: number;
  angle: number;
  reach: number;
}

export class Fx {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private rays: Rays[] = [];
  private running = false;
  private w = 0;
  private h = 0;
  private dpr = 1;
  /** 続けて湧く粒子(UR 演出の嵐など) */
  private emitters: { until: number; fn: () => void }[] = [];

  /** 光線を描く、カードより奥のキャンバス(開封画面にだけある) */
  private back: { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } | null = null;

  setBackCanvas(canvas: HTMLCanvasElement | null): void {
    const g = canvas?.getContext("2d");
    this.back = canvas && g ? { canvas, g } : null;
    this.resize();
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Canvas が使えない");
    this.g = g;
    this.resize();
    addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = innerWidth;
    this.h = innerHeight;
    for (const c of [{ canvas: this.canvas, g: this.g }, ...(this.back ? [this.back] : [])]) {
      c.canvas.width = this.w * this.dpr;
      c.canvas.height = this.h * this.dpr;
      c.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
  }

  private n(count: number): number {
    return Math.round(REDUCED ? count * 0.25 : count);
  }

  /** 中心から粒子を飛び散らせる */
  burst(x: number, y: number, opts: { count: number; colors: string[]; speed?: number; kind?: Kind; gravity?: number; size?: number; life?: number }): void {
    const { colors, speed = 8, kind = "spark", gravity = 0.12, size = 3, life = 70 } = opts;
    for (let i = 0; i < this.n(opts.count); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.9);
      this.particles.push({
        kind,
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (kind === "confetti" ? 4 : 0),
        life: 0,
        max: life * (0.6 + Math.random() * 0.7),
        size: size * (0.5 + Math.random()),
        color: colors[i % colors.length] ?? "#fff",
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        drag: kind === "confetti" ? 0.96 : 0.94,
        gravity,
      });
    }
    this.start();
  }

  /** 画面上から紙吹雪を降らせる */
  confettiRain(count: number, colors = RAINBOW): void {
    for (let i = 0; i < this.n(count); i++) {
      this.particles.push({
        kind: "confetti",
        x: Math.random() * this.w,
        y: -20 - Math.random() * this.h * 0.5,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 3,
        life: 0,
        max: 260,
        size: 4 + Math.random() * 5,
        color: colors[i % colors.length] ?? "#fff",
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        drag: 0.995,
        gravity: 0.03,
      });
    }
    this.start();
  }

  /** 粒子を吸い込む(溜めの演出) */
  implode(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < this.n(count); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 180 + Math.random() * 260;
      const life = 40 + Math.random() * 20;
      this.particles.push({
        kind: "ember",
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        vx: (-Math.cos(a) * d) / life,
        vy: (-Math.sin(a) * d) / life,
        life: 0,
        max: life,
        size: 2 + Math.random() * 2,
        color,
        rot: 0,
        vr: 0,
        drag: 1,
        gravity: 0,
      });
    }
    this.start();
  }

  ring(x: number, y: number, color: string, opts: { speed?: number; width?: number; life?: number } = {}): void {
    this.rings.push({ x, y, r: 10, vr: opts.speed ?? 14, life: 0, max: opts.life ?? 45, color, width: opts.width ?? 6 });
    this.start();
  }

  /** 回転する光線 */
  godRays(x: number, y: number, colors: string[], opts: { life?: number; count?: number; reach?: number } = {}): void {
    this.rays.push({
      x,
      y,
      life: 0,
      max: opts.life ?? 200,
      colors,
      count: opts.count ?? 14,
      spin: 0.006,
      angle: 0,
      reach: opts.reach ?? Math.hypot(this.w, this.h),
    });
    this.start();
  }

  /** ms のあいだ、毎フレーム fn を呼んで粒子を湧かせる */
  emit(ms: number, fn: () => void): void {
    this.emitters.push({ until: performance.now() + ms, fn });
    this.start();
  }

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.rays = [];
    this.emitters = [];
  }

  get rainbow(): string[] {
    return RAINBOW;
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    const now = performance.now();
    this.emitters = this.emitters.filter((e) => {
      if (now > e.until) return false;
      e.fn();
      return true;
    });

    const rg = this.back?.g ?? g;
    if (this.back) rg.clearRect(0, 0, this.w, this.h);
    rg.globalCompositeOperation = "lighter";
    for (const r of this.rays) {
      r.life += 1;
      r.angle += r.spin;
      const t = r.life / r.max;
      const alpha = Math.min(1, r.life / 20) * (1 - t) * 0.55;
      for (let i = 0; i < r.count; i++) {
        const a = r.angle + (i / r.count) * Math.PI * 2;
        const spread = 0.07;
        const grad = rg.createRadialGradient(r.x, r.y, 0, r.x, r.y, r.reach);
        const col = r.colors[i % r.colors.length] ?? "#fff";
        grad.addColorStop(0, col);
        grad.addColorStop(1, "transparent");
        rg.globalAlpha = alpha;
        rg.fillStyle = grad;
        rg.beginPath();
        rg.moveTo(r.x, r.y);
        rg.lineTo(r.x + Math.cos(a - spread) * r.reach, r.y + Math.sin(a - spread) * r.reach);
        rg.lineTo(r.x + Math.cos(a + spread) * r.reach, r.y + Math.sin(a + spread) * r.reach);
        rg.closePath();
        rg.fill();
      }
    }
    rg.globalAlpha = 1;
    rg.globalCompositeOperation = "source-over";
    g.globalCompositeOperation = "lighter";
    this.rays = this.rays.filter((r) => r.life < r.max);

    for (const r of this.rings) {
      r.life += 1;
      r.r += r.vr;
      r.vr *= 0.96;
      g.globalAlpha = 1 - r.life / r.max;
      g.strokeStyle = r.color;
      g.lineWidth = r.width * (1 - r.life / r.max) + 1;
      g.beginPath();
      g.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      g.stroke();
    }
    this.rings = this.rings.filter((r) => r.life < r.max);

    for (const p of this.particles) {
      p.life += 1;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      const t = p.life / p.max;
      g.globalAlpha = Math.max(0, 1 - t * t);
      g.fillStyle = p.color;
      if (p.kind === "spark") {
        g.strokeStyle = p.color;
        g.lineWidth = p.size * 0.7;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
        g.stroke();
      } else if (p.kind === "confetti") {
        g.save();
        g.globalCompositeOperation = "source-over";
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(1, Math.abs(Math.cos(p.rot * 2)) + 0.2);
        g.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        g.restore();
      } else if (p.kind === "glitter") {
        const s = p.size * (0.6 + 0.4 * Math.sin(p.life * 0.5));
        g.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2 + p.rot;
          g.lineTo(p.x + Math.cos(a) * s * 2.2, p.y + Math.sin(a) * s * 2.2);
          g.lineTo(p.x + Math.cos(a + Math.PI / 4) * s * 0.5, p.y + Math.sin(a + Math.PI / 4) * s * 0.5);
        }
        g.closePath();
        g.fill();
      } else {
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      }
    }
    this.particles = this.particles.filter((p) => p.life < p.max && p.y < this.h + 40);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";

    if (this.particles.length || this.rings.length || this.rays.length || this.emitters.length) {
      requestAnimationFrame(this.frame);
    } else {
      this.running = false;
      g.clearRect(0, 0, this.w, this.h);
      this.back?.g.clearRect(0, 0, this.w, this.h);
    }
  };
}

/** 画面を揺らす */
export function shake(el: HTMLElement, strength: "s" | "m" | "l"): void {
  if (REDUCED) return;
  el.classList.remove("shake-s", "shake-m", "shake-l");
  void el.offsetWidth;
  el.classList.add(`shake-${strength}`);
}

/** 画面全体を一瞬光らせる(点滅はしない) */
export function flash(el: HTMLElement, color: string, ms = 500): void {
  el.style.setProperty("--flash", color);
  el.style.setProperty("--flash-ms", `${REDUCED ? ms / 2 : ms}ms`);
  el.classList.remove("flash-on");
  void el.offsetWidth;
  el.classList.add("flash-on");
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
