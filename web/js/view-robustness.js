(function () {
  const App = window.App, A = App.analysis, R = App.robustness;
  const colors = App.isDesktop() ? ["#0a9396", "#e8743b"] : ["#087f81", "#b85d34"];
  const scopes = { all: "Whole tournament", group: "Group stage", knockout: "Knockout stage" };
  const source = "https://blogarchive.statsbomb.com/articles/soccer/modelling-team-playing-style/";

  App.views.robustness = function (root, params, first = "NED", second = "CRO", controller = null) {
    const result = R.audit(first, second, A.readDials(params), params.scope);
    const { a, b, dials, scope } = result;
    const fallback = App.team[a] && App.team[b] ? `#/twins/${a}/${b}${A.query(dials, { scope })}` : "#/twins";
    const back = typeof params.return === "string" && params.return.startsWith("#/") ? params.return : fallback;
    const allScenarios = [result.base, ...result.indicators, ...result.matches].filter(Boolean);
    let family = params.test === "matches" ? "matches" : "indicators";
    let direction = params.direction === "b" ? "b" : "a";
    let selected = allScenarios.find((scenario) => scenario.id === params.scenario) || result.base;
    if (selected?.kind === "match") family = "matches";
    if (selected?.kind === "indicator") family = "indicators";
    const query = (extra = {}, metrics = dials) => A.query(metrics, { scope, return: back, test: family, direction, scenario: selected?.id, ...extra });
    const currentUrl = () => `#/robustness/${a}/${b}${query()}`;
    const teamOptions = (chosen) => App.teams.slice().sort((left, right) => left.name.localeCompare(right.name)).map((team) =>
      `<option value="${team.id}" ${team.id === chosen ? "selected" : ""}>${App.esc(team.name)}</option>`).join("");
    const instance = controller || {};
    instance.update = rebuild;
    function rebuild(nextParams) {
      App.cleanup();
      App.views.robustness(root, nextParams, first, second, instance);
    }

    root.innerHTML = `<div class="robust-page">
      <div class="review-breadcrumb"><a href="${App.esc(back)}">← Return to your comparison</a><span>Style lab · Sensitivity</span></div>
      <section class="robust-hero"><div><div class="kicker">One pairing. Many checks.</div><h1>Audit the<br><em>resemblance.</em></h1><p>Does a close style pairing survive a different metric choice or the loss of a single match? Inspect every scenario and see the alternatives that move ahead.</p></div>
        <img class="robust-hero-art" src="img/gen/keeper_save.webp" alt="" width="720" height="720" loading="lazy" onerror="this.remove()"><div class="robust-hero-mark" aria-hidden="true"><span></span><span></span><span></span><span></span><b>01<span>→</span>?</b></div></section>
      <div class="robust-presets" aria-label="Example comparisons"><span>Explore a case</span>${[["NED", "CRO", "Netherlands & Croatia"], ["ESP", "GER", "Spain & Germany"], ["MEX", "SWE", "Mexico & Sweden"]].map(([left, right, label]) => `<a class="${a === left && b === right ? "active" : ""}" href="#/robustness/${left}/${right}${A.query(dials, { scope })}">${label} ↗</a>`).join("")}</div>
      <form class="robust-controls card"><label>Reference team<select name="first">${teamOptions(a)}</select></label><label>Comparison team<select name="second">${teamOptions(b)}</select></label><label>Match scope<select name="scope">${Object.entries(scopes).map(([key, label]) => `<option value="${key}" ${key === scope ? "selected" : ""}>${label}</option>`).join("")}</select></label><button class="btn" type="submit">Run comparison →</button><p class="note" data-form-error></p></form>
      <details class="robust-metrics"><summary>${dials.length} selected style indicators</summary><p class="note">Your selected indicators define the starting comparison. Each test removes one input while holding the remaining reference scale fixed.</p><div class="review-chips">${App.dials.map((dial, index) => `<button type="button" class="chip ${dials.includes(dial) ? "on" : ""}" aria-pressed="${dials.includes(dial)}" data-dial="${index}">${dial}</button>`).join("")}</div></details>
      ${result.valid ? `<div class="robust-pairline">${[a, b].map((id, index) => `<span>${App.flag(id, 32)}<b>${App.esc(App.team[id].name)}</b><small>${result.counts[index]} matches</small></span>`).join('<i>↔</i>')}<span class="robust-percentile">${Math.round(result.base.percentile * 100)} / 100 <small>baseline similarity percentile</small></span></div>
      <div class="robust-direction" aria-label="Rank direction"><span>Whose nearest teams?</span><button type="button" data-direction="a">${App.esc(App.team[a].name)}</button><button type="button" data-direction="b">${App.esc(App.team[b].name)}</button></div>
      <section class="robust-stats" data-stats></section>
      <div class="robust-workspace"><section class="card robust-scenarios"><div class="robust-panel-head"><div class="kicker">01 / Perturb the comparison</div><h2>How far does the rank move?</h2></div>
        <div class="robust-tabs" role="tablist" aria-label="Sensitivity test"><button type="button" role="tab" data-test="indicators">Remove an indicator <span>${result.indicators.length}</span></button><button type="button" role="tab" data-test="matches">Remove a match <span>${result.matches.length}</span></button></div>
        <p class="note" data-chart-caption></p><div data-rank-chart></div><div class="robust-chart-key"><i></i><span>Top-five zone</span><span>Smaller rank = closer style</span></div>
      </section><aside class="card robust-detail" data-detail aria-live="polite"></aside></div>
      <section class="card robust-feature-panel"><div class="robust-panel-head"><div><div class="kicker">03 / Read the selected scenario</div><h2>Which dimensions separate them?</h2></div><span class="robust-scenario-tag" data-feature-tag></span></div><p class="note">Dots use the same full-tournament standardized scale. The connector shows the gap. The share column allocates the pair’s squared distance across the retained indicators.</p><div class="robust-feature-legend"><span><i style="background:${colors[0]}"></i>${App.esc(App.team[a].name)}</span><span><i style="background:${colors[1]}"></i>${App.esc(App.team[b].name)}</span><span>Team values are in standard deviations</span></div><div data-feature-chart></div></section>
      <section class="robust-method card"><div><div class="kicker">What this audit measures</div><h2>Sensitivity to the inputs.</h2><p>These are enumerated alternative comparisons. Counts and rank ranges describe this audit, with no sampling probabilities or confidence intervals attached.</p></div><div><p>Indicator tests remove one metric from every team profile. Match tests remove one team–match observation from either selected team, update that team’s mean, and keep other team means fixed. Both rank directions are recalculated.</p><p>All z-scores retain the original 208-record reference. Neighbors come from teams with matches in the selected scope. Tied distances share a rank. The percentile benchmark is recalculated for each scenario.</p>${result.notes.map((note) => `<p class="robust-method-note">${App.esc(note)}</p>`).join("")}<p>Inspired by the emphasis on interpretability and stability in <a href="${source}" target="_blank" rel="noopener">StatsBomb’s playing-style research ↗</a>. The deterministic deletion audit here is a project-specific method.</p><button class="btn small" data-export>Download full audit CSV ↓</button></div></section>` : `<section class="card robust-empty"><h2>Choose an available comparison</h2><p>${App.esc(result.reason)}</p></section>`}
    </div>`;

    root.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      const fields = event.target.elements;
      if (fields.first.value === fields.second.value) { root.querySelector("[data-form-error]").textContent = "Choose two different teams."; return; }
      App.go(`#/robustness/${fields.first.value}/${fields.second.value}${query({ scope: fields.scope.value, scenario: "baseline" })}`);
    };
    root.querySelectorAll("[data-dial]").forEach((button) => {
      button.onclick = () => {
        const dial = App.dials[Number(button.dataset.dial)];
        if (dials.includes(dial) && dials.length <= 2) return;
        const next = App.dials.filter((candidate) => candidate === dial ? !dials.includes(candidate) : dials.includes(candidate));
        App.go(`#/robustness/${a}/${b}${query({ scenario: "baseline" }, next)}`);
      };
    });
    if (!result.valid) return instance;

    const rankKey = () => direction === "a" ? "rankA" : "rankB";
    const referenceId = () => direction === "a" ? a : b;
    const partnerId = () => direction === "a" ? b : a;
    const activeColor = () => colors[direction === "a" ? 0 : 1];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rankSvg;

    function remember() {
      // Replace keeps the selected diagnostic shareable without flooding Back history.
      App.go(currentUrl(), { replace: true });
    }

    function selectScenario(scenario, persist = true) {
      selected = scenario;
      if (persist) { remember(); return; }
      rankSvg?.selectAll("g.robust-rank-row").classed("selected", (row) => row.id === selected.id)
        .attr("aria-pressed", (row) => row.id === selected.id);
      drawDetail();
      drawFeatures();
    }

    function drawStats() {
      const metric = rankKey(), baseRank = result.base[metric];
      const label = `${App.team[partnerId()].name} among ${App.team[referenceId()].name}’s closest teams`;
      root.querySelector("[data-stats]").innerHTML = `<div><span class="kicker">Original pairing</span><b>#${baseRank}</b><p>${App.esc(label)}</p><small>${result.base.nearA.length} possible neighbors</small></div>${[["Indicator changes", result.indicators], ["Match changes", result.matches]].map(([title, scenarios]) => {
        const stats = R.summarize(scenarios, metric);
        return `<div><span class="kicker">${title}</span><b>${stats.n ? `${stats.min}–${stats.max}` : "—"}</b><p>Rank across deletion scenarios</p><small>${stats.n ? `${stats.top5} of ${stats.n} scenarios stay in the top five` : "Insufficient inputs for this test"}</small></div>`;
      }).join("")}`;
    }

    function drawRankChart() {
      const scenarios = [result.base, ...result[family]];
      const node = root.querySelector("[data-rank-chart]");
      const width = Math.max(280, node.clientWidth), narrow = width < 470;
      const left = narrow ? 122 : 178, right = 30, rowHeight = 43, height = scenarios.length * rowHeight + 58;
      const x = d3.scaleLinear().domain([1, result.base.nearA.length]).range([left, width - right]);
      node.innerHTML = "";
      rankSvg = d3.select(node).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("aria-label", "Partner similarity rank under individual deletion scenarios").attr("role", "group");
      rankSvg.append("rect").attr("x", x(1) - 7).attr("y", 32).attr("width", x(Math.min(5.5, result.base.nearA.length)) - x(1) + 7).attr("height", height - 35).attr("rx", 5).attr("fill", "#edf3eb");
      rankSvg.append("g").attr("class", "robust-axis").attr("transform", "translate(0,27)").call(d3.axisTop(x).tickValues((narrow ? [1, 10, 20, 30, 40] : [1, 5, 10, 20, 30, 40]).filter((rank) => rank <= result.base.nearA.length)).tickSize(0));
      const groups = rankSvg.selectAll("g.robust-rank-row").data(scenarios).join("g").attr("class", "robust-rank-row")
        .attr("transform", (_, index) => `translate(0,${45 + index * rowHeight})`).attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", (scenario) => `${scenario.label}, partner rank ${scenario[rankKey()]}`)
        .on("click", (_, scenario) => selectScenario(scenario))
        .on("keydown", (event, scenario) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectScenario(scenario); } });
      groups.append("rect").attr("class", "robust-row-highlight").attr("x", 0).attr("y", -10).attr("width", width).attr("height", 36).attr("rx", 7);
      groups.append("text").attr("x", 0).attr("y", 12).attr("class", "robust-svg-label").text((scenario) => {
        const text = scenario.kind === "indicator" ? `− ${scenario.omittedDial}` : scenario.kind === "baseline" ? "Original" : scenario.label;
        return narrow && text.length > 19 ? `${text.slice(0, 17)}…` : text;
      }).append("title").text((scenario) => scenario.label);
      groups.append("line").attr("x1", x(result.base[rankKey()])).attr("x2", (scenario) => x(scenario[rankKey()])).attr("y1", 8).attr("y2", 8).attr("stroke", "#c9d3cd").attr("stroke-width", 2);
      groups.append("circle").attr("cx", x(result.base[rankKey()])).attr("cy", 8).attr("r", 3).attr("fill", "white").attr("stroke", "#9fac9f");
      groups.append("circle").attr("class", "robust-rank-dot").attr("cx", x(result.base[rankKey()])).attr("cy", 8).attr("r", 5.5).attr("fill", activeColor())
        .transition().duration(reducedMotion ? 0 : 420).attr("cx", (scenario) => x(scenario[rankKey()]));
      groups.append("text").attr("x", width - 1).attr("y", 12).attr("text-anchor", "end").attr("class", "robust-svg-value").text((scenario) => scenario[rankKey()]);
      root.querySelector("[data-chart-caption]").textContent = family === "indicators"
        ? `${App.team[partnerId()].name}’s rank after removing one selected indicator. Select a row to inspect the revised neighbors.${result.indicators.length ? "" : " Select at least three indicators to run this test."}`
        : `${App.team[partnerId()].name}’s rank after removing one team–match record. A single record is removed from the named team in each scenario.`;
      selectScenario(selected, false);
    }

    function drawDetail() {
      const reference = referenceId(), partner = partnerId();
      const neighbors = direction === "a" ? selected.nearA : selected.nearB;
      const baselineNeighbors = direction === "a" ? result.base.nearA : result.base.nearB;
      const displayed = neighbors.slice(0, 5);
      if (!displayed.some((neighbor) => neighbor.id === partner)) displayed.push(neighbors.find((neighbor) => neighbor.id === partner));
      const maximum = Math.max(...displayed.map((neighbor) => neighbor.distance), 0.01);
      let explanation = "All selected indicators and all selected-scope matches are included.";
      if (selected.kind === "indicator") explanation = `${selected.omittedDial} is excluded from every team profile. ${selected.dials.length} indicators remain.`;
      if (selected.kind === "match") {
        const row = App.tm[selected.omittedKey];
        explanation = `${App.team[selected.omittedTeam].name}’s M${row.number} against ${App.team[row.opp_id].name} is removed from its average. All other team profiles are held fixed.`;
      }
      root.querySelector("[data-detail]").innerHTML = `<div class="kicker">02 / Inspect this scenario</div><h2>${App.esc(selected.label)}</h2><p class="note">${App.esc(explanation)}</p>
        <div class="robust-detail-score"><b>#${selected[rankKey()]}</b><span>${App.esc(App.team[partner].name)} in ${App.esc(App.team[reference].name)}’s neighbors<small>Original rank #${result.base[rankKey()]} · RMS distance ${App.fix(selected.distance, 3)}</small></span></div>
        <h3>Who is closest now?</h3><ol class="robust-neighbors">${displayed.map((neighbor) => {
          const rank = 1 + neighbors.filter((other) => other.d < neighbor.d - 1e-12).length;
          const baseline = baselineNeighbors.find((other) => other.id === neighbor.id);
          const originalRank = 1 + baselineNeighbors.filter((other) => other.d < baseline.d - 1e-12).length;
          return `<li class="${neighbor.id === partner ? "partner" : ""}"><span class="robust-neighbor-rank">${rank}</span>${App.flag(neighbor.id, 24)}<div><b>${App.esc(App.team[neighbor.id].name)}</b><small>${neighbor.id === partner ? "Selected partner · " : ""}originally #${originalRank}</small><i data-distance="${neighbor.distance / maximum}" style="background:${activeColor()}"></i></div><strong>${App.fix(neighbor.distance, 2)}</strong></li>`;
        }).join("")}</ol><p class="robust-distance-note">Bars show RMS style distance. Smaller is closer.</p>
        ${selected.kind === "match" ? `<a class="btn small ghost" href="#/lab/${App.tm[selected.omittedKey].match_id}${App.esc(A.query(dials, { team: selected.omittedTeam, return: currentUrl() }))}">Inspect the omitted match ↗</a>` : `<a class="btn small ghost" href="#/twins/${a}/${b}${App.esc(A.query(selected.dials, { scope, return: currentUrl() }))}">Investigate these indicators ↗</a>`}`;
      d3.select(root.querySelector("[data-detail]")).selectAll("[data-distance]").style("width", "0%")
        .transition().duration(reducedMotion ? 0 : 400).style("width", function () { return `${Number(this.dataset.distance) * 100}%`; });
    }

    function drawFeatures() {
      const node = root.querySelector("[data-feature-chart]");
      const width = Math.max(520, node.clientWidth), narrow = width < 700;
      const left = narrow ? 130 : 175, right = narrow ? 150 : 180, rowHeight = 43;
      const height = dials.length * rowHeight + 61;
      const max = Math.max(2.5, ...result.base.gaps.flatMap((gap) => [Math.abs(gap.a), Math.abs(gap.b)]), ...selected.gaps.flatMap((gap) => [Math.abs(gap.a), Math.abs(gap.b)]));
      const x = d3.scaleLinear().domain([-max, max]).range([left, width - right]);
      node.innerHTML = "";
      const svg = d3.select(node).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Standardized style values and distance contributions for the selected scenario");
      svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 25).attr("y2", height - 35).attr("stroke", "#ccd5ce");
      svg.append("text").attr("x", width).attr("y", 14).attr("text-anchor", "end").attr("class", "robust-svg-label").text(narrow ? "A / B · share" : "Team A / Team B · distance share");
      dials.forEach((dial, index) => {
        const baseline = result.base.gaps.find((gap) => gap.dial === dial);
        const gap = selected.gaps.find((entry) => entry.dial === dial);
        const row = svg.append("g").attr("transform", `translate(0,${index * rowHeight + 33})`);
        row.append("text").attr("x", 0).attr("y", 10).attr("class", "robust-svg-label").text(narrow && dial.length > 17 ? `${dial.slice(0, 15)}…` : dial).append("title").text(dial);
        if (!gap) {
          row.attr("opacity", 0.45);
          row.append("text").attr("x", x(0)).attr("y", 10).attr("class", "robust-svg-label").text("Excluded");
          return;
        }
        row.append("line").attr("x1", x(baseline.a)).attr("x2", x(baseline.b)).attr("y1", 5).attr("y2", 5).attr("stroke", "#b9c6bc").attr("stroke-width", 3)
          .transition().duration(reducedMotion ? 0 : 420).attr("x1", x(gap.a)).attr("x2", x(gap.b));
        [gap.a, gap.b].forEach((value, side) => row.append("circle").attr("cx", x(side === 0 ? baseline.a : baseline.b)).attr("cy", 5).attr("r", 5).attr("fill", colors[side])
          .transition().duration(reducedMotion ? 0 : 420).attr("cx", x(value)));
        row.append("text").attr("x", width).attr("y", 10).attr("text-anchor", "end").attr("class", "robust-svg-value")
          .text(`${App.signed(gap.a, 2)} / ${App.signed(gap.b, 2)} · ${Math.round(gap.share * 100)}%`);
        row.append("title").text(`${dial}. ${App.team[a].name} ${gap.a.toFixed(4)} sd. ${App.team[b].name} ${gap.b.toFixed(4)} sd. Difference ${gap.difference.toFixed(4)} sd. Squared-distance share ${(gap.share * 100).toFixed(2)}%.`);
      });
      svg.append("g").attr("transform", `translate(0,${height - 28})`).call(d3.axisBottom(x).ticks(narrow ? 3 : 7));
      root.querySelector("[data-feature-tag]").textContent = selected.label;
    }

    function refresh() {
      root.querySelectorAll("[data-direction]").forEach((button) => {
        button.classList.toggle("active", button.dataset.direction === direction);
        button.setAttribute("aria-pressed", button.dataset.direction === direction);
      });
      root.querySelectorAll("[data-test]").forEach((button) => {
        button.classList.toggle("active", button.dataset.test === family);
        button.setAttribute("aria-selected", button.dataset.test === family);
      });
      drawStats(); drawRankChart();
    }
    root.querySelectorAll("[data-test]").forEach((button) => { button.onclick = () => {
      App.go(`#/robustness/${a}/${b}${query({ test: button.dataset.test, scenario: "baseline" })}`, { replace: true });
    }; });
    root.querySelectorAll("[data-direction]").forEach((button) => { button.onclick = () => {
      App.go(`#/robustness/${a}/${b}${query({ direction: button.dataset.direction })}`, { replace: true });
    }; });
    root.querySelector("[data-export]").onclick = () => {
      const rows = [["reference_team", "partner_team", "scope", "scenario", "kind", "omitted_record", "retained_indicators", "rms_distance", "partner_rank_from_reference", "reference_rank_from_partner", "similarity_percentile", "pair_benchmark", ...dials.flatMap((dial) => [`${dial}: reference z`, `${dial}: partner z`, `${dial}: difference z`, `${dial}: squared-distance share`])],
        ...allScenarios.map((scenario) => [a, b, scope, scenario.label, scenario.kind, scenario.omittedKey || scenario.omittedDial || "", scenario.dials.join(" | "), scenario.distance, scenario.rankA, scenario.rankB, scenario.percentile * 100, scenario.benchmarkPairs, ...dials.flatMap((dial) => {
          const gap = scenario.gaps.find((entry) => entry.dial === dial);
          return gap ? [gap.a, gap.b, gap.difference, gap.share] : ["", "", "", ""];
        })])];
      const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `style-robustness-${a}-${b}-${scope}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    refresh();
    App.onResize(root.querySelector("[data-rank-chart]"), () => { drawRankChart(); });
    instance.update = (nextParams) => {
      const nextDials = A.readDials(nextParams);
      const nextScope = ["group", "knockout"].includes(nextParams.scope) ? nextParams.scope : "all";
      const nextBack = typeof nextParams.return === "string" && nextParams.return.startsWith("#/") ? nextParams.return : fallback;
      if (nextDials.join("|") !== dials.join("|") || nextScope !== scope || nextBack !== back) {
        rebuild(nextParams); return;
      }
      const previousFamily = family, previousDirection = direction;
      family = nextParams.test === "matches" ? "matches" : "indicators";
      direction = nextParams.direction === "b" ? "b" : "a";
      selected = allScenarios.find((scenario) => scenario.id === nextParams.scenario) || result.base;
      if (selected.kind === "match") family = "matches";
      if (selected.kind === "indicator") family = "indicators";
      if (previousFamily === family && previousDirection === direction) selectScenario(selected, false);
      else refresh();
    };
    return instance;
  };
})();
