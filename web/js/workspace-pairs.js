/* Each eligible pair appears once. Its percentile retains the full match-scope
 * reference while the team filters and the rectangle narrow the list. */
(function () {
  "use strict";
  const App = window.App;
  const pageSize = 8;
  const guidePercentile = 90, guideGap = 1;
  const names = (pair, withFlags = false) => [pair.a, pair.b].map((id) => {
    const flag = withFlags ? `<span class="wp-flag" aria-hidden="true">${App.flag(id, 13)}</span>` : "";
    return `${flag}<span>${App.esc(App.team[id].name)}</span>`;
  }).join(" · ");

  App.workspacePairs = function (host, { choosePair, setRegion, setupBrush, hasTouch }) {
    host.classList.add("ws-pairs");
    host.innerHTML = `<div class="wp-guide">
        <button type="button" class="ws-btn wp-guide-button" aria-pressed="false" aria-describedby="wp-thresholds">Example region</button>
        <span id="wp-thresholds">Similarity percentile ≥ ${guidePercentile} · GD gap ≥ ${guideGap} goal/match</span>
      </div>
      <div class="wp-axis-title">Absolute gap in goal difference per match</div>
      <div class="wp-chart"></div>
      <div class="wp-axis-title wp-x-title"><span>Style similarity percentile</span> · <span>All pairs in match scope</span></div>
      <div class="wp-readout" aria-live="polite"></div>
      <div class="wp-list-tools"><span>Pairs in view</span><b class="wp-count"></b>
        <div class="wp-pages"><button type="button" class="ws-btn wp-prev" aria-label="Previous pairs">‹</button>
          <span class="wp-range"></span><button type="button" class="ws-btn wp-next" aria-label="Next pairs">›</button></div>
      </div>
      <div class="wp-cols"><span>Team pairs</span><span>Percentile</span><span>GD gap</span></div>
      <div class="wp-list"></div>`;
    const get = (selector) => host.querySelector(selector);
    const chart = get(".wp-chart"), list = get(".wp-list"), readout = get(".wp-readout");
    let pairs = [], results = [], page = 0, dataKey, region, maxGap = 1, armed = false, active = null;

    const guide = get(".wp-guide-button");
    const guideBounds = () => [guidePercentile, 100, guideGap, Math.max(guideGap + 1, Math.ceil(maxGap))];
    guide.onclick = () => setRegion(guide.getAttribute("aria-pressed") === "true" ? null : guideBounds());

    function showPair(pair) {
      active = pair || null;
      host.querySelectorAll(".wp-active").forEach((node) => node.classList.remove("wp-active"));
      if (pair) {
        host.querySelectorAll(`[data-pair="${pair.key}"]`).forEach((node) => node.classList.add("wp-active"));
        d3.select(chart).select("circle.wp-active").raise();
        readout.innerHTML = `<b>${names(pair)}</b><span><span>Percentile</span> ${App.fix(pair.sim, 1)}%</span>
          <span><span>GD gap</span> ${App.fix(pair.gap, 2)}</span>`;
      } else {
        readout.textContent = armed ? "Drag to select pairs. Tap Brush again to cancel."
          : hasTouch() ? "Tap Brush to narrow the list. Select a pair to compare."
          : "Drag to narrow the list. Select a pair to compare.";
      }
    }

    function drawList() {
      const start = page * pageSize;
      const items = results.slice(start, start + pageSize);
      get(".wp-count").textContent = `${results.length} / ${pairs.length}`;
      get(".wp-pages").hidden = results.length <= pageSize;
      get(".wp-prev").disabled = !page;
      get(".wp-next").disabled = start + pageSize >= results.length;
      get(".wp-range").textContent = items.length ? `${start + 1}–${start + items.length}` : "";
      get(".wp-cols").hidden = !items.length;
      list.innerHTML = items.length ? items.map((pair, i) =>
        `<button type="button" class="wp-result" data-pair="${pair.key}" data-index="${start + i}">
          <span class="wp-names">${names(pair, true)}</span><span><span class="sr-only">Percentile</span> ${App.fix(pair.sim, 1)}%</span>
          <span><span class="sr-only">GD gap</span> ${App.fix(pair.gap, 2)}</span></button>`).join("")
        : `<p class="wp-empty">${pairs.length ? "No pairs in this region." : "At least two teams must match the filters."}</p>`;
      list.scrollTop = 0;
      showPair(null);
    }
    get(".wp-prev").onclick = () => { page--; drawList(); };
    get(".wp-next").onclick = () => { page++; drawList(); };
    function resultAt(target) {
      const button = target?.closest(".wp-result");
      return button && results[Number(button.dataset.index)];
    }
    list.addEventListener("pointerover", (e) => {
      const pair = resultAt(e.target);
      if (pair && pair !== active) showPair(pair);
    });
    list.addEventListener("pointerleave", () => showPair(resultAt(document.activeElement)));
    list.addEventListener("focusin", (e) => showPair(resultAt(e.target)));
    list.addEventListener("focusout", (e) => { if (!list.contains(e.relatedTarget)) showPair(null); });
    list.addEventListener("click", (e) => {
      const pair = resultAt(e.target);
      if (pair) choosePair(pair.a, pair.b);
    });

    function render(model) {
      const { visible, summaries, nearByTeam } = model;
      region = model.region;
      armed = model.touchArmed;
      const included = new Set(visible);
      const key = [model.scope, model.dials.join(","), [...included].sort().join(","), region?.join(",")].join("|");
      if (key !== dataKey) page = 0;
      dataKey = key;
      const goals = Object.keys(nearByTeam).map((id) => summaries[id]?.gd).filter(Number.isFinite);
      const [lo, hi] = d3.extent(goals);
      maxGap = hi > lo ? hi - lo : 1;
      pairs = [];
      for (const a of included) {
        for (const { id: b, sim } of nearByTeam[a] || []) {
          if (a >= b || !included.has(b) || !Number.isFinite(sim) ||
              !Number.isFinite(summaries[a]?.gd) || !Number.isFinite(summaries[b]?.gd)) continue;
          const gap = Math.abs(summaries[a].gd - summaries[b].gd), percentile = sim * 100;
          const inside = !region || (percentile >= region[0] && percentile <= region[1] && gap >= region[2] && gap <= region[3]);
          pairs.push({ key: `${a}-${b}`, a, b, sim: percentile, gap, inside });
        }
      }
      results = pairs.filter((pair) => pair.inside).sort((a, b) =>
        b.sim - a.sim || b.gap - a.gap || d3.ascending(a.key, b.key));
      const guideSelected = guideBounds().every((value, i) => value === region?.[i]);
      guide.setAttribute("aria-pressed", String(guideSelected));
      guide.disabled = !guideSelected && !pairs.some(pair => pair.sim >= guidePercentile && pair.gap >= guideGap);
      drawList();
      draw();
    }

    function draw(touchArmed = armed) {
      if (armed !== touchArmed) {
        armed = touchArmed;
        showPair(null);
      }
      const W = chart.clientWidth, H = chart.clientHeight;
      if (!W || !H) return;
      const left = 36, right = W - 20, top = 8, bottom = H - 25;
      const x = d3.scaleLinear().domain([0, 100]).range([left, right]);
      const y = d3.scaleLinear().domain([0, maxGap]).nice(4).range([bottom, top]);
      chart.replaceChildren();
      const svg = d3.select(chart).append("svg").attr("class", "ws-map wp-map")
        .attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Team pairs");
      svg.append("g").attr("class", "wp-axis").attr("transform", `translate(0,${bottom})`)
        .call(d3.axisBottom(x).ticks(W < 360 ? 4 : 5).tickFormat((v) => `${v}%`).tickSizeOuter(0));
      svg.append("g").attr("class", "wp-axis").attr("transform", `translate(${left},0)`)
        .call(d3.axisLeft(y).ticks(H < 160 ? 3 : 5).tickSizeOuter(0));
      const grid = svg.append("g").attr("class", "grid");
      grid.selectAll("line").data(y.ticks(H < 160 ? 3 : 5).filter((v) => v > 0)).join("line")
        .attr("x1", left).attr("x2", right).attr("y1", y).attr("y2", y);
      if (y.domain()[1] > guideGap) {
        svg.append("rect").attr("class", "wp-reference")
          .attr("x", x(guidePercentile)).attr("width", right - x(guidePercentile))
          .attr("y", top).attr("height", y(guideGap) - top);
      }
      if (region) {
        const x0 = x(Math.max(0, region[0])), x1 = x(Math.min(100, region[1]));
        const y0 = y(Math.min(y.domain()[1], region[3])), y1 = y(Math.max(0, region[2]));
        if (x1 > x0 && y1 > y0) svg.append("rect").attr("class", "wp-region")
          .attr("x", x0).attr("y", y0).attr("width", x1 - x0).attr("height", y1 - y0);
      }
      const layer = svg.append("g").attr("class", "brush");
      const marks = svg.append("g");
      marks.selectAll("circle").data(pairs).join("circle")
        .attr("class", (p) => p.inside ? "wp-dot" : "wp-dot is-out")
        .classed("wp-active", (p) => p === active)
        .attr("data-pair", (p) => p.key).attr("data-sim", (p) => p.sim).attr("data-gap", (p) => p.gap)
        .attr("cx", (p) => x(p.sim)).attr("cy", (p) => y(p.gap)).attr("r", 3.1);
      marks.on("pointerover", (e) => {
        const pair = d3.select(e.target).datum();
        if (pair?.inside && pair !== active) showPair(pair);
      }).on("pointerleave", () => showPair(resultAt(document.activeElement)))
        .on("click", (e) => {
          const pair = d3.select(e.target).datum();
          if (pair?.inside) choosePair(pair.a, pair.b);
        });
      setupBrush(layer, [[left, top], [right, bottom]], ([[x0, y0], [x1, y1]]) =>
        setRegion([x.invert(x0), x.invert(x1), y.invert(y1), y.invert(y0)]), armed);
    }
    return { render, draw };
  };
})();
