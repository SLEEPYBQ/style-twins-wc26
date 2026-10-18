"""Tile reference photos and/or avatars into labelled contact sheets for visual QC.

Usage: python3 -I avatar_contact_sheet.py OUT_PREFIX [--refs [--crops]] [--avatars] [--cols 6] [--per 24] PLAYER_ID ...
Each tile shows the reference photo (left) and/or the generated avatar PNG (right) with the player id below.
Writes OUT_PREFIX_01.jpg, OUT_PREFIX_02.jpg, ... and prints their paths.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "data" / "ref_photos"
AVATARS = ROOT / "web" / "img" / "avatars"
CELL = 300


def load(path):
    if path and path.exists():
        im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        return ImageOps.pad(im, (CELL, CELL), color=(40, 40, 40))
    im = Image.new("RGB", (CELL, CELL), (90, 90, 90))
    ImageDraw.Draw(im).text((10, CELL // 2), "missing", fill="white")
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--refs", action="store_true")
    ap.add_argument("--avatars", action="store_true")
    ap.add_argument("--crops", action="store_true", help="show the head crop used for generation instead of the photo")
    ap.add_argument("--cols", type=int, default=0)
    ap.add_argument("--per", type=int, default=24)
    ap.add_argument("--cell", type=int, default=300, help="tile size in px")
    a = ap.parse_args()
    global CELL
    CELL = a.cell
    kinds = [k for k, on in (("ref", a.refs), ("ava", a.avatars)) if on] or ["ref", "ava"]
    cols = a.cols or (4 if len(kinds) == 2 else 6)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    tile_w, tile_h = CELL * len(kinds) + 8, CELL + 30
    for page, start in enumerate(range(0, len(a.ids), a.per), 1):
        ids = a.ids[start:start + a.per]
        rows = (len(ids) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tile_w, rows * tile_h), (255, 255, 255))
        d = ImageDraw.Draw(sheet)
        for i, pid in enumerate(ids):
            x, y = (i % cols) * tile_w, (i // cols) * tile_h
            for j, k in enumerate(kinds):
                if k == "ref" and a.crops:
                    path = PHOTOS / "_crops" / f"{pid}.jpg"
                elif k == "ref":
                    path = next(iter(sorted(p for p in PHOTOS.glob(f"{pid}.*") if p.suffix != ".csv")), None)
                else:
                    path = AVATARS / f"{pid}.png"
                sheet.paste(load(path), (x + j * CELL, y))
            d.text((x + 4, y + CELL + 4), f"{start + i + 1}. {pid}", fill="black", font=font)
        out = Path(f"{a.out}_{page:02d}.jpg")
        sheet.save(out, quality=85)
        print(out)


if __name__ == "__main__":
    main()
