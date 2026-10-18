"""Build every data file the website needs from the raw Worldcup26 CSVs.

Outputs (plain JS so the site also works when index.html is opened from disk):
  web/data/core.js               window.WC = {meta, dials, archetypes, teams, teamMatches, matches}
  web/data/matches/<match>.js    window.WC_MATCH[<match_id>] = {...}   (one file per match, all 104)

Usage: python3 -I build_data.py
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import KMeans
from sklearn.linear_model import LinearRegression

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import STYLE_DIALS, load, team_match_table  # noqa: E402
from teams_meta import KITS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "data"
TWIN_K = 20          # style twins used for the style-expected xG
STAGES = ["Group", "Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Bronze final", "Final"]

DIAL_INFO = {
    "Ball share": ("Possession %", "%", "Share of the ball (possession, excluding contested time)."),
    "Patient build-up": ("Build-up share of attacking time", "%", "Time spent building up from the back, opposed or unopposed."),
    "Direct play": ("Long-ball + counter-attack share", "%", "Time spent going long or breaking straight away."),
    "Transition attacks": ("Attacking-transition share", "%", "Time spent attacking right after winning the ball."),
    "Final-third camp": ("Final-third share of attacking time", "%", "Time spent camped in the opponent's final third."),
    "Wing crosses": ("Crosses per 50% possession", "", "How often the team swings the ball in from wide."),
    "High press": ("High press + high block share", "%", "Defending time spent pressing or blocking high up the pitch."),
    "Deep block": ("Low block + low press share", "%", "Defending time spent sitting deep near their own box."),
    "Counter-press": ("Counter-press share", "%", "Defending time spent hunting the ball immediately after losing it."),
    "Press intensity": ("Pressures per 50% opp. possession", "", "How many pressures they apply when the opponent has the ball."),
}


def clean_stage(group):
    g = group.replace("ﬁ", "fi")
    return "Group" if g.startswith("Group") else g


def zscore(frame):
    return (frame - frame.mean()) / frame.std(ddof=0)


def pca2(Z):
    """First two principal axes, oriented so +x = more ball share, +y = more wing crosses."""
    X = Z.values - Z.values.mean(0)
    _, _, vt = np.linalg.svd(X, full_matrices=False)
    comps = vt[:2].copy()
    cols = list(Z.columns)
    if comps[0][cols.index("Ball share")] < 0:
        comps[0] *= -1
    if comps[1][cols.index("Wing crosses")] < 0:
        comps[1] *= -1
    return comps


# ---------------------------------------------------------------- team-match table
D = team_match_table()
matches = load("matches.csv")
matches["stage"] = matches.group.map(clean_stage)
matches["group_label"] = matches.group.str.replace("ﬁ", "fi")
D = D.join(matches.set_index("match_id")[["stage", "match_number", "date"]], on="match_id")

Zm = zscore(D[STYLE_DIALS])
X = Zm.values
teams_arr = D.team_id.values


def knn_mean(col, k=TWIN_K):
    out = []
    for i in range(len(D)):
        d = np.sqrt(((X - X[i]) ** 2).sum(1))
        d[teams_arr == teams_arr[i]] = np.inf      # twins must be other teams
        out.append(D[col].values[np.argsort(d)[:k]].mean())
    return np.array(out)


# ---------------------------------------------------------------- result decomposition
# xG       = mean + b*(style-expected xG  - mean) + c*(opponent's usual xG conceded - mean) + creation residual
# xG ag.   = mean + b'*(style-expected xGA - mean) + c'*(opponent's usual xG created  - mean) + prevention residual
# goal diff = style + opponents + creation + prevention + finishing (G - xG) + goalkeeping (xGA - GA)
D["style_xg"] = knn_mean("xg")
D["style_xga"] = knn_mean("xg_opp")


def leave_one_out(team, match, col):
    return D[(D.team_id == team) & (D.match_id != match)][col].mean()


D["opp_usual_conceded"] = [leave_one_out(o, m, "xg_opp") for o, m in zip(D.team_id_opp, D.match_id)]
D["opp_usual_created"] = [leave_one_out(o, m, "xg") for o, m in zip(D.team_id_opp, D.match_id)]
att = LinearRegression().fit(D[["style_xg", "opp_usual_conceded"]], D.xg)
dfn = LinearRegression().fit(D[["style_xga", "opp_usual_created"]], D.xg_opp)
D["exp_xg"] = att.predict(D[["style_xg", "opp_usual_conceded"]])
D["exp_xga"] = dfn.predict(D[["style_xga", "opp_usual_created"]])
b_a, c_a = att.coef_
b_d, c_d = dfn.coef_
D["c_style"] = b_a * (D.style_xg - D.style_xg.mean()) - b_d * (D.style_xga - D.style_xga.mean())
D["c_opp"] = c_a * (D.opp_usual_conceded - D.opp_usual_conceded.mean()) - c_d * (D.opp_usual_created - D.opp_usual_created.mean())
D["c_create"] = D.xg - D.exp_xg
D["c_prevent"] = D.exp_xga - D.xg_opp
D["c_finish"] = D.goals - D.xg
D["c_keep"] = D.xg_opp - D.goals_opp
D["gd"] = D.goals - D.goals_opp
COMPONENTS = ["c_style", "c_opp", "c_create", "c_prevent", "c_finish", "c_keep"]
residual = (D[COMPONENTS].sum(1) - D.gd).abs().max()
assert residual < 1e-6, residual

# ---------------------------------------------------------------- team table + archetypes
T = D.groupby("team_id").agg(team_name=("team_name", "first"), n=("xg", "size"))
Zt = Zm.join(D[["team_id"]]).groupby("team_id")[STYLE_DIALS].mean()
km = KMeans(5, n_init=200, random_state=7).fit(Zt.values)
centroids = pd.DataFrame(km.cluster_centers_, columns=STYLE_DIALS)

# Name clusters by matching their centroid profile to the archetype definitions.
ARCHETYPES = [
    {"id": "architects", "name": "The Architects", "color": "#2a78d6", "shape": "circle",
     "tagline": "Keep it, build it, then press to get it back.",
     "signature": {"Patient build-up": 1, "Ball share": 1, "Press intensity": 1, "Wing crosses": -1, "Transition attacks": -1}},
    {"id": "stormers", "name": "The Stormers", "color": "#e34948", "shape": "triangle",
     "tagline": "Camp in the final third, cross, and counter-press the second you lose it.",
     "signature": {"Final-third camp": 1, "Counter-press": 1, "High press": 1, "Wing crosses": 1, "Deep block": -1}},
    {"id": "allrounders", "name": "The All-rounders", "color": "#1baf7a", "shape": "diamond",
     "tagline": "No extreme dial: adapt to the opponent.",
     "signature": {d: 0 for d in STYLE_DIALS}},
    {"id": "counterpunchers", "name": "The Counter-punchers", "color": "#eda100", "shape": "square",
     "tagline": "Let them have it, stay compact, strike on the break.",
     "signature": {"Transition attacks": 1, "Direct play": 0.6, "Ball share": -0.6, "Press intensity": -1, "Deep block": 0.6}},
    {"id": "fortress", "name": "The Fortress", "color": "#4a3aa7", "shape": "star",
     "tagline": "Defend deep in numbers, go long, survive.",
     "signature": {"Deep block": 1.3, "Direct play": 1.3, "Ball share": -1.3, "Final-third camp": -1, "Transition attacks": 1}},
]
cost = np.zeros((5, 5))
for i, a in enumerate(ARCHETYPES):
    sig = np.array([a["signature"].get(d, 0) for d in STYLE_DIALS])
    for j in range(5):
        cost[i, j] = np.linalg.norm(centroids.iloc[j].values - sig)
rows, cols = linear_sum_assignment(cost)
cluster_to_arch = {c: ARCHETYPES[r]["id"] for r, c in zip(rows, cols)}
T["archetype"] = [cluster_to_arch[c] for c in km.labels_]
for a in ARCHETYPES:
    j = [c for c, aid in cluster_to_arch.items() if aid == a["id"]][0]
    a["centroid"] = {d: round(float(centroids.iloc[j][d]), 3) for d in STYLE_DIALS}
    a["members"] = sorted(T.index[T.archetype == a["id"]].tolist())
    del a["signature"]

# Team-level aggregates
agg = D.groupby("team_id").agg(
    gf=("goals", "sum"), ga=("goals_opp", "sum"), xg=("xg", "sum"), xga=("xg_opp", "sum"),
    shots=("shots", "sum"), poss=("poss", "mean"),
    **{c: (c, "mean") for c in COMPONENTS + ["gd", "style_xg", "style_xga", "opp_usual_conceded", "opp_usual_created"]})
T = T.join(agg)
# Chameleon index: average distance (in standardised style units) of a team's matches from its own centre
T["chameleon"] = [
    float(np.sqrt(((Zm[D.team_id == t] - Zt.loc[t]) ** 2).sum(1)).mean()) for t in T.index
]


# Results & stage reached
def match_result(row, side):
    hs, as_ = row.home_score, row.away_score
    mine, theirs = (hs, as_) if side == "home" else (as_, hs)
    if mine != theirs:
        return "W" if mine > theirs else "L"
    if isinstance(row.penalty_result, str):
        winner = row.penalty_result.split(" win")[0].strip()
        my_name = row.home_team if side == "home" else row.away_team
        return "W" if winner == my_name else "L"
    return "D"


results = {}
stage_reached = {}
for _, r in matches.iterrows():
    for side in ("home", "away"):
        tid = r[f"{side}_team_id"]
        results[(r.match_id, tid)] = match_result(r, side)
        prev = stage_reached.get(tid, "Group")
        if STAGES.index(r.stage) >= STAGES.index(prev):
            stage_reached[tid] = r.stage
final = matches[matches.stage == "Final"].iloc[0]
bronze = matches[matches.stage == "Bronze final"].iloc[0]
placing = {}
for m, top, low in ((final, "Champions", "Runners-up"), (bronze, "Third place", "Fourth place")):
    for side in ("home", "away"):
        placing[m[f"{side}_team_id"]] = top if results[(m.match_id, m[f"{side}_team_id"])] == "W" else low
D["result"] = [results[(m, t)] for m, t in zip(D.match_id, D.team_id)]

# Passing hub per team (tournament total of passes sent + received)
edges = load("passing_network_edges.csv")
edges = edges[(edges.pass_count > 0) & (edges.from_player_id != edges.to_player_id)]
inv = (edges.groupby(["team_id", "from_player_id", "from_player"]).pass_count.sum().rename_axis(["team_id", "pid", "name"])
       .add(edges.groupby(["team_id", "to_player_id", "to_player"]).pass_count.sum().rename_axis(["team_id", "pid", "name"]), fill_value=0))
hub = inv.reset_index().sort_values("pass_count", ascending=False).drop_duplicates("team_id").set_index("team_id")

# ---------------------------------------------------------------- per-match detail
apps = load("match_appearances.csv")
events = load("player_events.csv")
attempts = load("attempts_at_goal.csv")
pin = load("player_in_possession_distributions.csv").set_index("appearance_id")
phys = load("player_physical_data.csv").set_index("appearance_id")
oop = load("player_out_of_possession.csv").set_index("appearance_id")


def short_name(name):
    parts = name.split()
    caps = [p for p in parts if p.isupper() and len(p) > 1]
    return " ".join(caps).title() if caps else name


def fiedler_order(pids, pass_lookup):
    """1-D ordering that keeps frequent passing partners next to each other (spectral seriation)."""
    n = len(pids)
    A = np.zeros((n, n))
    for i, a in enumerate(pids):
        for j, b in enumerate(pids):
            if i != j:
                A[i, j] = pass_lookup.get((a, b), 0) + pass_lookup.get((b, a), 0)
    A += 0.5  # keep the graph connected
    np.fill_diagonal(A, 0)
    deg = A.sum(1)
    L = np.diag(deg) - A
    Dm = np.diag(1 / np.sqrt(deg))
    vals, vecs = np.linalg.eigh(Dm @ L @ Dm)
    return dict(zip(pids, vecs[:, 1] / np.sqrt(deg)))


def outcome_kind(outcome):
    o = str(outcome)
    if "Prevented" in o or "Saved" in o:
        return "saved"
    if "Goal" in o:
        return "goal"
    if "Blocked" in o or "Deflected" in o:
        return "blocked"
    if "Off Target" in o:
        return "off"
    return "other"


def num(v, digits=1):
    if pd.isna(v):
        return None
    try:
        return round(float(str(v).rstrip("%")), digits)
    except ValueError:
        return None


def build_team_side(match_id, mtid, team_id, side):
    tm = D.loc[mtid]
    ap = apps[apps.match_team_id == mtid].copy()
    ap = ap[ap.appeared | ap.is_starter]
    ev = events[events.match_team_id == mtid].sort_values("minute")
    te = edges[edges.match_team_id == mtid]
    pass_lookup = {(a, b): c for a, b, c in zip(te.from_player_id, te.to_player_id, te.pass_count)}

    starters = ap[ap.is_starter]
    order = fiedler_order(starters.player_id.tolist(), pass_lookup)
    # Normalise so the order value runs 0..1 across the starting XI; the site lays out
    # whoever is on the pitch by role line, sorted by this value (subs inherit it).
    lo, hi = min(order.values()), max(order.values())
    slots = {pid: (v - lo) / (hi - lo or 1) for pid, v in order.items()}

    # walk substitutions in time order: the incoming player takes the outgoing player's slot
    subs_on = ev[ev.event_type == "subbed_on"]
    subs_off = ev[ev.event_type == "subbed_off"]
    on_minute, off_minute, replaced_by = {}, {}, {}
    used_off = set()
    for _, s in subs_on.iterrows():
        cands = subs_off[(subs_off.minute == s.minute) & (~subs_off.event_id.isin(used_off))]
        if cands.empty:
            cands = subs_off[(~subs_off.event_id.isin(used_off)) & ((subs_off.minute - s.minute).abs() <= 1)]
        pos_in = ap.loc[ap.player_id == s.player_id, "position"]
        if len(cands) > 1 and len(pos_in):
            same = cands[cands.player_id.map(dict(zip(ap.player_id, ap.position))) == pos_in.iat[0]]
            if len(same):
                cands = same
        on_minute[s.player_id] = int(s.minute)
        if len(cands):
            off = cands.iloc[0]
            used_off.add(off.event_id)
            off_minute[off.player_id] = int(off.minute)
            replaced_by[off.player_id] = s.player_id
            slots[s.player_id] = slots.get(off.player_id, 0.5) + 0.001
    for _, o in subs_off[~subs_off.event_id.isin(used_off)].iterrows():
        off_minute[o.player_id] = int(o.minute)
    for pid in ap.player_id:
        slots.setdefault(pid, 0.5)  # unmatched substitute: middle of its role line

    players = []
    for _, p in ap.iterrows():
        a = p.appearance_id
        st = {
            "passes": num(pin.at[a, "passes_attempted"], 0) if a in pin.index else None,
            "passes_cmp": num(pin.at[a, "passes_completed"], 0) if a in pin.index else None,
            "line_breaks": num(pin.at[a, "line_breaks_completed"], 0) if a in pin.index else None,
            "progressions": num(pin.at[a, "ball_progressions"], 0) if a in pin.index else None,
            "take_ons": num(pin.at[a, "take_ons"], 0) if a in pin.index else None,
            "shots": num(pin.at[a, "attempts_at_goal"], 0) if a in pin.index else None,
            "distance_km": round(phys.at[a, "total_distance_m"] / 1000, 2) if a in phys.index and pd.notna(phys.at[a, "total_distance_m"]) else None,
            "top_speed": num(phys.at[a, "top_speed_kmh"]) if a in phys.index else None,
            "regains": num(oop.at[a, "possession_regains"], 0) if a in oop.index else None,
        }
        players.append({
            "pid": p.player_id, "name": p.player_name, "short": short_name(p.player_name),
            "num": int(p.shirt_number), "role": p.position, "starter": bool(p.is_starter),
            "on": 0 if p.is_starter else on_minute.get(p.player_id),
            "off": off_minute.get(p.player_id), "ord": round(slots[p.player_id], 4),
            "replaces": next((k for k, v in replaced_by.items() if v == p.player_id), None),
            "stats": st,
        })
    idx = {p["pid"]: i for i, p in enumerate(players)}
    edge_list = [[idx[a], idx[b], int(c)] for (a, b), c in pass_lookup.items() if a in idx and b in idx]

    stats = {k: (None if pd.isna(tm[k]) else round(float(tm[k]), 2)) for k in
             ["poss", "xg", "goals", "shots", "sot", "passes", "pass_cmp", "line_breaks", "final_third_rec",
              "crosses", "forced_turnovers", "distance_km"]}
    return {
        "team_id": team_id, "name": tm.team_name, "side": side, "mtid": mtid,
        "kit": KITS[team_id][0], "trim": KITS[team_id][1],
        "archetype": T.at[team_id, "archetype"], "result": tm.result,
        "stats": stats, "phases": {k: float(v) for k, v in tm.phases_raw.items()},
        "dials": {d: round(float(tm[d]), 2) for d in STYLE_DIALS},
        "decomp": {c: round(float(tm[c]), 3) for c in COMPONENTS},
        "expected": {"style_xg": round(tm.style_xg, 2), "style_xga": round(tm.style_xga, 2),
                     "opp_usual_conceded": round(tm.opp_usual_conceded, 2), "opp_usual_created": round(tm.opp_usual_created, 2),
                     "exp_xg": round(tm.exp_xg, 2), "exp_xga": round(tm.exp_xga, 2)},
        "players": players, "edges": edge_list, "_idx": idx,
    }


def nearest_matches(mtid, k=4):
    i = D.index.get_loc(mtid)
    d = np.sqrt(((X - X[i]) ** 2).sum(1))
    d[teams_arr == teams_arr[i]] = np.inf
    out = []
    for j in np.argsort(d)[:k]:
        r = D.iloc[j]
        out.append({"mtid": D.index[j], "match_id": r.match_id, "team_id": r.team_id, "opp_id": r.team_id_opp,
                    "goals": int(r.goals), "goals_opp": int(r.goals_opp), "xg": round(r.xg, 2),
                    "result": r.result, "dist": round(float(d[j]), 2)})
    return out


(OUT / "matches").mkdir(parents=True, exist_ok=True)
match_index = []
for _, m in matches.sort_values("match_number").iterrows():
    sides = []
    for side in ("home", "away"):
        tid = m[f"{side}_team_id"]
        sides.append(build_team_side(m.match_id, f"{m.match_id}_{tid}", tid, side))

    ev = events[events.match_id == m.match_id].sort_values(["minute", "event_type"])
    at = attempts[attempts.match_id == m.match_id].sort_values("minute")
    side_of = {s["team_id"]: i for i, s in enumerate(sides)}
    timeline = []
    yellow_seen = set()
    goal_shots = at[at.outcome.map(outcome_kind) == "goal"].copy()
    for _, e in ev.iterrows():
        t = side_of[e.team_id]
        pidx = sides[t]["_idx"].get(e.player_id)
        base = {"min": int(e.minute), "label": str(e.minute_raw), "team": t, "p": pidx}
        if e.event_type in ("goal", "own_goal"):
            item = dict(base, type=e.event_type)
            if e.event_type == "goal":
                cand = goal_shots[(goal_shots.player_id == e.player_id) & ((goal_shots.minute + 1 - e.minute).abs() <= 2)]
                if len(cand):
                    g = cand.iloc[0]
                    goal_shots = goal_shots.drop(cand.index[0])
                    item.update(body=g.body_part, delivery=g.delivery_type)
            timeline.append(item)
        elif e.event_type == "yellow_card":
            second = e.player_id in yellow_seen
            yellow_seen.add(e.player_id)
            timeline.append(dict(base, type="second_yellow" if second else "yellow"))
        elif e.event_type == "red_card":
            timeline.append(dict(base, type="red"))
        elif e.event_type == "subbed_on":
            timeline.append(dict(base, type="sub_on"))
        elif e.event_type == "subbed_off":
            timeline.append(dict(base, type="sub_off"))
    for _, a in at.iterrows():
        kind = outcome_kind(a.outcome)
        if kind == "goal":
            continue  # goals come from the official event list above
        t = side_of[a.team_id]
        timeline.append({"min": int(a.minute) + 1, "label": f"{int(a.minute) + 1}'", "team": t,
                         "p": sides[t]["_idx"].get(a.player_id), "type": "shot", "outcome": kind,
                         "body": a.body_part, "delivery": a.delivery_type})
    order = {"sub_off": 0, "sub_on": 1, "shot": 2, "goal": 3, "own_goal": 3, "yellow": 4, "second_yellow": 4, "red": 4}
    timeline.sort(key=lambda x: (x["min"], order[x["type"]]))
    # sent-off players leave the pitch
    for item in timeline:
        if item["type"] in ("second_yellow", "red") and item["p"] is not None:
            pl = sides[item["team"]]["players"][item["p"]]
            pl["sent_off"] = item["min"]
    last = max([x["min"] for x in timeline] + [90])
    aet = m.stage != "Group" and (isinstance(m.penalty_result, str) or last > 112)
    duration = max(last + 1, 121 if aet else 94)
    for s in sides:
        s.pop("_idx")
        s["twins"] = nearest_matches(s["mtid"])
    record = {
        "id": m.match_id, "number": int(m.match_number), "date": m.date, "kickoff": m.kickoff,
        "stage": m.stage, "group": m.group_label, "venue": m.venue,
        "score": [int(m.home_score), int(m.away_score)],
        "pens": m.penalty_result if isinstance(m.penalty_result, str) else None,
        "aet": bool(aet), "duration": int(duration), "teams": sides, "timeline": timeline,
        "source": m.source_url,
    }
    js = "window.WC_MATCH=window.WC_MATCH||{};window.WC_MATCH[" + json.dumps(m.match_id) + "]=" + \
        json.dumps(record, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (OUT / "matches" / f"{m.match_id}.js").write_text(js)
    match_index.append({
        "id": m.match_id, "number": int(m.match_number), "date": m.date, "stage": m.stage, "group": m.group_label,
        "home": m.home_team_id, "away": m.away_team_id, "score": [int(m.home_score), int(m.away_score)],
        "pens": record["pens"], "aet": record["aet"], "venue": m.venue,
        "xg": [round(float(D.loc[f"{m.match_id}_{m.home_team_id}", "xg"]), 2),
               round(float(D.loc[f"{m.match_id}_{m.away_team_id}", "xg"]), 2)],
    })

# ---------------------------------------------------------------- core bundle
team_records = []
for tid, r in T.iterrows():
    tm_rows = D[D.team_id == tid].sort_values("match_number")
    team_records.append({
        "id": tid, "name": r.team_name, "kit": KITS[tid][0], "trim": KITS[tid][1],
        "archetype": r.archetype, "n": int(r.n),
        "record": {k: int((tm_rows.result == k).sum()) for k in "WDL"},
        "gf": int(r.gf), "ga": int(r.ga), "xg": round(r.xg, 2), "xga": round(r.xga, 2), "poss": round(r.poss, 1),
        "stage": placing.get(tid, stage_reached[tid]),
        "decomp": {c: round(float(r[c]), 3) for c in COMPONENTS},
        "gd_per_match": round(float(r.gd), 3),
        "expected": {k: round(float(r[k]), 3) for k in ["style_xg", "style_xga", "opp_usual_conceded", "opp_usual_created"]},
        "chameleon": round(r.chameleon, 3),
        "hub": {"pid": hub.at[tid, "pid"], "name": hub.at[tid, "name"], "short": short_name(hub.at[tid, "name"]),
                "passes": int(hub.at[tid, "pass_count"])},
        "matches": tm_rows.index.tolist(),
    })

team_matches = {}
for mtid, r in D.iterrows():
    team_matches[mtid] = {
        "match_id": r.match_id, "team_id": r.team_id, "opp_id": r.team_id_opp, "number": int(r.match_number),
        "stage": r.stage, "result": r.result, "goals": int(r.goals), "goals_opp": int(r.goals_opp),
        "xg": round(r.xg, 2), "xga": round(r.xg_opp, 2), "shots": int(r.shots), "poss": round(r.poss, 1),
        "dials": [round(float(r[d]), 3) for d in STYLE_DIALS],
        "decomp": [round(float(r[c]), 3) for c in COMPONENTS],
    }

# ---------------------------------------------------------------- story statistics
rng = np.random.default_rng(2026)
D["exec"] = D.c_create + D.c_prevent   # repeatable team skill: making and denying chances
D["luck"] = D.c_finish + D.c_keep      # conversion at both ends: finishing and goalkeeping
gd_var = D.gd.var()
shares = {c: round(float(D[c].cov(D.gd) / gd_var), 4) for c in COMPONENTS}  # covariance shares add up to 1


def boot_ci(a, b, n=4000):
    rs = []
    for _ in range(n):
        i = rng.integers(0, len(a), len(a))
        rs.append(np.corrcoef(a[i], b[i])[0, 1])
    return [round(float(np.percentile(rs, 5)), 3), round(float(np.percentile(rs, 95)), 3)]


grp = D[D.stage == "Group"].groupby("team_id")[["exec", "luck"]].mean()
ko = D[D.stage != "Group"].groupby("team_id")[["exec", "luck"]].mean()
J = grp.join(ko, lsuffix="_g", rsuffix="_k", how="inner")
carry = {"teams": [{"id": t, **{c: round(float(r[c]), 3) for c in J.columns}} for t, r in J.iterrows()]}
for k in ("exec", "luck"):
    a, b = J[f"{k}_g"].values, J[f"{k}_k"].values
    carry[k] = {"r": round(float(np.corrcoef(a, b)[0, 1]), 3), "ci90": boot_ci(a, b)}

D["arch"] = D.team_id.map(T.archetype)
D["opp_arch"] = D.team_id_opp.map(T.archetype)
D["xgd"] = D.xg - D.xg_opp
matchups = {f"{a}|{b}": {"gd": round(float(g.gd.mean()), 3), "xgd": round(float(g.xgd.mean()), 3),
                         "n": int(len(g) if a != b else len(g) // 2)}
            for (a, b), g in D.groupby(["arch", "opp_arch"])}
story = {"shares": shares, "carry": carry, "matchups": matchups}

core = {
    "meta": {
        "source": "Worldcup26 (Alamyy), CC BY 4.0, derived from FIFA Training Centre post-match reports",
        "twin_k": TWIN_K,
        "model": {"attack": {"style": round(b_a, 3), "opponent": round(c_a, 3), "intercept": round(att.intercept_, 3)},
                  "defence": {"style": round(b_d, 3), "opponent": round(c_d, 3), "intercept": round(dfn.intercept_, 3)}},
        "means": {"xg": round(D.xg.mean(), 3), "goals": round(D.goals.mean(), 3)},
        "components": COMPONENTS,
    },
    "dials": [{"id": d, "label": DIAL_INFO[d][0], "unit": DIAL_INFO[d][1], "help": DIAL_INFO[d][2]} for d in STYLE_DIALS],
    "archetypes": ARCHETYPES,
    "teams": team_records,
    "teamMatches": team_matches,
    "matches": match_index,
    "story": story,
}
(OUT / "core.js").write_text("window.WC=" + json.dumps(core, ensure_ascii=False, separators=(",", ":")) + ";\n")

# ---------------------------------------------------------------- console summary
print("archetypes:")
for a in ARCHETYPES:
    print(f"  {a['name']:<22} {', '.join(a['members'])}")
print("model attack", att.coef_.round(3), "defence", dfn.coef_.round(3))
print("core.js", round((OUT / 'core.js').stat().st_size / 1024), "KB;",
      len(list((OUT / 'matches').glob('*.js'))), "match files,",
      round(sum(p.stat().st_size for p in (OUT / 'matches').glob('*.js')) / 1024), "KB total")
