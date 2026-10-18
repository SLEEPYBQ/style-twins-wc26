/* Style map explorer: clustering map + linked style-DNA heatmap.
 * State lives in the URL (?team=ESP, ?arch=stormers) so Back steps out of a selection. */
(function () {
  const App = window.App;
  const INK = "#1d2433", GRID = "#efe9dc", MUTED = "#858a96";
  const DUR = 550;

  App.views.styles = function (root, params) {
    const state = { dials: App.dials.slice(), team: null, arch: null, showMatches: false, hover: null };
    readParams(params);

    root.innerHTML = `
      <section class="section-head" style="margin-top:0">
        <div><div class="kicker">Style map</div><h2>Who plays like whom?</h2>
          <p>Each marker is a team, placed by its average style over ten style dials. Close together means similar football; the shaded areas are the five playstyles found by clustering.
            Click a team to see its matches and its nearest style twins. Click empty space, press Esc or use Back to return.</p></div>
      </section>
      <div class="map-wrap">
        <div class="card map-card">
          <div class="map-tools" id="arch-tools"><span class="label">Playstyles</span></div>
          <div class="map-tools" id="dial-tools"><span class="label">Style dials</span></div>
          <div class="map-tools">
            <button type="button" class="chip" id="toggle-matches" aria-pressed="false"><span class="dot" style="background:${INK};opacity:.5"></span>All 208 team-matches</button>
            <button type="button" class="chip clear-chip" id="clear-sel" hidden>✕ Clear selection</button>
            <span class="note" id="cohesion"></span>
          </div>
          <div id="map-svg" class="map-svg"></div>
        </div>
        <aside class="side-panel" id="side"></aside>
      </div>
      <section class="section">
        <div class="section-head">
          <div><div class="kicker">Why the clusters differ</div><h2>The style DNA of all 48 teams</h2>
            <p>Columns are teams grouped by playstyle; rows are the selected style dials. Teal means more than the average team, orange means less. Hover a column to find the team on the map; click to select it.</p></div>
        </div>
        <div class="card heat-card"><div id="heat" style="overflow-x:auto"></div></div>
      </section>`;

    // ------------------------------------------------------------------ controls
    const archTools = d3.select("#arch-tools");
    archTools.selectAll("button.arch").data(App.data.archetypes).join("button").attr("type", "button").attr("class", "chip arch")
      .html((a) => `<svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true"><path d="${App.symbol(a.id, 60)}" fill="${a.color}"/></svg>${a.name.replace("The ", "")}`)
      .on("click", (evt, a) => setSelection({ arch: state.arch === a.id ? null : a.id, team: null }))
      .on("mouseenter", (evt, a) => { state.hover = { arch: a.id }; paint(false); App.tip.show(`<div class="tt-title">${a.name}</div>${a.tagline}<div class="tt-dim" style="margin-top:4px">${a.members.length} teams · click to focus</div>`, evt); })
      .on("mousemove", (evt) => App.tip.move(evt))
      .on("mouseleave", () => { state.hover = null; paint(false); App.tip.hide(); });

    const dialTools = d3.select("#dial-tools");
    dialTools.selectAll("button.dial").data(App.dials).join("button").attr("type", "button").attr("class", "chip dial on")
      .text((d) => d)
      .on("click", (evt, d) => {
        const on = state.dials.includes(d);
        if (on && state.dials.length <= 2) return;
        state.dials = on ? state.dials.filter((x) => x !== d) : App.dials.filter((x) => x === d || state.dials.includes(x));
        relayout(true);
      })
      .on("mouseenter", (evt, d) => App.tip.show(`<div class="tt-title">${d}</div>${App.dialInfo[d].help}<div class="tt-dim" style="margin-top:4px">${App.dialInfo[d].label} · click to switch ${state.dials.includes(d) ? "off" : "on"}</div>`, evt))
      .on("mousemove", (evt) => App.tip.move(evt)).on("mouseleave", App.tip.hide);
    dialTools.append("button").attr("type", "button").attr("class", "chip").text("Reset dials")
      .on("click", () => { state.dials = App.dials.slice(); relayout(true); });
    d3.select("#toggle-matches").on("click", function () {
      state.showMatches = !state.showMatches;
      this.setAttribute("aria-pressed", state.showMatches);
      this.classList.toggle("on", state.showMatches);
      paint();
    });
    d3.select("#clear-sel").on("click", () => setSelection({ team: null, arch: null }));
    const onKey = (e) => { if (e.key === "Escape" && (state.team || state.arch)) setSelection({ team: null, arch: null }); };
    document.addEventListener("keydown", onKey);
    App._stop = () => document.removeEventListener("keydown", onKey);

    function readParams(p) {
      state.team = p.team && App.team[p.team] ? p.team : null;
      state.arch = !state.team && p.arch && App.arch[p.arch] ? p.arch : null;
    }
    function setSelection({ team, arch }) {
      const q = team ? `?team=${team}` : arch ? `?arch=${arch}` : "";
      App.go(`#/styles${q}`);
    }

    // ------------------------------------------------------------------ layout (only when dials or size change)
    const mapEl = document.getElementById("map-svg");
    let L = null;
    const svg = d3.select(mapEl).append("svg").attr("role", "img").attr("aria-label", "Style map of 48 teams");
    const gAxes = svg.append("g"), gHull = svg.append("g").attr("pointer-events", "none");
    const bg = svg.append("rect").attr("fill", "transparent")
      .on("click", () => { if (state.team || state.arch) setSelection({ team: null, arch: null }); });
    const gDots = svg.append("g"), gSel = svg.append("g"), gMarks = svg.append("g"), gLabs = svg.append("g").attr("pointer-events", "none");
    const gSelLabs = svg.append("g").attr("pointer-events", "none");

    function relayout(animate) {
      const W = mapEl.clientWidth || 800;
      const narrow = W < 560;
      const H = narrow ? Math.round(W * 1.15) : Math.round(Math.max(420, Math.min(W * 0.7, window.innerHeight - 230)));
      const m = { t: narrow ? 40 : 30, r: 18, b: narrow ? 48 : 34, l: 18 };
      const space = App.styleSpace(state.dials);
      const pca = App.pca2(space);
      const twins = App.twinTable(space);
      const pos = {}, mpos = {};
      for (const t of App.teams) pos[t.id] = pca.project(space.team[t.id]);
      for (const k in space.match) mpos[k] = pca.project(space.match[k]);
      // one stable frame for every state: fit all team AND match positions, so selecting never rescales
      // every team, plus the central 94% of team-matches; the few outlying matches are pinned to the frame edge
      const mp = Object.values(mpos), tp = Object.values(pos);
      const q = (arr, f, p) => d3.quantile(arr.map(f).sort(d3.ascending), p);
      const xs = [Math.min(d3.min(tp, (p) => p[0]), q(mp, (p) => p[0], 0.03)), Math.max(d3.max(tp, (p) => p[0]), q(mp, (p) => p[0], 0.97))];
      const ys = [Math.min(d3.min(tp, (p) => p[1]), q(mp, (p) => p[1], 0.03)), Math.max(d3.max(tp, (p) => p[1]), q(mp, (p) => p[1], 0.97))];
      const x = d3.scaleLinear().domain([xs[0] - (xs[1] - xs[0]) * 0.05, xs[1] + (xs[1] - xs[0]) * 0.05]).range([m.l, W - m.r]).clamp(true);
      const y = d3.scaleLinear().domain([ys[0] - (ys[1] - ys[0]) * 0.06, ys[1] + (ys[1] - ys[0]) * 0.06]).range([H - m.b, m.t]).clamp(true);
      const nodes = App.teams.map((t) => ({ id: t.id, ax: x(pos[t.id][0]), ay: y(pos[t.id][1]) + 15 }));
      nodes.forEach((n) => { n.x = n.ax; n.y = n.ay; });
      const sim = d3.forceSimulation(nodes).force("x", d3.forceX((d) => d.ax).strength(0.7)).force("y", d3.forceY((d) => d.ay).strength(0.7))
        .force("c", d3.forceCollide(11)).stop();
      for (let i = 0; i < 140; i++) sim.tick();
      const labels = Object.fromEntries(nodes.map((n) => [n.id, [n.x, n.y]]));
      L = { space, pca, twins, pos, mpos, x, y, W, H, m, narrow, labels };
      const same = App.teams.filter((t) => App.team[twins.near[t.id][0].id].archetype === t.archetype).length;
      d3.select("#cohesion").html(`Cluster check: <b>${same}/48</b> teams' closest twin shares their playstyle${state.dials.length < App.dials.length ? ` (${state.dials.length} of 10 dials on)` : ""}.`);
      d3.selectAll("#dial-tools .chip.dial").classed("on", (d) => state.dials.includes(d)).attr("aria-pressed", (d) => state.dials.includes(d));
      drawFrame();
      paint(animate);
      drawHeat();
    }

    function axisCaption(vec, sign) {
      const pairs = state.dials.map((d, i) => [d, vec[i] * sign]).filter((p) => p[1] > 0.15).sort((a, b) => b[1] - a[1]).slice(0, 2);
      return pairs.length ? "more " + pairs.map((p) => p[0]).join(" · ") : "";
    }

    function drawFrame() {
      const { W, H, m, x, y, pca, narrow } = L;
      svg.attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
      bg.attr("width", W).attr("height", H);
      gAxes.selectAll("*").remove();
      gAxes.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", GRID).attr("stroke-width", 1.5);
      gAxes.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", GRID).attr("stroke-width", 1.5);
      const capR = axisCaption(pca.comps[0], 1), capL = axisCaption(pca.comps[0], -1);
      const capT = axisCaption(pca.comps[1], 1), capB = axisCaption(pca.comps[1], -1);
      gAxes.append("text").attr("class", "axis-label").attr("x", W - m.r).attr("y", H - 10).attr("text-anchor", "end").text(capR ? `${capR} →` : "");
      gAxes.append("text").attr("class", "axis-label").attr("x", m.l).attr("y", narrow ? H - 26 : H - 10).text(capL ? `← ${capL}` : "");
      gAxes.append("text").attr("class", "axis-label").attr("x", m.l).attr("y", 14).text(capT ? `↑ ${capT}` : "");
      gAxes.append("text").attr("class", "axis-cap").attr("x", narrow ? m.l : W - m.r).attr("y", narrow ? 30 : 14).attr("text-anchor", narrow ? "start" : "end")
        .text(narrow ? `${Math.round((pca.vars[0] + pca.vars[1]) * 100)}% of style variation shown`
          : `${capB ? `↓ ${capB} · ` : ""}axes explain ${Math.round((pca.vars[0] + pca.vars[1]) * 100)}% of style variation`);
      const hulls = App.data.archetypes.map((a) => {
        const p = a.members.map((t) => [x(L.pos[t][0]), y(L.pos[t][1])]);
        const hull = p.length > 2 ? d3.polygonHull(p) : p;
        const c = d3.polygonCentroid(p.length > 2 ? hull : p.concat(p));
        const grown = hull.map(([px, py]) => { const dx = px - c[0], dy = py - c[1], len = Math.hypot(dx, dy) || 1; return [px + (dx / len) * 20, py + (dy / len) * 20]; });
        return { a, d: d3.line().curve(d3.curveCatmullRomClosed.alpha(0.9))(grown) };
      });
      gHull.selectAll("path").data(hulls, (h) => h.a.id).join("path").attr("d", (h) => h.d)
        .attr("fill", (h) => h.a.color).attr("fill-opacity", 0.07).attr("stroke", (h) => h.a.color).attr("stroke-opacity", 0.32).attr("stroke-width", 1.5);
    }

    // ------------------------------------------------------------------ paint: everything that depends on state
    function focusSet() {
      if (state.team) return new Set([state.team, ...L.twins.near[state.team].slice(0, 3).map((n) => n.id)]);
      if (state.arch) return new Set(App.arch[state.arch].members);
      return null;
    }
    function paint(animate = true) {
      if (!L) return;
      const { x, y, pos, mpos } = L;
      const dur = animate ? DUR : 0;
      const focus = focusSet();
      const hoverArch = state.hover && state.hover.arch;
      const inFocus = (id) => (!focus || focus.has(id)) && (!hoverArch || App.team[id].archetype === hoverArch);

      d3.select("#clear-sel").attr("hidden", state.team || state.arch ? null : true)
        .text(state.team ? `✕ Clear ${App.team[state.team].name}` : state.arch ? `✕ Clear ${App.arch[state.arch].name.replace("The ", "")}` : "");
      d3.selectAll("#arch-tools .chip.arch").classed("on", (a) => a.id === state.arch).attr("aria-pressed", (a) => a.id === state.arch);
      bg.style("cursor", state.team || state.arch ? "zoom-out" : "default");

      gHull.selectAll("path").transition().duration(dur)
        .attr("opacity", (h) => ((state.arch || hoverArch) && h.a.id !== (hoverArch || state.arch) ? 0.2 : state.team ? 0.45 : 1));

      const dots = state.showMatches ? Object.keys(mpos) : [];
      gDots.selectAll("circle").data(dots, (k) => k).join(
        (enter) => enter.append("circle").attr("r", 0).attr("cx", (k) => x(mpos[k][0])).attr("cy", (k) => y(mpos[k][1]))
          .attr("fill", (k) => App.arch[App.team[App.tm[k].team_id].archetype].color)
          .call((e) => e.transition().duration(dur).attr("r", 3.2)),
        (update) => update.call((u) => u.transition().duration(dur).attr("cx", (k) => x(mpos[k][0])).attr("cy", (k) => y(mpos[k][1]))),
        (exit) => exit.call((e) => e.transition().duration(dur / 2).attr("r", 0).remove()))
        .attr("fill-opacity", (k) => (inFocus(App.tm[k].team_id) ? 0.4 : 0.1))
        .style("cursor", "pointer")
        .on("mousemove", (evt, k) => App.tip.show(tmTip(k), evt)).on("mouseleave", App.tip.hide)
        .on("click", (evt, k) => App.go(`#/match/${App.tm[k].match_id}`));

      gSel.selectAll("*").remove();
      gSelLabs.selectAll("*").remove();
      if (state.team) drawSelection(dur);

      const mk = gMarks.selectAll("g.t").data(App.teams, (t) => t.id).join((enter) => {
        const g = enter.append("g").attr("class", "t").attr("tabindex", 0).attr("role", "button")
          .attr("aria-label", (t) => `${t.name}, ${App.arch[t.archetype].name}`)
          .attr("transform", (t) => `translate(${x(pos[t.id][0])},${y(pos[t.id][1])})`).style("cursor", "pointer");
        g.append("circle").attr("class", "hit").attr("r", 15).attr("fill", "transparent");
        g.append("circle").attr("class", "ring").attr("r", 13).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 2).attr("opacity", 0);
        g.append("path").attr("class", "sym").attr("stroke", "#fff").attr("stroke-width", 2).attr("fill", (t) => App.arch[t.archetype].color);
        return g;
      });
      mk.on("mouseenter", (evt, t) => { state.hover = { team: t.id }; paintHover(); App.tip.show(teamTip(t.id), evt); })
        .on("mousemove", (evt) => App.tip.move(evt))
        .on("mouseleave", () => { state.hover = null; paintHover(); App.tip.hide(); })
        .on("click", (evt, t) => { evt.stopPropagation(); App.tip.hide(); setSelection({ team: state.team === t.id ? null : t.id, arch: null }); })
        .on("keydown", (evt, t) => { if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); setSelection({ team: state.team === t.id ? null : t.id, arch: null }); } });
      mk.transition().duration(dur).attr("transform", (t) => `translate(${x(pos[t.id][0])},${y(pos[t.id][1])})`)
        .attr("opacity", (t) => (inFocus(t.id) ? 1 : 0.18));
      mk.select(".sym").attr("d", (t) => App.symbol(t.archetype, t.id === state.team ? 320 : 150));
      mk.select(".ring").transition().duration(dur).attr("opacity", (t) => (t.id === state.team ? 1 : 0)).attr("r", (t) => (t.id === state.team ? 17 : 13));
      mk.filter((t) => t.id === state.team).raise();

      gLabs.selectAll("text").data(App.teams, (t) => t.id).join("text")
        .attr("text-anchor", "middle").attr("dominant-baseline", "central").attr("font-size", 10.5).attr("font-weight", 800).attr("fill", INK)
        .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 3).text((t) => t.id)
        .transition().duration(dur)
        .attr("x", (t) => L.labels[t.id][0]).attr("y", (t) => L.labels[t.id][1])
        .attr("opacity", (t) => (state.team ? (focus.has(t.id) ? 1 : 0) : inFocus(t.id) ? 1 : 0.15));

      paintHover();
      drawSide();
      paintHeat();
    }

    function drawSelection(dur) {
      const { x, y, pos, mpos } = L;
      const t = App.team[state.team];
      const [tx, ty] = [x(pos[t.id][0]), y(pos[t.id][1])];
      L.twins.near[t.id].slice(0, 3).forEach((n) => {
        gSel.append("line").attr("x1", tx).attr("y1", ty).attr("x2", tx).attr("y2", ty)
          .attr("stroke", INK).attr("stroke-width", 1.6).attr("stroke-dasharray", "2 5").attr("stroke-linecap", "round")
          .transition().duration(dur).attr("x2", x(pos[n.id][0])).attr("y2", y(pos[n.id][1]));
      });
      const color = App.arch[t.archetype].color;
      const pts = t.matches.map((k) => ({ k, x: x(mpos[k][0]), y: y(mpos[k][1]) }));
      const path = gSel.append("path").attr("d", d3.line().curve(d3.curveCatmullRom)(pts.map((p) => [p.x, p.y])))
        .attr("fill", "none").attr("stroke", color).attr("stroke-opacity", 0.55).attr("stroke-width", 2.2);
      const len = path.node().getTotalLength();
      path.attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len).transition().duration(dur * 1.6).attr("stroke-dashoffset", 0);
      const rings = gSel.selectAll("g.m").data(pts).join("g").attr("class", "m")
        .attr("transform", (p) => `translate(${p.x},${p.y})`).style("cursor", "pointer")
        .on("mousemove", (evt, p) => App.tip.show(tmTip(p.k), evt)).on("mouseleave", App.tip.hide)
        .on("click", (evt, p) => { evt.stopPropagation(); App.go(`#/match/${App.tm[p.k].match_id}`); });
      rings.append("circle").attr("r", 0).attr("fill", "#fff").attr("stroke", color).attr("stroke-width", 2.5)
        .transition().delay((p, i) => i * 60).duration(300).attr("r", 10);
      rings.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "central").attr("font-size", 10).attr("font-weight", 800)
        .attr("fill", INK).text((p, i) => i + 1);
      // match labels avoid each other, the rings and the focus markers; a leader line shows when a label moved away
      const labs = pts.map((p) => {
        const r = App.tm[p.k];
        const text = `${r.goals}–${r.goals_opp} v ${r.opp_id}`;
        return { ...p, text, w: text.length * 6.3 + 12, ax: p.x, ay: p.y - 20 };
      });
      labs.forEach((l) => { l.x = l.ax; l.y = l.ay; });
      const focus = focusSet();
      const fixed = App.teams.filter((tm) => focus.has(tm.id)).map((tm) => ({ fx: x(pos[tm.id][0]), fy: y(pos[tm.id][1]), w: 30 }))
        .concat(pts.map((p) => ({ fx: p.x, fy: p.y, w: 22 })));
      const sim = d3.forceSimulation(labs.concat(fixed))
        .force("x", d3.forceX((d) => d.ax ?? d.fx).strength((d) => (d.ax != null ? 0.22 : 0)))
        .force("y", d3.forceY((d) => d.ay ?? d.fy).strength((d) => (d.ax != null ? 0.22 : 0)))
        .force("c", d3.forceCollide((d) => d.w / 2 + 2).strength(0.9)).stop();
      for (let i = 0; i < 180; i++) sim.tick();
      const lg = gSelLabs.selectAll("g").data(labs).join("g").attr("opacity", 0);
      lg.append("line").attr("x1", (l) => l.ax).attr("y1", (l) => l.ay + 20).attr("x2", (l) => l.x).attr("y2", (l) => l.y)
        .attr("stroke", MUTED).attr("stroke-width", 1).attr("display", (l) => (Math.hypot(l.x - l.ax, l.y - l.ay) > 10 ? null : "none"));
      lg.append("rect").attr("x", (l) => l.x - l.w / 2).attr("y", (l) => l.y - 9).attr("width", (l) => l.w).attr("height", 18).attr("rx", 9)
        .attr("fill", "#fff").attr("stroke", "#e8e1d2");
      lg.append("text").attr("x", (l) => l.x).attr("y", (l) => l.y).attr("text-anchor", "middle").attr("dominant-baseline", "central")
        .attr("font-size", 11).attr("font-weight", 700).attr("fill", INK).text((l) => l.text);
      lg.transition().delay((l, i) => 200 + i * 60).duration(300).attr("opacity", 1);
    }

    function paintHover() {
      const h = state.hover && state.hover.team;
      gMarks.selectAll("g.t").select(".sym").attr("transform", (t) => (t.id === h ? "scale(1.4)" : null));
      gLabs.selectAll("text").filter((t) => t.id === h).interrupt().attr("opacity", 1);
      d3.select(heatEl).selectAll(".col-hi").attr("opacity", (id) => (id === h ? 1 : 0));
    }

    function teamTip(id) {
      const t = App.team[id];
      const z = L.space.team[id];
      const standout = state.dials.map((d, i) => [d, z[i]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2);
      return `<div class="tt-title">${App.esc(t.name)}</div><div class="tt-dim">${App.arch[t.archetype].name} · ${t.stage}</div>` +
        App.ttRows([["Record (W-D-L)", `${t.record.W}-${t.record.D}-${t.record.L}`], ["Goals for / against", `${t.gf} / ${t.ga}`],
          ...standout.map(([d, v]) => [d, `${App.signed(v, 1)} sd`])]) + `<div class="tt-dim" style="margin-top:4px">${t.id === state.team ? "Click to clear" : "Click to select"}</div>`;
    }
    function tmTip(k) {
      const r = App.tm[k];
      return `<div class="tt-title">${App.team[r.team_id].name} ${r.goals}–${r.goals_opp} ${App.team[r.opp_id].name}</div>` +
        `<div class="tt-dim">${r.stage} · click to replay</div>` +
        App.ttRows([["Possession", `${r.poss}%`], ["xG for / against", `${r.xg.toFixed(2)} / ${r.xga.toFixed(2)}`]]);
    }

    // ------------------------------------------------------------------ side panel
    function drawSide() {
      const side = d3.select("#side");
      if (state.team) {
        const t = App.team[state.team];
        const near = L.twins.near[t.id].slice(0, 4);
        side.html(`
          <div class="card">
            <button type="button" class="btn small ghost" id="back-all">← All teams</button>
            <div class="team-head" style="margin-top:12px">${App.flag(t.id, 46)}<div><h3>${App.esc(t.name)}</h3>${App.archPill(t.archetype)}</div></div>
            <div class="row" style="margin-top:12px;gap:16px">
              <div class="fact"><b>${t.record.W}-${t.record.D}-${t.record.L}</b><span>W-D-L</span></div>
              <div class="fact"><b>${App.signed(t.gd_per_match, 2)}</b><span>Goal diff / match</span></div>
              <div class="fact"><b style="font-size:16px">${t.stage}</b><span>Reached</span></div>
            </div>
            <p class="note" style="margin-top:10px">Numbered rings are ${App.esc(t.name)}'s ${t.n} matches in order; the line traces how its style moved from game to game.</p>
            <div class="row"><a class="btn small" href="#/team/${t.id}">Team page →</a><a class="btn small ghost" href="#/match/${App.tm[t.matches[t.matches.length - 1]].match_id}">Replay last match</a></div>
          </div>
          <div class="card">
            <h3>Closest style twins</h3>
            <div class="sub">More alike than this share of all team pairs. Hover to find them on the map; click to compare results.</div>
            <div class="twin-list">${near.map((n) => {
              const o = App.team[n.id];
              const gap = t.gd_per_match - o.gd_per_match;
              return `<a class="twin-item" data-id="${o.id}" href="#/twins/${t.id}/${o.id}">${App.flag(o.id, 28)}
                <div><b>${App.esc(o.name)}</b><div class="why">${Math.abs(gap) < 0.05 ? "Same results" : gap > 0 ? `${App.esc(t.name)} better by ${App.signed(gap, 2)}` : `${App.esc(o.name)} better by ${App.signed(-gap, 2)}`} GD/match</div></div>
                <span class="sim">${Math.round(n.sim * 100)}%</span></a>`;
            }).join("")}</div>
          </div>`);
      } else {
        const a = state.arch ? App.arch[state.arch] : null;
        side.html(a ? `
          <div class="card">
            <button type="button" class="btn small ghost" id="back-all">← All playstyles</button>
            <div class="row" style="margin-top:12px;flex-wrap:nowrap"><img src="${App.archArt(a.id)}" alt="" width="72" height="72" style="object-fit:contain"><div><h3>${a.name}</h3><div class="sub" style="margin:0">${a.tagline}</div></div></div>
            <div id="arch-fp" style="margin:10px 0"></div>
            <div class="twin-list">${a.members.map((id) => `<a class="twin-item" data-id="${id}" href="#/styles?team=${id}">${App.flag(id, 26)}<div><b>${App.esc(App.team[id].name)}</b><div class="why">${App.team[id].stage}</div></div><span class="sim">${App.signed(App.team[id].gd_per_match, 2)}</span></a>`).join("")}</div>
          </div>` : `
          <div class="card">
            <h3>How to read the map</h3>
            <div class="sub">Every team mixes possession, pressing, crossing and counter-attacking. We measure ten of these dials from FIFA's phase-of-play data and place each team by them.</div>
            <div class="callout"><b>Try:</b> select Spain, then switch a few dials off. If a twin survives every combination, the resemblance is real, not an artefact of one metric.</div>
          </div>
          <div class="card">
            <h3>Five playstyles</h3>
            <div class="sub">Hover to highlight, click to focus.</div>
            <div class="arch-list">${App.data.archetypes.map((x) => `<button type="button" class="arch-row-btn" data-arch="${x.id}">
              <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true"><path d="${App.symbol(x.id, 70)}" fill="${x.color}"/></svg>
              <span>${x.name}</span><span class="note">${x.members.length} teams</span></button>`).join("")}</div>
          </div>`);
        side.selectAll(".arch-row-btn")
          .on("click", function () { setSelection({ arch: this.dataset.arch, team: null }); })
          .on("mouseenter", function () { state.hover = { arch: this.dataset.arch }; paint(false); })
          .on("mouseleave", () => { state.hover = null; paint(false); });
        if (a) App.charts.miniFingerprint(document.getElementById("arch-fp"), App.dials.map((d) => a.centroid[d]), App.dials, { width: 280, height: 46 });
      }
      d3.select("#back-all").on("click", () => setSelection({ team: null, arch: null }));
      side.selectAll(".twin-item")
        .on("mouseenter", function () { state.hover = { team: this.dataset.id }; paintHover(); })
        .on("mouseleave", () => { state.hover = null; paintHover(); });
    }

    // ------------------------------------------------------------------ heatmap (linked to the map)
    const heatEl = document.getElementById("heat");
    function drawHeat() {
      heatEl.innerHTML = "";
      const order = App.data.archetypes.map((a) => ({ arch: a, ids: a.members.slice().sort((p, q) => L.pos[q][0] - L.pos[p][0]) }));
      const cols = order.flatMap((o) => o.ids);
      const labelW = 130, cell = Math.max(16, Math.min(24, (Math.max(heatEl.clientWidth, 900) - labelW - 40) / (cols.length + 4)));
      const gap = 8, rows = state.dials, top = 34;
      const W = labelW + cols.length * cell + (order.length - 1) * gap + 10, H = top + rows.length * cell + 44;
      const hs = d3.select(heatEl).append("svg").attr("width", W).attr("height", H);
      const color = d3.scaleLinear().domain([-2, 0, 2]).range(["#e8743b", "#f1ece2", "#0a9396"]).clamp(true);
      const xOf = {};
      let cx = labelW;
      order.forEach((o) => {
        hs.append("rect").attr("x", cx).attr("y", 6).attr("width", o.ids.length * cell - 2).attr("height", 6).attr("rx", 3).attr("fill", o.arch.color);
        hs.append("text").attr("x", cx).attr("y", 26).attr("font-size", 11.5).attr("font-weight", 800).attr("fill", INK)
          .text(o.ids.length * cell > 110 ? o.arch.name.replace("The ", "") : o.arch.name.replace("The ", "").slice(0, 7) + "…");
        o.ids.forEach((id) => { xOf[id] = cx; cx += cell; });
        cx += gap;
      });
      rows.forEach((d, r) => hs.append("text").attr("x", labelW - 8).attr("y", top + r * cell + cell / 2).attr("text-anchor", "end")
        .attr("dominant-baseline", "central").attr("font-size", 12).attr("font-weight", 600).attr("fill", INK).text(d));
      const colG = hs.selectAll("g.col").data(cols).join("g").attr("class", "col").style("cursor", "pointer");
      colG.each(function (id) {
        const g = d3.select(this);
        rows.forEach((d, r) => g.append("rect").attr("x", xOf[id] + 1).attr("y", top + r * cell + 1).attr("width", cell - 2).attr("height", cell - 2)
          .attr("rx", 3).attr("fill", color(L.space.team[id][r])));
      });
      colG.append("rect").attr("x", (id) => xOf[id]).attr("y", top - 4).attr("width", cell).attr("height", rows.length * cell + 44).attr("fill", "transparent");
      colG.append("rect").attr("class", "col-hi").attr("x", (id) => xOf[id] - 1).attr("y", top - 3).attr("width", cell + 2).attr("height", rows.length * cell + 6)
        .attr("rx", 5).attr("fill", "none").attr("stroke", MUTED).attr("stroke-width", 2).attr("opacity", 0);
      colG.append("rect").attr("class", "col-sel").attr("x", (id) => xOf[id] - 1).attr("y", top - 3).attr("width", cell + 2).attr("height", rows.length * cell + 6)
        .attr("rx", 5).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 2.2).attr("opacity", 0);
      colG.append("text").attr("transform", (id) => `translate(${xOf[id] + cell / 2},${top + rows.length * cell + 8}) rotate(-90)`)
        .attr("text-anchor", "end").attr("dominant-baseline", "central").attr("font-size", 10.5).attr("font-weight", 800).attr("fill", INK).text((id) => id);
      colG.on("mouseenter", (evt, id) => { state.hover = { team: id }; paintHover(); })
        .on("mousemove", (evt, id) => {
          const [, py] = d3.pointer(evt, hs.node());
          const r = Math.floor((py - top) / cell), d = rows[r];
          if (d) {
            const raw = d3.mean(App.team[id].matches, (k) => App.tm[k].dials[App.dials.indexOf(d)]);
            App.tip.show(`<div class="tt-title">${App.esc(App.team[id].name)} · ${d}</div><div class="tt-dim">${App.dialInfo[d].label}</div>` +
              App.ttRows([["Team average", App.fix(raw, 1)], ["vs. tournament", `${App.signed(L.space.team[id][r], 1)} sd`]]), evt);
          } else App.tip.show(`<div class="tt-title">${App.esc(App.team[id].name)}</div><div class="tt-dim">Click to select</div>`, evt);
        })
        .on("mouseleave", () => { state.hover = null; paintHover(); App.tip.hide(); })
        .on("click", (evt, id) => {
          App.tip.hide();
          setSelection({ team: id, arch: null });
          window.scrollTo({ top: mapEl.getBoundingClientRect().top + window.scrollY - 160, behavior: "smooth" });
        });
      paintHeat();
    }
    function paintHeat() {
      const focus = focusSet();
      d3.select(heatEl).selectAll("g.col").attr("opacity", (id) => (!focus || focus.has(id) ? 1 : 0.35));
      d3.select(heatEl).selectAll(".col-sel").attr("opacity", (id) => (id === state.team ? 1 : 0));
    }

    relayout(false);
    App.onResize(mapEl, () => relayout(false));
    App.onViewport(() => relayout(false));

    return {
      update(p) {
        readParams(p);
        App.tip.hide();
        paint(true);
      },
    };
  };
})();
