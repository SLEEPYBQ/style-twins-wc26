/* Panel 1: Exploratory Style Map with 1:1 Euclidean PCA scale, biplot spokes,
 * Dust & Magnet steering, Polar Loupe fan-out, centroid-bundled twin links,
 * match-by-match trajectories, and Heer & Robertson staged transitions. */
(function () {
  "use strict";
  const App = window.App;
  const A = App.analysis;
  const esc = App.esc;
  const C = {
    a: "#24639a",
    b: "#b44e32",
    twin: "#1c736f",
    gold: "#c98510",
    pos: "#1c736f",
    neg: "#9b5f1e",
    mid: "#f7f6f1",
    ink: "#24333a",
    ink2: "#495961",
    muted: "#5c6a70",
    line: "#dbe1dd",
    grid: "#e8ede9",
    neutral: "#859298",
  };
  const zColor = d3.scaleLinear().domain([-2, 0, 2]).range([C.neg, C.mid, C.pos]).clamp(true);

  function axisDirections(vec, dialIds, sign, maxTerms = 2) {
    const scored = dialIds
      .map((id, i) => ({ id, score: (vec[i] || 0) * sign }))
      .sort((a, b) => b.score - a.score);
    let picks = scored.filter((item) => item.score > 0.16).slice(0, maxTerms);
    if (!picks.length && scored.length) {
      if (scored[0].score > 0.01) picks = [scored[0]];
      else return [`Lower ${App.indicator(scored.at(-1).id).short}`];
    }
    return picks.map((item) => App.indicator(item.id).short);
  }

  App.workspaceMap = function (bodyHost, ctrlHost, callbacks) {
    const {
      choose,
      highlight,
      onBrush,
      onClearColor,
      onClearCohort,
      onMapMode,
      onWeight,
      onResetWeights,
      onSelectMatch,
    } = callbacks;

    bodyHost.innerHTML = `
      <div class="sm-legend" id="sm-legend"></div>
      <div class="sm-canvas" id="sm-canvas"></div>
      <div class="sm-readout" id="sm-readout" aria-live="polite"></div>`;
    const legendEl = bodyHost.querySelector("#sm-legend");
    const canvasEl = bodyHost.querySelector("#sm-canvas");
    const readoutEl = bodyHost.querySelector("#sm-readout");

    // Build persistent SVG layers once for object constancy
    const svg = d3.select(canvasEl).append("svg")
      .attr("class", "sm-svg")
      .attr("role", "img")
      .attr("aria-label", "Style Map of World Cup 2026 teams");
    const defs = svg.append("defs");
    defs.append("clipPath").attr("id", "sm-flag-clip").attr("clipPathUnits", "objectBoundingBox")
      .append("circle").attr("cx", 0.5).attr("cy", 0.5).attr("r", 0.5);
    defs.append("marker").attr("id", "sm-trail-arrow").attr("viewBox", "0 -3 7 6")
      .attr("refX", 6).attr("refY", 0).attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
      .append("path").attr("d", "M0,-3L7,0L0,3Z").attr("fill", C.ink2);

    const gGrid = svg.append("g").attr("class", "sm-grid");
    const gBiplot = svg.append("g").attr("class", "sm-biplot");
    const gLandmarks = svg.append("g").attr("class", "sm-landmarks").attr("pointer-events", "none");
    const gLinks = svg.append("g").attr("class", "sm-links");
    const gTrail = svg.append("g").attr("class", "sm-trail");
    const gLoupeTethers = svg.append("g").attr("class", "sm-loupe-tethers").attr("pointer-events", "none");
    const gMotionGhosts = svg.append("g").attr("class", "sm-motion-ghosts").attr("pointer-events", "none");
    const gMatch = svg.append("g").attr("class", "sm-match-overlay").attr("pointer-events", "none");
    const gBrush = svg.append("g").attr("class", "sm-brush");
    const gNodes = svg.append("g").attr("class", "sm-nodes");
    const gLabels = svg.append("g").attr("class", "sm-labels").attr("pointer-events", "none");
    const gAxes = svg.append("g").attr("class", "sm-axes").attr("pointer-events", "none");
    const gHoverLabels = svg.append("g").attr("class", "sm-hover-labels").attr("pointer-events", "none");
    const gSteer = svg.append("g").attr("class", "sm-steer-layer");

    let currentModel = null;
    let hoveredList = [];
    let liveBrushIds = null;
    let hasDrawnOnce = false;
    let prevAnchors = new Map();
    let prevDataSig = "";
    let currentScale = null;
    let loupeOffsets = new Map(); // id -> { dx, dy }
    let loupeAnchorSet = new Set();
    let draggingSteer = false;

    function linkModeOf(model) {
      return model?.state?.mapLinks || "off";
    }
    function trailOn(model) {
      return Boolean(model?.state?.mapTrail && model?.state?.team);
    }
    function steerOn(model) {
      return Boolean(model?.state?.mapSteer);
    }
    function hasWeights(model) {
      const w = model?.state?.weights;
      return Boolean(w && Object.keys(w).length > 0);
    }

    function residualStats(model, aId, bId) {
      const { pos, space, nearByTeam } = model;
      if (!aId || !bId || !pos[aId] || !pos[bId] || !space.team[aId] || !space.team[bId]) return null;
      const d2 = Math.hypot(pos[aId][0] - pos[bId][0], pos[aId][1] - pos[bId][1]);
      const dFull = App.dist(space.team[aId], space.team[bId]);
      const ortho = Math.sqrt(Math.max(0, dFull * dFull - d2 * d2));
      const nItem = (nearByTeam[aId] || []).find((n) => n.id === bId);
      const sim = nItem ? nItem.sim * 100 : 100;
      const warn = sim < 85 && dFull > 0.5 && ortho / dFull > 0.62;
      return { d2, dFull, ortho, sim, warn };
    }

    function computeScales(model, W, H, m) {
      const { space, pca, pos, matchRecord } = model;
      const fpos = matchRecord && space.match[matchRecord.key] ? pca.project(space.match[matchRecord.key]) : null;
      const allPts = Object.values(pos).concat(fpos ? [fpos] : []);
      const plotW = Math.max(80, W - m.l - m.r);
      const plotH = Math.max(80, H - m.t - m.b);
      let [xLo, xHi] = d3.extent(allPts, (pt) => pt[0]);
      let [yLo, yHi] = d3.extent(allPts, (pt) => pt[1]);
      if (xLo == null) { xLo = -2; xHi = 2; }
      if (yLo == null) { yLo = -2; yHi = 2; }
      const dx = Math.max(0.8, xHi - xLo);
      const dy = Math.max(0.8, yHi - yLo);
      const upp = Math.max(dx / plotW, dy / plotH) * 1.18;
      const xMid = (xLo + xHi) / 2;
      const yMid = (yLo + yHi) / 2;
      const x = d3.scaleLinear().domain([xMid - (plotW * upp) / 2, xMid + (plotW * upp) / 2]).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([yMid - (plotH * upp) / 2, yMid + (plotH * upp) / 2]).range([H - m.b, m.t]);
      return { x, y, fpos, upp };
    }

    function renderLegend(model) {
      const { state, pca, activeColorDial } = model;
      const parts = [];
      if (activeColorDial !== null) {
        const ind = App.indicator(App.dials[activeColorDial]);
        parts.push(
          `<span class="sm-tint-key"><b>${esc(ind.short)}</b><span>≤−2σ</span><i class="sm-scale-bar" aria-hidden="true"></i><span>+2σ</span></span>`
        );
        if (state.colorDial === activeColorDial) {
          parts.push(`<button type="button" class="ws2-mini-btn" data-act="clear-color">Clear tint</button>`);
        }
      } else if (state.team) {
        parts.push(`<span class="sm-role-key"><span><i style="background:${C.a}"></i>A</span><span><i style="background:${C.b}"></i>B</span><span><i style="border-color:${C.twin};background:#fff"></i>Twins</span></span>`);
        parts.push(`<span class="sm-fate-key"><span title="Solid teal link: twin has higher GD/m"><i class="is-solid"></i>Better GD</span><span title="Dashed slate link: twin has lower GD/m"><i class="is-dashed"></i>Worse GD</span></span>`);
      } else if (linkModeOf(model) === "stars") {
        parts.push(`<span class="sm-fate-key"><span><i class="is-gold-solid"></i>Within archetype ★</span><span><i class="is-gold-dashed"></i>Cross-archetype ★</span></span>`);
      } else if (steerOn(model)) {
        parts.push(`<span class="sm-hint-txt">Drag any tactic pill outward to boost its weight, inward to reduce it (or click to cycle).</span>`);
      } else {
        parts.push(`<span class="sm-hint-txt">1:1 PCA projection · click any flag to inspect or drag to brush a group.</span>`);
      }

      if (ctrlHost) {
        const vx = pca ? Math.round((pca.vars[0] || 0) * 100) : 0;
        const vy = pca ? Math.round((pca.vars[1] || 0) * 100) : 0;
        const lm = linkModeOf(model);
        const st = steerOn(model);
        const tr = trailOn(model);
        const weighted = hasWeights(model);
        ctrlHost.innerHTML = `
          ${state.cohort ? `<button type="button" class="ws2-mini-btn" data-act="clear-cohort">Brush (${state.cohort.length}) ×</button>` : ""}
          ${weighted ? `<button type="button" class="ws2-mini-btn" data-act="reset-weights" title="Reset custom dial weights">Reset w ×</button>` : ""}
          <div class="wf2-seg" role="group" aria-label="Twin links overlay">
            <button type="button" data-lmode="off" aria-pressed="${lm === "off"}">Off</button>
            <button type="button" data-lmode="stars" aria-pressed="${lm === "stars"}">53 ★</button>
            ${state.team ? `<button type="button" data-lmode="ego" aria-pressed="${lm === "ego"}">Ego</button>` : ""}
          </div>
          ${state.team ? `<button type="button" class="ws2-mini-btn sm-mode-btn" data-act="trail" aria-pressed="${tr}" title="Show chronological 1..N match trajectory">Trail</button>` : ""}
          <button type="button" class="ws2-mini-btn sm-mode-btn" data-act="steer" aria-pressed="${st}" title="Drag tactic pills on the map to re-weight style dimensions">Steer</button>
          <span class="ws2-badge-pill" title="1:1 variance explained: horizontal ${vx}%, vertical ${vy}% across ${state.dials.length} indicators">X ${vx}% · Y ${vy}% · ${state.dials.length} dims</span>`;

        const clr = ctrlHost.querySelector('[data-act="clear-cohort"]');
        if (clr) clr.onclick = () => onClearCohort();
        const rw = ctrlHost.querySelector('[data-act="reset-weights"]');
        if (rw) rw.onclick = () => onResetWeights?.();
        ctrlHost.querySelectorAll("[data-lmode]").forEach((btn) => {
          btn.onclick = () => onMapMode?.({ mapLinks: btn.dataset.lmode });
        });
        const trailBtn = ctrlHost.querySelector('[data-act="trail"]');
        if (trailBtn) trailBtn.onclick = () => onMapMode?.({ mapTrail: !tr });
        const steerBtn = ctrlHost.querySelector('[data-act="steer"]');
        if (steerBtn) steerBtn.onclick = () => onMapMode?.({ mapSteer: !st });
      }

      legendEl.innerHTML = parts.join("");
      const clearColorBtn = legendEl.querySelector('[data-act="clear-color"]');
      if (clearColorBtn) clearColorBtn.onclick = () => onClearColor();
    }

    function updateReadout(model) {
      const { state, summaries, near, activeColorDial, full } = model;
      const focusId = hoveredList.find((id) => App.team[id]);
      if (focusId && summaries[focusId]) {
        const t = App.team[focusId];
        const s = summaries[focusId];
        const rankIdx = state.team && focusId !== state.team ? near.findIndex((n) => n.id === focusId) : -1;
        const dialDetail = activeColorDial !== null
          ? `<span>${esc(App.indicator(App.dials[activeColorDial]).short)} <b>${App.signed(full.team[focusId][activeColorDial], 2)}σ</b></span>`
          : "";
        const rankText = rankIdx >= 0 ? `<span>Twin <b>#${rankIdx + 1}</b> (${App.fix(near[rankIdx].sim * 100, 1)}%)</span>` : "";
        const res = state.team && focusId !== state.team ? residualStats(model, state.team, focusId) : null;
        const warnTag = res?.warn ? `<span class="sm-warn-pill">2D trap: ${App.fix(res.sim, 0)}% true sim</span>` : "";
        readoutEl.innerHTML = `${App.flag(focusId, 14)}<b>${esc(t.name)}</b><span class="sm-sep">·</span><span>${esc(App.groupShort(t.archetype))}</span><span class="sm-sep">·</span><span>GD <b>${App.signed(s.gd, 2)}</b>/m (${s.n}m)</span>${rankText ? `<span class="sm-sep">·</span>${rankText}` : ""}${dialDetail ? `<span class="sm-sep">·</span>${dialDetail}` : ""}${warnTag}`;
        return;
      }
      if (liveBrushIds) {
        readoutEl.textContent = `Brushing ${liveBrushIds.size} teams — release to filter.`;
        return;
      }
      if (state.team && state.compare) {
        const res = residualStats(model, state.team, state.compare);
        if (res?.warn) {
          readoutEl.innerHTML = `<span class="sm-warn-pill">2D vs ${state.dials.length}-dial guard</span><span>${esc(state.team)}–${esc(state.compare)} appear close in 2D (ortho <b>${App.fix(res.ortho, 2)}</b>σ), yet share only <b>${App.fix(res.sim, 1)}%</b> style similarity.</span>`;
          return;
        }
      }
      readoutEl.textContent = state.team
        ? "Click another flag to set B (Shift-click sets A). Hover dense clusters to fan out."
        : "Click a flag to set Team A, or drag empty space to brush a group.";
    }

    function applyNodePositions(useTransition = false, dur = 420) {
      if (!currentModel || !currentScale) return;
      const { x, y } = currentScale;
      const targetPos = (id) => {
        const pt = currentModel.pos[id] || [0, 0];
        const base = [x(pt[0]), y(pt[1])];
        const off = loupeOffsets.get(id);
        return off ? [base[0] + off.dx, base[1] + off.dy] : base;
      };
      const nodes = gNodes.selectAll("g.sm-node");
      if (useTransition) {
        nodes.interrupt().transition().duration(dur).ease(d3.easeCubicInOut)
          .attr("transform", (id) => `translate(${targetPos(id)})`);
      } else {
        nodes.interrupt().attr("transform", (id) => `translate(${targetPos(id)})`);
      }

      // Draw dotted loupe tethers when fanned out
      gLoupeTethers.selectAll("*").remove();
      for (const [id, off] of loupeOffsets.entries()) {
        const pt = currentModel.pos[id];
        if (!pt) continue;
        const bx = x(pt[0]), by = y(pt[1]);
        gLoupeTethers.append("line")
          .attr("x1", bx).attr("y1", by)
          .attr("x2", bx + off.dx).attr("y2", by + off.dy)
          .attr("stroke", C.ink).attr("stroke-width", 1).attr("stroke-dasharray", "2 2").attr("stroke-opacity", 0.65);
        gLoupeTethers.append("circle")
          .attr("cx", bx).attr("cy", by).attr("r", 2)
          .attr("fill", C.ink).attr("fill-opacity", 0.55);
      }
    }

    function activateLoupe(anchorId) {
      if (!currentModel || !currentScale || draggingSteer) return;
      if (loupeAnchorSet.has(anchorId)) return; // already fanned as part of this cluster
      const { pos } = currentModel;
      const { x, y } = currentScale;
      if (!pos[anchorId]) return;
      const [ax, ay] = [x(pos[anchorId][0]), y(pos[anchorId][1])];
      const cluster = Object.keys(pos).filter((id) => {
        const px = x(pos[id][0]), py = y(pos[id][1]);
        return Math.hypot(px - ax, py - ay) <= 22;
      });
      if (cluster.length < 2) {
        clearLoupe();
        return;
      }
      const subset = cluster.slice(0, 9);
      const cx = d3.mean(subset, (id) => x(pos[id][0]));
      const cy = d3.mean(subset, (id) => y(pos[id][1]));
      const rad = Math.max(24, Math.min(38, subset.length * 4.8));
      const ordered = subset.sort((u, v) => {
        const au = Math.atan2(y(pos[u][1]) - cy, x(pos[u][0]) - cx);
        const av = Math.atan2(y(pos[v][1]) - cy, x(pos[v][0]) - cx);
        return au - av;
      });
      loupeOffsets = new Map();
      loupeAnchorSet = new Set(subset);
      ordered.forEach((id, k) => {
        const angle = -Math.PI / 2 + (k * Math.PI * 2) / ordered.length;
        const tx = cx + rad * Math.cos(angle);
        const ty = cy + rad * Math.sin(angle);
        loupeOffsets.set(id, { dx: tx - x(pos[id][0]), dy: ty - y(pos[id][1]) });
      });
      applyNodePositions(!App.reducedMotion(), 170);
    }

    function clearLoupe() {
      if (!loupeOffsets.size) return;
      loupeOffsets = new Map();
      loupeAnchorSet = new Set();
      applyNodePositions(!App.reducedMotion(), 170);
    }

    function syncFlagsAppearance(model, activeColorDial) {
      const { state, visible, twins, full, summaries } = model;
      const visibleSet = liveBrushIds || new Set(visible);
      const regionIds = model.pairRegionIds;
      const focusFilter = Boolean(state.team || state.arch || state.cohort || state.search || regionIds || liveBrushIds);
      const hoverSet = new Set(hoveredList);

      gNodes.selectAll("g.sm-node").each(function (id) {
        const g = d3.select(this);
        const isA = id === state.team, isB = id === state.compare;
        const inVis = visibleSet.has(id) && (!regionIds || regionIds.has(id));
        const inArchFocus = !state.arch || App.team[id].archetype === state.arch;
        const isTwin = !isA && !isB && inVis && state.team && twins.includes(id);
        const isFocusEntity = isA || isB || isTwin;
        const isOut = !inVis || (!isFocusEntity && !inArchFocus);
        const isDim = !isOut && focusFilter && !isFocusEntity && !(state.arch && inArchFocus && !state.team);
        const isHover = hoverSet.has(id);

        g.classed("is-out", isOut).classed("is-dim", isDim).classed("is-hover", isHover);
        const rad = (isA || isB) ? 13.5 : isTwin ? 11 : (isOut || isDim) ? 7.5 : 9.5;

        const roleStroke = isA ? C.a : isB ? C.b : isTwin ? C.twin : "#cbd3d0";
        const ringColor = activeColorDial !== null && full.team[id]
          ? zColor(full.team[id][activeColorDial])
          : roleStroke;

        g.select(".sm-role-halo").attr("r", rad + 5.0)
          .attr("stroke", isHover ? C.ink : isA ? C.a : isB ? C.b : "none")
          .attr("stroke-width", isHover ? 2 : (activeColorDial !== null && (isA || isB) ? 2 : 0))
          .attr("opacity", isHover || (activeColorDial !== null && (isA || isB)) ? 1 : 0);
        g.select(".sm-ring").attr("r", rad + (activeColorDial !== null ? 2.8 : 2.1))
          .attr("stroke", ringColor)
          .attr("stroke-width", activeColorDial !== null ? 3.5 : (isA || isB ? 3 : isTwin ? 2.2 : 1.2));
        g.select(".sm-bg").attr("r", rad);
        g.select("image").attr("x", -rad).attr("y", -rad).attr("width", rad * 2).attr("height", rad * 2);
        g.select(".sm-rim").attr("r", rad);
        g.select(".sm-role-badge").attr("transform", `translate(${rad * 0.72}, ${-rad * 0.72})`);

        if (isHover || isA || isB) g.raise();
      });

      gLabels.selectAll("text").attr("opacity", function () {
        const id = this.dataset.labelFor;
        return !visibleSet.has(id) && id !== state.team && id !== state.compare ? 0.25 : 1;
      });
      gHoverLabels.selectAll("*").remove();
      for (const id of hoveredList) {
        if (!currentModel?.pos[id] || !gLabels.select(`[data-label-for="${id}"]`).empty()) continue;
        const pt = currentModel.pos[id];
        const off = loupeOffsets.get(id) || { dx: 0, dy: 0 };
        if (!currentScale) continue;
        const hx = currentScale.x(pt[0]) + off.dx;
        const hy = currentScale.y(pt[1]) + off.dy;
        gHoverLabels.append("text").attr("class", "sm-code is-hover").attr("translate", "no")
          .attr("x", hx).attr("y", Math.max(16, hy - 16))
          .attr("text-anchor", "middle").text(id);
      }
      void summaries;
    }

    function draw(model, { animate = false } = {}) {
      currentModel = model;
      renderLegend(model);
      updateReadout(model);

      const W = Math.max(240, canvasEl.clientWidth || 480);
      const H = Math.max(200, canvasEl.clientHeight || 340);
      const m = { t: 22, r: 16, b: 30, l: 16 };
      svg.attr("viewBox", `0 0 ${W} ${H}`);

      const { state, space, pca, pos, visible, twins, summaries, nearByTeam, activeColorDial, matchRecord } = model;
      const scale = computeScales(model, W, H, m);
      currentScale = scale;
      const { x, y, fpos } = scale;
      const P = (id) => [x(pos[id][0]), y(pos[id][1])];
      const visibleSet = liveBrushIds || new Set(visible);

      const sig = `${state.dials.join(",")}|${state.scope}|${A.encodeWeights(state.weights)}|${state.arch}`;
      const doAnimate = animate && hasDrawnOnce && !App.reducedMotion() && sig !== prevDataSig;
      prevDataSig = sig;
      const dur = doAnimate ? 440 : 0;

      // Grid zero lines
      const x0 = Math.max(m.l, Math.min(W - m.r, x(0)));
      const y0 = Math.max(m.t, Math.min(H - m.b, y(0)));
      gGrid.selectAll("*").remove();
      gGrid.append("line").attr("x1", x0).attr("x2", x0).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.line).attr("stroke-dasharray", "3 3");
      gGrid.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y0).attr("y2", y0).attr("stroke", C.line).attr("stroke-dasharray", "3 3");

      // Biplot loading vectors (background when Steer off) + Topmost Interactive Steer Layer (when Steer on)
      gBiplot.selectAll("*").remove();
      gSteer.selectAll("*").remove();
      const ox = x(0), oy = y(0);
      const scaleLen = Math.min(W - m.l - m.r, H - m.t - m.b) * 0.44;
      const steer = steerOn(model);
      gBrush.classed("is-disabled", steer).style("pointer-events", steer ? "none" : null);
      gNodes.classed("is-steer-bg", steer);
      const weights = state.weights || {};

      if (!steer) {
        space.dialIds.forEach((dialId, j) => {
          const lx = pca.comps[0][j] || 0;
          const ly = pca.comps[1][j] || 0;
          const mag = Math.hypot(lx, ly);
          if (mag < 0.08) return;
          const curW = weights[dialId] ?? 1;
          const vecLen = scaleLen * Math.max(0.24, mag);
          const ux = lx / mag;
          const uy = ly / mag;
          const tx = Math.max(m.l + 18, Math.min(W - m.r - 18, ox + ux * vecLen));
          const ty = Math.max(m.t + 16, Math.min(H - m.b - 16, oy - uy * vecLen));

          const gSpoke = gBiplot.append("g").attr("class", "sm-spoke");
          gSpoke.append("line")
            .attr("x1", ox).attr("y1", oy).attr("x2", tx).attr("y2", ty)
            .attr("stroke", "#9aa6ab").attr("stroke-opacity", 0.38).attr("stroke-width", 1).attr("stroke-dasharray", "2 2");

          gSpoke.append("circle")
            .attr("cx", tx).attr("cy", ty).attr("r", 2.6)
            .attr("fill", "#9aa6ab").attr("opacity", 0.55)
            .on("pointerenter", (e) => {
              App.tip.show(
                `<div class="tt-title">${esc(App.indicator(dialId).label)}</div>` +
                App.ttRows([["Horizontal loading", App.signed(lx, 2)], ["Vertical loading", App.signed(ly, 2)], ["Weight", `${curW.toFixed(2)}×`]]),
                e
              );
            }).on("pointermove", (e) => App.tip.move(e))
            .on("pointerleave", () => App.tip.hide());
        });
      } else {
        const ringR = Math.min(scaleLen * 0.55, Math.min(W - m.l - m.r, H - m.t - m.b) * 0.34);
        gSteer.append("circle")
          .attr("class", "sm-steer-ring")
          .attr("cx", ox).attr("cy", oy).attr("r", ringR)
          .attr("fill", "none").attr("stroke", "#9fb0b6").attr("stroke-width", 1.1).attr("stroke-dasharray", "3 3")
          .attr("pointer-events", "none");
        gSteer.append("text")
          .attr("class", "sm-steer-ring-lbl").attr("translate", "no")
          .attr("x", ox).attr("y", Math.max(m.t + 10, oy - ringR - 4))
          .attr("text-anchor", "middle").attr("pointer-events", "none")
          .text("1.0×");

        const items = space.dialIds.map((dialId, j) => {
          const lx = pca.comps[0][j] || 0;
          const ly = pca.comps[1][j] || 0;
          const mag = Math.hypot(lx, ly);
          const angle = mag > 1e-4 ? Math.atan2(ly, lx) : (j * Math.PI * 2) / space.dialIds.length;
          const ux = mag > 1e-4 ? lx / mag : Math.cos(angle);
          const uy = mag > 1e-4 ? ly / mag : Math.sin(angle);
          const curW = weights[dialId] ?? 1;
          const baseDist = Math.max(54, scaleLen * Math.max(0.38, mag));
          const len = baseDist * (0.35 + 0.65 * curW);
          const hx = Math.max(m.l + 18, Math.min(W - m.r - 18, ox + ux * len));
          const hy = Math.max(m.t + 16, Math.min(H - m.b - 16, oy - uy * len));
          return { dialId, j, lx, ly, mag, ux, uy, curW, baseDist, hx, hy };
        });

        // Gentle deterministic vertical de-overlap on initial placement so pills stay readable
        for (let pass = 0; pass < 6; pass++) {
          for (let a = 0; a < items.length; a++) {
            for (let b = a + 1; b < items.length; b++) {
              const ia = items[a], ib = items[b];
              const dx = Math.abs(ia.hx - ib.hx), dy = ib.hy - ia.hy;
              if (dx < 96 && Math.abs(dy) < 24) {
                const push = (24 - Math.abs(dy)) * 0.55;
                const dir = dy >= 0 ? 1 : -1;
                ia.hy = Math.max(m.t + 16, Math.min(H - m.b - 16, ia.hy - dir * push));
                ib.hy = Math.max(m.t + 16, Math.min(H - m.b - 16, ib.hy + dir * push));
              }
            }
          }
        }

        const pillFitters = [];
        items.forEach((item) => {
          const { dialId, lx, ly, ux, uy, curW, baseDist } = item;
          const isWeighted = Math.abs(curW - 1) >= 0.04;
          const gSpoke = gSteer.append("g").attr("class", "sm-spoke is-steer");
          const spokeLine = gSpoke.append("line")
            .attr("x1", ox).attr("y1", oy).attr("x2", item.hx).attr("y2", item.hy)
            .attr("stroke", isWeighted ? C.a : "#495961")
            .attr("stroke-opacity", isWeighted ? 0.85 : 0.6)
            .attr("stroke-width", isWeighted ? 2 : 1.5);

          const onLeftSide = ux < 0 ? (item.hx > m.l + 92) : (item.hx > W - m.r - 96);
          const handle = gSpoke.append("g")
            .attr("class", `sm-steer-handle${isWeighted ? " is-weighted" : ""}`)
            .attr("data-dial", dialId)
            .attr("transform", `translate(${item.hx},${item.hy})`);

          const pill = handle.append("rect")
            .attr("class", "sm-steer-pill")
            .attr("y", -10)
            .attr("height", 20)
            .attr("rx", 10);

          const dot = handle.append("circle")
            .attr("class", "sm-steer-dot")
            .attr("cx", 0).attr("cy", 0).attr("r", 4.5)
            .attr("fill", isWeighted ? C.a : "#ffffff")
            .attr("stroke", isWeighted ? C.a : C.ink)
            .attr("stroke-width", 1.7);

          const txt = handle.append("text")
            .attr("class", "sm-steer-lbl")
            .attr("x", onLeftSide ? -10 : 10)
            .attr("y", 3.5)
            .attr("text-anchor", onLeftSide ? "end" : "start");
          txt.append("tspan").attr("class", "sm-steer-name").text(App.indicator(dialId).short);
          const wSpan = txt.append("tspan").attr("class", "sm-steer-w").attr("translate", "no").text(` ${curW.toFixed(1)}×`);

          const fitPill = () => {
            const tw = txt.node().getComputedTextLength?.() || (App.indicator(dialId).short.length * 6.5 + 34);
            const pw = Math.max(56, tw + 24);
            pill.attr("width", pw).attr("x", onLeftSide ? -(pw - 10) : -10);
          };
          fitPill();
          pillFitters.push(fitPill);

          let startX = 0, startY = 0, moved = false, liveW = curW;
          const drag = d3.drag()
            .on("start", (event) => {
              draggingSteer = true;
              clearLoupe();
              startX = event.x;
              startY = event.y;
              moved = false;
              liveW = curW;
              handle.classed("is-dragging", true).raise();
              gSpoke.raise();
            })
            .on("drag", (event) => {
              moved = moved || Math.hypot(event.x - startX, event.y - startY) >= 4;
              const rx = event.x - ox, ry = -(event.y - oy);
              const proj = rx * ux + ry * uy;
              liveW = Math.max(0.2, Math.min(2.5, Math.round((((proj / baseDist) - 0.35) / 0.65) * 10) / 10));
              const nextLen = baseDist * (0.35 + 0.65 * liveW);
              const nx = Math.max(m.l + 18, Math.min(W - m.r - 18, ox + ux * nextLen));
              const ny = Math.max(m.t + 16, Math.min(H - m.b - 16, oy - uy * nextLen));
              const weightedNow = Math.abs(liveW - 1) >= 0.04;
              spokeLine.attr("x2", nx).attr("y2", ny)
                .attr("stroke", weightedNow ? C.a : "#495961")
                .attr("stroke-width", weightedNow ? 2 : 1.5);
              handle.attr("transform", `translate(${nx},${ny})`).classed("is-weighted", weightedNow);
              dot.attr("fill", weightedNow ? C.a : "#ffffff").attr("stroke", weightedNow ? C.a : C.ink);
              wSpan.text(` ${liveW.toFixed(1)}×`);
              fitPill();
            })
            .on("end", () => {
              draggingSteer = false;
              handle.classed("is-dragging", false);
              const nextW = moved ? liveW : (curW < 1.3 ? 2.0 : curW > 1.7 ? 0.5 : 1.0);
              onWeight?.(dialId, nextW);
            });

          handle.style("cursor", "grab").call(drag)
            .on("pointerenter", (e) => {
              App.tip.show(
                `<div class="tt-title">${esc(App.indicator(dialId).label)}</div>` +
                App.ttRows([["Horizontal loading", App.signed(lx, 2)], ["Vertical loading", App.signed(ly, 2)], ["Weight", `${curW.toFixed(2)}×`]]) +
                `<div class="tt-dim" style="margin-top:3px">Drag outward to boost weight, inward to reduce, or click to cycle</div>`,
                e
              );
            }).on("pointermove", (e) => App.tip.move(e))
            .on("pointerleave", () => App.tip.hide());
        });

        requestAnimationFrame(() => { if (svg.node()?.isConnected) pillFitters.forEach((fn) => fn()); });
      }

      // Monochrome archetype landmarks + persistent cohort hull + focus archetype hull
      gLandmarks.selectAll("*").remove();
      const mapCx = d3.mean(Object.keys(pos), (id) => x(pos[id][0])) ?? W / 2;
      const mapCy = d3.mean(Object.keys(pos), (id) => y(pos[id][1])) ?? H / 2;
      const archCentroids = {};
      for (const archId of App.SPECTRUM_ORDER) {
        const members = App.arch[archId].members.filter((id) => pos[id]);
        if (!members.length) continue;
        const cx = d3.mean(members, (id) => x(pos[id][0]));
        const cy = d3.mean(members, (id) => y(pos[id][1]));
        archCentroids[archId] = [cx, cy];
        const focused = state.arch === archId;
        if (focused && members.length >= 3) {
          const pts = members.map((id) => [x(pos[id][0]), y(pos[id][1])]);
          const hull = d3.polygonHull(pts);
          if (hull) {
            const hc = d3.polygonCentroid(hull);
            const expanded = hull.map(([px, py]) => {
              const dx = px - hc[0], dy = py - hc[1], len = Math.hypot(dx, dy) || 1;
              return [px + (dx / len) * 20, py + (dy / len) * 20];
            });
            gLandmarks.append("path")
              .attr("d", d3.line().curve(d3.curveCatmullRomClosed.alpha(0.85))(expanded))
              .attr("fill", "rgba(36, 51, 58, 0.04)")
              .attr("stroke", C.ink2).attr("stroke-width", 1.3).attr("stroke-dasharray", "4 3");
          }
        }
        // Push landmark slightly toward perimeter away from congested center so flags don't slice words
        const pdx = cx - mapCx, pdy = cy - mapCy, plen = Math.hypot(pdx, pdy) || 1;
        const push = archId === "allrounders" ? 28 : 18;
        const lx = Math.max(m.l + 52, Math.min(W - m.r - 52, cx + (archId === "allrounders" ? 0 : (pdx / plen) * push)));
        const ly = Math.max(m.t + 16, Math.min(H - m.b - 10, cy + (archId === "allrounders" ? 28 : (pdy / plen) * push) - (focused ? 18 : 14)));
        gLandmarks.append("text")
          .attr("class", focused ? "sm-landmark is-focus" : "sm-landmark")
          .attr("x", lx).attr("y", ly).attr("text-anchor", "middle")
          .text(App.groupShort(archId));
      }

      if (state.cohort && state.cohort.length >= 3) {
        const cPts = state.cohort.filter((id) => pos[id]).map(P);
        const cHull = d3.polygonHull(cPts);
        if (cHull) {
          const cc = d3.polygonCentroid(cHull);
          const expanded = cHull.map(([px, py]) => {
            const dx = px - cc[0], dy = py - cc[1], len = Math.hypot(dx, dy) || 1;
            return [px + (dx / len) * 16, py + (dy / len) * 16];
          });
          gLandmarks.append("path")
            .attr("d", d3.line().curve(d3.curveCatmullRomClosed.alpha(0.8))(expanded))
            .attr("fill", "rgba(36, 99, 154, 0.05)")
            .attr("stroke", C.a).attr("stroke-width", 1.2).attr("stroke-dasharray", "3 2");
        }
      }

      // Dynamic plain-English axes (always guarantee both negative & positive pole captions)
      gAxes.selectAll("*").remove();
      const maxTerms = W < 420 ? 1 : 2;
      const capL = axisDirections(pca.comps[0], space.dialIds, -1, maxTerms);
      const capR = axisDirections(pca.comps[0], space.dialIds, 1, maxTerms);
      const capT = axisDirections(pca.comps[1], space.dialIds, 1, maxTerms);
      const capB = axisDirections(pca.comps[1], space.dialIds, -1, maxTerms);
      gAxes.append("text").attr("class", "sm-axis-lbl").attr("x", m.l).attr("y", H - 8).attr("text-anchor", "start").text(`← ${capL.join(" · ")}`);
      gAxes.append("text").attr("class", "sm-axis-lbl").attr("x", W - m.r).attr("y", H - 8).attr("text-anchor", "end").text(`${capR.join(" · ")} →`);
      const yAxisLabelX = Math.max(m.l + 95, Math.min(W - m.r - 95, x0));
      gAxes.append("text").attr("class", "sm-axis-lbl sm-axis-y").attr("x", yAxisLabelX).attr("y", 14).attr("text-anchor", "middle").text(`↑ ${capT.join(" · ")}`);
      gAxes.append("text").attr("class", "sm-axis-lbl sm-axis-y").attr("x", yAxisLabelX).attr("y", H - m.b - 5).attr("text-anchor", "middle").text(`↓ ${capB.join(" · ")}`);

      // Twin / Network / Ego links
      gLinks.selectAll("*").remove();
      const lm = linkModeOf(model);
      const bundledLine = d3.line().curve(d3.curveBundle.beta(0.72));
      if (lm === "stars") {
        const starEdges = [];
        for (const a of Object.keys(pos)) {
          if (!visibleSet.has(a)) continue;
          for (const n of nearByTeam[a] || []) {
            if (a >= n.id || !pos[n.id] || !visibleSet.has(n.id)) continue;
            const ga = summaries[a]?.gd, gb = summaries[n.id]?.gd;
            if (!Number.isFinite(n.sim) || !Number.isFinite(ga) || !Number.isFinite(gb)) continue;
            const sim = n.sim * 100, gap = Math.abs(ga - gb);
            if (sim >= 90 && gap >= 1.0) {
              const sameArch = App.team[a].archetype === App.team[n.id].archetype;
              starEdges.push({ a, b: n.id, sim, gap, sameArch });
            }
          }
        }
        for (const e of starEdges) {
          const pa = P(e.a), pb = P(e.b);
          const ca = archCentroids[App.team[e.a].archetype] || pa;
          const cb = archCentroids[App.team[e.b].archetype] || pb;
          const pts = e.sameArch ? [pa, ca, pb] : [pa, ca, [mapCx, mapCy], cb, pb];
          const isHover = hoveredList.includes(e.a) || hoveredList.includes(e.b);
          gLinks.append("path")
            .attr("d", bundledLine(pts))
            .attr("fill", "none")
            .attr("stroke", C.gold)
            .attr("stroke-width", isHover ? 2 : 1.15)
            .attr("stroke-opacity", isHover ? 0.9 : 0.48)
            .attr("stroke-dasharray", e.sameArch ? "none" : "4 3")
            .attr("cursor", "pointer")
            .on("pointerenter", (ev) => {
              highlight([e.a, e.b]);
              App.tip.show(`<div class="tt-title">${esc(e.a)} vs ${esc(e.b)}</div><div>${App.fix(e.sim, 1)}% similar · Δ ${App.fix(e.gap, 2)} GD/m</div>`, ev);
            })
            .on("pointerleave", () => { highlight(null); App.tip.hide(); })
            .on("click", (ev) => { ev.stopPropagation(); choose(e.a, "A"); });
        }
      } else if (lm === "ego" && state.team && pos[state.team]) {
        const [ax, ay] = P(state.team);
        const hop1 = twins.filter((id) => pos[id]);
        for (const t1 of hop1) {
          const [x1, y1] = P(t1);
          const diff = (summaries[t1]?.gd ?? 0) - (summaries[state.team]?.gd ?? 0);
          gLinks.append("line")
            .attr("x1", ax).attr("y1", ay).attr("x2", x1).attr("y2", y1)
            .attr("stroke", diff > 0.3 ? C.pos : diff < -0.3 ? C.muted : C.neutral)
            .attr("stroke-width", t1 === state.compare ? 2.6 : 1.8)
            .attr("stroke-dasharray", diff < -0.3 ? "4 3" : "none")
            .attr("stroke-opacity", 0.85);
          // 2-hop neighbors
          const subTwins = (nearByTeam[t1] || []).slice(0, 3).map((n) => n.id).filter((id) => id !== state.team && !hop1.includes(id) && pos[id]);
          for (const t2 of subTwins) {
            const [x2, y2] = P(t2);
            gLinks.append("line")
              .attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2)
              .attr("stroke", C.twin).attr("stroke-width", 1).attr("stroke-opacity", 0.32).attr("stroke-dasharray", "2 3");
          }
        }
      } else if (state.team && pos[state.team]) {
        const [ax, ay] = P(state.team);
        const gdA = summaries[state.team]?.gd ?? 0;
        for (const tid of twins) {
          if (!pos[tid] || !visibleSet.has(tid)) continue;
          const [tx, ty] = P(tid);
          const diff = (summaries[tid]?.gd ?? 0) - gdA;
          const col = diff > 0.3 ? C.pos : C.muted;
          gLinks.append("line")
            .attr("x1", ax).attr("y1", ay).attr("x2", tx).attr("y2", ty)
            .attr("stroke", col)
            .attr("stroke-width", tid === state.compare ? 2.5 : 1.7)
            .attr("stroke-dasharray", diff < -0.3 ? "4 3" : "none")
            .attr("stroke-opacity", tid === state.compare ? 0.92 : 0.7)
            .attr("pointer-events", "none");
        }
        if (state.compare && pos[state.compare] && !twins.includes(state.compare)) {
          const [bx, by] = P(state.compare);
          gLinks.append("line")
            .attr("x1", ax).attr("y1", ay).attr("x2", bx).attr("y2", by)
            .attr("stroke", C.ink2).attr("stroke-width", 1.8).attr("stroke-dasharray", "4 3").attr("stroke-opacity", 0.72)
            .attr("pointer-events", "none");
        }
      }

      // Match-by-match trajectory overlay (1..N) when Trail enabled
      gTrail.selectAll("*").remove();
      if (trailOn(model)) {
        const trailTeams = [state.team, state.compare].filter((id) => id && pos[id]);
        trailTeams.forEach((tid, sIdx) => {
          const col = sIdx === 0 ? C.a : C.b;
          const mRows = A.rows(tid, state.scope).sort((u, v) => u.number - v.number);
          const pts = mRows
            .filter((r) => space.match[r.key])
            .map((r, k) => {
              const pr = pca.project(space.match[r.key]);
              return { row: r, idx: k + 1, xy: [x(pr[0]), y(pr[1])] };
            });
          if (pts.length >= 2) {
            gTrail.append("path")
              .attr("d", d3.line().curve(d3.curveCatmullRom.alpha(0.6))(pts.map((p) => p.xy)))
              .attr("fill", "none").attr("stroke", col).attr("stroke-width", 1.6)
              .attr("stroke-opacity", 0.65).attr("marker-end", "url(#sm-trail-arrow)").attr("pointer-events", "none");
          }
          pts.forEach((p) => {
            const gPt = gTrail.append("g").attr("transform", `translate(${p.xy})`).style("cursor", "pointer");
            gPt.append("circle").attr("r", 6.5).attr("fill", "#ffffff").attr("stroke", col).attr("stroke-width", 1.5);
            gPt.append("text").attr("text-anchor", "middle").attr("dy", "0.35em")
              .attr("font-size", 8.5).attr("font-weight", 750).attr("fill", col).attr("translate", "no")
              .text(p.idx);
            gPt.on("pointerenter", (ev) => {
              highlight([p.row.team_id, p.row.opp_id]);
              App.tip.show(`<div class="tt-title">M${p.row.number} · ${esc(p.row.team_id)} ${p.row.goals}–${p.row.goals_opp} ${esc(p.row.opp_id)}</div><div class="tt-dim">${esc(p.row.stage)} · Match #${p.idx} in trajectory</div>`, ev);
            }).on("pointermove", (ev) => App.tip.move(ev))
              .on("pointerleave", () => { highlight(null); App.tip.hide(); })
              .on("click", (ev) => { ev.stopPropagation(); onSelectMatch?.(p.row.key); });
          });
        });
      }

      // Dual-tether Match Overlay Diamond (tethered to BOTH team_id and opp_id)
      gMatch.selectAll("*").remove();
      if (fpos && matchRecord) {
        const [fx, fy] = [x(fpos[0]), y(fpos[1])];
        if (pos[matchRecord.team_id]) {
          const [tx, ty] = P(matchRecord.team_id);
          gMatch.append("line").attr("x1", fx).attr("y1", fy).attr("x2", tx).attr("y2", ty)
            .attr("stroke", C.ink).attr("stroke-width", 1.6);
        }
        if (pos[matchRecord.opp_id]) {
          const [ox2, oy2] = P(matchRecord.opp_id);
          gMatch.append("line").attr("x1", fx).attr("y1", fy).attr("x2", ox2).attr("y2", oy2)
            .attr("stroke", C.muted).attr("stroke-width", 1.3).attr("stroke-dasharray", "3 3");
        }
        gMatch.append("path").attr("d", d3.symbol(d3.symbolDiamond, 130)())
          .attr("transform", `translate(${fx},${fy})`)
          .attr("fill", "#ffffff").attr("stroke", C.ink).attr("stroke-width", 2.2);
        const flipTag = fx > W - m.r - 78;
        gMatch.append("text").attr("class", "sm-match-tag").attr("translate", "no")
          .attr("x", flipTag ? fx - 10 : fx + 9).attr("y", Math.max(m.t + 12, fy - 7))
          .attr("text-anchor", flipTag ? "end" : "start")
          .text(`${matchRecord.team_id} v ${matchRecord.opp_id}`);
      }

      // Brush layer UNDER flags
      const ptsList = Object.keys(pos).map((id) => ({ id, xy: P(id) }));
      const brush = d3.brush()
        .extent([[m.l, m.t], [W - m.r, H - m.b]])
        .keyModifiers(false)
        .handleSize(0)
        .on("brush", ({ selection, sourceEvent }) => {
          if (!sourceEvent || !svg.node().isConnected) return;
          if (!selection || Math.hypot(selection[1][0] - selection[0][0], selection[1][1] - selection[0][1]) < 6) {
            if (liveBrushIds) {
              liveBrushIds = null;
              syncFlagsAppearance(model, activeColorDial);
              onBrush(null, true);
              updateReadout(model);
            }
            return;
          }
          const [[x0b, y0b], [x1b, y1b]] = selection;
          const ids = ptsList.filter(({ xy: [px, py] }) => px >= x0b && px <= x1b && py >= y0b && py <= y1b).map((p) => p.id);
          liveBrushIds = new Set(ids);
          syncFlagsAppearance(model, activeColorDial);
          onBrush(ids, true);
          updateReadout(model);
        })
        .on("end", ({ selection, sourceEvent }) => {
          if (!sourceEvent || !svg.node().isConnected) return;
          liveBrushIds = null;
          if (!selection || Math.hypot(selection[1][0] - selection[0][0], selection[1][1] - selection[0][1]) < 6) {
            if (selection) gBrush.call(brush.move, null);
            syncFlagsAppearance(model, activeColorDial);
            onBrush(null, true);
            updateReadout(model);
            return;
          }
          const [[x0b, y0b], [x1b, y1b]] = selection;
          const ids = ptsList.filter(({ xy: [px, py] }) => px >= x0b && px <= x1b && py >= y0b && py <= y1b).map((p) => p.id).sort();
          gBrush.call(brush.move, null);
          onBrush(ids, false);
        });
      gBrush.call(brush);

      // Persistent Nodes (Keyed by team id for object constancy)
      const roleOf = (id) => {
        if (id === state.team) return "a";
        if (id === state.compare) return "b";
        if (!visibleSet.has(id)) return "out";
        if (state.team && twins.includes(id)) return "twin";
        return "in";
      };
      const rankZ = { out: 0, in: 1, twin: 2, b: 3, a: 4 };
      const sortedIds = Object.keys(pos).sort((u, v) => rankZ[roleOf(u)] - rankZ[roleOf(v)]);

      // Brief motion ghost trails for top movers when projection shifts
      gMotionGhosts.selectAll("*").remove();
      if (doAnimate && prevAnchors.size) {
        const movers = sortedIds
          .map((id) => {
            const p0 = prevAnchors.get(id), p1 = P(id);
            return p0 ? { id, p0, p1, dist: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) } : null;
          })
          .filter((d) => d && d.dist > 14)
          .sort((u, v) => v.dist - u.dist)
          .slice(0, 5);
        for (const mv of movers) {
          gMotionGhosts.append("line")
            .attr("x1", mv.p0[0]).attr("y1", mv.p0[1])
            .attr("x2", mv.p1[0]).attr("y2", mv.p1[1])
            .attr("stroke", C.ink2).attr("stroke-width", 1.2).attr("stroke-dasharray", "2 2").attr("stroke-opacity", 0.45)
            .transition().duration(dur + 220).attr("stroke-opacity", 0).remove();
        }
      }

      const nodes = gNodes.selectAll("g.sm-node")
        .data(sortedIds, (id) => id)
        .join(
          (enter) => {
            const g = enter.append("g")
              .attr("class", "sm-node")
              .attr("data-team", (id) => id)
              .attr("transform", (id) => `translate(${P(id)})`)
              .attr("tabindex", 0)
              .attr("role", "button")
              .attr("aria-label", (id) => App.team[id].name);
            g.append("circle").attr("class", "sm-role-halo");
            g.append("circle").attr("class", "sm-ring");
            g.append("circle").attr("class", "sm-bg").attr("fill", "#ffffff");
            g.append("image")
              .attr("href", (id) => App.flagUrl(id))
              .attr("clip-path", "url(#sm-flag-clip)")
              .attr("preserveAspectRatio", "xMidYMid slice")
              .attr("pointer-events", "none");
            g.append("circle").attr("class", "sm-rim").attr("fill", "none").attr("pointer-events", "none");
            const badge = g.append("g").attr("class", "sm-role-badge").style("display", "none");
            badge.append("circle").attr("r", 6.5);
            badge.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").attr("translate", "no");
            return g;
          },
          (update) => update,
          (exit) => exit.remove()
        );

      nodes.order()
        .attr("aria-pressed", (id) => String(id === state.team || id === state.compare))
        .each(function (id) {
          const isRole = id === state.team || id === state.compare;
          const badge = d3.select(this).select(".sm-role-badge");
          badge.style("display", isRole ? null : "none")
            .attr("class", `sm-role-badge ${id === state.team ? "is-a" : "is-b"}`);
          if (isRole) badge.select("text").text(id === state.team ? "A" : "B");
        });

      nodes.on("click", (e, id) => {
        e.stopPropagation();
        choose(id, e.shiftKey ? "A" : undefined);
      }).on("keydown", (e, id) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose(id, e.shiftKey ? "A" : undefined);
        }
      }).on("pointerenter", (e, id) => {
        activateLoupe(id);
        highlight([id]);
        const s = summaries[id];
        if (s) {
          const res = state.team && id !== state.team ? residualStats(currentModel, state.team, id) : null;
          const resRow = res ? [["10d style sim", `${App.fix(res.sim, 1)}%`]] : [];
          App.tip.show(
            `<div class="tt-title">${App.flag(id, 16)} ${esc(App.team[id].name)}</div>` +
            `<div class="tt-dim">${esc(App.groupShort(App.team[id].archetype))}</div>` +
            App.ttRows([["Goal diff. / m", App.signed(s.gd, 2)], ["xG diff. / m", App.signed(s.xgd, 2)], ["Matches", s.n], ...resRow]) +
            (res?.warn ? `<div class="tt-warn">2D close, ${state.dials.length}-dial differs (ortho ${App.fix(res.ortho, 2)} σ)</div>` : ""),
            e
          );
        }
      }).on("pointermove", (e) => App.tip.move(e))
        .on("pointerleave", (_, id) => {
          if (loupeAnchorSet.size && !loupeAnchorSet.has(id)) clearLoupe();
          highlight(null);
          App.tip.hide();
        })
        .on("focus", (e, id) => highlight([id]))
        .on("blur", () => highlight(null));

      svg.on("pointerleave", () => clearLoupe());

      if (!loupeOffsets.size) {
        applyNodePositions(doAnimate, dur);
      }

      // Labels layer: A, B, top twins (when A selected), or 4 extremes in overview
      gLabels.selectAll("*").remove();
      let priority = [];
      if (state.team) {
        priority = [state.team, state.compare, ...twins.slice(0, 3)].filter((id) => id && pos[id]);
      } else {
        const visList = Object.keys(pos).filter((id) => visibleSet.has(id));
        if (visList.length) {
          priority = [...new Set([0, 1].flatMap((ax) => [
            d3.least(visList, (id) => pos[id][ax]),
            d3.greatest(visList, (id) => pos[id][ax]),
          ]))].filter(Boolean);
        }
      }
      const placed = [];
      const offsets = [[0, -19], [21, 4], [-21, 4], [0, 23], [22, -12], [-22, -12]];
      for (const id of priority) {
        const [px, py] = P(id);
        const r = roleOf(id);
        let lx, ly;
        for (const [dx, dy] of offsets) {
          const cx = px + dx, cy = py + dy;
          if (cx < m.l + 18 || cx > W - m.r - 18 || cy < m.t + 10 || cy > H - m.b - 6) continue;
          if (placed.some(([ox2, oy2]) => Math.abs(cx - ox2) < 34 && Math.abs(cy - oy2) < 15)) continue;
          if (ptsList.some((p) => p.id !== id && Math.abs(cx - p.xy[0]) < 16 && Math.abs(cy - p.xy[1]) < 12)) continue;
          lx = cx; ly = cy; break;
        }
        if (lx === undefined) {
          if (r !== "a" && r !== "b") continue;
          lx = px; ly = Math.max(m.t + 10, py - 21);
        }
        placed.push([lx, ly]);
        gLabels.append("text")
          .attr("class", `sm-code role-${r}`)
          .attr("data-label-for", id)
          .attr("translate", "no")
          .attr("x", lx).attr("y", ly)
          .attr("text-anchor", "middle")
          .text(id);
      }

      prevAnchors = new Map(Object.keys(pos).map((id) => [id, P(id)]));
      hasDrawnOnce = true;
      syncFlagsAppearance(model, activeColorDial);
    }

    function setHovered(ids) {
      hoveredList = Array.isArray(ids) ? ids.filter(Boolean) : [];
      if (!currentModel) return;
      syncFlagsAppearance(currentModel, currentModel.activeColorDial);
      updateReadout(currentModel);
    }

    function setColorDial(dialIdx) {
      if (!currentModel) return;
      currentModel = { ...currentModel, activeColorDial: dialIdx };
      renderLegend(currentModel);
      updateReadout(currentModel);
      syncFlagsAppearance(currentModel, dialIdx);
    }

    function render(model) {
      liveBrushIds = null;
      loupeOffsets = new Map();
      loupeAnchorSet = new Set();
      draw(model, { animate: true });
    }

    function redraw() {
      if (currentModel && bodyHost.isConnected) {
        loupeOffsets = new Map();
        loupeAnchorSet = new Set();
        draw(currentModel, { animate: false });
      }
    }

    return { render, redraw, setHovered, setColorDial };
  };
})();
