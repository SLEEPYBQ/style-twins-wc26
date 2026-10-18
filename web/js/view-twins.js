/* Style twins: story-typed pair list (#/twins) and a head-to-head explanation (#/twins/A/B). */
(function () {
  const App = window.App;
  const INK = "#1d2433", GREY = "#a3a9b6";

  /** The four reasons a gap can have, in reading order. */
  App.gapTypes = {
    exec: { label: "Execution", headline: "Out-played them", color: "#0a9396", help: "made and denied more chances than the twin" },
    luck: { label: "Conversion", headline: "Decided in the boxes", color: "#f2b134", help: "finishing and goalkeeping, the parts that rarely carry over" },
    opp: { label: "Opponents", headline: "An easier road", color: "#c9ced8", help: "the strength of the opponents they met" },
    style: { label: "Style", headline: "The style edge", color: "#8f96a3", help: "their version of the shared style tends to produce better chances" },
  };

  /** Split the goal-difference gap between two teams into execution / conversion / opponents / style. */
  App.explainGap = (a, b) => {
    const A = App.team[a], B = App.team[b];
    const better = A.gd_per_match >= B.gd_per_match ? A : B, worse = better === A ? B : A;
    const gap = better.gd_per_match - worse.gd_per_match;
    const diffs = App.components.map((c) => ({ ...c, v: better.decomp[c.id] - worse.decomp[c.id] }));
    const v = (id) => diffs.find((d) => d.id === id).v;
    const groups = { exec: v("c_create") + v("c_prevent"), luck: v("c_finish") + v("c_keep"), opp: v("c_opp"), style: v("c_style") };
    const top = diffs.slice().sort((p, q) => q.v - p.v)[0];
    const type = gap < 0.1 ? "same" : Object.entries(groups).sort((p, q) => q[1] - p[1])[0][0];
    const headline = type === "same" ? "Same style, same fate" : App.gapTypes[type].headline;
    return { better, worse, gap, diffs, groups, top, type, headline };
  };

  /** Stacked bar of the four reasons; negative parts are drawn faded (they worked against the better team). */
  App.attributionBar = (e, { dark = false } = {}) => {
    const keys = Object.keys(App.gapTypes);
    const total = d3.sum(keys, (k) => Math.abs(e.groups[k])) || 1;
    const bar = keys.map((k) => `<i style="flex:${Math.abs(e.groups[k]) / total} 1 0;background:${App.gapTypes[k].color};opacity:${e.groups[k] < 0 ? 0.4 : 1}"></i>`).join("");
    const legend = keys.map((k) => `<span><i style="background:${App.gapTypes[k].color}"></i>${App.gapTypes[k].label} ${App.signed(e.groups[k], 2)}</span>`).join("");
    return `<div class="attr ${dark ? "dark" : ""}"><div class="attr-bar">${bar}</div><div class="attr-legend">${legend}</div></div>`;
  };

  App.pairCard = (p) => {
    const e = p.e || App.explainGap(p.a, p.b);
    const [L, R] = [e.better.id, e.worse.id];
    const t = App.gapTypes[e.type];
    return `<a class="card pair-card" href="#/twins/${L}/${R}">
      <div class="pair-vs">
        <div class="tm">${App.flag(L, 46)}<span>${App.esc(App.team[L].name)}</span><span class="gd">${App.signed(App.team[L].gd_per_match, 2)} GD/m · ${App.team[L].n} m</span></div>
        <div class="vs-mid"><b>${Math.round(p.sim * 100)}%</b><span>alike</span></div>
        <div class="tm">${App.flag(R, 46)}<span>${App.esc(App.team[R].name)}</span><span class="gd">${App.signed(App.team[R].gd_per_match, 2)} GD/m · ${App.team[R].n} m</span></div>
      </div>
      <div class="pair-type">${t ? `<span class="type-dot" style="background:${t.color}"></span>` : ""}<b>${e.headline}</b><span class="note">gap ${App.signed(e.gap, 2)} per match</span></div>
      ${App.attributionBar(e)}
      <div class="note">Biggest single factor: ${e.top.label.toLowerCase()} (${App.signed(e.top.v, 2)}).</div>
    </a>`;
  };

  function allPairs(twins) {
    const out = [];
    for (const t of App.teams) for (const n of twins.near[t.id]) {
      if (t.id >= n.id || n.sim < 0.9) continue;
      const e = App.explainGap(t.id, n.id);
      out.push({ a: t.id, b: n.id, sim: n.sim, e, minN: Math.min(t.n, App.team[n.id].n) });
    }
    return out.sort((p, q) => q.e.gap - p.e.gap);
  }

  function mountPickers(a, b, onPick) {
    const pa = App.ui.select("pa", { options: App.ui.teamOptions(), value: a, searchable: true, ariaLabel: "First team", onChange: (v) => onPick(v, pb.get()) });
    const pb = App.ui.select("pb", { options: App.ui.teamOptions(), value: b, searchable: true, ariaLabel: "Second team", onChange: (v) => onPick(pa.get(), v) });
    return [pa, pb];
  }

  App.views.twins = function (root, params, a, b) {
    const space = App.styleSpace(App.dials);
    const twins = App.twinTable(space);
    a = (a || "").toUpperCase(); b = (b || "").toUpperCase();
    if (!App.team[a] || !App.team[b] || a === b) return landing(root, twins);
    compare(root, space, twins, a, b);
  };

  // ------------------------------------------------------------------ landing: every twin pair, filterable by story type
  function landing(root, twins) {
    const pairs = allPairs(twins);
    const st = { type: "all", reliable: true, shown: 9 };
    root.innerHTML = `
      <div class="section-head" style="margin-top:0">
        <div><div class="kicker">Style twins</div><h2 style="font-size:clamp(28px,3vw,40px)">Same style, different fate</h2>
          <p>Pairs of teams that play more alike than nine in ten team pairs, ranked by how far apart their results ended up. Each card names the biggest reason for the gap.
            Execution tends to carry over from match to match; conversion (finishing and goalkeeping) mostly does not.</p></div>
        <div class="pickers"><span class="note">Compare any two:</span><div id="pa"></div><span class="note">vs</span><div id="pb"></div><button type="button" class="btn small" id="go">Compare →</button></div>
      </div>
      <div class="row" style="justify-content:space-between;margin-bottom:14px">
        <div class="seg" id="type-seg" role="tablist"></div>
        <button type="button" class="chip on" id="reliable" aria-pressed="true">Only teams with 4+ matches</button>
      </div>
      <div class="pair-grid" id="pair-grid"></div>
      <div class="row" style="justify-content:center;margin-top:16px"><button type="button" class="btn ghost" id="more">Show more pairs</button></div>
      <p class="note" id="pair-note" style="margin-top:10px"></p>`;
    const [pa, pb] = mountPickers("NED", "CRO", () => {});
    document.getElementById("go").onclick = () => { if (pa.get() !== pb.get()) App.go(`#/twins/${pa.get()}/${pb.get()}`); };

    function draw() {
      const pool = pairs.filter((p) => !st.reliable || p.minN >= 4);
      const types = [["all", "All", null], ...Object.entries(App.gapTypes).map(([k, t]) => [k, t.headline, t.color])];
      d3.select("#type-seg").html(types.map(([k, label, color]) => {
        const n = k === "all" ? pool.length : pool.filter((p) => p.e.type === k).length;
        return `<button type="button" data-v="${k}" class="${st.type === k ? "on" : ""}" ${n ? "" : "disabled"}>${color ? `<span class="type-dot" style="background:${color}"></span>` : ""}${label} <span class="cnt">${n}</span></button>`;
      }).join(""));
      d3.selectAll("#type-seg button").on("click", function () { st.type = this.dataset.v; st.shown = 9; draw(); });
      const list = pool.filter((p) => st.type === "all" || p.e.type === st.type);
      document.getElementById("pair-grid").innerHTML = list.length ? list.slice(0, st.shown).map(App.pairCard).join("")
        : `<div class="card"><p class="note">No pairs of this type${st.reliable ? " among teams with 4+ matches. Switch the filter off to include group-stage exits." : "."}</p></div>`;
      document.getElementById("more").hidden = list.length <= st.shown;
      document.getElementById("pair-note").textContent = `${list.length} pair${list.length === 1 ? "" : "s"} shown of ${pairs.length} that pass the 90% similarity bar. Results are goal difference per match over the whole tournament.`;
    }
    d3.select("#reliable").on("click", function () {
      st.reliable = !st.reliable; st.shown = 9;
      this.classList.toggle("on", st.reliable); this.setAttribute("aria-pressed", st.reliable);
      draw();
    });
    d3.select("#more").on("click", () => { st.shown += 9; draw(); });
    draw();
  }

  // ------------------------------------------------------------------ head-to-head
  function compare(root, space, twins, a, b) {
    const A = App.team[a], B = App.team[b];
    const sim = twins.near[a].find((n) => n.id === b).sim;
    const e = App.explainGap(a, b);
    const t = App.gapTypes[e.type];

    root.innerHTML = `
      <div class="match-nav">
        <a class="btn small ghost" href="#/twins">← All twin pairs</a>
        <div class="pickers"><div id="pa"></div><span class="note">vs</span><div id="pb"></div><a class="btn small ghost" href="#/twins/${b}/${a}">⇄ Swap</a></div>
      </div>
      <div class="card compare-head">
        <div class="side">${App.flag(a, 64)}<div><h2 style="font-size:28px"><a href="#/team/${a}" style="text-decoration:none">${App.esc(A.name)}</a></h2>${App.archPill(A.archetype)}
          <div class="note" style="margin-top:4px">${A.record.W}-${A.record.D}-${A.record.L} · ${A.stage} · ${A.n} matches</div></div></div>
        <div class="mid"><b>${Math.round(sim * 100)}%</b><span class="note">alike in style</span></div>
        <div class="side right">${App.flag(b, 64)}<div><h2 style="font-size:28px"><a href="#/team/${b}" style="text-decoration:none">${App.esc(B.name)}</a></h2>${App.archPill(B.archetype)}
          <div class="note" style="margin-top:4px">${B.record.W}-${B.record.D}-${B.record.L} · ${B.stage} · ${B.n} matches</div></div></div>
      </div>

      <div class="verdict section">
        <div><div class="big">${App.signed(e.gap, 2)}</div><div style="font-size:12px;color:#b9bfcc">goal diff / match</div></div>
        <div>
          <h3>${t ? `<span class="type-dot" style="background:${t.color}"></span>` : ""}${e.headline}</h3>
          <p>${App.esc(e.better.name)} finished ${e.gap.toFixed(2)} goals per match ahead of ${App.esc(e.worse.name)}.
            ${t ? `Most of the gap is <b style="color:#fff">${t.label.toLowerCase()}</b>: ${t.help}.` : ""}
            ${e.type === "luck" ? " Expect this kind of edge to fade over more matches." : e.type === "exec" ? " This kind of edge tends to hold up from match to match." : ""}</p>
          ${App.attributionBar(e, { dark: true })}
        </div>
      </div>

      <div class="grid-2 section">
        <div class="card">
          <h3>Where the gap comes from</h3>
          <div class="sub">Six-part result split for both teams, goal difference per match. <span class="legend-inline">
            <span class="k"><svg width="12" height="12"><rect width="12" height="12" rx="3" fill="${INK}"/></svg> ${App.esc(A.name)}</span>
            <span class="k"><svg width="12" height="12"><rect width="12" height="12" rx="3" fill="${GREY}"/></svg> ${App.esc(B.name)}</span></span></div>
          <div id="recipe2"></div>
        </div>
        <div class="card">
          <h3>How they got there</h3>
          <div class="sub">Per-match averages along the chain from the ball to the net, at both ends of the pitch.</div>
          <div id="chain"></div>
        </div>
      </div>

      <div class="grid-2 section">
        <div class="card">
          <h3>How alike are they?</h3>
          <div class="sub">Bars: ${App.esc(A.name)}. Diamonds: ${App.esc(B.name)}. Standard deviations from the tournament average.</div>
          <div id="fp2"></div>
        </div>
        <div class="card">
          <h3>Their matches</h3>
          <div class="sub">Click to replay.</div>
          ${[a, b].map((id) => `<div class="kicker" style="margin-top:10px">${App.esc(App.team[id].name)}</div><div class="match-list">${App.team[id].matches.map((k) => {
            const r = App.tm[k];
            return `<a class="match-row" href="#/match/${r.match_id}"><span class="stage">${App.stageShort(r.stage)} · M${r.number}</span>${App.resultChip(r.result)}
              <span class="team-link">${App.flag(r.opp_id, 22)}<span>v ${App.esc(App.team[r.opp_id].name)}</span></span>
              <span class="note xg tnum">xG ${r.xg.toFixed(2)}–${r.xga.toFixed(2)}</span><span class="score tnum">${r.goals}–${r.goals_opp}</span></a>`;
          }).join("")}</div>`).join("")}
        </div>
      </div>`;

    mountPickers(a, b, (x, y) => { if (x !== y) App.go(`#/twins/${x}/${y}`); });

    // the chain from ball to net, both ends
    const avg = (T, f) => d3.mean(T.matches, (k) => f(App.tm[k], App.tm[`${App.tm[k].match_id}_${App.tm[k].opp_id}`]));
    const chain = (T) => ({
      poss: avg(T, (r) => r.poss), shots: avg(T, (r) => r.shots), xg: avg(T, (r) => r.xg), goals: avg(T, (r) => r.goals),
      shotsA: avg(T, (r, o) => o.shots), xga: avg(T, (r) => r.xga), ga: avg(T, (r) => r.goals_opp),
    });
    const ca = chain(A), cb = chain(B);
    const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);
    const el = document.getElementById("chain");
    el.innerHTML = `<div class="chain-head"><span>${App.flag(a, 20)} ${App.esc(A.name)}</span><span>${App.esc(B.name)} ${App.flag(b, 20)}</span></div>
      <div class="kicker">Attack</div><div id="chain-att"></div><div class="kicker" style="margin-top:12px">Defence (lower is better)</div><div id="chain-def"></div>`;
    App.charts.dualBars(document.getElementById("chain-att"), [
      { label: "Possession %", a: ca.poss, b: cb.poss, fmt: f1 },
      { label: "Shots", a: ca.shots, b: cb.shots, fmt: f1 },
      { label: "xG per shot (chance quality)", a: ca.xg / ca.shots, b: cb.xg / cb.shots, fmt: f2 },
      { label: "xG", a: ca.xg, b: cb.xg, fmt: f2 },
      { label: "Goals", a: ca.goals, b: cb.goals, fmt: f2 },
    ], [INK, GREY]);
    App.charts.dualBars(document.getElementById("chain-def"), [
      { label: "Shots conceded", a: ca.shotsA, b: cb.shotsA, fmt: f1 },
      { label: "xG conceded", a: ca.xga, b: cb.xga, fmt: f2 },
      { label: "Goals conceded", a: ca.ga, b: cb.ga, fmt: f2 },
    ], [INK, GREY]);

    const draw = () => {
      const r = document.getElementById("recipe2"), f = document.getElementById("fp2");
      r.innerHTML = ""; f.innerHTML = "";
      App.charts.recipe(r, [{ label: A.name, values: A.decomp, color: INK }, { label: B.name, values: B.decomp, color: GREY }]);
      const za = space.team[a], zb = space.team[b];
      const rawA = App.dials.map((d, i) => d3.mean(A.matches, (k) => App.tm[k].dials[i]));
      App.charts.fingerprint(f, App.dials.map((d, i) => ({ dial: d, z: za[i], raw: rawA[i] })), {
        compare: App.dials.map((d, i) => ({ dial: d, z: zb[i] })), compareLabel: B.name, mainLabel: A.name,
      });
    };
    draw();
    App.onResize(document.getElementById("recipe2"), draw);
  }
})();
