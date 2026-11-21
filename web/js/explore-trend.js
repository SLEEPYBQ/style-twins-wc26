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
    const plots = svg.append("g");
    const tabStops = new Map();
    let series = [], hovered = null;

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
      if (!svgNode.getClientRects().length) return;
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
      const group = event.currentTarget.parentNode;
      const siblings = Array.from(group.querySelectorAll(".xp-trend-mark"));
      const i = siblings.indexOf(event.currentTarget);
      const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: siblings.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      siblings[Math.max(0, Math.min(siblings.length - 1, next))].focus({ preventScroll: true });
    }

    function render({ state }) {
      const width = svgNode.clientWidth, height = svgNode.clientHeight;
      if (!width || !height) return;
      series = [state.team, state.compare].flatMap((id, i) => {
        if (!id) return [];
        const side = i ? "b" : "a";
        const points = A.rows(id).sort((a, b) => a.number - b.number)
          .map((row, j) => ({ row, side, game: j + 1, gd: A.metric(row, "gd") }))
          .filter(p => A.inScope(p.row, state.scope));
        return [{ id, side, points }];
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
      plots.selectAll(".xp-trend-series").classed("is-hover", s => s.id === team);
    }
    return { render, highlight };
  };
})();
