"""Shared feature engineering: one row per team-match with style dials and outcomes."""
from pathlib import Path

import numpy as np
import pandas as pd

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"

STYLE_DIALS = [
    "Ball share",
    "Patient build-up",
    "Direct play",
    "Transition attacks",
    "Final-third camp",
    "Wing crosses",
    "High press",
    "Deep block",
    "Counter-press",
    "Press intensity",
]


def _first_number(s):
    return pd.to_numeric(s.astype(str).str.extract(r"([\d.]+)")[0])


def _bracket_number(s):
    return pd.to_numeric(s.astype(str).str.extract(r"\(([\d.]+)\)")[0])


def load(name):
    return pd.read_csv(RAW / name)


def team_match_table():
    ks = load("team_key_stats.csv")
    ks = ks[ks.match_team_id.notna()]
    ph = load("team_phases.csv")
    mt = load("match_teams.csv")
    dp = load("team_defensive_pressure.csv").set_index("match_team_id")

    k = ks.pivot_table(index="match_team_id", columns="metric", values="raw", aggfunc="first")
    K = pd.DataFrame(index=k.index)
    K["poss"] = _first_number(k["Possession"])
    K["xg"] = _first_number(k["xG (Expected Goals)"])
    K["goals"] = _first_number(k["Goals"])
    K["shots"] = _first_number(k["Attempts at Goal (On Target)"])
    K["sot"] = _bracket_number(k["Attempts at Goal (On Target)"])
    K["passes"] = _first_number(k["Total Passes (Complete)"])
    K["pass_cmp"] = _first_number(k["Pass Completion %"])
    K["line_breaks"] = _first_number(k["Completed Line Breaks"])
    K["final_third_rec"] = _first_number(k["Receptions in the Final Third"])
    K["crosses"] = _first_number(k["Crosses"])
    K["forced_turnovers"] = _first_number(k["Forced Turnovers"])
    K["distance_km"] = _first_number(k["Total Distance Covered"])

    w = ph.pivot_table(index="match_team_id", columns="phase", values="value")
    group = ph.drop_duplicates("phase").set_index("phase")["phase_group"]
    in_cols = [p for p in w.columns if group[p] == "In Possession"]
    out_cols = [p for p in w.columns if group[p] != "In Possession"]
    # Phase values overlap and do not sum to 100, so express each as a share
    # of its own group: "how a team spends the time it has / lacks the ball".
    wi = w[in_cols].div(w[in_cols].sum(1), axis=0) * 100
    wo = w[out_cols].div(w[out_cols].sum(1), axis=0) * 100

    pair = mt.merge(mt, on="match_id", suffixes=("", "_opp"))
    pair = pair[pair.team_id != pair.team_id_opp].set_index("match_team_id")
    D = K.join(pair[["team_id", "team_name", "match_id", "match_team_id_opp", "team_id_opp", "home_away"]])
    for col in ["xg", "goals", "shots", "sot", "poss"]:
        D[col + "_opp"] = K.loc[D.match_team_id_opp, col].values

    D["Ball share"] = D.poss
    D["Patient build-up"] = wi["Build Up Unopposed"] + wi["Build Up Opposed"]
    D["Direct play"] = wi["Long Ball"] + wi["Counter Attack"]
    D["Transition attacks"] = wi["Attacking Transition"]
    D["Final-third camp"] = wi["Final Third"]
    D["Wing crosses"] = D.crosses / D.poss * 50  # crosses per 50% possession
    D["High press"] = wo["High Press"] + wo["High Block"]
    D["Deep block"] = wo["Low Block"] + wo["Low Press"]
    D["Counter-press"] = wo["Counter-press"]
    # Pressures per 50% opponent possession, so low-possession teams are not inflated.
    D["Press intensity"] = dp.loc[D.index, "total_pressures"].values / D.poss_opp * 50
    D["phases_raw"] = [w.loc[i].to_dict() for i in D.index]
    return D
