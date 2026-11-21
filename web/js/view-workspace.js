/* Linked team exploration on #/story and #/styles. The URL holds committed
 * choices. Hover, keyboard focus and brush gestures are transient. */
(function () {
  "use strict";
  const App = window.App, A = App.analysis;
  const C = { a: "#2f6bd8", b: "#e0702a", twin: "#129a86", dot: "#8f99a5", off: "#dde1e6", ink: "#18202b", ink2: "#465161", muted: "#7d8794", faint: "#b8c0c9", line: "#e4e7eb", grid: "#eef0f3" };
  const K = 5; // twins of A highlighted across views
  const measures = [
    { id: "xgd", label: "xG difference", unit: "per match" }, { id: "gd", label: "Goal difference", unit: "per match" },
    { id: "xg", label: "Expected goals", unit: "per match" }, { id: "xga", label: "Expected goals against", unit: "per match" },
    { id: "goals", label: "Goals scored", unit: "per match" }, { id: "conceded", label: "Goals conceded", unit: "per match" },
    { id: "shots", label: "Attempts", unit: "per match" },
    ...App.dials.map((d, i) => ({ id: `dial${i}`, label: App.indicator(d).label, unit: App.indicator(d).unit })),
  ];
  const metricById = Object.fromEntries(measures.map((m) => [m.id, m]));
  const recordByKey = Object.fromEntries(A.records.map((r) => [r.key, r]));
  const groupName = App.groupLabel;
  const fmt = (v, n = 2) => (Number.isFinite(v) ? App.fix(v, n) : "–");
  const num = (v) => (v != null && v !== "" && Number.isFinite(+v) ? +v : null);
  const esc = App.esc;
  const escapeHint = '<kbd translate="no" aria-hidden="true">Esc</kbd>';
  const ICON = {
    swap: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 5h9m0 0-2.5-2.5M13 5l-2.5 2.5M12 11H3m0 0 2.5-2.5M3 11l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9.3 9.3 12.5 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    x: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    brush: '<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 2"/></svg>',
  };

  const colourOptions = [["state", "Selection"], ["group", "Style group"],
    ...App.dials.map((dial, i) => [`dial${i}`, App.indicator(dial).label])];
  function pairRegionFrom(value) {
    if (!value) return null;
    const bounds = value.split(",").map(num);
    if (bounds.length !== 4 || !bounds.every(Number.isFinite)) return null;
    const [left, right, bottom, top] = bounds;
    return left >= 0 && left < right && right <= 100 && bottom >= 0 && bottom < top ? bounds : null;
  }

  function stateFrom(p) {
    const dials = A.readDials(p), scope = ["group", "knockout"].includes(p.scope) ? p.scope : "all";
    const validTeam = (id) => Object.hasOwn(App.team, id);
    const team = validTeam(p.team) ? p.team : validTeam(p.compare) ? p.compare : null;
    const compare = validTeam(p.compare) && p.compare !== team ? p.compare : null;
    // With a single indicator in the link, both views open on that measure.
    // When both encodings are specified, honour each independently.
    const requestedOrder = App.workspaceHeatmap.sortKey(p.heatSort);
    const color = colourOptions.some(([key]) => key === p.color) ? p.color
      : requestedOrder.startsWith("dial") ? requestedOrder : "dial0";
    const heatSort = App.workspaceHeatmap.sortKey(p.heatSort, color.startsWith("dial") ? color : "group");
    const match = recordByKey[p.match];
    // Older links offered possession both as an outcome and as the first style dial.
    const axis = (value, fallback) => value === "poss" ? "dial0" : Object.hasOwn(metricById, value) ? value : fallback;
    return {
      team, compare, dials, scope, heatSort: heatSort === "near" && !team ? "group" : heatSort,
      arch: Object.hasOwn(App.arch, p.arch) ? p.arch : "", search: p.search || "",
      view: ["pairs", "custom"].includes(p.view) ? p.view : "pca",
      pairRegion: p.view === "pairs" ? pairRegionFrom(p.pairRegion) : null, x: axis(p.x, "xgd"), y: axis(p.y, "gd"),
      color, order: p.order === "gap" ? "gap" : "fixed", lens: compare && p.lens === "difference" ? "difference" : "absolute",
      cohort: p.cohort ? [...new Set(p.cohort.split(",").filter(validTeam))] : null,
      xlo: num(p.xlo), xhi: num(p.xhi), glo: num(p.glo), ghi: num(p.ghi),
      sort: ["name", "group", "n", "xgd", "gd"].includes(p.sort) ? p.sort : "xgd", desc: p.desc !== "0",
      match: match && [team, compare].includes(match.team_id) && A.inScope(match, scope) ? match.key : null,
    };
  }
  function stateUrl(s) {
    const defaultEncoding = s.color === "dial0" && s.heatSort === "dial0";
    return `#/styles${A.query(s.dials, {
      team: s.team, compare: s.compare, heatSort: defaultEncoding ? null : s.heatSort, scope: s.scope === "all" ? null : s.scope, arch: s.arch, search: s.search,
      view: s.view === "pca" ? null : s.view, x: s.view === "custom" ? s.x : null, y: s.view === "custom" ? s.y : null,
      pairRegion: s.view === "pairs" && s.pairRegion ? s.pairRegion.join(",") : null,
      color: defaultEncoding ? null : s.color, order: s.order === "fixed" ? null : s.order,
      lens: s.compare && s.lens === "difference" ? s.lens : null,
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
    let space, full, twins, near, summaries, scopeAvg, visible = [], pos = {}, hover = null, touchBrushArmed = false, frame = null;
    let nearByTeam, pca, mapRanks = new Map(), previewIndicator = null;
    let brushPreview = null;
    let activeBrush = null;
    let lastProjection, lastPins;
    const coarsePointer = window.matchMedia("(any-pointer: coarse)");
    const hasTouch = () => coarsePointer.matches || navigator.maxTouchPoints > 0;
    const q = (s) => root.querySelector(s);
    const qa = (s) => root.querySelectorAll(s);

    root.innerHTML = `<div class="ws">
      <div class="ws-heading"><div><h1>Team style explorer</h1><p>World Cup 2026 <span aria-hidden="true">·</span> <span id="ws-scope-size"></span></p></div>
        <div class="ws-scope-control"><span class="ws-context-label">Match scope</span>
        ${seg("ws-scope", [["all", "Full tournament"], ["group", "Group stage"], ["knockout", "Knockout"]], "Match scope")}</div>
      </div>
      <div class="ws-context" role="region" aria-label="Current comparison">
        <div class="ws-pair">
          <div class="ws-pick" data-side="A"><b class="ws-side" translate="no">A</b><div id="ws-pick-a"></div></div>
          <button type="button" class="ws-swap" id="ws-swap" title="Swap A and B" aria-label="Swap A and B">${ICON.swap}</button>
          <div class="ws-pick" data-side="B"><b class="ws-side" translate="no">B</b><div id="ws-pick-b"></div></div>
        </div>
        <p class="ws-summary" id="ws-summary" aria-live="polite"></p>
        <button type="button" class="ws-link" id="ws-to-analysis" hidden>Similar teams</button>
        <button type="button" class="ws-link" id="ws-to-waterfall" hidden>Explain outcome gap</button>
        <button type="button" class="ws-btn" id="ws-reset">Reset view</button>
      </div>
      <div class="ws-filters" role="region" aria-label="Team filters">
        <label class="ws-search">${ICON.search}<span class="sr-only">Search teams</span><input id="ws-search" type="search" placeholder="Search teams" autocomplete="off"></label>
        <label class="ws-filter-label"><span>Original style group</span><select id="ws-group" aria-label="Original style group">${selectOptions([["", "All style groups"], ...App.data.archetypes.map((a) => [a.id, groupName(a.id)])])}</select></label>
        <details class="ws-range-filters"><summary>Outcome ranges</summary><div>
          ${dual("ws-range-xgd", "xG diff.")}${dual("ws-range-gd", "Goal diff.")}
        </div></details>
        <div class="ws-chips-row" id="ws-chips" hidden></div>
        <span id="ws-count" aria-live="polite"></span>
      </div>
      <div class="ws-primary">
        <div class="ws-overview-tools">
          <label id="ws-colour-control"><span>Map colour</span> <select id="ws-color" aria-label="Map colour">${selectOptions(colourOptions)}</select></label>
          <div class="ws-legend ws-map-colour-key" id="ws-legend"></div>
        </div>
        ${panel("C", "Style Map", seg("ws-view", [["pca", "PCA"], ["custom", "X / Y"], ["pairs", "Team pairs"]], "Map view"),
          `<div class="ws-map-controls">
             <span class="ws-pc-label" id="ws-pair-unit" hidden>One dot per team pair.</span>
             <button type="button" class="ws-link" id="ws-clear-pair-region" aria-keyshortcuts="Escape" hidden><span>Clear pair selection</span> ${escapeHint}</button>
             <button type="button" class="ws-btn" id="ws-brush" hidden aria-pressed="false" title="Drag a rectangle to filter teams">${ICON.brush}Brush</button></div>
             <div id="ws-axes" hidden><label>X <select id="ws-x" aria-label="X axis">${selectOptions(measures.map((m) => [m.id, m.label]))}</select></label>
             <label>Y <select id="ws-y" aria-label="Y axis">${selectOptions(measures.map((m) => [m.id, m.label]))}</select></label></div>
           <div id="ws-pairs" hidden></div>
           <div class="ws-chart ws-map" id="ws-map"></div>
           <p class="ws-projection" id="ws-projection"></p>
           <div class="ws-readout" id="ws-readout" aria-live="polite"></div>`)}
        <div class="ws-gutter" role="separator" aria-orientation="vertical" aria-label="Resize map and heatmap" aria-valuemin="32" aria-valuemax="65" tabindex="0" title="Drag to resize · double-click to reset"></div>
        ${panel("G", "Style DNA Heatmap", "", '<div id="ws-heat"></div>')}
      </div>
      <div class="ws-details">
        ${panel("B", "Similar teams", "",
          `<div class="ws-sim-input">
             <div class="ws-sim-head"><span>Similarity indicators <b id="ws-dial-count"></b></span><button type="button" class="ws-link" id="ws-dials-all">Select all</button></div>
             <div class="ws-dials" id="ws-dials">${App.dials.map((d, i) => `<label class="ws-check" title="${esc(App.indicator(d).help)}"><input type="checkbox" data-i="${i}"><span>${esc(App.indicator(d).label)}</span></label>`).join("")}</div>
           </div>
           <div class="ws-twins-cap"><span>#</span><span id="ws-twins-title"></span><span>Similarity percentile</span></div>
           <div class="ws-scroll"><ol class="ws-twins" id="ws-twins"></ol></div>
           <p class="ws-reference" id="ws-sim-reference"></p>`)}
        ${panel("D", "Style Profile <span class=\"ws-count\" title=\"Team mean, standard deviations from the tournament average\">z-score</span>",
          seg("ws-lens", [["absolute", "Absolute profiles"], ["difference", "Difference view"]], "Style comparison mode"),
          `<div class="lens-tools"><span class="ws-pc-label">Order</span>${seg("ws-order", [["fixed", "Fixed"], ["gap", "By gap"]], "Indicator order")}</div>
           <div id="ws-profile"></div>`)}
        ${panel("E", "Outcomes <span class=\"ws-count\">per match</span>", "",
          `<div class="ws-legend" id="ws-outcome-key"></div>
           <div class="ws-chart ws-outcomes" id="ws-outcomes"></div>`)}
        ${panel("W", "Outcome gap waterfall", "", '<div id="ws-waterfall"></div>')}
        ${panel("F", 'Match evidence<span class="ws-count" id="ws-match-count"></span>', "",
          `<div class="ws-scroll"><table class="ws-table ws-matches" id="ws-matches"><thead><tr>
             <th scope="col">Team</th><th scope="col">Opponent</th><th scope="col">Stage</th><th scope="col">Score</th><th scope="col" class="num">xG diff.</th>
           </tr></thead><tbody></tbody></table></div>
           <div class="ws-match-actions" id="ws-match-actions"></div>`)}
        ${panel("A", "Team Table", '<button type="button" class="ws-btn" id="ws-export" title="Download the filtered rows as CSV">Export CSV</button>',
          `<div class="ws-scroll" id="ws-team-scroll"><table class="ws-table" id="ws-teams"><colgroup><col class="c-pin"><col><col class="c-grp"><col class="c-n"><col class="c-xgd"><col class="c-gd"></colgroup><thead><tr>
             <th scope="col"><span class="sr-only">Pin</span></th>
             ${[["name", "Team", "Sort by name"], ["group", "Style group", "Original style group"], ["n", "Matches", "Matches in scope"], ["xgd", "xG diff.", "xG difference per match"], ["gd", "Goal diff.", "Goal difference per match"]].map(([id, t, tip]) => `<th scope="col" class="${["n", "xgd", "gd"].includes(id) ? "num" : ""}"><button type="button" data-sort="${id}" title="${tip}">${t}<span aria-hidden="true"></span></button></th>`).join("")}
           </tr></thead><tbody></tbody></table></div>`)}
      </div>
    </div>`;

    // Persist the relative widths so the same split works at different desktop sizes.
    const primary = q(".ws-primary"), gutter = q(".ws-gutter");
    const layoutKey = "style-twins-map-width";
    function resize(percent, persist) {
      const width = Math.max(32, Math.min(65, percent));
      primary.style.setProperty("--map-width", width + "%");
      gutter.setAttribute("aria-valuenow", Math.round(width));
      if (persist) { try { localStorage.setItem(layoutKey, width); } catch (_) {} }
    }
    let initialWidth = 45;
    try { initialWidth = Number(localStorage.getItem(layoutKey)) || 45; } catch (_) {}
    resize(initialWidth, false);
    gutter.onpointerdown = (e) => {
      if (e.button !== 0) return;
      gutter.setPointerCapture(e.pointerId);
      const rect = primary.getBoundingClientRect();
      gutter.onpointermove = (event) => {
        const x = getComputedStyle(primary).direction === "rtl" ? rect.right - event.clientX : event.clientX - rect.left;
        resize(100 * x / rect.width, false);
      };
    };
    gutter.onlostpointercapture = () => { gutter.onpointermove = null; resize(+gutter.getAttribute("aria-valuenow"), true); };
    gutter.ondblclick = () => resize(45, true);
    gutter.onkeydown = (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const sign = getComputedStyle(primary).direction === "rtl" ? -1 : 1;
      resize(+gutter.getAttribute("aria-valuenow") + sign * (e.key === "ArrowRight" ? 2 : -2), true);
    };

    /* ---------- state changes ---------- */
    const change = (patch, { replace = false } = {}) => { App.tip.hide(); App.go(stateUrl({ ...state, ...patch }), { replace }); };
    const choose = (id, side) => {
      if (!side && (id === state.team || id === state.compare)) return;
      side = side || (state.team ? "B" : "A");
      if (!id) {
        change(side === "A" ? { team: null, compare: null, match: null } : { compare: null, match: null });
      } else if (!state.team || side === "A") {
        change({ team: id, compare: id === state.compare ? state.team : state.compare, match: null });
      } else if (id !== state.team) {
        change({ compare: id, match: null });
      } else if (state.compare) {
        change({ team: state.compare, compare: id, match: null });
      } else {
        pickB.set("");
      }
    };
    const picker = (side, value, emptyLabel) => App.ui.select("ws-pick-" + side.toLowerCase(), {
      options: App.ui.teamOptions([{ value: "", label: emptyLabel }]), value: value || "", keepLabel: true,
      searchable: true, placeholder: "Choose team", ariaLabel: "Team " + side, onChange: (id) => choose(id, side),
    });
    const pickA = picker("A", state.team, "Clear teams");
    const pickB = picker("B", state.compare, "Clear comparison");
    const selectEncoding = (value) => change(value.startsWith("dial") ? { color: value, heatSort: value } : { color: value });
    const heat = App.workspaceHeatmap(q("#ws-heat"), {
      choose, highlight, inspectIndicator,
      sortBy(value) {
        if (state.view !== "pairs" && value.startsWith("dial")) selectEncoding(value);
        else change({ heatSort: value });
      },
    });
    const lens = App.workspaceLens(q("#ws-profile"), heat.markLensColumn);
    const pairView = App.workspacePairs(q("#ws-pairs"), {
      choosePair(first, second) {
        const keepA = state.team === second;
        change({ team: keepA ? second : first, compare: keepA ? first : second, match: null, view: "pca", pairRegion: null });
        q("#ws-view [data-v='pca']").focus({ preventScroll: true });
      },
      setRegion: (region) => commitBrush({ pairRegion: region }), setupBrush, hasTouch,
    });
    q("#ws-clear-pair-region").onclick = () => change({ pairRegion: null });
    function focusPanel(id) {
      const heading = q(`#ws-${id}-title`);
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: "start" });
    }
    q("#ws-to-analysis").onclick = () => focusPanel(state.compare && full.team[state.compare] && full.team[state.team] ? "D" : "B");
    q("#ws-to-waterfall").onclick = () => focusPanel("W");
    q("#ws-swap").onclick = () => change({ team: state.compare, compare: state.team, match: null });
    const segBind = (id, key, extra = {}) => q(`#${id}`).addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b && b.dataset.v !== state[key]) change({ [key]: b.dataset.v, ...extra }); });
    segBind("ws-scope", "scope", { pairRegion: null, cohort: null, match: null, xlo: null, xhi: null, glo: null, ghi: null });
    q("#ws-view").onclick = (e) => {
      const view = e.target.closest("button[data-v]")?.dataset.v;
      if (view && view !== state.view) change({ view, pairRegion: null, cohort: view === "pairs" || state.view === "pairs" ? state.cohort : null });
    };
    q("#ws-color").onchange = (e) => selectEncoding(e.target.value);
    segBind("ws-order", "order");
    segBind("ws-lens", "lens");
    q("#ws-reset").onclick = () => {
      clearTimeout(searchTimer);
      touchBrushArmed = false;
      q(".ws-range-filters").open = false;
      if (location.hash === "#/styles") render();
      else App.go("#/styles");
    };
    let searchTimer;
    q("#ws-search").oninput = (e) => { clearTimeout(searchTimer); const v = e.target.value; searchTimer = setTimeout(() => change({ search: v }, { replace: true }), 180); };
    q("#ws-group").onchange = (e) => change({ arch: e.target.value });
    q("#ws-x").onchange = (e) => change({ x: e.target.value, cohort: null });
    q("#ws-y").onchange = (e) => change({ y: e.target.value, cohort: null });
    q("#ws-brush").onclick = () => { touchBrushArmed = !touchBrushArmed; drawMap(); readout(); };
    q("#ws-dials-all").onclick = () => change({ dials: App.dials.slice(), cohort: null, pairRegion: null });
    q("#ws-dials").onchange = (e) => {
      const b = e.target.closest("[data-i]"); if (!b) return;
      const dial = App.dials[+b.dataset.i], on = state.dials.includes(dial);
      if (on && state.dials.length <= 2) { b.checked = true; return; }
      change({ dials: on ? state.dials.filter((d) => d !== dial) : App.dials.filter((d) => d === dial || state.dials.includes(d)), cohort: null, pairRegion: null });
    };
    qa("[data-sort]").forEach((b) => (b.onclick = () => change({ sort: b.dataset.sort, desc: b.dataset.sort === state.sort ? !state.desc : b.dataset.sort !== "name" && b.dataset.sort !== "group" })));
    q("#ws-export").onclick = () => {
      const rows = [["team", "style_group", "matches", "xg_difference_per_match", "goal_difference_per_match", "style_distance_from_A"],
        ...visible.map((id) => [App.team[id].name, App.arch[App.team[id].archetype].name.replace(/^The /, ""), summaries[id].n, summaries[id].xgd, summaries[id].gd, distanceTo(id)])];
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
    function metric(id, key) { if (key.startsWith("dial")) return d3.mean(A.rows(id, state.scope), (r) => r.dials[+key.slice(4)]); return summaries[id]?.[key] ?? null; }
    function recordMetric(row, key) { if (key.startsWith("dial")) return row.dials[+key.slice(4)]; if (key === "conceded") return row.goals_opp; return A.metric(row, key); }
    function distanceTo(id) { return space.team[state.team] && space.team[id] ? App.dist(space.team[state.team], space.team[id]) : null; }
    function rankOf(id) { const i = near.findIndex((n) => n.id === id); return i < 0 ? null : i + 1; }
    function matching(cohort = state.cohort) {
      const needle = state.search.trim().toLocaleLowerCase();
      return Object.keys(space.team).filter((id) => {
        const t = App.team[id], s = summaries[id], local = App.i18n?.t(t.name) || t.name;
        return (!state.arch || t.archetype === state.arch) && (!cohort || cohort.includes(id))
          && (!needle || `${t.name} ${local} ${id}`.toLocaleLowerCase().includes(needle))
          && (state.xlo === null || s.xgd >= state.xlo) && (state.xhi === null || s.xgd <= state.xhi)
          && (state.glo === null || s.gd >= state.glo) && (state.ghi === null || s.gd <= state.ghi);
      });
    }
    const focused = () => (state.match ? recordByKey[state.match] : null);
    const role = (id, population = visible) => (id === state.team ? "a" : id === state.compare ? "b" : !population.includes(id) ? "out" : twins.includes(id) ? "twin" : "in");

    function render() {
      brushPreview = null;
      space = A.space(state.dials, state.scope);
      full = A.space(App.dials, state.scope);
      nearByTeam = A.twinTable(space).near;
      near = nearByTeam[state.team] || [];
      twins = near.slice(0, K).map((n) => n.id);
      summaries = Object.fromEntries(App.teams.map((t) => [t.id, A.summary(A.rows(t.id, state.scope))]));
      scopeAvg = A.summary(A.records.filter((r) => A.inScope(r, state.scope)));
      visible = matching();
      hover = null;
      previewIndicator = null;
      const isPairs = state.view === "pairs";
      pca = state.view === "pca" ? App.pca2(space) : null;
      pos = isPairs ? {} : Object.fromEntries(Object.keys(space.team).map((id) =>
        [id, pca ? pca.project(space.team[id]) : [metric(id, state.x), metric(id, state.y)]]).filter(([, xy]) => xy.every(Number.isFinite)));
      // Rank in PCA coordinates, independent of the plot's aspect ratio and filters.
      mapRanks = new Map();
      if (pca && pos[state.team]) {
        Object.keys(pos).filter((id) => id !== state.team)
          .map((id) => ({ id, d: App.dist(pos[state.team], pos[id]) }))
          .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))
          .forEach(({ id }, i) => mapRanks.set(id, i + 1));
      }
      for (const sel of ["#ws-map", ".ws-overview-tools", "#ws-projection", "#ws-readout"]) q(sel).hidden = isPairs;
      q("#ws-pairs").hidden = !isPairs;
      q("#ws-pair-unit").hidden = !isPairs;
      q("#ws-clear-pair-region").hidden = !isPairs || !state.pairRegion;
      q("#ws-readout").classList.toggle("has-reference", !!space.team[state.team]);
      q("#ws-color").value = state.color;
      q(".ws-details").classList.toggle("has-team", !!state.team);
      for (const id of ["D", "F"]) q(`[data-panel="${id}"]`).hidden = !state.team;
      q('[data-panel="E"]').hidden = !state.compare;
      drawContext(); drawCollection(); drawSimilarity(); heat.render({ state, full, visible, summaries, near, twins });
      if (isPairs) {
        heat.markIndicator(null);
        pairView.render({ visible, nearByTeam, summaries, region: state.pairRegion, touchArmed: touchBrushArmed, scope: state.scope, dials: state.dials });
      }
      drawMap(!isPairs); drawProfile(); drawOutcomes(); drawMatches(); readout();
      const projection = pca ? state.scope + "|" + state.dials.join(",") : "";
      const pins = [state.team, state.compare].join("|");
      if (projection && lastProjection && projection !== lastProjection) {
        // A refit changes the coordinate system. Reveal the new projection as a whole.
        q("#ws-map svg").classList.add("ws-reveal");
      } else if (state.team && lastPins !== undefined && pins !== lastPins) {
        qa("#ws-map .relationship, .hm-side, #ws-twins .is-b .ws-twin-rank").forEach((node) => node.classList.add("ws-reveal"));
      }
      lastProjection = projection;
      lastPins = pins;
      q('[data-panel="W"]').hidden = !state.compare;
      if (state.compare) App.outcomeWaterfall(q("#ws-waterfall"), {
        a: state.team, b: state.compare, scope: state.scope, sums: [summaries[state.team], summaries[state.compare]],
        inspectMatch(key) {
          change({ match: key, lens: "absolute" });
          const row = q(`#ws-matches tr[data-match="${key}"]`);
          row?.focus({ preventScroll: true });
          row?.scrollIntoView({ block: "center" });
        },
      });
    }

    /* ---------- context bar ---------- */
    function drawContext() {
      pickA.set(state.team || ""); pickB.set(state.compare || "");
      q("#ws-pick-b .sel-btn").disabled = !state.team;
      q("#ws-swap").disabled = !state.compare;
      q("#ws-to-analysis").hidden = !state.team;
      const hasPair = !!(full.team[state.team] && full.team[state.compare]);
      q("#ws-to-analysis").textContent = hasPair ? "Compare profiles" : "Similar teams";
      q("#ws-to-waterfall").hidden = !hasPair;
      q("#ws-lens").hidden = !hasPair;
      q(".lens-tools").hidden = !hasPair;
      q('#ws-order [data-v="gap"]').disabled = !hasPair;
      [["#ws-scope", state.scope], ["#ws-view", state.view], ["#ws-order", hasPair ? state.order : "fixed"], ["#ws-lens", hasPair ? state.lens : "absolute"]].forEach(([s, v]) => q(s).querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v))));
      q("#ws-scope-size").textContent = `${Object.keys(space.team).length} teams · ${scopeAvg.n / 2} matches`;
      const missing = [state.team, state.compare].find((id) => id && !space.team[id]);
      const rank = rankOf(state.compare);
      const summary = q("#ws-summary");
      summary.classList.toggle("metrics", !!rank);
      if (rank) {
        const percentile = near[rank - 1].sim * 100, pairs = near.length * (near.length + 1) / 2;
        const gap = summaries[state.team].gd - summaries[state.compare].gd;
        const scope = { all: "Full tournament", group: "Group stage", knockout: "Knockout" }[state.scope];
        summary.innerHTML = `<span aria-describedby="ws-sim-reference" title="Percentile: share of the ${pairs} team pairs in scope at least this far apart."><span>Similarity percentile</span> <b>${fmt(percentile,1)}%</b> <small title="Style similarity rank">#${rank}/${near.length}</small></span>
          <span><span>GD gap per match (A − B)</span> <b>${App.signed(gap,2)}</b></span>
          <span>${state.dials.length} indicators</span><span>${scope}</span>`;
      } else {
        summary.textContent = missing ? `${App.team[missing].name} has no matches in this scope.`
          : state.team ? "Select another team to compare." : "Choose a team from the map or heatmap.";
      }
    }

    /* ---------- A · team collection ---------- */
    function drawCollection() {
      if (q("#ws-search").value !== state.search) q("#ws-search").value = state.search;
      q("#ws-group").value = state.arch;
      Object.entries(ranges).forEach(([key, r]) => {
        const vals = Object.keys(space.team).map((id) => summaries[id][key]).filter(Number.isFinite);
        const min = Math.floor((d3.min(vals) ?? -1) * 10) / 10, max = Math.ceil((d3.max(vals) ?? 1) * 10) / 10;
        [r.lo, r.hi].forEach((i) => { i.min = min; i.max = max; i.step = 0.1; });
        r.lo.value = state[r.loKey] ?? min; r.hi.value = state[r.hiKey] ?? max; r.paint();
      });
      const chips = [];
      if (state.cohort) chips.push(["cohort", `Teams in map selection · ${state.cohort.length}`]);
      if (state.xlo !== null || state.xhi !== null) chips.push(["xgd", "xG diff. " + ranges.xgd.lo.value + " … " + ranges.xgd.hi.value]);
      if (state.glo !== null || state.ghi !== null) chips.push(["gd", "Goal diff. " + ranges.gd.lo.value + " … " + ranges.gd.hi.value]);
      q("#ws-chips").hidden = !chips.length;
      q("#ws-chips").innerHTML = chips.map(([k, t]) => {
        const shortcut = k === "cohort" && !state.pairRegion;
        return `<span class="ws-chip-x">${esc(t)}<button type="button" data-clear="${k}" aria-label="${k === "cohort" ? "Clear map selection" : "Clear " + esc(t)}"${shortcut ? ' aria-keyshortcuts="Escape"' : ""}>${shortcut ? escapeHint : ""}${ICON.x}</button></span>`;
      }).join("");
      q("#ws-chips").querySelectorAll("[data-clear]").forEach((button) => {
        button.onclick = () => {
          const range = ranges[button.dataset.clear];
          change(range ? { [range.loKey]: null, [range.hiKey]: null } : { cohort: null });
        };
      });
      q("#ws-count").textContent = `${visible.length} / ${Object.keys(space.team).length} teams`;

      drawTeamRows(visible);
    }

    function drawTeamRows(ids) {
      ids.sort((a, b) => {
        let c;
        if (state.sort === "name") c = App.team[a].name.localeCompare(App.team[b].name);
        else if (state.sort === "group") c = groupName(App.team[a].archetype).localeCompare(groupName(App.team[b].archetype));
        else { const x = summaries[a][state.sort], y = summaries[b][state.sort]; c = x == null ? (y == null ? 0 : 1) : y == null ? -1 : x - y; }
        return (state.desc ? -c : c) || App.team[a].name.localeCompare(App.team[b].name);
      });
      const pins = [state.team, state.compare].filter((id) => !ids.includes(id) && space.team[id]);
      qa("[data-sort]").forEach((b) => { const on = b.dataset.sort === state.sort; b.parentElement.setAttribute("aria-sort", on ? (state.desc ? "descending" : "ascending") : "none"); b.querySelector("span").textContent = on ? (state.desc ? "↓" : "↑") : ""; });
      const ext = { xgd: d3.max(Object.values(summaries), (s) => Math.abs(s.xgd ?? 0)) || 1, gd: d3.max(Object.values(summaries), (s) => Math.abs(s.gd ?? 0)) || 1 };
      const bar = (v, key) => {
        if (!Number.isFinite(v)) return "–";
        const w = Math.min(50, (Math.abs(v) / ext[key]) * 50);
        return `<span class="ws-bar"><i><b style="${v >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`}"></b></i><span>${App.signed(v, 2)}</span></span>`;
      };
      q("#ws-teams tbody").innerHTML = [...pins, ...ids].map((id) => {
        const t = App.team[id], s = summaries[id], r = id === state.team ? "is-a" : id === state.compare ? "is-b" : "", out = !ids.includes(id);
        return `<tr data-team="${id}" class="${r}${out ? " is-out" : ""}" tabindex="0" aria-label="${esc(t.name)}">
          <td><span class="ws-ab" translate="no"><button type="button" data-pick="A" aria-pressed="${id === state.team}" aria-label="Set ${esc(t.name)} as A">A</button><button type="button" data-pick="B" ${state.team ? "" : "disabled"} aria-pressed="${id === state.compare}" aria-label="Set ${esc(t.name)} as B">B</button></span></td>
          <th scope="row"><span class="ws-teamcell">${App.flag(id, 16)}<span>${esc(t.name)}</span>${r ? `<span class="ws-pinned-note" ${out ? "" : "hidden"} title="Pinned as A or B; outside the current filters">(pinned)</span>` : ""}</span></th>
          <td class="ws-groupcell" title="${esc(groupName(t.archetype))}">${esc(groupName(t.archetype))}</td>
          <td class="num">${s.n}</td><td class="num">${bar(s.xgd, "xgd")}</td><td class="num">${App.signed(s.gd, 2)}</td></tr>`;
      }).join("") + `<tr class="ws-team-empty" ${pins.length || ids.length ? "hidden" : ""}><td colspan="6" class="ws-empty">No team matches these filters.</td></tr>`;
      q("#ws-teams tbody").querySelectorAll("tr[data-team]").forEach((row) => {
        const id = row.dataset.team;
        row.onclick = (e) => choose(id, e.target.closest("[data-pick]")?.dataset.pick || (e.shiftKey ? "A" : undefined));
        row.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === row) { e.preventDefault(); choose(id, e.shiftKey ? "A" : undefined); } };
        row.onfocus = row.onpointerenter = () => highlight(id); row.onblur = row.onpointerleave = () => highlight(null);
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
      q(".ws-twins-cap").hidden = !near.length;
      q("#ws-twins-title").textContent = near.length ? `Closest to ${App.team[state.team].name}` : "";
      const pairs = (near.length + 1) * near.length / 2;
      const reference = q("#ws-sim-reference");
      reference.hidden = !pairs;
      reference.textContent = `Percentile: share of the ${pairs} team pairs in scope at least this far apart.`;
      const list = near.slice(0, 8), bRank = rankOf(state.compare);
      const row = (n, rank) => `<li class="ws-twin${rank <= K ? " is-near" : ""}${n.id === state.compare ? " is-b" : ""}" data-team="${n.id}" tabindex="0" title="Style distance ${fmt(n.d)}">
        <span class="ws-twin-rank">${rank}</span><span class="ws-teamcell">${App.flag(n.id, 16)}<span>${esc(App.team[n.id].name)}</span></span>
        <span class="ws-twin-bar"><b style="width:${n.sim * 100}%"></b></span><span class="ws-twin-val">${fmt(n.sim * 100, 1)}%</span></li>`;
      q("#ws-twins").innerHTML = !list.length ? `<li class="ws-empty">${state.team ? "No matches in this scope." : "Choose Team A to see its nearest teams."}</li>`
        : list.map((n, i) => row(n, i + 1)).join("") + (bRank && bRank > list.length ? `<li class="ws-twin-sep" aria-hidden="true"></li>${row(near[bRank - 1], bRank)}` : "");
      q("#ws-twins").querySelectorAll("[data-team]").forEach((li) => {
        const id = li.dataset.team;
        li.onclick = () => choose(id); li.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(id); } };
        li.onfocus = li.onpointerenter = () => highlight(id); li.onblur = li.onpointerleave = () => highlight(null);
      });
    }

    /* ---------- C · style map ---------- */
    function drawMap(redrawPairs = true) {
      clearBrushPreview();
      q("#ws-axes").hidden = state.view !== "custom";
      q("#ws-x").value = state.x; q("#ws-y").value = state.y;
      q("#ws-brush").hidden = !hasTouch();
      q("#ws-brush").setAttribute("aria-pressed", String(touchBrushArmed));
      if (state.view === "pairs") {
        if (redrawPairs) pairView.draw(touchBrushArmed);
        return;
      }
      const host = q("#ws-map");
      const activeTeam = host.contains(document.activeElement) ? document.activeElement.dataset.team : null;
      const { svg, W, H } = svgFor(host, "Style Map");
      svg.attr("class", "ws-map").attr("role", "group").attr("aria-describedby", "ws-projection");
      const m = { l: 40, r: 20, t: 30, b: 40 };
      const f = focused();
      let fpos = f ? (pca ? pca.project(space.match[f.key]) : [recordMetric(f, state.x), recordMetric(f, state.y)]) : null;
      if (fpos && !fpos.every(Number.isFinite)) fpos = null;
      const all = Object.values(pos).concat(fpos ? [fpos] : []);
      const [x, y] = [0, 1].map((i) => {
        let [lo, hi] = d3.extent(all, (p) => p[i]); if (lo == null) { lo = -1; hi = 1; } if (lo === hi) { lo -= 1; hi += 1; }
        const pad = (hi - lo) * 0.08;
        return d3.scaleLinear().domain([lo - pad, hi + pad]).nice().range(i ? [H - m.b, m.t] : [m.l, W - m.r]);
      });
      const xTicks = x.ticks(Math.max(3, Math.min(7, Math.floor(W / 80)))), yTicks = y.ticks(Math.max(3, Math.min(6, Math.floor(H / 60))));
      const grid = svg.append("g").attr("class", "grid");
      grid.selectAll(".v").data(xTicks).join("line").attr("x1", x).attr("x2", x).attr("y1", m.t).attr("y2", H - m.b);
      grid.selectAll(".h").data(yTicks).join("line").attr("y1", y).attr("y2", y).attr("x1", m.l).attr("x2", W - m.r);
      const axis = svg.append("g").attr("class", "axis");
      axis.selectAll(".xt").data(xTicks).join("text").attr("x", x).attr("y", H - m.b + 14).attr("text-anchor", "middle").text((d) => App.fix(d, d % 1 ? 1 : 0));
      axis.selectAll(".yt").data(yTicks).join("text").attr("x", m.l - 6).attr("y", (d) => y(d) + 4).attr("text-anchor", "end").text((d) => App.fix(d, d % 1 ? 1 : 0));
      const xl = pca ? `PC1 (${Math.round(pca.vars[0] * 100)}% of variance)` : `${metricById[state.x].label} (${metricById[state.x].unit})`;
      const yl = pca ? `PC2 (${Math.round(pca.vars[1] * 100)}%)` : `${metricById[state.y].label} (${metricById[state.y].unit})`;
      axis.append("text").attr("class", "title").attr("x", W - m.r).attr("y", H - 4).attr("text-anchor", "end").text(xl);
      axis.append("text").attr("class", "title").attr("x", m.l).attr("y", 18).text(yl);
      if (!pca && ["xgd", "gd"].includes(state.x) && ["xgd", "gd"].includes(state.y) && state.x !== state.y) {
        const lo = Math.max(x.domain()[0], y.domain()[0]), hi = Math.min(x.domain()[1], y.domain()[1]);
        svg.append("line").attr("x1", x(lo)).attr("x2", x(hi)).attr("y1", y(lo)).attr("y2", y(hi)).attr("stroke", C.faint || "#b8c0c9").attr("stroke-dasharray", "4 4");
      }
      const P = (id) => [x(pos[id][0]), y(pos[id][1])];
      svg.classed("has-anchor", !!pos[state.team]);
      const links = svg.append("g").attr("pointer-events", "none");
      if (pos[state.team]) {
        const [ax, ay] = P(state.team);
        for (const id of new Set([...twins, state.compare])) {
          if (!pos[id]) continue;
          const [bx, by] = P(id);
          links.append("line").attr("class", "relationship").attr("data-to", id)
            .classed("is-near", twins.includes(id)).classed("is-pair", id === state.compare)
            .classed("is-out", role(id) === "out")
            .attr("x1", ax).attr("y1", ay).attr("x2", bx).attr("y2", by);
        }
      }

      const order = { out: 0, in: 1, twin: 2, b: 3, a: 4 };
      const plotted = Object.keys(pos).sort((a, b) => order[role(a)] - order[role(b)]);
      const radius = { a: 8, b: 8, twin: 6, in: pos[state.team] ? 4 : 5.3, out: 4 };
      // Keep points above the drag surface so a click or tap can select a team.
      const brushLayer = svg.append("g").attr("class", "brush");
      const marks = svg.append("g").selectAll("g").data(plotted).join("g").attr("class", "mark").attr("data-team", (id) => id)
        .attr("transform", (id) => `translate(${P(id)})`).attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", (id) => App.team[id].name).attr("aria-pressed", (id) => [state.team, state.compare].includes(id));
      marks.append("circle").attr("class", "halo").attr("r", (id) => radius[role(id)] + 4.5);
      marks.append("circle").attr("class", "team-fill").attr("r", (id) => radius[role(id)]);
      marks.on("click", (e, id) => choose(id, e.shiftKey ? "A" : undefined))
        .on("keydown", (e, id) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(id, e.shiftKey ? "A" : undefined); } })
        .on("pointerenter focus", (e, id) => highlight(id, { reveal: true })).on("pointerleave blur", () => highlight(null));

      // Give selected teams first choice of label position. Place the other codes
      // only where they cover neither another label nor a plotted point.
      const occupied = [];
      const codeLayer = svg.append("g").attr("class", "point-labels");
      const pointPositions = plotted.map((id) => ({ id, xy: P(id) }));
      let priority = plotted.filter((id) => role(id) !== "out").reverse();
      if (pos[state.team] && priority.length > 12) priority = priority.filter((id) => role(id) !== "in");
      // In the overview label the visible extremes of each axis; hover/focus names any other point.
      if (!state.team && priority.length > 12) {
        priority = [...new Set([0, 1].flatMap((axis) =>
          [d3.least(priority, (id) => pos[id][axis]), d3.greatest(priority, (id) => pos[id][axis])]))];
      }
      for (const id of priority) {
        const [px, py] = P(id), selected = ["a", "b", "twin"].includes(role(id));
        const offsets = [[0,-11],[18,4],[-18,4],[0,18],[20,-8],[-20,-8]];
        let lx, ly;
        for (const [dx, dy] of offsets) {
          const cx = px + dx, cy = py + dy;
          if (cx < m.l + 12 || cx > W - 16 || cy < m.t || cy > H - m.b + 1) continue;
          if (occupied.some(([x, y]) => Math.abs(cx-x) < 28 && Math.abs(cy-y) < 14)) continue;
          if (pointPositions.some((p) => p.id !== id && Math.abs(cx-p.xy[0]) < 16 && Math.abs(cy-4-p.xy[1]) < 9)) continue;
          lx = cx; ly = cy; break;
        }
        if (lx === undefined) {
          if (!["a", "b"].includes(role(id))) continue;
          lx = px; ly = py - 12;
        }
        occupied.push([lx, ly]);
        codeLayer.append("text").attr("class", "code").attr("x", lx).attr("y", ly)
          .attr("text-anchor", "middle").attr("data-label-for", id)
          .attr("fill", selected ? ({ a: C.a, b: C.b, twin: "#147266" }[role(id)]) : C.ink2).text(id);
      }
      svg.append("g").attr("class", "hover-label");
      paintMapHover();

      if (fpos) {
        const [px, py] = [x(fpos[0]), y(fpos[1])];
        if (pos[f.team_id]) svg.append("line").attr("x1", px).attr("y1", py).attr("x2", P(f.team_id)[0]).attr("y2", P(f.team_id)[1]).attr("stroke", C.ink).attr("stroke-dasharray", "2 3").attr("pointer-events", "none");
        svg.append("path").attr("d", d3.symbol(d3.symbolDiamond, 120)()).attr("transform", `translate(${px},${py})`).attr("fill", "#fff").attr("stroke", C.ink).attr("stroke-width", 2).attr("pointer-events", "none");
        svg.append("text").attr("class", "code").attr("x", px + 10).attr("y", py + 16).attr("fill", C.ink).text(`${f.team_id} v ${f.opp_id}`);
      }
      if (!plotted.length) svg.append("text").attr("x", W / 2).attr("y", H / 2).attr("text-anchor", "middle").attr("fill", C.muted).text("No team has matches in this scope");
      const idsInBounds = ([[left, top], [right, bottom]]) =>
        pointPositions.filter(({ xy: [px, py] }) =>
          px >= left && px <= right && py >= top && py <= bottom).map(({ id }) => id).sort();
      setupBrush(brushLayer, [[m.l, m.t], [W - m.r, H - m.b]],
        (bounds) => commitBrush({ cohort: idsInBounds(bounds) }), touchBrushArmed,
        (bounds) => {
          if (!bounds) { clearBrushPreview(); return; }
          const cohort = idsInBounds(bounds), key = cohort.join(",");
          if (brushPreview === key) return;
          // A second drag replaces the old region. Keep search, group and outcome filters.
          if (brushPreview === null && state.cohort) {
            const candidates = matching(null);
            heat.render({ state, full, visible: candidates, summaries, near, twins });
            drawTeamRows(candidates);
            paintMapColours(candidates);
          }
          brushPreview = key;
          const ids = new Set(matching(cohort));
          heat.previewRegion(ids);
          let shown = 0;
          for (const row of qa("#ws-teams tbody tr[data-team]")) {
            const pinned = row.querySelector(".ws-pinned-note"), inside = ids.has(row.dataset.team);
            row.hidden = !inside && !pinned;
            row.classList.toggle("is-out", !inside);
            if (pinned) pinned.hidden = inside;
            if (!row.hidden) shown++;
          }
          q("#ws-teams .ws-team-empty").hidden = shown > 0;
          q("#ws-count").textContent = `${ids.size} / ${Object.keys(space.team).length} teams`;
          const dimmed = (id) => id !== state.team && id !== state.compare && !ids.has(id);
          marks.classed("outside-brush", dimmed);
          codeLayer.selectAll("text").classed("outside-brush", function () { return dimmed(this.dataset.labelFor); });
        });
      paintMapColours();
      q("#ws-projection").textContent = pca
        ? `Two axes capture ${Math.round(d3.sum(pca.vars) * 100)}% of variation across ${state.dials.length} style indicators. Rankings use all selected indicators.`
        : "Axes show team means in the selected match scope.";
      if (activeTeam) host.querySelector(`[data-team="${activeTeam}"]`)?.focus({ preventScroll: true });
    }

    function clearBrushPreview() {
      if (brushPreview === null) return;
      brushPreview = null;
      heat.render({ state, full, visible, summaries, near, twins });
      drawTeamRows(visible);
      paintMapColours();
      q("#ws-count").textContent = `${visible.length} / ${Object.keys(space.team).length} teams`;
      qa("#ws-map .outside-brush").forEach((el) => el.classList.remove("outside-brush"));
    }
    function setupBrush(brushLayer, extent, onBounds, touchArmed, preview) {
      if (touchArmed) brushLayer.raise();
      const largeEnough = (s) => s && Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) >= 5;
      const brush = d3.brush().extent(extent)
        .touchable(touchArmed).keyModifiers(false).handleSize(0)
        .on("start", ({ sourceEvent }) => {
          if (sourceEvent) activeBrush = brushLayer.node();
        })
        .on("brush", ({ selection, sourceEvent }) => {
          const active = largeEnough(selection);
          brushLayer.classed("is-dragging", !!active);
          if (sourceEvent && brushLayer.node().isConnected) preview?.(active ? selection : null);
        })
        .on("end", ({ sourceEvent, selection }) => {
          if (activeBrush === brushLayer.node()) activeBrush = null;
          if (!sourceEvent || !brushLayer.node().isConnected) return;
          if (!largeEnough(selection) || sourceEvent.type === "touchcancel") {
            preview?.(null);
            if (selection) brushLayer.call(brush.move, null);
            return;
          }
          onBounds(selection);
        });
      brushLayer.call(brush);
    }
    function commitBrush(patch) {
      touchBrushArmed = false;
      if (stateUrl({ ...state, ...patch }) === location.hash) { drawMap(); readout(); }
      else change(patch);
    }
    function inspectIndicator(index) {
      lens.inspect(index);
      if (state.view === "pairs" || previewIndicator === index) return;
      previewIndicator = index;
      paintMapColours();
    }
    function paintMapColours(population = visible) {
      const index = previewIndicator ?? (state.color.startsWith("dial") ? +state.color.slice(4) : null);
      const outlined = index !== null || state.color === "group";
      const roleColours = { a: C.a, b: C.b, twin: C.twin, in: C.dot, out: C.off };
      heat.markIndicator(index);
      d3.select(q("#ws-map")).selectAll("circle.team-fill").each(function (id) {
        const r = role(id, population), filtered = r === "out";
        this.parentNode.dataset.role = r;
        let fill = roleColours[r];
        if (index !== null) fill = App.workspaceHeatmap.color(full.team[id][index]);
        else if (state.color === "group" && !filtered) fill = App.arch[App.team[id].archetype].color;
        const ring = outlined && ["a", "b", "twin"].includes(r);
        d3.select(this).attr("fill", fill).attr("fill-opacity", index !== null && filtered ? 0.25 : 1)
          .attr("stroke", ring ? roleColours[r] : filtered || index !== null ? C.faint : "#fff")
          .attr("stroke-width", ring ? 2.5 : filtered ? 0.75 : 1.2);
      });
      const item = (symbol, label) => `<span><i class="${symbol}"></i>${esc(label)}</span>`;
      const roles = [];
      if (state.team) roles.push(item("lg-a", "A"));
      if (state.compare) roles.push(item("lg-b", "B"));
      if (twins.length) roles.push(item("lg-twin", "5 closest to A"));
      if (visible.length < Object.keys(space.team).length) roles.push(item("lg-out", "Filtered out"));
      if (focused()) roles.push(item("lg-match", "Selected match"));
      const roleKey = roles.join("");
      const legend = q("#ws-legend");
      const grouped = state.color === "group";
      legend.classList.toggle("base-group-colours", grouped);
      legend.classList.toggle("group-colours", outlined);
      let indicatorKey = "";
      if (index !== null) {
        const label = App.indicator(App.dials[index]).label;
        // Keep the heatmap's own scale in categorical map modes. This avoids
        // moving the column headings underneath the pointer during a preview.
        const sharedScale = state.color.startsWith("dial");
        const previewLabel = previewIndicator !== null ? `<b>${esc(label)}</b>` : "";
        indicatorKey = `<span class="ws-indicator-key">${previewLabel}${sharedScale ? "<span>Standard deviations from the tournament mean</span>" : ""}</span>`
          + (sharedScale ? App.workspaceHeatmap.legend : "");
      }
      if (grouped) {
        // Let the full group legend reserve its natural wrapped height during inspection.
        const groups = App.data.archetypes.map((g) => `<span><i style="background:${g.color}"></i>${esc(groupName(g.id))}</span>`).join("");
        legend.innerHTML = `<div class="ws-key-groups"${indicatorKey ? ' aria-hidden="true"' : ""}>${groups}${roleKey}</div>`
          + (indicatorKey ? `<div class="ws-key-preview">${indicatorKey}${roleKey}</div>` : "");
      } else {
        legend.innerHTML = (indicatorKey || item("lg-in", "Team")) + roleKey;
      }
      if (legend.scrollWidth > legend.clientWidth || legend.scrollHeight > legend.clientHeight) legend.tabIndex = 0;
      else legend.removeAttribute("tabindex");
    }

    /* ---------- D · style profile ---------- */
    function drawProfile() {
      if (!state.team) return;
      const ids = [state.team, state.compare], match = focused();
      const raw = ids.map(id => id ? App.dials.map((_, i) => metric(id, `dial${i}`)) : null);
      lens.render({ ids, full, raw, dials: state.dials, order: state.order, mode: state.lens,
        match: match ? full.match[match.key] : null });
      updateProfilePreview();
    }
    function updateProfilePreview() {
      if (!state.team) return;
      const match = focused();
      const id = hover !== state.team && hover !== state.compare ? hover : null;
      if (match) lens.overlay(full.match[match.key], `${match.team_id} v ${match.opp_id}`, true);
      else lens.overlay(full.team[id], App.team[id]?.name, false);
    }

    /* ---------- E · outcomes ---------- */
    function drawOutcomes() {
      if (!state.compare) return;
      const referenceLabel = { all: "Tournament average", group: "Group-stage average", knockout: "Knockout average" }[state.scope];
      const gd = [state.team, state.compare].map((id, i) => {
        const s = summaries[id];
        return `<span class="ws-outcome-team"><i class="lg-${i ? "b" : "a"}"></i><span>${esc(App.team[id].name)}</span>
          <strong>${Number.isFinite(s.gd) ? App.signed(s.gd, 2) : "–"}</strong><small>${s.n} matches</small></span>`;
      }).join("");
      q("#ws-outcome-key").innerHTML = `<div class="ws-gd-comparison"><b>Goal difference per match</b>${gd}</div>`
        + (twins.length ? `<span><i class="lg-tick-twin"></i>Mean of A's ${K} closest</span>` : "")
        + `<span><i class="lg-tick-avg"></i>${referenceLabel}</span>`;
      const host = q("#ws-outcomes"), { svg, W, H } = svgFor(host, "Outcomes per match for A and B");
      const metrics = [["xg", "xG for"], ["goals", "Goals for"], ["xga", "xG against"], ["conceded", "Goals against"]];
      const ta = summaries[state.team], tb = summaries[state.compare];
      const twinAvg = Object.fromEntries(metrics.map(([k]) => [k, d3.mean(twins.filter((id) => id !== state.team), (id) => summaries[id][k])]));
      const m = { l: 92, r: 40, t: 4, b: 20 };
      const max = d3.max(metrics, ([k]) => d3.max([ta?.[k], tb?.[k], twinAvg[k], scopeAvg[k]].filter(Number.isFinite))) || 1;
      const x = d3.scaleLinear().domain([0, max * 1.08]).nice().range([m.l, W - m.r]);
      const y = d3.scaleBand().domain(metrics.map((d) => d[0])).range([m.t, H - m.b]).paddingInner(0.28);
      x.ticks(4).forEach((t) => { svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.grid); svg.append("text").attr("x", x(t)).attr("y", H - 5).attr("text-anchor", "middle").attr("fill", C.muted).attr("font-size", 11).text(App.fix(t, t % 1 ? 1 : 0)); });
      svg.append("text").attr("x", m.l - 10).attr("y", H - 5).attr("text-anchor", "end").attr("fill", C.muted).attr("font-size", 11).text("per match");
      const bh = Math.min(11, y.bandwidth() / 2 - 1);
      metrics.forEach(([k, label]) => {
        const y0 = y(k) + y.bandwidth() / 2 - bh - 1;
        svg.append("text").attr("x", m.l - 10).attr("y", y(k) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").attr("fill", C.ink).text(label);
        [[state.team, ta?.[k], C.a], [state.compare, tb?.[k], C.b]].filter(([id]) => id).forEach(([id, v, col], i) => {
          const yy = y0 + i * (bh + 2), ok = Number.isFinite(v);
          const g = svg.append("g").attr("data-team", id);
          g.append("rect").attr("x", m.l).attr("y", yy).attr("width", ok ? Math.max(0, x(v) - m.l) : 0).attr("height", bh).attr("rx", 2).attr("fill", col);
          g.append("text").attr("x", (ok ? x(v) : m.l) + 5).attr("y", yy + bh - 1.5).attr("fill", col).attr("font-size", 11).attr("font-weight", 600).text(fmt(v));
          g.on("pointerenter", () => highlight(id)).on("pointerleave", () => highlight(null));
        });
        const tick = (v, col, dash, title) => { if (!Number.isFinite(v)) return; svg.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", y(k) - 2).attr("y2", y(k) + y.bandwidth() + 2).attr("stroke", col).attr("stroke-width", 2).attr("stroke-dasharray", dash).append("title").text(`${title}: ${fmt(v)}`); };
        tick(scopeAvg[k], "#9aa3ae", "2 2", referenceLabel);
        tick(twinAvg[k], C.twin, null, `Average of A's ${K} closest twins`);
      });
    }

    /* ---------- F · match evidence ---------- */
    function drawMatches() {
      if (!state.team) return;
      const rows = [state.team, state.compare].filter(Boolean).flatMap((id) => A.rows(id, state.scope).sort((a, b) => a.number - b.number));
      const f = focused();
      q("#ws-match-count").textContent = `${rows.length} team performances`;
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
        const pick = () => change(row.dataset.match === state.match ? { match: null } : { match: row.dataset.match, lens: "absolute" });
        row.onclick = pick; row.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } };
        row.onpointerenter = () => highlight(row.dataset.team); row.onpointerleave = () => highlight(null);
      });
      const ret = A.query(state.dials, { return: stateUrl(state) });
      const reports = state.compare
        ? `<a class="ws-link" href="#/twins/${state.team}/${state.compare}${esc(A.query(state.dials, { scope: state.scope, return: stateUrl(state) }))}">Full pair report</a>`
        : `<a class="ws-link" href="#/team/${state.team}${esc(ret)}">Team report</a>`;
      q("#ws-match-actions").innerHTML = f
        ? `<span class="ws-match-sel" title="Selected performance on the map and profile">◇ <b>${f.team_id} ${f.goals}–${f.goals_opp} ${f.opp_id}</b> · ${esc(App.stageShort(f.stage))}</span><span class="ws-spacer"></span>
           <a class="ws-link" href="#/match/${f.match_id}${esc(ret)}">Replay</a><a class="ws-link" href="#/lab/${f.match_id}${esc(A.query(state.dials, { team: f.team_id, return: stateUrl(state) }))}">Match Lab</a><button type="button" class="ws-link" id="ws-clear-match">Clear</button>`
        : reports;
      q("#ws-clear-match")?.addEventListener("click", () => change({ match: null }));
    }

    /* ---------- linking ---------- */
    function readout() {
      const el = q("#ws-readout"), id = hover;
      const show = id || (space.team[state.compare] ? state.compare : state.team);
      const rank = show && show !== state.team ? rankOf(show) : null;
      const gapDial = rank ? d3.maxIndex(space.team[state.team], (a, i) => Math.abs(a - space.team[show][i])) : -1;
      const gapIndex = gapDial < 0 ? null : App.dials.indexOf(space.dialIds[gapDial]);
      heat.compareHover(state.team, rank && state.view !== "pairs" ? show : null, gapIndex);
      if (state.view === "pairs") return;
      if (rank && !touchBrushArmed) {
        const entry = (label, value, detail = "") => `<span class="ws-rank-readout"><span>${esc(label)}</span> <strong>${esc(value)}</strong>${detail ? ` <small>${esc(detail)}</small>` : ""}</span>`;
        const ranks = [];
        ranks.push(entry("Style similarity rank", "#" + rank, `${state.dials.length} indicators`));
        if (mapRanks.has(show)) ranks.push(entry("PCA distance rank", "#" + mapRanks.get(show)));
        ranks.push(entry("Goal difference per match", App.signed(summaries[state.team].gd - summaries[show].gd, 2), `${state.team} − ${show}`));
        if (gapIndex !== null) {
          const gap = Math.abs(space.team[state.team][gapDial] - space.team[show][gapDial]);
          ranks.push(entry("Largest indicator gap", App.indicator(App.dials[gapIndex]).label, `${fmt(gap)} σ`));
        }
        el.innerHTML = `<div class="ws-relation-head">${App.flag(state.team, 14)}<b>${esc(App.team[state.team].name)}</b><span>Compared with</span>${App.flag(show, 14)}<b>${esc(App.team[show].name)}</b></div><div class="ws-relation-metrics">${ranks.join(" ")}</div>`;
        return;
      }
      if (touchBrushArmed || !summaries[show]) {
        el.textContent = touchBrushArmed ? "Drag to filter teams. Tap Brush again to cancel."
          : hasTouch() ? "Tap a team to compare. Tap Brush to filter teams."
          : "Click a team to compare. Drag on empty space to filter teams.";
        return;
      }
      const t = App.team[show], s = summaries[show];
      let detail;
      if (state.color.startsWith("dial")) {
        const measure = metricById[state.color], value = fmt(metric(show, state.color), 1);
        detail = `<span>${esc(measure.label)}</span><b>${value}${measure.unit === "%" ? "%" : ""}</b>`
          + (measure.unit === "%" ? "" : `<span>${esc(measure.unit)}</span>`);
      } else {
        detail = `<span>xG diff. ${App.signed(s.xgd, 2)}</span><span class="sep">|</span><span>goal diff. ${App.signed(s.gd, 2)}</span>`;
      }
      el.innerHTML = `${App.flag(show, 14)}<b>${esc(t.name)}</b>${detail}<span class="sep">|</span><span>${esc(groupName(t.archetype))}</span><span class="sep">|</span><span>${s.n} matches</span>`;
    }
    function paintMapHover() {
      const svg = q("#ws-map svg");
      if (!svg) return;
      const layer = d3.select(svg).select(".hover-label");
      layer.selectAll("*").remove();
      const mark = hover && svg.querySelector(`.mark[data-team="${hover}"]`);
      if (!mark) return;
      mark.classList.add("is-hover");
      if (!svg.querySelector(`[data-label-for="${hover}"]`)) {
        const point = mark.transform.baseVal.getItem(0).matrix;
        const labels = [...svg.querySelectorAll(".point-labels text")];
        const box = svg.viewBox.baseVal;
        const offsets = [[0, -12], [0, 19], [20, 4], [-20, 4], [20, -12], [-20, -12]];
        const [x, y] = offsets.map(([dx, dy]) => [point.e + dx, point.f + dy]).find(([x, y]) =>
          x > 46 && x < box.width - 18 && y > 23 && y < box.height - 33 &&
          !labels.some(label => Math.abs(Number(label.getAttribute("x")) - x) < 28 && Math.abs(Number(label.getAttribute("y")) - y) < 14)
        ) || [point.e, point.f - 12];
        layer.append("text").attr("class", "code").attr("x", x).attr("y", y)
          .attr("text-anchor", "middle").attr("fill", C.ink).text(hover);
      }
    }
    function highlight(id, { reveal = false } = {}) {
      if (hover === id) return;
      if (hover) qa(`[data-team="${hover}"], .relationship[data-to="${hover}"]`).forEach((el) => el.classList.remove("is-hover"));
      hover = id;
      if (id) qa(`[data-team="${id}"], .relationship[data-to="${id}"]`).forEach((el) => el.classList.add("is-hover"));
      paintMapHover();
      if (reveal && id) {
        const row = q(`#ws-teams tr[data-team="${id}"]`), box = q("#ws-team-scroll");
        if (row && box) { const r = row.getBoundingClientRect(), s = box.getBoundingClientRect(); if (r.top < s.top + 30) box.scrollTop -= s.top + 30 - r.top; else if (r.bottom > s.bottom) box.scrollTop += r.bottom - s.bottom; }
      }
      heat.highlight(id); readout(); updateProfilePreview();
    }

    const redraw = () => { if (!root.isConnected) return; drawMap(); drawOutcomes(); };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(redraw); };
    render();
    // Wrapping legends, translated labels and changes in match scope can change
    // chart height even when the viewport and column widths stay the same.
    const observer = new ResizeObserver((entries) => {
      if (entries.some(({ target }) => {
        const box = target.querySelector("svg")?.viewBox.baseVal;
        return box && target.clientHeight && (target.clientWidth !== box.width || target.clientHeight !== box.height);
      })) schedule();
    });
    ["#ws-map", "#ws-pairs .wp-chart", "#ws-outcomes"].forEach((selector) => observer.observe(q(selector)));
    const onLang = () => render();
    window.addEventListener("languagechange", onLang);
    const onPointerChange = () => { touchBrushArmed = false; drawMap(); readout(); };
    coarsePointer.addEventListener("change", onPointerChange);
    const onEscape = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.repeat || event.isComposing ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // Editors and open listboxes own Escape while the user is typing or choosing an option.
      const target = event.target;
      if (target instanceof Element && (target.isContentEditable || target.closest("input, textarea, select, [role='listbox'], dialog[open]"))) return;
      if (activeBrush?.isConnected || touchBrushArmed) {
        activeBrush = null;
        touchBrushArmed = false;
        // Redrawing detaches the old D3 gesture so releasing the pointer cannot commit it.
        drawMap(); readout();
      } else if (state.pairRegion) change({ pairRegion: null });
      else if (state.cohort) change({ cohort: null });
      else if (state.team) choose(null, "A");
      else return;
      event.preventDefault();
    };
    document.addEventListener("keydown", onEscape);
    App._stop = () => {
      observer.disconnect(); clearTimeout(searchTimer); cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("languagechange", onLang);
      coarsePointer.removeEventListener("change", onPointerChange);
    };
    return { update(p) { clearTimeout(searchTimer); touchBrushArmed = false; state = stateFrom(p); render(); } };
  }

  App.views.story = workspace;
  App.views.styles = workspace;
})();
