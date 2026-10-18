"""Find and download a freely licensed Wikimedia Commons reference photo for each player.

Identification: for every national team we pull (via the Wikidata SPARQL endpoint) all people who have a
"member of sports team" (P54) statement for that senior national team, then match our roster names against
their labels/aliases. Players we cannot find there fall back to a Wikidata name search that must agree on
occupation (association football player), country (P1532/P27) and a plausible birth year.
Image: Wikidata P18, else Commons files whose structured data says they depict (P180) the player, else
files in the player's Commons category whose title contains the surname. Only CC BY / CC BY-SA / CC0 /
public-domain files are accepted. We download the standard 960px thumbnail, never the original.

Outputs
  data/ref_photos/<player_id>.<ext>   reference photo
  data/ref_photos/credits.csv          player_id, file_page_url, author, license, license_url
  data/ref_photos/photo_matches.csv    how each player was resolved (photo | no_photo + reason)
  data/ref_photos/_cache/*.json        cached SPARQL results per team
Usage: python3 -I fetch_commons_photos.py [--priority 1,2] [--limit N] [--refresh PLAYER_ID ...]
"""
import argparse
import csv
import difflib
import fcntl
import html
import json
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

import requests
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "data" / "avatar_manifest.csv"
PHOTOS = ROOT / "data" / "ref_photos"
CACHE = PHOTOS / "_cache"
CROPS = PHOTOS / "_crops"
TMP = PHOTOS / "_tmp"
AVOID = PHOTOS / "avoid_files.txt"  # Commons file names judged unsuitable on manual review
CREDITS = PHOTOS / "credits.csv"
MATCHES = PHOTOS / "photo_matches.csv"

UA = "WC26-capsule-avatars/1.0 (university course visualization project; python-requests)"
S = requests.Session()
S.headers["User-Agent"] = UA
WD_API = "https://www.wikidata.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
SPARQL = "https://query.wikidata.org/sparql"
THUMB_WIDTH = 960  # a standard Wikimedia thumbnail bucket (~800px requested)

# English Wikipedia article for each senior men's national team (redirects are resolved).
TEAM_ARTICLES = {
    "ALG": "Algeria national football team", "ARG": "Argentina national football team",
    "AUS": "Australia men's national soccer team", "AUT": "Austria national football team",
    "BEL": "Belgium national football team", "BIH": "Bosnia and Herzegovina national football team",
    "BRA": "Brazil national football team", "CAN": "Canada men's national soccer team",
    "CIV": "Ivory Coast national football team", "COD": "DR Congo national football team",
    "COL": "Colombia national football team", "CPV": "Cape Verde national football team",
    "CRO": "Croatia national football team", "CUW": "Curaçao national football team",
    "CZE": "Czech Republic national football team", "ECU": "Ecuador national football team",
    "EGY": "Egypt national football team", "ENG": "England national football team",
    "ESP": "Spain national football team", "FRA": "France national football team",
    "GER": "Germany national football team", "GHA": "Ghana national football team",
    "HAI": "Haiti national football team", "IRN": "Iran national football team",
    "IRQ": "Iraq national football team", "JOR": "Jordan national football team",
    "JPN": "Japan national football team", "KOR": "South Korea national football team",
    "KSA": "Saudi Arabia national football team", "MAR": "Morocco national football team",
    "MEX": "Mexico national football team", "NED": "Netherlands national football team",
    "NOR": "Norway national football team", "NZL": "New Zealand men's national football team",
    "PAN": "Panama national football team", "PAR": "Paraguay national football team",
    "POR": "Portugal national football team", "QAT": "Qatar national football team",
    "RSA": "South Africa national soccer team", "SCO": "Scotland national football team",
    "SEN": "Senegal national football team", "SUI": "Switzerland national football team",
    "SWE": "Sweden men's national football team", "TUN": "Tunisia national football team",
    "TUR": "Turkey national football team", "URU": "Uruguay national football team",
    "USA": "United States men's national soccer team", "UZB": "Uzbekistan national football team",
}
FOOTBALLER = "Q937857"
MIN_DOB = "1983"  # oldest plausible 2026 World Cup player
FREE_LICENSE = re.compile(r"^(cc[ -]by(-sa)?([ -][\d.]+)?|cc0|public domain|pd\b|attribution)", re.I)
LANGS = ["en", "mul", "es", "pt", "fr", "de", "nl", "it", "tr", "hr", "cs", "sv", "nb", "pl", "ro", "ca"]


_last_call = {"api": 0.0, "media": 0.0}
MIN_INTERVAL = {"api": 1.5, "media": 5.0}  # seconds between calls; Wikimedia answers 429 when we go faster
MAX_RETRY_AFTER = 900


def throttle(kind="api"):
    wait = _last_call[kind] + MIN_INTERVAL[kind] - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_call[kind] = time.monotonic()


def get(url, params, tries=8):
    for i in range(tries):
        throttle()
        try:
            r = S.get(url, params=params, timeout=90)
            if r.status_code in (429, 503, 502, 504):
                wait = int(r.headers.get("Retry-After", 0) or 0) or 5 * 2 ** i
                wait = min(wait, MAX_RETRY_AFTER)
                print(f"  {r.status_code} from {url}, sleeping {wait}s", file=sys.stderr, flush=True)
                time.sleep(wait)
                continue
            r.raise_for_status()
            data = r.json() if "json" in r.headers.get("Content-Type", "") else r
            if isinstance(data, dict) and data.get("error", {}).get("code") == "maxlag":
                time.sleep(5 * 2 ** i)
                continue
            return data
        except requests.RequestException as e:
            print(f"  request error {e}, retry", file=sys.stderr)
            time.sleep(5 * 2 ** i)
    raise RuntimeError(f"giving up on {url} {params}")


# ---------------------------------------------------------------- names
_SPECIAL = str.maketrans({"ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "ß": "ss", "ı": "i", "İ": "i", "đ": "d",
                          "Đ": "d", "ł": "l", "Ł": "l", "œ": "oe", "Œ": "oe", "þ": "th", "ð": "d"})


def tokens(name):
    s = unicodedata.normalize("NFKD", name.translate(_SPECIAL))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s.replace("'", "").replace("’", "").replace("-", ""))
    return [t for t in s.split() if t]


def surname_tokens(display):
    """Roster names write the surname in capitals: 'Marc GUEHI' -> ['guehi']."""
    words = display.split()
    caps = [w for w in words if w.isupper() and len(w) > 1]
    if 0 < len(caps) < len(words):
        return tokens(" ".join(caps)), tokens(" ".join(w for w in words if w not in caps))
    return [], []


def has_run(toks, joined):
    """True if some run of consecutive whole tokens spells `joined` ('van','hecke' ~ 'vanhecke'; never 'ito' in 'hitoshi')."""
    return any("".join(toks[i:j]) == joined for i in range(len(toks)) for j in range(i + 1, len(toks) + 1))


def name_score(display, cand):
    td, tc = tokens(display), tokens(cand)
    if not td or not tc:
        return 0
    cd, cc = "".join(td), "".join(tc)
    if cd == cc:
        return 100
    if len(td) >= 2 and set(td) <= set(tc):
        return 90
    if len(tc) >= 2 and set(tc) <= set(td):
        return 85
    sur, given = surname_tokens(display)
    if sur and has_run(tc, "".join(sur)) and given and len(td) >= 2 and \
            (tc[0] == given[0] or (len(tc[0]) == 1 and tc[0] == given[0][:1])):
        return 75
    if len(td) >= 2 and difflib.SequenceMatcher(None, cd, cc).ratio() >= 0.88:
        return 72
    return 0


# ---------------------------------------------------------------- wikidata
def team_qids():
    path = CACHE / "teams.json"
    if path.exists():
        return json.loads(path.read_text())
    out = {}
    titles = list(TEAM_ARTICLES.items())
    for i in range(0, len(titles), 15):
        chunk = titles[i:i + 15]
        d = get(WD_API, {"action": "wbgetentities", "sites": "enwiki", "redirects": "yes", "props": "sitelinks|claims",
                         "sitefilter": "enwiki", "titles": "|".join(t for _, t in chunk), "format": "json"})
        by_title = {}
        for qid, ent in d["entities"].items():
            if qid.startswith("Q"):
                title = ent["sitelinks"]["enwiki"]["title"]
                countries = [c["mainsnak"]["datavalue"]["value"]["id"] for p in ("P17", "P1532")
                             for c in ent.get("claims", {}).get(p, []) if "datavalue" in c["mainsnak"]]
                by_title[title] = {"qid": qid, "countries": countries, "title": title}
        for tid, t in chunk:
            # redirect targets may differ from the requested title; match loosely
            hit = by_title.get(t) or next((v for k, v in by_title.items() if k.split()[0] in t), None)
            out[tid] = hit
    missing = [t for t, v in out.items() if not v]
    if missing:
        raise SystemExit(f"could not resolve national team items for {missing}")
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    return out


def team_people(team_id, team_qid):
    path = CACHE / f"people_{team_id}.json"
    if path.exists():
        return json.loads(path.read_text())
    langs = ", ".join(f'"{l}"' for l in LANGS)
    q = f"""
SELECT ?p ?name ?img ?dob ?end ?cat WHERE {{
  ?p p:P54 ?st . ?st ps:P54 wd:{team_qid} .
  OPTIONAL {{ ?st pq:P582 ?end }}
  ?p wdt:P31 wd:Q5 .
  OPTIONAL {{ ?p wdt:P569 ?dob }}
  FILTER(!BOUND(?dob) || YEAR(?dob) >= 1979)
  {{ ?p rdfs:label ?name }} UNION {{ ?p skos:altLabel ?name }}
  FILTER(LANG(?name) IN ({langs}))
  OPTIONAL {{ ?p wdt:P18 ?img }}
  OPTIONAL {{ ?p wdt:P373 ?cat }}
}}"""
    d = get(SPARQL, {"query": q, "format": "json"})
    people = {}
    for b in d["results"]["bindings"]:
        qid = b["p"]["value"].rsplit("/", 1)[1]
        e = people.setdefault(qid, {"names": [], "imgs": [], "dob": None, "ends": [], "cat": None})
        if b["name"]["value"] not in e["names"]:
            e["names"].append(b["name"]["value"])
        if "img" in b:
            f = requests.utils.unquote(b["img"]["value"].rsplit("/", 1)[1]).replace("_", " ")
            if f not in e["imgs"]:
                e["imgs"].append(f)
        if "dob" in b:
            e["dob"] = b["dob"]["value"][:10]
        e["ends"].append(b["end"]["value"][:10] if "end" in b else None)
        if "cat" in b:
            e["cat"] = b["cat"]["value"]
    for e in people.values():
        e["current"] = any(x is None or x >= "2022" for x in e["ends"])
        del e["ends"]
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(people, ensure_ascii=False))
    time.sleep(1)
    return people


def country_pool(team_id, team):
    """All footballers born 1985+ whose sporting country / citizenship is the team's country."""
    path = CACHE / f"country_{team_id}.json"
    if path.exists():
        return json.loads(path.read_text())
    values = " ".join(f"wd:{c}" for c in dict.fromkeys(team["countries"]))
    q = f"""
SELECT ?p ?name ?dob ?gk WHERE {{
  VALUES ?c {{ {values} }}
  {{ ?p wdt:P1532 ?c }} UNION {{ ?p wdt:P27 ?c }}
  ?p wdt:P106 wd:{FOOTBALLER} ; wdt:P569 ?dob .
  FILTER(YEAR(?dob) >= 1985)
  OPTIONAL {{ ?p wdt:P413 wd:Q201330 . BIND(true AS ?gk) }}
  {{ ?p rdfs:label ?name FILTER(LANG(?name) IN ("en", "mul")) }} UNION
  {{ ?p skos:altLabel ?name FILTER(LANG(?name) = "en") }}
}}"""
    d = get(SPARQL, {"query": q, "format": "json"})
    people = {}
    for b in d["results"]["bindings"]:
        qid = b["p"]["value"].rsplit("/", 1)[1]
        e = people.setdefault(qid, {"names": [], "dob": b["dob"]["value"][:10], "gk": False})
        if b["name"]["value"] not in e["names"]:
            e["names"].append(b["name"]["value"])
        e["gk"] = e["gk"] or "gk" in b
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(people, ensure_ascii=False))
    return people


def match_country_pool(display, position, pool):
    """Stricter than the national-team match: unique hit, score >= 85 (fuzzy only if born 1990+), GK consistent."""
    scored = []
    for qid, e in pool.items():
        if (position == "GK") != e["gk"]:
            continue
        sc = max(name_score(display, n) for n in e["names"])
        if sc >= 85 or (sc >= 72 and e["dob"] >= "1990"):
            scored.append((sc, qid))
    if not scored:
        return None
    scored.sort(reverse=True)
    if len(scored) > 1 and scored[1][0] == scored[0][0]:
        return "ambiguous", [q for sc, q in scored if sc == scored[0][0]]
    sc, qid = scored[0]
    e = entity_summary(qid)
    return qid, {"names": e["names"], "imgs": e["imgs"], "dob": e["dob"], "cat": e["cat"], "current": True,
                 "score": sc, "method": "country-pool"}


def entity_summary(qid):
    d = get(WD_API, {"action": "wbgetentities", "ids": qid, "props": "labels|aliases|claims|descriptions",
                     "languages": "en", "format": "json"})
    ent = d["entities"][qid]
    cl = ent.get("claims", {})

    def ids(p):
        return [c["mainsnak"]["datavalue"]["value"]["id"] for c in cl.get(p, []) if "datavalue" in c["mainsnak"]]

    def strs(p):
        return [c["mainsnak"]["datavalue"]["value"] for c in cl.get(p, []) if "datavalue" in c["mainsnak"]]
    dob = next((c["mainsnak"]["datavalue"]["value"]["time"][1:11] for c in cl.get("P569", [])
                if "datavalue" in c["mainsnak"]), None)
    return {"occupations": ids("P106"), "countries": ids("P1532") + ids("P27"), "dob": dob,
            "imgs": strs("P18"), "cat": (strs("P373") or [None])[0], "teams": ids("P54"),
            "names": [ent.get("labels", {}).get("en", {}).get("value", "")] +
                     [a["value"] for a in ent.get("aliases", {}).get("en", [])]}


def search_fallback(display, team):
    """Name search for players without a national-team P54 statement; strict checks."""
    found = []
    for q in {display, " ".join(w.capitalize() for w in display.split())}:
        d = get(WD_API, {"action": "wbsearchentities", "search": q, "language": "en", "type": "item",
                         "limit": 10, "format": "json"})
        for hit in d.get("search", []):
            desc = hit.get("description", "").lower()
            if "football" in desc or "soccer" in desc:
                found.append(hit["id"])
    best = []
    for qid in dict.fromkeys(found):
        e = entity_summary(qid)
        if FOOTBALLER not in e["occupations"]:
            continue
        if not set(e["countries"]) & set(team["countries"]):
            continue
        if e["dob"] and e["dob"][:4] < "1983":
            continue
        sc = max(name_score(display, n) for n in e["names"] if n)
        if sc >= 85:
            best.append((sc, qid, e))
        time.sleep(0.3)
    best.sort(key=lambda x: -x[0])
    if not best:
        return None
    if len(best) > 1 and best[1][0] == best[0][0]:
        return "ambiguous", [b[1] for b in best]
    sc, qid, e = best[0]
    return qid, {"names": e["names"], "imgs": e["imgs"], "dob": e["dob"], "cat": e["cat"], "current": True,
                 "score": sc, "method": "search"}


_FIFA = {}


def fifa_birth(row):
    """Birth date of this roster player in FIFA's official 2026 squad list (cached by fetch_web_refs.py), or None."""
    if not _FIFA:
        path = CACHE / "fifa_squads.json"
        _FIFA.update(json.loads(path.read_text()) if path.exists() else {"_": []})
    shirts = set(row["shirt_numbers"].replace(";", ",").split(","))
    hits = [p for p in _FIFA.get(row["team_id"], [])
            if name_score(row["display_name"], p["name"]) == 100
            or (name_score(row["display_name"], p["name"]) >= 85 and str(p["jersey"]) in shirts)]
    return hits[0]["birth"] if len(hits) == 1 and hits[0]["birth"] else None


def birth_conflict(row, dob):
    """Wikidata and FIFA disagree by more than a year -> we matched someone else (or Wikidata is wrong)."""
    fb = fifa_birth(row)
    return bool(fb and dob and abs(int(fb[:4]) - int(dob[:4])) > 1) and fb


def match_player(display, people):
    scored = []
    for qid, e in people.items():
        if e["dob"] and e["dob"] < MIN_DOB:
            continue
        sc = max(name_score(display, n) for n in e["names"])
        if sc:
            scored.append((sc, e["current"], e["dob"] or "", qid))
    if not scored:
        return None
    scored.sort(reverse=True)
    top = scored[0]
    if top[0] < 72:
        return None
    rivals = [s for s in scored[1:] if s[0] == top[0] and s[1] == top[1]]
    if rivals:
        return "ambiguous", [top[3]] + [r[3] for r in rivals]
    e = dict(people[top[3]], score=top[0], method="national-team")
    return top[3], e


# ---------------------------------------------------------------- commons
def depicts_files(qid):
    d = get(COMMONS_API, {"action": "query", "list": "search", "srsearch": f"haswbstatement:P180={qid}",
                          "srnamespace": 6, "srlimit": 20, "format": "json"})
    return [h["title"][5:] for h in d.get("query", {}).get("search", [])]


def category_files(cat, surname):
    d = get(COMMONS_API, {"action": "query", "list": "categorymembers", "cmtitle": f"Category:{cat}",
                          "cmtype": "file", "cmlimit": 100, "format": "json"})
    files = [m["title"][5:] for m in d.get("query", {}).get("categorymembers", [])]
    return [f for f in files if surname and surname in "".join(tokens(f))]


INFO_CACHE = {}


def image_infos(files):
    out = {f: INFO_CACHE[f] for f in files if f in INFO_CACHE}
    files = [f for f in files if f not in INFO_CACHE]
    for i in range(0, len(files), 40):
        d = get(COMMONS_API, {"action": "query", "titles": "|".join("File:" + f for f in files[i:i + 40]),
                              "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata|timestamp",
                              "iiurlwidth": THUMB_WIDTH, "format": "json"})
        norm = {n["to"]: n["from"] for n in d["query"].get("normalized", [])}
        for p in d["query"]["pages"].values():
            if "imageinfo" not in p:
                continue
            ii = p["imageinfo"][0]
            md = {k: v.get("value", "") for k, v in ii.get("extmetadata", {}).items()}
            title = norm.get(p["title"], p["title"])[5:]
            out[title] = {
                "page": ii["descriptionurl"], "thumb": ii.get("thumburl") or ii["url"], "mime": ii["mime"],
                "w": ii["width"], "h": ii["height"],
                "license": html.unescape(re.sub(r"<[^>]+>", "", md.get("LicenseShortName", ""))).strip(),
                "license_url": md.get("LicenseUrl", ""),
                "author": re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", md.get("Artist", "")
                                                                   or md.get("Credit", "")))).strip(),
                "date": (re.findall(r"\d{4}-\d{2}-\d{2}", md.get("DateTimeOriginal", "") + " " +
                                    md.get("DateTime", "")) or [""])[0],
            }
            INFO_CACHE[title] = out[title]
    return out


def usable(info):
    return (info["mime"] in ("image/jpeg", "image/png", "image/webp", "image/tiff")
            and min(info["w"], info["h"]) >= 200 and FREE_LICENSE.match(info["license"] or ""))


def plausible(fname, info, person, surname):
    """Structured-data 'depicts' tags are sometimes wrong (a 2013 skier tagged as a 2002-born goalkeeper)."""
    named = surname and surname in "".join(tokens(fname))
    year, born = info["date"][:4], (person.get("dob") or "")[:4]
    if year.isdigit() and born.isdigit():
        return int(year) - int(born) >= 15 and (named or int(year) >= int(born) + 17)
    return bool(named)


def image_candidates(qid, person, display):
    """Yield usable (source, file, info) in preference order: P18, then depicts, then category files."""
    sur, _ = surname_tokens(display)
    surname = "".join(sur or tokens(display)[-1:])
    tried = []
    avoid = set(AVOID.read_text(encoding="utf-8").splitlines()) if AVOID.exists() else set()
    for source, files in (("P18", lambda: person["imgs"]), ("depicts", lambda: depicts_files(qid)),
                          ("category", lambda: category_files(person["cat"], surname) if person["cat"] else [])):
        files = [f for f in files() if f not in tried]
        tried += files
        if not files:
            continue
        infos = image_infos(files)
        ok = [(f, infos[f]) for f in files if f in infos and usable(infos[f]) and f not in avoid
              and (source == "P18" or plausible(f, infos[f], person, surname))]
        if source != "P18":  # rank alternates: face crops first, then newest
            ok.sort(key=lambda x: ("cropped" in x[0].lower(), x[1]["date"]), reverse=True)
        for f, info in ok:
            yield source, f, info


# ---------------------------------------------------------------- faces & crops
FACE_BIN = Path(__file__).resolve().parent / ".bin" / "face_boxes"
GOOD_FACE_PX = 140
SMALL_FACE_PX = 110
MIN_FACE_PX = 60     # smaller than this (after the larger-thumbnail retry) is not a usable reference  # below this we fetch a larger standard thumbnail (1280/1920) of the chosen file   # face box height (Vision, brow-to-chin) we consider a clear reference
MAX_TRIES = 5        # candidate photos downloaded per player at most


def faces(path):
    if not FACE_BIN.exists():
        subprocess.run(["swiftc", "-O", "-o", str(FACE_BIN), str(FACE_BIN.parent.parent / "face_boxes.swift")],
                       check=True)
    out = subprocess.run([str(FACE_BIN), str(path)], capture_output=True, text=True, timeout=60).stdout
    d = json.loads(out.strip().splitlines()[-1])
    return sorted(d.get("faces", []), key=lambda b: -b[3])


def face_quality(boxes, strict):
    """Height in px of the subject's face, or 0 if no single dominant face."""
    if not boxes:
        return 0
    big = boxes[0][3]
    if len(boxes) > 1 and boxes[1][3] >= (0.6 if strict else 0.85) * big:
        return 0
    return big


def make_crop(pid, path, boxes, dest_dir=None):
    """Square head-and-collar crop around the largest face, saved to _crops/<pid>.jpg for generation."""
    dest_dir = dest_dir or CROPS
    dest_dir.mkdir(parents=True, exist_ok=True)
    im = ImageOps.exif_transpose(Image.open(path))
    if im.mode in ("P", "LA", "RGBA", "PA") and (im.mode != "P" or "transparency" in im.info):
        im = im.convert("RGBA")  # cut-out headshots: flatten onto neutral grey, not the palette's fill colour
        flat = Image.new("RGB", im.size, (221, 221, 221))
        flat.paste(im, mask=im.getchannel("A"))
        im = flat
    im = im.convert("RGB")
    W, H = im.size
    if boxes:
        x, y, w, h = boxes[0][:4]
        side = min(max(3.2 * h, 2.6 * w), W, H)
        cx, cy = x + w / 2, y + h / 2 - 0.12 * h
        left = min(max(cx - side / 2, 0), W - side)
        top = min(max(cy - side / 2, 0), H - side)
        im = im.crop((round(left), round(top), round(left + side), round(top + side)))
    dest = dest_dir / f"{pid}.jpg"
    im.save(dest, quality=92)
    return dest


def download(url, dest):
    for i in range(8):
        throttle("media")
        r = S.get(url, timeout=120)
        if r.status_code == 429 or r.status_code >= 500:
            wait = min(int(r.headers.get("Retry-After", 0) or 0) or 10 * 2 ** i, MAX_RETRY_AFTER)
            print(f"  {r.status_code} on download, sleeping {wait}s", file=sys.stderr, flush=True)
            time.sleep(wait)
            continue
        r.raise_for_status()
        dest.write_bytes(r.content)
        return len(r.content)
    raise RuntimeError(f"download failed {url}")


# ---------------------------------------------------------------- csv io
def read_csv(path, key="player_id"):
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as f:
        return {r[key]: r for r in csv.DictReader(f)}


def write_csv(path, rows, cols):
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})
    tmp.replace(path)


WEB_LICENSE = "reference only (not CC)"  # fallback references written by fetch_web_refs.py
CREDITS_LOCK = PHOTOS / ".credits.lock"


def merge_credits(updates, removals=(), keep_commons=False):
    """Locked read-modify-write of credits.csv so both fetchers can update it; web rows survive Commons removals."""
    CREDITS_LOCK.touch(exist_ok=True)
    with CREDITS_LOCK.open("r+") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        rows = read_csv(CREDITS)
        for pid, row in updates.items():
            if not (keep_commons and pid in rows and rows[pid]["license"] != WEB_LICENSE):
                rows[pid] = row
        for pid in removals:
            if pid in rows and rows[pid]["license"] != WEB_LICENSE:
                del rows[pid]
        order = {r["player_id"]: i for i, r in enumerate(csv.DictReader(MANIFEST.open(encoding="utf-8")))}
        write_csv(CREDITS, sorted(rows.values(), key=lambda r: order[r["player_id"]]), CREDIT_COLS)


MATCH_COLS = ["player_id", "result", "qid", "wd_name", "dob", "method", "score", "source", "file", "face_px",
              "note"]
CREDIT_COLS = ["player_id", "file_page_url", "author", "license", "license_url"]


WEB_MATCHES = PHOTOS / "web_matches.csv"


def web_photo(pid):
    return read_csv(WEB_MATCHES).get(pid, {}).get("result") == "photo"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--priority", default="1,2,3,4")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--refresh", nargs="*", default=[], help="re-resolve these player ids")
    ap.add_argument("--only", nargs="*", default=[], help="restrict to these player ids")
    args = ap.parse_args()
    prios = set(args.priority.split(","))

    PHOTOS.mkdir(parents=True, exist_ok=True)
    roster = [r for r in csv.DictReader(MANIFEST.open(encoding="utf-8")) if r["priority"] in prios]
    if args.only:
        roster = [r for r in roster if r["player_id"] in args.only]
    if args.limit:
        roster = roster[:args.limit]
    matches, credits = read_csv(MATCHES), read_csv(CREDITS)
    teams = team_qids()

    touched = set()

    def save():
        order = {r["player_id"]: i for i, r in enumerate(csv.DictReader(MANIFEST.open(encoding="utf-8")))}
        write_csv(MATCHES, sorted(matches.values(), key=lambda r: order[r["player_id"]]), MATCH_COLS)
        merge_credits({pid: credits[pid] for pid in touched if pid in credits},
                      [pid for pid in touched if pid not in credits])
        touched.clear()

    resolved = {}

    def resolve(row):
        if row["player_id"] not in resolved:
            people = team_people(row["team_id"], teams[row["team_id"]]["qid"])
            resolved[row["player_id"]] = (match_player(row["display_name"], people)
                                          or match_country_pool(row["display_name"], row["position"],
                                                                country_pool(row["team_id"], teams[row["team_id"]]))
                                          or search_fallback(row["display_name"], teams[row["team_id"]]))
        return resolved[row["player_id"]]

    todo = [r for r in roster if r["player_id"] not in matches or r["player_id"] in args.refresh]
    for n, row in enumerate(roster, 1):
        pid, display, tid = row["player_id"], row["display_name"], row["team_id"]
        if row in todo and todo.index(row) % 40 == 0:
            batch = todo[todo.index(row):todo.index(row) + 40]
            p18 = [f for r in batch for m in [resolve(r)] if m and m[0] != "ambiguous" for f in m[1]["imgs"]]
            image_infos(p18)
        if pid not in matches and pid not in args.refresh and web_photo(pid):
            matches[pid] = {"player_id": pid, "result": "skipped", "note": "FIFA headshot found first"}
            touched.discard(pid)
            print(f"[{n}/{len(roster)}] {pid}: skipped (FIFA headshot found first)", flush=True)
            continue
        if pid in matches and pid not in args.refresh:
            rec = matches[pid]
            if rec["result"] == "photo" and not (CROPS / f"{pid}.jpg").exists():
                src = next(p for p in PHOTOS.glob(f"{pid}.*"))
                boxes = faces(src)
                make_crop(pid, src, boxes)
                rec["face_px"] = round(face_quality(boxes, strict=False))
            continue
        for old in list(PHOTOS.glob(f"{pid}.*")) + list(CROPS.glob(f"{pid}.*")):
            old.unlink()
        credits.pop(pid, None)
        touched.add(pid)
        m = resolve(row)
        rec = {"player_id": pid}
        if m is None:
            rec.update(result="no_photo", note="no confident Wikidata match")
        elif m[0] == "ambiguous":
            rec.update(result="no_photo", note="ambiguous Wikidata match: " + " ".join(m[1]))
        else:
            qid, person = m
            rec.update(qid=qid, wd_name=person["names"][0], dob=person["dob"] or "", method=person["method"],
                       score=person["score"])
            conflict = birth_conflict(row, person["dob"])
        if m is not None and m[0] != "ambiguous" and conflict:
            rec.update(result="no_photo", note=f"Wikidata birth date {person['dob']} disagrees with FIFA {conflict}")
        elif m is not None and m[0] != "ambiguous":
            best, tried = None, 0
            TMP.mkdir(parents=True, exist_ok=True)
            for source, fname, info in image_candidates(qid, person, display):
                ext = "png" if info["thumb"].lower().split("?")[0].endswith(".png") else \
                    {"image/png": "png", "image/webp": "webp"}.get(info["mime"], "jpg")
                tmp = TMP / f"{pid}_{tried}.{ext}"
                size = download(info["thumb"], tmp)
                boxes = faces(tmp)
                q = face_quality(boxes, strict=source != "P18")
                cand = (q, tried, source, fname, info, tmp, boxes, size)
                if best is None or q > best[0]:
                    best = cand
                tried += 1
                if q >= GOOD_FACE_PX or tried >= MAX_TRIES:
                    break
            if not best:
                rec.update(result="no_photo", note="no freely licensed Commons photo")
            elif best[0] == 0:
                # never guess who is who in a group shot, or use a photo where no face is visible
                rec.update(result="no_photo", note=f"no Commons photo with one clear face ({tried} checked)")
            elif best[0] < MIN_FACE_PX:
                rec.update(result="no_photo", note=f"Commons face too small ({round(best[0])}px, {tried} checked)")
            else:
                q, _, source, fname, info, tmp, boxes, size = best
                if 0 < q < SMALL_FACE_PX and info["w"] > THUMB_WIDTH * 1.3 and f"/{THUMB_WIDTH}px-" in info["thumb"]:
                    # small face: take the next standard thumbnail bucket so the head crop has enough pixels
                    bucket = 1920 if info["w"] >= 1920 else 1280
                    hi = TMP / f"{pid}_hi{tmp.suffix}"
                    size = download(info["thumb"].replace(f"/{THUMB_WIDTH}px-", f"/{bucket}px-"), hi)
                    hi_boxes = faces(hi)
                    if face_quality(hi_boxes, strict=False) > q:
                        tmp, boxes, q = hi, hi_boxes, face_quality(hi_boxes, strict=False)
                dest = PHOTOS / f"{pid}{tmp.suffix}"
                tmp.replace(dest)
                make_crop(pid, dest, boxes)
                rec.update(result="photo", source=source, file=fname, face_px=round(q),
                           note=f"{size // 1024} KB, {info['date']}")
                credits[pid] = {"player_id": pid, "file_page_url": info["page"], "author": info["author"],
                                "license": info["license"], "license_url": info["license_url"]}
            for leftover in TMP.glob(f"{pid}_*"):
                leftover.unlink()
        matches[pid] = rec
        print(f"[{n}/{len(roster)}] {pid}: {rec['result']} {rec.get('qid', '')} {rec.get('wd_name', '')} "
              f"{rec.get('file', '')} {rec.get('note', '')}", flush=True)
        if n % 5 == 0:
            save()
    save()
    res = [matches[r["player_id"]]["result"] for r in roster if r["player_id"] in matches]
    print({k: res.count(k) for k in set(res)})


if __name__ == "__main__":
    main()
