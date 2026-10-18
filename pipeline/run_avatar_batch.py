"""Resumable capsule-eye avatar batch: generate, record QC verdicts, publish WebP + JS for the website.

Sub-commands (run with python3 -I):
  generate [--priority 1,2] [--model M] [--workers 8] [--max-workers 10] [--limit N] [--wait]
        Walk data/avatar_manifest.csv in row order. Players whose photo lookup ended in no_photo are marked
        no_photo; others get gen_avatar.sh with their head crop (data/ref_photos/_crops/<id>.jpg). A finished PNG
        is auto-checked (auto_check) and left as status "pending" with note "awaiting QC". Done/failed/awaiting-QC
        players are skipped, so the command can be re-run at any time. --wait keeps polling for photos the fetcher
        has not resolved yet. Concurrency starts at --workers, drops by 2 on a rate-limit hit, rises by 1 after
        15 clean runs up to --max-workers.
  qc [--priority ...] [--limit N]
        List players awaiting QC (with an automatic background-colour check) for building contact sheets.
  accept ID ...           QC passed: status done, write the 256px WebP, refresh avatars.js / avatar_credits.js.
  reject ID:REASON ...    QC failed: first rejection queues one regeneration, the second marks the player failed.
  publish                 Rebuild every WebP and both JS files from the current status.
  summary                 Count statuses.
  check ID ...            Run the automatic checks on existing PNGs.

Files: data/avatar_status.csv (player_id,status,note), web/img/avatars/<id>.png|.webp,
       web/data/avatars.js, web/data/avatar_credits.js, data/ref_photos/_logs/gen/<id>.log
"""
import argparse
import csv
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_commons_photos as fc  # noqa: E402  (locked credits.csv writes)

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "data" / "avatar_manifest.csv"
STATUS = ROOT / "data" / "avatar_status.csv"
LOCK = ROOT / "data" / ".avatar_status.lock"
PHOTOS = ROOT / "data" / "ref_photos"
MATCHES = PHOTOS / "photo_matches.csv"
WEB_MATCHES = PHOTOS / "web_matches.csv"  # FIFA.com fallback references (fetch_web_refs.py), tagged ref=web
CREDITS = PHOTOS / "credits.csv"
CROPS = PHOTOS / "_crops"
CROPS_WEB = PHOTOS / "_crops_web"
CREDITS_WEB = PHOTOS / "credits_web.csv"
GEN_LOGS = PHOTOS / "_logs" / "gen"
AVATARS = ROOT / "web" / "img" / "avatars"
REJECTED = AVATARS / "_rejected"
WEB_DATA = ROOT / "web" / "data"
GEN = Path(__file__).resolve().parent / "gen_avatar.sh"
COLS = ["player_id", "status", "note"]
RATE_LIMIT = re.compile(r"rate[ _-]?limit|\b429\b|too many requests|usage limit|quota|try again (in|later)", re.I)
MAX_RATE_HITS = 12      # per player; beyond this a "rate limit" is treated as an ordinary error
GEN_TIMEOUT = 15 * 60
MAX_ERRORS = 3          # non-rate-limit errors (no image produced) before a player is marked failed

print_lock = threading.Lock()


def log(*a):
    with print_lock:
        print(time.strftime("%H:%M:%S"), *a, flush=True)


def manifest():
    with MANIFEST.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def read_rows(path):
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as f:
        return {r["player_id"]: r for r in csv.DictReader(f)}


# ---------------------------------------------------------------- status file (shared by concurrent processes)
@contextmanager
def locked_status():
    LOCK.touch(exist_ok=True)
    with LOCK.open("r+") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        rows = read_rows(STATUS)
        for r in manifest():
            rows.setdefault(r["player_id"], {"player_id": r["player_id"], "status": "pending", "note": ""})
        yield rows
        order = [r["player_id"] for r in manifest()]
        tmp = STATUS.with_suffix(".tmp")
        with tmp.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=COLS)
            w.writeheader()
            for pid in order:
                w.writerow({c: rows[pid].get(c, "") for c in COLS})
        tmp.replace(STATUS)


def set_status(pid, status, note):
    with locked_status() as rows:
        rows[pid].update(status=status, note=note)


def get_status():
    with locked_status() as rows:
        return {k: dict(v) for k, v in rows.items()}


def attempts(note):
    m = re.search(r"attempt=(\d+)", note or "")
    return int(m.group(1)) if m else 0


def ref_of(note):
    m = re.search(r"ref=(\w+)", note or "")
    return m.group(1) if m else "commons"


def awaiting_qc(row):
    return row["status"] == "pending" and "awaiting QC" in row["note"]


# ---------------------------------------------------------------- generation
class Pacer:
    """Shared by all workers: a rate-limit hit pauses everybody and lowers concurrency; a clean streak raises it."""

    def __init__(self, start, ceiling, floor=3):
        self.target, self.ceiling, self.floor = start, ceiling, floor
        self.until = 0.0
        self.delay = 60
        self.streak = 0
        self.lock = threading.Lock()

    def hit(self):
        with self.lock:
            self.until = max(self.until, time.time() + self.delay)
            self.target = max(self.floor, self.target - 2)
            self.streak = 0
            log(f"rate limited -> pausing all workers {self.delay}s, concurrency now {self.target}")
            self.delay = min(self.delay * 2, 3600)

    def ok(self):
        with self.lock:
            self.delay = 60
            self.streak += 1
            if self.streak >= 15 and self.target < self.ceiling:
                self.target += 1
                self.streak = 0
                log(f"no rate limits for 15 runs -> concurrency now {self.target}")

    def wait(self):
        while time.time() < self.until:
            time.sleep(5)


def _hex(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)


def auto_check(png, row):
    """Cheap rule checks; returns a list of problems (empty = looks fine).

    square canvas; solid background of the requested colour at the edges; exactly two near-black vertical capsules,
    level and symmetric about the centre line; kit colour across the bottom of the frame.
    """
    im = Image.open(png).convert("RGB")
    problems = []
    if im.width != im.height:
        problems.append("not square")
    a = np.asarray(im.resize((256, 256), Image.LANCZOS), dtype=float)
    bg = _hex(row["bg"])
    edge = np.concatenate([a[4:120, 3], a[4:120, -4], a[3, 20:236]])
    if np.median(np.abs(edge - bg).sum(axis=1)) > 60:
        problems.append("background colour off")
    dark = a.max(axis=2) < 60
    lab, n = ndimage.label(dark)
    eyes = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        fill = (lab[sl] == i).sum() / (h * w)
        cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
        if 14 <= h <= 60 and 5 <= w <= 28 and h / w >= 1.6 and fill >= 0.6 and 60 <= cy <= 200:
            eyes.append((cy, cx, h))
    pair = [(e1, e2) for k, e1 in enumerate(eyes) for e2 in eyes[k + 1:]
            if abs(e1[0] - e2[0]) <= 8 and abs(e1[2] - e2[2]) <= 0.3 * max(e1[2], e2[2])
            and 25 <= abs(e1[1] - e2[1]) <= 120 and abs((e1[1] + e2[1]) / 2 - 128) <= 18]
    if not pair:  # extra candidates (ear shading, beard) are fine as long as one level, centred pair exists
        problems.append(f"capsule eyes not found ({len(eyes)} candidates)")
    kit = _hex(row["kit"])
    band = a[246:252, 40:216].reshape(-1, 3)
    if (np.abs(band - kit).sum(axis=1) < 70).mean() < 0.3:
        problems.append("kit colour not at bottom")
    return problems


def generate_one(row, pacer, prior_attempts, model, ref="commons"):
    pid = row["player_id"]
    crop = CROPS_WEB / f"{pid}.jpg" if ref == "web" else CROPS / f"{pid}.jpg"
    png = AVATARS / f"{pid}.png"
    GEN_LOGS.mkdir(parents=True, exist_ok=True)
    errors = rate_hits = 0
    env = dict(os.environ, AVATAR_MODEL=model)
    while True:
        pacer.wait()
        if png.exists():
            png.unlink()
        t0 = time.time()
        logf = GEN_LOGS / f"{pid}.log"
        try:
            with logf.open("w") as lf:
                proc = subprocess.run(["/bin/zsh", str(GEN), pid, str(crop)], stdin=subprocess.DEVNULL, stdout=lf,
                                      stderr=subprocess.STDOUT, timeout=GEN_TIMEOUT, cwd=ROOT, env=env)
            rc = proc.returncode
        except subprocess.TimeoutExpired:
            rc = "timeout"
        text = logf.read_text(errors="replace")
        if png.exists() and png.stat().st_size > 10_000:
            pacer.ok()
            n = prior_attempts + 1
            problems = auto_check(png, row)
            flag = f" [auto-check: {'; '.join(problems)}]" if problems else ""
            set_status(pid, "pending", f"attempt={n}; model={model}; ref={ref}; awaiting QC{flag}")
            log(f"generated {pid} attempt={n} in {time.time() - t0:.0f}s{flag}")
            return
        tail = " ".join(text.strip().splitlines()[-6:])[-300:]
        if (RATE_LIMIT.search(tail) or RATE_LIMIT.search(text[-3000:])) and rate_hits < MAX_RATE_HITS:
            rate_hits += 1
            pacer.hit()
            continue
        errors += 1
        log(f"error {pid} rc={rc} ({errors}/{MAX_ERRORS}): {tail[-160:]}")
        if errors >= MAX_ERRORS:
            set_status(pid, "failed", f"attempt={prior_attempts}; ref={ref}; generation error rc={rc}: {tail[-120:]}")
            return
        time.sleep(20 * errors)


def adopt_orphans(roster):
    """PNGs finished by a run that was stopped before it could record them: queue them for QC instead of redoing."""
    status = get_status()
    for r in roster:
        pid, st = r["player_id"], status[r["player_id"]]
        png = AVATARS / f"{pid}.png"
        if st["status"] == "pending" and not awaiting_qc(st) and "QC rejected" not in st["note"] \
                and png.exists() and png.stat().st_size > 10_000:
            problems = auto_check(png, r)
            flag = f" [auto-check: {'; '.join(problems)}]" if problems else ""
            set_status(pid, "pending", f"attempt={attempts(st['note']) + 1}; adopted; awaiting QC{flag}")
            log(f"adopted finished PNG for {pid}{flag}")


def cmd_generate(a):
    prios = set(a.priority.split(","))
    roster = [r for r in manifest() if r["priority"] in prios]
    adopt_orphans(roster)
    pacer = Pacer(a.workers, a.max_workers)
    pool = ThreadPoolExecutor(max_workers=a.max_workers)
    inflight = {}
    queued = 0
    log(f"model={a.model} concurrency={a.workers} (max {a.max_workers})")
    while True:
        status, matches, web = get_status(), read_rows(MATCHES), read_rows(WEB_MATCHES)
        unresolved = 0
        for r in roster:
            pid = r["player_id"]
            st = status[pid]
            if pid in inflight or st["status"] in ("done", "failed") or awaiting_qc(st):
                continue
            m, w = matches.get(pid), web.get(pid)
            if m and m["result"] == "photo":
                ref = "commons"
            elif w and w["result"] == "photo":
                ref = "web"
                if st["status"] == "no_photo":
                    st = {"status": "pending", "note": ""}
            elif m is None or w is None or m["result"] == "skipped":
                unresolved += 1  # one of the two fetchers has not reached this player yet
                continue
            else:
                note = f"{m['note']}; FIFA fallback: {w['note']}"
                if (st["status"], st["note"]) != ("no_photo", note):
                    set_status(pid, "no_photo", note)
                continue
            if a.limit and queued >= a.limit:
                continue
            if attempts(st["note"]) >= 2:
                set_status(pid, "failed", st["note"] + "; no attempts left")
                continue
            while sum(not f.done() for f in inflight.values()) >= pacer.target:
                time.sleep(2)
            inflight[pid] = pool.submit(generate_one, r, pacer, attempts(st["note"]), a.model, ref)
            queued += 1
        for pid, f in list(inflight.items()):
            if f.done():
                if f.exception():
                    log(f"worker crashed on {pid}: {f.exception()!r}")
                del inflight[pid]
        if not inflight and (not a.wait or unresolved == 0 or (a.limit and queued >= a.limit)):
            break
        time.sleep(10)
    pool.shutdown(wait=True)
    cmd_summary(a)


def cmd_check(a):
    """Re-run the automatic checks on existing PNGs (for tuning / spot checks)."""
    rows = {r["player_id"]: r for r in manifest()}
    for pid in a.ids:
        print(pid, auto_check(AVATARS / f"{pid}.png", rows[pid]) or "ok")


# ---------------------------------------------------------------- QC and publishing
def cmd_qc(a):
    prios = set(a.priority.split(","))
    status = get_status()
    ids = [r["player_id"] for r in manifest() if r["priority"] in prios and awaiting_qc(status[r["player_id"]])]
    if a.limit:
        ids = ids[:a.limit]
    for pid in ids:
        flag = re.search(r"\[auto-check.*\]", status[pid]["note"])
        print(pid, flag.group(0) if flag else "")


def write_webp(pid):
    im = Image.open(AVATARS / f"{pid}.png").convert("RGB")
    side = min(im.size)
    im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2))
    im.resize((256, 256), Image.LANCZOS).save(AVATARS / f"{pid}.webp", "WEBP", quality=88, method=6)


def publish():
    status, credits, web_credits = get_status(), read_rows(CREDITS), read_rows(CREDITS_WEB)
    done = [r["player_id"] for r in manifest() if status[r["player_id"]]["status"] == "done"]
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    av = {pid: f"img/avatars/{pid}.webp" for pid in done if (AVATARS / f"{pid}.webp").exists()}
    cr = {}
    for pid in av:
        c = web_credits.get(pid) if ref_of(status[pid]["note"]) == "web" else credits.get(pid)
        if c and ref_of(status[pid]["note"]) != "web" and c["license"] == "reference only (not CC)":
            c = None  # should not happen: Commons-based avatar without a Commons credit
            log(f"WARNING {pid}: Commons avatar but credits.csv holds a web row")
        if c:
            cr[pid] = {"author": c["author"], "license": c["license"], "url": c["file_page_url"],
                       "license_url": c["license_url"]}
    # keep credits.csv in step with the reference each accepted avatar was drawn from (Commons and FIFA can race)
    fix = {pid: web_credits[pid] for pid in av if ref_of(status[pid]["note"]) == "web" and pid in web_credits
           and credits.get(pid, {}).get("file_page_url") != web_credits[pid]["file_page_url"]}
    if fix:
        fc.merge_credits(fix)
    for name, var, obj in (("avatars.js", "WC_AVATARS", av), ("avatar_credits.js", "WC_AVATAR_CREDITS", cr)):
        tmp = WEB_DATA / (name + ".tmp")
        tmp.write_text(f"window.{var} = {json.dumps(obj, ensure_ascii=False)};\n", encoding="utf-8")
        tmp.replace(WEB_DATA / name)
    print(f"published {len(av)} avatars, {len(cr)} credits")


def cmd_accept(a):
    for pid in a.ids:
        st = get_status()[pid]
        if not (AVATARS / f"{pid}.png").exists():
            print(f"skip {pid}: no PNG")
            continue
        write_webp(pid)
        set_status(pid, "done", f"attempt={attempts(st['note'])}; ref={ref_of(st['note'])}; QC ok")
    publish()


def cmd_reject(a):
    REJECTED.mkdir(parents=True, exist_ok=True)
    for item in a.items:
        pid, _, reason = item.partition(":")
        st = get_status()[pid]
        n = attempts(st["note"])
        png = AVATARS / f"{pid}.png"
        if png.exists():
            shutil.move(png, REJECTED / f"{pid}_attempt{n}.png")
        for stale in (AVATARS / f"{pid}.webp",):
            stale.unlink(missing_ok=True)
        ref = ref_of(st["note"])
        if n >= 2:
            set_status(pid, "failed", f"attempt={n}; ref={ref}; QC failed twice: {reason}")
        else:
            set_status(pid, "pending", f"attempt={n}; ref={ref}; QC rejected ({reason}), queued for regeneration")
        print(pid, get_status()[pid]["status"])
    publish()


def cmd_publish(a):
    status = get_status()
    for pid, st in status.items():
        if st["status"] == "done" and (AVATARS / f"{pid}.png").exists():
            write_webp(pid)
    publish()


def cmd_summary(a):
    status = get_status()
    prio = {r["player_id"]: r["priority"] for r in manifest()}
    out = {}
    for pid, st in status.items():
        key = "awaiting_qc" if awaiting_qc(st) else st["status"]
        out.setdefault(prio[pid], {}).setdefault(key, 0)
        out[prio[pid]][key] += 1
    for p in sorted(out):
        print(f"priority {p}: {out[p]}")
    web_done = sum(st["status"] == "done" and ref_of(st["note"]) == "web" for st in status.values())
    tot = {}
    for st in status.values():
        k = "awaiting_qc" if awaiting_qc(st) else st["status"]
        tot[k] = tot.get(k, 0) + 1
    print(f"total: {tot}; done with ref=web: {web_done}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("generate")
    g.add_argument("--priority", default="1,2,3,4")
    g.add_argument("--workers", type=int, default=8, help="starting concurrency")
    g.add_argument("--max-workers", type=int, default=10, help="concurrency ceiling after clean streaks")
    g.add_argument("--model", default="gpt-6.1-sol")
    g.add_argument("--limit", type=int, default=0)
    g.add_argument("--wait", action="store_true")
    q = sub.add_parser("qc")
    q.add_argument("--priority", default="1,2,3,4")
    q.add_argument("--limit", type=int, default=0)
    sub.add_parser("accept").add_argument("ids", nargs="+")
    sub.add_parser("reject").add_argument("items", nargs="+")
    sub.add_parser("publish")
    sub.add_parser("summary")
    sub.add_parser("check").add_argument("ids", nargs="+")
    a = ap.parse_args()
    if getattr(a, "max_workers", 0) > 12 or getattr(a, "workers", 0) > getattr(a, "max_workers", 99):
        sys.exit("workers must be <= max-workers <= 12")
    {"generate": cmd_generate, "qc": cmd_qc, "accept": cmd_accept, "reject": cmd_reject,
     "publish": cmd_publish, "summary": cmd_summary, "check": cmd_check}[a.cmd](a)


if __name__ == "__main__":
    main()
