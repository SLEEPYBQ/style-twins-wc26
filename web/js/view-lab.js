/* Match Intelligence: observed passing interactions and line-break marginals. */
(function () {
  const App = window.App;
  const esc = App.esc;
  const roles = { GK: 0, DF: 1, MF: 2, FW: 3 };
  const roleNames = { GK: "Goalkeepers", DF: "Defenders", MF: "Midfielders", FW: "Forwards" };
  const THEMES = {
    phone: { out: "#58dce8", in: "#bded6b", base: "#547180", ringA: "#1f394b", ringB: "#142c3e", node: "#102a3c", nodeText: "#f0f6fa", selectedText: "#06131f", name: "#d5e6ed", legend: "#9cb4c4", hover: "#fff", roles: { GK: "#f7c878", DF: "#58dce8", MF: "#bded6b", FW: "#bbabff" }, routes: { through: "#58dce8", around: "#bded6b", over: "#f7c878" }, board: { pitch: "#091c2b", line: "#284152", wall: "#1d3446", wallLine: "#8199aa", defLine: "#a1b1bc", path: null, end: "#0b2233", note: "#8ca5b7", attack: "#8ca5b7" } },
    desktop: { out: "var(--pos)", in: "var(--neg)", base: "#8f8b7e", ringA: "#e1e4e8", ringB: "#eceef1", node: "#ffffff", nodeText: "#1d2433", selectedText: "#ffffff", name: "#1d2433", legend: "#4a5263", hover: "#1d2433", roles: { GK: "#eda100", DF: "#2a78d6", MF: "#1baf7a", FW: "#4a3aa7" }, routes: { through: "var(--pos)", around: "var(--neg)", over: "#d99a0b" }, board: { pitch: "#5aa968", line: "rgba(255,255,255,.78)", wall: "#1d2433", wallLine: "#ffffff", defLine: "#ffffff", path: "#ffffff", end: "#ffffff", note: "#858a96", attack: "#ffffff" } },
  };
  const theme = () => App.isDesktop() ? THEMES.desktop : THEMES.phone;
  const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : "—";
  const safeReturn = (value) => typeof value === "string" && value.startsWith("#/") ? value : "#/matches";

  const ROLE_KEYS = ["GK", "DF", "MF", "FW"];

  // All denominators are internal to the published player-to-player matrix.
  App.labNetwork = function (team) {
    const nNodes = (team.players || []).length;
    const nodes = (team.players || []).map((player, index) => ({
      player, index, incoming: 0, outgoing: 0, involvement: 0, share: 0, betweenness: 0, hub: 0, authority: 0,
    }));
    const edges = (team.edges || []).filter(([a, b, count]) => nodes[a] && nodes[b] && count > 0);
    const pairMap = new Map();
    const roleIdx = (i) => roles[nodes[i]?.player?.role] ?? 2;
    const roleMatrix = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    const adj = Array.from({ length: nNodes }, () => []);
    let volume = 0;

    edges.forEach(([from, to, count]) => {
      volume += count;
      nodes[from].outgoing += count;
      nodes[to].incoming += count;
      adj[from].push({ to, count });
      roleMatrix[roleIdx(from)][roleIdx(to)] += count;
      const a = Math.min(from, to), b = Math.max(from, to), key = `${a}-${b}`;
      if (!pairMap.has(key)) pairMap.set(key, { a, b, ab: 0, ba: 0, total: 0 });
      const pair = pairMap.get(key);
      pair[from === a ? "ab" : "ba"] += count;
      pair.total += count;
    });
    nodes.forEach((node) => { node.involvement = node.incoming + node.outgoing; node.share = volume ? node.involvement / (2 * volume) : 0; });

    // Brandes unweighted directed betweenness centrality (normalized 0..1)
    if (nNodes > 2 && edges.length) {
      const cb = new Float64Array(nNodes);
      for (let s = 0; s < nNodes; s++) {
        const S = [], P = Array.from({ length: nNodes }, () => []);
        const sigma = new Float64Array(nNodes); sigma[s] = 1;
        const dist = new Int32Array(nNodes).fill(-1); dist[s] = 0;
        const Q = [s];
        for (let qh = 0; qh < Q.length; qh++) {
          const v = Q[qh]; S.push(v);
          for (const { to: w } of adj[v]) {
            if (dist[w] < 0) { Q.push(w); dist[w] = dist[v] + 1; }
            if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; P[w].push(v); }
          }
        }
        const delta = new Float64Array(nNodes);
        while (S.length) {
          const w = S.pop();
          for (const v of P[w]) {
            if (sigma[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
          }
          if (w !== s) cb[w] += delta[w];
        }
      }
      const norm = (nNodes - 1) * (nNodes - 2);
      const maxCb = Math.max(1e-9, ...cb.map((v) => v / norm));
      nodes.forEach((node, i) => { node.betweenness = (cb[i] / norm) / maxCb; });
    }

    // Weighted HITS (Hub & Authority, 20 power iterations, normalized to max=1)
    if (nNodes && edges.length) {
      let h = new Array(nNodes).fill(1), a = new Array(nNodes).fill(1);
      for (let it = 0; it < 20; it++) {
        const nextA = new Array(nNodes).fill(0);
        for (const [u, v, c] of edges) nextA[v] += h[u] * c;
        const na = Math.hypot(...nextA) || 1;
        a = nextA.map((x) => x / na);

        const nextH = new Array(nNodes).fill(0);
        for (const [u, v, c] of edges) nextH[u] += a[v] * c;
        const nh = Math.hypot(...nextH) || 1;
        h = nextH.map((x) => x / nh);
      }
      const maxH = Math.max(1e-9, ...h), maxA = Math.max(1e-9, ...a);
      nodes.forEach((node, i) => { node.hub = h[i] / maxH; node.authority = a[i] / maxA; });
    }

    return { volume, nodes, edges, pairs: [...pairMap.values()].sort((a, b) => b.total - a.total), roleMatrix };
  };

  App.views.lab = function (root, initialParams, requestedId) {
    const defaultId = "2026-M022-ENG-CRO";
    const id = App.match[requestedId] ? requestedId : defaultId;
    let params = initialParams, match = null, stopped = false, paneCleanup = null;
    const stopPane = () => {
      if (typeof paneCleanup === "function") paneCleanup();
      else if (paneCleanup?.destroy) paneCleanup.destroy();
      paneCleanup = null;
    };
    const onBreakpoint = () => { if (match && !stopped) render(); };
    App.desktopQuery?.addEventListener?.("change", onBreakpoint);
    App._stop = () => { stopped = true; stopPane(); App.desktopQuery?.removeEventListener?.("change", onBreakpoint); };
    root.innerHTML = '<section class="lab-page lab-loading"><span class="lab-eyebrow">Match Lab</span><h1>Opening the match workspace…</h1><p>Loading the published match evidence.</p></section>';
    App.loadMatch(id).then((data) => { if (!stopped) { match = data; render(); } }).catch(() => {
      if (!stopped) root.innerHTML = '<section class="lab-page lab-loading"><h1>Match data is unavailable</h1><p>Try another match from the match library.</p><a href="#/matches">Open matches →</a></section>';
    });

    function destination(next = {}, nextId = id) {
      const combined = { ...params, ...next };
      combined.return = safeReturn(combined.return);
      return `#/lab/${nextId}${App.analysis.query(App.analysis.readDials(combined), combined)}`;
    }
    function navigate(next, nextId) { App.go(destination(next, nextId)); }
    function render() {
      stopPane();
      const team = match.teams.find((t) => t.team_id === params.team) || match.teams[0];
      const pane = ["network", "breaks", "pulse"].includes(params.pane) ? params.pane : "network";
      const network = App.labNetwork(team);
      const maxEdge = Math.max(1, ...network.edges.map((edge) => edge[2]));
      const min = Math.max(1, Math.min(maxEdge, Math.round(Number(params.min) || 4)));
      const player = params.player !== undefined && /^\d+$/.test(params.player) && network.nodes[Number(params.player)] ? Number(params.player) : null;
      const currentUrl = destination({ team: team.team_id, pane });
      const source = window.WC_SOURCES?.[match.id]?.url || match.source;
      const query = App.analysis.query(App.analysis.readDials(params), { return: currentUrl });
      const kits = App.matchKits(match.teams[0].team_id, match.teams[1].team_id);
      const scoreTile = (side) => `<span class="lab-tile${App.isLight(kits[side]) ? " light" : ""}" style="--k:${kits[side]};--t:${App.textOn(kits[side])}">${match.score[side]}</span>`;
      root.innerHTML = `<div class="lab-page">
        <div class="lab-topline"><a class="lab-back" href="${esc(safeReturn(params.return))}">← Back to analysis</a><span class="lab-status"><i></i> Published match evidence</span></div>
        <header class="lab-header"><div><div class="lab-eyebrow">Match ${match.number}</div><h1>Match Lab</h1><p>Pass network, line breaks and match pulse for one match.</p></div><div class="lab-match-picker"><label for="lab-match">Choose a match</label><select id="lab-match">${Object.values(App.match).sort((a, b) => a.number - b.number).map((m) => `<option value="${m.id}" data-flags="${m.home},${m.away}" ${m.id === id ? "selected" : ""}>M${String(m.number).padStart(3, "0")} · ${esc(App.team[m.home].name)} v ${esc(App.team[m.away].name)}</option>`).join("")}</select></div></header>
        <section class="lab-scorecard" aria-label="Match overview"><div class="lab-score-team">${App.flag(match.teams[0].team_id, 42)}<div><strong>${esc(match.teams[0].name)}</strong><span>${App.fix(match.teams[0].stats.xg, 2)} xG · ${match.teams[0].stats.shots} attempts</span></div></div><div class="lab-score"><span>${match.aet ? "After extra time" : "Full time"}</span><strong>${scoreTile(0)}<i>:</i>${scoreTile(1)}</strong>${match.pens ? `<small>${esc(Array.isArray(match.pens) ? `Penalties ${match.pens.join("–")}` : match.pens)}</small>` : ""}</div><div class="lab-score-team lab-away"><div><strong>${esc(match.teams[1].name)}</strong><span>${App.fix(match.teams[1].stats.xg, 2)} xG · ${match.teams[1].stats.shots} attempts</span></div>${App.flag(match.teams[1].team_id, 42)}</div><div class="lab-match-meta"><span>${esc(match.group || match.stage)} · ${esc(match.date)} · ${esc(match.venue)}</span><a href="${esc(source)}" target="_blank" rel="noopener">FIFA match report ↗</a></div></section>
        <div class="lab-workbar"><div class="lab-tabs" role="tablist" aria-label="Match analysis view">${[["network", "Pass network"], ["breaks", "Line breaks"], ["pulse", "Match pulse"]].map(([value, title]) => `<button type="button" role="tab" aria-selected="${pane === value}" aria-controls="lab-pane" class="${pane === value ? "on" : ""}" data-pane="${value}">${title}</button>`).join("")}</div><div class="lab-team-switch" role="group" aria-label="Team to inspect">${match.teams.map((t) => `<button type="button" aria-pressed="${t === team}" class="${t === team ? "on" : ""}" data-team="${t.team_id}">${App.flag(t.team_id, 21)}${t.team_id}</button>`).join("")}</div></div>
        <section id="lab-pane" role="tabpanel" aria-label="${pane === "network" ? "Pass network" : pane === "breaks" ? "Line breaks" : "Match pulse"}"></section>
        <div class="lab-next"><span>Keep investigating ${esc(team.name)}</span><a href="#/team/${team.team_id}${esc(query)}">Team profile →</a><a href="#/match/${match.id}${esc(query)}">Match overview →</a></div>
        <details class="lab-methods"><summary>Sources, definitions & what this view can tell you</summary><div><p>This workspace uses the published FIFA match report, distributed in the <a href="https://github.com/Alamyy/Worldcup26" target="_blank" rel="noopener">Worldcup26 dataset</a>. The observations describe this match; they do not establish why a team won.</p><p><strong>Passing:</strong> each arrow is a recorded count from one player to another across the full match. Node area follows incoming + outgoing counts. Involvement share divides this sum by twice the recorded network volume, because each pass has two endpoints. Thresholds only hide low-count links. These counts may differ from the report’s overall passing totals. The circular positions group playing roles and are schematic, not tracking locations. Substitutes remain included; the graph is not a simultaneous formation.</p><p><strong>Line breaks:</strong> route counts (through / around / over) and target-unit counts (forward / midfield / defensive) are separate marginal distributions of attempts. Their joint combinations are unavailable. Completion uses completed ÷ attempted line breaks. Illustrations explain categories; they do not reconstruct individual passes. Read <a href="https://www.fifatrainingcentre.com/en/fwc2022/efi-metrics/efi-metric--line-breaks.php" target="_blank" rel="noopener">FIFA’s definition</a>.</p><p><strong>Chances:</strong> total xG is available for the match, but individual attempt xG and shot coordinates are unavailable. The pulse uses recorded attempts, not cumulative xG. See <a href="https://www.fifatrainingcentre.com/en/fwc2022/efi-metrics/efi-metric--expected-goals.php" target="_blank" rel="noopener">FIFA’s expected-goals definition</a>. The linked network/matrix approach is informed by <a href="https://hudl.my.site.com/support/s/article/match-pass-network?language=en_US" target="_blank" rel="noopener">Hudl’s match pass-network guide</a>.</p></div></details>
      </div>`;
      root.querySelector("#lab-match").onchange = (event) => navigate({ team: null, player: null, from: null, to: null }, event.target.value);
      root.querySelectorAll("[data-team]").forEach((button) => button.onclick = () => navigate({ team: button.dataset.team, player: null }));
      root.querySelectorAll("[data-pane]").forEach((button) => {
        button.onclick = () => navigate({ pane: button.dataset.pane });
        button.onkeydown = (event) => {
          const panes = ["network", "breaks", "pulse"], index = panes.indexOf(button.dataset.pane);
          const nextIndex = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
          if (nextIndex !== null) { event.preventDefault(); navigate({ pane: panes[nextIndex] }); root.querySelector(`[data-pane="${panes[nextIndex]}"]`)?.focus(); }
        };
      });
      const host = root.querySelector("#lab-pane");
      if (pane === "network") {
        const oppTeam = match.teams.find((t) => t.team_id !== team.team_id) || null;
        renderNetwork(host, team, oppTeam, network, oppTeam ? App.labNetwork(oppTeam) : null, min, maxEdge, player);
      } else if (pane === "breaks") renderBreaks(host, team);
      else if (App.matchPulse?.render) paneCleanup = App.matchPulse.render(host, match, { teamId: team.team_id, params, onParams: (next) => navigate(next) });
      else host.innerHTML = '<div class="lab-panel lab-empty"><h2>Match pulse</h2><p>The event workspace is loading. Open the match overview to inspect the recorded events.</p></div>';
    }

    let dirFilter = new Set(["fwd", "lat", "back"]);
    let matrixOrder = "role";

    function renderNetwork(host, team, oppTeam, network, oppNetwork, min, maxEdge, selected) {
      const ranked = network.nodes.slice().sort((a, b) => b.involvement - a.involvement);
      let liveMin = min;
      const visibleOf = (m) => network.edges.filter((edge) => edge[2] >= m);
      const visible = visibleOf(liveMin);
      const node = selected !== null ? network.nodes[selected] : null;
      const layout = ["substrate", "pivot", "matrix", "circular"].includes(params.layout) ? params.layout : "substrate";
      const leader = ranked[0];
      const shownVolume = visible.reduce((sum, edge) => sum + edge[2], 0);
      host.innerHTML = `<div class="lab-pane-heading"><div><div class="lab-eyebrow">Pass network · ${esc(team.name)}</div><h2>Pass network</h2><p>Explore progression across playing-line bands (GK → DF → MF → FW), 4×4 role summary, or pass matrix.</p></div><span class="lab-coverage">Full match · All players</span></div>
        <div class="lab-kpis"><div><span>Recorded network passes</span><strong>${network.volume}</strong><small>Sum of player-to-player counts</small></div><div><span>Directed connections</span><strong>${network.edges.length}</strong><small>Sender → receiver pairs</small></div><div><span>Most involved</span><strong class="lab-kpi-name">${esc(leader?.player.short || "—")}</strong><small>${leader ? `${leader.involvement} endpoints · ${pct(leader.involvement, 2 * network.volume)} share` : "No recorded interactions"}</small></div><div><span>Displayed pass volume</span><strong id="lab-kpi-pct">${pct(shownVolume, network.volume)}</strong><small id="lab-kpi-sub">${shownVolume} passes across ${visible.length} links ≥ ${liveMin}</small></div></div>
        <div class="lab-network-grid"><section class="lab-panel lab-network-panel"><div class="lab-panel-head"><div class="lab-view-toggle" role="group" aria-label="Network representation"><button type="button" class="${layout === "substrate" ? "on" : ""}" data-layout="substrate" aria-pressed="${layout === "substrate"}">Pitch bands</button><button type="button" class="${layout === "pivot" ? "on" : ""}" data-layout="pivot" aria-pressed="${layout === "pivot"}">Role 4×4</button><button type="button" class="${layout === "matrix" ? "on" : ""}" data-layout="matrix" aria-pressed="${layout === "matrix"}">Pass matrix</button><button type="button" class="${layout === "circular" ? "on" : ""}" data-layout="circular" aria-pressed="${layout === "circular"}">Circular</button></div><label class="lab-threshold" for="lab-min">Min. passes <input type="range" id="lab-min" min="1" max="${maxEdge}" value="${liveMin}"><output for="lab-min">${liveMin}</output></label></div>
        <div class="lab-subcontrols">
          <div class="lab-direction-key"><span><i class="lab-key-out"></i> Sent by selected</span><span><i class="lab-key-in"></i> Received by selected</span></div>
          ${layout === "substrate" ? `<div class="lab-dir-filter" role="group" aria-label="Pass direction filter"><span>Links:</span>${[["fwd", "Fwd"], ["lat", "Lateral"], ["back", "Backward"]].map(([k, l]) => `<button type="button" class="${dirFilter.has(k) ? "on" : ""}" data-dir="${k}" aria-pressed="${dirFilter.has(k)}">${l}</button>`).join("")}</div>` : ""}
        </div>
        <div class="lab-network-viz" id="lab-network-viz"></div>
        <div class="lab-network-foot"><span>Node area = incoming + outgoing passes</span><span>${layout === "substrate" ? "GK → DF → MF → FW schematic role bands (Semantic Substrates)" : layout === "pivot" ? "PivotGraph 4×4 role-to-role pass rollup" : layout === "matrix" ? "Seriated / sortable adjacency matrix" : "Circular ring with role-bundled paths"}</span></div>
        <p class="lab-caption">Adjusting the slider updates links live in real time. Player totals and centrality use the full recorded network.</p></section>
          <aside class="lab-network-sidebar"><section class="lab-panel lab-player-card">${node ? playerDetail(node, network) : pairDetail(network)}<button class="lab-clear" type="button" ${node ? "" : "hidden"}>Clear player selection ×</button></section><section class="lab-panel lab-rank-panel"><div class="lab-panel-head"><h3>Player involvement</h3><span>In + out</span></div><div class="lab-ranking">${ranked.map((item, rank) => `<button type="button" data-player="${item.index}" aria-pressed="${selected === item.index}" class="lab-rank-row ${selected === item.index ? "on" : ""}"><span class="lab-rank-num">${String(rank + 1).padStart(2, "0")}</span><span class="lab-role-dot" style="--role:${theme().roles[item.player.role] || theme().out}">${item.player.num}</span><span class="lab-rank-name">${esc(item.player.short)}<small>${item.player.role}${item.player.starter ? "" : " · sub"}</small></span><span class="lab-rank-value">${item.involvement}<small>${pct(item.involvement, 2 * network.volume)}</small></span><i style="width:${leader?.involvement ? item.involvement / leader.involvement * 100 : 0}%"></i></button>`).join("")}</div></section></aside></div>`;

      const viz = host.querySelector("#lab-network-viz");
      const drawCurrent = (m) => {
        viz.innerHTML = "";
        const vis = visibleOf(m);
        const sVol = vis.reduce((s, e) => s + e[2], 0);
        const pctEl = host.querySelector("#lab-kpi-pct");
        const subEl = host.querySelector("#lab-kpi-sub");
        if (pctEl) pctEl.textContent = pct(sVol, network.volume);
        if (subEl) subEl.textContent = `${sVol} passes across ${vis.length} links ≥ ${m}`;
        if (layout === "matrix") drawMatrix(viz, network, m, selected);
        else if (layout === "pivot") drawPivot(viz, team, oppTeam, network, oppNetwork);
        else if (layout === "circular") drawNetwork(viz, network, m, selected);
        else drawSubstrate(viz, network, m, selected);
      };
      drawCurrent(liveMin);

      if (layout === "substrate" || layout === "circular") {
        let width = viz.clientWidth;
        const observer = new ResizeObserver(() => {
          if (Math.abs(viz.clientWidth - width) > 3) {
            width = viz.clientWidth;
            drawCurrent(liveMin);
          }
        });
        observer.observe(viz);
        paneCleanup = () => observer.disconnect();
      }
      host.querySelectorAll("[data-player]").forEach((button) => button.onclick = () => navigate({ player: selected === Number(button.dataset.player) ? null : button.dataset.player }));
      host.querySelectorAll("[data-layout]").forEach((button) => button.onclick = () => navigate({ layout: button.dataset.layout }));
      host.querySelectorAll("[data-dir]").forEach((button) => {
        button.onclick = () => {
          const k = button.dataset.dir;
          if (dirFilter.has(k) && dirFilter.size > 1) dirFilter.delete(k);
          else dirFilter.add(k);
          button.setAttribute("aria-pressed", String(dirFilter.has(k)));
          button.classList.toggle("on", dirFilter.has(k));
          drawCurrent(liveMin);
        };
      });
      host.querySelector(".lab-clear").onclick = () => navigate({ player: null });
      const slider = host.querySelector("#lab-min");
      slider.oninput = () => {
        liveMin = Number(slider.value);
        host.querySelector("output").textContent = String(liveMin);
        drawCurrent(liveMin);
      };
      slider.onchange = () => navigate({ min: slider.value });
    }

    function playerDetail(node, network) {
      const partners = network.pairs.filter((pair) => pair.a === node.index || pair.b === node.index).slice(0, 5);
      return `<div class="lab-eyebrow">Player lens · ${esc(node.player.role)}</div><div class="lab-player-title"><span class="lab-player-shirt">${node.player.num}</span><div><h3>${esc(node.player.short)}</h3><p>${node.player.starter ? "Starting player" : `Substitute · on ${node.player.on}′`}</p></div></div>
        <div class="lab-player-flow"><div><strong>${node.outgoing}</strong><span>Sent →</span></div><div><strong>${node.incoming}</strong><span>← Received</span></div><div><strong>${pct(node.involvement, 2 * network.volume)}</strong><span>Endpoint share</span></div></div>
        <div class="lab-centrality-row" title="Graph centrality within the passing network"><span>Betweenness <b>${Math.round(node.betweenness * 100)}%</b></span><span>Hub <b>${node.hub.toFixed(2)}</b></span><span>Authority <b>${node.authority.toFixed(2)}</b></span></div>
        <h4>Strongest connections</h4><p class="lab-caption">Full-match counts · ${esc(node.player.short)} → partner / partner → ${esc(node.player.short)}</p><div class="lab-partners">${partners.map((pair) => {
        const isA = pair.a === node.index, other = network.nodes[isA ? pair.b : pair.a];
        return `<button type="button" data-player="${other.index}"><span>${esc(other.player.short)}</span><b class="lab-out">${isA ? pair.ab : pair.ba} →</b><b class="lab-in">← ${isA ? pair.ba : pair.ab}</b></button>`;
      }).join("") || '<p class="lab-caption">No recorded passing connections.</p>'}</div>`;
    }

    function pairDetail(network) {
      const pair = network.pairs[0];
      if (!pair) return '<h3>No recorded network</h3>';
      const a = network.nodes[pair.a].player, b = network.nodes[pair.b].player;
      return `<div class="lab-eyebrow">Strongest reciprocal pair</div><h3 class="lab-pair-title">${esc(a.short)}<span>↔</span>${esc(b.short)}</h3><div class="lab-pair-total"><strong>${pair.total}</strong><span>passes across both directions</span></div><div class="lab-pair-directions"><span>${esc(a.short)} → ${esc(b.short)} <b>${pair.ab}</b></span><span>${esc(b.short)} → ${esc(a.short)} <b>${pair.ba}</b></span></div><p class="lab-caption">A count of repeated connections, not a measure of tactical value.</p><button type="button" class="lab-primary" data-player="${pair.a}">Inspect ${esc(a.short)} →</button>`;
    }

    function drawSubstrate(host, network, min, selected) {
      const W = 660, H = 500;
      const T = theme(), roleColors = T.roles;
      const compact = host.clientWidth > 0 && host.clientWidth <= 420;
      const displayScale = compact ? W / Math.max(240, host.clientWidth) : 1;
      const bandX = { GK: 78, DF: 224, MF: 404, FW: 576 };
      const bands = ROLE_KEYS.map((r) => network.nodes.filter((n) => n.player.role === r).sort((a, b) => b.involvement - a.involvement || a.player.num - b.player.num));
      const maxInv = Math.max(1, ...network.nodes.map((n) => n.involvement));
      const minR = compact ? 9 * displayScale : 11, maxR = compact ? 14 * displayScale : 23;
      const topY = 52, botY = H - 36;

      bands.forEach((list, rIdx) => {
        const key = ROLE_KEYS[rIdx];
        const step = (botY - topY) / (list.length + 1);
        list.forEach((node, idx) => {
          node.x = bandX[key] + (idx % 2 === 1 && list.length > 4 ? 14 : idx % 2 === 0 && list.length > 4 ? -14 : 0);
          node.y = topY + (idx + 1) * step;
          node.r = Math.sqrt(minR ** 2 + (maxR ** 2 - minR ** 2) * node.involvement / maxInv);
        });
      });

      const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "lab-network-svg").attr("role", "group").attr("aria-label", "4-band Semantic Substrate passing network from GK to FW");
      const defs = svg.append("defs");
      [["base", T.base], ["out", T.out], ["in", T.in]].forEach(([key, color]) => defs.append("marker").attr("id", `lab-sub-arr-${key}`).attr("viewBox", "0 -4 9 8").attr("refX", 8).attr("refY", 0).attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto").append("path").attr("d", "M0,-4L8,0L0,4Z").attr("fill", color));

      // Role band substrates
      ROLE_KEYS.forEach((role, idx) => {
        const bx = bandX[role];
        svg.append("rect").attr("x", bx - 64).attr("y", 26).attr("width", 128).attr("height", H - 52)
          .attr("rx", 6).attr("fill", idx % 2 === 0 ? "rgba(36, 51, 58, 0.025)" : "transparent").attr("stroke", T.ringA).attr("stroke-dasharray", "3 4");
        svg.append("text").attr("x", bx).attr("y", 18).attr("text-anchor", "middle").attr("fill", roleColors[role]).attr("font-size", 11.5).attr("font-weight", 700).text(`${role} · ${roleNames[role]}`);
      });

      const dirOf = (a, b) => {
        const ra = roles[network.nodes[a]?.player.role] ?? 2, rb = roles[network.nodes[b]?.player.role] ?? 2;
        return rb > ra ? "fwd" : rb === ra ? "lat" : "back";
      };

      const rawEdges = network.edges.filter(([a, b, n]) => n >= min && dirFilter.has(dirOf(a, b)));
      const connected = new Set();
      rawEdges.filter(([a, b]) => selected === null || a === selected || b === selected).forEach(([a, b]) => { connected.add(a); connected.add(b); });
      const edges = rawEdges.slice().sort((a, b) => (a[0] === selected || a[1] === selected ? 1 : 0) - (b[0] === selected || b[1] === selected ? 1 : 0) || a[2] - b[2]);

      svg.append("g").selectAll("path").data(edges).join("path").attr("d", ([ai, bi]) => {
        const a = network.nodes[ai], b = network.nodes[bi];
        const dir = dirOf(ai, bi);
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const arc = dir === "lat" ? 36 : dir === "fwd" ? -Math.min(48, len * 0.2) : Math.min(54, len * 0.24);
        const cx = (a.x + b.x) / 2 + (dir === "lat" ? (dy >= 0 ? arc : -arc) : 0);
        const cy = (a.y + b.y) / 2 + (dir === "lat" ? 0 : arc);
        const startAngle = Math.atan2(cy - a.y, cx - a.x), endAngle = Math.atan2(cy - b.y, cx - b.x);
        return `M${a.x + (a.r + 2) * Math.cos(startAngle)},${a.y + (a.r + 2) * Math.sin(startAngle)} Q${cx},${cy} ${b.x + (b.r + 6) * Math.cos(endAngle)},${b.y + (b.r + 6) * Math.sin(endAngle)}`;
      }).attr("fill", "none")
        .attr("stroke", ([a, b]) => a === selected ? T.out : b === selected ? T.in : dirOf(a, b) === "back" ? "#9aa6ab" : T.base)
        .attr("stroke-dasharray", ([a, b]) => dirOf(a, b) === "back" ? "4 3" : "none")
        .attr("stroke-width", ([, , n]) => 0.8 + Math.sqrt(n) * 0.52)
        .attr("stroke-opacity", ([a, b]) => selected === null ? (dirOf(a, b) === "fwd" ? 0.48 : 0.28) : a === selected || b === selected ? 0.92 : 0.06)
        .attr("marker-end", ([a, b]) => `url(#lab-sub-arr-${a === selected ? "out" : b === selected ? "in" : "base"})`)
        .append("title").text(([a, b, n]) => `${network.nodes[a].player.short} → ${network.nodes[b].player.short}: ${n} passes`);

      const groups = svg.append("g").selectAll("g").data(network.nodes).join("g")
        .attr("transform", (node) => `translate(${node.x},${node.y})`)
        .attr("class", "lab-node").attr("tabindex", 0).attr("role", "button")
        .attr("aria-pressed", (node) => node.index === selected)
        .attr("opacity", (node) => selected === null || node.index === selected || connected.has(node.index) ? 1 : 0.3)
        .on("click", (_, node) => navigate({ player: selected === node.index ? null : node.index }))
        .on("keydown", (event, node) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate({ player: selected === node.index ? null : node.index }); } });
      groups.append("title").text((node) => `${node.player.name} (${node.player.role})\n${node.outgoing} sent · ${node.incoming} received\nBetweenness ${Math.round(node.betweenness * 100)}% · Hub ${node.hub.toFixed(2)}`);
      groups.filter((node) => node.index === selected).append("circle").attr("r", (node) => node.r + 6).attr("fill", "none").attr("stroke", T.out).attr("stroke-width", 1.6);
      groups.append("circle").attr("r", (node) => node.r).attr("fill", (node) => node.index === selected ? T.out : T.node).attr("stroke", (node) => roleColors[node.player.role] || T.out).attr("stroke-width", 2);
      groups.append("text").attr("text-anchor", "middle").attr("dy", ".35em").attr("fill", (node) => node.index === selected ? T.selectedText : T.nodeText).attr("font-size", compact ? 10.5 * displayScale : 13.5).attr("font-weight", 750).text((node) => node.player.num);
      if (!compact) {
        groups.append("text").attr("x", 0).attr("y", (node) => node.r + 12).attr("text-anchor", "middle").attr("fill", T.name).attr("font-size", 11).attr("font-weight", 600)
          .attr("paint-order", "stroke").attr("stroke", T.node).attr("stroke-width", 3).attr("stroke-linejoin", "round")
          .text((node) => node.player.short.length > 11 ? `${node.player.short.slice(0, 10)}…` : node.player.short);
      }
      svg.append("text").attr("x", W - 12).attr("y", H - 8).attr("text-anchor", "end").attr("fill", T.legend).attr("font-size", 11).text("Attack direction (GK → FW) →  · Dashed arcs = backward passes");
    }

    function drawPivot(host, team, oppTeam, network, oppNetwork) {
      const renderMat = (t, net) => {
        const M = net.roleMatrix;
        const maxCell = Math.max(1, ...M.flat());
        let fwd = 0, lat = 0, back = 0;
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
          if (c > r) fwd += M[r][c];
          else if (c === r) lat += M[r][c];
          else back += M[r][c];
        }
        return `<div class="lab-pivot-card">
          <div class="lab-pivot-head">${App.flag(t.team_id, 16)}<strong>${esc(t.name)}</strong><span>${net.volume} passes</span></div>
          <div class="lab-pivot-shares"><span>Forward passes <b>${pct(fwd, net.volume)}</b></span><span>Lateral passes <b>${pct(lat, net.volume)}</b></span><span>Backward passes <b>${pct(back, net.volume)}</b></span></div>
          <table class="lab-pivot-tbl"><thead><tr><th>From \\ To</th>${ROLE_KEYS.map((k) => `<th>${k}</th>`).join("")}</tr></thead><tbody>
            ${ROLE_KEYS.map((rk, r) => `<tr><th>${rk}</th>${ROLE_KEYS.map((_, c) => {
              const v = M[r][c];
              const alpha = (v / maxCell) * 0.72;
              const col = c > r ? `rgba(28, 115, 111, ${alpha.toFixed(2)})` : c === r ? `rgba(36, 99, 154, ${(alpha * 0.65).toFixed(2)})` : `rgba(155, 95, 30, ${alpha.toFixed(2)})`;
              return `<td style="background:${v ? col : "transparent"};color:${alpha > 0.42 ? "#ffffff" : "inherit"}" title="${rk} → ${ROLE_KEYS[c]}: ${v} (${pct(v, net.volume)})">${v}<small>${net.volume ? `${Math.round(100 * v / net.volume)}%` : ""}</small></td>`;
            }).join("")}</tr>`).join("")}
          </tbody></table>
        </div>`;
      };
      host.innerHTML = `<div class="lab-pivot-grid">${renderMat(team, network)}${oppTeam && oppNetwork ? renderMat(oppTeam, oppNetwork) : ""}</div>`;
    }

    function drawNetwork(host, network, min, selected) {
      const W = 660, H = 610, cx = 330, cy = 295, radius = 208;
      const T = theme(), roleColors = T.roles;
      const compact = host.clientWidth > 0 && host.clientWidth <= 420;
      const displayScale = compact ? W / Math.max(240, host.clientWidth) : 1;
      const minRadius = compact ? 9 * displayScale : 11;
      const maxRadius = compact ? 14 * displayScale : 25;
      const ordered = network.nodes.slice().sort((a, b) => (roles[a.player.role] ?? 4) - (roles[b.player.role] ?? 4) || a.player.num - b.player.num);
      const maxInvolvement = Math.max(1, ...network.nodes.map((node) => node.involvement));
      ordered.forEach((node, i) => {
        node.angle = -Math.PI / 2 + i * Math.PI * 2 / Math.max(1, ordered.length);
        node.x = cx + radius * Math.cos(node.angle); node.y = cy + radius * Math.sin(node.angle);
        node.r = Math.sqrt(minRadius ** 2 + (maxRadius ** 2 - minRadius ** 2) * node.involvement / maxInvolvement);
      });
      // Role-sector hierarchy centroids for Holten hierarchical bundling
      const roleCentroid = {};
      ROLE_KEYS.forEach((rk) => {
        const list = ordered.filter((n) => n.player.role === rk);
        if (list.length) {
          const mx = d3.mean(list, (n) => n.x), my = d3.mean(list, (n) => n.y);
          roleCentroid[rk] = [cx + (mx - cx) * 0.52, cy + (my - cy) * 0.52];
        } else roleCentroid[rk] = [cx, cy];
      });
      const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "lab-network-svg").attr("role", "group").attr("aria-label", "Directed passing network. Choose a numbered player or use the player list.");
      const defs = svg.append("defs");
      [["base", T.base], ["out", T.out], ["in", T.in]].forEach(([key, color]) => defs.append("marker").attr("id", `lab-arrow-${key}`).attr("viewBox", "0 -4 9 8").attr("refX", 8).attr("refY", 0).attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto").append("path").attr("d", "M0,-4L8,0L0,4Z").attr("fill", color));
      svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", radius).attr("fill", "none").attr("stroke", T.ringA).attr("stroke-dasharray", "3 8");
      svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", radius - 65).attr("fill", "none").attr("stroke", T.ringB);
      const connected = new Set();
      network.edges.filter(([a, b, n]) => n >= min && (selected === null || a === selected || b === selected)).forEach(([a, b]) => { connected.add(a); connected.add(b); });
      const edges = network.edges.filter((edge) => edge[2] >= min).slice().sort((a, b) => (a[0] === selected || a[1] === selected ? 1 : 0) - (b[0] === selected || b[1] === selected ? 1 : 0) || a[2] - b[2]);
      const bundled = d3.line().curve(d3.curveBundle.beta(0.68));
      svg.append("g").selectAll("path").data(edges).join("path").attr("d", ([ai, bi]) => {
        const a = network.nodes[ai], b = network.nodes[bi];
        const ca = roleCentroid[a.player.role] || [cx, cy], cb = roleCentroid[b.player.role] || [cx, cy];
        const pts = a.player.role === b.player.role ? [[a.x, a.y], ca, [b.x, b.y]] : [[a.x, a.y], ca, [cx, cy], cb, [b.x, b.y]];
        return bundled(pts);
      }).attr("fill", "none").attr("stroke", ([a, b]) => a === selected ? T.out : b === selected ? T.in : T.base).attr("stroke-width", ([a, b, n]) => .7 + Math.sqrt(n) * .52).attr("stroke-opacity", ([a, b]) => selected === null ? .38 : a === selected || b === selected ? .88 : .06).attr("marker-end", ([a, b]) => `url(#lab-arrow-${a === selected ? "out" : b === selected ? "in" : "base"})`).append("title").text(([a, b, n]) => `${network.nodes[a].player.short} → ${network.nodes[b].player.short}: ${n} passes`);
      const groups = svg.append("g").selectAll("g").data(ordered).join("g").attr("transform", (node) => `translate(${node.x},${node.y})`).attr("class", "lab-node").attr("tabindex", 0).attr("role", "button").attr("aria-pressed", (node) => node.index === selected).attr("aria-label", (node) => `${node.player.short}, ${node.player.role}, ${node.incoming} received, ${node.outgoing} sent. Select player.`).attr("opacity", (node) => selected === null || node.index === selected || connected.has(node.index) ? 1 : .3).on("click", (_, node) => navigate({ player: selected === node.index ? null : node.index })).on("keydown", (event, node) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate({ player: selected === node.index ? null : node.index }); } });
      groups.append("title").text((node) => `${node.player.name}\n${node.player.role} · ${node.player.starter ? "starter" : "substitute"}\n${node.outgoing} sent · ${node.incoming} received`);
      groups.filter((node) => node.index === selected).append("circle").attr("r", (node) => node.r + 7).attr("fill", "none").attr("stroke", T.out).attr("stroke-width", 1.5);
      groups.append("circle").attr("r", (node) => node.r).attr("fill", (node) => node.index === selected ? T.out : T.node).attr("stroke", (node) => roleColors[node.player.role] || T.out).attr("stroke-width", 1.8);
      groups.append("text").attr("text-anchor", "middle").attr("dy", ".35em").attr("fill", (node) => node.index === selected ? T.selectedText : T.nodeText).attr("font-size", compact ? 11 * displayScale : 15).attr("font-weight", 750).text((node) => node.player.num);
      if (!compact) groups.append("text").attr("x", (node) => Math.cos(node.angle) * (node.r + 13)).attr("y", (node) => Math.sin(node.angle) * (node.r + 13) + 4).attr("text-anchor", (node) => Math.cos(node.angle) > .25 ? "start" : Math.cos(node.angle) < -.25 ? "end" : "middle").attr("fill", T.name).attr("font-size", 12).attr("font-weight", 600).text((node) => node.player.short.length > 12 ? `${node.player.short.slice(0, 11)}…` : node.player.short);
      const legend = svg.append("g").attr("transform", "translate(105,583)");
      Object.keys(roles).forEach((role, i) => { legend.append("circle").attr("cx", i * 125).attr("r", compact ? 3 * displayScale : 4).attr("fill", roleColors[role]); legend.append("text").attr("x", i * 125 + (compact ? 9 * displayScale : 10)).attr("y", compact ? 3.5 * displayScale : 4).attr("fill", T.legend).attr("font-size", compact ? 10.5 * displayScale : 11).text(compact ? role : roleNames[role]); });
      if (compact) {
        host.insertAdjacentHTML("afterbegin", `<p class="lab-mobile-network-hint">Tap a shirt number. Full names and counts are in the player list below.</p>`);
      }
    }

    function seriateNodes(network) {
      let order = network.nodes.slice().sort((a, b) => (roles[a.player.role] ?? 4) - (roles[b.player.role] ?? 4) || a.player.num - b.player.num);
      if (matrixOrder === "involvement") return order.sort((a, b) => b.involvement - a.involvement);
      if (matrixOrder === "betweenness") return order.sort((a, b) => b.betweenness - a.betweenness || b.involvement - a.involvement);
      if (matrixOrder === "seriated") {
        const w = new Map();
        network.edges.forEach(([a, b, c]) => {
          w.set(`${a}-${b}`, (w.get(`${a}-${b}`) || 0) + c);
          w.set(`${b}-${a}`, (w.get(`${b}-${a}`) || 0) + c);
        });
        for (let it = 0; it < 10; it++) {
          const pos = new Map(order.map((n, i) => [n.index, i]));
          const bary = new Map(order.map((n) => {
            let num = 0, den = 0;
            order.forEach((o) => {
              const weight = w.get(`${n.index}-${o.index}`) || 0;
              if (weight) { num += pos.get(o.index) * weight; den += weight; }
            });
            const anchor = (roles[n.player.role] ?? 2) * 3;
            return [n.index, den ? (num / den) * 0.8 + anchor * 0.2 : pos.get(n.index)];
          }));
          order.sort((a, b) => bary.get(a.index) - bary.get(b.index));
        }
      }
      return order;
    }

    function drawMatrix(host, network, min, selected) {
      const nodes = seriateNodes(network);
      const counts = new Map(network.edges.map(([a, b, n]) => [`${a}-${b}`, n]));
      const max = Math.max(1, ...network.edges.map((edge) => edge[2]));
      host.innerHTML = `<div class="lab-matrix-intro">
        <div><strong>Rows send → columns receive</strong> <span>(below ${min} hidden)</span></div>
        <div class="lab-mat-sort" role="group" aria-label="Matrix seriation order"><span>Order:</span>${[["role", "By role"], ["involvement", "Involv."], ["betweenness", "Betweenness"], ["seriated", "Seriated"]].map(([k, l]) => `<button type="button" class="${matrixOrder === k ? "on" : ""}" data-morder="${k}">${l}</button>`).join("")}</div>
      </div><div class="lab-matrix-scroll" tabindex="0" role="region" aria-label="Directed pass matrix, scroll horizontally"><table class="lab-matrix"><caption class="lab-sr-only">Full-match directed passes. Select a player in the row labels to highlight their row and column.</caption><thead><tr><th scope="col">Sender ↓</th>${nodes.map((node) => `<th scope="col" title="${esc(node.player.short)}"><span>${node.player.num}</span><small>${esc(node.player.short)}</small></th>`).join("")}</tr></thead><tbody>${nodes.map((a) => `<tr><th scope="row"><button type="button" data-player="${a.index}" aria-pressed="${a.index === selected}"><span>${a.player.num}</span>${esc(a.player.short)}</button></th>${nodes.map((b) => {
        const n = counts.get(`${a.index}-${b.index}`) || 0, show = n >= min, focus = selected === null || a.index === selected || b.index === selected;
        return `<td class="${a.index === selected ? "lab-cell-out" : b.index === selected ? "lab-cell-in" : ""}" style="--intensity:${show ? .12 + .7 * n / max : 0};opacity:${focus ? 1 : .3}" title="${esc(a.player.short)} → ${esc(b.player.short)}: ${n} passes${n && !show ? " (below threshold)" : ""}">${a.index === b.index ? "—" : show ? n : "·"}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div>`;
      host.querySelectorAll("[data-morder]").forEach((btn) => {
        btn.onclick = () => { matrixOrder = btn.dataset.morder; drawMatrix(host, network, min, selected); };
      });
      host.querySelectorAll("[data-player]").forEach((button) => {
        button.onclick = () => navigate({ player: selected === Number(button.dataset.player) ? null : button.dataset.player });
      });
    }

    function renderBreaks(host, team) {
      const lb = team.lb;
      if (!lb) { host.innerHTML = '<div class="lab-panel lab-empty"><h2>Line-break data unavailable</h2></div>'; return; }
      const routeColors = theme().routes, routes = [["through", "Through", "Between players in the opposition unit", routeColors.through], ["around", "Around", "Outside the opposition unit", routeColors.around], ["over", "Over", "An aerial route beyond the unit", routeColors.over]];
      const maxLine = Math.max(1, ...Object.values(lb.lines));
      const completion = lb.att ? lb.cmp / lb.att : 0;
      host.innerHTML = `<div class="lab-pane-heading"><div><div class="lab-eyebrow">Line breaks · ${esc(team.name)}</div><h2>Line breaks</h2></div><span class="lab-coverage">Full match · Attempt counts</span></div>
        <div class="lab-break-overview"><section class="lab-panel lab-completion"><div class="lab-completion-ring" style="--completion:${completion * 100}%"><div><strong>${pct(lb.cmp, lb.att)}</strong><span>completed</span></div></div><div><div class="lab-break-total">${lb.att}<span>Line-break attempts</span></div><p><b>${lb.cmp}</b> completed <span>·</span> <b>${lb.att - lb.cmp}</b> not completed</p><small>One full-match completion rate.<br>Not a rate for any individual route.</small></div></section><section class="lab-panel lab-break-question"><h3>${esc(team.name)} most often went <em>${Object.entries(lb.dir).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"}</em>.</h3></section></div>
        <div class="lab-route-heading"><h3>Route through the opposition</h3><span>Three categories · ${lb.att} attempts</span></div><div class="lab-route-grid">${routes.map(([key, title, description, color]) => `<section class="lab-panel lab-route-card" style="--route:${color}"><div class="lab-route-title"><span>${title}</span><strong>${lb.dir[key] ?? 0}<small>${pct(lb.dir[key] ?? 0, lb.att)}</small></strong></div>${routeBoard(key, title, color)}<div class="lab-route-meter"><i style="width:${lb.att ? 100 * (lb.dir[key] || 0) / lb.att : 0}%"></i></div><p>${description}</p></section>`).join("")}</div>
        <div class="lab-break-bottom"><section class="lab-panel lab-unit-panel"><div class="lab-panel-head"><div><h3>Opposition unit targeted</h3><p>A separate distribution of the same ${lb.att} attempts</p></div></div>${[["fwd", "Forward unit", "First line"], ["mid", "Midfield unit", "Middle line"], ["back", "Defensive unit", "Last line"]].map(([key, label, hint]) => `<div class="lab-unit-row"><div><strong>${label}</strong><small>${hint}</small></div><div class="lab-unit-track"><i style="width:${(lb.lines[key] || 0) / maxLine * 100}%"></i></div><b>${lb.lines[key] || 0}<small>${pct(lb.lines[key] || 0, lb.att)}</small></b></div>`).join("")}</section><section class="lab-panel lab-break-reading"><h3>Route and unit totals</h3><p>The routes and targeted units are published separately. We cannot tell how many “over” passes targeted the defensive unit from these totals.</p><p class="lab-caption">The tactical boards are category illustrations. No pass coordinates or individual line-break timestamps are available.</p><a href="https://www.fifatrainingcentre.com/en/fwc2022/efi-metrics/efi-metric--line-breaks.php" target="_blank" rel="noopener">How FIFA defines a line break ↗</a></section></div>`;
    }

    function routeBoard(key, title, color) {
      const paths = { through: "M150,161 C146,130 145,80 150,43", around: "M150,161 C270,160 280,44 185,43", over: "M150,161 Q76,66 150,43" };
      const B = theme().board, line = B.path || color;
      return `<svg class="lab-route-board" viewBox="0 0 300 210" role="img" aria-label="Illustration of a line break ${title.toLowerCase()}; schematic, not observed locations"><defs><marker id="lab-route-arrow-${key}" viewBox="0 -4 9 8" refX="8" refY="0" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,-4L8,0L0,4Z" fill="${line}"/></marker></defs><path d="M18,190V19H282V190Z" fill="${B.pitch}" stroke="${B.line}"/><path d="M18,105H282M114,19V44H186V19" fill="none" stroke="${B.line}"/><path d="M58,104H242" stroke="${B.defLine}" stroke-dasharray="4 6" opacity=".45"/>${[75, 125, 175, 225].map((x) => `<circle cx="${x}" cy="104" r="8" fill="${B.wall}" stroke="${B.wallLine}"/>`).join("")}<path d="${paths[key]}" fill="none" stroke="${line}" stroke-width="3.5" ${key === "over" ? 'stroke-dasharray="7 5"' : ""} marker-end="url(#lab-route-arrow-${key})"/><circle cx="150" cy="165" r="10" fill="${color}" stroke="${B.path || color}" stroke-width="2"/><circle cx="${key === "around" ? 185 : 150}" cy="39" r="9" fill="${B.end}" stroke="${color}" stroke-width="2"/><text x="23" y="204" fill="${B.note}" font-size="9" letter-spacing="1.2">Schematic route</text><text x="269" y="180" text-anchor="end" fill="${B.attack}" font-size="9">Attack ↑</text></svg>`;
    }

    return { update(nextParams) { params = nextParams; if (match && !stopped) render(); } };
  };
})();
