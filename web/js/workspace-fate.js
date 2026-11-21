/* Panel 5: Why Did Their Fates Differ?
 * Overview: twins vs dissimilar pairs on a shared zero baseline, plus a data-driven list of twin pairs
 * with signed (diverging, unclamped) contributions.
 * Pair selected: six-component tug-of-war + match evidence (Matches beads | cumulative Timeline). */
(function () {
  "use strict";
  const App = window.App;
  const A = App.analysis;
  const esc = App.esc;
  const C = {
    a: "#24639a",
    b: "#b44e32",
    structure: "#9aa7ae",
    structureStroke: "#84929a",
    chances: "#1c736f",
    finishing: "#e2a930",
    goldInk: "#9c6607",
    ink: "#24333a",
    ink2: "#495961",
    muted: "#5c6a70",
    line: "#dbe1dd",
  };
  const BUCKETS = [
    { id: "structure", label: "Style & Opponents", short: "Style", sub: "Playing style + opponent strength", color: C.structure, ink: C.ink, comps: ["c_style", "c_opp"] },
    { id: "chances", label: "Chance Quality", short: "Chances", sub: "xG created & xG prevented", color: C.chances, ink: "#ffffff", comps: ["c_create", "c_prevent"] },
    { id: "finishing", label: "Finishing & Keeping", short: "Finishing", sub: "Goals vs xG: finishing & saves", color: C.finishing, ink: C.ink, comps: ["c_finish", "c_keep"] },
  ];
  const COMP_BUCKET = {
    c_style: "structure",
    c_opp: "structure",
    c_create: "chances",
    c_prevent: "chances",
    c_finish: "finishing",
    c_keep: "finishing",
  };
  const COMP_FORMULA = {
    c_style: "Estimated net xG from playing style",
    c_opp: "Adjustment for opponents' tournament strength",
    c_create: "Actual xG created minus style-predicted xG",
    c_prevent: "Style-predicted xG allowed minus actual xG allowed",
    c_finish: "Goals scored minus xG created",
    c_keep: "xG allowed minus goals conceded",
  };

  function pairBreakdown(pairList, summaries) {
    if (!pairList.length) return null;
    const sum = { structure: 0, chances: 0, finishing: 0, gap: 0 };
    for (const p of pairList) {
      const sa = summaries[p.a], sb = summaries[p.b];
      if (!sa || !sb) continue;
      const [hi, lo] = sa.gd >= sb.gd ? [sa, sb] : [sb, sa];
      const st = (hi.model.c_style - lo.model.c_style) + (hi.model.c_opp - lo.model.c_opp);
      const ch = (hi.model.c_create - lo.model.c_create) + (hi.model.c_prevent - lo.model.c_prevent);
      const fi = (hi.model.c_finish - lo.model.c_finish) + (hi.model.c_keep - lo.model.c_keep);
      sum.structure += st;
      sum.chances += ch;
      sum.finishing += fi;
      sum.gap += hi.gd - lo.gd;
    }
    const n = pairList.length;
    const meanGap = sum.gap / n;
    const vals = { structure: sum.structure / n, chances: sum.chances / n, finishing: sum.finishing / n };
    return { n, meanGap, vals };
  }

  App.workspaceFate = function (bodyHost, ctrlHost, { selectComp, selectMatch, choosePair, choose, highlight, setScope }) {
    let viewMode = "beads";          // "beads" | "timeline"
    let currentModel = null;
    let lastSelectedComp = null;

    function collectOverviewPairs(model) {
      const { visible, nearByTeam, summaries, state } = model;
      const visSet = new Set(visible);
      const region = state.pairRegion;
      const all = [];
      for (const a of visSet) {
        for (const n of nearByTeam[a] || []) {
          const b = n.id;
          if (a >= b || !visSet.has(b)) continue;
          const ga = summaries[a]?.gd, gb = summaries[b]?.gd;
          if (!Number.isFinite(n.sim) || !Number.isFinite(ga) || !Number.isFinite(gb)) continue;
          const sim = n.sim * 100;
          const gap = Math.abs(ga - gb);
          if (region && (sim < region[0] || sim > region[1] || gap < region[2] || gap > region[3])) continue;
          all.push({ a, b, sim, gap });
        }
      }
      const star = all.filter((p) => p.sim >= 90 && p.gap >= 1.0);
      const dissim = all.filter((p) => p.sim < 50 && p.gap >= 1.0);
      let target = star, cohortName = `${star.length} ★ style-twin pairs`;
      if (star.length < 3) {
        const sim90 = all.filter((p) => p.sim >= 90);
        if (sim90.length >= 2) { target = sim90; cohortName = `${sim90.length} similar pairs (≥90%)`; }
        else { target = all; cohortName = `${all.length} visible pairs`; }
      }
      target = [...target].sort((u, v) => v.sim - u.sim || v.gap - u.gap);
      return {
        targetStats: pairBreakdown(target, summaries),
        dissimStats: pairBreakdown(dissim, summaries),
        targetPairs: target,
        cohortName,
        starCount: star.length,
      };
    }

    function renderOverview(model) {
      const { targetStats, dissimStats, targetPairs, cohortName, starCount } = collectOverviewPairs(model);
      if (ctrlHost) ctrlHost.innerHTML = `<span class="ws2-badge-pill">${esc(cohortName)}</span>`;

      if (!targetStats) {
        bodyHost.innerHTML = `<div class="wf2-empty"><p>Select at least two teams with matches in this scope to analyze goal-difference gaps.</p></div>`;
        return;
      }
      const { vals, n, meanGap } = targetStats;
      const allChartVals = BUCKETS.flatMap((b) => [vals[b.id], dissimStats ? dissimStats.vals[b.id] : 0]);
      const minV = Math.min(0, ...allChartVals);
      const maxV = Math.max(0.4, ...allChartVals);
      const span = Math.max(0.6, maxV - minV);
      const zeroPct = ((-minV) / span) * 100;
      const barStyle = (v) => {
        const w = (Math.abs(v) / span) * 100;
        const l = v >= 0 ? zeroPct : zeroPct - w;
        return `left:${Math.max(0, l).toFixed(1)}%;width:${Math.max(0.6, Math.min(100 - l, w)).toFixed(1)}%`;
      };

      const alignedRowHtml = (b) => {
        const tv = vals[b.id];
        const dv = dissimStats ? dissimStats.vals[b.id] : null;
        return `
          <div class="wf2-ab-row">
            <span class="wf2-ab-lbl"><i style="background:${b.color}"></i><span><b>${esc(b.label)}</b><small>${esc(b.sub)}</small></span></span>
            <div class="wf2-ab-tracks">
              <i class="wf2-ab-zero" style="left:${zeroPct.toFixed(1)}%"></i>
              <div class="wf2-ab-track"><i class="wf2-ab-fill" style="${barStyle(tv)};background:${b.color}"></i></div>
              ${dv !== null ? `<div class="wf2-ab-track is-dissim"><i class="wf2-ab-fill is-dissim" style="${barStyle(dv)}"></i></div>` : ""}
            </div>
            <span class="wf2-ab-num" translate="no"><b>${App.signed(tv, 2)}</b>${dv !== null ? `<small>${App.signed(dv, 2)}</small>` : ""}</span>
          </div>`;
      };

      // Pair rows come only from the data-driven cohort (largest gaps first), never from author-picked pairs.
      const cases = [...targetPairs]
        .sort((u, v) => v.gap - u.gap || v.sim - u.sim)
        .map((p) => {
          const sa = model.summaries[p.a], sb = model.summaries[p.b];
          const [hi, lo] = sa.gd >= sb.gd ? [p.a, p.b] : [p.b, p.a];
          const [sh, sl] = hi === p.a ? [sa, sb] : [sb, sa];
          const d = (k) => sh.model[k] - sl.model[k];
          const parts = { structure: d("c_style") + d("c_opp"), chances: d("c_create") + d("c_prevent"), finishing: d("c_finish") + d("c_keep") };
          const top = BUCKETS.map((b) => [b, parts[b.id]]).sort((u, v) => v[1] - u[1])[0];
          return { hi, lo, sim: p.sim, gap: p.gap, parts, top };
        });
      const caseSpan = Math.max(0.5, ...cases.map((c) => {
        const pos = BUCKETS.reduce((s, b) => s + Math.max(0, c.parts[b.id]), 0);
        const neg = BUCKETS.reduce((s, b) => s + Math.max(0, -c.parts[b.id]), 0);
        return Math.max(pos, neg);
      }));
      // Diverging stack: positive parts grow right of zero, negative parts grow left. Nothing is clamped.
      const ZERO = 28;
      const caseBar = (c) => {
        let right = 0, left = 0;
        return BUCKETS.map((b) => {
          const v = c.parts[b.id];
          const w = (Math.abs(v) / caseSpan) * (v >= 0 ? 100 - ZERO : ZERO);
          const l = v >= 0 ? ZERO + right : ZERO - left - w;
          if (v >= 0) right += w; else left += w;
          return `<i style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%;background:${b.color}"></i>`;
        }).join("") + `<u style="left:${ZERO}%"></u>`;
      };
      const caseRowHtml = (c) => `
        <li class="wf2-case-row" data-try="${c.hi}-${c.lo}" tabindex="0">
          <span class="wf2-case-teams">
            ${App.flag(c.hi, 15)}<b>${esc(App.team[c.hi].name)}</b>
            <span class="tw2-vs">vs</span>
            ${App.flag(c.lo, 15)}<b>${esc(App.team[c.lo].name)}</b>
          </span>
          <span class="wf2-case-meta" translate="no">${App.fix(c.sim, 1)}%</span>
          <span class="wf2-case-meta is-gap" translate="no">${App.fix(c.gap, 2)}</span>
          <span class="wf2-case-bar" aria-hidden="true">${caseBar(c)}</span>
          <span class="wf2-case-driver is-${c.top[0].id}">${esc(c.top[0].short)}</span>
        </li>`;

      const st = vals.structure;
      const dst = dissimStats ? dissimStats.vals.structure : null;
      bodyHost.innerHTML = `
        <div class="wf2-overview">
          <div class="wf2-takeaway">
            <p class="wf2-headline">${starCount >= 3
              ? `Style twins: style &amp; opponents explain <strong>${App.signed(st, 2)}</strong> of a <strong>${App.fix(meanGap, 2)}</strong> goal gap per match.`
              : `Style &amp; opponents explain <strong>${App.signed(st, 2)}</strong> of a <strong>${App.fix(meanGap, 2)}</strong> goal gap per match.`}</p>
            ${dst !== null ? `<p class="wf2-sub">Teams that play differently (&lt;50% similar, same ≥1.0 gap): <b>${App.signed(dst, 2)}</b> of <b>${App.fix(dissimStats.meanGap, 2)}</b> · ${dissimStats.n} pairs</p>` : ""}
          </div>

          <div class="wf2-ab-chart" role="group" aria-label="Contribution to the goal gap per match">
            <div class="wf2-ab-head">
              <span>Contribution to the gap (goals per match)</span>
              <span class="wf2-ab-keys"><span><i class="is-twin-key"></i>Twins ≥90% (${n})</span>${dissimStats ? `<span><i class="is-dissim-key"></i>Dissimilar &lt;50% (${dissimStats.n})</span>` : ""}</span>
            </div>
            ${BUCKETS.map(alignedRowHtml).join("")}
          </div>

          <div class="wf2-cases">
            <div class="wf2-cases-head">
              <span>Better team first</span><span>Sim.</span><span>Gap</span><span>Contribution (0 = no effect)</span><span>Main driver</span>
            </div>
            <ol class="wf2-cases-list">${cases.map(caseRowHtml).join("")}</ol>
          </div>
        </div>`;

      bodyHost.querySelectorAll("[data-try]").forEach((row) => {
        const [x, y] = row.dataset.try.split("-");
        row.onclick = () => choosePair(x, y);
        row.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choosePair(x, y); } };
        row.onpointerenter = row.onfocus = () => highlight?.([x, y]);
        row.onpointerleave = row.onblur = () => highlight?.(null);
      });
    }

    function renderPair(model) {
      const { state, summaries, near } = model;
      const teamA = state.team;
      const isAutoTwin = !state.compare;
      const teamB = state.compare || near[0]?.id;

      if (!teamB || !summaries[teamA] || !summaries[teamB]) {
        bodyHost.innerHTML = `<div class="wf2-empty"><p>No comparison team available in this scope.</p></div>`;
        return;
      }

      const sumA = summaries[teamA], sumB = summaries[teamB];
      const gapModel = A.outcomeGap(sumA, sumB);
      const query = A.query(state.dials, { scope: state.scope, return: location.hash });

      if (ctrlHost) {
        ctrlHost.innerHTML = `
          <div class="wf2-seg" role="group" aria-label="Evidence view">
            <button type="button" data-vmode="beads" aria-pressed="${viewMode === "beads"}">By match</button>
            <button type="button" data-vmode="timeline" aria-pressed="${viewMode === "timeline"}">Timeline</button>
          </div>
          <a class="ws2-ext-link" href="#/twins/${teamA}/${teamB}${query}" title="Full multi-section pair report">Report ↗</a>
          <a class="ws2-ext-link" href="#/robustness/${teamA}/${teamB}${query}" title="Test sensitivity to removing metrics or matches">Audit ↗</a>`;
        ctrlHost.querySelectorAll("[data-vmode]").forEach((btn) => {
          btn.onclick = () => {
            viewMode = btn.dataset.vmode;
            render(currentModel);
          };
        });
      }

      if (gapModel.status !== "ok") {
        const missingName = !sumA.n ? App.team[teamA].name : App.team[teamB].name;
        bodyHost.innerHTML = `
          <div class="wf2-empty">
            <p>${esc(missingName)} has no matches in the selected scope.</p>
            <button type="button" class="ws2-mini-btn" data-act="full-scope">Switch to Full tournament</button>
          </div>`;
        bodyHost.querySelector('[data-act="full-scope"]').onclick = () => setScope("all");
        return;
      }

      const steps = gapModel.steps;
      const comps = steps.slice(0, 6);
      const totalStep = steps[6];
      const maxAbs = Math.max(0.25, ...steps.map((s) => Math.abs(s.value)));

      const validCompIds = comps.map((c) => c.id);
      let activeComp = validCompIds.includes(state.comp) ? state.comp : null;
      if (!activeComp) {
        activeComp = [...comps].sort((u, v) => Math.abs(v.value) - Math.abs(u.value))[0].id;
      }
      lastSelectedComp = activeComp;

      const sbHtml = `
        <div class="wf2-scoreboard">
          <div class="wf2-sb-side is-a">
            <b class="dna-badge is-a" translate="no">A</b>${App.flag(teamA, 15)}
            <strong>${esc(App.team[teamA].name)}</strong>
            <span>${App.signed(sumA.gd, 2)}/m · ${sumA.n}m</span>
          </div>
          <span class="wf2-sb-vs">vs</span>
          <div class="wf2-sb-side is-b">
            <b class="dna-badge is-b" translate="no">B</b>${App.flag(teamB, 15)}
            <strong>${esc(App.team[teamB].name)}</strong>
            <span>${App.signed(sumB.gd, 2)}/m · ${sumB.n}m</span>
            ${isAutoTwin ? `<span class="wf2-auto-tag">#1 twin</span><button type="button" class="ws2-mini-btn" data-act="pin-b">Pin B</button>` : ""}
          </div>
          <div class="wf2-sb-gap"><span>Gap (A−B)</span><strong>${App.signed(totalStep.value, 2)}</strong></div>
        </div>`;

      const tugRowHtml = (step, isTotal = false, splitAbove = false) => {
        const pct = (Math.abs(step.value) / maxAbs) * 50;
        const pos = step.value >= 0;
        const leftPct = pos ? 50 : 50 - pct;
        const bucket = COMP_BUCKET[step.id] || "total";
        const isSel = step.id === activeComp;
        const barCls = isTotal ? "is-total" : pos ? "is-a" : "is-b";
        return `
          <button type="button" class="wf2-tug-row bkt-${bucket} ${splitAbove ? "has-bkt-sep" : ""} ${isTotal ? "is-total" : ""} ${isSel ? "is-active" : ""}" data-comp="${step.id}" aria-pressed="${isSel}" ${isTotal ? "disabled" : ""}>
            <span class="wf2-tug-lbl">${esc(isTotal ? "Observed GD gap" : step.label)}</span>
            <span class="wf2-tug-track" aria-hidden="true">
              <i class="wf2-grid-q is-25"></i><i class="wf2-zero"></i><i class="wf2-grid-q is-75"></i>
              <i class="wf2-bar ${barCls}" style="left:${leftPct.toFixed(2)}%;width:${Math.max(0.5, pct).toFixed(2)}%"></i>
            </span>
            <span class="wf2-tug-sides" translate="no">${App.signed(step.left, 1)}/${App.signed(step.right, 1)}</span>
            <strong class="wf2-tug-val ${pos ? "is-pos" : "is-neg"}" translate="no">${App.signed(step.value, 2)}</strong>
          </button>`;
      };

      const tugHtml = `
        <div class="wf2-tug">
          <div class="wf2-tug-axis">
            <span></span>
            <div class="wf2-tug-ends">
              <span class="is-b">← Favors ${esc(teamB)}</span>
              <span>0</span>
              <span class="is-a">Favors ${esc(teamA)} →</span>
            </div>
            <span class="wf2-tug-sides-hdr" translate="no">A / B</span>
            <span>A − B</span>
          </div>
          ${comps.map((s, i) => tugRowHtml(s, false, i === 2 || i === 4)).join("")}
          ${tugRowHtml(totalStep, true, false)}
        </div>`;

      const activeStep = comps.find((c) => c.id === activeComp);
      const pinnedMatch = state.match ? A.records.find((r) => r.key === state.match) : null;

      bodyHost.innerHTML = `
        <div class="wf2-pair-wrap">
          ${sbHtml}
          ${tugHtml}
          <div class="wf2-evidence" id="wf2-evidence">
            <div class="wf2-ev-head">
              <div><strong>${esc(viewMode === "timeline" ? "Cumulative xGD vs. GD (G1..Gn)" : activeStep.label)}</strong><span class="sm-sep">·</span><span>${esc(viewMode === "timeline" ? "Dashed = expected xGD · Solid = actual GD · Shaded = finishing residual" : (COMP_FORMULA[activeComp] || ""))}</span></div>
              <div class="wf2-ev-means" translate="no">
                ${viewMode === "beads" ? `<span class="wf2-shape-key">● W ○ D ◆ L</span>` : ""}
                <span><b>${teamA}</b> ${App.signed(activeStep.left, 2)}</span><span><b>${teamB}</b> ${App.signed(activeStep.right, 2)}</span>
              </div>
            </div>
            ${viewMode === "beads" ? `<div class="wf2-beads-host" id="wf2-beads"></div>` : `<div class="wf2-beads-host" id="wf2-timeline"></div>`}
            <div class="wf2-match-bar" id="wf2-match-bar"></div>
          </div>
        </div>`;

      const pinBtn = bodyHost.querySelector('[data-act="pin-b"]');
      if (pinBtn) pinBtn.onclick = () => choosePair(teamA, teamB);

      bodyHost.querySelectorAll(".wf2-tug-row[data-comp]:not([disabled])").forEach((btn) => {
        btn.onclick = () => selectComp(btn.dataset.comp);
      });

      const rowsA = A.rows(teamA, state.scope).sort((u, v) => u.number - v.number);
      const rowsB = A.rows(teamB, state.scope).sort((u, v) => u.number - v.number);
      const allRows = [
        ...rowsA.map((r) => ({ row: r, side: "A", val: A.metric(r, activeComp) })),
        ...rowsB.map((r) => ({ row: r, side: "B", val: A.metric(r, activeComp) })),
      ].filter((item) => Number.isFinite(item.val));

      if (viewMode === "beads") {
        drawBeads(bodyHost.querySelector("#wf2-beads"), allRows, teamA, teamB, activeStep, pinnedMatch);
      } else {
        drawTimeline(bodyHost.querySelector("#wf2-timeline"), rowsA, rowsB, teamA, teamB, pinnedMatch);
      }
      renderMatchBar(bodyHost.querySelector("#wf2-match-bar"), pinnedMatch, state);
    }

    function drawBeads(host, items, teamA, teamB, step, pinnedMatch) {
      if (!host) return;
      const W = Math.max(260, host.clientWidth || 540);
      const H = Math.max(88, Math.min(114, host.clientHeight || 96));
      const m = { t: 11, r: 22, b: 22, l: 54 };
      const maxVal = Math.max(0.5, ...items.map((d) => Math.abs(d.val)));
      const x = d3.scaleLinear().domain([-maxVal * 1.12, maxVal * 1.12]).nice(4).range([m.l, W - m.r]);
      const yA = m.t + (H - m.t - m.b) * 0.28;
      const yB = m.t + (H - m.t - m.b) * 0.72;

      host.replaceChildren();
      const svg = d3.select(host).append("svg")
        .attr("class", "wf2-beads-svg")
        .attr("viewBox", `0 0 ${W} ${H}`)
        .attr("role", "img")
        .attr("aria-label", `${step.label} across individual matches`);

      // Vertical tick gridlines + tracks + zero line
      x.ticks(5).forEach((t) => {
        svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", m.t - 2).attr("y2", H - m.b + 2)
          .attr("stroke", t === 0 ? C.ink : "#eef1ee")
          .attr("stroke-opacity", t === 0 ? 0.38 : 1)
          .attr("stroke-dasharray", t === 0 ? "3 2" : "none");
        svg.append("text").attr("class", "wf2-bead-tick")
          .attr("x", x(t)).attr("y", H - 5).attr("text-anchor", "middle")
          .text(App.fix(t, t % 1 ? 1 : 0));
      });
      svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", yA).attr("y2", yA).attr("stroke", C.line);
      svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", yB).attr("y2", yB).attr("stroke", C.line);

      [[teamA, yA, C.a], [teamB, yB, C.b]].forEach(([id, cy, col]) => {
        svg.append("text").attr("class", "wf2-bead-team").attr("translate", "no")
          .attr("x", 6).attr("y", cy + 4).attr("fill", col).text(id);
      });

      // Deterministic collision offset + uniform constant radius (r = 4.6)
      const placed = { A: [], B: [] };
      const R = 4.6;
      const coords = items.map((item) => {
        const cx = x(item.val);
        let cy = item.side === "A" ? yA : yB;
        const nearSame = placed[item.side].filter((p) => Math.abs(p.cx - cx) < 11);
        if (nearSame.length) cy += (nearSame.length % 2 ? -1 : 1) * Math.min(9, 4.2 * Math.ceil(nearSame.length / 2));
        placed[item.side].push({ cx, cy });
        return { ...item, cx, cy, r: R };
      });

      // Mean ticks above track
      [[step.left, yA, C.a], [step.right, yB, C.b]].forEach(([meanVal, cy, col]) => {
        if (!Number.isFinite(meanVal)) return;
        svg.append("line").attr("x1", x(meanVal)).attr("x2", x(meanVal)).attr("y1", cy - 9).attr("y2", cy + 9)
          .attr("stroke", col).attr("stroke-width", 2).attr("stroke-opacity", 0.65).attr("pointer-events", "none");
      });

      const beadPath = (d) => {
        if (d.row.result === "L") return d3.symbol(d3.symbolDiamond, 66)();
        return d3.symbol(d3.symbolCircle, 66)();
      };

      const beads = svg.selectAll("path.wf2-bead")
        .data(coords)
        .join("path")
        .attr("class", (d) => `wf2-bead ${pinnedMatch?.key === d.row.key ? "is-pinned" : ""}`)
        .attr("data-record", (d) => d.row.key)
        .attr("transform", (d) => `translate(${d.cx},${d.cy})`)
        .attr("d", beadPath)
        .attr("fill", (d) => d.row.result === "D" ? "#ffffff" : (d.side === "A" ? C.a : C.b))
        .attr("fill-opacity", (d) => (pinnedMatch?.key === d.row.key || d.row.result === "D" ? 1 : 0.85))
        .attr("stroke", (d) => {
          if (pinnedMatch?.key === d.row.key) return C.ink;
          return d.row.result === "D" ? (d.side === "A" ? C.a : C.b) : "#ffffff";
        })
        .attr("stroke-width", (d) => (pinnedMatch?.key === d.row.key ? 2.2 : d.row.result === "D" ? 2.0 : 1.1));

      beads.on("pointerenter", (e, d) => {
        const r = d.row;
        highlight?.([r.team_id, r.opp_id]);
        App.tip.show(
          `<div class="tt-title">M${r.number} · ${esc(App.team[r.team_id].name)} ${r.goals}–${r.goals_opp} ${esc(App.team[r.opp_id].name)}</div>` +
          `<div class="tt-dim">${esc(r.stage)} · xG ${App.fix(r.xg, 2)} vs ${App.fix(r.xga, 2)}</div>` +
          App.ttRows([[step.label, App.signed(d.val, 2)]]) +
          `<div class="tt-dim" style="margin-top:4px">Click to locate on Style Map &amp; open Match Lab</div>`,
          e
        );
      }).on("pointermove", (e) => App.tip.move(e))
        .on("pointerleave", () => { highlight?.(null); App.tip.hide(); })
        .on("click", (e, d) => {
          e.stopPropagation();
          App.tip.hide();
          selectMatch(d.row.key === pinnedMatch?.key ? null : d.row.key);
        });

      // Label largest outlier + pinned bead
      const outlier = [...coords].sort((u, v) => Math.abs(v.val) - Math.abs(u.val))[0];
      const toLabel = [outlier, coords.find((d) => d.row.key === pinnedMatch?.key)].filter(Boolean);
      const labeledKeys = new Set();
      for (const d of toLabel) {
        if (labeledKeys.has(d.row.key)) continue;
        labeledKeys.add(d.row.key);
        const anchor = d.cx > W - m.r - 68 ? "end" : d.cx < m.l + 68 ? "start" : "middle";
        const lx = anchor === "end" ? d.cx - 8 : anchor === "start" ? d.cx + 8 : d.cx;
        const ly = d.side === "A" ? Math.max(10, d.cy - 8) : Math.min(H - m.b - 2, d.cy + 13);
        svg.append("text").attr("class", "wf2-bead-lbl").attr("translate", "no")
          .attr("x", lx).attr("y", ly).attr("text-anchor", anchor)
          .text(`v ${d.row.opp_id} ${App.signed(d.val, 2)}`);
      }
    }

    function buildCumulativeSeries(rows) {
      let cXgd = 0, cGd = 0;
      return rows.map((r, i) => {
        cXgd += (r.xg ?? 0) - (r.xga ?? 0);
        cGd += (r.goals ?? 0) - (r.goals_opp ?? 0);
        return {
          round: i + 1,
          row: r,
          cumXgd: cXgd,
          cumGd: cGd,
          fin: (r.decomp?.[4] ?? 0) + (r.decomp?.[5] ?? 0),
        };
      });
    }

    function drawTimeline(host, rowsA, rowsB, teamA, teamB, pinnedMatch) {
      if (!host) return;
      const sA = buildCumulativeSeries(rowsA);
      const sB = buildCumulativeSeries(rowsB);
      const maxR = Math.max(1, sA.length, sB.length);
      const allY = [0, ...sA.flatMap((d) => [d.cumXgd, d.cumGd]), ...sB.flatMap((d) => [d.cumXgd, d.cumGd])];
      const [yLo, yHi] = d3.extent(allY);
      const pad = Math.max(0.8, (yHi - yLo) * 0.14);

      const W = Math.max(260, host.clientWidth || 540);
      const H = Math.max(96, Math.min(126, host.clientHeight || 108));
      const m = { t: 10, r: 44, b: 20, l: 34 };
      const x = d3.scaleLinear().domain([0.8, maxR + 0.15]).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([yLo - pad, yHi + pad]).range([H - m.b, m.t]);

      host.replaceChildren();
      const svg = d3.select(host).append("svg")
        .attr("class", "wf2-beads-svg")
        .attr("viewBox", `0 0 ${W} ${H}`)
        .attr("role", "img")
        .attr("aria-label", "Round by round cumulative expected versus actual goal difference");

      y.ticks(4).forEach((t) => {
        svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(t)).attr("y2", y(t))
          .attr("stroke", t === 0 ? C.ink : "#eef1ee").attr("stroke-opacity", t === 0 ? 0.35 : 1)
          .attr("stroke-dasharray", t === 0 ? "3 2" : "none");
        svg.append("text").attr("class", "wf2-bead-tick").attr("x", m.l - 5).attr("y", y(t) + 3).attr("text-anchor", "end")
          .text(App.signed(t, 0));
      });
      for (let g = 1; g <= maxR; g++) {
        svg.append("text").attr("class", "wf2-bead-tick").attr("x", x(g)).attr("y", H - 4).attr("text-anchor", "middle").text(`G${g}`);
      }

      const lineX = d3.line().x((d) => x(d.round)).y((d) => y(d.cumXgd));
      const lineG = d3.line().x((d) => x(d.round)).y((d) => y(d.cumGd));
      const area = d3.area().x((d) => x(d.round)).y0((d) => y(d.cumXgd)).y1((d) => y(d.cumGd));

      [[sA, C.a, teamA], [sB, C.b, teamB]].forEach(([series, col, id]) => {
        if (!series.length) return;
        svg.append("path").attr("d", area(series)).attr("fill", col).attr("fill-opacity", 0.13);
        svg.append("path").attr("d", lineX(series)).attr("fill", "none").attr("stroke", col).attr("stroke-width", 1.3).attr("stroke-dasharray", "3 2").attr("stroke-opacity", 0.72);
        svg.append("path").attr("d", lineG(series)).attr("fill", "none").attr("stroke", col).attr("stroke-width", 2.1);
        const last = series.at(-1);
        svg.append("text").attr("class", "wf2-bead-team").attr("x", x(last.round) + 5).attr("y", y(last.cumGd) + 3).attr("fill", col)
          .text(`${id} ${App.signed(last.cumGd, 1)}`);

        svg.selectAll(null).data(series).join("circle")
          .attr("cx", (d) => x(d.round)).attr("cy", (d) => y(d.cumGd))
          .attr("r", (d) => pinnedMatch?.key === d.row.key ? 5.2 : 3.6)
          .attr("fill", (d) => pinnedMatch?.key === d.row.key ? C.ink : col)
          .attr("stroke", "#ffffff").attr("stroke-width", 1.2)
          .style("cursor", "pointer")
          .on("pointerenter", (e, d) => {
            highlight?.([d.row.team_id, d.row.opp_id]);
            App.tip.show(
              `<div class="tt-title">G${d.round} · M${d.row.number} ${esc(d.row.team_id)} ${d.row.goals}–${d.row.goals_opp} ${esc(d.row.opp_id)}</div>` +
              App.ttRows([["Cum. xGD", App.signed(d.cumXgd, 2)], ["Cum. actual GD", App.signed(d.cumGd, 2)], ["Match Fin+Keep", App.signed(d.fin, 2)]]),
              e
            );
          }).on("pointermove", (e) => App.tip.move(e))
          .on("pointerleave", () => { highlight?.(null); App.tip.hide(); })
          .on("click", (e, d) => { e.stopPropagation(); App.tip.hide(); selectMatch(d.row.key === pinnedMatch?.key ? null : d.row.key); });
      });
    }

    function renderMatchBar(host, pinnedMatch, state) {
      if (!host) return;
      if (!pinnedMatch) {
        host.innerHTML = `<span class="wf2-bar-hint">Click any match node to locate it on Style Map and open Match Lab.</span>`;
        return;
      }
      const r = pinnedMatch;
      const ret = encodeURIComponent(location.hash);
      host.innerHTML = `
        <span class="wf2-pinned-info">${App.flag(r.team_id, 13)}<b>M${r.number}</b> ${esc(r.team_id)} ${r.goals}–${r.goals_opp} ${esc(App.team[r.opp_id].name)} (${esc(App.stageShort(r.stage))})</span>
        <span class="wf2-pinned-actions">
          <a href="#/match/${r.match_id}?return=${ret}">Replay ↗</a>
          <a href="#/lab/${r.match_id}?team=${r.team_id}&return=${ret}">Match Lab ↗</a>
          <button type="button" class="ws2-mini-btn" data-act="unpin-match" aria-label="Unpin match">×</button>
        </span>`;
      host.querySelector('[data-act="unpin-match"]').onclick = () => selectMatch(null);
      void state;
    }

    function render(model) {
      currentModel = model;
      if (!model.state.team) renderOverview(model);
      else renderPair(model);
    }

    function redraw() {
      if (!currentModel || !bodyHost.isConnected) return;
      if (currentModel.state.team) renderPair(currentModel);
    }

    return {
      render,
      redraw,
      activeComp: () => lastSelectedComp,
      setViewMode(m) { viewMode = m; },
    };
  };
})();
