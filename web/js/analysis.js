/* Shared retrospective comparisons. All style z-scores use the full tournament
 * as a fixed reference. Scope changes which matches are averaged, not that scale.
 * The supplied six-part model is aggregated as stored and is never re-fitted here.
 */
(function () {
  const App = window.App;
  const records = Object.entries(App.tm).map(([key, row]) => ({ ...row, key }));
  const byKey = Object.fromEntries(records.map((row) => [row.key, row]));
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const average = (values) => {
    const valid = values.filter(finite);
    return valid.length ? d3.mean(valid) : null;
  };
  const difference = (left, right) => finite(left) && finite(right) ? left - right : null;
  const inScope = (row, scope) => {
    if (scope === "group") return row.stage === "Group";
    if (scope === "knockout") return row.stage !== "Group";
    return true;
  };
  const normalizeDials = (dials) => {
    const selected = App.dials.filter((dial) => Array.isArray(dials) && dials.includes(dial));
    return selected.length >= 2 ? selected : App.dials.slice();
  };

  function readDials(params = {}) {
    const raw = params instanceof URLSearchParams ? params.get("dials") : params.dials;
    if (typeof raw !== "string") return App.dials.slice();
    const indices = raw.split(",").filter((value) => /^\d+$/.test(value)).map(Number);
    return normalizeDials(App.dials.filter((_, index) => indices.includes(index)));
  }

  function query(dials, extra = {}) {
    const params = new URLSearchParams();
    params.set("dials", normalizeDials(dials).map((dial) => App.dials.indexOf(dial)).join(","));
    for (const [key, value] of Object.entries(extra)) {
      if (key !== "dials" && value != null && value !== "") params.set(key, String(value));
    }
    return `?${params}`;
  }

  function rows(teamId, scope = "all") {
    return records.filter((row) => row.team_id === teamId && inScope(row, scope));
  }

  function space(dials, scope = "all") {
    const result = App.styleSpace(normalizeDials(dials));
    result.team = {};
    for (const team of App.teams) {
      const selected = rows(team.id, scope);
      if (!selected.length) continue;
      const profile = result.dialIds.map((_, index) => average(selected.map((row) => result.match[row.key][index])));
      if (profile.every(finite)) result.team[team.id] = profile;
    }
    return result;
  }

  function twinTable(styleSpace) {
    const ids = Object.keys(styleSpace.team).filter((id) => styleSpace.team[id].every(finite));
    const pairDistances = [];
    const near = {};
    for (const id of ids) {
      near[id] = ids.filter((other) => other !== id).map((other) => ({
        id: other,
        d: App.dist(styleSpace.team[id], styleSpace.team[other]),
      })).sort((left, right) => left.d - right.d || left.id.localeCompare(right.id));
      for (const neighbor of near[id]) if (id < neighbor.id) pairDistances.push(neighbor.d);
    }
    pairDistances.sort(d3.ascending);
    const similarity = (distance) => finite(distance) && pairDistances.length
      ? 1 - d3.bisectLeft(pairDistances, distance) / pairDistances.length
      : null;
    for (const neighbors of Object.values(near)) {
      for (const neighbor of neighbors) neighbor.sim = similarity(neighbor.d);
    }
    return { near, similarity, pairs: pairDistances.length };
  }

  function metric(row, name) {
    if (!row) return null;
    switch (name) {
      case "gd": return difference(row.goals, row.goals_opp);
      case "xgd": return difference(row.xg, row.xga);
      case "quality": return finite(row.xg) && finite(row.shots) && row.shots > 0 ? row.xg / row.shots : null;
      case "finishing": return difference(row.goals, row.xg);
      case "conceding": return difference(row.xga, row.goals_opp);
      case "shotsAgainst": {
        const opponentRow = App.tm[`${row.match_id}_${row.opp_id}`];
        return finite(opponentRow?.shots) ? opponentRow.shots : null;
      }
      default: {
        const index = App.components.findIndex((component) => component.id === name);
        const value = index >= 0 ? row.decomp?.[index] : row[name];
        return finite(value) ? value : null;
      }
    }
  }

  function summary(selected = []) {
    const result = { n: selected.length };
    for (const name of ["gd", "xgd", "xg", "xga", "shots", "shotsAgainst", "goals", "poss", "finishing", "conceding"]) {
      result[name] = average(selected.map((row) => metric(row, name)));
    }
    result.conceded = average(selected.map((row) => row.goals_opp));
    const shotRows = selected.filter((row) => finite(row.xg) && finite(row.shots) && row.shots >= 0);
    const shots = d3.sum(shotRows, (row) => row.shots);
    result.quality = shots > 0 ? d3.sum(shotRows, (row) => row.xg) / shots : null;
    result.model = Object.fromEntries(App.components.map((component) => [
      component.id, average(selected.map((row) => metric(row, component.id))),
    ]));
    return result;
  }

  function vectorDistance(left, right) {
    if (!left || !right || !left.length || left.length !== right.length) return null;
    if (!left.every(finite) || !right.every(finite)) return null;
    return App.dist(left, right) / Math.sqrt(left.length);
  }

  function distance(firstKey, secondKey, dials) {
    const styleSpace = App.styleSpace(normalizeDials(dials));
    return vectorDistance(styleSpace.match[firstKey], styleSpace.match[secondKey]);
  }

  function nearest(key, dials, scope = "all", limit = 8) {
    const anchor = byKey[key];
    if (!anchor) return [];
    const styleSpace = App.styleSpace(normalizeDials(dials));
    const candidates = records
      .filter((row) => row.team_id !== anchor.team_id && row.match_id !== anchor.match_id && inScope(row, scope))
      .map((row) => ({ key: row.key, row, distance: vectorDistance(styleSpace.match[key], styleSpace.match[row.key]) }))
      .filter((candidate) => finite(candidate.distance))
      .sort((left, right) => left.distance - right.distance || left.key.localeCompare(right.key));
    return candidates.slice(0, Math.max(0, Number.isFinite(limit) ? Math.floor(limit) : 8));
  }

  function opponent(row) {
    const otherMatches = row ? records.filter((other) => other.team_id === row.opp_id && other.match_id !== row.match_id) : [];
    return {
      n: otherMatches.length,
      xg: average(otherMatches.map((other) => other.xg)),
      xga: average(otherMatches.map((other) => other.xga)),
    };
  }

  App.analysis = { records, readDials, query, rows, space, twinTable, summary, metric, distance, nearest, opponent };
})();
