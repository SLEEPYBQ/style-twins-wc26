/* Deterministic sensitivity checks for a selected style pairing.
 * Standardization stays fixed. Each scenario changes one input to the comparison.
 */
(function () {
  const App = window.App;
  const A = App.analysis;

  function evaluate(profiles, dials, a, b, definition) {
    const table = A.twinTable({ team: profiles });
    const nearA = table.near[a].map((neighbor) => ({ ...neighbor, distance: neighbor.d / Math.sqrt(dials.length) }));
    const nearB = table.near[b].map((neighbor) => ({ ...neighbor, distance: neighbor.d / Math.sqrt(dials.length) }));
    const partnerA = nearA.find((neighbor) => neighbor.id === b);
    const partnerB = nearB.find((neighbor) => neighbor.id === a);
    const squared = dials.map((_, index) => (profiles[a][index] - profiles[b][index]) ** 2);
    const total = d3.sum(squared);
    const rank = (neighbors, partner) => 1 + neighbors.filter((neighbor) => neighbor.d < partner.d - 1e-12).length;
    return {
      ...definition,
      dials: dials.slice(),
      distance: partnerA.distance,
      rankA: rank(nearA, partnerA),
      rankB: rank(nearB, partnerB),
      percentile: partnerA.sim,
      benchmarkPairs: table.pairs,
      nearA,
      nearB,
      gaps: dials.map((dial, index) => ({
        dial,
        a: profiles[a][index],
        b: profiles[b][index],
        difference: profiles[a][index] - profiles[b][index],
        share: total > 0 ? squared[index] / total : 0,
      })),
    };
  }

  function audit(first, second, selectedDials = App.dials, selectedScope = "all") {
    const a = String(first || "").toUpperCase(), b = String(second || "").toUpperCase();
    const scope = ["group", "knockout"].includes(selectedScope) ? selectedScope : "all";
    const dials = A.readDials({ dials: selectedDials.map((dial) => App.dials.indexOf(dial)).join(",") });
    const result = { valid: false, reason: "", a, b, dials, scope, counts: [0, 0], base: null, indicators: [], matches: [], notes: [] };
    if (!App.team[a] || !App.team[b] || a === b) {
      result.reason = "Choose two different teams to audit their similarity.";
      return result;
    }
    const rows = [A.rows(a, scope), A.rows(b, scope)];
    result.counts = rows.map((list) => list.length);
    if (rows.some((list) => !list.length)) {
      result.reason = "One of these teams has no matches in this scope. Choose another scope or pair.";
      return result;
    }
    const space = A.space(dials, scope);
    if (!space.team[a] || !space.team[b]) {
      result.reason = "A complete style profile is unavailable for one of these teams in this scope.";
      return result;
    }
    result.valid = true;
    result.base = evaluate(space.team, dials, a, b, { id: "baseline", kind: "baseline", label: "Original comparison" });

    if (dials.length > 2) {
      result.indicators = dials.map((omittedDial) => {
        const remaining = dials.filter((dial) => dial !== omittedDial);
        const profiles = Object.fromEntries(Object.entries(space.team).map(([id, values]) => [
          id, values.filter((_, index) => dials[index] !== omittedDial),
        ]));
        return evaluate(profiles, remaining, a, b, {
          id: `indicator-${App.dials.indexOf(omittedDial)}`,
          kind: "indicator",
          label: `Without ${omittedDial}`,
          omittedDial,
        });
      });
    } else {
      result.notes.push("Indicator omission starts with at least three selected metrics, so each scenario retains two.");
    }

    [a, b].forEach((team, side) => {
      if (rows[side].length < 2) {
        result.notes.push(`${App.team[team].name} has only one match in this scope. Its match-omission test is unavailable.`);
        return;
      }
      rows[side].forEach((omitted) => {
        const remaining = rows[side].filter((row) => row.key !== omitted.key);
        const profile = dials.map((_, index) => d3.mean(remaining, (row) => space.match[row.key][index]));
        result.matches.push(evaluate({ ...space.team, [team]: profile }, dials, a, b, {
          id: `match-${omitted.key}`,
          kind: "match",
          label: `${team} M${omitted.number} vs ${omitted.opp_id}`,
          omittedKey: omitted.key,
          omittedTeam: team,
        }));
      });
    });
    return result;
  }

  function summarize(scenarios, direction = "rankA") {
    const values = scenarios.map((scenario) => scenario[direction]).filter(Number.isFinite);
    return {
      n: values.length,
      min: values.length ? d3.min(values) : null,
      max: values.length ? d3.max(values) : null,
      top5: values.filter((rank) => rank <= 5).length,
    };
  }

  App.robustness = { audit, summarize };
})();
