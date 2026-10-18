"""Fallback reference photos for players with no usable Commons photo: FIFA.com official World Cup 2026 headshots.

Only used when data/ref_photos/photo_matches.csv says no_photo (Commons stays the first choice). The user approved
this non-CC source for a non-commercial project in which only the cartoon avatar is published; the photo itself stays
in data/ (not deployed).

Identity: the player must appear in FIFA's official 2026 squad list for his team (api.fifa.com) with the same name
(exact after accent folding, or a close match plus the same shirt number). Ambiguous or missing -> keep no_photo.
Download safety: only the image endpoint on digitalhub.fifa.com, ~768px; magic bytes must say JPEG/PNG/WebP and the
file must open with PIL; nothing is executed or unpacked.

Outputs
  data/ref_photos/_web/<player_id>.<ext>   reference photo (local only)
  data/ref_photos/_crops/<player_id>.jpg   head crop used for generation
  data/ref_photos/web_matches.csv          how each fallback was resolved
  data/ref_photos/credits.csv              row with license "reference only (not CC)"
Usage: python3 -I fetch_web_refs.py [--follow] [--race] [--only ID ...]
  --follow  keep running, picking up new Commons no_photo players until the Commons fetch has covered everyone.
"""
import argparse
import csv
import io
import json
import sys
import time
from pathlib import Path

import requests
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_commons_photos as fc  # noqa: E402  (shared name matching, face detection, crops, csv helpers)

ROOT = fc.ROOT
WEB = fc.PHOTOS / "_web"
WEB_MATCHES = fc.PHOTOS / "web_matches.csv"
CROPS_WEB = fc.PHOTOS / "_crops_web"       # head crops from FIFA photos (Commons crops stay in _crops/)
CREDITS_WEB = fc.PHOTOS / "credits_web.csv"  # every FIFA reference, even if Commons later wins credits.csv
FIFA_API = "https://api.fifa.com/api/v3"
WC2026 = {"idCompetition": "17", "idSeason": "285023", "language": "en"}
IMG_PARAMS = "?io=transform:fill,width:768&quality=85"
WEB_LICENSE = fc.WEB_LICENSE
SOURCE = "FIFA.com (FIFA World Cup 2026 official squad photo)"
COLS = ["player_id", "result", "source", "fifa_id", "fifa_name", "jersey", "birth_date", "image_url", "face_px",
        "note"]
MAGIC = {b"\xff\xd8\xff": "jpg", b"\x89PNG\r\n\x1a\n": "png"}

S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0 (compatible; WC26-capsule-avatars/1.0; university course visualization project)"


_last = [0.0]


def polite_get(url, **kw):
    for i in range(6):
        wait = _last[0] + 1.0 - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()
        r = S.get(url, timeout=60, **kw)
        if r.status_code in (429, 500, 502, 503, 504):
            delay = int(r.headers.get("Retry-After", 0) or 0) or 10 * 2 ** i
            print(f"  FIFA {r.status_code}, sleeping {delay}s", flush=True)
            time.sleep(min(delay, 900))
            continue
        r.raise_for_status()
        return r
    raise RuntimeError(f"FIFA gave up on {url}")


def api(path, **params):
    return polite_get(f"{FIFA_API}/{path}", params=params).json()


def desc(field):
    return (field or [{}])[0].get("Description", "")


def squads():
    path = fc.CACHE / "fifa_squads.json"
    if path.exists():
        return json.loads(path.read_text())
    teams = {t["Abbreviation"]: t["IdTeam"] for t in api("competitions/teams/17", idSeason="285023",
                                                           language="en", count=60)["Results"]}
    out = {}
    for code, tid in teams.items():
        out[code] = [{"id": p["IdPlayer"], "name": desc(p["PlayerName"]), "jersey": p.get("JerseyNum"),
                      "birth": (p.get("BirthDate") or "")[:10],
                      "picture": (p.get("PlayerPicture") or {}).get("PictureUrl")}
                     for p in api(f"teams/{tid}/squad", **WC2026)["Players"]]
    path.write_text(json.dumps(out, ensure_ascii=False))
    return out


def find(row, squad):
    shirts = set(row["shirt_numbers"].replace(";", ",").split(","))
    hits = []
    for p in squad:
        sc = fc.name_score(row["display_name"], p["name"])
        same_shirt = str(p["jersey"]) in shirts
        if sc == 100 or (sc >= 85 and same_shirt):
            hits.append((sc, same_shirt, p))
    hits.sort(key=lambda h: (h[0], h[1]), reverse=True)
    if len(hits) > 1 and hits[0][:2] == hits[1][:2]:
        return "ambiguous"
    return hits[0][2] if hits else None


def fetch_image(url, pid):
    """Download one image; keep it only if magic bytes and PIL agree it is a JPEG/PNG/WebP."""
    data = polite_get(url).content
    ext = next((e for m, e in MAGIC.items() if data.startswith(m)), None)
    if ext is None and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        ext = "webp"
    if ext is None:
        raise ValueError(f"not an image ({data[:12]!r})")
    with Image.open(io.BytesIO(data)) as im:
        im.verify()
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        if min(im.size) < 200:
            raise ValueError(f"too small {im.size}")
    WEB.mkdir(parents=True, exist_ok=True)
    for old in WEB.glob(f"{pid}.*"):
        old.unlink()
    dest = WEB / f"{pid}.{ext}"
    dest.write_bytes(data)
    return dest, len(data)


def run_once(only, race=False):
    manifest = list(csv.DictReader(fc.MANIFEST.open(encoding="utf-8")))
    commons = fc.read_csv(fc.MATCHES)
    done = fc.read_csv(WEB_MATCHES)
    todo = [r for r in manifest if commons.get(r["player_id"], {}).get("result") == "no_photo"
            and (r["player_id"] in only if only else r["player_id"] not in done)]
    if race and not only:
        todo += [r for r in reversed(manifest) if r["player_id"] not in commons and r["player_id"] not in done]
    if not todo:
        return manifest, commons
    sq = squads()
    for row in todo:
        pid = row["player_id"]
        if race and fc.read_csv(fc.MATCHES).get(pid, {}).get("result") == "photo":
            continue  # the Commons fetcher got there first
        rec = {"player_id": pid, "source": "FIFA.com"}
        p = find(row, sq.get(row["team_id"], []))
        if p is None or p == "ambiguous":
            rec.update(result="no_photo", note="not found in FIFA 2026 squad" if p is None else "ambiguous FIFA match")
        elif not p["picture"]:
            rec.update(result="no_photo", fifa_id=p["id"], fifa_name=p["name"], note="FIFA has no headshot")
        else:
            url = p["picture"] + IMG_PARAMS
            rec.update(fifa_id=p["id"], fifa_name=p["name"], jersey=p["jersey"], birth_date=p["birth"],
                       image_url=url)
            try:
                dest, size = fetch_image(url, pid)
                boxes = fc.faces(dest)
                q = fc.face_quality(boxes, strict=True)
                if not q:
                    dest.unlink()
                    rec.update(result="no_photo", note="FIFA headshot without one clear face")
                else:
                    fc.make_crop(pid, dest, boxes, CROPS_WEB)
                    rec.update(result="photo", face_px=round(q), note=f"{size // 1024} KB")
                    credit = {"player_id": pid, "file_page_url": url, "author": SOURCE, "license": WEB_LICENSE,
                              "license_url": ""}
                    web_credits = fc.read_csv(CREDITS_WEB)
                    web_credits[pid] = credit
                    fc.write_csv(CREDITS_WEB, list(web_credits.values()), fc.CREDIT_COLS)
                    fc.merge_credits({pid: credit}, keep_commons=True)
            except (requests.RequestException, RuntimeError, ValueError, OSError) as e:
                rec.update(result="no_photo", note=f"download rejected: {e}"[:200])
        done[pid] = rec
        print(f"{pid}: {rec['result']} {rec.get('fifa_name', '')} #{rec.get('jersey', '')} {rec.get('note', '')}",
              flush=True)
        order = {r["player_id"]: i for i, r in enumerate(manifest)}
        fc.write_csv(WEB_MATCHES, sorted(done.values(), key=lambda r: order[r["player_id"]]), COLS)
    return manifest, commons


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--follow", action="store_true")
    ap.add_argument("--race", action="store_true",
                    help="also fetch FIFA headshots for players Commons has not reached yet, from the end of the roster")
    ap.add_argument("--only", nargs="*", default=[])
    a = ap.parse_args()
    while True:
        manifest, commons = run_once(set(a.only), a.race)
        if not a.follow or len(commons) >= len(manifest):
            break
        time.sleep(60)
    if a.follow:
        run_once(set(), a.race)
    res = [r["result"] for r in fc.read_csv(WEB_MATCHES).values()]
    print({k: res.count(k) for k in set(res)})


if __name__ == "__main__":
    main()
