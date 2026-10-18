/* Team page: identity, style fingerprint, result recipe, style twins, every match. */
(function () {
  const App = window.App;

  App.recipeSentence = (name, values) => {
    const comps = App.components.map((c) => ({ ...c, v: values[c.id] }));
    const best = comps.slice().sort((a, b) => b.v - a.v)[0];
    const worst = comps.slice().sort((a, b) => a.v - b.v)[0];
    const parts = [];
    if (best.v > 0.15) parts.push(`the biggest boost was <b>${best.label.toLowerCase()}</b> (${App.signed(best.v, 2)})`);
    if (worst.v < -0.15) parts.push(`the biggest drag was <b>${worst.label.toLowerCase()}</b> (${App.signed(worst.v, 2)})`);
    return parts.length ? `For ${App.esc(name)}, ${parts.join(", while ")} goals per match.` : `${App.esc(name)}'s results were close to what its style and opponents predict.`;
  };

  App.views.team = function (root, params, id) {
    const t = App.team[(id || "").toUpperCase()];
    if (!t) { root.innerHTML = `<div class="card"><h3>Unknown team</h3><a href="#/styles">Back to the map</a></div>`; return; }
    const arch = App.arch[t.archetype];
    const space = App.styleSpace(App.dials);
    const twins = App.twinTable(space);
    const near = twins.near[t.id].slice(0, 5);
    const hubUrl = App.avatarUrl(t.hub.pid);

    root.innerHTML = `
      <div class="card team-hero">
        ${App.flag(t.id, 84)}
        <div>
          <div class="kicker">${t.stage} · ${t.n} matches</div>
          <h1>${App.esc(t.name)}</h1>
          <div class="row" style="margin-top:8px">${App.archPill(t.archetype)}<span class="note">${arch.tagline}</span></div>
          <div class="facts">
            <div class="fact"><b>${t.record.W}-${t.record.D}-${t.record.L}</b><span>W-D-L</span></div>
            <div class="fact"><b>${t.gf}–${t.ga}</b><span>Goals</span></div>
            <div class="fact"><b>${t.xg.toFixed(1)}–${t.xga.toFixed(1)}</b><span>xG for–against</span></div>
            <div class="fact"><b>${t.poss}%</b><span>Avg possession</span></div>
            <div class="fact"><b>${App.signed(t.gd_per_match, 2)}</b><span>Goal diff / match</span></div>
          </div>
        </div>
        <div class="hub-card card" style="padding:12px 14px">
          ${App.avatarHtml(t.hub.pid, t.kit, 64, "")}
          <div><div class="kicker" style="margin:0">Passing hub</div><b style="font-size:17px">${App.esc(t.hub.name)}</b>
            <div class="note">${t.hub.passes.toLocaleString()} passes sent + received</div></div>
        </div>
        <img src="${App.archArt(arch.id)}" alt="" style="display:none">
      </div>

      <div class="grid-2 section">
        <div class="card">
          <h3>Style fingerprint</h3>
          <div class="sub">Bars: ${App.esc(t.name)}'s average dial setting (in standard deviations from the tournament average). Diamonds: the typical ${arch.name.replace("The ", "")} team.</div>
          <div id="fp"></div>
        </div>
        <div class="card">
          <h3>Result recipe</h3>
          <div class="sub">Average goal difference per match, split into six parts. Dots are the individual matches. <a href="#/method">How is this computed?</a></div>
          <div id="recipe"></div>
          <p class="callout" style="margin-top:12px">${App.recipeSentence(t.name, t.decomp)}</p>
        </div>
      </div>

      <div class="grid-2 section">
        <div class="card">
          <h3>Style twins</h3>
          <div class="sub">The five teams whose average style is closest across all ten dials. Click one to compare results side by side.</div>
          <div class="twin-list">${near.map((n) => {
            const o = App.team[n.id];
            const gap = t.gd_per_match - o.gd_per_match;
            return `<a class="twin-item" href="#/twins/${t.id}/${o.id}">${App.flag(o.id, 30)}
              <div><b>${App.esc(o.name)}</b> <span class="note">${App.arch[o.archetype].name.replace("The ", "")}</span>
              <div class="why">${Math.abs(gap) < 0.05 ? "Almost identical results" : gap > 0 ? `${App.esc(t.name)} better by ${App.signed(gap, 2)} GD/match` : `${App.esc(o.name)} better by ${App.signed(-gap, 2)} GD/match`}</div></div>
              <span class="sim">${Math.round(n.sim * 100)}% alike</span></a>`;
          }).join("")}</div>
          <p class="note" style="margin-top:10px">Style drift across matches: <b>${t.chameleon.toFixed(2)}</b> sd from its own average
            (${t.chameleon > 2.2 ? "a chameleon that changes approach by opponent" : t.chameleon < 1.6 ? "very consistent, plays its own game" : "fairly consistent"}). <a href="#/styles?team=${t.id}">See the trajectory on the map →</a></p>
        </div>
        <div class="card">
          <h3>Every match</h3>
          <div class="sub">Click a match to replay it.</div>
          <div class="match-list">${t.matches.map((k) => {
            const r = App.tm[k];
            return `<a class="match-row" href="#/match/${r.match_id}">
              <span class="stage">${App.stageShort(r.stage)} · M${r.number}</span>${App.resultChip(r.result)}
              <span class="team-link">${App.flag(r.opp_id, 22)}<span>v ${App.esc(App.team[r.opp_id].name)}</span></span>
              <span class="note xg tnum">xG ${r.xg.toFixed(2)}–${r.xga.toFixed(2)}</span>
              <span class="score tnum">${r.goals}–${r.goals_opp}</span></a>`;
          }).join("")}</div>
        </div>
      </div>`;

    const draw = () => {
      const fp = document.getElementById("fp"), rc = document.getElementById("recipe");
      fp.innerHTML = ""; rc.innerHTML = "";
      const z = space.team[t.id];
      const raw = App.dials.map((d, i) => d3.mean(t.matches, (k) => App.tm[k].dials[i]));
      App.charts.fingerprint(fp, App.dials.map((d, i) => ({ dial: d, z: z[i], raw: raw[i] })), {
        compare: App.dials.map((d) => ({ dial: d, z: arch.centroid[d] })), compareLabel: `typical ${arch.name.replace("The ", "")}`, mainLabel: t.name,
      });
      App.charts.recipe(rc, [{ label: t.name, values: t.decomp, dots: t.matches.map((k) => App.tm[k].decomp) }]);
    };
    draw();
    App.onResize(document.getElementById("recipe"), draw);
  };
})();
