/**
 * シード付き乱数(mulberry32)。
 * 同じシードからは同じ列が出るので、テストとリプレイに使える。
 * state() で取り出した値を createRng() に渡すと、続きから再開できる。
 */
export interface Rng {
  /** [0, 1) の一様乱数 */
  next(): number;
  /** [0, n) の整数 */
  int(n: number): number;
  /** 現在の内部状態(保存用) */
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    state: () => s,
  };
}

/**
 * 重み表から1つ選ぶ。重みの合計が1未満でも、端数は最後のキーに入る。
 * 表は挿入順に評価する。
 */
export function pickWeighted<K extends string>(table: Readonly<Record<K, number>>, rng: Rng): K {
  const x = rng.next();
  let acc = 0;
  let last: K | undefined;
  for (const key of Object.keys(table) as K[]) {
    acc += table[key];
    last = key;
    if (x < acc) return key;
  }
  if (last === undefined) throw new Error("空の重み表");
  return last;
}
