/* Each point is one team's mean goal difference in the active match scope.
 * Horizontal position is exact. Vertical stacking separates coincident teams. */
(function () {
  "use strict";
  const App = window.App;

  App.exploreOutcomes = function (host, { choose, highlight: linkTeam, openEvidence }) {
    host.innerHTML = `<header class="xp-head">
        <h2 id="ws-outcome-preview-title">Goal difference per match</h2>
        <button class="xp-open" type="button" hidden>Match evidence</button>
      </header>
      <svg class="xp-goals-plot" role="group" aria-labelledby="ws-outcome-preview-title"></svg>
      <div class="xp-goals-readout" aria-live="polite"></div>`;
    const open = host.querySelector(".xp-open");
    open.onclick = () => openEvidence();

    const svg = d3.select(host.querySelector("svg"));
    const zero = svg.append("line").attr("class", "xp-goals-zero").attr("aria-hidden", true);
    const axis = svg.append("g").attr("class", "xp-goals-axis").attr("aria-hidden", true);
    const annotations = svg.append("g").attr("aria-hidden", true).attr("pointer-events", "none");
    const marks = svg.append("g");
    const readout = host.querySelector(".xp-goals-readout");
    let model, rows = [], shown = [], active = null, keyboardTeam = null;

    function side(id) {
      return id === model.state.team ? "A" : id === model.state.compare ? "B" : "";
    }

    function describe(id) {
      const role = side(id);
      const country = App.esc(App.team[id].name);
      const score = model.summaries[id];
      const out = model.visible.has(id) ? "" : '<span class="xp-goals-out">(<span>Filtered out</span>)</span>';
      return `<span class="xp-goals-pin ${role ? "is-" + role.toLowerCase() : ""}">
        ${role ? `<b translate="no">${role}</b>` : ""} ${App.flag(id, 13)} <span>${country}</span>
        <strong dir="ltr">${App.signed(score.gd, 2)}</strong> ${out}</span>`;
    }

    function updateReadout() {
      if (active && shown.some(row => row.id === active)) {
        readout.innerHTML = describe(active) + `<span>${model.summaries[active].n} matches</span>`;
        return;
      }
      const pins = [model.state.team, model.state.compare].filter(id => Number.isFinite(model.summaries[id]?.gd));
      if (pins.length) readout.innerHTML = pins.map(describe).join("");
      else readout.textContent = shown.length ? "Each dot is a team." : "No team matches these filters.";
    }

    function highlight(id) {
      if (!model || active === id) return;
      active = id;
      marks.selectAll(".xp-goals-mark").classed("is-hover", row => row.id === id);
      updateReadout();
    }

    function keyDown(event, row) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose(row.id, event.shiftKey ? "A" : undefined);
        return;
      }
      const nodes = marks.selectAll(".xp-goals-mark").nodes();
      const i = nodes.indexOf(event.currentTarget);
      const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: nodes.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      nodes[Math.max(0, Math.min(nodes.length - 1, next))].focus({ preventScroll: true });
    }

    function labelPins(pins, x, y, radius, width) {
      const labels = pins.map(row => ({ row, labelX: Math.max(25, Math.min(width - 25, x(row.gd))) }));
      if (labels.length === 2 && labels[1].labelX - labels[0].labelX < 50) {
        const center = Math.max(50, Math.min(width - 50, (labels[0].labelX + labels[1].labelX) / 2));
        labels[0].labelX = center - 25;
        labels[1].labelX = center + 25;
      }
      const nodes = annotations.selectAll("g").data(labels, d => d.row.id).join(enter => {
        const label = enter.append("g");
        label.append("line");
        label.append("text").attr("text-anchor", "middle").attr("translate", "no");
        return label;
      }).attr("class", d => "xp-goals-annotation is-" + side(d.row.id).toLowerCase());
      nodes.select("line").attr("x1", d => d.labelX).attr("y1", 16)
        .attr("x2", d => x(d.row.gd)).attr("y2", d => y(d.row) - radius - 2);
      nodes.select("text").attr("x", d => d.labelX).attr("y", 12)
        .text(d => side(d.row.id) + " " + d.row.id);
    }

    function draw() {
      if (!model) return;
      const W = svg.node().clientWidth, H = svg.node().clientHeight;
      if (!W || !H) return;
      const min = Math.min(0, Math.floor(rows[0]?.gd ?? -1));
      const max = Math.max(0, Math.ceil(rows.at(-1)?.gd ?? 1));
      const x = d3.scaleLinear().domain(min === max ? [-1, 1] : [min, max]).range([17, W - 17]);
      const baseline = H - 18;
      svg.attr("viewBox", `0 0 ${W} ${H}`);
      axis.attr("transform", `translate(0,${baseline})`).call(d3.axisBottom(x)
        .ticks(W < 420 ? 5 : 7).tickFormat(value => value ? d3.format("+~g")(value) : "0").tickSize(3).tickSizeOuter(0));
      zero.attr("x1", x(0)).attr("x2", x(0)).attr("y1", 3).attr("y2", baseline);

      // Allocate lanes using every in-scope team so an ongoing brush never moves a team.
      const ends = [], lanes = new Map();
      for (const { id, gd } of rows) {
        const cx = x(gd);
        let lane = ends.findIndex(end => cx - end >= 11);
        if (lane < 0) lane = ends.length;
        ends[lane] = cx;
        lanes.set(id, lane);
      }
      const labelSpace = baseline - ends.length * 5.5 >= 18;
      const spacing = Math.min(11, (baseline - (labelSpace ? 18 : 4)) / Math.max(1, ends.length));
      const y = row => baseline - (lanes.get(row.id) + .65) * spacing;
      const r = Math.min(4.25, Math.max(1, spacing * .43));
      const points = marks.selectAll(".xp-goals-mark").data(shown, row => row.id).join(enter => {
        const point = enter.append("g").attr("class", "xp-goals-mark").attr("role", "button")
          .on("pointerenter", (event, row) => { if (event.pointerType !== "touch") linkTeam(row.id, { reveal: true }); })
          .on("pointerleave", () => linkTeam(marks.node().contains(document.activeElement) ? document.activeElement.dataset.team : null))
          .on("focus", (event, row) => {
            keyboardTeam = row.id;
            marks.selectAll(".xp-goals-mark").attr("tabindex", d => d.id === row.id ? 0 : -1);
            linkTeam(row.id, { reveal: true });
          })
          .on("blur", () => linkTeam(null))
          .on("click", (event, row) => choose(row.id, event.shiftKey ? "A" : undefined))
          .on("keydown", keyDown);
        point.append("circle").attr("class", "xp-goals-hit").attr("fill", "transparent");
        point.append("circle").attr("class", "xp-goals-dot");
        point.append("path").attr("class", "xp-goals-ring").attr("fill", "none");
        return point;
      });
      const first = shown.find(row => row.id === keyboardTeam || (!keyboardTeam && row.id === model.state.team)) || shown[0];
      points.attr("data-team", d => d.id).attr("data-gd", d => d.gd)
        .attr("aria-label", d => `${App.team[d.id].name} · ${App.signed(d.gd, 2)}`)
        .attr("aria-pressed", d => String(!!side(d.id)))
        .attr("tabindex", d => d === first ? 0 : -1)
        .classed("is-a", d => side(d.id) === "A").classed("is-b", d => side(d.id) === "B")
        .classed("is-out", d => !model.visible.has(d.id)).classed("is-hover", d => d.id === active)
        .attr("transform", d => `translate(${x(d.gd)},${y(d)})`);
      points.select(".xp-goals-dot").attr("r", r);
      const edge = r + 1.3;
      const ring = d3.path();
      ring.arc(0, 0, edge, 0, 2 * Math.PI);
      points.select(".xp-goals-ring").attr("d", d => {
        if (d.id === model.state.team) return ring.toString();
        if (d.id === model.state.compare) return `M0,${-edge}L${edge},0L0,${edge}L${-edge},0Z`;
        return null;
      });
      points.select(".xp-goals-hit").attr("r", Math.min(7, spacing * .75));
      labelPins(labelSpace ? shown.filter(d => side(d.id)) : [], x, y, r, W);
    }

    function render({ state, summaries, ids, hover = null }) {
      active = hover;
      if (model?.summaries !== summaries) {
        rows = Object.entries(summaries).filter(([, s]) => Number.isFinite(s.gd))
          .map(([id, s]) => ({ id, gd: s.gd })).sort((a, b) => a.gd - b.gd || d3.ascending(a.id, b.id));
      }
      model = { state, summaries, visible: new Set(ids) };
      shown = rows.filter(row => model.visible.has(row.id) || side(row.id));
      open.hidden = !state.team;
      draw();
      updateReadout();
    }

    const observer = new ResizeObserver(draw);
    observer.observe(svg.node());
    return { render, highlight, destroy() { observer.disconnect(); } };
  };
})();
