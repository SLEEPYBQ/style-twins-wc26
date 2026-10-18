/* Shared state, lookups and small helpers. Everything hangs off window.App. */
(function () {
  const WC = window.WC;
  const App = (window.App = { views: {} });

  App.data = WC;
  App.dials = WC.dials.map((d) => d.id);
  App.dialInfo = Object.fromEntries(WC.dials.map((d) => [d.id, d]));
  App.teams = WC.teams;
  App.team = Object.fromEntries(WC.teams.map((t) => [t.id, t]));
  App.arch = Object.fromEntries(WC.archetypes.map((a) => [a.id, a]));
  App.tm = WC.teamMatches;
  App.match = Object.fromEntries(WC.matches.map((m) => [m.id, m]));
  App.components = [
    { id: "c_style", label: "Style", help: "what this playbook usually yields", group: "style" },
    { id: "c_opp", label: "Opponents", help: "easier (+) or tougher (−) opposition", group: "opp" },
    { id: "c_create", label: "Chance creation", help: "xG created beyond expectation", group: "skill" },
    { id: "c_prevent", label: "Chance prevention", help: "xG allowed below expectation", group: "skill" },
    { id: "c_finish", label: "Finishing", help: "goals scored minus xG", group: "skill" },
    { id: "c_keep", label: "Goalkeeping", help: "xG faced minus goals conceded", group: "skill" },
  ];
  App.stageOrder = ["Final", "Bronze final", "Semi-final", "Quarter-final", "Round of 16", "Round of 32", "Group"];

  // archetype art + shapes ---------------------------------------------------------
  App.archArt = (id) => `img/gen/arch_${id}.webp`;
  App.shape = {
    circle: d3.symbolCircle, triangle: d3.symbolTriangle, diamond: d3.symbolDiamond,
    square: d3.symbolSquare, star: d3.symbolStar,
  };
  App.symbol = (archId, size) => d3.symbol(App.shape[App.arch[archId].shape], size)();

  // formatting -----------------------------------------------------------------------
  const MINUS = "−";
  App.signed = (v, d = 2) => {
    if (v == null || isNaN(v)) return "–";
    const s = Math.abs(v).toFixed(d);
    if (Number(s) === 0) return (0).toFixed(d);
    return (v > 0 ? "+" : MINUS) + s;
  };
  App.fix = (v, d = 1) => (v == null || isNaN(v) ? "–" : Number(v).toFixed(d).replace("-", MINUS));
  App.pct = (v) => `${Math.round(v * 100)}%`;
  App.esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  App.stageShort = (s) => ({ "Round of 32": "R32", "Round of 16": "R16", "Quarter-final": "QF", "Semi-final": "SF", "Bronze final": "3rd", Final: "Final", Group: "Group" })[s] || s;

  // colours --------------------------------------------------------------------------
  App.luminance = (hex) => {
    const c = d3.rgb(hex);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  App.textOn = (hex) => (App.luminance(hex) > 0.42 ? "#1d2433" : "#ffffff");
  App.isLight = (hex) => App.luminance(hex) > 0.8;
  /** Kit colours for a pairing: if both teams wear similar colours, the away side switches to its trim. */
  App.matchKits = (homeId, awayId) => {
    const h = App.team[homeId], a = App.team[awayId];
    const dist = (x, y) => { const p = d3.lab(x), q = d3.lab(y); return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b); };
    let away = a.kit;
    if (dist(h.kit, a.kit) < 32) away = dist(h.kit, a.trim) >= 32 ? a.trim : (App.isLight(h.kit) ? "#1d2433" : "#ffffff");
    return [h.kit, away];
  };

  // HTML snippets --------------------------------------------------------------------
  App.badge = (teamId, size = 28, kit) => {
    const t = App.team[teamId];
    const bg = kit || t.kit;
    const fs = Math.max(9, Math.round(size * 0.36));
    return `<span class="badge" style="width:${size}px;height:${size}px;background:${bg};color:${App.textOn(bg)};font-size:${fs}px">${teamId}</span>`;
  };
  const ISO = {
    ALG: "dz", ARG: "ar", AUS: "au", AUT: "at", BEL: "be", BIH: "ba", BRA: "br", CAN: "ca", CIV: "ci", COD: "cd", COL: "co", CPV: "cv",
    CRO: "hr", CUW: "cw", CZE: "cz", ECU: "ec", EGY: "eg", ENG: "gb-eng", ESP: "es", FRA: "fr", GER: "de", GHA: "gh", HAI: "ht", IRN: "ir",
    IRQ: "iq", JOR: "jo", JPN: "jp", KOR: "kr", KSA: "sa", MAR: "ma", MEX: "mx", NED: "nl", NOR: "no", NZL: "nz", PAN: "pa", PAR: "py",
    POR: "pt", QAT: "qa", RSA: "za", SCO: "gb-sct", SEN: "sn", SUI: "ch", SWE: "se", TUN: "tn", TUR: "tr", URU: "uy", USA: "us", UZB: "uz",
  };
  App.flagUrl = (teamId) => `https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/flags/1x1/${ISO[teamId]}.svg`;
  /** Round national flag; use it wherever the team name is written next to it. */
  App.flag = (teamId, size = 28) =>
    `<span class="flag" role="img" aria-label="${App.esc(App.team[teamId].name)} flag" style="width:${size}px;height:${size}px;background-image:url(${App.flagUrl(teamId)})"></span>`;
  App.teamLink = (teamId, size = 24) =>
    `<a class="team-link" href="#/team/${teamId}">${App.flag(teamId, size)}<span class="tname">${App.esc(App.team[teamId].name)}</span></a>`;
  App.archPill = (archId) => {
    const a = App.arch[archId];
    return `<a class="pill" href="#/styles?arch=${a.id}"><span class="sw" style="background:${a.color}"></span>${a.name}</a>`;
  };
  App.resultChip = (r) => `<span class="result ${r}" title="${({ W: "Win", D: "Draw", L: "Loss" })[r]}">${r}</span>`;
  App.avatarUrl = (pid) => (window.WC_AVATARS || {})[pid] || null;
  App.avatarHtml = (pid, kit, size = 44, num) => {
    const url = App.avatarUrl(pid);
    if (url) return `<img class="avatar" src="${url}" width="${size}" height="${size}" alt="" style="box-shadow:0 0 0 3px ${kit}">`;
    return `<span class="badge" style="width:${size}px;height:${size}px;background:${kit};color:${App.textOn(kit)};font-size:${Math.round(size * 0.4)}px">${num ?? ""}</span>`;
  };

  // tooltip --------------------------------------------------------------------------
  const tip = document.getElementById("tooltip");
  App.tip = {
    show(html, evt) {
      tip.innerHTML = html;
      tip.hidden = false;
      App.tip.move(evt);
    },
    move(evt) {
      if (tip.hidden || !evt) return;
      const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
      let x = evt.clientX + pad, y = evt.clientY + pad;
      if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
      tip.style.left = `${Math.max(8, x)}px`;
      tip.style.top = `${Math.max(8, y)}px`;
    },
    hide() { tip.hidden = true; },
  };
  App.ttRows = (rows) => rows.map(([k, v]) => `<div class="tt-row"><span class="tt-dim">${k}</span><span>${v}</span></div>`).join("");

  // style space ------------------------------------------------------------------------
  /** z-scores of the chosen dials for every team-match (mean/sd over all 208 records). */
  App.styleSpace = (dialIds) => {
    const idx = dialIds.map((d) => App.dials.indexOf(d));
    const ids = Object.keys(App.tm);
    const cols = idx.map((i) => ids.map((k) => App.tm[k].dials[i]));
    const mu = cols.map((c) => d3.mean(c)), sd = cols.map((c) => d3.deviation(c) * Math.sqrt((c.length - 1) / c.length));
    const z = {};
    ids.forEach((k, r) => { z[k] = idx.map((_, j) => (cols[j][r] - mu[j]) / sd[j]); });
    const team = {};
    for (const t of App.teams) {
      const rows = t.matches.map((m) => z[m]);
      team[t.id] = dialIds.map((_, j) => d3.mean(rows, (r) => r[j]));
    }
    return { dialIds, match: z, team };
  };

  /** Top-two principal axes of the match-level z matrix (power iteration on the covariance). */
  App.pca2 = (space) => {
    const rows = Object.values(space.match);
    const p = space.dialIds.length;
    const C = Array.from({ length: p }, () => new Array(p).fill(0));
    for (const r of rows) for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) C[i][j] += (r[i] * r[j]) / rows.length;
    const total = d3.sum(C.map((r, i) => r[i]));
    const comps = [], vars = [];
    let M = C.map((r) => r.slice());
    for (let k = 0; k < Math.min(2, p); k++) {
      let v = new Array(p).fill(0).map((_, i) => 1 + i * 0.01);
      for (let it = 0; it < 300; it++) {
        const w = M.map((row) => d3.sum(row.map((x, j) => x * v[j])));
        const n = Math.hypot(...w) || 1;
        v = w.map((x) => x / n);
      }
      const lambda = d3.sum(M.map((row, i) => v[i] * d3.sum(row.map((x, j) => x * v[j]))));
      comps.push(v); vars.push(lambda / total);
      M = M.map((row, i) => row.map((x, j) => x - lambda * v[i] * v[j]));
    }
    if (comps.length < 2) comps.push(new Array(p).fill(0));
    // orient: +x towards more ball share (or the first dial), +y towards more crosses
    const orient = (vec, pref) => {
      const i = space.dialIds.indexOf(pref);
      const sign = i >= 0 ? Math.sign(vec[i]) || 1 : Math.sign(vec[d3.maxIndex(vec.map(Math.abs))]) || 1;
      return vec.map((x) => x * sign);
    };
    comps[0] = orient(comps[0], "Ball share");
    comps[1] = orient(comps[1], "Wing crosses");
    const project = (r) => [d3.sum(r.map((x, j) => x * comps[0][j])), d3.sum(r.map((x, j) => x * comps[1][j]))];
    return { comps, vars, project };
  };

  App.dist = (a, b) => Math.sqrt(d3.sum(a.map((x, i) => (x - b[i]) ** 2)));

  /** For every team, all other teams sorted by style distance, plus a similarity percentile. */
  App.twinTable = (space) => {
    const ids = App.teams.map((t) => t.id);
    const all = [];
    const near = {};
    for (const a of ids) {
      near[a] = ids.filter((b) => b !== a).map((b) => ({ id: b, d: App.dist(space.team[a], space.team[b]) })).sort((x, y) => x.d - y.d);
      for (const n of near[a]) if (a < n.id) all.push(n.d);
    }
    all.sort(d3.ascending);
    const similarity = (d) => 1 - d3.bisectLeft(all, d) / all.length; // share of team pairs that are LESS alike
    for (const a of ids) for (const n of near[a]) n.sim = similarity(n.d);
    return { near, similarity, pairs: all.length };
  };

  // lazy match files -------------------------------------------------------------------------
  App.loadMatch = (id) => {
    window.WC_MATCH = window.WC_MATCH || {};
    if (window.WC_MATCH[id]) return Promise.resolve(window.WC_MATCH[id]);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `data/matches/${id}.js`;
      s.onload = () => resolve(window.WC_MATCH[id]);
      s.onerror = () => reject(new Error(`Could not load match ${id}`));
      document.head.appendChild(s);
    });
  };

  App.matchTitle = (m) => `${App.team[m.home].name} ${m.score[0]}–${m.score[1]} ${App.team[m.away].name}`;
  App.matchLabel = (m) => `${m.stage === "Group" ? m.group : m.stage} · ${m.date}`;

  // observe container width (re-render on resize) ----------------------------------------
  App.onResize = (el, fn) => {
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; fn(); }
    });
    ro.observe(el);
    App._observers.push(ro);
  };
  App._observers = [];
  /** Run fn when the viewport changes size (width or height); also catches emulated resizes. */
  App.onViewport = (fn) => {
    const el = document.getElementById("vp-sentinel");
    let w = el.clientWidth, h = el.clientHeight, timer = null;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - w) < 2 && Math.abs(el.clientHeight - h) < 2) return;
      w = el.clientWidth; h = el.clientHeight;
      clearTimeout(timer); timer = setTimeout(fn, 60);
    });
    ro.observe(el);
    App._observers.push(ro);
  };
  App.cleanup = () => {
    App._observers.forEach((o) => o.disconnect());
    App._observers = [];
    App.tip.hide();
    if (App._stop) { App._stop(); App._stop = null; }
  };
})();
