/* Single-screen 3-act exploratory + narrative workspace (#/story and #/styles):
 *   Act 1: Style Map (1:1 PCA + Biplot + Polar Loupe) + Style DNA (Full-48 Matrix/Bars/ParCoords)
 *   Act 2: Twin List (Zoomed 80-100% bars + directional GD) + Fate Quadrant (Zoomable, Gold ★, Open Dots)
 *   Act 3: Why Did Their Fates Differ? (0-base bars, Carryover/Style→Real Slopegraphs, Tug-of-War, Fixed Beads/Timeline/Conn)
 *   Includes lightweight 4-Beat Presentation Story Stepper + Highlight/Isolate Archetype Mode + Scented Dials. */
(function () {
  "use strict";
  const App = window.App;
  const A = App.analysis;
  const esc = App.esc;
  const K = 5;
  const VALID_SORTS = new Set(["spectrum", "near", "lineup", "pc1", "pc2", "gd", "xgd", ...App.dials.map((_, i) => `dial${i}`)]);
  const COMP_IDS = new Set(App.components.map((c) => c.id));
  const RECORD_BY_KEY = Object.fromEntries(A.records.map((r) => [r.key, r]));
  const num = (v) => (v != null && v !== "" && Number.isFinite(+v) ? +v : null);

  // Presentation beats. Each caption is computed from the live model (see storyCaption), so
  // the narration can never drift from what the panels show. The finalists come from the data;
  // the runner-up is paired with its closest full-tournament style twin.
  const BEAT_BASE = { match: null, comp: null, arch: "", cohort: null, pairRegion: null, dials: App.dials.slice(), weights: null, scope: "all", colorDial: null, heatSort: "spectrum", search: "", mapSteer: false };
  const CHAMPION = App.teams.find((t) => t.stage === "Champions")?.id || null;
  const RUNNER_UP = App.teams.find((t) => t.stage === "Runners-up")?.id || null;
  const FULL_NEAR = A.twinTable(A.space(App.dials, "all")).near;
  const RUNNER_UP_TWIN = RUNNER_UP ? FULL_NEAR[RUNNER_UP]?.[0]?.id || null : null;
  // Largest of the six result components for a pair in the full tournament; preselects the tug-of-war row.
  const biggestComp = (a, b) => {
    const gm = a && b ? A.outcomeGap(A.summary(A.rows(a, "all")), A.summary(A.rows(b, "all"))) : null;
    return gm?.status === "ok" ? [...gm.steps.slice(0, 6)].sort((u, v) => Math.abs(v.value) - Math.abs(u.value))[0].id : null;
  };
  const STORY_BEATS = {
    1: { title: "1 · Meet the 48 styles", focus: ["map", "dna"], view: "beads", patch: { ...BEAT_BASE, team: null, compare: null, mapLinks: "off", beat: 1 } },
    2: { title: "2 · Nobody plays like the champions", focus: ["map", "twins"], view: "beads", patch: { ...BEAT_BASE, team: CHAMPION, compare: null, mapLinks: "off", beat: 2 } },
    3: { title: "3 · The runner-up beat its twin", focus: ["twins", "fate"], view: "beads", patch: { ...BEAT_BASE, team: RUNNER_UP, compare: RUNNER_UP_TWIN, comp: biggestComp(RUNNER_UP, RUNNER_UP_TWIN), mapLinks: "off", beat: 3 } },
    4: { title: "4 · Same playbook, opposite fates", focus: ["fate", "map"], view: "timeline", patch: { ...BEAT_BASE, team: "USA", compare: "ECU", comp: biggestComp("USA", "ECU"), mapLinks: "off", beat: 4 } },
    5: { title: "5 · Why fates split", focus: ["fate", "quad"], view: "beads", patch: { ...BEAT_BASE, team: null, compare: null, mapLinks: "stars", beat: 5 } },
  };
  const LAST_BEAT = Object.keys(STORY_BEATS).length;

  function median(values) {
    const v = values.filter(Number.isFinite).sort((x, y) => x - y);
    if (!v.length) return null;
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  function scopePairs(model) {
    const vis = new Set(model.visible);
    const out = [];
    for (const a of vis) {
      for (const n of model.nearByTeam[a] || []) {
        if (a >= n.id || !vis.has(n.id)) continue;
        const ga = model.summaries[a]?.gd, gb = model.summaries[n.id]?.gd;
        if (!Number.isFinite(ga) || !Number.isFinite(gb) || !Number.isFinite(n.sim)) continue;
        out.push({ a, b: n.id, sim: n.sim * 100, gap: Math.abs(ga - gb) });
      }
    }
    return out;
  }

  // Returns escaped HTML. Sentences are split into spans so each piece is a stable translation key.
  function storyCaption(beat, model) {
    const s = model.state;
    const f2 = (v) => App.fix(v, 2);
    const name = (id) => App.team[id].name;
    const span = (text) => `<span>${esc(text)}</span>`;
    if (beat === 1) {
      const groups = App.SPECTRUM_ORDER.filter((id) => App.arch[id]?.members.some((t) => model.summaries[t]?.n));
      const meanGd = (id) => d3.mean(App.arch[id].members, (t) => model.summaries[t]?.gd);
      const first = groups[0], last = groups.at(-1);
      return span(`Each flag is a team, placed by 10 style dials; the heatmap shows the same dials. Average goal difference per match rises from ${App.signed(meanGd(first), 2)} (${App.groupShort(first)}) to ${App.signed(meanGd(last), 2)} (${App.groupShort(last)}).`);
    }
    if (beat === 2 && s.team && s.team === CHAMPION) {
      const ids = Object.keys(model.space.team);
      const best = (id) => model.nearByTeam[id]?.[0]?.sim;
      const twin = model.nearByTeam[s.team]?.[0];
      if (!twin) return "";
      const fewer = ids.filter((id) => best(id) < twin.sim).length;
      return span(`${name(s.team)} won the tournament with a style nobody shared: its closest twin, ${name(twin.id)}, is only ${App.fix(twin.sim * 100, 1)}% alike. Only ${fewer} of ${ids.length} teams have a less similar closest twin; for a typical team it is ${App.fix(median(ids.map(best)) * 100, 1)}%.`);
    }
    if ((beat === 3 || beat === 4) && s.team && s.compare) {
      const sa = model.summaries[s.team], sb = model.summaries[s.compare];
      const sim = (model.nearByTeam[s.team] || []).find((n) => n.id === s.compare)?.sim;
      const gm = sa && sb ? A.outcomeGap(sa, sb) : null;
      if (!gm || gm.status !== "ok" || !Number.isFinite(sim)) return "";
      const top = [...gm.steps.slice(0, 6)].sort((u, v) => Math.abs(v.value) - Math.abs(u.value))[0];
      return [
        span(`${name(s.team)} and ${name(s.compare)} are ${App.fix(sim * 100, 1)}% alike, yet ${name(s.team)} averaged ${f2(sa.gd - sb.gd)} more goals per match.`),
        span("Biggest factor:"),
        `<b>${esc(top.label)}</b>`,
        `<span translate="no">(${esc(App.signed(top.value, 2))})</span>`,
        `<span class="ws2-story-stage">${span(`${name(s.team)}:`)} <b>${esc(App.team[s.team].stage)}</b> · ${span(`${name(s.compare)}:`)} <b>${esc(App.team[s.compare].stage)}</b></span>`,
      ].join(" ");
    }
    if (beat === 5) {
      const pairs = scopePairs(model);
      const twins = App.fatePairBreakdown(pairs.filter((p) => p.sim >= 90 && p.gap >= 1), model.summaries);
      const far = App.fatePairBreakdown(pairs.filter((p) => p.sim < 50 && p.gap >= 1), model.summaries);
      if (!twins || !far) return "";
      return [
        span(`Across ${twins.n} twin pairs, style & opponents explain ${App.signed(twins.vals.structure, 2)} of a ${f2(twins.meanGap)} goal gap per match; chances ${App.signed(twins.vals.chances, 2)}, finishing ${App.signed(twins.vals.finishing, 2)}. For teams that play differently, style explains ${App.signed(far.vals.structure, 2)} of ${f2(far.meanGap)}.`),
        span("Now pick your own team."),
      ].join(" ");
    }
    return "";
  }

  function pairRegionFrom(value) {
    if (!value) return null;
    const b = value.split(",").map(num);
    if (b.length !== 4 || !b.every(Number.isFinite)) return null;
    return b[0] >= 0 && b[0] < b[1] && b[1] <= 100 && b[2] >= 0 && b[2] < b[3] ? b : null;
  }

  function stateFrom(p = {}) {
    const dials = A.readDials(p);
    const weights = A.readWeights(p);
    const scope = ["group", "knockout"].includes(p.scope) ? p.scope : "all";
    const has = (id) => Object.hasOwn(App.team, id);
    const team = has(p.team) ? p.team : has(p.compare) ? p.compare : null;
    const compare = has(p.compare) && p.compare !== team ? p.compare : null;
    const colorDial = p.colorDial != null && /^\d+$/.test(p.colorDial) && +p.colorDial >= 0 && +p.colorDial < App.dials.length
      ? +p.colorDial : null;
    const heatSort = VALID_SORTS.has(p.heatSort) ? p.heatSort : (colorDial !== null ? `dial${colorDial}` : "spectrum");
    const match = RECORD_BY_KEY[p.match];
    const beat = Object.hasOwn(STORY_BEATS, p.beat) ? Number(p.beat) : null;
    return {
      team,
      compare,
      dials,
      weights,
      scope,
      arch: Object.hasOwn(App.arch, p.arch) ? p.arch : "",
      archMode: p.archMode === "isolate" ? "isolate" : "highlight",
      search: p.search || "",
      heatSort: heatSort === "near" && !team ? "spectrum" : heatSort,
      colorDial,
      cohort: p.cohort ? [...new Set(p.cohort.split(",").filter(has))] : null,
      pairRegion: pairRegionFrom(p.pairRegion),
      match: match && A.inScope(match, scope) ? match.key : null,
      comp: COMP_IDS.has(p.comp) ? p.comp : null,
      mapLinks: ["off", "stars"].includes(p.mapLinks) ? p.mapLinks : (beat && STORY_BEATS[beat].patch.mapLinks === "stars" ? "stars" : "off"),
      mapSteer: p.mapSteer === "1",
      beat,
      tableSort: ["name", "group", "n", "xgd", "gd"].includes(p.tableSort) ? p.tableSort : "gd",
      tableDesc: p.tableDesc !== "0",
    };
  }

  function stateUrl(s) {
    const wStr = A.encodeWeights(s.weights);
    return `#/styles${A.query(s.dials, {
      w: wStr || null,
      team: s.team,
      compare: s.compare,
      scope: s.scope === "all" ? null : s.scope,
      arch: s.arch || null,
      archMode: s.arch && s.archMode === "isolate" ? "isolate" : null,
      search: s.search || null,
      heatSort: s.heatSort === "spectrum" ? null : s.heatSort,
      colorDial: s.colorDial !== null ? String(s.colorDial) : null,
      cohort: s.cohort ? (s.cohort.join(",") || "none") : null,
      pairRegion: s.pairRegion ? s.pairRegion.join(",") : null,
      match: s.match || null,
      comp: s.comp || null,
      mapLinks: s.mapLinks && s.mapLinks !== "off" ? s.mapLinks : null,
      mapSteer: s.mapSteer ? "1" : null,
      beat: s.beat ? String(s.beat) : null,
    })}`;
  }

  const ICON = {
    swap: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 5h9m0 0-2.5-2.5M13 5l-2.5 2.5M12 11H3m0 0 2.5-2.5M3 11l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  };

  function panelShell(id, title, bodyId, ctrlId) {
    return `
      <section class="ws2-panel" data-panel="${id}" aria-labelledby="ws2-${id}-title">
        <header class="ws2-ph">
          <h2 id="ws2-${id}-title">${esc(title)}</h2>
          <div class="ws2-ph-ctrl" id="${ctrlId}"></div>
        </header>
        <div class="ws2-pb" id="${bodyId}"></div>
      </section>`;
  }

  function workspace(root, params) {
    let state = stateFrom(params);
    let model = null;
    let prevPca = null;
    let previewDialIdx = null;
    let hoveredIds = [];
    let twinOverviewMode = "sim";
    let searchTimer = null;
    let frame = null;
    const visitedDials = new Set();
    const visitedArchs = new Set();

    const q = (sel) => root.querySelector(sel) || slot.querySelector(sel);

    const topbar = document.querySelector(".topbar");
    document.getElementById("ws2-topbar-slot")?.remove();
    const slot = document.createElement("div");
    slot.className = "ws2-topbar-slot";
    slot.id = "ws2-topbar-slot";
    slot.innerHTML = `
      <div class="ws2-title-group">
        <h1><a href="#/styles">Same style, different fate?</a></h1>
        <span class="ws2-scope-meta" id="ws2-scope-meta"></span>
      </div>
      <div class="ws2-story-nav" id="ws2-story-nav" role="group" aria-label="Presentation story beats">
        <span class="ws2-bar-lbl">Story</span>
        <div class="ws2-seg">
          ${Object.entries(STORY_BEATS).map(([k, b]) => `<button type="button" data-beat="${k}" aria-pressed="false" title="${esc(b.title)}">${k}</button>`).join("")}
        </div>
      </div>
      <div class="ws2-pickers" role="region" aria-label="Selected teams">
        <div class="ws2-pick" data-side="A"><b class="dna-badge is-a" translate="no">A</b><div id="ws2-pick-a"></div></div>
        <button type="button" class="ws2-swap" id="ws2-swap" title="Swap A and B" aria-label="Swap A and B">${ICON.swap}</button>
        <div class="ws2-pick" data-side="B"><b class="dna-badge is-b" translate="no">B</b><div id="ws2-pick-b"></div></div>
      </div>
      <div class="ws2-header-actions">
        <div class="ws2-seg" id="ws2-scope" role="group" aria-label="Match scope">
          <button type="button" data-v="all" aria-pressed="false">Full</button>
          <button type="button" data-v="group" aria-pressed="false">Group</button>
          <button type="button" data-v="knockout" aria-pressed="false">Knockout</button>
        </div>
        <button type="button" class="ws2-btn" id="ws2-open-table" title="Team Table / Export CSV">CSV</button>
        <button type="button" class="ws2-btn is-reset" id="ws2-reset" hidden>Reset</button>
        <a class="ws2-info-link" href="#/method" title="Method &amp; definitions" aria-label="Method &amp; definitions">i</a>
      </div>`;
    if (topbar) {
      const langCtrl = topbar.querySelector(".language-control");
      topbar.insertBefore(slot, langCtrl || null);
    }

    root.innerHTML = `
      <div class="ws2">
        <div class="ws2-story-banner" id="ws2-story-banner" hidden></div>
        <div class="ws2-spectrum-bar">
          <div class="ws2-spectrum" role="region" aria-label="Playstyle spectrum">
            <span class="ws2-bar-lbl">Playstyle</span>
            <span class="ws2-end-lbl">Def.</span>
            <div class="ws2-arch-pills" id="ws2-arch-pills">
              ${App.SPECTRUM_ORDER.map((id) => `<button type="button" class="ws2-arch-pill" data-arch="${id}" aria-pressed="false">${esc(App.groupShort(id))}</button>`).join("")}
            </div>
            <span class="ws2-end-lbl">Att.</span>
            <button type="button" class="ws2-mini-btn ws2-isolate-btn" id="ws2-arch-isolate" hidden aria-pressed="false" title="Isolate selected playstyle teams instead of highlighting in context">Isolate</button>
          </div>
          <div class="ws2-dials-wrap" role="region" aria-label="Style dials">
            <span class="ws2-bar-lbl">Dials <b id="ws2-dial-cnt">10/10</b></span>
            <div class="ws2-dial-chips" id="ws2-dial-chips">
              ${App.DIAL_GROUPS.attack.map((i) => `<button type="button" class="ws2-dial-chip" data-dial-idx="${i}" aria-pressed="true"><span class="ws2-dial-lbl">${esc(App.indicator(App.dials[i]).short)}</span><span class="ws2-scent" aria-hidden="true"></span></button>`).join("")}
              <span class="ws2-dial-sep" aria-hidden="true">|</span>
              ${App.DIAL_GROUPS.defence.map((i) => `<button type="button" class="ws2-dial-chip" data-dial-idx="${i}" aria-pressed="true"><span class="ws2-dial-lbl">${esc(App.indicator(App.dials[i]).short)}</span><span class="ws2-scent" aria-hidden="true"></span></button>`).join("")}
              <button type="button" class="ws2-mini-btn" id="ws2-dials-all" hidden>All 10</button>
            </div>
          </div>
          <div class="ws2-search-wrap">
            <label class="ws2-search">${ICON.search}<span class="sr-only">Filter team</span><input id="ws2-search" type="search" placeholder="Filter team…" autocomplete="off"></label>
            <span class="ws2-team-cnt" id="ws2-team-cnt"></span>
          </div>
        </div>

        <div class="ws2-grid">
          <div class="ws2-col ws2-col-left">
            ${panelShell("map", "Style Map", "ws2-map-body", "ws2-map-ctrl")}
            ${panelShell("twins", "Style Twins", "ws2-twins-body", "ws2-twins-ctrl")}
          </div>
          <div class="ws2-col ws2-col-mid">
            ${panelShell("dna", "Style DNA", "ws2-dna-body", "ws2-dna-ctrl")}
          </div>
          <div class="ws2-col ws2-col-right">
            ${panelShell("quad", "Fate Quadrant", "ws2-quad-body", "ws2-quad-ctrl")}
            ${panelShell("fate", "Why Did Their Fates Differ?", "ws2-fate-body", "ws2-fate-ctrl")}
          </div>
        </div>
      </div>

      <dialog class="ws2-dialog" id="ws2-table-dialog" aria-labelledby="ws2-dialog-title">
        <div class="ws2-dialog-head">
          <h2 id="ws2-dialog-title">Filtered Teams <span id="ws2-dialog-count"></span></h2>
          <div class="ws2-dialog-actions">
            <button type="button" class="ws2-btn" id="ws2-export-csv">Export CSV</button>
            <button type="button" class="ws2-btn" id="ws2-close-dialog">Close</button>
          </div>
        </div>
        <div class="ws2-dialog-scroll">
          <table class="ws2-tbl" id="ws2-tbl">
            <thead><tr>
              <th scope="col">Pin</th>
              <th scope="col"><button type="button" data-tsort="name">Team<span></span></button></th>
              <th scope="col"><button type="button" data-tsort="group">Playstyle<span></span></button></th>
              <th scope="col" class="num"><button type="button" data-tsort="n">M<span></span></button></th>
              <th scope="col" class="num"><button type="button" data-tsort="xgd">xG diff.<span></span></button></th>
              <th scope="col" class="num"><button type="button" data-tsort="gd">Goal diff.<span></span></button></th>
            </tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </dialog>`;

    const change = (patch, { replace = false } = {}) => {
      App.tip.hide();
      const next = { ...state, ...patch };
      if (!Object.prototype.hasOwnProperty.call(patch, "beat") && (
        Object.prototype.hasOwnProperty.call(patch, "team") ||
        Object.prototype.hasOwnProperty.call(patch, "compare") ||
        Object.prototype.hasOwnProperty.call(patch, "arch")
      )) {
        next.beat = null;
      }
      // Leaving a story beat also drops the ★ overlay it switched on, so the map returns to A/B twin links.
      if (state.beat && !next.beat && !Object.prototype.hasOwnProperty.call(patch, "mapLinks")) next.mapLinks = "off";
      if (next.team && next.match) {
        const rec = RECORD_BY_KEY[next.match];
        const validTeamMatch = rec && (rec.team_id === next.team || rec.team_id === next.compare);
        if (!validTeamMatch && next.compare) next.match = null;
      }
      const targetUrl = stateUrl(next);
      if (targetUrl === location.hash) {
        state = next;
        render();
      } else {
        App.go(targetUrl, { replace });
      }
    };

    const choose = (id, side) => {
      if (!id) {
        change(side === "A" ? { team: null, compare: null, match: null, comp: null } : { compare: null, match: null, comp: null });
        return;
      }
      if (!side && (id === state.team || id === state.compare)) {
        if (id === state.compare) change({ compare: null, match: null, comp: null });
        return;
      }
      const targetSide = side || (state.team ? "B" : "A");
      if (!state.team || targetSide === "A") {
        change({
          team: id,
          compare: id === state.compare ? state.team : state.compare,
          match: null,
          comp: null,
        });
      } else if (id === state.team) {
        if (state.compare) {
          change({ team: state.compare, compare: state.team, match: null, comp: null });
        } else {
          pickB.set("");
        }
      } else {
        change({ compare: id, match: null, comp: null });
      }
    };

    const choosePair = (a, b) => {
      if (!a || !b || a === b) return;
      const keepA = state.team === b;
      change({
        team: keepA ? b : a,
        compare: keepA ? a : b,
        match: null,
        comp: null,
      });
    };

    const highlight = (ids) => {
      hoveredIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
      mapView.setHovered(hoveredIds);
      dnaView.setHovered(hoveredIds);
      quadView.setHovered(hoveredIds);
      const set = new Set(hoveredIds);
      q("#ws2-twins-body").querySelectorAll("[data-team-a], [data-team]").forEach((el) => {
        const hit = set.size > 0 && (set.has(el.dataset.team) || set.has(el.dataset.teamA) || set.has(el.dataset.teamB));
        el.classList.toggle("is-hover", hit);
      });
    };

    const pickA = App.ui.select("ws2-pick-a", {
      options: App.ui.teamOptions([{ value: "", label: "Clear Team A" }]),
      value: state.team || "",
      keepLabel: true,
      searchable: true,
      placeholder: "Choose Team A",
      ariaLabel: "Choose Team A",
      onChange: (id) => choose(id, "A"),
    });
    const pickB = App.ui.select("ws2-pick-b", {
      options: App.ui.teamOptions([{ value: "", label: "Clear Team B" }]),
      value: state.compare || "",
      keepLabel: true,
      searchable: true,
      placeholder: "Compare with B",
      ariaLabel: "Compare with B",
      onChange: (id) => choose(id, "B"),
    });

    const mapView = App.workspaceMap(q("#ws2-map-body"), q("#ws2-map-ctrl"), {
      choose,
      highlight,
      onBrush(ids, isPreview) {
        if (isPreview) {
          dnaView.previewRegion(ids ? filteredTeams(ids) : null);
          return;
        }
        change({ cohort: ids && ids.length ? ids : null });
      },
      onClearColor() {
        change({
          colorDial: null,
          heatSort: state.heatSort.startsWith("dial") ? "spectrum" : state.heatSort,
        });
      },
      onClearCohort() {
        change({ cohort: null });
      },
      onMapMode(patch) {
        change(patch);
      },
      onWeight(dialId, weight) {
        const nextW = { ...(state.weights || {}) };
        if (Math.abs(weight - 1) < 0.04) delete nextW[dialId];
        else nextW[dialId] = weight;
        change({ weights: Object.keys(nextW).length ? nextW : null });
      },
      onResetWeights() {
        change({ weights: null });
      },
      onSelectMatch(matchKey) {
        change({ match: matchKey === state.match ? null : matchKey });
      },
    });

    const dnaView = App.workspaceDna(q("#ws2-dna-body"), q("#ws2-dna-ctrl"), {
      choose,
      highlight,
      previewDial(idx) {
        if (previewDialIdx === idx) return;
        previewDialIdx = idx;
        const active = idx !== null ? idx : state.colorDial;
        mapView.setColorDial(active);
      },
      sortBy(order) {
        if (order.startsWith("dial")) {
          const idx = Number(order.slice(4));
          if (state.heatSort === order && state.colorDial === idx) {
            change({ heatSort: "spectrum", colorDial: null });
          } else {
            change({ heatSort: order, colorDial: idx });
          }
        } else {
          change({ heatSort: order });
        }
      },
    });

    const quadView = App.workspaceQuadrant(q("#ws2-quad-body"), q("#ws2-quad-ctrl"), {
      choosePair,
      highlight,
      setRegion: (region) => change({ pairRegion: region }),
    });

    const fateView = App.workspaceFate(q("#ws2-fate-body"), q("#ws2-fate-ctrl"), {
      selectComp: (comp) => change({ comp }),
      selectMatch: (match) => change({ match }),
      choosePair,
      choose,
      highlight,
      setScope: (scope) => change({ scope, match: null }),
    });

    const applyStoryBeat = (bNum) => {
      const b = STORY_BEATS[bNum];
      if (!b) return;
      if (state.beat === bNum) {
        change({ beat: null });
        return;
      }
      fateView.setViewMode(b.view);
      change(b.patch);
    };

    q("#ws2-story-nav").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-beat]");
      if (btn) applyStoryBeat(Number(btn.dataset.beat));
    });

    // Header & Spectrum controls
    q("#ws2-swap").onclick = () => {
      if (state.team && state.compare) change({ team: state.compare, compare: state.team, match: null });
    };
    q("#ws2-scope").onclick = (e) => {
      const btn = e.target.closest("button[data-v]");
      if (btn && btn.dataset.v !== state.scope) {
        change({ scope: btn.dataset.v, match: null, cohort: null, pairRegion: null });
      }
    };
    q("#ws2-reset").onclick = () => {
      fateView.setViewMode("beads");
      App.go("#/styles");
    };

    q("#ws2-arch-pills").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-arch]");
      if (!btn) return;
      const archId = btn.dataset.arch;
      visitedArchs.add(archId);
      if (state.arch === archId) {
        change({ arch: "", archMode: "highlight", dials: App.dials.slice(), cohort: null, pairRegion: null });
      } else {
        const sig = App.ARCH_SIGNATURES[archId] || App.dials;
        change({ arch: archId, dials: sig.slice(), cohort: null, pairRegion: null });
      }
    });
    q("#ws2-arch-isolate").onclick = () => {
      if (!state.arch) return;
      change({ archMode: state.archMode === "isolate" ? "highlight" : "isolate" });
    };

    q("#ws2-arch-pills").addEventListener("pointerover", (e) => {
      const btn = e.target.closest("button[data-arch]");
      if (!btn) return;
      const id = btn.dataset.arch;
      const sig = App.ARCH_SIGNATURES[id] || App.dials;
      App.tip.show(
        `<div class="tt-title">${esc(App.groupLabel(id))}</div>` +
        `<div>${esc(App.groupTip(id))}</div>` +
        `<div class="tt-dim" style="margin-top:4px">${App.arch[id].members.length} teams · Selects ${sig.length} defining dials (highlights by default)</div>`,
        e
      );
    });
    q("#ws2-arch-pills").addEventListener("pointermove", (e) => App.tip.move(e));
    q("#ws2-arch-pills").addEventListener("pointerleave", () => App.tip.hide());

    q("#ws2-dial-chips").addEventListener("click", (e) => {
      if (e.target.id === "ws2-dials-all") {
        change({ dials: App.dials.slice(), cohort: null, pairRegion: null });
        return;
      }
      const btn = e.target.closest("button[data-dial-idx]");
      if (!btn) return;
      const idx = Number(btn.dataset.dialIdx);
      const dial = App.dials[idx];
      visitedDials.add(dial);
      const isOn = state.dials.includes(dial);
      if (isOn && state.dials.length <= 2) return;
      const nextDials = isOn
        ? state.dials.filter((d) => d !== dial)
        : App.dials.filter((d) => d === dial || state.dials.includes(d));
      change({ dials: nextDials, cohort: null, pairRegion: null });
    });
    q("#ws2-dial-chips").addEventListener("pointerover", (e) => {
      const btn = e.target.closest("button[data-dial-idx]");
      if (!btn) return;
      const idx = Number(btn.dataset.dialIdx);
      const d = App.dials[idx];
      const ind = App.indicator(d);
      const w = state.weights?.[d] ?? 1;
      const aRow = state.team && model?.full?.team[state.team] ? [[state.team, `${App.signed(model.full.team[state.team][idx], 2)}σ`]] : [];
      const bRow = state.compare && model?.full?.team[state.compare] ? [[state.compare, `${App.signed(model.full.team[state.compare][idx], 2)}σ`]] : [];
      App.tip.show(
        `<div class="tt-title">${esc(ind.label)}</div><div>${esc(ind.help)}</div>` +
        App.ttRows([...aRow, ...bRow, ...(Math.abs(w - 1) >= 0.04 ? [["Weight", `${w.toFixed(2)}×`]] : [])]),
        e
      );
    });
    q("#ws2-dial-chips").addEventListener("pointermove", (e) => App.tip.move(e));
    q("#ws2-dial-chips").addEventListener("pointerleave", () => App.tip.hide());

    q("#ws2-search").oninput = (e) => {
      clearTimeout(searchTimer);
      const val = e.target.value;
      searchTimer = setTimeout(() => change({ search: val }, { replace: true }), 160);
    };

    // Table / CSV Dialog
    const dialog = q("#ws2-table-dialog");
    q("#ws2-open-table").onclick = () => {
      drawTableDialog();
      dialog.showModal();
    };
    q("#ws2-close-dialog").onclick = () => dialog.close();
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    q("#ws2-tbl thead").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tsort]");
      if (!btn) return;
      const col = btn.dataset.tsort;
      state.tableDesc = state.tableSort === col ? !state.tableDesc : (col !== "name" && col !== "group");
      state.tableSort = col;
      drawTableDialog();
    });
    q("#ws2-export-csv").onclick = () => {
      if (!model) return;
      const rows = [
        ["team", "playstyle", "matches", "xg_diff_per_match", "goal_diff_per_match"],
        ...model.visible.map((id) => [
          App.team[id].name,
          App.groupShort(App.team[id].archetype),
          model.summaries[id].n,
          model.summaries[id].xgd,
          model.summaries[id].gd,
        ]),
      ];
      const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = href;
      a.download = "style-twins-teams.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    };

    function filteredTeams(cohortOverride = state.cohort) {
      const needle = state.search.trim().toLocaleLowerCase();
      const isolateArch = state.arch && state.archMode === "isolate";
      return Object.keys(model.space.team).filter((id) => {
        const t = App.team[id];
        const local = App.i18n?.t(t.name) || t.name;
        return (!isolateArch || t.archetype === state.arch)
          && (!cohortOverride || cohortOverride.includes(id))
          && (!needle || `${t.name} ${local} ${id}`.toLocaleLowerCase().includes(needle));
      });
    }

    function drawControls() {
      pickB.setOptions?.(
        App.ui.teamOptions([{ value: "", label: "Clear Team B" }])
          .filter((o) => !state.team || o.value !== state.team)
      );
      pickA.set(state.team || "");
      pickB.set(state.compare || "");
      q("#ws2-pick-b .sel-btn").disabled = !state.team;
      q("#ws2-swap").disabled = !(state.team && state.compare);

      q("#ws2-scope").querySelectorAll("button").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.v === state.scope));
      });

      q("#ws2-story-nav").querySelectorAll("button[data-beat]").forEach((b) => {
        b.setAttribute("aria-pressed", String(Number(b.dataset.beat) === state.beat));
      });
      const bannerEl = q("#ws2-story-banner");
      if (state.beat && STORY_BEATS[state.beat]) {
        const b = STORY_BEATS[state.beat];
        bannerEl.hidden = false;
        bannerEl.innerHTML = `
          <span class="ws2-story-badge">${esc(b.title)}</span>
          <span class="ws2-story-cap">${storyCaption(state.beat, model)}</span>
          <span class="ws2-story-acts">
            ${state.beat < LAST_BEAT ? `<button type="button" class="ws2-mini-btn" data-next-beat="${state.beat + 1}">Next beat →</button>` : ""}
            <button type="button" class="ws2-mini-btn" data-close-beat="1" aria-label="Close story banner">×</button>
          </span>`;
        const nxt = bannerEl.querySelector("[data-next-beat]");
        if (nxt) nxt.onclick = () => applyStoryBeat(Number(nxt.dataset.nextBeat));
        bannerEl.querySelector("[data-close-beat]").onclick = () => change({ beat: null });
      } else {
        bannerEl.hidden = true;
      }
      const wsEl = root.querySelector(".ws2");
      const focus = state.beat ? STORY_BEATS[state.beat]?.focus || [] : [];
      wsEl.classList.toggle("has-beat-focus", focus.length > 0);
      wsEl.querySelectorAll(".ws2-panel").forEach((el) => el.classList.toggle("is-beat-focus", focus.includes(el.dataset.panel)));

      const nTeams = Object.keys(model.space.team).length;
      q("#ws2-scope-meta").textContent = `${nTeams} teams · ${model.scopeAvg.n / 2} matches`;

      const isDefault = !state.team && !state.compare && state.scope === "all" && !state.arch
        && !state.search && state.dials.length === App.dials.length && !state.weights && !state.cohort
        && !state.pairRegion && state.colorDial === null && state.heatSort === "spectrum"
        && state.mapLinks === "off" && !state.mapSteer && !state.beat;
      q("#ws2-reset").hidden = isDefault;

      q("#ws2-arch-pills").querySelectorAll("button").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.arch === state.arch));
        b.classList.toggle("is-visited", visitedArchs.has(b.dataset.arch));
      });
      const isoBtn = q("#ws2-arch-isolate");
      isoBtn.hidden = !state.arch;
      isoBtn.setAttribute("aria-pressed", String(state.archMode === "isolate"));

      q("#ws2-dial-cnt").textContent = `${state.dials.length}/${App.dials.length}`;
      q("#ws2-dials-all").hidden = state.dials.length === App.dials.length;

      // Scented Widget 5-bin micro-histograms + A/B ticks on dial chips
      const allTeamVecs = Object.values(model.full.team);
      q("#ws2-dial-chips").querySelectorAll("button[data-dial-idx]").forEach((b) => {
        const idx = Number(b.dataset.dialIdx);
        const dial = App.dials[idx];
        const on = state.dials.includes(dial);
        const customW = state.weights?.[dial];
        b.setAttribute("aria-pressed", String(on));
        b.classList.toggle("is-visited", visitedDials.has(dial));
        b.classList.toggle("is-weighted", Boolean(customW && Math.abs(customW - 1) >= 0.04));
        b.disabled = on && state.dials.length <= 2;

        const bins = [0, 0, 0, 0, 0];
        for (const v of allTeamVecs) {
          const z = v[idx] || 0;
          const bi = Math.max(0, Math.min(4, Math.floor(((z + 2.2) / 4.4) * 5)));
          bins[bi]++;
        }
        const maxBin = Math.max(1, ...bins);
        const tickPos = (id) => {
          if (!id || !model.full.team[id]) return null;
          return Math.max(4, Math.min(96, ((model.full.team[id][idx] + 2.2) / 4.4) * 100));
        };
        const tA = tickPos(state.team);
        const tB = tickPos(state.compare);
        const scentEl = b.querySelector(".ws2-scent");
        if (scentEl) {
          scentEl.innerHTML =
            bins.map((cnt) => `<i style="height:${Math.max(18, Math.round((cnt / maxBin) * 100))}%"></i>`).join("") +
            (tA !== null ? `<u class="is-a" style="left:${tA.toFixed(1)}%"></u>` : "") +
            (tB !== null ? `<u class="is-b" style="left:${tB.toFixed(1)}%"></u>` : "");
        }
      });

      if (q("#ws2-search").value !== state.search) q("#ws2-search").value = state.search;
      q("#ws2-team-cnt").textContent = `${model.visible.length}/${nTeams}`;
    }

    function drawTwinList() {
      const titleEl = q("#ws2-twins-title");
      const ctrlEl = q("#ws2-twins-ctrl");
      const bodyEl = q("#ws2-twins-body");
      const { visible, nearByTeam, near, summaries } = model;

      if (state.team && near.length) {
        titleEl.innerHTML = `Closest twins to ${App.flag(state.team, 14)} ${esc(App.team[state.team].name)}`;
        const gdA = summaries[state.team]?.gd ?? 0;
        const top = near.slice(0, 15);
        const bIdx = state.compare ? near.findIndex((n) => n.id === state.compare) : -1;
        const rows = top.map((n, i) => ({ ...n, rank: i + 1 }));
        if (bIdx >= 15) rows.push({ ...near[bIdx], rank: bIdx + 1, sep: true });
        const minTop8 = d3.min(rows.slice(0, 8), (r) => r.sim * 100) ?? 0;
        const zoomBase = minTop8 >= 80 ? 80 : minTop8 >= 70 ? 70 : 0;
        ctrlEl.innerHTML = `<span class="ws2-badge-pill">${state.dials.length} dims · ${zoomBase}–100%</span>`;

        bodyEl.innerHTML = `<div class="tw2-head" aria-hidden="true"><span>#</span><span>Team</span><span>Style similarity</span><span>GD/m vs ${esc(state.team)}</span></div><ol class="tw2-list">
          ${rows.map((n) => {
            const simPct = n.sim * 100;
            const simBarW = zoomBase
              ? Math.max(4, ((Math.max(zoomBase, simPct) - zoomBase) / (100 - zoomBase)) * 100)
              : Math.max(2, simPct);
            const gdDiff = (summaries[n.id]?.gd ?? 0) - gdA;
            const isB = n.id === state.compare;
            const gapCls = gdDiff > 0.3 ? "is-pos" : gdDiff < -0.3 ? "is-neg" : "";
            return `${n.sep ? `<li class="tw2-sep" aria-hidden="true"></li>` : ""}
              <li class="tw2-row ${isB ? "is-b" : ""}" data-team="${n.id}" tabindex="0">
                <span class="tw2-rank">${n.rank}</span>
                <span class="tw2-team">${App.flag(n.id, 15)}<b>${esc(App.team[n.id].name)}</b><small>${esc(App.stageShort(App.team[n.id].stage))}</small></span>
                <span class="tw2-sim" title="${App.fix(simPct, 1)}% style similarity">
                  <span class="tw2-sim-track"><i style="width:${simBarW.toFixed(1)}%"></i></span>
                  <b>${App.fix(simPct, 1)}%</b>
                </span>
                <span class="tw2-gd ${gapCls}" title="Goal difference vs ${esc(App.team[state.team].name)}">${App.signed(gdDiff, 2)}</span>
              </li>`;
          }).join("")}
        </ol>`;

        bodyEl.querySelectorAll(".tw2-row").forEach((li) => {
          const id = li.dataset.team;
          li.onclick = () => choose(id, "B");
          li.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(id, "B"); } };
          li.onpointerenter = li.onfocus = () => highlight([id]);
          li.onpointerleave = li.onblur = () => highlight(null);
        });
        return;
      }

      // Overview mode: top style-twin surprises (linked to state.pairRegion!)
      titleEl.textContent = "Style twins with different fates";
      const visSet = new Set(visible);
      const region = state.pairRegion;
      const starPairs = [];
      for (const a of visSet) {
        for (const n of nearByTeam[a] || []) {
          if (a >= n.id || !visSet.has(n.id)) continue;
          const ga = summaries[a]?.gd, gb = summaries[n.id]?.gd;
          if (!Number.isFinite(n.sim) || !Number.isFinite(ga) || !Number.isFinite(gb)) continue;
          const sim = n.sim * 100;
          const gap = Math.abs(ga - gb);
          if (region && (sim < region[0] || sim > region[1] || gap < region[2] || gap > region[3])) continue;
          if (sim >= 90 && gap >= 1.0) {
            const [hi, lo] = ga >= gb ? [a, n.id] : [n.id, a];
            starPairs.push({ a: hi, b: lo, sim, gap });
          }
        }
      }
      ctrlEl.innerHTML = `
        <span class="ws2-badge-pill">${starPairs.length} ★</span>
        <div class="wf2-seg" role="group" aria-label="Surprise sort">
          <button type="button" data-tmode="sim" aria-pressed="${twinOverviewMode === "sim"}">Most similar</button>
          <button type="button" data-tmode="gap" aria-pressed="${twinOverviewMode === "gap"}">Biggest gap</button>
        </div>`;
      ctrlEl.querySelectorAll("[data-tmode]").forEach((b) => {
        b.onclick = () => { twinOverviewMode = b.dataset.tmode; drawTwinList(); };
      });
      starPairs.sort((u, v) => twinOverviewMode === "sim"
        ? (v.sim - u.sim || v.gap - u.gap)
        : (v.gap - u.gap || v.sim - u.sim));
      const topPairs = starPairs;

      if (!topPairs.length) {
        bodyEl.innerHTML = `<div class="tw2-empty">No ≥90% similar pairs with ≥1.0 GD/m gap in this filter. Click any flag or dot to explore.</div>`;
        return;
      }

      const maxStarGap = Math.max(1.5, ...topPairs.map((p) => p.gap));
      bodyEl.innerHTML = `<div class="tw2-head is-pairs" aria-hidden="true"><span>#</span><span>Better team first</span><span>Similarity</span><span>Goal gap / match</span></div><ol class="tw2-pairs">
        ${topPairs.map((p, idx) => {
          const wGap = (p.gap / maxStarGap) * 100;
          return `
          <li class="tw2-pair-row" data-team-a="${p.a}" data-team-b="${p.b}" tabindex="0">
            <span class="tw2-rank">${idx + 1}</span>
            <span class="tw2-pair-teams">
              ${App.flag(p.a, 16)}<b>${esc(App.team[p.a].name)}</b>
              <span class="tw2-vs">vs</span>
              ${App.flag(p.b, 16)}<b>${esc(App.team[p.b].name)}</b>
            </span>
            <span class="tw2-pair-metrics">
              <span class="tw2-sim-pill">${App.fix(p.sim, 1)}%</span>
              <span class="tw2-gap-mini" title="${esc(App.team[p.a].name)} outperformed ${esc(App.team[p.b].name)} by ${App.fix(p.gap, 2)} goals/match">
                <span class="tw2-gap-track"><i style="width:${wGap.toFixed(1)}%"></i></span>
                <b>${App.fix(p.gap, 2)}</b>
              </span>
            </span>
          </li>`;
        }).join("")}
      </ol>`;

      bodyEl.querySelectorAll(".tw2-pair-row").forEach((li) => {
        const a = li.dataset.teamA, b = li.dataset.teamB;
        li.onclick = () => choosePair(a, b);
        li.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choosePair(a, b); } };
        li.onpointerenter = li.onfocus = () => highlight([a, b]);
        li.onpointerleave = li.onblur = () => highlight(null);
      });
    }

    function drawTableDialog() {
      if (!model) return;
      const { visible, summaries } = model;
      q("#ws2-dialog-count").textContent = `(${visible.length})`;
      const sorted = [...visible].sort((a, b) => {
        let cmp = 0;
        if (state.tableSort === "name") cmp = App.team[a].name.localeCompare(App.team[b].name);
        else if (state.tableSort === "group") cmp = App.groupShort(App.team[a].archetype).localeCompare(App.groupShort(App.team[b].archetype));
        else cmp = (summaries[a][state.tableSort] ?? 0) - (summaries[b][state.tableSort] ?? 0);
        return (state.tableDesc ? -cmp : cmp) || App.team[a].name.localeCompare(App.team[b].name);
      });
      q("#ws2-tbl thead").querySelectorAll("[data-tsort]").forEach((btn) => {
        const on = btn.dataset.tsort === state.tableSort;
        btn.querySelector("span").textContent = on ? (state.tableDesc ? " ↓" : " ↑") : "";
      });
      q("#ws2-tbl tbody").innerHTML = sorted.map((id) => {
        const s = summaries[id];
        return `<tr data-team="${id}">
          <td><span class="ws2-tbl-ab" translate="no">
            <button type="button" data-pick="A" aria-pressed="${id === state.team}">A</button>
            <button type="button" data-pick="B" ${state.team ? "" : "disabled"} aria-pressed="${id === state.compare}">B</button>
          </span></td>
          <td>${App.flag(id, 15)} <b>${esc(App.team[id].name)}</b></td>
          <td>${esc(App.groupShort(App.team[id].archetype))}</td>
          <td class="num">${s.n}</td>
          <td class="num">${App.signed(s.xgd, 2)}</td>
          <td class="num"><b>${App.signed(s.gd, 2)}</b></td>
        </tr>`;
      }).join("");
      q("#ws2-tbl tbody").querySelectorAll("tr[data-team]").forEach((tr) => {
        tr.onclick = (e) => {
          const pick = e.target.closest("[data-pick]");
          const side = pick ? pick.dataset.pick : undefined;
          dialog.close();
          choose(tr.dataset.team, side);
        };
      });
    }

    let lastEnteredBeat = null;
    function render() {
      App.tip.hide();
      if (state.beat !== lastEnteredBeat) {
        lastEnteredBeat = state.beat;
        if (state.beat) fateView.setViewMode(STORY_BEATS[state.beat].view);
      }
      const space = A.space(state.dials, state.scope, state.weights);
      const full = A.space(App.dials, state.scope);
      const nearByTeam = A.twinTable(space).near;
      const near = state.team ? (nearByTeam[state.team] || []) : [];
      const twins = near.slice(0, K).map((n) => n.id);
      const summaries = Object.fromEntries(App.teams.map((t) => [t.id, A.summary(A.rows(t.id, state.scope))]));
      const scopeAvg = A.summary(A.records.filter((r) => A.inScope(r, state.scope)));
      const pca = App.pca2(space, prevPca);
      prevPca = pca;
      const pos = Object.fromEntries(
        Object.keys(space.team).map((id) => [id, pca.project(space.team[id])])
      );

      model = {
        state,
        space,
        full,
        nearByTeam,
        near,
        twins,
        summaries,
        scopeAvg,
        pca,
        pos,
        visible: [],
        pairRegionIds: null,
        activeColorDial: previewDialIdx !== null ? previewDialIdx : state.colorDial,
        matchRecord: state.match ? RECORD_BY_KEY[state.match] : null,
      };
      model.visible = filteredTeams();

      if (state.pairRegion) {
        const visSet = new Set(model.visible);
        const rIds = new Set();
        const [rx0, rx1, ry0, ry1] = state.pairRegion;
        for (const a of visSet) {
          for (const n of nearByTeam[a] || []) {
            if (a >= n.id || !visSet.has(n.id)) continue;
            const ga = summaries[a]?.gd, gb = summaries[n.id]?.gd;
            if (!Number.isFinite(ga) || !Number.isFinite(gb)) continue;
            const sim = n.sim * 100, gap = Math.abs(ga - gb);
            if (sim >= rx0 && sim <= rx1 && gap >= ry0 && gap <= ry1) {
              rIds.add(a); rIds.add(n.id);
            }
          }
        }
        model.pairRegionIds = rIds;
      }

      drawControls();
      mapView.render(model);
      drawTwinList();
      dnaView.render(model);
      quadView.render(model);
      fateView.render(model);
      if (dialog.open) drawTableDialog();
    }

    const onKeyDown = (e) => {
      if (e.key !== "Escape" || dialog.open) return;
      if (state.beat) change({ beat: null });
      else if (state.match) change({ match: null });
      else if (state.cohort || state.pairRegion) change({ cohort: null, pairRegion: null });
      else if (state.compare) change({ compare: null, comp: null });
      else if (state.team) change({ team: null, comp: null });
    };
    document.addEventListener("keydown", onKeyDown);

    const lastSizes = new WeakMap();
    const redrawCharts = () => {
      if (!root.isConnected) return;
      mapView.redraw();
      dnaView.redraw();
      quadView.redraw();
      fateView.redraw();
    };
    const ro = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target;
        const w = el.clientWidth, h = el.clientHeight;
        const prev = lastSizes.get(el);
        if (!prev) {
          lastSizes.set(el, { w, h });
        } else if (Math.abs(w - prev.w) > 1 || Math.abs(h - prev.h) > 1) {
          lastSizes.set(el, { w, h });
          changed = true;
        }
      }
      if (!changed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(redrawCharts);
    });
    ["#sm-canvas", "#fq-canvas", "#ws2-fate-body", "#dna-scroll", ".ws2-grid"].forEach((sel) => {
      const el = q(sel);
      if (el) ro.observe(el);
    });

    const onLang = () => render();
    window.addEventListener("languagechange", onLang);

    App._stop = () => {
      slot.remove();
      ro.disconnect();
      clearTimeout(searchTimer);
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("languagechange", onLang);
    };

    render();

    return {
      update(p) {
        App.tip.hide();
        clearTimeout(searchTimer);
        state = stateFrom(p);
        render();
      },
    };
  }

  App.views.story = workspace;
  App.views.styles = workspace;
})();
