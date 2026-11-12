/*
 * 効果音。音声ファイルを使わず、Web Audio で合成する。
 * ブラウザの制限で、最初のクリックなどの操作のあとでないと鳴らない。
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(m: boolean): void {
  muted = m;
  if (m && ctx) void ctx.suspend();
}
export function isMuted(): boolean {
  return muted;
}
/** 最初の操作で呼んで、音を出せる状態にする */
export function unlockAudio(): void {
  ac();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.3, slideTo?: number): void {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(start: number, dur: number, vol: number, from: number, to: number, q = 1): void {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + start;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export const sfx = {
  /** 封をなぞっている間(進み具合 0〜1) */
  tearTick(p: number): void {
    noise(0, 0.05, 0.12, 1500 + p * 3000, 2500 + p * 3000, 2);
  },
  tearOpen(): void {
    noise(0, 0.35, 0.5, 4000, 600, 0.8);
    tone(180, 0, 0.3, "triangle", 0.2, 60);
  },
  whoosh(): void {
    noise(0, 0.4, 0.25, 300, 2500, 0.7);
  },
  flip(): void {
    noise(0, 0.06, 0.25, 3000, 1200, 3);
    tone(900, 0, 0.05, "square", 0.04);
  },
  heartbeat(): void {
    tone(70, 0, 0.18, "sine", 0.6, 45);
    tone(65, 0.22, 0.22, "sine", 0.45, 40);
  },
  riser(dur: number): void {
    noise(0, dur, 0.18, 200, 6000, 1.5);
    tone(110, 0, dur, "sawtooth", 0.05, 880);
  },
  promote(): void {
    [0, 4, 7, 12, 16].forEach((n, i) => tone(NOTE(72 + n), i * 0.05, 0.4, "square", 0.08));
    noise(0, 0.5, 0.3, 800, 8000, 0.5);
  },
  /** レア度ごとのじゃーん */
  reveal(tier: number): void {
    if (tier <= 0) {
      tone(NOTE(79), 0, 0.15, "triangle", 0.08);
      return;
    }
    const chords: number[][] = [[], [72, 76, 79], [70, 74, 77, 82], [72, 76, 79, 84, 88], [72, 76, 79, 83, 86, 91]];
    const ch = chords[Math.min(tier, 4)] ?? [];
    ch.forEach((n, i) => {
      tone(NOTE(n), i * 0.04, 1.2 + tier * 0.4, "triangle", 0.12);
      tone(NOTE(n + 12), i * 0.04 + 0.02, 0.8 + tier * 0.3, "sine", 0.06);
    });
    if (tier >= 2) noise(0, 0.6 + tier * 0.2, 0.35, 6000, 300, 0.6);
    if (tier >= 3) {
      tone(NOTE(36), 0, 1.5, "sawtooth", 0.18, NOTE(24));
      [0, 3, 7, 10, 12, 15, 19, 24].forEach((n, i) => tone(NOTE(84 + n), 0.3 + i * 0.07, 0.5, "sine", 0.07));
    }
  },
  sparkle(): void {
    for (let i = 0; i < 6; i++) tone(NOTE(96 + Math.floor(Math.random() * 12)), i * 0.06, 0.25, "sine", 0.05);
  },
  crack(): void {
    noise(0, 0.12, 0.6, 5000, 1500, 1);
    tone(60, 0, 0.3, "square", 0.15, 30);
  },
  shatter(): void {
    noise(0, 1.2, 0.7, 9000, 400, 0.4);
    tone(NOTE(24), 0, 2, "sawtooth", 0.3, NOTE(12));
  },
  fanfare(): void {
    const seq = [60, 64, 67, 72, 76, 79, 84];
    seq.forEach((n, i) => {
      tone(NOTE(n), i * 0.11, 0.6, "square", 0.08);
      tone(NOTE(n + 7), i * 0.11, 0.6, "triangle", 0.06);
    });
    [60, 64, 67, 72].forEach((n) => tone(NOTE(n), 0.8, 3.5, "sawtooth", 0.07));
    [72, 76, 79, 84].forEach((n) => tone(NOTE(n), 0.8, 3.5, "triangle", 0.09));
  },
  hit(power = 1): void {
    noise(0, 0.12, 0.35 + power * 0.1, 2500, 400, 1.2);
    tone(140 - power * 20, 0, 0.12, "square", 0.12, 60);
  },
  ability(): void {
    tone(NOTE(84), 0, 0.12, "triangle", 0.07);
    tone(NOTE(91), 0.06, 0.18, "triangle", 0.06);
  },
  shield(): void {
    tone(NOTE(76), 0, 0.25, "sine", 0.1, NOTE(88));
  },
  heal(): void {
    [0, 4, 7].forEach((n, i) => tone(NOTE(79 + n), i * 0.05, 0.25, "sine", 0.06));
  },
  faint(): void {
    noise(0, 0.3, 0.3, 1200, 200, 0.8);
    tone(300, 0, 0.3, "triangle", 0.08, 90);
  },
  summon(): void {
    tone(NOTE(72), 0, 0.15, "sine", 0.08, NOTE(84));
  },
  win(): void {
    [72, 76, 79, 84].forEach((n, i) => tone(NOTE(n), i * 0.1, 0.5, "square", 0.07));
    [84, 88, 91].forEach((n) => tone(NOTE(n), 0.45, 1.2, "triangle", 0.08));
  },
  lose(): void {
    [67, 63, 60, 55].forEach((n, i) => tone(NOTE(n), i * 0.22, 0.5, "triangle", 0.09));
  },
  step(): void {
    tone(NOTE(67), 0, 0.08, "triangle", 0.05);
  },
  coin(): void {
    tone(NOTE(88), 0, 0.08, "square", 0.06);
    tone(NOTE(95), 0.07, 0.25, "square", 0.06);
  },
  error(): void {
    tone(160, 0, 0.2, "square", 0.08, 110);
  },
};
