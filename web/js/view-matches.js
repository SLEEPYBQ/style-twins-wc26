/* All 104 matches, grouped by stage, every one replayable. */
(function () {
  const App = window.App;

  App.views.matches = function (root, params) {
    const teamFilter = params.team && App.team[params.team] ? params.team : "";
    const dials = App.analysis.readDials(params);
    const archA = App.arch[params.archA] ? params.archA : "";
    const archB = App.arch[params.archB] ? params.archB : "";
    const pairFilter = archA && archB;
    const metric = params.metric === "gd" ? "gd" : "xgd";
    const returnTo = /^#\/(twins|styles|story|team|duel)(\/|\?|$)/.test(params.return || "") ? params.return : "";
    const context = pairFilter ? `${App.arch[archA].name} × ${App.arch[archB].name}` : "";
    root.innerHTML = `
      ${returnTo ? `<a class="btn small ghost" href="${App.esc(returnTo)}">← Back to analysis</a>` : ""}
      <div class="section-head" style="margin-top:0">
        <div><div class="kicker">Match evidence · 104 matches</div><h2 style="font-size:40px">Find the matches behind the pattern</h2>
          <p>Inspect a scoreline alongside expected goals, then explore events, passing connections and similar performances.</p></div>
        <div class="filters"><div id="f-team"></div><div id="f-sort"></div></div>
      </div>
      ${pairFilter ? `<div class="duel-filter-context"><div><b>${App.esc(context)}</b><div class="note">Teams are classified by their whole-tournament style. Both home and away orientations are included.</div></div><a href="#/matches${App.analysis.query(dials)}">Clear matchup</a></div>` : ""}
      ${pairFilter ? '<div class="card" id="match-aggregate" style="margin-bottom:20px" aria-live="polite"></div>' : ""}
      <p class="note" id="match-count" aria-live="polite"></p>
      <div id="mlist"></div>`;

    const navigate = () => App.go(`#/matches${App.analysis.query(dials, { team: fTeam.get(), order: fSort.get(), archA, archB, metric, return: returnTo })}`);
    const fTeam = App.ui.select("f-team", { options: App.ui.teamOptions([{ value: "", label: "All teams", html: "All teams" }]), value: teamFilter,
      searchable: true, ariaLabel: "Filter by team", onChange: navigate });
    const fSort = App.ui.select("f-sort", { options: [{ value: "stage", label: "Group by stage" }, { value: "surprise", label: "Won with less xG" }],
      value: params.order === "surprise" ? "surprise" : "stage", ariaLabel: "Order", onChange: navigate });

    const card = (m) => {
      const [hs, as] = m.score;
      const homeWon = hs > as || (m.pens && m.pens.startsWith(App.team[m.home].name));
      const awayWon = as > hs || (m.pens && m.pens.startsWith(App.team[m.away].name));
      const line = (id, g, xg, won, lost) => `<div class="line ${lost ? "lose" : ""}">${App.flag(id, 26)}<span>${App.esc(App.team[id].name)}</span><span class="g tnum">${g}</span></div>`;
      const current = `#/matches${App.analysis.query(dials, { team: fTeam.get(), order: fSort.get(), archA, archB, metric, return: returnTo })}`;
      return `<a class="mcard" href="#/match/${m.id}${App.analysis.query(dials, { return: current })}">
        <div class="meta"><span>${m.stage === "Group" ? m.group : m.stage} · M${m.number}</span><span>${m.date.replace(" 2026", "")}</span></div>
        ${line(m.home, hs, m.xg[0], homeWon, awayWon)}${line(m.away, as, m.xg[1], awayWon, homeWon)}
        <div class="meta"><span class="tnum">xG ${m.xg[0].toFixed(2)} – ${m.xg[1].toFixed(2)}</span><span>${m.pens ? "pens " + (m.pens.match(/\d+-\d+/)?.[0] || "") : m.aet ? "a.e.t." : ""}</span></div>
      </a>`;
    };

    function showAggregate(matches) {
      if (!pairFilter) return;
      const element = document.getElementById("match-aggregate");
      const label = metric === "gd" ? "Goal difference" : "xG difference";
      if (!matches.length) {
        element.innerHTML = `<b>${label}</b><p class="note">No fixtures in the current selection.</p>`;
        return;
      }
      const sameGroup = archA === archB;
      const average = sameGroup ? 0 : d3.mean(matches, (match) => {
        const values = metric === "gd" ? match.score : match.xg;
        const direction = App.team[match.home].archetype === archA ? 1 : -1;
        return direction * (values[0] - values[1]);
      });
      element.innerHTML = `<div class="kicker">${App.esc(App.arch[archA].name)} perspective · current selection</div><h3>${App.signed(average, 2)} ${label.toLowerCase()} per match</h3><p class="note">${matches.length} distinct fixture${matches.length === 1 ? "" : "s"}. ${sameGroup ? "Both teams belong to the same style group. Including both perspectives gives a mean of zero by construction." : `Each fixture is oriented toward ${App.esc(App.arch[archA].name)}, regardless of home or away side.`}</p>`;
    }

    function draw() {
      const team = fTeam.get();
      const sort = fSort.get();
      let ms = App.data.matches.filter((m) => !team || m.home === team || m.away === team);
      if (pairFilter) ms = ms.filter((m) => {
        const home = App.team[m.home].archetype, away = App.team[m.away].archetype;
        return (home === archA && away === archB) || (home === archB && away === archA);
      });
      const el = document.getElementById("mlist");
      if (sort === "surprise") {
        // Shootouts and draws do not establish a winner in the goal totals used here.
        const s = ms.map((m) => {
          const xgM = m.xg[0] - m.xg[1], gM = m.score[0] - m.score[1];
          const upset = gM !== 0 && xgM !== 0 && Math.sign(xgM) !== Math.sign(gM) ? Math.abs(xgM) : 0;
          return { m, upset };
        }).filter((d) => d.upset > 0).sort((a, b) => b.upset - a.upset);
        showAggregate(s.map((item) => item.m));
        document.getElementById("match-count").textContent = `${s.length} matches · excludes tied scorelines and shootout-only wins`;
        el.innerHTML = s.length ? `<div class="stage-block"><h3>Matches won by the side with less xG</h3><div class="mgrid">${s.map((d) => card(d.m)).join("")}</div></div>` : '<div class="card">No matches meet these conditions. Choose another team or show all results.</div>';
        return;
      }
      document.getElementById("match-count").textContent = `${ms.length} matches${pairFilter ? ` in ${context}` : ""}`;
      showAggregate(ms);
      if (!ms.length) { el.innerHTML = '<div class="card">No matches meet these conditions. Choose another team or clear the matchup.</div>'; return; }
      el.innerHTML = App.stageOrder.map((st) => {
        const group = ms.filter((m) => m.stage === st).sort((a, b) => b.number - a.number);
        if (!group.length) return "";
        return `<div class="stage-block"><h3>${st === "Group" ? "Group stage" : st}</h3><div class="mgrid">${group.map(card).join("")}</div></div>`;
      }).join("");
    }
    draw();
  };
})();
