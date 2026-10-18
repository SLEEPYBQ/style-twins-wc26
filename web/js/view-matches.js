/* All 104 matches, grouped by stage, every one replayable. */
(function () {
  const App = window.App;

  App.views.matches = function (root, params) {
    const teamFilter = params.team && App.team[params.team] ? params.team : "";
    root.innerHTML = `
      <div class="section-head" style="margin-top:0">
        <div><div class="kicker">104 matches · all treated the same</div><h2 style="font-size:40px">Pick any match to replay</h2>
          <p>Each card shows the score and the expected goals (xG) of both sides. Every match gets the same reconstruction: lineups, substitutions, cards, shots, passing network and the result recipe.</p></div>
        <div class="filters"><div id="f-team"></div><div id="f-sort"></div></div>
      </div>
      <div id="mlist"></div>`;

    const fTeam = App.ui.select("f-team", { options: App.ui.teamOptions([{ value: "", label: "All teams", html: "All teams" }]), value: teamFilter,
      searchable: true, ariaLabel: "Filter by team", onChange: () => draw() });
    const fSort = App.ui.select("f-sort", { options: [{ value: "stage", label: "Group by stage" }, { value: "surprise", label: "Upsets: won with less xG" }],
      value: "stage", ariaLabel: "Order", onChange: () => draw() });

    const card = (m) => {
      const [hs, as] = m.score;
      const homeWon = hs > as || (m.pens && m.pens.startsWith(App.team[m.home].name));
      const awayWon = as > hs || (m.pens && m.pens.startsWith(App.team[m.away].name));
      const line = (id, g, xg, won, lost) => `<div class="line ${lost ? "lose" : ""}">${App.flag(id, 26)}<span>${App.esc(App.team[id].name)}</span><span class="g tnum">${g}</span></div>`;
      return `<a class="mcard" href="#/match/${m.id}">
        <div class="meta"><span>${m.stage === "Group" ? m.group : m.stage} · M${m.number}</span><span>${m.date.replace(" 2026", "")}</span></div>
        ${line(m.home, hs, m.xg[0], homeWon, awayWon)}${line(m.away, as, m.xg[1], awayWon, homeWon)}
        <div class="meta"><span class="tnum">xG ${m.xg[0].toFixed(2)} – ${m.xg[1].toFixed(2)}</span><span>${m.pens ? "pens " + m.pens.match(/\d+-\d+/)[0] : m.aet ? "a.e.t." : ""}</span></div>
      </a>`;
    };

    function draw() {
      const team = fTeam.get();
      const sort = fSort.get();
      let ms = App.data.matches.filter((m) => !team || m.home === team || m.away === team);
      const el = document.getElementById("mlist");
      if (sort === "surprise") {
        // xG winner lost (or drew): rank by xG margin of the side that did not win
        const s = ms.map((m) => {
          const xgM = m.xg[0] - m.xg[1], gM = m.score[0] - m.score[1];
          const upset = Math.sign(xgM) !== Math.sign(gM) ? Math.abs(xgM) : 0;
          return { m, upset };
        }).filter((d) => d.upset > 0).sort((a, b) => b.upset - a.upset);
        el.innerHTML = `<div class="stage-block"><h3>Matches won by the side with less xG</h3><div class="mgrid">${s.map((d) => card(d.m)).join("")}</div></div>`;
        return;
      }
      el.innerHTML = App.stageOrder.map((st) => {
        const group = ms.filter((m) => m.stage === st).sort((a, b) => b.number - a.number);
        if (!group.length) return "";
        return `<div class="stage-block"><h3>${st === "Group" ? "Group stage" : st}</h3><div class="mgrid">${group.map(card).join("")}</div></div>`;
      }).join("");
    }
    draw();
  };
})();
