/* Match replay: a schematic, minute-by-minute reconstruction of any of the 104 matches. */
(function () {
  const App = window.App;
  const INK = "#1d2433";
  // pitch geometry (viewBox units: 10 per metre)
  const PX = 50, PY = 40, PL = 1050, PW = 680, VBW = 1150, VBH = 760;
  const CY = PY + PW / 2;
  const DEPTH = { GK: 0.045, DF: 0.17, MF: 0.305, FW: 0.43 };
  const SPREAD = { 1: 0, 2: 0.36, 3: 0.56, 4: 0.7, 5: 0.8, 6: 0.86, 7: 0.9 };
  const SPEEDS = { "1×": 2.5, "2×": 5, "4×": 10 };

  const markColor = (kit, trim) => (App.luminance(kit) > 0.7 ? (App.luminance(trim) > 0.7 ? INK : trim) : kit);

  App.views.match = function (root, params, id) {
    const meta = App.match[id];
    if (!meta) { root.innerHTML = `<div class="card"><h3>Unknown match</h3><a href="#/matches">All matches</a></div>`; return; }
    root.innerHTML = `<div class="card"><p class="note">Loading match ${App.esc(id)}…</p></div>`;
    App.loadMatch(id).then((m) => build(root, m)).catch((err) => {
      root.innerHTML = `<div class="card"><h3>Could not load this match</h3><p class="note">${App.esc(err.message)}</p></div>`;
    });
  };

  function build(root, m) {
    const H = m.teams[0], A = m.teams[1];
    const kits = App.matchKits(H.team_id, A.team_id);
    const trims = [H.trim, kits[1] === A.kit ? A.trim : A.kit];
    const marks = [markColor(kits[0], trims[0]), markColor(kits[1], trims[1])];
    const byNum = App.data.matches.slice().sort((a, b) => a.number - b.number);
    const pos = byNum.findIndex((x) => x.id === m.id);
    const prev = byNum[pos - 1], next = byNum[pos + 1];
    const durationLabel = m.aet ? "a.e.t." : "";

    const stageLabel = m.stage === "Group" ? m.group : m.stage;
    const sbTeam = (T, side) => `
      <a class="sb-team" href="#/team/${T.team_id}">
        ${App.flag(T.team_id, 54, kits[side])}
        <span class="sb-name">${App.esc(T.name)}</span>
      </a>`;
    const tile = (side) => `<span class="sb-tile${App.isLight(kits[side]) ? " light" : ""}" id="sb-s${side}" style="--k:${kits[side]};--t:${App.textOn(kits[side])}">0</span>`;

    root.innerHTML = `
      <div class="stage" id="stage">
        <section class="card score-bar" aria-label="Score">
          <div class="sb-top">
            ${prev ? `<a class="sb-nav" href="#/match/${prev.id}" title="Previous: ${App.esc(App.matchTitle(prev))}" aria-label="Previous match"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 2.5 L4.5 7 L9 11.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>` : `<span class="sb-nav off"></span>`}
            <span class="sb-stage">${App.esc(stageLabel)} · ${App.esc(m.date)} · Match ${m.number}</span>
            ${next ? `<a class="sb-nav" href="#/match/${next.id}" title="Next: ${App.esc(App.matchTitle(next))}" aria-label="Next match"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 2.5 L9.5 7 L5 11.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>` : `<span class="sb-nav off"></span>`}
          </div>
          <div class="sb-main">
            ${sbTeam(H, 0)}
            <div class="sb-center">
              <div class="sb-score">${tile(0)}<span class="sb-colon">:</span>${tile(1)}</div>
              <span class="sb-clock"><span class="sb-dot" id="sb-dot"></span><b id="sb-clock">Kick-off</b><span id="sb-period"></span></span>
            </div>
            ${sbTeam(A, 1)}
          </div>
          <div class="sb-detail">
            <div class="sb-col"><span class="sb-shots" id="sb-shots-0"></span><div class="sb-scorers" id="sb-scorers-0"></div></div>
            <div class="sb-col right"><span class="sb-shots" id="sb-shots-1"></span><div class="sb-scorers" id="sb-scorers-1"></div></div>
          </div>
          <div class="sb-venue">${App.esc(m.venue)}${m.aet ? " · after extra time" : ""}${m.pens ? ` · ${App.esc(m.pens)}` : ""}</div>
        </section>

        <div class="card pitch-card" id="pitch-card">
          <div class="pitch-tools">
            <div class="seg" id="mode"><button data-v="replay" class="on">Replay</button><button data-v="web">Passing web</button>${H.lb && A.lb ? `<button data-v="lb">Line breaks</button>` : ""}</div>
            <div class="seg" id="lbteam" hidden><button data-v="0" class="on">${App.esc(H.name)}</button><button data-v="1">${App.esc(A.name)}</button></div>
            <div class="seg" id="webteam" hidden><button data-v="both" class="on">Both</button><button data-v="0">${H.team_id}</button><button data-v="1">${A.team_id}</button></div>
            <label class="note" id="webmin-wrap" hidden>Min. passes <input type="range" class="slider" id="webmin" min="1" max="30" value="6" style="--fill:17%"> <b id="webmin-v">6</b></label>
            <span class="spacer"></span>
            <div class="seg" id="speed" aria-label="Playback speed">${Object.keys(SPEEDS).map((k, i) => `<button data-v="${k}" class="${i === 0 ? "on" : ""}">${k}</button>`).join("")}</div>
          </div>
          <div class="pitch-wrap" id="pitch-wrap">
            <svg class="pitch-svg" id="pitch" viewBox="0 0 ${VBW} ${VBH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Schematic pitch with both line-ups"></svg>
            <div class="goal-pop" id="goal-pop" hidden></div>
          </div>
          <div class="play-row">
            <button class="play-btn" id="play" aria-label="Play"></button>
            <svg class="timeline-svg" id="timeline" height="112"></svg>
          </div>
          <div class="legend-row" id="tl-legend"></div>
        </div>

        <aside class="card panel" id="panel">
          <div id="player-card" hidden></div>
          <div class="seg panel-tabs" id="panel-tabs" role="tablist">
            <button data-v="events" class="on" role="tab">Events</button><button data-v="numbers" role="tab">Numbers</button><button data-v="phases" role="tab">Phases</button><button data-v="why" role="tab">Why</button>
          </div>
          <div class="panel-body">
            <div class="pane" data-pane="events"><div class="sub" id="feed-sub"></div><div class="feed" id="feed"></div></div>
            <div class="pane" data-pane="numbers" hidden><div class="sub">Full-match numbers.</div><div id="dual"></div></div>
            <div class="pane" data-pane="phases" hidden><div class="sub" id="phases-sub"></div><div id="phases"></div><div class="note" style="margin-top:6px">Share of match time in each phase, as in FIFA's post-match report. Phases overlap, so they do not add up to 100%.</div></div>
            <div class="pane" data-pane="why" hidden><div class="sub">Goal difference split into style, opponent and execution (<a href="#/method">method</a>).</div><div id="recipe-m"></div><div id="recipe-note" class="note" style="margin-top:8px"></div></div>
          </div>
        </aside>
      </div>

      <div class="grid-3 section" id="story-badges"></div>

      <div class="section card">
        <h3>Same style, other matches</h3>
        <div class="sub">Team-matches by other teams whose ten style dials were closest to each side's display here, and how they turned out.</div>
        <div class="grid-2" id="twin-matches"></div>
      </div>`;

    // ------------------------------------------------------------------ static pitch
    const svg = d3.select("#pitch");
    drawPitch(svg);
    const webLayer = svg.append("g").attr("class", "web");
    const lbLayer = svg.append("g").attr("class", "lb");
    const tokenLayer = svg.append("g").attr("class", "tokens");
    const fxLayer = svg.append("g").attr("class", "fx");

    // ------------------------------------------------------------------ state
    const st = { t: 0, playing: false, speed: SPEEDS["1×"], mode: "replay", webTeam: "both", webMin: 6, lbTeam: 0, selected: null };
    // the player in focus (side + index); filters the feed and dims everyone else's events on the timeline
    const focusOf = () => (st.selected ? { side: Number(st.selected.split(":")[0]), pid: st.selected.split(":").slice(1).join(":") } : null);
    const isFocusEvent = (e) => {
      const f = focusOf();
      if (!f) return true;
      const p = e.p != null ? players[e.team][e.p] : null;
      return e.team === f.side && p && p.pid === f.pid;
    };
    const players = [H.players, A.players];
    const scoreAt = (t) => {
      const s = [0, 0];
      for (const e of m.timeline) {
        if (e.min > t) break;
        if (e.type === "goal") s[e.team]++;
        if (e.type === "own_goal") s[1 - e.team]++;
      }
      return s;
    };
    const onPitch = (p, t) => p.on != null && p.on <= t && !(p.off != null && p.off <= t) && !(p.sent_off != null && p.sent_off <= t);

    function layout(side, list) {
      const out = {};
      const byRole = d3.group(list, (p) => p.role);
      for (const [role, ps] of byRole) {
        const sorted = ps.slice().sort((a, b) => a.ord - b.ord);
        const n = sorted.length, spread = SPREAD[Math.min(n, 7)] ?? 0.9;
        sorted.forEach((p, i) => {
          let yf = n === 1 ? 0.5 : 0.5 - spread / 2 + (spread * i) / (n - 1);
          let xf = DEPTH[role] ?? 0.3;
          if (side === 1) { yf = 1 - yf; xf = 1 - xf; }
          out[p.pid] = [PX + xf * PL, PY + yf * PW];
        });
      }
      return out;
    }

    function tokenData() {
      if (st.mode === "lb") { // only the passing side, everyone who played; the lines they passed are drawn by drawLines
        const s = st.lbTeam, pos = layout(s, players[s]);
        return players[s].map((p, i) => ({ key: `${s}:${p.pid}`, side: s, i, p, xy: pos[p.pid] }));
      }
      if (st.mode === "web") {
        const teams = st.webTeam === "both" ? [0, 1] : [Number(st.webTeam)];
        return teams.flatMap((s) => {
          const pos = layout(s, players[s]);
          return players[s].map((p, i) => ({ key: `${s}:${p.pid}`, side: s, i, p, xy: pos[p.pid] }));
        });
      }
      return [0, 1].flatMap((s) => {
        const live = players[s].filter((p) => onPitch(p, st.t));
        const pos = layout(s, live);
        return live.map((p) => ({ key: `${s}:${p.pid}`, side: s, i: players[s].indexOf(p), p, xy: pos[p.pid] }));
      });
    }

    const involvement = [0, 1].map((s) => {
      const v = new Array(players[s].length).fill(0);
      for (const [a, b, c] of m.teams[s].edges) { v[a] += c; v[b] += c; }
      return v;
    });
    const maxInv = d3.max(involvement.flat()) || 1;
    const lbAtt = (d) => d.p.stats?.lb_att ?? 0;
    const maxLb = d3.max(players.flat(), (p) => p.stats?.lb_att ?? 0) || 1;

    function drawTokens(animate = true) {
      const data = tokenData();
      const R = (d) => (st.mode === "web" ? 13 + 15 * Math.sqrt(involvement[d.side][d.i] / maxInv)
        : st.mode === "lb" ? 13 + 15 * Math.sqrt(lbAtt(d) / maxLb) : 25);
      const dur = animate ? 650 : 0;
      const sel = tokenLayer.selectAll("g.token").data(data, (d) => d.key);
      sel.exit().transition().duration(dur).attr("opacity", 0).attr("transform", (d) => `translate(${d.xy ? d.xy[0] : 0},${d.xy ? d.xy[1] : 0}) scale(0.3)`).remove();
      const enter = sel.enter().append("g").attr("class", "token").attr("opacity", 0)
        .attr("transform", (d) => `translate(${d.xy[0]},${d.xy[1]}) scale(0.3)`)
        .on("mousemove", (evt, d) => App.tip.show(playerTip(d), evt)).on("mouseleave", App.tip.hide)
        .on("click", (evt, d) => { setFocus(st.selected === d.key ? null : d); });
      enter.each(function (d) {
        const g = d3.select(this);
        const kit = kits[d.side], trim = trims[d.side];
        const url = App.avatarUrl(d.p.pid);
        g.append("circle").attr("class", "halo").attr("r", 30).attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 3).attr("opacity", 0);
        g.append("circle").attr("class", "body").attr("r", 25).attr("fill", kit).attr("stroke", App.luminance(kit) > 0.7 ? trim : "#fff").attr("stroke-width", 3);
        if (url) {
          const cid = `clip-${m.number}-${d.key.replace(/[^a-zA-Z0-9]/g, "")}`;
          g.append("clipPath").attr("id", cid).append("circle").attr("r", 22);
          g.append("image").attr("href", url).attr("x", -22).attr("y", -22).attr("width", 44).attr("height", 44).attr("clip-path", `url(#${cid})`);
        } else {
          g.append("text").attr("class", "num").attr("fill", App.textOn(kit)).text(d.p.num);
        }
        if (url && compact) { // small screens: no name plates, so keep the shirt number on the avatar
          g.append("circle").attr("cx", 17).attr("cy", 17).attr("r", 11).attr("fill", kit).attr("stroke", "#fff").attr("stroke-width", 2);
          g.append("text").attr("class", "num").attr("x", 17).attr("y", 17).attr("fill", App.textOn(kit)).style("font-size", "13px").text(d.p.num);
        }
        // line-break count, shown only in the line-break view
        const chip = g.append("g").attr("class", "lbchip").attr("transform", "translate(21,-21)").attr("display", "none");
        chip.append("circle").attr("r", 15).attr("fill", "#fff").attr("stroke", INK).attr("stroke-width", 2);
        chip.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "central").attr("font-size", 16).attr("font-weight", 800).attr("fill", INK);
        // name plate: shirt number + short name
        const lab = g.append("g").attr("class", "lab").attr("transform", `translate(0,${33 + labelSize * 0.75})`);
        const txt = lab.append("text").attr("class", "lab-t").attr("text-anchor", "middle").attr("dominant-baseline", "central").style("font-size", `${labelSize}px`);
        txt.append("tspan").attr("class", "lab-n").text(d.p.num);
        txt.append("tspan").attr("dx", 5).text(d.p.short);
        const bb = txt.node().getBBox();
        lab.insert("rect", "text").attr("x", bb.x - 8).attr("y", bb.y - 3).attr("width", bb.width + 16).attr("height", bb.height + 6)
          .attr("rx", (bb.height + 6) / 2).attr("fill", "rgba(255,255,255,0.93)");
      });
      const merged = enter.merge(sel);
      merged.transition().duration(dur).attr("opacity", 1).attr("transform", (d) => `translate(${d.xy[0]},${d.xy[1]}) scale(${R(d) / 25})`);
      merged.select(".halo").attr("opacity", (d) => (d.key === st.selected ? 1 : 0));
      merged.select(".lab").attr("display", (d) => (compact || (st.mode !== "replay" && R(d) < 19) ? "none" : null));
      merged.select(".lbchip").attr("display", (d) => (st.mode === "lb" && lbAtt(d) > 0 ? null : "none"))
        .attr("transform", (d) => `scale(${25 / R(d)}) translate(21,-21)`)
        .select("text").text((d) => lbAtt(d));
      positions = Object.fromEntries(data.map((d) => [d.key, d.xy]));
    }
    let positions = {};
    // name plates only when the pitch is drawn large enough to read them
    let compact = false, labelSize = 13;
    function measurePitch() {
      const w = document.getElementById("pitch").getBoundingClientRect().width || VBW;
      const scale = Math.min(w / VBW, (document.getElementById("pitch").getBoundingClientRect().height || VBH) / VBH);
      compact = w * 1 < 560;
      labelSize = Math.max(13, Math.min(18, 10.5 / scale)); // ~10-12px on screen
    }
    function refreshTokens() {
      if (!document.getElementById("pitch")) return;
      measurePitch(); tokenLayer.selectAll("*").remove(); drawTokens(false);
    }

    function drawWeb() {
      webLayer.selectAll("*").remove();
      if (st.mode !== "web") return;
      const teams = st.webTeam === "both" ? [0, 1] : [Number(st.webTeam)];
      for (const s of teams) {
        const pos = layout(s, players[s]);
        const pair = new Map();
        for (const [a, b, c] of m.teams[s].edges) {
          const k = a < b ? `${a}-${b}` : `${b}-${a}`;
          const cur = pair.get(k) || { a: Math.min(a, b), b: Math.max(a, b), ab: 0, ba: 0 };
          if (a < b) cur.ab += c; else cur.ba += c;
          pair.set(k, cur);
        }
        const links = [...pair.values()].map((d) => ({ ...d, n: d.ab + d.ba })).filter((d) => d.n >= st.webMin).sort((x, y) => x.n - y.n);
        const maxN = d3.max(links, (d) => d.n) || 1;
        webLayer.selectAll(null).data(links).join("line")
          .attr("x1", (d) => pos[players[s][d.a].pid][0]).attr("y1", (d) => pos[players[s][d.a].pid][1])
          .attr("x2", (d) => pos[players[s][d.b].pid][0]).attr("y2", (d) => pos[players[s][d.b].pid][1])
          .attr("stroke", s === 0 ? "#ffffff" : INK).attr("stroke-opacity", (d) => 0.25 + 0.6 * (d.n / maxN))
          .attr("stroke-width", (d) => 1.5 + 11 * (d.n / maxN)).attr("stroke-linecap", "round")
          .on("mousemove", (evt, d) => {
            const pa = players[s][d.a], pb = players[s][d.b];
            App.tip.show(`<div class="tt-title">${App.esc(pa.short)} ↔ ${App.esc(pb.short)}</div>` +
              App.ttRows([[`${pa.short} → ${pb.short}`, d.ab], [`${pb.short} → ${pa.short}`, d.ba], ["Total", d.n]]), evt);
          })
          .on("mouseleave", App.tip.hide);
        if (links.length) {
          const top = links[links.length - 1];
          webLayer.append("text").attr("x", s === 0 ? PX + 14 : PX + PL - 14).attr("y", PY + PW - 14).attr("text-anchor", s === 0 ? "start" : "end")
            .attr("font-size", 17).attr("font-weight", 800).attr("fill", "#fff").attr("paint-order", "stroke").attr("stroke", "rgba(29,36,51,.5)").attr("stroke-width", 4)
            .text(`${m.teams[s].team_id} top link: ${players[s][top.a].short} ↔ ${players[s][top.b].short} (${top.n})`);
        }
      }
    }

    // The opponent's three defending lines, how often the passing side tried to play past each, and how.
    function drawLines(animate = false) {
      lbLayer.interrupt().selectAll("*").interrupt().remove();
      if (st.mode !== "lb") return;
      const anim = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const T0 = 120; // let the tokens start moving first
      const s = st.lbTeam, o = 1 - s, T = m.teams[s], O = m.teams[o], lb = T.lb;
      const dir = s === 0 ? 1 : -1;                         // home attacks to the right
      const X = (role) => PX + (o === 1 ? 1 - DEPTH[role] : DEPTH[role]) * PL;
      const fs = labelSize;
      const lines = [["fwd", "FW", "their forwards"], ["mid", "MF", "their midfield"], ["back", "DF", "their back line"]];
      const maxN = d3.max(lines, (l) => lb.lines[l[0]]) || 1;
      const halfMid = PX + PL / 2, farEnd = s === 0 ? PX + PL : PX;
      // shade the half the passes went into
      const shade = lbLayer.append("rect").attr("x", Math.min(halfMid, farEnd)).attr("y", PY).attr("width", PL / 2).attr("height", PW).attr("fill", "rgba(29,36,51,0.16)");
      if (anim) shade.attr("opacity", 0).transition().duration(400).attr("opacity", 1);
      lines.forEach(([k, role, label], li) => {
        const x = X(role), n = lb.lines[k], g = lbLayer.append("g");
        const band = g.append("rect").attr("x", x - 22).attr("y", PY).attr("width", 44).attr("height", PW).attr("fill", "#fff").attr("opacity", 0.06 + 0.3 * (n / maxN));
        const dash = g.append("line").attr("x1", x).attr("x2", x).attr("y1", PY + 6).attr("y2", PY + PW - 6)
          .attr("stroke", "#fff").attr("stroke-width", 3.5).attr("stroke-dasharray", "14 10").attr("stroke-linecap", "round");
        const b = g.append("g").attr("transform", `translate(${x},${CY})`);
        const bw = Math.max(104, fs * 7.4), bh = fs * 4.6;
        b.append("rect").attr("x", -bw / 2).attr("y", -bh / 2).attr("width", bw).attr("height", bh).attr("rx", 16).attr("fill", "#fff")
          .attr("stroke", marks[s]).attr("stroke-width", 4);
        const num = b.append("text").attr("text-anchor", "middle").attr("y", -fs * 0.35).attr("font-size", fs * 2.2).attr("font-weight", 800).attr("fill", INK).text(n);
        b.append("text").attr("text-anchor", "middle").attr("y", fs * 1.45).attr("font-size", fs * 0.95).attr("font-weight", 700).attr("fill", "#5b6170").text(label);
        g.on("mousemove", (evt) => App.tip.show(`<div class="tt-title">${App.esc(T.name)} past ${label}</div>` +
          `<div class="tt-dim">Passes and carries ${App.esc(T.name)} tried to play beyond ${App.esc(O.name)}'s ${label.replace("their ", "")}.</div>`, evt))
          .on("mouseleave", App.tip.hide);
        if (anim) { // the line rolls out from the centre, then its badge pops and counts up
          const d0 = T0 + li * 150;
          band.attr("y", CY).attr("height", 0).transition().delay(d0).duration(520).ease(d3.easeCubicOut).attr("y", PY).attr("height", PW);
          dash.attr("y1", CY).attr("y2", CY).transition().delay(d0).duration(520).ease(d3.easeCubicOut).attr("y1", PY + 6).attr("y2", PY + PW - 6);
          b.attr("opacity", 0).attr("transform", `translate(${x},${CY}) scale(0.5)`)
            .transition().delay(d0 + 260).duration(460).ease(d3.easeBackOut.overshoot(1.6))
            .attr("opacity", 1).attr("transform", `translate(${x},${CY}) scale(1)`);
          num.text(0).transition().delay(d0 + 300).duration(700).ease(d3.easeCubicOut)
            .tween("count", () => { const i = d3.interpolateRound(0, n); return (t) => num.text(i(t)); });
        }
      });
      // direction of play
      const ay = PY + PW - fs * 4.6, ax0 = halfMid + dir * 40, ax1 = farEnd - dir * 40;
      const shaft = lbLayer.append("line").attr("x1", ax0).attr("x2", ax1 - dir * 18).attr("y1", ay).attr("y2", ay).attr("stroke", "rgba(255,255,255,0.8)").attr("stroke-width", 4).attr("stroke-linecap", "round");
      const head = lbLayer.append("path").attr("d", `M${ax1},${ay} l${-dir * 22},-12 v24 Z`).attr("fill", "rgba(255,255,255,0.8)");
      if (anim) {
        shaft.attr("x2", ax0).transition().delay(T0 + 200).duration(700).ease(d3.easeCubicInOut).attr("x2", ax1 - dir * 18);
        head.attr("opacity", 0).transition().delay(T0 + 820).duration(200).attr("opacity", 1);
      }
      lbLayer.append("text").attr("x", (ax0 + ax1) / 2).attr("y", ay - fs * 0.7).attr("text-anchor", "middle").attr("font-size", fs).attr("font-weight", 700)
        .attr("fill", "#fff").text(`${T.name} attacking`);
      // two white cards in the attacked half: what happened (top) and how it compares (bottom)
      const pct = lb.att ? Math.round((100 * lb.cmp) / lb.att) : 0;
      const cx0 = Math.min(halfMid, farEnd) + 24, cw = PL / 2 - 48;
      const card = (y, rows, delay) => {
        const g = lbLayer.append("g");
        if (anim) g.attr("opacity", 0).attr("transform", `translate(0,${y < CY ? -14 : 14})`)
          .transition().delay(delay).duration(420).ease(d3.easeCubicOut).attr("opacity", 1).attr("transform", "translate(0,0)");
        const h = rows.reduce((t, r) => t + r.size * 1.35, 0) + fs * 1.1;
        g.append("rect").attr("x", cx0).attr("y", y).attr("width", cw).attr("height", h).attr("rx", 14).attr("fill", "rgba(255,255,255,0.95)");
        let yy = y + fs * 0.55;
        for (const r of rows) {
          yy += r.size * 1.1;
          const t = g.append("text").attr("x", cx0 + cw / 2).attr("y", yy).attr("text-anchor", "middle").attr("font-size", r.size)
            .attr("font-weight", r.bold ? 800 : 600).attr("fill", r.bold ? INK : "#5b6170").text(r.text);
          const w = t.node().getComputedTextLength();
          if (w > cw - 44) t.attr("font-size", (r.size * (cw - 44)) / w); // shrink to fit on small pitches
          yy += r.size * 0.25;
        }
      };
      card(PY + 16, [{ text: `${lb.att} tried, ${lb.cmp} got through (${pct}%)`, size: fs * 1.45, bold: true },
        { text: `Through the lines ${lb.dir.through} · around them ${lb.dir.around} · over the top ${lb.dir.over}`, size: fs * 0.95 }], T0 + 80);
      card(PY + PW - fs * 3.1, [{ text: `Past the back line more often than ${lb.back_pct}% of team-matches at this World Cup`, size: fs * 0.95 }], T0 + 650);
    }

    function playerTip(d) {
      const p = d.p, s = p.stats || {};
      const mins = (p.off ?? p.sent_off ?? m.duration) - (p.on ?? 0);
      return `<div class="tt-title">${App.esc(p.name)} #${p.num}</div><div class="tt-dim">${m.teams[d.side].name} · ${p.role} · ${p.starter ? "starter" : `on ${p.on}'`}${p.off ? `, off ${p.off}'` : ""}${p.sent_off ? `, sent off ${p.sent_off}'` : ""}</div>` +
        App.ttRows(st.mode === "lb"
          ? [["Line breaks tried", s.lb_att ?? "–"], ["Completed", s.line_breaks ?? "–"],
             ...(s.lb_dir ? [["Through / around / over", s.lb_dir.join(" / ")]] : [])]
          : [["Minutes (approx.)", Math.max(0, mins)], ["Passes (completed)", `${s.passes ?? "–"} (${s.passes_cmp ?? "–"})`], ["Passes in this web", involvement[d.side][d.i]]]);
    }

    function showPlayer(side, i) {
      const p = players[side][i], s = p.stats || {};
      const card = d3.select("#player-card").attr("hidden", null);
      const partners = new Map();
      for (const [a, b, c] of m.teams[side].edges) {
        if (a === i) partners.set(b, (partners.get(b) || 0) + c);
        if (b === i) partners.set(a, (partners.get(a) || 0) + c);
      }
      const topP = [...partners.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
      const cred = (window.WC_AVATAR_CREDITS || {})[p.pid];
      card.html(`<div class="player-card">
        <div class="ph">${App.avatarHtml(p.pid, kits[side], 64, p.num)}
          <div><div class="kicker" style="margin:0">${App.esc(m.teams[side].name)} · #${p.num} · ${p.role}</div><h3>${App.esc(p.name)}</h3>
          <div class="note">${p.starter ? "Started" : `Came on ${p.on}'`}${p.off ? ` · off ${p.off}'` : ""}${p.sent_off ? ` · sent off ${p.sent_off}'` : ""}</div></div></div>
        <div class="stat-grid">
          <div><b>${s.passes ?? "–"}</b><span>Passes</span></div>
          <div><b>${s.passes && s.passes_cmp != null ? Math.round((100 * s.passes_cmp) / s.passes) + "%" : "–"}</b><span>Completed</span></div>
          <div><b>${s.line_breaks ?? "–"}</b><span>Line breaks</span></div>
          <div><b>${s.distance_km != null ? s.distance_km.toFixed(1) : "–"}</b><span>km covered</span></div>
          <div><b>${s.top_speed ?? "–"}</b><span>Top km/h</span></div>
          <div><b>${s.regains ?? "–"}</b><span>Regains</span></div>
        </div>
        ${topP.length ? `<div class="note">Favourite passing partners: ${topP.map(([j, c]) => `<b>${App.esc(players[side][j].short)}</b> (${c})`).join(", ")}</div>` : ""}
        ${cred ? `<div class="credit">${/^cc|public domain/i.test(cred.license || "")
          ? `Avatar drawn from a photo by ${App.esc(cred.author || "unknown")}, ${App.esc(cred.license)}`
          : `Avatar drawn from a reference photo${cred.author ? ` (${App.esc(cred.author)})` : ""}`} · <a href="${App.esc(cred.url)}" target="_blank" rel="noopener">source</a></div>` : ""}
        <button class="btn small ghost" id="pc-close" style="justify-self:start">✕ Clear player focus</button></div>`);
      document.getElementById("pc-close").onclick = () => setFocus(null);
    }

    // ------------------------------------------------------------------ effects
    function ballPath(from, to) {
      const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - Math.min(140, Math.abs(to[0] - from[0]) * 0.35)];
      return (t) => {
        const u = 1 - t;
        return [u * u * from[0] + 2 * u * t * mid[0] + t * t * to[0], u * u * from[1] + 2 * u * t * mid[1] + t * t * to[1]];
      };
    }
    function animateShot(e, idx) {
      const p = e.p != null ? players[e.team][e.p] : null;
      const from = (p && positions[`${e.team}:${p.pid}`]) || [PX + PL / 2, CY];
      const goalX = e.team === 0 ? PX + PL : PX;
      const dir = e.team === 0 ? 1 : -1;
      const jitter = ((idx * 37) % 50) - 25;
      const outcome = e.type === "goal" ? "goal" : e.type === "own_goal" ? "goal" : e.outcome;
      let to;
      if (outcome === "goal") to = [goalX + dir * 14, CY + jitter * 0.9];
      else if (outcome === "saved") {
        const gk = players[1 - e.team].find((q) => q.role === "GK" && onPitch(q, e.min));
        to = (gk && positions[`${1 - e.team}:${gk.pid}`]) || [goalX - dir * 40, CY];
        to = [to[0] - dir * 18, to[1] + jitter * 0.4];
      } else if (outcome === "off") to = [goalX + dir * 6, CY + (jitter >= 0 ? 1 : -1) * (58 + Math.abs(jitter))];
      else to = [from[0] + (goalX - from[0]) * 0.42, from[1] + (CY - from[1]) * 0.42];
      if (e.type === "own_goal") { // ball goes into the scorer's own net
        to = [e.team === 0 ? PX - 14 : PX + PL + 14, CY + jitter * 0.6];
      }
      const path = ballPath(from, to);
      const dur = 650 / Math.sqrt(st.speed / 2.5);
      const ball = fxLayer.append("g");
      ball.append("use").attr("href", "#ball").attr("x", -13).attr("y", -13).attr("width", 26).attr("height", 26);
      ball.transition().duration(dur).ease(d3.easeQuadOut)
        .attrTween("transform", () => (t) => { const [x, y] = path(t); return `translate(${x},${y}) rotate(${t * 540})`; })
        .on("end", () => {
          const burst = fxLayer.append("g").attr("transform", `translate(${to[0]},${to[1]})`);
          const label = { goal: "GOAL", saved: "SAVED", off: "WIDE", blocked: "BLOCKED", other: "" }[outcome] || "";
          burst.append("circle").attr("r", 8).attr("fill", "none").attr("stroke", outcome === "goal" ? "#f2b134" : "#fff").attr("stroke-width", 4)
            .transition().duration(500).attr("r", 34).attr("opacity", 0);
          if (label) burst.append("text").attr("y", -26).attr("text-anchor", "middle").attr("font-size", 18).attr("font-weight", 800).attr("fill", "#fff")
            .attr("paint-order", "stroke").attr("stroke", INK).attr("stroke-width", 4).text(label)
            .transition().delay(500).duration(500).attr("opacity", 0);
          ball.transition().delay(350).duration(300).attr("opacity", 0).remove();
          burst.transition().delay(1100).remove();
          if (outcome === "goal") goalPop(e);
        });
    }
    function cardPop(e) {
      const p = e.p != null ? players[e.team][e.p] : null;
      const xy = p && positions[`${e.team}:${p.pid}`];
      if (!xy) return;
      const g = fxLayer.append("g").attr("transform", `translate(${xy[0] + 20},${xy[1] - 34})`);
      const color = e.type === "yellow" ? "#f6c638" : "#e23b3b";
      if (e.type === "second_yellow") g.append("rect").attr("x", -16).attr("y", -2).attr("width", 18).attr("height", 25).attr("rx", 3).attr("fill", "#f6c638").attr("stroke", INK).attr("stroke-width", 2).attr("transform", "rotate(-12)");
      g.append("rect").attr("x", -9).attr("y", -13).attr("width", 18).attr("height", 25).attr("rx", 3).attr("fill", e.type === "second_yellow" ? "#e23b3b" : color).attr("stroke", INK).attr("stroke-width", 2).attr("transform", "rotate(10)");
      g.attr("opacity", 0).transition().duration(200).attr("opacity", 1).transition().delay(1300).duration(400).attr("opacity", 0).remove();
    }
    function subPop(e) {
      const p = e.p != null ? players[e.team][e.p] : null;
      setTimeout(() => {
        const xy = p && positions[`${e.team}:${p.pid}`];
        if (!xy) return;
        const g = fxLayer.append("g").attr("transform", `translate(${xy[0] - 22},${xy[1] - 30})`);
        g.append("circle").attr("r", 11).attr("fill", "#2f9e5b").attr("stroke", "#fff").attr("stroke-width", 2);
        g.append("path").attr("d", "M0,-5 L5,1 L2,1 L2,6 L-2,6 L-2,1 L-5,1 Z").attr("fill", "#fff");
        g.attr("opacity", 0).transition().duration(200).attr("opacity", 1).transition().delay(1400).duration(400).attr("opacity", 0).remove();
      }, 700);
    }
    let popTimer = null;
    function goalPop(e) {
      const pop = document.getElementById("goal-pop");
      const p = e.p != null ? players[e.team][e.p] : null;
      const s = scoreAt(e.min);
      const who = p ? p.name : "Goal";
      pop.innerHTML = `<div class="inner"><img src="img/gen/goal_moment.webp" alt="" onerror="this.remove()"><b>${e.type === "own_goal" ? "OWN GOAL" : "GOAL!"}</b>
        <span>${App.esc(who)} · ${App.esc(e.label)} · ${H.team_id} ${s[0]}–${s[1]} ${A.team_id}</span></div>`;
      pop.hidden = false;
      pop.firstElementChild.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1.04)", opacity: 1 }, { transform: "scale(1)", opacity: 1 }], { duration: 420, easing: "ease-out" });
      clearTimeout(popTimer);
      popTimer = setTimeout(() => { pop.hidden = true; }, st.playing ? 1900 : 2600);
    }
    function fire(e, idx) {
      if (e.type === "shot" || e.type === "goal" || e.type === "own_goal") animateShot(e, idx);
      else if (e.type === "yellow" || e.type === "second_yellow" || e.type === "red") cardPop(e);
      else if (e.type === "sub_on") subPop(e);
    }

    // ------------------------------------------------------------------ timeline
    const tl = d3.select("#timeline");
    let tlx;
    const BIN = 3;
    function drawTimeline() {
      tl.selectAll("*").remove();
      const stageEl = document.getElementById("stage");
      if (!stageEl || !tl.node().isConnected) return; // view already replaced
      const W = tl.node().clientWidth || 600;
      const TLH = stageEl.classList.contains("fit") ? 96 : 112;
      tl.attr("height", TLH).attr("viewBox", `0 0 ${W} ${TLH}`);
      tlx = d3.scaleLinear().domain([0, m.duration]).range([10, W - 10]);
      const axisY = TLH / 2, STEP = TLH < 100 ? 7 : 8;
      // period bands
      const periods = m.aet ? [[0, 45], [45, 90], [90, 105], [105, m.duration]] : [[0, 45], [45, m.duration]];
      tl.append("g").selectAll("rect").data(periods).join("rect")
        .attr("x", (d) => tlx(d[0]) + 1).attr("width", (d) => tlx(d[1]) - tlx(d[0]) - 2).attr("y", 4).attr("height", TLH - 8).attr("rx", 8)
        .attr("fill", (d, i) => (i % 2 ? "#f6f1e6" : "#fbf7ee"));
      tl.append("line").attr("x1", tlx(0)).attr("x2", tlx(m.duration)).attr("y1", axisY).attr("y2", axisY).attr("stroke", "#cfc7b5").attr("stroke-width", 1.5);
      const ticks = [0, 15, 30, 45, 60, 75, 90, ...(m.aet ? [105, 120] : [])];
      tl.append("g").selectAll("text").data(ticks).join("text").attr("x", (d) => tlx(d)).attr("y", axisY + 4).attr("text-anchor", "middle")
        .attr("dominant-baseline", "hanging").attr("font-size", 9.5).attr("font-weight", 700).attr("fill", "#858a96").text((d) => (d === 45 ? "HT" : d === 90 && !m.aet ? "90" : d))
        .attr("display", "none");
      // shots as stacked dots per 3-minute bin
      const stacks = {};
      m.timeline.forEach((e, idx) => {
        if (!["shot", "goal", "own_goal"].includes(e.type)) return;
        const side = e.type === "own_goal" ? 1 - e.team : e.team;
        const bin = Math.floor(e.min / BIN);
        const k = `${side}:${bin}`;
        stacks[k] = (stacks[k] || 0) + 1;
        const level = stacks[k] - 1;
        const cx = tlx(bin * BIN + BIN / 2), cy = side === 0 ? axisY - 9 - level * STEP : axisY + 9 + level * STEP;
        if (e.type !== "shot") {
          const g = tl.append("g").datum({ e, idx }).attr("class", "tl-ev").attr("transform", `translate(${cx},${cy})`);
          g.append("circle").attr("r", 8.5).attr("fill", "#f2b134");
          g.append("use").attr("href", "#ball").attr("x", -6.5).attr("y", -6.5).attr("width", 13).attr("height", 13);
          stacks[k] += 0.6; // goals take a little more room in the stack
          return;
        }
        tl.append("circle").datum({ e, idx }).attr("class", "tl-ev").attr("cx", cx).attr("cy", cy).attr("r", 3.6)
          .attr("fill", marks[side]).attr("fill-opacity", e.outcome === "saved" ? 1 : 0.4)
          .attr("stroke", "#fff").attr("stroke-width", 1);
      });
      // cards & subs on outer lanes
      m.timeline.forEach((e, idx) => {
        const yLane = e.team === 0 ? 11 : TLH - 11;
        const x = tlx(e.min);
        if (e.type === "yellow" || e.type === "second_yellow" || e.type === "red")
          tl.append("rect").datum({ e, idx }).attr("class", "tl-ev").attr("x", x - 3.5).attr("y", yLane - 5).attr("width", 7).attr("height", 10).attr("rx", 1.5)
            .attr("fill", e.type === "yellow" ? "#f6c638" : "#e23b3b").attr("stroke", INK).attr("stroke-width", 1);
        if (e.type === "sub_on")
          tl.append("path").datum({ e, idx }).attr("class", "tl-ev").attr("d", "M0,-5 L4.5,1 L1.6,1 L1.6,5 L-1.6,5 L-1.6,1 L-4.5,1 Z")
            .attr("transform", `translate(${x},${yLane})`).attr("fill", "#2f9e5b");
      });
      tl.selectAll(".tl-ev").style("cursor", "pointer")
        .on("mousemove", (evt, d) => App.tip.show(`<div class="tt-title">${App.esc(d.e.label)} ${App.esc(m.teams[d.e.team].team_id)}</div>${eventText(d.e)}`, evt))
        .on("mouseleave", App.tip.hide);
      tl.append("text").attr("x", 14).attr("y", 24).attr("font-size", 10).attr("font-weight", 800).attr("fill", "#858a96").text(`${H.team_id} shots ↑`);
      tl.append("text").attr("x", 14).attr("y", TLH - 18).attr("font-size", 10).attr("font-weight", 800).attr("fill", "#858a96").text(`${A.team_id} shots ↓`);
      // played overlay + cursor
      tl.append("rect").attr("class", "future").attr("y", 4).attr("height", TLH - 8).attr("fill", "rgba(251,247,238,0.62)");
      const cur = tl.append("g").attr("class", "cursor");
      cur.append("line").attr("y1", 4).attr("y2", TLH - 4).attr("stroke", INK).attr("stroke-width", 2);
      cur.append("rect").attr("x", -17).attr("y", axisY - 10).attr("width", 34).attr("height", 20).attr("rx", 10).attr("fill", INK);
      cur.append("text").attr("class", "cur-t").attr("y", axisY + 1).attr("text-anchor", "middle").attr("dominant-baseline", "central")
        .attr("font-size", 11).attr("font-weight", 800).attr("fill", "#fff");
      const scrub = (evt) => {
        const [px] = d3.pointer(evt, tl.node());
        pause();
        setT(Math.max(0, Math.min(m.duration, tlx.invert(px))), { silent: true });
      };
      const hov = tl.append("g").attr("class", "hover-line").attr("display", "none").attr("pointer-events", "none");
      hov.append("line").attr("y1", 4).attr("y2", TLH - 4).attr("stroke", INK).attr("stroke-opacity", 0.35).attr("stroke-width", 1.5).attr("stroke-dasharray", "3 3");
      hov.append("text").attr("class", "hov-t").attr("y", TLH - 2).attr("text-anchor", "middle").attr("font-size", 10.5).attr("font-weight", 800).attr("fill", INK);
      tl.on("pointerdown", (evt) => { tl.node().setPointerCapture(evt.pointerId); scrub(evt); })
        .on("pointermove", (evt) => {
          if (evt.buttons) { scrub(evt); return; }
          const [px] = d3.pointer(evt, tl.node());
          hov.attr("display", null).attr("transform", `translate(${px},0)`);
          hov.select(".hov-t").text(`${Math.max(0, Math.round(tlx.invert(px)))}'`);
        })
        .on("pointerleave", () => hov.attr("display", "none"));
      tl.selectAll(".tl-ev").on("click", (evt, d) => { evt.stopPropagation(); jumpTo(d.e, d.idx); })
        .on("pointerdown", (evt) => evt.stopPropagation());
      updateCursor();
      paintFocus();
    }
    /** Dim the events of everyone but the focused player; outline one event when hovering it in the feed. */
    function paintFocus(hoverIdx = null) {
      tl.selectAll(".tl-ev").attr("opacity", (d) => (hoverIdx != null ? (d.idx === hoverIdx ? 1 : 0.25) : isFocusEvent(d.e) ? 1 : 0.18));
      tokenLayer.selectAll("g.token").select(".halo").attr("opacity", (d) => {
        if (d.key === st.selected) return 1;
        if (hoverIdx == null) return 0;
        const e = m.timeline[hoverIdx];
        const p = e.p != null ? players[e.team][e.p] : null;
        return p && d.key === `${e.team}:${p.pid}` ? 1 : 0;
      });
    }
    function setFocus(d) {
      if (!d) {
        st.selected = null;
        d3.select("#player-card").attr("hidden", true);
      } else {
        st.selected = d.key;
        showPlayer(d.side, d.i);
      }
      drawTokens(false);
      drawFeed(true);
      paintFocus();
    }
    function stepEvent(dir) {
      const evs = m.timeline.map((e, idx) => ({ e, idx })).filter((x) => x.e.type !== "sub_off" && isFocusEvent(x.e));
      const target = dir > 0 ? evs.find((x) => x.e.min > st.t + 0.02) : evs.slice().reverse().find((x) => x.e.min < st.t - 0.02);
      if (target) jumpTo(target.e, target.idx);
    }
    function updateCursor() {
      if (!tlx) return;
      const x = tlx(st.t);
      tl.select(".cursor").attr("transform", `translate(${x},0)`);
      tl.select(".cur-t").text(`${Math.floor(st.t)}'`);
      tl.select(".future").attr("x", x).attr("width", Math.max(0, tlx(m.duration) - x + 6));
    }
    d3.select("#tl-legend").html(`
      <span class="k"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="${marks[0]}"/></svg>${H.team_id}</span>
      <span class="k"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="${marks[1]}"/></svg>${A.team_id}</span>
      <span class="k muted">faded = off target or blocked</span>
      <span class="k"><svg width="16" height="16" viewBox="-8 -8 16 16"><circle r="8" fill="#f2b134"/><use href="#ball" x="-6" y="-6" width="12" height="12"/></svg>goal</span>
      <span class="k"><svg width="9" height="12"><rect x="1" y="1" width="7" height="10" rx="1.5" fill="#f6c638" stroke="${INK}"/></svg>card</span>
      <span class="k"><svg width="12" height="12"><path transform="translate(6,6)" d="M0,-5 L4.5,1 L1.6,1 L1.6,5 L-1.6,5 L-1.6,1 L-4.5,1 Z" fill="#2f9e5b"/></svg>substitution</span>
      <span class="info" tabindex="0" aria-label="About this view" id="pitch-info">i</span>`);
    d3.select("#pitch-info")
      .on("mouseenter focus", (evt) => App.tip.show(`<div class="tt-title">A schematic replay</div>Players stand on lines by listed position (GK, DF, MF, FW); left-to-right order comes from who passes to whom. The data has no tracking or shot coordinates, so shot paths are illustrative. Passing links are full-match totals.`, evt))
      .on("mousemove", (evt) => App.tip.move(evt)).on("mouseleave blur", App.tip.hide);

    // ------------------------------------------------------------------ feed
    function eventParts(e) {
      const p = e.p != null ? players[e.team][e.p] : null;
      const who = p ? p.name : "Unknown player";
      const body = e.body ? (e.body === "Head" ? "Header" : e.body) : "";
      const score = () => { const s = scoreAt(e.min); return `${s[0]}–${s[1]}`; };
      switch (e.type) {
        case "goal": return { title: who, sub: ["Goal", body.toLowerCase(), e.delivery ? `from a ${e.delivery.toLowerCase()}` : ""].filter(Boolean).join(" · "), score: score() };
        case "own_goal": return { title: who, sub: "Own goal", score: score() };
        case "shot": return { title: who, sub: ({ saved: "Shot saved", off: "Shot wide", blocked: "Shot blocked", other: "Attempt" })[e.outcome] + (body ? ` · ${body.toLowerCase()}` : "") };
        case "yellow": return { title: who, sub: `Yellow card${p && p.off != null && p.off < e.min ? " · on the bench" : ""}` };
        case "second_yellow": return { title: who, sub: "Second yellow · sent off" };
        case "red": return { title: who, sub: "Red card · sent off" };
        case "sub_on": {
          const off = p && p.replaces ? players[e.team].find((q) => q.pid === p.replaces) : null;
          return { title: `${p ? p.short : "?"} comes on`, sub: off ? `Replaces ${off.short}` : "Substitution" };
        }
        case "sub_off": return { title: `${who} goes off`, sub: "Substitution" };
        default: return { title: who, sub: "" };
      }
    }
    function eventText(e) {
      const x = eventParts(e);
      return `<b>${App.esc(x.title)}</b> · ${App.esc(x.sub)}${x.score ? ` · ${H.team_id} ${x.score} ${A.team_id}` : ""} <span class="tt-dim">(${m.teams[e.team].team_id})</span>`;
    }
    function feedIcon(e) {
      const wrap = (inner, bg) => `<svg class="ico" viewBox="-11 -11 22 22"><circle r="10.5" fill="${bg}"/>${inner}</svg>`;
      const ball = `<use href="#ball" x="-7.5" y="-7.5" width="15" height="15"/>`;
      switch (e.type) {
        case "goal": case "own_goal": return wrap(ball, "#f2b134");
        case "shot":
          if (e.outcome === "saved") return wrap(`<circle r="5.5" fill="none" stroke="${INK}" stroke-width="1.7"/><circle r="1.9" fill="${INK}"/>`, "#e7edf6");
          if (e.outcome === "blocked") return wrap(`<path d="M-4.5,-4.5 L4.5,4.5 M4.5,-4.5 L-4.5,4.5" stroke="#858a96" stroke-width="2" stroke-linecap="round"/>`, "#efe9dc");
          return wrap(`<path d="M-5,4 L4,-5 M0,-5 L4,-5 L4,-1" fill="none" stroke="#858a96" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`, "#efe9dc");
        case "yellow": return wrap(`<rect x="-3.6" y="-5" width="7.2" height="10" rx="1.6" fill="#f6c638"/>`, "#fbf1cf");
        case "second_yellow": case "red": return wrap(`<rect x="-3.6" y="-5" width="7.2" height="10" rx="1.6" fill="#e23b3b"/>`, "#fbe0dc");
        default: return wrap(`<path d="M-4,-1 L-1,-4.5 L2,-1 M-1,-4.5 V4.5" fill="none" stroke="#2f9e5b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(-1.2,0)"/><path d="M1,1 L4,4.5 L7,1 M4,4.5 V-4.5" fill="none" stroke="#d9534f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(-2.8,0)"/>`, "#e4f2e8");
      }
    }
    let feedCount = -1;
    function drawFeed(force) {
      const shown = m.timeline.map((e, idx) => ({ e, idx })).filter((d) => d.e.min <= st.t && d.e.type !== "sub_off" && isFocusEvent(d.e));
      if (!force && shown.length === feedCount) return;
      feedCount = shown.length;
      const f = focusOf();
      const fp = f ? players[f.side].find((q) => q.pid === f.pid) : null;
      const shots = [0, 1].map((s) => m.timeline.filter((e) => e.type !== "sub_off" && e.min <= st.t && e.team === s && (e.type === "shot" || e.type === "goal")).length);
      d3.select("#feed-sub").html(fp ? `Only <b>${App.esc(fp.short)}</b>'s events. <button type="button" class="chip" id="feed-clear">✕ Show everyone</button>`
        : st.t <= 0 ? "Press play or click the timeline. Keys: Space play/pause, ← → previous/next event." : `Shots so far: ${H.team_id} ${shots[0]} · ${A.team_id} ${shots[1]}`);
      d3.select("#feed-clear").on("click", () => setFocus(null));
      const feed = d3.select("#feed");
      if (!shown.length) { feed.html(`<div class="feed-empty">${fp ? `No events for ${App.esc(fp.short)} up to this minute.` : `Kick-off. ${App.esc(H.name)} line up on the left, ${App.esc(A.name)} on the right.`}</div>`); return; }
      feed.html(`<div class="feed-list">${shown.slice().reverse().map((d) => {
        const x = eventParts(d.e);
        const isGoal = d.e.type === "goal" || d.e.type === "own_goal";
        return `<div class="feed-item ${isGoal ? "goal" : ""}" data-idx="${d.idx}"><span class="t">${App.esc(d.e.label)}</span>${feedIcon(d.e)}
          <span class="txt"><b>${App.esc(x.title)}</b><small>${App.esc(x.sub)}</small></span>
          ${isGoal ? `<span class="sc">${x.score}</span>` : `<span class="who">${App.flag(m.teams[d.e.team].team_id, 22, kits[d.e.team])}</span>`}</div>`;
      }).join("")}</div>`);
      feed.selectAll(".feed-item").on("click", function () {
        const idx = Number(this.dataset.idx);
        jumpTo(m.timeline[idx], idx);
      })
        .on("mouseenter", function () { paintFocus(Number(this.dataset.idx)); })
        .on("mouseleave", () => paintFocus());
    }

    // ------------------------------------------------------------------ clock
    function setT(t, { silent = false } = {}) {
      const prevT = st.t;
      st.t = t;
      if (!silent && t > prevT) m.timeline.forEach((e, idx) => { if (e.min > prevT && e.min <= t) fire(e, idx); });
      updateScoreboard(t);
      if (st.mode === "replay") {
        const sig = [0, 1].map((side) => players[side].filter((p) => onPitch(p, t)).map((p) => p.pid).join()).join("|");
        if (sig !== lineupSig) { lineupSig = sig; drawTokens(!silent || Math.abs(t - prevT) < 3); }
      }
      updateCursor();
      drawFeed();
    }
    let lineupSig = "";
    let lastScore = [0, 0];
    function updateScoreboard(t) {
      const s = scoreAt(t);
      [0, 1].forEach((side) => {
        const el = document.getElementById(`sb-s${side}`);
        el.textContent = s[side];
        if (s[side] > lastScore[side] && st.playing) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
        const shots = m.timeline.filter((e) => e.min <= t && e.team === side && (e.type === "shot" || e.type === "goal"));
        const onT = shots.filter((e) => e.type === "goal" || e.outcome === "saved").length;
        document.getElementById(`sb-shots-${side}`).textContent = t <= 0 ? `xG ${m.teams[side].stats.xg.toFixed(2)} at full time` : `${shots.length} shots · ${onT} on target`;
        const goals = m.timeline.filter((e) => e.min <= t && ((e.type === "goal" && e.team === side) || (e.type === "own_goal" && e.team !== side)));
        document.getElementById(`sb-scorers-${side}`).innerHTML = goals.map((e) => {
          const p = e.p != null ? players[e.team][e.p] : null;
          return `<span class="sb-goal">${App.ui.ball(13)}${App.esc(p ? p.short : "Goal")}${e.type === "own_goal" ? " (og)" : ""} ${App.esc(e.label)}</span>`;
        }).join("");
      });
      lastScore = s;
      const done = t >= m.duration - 0.01;
      document.getElementById("sb-clock").textContent = done ? "Full time" : t <= 0 ? "Kick-off" : `${Math.floor(t)}'`;
      document.getElementById("sb-period").textContent = done ? (m.aet ? "after extra time" : "") : t <= 0 ? "" :
        t <= 45 ? "1st half" : t <= 90 ? "2nd half" : m.aet ? (t <= 105 ? "Extra time 1" : "Extra time 2") : "Stoppage time";
      document.getElementById("sb-dot").classList.toggle("live", st.playing);
    }
    function jumpTo(e, idx) {
      pause();
      setT(Math.max(0, e.min - 0.01), { silent: true });
      setTimeout(() => setT(e.min + 0.01), 60);
    }

    let raf = null, last = null;
    function frame(ts) {
      if (!st.playing) return;
      if (last != null) {
        const dt = Math.min(0.1, (ts - last) / 1000);
        const nt = Math.min(m.duration, st.t + dt * st.speed);
        setT(nt);
        if (nt >= m.duration) { pause(); }
      }
      last = ts;
      raf = requestAnimationFrame(frame);
    }
    const playBtn = document.getElementById("play");
    const ICON_PLAY = `<svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 3 L15 9 L5 15 Z" fill="currentColor"/></svg>`;
    const ICON_PAUSE = `<svg width="18" height="18" viewBox="0 0 18 18"><rect x="4" y="3" width="3.6" height="12" rx="1" fill="currentColor"/><rect x="10.4" y="3" width="3.6" height="12" rx="1" fill="currentColor"/></svg>`;
    function play() {
      if (st.mode !== "replay") setMode("replay");
      if (st.t >= m.duration) setT(0, { silent: true });
      st.playing = true; last = null; playBtn.innerHTML = ICON_PAUSE; playBtn.setAttribute("aria-label", "Pause");
      document.getElementById("sb-dot").classList.add("live");
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      st.playing = false; cancelAnimationFrame(raf); playBtn.innerHTML = ICON_PLAY; playBtn.setAttribute("aria-label", "Play");
      document.getElementById("sb-dot")?.classList.remove("live");
    }
    playBtn.innerHTML = ICON_PLAY;
    playBtn.onclick = () => (st.playing ? pause() : play());
    const onKey = (e) => {
      if (e.target instanceof Element && e.target.closest("input, textarea, .sel, button, a")) return;
      if (e.key === " ") { e.preventDefault(); st.playing ? pause() : play(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stepEvent(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); stepEvent(-1); }
      else if (e.key === "Escape" && st.selected) setFocus(null);
    };
    document.addEventListener("keydown", onKey);
    App._stop = () => { pause(); document.removeEventListener("keydown", onKey); };

    // ------------------------------------------------------------------ controls
    function setMode(v) {
      st.mode = v;
      d3.selectAll("#mode button").classed("on", function () { return this.dataset.v === v; });
      document.getElementById("webteam").hidden = v !== "web";
      document.getElementById("webmin-wrap").hidden = v !== "web";
      document.getElementById("lbteam").hidden = v !== "lb";
      if (v !== "replay") pause();
      lineupSig = "";
      drawWeb();
      drawLines(true);
      drawTokens(true);
      if (v === "replay") setT(st.t, { silent: true });
    }
    d3.selectAll("#mode button").on("click", function () { setMode(this.dataset.v); });
    d3.selectAll("#webteam button").on("click", function () {
      st.webTeam = this.dataset.v;
      d3.selectAll("#webteam button").classed("on", (d, i, n) => n[i] === this);
      drawWeb(); drawTokens(true);
    });
    d3.selectAll("#lbteam button").on("click", function () {
      st.lbTeam = Number(this.dataset.v);
      d3.selectAll("#lbteam button").classed("on", (d, i, n) => n[i] === this);
      drawLines(true); drawTokens(true);
    });
    d3.select("#webmin").on("input", function () { st.webMin = +this.value; this.style.setProperty("--fill", `${((this.value - 1) / 29) * 100}%`); d3.select("#webmin-v").text(this.value); drawWeb(); });
    d3.selectAll("#speed button").on("click", function () {
      st.speed = SPEEDS[this.dataset.v];
      d3.selectAll("#speed button").classed("on", (d, i, n) => n[i] === this);
    });

    // ------------------------------------------------------------------ lower panels
    const fmt1 = (v) => (v == null ? "–" : Number(v).toFixed(1));
    const fmt0 = (v) => (v == null ? "–" : Math.round(v));
    App.charts.dualBars(document.getElementById("dual"), [
      { label: "Possession %", a: H.stats.poss, b: A.stats.poss, fmt: fmt1 },
      { label: "Expected goals (xG)", a: H.stats.xg, b: A.stats.xg, fmt: (v) => Number(v).toFixed(2) },
      { label: "Shots", a: H.stats.shots, b: A.stats.shots, fmt: fmt0 },
      { label: "Shots on target", a: H.stats.sot, b: A.stats.sot, fmt: fmt0 },
      { label: "Passes", a: H.stats.passes, b: A.stats.passes, fmt: fmt0 },
      { label: "Pass completion %", a: H.stats.pass_cmp, b: A.stats.pass_cmp, fmt: fmt0 },
      { label: "Completed line breaks", a: H.stats.line_breaks, b: A.stats.line_breaks, fmt: fmt0 },
      { label: "Receptions in final third", a: H.stats.final_third_rec, b: A.stats.final_third_rec, fmt: fmt0 },
      { label: "Crosses", a: H.stats.crosses, b: A.stats.crosses, fmt: fmt0 },
      { label: "Forced turnovers", a: H.stats.forced_turnovers, b: A.stats.forced_turnovers, fmt: fmt0 },
      { label: "Distance covered (km)", a: H.stats.distance_km, b: A.stats.distance_km, fmt: fmt0 },
    ], marks);

    let pane = "events";
    const drawLower = (animate = false) => {
      if (!document.getElementById("panel")) return;
      if (pane === "phases") {
        const ph = document.getElementById("phases");
        ph.innerHTML = "";
        App.charts.butterfly(ph, H.phases, A.phases, marks, [H.name, A.name], { animate });
        const [cIn, cOut] = App.charts.phaseContrasts(H.phases, A.phases);
        document.getElementById("phases-sub").innerHTML =
          `Biggest gaps: with the ball, <b>${App.charts.phaseLabel(cIn.phase).toLowerCase()}</b> (${App.esc(H.name)} ${cIn.a}%, ${App.esc(A.name)} ${cIn.b}%); ` +
          `without it, <b>${App.charts.phaseLabel(cOut.phase).toLowerCase()}</b> (${cOut.a}% v ${cOut.b}%).`;
      }
      if (pane === "why") {
        const rc = document.getElementById("recipe-m");
        rc.innerHTML = "";
        App.charts.recipe(rc, [{ label: H.name, values: H.decomp, color: marks[0] }, { label: A.name, values: A.decomp, color: marks[1] }]);
      }
    };
    d3.selectAll("#panel-tabs button").on("click", function () {
      pane = this.dataset.v;
      d3.selectAll("#panel-tabs button").classed("on", (d, i, n) => n[i] === this).attr("aria-selected", (d, i, n) => n[i] === this);
      d3.selectAll("#panel .pane").attr("hidden", function () { return this.dataset.pane === pane ? null : true; });
      drawLower(true);
    });
    document.getElementById("recipe-note").innerHTML =
      `<span style="display:inline-flex;gap:12px"><span class="k"><svg width="10" height="10"><rect width="10" height="10" rx="3" fill="${marks[0]}"/></svg> ${App.esc(H.name)}</span>` +
      `<span class="k"><svg width="10" height="10"><rect width="10" height="10" rx="3" fill="${marks[1]}"/></svg> ${App.esc(A.name)}</span></span><br>` +
      `${App.recipeSentence(H.name, H.decomp)}`;

    // story badges: the same rules for every match
    const badges = [];
    for (const [s, T] of [[0, H], [1, A]]) {
      const d = T.decomp;
      if (d.c_keep > 0.8) badges.push({ img: "img/gen/keeper_save.webp", title: "Goalkeeper heroics", text: `${App.esc(T.name)} conceded ${d.c_keep.toFixed(2)} fewer goals than the chances they faced were worth (xG ${A === T ? H.stats.xg : A.stats.xg} faced).` });
      if (d.c_finish > 1) badges.push({ img: "img/gen/goal_moment.webp", title: "Clinical finishing", text: `${App.esc(T.name)} scored ${d.c_finish.toFixed(2)} more than their xG of ${T.stats.xg}.` });
      if (d.c_finish < -1) badges.push({ img: null, title: "Wasteful in front of goal", text: `${App.esc(T.name)} scored ${Math.abs(d.c_finish).toFixed(2)} fewer than their xG of ${T.stats.xg}.` });
      const archNow = nearestArchetype(T);
      const usual = App.team[T.team_id].archetype;
      if (archNow !== usual) badges.push({ img: App.archArt(archNow), title: `Played like ${App.arch[archNow].name}`, text: `${App.esc(T.name)} are usually ${App.arch[usual].name}, but this match's style dials sit closest to the ${App.arch[archNow].name.replace("The ", "")} profile.` });
    }
    const resultLine = m.pens ? m.pens : m.score[0] === m.score[1] ? "A draw." : `${m.score[0] > m.score[1] ? H.name : A.name} won${m.aet ? " after extra time" : ""}.`;
    document.getElementById("story-badges").innerHTML = (badges.length ? badges.slice(0, 3) : [{ img: null, title: "No extreme story", text: `${App.esc(resultLine)} Both sides performed close to what their style and opponent predicted.` }])
      .map((b) => `<div class="card" style="display:flex;gap:14px;align-items:center">${b.img ? `<img src="${b.img}" alt="" style="width:84px;height:84px;object-fit:contain;flex:none" onerror="this.remove()">` : ""}
        <div><div class="kicker" style="margin-bottom:2px">Story of the match</div><h3>${b.title}</h3><p class="note" style="margin:4px 0 0">${b.text}</p></div></div>`).join("");

    function nearestArchetype(T) {
      const space = App.styleSpace(App.dials);
      const z = space.match[T.mtid];
      let best = null, bd = Infinity;
      for (const a of App.data.archetypes) {
        const d = App.dist(z, App.dials.map((k) => a.centroid[k]));
        if (d < bd) { bd = d; best = a.id; }
      }
      return best;
    }

    document.getElementById("twin-matches").innerHTML = [H, A].map((T) => `<div><div class="row" style="margin-bottom:8px">${App.flag(T.team_id, 26, T === H ? kits[0] : kits[1])}<b>Like ${App.esc(T.name)} today</b></div>
      <div class="match-list">${T.twins.map((tw) => `<a class="match-row" href="#/match/${tw.match_id}"><span class="stage">M${App.match[tw.match_id].number}</span>${App.resultChip(tw.result)}
        <span class="team-link">${App.flag(tw.team_id, 22)}<span>${App.esc(App.team[tw.team_id].name)} v ${tw.opp_id}</span></span>
        <span class="note xg tnum">xG ${tw.xg.toFixed(2)}</span><span class="score tnum">${tw.goals}–${tw.goals_opp}</span></a>`).join("")}</div></div>`).join("");

    // ------------------------------------------------------------------ one-screen layout on wide (16:9 / 16:10) screens
    function fitStage() {
      const stage = document.getElementById("stage");
      if (!stage) return;
      const wide = window.innerWidth >= 1100 && window.innerWidth / window.innerHeight >= 1.2;
      stage.classList.toggle("fit", wide);
      document.getElementById("timeline").setAttribute("height", wide ? 96 : 112);
      stage.style.height = ""; stage.style.gridTemplateColumns = "";
      if (!wide) return;
      const card = document.getElementById("pitch-card"), wrap = document.getElementById("pitch-wrap");
      const top = stage.getBoundingClientRect().top + window.scrollY;
      const PANEL_MIN = 380, GAP = 16;
      let H0 = Math.max(560, window.innerHeight - top - 16);
      stage.style.height = `${H0}px`;
      for (let pass = 0; pass < 2; pass++) {
        const chrome = card.clientHeight - wrap.clientHeight;
        const padX = card.clientWidth - wrap.clientWidth;
        let wrapH = H0 - chrome;
        let leftW = (wrapH * VBW) / VBH + padX;
        const maxLeft = stage.clientWidth - PANEL_MIN - GAP;
        if (leftW > maxLeft) { leftW = maxLeft; wrapH = ((leftW - padX) * VBH) / VBW; stage.style.height = `${Math.round(wrapH + chrome)}px`; }
        stage.style.gridTemplateColumns = `${Math.round(leftW)}px minmax(${PANEL_MIN}px, 1fr)`;
      }
    }
    App.onViewport(() => { fitStage(); drawTimeline(); drawLower(); refreshTokens(); drawLines(); });

    // ------------------------------------------------------------------ go
    fitStage();
    measurePitch();
    drawTimeline();
    setT(0, { silent: true });
    drawTokens(false);
    drawFeed(true);
    App.onResize(document.getElementById("timeline"), () => { drawTimeline(); });
    App.onResize(document.getElementById("panel"), () => { drawLower(); });
  }

  function drawPitch(svg) {
    const g = svg.append("g");
    g.append("rect").attr("x", 0).attr("y", 0).attr("width", VBW).attr("height", VBH).attr("rx", 26).attr("fill", "#4e9a5c");
    const stripes = 14;
    for (let i = 0; i < stripes; i++)
      g.append("rect").attr("x", PX + (PL / stripes) * i).attr("y", PY).attr("width", PL / stripes).attr("height", PW).attr("fill", i % 2 ? "#5aa968" : "#52a060");
    const L = g.append("g").attr("fill", "none").attr("stroke", "rgba(255,255,255,0.8)").attr("stroke-width", 3);
    L.append("rect").attr("x", PX).attr("y", PY).attr("width", PL).attr("height", PW).attr("rx", 2);
    L.append("line").attr("x1", PX + PL / 2).attr("x2", PX + PL / 2).attr("y1", PY).attr("y2", PY + PW);
    L.append("circle").attr("cx", PX + PL / 2).attr("cy", CY).attr("r", 91.5);
    g.append("circle").attr("cx", PX + PL / 2).attr("cy", CY).attr("r", 5).attr("fill", "rgba(255,255,255,0.85)");
    for (const side of [0, 1]) {
      const x0 = side === 0 ? PX : PX + PL, dir = side === 0 ? 1 : -1;
      L.append("rect").attr("x", side === 0 ? x0 : x0 - 165).attr("y", CY - 201.5).attr("width", 165).attr("height", 403);
      L.append("rect").attr("x", side === 0 ? x0 : x0 - 55).attr("y", CY - 91.5).attr("width", 55).attr("height", 183);
      g.append("circle").attr("cx", x0 + dir * 110).attr("cy", CY).attr("r", 4.5).attr("fill", "rgba(255,255,255,0.85)");
      const half = Math.acos(55 / 91.5); // arc visible outside the penalty box
      const face = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const arc = d3.arc().innerRadius(91.5).outerRadius(91.5).startAngle(face - half).endAngle(face + half);
      L.append("path").attr("d", arc()).attr("transform", `translate(${x0 + dir * 110},${CY})`);
      // goal
      g.append("rect").attr("x", side === 0 ? x0 - 22 : x0).attr("y", CY - 36.6).attr("width", 22).attr("height", 73.2).attr("rx", 3)
        .attr("fill", "rgba(255,255,255,0.35)").attr("stroke", "#fff").attr("stroke-width", 3);
    }
    for (const [cx, cy, a0] of [[PX, PY, Math.PI / 2], [PX + PL, PY, Math.PI], [PX + PL, PY + PW, -Math.PI / 2], [PX, PY + PW, 0]])
      L.append("path").attr("d", d3.arc().innerRadius(10).outerRadius(10).startAngle(a0).endAngle(a0 + Math.PI / 2)()).attr("transform", `translate(${cx},${cy})`);
  }
})();
