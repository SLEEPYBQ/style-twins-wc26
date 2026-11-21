/* Team profiles and signed A−B differences on the tournament's fixed z scale. */
(function () {
  "use strict";
  const App = window.App, esc = App.esc;
  const info = App.dials.map(App.indicator);

  App.workspaceLens = function (host, markColumn) {
    host.innerHTML = `<div class="lens-guide"><span class="lens-direction"></span><span class="lens-keys"></span></div>
      <div class="lens-scale"><span class="lens-axis"></span><span class="lens-values-head"></span></div>
      <div class="lens-rows" role="group" aria-label="Style indicators"></div>
      <div class="lens-reference"><span>Standard deviations from the tournament mean</span></div>
      <div class="lens-readout" aria-live="polite"></div>`;
    const q = selector => host.querySelector(selector);
    const list = d3.select(q(".lens-rows"));
    let model, domain = 2, highlighted = null, detailShown = null;
    const position = value => 50 + 50 * value / domain;
    const signed = value => App.signed(value, 2);
    const classOf = i => i ? "b" : "a";

    function details(index) {
      if (!model || detailShown === index) return;
      detailShown = index;
      const row = model.rows[index];
      const out = q(".lens-readout");
      if (!row) { out.textContent = ""; return; }
      const teams = model.ids.map((id, i) => {
        if (!id || !Number.isFinite(row.z[i])) return "";
        const unit = info[index].unit, value = App.fix(row.raw[i], 1);
        return `<span class="lens-detail-team"><b translate="no">${id}</b> <span>${value}${unit === "%" ? "%" : ""}</span>
          ${unit === "%" ? "" : `<span>${esc(unit)}</span>`} <span>· ${signed(row.z[i])} σ</span></span>`;
      });
      out.innerHTML = `<b>${esc(info[index].label)}</b> ${teams.join("")}`;
    }
    function inspect(index) {
      if (!model) return;
      if (highlighted !== index) {
        list.selectAll(".lens-row").classed("is-inspected", r => r.i === index);
        highlighted = index;
      }
      // At rest, the readout explains the largest difference in the current comparison.
      details(index ?? model.first);
    }
    function localInspect(index) {
      inspect(index);
      markColumn(index);
    }
    function rowContent(r) {
      const { difference, ids } = model;
      const z = r.z, hasBoth = z.every(Number.isFinite);
      const marks = [];
      if (hasBoth) {
        const lo = difference ? Math.min(0, r.delta) : Math.min(...z);
        const hi = difference ? Math.max(0, r.delta) : Math.max(...z);
        const shape = difference ? "lens-bar " + (r.delta >= 0 ? "a" : "b") : "lens-connector";
        marks.push(`<i class="${shape}" style="left:${position(lo)}%;width:${position(hi)-position(lo)}%"></i>`);
      }
      if (!difference) {
        z.forEach((value, i) => {
          if (Number.isFinite(value)) marks.push(`<i class="lens-dot ${classOf(i)}" data-team="${ids[i]}" style="left:${position(value)}%"></i>`);
        });
        marks.push('<i class="lens-overlay" hidden></i>');
      }
      const values = difference ? `<b>${signed(r.delta)}</b>` : ids.map((id, i) =>
        id ? `<span class="lens-number ${classOf(i)}">${Number.isFinite(z[i]) ? signed(z[i]) : "–"}</span>` : "").join("");
      const top = model.ranks.get(r.i);
      return `<span class="lens-name">${top && top <= 3 ? `<small title="Largest absolute differences">#${top}</small>` : ""}
        <span>${esc(info[r.i].label)}</span>${r.included ? "" : '<i title="Outside similarity" aria-label="Outside similarity">○</i>'}</span>
        <span class="lens-track" aria-hidden="true">${marks.join("")}</span><span class="lens-numbers" dir="ltr">${values}</span>`;
    }
    function render({ ids, full, raw, dials, order, mode, match }) {
      const z = ids.map(id => full.team[id]);
      const paired = z.every(Boolean);
      const rows = info.map((_, i) => ({
        i, z: z.map(v => v?.[i]), raw: raw.map(v => v?.[i]),
        included: dials.includes(App.dials[i]), delta: paired ? z[0][i] - z[1][i] : null,
      }));
      const ranked = paired ? [...rows].sort((a,b) => Math.abs(b.delta)-Math.abs(a.delta) || a.i-b.i) : [];
      const difference = paired && mode === "difference";
      model = { ids, rows, difference, first: paired ? ranked[0].i : 0, ranks: new Map(ranked.map((r,i) => [r.i,i+1])) };
      // The absolute domain accommodates every team in this scope, so transient team previews never rescale it.
      const values = difference ? rows.map(r => r.delta) : Object.values(full.team).flat().concat(match || []);
      domain = Math.max(difference ? 0.5 : 2, Math.ceil((d3.max(values, Math.abs) || 0) * 2) / 2);
      const axis = q(".lens-axis");
      axis.innerHTML = `<span>${App.signed(-domain,1)} σ</span><span>0</span><span>${App.signed(domain,1)} σ</span>`;
      q(".lens-values-head").textContent = difference ? "Δ (A − B)" : ids.filter(Boolean).join(" / ");
      q(".lens-values-head").setAttribute("translate","no");
      q(".lens-direction").textContent = difference ? "← Higher for B · Higher for A →" : "";
      const keys = ids.map((id,i) => id ? `<span class="lens-key"><i class="lens-dot ${classOf(i)}"></i>${esc(App.team[id].name)}</span>` : "");
      q(".lens-keys").innerHTML = keys.join("")+'<span class="lens-extra-key" hidden></span>';
      q(".lens-reference").innerHTML = '<span>Standard deviations from the tournament mean</span>'
        + (paired ? '<span><b>#1–3</b> <span>Largest absolute differences</span></span>' : "")
        + (dials.length < info.length ? '<span>○ <span>Outside similarity</span></span>' : "");
      host.classList.toggle("is-difference",difference);
      host.classList.toggle("is-paired",paired);
      const ordered = paired && order === "gap" ? ranked : rows;
      list.selectAll("button").data(ordered, r => r.i).join(enter => enter.append("button").attr("type","button")
        .attr("class","lens-row")
        .on("pointerenter", (e,r) => { if (e.pointerType !== "touch") localInspect(r.i); })
        .on("focus click", (e,r) => localInspect(r.i))
        .on("keydown", (e) => {
          if (!["ArrowUp","ArrowDown","Home","End"].includes(e.key)) return;
          e.preventDefault();
          const nodes = list.selectAll("button").nodes(), i = nodes.indexOf(e.currentTarget);
          const next = e.key === "Home" ? 0 : e.key === "End" ? nodes.length-1 : i + (e.key === "ArrowUp" ? -1 : 1);
          nodes[Math.max(0,Math.min(next,nodes.length-1))].focus();
        }))
        .attr("title", r => info[r.i].help)
        .attr("data-indicator", r => r.i).attr("data-delta", r => r.delta)
        .attr("data-rank", r => model.ranks.get(r.i) || null)
        .classed("is-excluded", r => !r.included)
        .html(rowContent);
      detailShown = null;
      inspect(null);
    }
    function overlay(values, label, isMatch) {
      if (!model || model.difference) return;
      list.selectAll(".lens-row").each(function(r) {
        const marker = this.querySelector(".lens-overlay"), value = values?.[r.i];
        marker.hidden = !Number.isFinite(value);
        if (!marker.hidden) marker.style.left = position(value) + "%";
        marker.classList.toggle("is-match", !!isMatch);
      });
      const key = q(".lens-extra-key");
      key.hidden = !values;
      if (values) key.textContent = (isMatch ? "◇ " : "○ ") + label;
    }
    q(".lens-rows").addEventListener("pointerleave", () => {
      const focused = document.activeElement;
      localInspect(focused?.matches(".lens-row:focus-visible") ? +focused.dataset.indicator : null);
    });
    q(".lens-rows").addEventListener("focusout", e => {
      if (!q(".lens-rows").contains(e.relatedTarget)) localInspect(null);
    });
    return { render, overlay, inspect };
  };
})();
