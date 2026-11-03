/* Team comparison with shared criteria and linked match evidence. */
(function () {
  const App = window.App, A = App.analysis;
  const colors = ["#087f81", "#b85d34"];
  const scopes = { all: "Whole tournament", group: "Group stage", knockout: "Knockout stage" };
  const metrics = {
    xgd: ["Chance balance", "xG difference per match", 2],
    gd: ["Scoreline balance", "goal difference per match", 2],
    xg: ["Chances created", "xG per match", 2],
    xga: ["Chances conceded", "xG against per match · lower is better", 2],
    shots: ["Shot volume", "shots per match", 1],
    quality: ["Chance quality", "xG per shot · all shots pooled", 3],
  };
  const fmt = (v, digits = 2) => App.fix(v, digits);
  const percentile = (sim) => Math.max(1, Math.ceil((1 - sim) * 100));
  const options = (id) => App.teams.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) =>
    `<option value="${t.id}" ${t.id === id ? "selected" : ""}>${App.esc(t.name)}</option>`).join("");

  App.views.twins = function (root, params, first, second) {
    const dials = A.readDials(params);
    const scope = scopes[params.scope] ? params.scope : "all";
    const metric = metrics[params.metric] ? params.metric : "xgd";
    const [metricName, unit, digits] = metrics[metric];
    const a = (first || "").toUpperCase(), b = (second || "").toUpperCase();
    const isPair = App.team[a] && App.team[b] && a !== b;
    const path = isPair ? `#/twins/${a}/${b}` : "#/twins";
    const query = (extra = {}, chosen = dials) => A.query(chosen, { scope, metric, return: params.return?.startsWith("#/") ? params.return : null, ...extra });
    const space = A.space(dials, scope), twins = A.twinTable(space);
    const summaries = Object.fromEntries(Object.keys(space.team).map((id) => [id, A.summary(A.rows(id, scope))]));
    const controls = `<div class="review-controls card">
      <label>Match scope<select data-scope>${Object.entries(scopes).map(([id, label]) => `<option value="${id}" ${id === scope ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label>Question to investigate<select data-metric>${Object.entries(metrics).map(([id, m]) => `<option value="${id}" ${id === metric ? "selected" : ""}>${m[0]}</option>`).join("")}</select></label>
      <details><summary>${dials.length} style indicators selected</summary><p class="note">Keep at least two. Similarity uses this scope and these indicators, standardized against all 208 records.</p>
      <div class="review-chips">${App.dials.map((d, i) => `<button type="button" class="chip ${dials.includes(d) ? "on" : ""}" data-dial="${i}" aria-pressed="${dials.includes(d)}" title="${App.esc(App.dialInfo[d].help)}">${d}</button>`).join("")}</div>
      <button class="btn small ghost" data-reset>Use all ten</button></details></div>`;
    if (isPair) renderPair();
    else renderLanding();
    root.querySelector("[data-scope]").onchange = (e) => App.go(path + query({ scope: e.target.value }));
    root.querySelector("[data-metric]").onchange = (e) => App.go(path + query({ metric: e.target.value }));
    root.querySelector("[data-reset]").onclick = () => App.go(path + query({}, App.dials));
    root.querySelectorAll("[data-dial]").forEach((button) => {
      button.onclick = () => {
        const dial = App.dials[Number(button.dataset.dial)], chosen = dials.includes(dial);
        if (chosen && dials.length <= 2) return;
        const next = App.dials.filter((d) => d === dial ? !chosen : dials.includes(d));
        App.go(path + query({}, next));
      };
    });

    function renderLanding() {
      const pairs = Object.keys(twins.near).flatMap((id) => twins.near[id]
        .filter((n) => id < n.id && n.sim >= 0.9).map((n) => ({ a: id, b: n.id, sim: n.sim, gap: summaries[id][metric] - summaries[n.id][metric] })))
        .filter((p) => Number.isFinite(summaries[p.a][metric]) && Number.isFinite(summaries[p.b][metric])).sort((p, q) => Math.abs(q.gap) - Math.abs(p.gap));
      root.innerHTML = `<section class="review-intro"><div class="kicker">02 / Compare performances</div><h1>Similar styles.<br><em>Look closer at the difference.</em></h1>
        <p>Find a pair, compare the chances they created and allowed, then inspect the matches behind the averages.</p></section>
        ${controls}<form class="review-picker card"><label>First team<select name="first">${options("NED")}</select></label><span>vs</span><label>Second team<select name="second">${options("CRO")}</select></label><button class="btn" type="submit">Investigate this pair →</button><p class="note" data-picker-note></p></form>
        <div class="review-section-title"><div><div class="kicker">Pairs worth investigating</div><h2>Close in style, apart in ${metricName.toLowerCase()}</h2></div><p class="note">${pairs.length} pairs in the closest 10%<br>Ordered by the absolute gap in ${unit}.</p></div>
        <div class="review-pair-grid">${pairs.map((p) => `<a class="card review-pair" href="#/twins/${p.a}/${p.b}${query()}">
          <span class="review-badge">Closest ${percentile(p.sim)}% of pairs</span>
          <div class="review-pair-names"><span>${App.flag(p.a, 32)}<b>${App.esc(App.team[p.a].name)}</b></span><span>${App.flag(p.b, 32)}<b>${App.esc(App.team[p.b].name)}</b></span></div>
          <div class="review-numbers"><b>${fmt(summaries[p.a][metric], digits)}</b><span>vs</span><b>${fmt(summaries[p.b][metric], digits)}</b></div>
          <p>${unit}</p><div class="review-pair-footer"><span>${summaries[p.a].n} and ${summaries[p.b].n} matches</span><span>Trace evidence ↗</span></div></a>`).join("") || '<p class="card">No pairs in this scope. Try another match scope or style definition.</p>'}</div>`;
      root.querySelector("form").onsubmit = (event) => {
        event.preventDefault();
        const x = event.target.elements.first.value, y = event.target.elements.second.value;
        if (x === y) { root.querySelector("[data-picker-note]").textContent = "Choose two different teams."; return; }
        App.go(`#/twins/${x}/${y}${query()}`);
      };
    }

    function renderPair() {
      const teams = [App.team[a], App.team[b]], rows = [A.rows(a, scope), A.rows(b, scope)], sums = rows.map(A.summary);
      const valid = sums.every((s) => s.n > 0), sim = twins.near[a]?.find((n) => n.id === b)?.sim;
      root.innerHTML = `<div class="review-breadcrumb"><a href="${App.esc(params.return?.startsWith("#/") ? params.return : "#/twins" + query())}">← ${params.return?.startsWith("#/") ? "Back to your exploration" : "Discover pairs"}</a><a href="#/styles${A.query(dials, { team: a })}">Check the full-tournament style map ↗</a></div>
        <section class="review-compare-head"><div><div class="kicker">A paired investigation</div><h1>${App.esc(teams[0].name)} <span>&</span><br>${App.esc(teams[1].name)}</h1></div>
          <div class="review-sim"><strong>${sim == null ? "—" : `Top ${percentile(sim)}%`}</strong><span>closest style pairs</span><small>${dials.length} indicators · ${twins.pairs} pair benchmark</small></div></section>
        ${controls}<div class="review-team-switch"><label>First team<select data-team-a>${options(a)}</select></label><label>Second team<select data-team-b>${options(b)}</select></label><a class="btn small ghost" href="#/twins/${b}/${a}${query()}">⇄ Swap</a></div>
        <div class="review-team-legend">${teams.map((t, i) => `<span><i style="background:${colors[i]}"></i>${App.flag(t.id, 22)}<b>${App.esc(t.name)}</b> · ${sums[i].n} matches · ${t.stage} overall</span>`).join("")}</div>
        ${valid ? `<section class="review-scorecards">${["xgd", "gd", "quality"].map((key) => `<div class="card"><span class="kicker">${metrics[key][0]}</span><div class="review-numbers"><b>${fmt(sums[0][key], metrics[key][2])}</b><span>vs</span><b>${fmt(sums[1][key], metrics[key][2])}</b></div><span class="note">${metrics[key][1]}</span></div>`).join("")}</section>
        <section class="card review-section"><div class="kicker">01 / Establish the comparison</div><h2>Where do their styles align?</h2><p class="sub">Selected indicators on a shared standardized scale. Larger separation means a larger difference. Original values are shown in team order.</p><div data-style-chart></div><a class="review-lab-link" href="#/robustness/${a}/${b}${A.query(dials, { scope, return: path + query() })}"><span><b>Does this similarity survive a closer look?</b><small>Automatically audit every one-indicator and one-match omission.</small></span><strong>Open robustness lens ↗</strong></a></section>
        <section class="card review-section"><div class="review-section-title"><div><div class="kicker">02 / Inspect the spread</div><h2>Does the average describe their matches?</h2></div><span class="review-badge">${metricName}</span></div>
          <p class="sub">Each dot is a match. Vertical marks show averages. Select a dot or match row to inspect its opponent and nearest comparable performances. Match totals include extra time when played.</p>
          <div data-spread></div><div class="review-sensitivity" data-sensitivity></div>
          <div class="review-match-buttons">${rows.map((list, i) => `<div><h3>${App.esc(teams[i].name)}</h3>${list.map((r) => `<button class="review-match-button" data-match-key="${r.key}"><span>M${r.number} · vs ${App.esc(App.team[r.opp_id].name)}<small>${App.stageShort(r.stage)}</small></span><b>${fmt(A.metric(r, metric), digits)}</b></button>`).join("")}</div>`).join("")}</div></section>
        <section class="card review-section review-evidence" data-evidence aria-live="polite"></section>
        <section class="card review-section"><div class="kicker">03 / Compare the schedule</div><h2>Who did each team face?</h2><p class="sub">Opponent context uses their other tournament games, excluding the selected encounter. Values use the full tournament, including games played later. This gives retrospective context for the comparison.</p>
          <div class="seg"><button type="button" class="on" data-context="attack">Creating chances</button><button type="button" data-context="defence">Limiting chances</button></div><div data-schedule-chart></div><p class="note" data-context-note></p>
          <details><summary>Inspect opponent reference values</summary><div data-opponents></div></details></section>
        <section class="card review-section"><div class="kicker">04 / Inspect the model</div><h2>How does the model allocate the scoreline gap?</h2><p class="sub">Positive favors ${App.esc(teams[0].name)}. Negative favors ${App.esc(teams[1].name)}. These stored estimates use the original ten-indicator model. Indicator selection changes similarity; scope changes which model estimates are averaged.</p><div data-model></div><p class="review-method-note">The six parts form an accounting decomposition. Their sum does not establish causal explanations or isolate player ability. <a href="#/method">Read the method →</a></p></section>
        <div class="card review-export"><div><h3>Keep the evidence</h3><p class="note">The address preserves your teams, indicators, scope and question. Download the observed match rows used in this comparison.</p></div><button class="btn small" data-export>Download comparison CSV</button></div>` : '<div class="card review-section"><h2>No matches in this scope</h2><p>One selected team has no records for this stage. Change the scope or select another team.</p></div>'}`;
      root.querySelectorAll("[data-team-a], [data-team-b]").forEach((el) => { el.onchange = () => {
        const x = root.querySelector("[data-team-a]").value, y = root.querySelector("[data-team-b]").value;
        if (x === y) { el.value = el.hasAttribute("data-team-a") ? a : b; return; }
        App.go(`#/twins/${x}/${y}${query()}`);
      }; });
      if (!valid) return;
      const omissionGaps = rows.flatMap((list, side) => list.length > 1 ? list.map((r) => {
        const value = A.summary(list.filter((other) => other.key !== r.key))[metric];
        return side === 0 ? value - sums[1][metric] : sums[0][metric] - value;
      }) : []).filter(Number.isFinite);
      const [lo, hi] = d3.extent(omissionGaps);
      root.querySelector("[data-sensitivity]").innerHTML = `<b>Average gap ${App.signed(sums[0][metric] - sums[1][metric], digits)}</b><span>${teams[0].name} minus ${teams[1].name}</span>
        ${omissionGaps.length ? `<p>Omitting any one match from either team moves the gap between <b>${App.signed(lo, digits)}</b> and <b>${App.signed(hi, digits)}</b>. ${lo < -1e-9 && hi > 1e-9 ? "The direction can reverse after a single omission." : "The gap does not reverse direction after a single omission."} This range shows sensitivity to individual matches.</p>` : ""}`;
      function selectMatch(key) {
        const row = A.records.find((r) => r.key === key);
        if (!row) return;
        const returnHash = path + query({ match: key });
        root.querySelectorAll("[data-match-key]").forEach((el) => el.classList.toggle("selected", el.dataset.matchKey === key));
        const opp = A.opponent(row), candidates = A.nearest(key, dials, scope, 3);
        root.querySelector("[data-evidence]").innerHTML = `<div class="review-section-title"><div><div class="kicker">Selected evidence · M${row.number}</div><h2>${App.esc(App.team[row.team_id].name)} ${row.goals}–${row.goals_opp} ${App.esc(App.team[row.opp_id].name)}</h2><p class="note">${row.stage} · ${App.match[row.match_id]?.date || ""}</p></div>
          <div class="row"><a class="btn small" href="#/lab/${row.match_id}${App.esc(query({ team: row.team_id, return: returnHash }))}">Open Match Lab ↗</a><a class="btn small ghost" href="#/match/${row.match_id}${App.esc(query({ return: returnHash }))}">Event replay ↗</a></div></div>
          <div class="review-evidence-values">${[[row.xg, "xG created"], [row.shots, "shots"], [A.metric(row, "quality"), "xG / shot"], [row.xga, "xG conceded"]].map(([v, label]) => `<div><b>${fmt(v, label === "shots" ? 0 : label === "xG / shot" ? 3 : 2)}</b><span>${label}</span></div>`).join("")}</div>
          <p class="note">${App.esc(App.team[row.opp_id].name)} allowed ${fmt(opp.xga)} xG and created ${fmt(opp.xg)} xG per match in its ${opp.n} other games.</p>
          <h3>Compare with a similar performance</h3><p class="sub">Closest performances by other teams in this scope. The same physical match is excluded. Distance uses your ${dials.length} selected indicators.</p>
          <div class="review-nearest">${candidates.map((n) => `<a href="#/duel/${encodeURIComponent(key)}/${encodeURIComponent(n.key)}${App.esc(query({ return: returnHash }))}"><b>${App.esc(App.team[n.row.team_id].name)} vs ${App.esc(App.team[n.row.opp_id].name)}</b><span>M${n.row.number} · ${n.row.stage}</span><span>${fmt(n.distance)} style distance · ${fmt(n.row.xg)} xG</span><strong>Compare side by side →</strong></a>`).join("") || "<p>No comparable performances in this scope.</p>"}</div>`;
      }
      root.querySelectorAll("[data-match-key]").forEach((el) => { el.onclick = () => {
        selectMatch(el.dataset.matchKey); root.querySelector("[data-evidence]").scrollIntoView({ behavior: "smooth", block: "start" });
      }; });
      selectMatch(rows.flat().some((r) => r.key === params.match) ? params.match : rows.flat().slice().sort((p, q) => Math.abs(A.metric(q, metric)) - Math.abs(A.metric(p, metric)))[0].key);
      let context = "attack";
      const drawContext = () => {
        drawSchedule(root.querySelector("[data-schedule-chart]"), rows, context, (key) => {
          selectMatch(key);
          root.querySelector("[data-evidence]").scrollIntoView({ behavior: "smooth", block: "start" });
        });
        root.querySelector("[data-context-note]").textContent = context === "attack"
          ? "Above the diagonal means more xG created than that opponent usually allowed in its other games. Each labeled point opens the corresponding match evidence."
          : "Below the diagonal means less xG allowed than that opponent usually created in its other games. Opponent averages describe context and are not adjusted predictions.";
      };
      root.querySelectorAll("[data-context]").forEach((button) => { button.onclick = () => {
        context = button.dataset.context;
        root.querySelectorAll("[data-context]").forEach((el) => el.classList.toggle("on", el === button));
        drawContext();
      }; });
      const draw = () => {
        drawStyles(root.querySelector("[data-style-chart]"), teams, rows, space, dials);
        drawSpread(root.querySelector("[data-spread]"), teams, rows, sums, metric, selectMatch);
        drawModel(root.querySelector("[data-model]"), sums);
        drawContext();
      };
      draw(); App.onResize(root.querySelector("[data-spread]"), draw);
      root.querySelector("[data-opponents]").innerHTML = `<div class="review-opponents">${rows.map((list, i) => `<div><h3 style="color:${colors[i]}">${App.esc(teams[i].name)} faced</h3><div class="review-table-wrap"><table class="review-table"><thead><tr><th>Opponent</th><th>Other games</th><th>xG created</th><th>xG allowed</th></tr></thead><tbody>${list.map((r) => {
        const o = A.opponent(r);
        return `<tr><td>${App.esc(App.team[r.opp_id].name)}<small>M${r.number} · ${App.stageShort(r.stage)}</small></td><td>${o.n}</td><td>${fmt(o.xg)}</td><td>${fmt(o.xga)}</td></tr>`;
      }).join("")}</tbody></table></div></div>`).join("")}</div>`;
      root.querySelector("[data-export]").onclick = () => {
        const records = [["team", "match", "opponent", "stage", "goals", "conceded", "xg", "xga", "shots", "scope", "style indicators"],
          ...rows.flat().map((r) => [App.team[r.team_id].name, r.match_id, App.team[r.opp_id].name, r.stage, r.goals, r.goals_opp, r.xg, r.xga, r.shots, scope, dials.join(" | ")])];
        const csv = records.map((record) => record.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a"); link.href = url; link.download = `style-twins-${a}-${b}-${scope}.csv`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
    }
  };

  function chart(el, height, label) {
    el.innerHTML = "";
    const width = Math.max(280, el.clientWidth);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", label);
    return { svg, width };
  }
  function drawStyles(el, teams, rows, space, dials) {
    const h = dials.length * 46 + 45, { svg, width } = chart(el, h, "Selected style indicators on a shared standardized scale");
    const left = width < 600 ? 115 : 180, right = width < 600 ? 65 : 130;
    const extent = Math.max(2, ...teams.flatMap((t) => space.team[t.id]).map(Math.abs));
    const x = d3.scaleLinear().domain([-extent, extent]).range([left, width - right]);
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h - 35).attr("stroke", "#d2dbd4");
    dials.forEach((dial, i) => {
      const y = i * 46 + 21, values = teams.map((t) => space.team[t.id][i]);
      svg.append("text").attr("x", 0).attr("y", y + 4).attr("class", "review-svg-label").text(dial);
      svg.append("line").attr("x1", x(values[0])).attr("x2", x(values[1])).attr("y1", y).attr("y2", y).attr("stroke", "#bbc8bf").attr("stroke-width", 3);
      values.forEach((v, side) => svg.append("circle").attr("cx", x(v)).attr("cy", y + (values[0] === values[1] ? side * 3 - 1.5 : 0)).attr("r", 5).attr("fill", colors[side]).append("title").text(`${teams[side].name} · ${dial} · ${App.signed(v)} sd`));
      const index = App.dials.indexOf(dial);
      svg.append("text").attr("x", width).attr("y", y + 4).attr("text-anchor", "end").attr("class", "review-svg-label").text(rows.map((list) => fmt(d3.mean(list, (r) => r.dials[index]), 1)).join(" / "));
    });
    svg.append("g").attr("transform", `translate(0,${h - 33})`).call(d3.axisBottom(x).ticks(5));
    svg.append("text").attr("x", left).attr("y", h - 3).attr("class", "review-svg-label").text(width < 600 ? "Standardized value (z)" : "Standard deviations from tournament average");
  }
  function drawSpread(el, teams, rows, sums, metric, onSelect) {
    const { svg, width } = chart(el, 210, "Individual match values and team averages");
    const values = rows.flat().map((r) => A.metric(r, metric)).filter(Number.isFinite);
    const [lo, hi] = d3.extent([0, ...values]), pad = (hi - lo || 1) * 0.12;
    const x = d3.scaleLinear().domain([lo - pad, hi + pad]).range([25, width - 25]).nice();
    svg.append("g").attr("transform", "translate(0,160)").call(d3.axisBottom(x).ticks(width < 500 ? 5 : 9));
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 20).attr("y2", 160).attr("stroke", "#c4cdc6").attr("stroke-dasharray", "4 4");
    rows.forEach((list, side) => {
      const y = 57 + side * 65;
      svg.append("line").attr("x1", x(sums[side][metric])).attr("x2", x(sums[side][metric])).attr("y1", y - 24).attr("y2", y + 22).attr("stroke", colors[side]).attr("stroke-width", 3);
      list.forEach((r, i) => {
        const value = A.metric(r, metric);
        if (!Number.isFinite(value)) return;
        svg.append("circle").attr("cx", x(value)).attr("cy", y + (i % 3 - 1) * 10).attr("r", 7).attr("fill", colors[side]).attr("stroke", "white").attr("stroke-width", 2).attr("tabindex", 0).attr("role", "button")
          .attr("aria-label", `${teams[side].name} match ${r.number} against ${App.team[r.opp_id].name}, ${fmt(value, metrics[metric][2])}`)
          .on("click", () => onSelect(r.key)).on("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.key); } })
          .append("title").text(`M${r.number} · ${App.team[r.opp_id].name} · ${fmt(value, metrics[metric][2])}`);
      });
      svg.append("text").attr("x", 25).attr("y", y - 27).attr("fill", colors[side]).attr("class", "review-svg-label").text(teams[side].name);
    });
    svg.append("text").attr("x", width / 2).attr("y", 205).attr("text-anchor", "middle").attr("class", "review-svg-label").text(metrics[metric][1]);
  }
  function drawModel(el, sums) {
    const diffs = App.components.map((c) => ({ ...c, value: sums[0].model[c.id] - sums[1].model[c.id] }));
    const { svg, width } = chart(el, 285, "Signed model contributions to the goal difference gap");
    const left = width < 500 ? 130 : 200, extent = Math.max(0.1, ...diffs.map((r) => Math.abs(r.value))) * 1.15;
    const x = d3.scaleLinear().domain([-extent, extent]).range([left, width - 45]);
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 5).attr("y2", 243).attr("stroke", "#b8c5bb");
    diffs.forEach((r, i) => {
      const y = i * 40 + 12;
      svg.append("text").attr("x", 0).attr("y", y + 16).attr("class", "review-svg-label").text(r.label);
      svg.append("rect").attr("x", Math.min(x(0), x(r.value))).attr("y", y).attr("width", Math.abs(x(r.value) - x(0))).attr("height", 23).attr("rx", 3).attr("fill", r.value >= 0 ? colors[0] : colors[1]);
      svg.append("text").attr("x", width).attr("y", y + 16).attr("text-anchor", "end").attr("class", "review-svg-label").text(App.signed(r.value));
    });
    svg.append("g").attr("transform", "translate(0,250)").call(d3.axisBottom(x).ticks(5));
    svg.append("text").attr("x", left).attr("y", 281).attr("class", "review-svg-label").text(width < 500 ? "Goals per match" : "Difference in goals per match");
  }

  function drawSchedule(el, rows, context, onSelect) {
    const attack = context === "attack", points = rows.flatMap((list, side) => list.map((row) => {
      const other = A.opponent(row);
      return { row, side, x: attack ? other.xga : other.xg, y: attack ? row.xg : row.xga, n: other.n };
    })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const { svg, width } = chart(el, 360, "Match performance against the opponent's other-match chance profile");
    const max = Math.max(1, ...points.flatMap((p) => [p.x, p.y])) * 1.15;
    const x = d3.scaleLinear().domain([0, max]).range([50, width - 30]);
    const y = d3.scaleLinear().domain([0, max]).range([300, 25]);
    svg.append("g").attr("transform", "translate(0,300)").call(d3.axisBottom(x).ticks(5));
    svg.append("g").attr("transform", "translate(50,0)").call(d3.axisLeft(y).ticks(5));
    svg.append("line").attr("x1", x(0)).attr("x2", x(max)).attr("y1", y(0)).attr("y2", y(max)).attr("stroke", "#adbdb0").attr("stroke-dasharray", "5 5");
    points.forEach((p) => {
      const group = svg.append("g").attr("transform", `translate(${x(p.x)},${y(p.y)})`).attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", `Match ${p.row.number}, ${App.team[p.row.team_id].name} against ${App.team[p.row.opp_id].name}`)
        .on("click", () => onSelect(p.row.key)).on("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(p.row.key); } });
      group.append("circle").attr("r", 7).attr("fill", colors[p.side]).attr("stroke", "white").attr("stroke-width", 2);
      group.append("text").attr("x", 10).attr("y", -8).attr("class", "review-svg-label").text(`M${p.row.number}`);
      group.append("title").text(`${App.team[p.row.team_id].name} vs ${App.team[p.row.opp_id].name} · actual ${fmt(p.y)} xG · opponent reference ${fmt(p.x)} across ${p.n} other matches`);
    });
    svg.append("text").attr("x", width / 2).attr("y", 344).attr("text-anchor", "middle").attr("class", "review-svg-label")
      .text(attack ? "Opponent's usual xG allowed / match" : "Opponent's usual xG created / match");
    svg.append("text").attr("x", 50).attr("y", 13).attr("class", "review-svg-label").text(attack ? "Actual xG created in this match ↑" : "Actual xG conceded in this match ↑");
  }
})();
