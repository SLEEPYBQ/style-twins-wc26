/* Compare two observed team-match performances while retaining the chosen style definition. */
(function () {
  const App = window.App;
  const colors = ["#087f8c", "#bd5636"];
  const safeReturn = (value) => /^#\/(twins|styles|matches|match|team|duel|lab|robustness)(\/|\?|$)/.test(value || "") ? value : "#/matches";

  App.views.duel = function (root, params, firstKey, secondKey) {
    const analysis = App.analysis;
    const dials = analysis.readDials(params);
    const scope = ["group", "knockout"].includes(params.scope) ? params.scope : "all";
    const first = analysis.records.find((row) => row.key === firstKey);
    if (!first) {
      root.innerHTML = '<div class="card"><h2>Select a match to begin</h2><p>Open a match and choose a similar performance to compare.</p><a class="btn" href="#/matches">Find a match →</a></div>';
      return;
    }
    const candidates = analysis.nearest(first.key, dials, scope, 208);
    let second = analysis.records.find((row) => row.key === secondKey);
    if (!second || second.team_id === first.team_id || second.match_id === first.match_id) second = candidates[0]?.row;
    const back = safeReturn(params.return);
    const destination = (a, b, next = {}) => `#/duel/${a}/${b || ""}${analysis.query(dials, { scope, return: back, ...next })}`;
    const currentUrl = destination(first.key, second?.key);
    const name = (row) => App.team[row.team_id].name;
    const label = (row) => `${name(row)} v ${App.team[row.opp_id].name} · M${row.number} · ${App.stageShort(row.stage)}`;
    const replay = (row, mode = "replay") => `#/match/${row.match_id}${analysis.query(dials, { return: currentUrl, mode })}`;
    const sourceLink = (row) => {
      const source = window.WC_SOURCES?.[row.match_id];
      return source ? `<a class="duel-report" href="${App.esc(source.url)}" target="_blank" rel="noopener">FIFA source report ↗</a>` : "";
    };
    const format = (value, digits = 2) => App.fix(value, digits);

    root.innerHTML = `
      <div class="duel-topline"><a class="btn small ghost" href="${App.esc(back)}">← Back to analysis</a><span class="kicker">Match evidence · one team in one match</span></div>
      <section class="duel-intro"><h1>Similar tactics.<br><em>Inspect the difference.</em></h1><p>Keep one performance in view while comparing chances, opponents and the choices behind another.</p></section>
      <section class="card duel-controls">
        <div><label class="duel-label" for="duel-first">Pinned performance</label><div id="duel-first"></div></div>
        <div><label class="duel-label" for="duel-second">Comparison performance</label><div id="duel-second"></div></div>
        <div><label class="duel-label" for="duel-scope">Find neighbours in</label><select id="duel-scope"><option value="all">All tournament matches</option><option value="group">Group stage</option><option value="knockout">Knockout stage</option></select></div>
      </section>
      <details class="card duel-definition"><summary>Similarity uses ${dials.length} selected style metrics</summary><p class="note">Each selected metric has equal weight after standardization across all 208 team-match records. Distance is the root mean square standardized difference. Lower means closer.</p><div class="duel-dials">${App.dials.map((dial) => `<label><input type="checkbox" value="${App.dials.indexOf(dial)}" ${dials.includes(dial) ? "checked" : ""}> ${App.esc(dial)}</label>`).join("")}</div><p class="note" data-dial-note>Keep at least two metrics. Scores and xG are excluded from similarity.</p></details>
      <div id="duel-evidence"></div>
      <section class="section"><div class="section-head"><div><div class="kicker">Keep the first performance pinned</div><h2>Other close comparisons</h2><p>Different teams and different physical matches. Candidates use the selected style metrics and stage range.</p></div></div><div class="duel-neighbours" id="duel-neighbours"></div></section>`;

    const firstOptions = analysis.records.slice().sort((a, b) => name(a).localeCompare(name(b)) || a.number - b.number)
      .map((row) => ({ value: row.key, label: label(row), group: name(row) }));
    App.ui.select("duel-first", { options: firstOptions, value: first.key, searchable: true, ariaLabel: "Pinned performance", onChange: (key) => App.go(destination(key, "")) });
    const comparisonOptions = candidates.map((candidate) => ({ value: candidate.key, label: `${label(candidate.row)} · distance ${format(candidate.distance)}` }));
    if (second && !comparisonOptions.some((option) => option.value === second.key)) comparisonOptions.unshift({ value: second.key, label: `${label(second)} · outside candidate stage range` });
    App.ui.select("duel-second", { options: comparisonOptions, value: second?.key || "", searchable: true, ariaLabel: "Comparison performance", placeholder: "No eligible matches", onChange: (key) => App.go(destination(first.key, key)) });
    const scopeSelect = root.querySelector("#duel-scope");
    scopeSelect.value = scope;
    scopeSelect.onchange = () => App.go(destination(first.key, "", { scope: scopeSelect.value }));
    root.querySelectorAll('.duel-dials input').forEach((input) => input.addEventListener("change", () => {
      const selected = [...root.querySelectorAll('.duel-dials input:checked')].map((item) => App.dials[Number(item.value)]);
      if (selected.length < 2) {
        input.checked = true;
        root.querySelector("[data-dial-note]").textContent = "Keep at least two metrics to compare style.";
        return;
      }
      App.go(`#/duel/${first.key}/${second?.key || ""}${analysis.query(selected, { scope, return: back })}`);
    }));
    root.querySelector("#duel-neighbours").innerHTML = candidates.slice(0, 8).map((candidate, i) => {
      const row = candidate.row;
      return `<a class="card duel-neighbour ${row.key === second?.key ? "selected" : ""}" href="${App.esc(destination(first.key, row.key))}"><span class="duel-rank">${i + 1}</span><div>${App.flag(row.team_id, 25)} <b>${App.esc(name(row))}</b><p>v ${App.esc(App.team[row.opp_id].name)} · ${App.stageShort(row.stage)} · M${row.number}</p><span class="note">Style distance ${format(candidate.distance)} · xG ${format(row.xg)} · score ${row.goals}–${row.goals_opp}</span></div></a>`;
    }).join("") || '<p class="card">No eligible performances in this stage. Select all tournament matches.</p>';
    if (!second) {
      root.querySelector("#duel-evidence").innerHTML = '<div class="card">Choose a wider stage range to find a comparison.</div>';
      return;
    }

    const rows = [first, second];
    const distance = analysis.distance(first.key, second.key, dials);
    const metricDefinitions = [
      ["Shots", (r) => r.shots, 0], ["Expected goals", (r) => r.xg, 2],
      ["xG per shot", (r) => r.shots ? r.xg / r.shots : null, 3],
      ["Goals", (r) => r.goals, 0], ["xG conceded", (r) => r.xga, 2], ["Goals conceded", (r) => r.goals_opp, 0],
    ];
    const metricCards = metricDefinitions.map(([metric, getValue, digits]) => {
      const values = rows.map(getValue), maximum = Math.max(...values.filter(Number.isFinite), 0.01);
      return `<div class="duel-metric"><div class="duel-metric-title">${metric}</div>${values.map((value, side) => `<div class="duel-measure"><span class="duel-dot" style="background:${colors[side]}"></span><div class="duel-track"><i style="background:${colors[side]};width:${value == null ? 0 : value / maximum * 100}%"></i></div><b>${format(value, digits)}</b></div>`).join("")}</div>`;
    }).join("");
    const xgGap = first.xg - second.xg;
    const xgComparison = xgGap === 0 ? `created the same xG as ${App.esc(name(second))}` : `created <b>${format(Math.abs(xgGap))} ${xgGap > 0 ? "more" : "less"} xG</b> than ${App.esc(name(second))}`;
    const evidence = root.querySelector("#duel-evidence");
    evidence.innerHTML = `
      <div class="duel-match-heads">${rows.map((row, side) => `<article class="card duel-match-head" style="--duel-color:${colors[side]}"><div class="kicker">${side === 0 ? "Pinned performance" : "Comparison"} · M${row.number}</div><h2>${App.flag(row.team_id, 40)} ${App.esc(name(row))}</h2><p>v ${App.esc(App.team[row.opp_id].name)} · ${App.esc(row.stage)}</p><div class="duel-score">${row.goals}–${row.goals_opp}<span>${App.esc(App.match[row.match_id].date)}${App.match[row.match_id].aet ? " · extra time" : ""}</span></div><a class="btn small ghost" href="${App.esc(replay(row))}">Inspect match →</a>${sourceLink(row)}</article>`).join("")}</div>
      <div class="duel-reading"><span><b>${format(distance)}</b> style distance</span><p>${App.esc(name(first))} ${xgComparison} in these two matches. Compare shot quantity and quality below, then inspect the opponents.</p></div>
      <div class="duel-section-heading"><span>01</span><div><h2>What changed in the chances?</h2><p>Observed full-match totals. Within each metric both teams share a scale. Extra time is included where played.</p></div></div>
      <section class="card"><div class="duel-legend">${rows.map((row, i) => `<span><i style="background:${colors[i]}"></i>${App.esc(name(row))}</span>`).join("")}</div><div class="duel-metrics">${metricCards}</div></section>
      <div class="duel-section-heading"><span>02</span><div><h2>Check the resemblance</h2><p>Standardized style values on one common scale. The middle line is the tournament reference mean.</p></div></div>
      <section class="card"><div id="duel-style-chart"></div><div class="duel-legend">${rows.map((row, i) => `<span><i style="background:${colors[i]}"></i>${App.esc(name(row))}</span>`).join("")}</div>
        <details class="duel-values"><summary>Inspect the original metric values</summary><div class="duel-values-scroll"><table><thead><tr><th scope="col">Style measure</th>${rows.map((row) => `<th scope="col">${App.esc(name(row))}</th>`).join("")}</tr></thead><tbody>${dials.map((dial) => `<tr><th scope="row">${App.esc(App.dialInfo[dial].label)}</th>${rows.map((row) => `<td>${format(row.dials[App.dials.indexOf(dial)])}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="note">Phase measures are normalized relative profiles. <a href="#/method">Definitions and units</a></p></details>
      </section>
      <div class="duel-section-heading"><span>03</span><div><h2>Put the opponent back in the picture</h2><p>Opponent averages across their other tournament matches. Each estimate excludes the match being inspected and includes later matches.</p></div></div>
      <div class="duel-match-heads">${rows.map((row) => {
        const opponent = analysis.opponent(row);
        return `<article class="card duel-opponent"><div class="kicker">${App.esc(name(row))} faced</div><h3>${App.flag(row.opp_id, 28)} ${App.esc(App.team[row.opp_id].name)}</h3><dl><div><dt>Other matches</dt><dd>${opponent.n}</dd></div><div><dt>xG created per match</dt><dd>${format(opponent.xg)}</dd></div><div><dt>xG conceded per match</dt><dd>${format(opponent.xga)}</dd></div></dl><p class="note">A descriptive comparison of this opponent’s schedule and performance. The matches and opponents differ across estimates.</p><a href="#/team/${row.opp_id}${analysis.query(dials, { return: currentUrl })}">Explore this opponent →</a></article>`;
      }).join("")}</div>
      <section class="card duel-next"><div><div class="kicker">Follow the evidence</div><h3>How did the teams move the ball?</h3><p>Open the directed passing network, inspect line-breaking routes, or brush the recorded attempts in the Match Lab.</p></div><div class="duel-next-actions">${rows.map((row) => `<a class="btn small ghost" href="#/lab/${row.match_id}${App.analysis.query(dials, { team: row.team_id, return: currentUrl })}">${App.esc(name(row))} Match Lab →</a>`).join("")}</div></section>`;

    const space = App.styleSpace(dials);
    const values = rows.map((row) => space.match[row.key]);
    const maximum = Math.max(2, ...values.flat().map(Math.abs));
    const chart = evidence.querySelector("#duel-style-chart");
    const renderStyle = () => {
      chart.innerHTML = "";
      const width = Math.max(320, chart.clientWidth), labelWidth = width < 540 ? 115 : 175;
      const height = dials.length * 49 + 35;
      const x = d3.scaleLinear().domain([-maximum, maximum]).range([labelWidth, width - 25]);
      const svg = d3.select(chart).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Selected style metrics for the two performances, standardized on a shared scale");
      svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 5).attr("y2", height - 28).attr("stroke", "#bec3c3");
      dials.forEach((dial, index) => {
        const y = index * 49 + 17;
        svg.append("text").attr("x", 0).attr("y", y + 7).attr("font-size", width < 540 ? 10 : 12).attr("fill", "#34424a").text(dial);
        values.forEach((vector, side) => {
          const value = vector[index];
          svg.append("rect").attr("x", Math.min(x(0), x(value))).attr("y", y + side * 12 - 6).attr("width", Math.abs(x(value) - x(0))).attr("height", 9).attr("rx", 2).attr("fill", colors[side])
            .append("title").text(`${name(rows[side])}, ${dial}, ${App.signed(value, 2)} standard deviations`);
        });
      });
      svg.append("g").attr("transform", `translate(0,${height - 23})`).call(d3.axisBottom(x).ticks(5).tickFormat((value) => App.signed(value, 1))).call((group) => group.select(".domain").remove());
    };
    renderStyle();
    App.onResize(chart, renderStyle);
  };
})();
