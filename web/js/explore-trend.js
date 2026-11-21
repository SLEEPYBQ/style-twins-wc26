/* One observation per team performance, ordered by that team's own tournament schedule. */
(function () {
  "use strict";
  const App = window.App, A = App.analysis;

  App.exploreTrend = function (svgNode, readout, { openMatch, linkTeam }) {
    const svg = d3.select(svgNode);
    const frame = svg.append("g").attr("aria-hidden", "true");
    const zero = frame.append("line").attr("class", "xp-goals-zero");
    const xAxis = frame.append("g").attr("class", "xp-goals-axis");
    const yAxis = frame.append("g").attr("class", "xp-goals-axis");
    const xTitle = frame.append("text").attr("class", "xp-trend-axis-title")
      .attr("text-anchor", "middle").text("Team match number");
    const yTitle = frame.append("text").attr("class", "xp-trend-axis-title").text("Goal difference");
    const cohortPlot = svg.append("g");
    const ranges = cohortPlot.append("g").attr("aria-hidden", "true");
    const band = cohortPlot.append("path").attr("class", "xp-cohort-band").attr("aria-hidden", "true");
    const median = cohortPlot.append("path").attr("class", "xp-cohort-median").attr("aria-hidden", "true");
    const preview = cohortPlot.append("g").attr("class", "xp-cohort-preview")
      .attr("pointer-events", "none").attr("aria-hidden", "true");
    const previewLine = preview.append("path");
    const plots = svg.append("g");
    const tabStops = new Map();
    // Assign each team's game numbers once, before the stage or team filters are applied.
    const schedules = d3.rollup(A.records, rows => rows.sort((a, b) => a.number - b.number)
      .map((row, j) => ({ row, game: j + 1, gd: A.metric(row, "gd") })), r => r.team_id);
    let series = [], hovered = null, cohort = null;

    function read(point) {
      if (point) {
        const { row, side } = point;
        readout.innerHTML = `<span class="xp-goals-pin is-${side}">
          <b>${App.esc(App.team[row.team_id].name)}</b>
          <bdi dir="ltr">${row.goals}–${row.goals_opp}</bdi>
          <span>${App.esc(App.team[row.opp_id].name)}</span></span>
          <span dir="ltr" translate="no">xG ${App.fix(row.xg, 2)}–${App.fix(row.xga, 2)}</span>`;
        return;
      }
      readout.innerHTML = series.map(({ id, side, points }) =>
        `<span class="xp-goals-pin is-${side}"><b dir="ltr" translate="no">${side === "a" ? "● A" : "◆ B"} ${id}</b>${
          points.some(p => Number.isFinite(p.gd)) ? "" : "<span>No matches in this scope.</span>"}</span>`
      ).join("");
      if (series.some(s => s.points.some(p => Number.isFinite(p.gd)))) {
        const hint = document.createElement("span");
        hint.textContent = "Select a point for match evidence.";
        readout.append(hint);
      }
    }

    function inspect() {
      // Leaving a hidden SVG must not replace the distribution's shared readout.
      if (cohort || !svgNode.getClientRects().length) return;
      const focus = svgNode.querySelector(".xp-trend-mark:focus-visible");
      const point = hovered || (focus && d3.select(focus).datum());
      read(point);
      linkTeam(point?.row.team_id || null);
    }

    function keyDown(event, p) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMatch(p.row.key);
        return;
      }
      moveFocus(event, ".xp-trend-mark");
    }

    function moveFocus(event, selector) {
      const siblings = Array.from(event.currentTarget.parentNode.querySelectorAll(selector));
      const i = siblings.indexOf(event.currentTarget);
      const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: siblings.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      siblings[Math.max(0, Math.min(siblings.length - 1, next))].focus({ preventScroll: true });
    }

    const signed = d3.format("+~f");
    const formatGD = value => value ? signed(value) : "0";
    const teamCount = n => n === 1 ? "1 team" : `${n} teams`;

    function readCohort(round) {
      if (!cohort || !svgNode.getClientRects().length) return;
      if (!cohort.rounds.size) {
        readout.textContent = "No team matches these filters.";
        return;
      }
      const key = (type, label, value) => `<span class="xp-cohort-key is-${type}"><span>${label}</span>${value ? ` <bdi dir="ltr">${value}</bdi>` : ""}</span>`;
      const match = round ? `<span><span>Team match number</span> ${round.game}</span>` : "";
      const team = !round && cohort.previewTeam ? `<strong class="xp-cohort-key is-team">${App.esc(App.team[cohort.previewTeam].name)}</strong>` : "";
      const count = round ? round.count : cohort.teams.size;
      readout.innerHTML = team + match + key("median", "Median", round && formatGD(round.median))
        + key("band", "Middle 50%", round && `${formatGD(round.q1)} … ${formatGD(round.q3)}`)
        + key("range", "Min–max", round && `${formatGD(round.min)} … ${formatGD(round.max)}`)
        + `<span>${teamCount(count)}</span>`;
    }

    function restingReadout() {
      const active = cohortPlot.node().querySelector(".xp-cohort-mark:hover, .xp-cohort-mark:focus");
      readCohort(active && d3.select(active).datum());
    }

    function previewTeam(id) {
      const points = cohort.teams.get(id);
      cohort.previewTeam = points ? id : null;
      preview.attr("data-team", cohort.previewTeam).attr("display", points ? null : "none");
      if (points) {
        const { x, y } = cohort;
        previewLine.attr("d", d3.line().defined(p => Number.isFinite(p.gd)).x(p => x(p.game)).y(p => y(p.gd))(points));
        preview.selectAll("circle").data(points.filter(p => Number.isFinite(p.gd)), p => p.game)
          .join("circle").attr("cx", p => x(p.game)).attr("cy", p => y(p.gd)).attr("r", 3);
      }
      if (points) readCohort(null);
      else restingReadout();
    }

    function drawCohort(valid, x, y) {
      const rounds = d3.rollup(valid, values => {
        const sorted = values.map(p => p.gd).sort(d3.ascending);
        return { game: values[0].game, count: values.length, min: sorted[0], max: sorted.at(-1), median: d3.quantileSorted(sorted, .5),
          q1: d3.quantileSorted(sorted, .25), q3: d3.quantileSorted(sorted, .75) };
      }, p => p.game);
      const data = Array.from(rounds.values()).sort((a, b) => a.game - b.game);
      const previous = cohort?.previewTeam;
      cohort = { rounds, teams: new Map(series.filter(s => s.points.some(p => Number.isFinite(p.gd)))
        .map(s => [s.id, s.points])), x, y };
      ranges.selectAll("path").data(data, r => r.game).join("path").attr("class", "xp-cohort-range")
        .attr("transform", r => `translate(${x(r.game)},0)`)
        .attr("d", r => `M-3,${y(r.min)}h6 M0,${y(r.min)}V${y(r.max)} M-3,${y(r.max)}h6`);
      band.attr("d", d3.area().x(r => x(r.game)).y0(r => y(r.q1)).y1(r => y(r.q3))(data));
      median.attr("d", d3.line().x(r => x(r.game)).y(r => y(r.median))(data));
      const marks = cohortPlot.selectAll(".xp-cohort-mark").data(data, d => d.game).join(enter => {
        const g = enter.append("g").attr("class", "xp-cohort-mark").attr("tabindex", 0).attr("role", "button")
          .on("pointerenter", (e, r) => { if (e.pointerType !== "touch") readCohort(r); })
          .on("pointerleave", () => {
            const focus = cohortPlot.node().querySelector(".xp-cohort-mark:focus");
            readCohort(focus && d3.select(focus).datum());
          })
          .on("focus click", (_, r) => readCohort(r)).on("blur", () => readCohort(null))
          .on("keydown", (e, r) => {
            if (e.key !== "Enter" && e.key !== " ") return moveFocus(e, ".xp-cohort-mark");
            e.preventDefault(); readCohort(r);
          });
        g.append("line").attr("class", "xp-cohort-whisker");
        g.append("circle").attr("class", "xp-cohort-dot").attr("r", 3.5);
        g.append("rect").attr("class", "xp-cohort-hit").attr("fill", "transparent");
        return g;
      }).attr("transform", r => `translate(${x(r.game)},${y(r.median)})`)
        .attr("data-game", r => r.game).attr("data-count", r => r.count).attr("data-median", r => r.median)
        .attr("data-q1", r => r.q1).attr("data-q3", r => r.q3).attr("data-min", r => r.min).attr("data-max", r => r.max)
        .attr("aria-label", r => `Team match number: ${r.game} · ${teamCount(r.count)} · Median: ${formatGD(r.median)} · Middle 50%: ${formatGD(r.q1)} … ${formatGD(r.q3)} · Min–max: ${formatGD(r.min)} … ${formatGD(r.max)}`);
      const hitWidth = Math.min(40, x.step() - 2);
      marks.select(".xp-cohort-hit").attr("x", -hitWidth / 2).attr("width", hitWidth)
        .attr("y", r => Math.min(-13, y(r.max) - y(r.median) - 3))
        .attr("height", r => Math.max(13, y(r.min) - y(r.median) + 3) - Math.min(-13, y(r.max) - y(r.median) - 3));
      marks.select(".xp-cohort-whisker").attr("display", data.length === 1 ? null : "none")
        .attr("y1", r => y(r.q1) - y(r.median)).attr("y2", r => y(r.q3) - y(r.median));
      preview.raise();
      previewTeam(previous);
    }

    function render({ state, visible }) {
      const width = svgNode.clientWidth, height = svgNode.clientHeight;
      if (!width || !height) return;
      const overview = !state.team;
      svg.attr("data-overview", String(overview));
      const ids = overview ? Array.from(visible) : [state.team, state.compare].filter(Boolean);
      series = ids.map((id, i) => {
        const side = i ? "b" : "a";
        const games = (schedules.get(id) || []).filter(p => A.inScope(p.row, state.scope));
        return { id, side, points: overview ? games : games.map(p => ({ ...p, side })) };
      });
      const all = series.flatMap(s => s.points);
      const valid = all.filter(p => Number.isFinite(p.gd));
      const games = [...new Set(all.map(p => p.game))].sort(d3.ascending);
      const x = d3.scalePoint().domain(games).range([35, width - 15]);
      const low = Math.min(0, d3.min(valid, p => p.gd) ?? 0);
      const high = Math.max(0, d3.max(valid, p => p.gd) ?? 0);
      const y = d3.scaleLinear().domain(low === high ? [-1, 1] : [low, high]).range([height - 33, 19]);
      svg.attr("viewBox", `0 0 ${width} ${height}`);
      frame.attr("display", valid.length ? null : "none");
      xAxis.attr("transform", `translate(0,${height - 27})`).call(d3.axisBottom(x).tickSize(3).tickSizeOuter(0));
      yAxis.attr("transform", "translate(23,0)").call(d3.axisLeft(y)
        .tickValues(y.ticks(Math.max(2, Math.floor((height - 52) / 24))).filter(Number.isInteger))
        .tickFormat(n => App.signed(n, 0)).tickSize(3).tickSizeOuter(0));
      xTitle.attr("x", (width + 20) / 2).attr("y", height - 2);
      yTitle.attr("x", 1).attr("y", 11);
      zero.attr("x1", 24).attr("x2", width - 5).attr("y1", y(0)).attr("y2", y(0));

      cohortPlot.attr("display", overview ? null : "none");
      if (overview) {
        plots.selectAll(".xp-trend-series").remove();
        hovered = null;
        drawCohort(valid, x, y);
        return;
      }
      cohort = null;

      // Games are discrete categories. Separate neighbouring marks inside their game slot
      // when two hit targets would obscure one another, keeping their GD values exact.
      const byGame = d3.group(valid, p => p.game);
      for (const points of byGame.values()) {
        const shift = points.length === 2 && Math.abs(y(points[0].gd) - y(points[1].gd)) < 10 ? 9 : 0;
        for (const p of points) p.x = x(p.game) + (p.side === "a" ? -shift : shift);
      }
      const groups = plots.selectAll(".xp-trend-series").data(series, s => s.id).join(enter => {
        const g = enter.append("g");
        g.append("path").attr("class", "xp-trend-line").attr("pointer-events", "none").attr("aria-hidden", "true");
        return g;
      }).attr("class", s => "xp-trend-series is-" + s.side).attr("data-team", s => s.id);
      const line = d3.line().defined(p => Number.isFinite(p.gd)).x(p => p.x).y(p => y(p.gd));
      groups.select(".xp-trend-line").attr("d", s => line(s.points));
      groups.each(function ({ id, points }) {
        const played = points.filter(p => Number.isFinite(p.gd));
        if (!played.some(p => p.row.key === tabStops.get(id))) tabStops.set(id, played[0]?.row.key);
        const marks = d3.select(this).selectAll(".xp-trend-mark").data(played, p => p.row.key).join(enter => {
          const mark = enter.append("g").attr("class", "xp-trend-point xp-trend-mark").attr("role", "button")
            .on("pointerenter", (e, p) => { if (e.pointerType !== "touch") { hovered = p; inspect(); } })
            .on("pointerleave", () => { hovered = null; inspect(); })
            .on("focus", (e, p) => {
              tabStops.set(p.row.team_id, p.row.key);
              d3.select(e.currentTarget.parentNode).selectAll(".xp-trend-mark")
                .attr("tabindex", d => d.row.key === p.row.key ? 0 : -1);
              hovered = null;
              read(p);
              linkTeam(p.row.team_id);
            }).on("blur", event => {
              if (!svgNode.getClientRects().length || svgNode.contains(event.relatedTarget)) return;
              read(hovered);
              linkTeam(hovered?.row.team_id || null);
            })
            .on("keydown", keyDown).on("click", (_, p) => openMatch(p.row.key));
          mark.append("circle").attr("r", 9).attr("fill", "transparent");
          mark.append("path").attr("class", "xp-trend-glyph");
          return mark;
        });
        marks.attr("data-team", id).attr("data-record", p => p.row.key).attr("data-match", p => p.row.key)
          .attr("data-game", p => p.game).attr("data-gd", p => p.gd)
          .attr("tabindex", p => p.row.key === tabStops.get(id) ? 0 : -1)
          .attr("transform", p => `translate(${p.x},${y(p.gd)})`)
          .attr("aria-label", ({ game, row }) => `Team match number: ${game} · ${App.team[id].name} ${row.goals}–${row.goals_opp} ${App.team[row.opp_id].name} · xG: ${App.fix(row.xg, 2)}–${App.fix(row.xga, 2)}`);
        marks.select(".xp-trend-glyph").attr("d", p => p.side === "a"
          ? "M-4,0a4,4 0 1,0 8,0a4,4 0 1,0 -8,0" : "M0,-5L5,0L0,5L-5,0Z");
      });
      // A toggle or mode change can hide the plot without firing pointerleave.
      const underPointer = svgNode.querySelector(".xp-trend-mark:hover");
      hovered = hovered && underPointer && d3.select(underPointer).datum().row.key === hovered.row.key
        ? d3.select(underPointer).datum() : null;
      const focus = svgNode.querySelector(".xp-trend-mark:focus-visible");
      read(hovered || (focus && d3.select(focus).datum()));
    }

    function highlight(team) {
      if (cohort) previewTeam(team);
      else plots.selectAll(".xp-trend-series").classed("is-hover", s => s.id === team);
    }
    return { render, highlight };
  };
})();
