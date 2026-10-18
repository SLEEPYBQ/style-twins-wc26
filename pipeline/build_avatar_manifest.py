"""Write data/avatar_manifest.csv: every player, with kit colours and a generation priority.

priority 1 = each team's passing hub (most passes sent + received over the tournament)
priority 2 = other players who started at least one match (by minutes-ish: starts, then appearances)
priority 3 = substitutes who appeared
priority 4 = squad players who never appeared
Usage: python3 -I build_avatar_manifest.py
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from teams_meta import KITS, avatar_background  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

players = pd.read_csv(RAW / "players.csv")
teams = pd.read_csv(RAW / "teams.csv").set_index("team_id")["team_name"]
apps = pd.read_csv(RAW / "match_appearances.csv")
edges = pd.read_csv(RAW / "passing_network_edges.csv")
edges = edges[(edges.pass_count > 0) & (edges.from_player_id != edges.to_player_id)]

involvement = (edges.groupby("from_player_id").pass_count.sum()
               .add(edges.groupby("to_player_id").pass_count.sum(), fill_value=0))
starts = apps[apps.is_starter].groupby("player_id").size()
appeared = apps[apps.appeared].groupby("player_id").size()
position = apps.groupby("player_id").position.agg(lambda s: s.mode().iat[0])

players["team_name"] = players.team_id.map(teams)
players["position"] = players.player_id.map(position)
players["starts"] = players.player_id.map(starts).fillna(0).astype(int)
players["appearances"] = players.player_id.map(appeared).fillna(0).astype(int)
players["pass_involvement"] = players.player_id.map(involvement).fillna(0).astype(int)

hubs = players.loc[players.groupby("team_id").pass_involvement.idxmax(), "player_id"]
players["priority"] = 4
players.loc[players.appearances > 0, "priority"] = 3
players.loc[players.starts > 0, "priority"] = 2
players.loc[players.player_id.isin(hubs), "priority"] = 1
players["kit"] = players.team_id.map(lambda t: KITS[t][0])
players["trim"] = players.team_id.map(lambda t: KITS[t][1])
players["bg"] = players.team_id.map(avatar_background)

out = players.sort_values(["priority", "starts", "pass_involvement"], ascending=[True, False, False])
cols = ["player_id", "display_name", "team_id", "team_name", "position", "shirt_numbers",
        "priority", "starts", "appearances", "pass_involvement", "kit", "trim", "bg"]
out[cols].to_csv(ROOT / "data" / "avatar_manifest.csv", index=False)
print(out.priority.value_counts().sort_index().to_dict())
print(out[out.priority == 1][["display_name", "team_name", "pass_involvement"]].head(12).to_string(index=False))
