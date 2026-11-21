/* Panel 4: Fate Quadrant — Style similarity percentile vs Goal-difference gap.
 * Features open background circles, real Gold ★ star glyphs, A–B bullseye pop-out,
 * true axis zoom on pairRegion + "Zoom ★" button, nearest-point snapping, and object constancy. */
(function () {
  "use strict";
  const App = window.App;
  const esc = App.esc;
  const C = {
    a: "#24639a",
    b: "#b44e32",
    star: "#c98510",
    muted: "#7b8a91",
    ink: "#24333a",
    ink2: "#495961",
    line: "#dbe1dd",
    grid: "#eef1ee",
  };

  App.workspaceQuadrant = function (bodyHost, ctrlHost, { choosePair, highlight, setRegion }) {
    bodyHost.innerHTML = `
      <div class="fq-canvas" id="fq-canvas"></div>
      <div class="fq-readout" id="fq-readout" aria-live="polite"></div>`;
    const canvasEl = bodyHost.querySelector("#fq-canvas");
    const readoutEl = bodyHost.querySelector("#fq-readout");

    // Persistent SVG layers for object constancy
    const svg = d3.select(canvasEl).append("svg")
      .attr("class", "fq-svg")
      .attr("role", "img")
      .attr("aria-label", "Fate Quadrant: style similarity percentile versus goal difference gap");
    const defs = svg.append("defs");
    const clipRect = defs.append("clipPath").attr("id", "fq-plot-clip").append("rect");

    const gGrid = svg.append("g").attr("class", "fq-grid");
    const gZone = svg.append("g").attr("class", "fq-zone").attr("clip-path", "url(#fq-plot-clip)");
    const gQ = svg.append("g").attr("class", "fq-qlabels").attr("pointer-events", "none");
    const gAxis = svg.append("g").attr("class", "fq-axis").attr("pointer-events", "none");
    const gBrush = svg.append("g").attr("class", "fq-brush");
    const gMarks = svg.append("g").attr("class", "fq-marks").attr("clip-path", "url(#fq-plot-clip)");
    const gAnno = svg.append("g").attr("class", "fq-anno").attr("pointer-events", "none");

    let currentModel = null;
    let hoveredPairKey = null;
    let hasDrawnOnce = false;
    let prevSig = "";
    let hitPoints = [];

    function buildPairs(model) {
      const { visible, nearByTeam, summaries, state } = model;
      const visSet = new Set(visible);
      const region = state.pairRegion;
      const allGoals = Object.keys(nearByTeam).map((id) => summaries[id]?.gd).filter(Number.isFinite);
      const [lo, hi] = d3.extent(allGoals);
      const maxGap = hi > lo ? Math.max(1.5, hi - lo) : 2;
      const pairs = [];

      for (const a of visSet) {
        for (const n of nearByTeam[a] || []) {
          const b = n.id;
          if (a >= b || !visSet.has(b)) continue;
          const gdA = summaries[a]?.gd, gdB = summaries[b]?.gd;
          if (!Number.isFinite(n.sim) || !Number.isFinite(gdA) || !Number.isFinite(gdB)) continue;
          const sim = n.sim * 100;
          const gap = Math.abs(gdA - gdB);
          const [hiTeam, loTeam] = gdA >= gdB ? [a, b] : [b, a];
          const inRegion = !region || (sim >= region[0] && sim <= region[1] && gap >= region[2] && gap <= region[3]);
          pairs.push({
            key: `${a}-${b}`,
            a: hiTeam,
            b: loTeam,
            sim,
            gap,
            star: sim >= 90 && gap >= 1.0,
            inRegion,
          });
        }
      }
      return { pairs, maxGap };
    }

    function updateReadout(pair, model) {
      if (pair) {
        readoutEl.innerHTML = `${App.flag(pair.a, 13)}<b>${esc(App.team[pair.a].name)}</b><span class="sm-sep">vs</span>${App.flag(pair.b, 13)}<b>${esc(App.team[pair.b].name)}</b><span class="sm-sep">·</span><span>Similarity <b>${App.fix(pair.sim, 1)}%</b></span><span class="sm-sep">·</span><span>GD gap <b>${App.fix(pair.gap, 2)}</b>/m</span>`;
        return;
      }
      const { state } = model;
      if (state.pairRegion) {
        readoutEl.textContent = "Zoomed to quadrant selection — drag again or Reset zoom × to show all pairs.";
      } else if (state.team) {
        readoutEl.textContent = `Highlighting ${App.team[state.team].name}'s pairs. Click any dot/star or drag to zoom.`;
      } else {
        readoutEl.textContent = "Open circles = pairs · ★ Gold = same style, diff. fate. Click or drag to zoom.";
      }
    }

    function symPath(p, hasA, isAB, isA) {
      if (isAB) return d3.symbol(p.star ? d3.symbolStar : d3.symbolCircle, p.star ? 140 : 120)();
      if (p.star) return d3.symbol(d3.symbolStar, isA ? 82 : 66)();
      return d3.symbol(d3.symbolCircle, isA ? 50 : 20)();
    }

    function draw(model, { animate = false } = {}) {
      currentModel = model;
      const { state } = model;
      const { pairs, maxGap } = buildPairs(model);
      const starPairs = pairs.filter((p) => p.star && p.inRegion);
      const visiblePairs = pairs.filter((p) => p.inRegion);

      if (ctrlHost) {
        ctrlHost.innerHTML = `
          ${state.pairRegion
            ? `<button type="button" class="ws2-mini-btn" data-act="clear-quad">Reset zoom ×</button>`
            : `<button type="button" class="ws2-mini-btn" data-act="zoom-star" title="Zoom into the 85–100% similarity style-twin corridor">Zoom ★</button>`}
          <span class="ws2-badge-pill">${starPairs.length} ★ / ${visiblePairs.length} pairs</span>`;
        const clr = ctrlHost.querySelector('[data-act="clear-quad"]');
        if (clr) clr.onclick = () => setRegion(null);
        const zm = ctrlHost.querySelector('[data-act="zoom-star"]');
        if (zm) zm.onclick = () => setRegion([85, 100, 0.8, Number(Math.max(2.2, Math.ceil(maxGap * 4) / 4).toFixed(2))]);
      }

      updateReadout(null, model);

      const W = Math.max(240, canvasEl.clientWidth || 520);
      const H = Math.max(180, canvasEl.clientHeight || 280);
      const m = { t: 24, r: 16, b: 32, l: 38 };
      svg.attr("viewBox", `0 0 ${W} ${H}`);
      clipRect.attr("x", m.l).attr("y", m.t).attr("width", Math.max(10, W - m.l - m.r)).attr("height", Math.max(10, H - m.t - m.b));

      const xDom = state.pairRegion ? [Math.max(0, state.pairRegion[0]), Math.min(100, state.pairRegion[1])] : [0, 100];
      const yDom = state.pairRegion
        ? [Math.max(0, state.pairRegion[2]), Math.max(state.pairRegion[2] + 0.3, state.pairRegion[3])]
        : [0, maxGap];

      const x = d3.scaleLinear().domain(xDom).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain(yDom);
      if (!state.pairRegion) y.nice(4);
      y.range([H - m.b, m.t]);

      const sig = `${xDom.join(",")}|${y.domain().join(",")}|${state.dials.join(",")}|${state.scope}`;
      const doAnimate = animate && hasDrawnOnce && !App.reducedMotion() && sig !== prevSig;
      prevSig = sig;
      const dur = doAnimate ? 380 : 0;

      // Grid
      gGrid.selectAll("*").remove();
      const yTicks = y.ticks(4);
      yTicks.forEach((t) => {
        gGrid.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", C.grid);
      });
      const xTicks = state.pairRegion
        ? x.ticks(4).filter((t) => Math.abs(t - 90) > 1.2 && t > xDom[0] + 0.5 && t < xDom[1] - 0.5)
        : [25, 50, 75];
      xTicks.forEach((t) => {
        gGrid.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.grid);
      });

      // Highlight top-right ★ zone (sim >= 90%, gap >= 1.0) in Warm Gold
      gZone.selectAll("*").remove();
      const x90 = x(90), y10 = y(1.0);
      const zx = Math.max(m.l, x90);
      const zw = Math.max(0, W - m.r - zx);
      const zyEnd = Math.min(H - m.b, y10);
      const zh = Math.max(0, zyEnd - m.t);
      if (zw > 0 && zh > 0 && xDom[1] >= 90 && y.domain()[1] >= 1.0) {
        gZone.append("rect").attr("x", zx).attr("y", m.t).attr("width", zw).attr("height", zh)
          .attr("fill", "rgba(226, 169, 48, 0.11)");
      }
      if (90 >= xDom[0] && 90 <= xDom[1]) {
        gZone.append("line").attr("x1", x90).attr("x2", x90).attr("y1", m.t).attr("y2", H - m.b)
          .attr("stroke", C.star).attr("stroke-opacity", 0.58).attr("stroke-dasharray", "4 3");
      }
      if (1.0 >= y.domain()[0] && 1.0 <= y.domain()[1]) {
        gZone.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y10).attr("y2", y10)
          .attr("stroke", C.star).attr("stroke-opacity", 0.58).attr("stroke-dasharray", "4 3");
      }

      // Quadrant labels cleanly placed near edges without occluding dense dot zone
      gQ.selectAll("*").remove();
      if (!state.pairRegion) {
        gQ.append("text").attr("class", "fq-qlbl is-star").attr("x", W - m.r - 4).attr("y", m.t + 12).attr("text-anchor", "end")
          .text(`★ Twins · Diff. fate (${starPairs.length})`);
        gQ.append("text").attr("class", "fq-qlbl").attr("x", m.l + 4).attr("y", m.t + 12).attr("text-anchor", "start")
          .text("Diff. style · Diff. fate");
        gQ.append("text").attr("class", "fq-qlbl").attr("x", m.l + 4).attr("y", H - m.b - 6).attr("text-anchor", "start")
          .text("Diff. style · Sim. fate");
        gQ.append("text").attr("class", "fq-qlbl").attr("x", W - m.r - 4).attr("y", H - m.b - 6).attr("text-anchor", "end")
          .text("Twins · Sim. fate");
      } else {
        gQ.append("text").attr("class", "fq-qlbl is-star").attr("x", W - m.r - 4).attr("y", m.t + 12).attr("text-anchor", "end")
          .text(`Zoomed (${App.fix(xDom[0], 0)}–${App.fix(xDom[1], 0)}% · ${App.fix(y.domain()[0], 1)}–${App.fix(y.domain()[1], 1)} GD/m)`);
      }

      // Axes
      gAxis.selectAll("*").remove();
      const axisXTicks = state.pairRegion
        ? [...new Set([Math.round(xDom[0]), ...x.ticks(4), ...(90 >= xDom[0] && 90 <= xDom[1] ? [90] : []), Math.round(xDom[1])])]
            .filter((t, i, arr) => t >= xDom[0] && t <= xDom[1] && arr.findIndex((u) => Math.abs(x(u) - x(t)) < 24) === i)
        : [0, 25, 50, 75, 90, 100];
      axisXTicks.forEach((t) => {
        const isLast = Math.abs(t - xDom[1]) < 1.5;
        const isFirst = Math.abs(t - xDom[0]) < 1.5;
        gAxis.append("text").attr("class", Math.abs(t - 90) < 0.2 ? "fq-tick is-thresh" : "fq-tick")
          .attr("x", x(t))
          .attr("y", H - m.b + 13)
          .attr("text-anchor", isLast ? "end" : isFirst ? "start" : "middle")
          .text(`${App.fix(t, t % 1 ? 0 : 0)}%`);
      });
      yTicks.forEach((t) => {
        gAxis.append("text").attr("class", Math.abs(t - 1.0) < 0.02 ? "fq-tick is-thresh" : "fq-tick")
          .attr("x", m.l - 6).attr("y", y(t) + 3).attr("text-anchor", "end").text(App.fix(t, t % 1 ? 1 : 0));
      });
      gAxis.append("text").attr("class", "fq-axis-title").attr("x", W - m.r).attr("y", H - 4).attr("text-anchor", "end")
        .text("Style similarity percentile →");
      gAxis.append("text").attr("class", "fq-axis-title").attr("x", m.l).attr("y", 14).attr("text-anchor", "start")
        .text("↑ Goal diff. gap / match");

      // Brush layer UNDER marks -> sets true zoom domain
      const brush = d3.brush()
        .extent([[m.l, m.t], [W - m.r, H - m.b]])
        .keyModifiers(false)
        .handleSize(0)
        .on("end", ({ selection, sourceEvent }) => {
          if (!sourceEvent || !svg.node().isConnected) return;
          if (!selection || Math.hypot(selection[1][0] - selection[0][0], selection[1][1] - selection[0][1]) < 8) {
            if (selection) gBrush.call(brush.move, null);
            return;
          }
          const [[px0, py0], [px1, py1]] = selection;
          gBrush.call(brush.move, null);
          setRegion([
            +Math.max(0, x.invert(px0)).toFixed(1),
            +Math.min(100, x.invert(px1)).toFixed(1),
            +Math.max(0, y.invert(py1)).toFixed(2),
            +Math.max(0.2, y.invert(py0)).toFixed(2),
          ]);
        });
      gBrush.call(brush);

      // Pair state helpers
      const hasA = Boolean(state.team);
      const isPairAB = (p) => hasA && state.compare && ((p.a === state.team && p.b === state.compare) || (p.a === state.compare && p.b === state.team));
      const hasTeamA = (p) => hasA && (p.a === state.team || p.b === state.team);

      const orderedPairs = [...visiblePairs].sort((u, v) => {
        const score = (p) => (isPairAB(p) ? 4 : hasTeamA(p) ? 3 : p.star ? 2 : 1);
        return score(u) - score(v);
      });

      hitPoints = orderedPairs.map((p) => ({ p, px: x(p.sim), py: y(p.gap), prio: isPairAB(p) ? 4 : hasTeamA(p) ? 3 : p.star ? 2 : 1 }));

      const marks = gMarks.selectAll("path.fq-mark")
        .data(orderedPairs, (p) => p.key)
        .join(
          (enter) => enter.append("path")
            .attr("class", "fq-mark")
            .attr("data-pair", (p) => p.key)
            .attr("transform", (p) => `translate(${x(p.sim)},${y(p.gap)})`),
          (update) => update,
          (exit) => exit.remove()
        );

      marks.order()
        .attr("class", (p) => [
          "fq-mark",
          p.star ? "is-star" : "is-bg",
          hasTeamA(p) ? "is-a" : "",
          isPairAB(p) ? "is-ab" : "",
          hoveredPairKey === p.key ? "is-hover" : "",
        ].filter(Boolean).join(" "))
        .attr("d", (p) => symPath(p, hasA, isPairAB(p), hasTeamA(p)))
        .attr("fill", (p) => {
          if (isPairAB(p)) return p.star ? C.star : C.a;
          if (hasTeamA(p)) return C.a;
          return p.star ? C.star : "none";
        })
        .attr("fill-opacity", (p) => {
          if (isPairAB(p)) return 1;
          if (hasA) return hasTeamA(p) ? (state.compare ? 0.58 : 0.92) : 0;
          return p.star ? 0.92 : 0;
        })
        .attr("stroke", (p) => {
          if (isPairAB(p)) return "#ffffff";
          if (hasTeamA(p)) return p.star ? C.star : "#ffffff";
          if (p.star) return "#ffffff";
          return C.muted;
        })
        .attr("stroke-opacity", (p) => {
          if (isPairAB(p) || hasTeamA(p) || p.star) return 1;
          return hasA ? 0.14 : 0.36;
        })
        .attr("stroke-width", (p) => (isPairAB(p) ? 1.4 : hasTeamA(p) && p.star ? 1.2 : p.star ? 0.7 : 0.95));

      if (doAnimate) {
        marks.interrupt().transition().duration(dur).ease(d3.easeCubicInOut)
          .attr("transform", (p) => `translate(${x(p.sim)},${y(p.gap)})`);
      } else {
        marks.interrupt().attr("transform", (p) => `translate(${x(p.sim)},${y(p.gap)})`);
      }

      const showPairTip = (p, e) => {
        const sa = model.summaries[p.a], sb = model.summaries[p.b];
        App.tip.show(
          `<div class="tt-title">${App.flag(p.a, 14)} ${esc(App.team[p.a].name)} vs ${App.flag(p.b, 14)} ${esc(App.team[p.b].name)}</div>` +
          App.ttRows([
            ["Style similarity", `${App.fix(p.sim, 1)}%`],
            ["Goal diff. gap", `${App.fix(p.gap, 2)} / match`],
            [App.team[p.a].id + " GD/m", App.signed(sa?.gd, 2)],
            [App.team[p.b].id + " GD/m", App.signed(sb?.gd, 2)],
          ]) + `<div class="tt-dim" style="margin-top:4px">Click to compare these two teams</div>`,
          e
        );
      };

      const findNearest = (mx, my) => {
        if (mx < m.l || mx > W - m.r || my < m.t || my > H - m.b) return null;
        let best = null, bestScore = Infinity;
        for (const pt of hitPoints) {
          const d = Math.hypot(pt.px - mx, pt.py - my);
          if (d > 16) continue;
          const sc = d - pt.prio * 1.4;
          if (sc < bestScore) { bestScore = sc; best = pt; }
        }
        return best ? best.p : null;
      };

      svg.on("pointermove", (e) => {
        if (e.buttons) return;
        const [mx, my] = d3.pointer(e, svg.node());
        const nearest = findNearest(mx, my);
        if (!nearest) {
          if (hoveredPairKey) {
            hoveredPairKey = null;
            gMarks.selectAll("path.fq-mark").classed("is-hover", false);
            updateReadout(null, currentModel);
            highlight(null);
            App.tip.hide();
          }
          return;
        }
        if (hoveredPairKey !== nearest.key) {
          hoveredPairKey = nearest.key;
          gMarks.selectAll("path.fq-mark")
            .classed("is-hover", (d) => d.key === nearest.key)
            .filter((d) => d.key === nearest.key).raise();
          updateReadout(nearest, currentModel);
          highlight([nearest.a, nearest.b]);
        }
        showPairTip(nearest, e);
      }).on("pointerleave", () => {
        hoveredPairKey = null;
        gMarks.selectAll("path.fq-mark").classed("is-hover", false);
        updateReadout(null, currentModel);
        highlight(null);
        App.tip.hide();
      });

      marks.on("click", (e, p) => {
        e.stopPropagation();
        App.tip.hide();
        choosePair(p.a, p.b);
      });

      // Labels, Crosshairs & A–B high-contrast bullseye target ring
      gAnno.selectAll("*").remove();
      const activePair = orderedPairs.find(isPairAB);
      if (activePair) {
        const px = x(activePair.sim), py = y(activePair.gap);
        gAnno.append("line").attr("x1", px).attr("x2", px).attr("y1", py).attr("y2", H - m.b)
          .attr("stroke", C.ink).attr("stroke-dasharray", "3 3").attr("stroke-opacity", 0.52);
        gAnno.append("line").attr("x1", m.l).attr("x2", px).attr("y1", py).attr("y2", py)
          .attr("stroke", C.ink).attr("stroke-dasharray", "3 3").attr("stroke-opacity", 0.52);
        // Preattentive outer bullseye halo around A-B
        gAnno.append("circle").attr("cx", px).attr("cy", py).attr("r", 10.5)
          .attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 2.2);
        const anchorEnd = px > W - m.r - 110;
        const tagY = Math.max(m.t + 26, Math.min(H - m.b - 22, py - 12));
        gAnno.append("text").attr("class", "fq-pair-tag is-ab").attr("translate", "no")
          .attr("x", anchorEnd ? px - 13 : px + 13)
          .attr("y", tagY)
          .attr("text-anchor", anchorEnd ? "end" : "start")
          .text(`${activePair.a}–${activePair.b} (${App.fix(activePair.sim, 1)}% · Δ${App.fix(activePair.gap, 2)})`);
      } else if (hasA) {
        const aStar = orderedPairs.filter((p) => hasTeamA(p)).sort((u, v) => v.sim - u.sim);
        const picks = [];
        if (aStar[0]) picks.push(aStar[0]);
        const bigGap = [...aStar].sort((u, v) => v.gap - u.gap)[0];
        if (bigGap && !picks.includes(bigGap)) picks.push(bigGap);
        const placed = [];
        for (const p of picks) {
          const px = x(p.sim), py = y(p.gap);
          if (placed.some(([ox, oy]) => Math.abs(px - ox) < 62 && Math.abs(py - oy) < 16)) continue;
          placed.push([px, py]);
          const anchorEnd = px > W - m.r - 80;
          gAnno.append("text").attr("class", "fq-pair-tag").attr("translate", "no")
            .attr("x", anchorEnd ? px - 8 : px + 8).attr("y", Math.max(m.t + 24, py - 6))
            .attr("text-anchor", anchorEnd ? "end" : "start")
            .text(`${p.a}–${p.b}`);
        }
      } else if (starPairs.length) {
        const byGap = [...starPairs].sort((u, v) => v.gap - u.gap);
        const bySim = [...starPairs].sort((u, v) => v.sim - u.sim);
        const candidates = [];
        const usedTeams = new Set();
        for (const list of [byGap, bySim]) {
          let added = 0;
          for (const p of list) {
            if (candidates.includes(p)) continue;
            if (usedTeams.has(p.a) && usedTeams.has(p.b)) continue;
            candidates.push(p);
            usedTeams.add(p.a);
            usedTeams.add(p.b);
            if (++added >= 2) break;
          }
        }
        const placed = [];
        for (const p of candidates) {
          const px = x(p.sim), py = y(p.gap);
          const lx = px > W - m.r - 78 ? px - 8 : px + 8;
          const ly = Math.max(m.t + 24, py - 6);
          if (placed.some(([ox, oy]) => Math.abs(lx - ox) < 58 && Math.abs(ly - oy) < 14)) continue;
          placed.push([lx, ly]);
          gAnno.append("text").attr("class", "fq-pair-tag").attr("translate", "no")
            .attr("x", lx).attr("y", ly)
            .attr("text-anchor", px > W - m.r - 78 ? "end" : "start")
            .text(`${p.a}–${p.b}`);
        }
      }

      hasDrawnOnce = true;
    }

    function render(model) {
      draw(model, { animate: true });
    }

    function redraw() {
      if (currentModel && bodyHost.isConnected) draw(currentModel, { animate: false });
    }

    function setHovered(ids) {
      if (!currentModel) return;
      const set = new Set(Array.isArray(ids) ? ids : []);
      gMarks.selectAll("path.fq-mark")
        .classed("is-team-hover", (p) => set.size > 0 && (set.has(p.a) || set.has(p.b)));
    }

    return { render, redraw, setHovered };
  };
})();
