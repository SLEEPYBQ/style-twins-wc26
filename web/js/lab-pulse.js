/* Linked event-count timeline. Full-match xG is never distributed across attempts. */
(function () {
  const App = window.App, P = App.matchPulseData;
  const P_THEMES = {
    phone: { teams: ["#54e0c5", "#ffb782"], bg: "#102531", shade: "#73d8cb", grid: "#29424f", tick: "#9db8c7", axis: "#547181", label: "#90acbc", period: "#789bad", divider: "#476270", strip: "#1a3441", mark: "#102531", selected: "#fff", ink: ["#edf7f9", "#b2cfdb", "#8caebf"] },
    desktop: { teams: ["#0a9396", "#e8743b"], bg: "#ffffff", shade: "#0a9396", grid: "#efe9dc", tick: "#858a96", axis: "#cfc7b5", label: "#858a96", period: "#4a5263", divider: "#cfc7b5", strip: "#f6f1e6", mark: "#ffffff", selected: "#1d2433", ink: ["#1d2433", "#4a5263", "#858a96"] },
  };
  const outcome = (event) => event.type === "goal" ? "Goal" : ({ saved: "Saved", blocked: "Blocked", off: "Off target", other: "Other recorded outcome" })[event.outcome] || "Not recorded";
  const player = (match, event) => match.teams[event.team]?.players[event.p];
  const download = (name, value, type) => {
    const url = URL.createObjectURL(new Blob([value], { type })), a = document.createElement("a");
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  App.matchPulse = {
    render(host, match, { teamId, params = {}, onParams } = {}) {
      const T = App.isDesktop() ? P_THEMES.desktop : P_THEMES.phone, COLORS = T.teams;
      const data = P.prepare(match), side = Math.max(0, match.teams.findIndex((team) => team.team_id === teamId));
      const team = match.teams[side];
      const extent = P.positions(data);
      const nearest = (value) => extent.reduce((best, x) => Math.abs(x - value) < Math.abs(best - value) ? x : best, extent[0]);
      let range = [0, data.end], selected = null, field = "delivery", alive = true, silentBrush = false, chart, chartX, brushSvg, brush, brushX;
      if (params.from != null && params.to != null && Number.isFinite(+params.from) && Number.isFinite(+params.to)) {
        const lo = nearest(Math.max(0, +params.from)), hi = nearest(Math.min(data.end, +params.to));
        if (lo <= hi) range = [lo, hi];
      }
      const initial = data.attempts.filter((event) => event.team === side && event.x >= range[0] && event.x <= range[1]);
      selected = initial.find((event) => event.type === "goal") || initial[0] || null;
      const optionText = (x) => `${P.clock(data, x)}${data.periods.some((period) => period.start === x && period.id > 0) ? " · restart" : ""}`;
      host.innerHTML = `<div class="pulse-workspace">
        <div class="pulse-lead"><div><div class="pulse-eyebrow">Match pulse</div><h2>When did the chances arrive?</h2><p>Brush a passage of play. Follow the accumulation of recorded attempts, then inspect the players, deliveries and outcomes behind that interval.</p></div><div class="pulse-export"><button data-export-events>Export events CSV ↓</button><button data-export-graphic>Save chart SVG ↓</button></div></div>
        <div class="pulse-controls" aria-label="Time window presets"><button data-period="all">Whole match</button>${data.periods.map((period) => `<button data-period="${period.id}">${period.name}</button>`).join("")}</div>
        <div class="pulse-board"><div class="pulse-chart-header"><div><b>Cumulative recorded attempts</b><small>Each step is one attempt · diamonds mark goals on recorded attempts</small></div><div class="pulse-legend">${match.teams.map((t, i) => `<span><i style="background:${COLORS[i]}"></i>${App.esc(t.name)}</span>`).join("")}</div></div><div data-cumulative></div><div class="pulse-note">Drag across the event strip to select a window. The two cumulative lines retain full-match context.</div><div data-brush></div><div class="pulse-range-controls"><label>Window starts<select data-range-start>${extent.map((x) => `<option value="${x}">${optionText(x)}</option>`).join("")}</select></label><label>Window ends<select data-range-end>${extent.map((x) => `<option value="${x}">${optionText(x)}</option>`).join("")}</select></label><span class="pulse-window-caption" data-window-caption></span></div></div>
        <div class="pulse-summary" data-summary aria-live="polite"></div>
        <div class="pulse-grid"><div class="pulse-panel"><div class="pulse-eyebrow">${App.esc(team.name)} · Selected interval</div><h3 style="margin-top:8px">The anatomy of the attempts</h3><p>Counts use the selected team and time window. Choose a breakdown to inspect how attempts were recorded.</p><div class="pulse-composition"><button data-field="delivery" class="on">Delivery</button><button data-field="outcome">Outcome</button><button data-field="body">Body part</button></div><div class="pulse-bars" data-breakdown></div></div><div class="pulse-panel" data-event-focus aria-live="polite"></div></div>
        <div class="pulse-panel pulse-register"><div class="pulse-chart-header"><div><h3>Event register</h3><p>Choose an attempt to see its recorded details. Player photographs are illustrated avatars.</p></div><span class="pulse-chip" data-register-count></span></div><div class="pulse-event-list" data-event-list></div></div>
        <details class="pulse-footnote"><summary>Evidence, timing and coverage</summary><ul><li>Recorded attempt counts reconcile to the source team totals: ${data.coverage.map((c, i) => `${App.esc(match.teams[i].name)} ${c.recorded}/${c.reported}`).join("; ")}. ${data.supplementals.length ? `${data.supplementals.length} separate score event(s) without attempt attributes are excluded from the attempt count.` : ""}</li><li>Events are recorded to whole minutes. Explicit 45+, 90+ and 105+ labels are placed at the end of their corresponding period; period breaks are schematic gaps. Bare minutes are assigned to the usual period, with extra time used only for matches marked as such. Order within a minute is not precise. No time-normalized rates are inferred.</li><li>The window filters attempts and score events only. Passing networks and line-break counts elsewhere remain full-match aggregates. Own goals are credited to the opposing team in the score-event count.</li><li>The dataset contains full-match xG, but no per-attempt xG or shot coordinates. This chart represents attempt counts; it does not measure expected goals or pressure.</li></ul><a href="${App.esc(match.source)}" target="_blank" rel="noopener">Inspect the original match report ↗</a></details>
      </div>`;
      const root = host.querySelector(".pulse-workspace");
      const getWindow = () => P.select(data, ...range);
      function setRange(values, persist = true) {
        range = [nearest(values[0]), nearest(values[1])].sort((a, b) => a - b);
        const valid = getWindow().attempts.filter((event) => event.team === side);
        if (!valid.some((event) => event.key === selected?.key)) selected = valid.find((event) => event.type === "goal") || valid[0] || null;
        update();
        if (brush && brushSvg) { silentBrush = true; brushSvg.call(brush.move, range.map(brushX)); silentBrush = false; }
        if (persist && onParams) onParams({ from: range[0], to: range[1] });
      }
      function focus(event) { if (event.x < range[0] || event.x > range[1]) return; selected = event; update(); }
      function draw() {
        if (!alive) return;
        const width = Math.max(300, host.querySelector("[data-cumulative]").clientWidth), small = width < 500;
        const height = small ? 285 : 345, margin = { left: 37, right: 20, top: 37, bottom: 37 };
        const x = d3.scaleLinear().domain([0, data.end]).range([margin.left, width - margin.right]);
        const y = d3.scaleLinear().domain([0, Math.max(3, ...data.coverage.map((c) => c.recorded))]).nice().range([height - margin.bottom, margin.top]);
        host.querySelector("[data-cumulative]").innerHTML = "";
        chart = d3.select(host.querySelector("[data-cumulative]")).append("svg").attr("class", "pulse-cumulative").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Cumulative recorded attempts for both teams, with selectable attempt points");
        chart.append("rect").attr("width", width).attr("height", height).attr("fill", T.bg);
        chart.append("rect").attr("data-window-shade", "").attr("y", margin.top).attr("height", height - margin.top - margin.bottom).attr("fill", T.shade).attr("opacity", App.isDesktop() ? .08 : .045);
        chart.append("g").selectAll("line").data(y.ticks(5)).join("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y).attr("y2", y).attr("stroke", T.grid).attr("stroke-dasharray", "2 5");
        const ticks = data.periods.flatMap((period) => [period.start, ...(period.end - period.start > 25 ? [period.start + (period.end - period.start) / 2] : []), period.end]);
        const displayedTicks = ticks.filter((v, i) => i === 0 || x(v) - x(ticks[i - 1]) > (small ? 42 : 31));
        const ax = chart.append("g").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).tickValues(displayedTicks).tickFormat((v) => P.clock(data, v)).tickSize(4));
        const ay = chart.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")).tickSize(0));
        for (const axis of [ax, ay]) { axis.selectAll("text").attr("fill", T.tick).style("font", "10px system-ui"); axis.selectAll("path,line").attr("stroke", T.axis); }
        chart.append("text").attr("x", margin.left).attr("y", 13).attr("fill", T.label).style("font", "10px system-ui").text("Attempts");
        for (const period of data.periods) {
          if (period.id) chart.append("line").attr("x1", x(period.start)).attr("x2", x(period.start)).attr("y1", margin.top).attr("y2", height - margin.bottom).attr("stroke", T.divider).attr("stroke-dasharray", "4 5");
          chart.append("text").attr("x", (x(period.start) + x(period.end)) / 2).attr("y", 25).attr("text-anchor", "middle").attr("fill", T.period).style("font", "10px system-ui").text(small ? ["1H", "2H", "ET1", "ET2"][period.id] : period.name);
        }
        const line = d3.line().x((d) => x(d.x)).y((d) => y(d.count)).curve(d3.curveStepAfter);
        data.cumulative.forEach((points, teamIndex) => {
          chart.append("path").datum(points).attr("d", line).attr("stroke", COLORS[teamIndex]).attr("stroke-width", 2.3).attr("fill", "none");
          const marks = chart.append("g").selectAll("path").data(points.filter((point) => point.event)).join("path")
            .attr("d", (point) => d3.symbol().type(point.event.type === "goal" ? d3.symbolDiamond : d3.symbolCircle).size(point.event.type === "goal" ? 68 : 25)())
            .attr("transform", (point) => `translate(${x(point.x)},${y(point.count)})`).attr("fill", COLORS[teamIndex]).attr("stroke", T.mark).attr("stroke-width", 1.2)
            .attr("data-pulse-point", "").attr("tabindex", 0).attr("role", "button").attr("aria-label", (point) => `${point.event.label} ${match.teams[teamIndex].name}, ${player(match, point.event)?.short || "player"}, ${outcome(point.event)}`)
            .style("cursor", "pointer").on("click", (_, point) => focus(point.event)).on("keydown", (event, point) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); focus(point.event); } });
          marks.append("title").text((point) => `${point.event.label} · ${player(match, point.event)?.name || "Player"}\n${outcome(point.event)} · ${point.event.delivery || "Delivery not recorded"}`);
        });
        chartX = x;
        host.querySelector("[data-brush]").innerHTML = "";
        const mini = d3.select(host.querySelector("[data-brush]")).append("svg").attr("viewBox", `0 0 ${width} 63`).attr("class", "pulse-brush").attr("aria-label", "Drag to select an event-time window; equivalent start and end controls are below");
        mini.append("rect").attr("x", margin.left).attr("y", 6).attr("width", width - margin.left - margin.right).attr("height", 48).attr("rx", 5).attr("fill", T.strip);
        mini.selectAll("line.event-mark").data(data.attempts).join("line").attr("class", "event-mark").attr("x1", (e) => x(e.x)).attr("x2", (e) => x(e.x)).attr("y1", (e) => e.team === 0 ? 11 : 33).attr("y2", (e) => e.team === 0 ? 28 : 50).attr("stroke", (e) => COLORS[e.team]).attr("opacity", .6).attr("stroke-width", 1.5);
        brushX = x;
        brush = d3.brushX().extent([[margin.left, 6], [width - margin.right, 54]]).on("end", (event) => {
          if (silentBrush || !event.sourceEvent || !alive) return;
          setRange(event.selection ? event.selection.map(x.invert) : [0, data.end]);
        });
        brushSvg = mini.append("g").call(brush);
        silentBrush = true; brushSvg.call(brush.move, range.map(x)); silentBrush = false;
        update();
      }
      function update() {
        if (!alive) return;
        const windowData = getWindow(), rows = windowData.attempts.filter((event) => event.team === side);
        root.querySelector("[data-range-start]").value = String(range[0]); root.querySelector("[data-range-end]").value = String(range[1]);
        root.querySelector("[data-window-caption]").textContent = `${P.clock(data, range[0])} — ${P.clock(data, range[1])} · ${rows.length} ${team.team_id} attempts`;
        root.querySelectorAll("[data-period]").forEach((button) => {
          const p = data.periods[Number(button.dataset.period)], bounds = button.dataset.period === "all" ? [0, data.end] : p ? [p.start, p.end] : [];
          button.classList.toggle("on", range[0] === bounds[0] && range[1] === bounds[1]);
        });
        const otherCount = windowData.attempts.filter((event) => event.team !== side).length;
        const goals = windowData.goals.filter((event) => event.scoringSide === side).length;
        const share = rows.length + otherCount ? Math.round(rows.length / (rows.length + otherCount) * 100) : null;
        root.querySelector("[data-summary]").innerHTML = `<div class="pulse-stat"><span>${App.esc(team.name)} attempts</span><strong>${rows.length} <small style="display:inline;font-size:15px">/ ${data.coverage[side].recorded} full match</small></strong><small>${otherCount} by ${App.esc(match.teams[1 - side].name)} in this window</small></div><div class="pulse-stat"><span>Share of attempts in window</span><strong>${share === null ? "—" : share + "%"}</strong><small>Attempt volume · no adjustment for shot quality</small></div><div class="pulse-stat"><span>Goals credited in window</span><strong>${goals}</strong><small>Score events include own goals; excludes shoot-outs</small></div>`;
        const groups = P.group(rows, field), max = Math.max(1, ...groups.map((group) => group.count));
        root.querySelector("[data-breakdown]").innerHTML = groups.length ? groups.map((group) => `<div><div class="pulse-bar-label"><span>${App.esc(group.label)}</span><b>${group.count} · ${Math.round(group.count / rows.length * 100)}%</b></div><div class="pulse-bar-track"><i style="width:${group.count / max * 100}%;background:${COLORS[side]}"></i></div></div>`).join("") : '<p class="pulse-empty">No attempts by this team in the selected interval.</p>';
        const event = selected;
        if (event) {
          const p = player(match, event), avatar = p ? App.avatarUrl(p.pid) : null;
          root.querySelector("[data-event-focus]").innerHTML = `<div class="pulse-eyebrow">Selected attempt · ${App.esc(event.label)}</div><div class="pulse-focus">${avatar ? `<img class="pulse-player-photo" src="${App.esc(avatar)}" alt="Illustrated avatar of ${App.esc(p.short)}">` : ""}<div><strong>${App.esc(p?.short || "Player")}</strong><span>${App.esc(match.teams[event.team].name)} · ${p?.num != null ? "#" + p.num : ""}</span></div></div><div class="pulse-event-detail"><div><small>Outcome</small><b>${outcome(event)}</b></div><div><small>Delivery</small><b>${App.esc(event.delivery || "Not recorded")}</b></div><div><small>Body part</small><b>${App.esc(event.body || "Not recorded")}</b></div><div><small>Source clock</small><b>${App.esc(event.label)}</b></div></div><p>Exact recorded attributes. No shot position or individual xG is available for this event.</p>`;
        } else root.querySelector("[data-event-focus]").innerHTML = '<div class="pulse-eyebrow">Selected attempt</div><h3 style="margin-top:12px">A moment, in detail</h3><p>Select a point on the chart or an event below. Expand the window if no attempts are visible.</p>';
        root.querySelector("[data-register-count]").textContent = `${rows.length} attempts · ${team.team_id}`;
        root.querySelector("[data-event-list]").innerHTML = rows.length ? rows.map((e) => `<button class="pulse-event-row ${e.key === selected?.key ? "on" : ""}" data-event="${e.index}"><b>${App.esc(e.label)}</b><span><strong>${App.esc(player(match, e)?.short || "Player")}</strong><small>${App.esc(e.delivery || "Not recorded")} · ${App.esc(e.body || "Not recorded")}</small></span><span class="pulse-chip">${outcome(e)}</span></button>`).join("") : '<p class="pulse-empty">Select a wider window to inspect attempts.</p>';
        root.querySelectorAll("[data-event]").forEach((button) => button.onclick = () => focus(data.events.find((event) => event.index === +button.dataset.event)));
        if (chart) {
          chart.select("[data-window-shade]").attr("x", chartX(range[0])).attr("width", Math.max(1, chartX(range[1]) - chartX(range[0])));
          chart.selectAll("[data-pulse-point]").attr("opacity", (point) => point.x >= range[0] && point.x <= range[1] ? 1 : .2).attr("tabindex", (point) => point.x >= range[0] && point.x <= range[1] ? 0 : -1).attr("stroke", (point) => point.event.key === selected?.key ? T.selected : T.mark).attr("stroke-width", (point) => point.event.key === selected?.key ? 2.5 : 1.2);
        }
      }
      root.querySelectorAll("[data-period]").forEach((button) => button.onclick = () => {
        const period = data.periods[Number(button.dataset.period)];
        setRange(button.dataset.period === "all" ? [0, data.end] : [period.start, period.end]);
      });
      root.querySelector("[data-range-start]").onchange = (event) => setRange([+event.target.value, Math.max(+event.target.value, range[1])]);
      root.querySelector("[data-range-end]").onchange = (event) => setRange([Math.min(range[0], +event.target.value), +event.target.value]);
      root.querySelectorAll("[data-field]").forEach((button) => button.onclick = () => { field = button.dataset.field; root.querySelectorAll("[data-field]").forEach((b) => b.classList.toggle("on", b === button)); update(); });
      root.querySelector("[data-export-events]").onclick = () => {
        const fields = ["match_id", "team", "source_time", "interpreted_period", "player", "type", "outcome", "body", "delivery", "source"];
        const rows = getWindow().attempts.filter((event) => event.team === side).map((event) => [match.id, team.team_id, event.label, data.periods[event.period].name, player(match, event)?.name || "", event.type, outcome(event), event.body || "", event.delivery || "", match.source]);
        const csv = [fields, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
        download(`style-twins-events-${match.number}-${team.team_id}.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8");
      };
      root.querySelector("[data-export-graphic]").onclick = () => {
        const copy = chart.node().cloneNode(true); copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title"); title.textContent = `${match.teams.map((t) => t.name).join(" vs ")} · cumulative recorded attempts`;
        const desc = document.createElementNS("http://www.w3.org/2000/svg", "desc"); desc.textContent = `Style Twins. Teams: ${match.teams.map((t, i) => `${t.name} (${COLORS[i]})`).join("; ")}. Selected source-clock window ${P.clock(data, range[0])}–${P.clock(data, range[1])}. Minute-based order, no per-shot xG. Source ${match.source}`;
        const box = copy.getAttribute("viewBox").split(" ").map(Number), width = box[2], height = box[3];
        const body = document.createElementNS("http://www.w3.org/2000/svg", "g");
        body.setAttribute("transform", "translate(0,78)");
        body.setAttribute("data-i18n-skip", ""); // The cloned chart already uses the selected language.
        while (copy.firstChild) body.appendChild(copy.firstChild);
        copy.appendChild(body); copy.setAttribute("viewBox", `0 0 ${width} ${height + 78}`); copy.setAttribute("width", width); copy.setAttribute("height", height + 78);
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect"); bg.setAttribute("width", width); bg.setAttribute("height", 78); bg.setAttribute("fill", T.bg); copy.prepend(bg);
        [[`Match ${match.number} · Cumulative recorded attempts`, 24, width < 500 ? 12 : 18, T.ink[0]], [`${match.teams[0].name} (teal) · ${match.teams[1].name} (orange)`, 45, width < 500 ? 9 : 12, T.ink[1]], [`Window ${P.clock(data, range[0])}–${P.clock(data, range[1])} · Minute-based records · Style Twins`, 64, width < 500 ? 8 : 11, T.ink[2]]].forEach(([text, y, size, fill]) => {
          const line = document.createElementNS("http://www.w3.org/2000/svg", "text"); line.setAttribute("x", 15); line.setAttribute("y", y); line.setAttribute("fill", fill); line.setAttribute("font-family", "system-ui, sans-serif"); line.setAttribute("font-size", size); line.textContent = text; copy.appendChild(line);
        });
        copy.prepend(desc); copy.prepend(title);
        // Translate newly added export captions as well as the visible chart labels.
        copy.setAttribute("lang", App.i18n?.locale || "en");
        App.i18n?.translate(copy);
        download(`style-twins-pulse-${match.number}.svg`, new XMLSerializer().serializeToString(copy), "image/svg+xml");
      };
      const observer = new ResizeObserver(draw); observer.observe(host); draw();
      return () => { alive = false; observer.disconnect(); brushSvg?.on(".brush", null); };
    },
  };
})();
