import type { Rng } from "./rng.ts";

/*
 * カプセルマシン(提案書 4.1節)。中身と残数が見え、引いた分は減る(非復元抽出)。
 * 最後まで引けば必ず全部出るので、天井の説明がいらない。
 */

export interface CapsuleDef {
  id: string;
  name: string;
  price: number;
  contents: readonly { relicId: string; count: number }[];
}

export interface CapsuleMachine {
  defId: string;
  price: number;
  total: number;
  remaining: string[];
}

export function createMachine(def: CapsuleDef): CapsuleMachine {
  const remaining = def.contents.flatMap((c) => Array.from({ length: c.count }, () => c.relicId));
  return { defId: def.id, price: def.price, total: remaining.length, remaining };
}

export function drawCapsule(machine: CapsuleMachine, rng: Rng): string {
  if (machine.remaining.length === 0) throw new Error("カプセルが空");
  const i = rng.int(machine.remaining.length);
  const [relicId] = machine.remaining.splice(i, 1);
  if (relicId === undefined) throw new Error("カプセルの取り出しに失敗");
  return relicId;
}

/** 残りの中身(表示用) */
export function remainingCounts(machine: CapsuleMachine): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of machine.remaining) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/** 次の1回で特定のレリックが出る確率 */
export function chanceOf(machine: CapsuleMachine, relicId: string): number {
  if (machine.remaining.length === 0) return 0;
  return (remainingCounts(machine).get(relicId) ?? 0) / machine.remaining.length;
}
