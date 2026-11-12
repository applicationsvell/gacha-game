#!/usr/bin/env python3
"""提案書 (docs/PROPOSAL.md) のガチャ確率・経済バランスを検証するモンテカルロ・シミュレーション。

標準ライブラリのみで動く。

    python3 tools/gacha_sim.py            # 既定 (試行 2000, seed 7)
    python3 tools/gacha_sim.py --trials 500 --seed 1

出力する検証項目:
  1. パック1個あたりの排出率 (天井込みの実効値)
  2. 「初めて引くまで」に必要なパック数の分布 (天井の効き方)
  3. セット収集の所要パック数 (交換ポイントあり / なし)
  4. 売却期待値 (パック価格に対する還元率と大当たり頻度)
  5. カプセルマシン (有限・非復元) の目玉までの回数
  6. 稼ぎモデルと組み合わせた「プレイ時間あたりの到達点」
"""
from __future__ import annotations

import argparse
import random
import statistics

# ---------------------------------------------------------------------------
# 設計値 (提案書 4章・7章と対応)
# ---------------------------------------------------------------------------
RARITIES = ["C", "U", "R", "SR", "SSR", "UR"]

# 1セットの収録数 (ユニークなモンスター 60 体)
SET_COUNTS = {"C": 20, "U": 16, "R": 12, "SR": 8, "SSR": 3, "UR": 1}

# 5枚パックの枠ごとの排出率。レア枠は最後の1枚だけ。
COMMON_SLOT = {"C": 0.80, "U": 0.20}
UNCOMMON_SLOT = {"U": 0.70, "R": 0.30}
RARE_SLOT = {"R": 0.675, "SR": 0.26, "SSR": 0.06, "UR": 0.005}
GOD_PACK_RATE = 1 / 1000  # 5枚すべてが SR 以上になる特別パック
GOD_SLOT = {"SR": 0.80, "SSR": 0.18, "UR": 0.02}

# 天井 (すべて画面に常時表示する前提)
SSR_SOFT_START = 21  # 21パック目から SSR 以上の確率が上がり始める
SSR_HARD = 30  # 30パック目は SSR 以上が確定
UR_HARD = 200  # 200パック目は UR が確定

# 交換ポイント: 1パック = 1ポイント。セット内の任意のカードと交換できる。
POINT_COST = {"C": 1, "U": 2, "R": 5, "SR": 15, "SSR": 50, "UR": 150}

# 仕上げ (性能差のない見た目違い)
FINISH_RATES = {
    "C": {"holo": 0.08},
    "U": {"holo": 0.08},
    "R": {"holo": 0.08},
    "SR": {"holo": 0.10, "full": 0.08},
    "SSR": {"holo": 0.10, "full": 0.08, "gold": 0.02},
    "UR": {"holo": 0.10, "full": 0.08, "gold": 0.02},
}
FINISH_VALUE = {"normal": 1, "holo": 2, "full": 4, "gold": 20}

# 買取価格 (第1セット・パック価格 100G のとき)
PACK_PRICE = 100
BUYLIST = {"C": 1, "U": 3, "R": 10, "SR": 40, "SSR": 120, "UR": 800}

# 同じカード 3枚で ★2、9枚で ★3
STAR2, STAR3 = 3, 9


def roll(table: dict[str, float], rng: random.Random) -> str:
    x = rng.random()
    acc = 0.0
    for key, p in table.items():
        acc += p
        if x < acc:
            return key
    return key  # 浮動小数の端数


class PackOpener:
    """天井カウンタを持つパック開封機。"""

    def __init__(self, rng: random.Random, pity: bool = True):
        self.rng = rng
        self.pity = pity
        self.since_ssr = 0  # SSR 以上が出ていない連続パック数
        self.since_ur = 0

    def _rare_slot(self) -> str:
        rng = self.rng
        if self.pity and self.since_ur + 1 >= UR_HARD:
            return "UR"
        n = self.since_ssr + 1  # 今開けるのが何パック目か
        p_top = RARE_SLOT["SSR"] + RARE_SLOT["UR"]
        if self.pity and n >= SSR_HARD:
            p_top = 1.0
        elif self.pity and n >= SSR_SOFT_START:
            p_top = min(1.0, p_top + (n - SSR_SOFT_START + 1) * 0.09)
        if rng.random() < p_top:
            ur_share = RARE_SLOT["UR"] / (RARE_SLOT["SSR"] + RARE_SLOT["UR"])
            return "UR" if rng.random() < ur_share else "SSR"
        rest = RARE_SLOT["R"] + RARE_SLOT["SR"]
        return "R" if rng.random() < RARE_SLOT["R"] / rest else "SR"

    def open(self) -> tuple[list[tuple[str, int, str]], bool]:
        """カード5枚 (レア度, セット内番号, 仕上げ) と、ゴッドパックかどうかを返す。"""
        rng = self.rng
        god = rng.random() < GOD_PACK_RATE
        if god:
            rar = [roll(GOD_SLOT, rng) for _ in range(5)]
        else:
            rar = [roll(COMMON_SLOT, rng) for _ in range(3)]
            rar.append(roll(UNCOMMON_SLOT, rng))
            rar.append(self._rare_slot())
        top = any(r in ("SSR", "UR") for r in rar)
        self.since_ssr = 0 if top else self.since_ssr + 1
        self.since_ur = 0 if "UR" in rar else self.since_ur + 1
        cards = []
        for r in rar:
            idx = rng.randrange(SET_COUNTS[r])
            finish = "normal"
            x = rng.random()
            acc = 0.0
            for name, p in FINISH_RATES[r].items():
                acc += p
                if x < acc:
                    finish = name
                    break
            cards.append((r, idx, finish))
        return cards, god


def card_value(r: str, finish: str) -> float:
    return BUYLIST[r] * FINISH_VALUE[finish]


def pct(xs: list[float], q: float) -> float:
    s = sorted(xs)
    return s[min(len(s) - 1, int(q * len(s)))]


def summarize(xs: list[float]) -> str:
    return (
        f"平均 {statistics.fmean(xs):7.1f} / 中央 {pct(xs, 0.5):6.0f}"
        f" / 90% {pct(xs, 0.9):6.0f} / 最大 {max(xs):6.0f}"
    )


# ---------------------------------------------------------------------------
# 1. 排出率  4. 売却期待値
# ---------------------------------------------------------------------------
def sim_rates(n_packs: int, rng: random.Random) -> None:
    opener = PackOpener(rng)
    cnt = dict.fromkeys(RARITIES, 0)
    best = dict.fromkeys(RARITIES, 0)
    fin = {"holo": 0, "full": 0, "gold": 0}
    gods = 0
    values = []
    for _ in range(n_packs):
        cards, god = opener.open()
        gods += god
        top = max(RARITIES.index(r) for r, _, _ in cards)
        best[RARITIES[top]] += 1
        v = 0.0
        for r, _, f in cards:
            cnt[r] += 1
            if f != "normal":
                fin[f] += 1
            v += card_value(r, f)
        values.append(v)
    print(f"## 1. 排出率 (天井込みの実効値、{n_packs:,} パック)")
    print("  レア度   1パックあたり枚数   そのパックの最高レア度になる率")
    for r in RARITIES:
        print(f"  {r:<4}   {cnt[r] / n_packs:10.4f}          {best[r] / n_packs:8.2%}")
    sr_up = sum(best[r] for r in ("SR", "SSR", "UR")) / n_packs
    ssr_up = sum(best[r] for r in ("SSR", "UR")) / n_packs
    print(f"  SR以上が入る率 {sr_up:.1%} / SSR以上が入る率 {ssr_up:.2%}"
          f" / UR が入る率 {cnt['UR'] / n_packs:.3%}")
    print(f"  ゴッドパック 1/{n_packs / max(gods, 1):,.0f}")
    for f, c in fin.items():
        print(f"  仕上げ {f:<5} 1/{n_packs / max(c, 1):,.1f} パック")
    print()
    mean_v = statistics.fmean(values)
    print("## 4. 売却期待値 (全カードを買取価格で売った場合)")
    print(f"  パック価格 {PACK_PRICE}G に対し平均 {mean_v:.1f}G (還元率 {mean_v / PACK_PRICE:.0%})")
    print(f"  中央値 {pct(values, 0.5):.0f}G / 90%点 {pct(values, 0.9):.0f}G / 99%点 {pct(values, 0.99):.0f}G")
    for mult in (1, 2, 5, 10, 20):
        p = sum(v >= PACK_PRICE * mult for v in values) / n_packs
        print(f"  価格の {mult:>2} 倍以上になるパック: {p:.3%}" + (f" (1/{1 / p:,.0f})" if p else ""))
    print()


# ---------------------------------------------------------------------------
# 2. 初回入手  3. 収集
# ---------------------------------------------------------------------------
def missing_cost(owned: dict[str, list[int]], rarities: list[str]) -> int:
    return sum(POINT_COST[r] * sum(1 for c in owned[r] if c == 0) for r in rarities)


def sim_collection(trials: int, rng: random.Random, pity: bool, cap: int = 6000) -> dict[str, list[float]]:
    out: dict[str, list[float]] = {k: [] for k in (
        "first_SR", "first_SSR", "first_UR",
        "base_CR", "base_SR", "base_SSR", "base_ALL",
        "pts_SSR", "pts_ALL", "star2_SSR", "star3_SR", "star3_SSR", "star3_ALL", "gold",
    )}
    low = ["C", "U", "R"]
    for _ in range(trials):
        opener = PackOpener(rng, pity=pity)
        owned = {r: [0] * SET_COUNTS[r] for r in RARITIES}
        done: dict[str, int] = {}
        n = 0
        while n < cap and len(done) < len(out):
            n += 1
            cards, _ = opener.open()
            for r, idx, f in cards:
                owned[r][idx] += 1
                if f == "gold":
                    done.setdefault("gold", n)
                # 「以上」で数える: UR は SSR 以上でもあり SR 以上でもある
                if r in ("SR", "SSR", "UR"):
                    done.setdefault("first_SR", n)
                if r in ("SSR", "UR"):
                    done.setdefault("first_SSR", n)
                if r == "UR":
                    done.setdefault("first_UR", n)
            if n % 2 and n > 9:  # 判定は2パックに1回で十分
                continue

            def full(rs: list[str], need: int = 1) -> bool:
                return all(c >= need for r in rs for c in owned[r])

            if "base_CR" not in done and full(low):
                done["base_CR"] = n
            if "base_SR" not in done and full(low + ["SR"]):
                done["base_SR"] = n
            if "base_SSR" not in done and full(low + ["SR", "SSR"]):
                done["base_SSR"] = n
            if "base_ALL" not in done and full(RARITIES):
                done["base_ALL"] = n
            # 交換ポイントを最後にまとめて使う場合 (1パック = 1ポイント)
            if "pts_SSR" not in done and missing_cost(owned, low + ["SR", "SSR"]) <= n:
                done["pts_SSR"] = n
            if "pts_ALL" not in done and missing_cost(owned, RARITIES) <= n:
                done["pts_ALL"] = n
            if "star2_SSR" not in done and full(low + ["SR", "SSR"], STAR2):
                done["star2_SSR"] = n
            if "star3_SR" not in done and full(low + ["SR"], STAR3):
                done["star3_SR"] = n
            if "star3_SSR" not in done and full(low + ["SR", "SSR"], STAR3):
                done["star3_SSR"] = n
            if "star3_ALL" not in done and full(RARITIES, STAR3):
                done["star3_ALL"] = n
        for k in out:
            out[k].append(done.get(k, cap))
    return out


def print_collection(trials: int, rng: random.Random) -> dict[str, list[float]]:
    with_pity = sim_collection(trials, rng, pity=True)
    no_pity = sim_collection(max(200, trials // 4), rng, pity=False)
    print(f"## 2. 初めて引くまでのパック数 (試行 {trials})")
    for key, label in (("first_SR", "SR以上"), ("first_SSR", "SSR以上"), ("first_UR", "UR")):
        print(f"  {label:<6} 天井あり: {summarize(with_pity[key])}")
        print(f"  {'':<6} 天井なし: {summarize(no_pity[key])}")
    hit_ssr = sum(x >= SSR_HARD for x in with_pity["first_SSR"]) / trials
    hit_ur = sum(x >= UR_HARD for x in with_pity["first_UR"]) / trials
    print(f"  最初の SSR が確定天井 ({SSR_HARD}) まで出なかった率: {hit_ssr:.1%}")
    print(f"  最初の UR が確定天井 ({UR_HARD}) まで出なかった率: {hit_ur:.1%}")
    print()
    print("## 3. 1セット (60種) の収集に必要なパック数")
    rows = (
        ("base_CR", "C〜R 全種 (48種)"),
        ("base_SR", "C〜SR 全種 (56種)"),
        ("base_SSR", "C〜SSR 全種 (59種) 引きのみ"),
        ("pts_SSR", "C〜SSR 全種 (59種) 交換ポイント併用"),
        ("base_ALL", "全60種 引きのみ"),
        ("pts_ALL", "全60種 交換ポイント併用"),
        ("star2_SSR", "C〜SSR 全種 ★2 (各3枚)"),
        ("star3_SR", "C〜SR 全種 ★3 (各9枚)"),
        ("star3_SSR", "C〜SSR 全種 ★3 (各9枚)"),
        ("star3_ALL", "全60種 ★3 (各9枚)"),
        ("gold", "ゴールド仕上げを初めて引く"),
    )
    for key, label in rows:
        print(f"  {label:<34} {summarize(with_pity[key])}")
    print()
    return with_pity


# ---------------------------------------------------------------------------
# 5. カプセルマシン (有限・非復元)
# ---------------------------------------------------------------------------
def print_capsule() -> None:
    size, price = 50, 60
    print("## 5. カプセルマシン (50個入り・目玉1個・1回 60G・非復元)")
    print(f"  目玉が出るまでの平均回数 {(size + 1) / 2:.1f} 回 / 最悪 {size} 回 (総額 {size * price:,}G で必ず全種)")
    for k in (5, 10, 25, 40):
        print(f"  {k:>2} 回以内に目玉が出る率 {k / size:.0%}  →  残り {size - k} 個のとき次の1回の目玉率 {1 / (size - k):.1%}")
    print()


# ---------------------------------------------------------------------------
# 6. 稼ぎモデルと組み合わせた到達時間
# ---------------------------------------------------------------------------
LOOP_MINUTES = 15  # 遠征 → 店 → 開封 の1日 (1ループ)
SPEND_RATIO = 0.70  # 稼ぎのうちパックに使う割合 (残りは店舗拡張・許可証など)
SET_PRICE = [100, 180, 320, 580, 1050]  # 第1〜第5セットのパック価格
SET_UNLOCK_LOOP = [0, 10, 28, 55, 90]  # 各セットが買えるようになるループ番号


STARTER_PACKS = 5  # チュートリアルで配るパック数。5パック目までに SSR 以上を1枚保証する。


def income(loop: int) -> float:
    """1ループの稼ぎの設計目標値。序盤 800G から多項式的に伸ばす。"""
    return 800 * (1 + loop / 8) ** 1.5


def sim_progress(trials: int, rng: random.Random, hours: int = 40) -> None:
    loops = hours * 60 // LOOP_MINUTES
    marks = [1, 2, 3, 5, 8, 12, 20, 30, 40]
    table = {h: {"packs": [], "kinds": [], "ssr_sets": [], "ur": [], "full_sets": []} for h in marks}
    first_ssr_min, first_ur_h = [], []
    for _ in range(trials):
        openers = [PackOpener(rng) for _ in SET_PRICE]
        owned = [{r: [0] * SET_COUNTS[r] for r in RARITIES} for _ in SET_PRICE]
        opened = [0] * len(SET_PRICE)
        wallet = 0.0
        total = 0
        t_ssr = t_ur = None
        for loop in range(loops):
            wallet += income(loop) * SPEND_RATIO
            if loop == 0:  # チュートリアルの配布パック (初回 SSR 保証つき)
                for k in range(STARTER_PACKS):
                    if k == STARTER_PACKS - 1 and t_ssr is None:
                        openers[0].since_ssr = SSR_HARD - 1
                    cards, _ = openers[0].open()
                    opened[0] += 1
                    total += 1
                    for r, idx, _f in cards:
                        owned[0][r][idx] += 1
                        if r in ("SSR", "UR"):
                            t_ssr = LOOP_MINUTES
                        if r == "UR":
                            t_ur = LOOP_MINUTES / 60
            unlocked = [i for i, u in enumerate(SET_UNLOCK_LOOP) if u <= loop]
            # 予算の 70% を最新セット、30% を未完成の旧セットへ
            newest = unlocked[-1]
            older = [i for i in unlocked[:-1]
                     if any(c < STAR3 for r in RARITIES for c in owned[i][r])]
            plan = {newest: wallet * (0.7 if older else 1.0)}
            for i in older:
                plan[i] = wallet * 0.3 / len(older)
            for i, budget in plan.items():
                k = int(budget // SET_PRICE[i])
                wallet -= k * SET_PRICE[i]
                for _ in range(k):
                    cards, _ = openers[i].open()
                    opened[i] += 1
                    total += 1
                    for r, idx, f in cards:
                        owned[i][r][idx] += 1
                        if r in ("SSR", "UR") and t_ssr is None:
                            t_ssr = (loop + 1) * LOOP_MINUTES
                        if r == "UR" and t_ur is None:
                            t_ur = (loop + 1) * LOOP_MINUTES / 60
                        if owned[i][r][idx] > STAR3:  # ★3 を超えた分は売却
                            wallet += card_value(r, f) * SET_PRICE[i] / PACK_PRICE
            h = (loop + 1) * LOOP_MINUTES / 60
            if h in table:
                row = table[h]
                row["packs"].append(total)
                row["kinds"].append(sum(c > 0 for o in owned for r in RARITIES for c in o[r]))
                row["ssr_sets"].append(sum(
                    missing_cost(o, ["C", "U", "R", "SR", "SSR"]) <= opened[i]
                    for i, o in enumerate(owned)))
                row["full_sets"].append(sum(
                    missing_cost(o, RARITIES) <= opened[i] for i, o in enumerate(owned)))
                row["ur"].append(sum(c > 0 for o in owned for c in o["UR"]))
        first_ssr_min.append(t_ssr if t_ssr is not None else hours * 60)
        first_ur_h.append(t_ur if t_ur is not None else hours)
    print(f"## 6. プレイ時間あたりの到達点 (1ループ {LOOP_MINUTES} 分、稼ぎの {SPEND_RATIO:.0%} をパックへ、試行 {trials})")
    print(f"  最初の SSR 以上まで: 中央 {pct(first_ssr_min, 0.5):.0f} 分 / 90% {pct(first_ssr_min, 0.9):.0f} 分")
    print(f"  最初の UR まで:      中央 {pct(first_ur_h, 0.5):.1f} 時間 / 90% {pct(first_ur_h, 0.9):.1f} 時間")
    print("  時間   1ループの稼ぎ  累計パック  所持種類(/300)  SSRまで完成セット  全種完成セット  UR種類(/5)")
    for h in marks:
        row = table[h]
        if not row["packs"]:
            continue
        loop = h * 60 // LOOP_MINUTES - 1
        print(f"  {h:>3}h   {income(loop):>10,.0f}G  {statistics.fmean(row['packs']):>9,.0f}"
              f"  {statistics.fmean(row['kinds']):>10.0f}  {statistics.fmean(row['ssr_sets']):>14.1f}"
              f"  {statistics.fmean(row['full_sets']):>12.1f}  {statistics.fmean(row['ur']):>9.1f}")
    print()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--trials", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    print(f"# ガチャ・経済シミュレーション (seed={args.seed}, trials={args.trials})\n")
    sim_rates(1_000_000, rng)
    print_collection(args.trials, rng)
    print_capsule()
    sim_progress(max(100, args.trials // 10), rng)


if __name__ == "__main__":
    main()
