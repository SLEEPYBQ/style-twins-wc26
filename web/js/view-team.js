/* Team page: identity, style fingerprint, result recipe, style twins, every match. */
(function () {
  const App = window.App;
  const A = App.analysis;

  App.recipeSentence = (name, values) => {
    const comps = App.components.map((c) => ({ ...c, v: values[c.id] }));
    const best = comps.slice().sort((a, b) => b.v - a.v)[0];
    const worst = comps.slice().sort((a, b) => a.v - b.v)[0];
    const parts = [];
    if (best.v > 0.15) parts.push(`the largest positive model contribution is <b>${best.label.toLowerCase()}</b> (${App.signed(best.v, 2)})`);
    if (worst.v < -0.15) parts.push(`the largest negative contribution is <b>${worst.label.toLowerCase()}</b> (${App.signed(worst.v, 2)})`);
    return parts.length ? `For ${App.esc(name)}, ${parts.join(", and ")} goals per match.` : `${App.esc(name)} has small individual contributions in this model decomposition.`;
  };

  App.views.team = function (root, params, id) {
    const t = App.team[(id || "").toUpperCase()];
    if (!t) { root.innerHTML = `<div class="card"><h3>Unknown team</h3><a href="#/styles">Back to the map</a></div>`; return; }
    const arch = App.arch[t.archetype];
    const dials = A.readDials(params);
    const space = App.styleSpace(dials);
    const twins = App.twinTable(space);
    const near = twins.near[t.id].slice(0, 5);
    const back = typeof params.return === "string" && params.return.startsWith("#/") ? params.return : `#/styles${A.query(dials, { team: t.id })}`;
    const selfUrl = `#/team/${t.id}${A.query(dials, { return: back })}`;
    const detailUrl = (route) => `${route}${A.query(dials, { return: selfUrl })}`;
    const drift = d3.mean(t.matches, (key) => App.dist(space.match[key], space.team[t.id]) / Math.sqrt(dials.length));

    root.innerHTML = `
      <div class="row" style="margin-bottom:16px"><a class="btn small ghost" href="${App.esc(back)}">← Back to analysis</a><span class="note">${dials.length} selected style metrics · full tournament</span></div>
      <div class="card team-hero">
        ${App.flag(t.id, 84)}
        <div>
          <div class="kicker">${t.stage} · ${t.n} matches</div>
          <h1>${App.esc(t.name)}</h1>
          <div class="row" style="margin-top:8px">${App.archPill(t.archetype, dials)}<span class="note">${arch.tagline}</span></div>
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
          <div class="sub">Bars show ${App.esc(t.name)}'s averages for your ${dials.length} selected metrics, in standard deviations from the tournament reference. Diamonds show the original ${arch.name.replace("The ", "")} cluster profile.</div>
          <div id="fp"></div>
        </div>
        <div class="card">
          <h3>Model decomposition</h3>
          <div class="sub">Average goal difference per match under the supplied ten-metric model. Click a match dot to inspect its evidence. This model keeps its original reference when style metrics change. <a href="#/method">How is this computed?</a></div>
          <div id="recipe"></div>
          <p class="callout" style="margin-top:12px">${App.recipeSentence(t.name, t.decomp)}</p>
        </div>
      </div>

      <div class="grid-2 section">
        <div class="card">
          <h3>Style twins</h3>
          <div class="sub">The five closest teams across your ${dials.length} selected metrics. Similarity is a percentile among all 1,128 team pairs. Click a team to investigate the difference.</div>
          <div class="twin-list">${near.map((n) => {
            const o = App.team[n.id];
            const gap = t.gd_per_match - o.gd_per_match;
            return `<a class="twin-item" href="${detailUrl(`#/twins/${t.id}/${o.id}`)}">${App.flag(o.id, 30)}
              <div><b>${App.esc(o.name)}</b> <span class="note">${App.arch[o.archetype].name.replace("The ", "")}</span>
              <div class="why">${Math.abs(gap) < 0.05 ? "Similar goal difference" : gap > 0 ? `${App.esc(t.name)} ahead by ${App.signed(gap, 2)} GD/match` : `${App.esc(o.name)} ahead by ${App.signed(-gap, 2)} GD/match`}</div></div>
              <span class="sim">${Math.round(n.sim * 100)}<small style="display:block;font-size:10px">percentile</small></span></a>`;
          }).join("")}</div>
          <p class="note" style="margin-top:10px">Average match-to-team style distance is <b>${drift.toFixed(2)}</b> standard deviations per selected metric (root mean square).
            <a href="#/styles${A.query(dials, { team: t.id })}">See the trajectory on the map →</a></p>
        </div>
        <div class="card">
          <h3>Every match</h3>
          <div class="sub">Inspect match events, passing structure and the original report.</div>
          <div class="match-list">${t.matches.map((k) => {
            const r = App.tm[k];
            return `<a class="match-row" href="${detailUrl(`#/match/${r.match_id}`)}">
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
      const raw = dials.map((d) => d3.mean(t.matches, (k) => App.tm[k].dials[App.dials.indexOf(d)]));
      App.charts.fingerprint(fp, dials.map((d, i) => ({ dial: d, z: z[i], raw: raw[i] })), {
        compare: dials.map((d) => ({ dial: d, z: arch.centroid[d] })), compareLabel: `typical ${arch.name.replace("The ", "")}`, mainLabel: t.name,
      });
      App.charts.recipe(rc, [{ label: t.name, values: t.decomp, dots: t.matches.map((k) => App.tm[k].decomp), dotKeys: t.matches }], {
        onMatch: (key) => App.go(detailUrl(`#/match/${App.tm[key].match_id}`)),
      });
    };
    draw();
    App.onResize(document.getElementById("recipe"), draw);
  };
})();
