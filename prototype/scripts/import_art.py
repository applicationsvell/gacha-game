#!/usr/bin/env python3
"""カード絵を取り込む。縮小して WebP にし、src/art/<カードID>.webp に置く。

    python3 scripts/import_art.py art-raw            # gen-art.ts が作った画像
    python3 scripts/import_art.py ~/Downloads/絵     # 手で作った画像

ファイル名は、カードID(s1-001.png)かカード名(ぷるスライム.png)にする。
「s1-001-2.png」のような案の番号つきは、--pick s1-001=2 で選んだものだけ取り込む。
縦横比が違う画像は、中央を 5:4 に切り抜く。
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SET_FILE = ROOT / "src" / "data" / "set1.ts"
OUT = ROOT / "src" / "art"
W, H = 640, 512  # 5:4
EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def card_names() -> dict[str, str]:
    """カード名 → カードID。set1.ts の並び順から作る"""
    rows = re.findall(r'^\s*\["([^"]+)", "(?:C|U|R|SR|SSR|UR)"', SET_FILE.read_text(encoding="utf-8"), re.M)
    return {name: f"s1-{i + 1:03d}" for i, name in enumerate(rows)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("src", type=Path)
    ap.add_argument("--pick", action="append", default=[], help="案の番号を選ぶ。例: s1-001=2")
    ap.add_argument("--quality", type=int, default=82)
    a = ap.parse_args()

    names = card_names()
    ids = set(names.values())
    picks = dict(p.split("=") for p in a.pick)
    OUT.mkdir(parents=True, exist_ok=True)
    done, skipped = 0, []
    for f in sorted(a.src.iterdir()):
        if f.suffix.lower() not in EXTS:
            continue
        stem = f.stem
        m = re.fullmatch(r"(s1-\d{3})(?:-(\d+))?", stem)
        if m:
            cid, variant = m.group(1), m.group(2)
        elif stem in names:
            cid, variant = names[stem], None
        else:
            skipped.append(f.name)
            continue
        if cid not in ids:
            skipped.append(f.name)
            continue
        if variant is not None and picks.get(cid) != variant:
            continue  # 選ばれていない案
        img = Image.open(f).convert("RGB")
        # 中央を 5:4 に切り抜いてから縮小する
        r = img.width / img.height
        if r > W / H:
            nw = int(img.height * W / H)
            img = img.crop(((img.width - nw) // 2, 0, (img.width - nw) // 2 + nw, img.height))
        else:
            nh = int(img.width * H / W)
            img = img.crop((0, (img.height - nh) // 2, img.width, (img.height - nh) // 2 + nh))
        img = img.resize((W, H), Image.LANCZOS)
        out = OUT / f"{cid}.webp"
        img.save(out, "WEBP", quality=a.quality, method=6)
        done += 1
        print(f"✓ {f.name} → {out.relative_to(ROOT)} ({out.stat().st_size // 1024}KB)")
    print(f"{done} 枚を取り込んだ")
    if skipped:
        print("カードと対応しないので飛ばした:", ", ".join(skipped), file=sys.stderr)


if __name__ == "__main__":
    main()
