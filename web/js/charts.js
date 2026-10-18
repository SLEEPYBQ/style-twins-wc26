/* Reusable chart pieces: dial fingerprints, result recipes, dual bars, phase butterfly. */
(function () {
  const App = window.App;
  const C = (App.charts = {});
  const POS = "#0a9396", NEG = "#e8743b", INK = "#1d2433", GRID = "#efe9dc", AXIS = "#cfc7b5", MUTED = "#858a96";

  /** Rounded-end bar path from x0 to x1 (data end rounded, baseline end square). */
  function hbar(x0, x1, y, h, r = 4) {
    const left = Math.min(x0, x1), right = Math.max(x0, x1), w = right - left;
    r = Math.min(r, w / 2, h / 2);
    if (w < 0.5) return "";
    if (x1 >= x0) // grows right: round the right end
      return `M${left},${y}H${right - r}Q${right},${y} ${right},${y + r}V${y + h - r}Q${right},${y + h} ${right - r},${y + h}H${left}Z`;
    return `M${right},${y}H${left + r}Q${left},${y} ${left},${y + r}V${y + h - r}Q${left},${y + h} ${left + r},${y + h}H${right}Z`;
  }
  C.hbar = hbar;

  /** Mini barcode: one column per dial, diverging from a centre line. */
  C.miniFingerprint = (el, z, dialIds, { width = 200, height = 44 } = {}) => {
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "none")
      .style("width", "100%").style("height", `${height}px`).style("display", "block");
    const x = d3.scaleBand().domain(dialIds).range([0, width]).padding(0.28);
    const y = d3.scaleLinear().domain([-2, 2]).range([height - 2, 2]).clamp(true);
    svg.append("line").attr("x1", 0).attr("x2", width).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", AXIS);
    svg.selectAll("rect.b").data(dialIds).join("rect").attr("class", "b")
      .attr("x", (d) => x(d)).attr("width", x.bandwidth())
      .attr("y", (d, i) => Math.min(y(z[i]), y(0))).attr("height", (d, i) => Math.max(1, Math.abs(y(z[i]) - y(0))))
      .attr("rx", 2).attr("fill", (d, i) => (z[i] >= 0 ? POS : NEG));
    svg.selectAll("rect.hit").data(dialIds).join("rect").attr("class", "hit")
      .attr("x", (d) => x(d) - x.step() * x.padding() / 2).attr("width", x.step()).attr("y", 0).attr("height", height)
      .attr("fill", "transparent")
      .on("mousemove", (evt, d) => {
        const i = dialIds.indexOf(d);
        App.tip.show(`<div class="tt-title">${d}</div><div class="tt-dim">${App.dialInfo[d].help}</div>` +
          App.ttRows([["vs. tournament average", `${App.signed(z[i], 1)} sd`]]), evt);
      })
      .on("mouseleave", App.tip.hide);
    return svg;
  };

  /** Labelled fingerprint: one row per dial; optional comparison values drawn as hollow markers. */
  C.fingerprint = (el, rows, { width, compare, compareLabel, mainLabel } = {}) => {
    // rows: [{dial, z, raw}] ; compare: [{dial, z, raw}] same order
    const W = width || el.clientWidth || 420;
    const labelW = Math.min(150, W * 0.38), valW = 44, rowH = 26;
    const H = rows.length * rowH + 30;
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const x = d3.scaleLinear().domain([-2.5, 2.5]).range([labelW, W - valW]).clamp(true);
    const g = svg.append("g").attr("transform", "translate(0,22)");
    // axis caps
    svg.append("text").attr("class", "axis-cap").attr("x", x(-2.5)).attr("y", 12).text("below avg");
    svg.append("text").attr("class", "axis-cap").attr("x", x(2.5)).attr("y", 12).attr("text-anchor", "end").text("above avg");
    g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", -4).attr("y2", rows.length * rowH).attr("stroke", AXIS);
    rows.forEach((r, i) => {
      const y = i * rowH;
      const row = g.append("g").attr("transform", `translate(0,${y})`);
      row.append("text").attr("x", 0).attr("y", rowH / 2).attr("dominant-baseline", "central")
        .attr("font-size", 12.5).attr("font-weight", 600).attr("fill", INK).text(r.dial);
      row.append("path").attr("d", hbar(x(0), x(r.z), rowH / 2 - 6, 12)).attr("fill", r.z >= 0 ? POS : NEG);
      if (compare) {
        const c = compare[i];
        row.append("path").attr("d", d3.symbol(d3.symbolDiamond, 52)()).attr("transform", `translate(${x(c.z)},${rowH / 2})`)
          .attr("fill", "#fff").attr("stroke", INK).attr("stroke-width", 1.6);
      }
      row.append("text").attr("x", W).attr("y", rowH / 2).attr("dominant-baseline", "central").attr("text-anchor", "end")
        .attr("font-size", 12).attr("font-weight", 700).attr("fill", "#4a5263").attr("class", "tnum")
        .text(App.fix(r.raw, r.dial === "Press intensity" ? 0 : 1));
      row.append("rect").attr("x", 0).attr("width", W).attr("height", rowH).attr("fill", "transparent")
        .on("mousemove", (evt) => {
          const extra = compare ? [[compareLabel || "comparison", `${App.signed(compare[i].z, 1)} sd`]] : [];
          App.tip.show(`<div class="tt-title">${r.dial}</div><div class="tt-dim">${App.dialInfo[r.dial].help}</div>` +
            App.ttRows([[App.dialInfo[r.dial].label, App.fix(r.raw, 1)], [mainLabel || "vs. average", `${App.signed(r.z, 1)} sd`], ...extra]), evt);
        })
        .on("mouseleave", App.tip.hide);
    });
    return svg;
  };

  /**
   * Result recipe: six signed components that add up to goal difference per match.
   * series: [{label, values: {c_style:..}, dots: [[...6 values], ...], color}] (1 or 2 series)
   */
  C.recipe = (el, series, { width, title } = {}) => {
    const W = width || el.clientWidth || 520;
    const narrow = W < 460;
    const labelW = narrow ? 118 : 168, valW = 54, rowH = series.length > 1 ? 50 : 42;
    const comps = App.components;
    const n = comps.length;
    const H = (n + 1) * rowH + 40;
    const svg = d3.select(el).classed("recipe", true).append("svg").attr("width", W).attr("height", H);
    const vals = series.flatMap((s) => [...comps.map((c) => s.values[c.id]), d3.sum(comps, (c) => s.values[c.id]),
      ...(s.dots || []).flat(), ...(s.dots || []).map((d) => d3.sum(d))]);
    const m = Math.max(1, d3.max(vals, (v) => Math.abs(v)) * 1.05);
    const x = d3.scaleLinear().domain([-m, m]).range([labelW, W - valW]).nice();
    const g = svg.append("g").attr("transform", "translate(0,26)");
    // grid
    const ticks = x.ticks(narrow ? 4 : 6);
    g.selectAll("line.grid").data(ticks).join("line").attr("x1", (d) => x(d)).attr("x2", (d) => x(d))
      .attr("y1", -6).attr("y2", (n + 1) * rowH).attr("stroke", (d) => (d === 0 ? AXIS : GRID)).attr("stroke-width", (d) => (d === 0 ? 1.5 : 1));
    svg.selectAll("text.tick").data(ticks).join("text").attr("class", "axis-cap tnum").attr("x", (d) => x(d) + 0).attr("y", 14)
      .attr("text-anchor", "middle").text((d) => (d === 0 ? "0" : App.signed(d, Number.isInteger(d) ? 0 : 1)));
    const barH = series.length > 1 ? 13 : 16;
    const rows = [...comps, { id: "total", label: "Goal difference", help: "per match = sum of the six" }];
    rows.forEach((c, i) => {
      const y = i * rowH;
      const row = g.append("g").attr("transform", `translate(0,${y})`);
      if (c.id === "total") row.append("line").attr("x1", 0).attr("x2", W).attr("y1", 1).attr("y2", 1).attr("stroke", INK).attr("stroke-width", 1.2);
      row.append("text").attr("class", c.id === "total" ? "rtotal" : "rlabel").attr("x", 0).attr("y", rowH / 2 - 5).text(c.label);
      row.append("text").attr("class", "rhelp").attr("x", 0).attr("y", rowH / 2 + 10).text(narrow ? "" : c.help);
      series.forEach((s, k) => {
        const v = c.id === "total" ? d3.sum(comps, (cc) => s.values[cc.id]) : s.values[c.id];
        const by = series.length > 1 ? rowH / 2 - barH - 1 + k * (barH + 2) : rowH / 2 - barH / 2;
        const fill = c.id === "total" ? (s.color || INK) : series.length > 1 ? s.color : v >= 0 ? POS : NEG;
        row.append("path").attr("d", hbar(x(0), x(v), by, barH)).attr("fill", fill);
        const dots = (s.dots || []).map((d) => (c.id === "total" ? d3.sum(d) : d[i]));
        if (series.length === 1 && dots.length > 1)
          row.selectAll("circle.dot").data(dots).join("circle").attr("class", "dot")
            .attr("cx", (d) => x(d)).attr("cy", by + barH / 2).attr("r", 3.6)
            .attr("fill", "rgba(29,36,51,0.55)").attr("stroke", "#fff").attr("stroke-width", 1.5);
        row.append("text").attr("class", "rval").attr("x", W).attr("y", by + barH / 2).attr("dominant-baseline", "central")
          .attr("text-anchor", "end").text(App.signed(v, 2));
      });
      row.append("rect").attr("width", W).attr("height", rowH).attr("fill", "transparent")
        .on("mousemove", (evt) => {
          const lines = series.map((s) => {
            const v = c.id === "total" ? d3.sum(comps, (cc) => s.values[cc.id]) : s.values[c.id];
            return [s.label, App.signed(v, 2)];
          });
          App.tip.show(`<div class="tt-title">${c.label}</div><div class="tt-dim">${C.componentHelp[c.id] || c.help}</div>${App.ttRows(lines)}` +
            (series.length === 1 && series[0].dots && series[0].dots.length > 1 ? `<div class="tt-dim" style="margin-top:4px">Dots = individual matches</div>` : ""), evt);
        })
        .on("mouseleave", App.tip.hide);
    });
    if (title) svg.append("text").attr("x", 0).attr("y", 12).attr("class", "axis-cap").text(title);
    return svg;
  };

  C.componentHelp = {
    c_style: "How many goals per match teams with this style usually win by: the average xG for and against of the 20 most similar team-matches (other teams), scaled by the model.",
    c_opp: "How the opponent's usual numbers (xG they concede and create in their other matches) moved the expectation.",
    c_create: "Actual xG created minus the xG that style + opponent predicted. Positive = made more chances than expected.",
    c_prevent: "Expected xG against minus actual xG against. Positive = allowed fewer chances than expected.",
    c_finish: "Goals scored minus xG. Positive = finished better than the chances suggest (skill or luck).",
    c_keep: "xG faced minus goals conceded. Positive = the goalkeeper/last-ditch defending saved more than expected.",
    total: "Goal difference per match. The six rows add up exactly to this number.",
  };

  /** Head-to-head stat rows: two bars that share one track (left team vs right team). */
  C.dualBars = (el, rows, kits) => {
    const wrap = d3.select(el).append("div").attr("class", "dual");
    for (const r of rows) {
      const a = r.a ?? 0, b = r.b ?? 0, tot = a + b || 1;
      const row = wrap.append("div").attr("class", "dual-row");
      row.append("div").attr("class", "lbl").text(r.label);
      row.append("div").attr("class", "v tnum").text(r.fmt ? r.fmt(r.a) : r.a);
      const bar = row.append("div").attr("class", "dual-bar");
      bar.append("i").style("width", `${(a / tot) * 100}%`).style("background", kits[0]).style("box-shadow", App.isLight(kits[0]) ? "inset 0 0 0 1.5px #cfc7b5" : null);
      bar.append("i").style("width", `${(b / tot) * 100}%`).style("background", kits[1]).style("box-shadow", App.isLight(kits[1]) ? "inset 0 0 0 1.5px #cfc7b5" : null);
      row.append("div").attr("class", "v r tnum").text(r.fmt ? r.fmt(r.b) : r.b);
    }
  };

  /** Phase-of-play butterfly: home share to the left, away share to the right. */
  C.butterfly = (el, phasesA, phasesB, kits, names) => {
    const groups = [
      ["In possession", ["Build Up Unopposed", "Build Up Opposed", "Progression", "Final Third", "Long Ball", "Attacking Transition", "Counter Attack", "Set Piece"]],
      ["Out of possession", ["High Press", "Mid Press", "Low Press", "High Block", "Mid Block", "Low Block", "Counter-press", "Recovery", "Defensive Transition"]],
    ];
    const W = el.clientWidth || 300, mid = W / 2, labelW = 112, rowH = 19;
    const nRows = groups.reduce((s, g) => s + g[1].length, 0);
    const H = nRows * rowH + groups.length * 26 + 24;
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const maxV = d3.max([...Object.values(phasesA), ...Object.values(phasesB)]);
    const half = (W - labelW) / 2;
    const x = d3.scaleLinear().domain([0, maxV]).range([0, half - 26]);
    svg.append("text").attr("x", 0).attr("y", 12).attr("class", "axis-cap").text(names[0]);
    svg.append("text").attr("x", W).attr("y", 12).attr("text-anchor", "end").attr("class", "axis-cap").text(names[1]);
    let y = 24;
    for (const [gname, phases] of groups) {
      svg.append("text").attr("x", mid).attr("y", y + 12).attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 800)
        .attr("fill", MUTED).text(gname);
      y += 20;
      for (const p of phases) {
        const a = phasesA[p] ?? 0, b = phasesB[p] ?? 0;
        const left = mid - labelW / 2, right = mid + labelW / 2;
        svg.append("path").attr("d", hbar(left, left - x(a), y + 3, rowH - 7, 3)).attr("fill", kits[0])
          .attr("stroke", App.isLight(kits[0]) ? AXIS : null);
        svg.append("path").attr("d", hbar(right, right + x(b), y + 3, rowH - 7, 3)).attr("fill", kits[1])
          .attr("stroke", App.isLight(kits[1]) ? AXIS : null);
        svg.append("text").attr("x", mid).attr("y", y + rowH / 2).attr("text-anchor", "middle").attr("dominant-baseline", "central")
          .attr("font-size", 11.5).attr("font-weight", 600).attr("fill", INK).text(p.replace("Build Up", "Build-up"));
        svg.append("text").attr("x", left - x(a) - 4).attr("y", y + rowH / 2).attr("text-anchor", "end").attr("dominant-baseline", "central")
          .attr("font-size", 11).attr("font-weight", 700).attr("fill", "#4a5263").text(`${a}%`);
        svg.append("text").attr("x", right + x(b) + 4).attr("y", y + rowH / 2).attr("dominant-baseline", "central")
          .attr("font-size", 11).attr("font-weight", 700).attr("fill", "#4a5263").text(`${b}%`);
        y += rowH;
      }
      y += 6;
    }
  };
})();
