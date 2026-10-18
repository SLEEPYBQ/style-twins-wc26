/* Story: the guided path through the findings. Every number on this page is computed from the data. */
(function () {
  const App = window.App;
  const INK = "#1d2433", MUTED = "#858a96", GRID = "#efe9dc", AXIS = "#cfc7b5", POS = "#0a9396", NEG = "#e8743b";

  App.views.story = function (root) {
    const S = App.data.story;
    const sh = S.shares;
    const pct = (v) => `${Math.round(v * 100)}%`;
    const conv = sh.c_finish + sh.c_keep, exec = sh.c_create + sh.c_prevent, ctx = sh.c_style + sh.c_opp;
    const order = App.data.archetypes.slice().sort((a, b) => archGD(b) - archGD(a));
    function archGD(a) { return d3.mean(a.members, (t) => App.team[t].gd_per_match); }
    const best = order[0], worst = order[order.length - 1];
    const spread = d3.max(App.data.archetypes, (a) => d3.max(a.members, (t) => App.team[t].gd_per_match) - d3.min(a.members, (t) => App.team[t].gd_per_match));

    root.innerHTML = `
      <section class="hero">
        <div>
          <div class="kicker">FIFA World Cup 2026 · 48 teams · 104 matches</div>
          <h1>Same playbook,<br><em>different fate.</em></h1>
          <p class="lede">Teams that play almost the same football still walk away with very different results. We sort every team by <b>how</b> it plays,
            then split each result into style, opponents, the team's own play, and what happened in the two penalty boxes.</p>
          <div class="stat-row">
            <div class="stat"><b>5</b><span>playstyles in the tournament</span></div>
            <div class="stat"><b>${pct(sh.c_style)}</b><span>of results explained by style</span></div>
            <div class="stat"><b>${pct(conv)}</b><span>by finishing and goalkeeping</span></div>
          </div>
        </div>
        <img src="img/gen/hero.webp" alt="Two identical cartoon footballers back to back: one celebrating, one dejected">
      </section>

      <nav class="chapter-nav" aria-label="Chapters">
        ${["Five ways to play", "Style vs. the score", "Skill or luck?", "Same style, different fate", "Who beats whom?", "Watch it happen"]
          .map((t, i) => `<button type="button" data-ch="${i + 1}"><span>${i + 1}</span>${t}</button>`).join("")}
      </nav>

      <section class="chapter" id="ch-1">
        <header class="ch-head"><span class="ch-n">1</span><div><h2>Five ways to play</h2>
          <p>Ten style dials from FIFA's phase-of-play data, averaged per team and clustered with k-means, give five clear playstyles. The bars show each style's average setting: teal above the tournament average, orange below.</p></div></header>
        <div class="arch-row" id="arch-row"></div>
        <div class="ch-cta"><a class="btn" href="#/styles">Open the style map →</a><span class="note">See where every team sits, switch dials off, and trace each team's matches.</span></div>
      </section>

      <section class="chapter" id="ch-2">
        <header class="ch-head"><span class="ch-n">2</span><div><h2>Style sets the stage, not the score</h2>
          <p><b>${best.name} averaged ${App.signed(archGD(best), 2)} goals per match and ${worst.name} ${App.signed(archGD(worst), 2)}</b>, so style matters.
            But inside every playstyle, results spread by up to ${spread.toFixed(1)} goals per match. Across all 208 team-matches, style explains only ${pct(sh.c_style)} of the goal difference.</p></div></header>
        <div class="grid-2">
          <div class="card"><h3>Goal difference per match, by playstyle</h3><div class="sub">Each flag is a team; the black tick is the playstyle average. Click a flag for the team page.</div><div id="strip"></div></div>
          <div class="card"><h3>Where results come from</h3><div class="sub">Share of the variation in goal difference across all 208 team-matches, from our six-part split of every result.</div><div id="shares"></div>
            <p class="callout" style="margin-top:12px">What happens in the two boxes (finishing and goalkeeping) explains <b>${pct(conv)}</b>; making and denying chances <b>${pct(exec)}</b>; style and opponents together <b>${pct(ctx)}</b>.</p></div>
        </div>
      </section>

      <section class="chapter" id="ch-3">
        <header class="ch-head"><span class="ch-n">3</span><div><h2>Skill or luck? Ask the knockouts</h2>
          <p>If a strength is real, it should survive into the next round. For the 32 teams that reached the knockouts we compare their group-stage average with their knockout average.
            <b>Making and denying chances carried over (r = ${S.carry.exec.r.toFixed(2)}); finishing and goalkeeping did not (r = ${S.carry.luck.r.toFixed(2)}).</b></p></div></header>
        <div class="grid-2">
          <div class="card"><h3>Execution carries over</h3><div class="sub">Chance creation + prevention beyond expectation, goals per match. 90% bootstrap interval for r: ${S.carry.exec.ci90[0].toFixed(2)} to ${S.carry.exec.ci90[1].toFixed(2)}.</div><div id="carry-exec"></div></div>
          <div class="card"><h3>Conversion resets</h3><div class="sub">Finishing + goalkeeping beyond expectation, goals per match. 90% bootstrap interval for r: ${S.carry.luck.ci90[0].toFixed(2)} to ${S.carry.luck.ci90[1].toFixed(2)}.</div><div id="carry-luck"></div></div>
        </div>
        <p class="note" style="margin-top:10px">Only 32 teams and 1–5 knockout matches each, so read this as strong evidence rather than proof. It fits what analysts see in club football: chance quality is sticky, conversion swings.</p>
      </section>

      <section class="chapter" id="ch-4">
        <header class="ch-head"><span class="ch-n">4</span><div><h2>Same style, different fate</h2>
          <p>Pairs of teams that play more alike than nine in ten team pairs, both with at least four matches. For each pair we split the gap in goal difference into style, opponents, execution and conversion, and name the biggest reason.</p></div></header>
        <div class="pair-grid" id="story-pairs"></div>
        <div class="ch-cta"><a class="btn" href="#/twins">All twin pairs →</a><span class="note">Pick any two teams and see the full breakdown.</span></div>
      </section>

      <section class="chapter" id="ch-5">
        <header class="ch-head"><span class="ch-n">5</span><div><h2>Who beats whom?</h2>
          <p id="matchup-lede"></p></div></header>
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <div class="seg" id="mu-metric"><button data-v="xgd" class="on">Chances (xG difference)</button><button data-v="gd">Scoreboard (goal difference)</button></div>
            <span class="note">Rows play against columns. Average per match; n = matches.</span>
          </div>
          <div id="matrix" style="overflow-x:auto;margin-top:12px"></div>
        </div>
      </section>

      <section class="chapter" id="ch-6">
        <header class="ch-head"><span class="ch-n">6</span><div><h2>Watch it happen</h2>
          <p>Every one of the 104 matches can be replayed from the event data: line-ups, substitutions, cards, every shot, the passing network and the six-part result split.</p></div></header>
        <div class="grid-3" id="replay-cards"></div>
      </section>`;

    root.querySelectorAll(".chapter-nav button").forEach((b) => b.addEventListener("click", () => {
      document.getElementById(`ch-${b.dataset.ch}`).scrollIntoView({ behavior: "smooth", block: "start" });
    }));

    // ------------------------------------------------------------------ chapter 1: archetype cards
    d3.select("#arch-row").selectAll(".arch-card").data(App.data.archetypes).join("a")
      .attr("class", "arch-card").attr("href", (a) => `#/styles?arch=${a.id}`)
      .html((a) => `
        <div class="art" style="background:${d3.color(a.color).copy({ opacity: 0.12 })}"><img src="${App.archArt(a.id)}" alt="" onerror="this.style.visibility='hidden'"></div>
        <h4><svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true"><path d="${App.symbol(a.id, 90)}" fill="${a.color}"/></svg>${a.name}</h4>
        <div class="tag">${a.tagline}</div>
        <div class="fp"></div>
        <div class="members">${a.members.map((t) => `<span title="${App.esc(App.team[t].name)}">${App.flag(t, 18)}</span>`).join("")}</div>`)
      .each(function (a) { App.charts.miniFingerprint(this.querySelector(".fp"), App.dials.map((d) => a.centroid[d]), App.dials, { width: 200, height: 40 }); });

    // ------------------------------------------------------------------ chapter 2: strip plot + variance shares
    function drawStrip() {
      const el = document.getElementById("strip"); el.innerHTML = "";
      const W = el.clientWidth || 520, rowH = 54, labelW = Math.min(150, W * 0.3), H = order.length * rowH + 34;
      const vals = App.teams.map((t) => t.gd_per_match);
      const x = d3.scaleLinear().domain([Math.floor(d3.min(vals)), Math.ceil(d3.max(vals))]).range([labelW + 12, W - 14]);
      const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
      svg.append("g").selectAll("line").data(x.ticks(6)).join("line").attr("x1", (d) => x(d)).attr("x2", (d) => x(d)).attr("y1", 6).attr("y2", H - 24)
        .attr("stroke", (d) => (d === 0 ? AXIS : GRID)).attr("stroke-width", (d) => (d === 0 ? 1.5 : 1));
      svg.append("g").selectAll("text").data(x.ticks(6)).join("text").attr("class", "axis-cap tnum").attr("x", (d) => x(d)).attr("y", H - 8)
        .attr("text-anchor", "middle").text((d) => (d === 0 ? "0" : App.signed(d, 0)));
      order.forEach((a, i) => {
        const cy = 10 + i * rowH + rowH / 2;
        const g = svg.append("g");
        g.append("path").attr("d", App.symbol(a.id, 70)).attr("transform", `translate(8,${cy})`).attr("fill", a.color);
        g.append("text").attr("x", 20).attr("y", cy).attr("dominant-baseline", "central").attr("font-size", 12.5).attr("font-weight", 700).attr("fill", INK)
          .text(a.name.replace("The ", ""));
        // beeswarm-ish: spread flags vertically when they collide
        const nodes = a.members.map((id) => ({ id, x: x(App.team[id].gd_per_match), y: cy, tx: x(App.team[id].gd_per_match) }));
        const sim = d3.forceSimulation(nodes).force("x", d3.forceX((d) => d.tx).strength(1)).force("y", d3.forceY(cy).strength(0.08))
          .force("c", d3.forceCollide(9.5)).stop();
        for (let k = 0; k < 120; k++) sim.tick();
        nodes.forEach((n) => { n.y = Math.max(cy - rowH / 2 + 10, Math.min(cy + rowH / 2 - 10, n.y)); });
        const mean = archGD(a);
        g.append("line").attr("x1", x(mean)).attr("x2", x(mean)).attr("y1", cy - rowH / 2 + 4).attr("y2", cy + rowH / 2 - 4).attr("stroke", INK).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
        const f = g.selectAll("g.f").data(nodes).join("g").attr("class", "f").attr("transform", (n) => `translate(${n.x},${n.y})`).style("cursor", "pointer")
          .on("mousemove", (evt, n) => { const t = App.team[n.id]; App.tip.show(`<div class="tt-title">${App.esc(t.name)}</div>${App.ttRows([["Goal diff / match", App.signed(t.gd_per_match, 2)], ["Reached", t.stage]])}`, evt); })
          .on("mouseleave", App.tip.hide).on("click", (evt, n) => App.go(`#/team/${n.id}`));
        f.append("circle").attr("r", 8.5).attr("fill", "#fff").attr("stroke", a.color).attr("stroke-width", 2);
        f.append("image").attr("href", (n) => App.flagUrl(n.id)).attr("x", -7).attr("y", -7).attr("width", 14).attr("height", 14)
          .attr("clip-path", "url(#flag-clip)");
      });
    }
    function drawShares() {
      const el = document.getElementById("shares"); el.innerHTML = "";
      const items = [
        { g: "Conversion", k: "c_finish", label: "Finishing" }, { g: "Conversion", k: "c_keep", label: "Goalkeeping" },
        { g: "Execution", k: "c_prevent", label: "Chance prevention" }, { g: "Execution", k: "c_create", label: "Chance creation" },
        { g: "Context", k: "c_style", label: "Style" }, { g: "Context", k: "c_opp", label: "Opponents" },
      ];
      const W = el.clientWidth || 480, labelW = 140, groupW = 96, rowH = 34, H = items.length * rowH + 8;
      const x = d3.scaleLinear().domain([0, d3.max(items, (d) => sh[d.k])]).range([labelW, W - groupW - 40]);
      const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
      items.forEach((d, i) => {
        const y = 4 + i * rowH;
        svg.append("text").attr("x", labelW - 10).attr("y", y + rowH / 2).attr("text-anchor", "end").attr("dominant-baseline", "central")
          .attr("font-size", 13).attr("font-weight", 650).attr("fill", INK).text(d.label);
        svg.append("path").attr("d", App.charts.hbar(labelW, x(sh[d.k]), y + 8, rowH - 16)).attr("fill", d.g === "Context" ? MUTED : INK);
        svg.append("text").attr("x", x(sh[d.k]) + 6).attr("y", y + rowH / 2).attr("dominant-baseline", "central").attr("font-size", 12.5)
          .attr("font-weight", 800).attr("fill", INK).attr("class", "tnum").text(pct(sh[d.k]));
      });
      [["Conversion", 0, 2, conv], ["Execution", 2, 4, exec], ["Context", 4, 6, ctx]].forEach(([g, a, b, v]) => {
        const y1 = 4 + a * rowH + 6, y2 = 4 + b * rowH - 6, gx = W - groupW;
        svg.append("path").attr("d", `M${gx},${y1} h6 V${y2} h-6`).attr("fill", "none").attr("stroke", AXIS).attr("stroke-width", 1.5);
        svg.append("text").attr("x", gx + 14).attr("y", (y1 + y2) / 2 - 7).attr("font-size", 12).attr("font-weight", 700).attr("fill", "#4a5263").text(g);
        svg.append("text").attr("x", gx + 14).attr("y", (y1 + y2) / 2 + 10).attr("font-size", 15).attr("font-weight", 800).attr("fill", INK).text(pct(v));
      });
    }

    // ------------------------------------------------------------------ chapter 3: carry-over scatterplots
    function drawCarry(id, key, r) {
      const el = document.getElementById(id); el.innerHTML = "";
      const W = el.clientWidth || 420, H = Math.min(360, W * 0.82), m = { t: 12, r: 14, b: 40, l: 46 };
      const pts = S.carry.teams.map((t) => ({ id: t.id, x: t[`${key}_g`], y: t[`${key}_k`] }));
      const all = S.carry.teams.flatMap((t) => [t.exec_g, t.exec_k, t.luck_g, t.luck_k]);
      const lim = Math.ceil(d3.max(all, Math.abs) * 2) / 2;
      const x = d3.scaleLinear().domain([-lim, lim]).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([-lim, lim]).range([H - m.b, m.t]);
      const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
      const ticks = x.ticks(5);
      svg.append("g").selectAll("line").data(ticks).join("line").attr("x1", (d) => x(d)).attr("x2", (d) => x(d)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", (d) => (d === 0 ? AXIS : GRID));
      svg.append("g").selectAll("line").data(ticks).join("line").attr("y1", (d) => y(d)).attr("y2", (d) => y(d)).attr("x1", m.l).attr("x2", W - m.r).attr("stroke", (d) => (d === 0 ? AXIS : GRID));
      svg.append("g").selectAll("text").data(ticks).join("text").attr("class", "axis-cap tnum").attr("x", (d) => x(d)).attr("y", H - m.b + 14).attr("text-anchor", "middle").text((d) => (d ? App.signed(d, 1) : "0"));
      svg.append("g").selectAll("text").data(ticks).join("text").attr("class", "axis-cap tnum").attr("x", m.l - 6).attr("y", (d) => y(d)).attr("text-anchor", "end").attr("dominant-baseline", "central").text((d) => (d ? App.signed(d, 1) : "0"));
      svg.append("text").attr("class", "axis-label").attr("x", W - m.r).attr("y", H - 6).attr("text-anchor", "end").text("Group stage →");
      svg.append("text").attr("class", "axis-label").attr("transform", `translate(12,${H - m.b}) rotate(-90)`).text("Knockouts →");
      // least-squares line
      const mx = d3.mean(pts, (p) => p.x), my = d3.mean(pts, (p) => p.y);
      const b = d3.sum(pts, (p) => (p.x - mx) * (p.y - my)) / d3.sum(pts, (p) => (p.x - mx) ** 2);
      const xa = -lim, xb = lim;
      svg.append("line").attr("x1", x(xa)).attr("y1", y(my + b * (xa - mx))).attr("x2", x(xb)).attr("y2", y(my + b * (xb - mx)))
        .attr("stroke", key === "exec" ? POS : NEG).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
      const f = svg.selectAll("g.f").data(pts).join("g").attr("class", "f").attr("transform", (p) => `translate(${x(p.x)},${y(p.y)})`).style("cursor", "pointer")
        .on("mousemove", (evt, p) => App.tip.show(`<div class="tt-title">${App.esc(App.team[p.id].name)}</div>${App.ttRows([["Group stage", App.signed(p.x, 2)], ["Knockouts", App.signed(p.y, 2)]])}`, evt))
        .on("mouseleave", App.tip.hide).on("click", (evt, p) => App.go(`#/team/${p.id}`));
      f.append("circle").attr("r", 8.5).attr("fill", "#fff").attr("stroke", INK).attr("stroke-opacity", 0.25).attr("stroke-width", 1.5);
      f.append("image").attr("href", (p) => App.flagUrl(p.id)).attr("x", -7).attr("y", -7).attr("width", 14).attr("height", 14).attr("clip-path", "url(#flag-clip)");
      svg.append("text").attr("x", m.l + 10).attr("y", m.t + 16).attr("font-size", 22).attr("font-weight", 800).attr("font-family", "var(--display)").attr("fill", INK)
        .text(`r = ${r.toFixed(2)}`);
    }

    // ------------------------------------------------------------------ chapter 4: featured twin stories
    function storyPairs() {
      const space = App.styleSpace(App.dials);
      const twins = App.twinTable(space);
      const pairs = [];
      for (const t of App.teams) for (const n of twins.near[t.id]) {
        if (t.id >= n.id || n.sim < 0.9 || t.n < 4 || App.team[n.id].n < 4) continue;
        pairs.push({ a: t.id, b: n.id, sim: n.sim, e: App.explainGap(t.id, n.id) });
      }
      pairs.sort((p, q) => q.e.gap - p.e.gap);
      // one example per story type, never reusing a team
      const picks = [], used = new Set();
      const free = (p) => !used.has(p.a) && !used.has(p.b);
      const take = (p) => { picks.push(p); used.add(p.a); used.add(p.b); };
      for (const type of ["exec", "luck", "opp", "style"]) {
        const p = pairs.find((x) => x.e.type === type && free(x));
        if (p && picks.length < 3) take(p);
      }
      for (const p of pairs) if (picks.length < 3 && free(p)) take(p);
      return picks;
    }
    document.getElementById("story-pairs").innerHTML = storyPairs().map((p) => App.pairCard(p)).join("");

    // ------------------------------------------------------------------ chapter 5: matchup matrix
    const A = App.data.archetypes;
    const mu = S.matchups;
    const storm = A.find((a) => a.id === "stormers");
    const stormRow = A.filter((a) => a.id !== "stormers").map((a) => ({ a, v: mu[`stormers|${a.id}`] })).filter((d) => d.v);
    const beatAll = stormRow.every((d) => d.v.xgd > 0);
    const gdLosses = stormRow.filter((d) => d.v.gd < 0);
    document.getElementById("matchup-lede").innerHTML = `${beatAll ? `<b>${storm.name} out-chanced every other playstyle</b>, by up to ${App.signed(d3.max(stormRow, (d) => d.v.xgd), 2)} xG per match.` : ""}
      ${gdLosses.length ? ` But on the scoreboard they came out behind against ${gdLosses.map((d) => d.a.name).join(" and ")}: a reminder from chapter 3 that conversion, not chance creation, is where results swing.` : ""}
      Switch between chances and goals to compare.`;
    let metric = "xgd";
    function drawMatrix() {
      const el = document.getElementById("matrix"); el.innerHTML = "";
      const cell = Math.max(64, Math.min(104, ((el.clientWidth || 700) - 170) / 5)), labelW = 160, top = 54;
      const W = labelW + cell * 5 + 4, H = top + cell * 5 + 4;
      const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
      const color = d3.scaleLinear().domain([-2, 0, 2]).range([NEG, "#f1ece2", POS]).clamp(true);
      A.forEach((c, j) => {
        const gx = labelW + j * cell + cell / 2;
        svg.append("path").attr("d", App.symbol(c.id, 70)).attr("transform", `translate(${gx},${14})`).attr("fill", c.color);
        svg.append("text").attr("x", gx).attr("y", 36).attr("text-anchor", "middle").attr("font-size", 11.5).attr("font-weight", 700).attr("fill", INK).text(c.name.replace("The ", ""));
      });
      A.forEach((r, i) => {
        const gy = top + i * cell + cell / 2;
        svg.append("path").attr("d", App.symbol(r.id, 70)).attr("transform", `translate(10,${gy})`).attr("fill", r.color);
        svg.append("text").attr("x", 24).attr("y", gy).attr("dominant-baseline", "central").attr("font-size", 12.5).attr("font-weight", 700).attr("fill", INK).text(r.name.replace("The ", ""));
        A.forEach((c, j) => {
          const v = mu[`${r.id}|${c.id}`];
          const g = svg.append("g").attr("transform", `translate(${labelW + j * cell},${top + i * cell})`);
          const diag = r.id === c.id;
          g.append("rect").attr("x", 2).attr("y", 2).attr("width", cell - 4).attr("height", cell - 4).attr("rx", 10)
            .attr("fill", diag || !v ? "#f6f1e6" : color(v[metric]));
          if (!diag && v) {
            const dark = Math.abs(v[metric]) > 1.2;
            g.append("text").attr("x", cell / 2).attr("y", cell / 2 - 5).attr("text-anchor", "middle").attr("font-size", 17).attr("font-weight", 800)
              .attr("font-family", "var(--display)").attr("fill", dark ? "#fff" : INK).text(App.signed(v[metric], 2));
            g.append("text").attr("x", cell / 2).attr("y", cell / 2 + 15).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", dark ? "#fff" : MUTED).text(`n = ${v.n}`);
            g.append("rect").attr("width", cell).attr("height", cell).attr("fill", "transparent")
              .on("mousemove", (evt) => App.tip.show(`<div class="tt-title">${r.name} v ${c.name}</div>` +
                App.ttRows([["xG difference / match", App.signed(v.xgd, 2)], ["Goal difference / match", App.signed(v.gd, 2)], ["Matches", v.n]]), evt))
              .on("mouseleave", App.tip.hide);
          } else if (diag) {
            g.append("text").attr("x", cell / 2).attr("y", cell / 2).attr("text-anchor", "middle").attr("dominant-baseline", "central").attr("font-size", 11).attr("fill", MUTED)
              .text(v ? `same style · n = ${v.n}` : "—");
          }
        });
      });
    }
    d3.selectAll("#mu-metric button").on("click", function () {
      metric = this.dataset.v;
      d3.selectAll("#mu-metric button").classed("on", (d, i, n) => n[i] === this);
      drawMatrix();
    });

    // ------------------------------------------------------------------ chapter 6: replay entry points
    const ms = App.data.matches;
    const final = ms.find((m) => m.stage === "Final");
    const upset = ms.map((m) => ({ m, u: Math.sign(m.xg[0] - m.xg[1]) !== Math.sign(m.score[0] - m.score[1]) && m.score[0] !== m.score[1] ? Math.abs(m.xg[0] - m.xg[1]) : 0 }))
      .sort((a, b) => b.u - a.u)[0].m;
    const goals = ms.slice().sort((a, b) => b.score[0] + b.score[1] - (a.score[0] + a.score[1]))[0];
    const card = (m, label, note) => `<a class="card replay-card" href="#/match/${m.id}">
      <div class="kicker">${label}</div>
      <div class="rc-line">${App.flag(m.home, 30)}<b>${App.esc(App.team[m.home].name)}</b><span class="rc-score tnum">${m.score[0]}–${m.score[1]}</span><b>${App.esc(App.team[m.away].name)}</b>${App.flag(m.away, 30)}</div>
      <div class="note">${note}</div><span class="btn small">Replay →</span></a>`;
    document.getElementById("replay-cards").innerHTML =
      card(final, "The final", `${final.date}, ${App.esc(final.venue)}${final.aet ? ", after extra time" : ""}.`) +
      card(upset, "Biggest upset", `The winner had ${Math.min(...upset.xg).toFixed(2)} xG to the loser's ${Math.max(...upset.xg).toFixed(2)}.`) +
      card(goals, "Most goals", `${goals.score[0] + goals.score[1]} goals, ${goals.stage === "Group" ? goals.group : goals.stage}.`);

    const draw = () => { drawStrip(); drawShares(); drawCarry("carry-exec", "exec", S.carry.exec.r); drawCarry("carry-luck", "luck", S.carry.luck.r); drawMatrix(); };
    draw();
    App.onResize(document.getElementById("strip"), draw);
  };
})();
