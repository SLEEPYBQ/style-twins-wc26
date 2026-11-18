/* Style Twins workspace (#/story, #/styles).
 * Six coordinated panels, each answering one question:
 *   A Team collection   which teams are in play? (browse, filter, pin A/B)
 *   B Similarity search who plays like A, under which indicators?
 *   C Style map         where does every team sit?
 *   D Style profile     how do A and B play differently?
 *   E Outcomes          do similar styles bring similar results?
 *   F Match evidence    which matches back it up?
 * All measures come from the delivered records; nothing is re-fitted here. */
(function () {
  "use strict";
  const App = window.App, A = App.analysis;
  const C = { a: "#2f6bd8", b: "#e0702a", twin: "#129a86", dot: "#8f99a5", off: "#dde1e6", ink: "#18202b", ink2: "#465161", muted: "#7d8794", faint: "#b8c0c9", line: "#e4e7eb", grid: "#eef0f3" };
  const K = 5; // twins of A highlighted across views
  const measures = [
    { id: "xgd", label: "xG difference", unit: "per match" }, { id: "gd", label: "Goal difference", unit: "per match" },
    { id: "xg", label: "Expected goals", unit: "per match" }, { id: "xga", label: "Expected conceded", unit: "per match" },
    { id: "goals", label: "Goals scored", unit: "per match" }, { id: "conceded", label: "Goals conceded", unit: "per match" },
    { id: "shots", label: "Attempts", unit: "per match" }, { id: "poss", label: "Possession", unit: "%" },
    ...App.dials.map((d, i) => ({ id: `dial${i}`, label: d, unit: App.dialInfo[d].unit || "per adjusted possession" })),
  ];
  const metricById = Object.fromEntries(measures.map((m) => [m.id, m]));
  const recordByKey = Object.fromEntries(A.records.map((r) => [r.key, r]));
  const groupName = (id) => (App.arch[id]?.name || "").replace(/^The /, "");
  const fmt = (v, n = 2) => (Number.isFinite(v) ? App.fix(v, n) : "–");
  const num = (v) => (v != null && v !== "" && Number.isFinite(+v) ? +v : null);
  const esc = App.esc;
  const ICON = {
    swap: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 5h9m0 0-2.5-2.5M13 5l-2.5 2.5M12 11H3m0 0 2.5-2.5M3 11l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9.3 9.3 12.5 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    x: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    brush: '<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 2"/></svg>',
    download: '<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v7m0 0L4 6m3 3 3-3M2.5 11.5h9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  function stateFrom(p) {
    const dials = A.readDials(p), scope = ["group", "knockout"].includes(p.scope) ? p.scope : "all";
    const team = App.team[p.team] ? p.team : "NED";
    let compare = App.team[p.compare] ? p.compare : (A.twinTable(A.space(dials, scope)).near[team] || [])[0]?.id || "CRO";
    if (compare === team) compare = App.teams.find((t) => t.id !== team).id;
    return {
      team, compare, dials, scope,
      arch: App.arch[p.arch] ? p.arch : "", search: p.search || "",
      view: p.view === "custom" ? "custom" : "pca", x: metricById[p.x] ? p.x : "xgd", y: metricById[p.y] ? p.y : "gd",
      color: p.color === "group" ? "group" : "state", order: p.order === "gap" ? "gap" : "fixed",
      cohort: p.cohort ? [...new Set(p.cohort.split(",").filter((id) => App.team[id]))] : null,
      xlo: num(p.xlo), xhi: num(p.xhi), glo: num(p.glo), ghi: num(p.ghi),
      sort: ["name", "group", "n", "xgd", "gd"].includes(p.sort) ? p.sort : "xgd", desc: p.desc !== "0",
      match: App.tm[p.match] ? p.match : null,
    };
  }
  function stateUrl(s) {
    return `#/styles${A.query(s.dials, {
      team: s.team, compare: s.compare, scope: s.scope === "all" ? null : s.scope, arch: s.arch, search: s.search,
      view: s.view === "pca" ? null : s.view, x: s.view === "custom" ? s.x : null, y: s.view === "custom" ? s.y : null,
      color: s.color === "state" ? null : s.color, order: s.order === "fixed" ? null : s.order,
      cohort: s.cohort ? s.cohort.join(",") || "none" : null, xlo: s.xlo, xhi: s.xhi, glo: s.glo, ghi: s.ghi,
      sort: s.sort === "xgd" ? null : s.sort, desc: s.desc ? null : "0", match: s.match,
    })}`;
  }
  function svgFor(host, label) {
    host.replaceChildren();
    const W = Math.max(200, host.clientWidth), H = Math.max(80, host.clientHeight);
    return { W, H, svg: d3.select(host).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", label) };
  }
  const panel = (id, title, controls = "", body = "") => `
    <section class="ws-panel" data-panel="${id}" aria-labelledby="ws-${id}-title">
      <header class="ws-ph"><h2 id="ws-${id}-title">${title}</h2><div class="ws-pc">${controls}</div></header>
      <div class="ws-pb">${body}</div>
    </section>`;
  const seg = (id, items, label) => `<div class="ws-seg" role="group" aria-label="${label}" id="${id}">${items.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="false">${t}</button>`).join("")}</div>`;
  const selectOptions = (items) => items.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("");
  const dual = (id, label) => `<div class="ws-range"><span>${label}</span><div class="ws-dual" id="${id}"><span class="ws-dual-fill"></span><input type="range" aria-label="${label} minimum"><input type="range" aria-label="${label} maximum"></div><output id="${id}-out"></output></div>`;

  function workspace(root, params) {
    let state = stateFrom(params);
    let space, full, twins, near, summaries, scopeAvg, visible = [], pos = {}, hover = null, brushing = false, frame = null;
    const q = (s) => root.querySelector(s);
    const qa = (s) => root.querySelectorAll(s);

    root.innerHTML = `<div class="ws">
      <div class="ws-context" role="region" aria-label="Current comparison">
        <div class="ws-pair">
          <div class="ws-pick" data-side="A"><span class="ws-context-label" translate="no">A</span><i class="ws-pick-mark" aria-hidden="true"></i><div id="ws-pick-a"></div></div>
          <button type="button" class="ws-swap" id="ws-swap" title="Swap A and B" aria-label="Swap A and B">${ICON.swap}</button>
          <div class="ws-pick" data-side="B"><span class="ws-context-label" translate="no">B</span><i class="ws-pick-mark" aria-hidden="true"></i><div id="ws-pick-b"></div></div>
        </div>
        <span class="ws-divider" aria-hidden="true"></span>
        <span class="ws-context-label">Match scope</span>
        ${seg("ws-scope", [["all", "Full tournament"], ["group", "Group stage"], ["knockout", "Knockout"]], "Match scope")}
        <p class="ws-summary" id="ws-summary" aria-live="polite"></p>
        <button type="button" class="ws-btn" id="ws-reset">Reset view</button>
      </div>
      <div class="ws-grid">
        <div class="ws-col ws-col-left">
        ${panel("A", 'Team Table<span class="ws-count" id="ws-count"></span>',
          `<button type="button" class="ws-btn" id="ws-export" title="Download the filtered rows as CSV">Export CSV</button>`,
          `<div class="ws-filters">
             <label class="ws-search">${ICON.search}<span class="sr-only">Search teams</span><input id="ws-search" type="search" placeholder="Search teams" autocomplete="off"></label>
             <select id="ws-group" aria-label="Style group">${selectOptions([["", "All style groups"], ...App.data.archetypes.map((a) => [a.id, groupName(a.id)])])}</select>
             ${dual("ws-range-xgd", "xG diff.")}
             ${dual("ws-range-gd", "Goal diff.")}
             <div class="ws-chips-row" id="ws-chips" hidden></div>
           </div>
           <div class="ws-scroll" id="ws-team-scroll"><table class="ws-table" id="ws-teams"><colgroup><col class="c-pin"><col><col class="c-grp"><col class="c-n"><col class="c-xgd"><col class="c-gd"></colgroup><thead><tr>
             <th scope="col"><span class="sr-only">Pin</span></th>
             ${[["name", "Team", "Sort by name"], ["group", "Grp", "Original style group"], ["n", "M", "Matches in scope"], ["xgd", "xG diff.", "xG difference per match"], ["gd", "Goal diff.", "Goal difference per match"]].map(([id, t, tip]) => `<th scope="col" class="${["n", "xgd", "gd"].includes(id) ? "num" : ""}"><button type="button" data-sort="${id}" title="${tip}">${t}<span aria-hidden="true"></span></button></th>`).join("")}
           </tr></thead><tbody></tbody></table></div>`)}
        ${panel("B", "Similarity Search", "",
          `<div class="ws-sim-input">
             <div class="ws-sim-head"><span>Indicators <b id="ws-dial-count"></b></span><button type="button" class="ws-link" id="ws-dials-all">Select all</button></div>
             <div class="ws-dials" id="ws-dials">${App.dials.map((d, i) => `<label class="ws-check" title="${esc(App.dialInfo[d].help)}"><input type="checkbox" data-i="${i}"><span>${esc(d)}</span></label>`).join("")}</div>
           </div>
           <div class="ws-twins-cap"><span>#</span><span id="ws-twins-title"></span><span title="Share of all team pairs that are less alike">Similarity percentile</span></div>
           <div class="ws-scroll"><ol class="ws-twins" id="ws-twins"></ol></div>`)}
        </div>
        ${panel("C", "Style Map",
          `<span class="ws-map-tools">${seg("ws-view", [["pca", "PCA"], ["custom", "X / Y"]], "Map projection")}
             <span id="ws-axes" hidden><label translate="no">X <select id="ws-x" aria-label="X axis">${selectOptions(measures.map((m) => [m.id, m.label]))}</select></label>
             <label translate="no">Y <select id="ws-y" aria-label="Y axis">${selectOptions(measures.map((m) => [m.id, m.label]))}</select></label></span></span>
           <span class="ws-pc-label">Colour</span>${seg("ws-color", [["state", "Selection"], ["group", "Style group"]], "Colour points by")}
           <button type="button" class="ws-btn" id="ws-brush" aria-pressed="false" title="Drag a rectangle to filter teams">Brush</button>`,
          `
           <div class="ws-legend" id="ws-legend"></div>
           <div class="ws-chart ws-map" id="ws-map"></div>
           <div class="ws-readout" id="ws-readout" aria-live="polite"></div>`)}
        <div class="ws-col ws-col-right">
        ${panel("D", "Style Profile <span class=\"ws-count\" title=\"Team mean, standard deviations from the tournament average\">z-score</span>",
          `<span class="ws-pc-label">Order</span>${seg("ws-order", [["fixed", "Fixed"], ["gap", "By gap"]], "Indicator order")}`,
          `<div class="ws-chart ws-profile" id="ws-profile"></div>`)}
        ${panel("E", "Outcomes <span class=\"ws-count\">per match</span>", "",
          `<div class="ws-legend"><span translate="no"><i class="lg-a"></i>A</span><span translate="no"><i class="lg-b"></i>B</span><span><i class="lg-tick-twin"></i>Mean of A's ${K} closest</span><span><i class="lg-tick-avg"></i>Tournament avg.</span></div>
           <div class="ws-chart ws-outcomes" id="ws-outcomes"></div>`)}
        ${panel("F", 'Match List<span class="ws-count" id="ws-match-count"></span>', "",
          `<div class="ws-scroll"><table class="ws-table ws-matches" id="ws-matches"><thead><tr>
             <th scope="col">Team</th><th scope="col">Opponent</th><th scope="col">Stage</th><th scope="col">Score</th><th scope="col" class="num">xG diff.</th>
           </tr></thead><tbody></tbody></table></div>
           <div class="ws-match-actions" id="ws-match-actions"></div>`)}
        </div>
      </div>
    </div>`;

    /* ---------- resizable panels (per-viewer, stored locally) ---------- */
    const LAYOUT_KEY = "style-twins-ws-layout";
    let layout = {};
    try { layout = JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch (_) { layout = {}; }
    const saveLayout = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (_) { /* storage may be unavailable */ } };
    const grid = q(".ws-grid");
    const gutter = (orientation, label) => { const g = document.createElement("div"); g.className = "ws-gutter"; g.tabIndex = 0; g.setAttribute("role", "separator"); g.setAttribute("aria-orientation", orientation); g.setAttribute("aria-label", label); g.title = "Drag to resize · double-click to reset"; return g; };
    const colGutters = { left: gutter("vertical", "Resize left column"), right: gutter("vertical", "Resize right column") };
    q(".ws-col-left").after(colGutters.left); q('[data-panel="C"]').after(colGutters.right);
    qa(".ws-col").forEach((col) => [...col.children].slice(1).forEach((panelEl) => panelEl.before(gutter("horizontal", `Resize ${panelEl.querySelector("h2").textContent.trim()}`))));
    function applyLayout() {
      grid.style.setProperty("--ws-left", layout.left ? `${layout.left}px` : "");
      grid.style.setProperty("--ws-right", layout.right ? `${layout.right}px` : "");
      qa(".ws-col > .ws-panel").forEach((el) => { el.style.flexGrow = layout.rows?.[el.dataset.panel] ?? ""; });
    }
    function dragColumn(g, side) {
      const col = side === "left" ? q(".ws-col-left") : q(".ws-col-right");
      const resize = (start, dx) => {
        const room = grid.clientWidth - 20 - 360 - (side === "left" ? q(".ws-col-right").offsetWidth : q(".ws-col-left").offsetWidth);
        layout[side] = Math.round(Math.max(280, Math.min(Math.min(640, room), start + (side === "left" ? dx : -dx))));
        applyLayout(); schedule();
      };
      g.onpointerdown = (e) => {
        if (e.button !== 0) return;
        const x0 = e.clientX, w0 = col.offsetWidth; try { g.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ } g.classList.add("is-drag"); document.body.classList.add("ws-resizing", "col");
        g.onpointermove = (ev) => resize(w0, ev.clientX - x0);
        g.onpointerup = g.onpointercancel = () => { g.onpointermove = null; g.classList.remove("is-drag"); document.body.classList.remove("ws-resizing", "col"); saveLayout(); };
      };
      g.onkeydown = (e) => { if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return; e.preventDefault(); resize(col.offsetWidth, e.key === "ArrowRight" ? 16 : -16); saveLayout(); };
      g.ondblclick = () => { delete layout[side]; applyLayout(); schedule(); saveLayout(); };
    }
    function dragRow(g) {
      const prev = g.previousElementSibling, next = g.nextElementSibling, panels = [...g.parentElement.querySelectorAll(":scope > .ws-panel")];
      const freeze = () => { layout.rows = layout.rows || {}; panels.forEach((el) => { layout.rows[el.dataset.panel] = Math.round(el.offsetHeight); }); };
      const resize = (h1, h2, dy) => {
        const d = Math.max(130 - h1, Math.min(h2 - 130, dy));
        layout.rows[prev.dataset.panel] = Math.round(h1 + d); layout.rows[next.dataset.panel] = Math.round(h2 - d);
        applyLayout(); schedule();
      };
      g.onpointerdown = (e) => {
        if (e.button !== 0) return;
        freeze(); const y0 = e.clientY, h1 = prev.offsetHeight, h2 = next.offsetHeight;
        try { g.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ } g.classList.add("is-drag"); document.body.classList.add("ws-resizing", "row");
        g.onpointermove = (ev) => resize(h1, h2, ev.clientY - y0);
        g.onpointerup = g.onpointercancel = () => { g.onpointermove = null; g.classList.remove("is-drag"); document.body.classList.remove("ws-resizing", "row"); saveLayout(); };
      };
      g.onkeydown = (e) => { if (!["ArrowUp", "ArrowDown"].includes(e.key)) return; e.preventDefault(); freeze(); resize(prev.offsetHeight, next.offsetHeight, e.key === "ArrowDown" ? 16 : -16); saveLayout(); };
      g.ondblclick = () => { if (layout.rows) panels.forEach((el) => delete layout.rows[el.dataset.panel]); applyLayout(); schedule(); saveLayout(); };
    }
    dragColumn(colGutters.left, "left"); dragColumn(colGutters.right, "right");
    qa('.ws-gutter[aria-orientation="horizontal"]').forEach(dragRow);
    applyLayout();

    /* ---------- state changes ---------- */
    const change = (patch, { replace = false } = {}) => { App.tip.hide(); App.go(stateUrl({ ...state, ...patch }), { replace }); };
    const choose = (id, side = "B") => {
      if (side === "A") change({ team: id, compare: id === state.compare ? state.team : state.compare, match: null });
      else if (id !== state.team) change({ compare: id, match: null });
    };
    const pickA = App.ui.select("ws-pick-a", { options: App.ui.teamOptions(), value: state.team, searchable: true, ariaLabel: "Team A", onChange: (v) => choose(v, "A") });
    const pickB = App.ui.select("ws-pick-b", { options: App.ui.teamOptions(), value: state.compare, searchable: true, ariaLabel: "Team B", onChange: (v) => (v === state.team ? change({ team: state.compare, compare: v, match: null }) : choose(v, "B")) });
    q("#ws-swap").onclick = () => change({ team: state.compare, compare: state.team, match: null });
    const segBind = (id, key, extra = {}) => q(`#${id}`).addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b && b.dataset.v !== state[key]) change({ [key]: b.dataset.v, ...extra }); });
    segBind("ws-scope", "scope", { cohort: null, match: null, xlo: null, xhi: null, glo: null, ghi: null });
    segBind("ws-view", "view", { cohort: null });
    segBind("ws-color", "color");
    segBind("ws-order", "order");
    q("#ws-reset").onclick = () => { brushing = false; change({ arch: "", search: "", cohort: null, xlo: null, xhi: null, glo: null, ghi: null, match: null, view: "pca", color: "state" }); };
    let searchTimer;
    q("#ws-search").oninput = (e) => { clearTimeout(searchTimer); const v = e.target.value; searchTimer = setTimeout(() => change({ search: v }, { replace: true }), 180); };
    q("#ws-group").onchange = (e) => change({ arch: e.target.value });
    q("#ws-x").onchange = (e) => change({ x: e.target.value, cohort: null });
    q("#ws-y").onchange = (e) => change({ y: e.target.value, cohort: null });
    q("#ws-brush").onclick = () => { brushing = !brushing; drawMap(); };
    q("#ws-dials-all").onclick = () => change({ dials: App.dials.slice(), cohort: null });
    q("#ws-dials").onchange = (e) => {
      const b = e.target.closest("[data-i]"); if (!b) return;
      const dial = App.dials[+b.dataset.i], on = state.dials.includes(dial);
      if (on && state.dials.length <= 2) { b.checked = true; return; }
      change({ dials: on ? state.dials.filter((d) => d !== dial) : App.dials.filter((d) => d === dial || state.dials.includes(d)), cohort: null });
    };
    qa("[data-sort]").forEach((b) => (b.onclick = () => change({ sort: b.dataset.sort, desc: b.dataset.sort === state.sort ? !state.desc : b.dataset.sort !== "name" && b.dataset.sort !== "group" })));
    q("#ws-export").onclick = () => {
      const rows = [["team", "style_group", "matches", "xg_difference_per_match", "goal_difference_per_match", "style_distance_from_A"],
        ...visible.map((id) => [App.team[id].name, groupName(App.team[id].archetype), summaries[id].n, summaries[id].xgd, summaries[id].gd, distanceTo(id)])];
      const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), a = document.createElement("a");
      a.href = href; a.download = "style-twins-teams.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
    };

    /* dual range sliders */
    const ranges = {};
    [["ws-range-xgd", "xgd", "xlo", "xhi"], ["ws-range-gd", "gd", "glo", "ghi"]].forEach(([id, key, loKey, hiKey]) => {
      const host = q(`#${id}`), [lo, hi] = host.querySelectorAll("input"), fill = host.querySelector(".ws-dual-fill"), out = q(`#${id}-out`);
      const paint = () => {
        const min = +lo.min, max = +lo.max, a = Math.min(+lo.value, +hi.value), b = Math.max(+lo.value, +hi.value);
        fill.style.left = `${((a - min) / (max - min || 1)) * 100}%`; fill.style.right = `${100 - ((b - min) / (max - min || 1)) * 100}%`;
        out.textContent = a <= min && b >= max ? "Any" : `${App.fix(a, 1)} to ${App.fix(b, 1)}`;
      };
      const commit = () => {
        const min = +lo.min, max = +lo.max, a = Math.min(+lo.value, +hi.value), b = Math.max(+lo.value, +hi.value);
        change({ [loKey]: a <= min ? null : +a.toFixed(2), [hiKey]: b >= max ? null : +b.toFixed(2) }, { replace: true });
      };
      [lo, hi].forEach((input) => { input.oninput = paint; input.onchange = commit; });
      ranges[key] = { lo, hi, paint, loKey, hiKey };
    });

    /* ---------- derived data ---------- */
    function metric(id, key) { if (key.startsWith("dial")) return full.team[id]?.[+key.slice(4)] ?? null; return summaries[id]?.[key] ?? null; }
    function recordMetric(row, key) { if (key.startsWith("dial")) return full.match[row.key]?.[+key.slice(4)]; if (key === "conceded") return row.goals_opp; return A.metric(row, key); }
    function distanceTo(id) { return space.team[state.team] && space.team[id] ? App.dist(space.team[state.team], space.team[id]) : null; }
    function rankOf(id) { const i = near.findIndex((n) => n.id === id); return i < 0 ? null : i + 1; }
    function matching() {
      const needle = state.search.trim().toLocaleLowerCase();
      return Object.keys(space.team).filter((id) => {
        const t = App.team[id], s = summaries[id], local = App.i18n?.t(t.name) || t.name;
        return (!state.arch || t.archetype === state.arch) && (!state.cohort || state.cohort.includes(id))
          && (!needle || `${t.name} ${local} ${id}`.toLocaleLowerCase().includes(needle))
          && (state.xlo === null || s.xgd >= state.xlo) && (state.xhi === null || s.xgd <= state.xhi)
          && (state.glo === null || s.gd >= state.glo) && (state.ghi === null || s.gd <= state.ghi);
      });
    }
    const focused = () => (state.match ? recordByKey[state.match] : null);
    const role = (id) => (id === state.team ? "a" : id === state.compare ? "b" : twins.includes(id) ? "twin" : visible.includes(id) ? "in" : "out");

    function render() {
      space = A.space(state.dials, state.scope);
      full = A.space(App.dials, state.scope);
      near = A.twinTable(space).near[state.team] || [];
      twins = near.slice(0, K).map((n) => n.id);
      summaries = Object.fromEntries(App.teams.map((t) => [t.id, A.summary(A.rows(t.id, state.scope))]));
      scopeAvg = A.summary(A.records.filter((r) => state.scope === "all" || (state.scope === "group" ? r.stage === "Group" : r.stage !== "Group")));
      visible = matching();
      hover = null;
      drawContext(); drawCollection(); drawSimilarity(); drawMap(); drawProfile(); drawOutcomes(); drawMatches(); readout();
    }

    /* ---------- context bar ---------- */
    function drawContext() {
      pickA.set(state.team); pickB.set(state.compare);
      [["#ws-scope", state.scope], ["#ws-view", state.view], ["#ws-color", state.color], ["#ws-order", state.order]].forEach(([s, v]) => q(s).querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v))));
      const ta = App.team[state.team].name, tb = App.team[state.compare].name, r = rankOf(state.compare), sim = near.find((n) => n.id === state.compare)?.sim;
      const scopeText = { all: "tournament", group: "group stage", knockout: "knockout stage" }[state.scope];
      q("#ws-summary").innerHTML = !space.team[state.team] ? `<b>${esc(ta)}</b> has no matches in the ${scopeText}.`
        : !space.team[state.compare] ? `<b>${esc(tb)}</b> has no matches in the ${scopeText}.`
        : `<b>${esc(tb)}</b> · #${r} style twin of ${esc(ta)} · closer than ${Math.round((sim ?? 0) * 100)}% of team pairs`;
    }

    /* ---------- A · team collection ---------- */
    function drawCollection() {
      if (document.activeElement !== q("#ws-search")) q("#ws-search").value = state.search;
      q("#ws-group").value = state.arch;
      Object.entries(ranges).forEach(([key, r]) => {
        const vals = Object.keys(space.team).map((id) => summaries[id][key]).filter(Number.isFinite);
        const min = Math.floor((d3.min(vals) ?? -1) * 10) / 10, max = Math.ceil((d3.max(vals) ?? 1) * 10) / 10;
        [r.lo, r.hi].forEach((i) => { i.min = min; i.max = max; i.step = 0.1; });
        r.lo.value = state[r.loKey] ?? min; r.hi.value = state[r.hiKey] ?? max; r.paint();
      });
      const chips = [];
      if (state.cohort) chips.push(["cohort", `Map region · ${state.cohort.length} teams`]);
      q("#ws-chips").hidden = !chips.length;
      q("#ws-chips").innerHTML = chips.map(([k, t]) => `<span class="ws-chip-x">${esc(t)}<button type="button" data-clear="${k}" aria-label="Clear ${esc(t)}">${ICON.x}</button></span>`).join("");
      q("#ws-chips").querySelectorAll("[data-clear]").forEach((b) => (b.onclick = () => change({ cohort: null })));
      q("#ws-count").textContent = `${visible.length} / ${Object.keys(space.team).length} teams`;

      const ids = [...visible].sort((a, b) => {
        let c;
        if (state.sort === "name") c = App.team[a].name.localeCompare(App.team[b].name);
        else if (state.sort === "group") c = groupName(App.team[a].archetype).localeCompare(groupName(App.team[b].archetype));
        else { const x = summaries[a][state.sort], y = summaries[b][state.sort]; c = x == null ? (y == null ? 0 : 1) : y == null ? -1 : x - y; }
        return (state.desc ? -c : c) || App.team[a].name.localeCompare(App.team[b].name);
      });
      const pins = [state.team, state.compare].filter((id) => !visible.includes(id) && space.team[id]);
      qa("[data-sort]").forEach((b) => { const on = b.dataset.sort === state.sort; b.parentElement.setAttribute("aria-sort", on ? (state.desc ? "descending" : "ascending") : "none"); b.querySelector("span").textContent = on ? (state.desc ? "↓" : "↑") : ""; });
      const ext = { xgd: d3.max(Object.values(summaries), (s) => Math.abs(s.xgd ?? 0)) || 1, gd: d3.max(Object.values(summaries), (s) => Math.abs(s.gd ?? 0)) || 1 };
      const bar = (v, key) => {
        if (!Number.isFinite(v)) return "–";
        const w = Math.min(50, (Math.abs(v) / ext[key]) * 50);
        return `<span class="ws-bar"><i><b style="${v >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`}"></b></i><span>${App.signed(v, 2)}</span></span>`;
      };
      q("#ws-teams tbody").innerHTML = [...pins, ...ids].map((id) => {
        const t = App.team[id], s = summaries[id], r = id === state.team ? "is-a" : id === state.compare ? "is-b" : "", out = !visible.includes(id);
        return `<tr data-team="${id}" class="${r}${out ? " is-out" : ""}" tabindex="0" aria-label="${esc(t.name)}">
          <td><span class="ws-ab" translate="no"><button type="button" data-pick="A" aria-pressed="${id === state.team}" aria-label="Set ${esc(t.name)} as A">A</button><button type="button" data-pick="B" aria-pressed="${id === state.compare}" aria-label="Set ${esc(t.name)} as B">B</button></span></td>
          <th scope="row"><span class="ws-teamcell">${App.flag(id, 16)}<span>${esc(t.name)}</span>${out ? '<span class="ws-pinned-note" title="Pinned as A or B; outside the current filters">(pinned)</span>' : ""}</span></th>
          <td class="ws-groupcell" title="${esc(groupName(t.archetype))}"><span class="ws-group-dot" style="background:${App.arch[t.archetype].color}" role="img" aria-label="${esc(groupName(t.archetype))}"></span></td>
          <td class="num">${s.n}</td><td class="num">${bar(s.xgd, "xgd")}</td><td class="num">${App.signed(s.gd, 2)}</td></tr>`;
      }).join("") || `<tr><td colspan="6" class="ws-empty">No team matches these filters.</td></tr>`;
      q("#ws-teams tbody").querySelectorAll("tr[data-team]").forEach((row) => {
        const id = row.dataset.team;
        row.onclick = (e) => choose(id, e.target.closest("[data-pick]")?.dataset.pick || (e.shiftKey ? "A" : "B"));
        row.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === row) { e.preventDefault(); choose(id, e.shiftKey ? "A" : "B"); } };
        row.onmouseenter = () => highlight(id); row.onmouseleave = () => highlight(null);
      });
    }

    /* ---------- B · similarity search ---------- */
    function drawSimilarity() {
      q("#ws-dial-count").textContent = `${state.dials.length} / ${App.dials.length}`;
      q("#ws-dials-all").hidden = state.dials.length === App.dials.length;
      q("#ws-dials").querySelectorAll("[data-i]").forEach((b) => {
        const on = state.dials.includes(App.dials[+b.dataset.i]);
        b.checked = on;
        b.disabled = on && state.dials.length <= 2;
      });
      q("#ws-twins-title").textContent = `Closest to ${App.team[state.team].name}`;
      const list = near.slice(0, 8), bRank = rankOf(state.compare);
      const row = (n, rank) => `<li class="ws-twin${n.id === state.compare ? " is-b" : ""}" data-team="${n.id}" tabindex="0" title="Style distance ${fmt(n.d)}">
        <span class="ws-twin-rank">${rank}</span><span class="ws-teamcell">${App.flag(n.id, 16)}<span>${esc(App.team[n.id].name)}</span></span>
        <span class="ws-twin-bar"><b style="width:${Math.round((n.sim ?? 0) * 100)}%"></b></span><span class="ws-twin-val">${Math.round((n.sim ?? 0) * 100)}%</span></li>`;
      q("#ws-twins").innerHTML = !list.length ? `<li class="ws-empty">${esc(App.team[state.team].name)} has no matches in this scope.</li>`
        : list.map((n, i) => row(n, i + 1)).join("") + (bRank && bRank > list.length ? `<li class="ws-twin-sep" aria-hidden="true"></li>${row(near[bRank - 1], bRank)}` : "");
      q("#ws-twins").querySelectorAll("[data-team]").forEach((li) => {
        const id = li.dataset.team;
        li.onclick = () => choose(id); li.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(id); } };
        li.onmouseenter = () => highlight(id); li.onmouseleave = () => highlight(null);
      });
    }

    /* ---------- C · style map ---------- */
    function drawMap() {
      q("#ws-axes").hidden = state.view !== "custom";
      q("#ws-x").value = state.x; q("#ws-y").value = state.y;
      q("#ws-brush").setAttribute("aria-pressed", String(brushing));
      const host = q("#ws-map"), { svg, W, H } = svgFor(host, "Style map of all teams");
      svg.attr("class", "ws-map");
      const m = { l: 38, r: 16, t: 10, b: 30 }, ids = Object.keys(space.team);
      const pca = state.view === "pca" ? App.pca2(space) : null;
      pos = Object.fromEntries(ids.map((id) => [id, pca ? pca.project(space.team[id]) : [metric(id, state.x), metric(id, state.y)]]).filter(([, v]) => v.every(Number.isFinite)));
      const f = focused();
      let fpos = f ? (pca ? pca.project(space.match[f.key]) : [recordMetric(f, state.x), recordMetric(f, state.y)]) : null;
      if (fpos && !fpos.every(Number.isFinite)) fpos = null;
      const all = Object.values(pos).concat(fpos ? [fpos] : []);
      const [x, y] = [0, 1].map((i) => {
        let [lo, hi] = d3.extent(all, (p) => p[i]); if (lo == null) { lo = -1; hi = 1; } if (lo === hi) { lo -= 1; hi += 1; }
        const pad = (hi - lo) * 0.08;
        return d3.scaleLinear().domain([lo - pad, hi + pad]).nice().range(i ? [H - m.b, m.t] : [m.l, W - m.r]);
      });
      const grid = svg.append("g").attr("class", "grid");
      grid.selectAll(".v").data(x.ticks(8)).join("line").attr("x1", x).attr("x2", x).attr("y1", m.t).attr("y2", H - m.b);
      grid.selectAll(".h").data(y.ticks(6)).join("line").attr("y1", y).attr("y2", y).attr("x1", m.l).attr("x2", W - m.r);
      const axis = svg.append("g").attr("class", "axis");
      axis.selectAll(".xt").data(x.ticks(8)).join("text").attr("x", x).attr("y", H - m.b + 14).attr("text-anchor", "middle").text((d) => App.fix(d, d % 1 ? 1 : 0));
      axis.selectAll(".yt").data(y.ticks(6)).join("text").attr("x", m.l - 6).attr("y", (d) => y(d) + 4).attr("text-anchor", "end").text((d) => App.fix(d, d % 1 ? 1 : 0));
      const xl = pca ? `PC1 (${Math.round(pca.vars[0] * 100)}% of variance)` : `${metricById[state.x].label} (${metricById[state.x].unit})`;
      const yl = pca ? `PC2 (${Math.round(pca.vars[1] * 100)}%)` : `${metricById[state.y].label} (${metricById[state.y].unit})`;
      axis.append("text").attr("class", "title").attr("x", W - m.r).attr("y", H - 4).attr("text-anchor", "end").text(xl);
      axis.append("text").attr("class", "title").attr("x", m.l + 4).attr("y", m.t + 10).text(yl);
      if (!pca && ["xgd", "gd"].includes(state.x) && ["xgd", "gd"].includes(state.y) && state.x !== state.y) {
        const lo = Math.max(x.domain()[0], y.domain()[0]), hi = Math.min(x.domain()[1], y.domain()[1]);
        svg.append("line").attr("x1", x(lo)).attr("x2", x(hi)).attr("y1", y(lo)).attr("y2", y(hi)).attr("stroke", C.faint || "#b8c0c9").attr("stroke-dasharray", "4 4");
      }
      const P = (id) => [x(pos[id][0]), y(pos[id][1])];
      const links = svg.append("g").attr("pointer-events", "none");
      if (pos[state.team]) twins.filter((id) => pos[id] && id !== state.compare).forEach((id) => links.append("line").attr("x1", P(state.team)[0]).attr("y1", P(state.team)[1]).attr("x2", P(id)[0]).attr("y2", P(id)[1]).attr("stroke", C.twin).attr("stroke-opacity", 0.35).attr("stroke-width", 1.2));
      if (pos[state.team] && pos[state.compare]) links.append("line").attr("x1", P(state.team)[0]).attr("y1", P(state.team)[1]).attr("x2", P(state.compare)[0]).attr("y2", P(state.compare)[1]).attr("stroke", C.ink).attr("stroke-opacity", 0.5).attr("stroke-dasharray", "3 3").attr("stroke-width", 1.2);

      const order = { out: 0, in: 1, twin: 2, b: 3, a: 4 };
      const plotted = Object.keys(pos).sort((a, b) => order[role(a)] - order[role(b)]);
      const radius = { a: 7.5, b: 7.5, twin: 6, in: 4.6, out: 4 };
      const fill = (id) => {
        const r = role(id);
        if (state.color === "group") return r === "out" ? C.off : App.arch[App.team[id].archetype].color;
        return { a: C.a, b: C.b, twin: C.twin, in: C.dot, out: C.off }[r];
      };
      const marks = svg.append("g").selectAll("g").data(plotted).join("g").attr("class", "mark").attr("data-team", (id) => id)
        .attr("transform", (id) => `translate(${P(id)})`).attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", (id) => `${App.team[id].name}: set as B, Shift to set as A`);
      marks.append("circle").attr("class", "halo").attr("r", (id) => radius[role(id)] + 4.5);
      marks.append("circle").attr("r", (id) => radius[role(id)]).attr("fill", fill)
        .attr("stroke", (id) => (state.color === "group" && ["a", "b", "twin"].includes(role(id)) ? { a: C.a, b: C.b, twin: C.twin }[role(id)] : role(id) === "out" ? "#b5bcc5" : "#fff"))
        .attr("stroke-width", (id) => (state.color === "group" && ["a", "b", "twin"].includes(role(id)) ? 2.5 : role(id) === "out" ? 0.75 : 1.2));
      marks.on("click", (e, id) => choose(id, e.shiftKey ? "A" : "B"))
        .on("keydown", (e, id) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(id, e.shiftKey ? "A" : "B"); } })
        .on("mouseenter focus", (e, id) => highlight(id, { reveal: true })).on("mouseleave blur", () => highlight(null));

      const labelled = plotted.filter((id) => ["a", "b", "twin"].includes(role(id)));
      const labels = labelled.map((id) => ({ id, ax: P(id)[0], ay: P(id)[1], x: P(id)[0] + 14, y: P(id)[1] - 10 }));
      const sim = d3.forceSimulation(labels).force("x", d3.forceX((d) => d.ax + 14).strength(0.4)).force("y", d3.forceY((d) => d.ay - 10).strength(0.5))
        .force("collide", d3.forceCollide(13)).stop();
      for (let i = 0; i < 80; i++) sim.tick();
      const tc = { a: C.a, b: C.b, twin: C.twin };
      svg.append("g").selectAll("text").data(labels).join("text").attr("class", "code")
        .attr("x", (d) => Math.max(m.l + 12, Math.min(W - m.r - 12, d.x))).attr("y", (d) => Math.max(m.t + 10, Math.min(H - m.b - 4, d.y)))
        .attr("text-anchor", "middle").attr("fill", (d) => (state.color === "group" ? C.ink : tc[role(d.id)])).text((d) => d.id);
      svg.append("g").attr("class", "hover-label");

      if (fpos) {
        const [px, py] = [x(fpos[0]), y(fpos[1])];
        if (pos[f.team_id]) svg.append("line").attr("x1", px).attr("y1", py).attr("x2", P(f.team_id)[0]).attr("y2", P(f.team_id)[1]).attr("stroke", C.ink).attr("stroke-dasharray", "2 3").attr("pointer-events", "none");
        svg.append("path").attr("d", d3.symbol(d3.symbolDiamond, 120)()).attr("transform", `translate(${px},${py})`).attr("fill", "#fff").attr("stroke", C.ink).attr("stroke-width", 2).attr("pointer-events", "none");
        svg.append("text").attr("class", "code").attr("x", px + 10).attr("y", py + 16).attr("fill", C.ink).text(`${f.team_id} v ${f.opp_id}`);
      }
      if (!plotted.length) svg.append("text").attr("x", W / 2).attr("y", H / 2).attr("text-anchor", "middle").attr("fill", C.muted).text("No team has matches in this scope");
      if (brushing) {
        const brush = d3.brush().extent([[m.l, m.t], [W - m.r, H - m.b]]).on("end", (e) => {
          if (!e.sourceEvent) return;
          const s = e.selection;
          const cohort = s ? plotted.filter((id) => { const [px, py] = P(id); return px >= s[0][0] && px <= s[1][0] && py >= s[0][1] && py <= s[1][1]; }) : null;
          brushing = false; change({ cohort });
        });
        svg.append("g").attr("class", "brush").call(brush);
      }
      // legend
      const items = state.color === "group"
        ? App.data.archetypes.map((a) => `<span><i style="background:${a.color}"></i>${esc(groupName(a.id))}</span>`).join("") + `<span><i class="lg-out"></i>Filtered out</span>`
        : `<span translate="no"><i class="lg-a"></i>A</span><span translate="no"><i class="lg-b"></i>B</span><span><i class="lg-twin"></i>${K} closest to A</span><span><i class="lg-in"></i>In filter</span><span><i class="lg-out"></i>Filtered out</span>`;
      q("#ws-legend").innerHTML = items + (f ? `<span><i class="lg-match"></i>Selected match</span>` : "") + `<span class="lg-meta">${pca ? `PCA of ${state.dials.length} indicators` : "Team means in scope"}</span>`;
    }

    /* ---------- D · style profile ---------- */
    function drawProfile() {
      const host = q("#ws-profile"), { svg, W, H } = svgFor(host, "Style profiles of A and B");
      svg.attr("class", "ws-profile");
      const a = full.team[state.team], b = full.team[state.compare], f = focused();
      const extra = f ? { v: full.match[f.key], match: true } : hover && ![state.team, state.compare].includes(hover) && full.team[hover] ? { v: full.team[hover], id: hover } : null;
      const gap = (i) => (a && b ? Math.abs(a[i] - b[i]) : 0);
      let rows = App.dials.map((d, i) => ({ d, i, on: state.dials.includes(d) }));
      if (state.order === "gap") rows.sort((p, r) => (r.on - p.on) || gap(r.i) - gap(p.i));
      const vals = [a, b, extra?.v].filter(Boolean).flat().filter(Number.isFinite);
      const ext = Math.max(2, Math.ceil((d3.max(vals, Math.abs) || 2) * 2) / 2);
      const m = { l: 128, r: 46, t: 6, b: 26 };
      const x = d3.scaleLinear().domain([-ext, ext]).range([m.l, W - m.r]);
      const y = d3.scaleBand().domain(rows.map((r) => r.d)).range([m.t, H - m.b]).paddingInner(0.1);
      const cy = (d) => y(d) + y.bandwidth() / 2;
      rows.forEach((r, k) => { if (k % 2 === 0) svg.append("rect").attr("x", 0).attr("width", W).attr("y", y(r.d) - 1).attr("height", y.bandwidth() + 2).attr("fill", "#f9fafb"); });
      [-ext, -ext / 2, ext / 2, ext].forEach((v) => svg.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.grid));
      svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "#b9c0c8");
      rows.forEach((r) => {
        const yy = cy(r.d), op = r.on ? 1 : 0.32;
        svg.append("text").attr("class", `row-label${r.on ? "" : " off"}`).attr("x", m.l - 12).attr("y", yy + 4).attr("text-anchor", "end").text(r.d).append("title").text(App.dialInfo[r.d].help + (r.on ? "" : " (not used for similarity)"));
        if (!a || !b) return;
        const va = a[r.i], vb = b[r.i];
        svg.append("line").attr("x1", x(va)).attr("x2", x(vb)).attr("y1", yy).attr("y2", yy).attr("stroke", "#cfd5dc").attr("stroke-width", 4).attr("stroke-linecap", "round").attr("opacity", op);
        [[state.team, va, C.a], [state.compare, vb, C.b]].forEach(([id, v, col]) => {
          svg.append("circle").attr("data-team", id).attr("cx", x(v)).attr("cy", yy).attr("r", 5.5).attr("fill", col).attr("stroke", "#fff").attr("stroke-width", 1.5).attr("opacity", op)
            .append("title").text(`${App.team[id].name} · ${r.d}: ${App.signed(v, 2)} σ`);
        });
        if (extra?.v && Number.isFinite(extra.v[r.i])) svg.append("path").attr("d", d3.symbol(extra.match ? d3.symbolDiamond : d3.symbolCircle, extra.match ? 60 : 50)()).attr("transform", `translate(${x(extra.v[r.i])},${yy})`).attr("fill", "#fff").attr("stroke", C.ink).attr("stroke-width", 1.6).attr("opacity", op);
        svg.append("text").attr("class", "gap-label").attr("x", W - m.r + 8).attr("y", yy + 4).attr("opacity", op).text(`Δ ${App.fix(Math.abs(va - vb), 1)}`);
      });
      [-ext, 0, ext].forEach((v) => svg.append("text").attr("class", "axis-label").attr("x", x(v)).attr("y", H - 8).attr("text-anchor", v === -ext ? "start" : v === ext ? "end" : "middle").text(v === 0 ? "tournament average" : `${App.signed(v, 1)} σ`));
      svg.append("text").attr("class", "axis-label").attr("x", W - m.r + 8).attr("y", H - 8).text("gap");
      if (extra) svg.append("text").attr("class", "axis-label").attr("x", m.l - 12).attr("y", H - 8).attr("text-anchor", "end").text(extra.match ? `◇ ${f.team_id} v ${f.opp_id}` : `○ ${App.team[extra.id].name}`);
    }

    /* ---------- E · outcomes ---------- */
    function drawOutcomes() {
      const host = q("#ws-outcomes"), { svg, W, H } = svgFor(host, "Outcomes per match for A and B");
      const metrics = [["xg", "xG for"], ["goals", "Goals for"], ["xga", "xG against"], ["conceded", "Goals against"]];
      const ta = summaries[state.team], tb = summaries[state.compare];
      const twinAvg = Object.fromEntries(metrics.map(([k]) => [k, d3.mean(twins.filter((id) => id !== state.team), (id) => summaries[id][k])]));
      const m = { l: 92, r: 40, t: 4, b: 20 };
      const max = d3.max(metrics, ([k]) => d3.max([ta[k], tb[k], twinAvg[k], scopeAvg[k]].filter(Number.isFinite))) || 1;
      const x = d3.scaleLinear().domain([0, max * 1.08]).nice().range([m.l, W - m.r]);
      const y = d3.scaleBand().domain(metrics.map((d) => d[0])).range([m.t, H - m.b]).paddingInner(0.28);
      x.ticks(4).forEach((t) => { svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.grid); svg.append("text").attr("x", x(t)).attr("y", H - 5).attr("text-anchor", "middle").attr("fill", C.muted).attr("font-size", 11).text(App.fix(t, t % 1 ? 1 : 0)); });
      svg.append("text").attr("x", m.l - 10).attr("y", H - 5).attr("text-anchor", "end").attr("fill", C.muted).attr("font-size", 11).text("per match");
      const bh = Math.min(11, y.bandwidth() / 2 - 1);
      metrics.forEach(([k, label]) => {
        const y0 = y(k) + y.bandwidth() / 2 - bh - 1;
        svg.append("text").attr("x", m.l - 10).attr("y", y(k) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").attr("fill", C.ink).text(label);
        [[state.team, ta[k], C.a], [state.compare, tb[k], C.b]].forEach(([id, v, col], i) => {
          const yy = y0 + i * (bh + 2), ok = Number.isFinite(v);
          const g = svg.append("g").attr("data-team", id);
          g.append("rect").attr("x", m.l).attr("y", yy).attr("width", ok ? Math.max(0, x(v) - m.l) : 0).attr("height", bh).attr("rx", 2).attr("fill", col);
          g.append("text").attr("x", (ok ? x(v) : m.l) + 5).attr("y", yy + bh - 1.5).attr("fill", col).attr("font-size", 11).attr("font-weight", 600).text(fmt(v));
          g.on("mouseenter", () => highlight(id)).on("mouseleave", () => highlight(null));
        });
        const tick = (v, col, dash, title) => { if (!Number.isFinite(v)) return; svg.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", y(k) - 2).attr("y2", y(k) + y.bandwidth() + 2).attr("stroke", col).attr("stroke-width", 2).attr("stroke-dasharray", dash).append("title").text(`${title}: ${fmt(v)}`); };
        tick(scopeAvg[k], "#9aa3ae", "2 2", "Tournament average");
        tick(twinAvg[k], C.twin, null, `Average of A's ${K} closest twins`);
      });
    }

    /* ---------- F · match evidence ---------- */
    function drawMatches() {
      const rows = [state.team, state.compare].flatMap((id) => A.rows(id, state.scope).sort((a, b) => a.number - b.number));
      const f = focused();
      q("#ws-match-count").textContent = `${rows.length} matches`;
      const ext = d3.max(rows, (r) => Math.abs(A.metric(r, "xgd") ?? 0)) || 1;
      q("#ws-matches tbody").innerHTML = rows.map((r) => {
        const v = A.metric(r, "xgd"), w = Math.min(50, (Math.abs(v ?? 0) / ext) * 50), col = r.team_id === state.team ? C.a : C.b;
        return `<tr data-match="${r.key}" data-team="${r.team_id}" tabindex="0" class="${r.key === state.match ? "is-focus" : ""}" aria-selected="${r.key === state.match}" aria-label="${esc(App.team[r.team_id].name)} against ${esc(App.team[r.opp_id].name)}">
          <td><span class="ws-team-tag" translate="no" style="color:${col}">${r.team_id}</span></td>
          <td><span class="opp">${App.flag(r.opp_id, 15)}<span>${esc(App.team[r.opp_id].name)}</span></span></td>
          <td class="stage">${esc(App.stageShort(r.stage))}</td>
          <td><span class="score">${r.goals}–${r.goals_opp}</span><span class="ws-res ${r.result}">${r.result}</span></td>
          <td class="num"><span class="ws-bar"><i><b style="${(v ?? 0) >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`}"></b></i><span>${App.signed(v, 2)}</span></span></td></tr>`;
      }).join("") || `<tr><td colspan="5" class="ws-empty">No matches in this scope.</td></tr>`;
      q("#ws-matches tbody").querySelectorAll("tr[data-match]").forEach((row) => {
        const pick = () => change({ match: row.dataset.match === state.match ? null : row.dataset.match });
        row.onclick = pick; row.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } };
        row.onmouseenter = () => highlight(row.dataset.team); row.onmouseleave = () => highlight(null);
      });
      const ret = A.query(state.dials, { return: stateUrl(state) });
      q("#ws-match-actions").innerHTML = f
        ? `<span class="ws-match-sel" title="Placed in C and D">◇ <b>${f.team_id} ${f.goals}–${f.goals_opp} ${f.opp_id}</b> · ${esc(App.stageShort(f.stage))}</span><span class="ws-spacer"></span>
           <a class="ws-link" href="#/match/${f.match_id}${esc(ret)}">Replay ↗</a><a class="ws-link" href="#/lab/${f.match_id}${esc(A.query(state.dials, { team: f.team_id, return: stateUrl(state) }))}">Match Lab ↗</a><button type="button" class="ws-link" id="ws-clear-match">Clear</button>`
        : `<span class="ws-spacer"></span><a class="ws-link" href="#/twins/${state.team}/${state.compare}${esc(A.query(state.dials, { scope: state.scope, return: stateUrl(state) }))}">Full pair report ↗</a>`;
      q("#ws-clear-match")?.addEventListener("click", () => change({ match: null }));
    }

    /* ---------- linking ---------- */
    function readout() {
      const el = q("#ws-readout"), id = hover;
      const show = id && summaries[id] ? id : state.team;
      if (!summaries[show]) { el.innerHTML = ""; return; }
      const t = App.team[show], s = summaries[show], r = show === state.team ? null : rankOf(show);
      el.innerHTML = `${App.flag(show, 14)}<b>${esc(t.name)}</b><span>${esc(groupName(t.archetype))}</span><span class="sep">|</span><span>${s.n} matches</span><span class="sep">|</span>
        <span>xG diff. ${App.signed(s.xgd, 2)}</span><span class="sep">|</span><span>goal diff. ${App.signed(s.gd, 2)}</span>${r ? `<span class="sep">|</span><span>#${r} closest to ${esc(state.team)}</span>` : ""}`;
    }
    function highlight(id, { reveal = false } = {}) {
      if (hover === id) return;
      hover = id;
      qa("[data-team]").forEach((el) => el.classList.toggle("is-hover", el.dataset.team === id));
      const svg = q("#ws-map svg");
      if (svg) {
        const layer = d3.select(svg).select(".hover-label"); layer.selectAll("*").remove();
        const mark = id && q(`#ws-map .mark[data-team="${id}"]`);
        if (mark && !["a", "b", "twin"].includes(role(id))) {
          const [px, py] = mark.getAttribute("transform").match(/-?[\d.]+/g).map(Number);
          layer.append("text").attr("class", "code").attr("x", px).attr("y", py - 10).attr("text-anchor", "middle").attr("fill", C.ink).text(id);
        }
      }
      if (reveal && id) {
        const row = q(`#ws-teams tr[data-team="${id}"]`), box = q("#ws-team-scroll");
        if (row && box) { const r = row.getBoundingClientRect(), s = box.getBoundingClientRect(); if (r.top < s.top + 30) box.scrollTop -= s.top + 30 - r.top; else if (r.bottom > s.bottom) box.scrollTop += r.bottom - s.bottom; }
      }
      readout(); drawProfile();
    }

    const redraw = () => { if (!root.isConnected) return; drawMap(); drawProfile(); drawOutcomes(); };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(redraw); };
    render();
    App.onViewport(schedule); App.onResize(q("#ws-map"), schedule); App.onResize(q("#ws-profile"), schedule);
    const onLang = () => { visible = matching(); drawCollection(); drawSimilarity(); redraw(); };
    window.addEventListener("languagechange", onLang);
    App._stop = () => { clearTimeout(searchTimer); cancelAnimationFrame(frame); window.removeEventListener("languagechange", onLang); };
    return { update(p) { state = stateFrom(p); render(); } };
  }

  App.views.story = workspace;
  App.views.styles = workspace;
})();
