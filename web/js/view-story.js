/* A guided entry into the same comparisons available throughout the explorer. */
(function () {
  const App = window.App;
  const INK = "#1d2433", TEAL = App.isDesktop() ? "#0a9396" : "#087f82", ORANGE = App.isDesktop() ? "#e8743b" : "#bd6234";
  // Lab and audit previews: light on desktop, the existing dark panel on phones.
  const PREVIEW = App.isDesktop()
    ? { edge: "#0a9396", ring: "#e8e1d2", leader: "#f2b134", leaderStroke: "#1d2433", node: "#ffffff", nodeStroke: "#0a9396", leaderText: "#1d2433", nodeText: "#1d2433", name: "#4a5263", band: "#0a939614", grid: "#e8e1d2", rankLabel: "#858a96", caption: "#858a96", row: "#1d2433", link: "#cfc7b5", base: "#858a96", near: "#0a9396", far: "#e8743b", value: "#1d2433" }
    : { edge: "#73d6df", ring: "#d5f4ff15", leader: "#ddf38b", leaderStroke: "#ddf38b", node: "#183743", nodeStroke: "#83d7d9", leaderText: "#122832", nodeText: "#e5fafa", name: "#ccdde6", band: "#ddf38b09", grid: "#d5f4ff20", rankLabel: "#c4d2db", caption: "#8ba2af", row: "#c7d7de", link: "#8ca5ae", base: "#526c7a", near: "#ddf38b", far: "#ffbc8c", value: "#f2f7f8" };

  App.views.story = function (root) {
    const analysis = App.analysis;
    const profiles = Object.fromEntries(App.teams.map((team) =>
      [team.id, analysis.summary(analysis.rows(team.id))]
    ));
    const twins = analysis.twinTable(analysis.space(App.dials));
    const comparisonLink = (a, b) => `#/twins/${a}/${b}${analysis.query(App.dials)}`;
    const pairPercentile = (a, b) => Math.round(twins.near[a].find((row) => row.id === b).sim * 100);
    const ned = profiles.NED, cro = profiles.CRO;
    const outcomes = [
      { label: "Expected goal difference", key: "xgd" },
      { label: "Actual goal difference", key: "gd" },
    ];
    const barScale = Math.max(...outcomes.flatMap(({ key }) => [Math.abs(ned[key]), Math.abs(cro[key])]));
    const heroRows = outcomes.map(({ label, key }) => `
      <div class="review-hero-metric">
        <span>${label} <small>per match</small></span>
        ${[["NED", ned, "home"], ["CRO", cro, "away"]].map(([id, data, color]) => `
          <div class="review-hero-bar">
            <span>${id}</span>
            <div class="review-bar-track"><i class="${color}" style="left:${data[key] < 0 ? 50 - Math.abs(data[key]) / barScale * 50 : 50}%;width:${Math.abs(data[key]) / barScale * 50}%"></i></div>
            <b>${App.signed(data[key], 2)}</b>
          </div>`).join("")}
      </div>`).join("");

    root.innerHTML = `
      <div class="review-home">
        <section class="review-hero">
          <div class="review-hero-copy">
            <div class="review-eyebrow">World Cup 2026 · For fans who study the match</div>
            <h1>Why do similar teams<br>get different results?</h1>
            <p>Start with a team you know. Find its closest styles, compare the chances and scorelines, then inspect the matches behind the difference.</p>
            <div class="review-actions">
              <a class="btn" href="${comparisonLink("NED", "CRO")}">Investigate Netherlands & Croatia <span aria-hidden="true">↗</span></a>
              <div class="review-hero-tool-links"><a class="review-text-link" href="#/lab/2026-M022-ENG-CRO?team=ENG&pane=network">Open Match Lab ↗</a><a class="review-text-link review-hero-audit-link" href="#/robustness/NED/CRO">Audit the resemblance →</a></div>
            </div>
            <div class="review-coverage"><span><b>48</b> teams</span><span><b>104</b> matches</span><span><b>10</b> style dimensions</span></div>
          </div>
          <img class="review-hero-art" src="img/gen/hero.webp" alt="" width="720" height="720" loading="lazy">
          <div class="review-hero-evidence">
            <div class="review-evidence-top"><span>Start with an observation</span><span class="review-live-dot">Tournament data</span></div>
            <div class="review-hero-teams">
              <div>${App.flag("NED", 40)}<b>Netherlands</b><span>${ned.n} matches</span></div>
              <span class="review-vs">vs</span>
              <div>${App.flag("CRO", 40)}<b>Croatia</b><span>${cro.n} matches</span></div>
            </div>
            <div class="review-similarity">Closer in style than <b>${pairPercentile("NED", "CRO")}%</b> of team pairings</div>
            ${heroRows}
            <p class="review-hero-foot">Both reached the round of 32. Their goal difference still differs by <b>${(ned.gd - cro.gd).toFixed(2)} per match</b>. Which matches account for that gap?</p>
          </div>
        </section>

        <nav class="review-journey" aria-label="Your analysis journey">
          <a href="#/styles"><span class="review-step">01</span><div><b>Find a meaningful comparison</b><span>Choose the dimensions that define similar football.</span></div><span aria-hidden="true">↗</span></a>
          <a href="${comparisonLink("NED", "CRO")}"><span class="review-step">02</span><div><b>Separate chances from scores</b><span>Compare shot volume, chance quality and conversion.</span></div><span aria-hidden="true">↗</span></a>
          <a href="#/matches"><span class="review-step">03</span><div><b>Follow the match evidence</b><span>Check opponents, individual games and passing patterns.</span></div><span aria-hidden="true">↗</span></a>
        </nav>

        <section class="review-tools" aria-labelledby="review-tools-title">
          <div class="review-tools-heading"><div><div class="review-eyebrow">The analysis desk</div><h2 id="review-tools-title">Look closer.<br>Then challenge the comparison.</h2></div><p>Trace the connections in a match. Test whether a familiar style survives a different choice of evidence.</p></div>
          <div class="review-tool-grid">
            <article class="review-tool review-tool-lab">
              <div class="review-tool-top"><span>01 / Match lab</span><span class="review-tool-badge">104 matches to inspect</span></div>
              <h3>Who connects the team?</h3><p>Follow directed passing links, reveal individual contributions, and inspect how a team attempts to break the lines.</p>
              <div id="review-lab-preview" class="review-tool-graphic" aria-live="polite"><p class="review-preview-loading">Loading England’s passing connections…</p></div>
              <div class="review-tool-actions"><a class="review-tool-primary" href="#/lab/2026-M022-ENG-CRO?team=ENG&pane=network">Open the match lab <span aria-hidden="true">↗</span></a><a href="#/lab/2026-M022-ENG-CRO?team=ENG&pane=breaks">Line breaks →</a><a href="#/lab/2026-M022-ENG-CRO?team=ENG&pane=pulse">Match pulse →</a></div>
            </article>
            <article class="review-tool review-tool-audit">
              <div class="review-tool-top"><span>02 / Robustness lab</span><span class="review-tool-badge">Test the evidence</span></div>
              <h3>How fragile is “similar”?</h3><p>Omit one indicator or one match at a time. Watch a neighbour’s rank move, and see which observations matter most.</p>
              <div id="review-audit-preview" class="review-tool-graphic"></div>
              <div class="review-tool-actions"><a class="review-tool-primary" href="#/robustness/NED/CRO">Challenge Netherlands & Croatia <span aria-hidden="true">↗</span></a><a href="#/method">Read the method →</a></div>
            </article>
          </div>
          <div class="review-tools-foot"><span>Connected evidence. Your selections carry into the next view.</span><a href="#/method">How these tools use the data ↗</a></div>
        </section>

        <section class="review-section">
          <div class="review-section-head"><div><div class="review-eyebrow">Questions to explore</div><h2>Choose a starting point</h2></div><a class="review-text-link" href="#/twins">Explore every pair →</a></div>
          <div class="review-case-grid" id="review-cases"></div>
        </section>

        <section class="review-section">
          <div class="review-section-head"><div><div class="review-eyebrow">Tournament overview</div><h2>Similar styles still spread out</h2></div><a class="review-text-link" href="#/styles">Open the interactive map →</a></div>
          <div class="review-overview-grid">
            <div class="card review-style-summary">
              <p>Five groups summarize the tournament's style profiles. Teams within a group can have very different opportunities and scorelines.</p>
              <div class="review-archetype-list">${App.data.archetypes.map((arch) => `
                <a href="#/styles?arch=${arch.id}"><i style="background:${arch.color}"><img class="review-arch-art" src="${App.archArt(arch.id)}" alt="" loading="lazy"></i><span><b>${arch.name.replace("The ", "")}</b><small>${arch.members.length} teams</small></span><span aria-hidden="true">→</span></a>`).join("")}</div>
              <p class="note">Groups use all ten dimensions and remain fixed when you explore alternative feature selections.</p>
            </div>
            <div class="card review-outcome-card">
              <div class="review-chart-heading"><h3>Team performance within each style</h3><div class="seg" id="review-outcome-control" aria-label="Outcome measure"><button type="button" data-metric="xgd" class="on" aria-pressed="true">xG difference</button><button type="button" data-metric="gd" aria-pressed="false">Goal difference</button></div></div>
              <p class="sub">Each dot is one team's per-match average. The vertical tick is the average of teams in that group. Select a dot to inspect the team.</p>
              <div id="review-outcomes"></div>
              <div class="review-chart-key"><span><i style="background:${TEAL}"></i>Above zero</span><span><i style="background:${ORANGE}"></i>Below zero</span><span>All tournament matches</span></div>
            </div>
          </div>
        </section>

        <section class="review-section">
          <div class="review-section-head"><div><div class="review-eyebrow">Opponent context</div><h2>What happened when styles met?</h2></div></div>
          <div class="card review-matrix-card">
            <div class="review-chart-heading"><p>Choose a cell to inspect every match behind its average.</p><div class="seg" id="review-matrix-control" aria-label="Matchup measure"><button type="button" data-metric="xgd" class="on" aria-pressed="true">xG difference</button><button type="button" data-metric="gd" aria-pressed="false">Goal difference</button></div></div>
            <div id="review-matrix" class="review-matrix-scroll"></div>
            <div class="review-matrix-legend"><span class="review-color-scale"></span><span>Orange favours the column · Teal favours the row · Values per match</span></div>
            <p class="note">Each team's style group comes from its tournament average. Different teams, opponents and sample sizes contribute to each cell. These are observed matchups within this tournament.</p>
          </div>
        </section>

        <section class="review-closing">
          <div><div class="review-eyebrow">From a pattern to a match</div><h2>A scoreline is the beginning of the question.</h2><p>Explore the underlying chances, then use the event timeline and full-match passing network to build a more specific interpretation.</p></div>
          <div class="review-actions"><a class="btn" href="#/matches">Browse all matches →</a><a class="review-text-link" href="#/method">Understand the measures</a></div>
        </section>
      </div>`;

    const cases = [
      { a: "NED", b: "CRO", question: "Does the average hide one decisive match?", note: "Both teams played four games and exited in the same round. Check how much each match contributes.", metric: "Goal difference gap", value: profiles.NED.gd - profiles.CRO.gd },
      { a: "MEX", b: "SWE", question: "Where do their chances start to differ?", note: "Compare opportunities created and allowed, then inspect the opponents in each team's schedule.", metric: "xG difference gap", value: profiles.MEX.xgd - profiles.SWE.xgd },
      { a: "ENG", b: "NOR", question: "Does the comparison hold across stages?", note: "Switch between group and knockout matches to see how the selected evidence changes.", metric: "Goal difference gap", value: profiles.ENG.gd - profiles.NOR.gd },
    ];
    root.querySelector("#review-cases").innerHTML = cases.map((c, i) => `
      <a class="review-case" href="${comparisonLink(c.a, c.b)}">
        <div class="review-case-top"><span>Case ${i + 1}</span><span>Similarity percentile ${pairPercentile(c.a, c.b)}</span></div>
        <div class="review-case-teams">${App.flag(c.a, 26)}<b>${App.esc(App.team[c.a].name)}</b><span> / </span>${App.flag(c.b, 26)}<b>${App.esc(App.team[c.b].name)}</b></div>
        <h3>${c.question}</h3><p>${c.note}</p>
        <div class="review-case-bottom"><span>${c.metric}<small>First team minus second · per match</small></span><b>${App.signed(c.value, 2)} <span aria-hidden="true">↗</span></b></div>
      </a>`).join("");

    // Preview actual directed pass counts; the circular layout implies no field coordinates.
    App.loadMatch("2026-M022-ENG-CRO").then((match) => {
      const target = root.querySelector("#review-lab-preview");
      if (!target || !target.isConnected) return;
      const team = match.teams.find((item) => item.team_id === "ENG");
      const edges = team.edges.filter((edge) => edge[2] > 0);
      const volume = d3.sum(edges, (edge) => edge[2]);
      const strongest = edges.slice().sort((a, b) => b[2] - a[2]).slice(0, 10);
      const involvement = team.players.map((_, index) => d3.sum(edges, (edge) => edge[0] === index || edge[1] === index ? edge[2] : 0));
      const active = team.players.map((player, index) => ({ player, index })).filter(({ index }) => involvement[index] > 0);
      const roleOrder = { GK: 0, DF: 1, MF: 2, FW: 3 };
      active.sort((a, b) => (roleOrder[a.player.role] ?? 4) - (roleOrder[b.player.role] ?? 4) || a.player.num - b.player.num);
      const positions = new Map(active.map((item, index) => {
        const angle = -Math.PI / 2 + index / active.length * Math.PI * 2;
        return [item.index, { x: 205 + 111 * Math.cos(angle), y: 154 + 111 * Math.sin(angle), angle }];
      }));
      target.innerHTML = `<div class="review-preview-caption"><b>${App.esc(team.name)} v Croatia</b><span>M22 · Full-match pass counts</span></div><div class="review-network-preview"></div><div class="review-preview-stats"><div><b>${volume}</b><span>recorded network passes</span></div><div><b>${team.lb.cmp}<small> / ${team.lb.att}</small></b><span>line breaks completed / attempted</span></div></div>`;
      const svg = d3.select(target.querySelector(".review-network-preview")).append("svg").attr("viewBox", "0 0 410 310").attr("role", "img")
        .attr("aria-label", `England against Croatia: ten strongest directed passing connections, from ${volume} recorded network passes. Schematic circular player layout.`);
      svg.append("defs").append("marker").attr("id", "review-pass-arrow").attr("viewBox", "0 -3 6 6").attr("refX", 5).attr("refY", 0).attr("markerWidth", 4).attr("markerHeight", 4).attr("orient", "auto")
        .append("path").attr("d", "M0,-3L6,0L0,3Z").attr("fill", PREVIEW.edge);
      svg.append("circle").attr("cx", 205).attr("cy", 154).attr("r", 111).attr("fill", "none").attr("stroke", PREVIEW.ring);
      const edgeWidth = d3.scaleSqrt().domain([0, d3.max(strongest, (edge) => edge[2])]).range([0.6, 4]);
      strongest.forEach((edge) => {
        const from = positions.get(edge[0]), to = positions.get(edge[1]);
        const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
        svg.append("path").attr("d", `M${from.x + dx / length * 11},${from.y + dy / length * 11} Q205,154 ${to.x - dx / length * 14},${to.y - dy / length * 14}`)
          .attr("fill", "none").attr("stroke", PREVIEW.edge).attr("stroke-opacity", 0.65).attr("stroke-width", edgeWidth(edge[2])).attr("marker-end", "url(#review-pass-arrow)")
          .append("title").text(`${team.players[edge[0]].short} → ${team.players[edge[1]].short}: ${edge[2]} passes`);
      });
      const radius = d3.scaleSqrt().domain([0, d3.max(involvement)]).range([4, 11]);
      active.forEach(({ player, index }) => {
        const position = positions.get(index), leader = involvement[index] === d3.max(involvement);
        const node = svg.append("a").attr("href", `#/lab/${match.id}?team=ENG&pane=network&player=${index}`).attr("aria-label", `Inspect ${player.name}'s passing connections`);
        node.append("circle").attr("cx", position.x).attr("cy", position.y).attr("r", radius(involvement[index])).attr("fill", leader ? PREVIEW.leader : PREVIEW.node).attr("stroke", leader ? PREVIEW.leaderStroke : PREVIEW.nodeStroke).attr("stroke-width", 1.4);
        node.append("text").attr("x", position.x).attr("y", position.y + 3).attr("text-anchor", "middle").attr("font-size", 7).attr("font-weight", 750).attr("fill", leader ? PREVIEW.leaderText : PREVIEW.nodeText).text(player.num);
        const labelX = position.x + Math.cos(position.angle) * 17, labelY = position.y + Math.sin(position.angle) * 17;
        node.append("text").attr("x", labelX).attr("y", labelY + 3).attr("text-anchor", Math.cos(position.angle) < -.15 ? "end" : Math.cos(position.angle) > .15 ? "start" : "middle").attr("font-size", 8).attr("fill", PREVIEW.name).text(player.short);
        node.append("title").text(`${player.name}: ${involvement[index]} incoming + outgoing network passes. Select to inspect.`);
      });
      target.insertAdjacentHTML("beforeend", '<p class="review-preview-note">Ten strongest directed links · node size = pass involvement · positions schematic</p>');
    }).catch(() => {
      const target = root.querySelector("#review-lab-preview");
      if (target) target.innerHTML = '<p class="review-preview-loading">Open the match lab to inspect the source passing records.</p>';
    });

    drawAuditPreview();
    function drawAuditPreview() {
      const target = root.querySelector("#review-audit-preview");
      const audit = App.robustness?.audit("NED", "CRO", App.dials, "all");
      if (!audit?.valid) {
        target.innerHTML = '<p class="review-preview-loading">Compare the full profile with each indicator and match removed in turn.</p>';
        return;
      }
      const scenarios = audit.matches;
      const worstRank = d3.max(scenarios, (row) => row.rankA), bestRank = d3.min(scenarios, (row) => row.rankA);
      const withinFive = scenarios.filter((row) => row.rankA <= 5).length;
      target.innerHTML = `<div class="review-preview-caption"><b>Croatia’s rank for the Netherlands</b><span>Leave one match out</span></div><div class="review-rank-preview"></div><div class="review-preview-stats"><div><b>${bestRank}<small>–</small>${worstRank}</b><span>neighbour rank across omissions</span></div><div><b>${withinFive}<small> / ${scenarios.length}</small></b><span>omissions keep Croatia in the top 5</span></div></div><p class="review-preview-note">All ten indicators · all tournament matches · lower rank means closer</p>`;
      const svg = d3.select(target.querySelector(".review-rank-preview")).append("svg").attr("viewBox", "0 0 410 310").attr("role", "img").attr("aria-label", `Croatia's neighbour rank for the Netherlands ranges from ${bestRank} to ${worstRank} when one match is omitted.`);
      const x = d3.scaleLinear().domain([1, Math.max(10, worstRank)]).range([135, 379]);
      const y = d3.scalePoint().domain(scenarios.map((row) => row.id)).range([55, 264]);
      svg.append("rect").attr("x", x(1)).attr("y", 37).attr("width", x(5) - x(1)).attr("height", 244).attr("rx", 4).attr("fill", PREVIEW.band);
      [1, 5, 10].filter((rank) => rank <= Math.max(10, worstRank)).forEach((rank) => {
        svg.append("line").attr("x1", x(rank)).attr("x2", x(rank)).attr("y1", 37).attr("y2", 282).attr("stroke", PREVIEW.grid).attr("stroke-dasharray", rank === 1 ? null : "3,5");
        svg.append("text").attr("x", x(rank)).attr("y", 22).attr("text-anchor", "middle").attr("fill", PREVIEW.rankLabel).attr("font-size", 10).text(`#${rank}`);
      });
      svg.append("text").attr("x", 0).attr("y", 22).attr("fill", PREVIEW.caption).attr("font-size", 9).text("Omitted match");
      scenarios.forEach((scenario) => {
        const row = analysis.records.find((item) => item.key === scenario.omittedKey);
        const label = row ? `${row.team_id} v ${row.opp_id} · M${row.number}` : scenario.label;
        const cy = y(scenario.id);
        svg.append("text").attr("x", 0).attr("y", cy + 4).attr("fill", PREVIEW.row).attr("font-size", 10).text(label);
        svg.append("line").attr("x1", x(audit.base.rankA)).attr("x2", x(scenario.rankA)).attr("y1", cy).attr("y2", cy).attr("stroke", PREVIEW.link).attr("stroke-width", 2);
        svg.append("circle").attr("cx", x(audit.base.rankA)).attr("cy", cy).attr("r", 3).attr("fill", PREVIEW.base);
        svg.append("circle").attr("cx", x(scenario.rankA)).attr("cy", cy).attr("r", 5).attr("fill", scenario.rankA <= 5 ? PREVIEW.near : PREVIEW.far)
          .append("title").text(`${label}: Croatia is neighbour #${scenario.rankA}. Baseline #${audit.base.rankA}.`);
        svg.append("text").attr("x", x(scenario.rankA) + 9).attr("y", cy + 3).attr("fill", PREVIEW.value).attr("font-size", 9).text(scenario.rankA);
      });
      svg.append("text").attr("x", 135).attr("y", 303).attr("fill", PREVIEW.caption).attr("font-size", 9).text(`Baseline: neighbour #${audit.base.rankA} · one omission per row`);
    }

    let outcomeMetric = "xgd", matchupMetric = "xgd";
    function drawOutcomes() {
      const target = root.querySelector("#review-outcomes");
      target.innerHTML = "";
      const width = Math.max(300, target.clientWidth);
      const margin = { left: width < 460 ? 105 : 128, right: 20, top: 15, bottom: 30 };
      const rowHeight = 56, height = rowHeight * App.data.archetypes.length + margin.top + margin.bottom;
      const values = App.teams.map((team) => profiles[team.id][outcomeMetric]);
      const x = d3.scaleLinear().domain([Math.floor(d3.min(values)), Math.ceil(d3.max(values))]).range([margin.left, width - margin.right]);
      const svg = d3.select(target).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", `Team ${outcomeMetric === "xgd" ? "expected goal" : "goal"} difference per match by style group`);
      svg.append("g").selectAll("line").data(x.ticks(5)).join("line")
        .attr("x1", x).attr("x2", x).attr("y1", margin.top).attr("y2", height - margin.bottom)
        .attr("stroke", (value) => value === 0 ? "#aaa999" : "#eeeadf");
      svg.append("g").selectAll("text").data(x.ticks(5)).join("text")
        .attr("x", x).attr("y", height - 8).attr("text-anchor", "middle").attr("fill", "#626873").attr("font-size", 11)
        .text((value) => App.signed(value, 0));
      App.data.archetypes.forEach((arch, index) => {
        const cy = margin.top + rowHeight * (index + 0.5);
        svg.append("text").attr("x", 0).attr("y", cy + 4).attr("fill", INK).attr("font-weight", 650).attr("font-size", width < 460 ? 10 : 12).text(arch.name.replace("The ", ""));
        const points = arch.members.map((id) => ({ id, tx: x(profiles[id][outcomeMetric]), x: x(profiles[id][outcomeMetric]), y: cy }));
        const simulation = d3.forceSimulation(points).force("x", d3.forceX((point) => point.tx).strength(1))
          .force("y", d3.forceY(cy).strength(0.12)).force("collision", d3.forceCollide(7)).stop();
        for (let step = 0; step < 90; step++) simulation.tick();
        const mean = d3.mean(arch.members, (id) => profiles[id][outcomeMetric]);
        svg.append("line").attr("x1", x(mean)).attr("x2", x(mean)).attr("y1", cy - 20).attr("y2", cy + 20).attr("stroke", INK).attr("stroke-width", 2);
        const links = svg.append("g").selectAll("a").data(points).join("a")
          .attr("href", (point) => `#/team/${point.id}`).attr("aria-label", (point) => `${App.team[point.id].name}, ${App.signed(profiles[point.id][outcomeMetric], 2)} per match`)
          .on("mousemove", (event, point) => App.tip.show(`<div class="tt-title">${App.esc(App.team[point.id].name)}</div>${App.ttRows([["Per match", App.signed(profiles[point.id][outcomeMetric], 2)], ["Matches", profiles[point.id].n], ["Reached", App.team[point.id].stage]])}`, event))
          .on("mouseleave", App.tip.hide);
        links.append("circle").attr("cx", (point) => point.x).attr("cy", (point) => Math.max(cy - 21, Math.min(cy + 21, point.y)))
          .attr("r", 5.5).attr("fill", (point) => profiles[point.id][outcomeMetric] >= 0 ? TEAL : ORANGE).attr("stroke", "#fff").attr("stroke-width", 1.5);
        links.append("title").text((point) => `${App.team[point.id].name} · ${App.signed(profiles[point.id][outcomeMetric], 2)} · ${profiles[point.id].n} matches`);
      });
    }

    function drawMatrix() {
      const archetypes = App.data.archetypes;
      const color = d3.scaleLinear().domain([-2, 0, 2]).range(["#eed9ca", "#f5f3ed", "#a5d8cf"]).clamp(true);
      root.querySelector("#review-matrix").innerHTML = `
        <table class="review-matchup-table"><caption>${matchupMetric === "xgd" ? "Expected goal" : "Goal"} difference for the row group against the column group</caption>
          <thead><tr><th scope="col">Row plays column →</th>${archetypes.map((arch) => `<th scope="col">${arch.name.replace("The ", "")}</th>`).join("")}</tr></thead>
          <tbody>${archetypes.map((row) => `<tr><th scope="row"><i style="background:${row.color}"></i>${row.name.replace("The ", "")}</th>
            ${archetypes.map((column) => {
              const result = App.data.story.matchups[`${row.id}|${column.id}`];
              if (!result || !result.n) return "<td><span class='note'>No matches</span></td>";
              const same = row.id === column.id;
              const value = same ? "Within group" : App.signed(result[matchupMetric], 2);
              const href = `#/matches?archA=${row.id}&archB=${column.id}&metric=${matchupMetric}&return=${encodeURIComponent("#/story")}`;
              return `<td><a href="${href}" style="background:${same ? "#f3f0e7" : color(result[matchupMetric])}" aria-label="${row.name} against ${column.name}, ${result.n} match${result.n === 1 ? "" : "es"}, ${same ? "within the same group" : value + " per match"}. Inspect matches"><b>${value}</b><span>${result.n} match${result.n === 1 ? "" : "es"} <span aria-hidden="true">↗</span></span></a></td>`;
            }).join("")}</tr>`).join("")}</tbody>
        </table>`;
    }

    function bindMetricControls(selector, update) {
      root.querySelectorAll(`${selector} button`).forEach((button) => button.addEventListener("click", () => {
        root.querySelectorAll(`${selector} button`).forEach((other) => {
          other.classList.toggle("on", other === button);
          other.setAttribute("aria-pressed", String(other === button));
        });
        update(button.dataset.metric);
      }));
    }
    bindMetricControls("#review-outcome-control", (metric) => { outcomeMetric = metric; drawOutcomes(); });
    bindMetricControls("#review-matrix-control", (metric) => { matchupMetric = metric; drawMatrix(); });
    drawOutcomes();
    drawMatrix();
    App.onResize(root.querySelector("#review-outcomes"), drawOutcomes);
  };
})();
