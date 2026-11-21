/* Panel 3: Style DNA — Full-48 TableLens Matrix + Diverging Bars + Parallel Coordinates.
 * Supports 3-zone schematic pitch strip, Yang '03 similarity column ordering,
 * outcome columns (xGD/m, GD/m, LineUp score), sticky A/B/A-B focus rows, and FLIP reorder. */
(function () {
  "use strict";
  const App = window.App;
  const A = App.analysis;
  const esc = App.esc;
  const zColor = d3.scaleLinear().domain([-2, 0, 2]).range(["#9b5f1e", "#f7f6f1", "#1c736f"]).clamp(true);
  const PITCH_ORDER = [1, 7, 0, 2, 3, 6, 8, 9, 4, 5]; // Own Box (2) | Midfield (6) | Opp Box (2)
  const validSortKeys = ["spectrum", "near", "pc1", "pc2", "lineup", "gd", "xgd", ...App.dials.map((_, i) => `dial${i}`)];

  App.workspaceDna = function (bodyHost, ctrlHost, { choose, sortBy, highlight, previewDial, onCohortBrush }) {
    ctrlHost.innerHTML = `
      <div class="wf2-seg" id="dna-view-seg" role="group" aria-label="DNA view mode">
        <button type="button" data-dview="matrix" aria-pressed="true">Matrix</button>
        <button type="button" data-dview="bars" aria-pressed="false">Bars</button>
        <button type="button" data-dview="par" aria-pressed="false">ParCoords</button>
      </div>
      <div class="wf2-seg" id="dna-col-seg" role="group" aria-label="Column grouping">
        <button type="button" data-dcol="pitch" aria-pressed="true" title="3-zone pitch order (Own → Midfield → Opp)">Pitch</button>
        <button type="button" data-dcol="corr" aria-pressed="false" title="Correlated metrics clustered together (Yang '03)">Corr</button>
        <button type="button" data-dcol="gap" aria-pressed="false" title="Order columns by |A − B| difference">Gap</button>
      </div>
      <span id="dna-sort-host"></span>`;

    bodyHost.innerHTML = `
      <div class="dna-scroll" id="dna-scroll" tabindex="0" aria-label="Style DNA Heatmap">
        <table class="dna-table"><thead id="dna-thead"></thead><tbody id="dna-tbody"></tbody></table>
        <div class="dna-par-host" id="dna-par-host" hidden></div>
      </div>
      <div class="dna-foot">
        <div class="dna-readout" id="dna-readout" aria-live="polite"></div>
        <span class="dna-key"><span>≤−2σ</span><i aria-hidden="true"></i><span>+2σ</span></span>
      </div>`;

    const sortHost = ctrlHost.querySelector("#dna-sort-host");
    const scrollEl = bodyHost.querySelector("#dna-scroll");
    const tableEl = bodyHost.querySelector(".dna-table");
    const thead = bodyHost.querySelector("#dna-thead");
    const tbody = bodyHost.querySelector("#dna-tbody");
    const parHost = bodyHost.querySelector("#dna-par-host");
    const readoutEl = bodyHost.querySelector("#dna-readout");
    const info = App.dials.map((id) => App.indicator(id));

    let currentModel = null;
    let canRank = null;
    let pickSort = null;
    let viewMode = "matrix"; // "matrix" | "bars" | "par"
    let colMode = "pitch";   // "pitch" | "corr" | "gap"
    let rawMeans = {};
    let lineupScores = {};
    let hoveredList = [];
    let liveBrushIds = null;
    let prevOrderSig = "";
    let pointerCol = null;

    function buildSortSelect(hasRank) {
      const options = [
        ["spectrum", "Style spectrum"],
        ...(hasRank ? [["near", "Nearest to A"]] : []),
        ["lineup", "LineUp weighted score"],
        ["pc1", "Map X axis"],
        ["pc2", "Map Y axis"],
        ["gd", "Goal diff. / match"],
        ["xgd", "xG diff. / match"],
        ...info.map((m, i) => [`dial${i}`, m.label]),
      ];
      sortHost.innerHTML = `<select id="dna-sort" aria-label="Sort Style DNA teams">${options.map(([k, lbl]) => `<option value="${k}">${esc(lbl)}</option>`).join("")}</select>`;
      pickSort = sortHost.querySelector("#dna-sort");
      pickSort.onchange = () => sortBy(pickSort.value);
      canRank = hasRank;
    }

    function computeLineupScores(model) {
      const { state, full } = model;
      const weights = state.weights || {};
      const activeIdx = state.dials.map((d) => App.dials.indexOf(d)).filter((i) => i >= 0);
      const out = {};
      let maxAbs = 0.01;
      for (const id of Object.keys(full.team)) {
        let num = 0, den = 0;
        for (const i of activeIdx) {
          const w = weights[App.dials[i]] ?? 1;
          num += w * (full.team[id][i] || 0);
          den += w;
        }
        const v = den ? num / den : 0;
        out[id] = v;
        maxAbs = Math.max(maxAbs, Math.abs(v));
      }
      return { scores: out, maxAbs };
    }

    function orderedColumns(model) {
      const { state, full } = model;
      const active = [];
      const inactive = [];
      App.dials.forEach((id, i) => {
        if (state.dials.includes(id)) active.push(i);
        else inactive.push(i);
      });

      if (inactive.length) {
        return {
          cols: [...active, ...inactive],
          groups: [
            { label: `Active (${active.length})`, span: active.length, cls: "is-active-grp", zone: "" },
            { label: "Other", span: inactive.length, cls: "dna-split is-muted-grp", zone: "" },
          ],
          splitSet: new Set([inactive[0]]),
          activeSet: new Set(active),
        };
      }

      if (colMode === "corr") {
        const cols = App.CORR_DIAL_ORDER.slice();
        return {
          cols,
          groups: [
            { label: "Positional · Press (Yang '03)", span: 7, cls: "is-zone-mid", zone: "mid" },
            { label: "Direct · Deep", span: 3, cls: "dna-split is-zone-own", zone: "own" },
          ],
          splitSet: new Set([cols[7]]),
          activeSet: new Set(cols),
        };
      }

      if (colMode === "gap" && state.team && full.team[state.team]) {
        const bId = state.compare || model.near[0]?.id;
        if (bId && full.team[bId]) {
          const cols = [...Array(10).keys()].sort((u, v) =>
            Math.abs(full.team[state.team][v] - full.team[bId][v]) - Math.abs(full.team[state.team][u] - full.team[bId][u])
          );
          return {
            cols,
            groups: [
              { label: `Largest |${state.team} − ${bId}| differences`, span: 5, cls: "is-active-grp", zone: "" },
              { label: "Closest indicators", span: 5, cls: "dna-split is-muted-grp", zone: "" },
            ],
            splitSet: new Set([cols[5]]),
            activeSet: new Set(cols),
          };
        }
      }

      // Default 3-Zone Schematic Pitch order
      const cols = PITCH_ORDER.slice();
      return {
        cols,
        groups: [
          { label: "Own", span: 2, cls: "is-zone-own", zone: "own" },
          { label: "Midfield", span: 6, cls: "dna-split is-zone-mid", zone: "mid" },
          { label: "Opp", span: 2, cls: "dna-split is-zone-opp", zone: "opp" },
        ],
        splitSet: new Set([cols[2], cols[8]]),
        activeSet: new Set(cols),
      };
    }

    function sortTeams(ids, order, model) {
      const { state, full, summaries, near, pos } = model;
      const ranks = new Map(near.map((n, i) => [n.id, i + 1]));
      if (state.team) ranks.set(state.team, 0);
      if (order === "spectrum") {
        const specRank = new Map(App.SPECTRUM_ORDER.map((id, i) => [id, i]));
        return [...ids].sort((a, b) => {
          const sa = specRank.get(App.team[a].archetype) ?? 99;
          const sb = specRank.get(App.team[b].archetype) ?? 99;
          if (sa !== sb) return sa - sb;
          const za = full.team[a]?.[0] ?? 0;
          const zb = full.team[b]?.[0] ?? 0;
          return za - zb || d3.ascending(App.team[a].name, App.team[b].name);
        });
      }
      const val = (id) => {
        if (order === "near") return ranks.get(id);
        if (order === "pc1") return pos[id]?.[0];
        if (order === "pc2") return pos[id]?.[1];
        if (order === "lineup") return lineupScores[id];
        if (order.startsWith("dial")) return full.team[id]?.[Number(order.slice(4))];
        return summaries[id]?.[order];
      };
      const asc = order === "near";
      return [...ids].sort((a, b) => {
        const la = val(a), rb = val(b);
        if (Number.isFinite(la) !== Number.isFinite(rb)) return Number.isFinite(la) ? -1 : 1;
        const cmp = Number.isFinite(la) ? (asc ? la - rb : rb - la) : 0;
        return cmp || d3.ascending(App.team[a].name, App.team[b].name);
      });
    }

    function rawFormatted(val, colIdx) {
      if (!Number.isFinite(val)) return "–";
      return `${App.fix(val, 1)}${info[colIdx].unit === "%" ? "%" : ` ${info[colIdx].unit}`}`;
    }

    function microBarInner(z, maxScale = 2.4, posCls = "is-pos", negCls = "is-neg") {
      if (!Number.isFinite(z)) return "";
      const mag = Math.min(1, Math.abs(z) / maxScale) * 50;
      const left = z >= 0 ? 50 : 50 - mag;
      return `<span class="dna-mbar"><i class="dna-mbar-zero"></i><i class="dna-mbar-fill ${z >= 0 ? posCls : negCls}" style="left:${left.toFixed(1)}%;width:${Math.max(1.5, mag).toFixed(1)}%"></i></span>`;
    }

    function cellHtml(z, rawVal, colIdx, { isActive, isSplit, isColored, inlineNum = false }) {
      const cls = [
        isSplit ? "dna-split" : "",
        !isActive ? "is-muted" : "",
        isColored ? "is-colored-col" : "",
        viewMode === "bars" ? "is-bar-cell" : "",
      ].filter(Boolean).join(" ");
      if (viewMode === "bars") {
        return `<td class="${cls}" data-dial-idx="${colIdx}" data-z="${z}" data-raw="${rawVal}">${microBarInner(z, 2.3)}</td>`;
      }
      const txt = inlineNum && Number.isFinite(z)
        ? `<span class="dna-pin-z" style="color:${Math.abs(z) > 1.15 ? "#ffffff" : "#24333a"}">${App.signed(z, 1)}</span>`
        : "";
      return `<td class="${cls}" data-dial-idx="${colIdx}" data-z="${z}" data-raw="${rawVal}" style="background-color:${zColor(z)}">${txt}</td>`;
    }

    function outcomeCellsHtml(id, showLineup, maxLu, s) {
      const xgd = s?.xgd, gd = s?.gd;
      const lu = lineupScores[id];
      return `
        <td class="dna-out-cell dna-split" data-outcome="xgd" data-val="${xgd ?? ""}" title="xG diff/m: ${App.signed(xgd, 2)}">${microBarInner(xgd, 2.6)}</td>
        <td class="dna-out-cell" data-outcome="gd" data-val="${gd ?? ""}" title="Goal diff/m: ${App.signed(gd, 2)}">${microBarInner(gd, 3.0)}</td>
        ${showLineup ? `<td class="dna-out-cell" data-outcome="lineup" data-val="${lu ?? ""}" title="LineUp weighted score: ${App.signed(lu, 2)}σ">${microBarInner(lu, maxLu || 1.5)}</td>` : ""}`;
    }

    function pinnedRowHtml(id, role, cols, colMeta, full, summaries, showLineup, maxLu) {
      const zVec = full.team[id];
      const rVec = rawMeans[id];
      if (!zVec) return "";
      const roleCls = role === "A" ? "is-a" : "is-b";
      return `<tr class="dna-pin-row ${roleCls}" data-team="${id}">
        <th scope="row"><button type="button" class="dna-team-btn" title="${esc(App.team[id].name)}">
          <b class="dna-badge ${roleCls}" translate="no">${role}</b>${App.flag(id, 11)}<span class="dna-tname">${esc(App.team[id].name)}</span>
        </button></th>
        ${cols.map((idx) => cellHtml(zVec[idx], rVec[idx], idx, {
          isActive: colMeta.activeSet.has(idx),
          isSplit: colMeta.splitSet.has(idx),
          isColored: colMeta.colored === idx,
          inlineNum: true,
        })).join("")}
        ${outcomeCellsHtml(id, showLineup, maxLu, summaries[id])}
      </tr>`;
    }

    function diffRowHtml(aId, bId, cols, colMeta, full, summaries, showLineup, maxLu) {
      const zA = full.team[aId], zB = full.team[bId];
      if (!zA || !zB) return "";
      const dXgd = (summaries[aId]?.xgd ?? 0) - (summaries[bId]?.xgd ?? 0);
      const dGd = (summaries[aId]?.gd ?? 0) - (summaries[bId]?.gd ?? 0);
      const dLu = (lineupScores[aId] ?? 0) - (lineupScores[bId] ?? 0);
      return `<tr class="dna-diff-row">
        <th scope="row"><span class="dna-diff-lbl" translate="no">A − B</span></th>
        ${cols.map((idx) => {
          const d = zA[idx] - zB[idx];
          const cls = [
            colMeta.splitSet.has(idx) ? "dna-split" : "",
            !colMeta.activeSet.has(idx) ? "is-muted" : "",
          ].filter(Boolean).join(" ");
          return `<td class="${cls}" data-dial-idx="${idx}" data-diff="${d}" translate="no">${microBarInner(d, 2.5, "is-a", "is-b")}<b>${App.signed(d, 1)}</b></td>`;
        }).join("")}
        <td class="dna-out-cell dna-split" data-outcome="xgd" data-diff="${dXgd}" translate="no">${microBarInner(dXgd, 2.8, "is-a", "is-b")}<b>${App.signed(dXgd, 1)}</b></td>
        <td class="dna-out-cell" data-outcome="gd" data-diff="${dGd}" translate="no">${microBarInner(dGd, 3.2, "is-a", "is-b")}<b>${App.signed(dGd, 1)}</b></td>
        ${showLineup ? `<td class="dna-out-cell" data-outcome="lineup" data-diff="${dLu}" translate="no">${microBarInner(dLu, maxLu || 1.5, "is-a", "is-b")}<b>${App.signed(dLu, 1)}</b></td>` : ""}
      </tr>`;
    }

    function updateReadout(rowEl, cellEl) {
      if (!currentModel) return;
      if (rowEl && rowEl.classList.contains("dna-diff-row")) {
        const outK = cellEl?.dataset.outcome;
        if (outK) {
          const dv = Number(cellEl.dataset.diff);
          const lbl = outK === "xgd" ? "xG diff./m" : outK === "gd" ? "Goal diff./m" : "LineUp score";
          readoutEl.innerHTML = `<b translate="no">A − B</b><span>${lbl}</span><b>${App.signed(dv, 2)}</b>`;
          return;
        }
        const idx = cellEl ? Number(cellEl.dataset.dialIdx) : -1;
        if (idx >= 0) {
          const d = Number(cellEl.dataset.diff);
          readoutEl.innerHTML = `<b translate="no">A − B</b><span>${esc(info[idx].label)}</span><b>${App.signed(d, 2)}σ</b>`;
          return;
        }
      }
      const id = rowEl?.dataset.team;
      if (!id || !App.team[id]) {
        if (liveBrushIds) {
          readoutEl.textContent = `Showing ${liveBrushIds.size} brushed teams.`;
        } else if (viewMode === "par") {
          readoutEl.textContent = "ParCoords: drag vertically on any axis to brush · dashed = A/B matches.";
        } else {
          readoutEl.textContent = "Hover a column to preview tint on Style Map; click to sort & lock tint.";
        }
        return;
      }
      const outK = cellEl?.dataset.outcome;
      if (outK) {
        const v = Number(cellEl.dataset.val);
        const lbl = outK === "xgd" ? "xG diff./m" : outK === "gd" ? "Goal diff./m" : "LineUp score";
        readoutEl.innerHTML = `${App.flag(id, 13)}<b>${esc(App.team[id].name)}</b><span class="sm-sep">·</span><span>${lbl}:</span><b>${App.signed(v, 2)}</b>`;
        return;
      }
      const idx = cellEl && cellEl.dataset.dialIdx !== undefined ? Number(cellEl.dataset.dialIdx) : -1;
      if (idx >= 0) {
        const z = Number(cellEl.dataset.z), rawVal = Number(cellEl.dataset.raw);
        readoutEl.innerHTML = `${App.flag(id, 13)}<b>${esc(App.team[id].name)}</b><span class="sm-sep">·</span><span>${esc(info[idx].label)}:</span><b>${rawFormatted(rawVal, idx)}</b><span>(${App.signed(z, 2)}σ)</span>`;
      } else {
        const gd = currentModel.summaries[id]?.gd;
        readoutEl.innerHTML = `${App.flag(id, 13)}<b>${esc(App.team[id].name)}</b><span class="sm-sep">·</span><span>${esc(App.groupShort(App.team[id].archetype))}</span><span class="sm-sep">·</span><span>GD <b>${App.signed(gd, 2)}</b>/m</span>`;
      }
    }

    function drawParCoords(model, ids, cols) {
      parHost.innerHTML = "";
      const W = Math.max(360, scrollEl.clientWidth - 4 || 520);
      const H = Math.max(260, scrollEl.clientHeight - 6 || 680);
      const m = { t: 48, r: 22, b: 28, l: 22 };
      const { state, full, summaries, twins } = model;

      const dims = [
        ...cols.map((idx) => ({
          key: `dial${idx}`,
          label: info[idx].short,
          domain: [-2.5, 2.5],
          active: state.dials.includes(App.dials[idx]),
          val: (id) => full.team[id]?.[idx] ?? 0,
          matchVal: (r) => {
            const sp = full.match[r.key];
            return sp ? sp[idx] : null;
          },
        })),
        { key: "xgd", label: "xGD/m", domain: [-2.6, 2.6], active: true, val: (id) => summaries[id]?.xgd ?? 0 },
        { key: "gd", label: "GD/m", domain: [-3.0, 3.0], active: true, val: (id) => summaries[id]?.gd ?? 0 },
      ];

      const x = d3.scalePoint().domain(dims.map((d) => d.key)).range([m.l, W - m.r]).padding(0.25);
      const yScales = Object.fromEntries(dims.map((d) => [d.key, d3.scaleLinear().domain(d.domain).clamp(true).range([H - m.b, m.t])]));
      const lineGen = d3.line().defined(([, py]) => Number.isFinite(py));

      const svg = d3.select(parHost).append("svg")
        .attr("class", "dna-par-svg")
        .attr("viewBox", `0 0 ${W} ${H}`)
        .attr("role", "img")
        .attr("aria-label", "Parallel Coordinates style profile across all 10 tactical dimensions and outcomes");

      // Zero horizontal baseline
      svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", yScales.gd(0)).attr("y2", yScales.gd(0))
        .attr("stroke", "#d7dfdc").attr("stroke-dasharray", "3 3");

      // Optional archetype IQR band when an archetype is focused
      if (state.arch) {
        const archIds = App.arch[state.arch].members.filter((id) => full.team[id]);
        if (archIds.length >= 3) {
          const bandPts = dims.map((d) => {
            const vals = archIds.map((id) => d.val(id)).filter(Number.isFinite).sort(d3.ascending);
            return { x: x(d.key), q25: yScales[d.key](d3.quantile(vals, 0.25)), q75: yScales[d.key](d3.quantile(vals, 0.75)) };
          });
          svg.append("path")
            .attr("d", d3.area().x((p) => p.x).y0((p) => p.q75).y1((p) => p.q25)(bandPts))
            .attr("fill", "rgba(36, 51, 58, 0.08)");
        }
      }

      const idSet = new Set(ids);
      const gLines = svg.append("g").attr("class", "dna-par-lines");
      const allIds = Object.keys(full.team).sort((u, v) => {
        const rank = (k) => k === state.team ? 4 : k === state.compare ? 3 : twins.includes(k) ? 2 : idSet.has(k) ? 1 : 0;
        return rank(u) - rank(v);
      });

      const activeBrushes = new Map();
      const applyAxisBrushes = () => {
        if (!activeBrushes.size) return null;
        return allIds.filter((id) => {
          for (const [key, [lo, hi]] of activeBrushes.entries()) {
            const dim = dims.find((d) => d.key === key);
            const v = dim.val(id);
            if (!Number.isFinite(v) || v < lo || v > hi) return false;
          }
          return true;
        });
      };

      const paths = gLines.selectAll("path.dna-par-path")
        .data(allIds, (id) => id)
        .join("path")
        .attr("class", (id) => `dna-par-path ${id === state.team ? "is-a" : id === state.compare ? "is-b" : ""}`)
        .attr("data-team", (id) => id)
        .attr("d", (id) => lineGen(dims.map((d) => [x(d.key), yScales[d.key](d.val(id))])))
        .attr("fill", "none")
        .attr("stroke", (id) => id === state.team ? "#24639a" : id === state.compare ? "#b44e32" : twins.includes(id) && state.team ? "#1c736f" : "#6c7c83")
        .attr("stroke-width", (id) => (id === state.team || id === state.compare) ? 2.6 : twins.includes(id) && state.team ? 1.6 : 1.05)
        .attr("stroke-opacity", (id) => {
          if (id === state.team || id === state.compare) return 0.96;
          if (!idSet.has(id)) return 0.06;
          if (state.team && twins.includes(id)) return 0.72;
          return state.team ? 0.14 : 0.24;
        });

      // Chameleon per-match variance polylines for A and B
      [state.team, state.compare].filter(Boolean).forEach((tid, idx) => {
        const col = idx === 0 ? "#24639a" : "#b44e32";
        const mRows = A.rows(tid, state.scope);
        for (const r of mRows) {
          const pts = dims.slice(0, cols.length).map((d) => {
            const mv = d.matchVal ? d.matchVal(r) : null;
            return [x(d.key), Number.isFinite(mv) ? yScales[d.key](mv) : NaN];
          });
          svg.append("path")
            .attr("d", lineGen(pts))
            .attr("fill", "none").attr("stroke", col).attr("stroke-width", 0.9)
            .attr("stroke-opacity", 0.24).attr("stroke-dasharray", "3 2").attr("pointer-events", "none");
        }
      });

      paths.on("pointerenter", (e, id) => {
        highlight([id]);
        d3.select(e.currentTarget).attr("stroke-opacity", 1).attr("stroke-width", 2.6).raise();
        const s = summaries[id];
        readoutEl.innerHTML = `${App.flag(id, 13)}<b>${esc(App.team[id].name)}</b><span class="sm-sep">·</span><span>${esc(App.groupShort(App.team[id].archetype))}</span><span class="sm-sep">·</span><span>GD <b>${App.signed(s?.gd, 2)}</b>/m · Chameleon <b>${App.fix(App.team[id].chameleon, 2)}</b></span>`;
      }).on("pointerleave", (_, id) => {
        highlight(null);
        d3.select(`path.dna-par-path[data-team="${id}"]`)
          .attr("stroke-opacity", id === state.team || id === state.compare ? 0.96 : idSet.has(id) ? (state.team ? 0.14 : 0.24) : 0.06)
          .attr("stroke-width", (id === state.team || id === state.compare) ? 2.6 : 1.05);
        updateReadout(null, null);
      }).on("click", (e, id) => {
        e.stopPropagation();
        choose(id, e.shiftKey ? "A" : undefined);
      });

      // Vertical axes + labels + d3.brushY cross-filtering
      const gAxes = svg.append("g").attr("class", "dna-par-axes");
      dims.forEach((d) => {
        const ax = x(d.key);
        const yS = yScales[d.key];
        const gAx = gAxes.append("g").attr("transform", `translate(${ax},0)`);
        gAx.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", d.active ? "#7b8a91" : "#cfd6d3").attr("stroke-width", d.active ? 1.2 : 0.9);
        gAx.append("text").attr("class", `dna-par-lbl ${d.active ? "" : "is-muted"}`).attr("y", m.t - 8)
          .attr("transform", `rotate(-32, 0, ${m.t - 8})`).attr("text-anchor", "start")
          .text(d.label);
        gAx.append("text").attr("class", "dna-par-tick").attr("y", m.t + 8).attr("x", 3).text(d.key.startsWith("dial") ? "+2.5" : `+${d.domain[1]}`);
        gAx.append("text").attr("class", "dna-par-tick").attr("y", H - m.b - 2).attr("x", 3).text(d.key.startsWith("dial") ? "−2.5" : `${d.domain[0]}`);

        const brushY = d3.brushY()
          .extent([[-10, m.t], [10, H - m.b]])
          .on("end", ({ selection, sourceEvent }) => {
            if (!sourceEvent) return;
            if (!selection || Math.abs(selection[1] - selection[0]) < 5) activeBrushes.delete(d.key);
            else activeBrushes.set(d.key, [yS.invert(selection[1]), yS.invert(selection[0])]);
            const brushed = applyAxisBrushes();
            if (onCohortBrush) onCohortBrush(brushed && brushed.length ? brushed : null);
          });
        gAx.append("g").attr("class", "dna-par-brush").call(brushY);
      });
    }

    function render(model) {
      currentModel = model;
      liveBrushIds = null;
      const { state, full, visible, near, summaries } = model;
      const hasRank = Boolean(state.team && full.team[state.team] && near.length);
      if (hasRank !== canRank) buildSortSelect(hasRank);

      const lu = computeLineupScores(model);
      lineupScores = lu.scores;

      let order = validSortKeys.includes(state.heatSort) ? state.heatSort : "spectrum";
      if (order === "near" && !hasRank) order = "spectrum";
      if (pickSort) pickSort.value = order;

      // Update view/col mode pills
      ctrlHost.querySelectorAll("[data-dview]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.dview === viewMode)));
      ctrlHost.querySelectorAll("[data-dcol]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.dcol === colMode));
        b.disabled = state.dials.length < 10 || viewMode === "par";
      });

      const { cols, groups, splitSet, activeSet } = orderedColumns(model);
      const colMeta = { splitSet, activeSet, colored: model.activeColorDial };
      const ids = sortTeams(visible, order, model);
      const showLineup = order === "lineup" || Boolean(state.weights && Object.keys(state.weights).length);

      const archMembers = state.arch ? App.arch[state.arch].members.filter((id) => full.team[id]) : [];
      rawMeans = {};
      for (const id of new Set([...ids, state.team, state.compare, ...archMembers].filter(Boolean))) {
        const rows = A.rows(id, state.scope);
        if (rows.length) rawMeans[id] = App.dials.map((_, i) => d3.mean(rows, (r) => r.dials[i]));
      }

      if (viewMode === "par") {
        tableEl.hidden = true;
        parHost.hidden = false;
        drawParCoords(model, ids, cols);
        updateReadout(null, null);
        return;
      }

      tableEl.hidden = false;
      parHost.hidden = true;

      // Capture old Y positions for FLIP animation
      const prevScroll = scrollEl.scrollTop;
      const prevRects = new Map();
      const orderSig = `${order}|${state.scope}|${state.arch}|${cols.join(",")}`;
      const shouldFlip = prevOrderSig && prevOrderSig !== orderSig && !App.reducedMotion();
      if (shouldFlip) {
        tbody.querySelectorAll("tr.dna-team-row").forEach((tr) => {
          prevRects.set(tr.dataset.team, tr.getBoundingClientRect().top);
        });
      }
      prevOrderSig = orderSig;

      const teamCountLabel = ids.length === Object.keys(full.team).length ? `${ids.length}` : `${ids.length}/${Object.keys(full.team).length}`;
      const groupHeadHtml = `<tr class="dna-grp-row">
        <th rowspan="2" scope="col" class="dna-corner"><span>Teams (${teamCountLabel})</span></th>
        ${groups.map((g) => `<th colspan="${g.span}" scope="colgroup" class="dna-grp-head ${g.cls}">${g.zone ? `<i class="dna-zone-dot is-${g.zone}"></i>` : ""}${esc(g.label)}</th>`).join("")}
        <th colspan="${showLineup ? 3 : 2}" scope="colgroup" class="dna-grp-head dna-split is-outcome-grp">Fate</th>
      </tr>`;

      const colHeadHtml = `<tr class="dna-col-row">
        ${cols.map((idx) => {
          const isSort = order === `dial${idx}`;
          const isColored = model.activeColorDial === idx;
          const cls = [
            splitSet.has(idx) ? "dna-split" : "",
            !activeSet.has(idx) ? "is-muted" : "",
            isSort ? "is-sorted" : "",
            isColored ? "is-colored" : "",
          ].filter(Boolean).join(" ");
          return `<th scope="col" data-dial-idx="${idx}" class="${cls}" aria-sort="${isSort ? "descending" : "none"}">
            <button type="button" data-dial-sort="dial${idx}" title="${esc(info[idx].label)} — ${esc(info[idx].help)}">
              <span>${esc(info[idx].short)}</span>
            </button>
          </th>`;
        }).join("")}
        <th scope="col" class="dna-out-col dna-split ${order === "xgd" ? "is-sorted" : ""}" aria-sort="${order === "xgd" ? "descending" : "none"}">
          <button type="button" data-dial-sort="xgd" title="Sort by expected goal difference per match"><span>xGD</span></button>
        </th>
        <th scope="col" class="dna-out-col ${order === "gd" ? "is-sorted" : ""}" aria-sort="${order === "gd" ? "descending" : "none"}">
          <button type="button" data-dial-sort="gd" title="Sort by observed goal difference per match"><span>GD</span></button>
        </th>
        ${showLineup ? `<th scope="col" class="dna-out-col ${order === "lineup" ? "is-sorted" : ""}" aria-sort="${order === "lineup" ? "descending" : "none"}">
          <button type="button" data-dial-sort="lineup" title="Sort by weighted LineUp composite style score"><span>wSc</span></button>
        </th>` : ""}
      </tr>`;

      const pinnedA = state.team && full.team[state.team] ? pinnedRowHtml(state.team, "A", cols, colMeta, full, summaries, showLineup, lu.maxAbs) : "";
      const pinnedB = state.team && state.compare && full.team[state.compare] ? pinnedRowHtml(state.compare, "B", cols, colMeta, full, summaries, showLineup, lu.maxAbs) : "";
      const diffRow = pinnedA && pinnedB ? diffRowHtml(state.team, state.compare, cols, colMeta, full, summaries, showLineup, lu.maxAbs) : "";
      thead.innerHTML = groupHeadHtml + colHeadHtml + pinnedA + pinnedB + diffRow;

      const counts = d3.rollup(ids, (arr) => arr.length, (id) => App.team[id].archetype);
      const bodyParts = [];
      let lastGroup = null;
      if (state.arch && archMembers.length && ids.length) {
        const zAvg = App.dials.map((_, i) => d3.mean(archMembers, (id) => full.team[id][i]));
        const rAvg = App.dials.map((_, i) => d3.mean(archMembers, (id) => rawMeans[id][i]));
        const avgXgd = d3.mean(archMembers, (id) => summaries[id]?.xgd);
        const avgGd = d3.mean(archMembers, (id) => summaries[id]?.gd);
        const avgLu = d3.mean(archMembers, (id) => lineupScores[id]);
        bodyParts.push(`<tr class="dna-group-row"><th scope="row" colspan="${cols.length + (showLineup ? 4 : 3)}"><span>${esc(App.groupShort(state.arch))} · Group mean</span><small>${archMembers.length}</small></th></tr>`);
        bodyParts.push(`<tr class="dna-mean-row"><th scope="row"><span class="dna-tname">Group mean</span></th>${cols.map((idx) => cellHtml(zAvg[idx], rAvg[idx], idx, { isActive: activeSet.has(idx), isSplit: splitSet.has(idx), isColored: colMeta.colored === idx })).join("")}${outcomeCellsHtml("__mean__", showLineup, lu.maxAbs, { xgd: avgXgd, gd: avgGd })}</tr>`);
        void avgLu;
      }

      for (const id of ids) {
        const arch = App.team[id].archetype;
        if (order === "spectrum" && !state.arch && arch !== lastGroup) {
          bodyParts.push(`<tr class="dna-group-row" data-arch="${arch}"><th scope="row" colspan="${cols.length + (showLineup ? 4 : 3)}"><span>${esc(App.groupShort(arch))}</span><small>${counts.get(arch)}</small></th></tr>`);
          lastGroup = arch;
        }
        const isA = id === state.team, isB = id === state.compare;
        const isArchDim = state.arch && state.archMode !== "isolate" && arch !== state.arch && !isA && !isB;
        const rowCls = ["dna-team-row", isA ? "is-a" : "", isB ? "is-b" : "", isArchDim ? "is-arch-dim" : ""].filter(Boolean).join(" ");
        bodyParts.push(`<tr class="${rowCls}" data-team="${id}">
          <th scope="row"><button type="button" class="dna-team-btn" title="${esc(App.team[id].name)}">${App.flag(id, 11)}<span class="dna-tname">${esc(App.team[id].name)}</span></button></th>
          ${cols.map((idx) => cellHtml(full.team[id][idx], rawMeans[id]?.[idx], idx, {
            isActive: activeSet.has(idx),
            isSplit: splitSet.has(idx),
            isColored: colMeta.colored === idx,
          })).join("")}
          ${outcomeCellsHtml(id, showLineup, lu.maxAbs, summaries[id])}
        </tr>`);
      }

      tbody.innerHTML = bodyParts.join("") || `<tr><td class="dna-empty" colspan="${cols.length + (showLineup ? 4 : 3)}">No team matches these filters.</td></tr>`;
      scrollEl.scrollTop = prevScroll;

      if (shouldFlip && prevRects.size) {
        tbody.querySelectorAll("tr.dna-team-row").forEach((tr) => {
          const oldTop = prevRects.get(tr.dataset.team);
          if (oldTop == null) return;
          const dy = oldTop - tr.getBoundingClientRect().top;
          if (Math.abs(dy) < 2 || Math.abs(dy) > 700) return;
          tr.style.transition = "none";
          tr.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => {
            tr.style.transition = "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)";
            tr.style.transform = "";
          });
        });
      }

      applyHoverStyles();
      updateReadout(null, null);
    }

    function applyHoverStyles() {
      const set = new Set(hoveredList);
      bodyHost.querySelectorAll("tr[data-team]").forEach((tr) => {
        tr.classList.toggle("is-hover", set.has(tr.dataset.team));
      });
      parHost.querySelectorAll("path.dna-par-path").forEach((p) => {
        p.classList.toggle("is-hover", set.has(p.dataset.team));
      });
    }

    function setHovered(ids) {
      hoveredList = Array.isArray(ids) ? ids.filter(Boolean) : [];
      applyHoverStyles();
      if (viewMode !== "par" && hoveredList.length === 1) {
        const tr = tbody.querySelector(`tr[data-team="${hoveredList[0]}"]`);
        if (tr && !tr.matches(":hover")) {
          const box = scrollEl.getBoundingClientRect();
          const headH = thead.offsetHeight || 60;
          const r = tr.getBoundingClientRect();
          if (r.top < box.top + headH) scrollEl.scrollTop -= (box.top + headH - r.top) + 4;
          else if (r.bottom > box.bottom) scrollEl.scrollTop += (r.bottom - box.bottom) + 4;
          updateReadout(tr, null);
        }
      } else if (!hoveredList.length) {
        updateReadout(null, null);
      }
    }

    function previewRegion(ids) {
      liveBrushIds = ids ? new Set(ids) : null;
      if (viewMode === "par") {
        parHost.querySelectorAll("path.dna-par-path").forEach((p) => {
          const show = !liveBrushIds || liveBrushIds.has(p.dataset.team);
          p.style.opacity = show ? "" : "0.06";
        });
        updateReadout(null, null);
        return;
      }
      const rows = tbody.querySelectorAll("tr.dna-team-row");
      rows.forEach((tr) => {
        tr.hidden = liveBrushIds ? !liveBrushIds.has(tr.dataset.team) : false;
      });
      tbody.querySelectorAll("tr.dna-group-row").forEach((grp) => {
        let count = 0;
        for (let el = grp.nextElementSibling; el && !el.classList.contains("dna-group-row"); el = el.nextElementSibling) {
          if (el.classList.contains("dna-team-row") && !el.hidden) count++;
        }
        grp.hidden = count === 0;
        const badge = grp.querySelector("small");
        if (badge) badge.textContent = String(count);
      });
      updateReadout(null, null);
    }

    ctrlHost.querySelectorAll("[data-dview]").forEach((b) => {
      b.onclick = () => {
        viewMode = b.dataset.dview;
        if (currentModel) render(currentModel);
      };
    });
    ctrlHost.querySelectorAll("[data-dcol]").forEach((b) => {
      b.onclick = () => {
        colMode = b.dataset.dcol;
        if (currentModel) render(currentModel);
      };
    });

    thead.addEventListener("pointerover", (e) => {
      const th = e.target.closest("th[data-dial-idx]");
      if (th) {
        const idx = Number(th.dataset.dialIdx);
        if (pointerCol !== idx) {
          pointerCol = idx;
          previewDial(idx);
        }
      } else if (pointerCol !== null) {
        pointerCol = null;
        previewDial(null);
      }
      const tr = e.target.closest("tr[data-team], tr.dna-diff-row");
      const cell = e.target.closest("td[data-dial-idx], td[data-outcome]");
      if (tr) {
        if (tr.dataset.team) highlight([tr.dataset.team]);
        updateReadout(tr, cell);
      }
    });

    thead.addEventListener("pointerleave", () => {
      if (pointerCol !== null) {
        pointerCol = null;
        previewDial(null);
      }
      highlight(null);
      updateReadout(null, null);
    });

    thead.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-dial-sort]");
      if (btn) {
        sortBy(btn.dataset.dialSort);
        return;
      }
      const tr = e.target.closest("tr[data-team]");
      if (tr) choose(tr.dataset.team, e.shiftKey ? "A" : undefined);
    });

    tbody.addEventListener("pointerover", (e) => {
      const tr = e.target.closest("tr[data-team], tr.dna-mean-row");
      const cell = e.target.closest("td[data-dial-idx], td[data-outcome]");
      if (!tr) return;
      if (tr.dataset.team) highlight([tr.dataset.team]);
      updateReadout(tr, cell);
    });

    tbody.addEventListener("pointerleave", () => {
      highlight(null);
      updateReadout(null, null);
    });

    tbody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-team]");
      if (tr) choose(tr.dataset.team, e.shiftKey ? "A" : undefined);
    });

    return { render, setHovered, previewRegion, viewMode: () => viewMode, setViewMode: (m) => { viewMode = m; if (currentModel) render(currentModel); } };
  };
})();
