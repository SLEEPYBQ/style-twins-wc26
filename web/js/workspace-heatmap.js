/* Team means on the fixed tournament z scale. Filters determine which teams are
 * displayed; the ten measurements and original group memberships stay fixed. */
(function () {
  "use strict";
  const App = window.App;
  const esc = App.esc;
  const sortKeys = ["group", "near", "xgd", "gd", ...App.dials.map((_, i) => `dial${i}`)];
  const sortKey = (value, fallback = "dial0") => sortKeys.includes(value) ? value : fallback;
  const color = d3.scaleLinear().domain([-2, 0, 2]).range(["#985522", "#f4f3f2", "#594899"]).clamp(true);
  const legend = '<span class="hm-scale"><span>≤ −2</span><i class="hm-low" aria-hidden="true"></i><span>0</span><i class="hm-high" aria-hidden="true"></i><span>≥ +2</span></span>';
  const groupIndex = new Map(App.data.archetypes.map((group, i) => [group.id, i]));

  function ordered(ids, order, { state, full, summaries, near }) {
    const ranks = new Map(near.map((neighbor, i) => [neighbor.id, i + 1]));
    ranks.set(state.team, 0);
    const value = (id) => {
      if (order === "near") return ranks.get(id);
      if (order === "group") return groupIndex.get(App.team[id].archetype);
      if (order.startsWith("dial")) return full.team[id][Number(order.slice(4))];
      return summaries[id][order];
    };
    const ascending = order === "group" || order === "near";
    return [...ids].sort((a, b) => {
      const left = value(a), right = value(b);
      if (Number.isFinite(left) !== Number.isFinite(right)) return Number.isFinite(left) ? -1 : 1;
      const byValue = Number.isFinite(left) ? (ascending ? left - right : right - left) : 0;
      return byValue || d3.ascending(App.team[a].name, App.team[b].name) || d3.ascending(a, b);
    });
  }

  function workspaceHeatmap(host, { sortBy, choose, highlight, inspectIndicator }) {
    host.classList.add("ws-heat");
    host.innerHTML = `<div class="hm-tools">
        <label for="ws-heat-sort">Row order</label><span id="ws-heat-sort-host"></span>
        <span class="hm-sort-direction" hidden>Highest first</span>
        <span class="hm-excluded" hidden><i aria-hidden="true">○</i> <span>Outside similarity</span></span>
        <span class="hm-count"></span>
      </div>
      <div class="hm-legend"><span>Standard deviations from the tournament mean</span>
        ${legend}
      </div>
      <span class="sr-only" id="ws-heat-keys">Arrow keys inspect values. Enter selects a team.</span>
      <div class="hm-scroll" tabindex="0" aria-label="Style DNA Heatmap" aria-describedby="ws-heat-keys">
        <table class="hm-table"><caption class="sr-only">Style DNA Heatmap</caption>
          <colgroup><col class="hm-name-col"><col span="${App.dials.length}"></colgroup>
          <thead></thead><tbody></tbody>
        </table>
      </div>
      <div class="hm-readout" id="ws-heat-value" aria-live="polite"></div>`;
    const get = (selector) => host.querySelector(selector);
    const viewport = get(".hm-scroll"), table = get(".hm-table"), body = table.tBodies[0];
    const info = App.dials.map((dial) => App.indicator(dial));
    let model, pickSort, canRank, previousLayout, focusTeam, currentCell, raw = {};
    let pointerColumn = null, markedColumn = null;
    const defaultReadout = () => {
      get("#ws-heat-value").textContent = model.state.view === "pairs" ? "Select a column heading to sort teams."
        : window.matchMedia("(hover: hover)").matches ? "Hover or focus a column heading to preview. Select it to colour the map and sort teams."
        : "Select a column heading to colour the map and sort teams.";
    };

    function markIndicator(index) {
      if (markedColumn === index) return;
      table.querySelectorAll(".is-inspected").forEach((cell) => cell.classList.remove("is-inspected"));
      markedColumn = index;
      if (index != null) table.querySelectorAll(`[data-i="${index}"]`).forEach((cell) => cell.classList.add("is-inspected"));
    }
    function compareHover(teamA, other, index) {
      for (const el of body.querySelectorAll(".is-compared, .is-gap")) el.classList.remove("is-compared", "is-gap");
      if (!teamA || !other || teamA === other || index == null) return;
      for (const id of [teamA, other]) {
        const row = body.querySelector(`tr[data-team="${id}"]`);
        row?.classList.add("is-compared");
        row?.querySelector(`td[data-i="${index}"]`)?.classList.add("is-gap");
      }
    }

    function buildSort(hasRank) {
      const options = [["group", "Original style group"], ...(hasRank ? [["near", "Nearest to Team A"]] : []),
        ["xgd", "xG difference per match"], ["gd", "Goal difference per match"],
        ...info.map((metric, i) => [`dial${i}`, metric.label])];
      get("#ws-heat-sort-host").innerHTML = `<select id="ws-heat-sort" aria-label="Row order">${options.map(([key, label]) =>
        `<option value="${key}">${esc(label)}</option>`).join("")}</select>`;
      pickSort = get("#ws-heat-sort");
      pickSort.onchange = () => sortBy(pickSort.value);
      canRank = hasRank;
    }
    const rawText = (n, i) => `${App.fix(n, 1)}${info[i].unit === "%" ? "%" : ` ${info[i].unit}`}`;
    function cells(values, rawValues) {
      return values.map((z, i) => {
        const description = `${rawText(rawValues[i], i)} · ${App.signed(z, 2)} σ`;
        return `<td tabindex="-1" data-i="${i}" data-z="${z}" data-raw="${rawValues[i]}" aria-label="${esc(description)}"
          style="background-color:${color(z)}"></td>`;
      }).join("");
    }
    function teamRow(id, state, z) {
      const t = App.team[id], side = id === state.team ? "A" : id === state.compare ? "B" : "";
      const tag = side ? `<b class="hm-side" translate="no">${side}</b>` : "";
      return `<tr data-team="${id}" class="${side ? `is-${side.toLowerCase()}` : ""}"><th scope="row">
        <button type="button" class="hm-team" tabindex="${id === focusTeam ? "0" : "-1"}" title="${esc(t.name)}">
          ${App.flag(id, 15)}<span class="hm-name">${esc(t.name)}</span>${tag}</button>
        </th>${cells(z, raw[id])}</tr>`;
    }

    function render(next) {
      model = next;
      const { state, full, visible, near } = model;
      const hasRank = Boolean(full.team[state.team] && near.length);
      if (hasRank !== canRank) buildSort(hasRank);
      const requested = sortKey(state.heatSort);
      const order = requested === "near" && !hasRank ? "group" : requested;
      pickSort.value = order;
      get(".hm-sort-direction").hidden = order === "group" || order === "near";
      get(".hm-count").textContent = `${visible.length} / ${Object.keys(full.team).length} teams`;
      get(".hm-excluded").hidden = state.dials.length === App.dials.length;
      get(".hm-legend").hidden = state.view !== "pairs" && state.color.startsWith("dial");
      const ids = ordered(visible, order, model);
      const previousFocus = document.activeElement;
      const priorRow = previousFocus?.closest("tr[data-team]")?.dataset.team;
      const priorColumn = previousFocus?.closest("td[data-i]")?.dataset.i;
      const headerOrder = table.tHead.contains(previousFocus) ? previousFocus.dataset.order : null;
      const restoreFocus = priorRow && table.contains(previousFocus) && ids.includes(priorRow);
      if (!ids.includes(focusTeam)) focusTeam = ids[0];
      const rowsForGroup = state.arch ? App.arch[state.arch].members.filter((id) => full.team[id]) : [];
      // The original group's reference includes every member in scope, including
      // members hidden by additional search, region or outcome filters.
      raw = {};
      for (const id of new Set([...ids, ...rowsForGroup])) {
        const rows = App.analysis.rows(id, state.scope);
        raw[id] = App.dials.map((_, i) => d3.mean(rows, (row) => row.dials[i]));
      }
      table.tHead.innerHTML = `<tr><th scope="col" class="hm-team-head">Team</th>${info.map((measure, i) => {
        const included = state.dials.includes(App.dials[i]);
        return `<th scope="col" data-i="${i}" data-model="${included ? "in" : "out"}" aria-sort="${order === `dial${i}` ? "descending" : "none"}">
          <button type="button" data-order="dial${i}" title="${esc(measure.help)}"><span>${esc(measure.label)}</span>${!included ? '<i aria-label="Outside similarity">○</i>' : ""}</button>
          </th>`;
      }).join("")}</tr>`;
      const heading = (arch, count) => `<tr class="hm-group-heading"><th scope="row" colspan="${info.length + 1}">
        <span class="hm-group-title"><span>${esc(App.groupLabel(arch))}</span><span class="hm-group-count">${count}</span></span></th></tr>`;
      const sections = [];
      if (state.arch && rowsForGroup.length && ids.length) {
        const means = (source) => App.dials.map((_, i) => d3.mean(rowsForGroup, (id) => source[id][i]));
        sections.push(heading(state.arch, rowsForGroup.length),
          `<tr class="hm-group-mean"><th scope="row" title="Mean across group teams in scope">Group mean</th>${cells(means(full.team), means(raw))}</tr>`);
      }
      const counts = d3.rollup(ids, (rows) => rows.length, (id) => App.team[id].archetype);
      let lastGroup;
      for (const id of ids) {
        const arch = App.team[id].archetype;
        if (order === "group" && !state.arch && arch !== lastGroup) sections.push(heading(arch, counts.get(arch)));
        sections.push(teamRow(id, state, full.team[id]));
        lastGroup = arch;
      }
      body.innerHTML = sections.join("") || `<tr><td class="hm-empty" colspan="${info.length + 1}">No team matches these filters.</td></tr>`;
      // The header and cells above are new DOM nodes. Apply the persisted
      // colour immediately; hovering a heading can temporarily replace it.
      markedColumn = null;
      markIndicator(state.view !== "pairs" && state.color.startsWith("dial") ? +state.color.slice(4) : null);
      const layout = `${order}|${state.scope}|${state.arch}|${ids.join("|")}`;
      if (layout !== previousLayout) viewport.scrollTop = 0;
      previousLayout = layout;
      currentCell = null;
      defaultReadout();
      if (headerOrder) table.tHead.querySelector(`button[data-order="${headerOrder}"]`).focus({ preventScroll: true });
      if (restoreFocus) {
        const row = body.querySelector(`tr[data-team="${priorRow}"]`);
        (row.querySelector(`td[data-i="${priorColumn}"]`) || row.querySelector(".hm-team")).focus({ preventScroll: true });
      }
    }

    function inspect(row, cell) {
      const id = row?.dataset.team;
      const i = cell ? Number(cell.dataset.i) : -1;
      const key = row ? `${id || "group"}:${i}` : null;
      if (key === currentCell) return;
      currentCell = key;
      if (!row) { defaultReadout(); return; }
      const name = id ? App.team[id].name : "Group mean";
      const details = i < 0
        ? [id ? App.groupLabel(App.team[id].archetype) : "Mean across group teams in scope"]
        : [info[i].label, rawText(Number(cell.dataset.raw), i), `${App.signed(Number(cell.dataset.z), 2)} σ`];
      get("#ws-heat-value").innerHTML = `<b>${esc(name)}</b>${details.map((part) => `<span>${esc(part)}</span>`).join("")}`;
    }
    function headerColumn(target) {
      const header = target?.closest("thead th[data-i]");
      return header ? Number(header.dataset.i) : null;
    }
    function inspectTarget(target, column) {
      const row = target?.closest("tr[data-team], .hm-group-mean");
      highlight(row?.dataset.team || null);
      inspectIndicator(model.state.view === "pairs" ? null : column);
      inspect(row, target?.closest("td[data-i]"));
    }
    table.addEventListener("pointerover", (e) => {
      pointerColumn = e.pointerType === "touch" ? null : headerColumn(e.target);
      inspectTarget(e.target, pointerColumn);
    });
    table.addEventListener("pointerleave", () => {
      pointerColumn = null;
      const focus = document.activeElement;
      const target = table.contains(focus) && focus.matches(":focus-visible") ? focus : null;
      inspectTarget(target, headerColumn(target));
    });
    table.addEventListener("focusin", (e) => {
      const row = e.target.closest("tr[data-team]");
      if (row) {
        body.querySelector(".hm-team[tabindex='0']")?.setAttribute("tabindex", "-1");
        row.querySelector(".hm-team").tabIndex = 0;
        focusTeam = row.dataset.team;
      }
      // Mouse focus following a click should release the preview on pointerleave.
      const column = e.target.matches(":focus-visible") ? headerColumn(e.target) : pointerColumn;
      inspectTarget(e.target, column);
    });
    table.addEventListener("focusout", (e) => {
      if (!table.contains(e.relatedTarget)) inspectTarget(null, null);
    });
    table.addEventListener("click", (e) => {
      const order = e.target.closest("button[data-order]");
      if (order) { sortBy(order.dataset.order); return; }
      const row = e.target.closest("tr[data-team]");
      if (!row) return;
      const i = e.target.closest("td[data-i]")?.dataset.i;
      choose(row.dataset.team, e.shiftKey ? "A" : undefined);
      // Taps have no persistent hover. Keep the selected measurement available.
      const updated = body.querySelector(`tr[data-team="${row.dataset.team}"]`);
      if (updated && i !== undefined) inspect(updated, updated.querySelector(`td[data-i="${i}"]`));
    });
    function revealRow(row) {
      const bounds = viewport.getBoundingClientRect(), item = row.getBoundingClientRect();
      const top = bounds.top + table.tHead.offsetHeight;
      if (item.top < top) viewport.scrollTop -= top - item.top;
      else if (item.bottom > bounds.bottom) viewport.scrollTop += item.bottom - bounds.bottom;
    }
    table.addEventListener("keydown", (e) => {
      const row = e.target.closest("tr[data-team]");
      if (!row) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault(); choose(row.dataset.team, e.shiftKey ? "A" : undefined); return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const rows = [...body.querySelectorAll("tr[data-team]")];
      let r = rows.indexOf(row), c = e.target.closest("td")?.cellIndex || 0;
      if (e.key === "ArrowUp") r = Math.max(0, r - 1);
      if (e.key === "ArrowDown") r = Math.min(rows.length - 1, r + 1);
      if (e.key === "ArrowLeft") c = Math.max(0, c - 1);
      if (e.key === "ArrowRight") c = Math.min(info.length, c + 1);
      if (e.key === "Home") c = 0;
      if (e.key === "End") c = info.length;
      const target = c ? rows[r].cells[c] : rows[r].querySelector(".hm-team");
      target.focus();
      revealRow(rows[r]);
      if (c) {
        // A cell can be inside the scroll viewport yet hidden under the sticky name.
        const bounds = viewport.getBoundingClientRect(), name = rows[r].cells[0].getBoundingClientRect();
        const rtl = getComputedStyle(viewport).direction === "rtl";
        const left = rtl ? bounds.left : name.right, right = rtl ? name.left : bounds.right;
        const item = target.getBoundingClientRect();
        if (item.left < left) viewport.scrollLeft -= left - item.left;
        else if (item.right > right) viewport.scrollLeft += item.right - right;
      }
    });
    // While dragging, keep the sorted DOM and scroll position instead of rebuilding up to 480 cells per move.
    function previewRegion(ids) {
      for (const row of body.querySelectorAll("tr[data-team]")) row.hidden = !ids.has(row.dataset.team);
      for (const group of body.querySelectorAll(".hm-group-heading")) {
        let shown = 0;
        for (let row = group.nextElementSibling; row && !row.classList.contains("hm-group-heading"); row = row.nextElementSibling) {
          if (row.dataset.team && !row.hidden) shown++;
        }
        group.hidden = shown === 0;
        if (!model.state.arch) group.querySelector(".hm-group-count").textContent = shown;
      }
      const mean = body.querySelector(".hm-group-mean");
      if (mean) mean.hidden = ids.size === 0;
      let empty = body.querySelector(".hm-empty");
      if (!ids.size && !empty) {
        empty = body.insertRow().insertCell();
        empty.className = "hm-empty";
        empty.colSpan = info.length + 1;
        empty.textContent = "No team matches these filters.";
      }
      if (empty) empty.parentElement.hidden = ids.size > 0;
      get(".hm-count").textContent = `${ids.size} / ${Object.keys(model.full.team).length} teams`;
    }
    return {
      render, previewRegion, markIndicator, compareHover,
      highlight(id) {
        const row = id && body.querySelector(`tr[data-team="${id}"]`);
        if (row && !row.matches(":hover, :focus-within")) revealRow(row);
        const observedCell = row && markedColumn != null ? row.querySelector(`td[data-i="${markedColumn}"]`) : null;
        inspect(row || null, observedCell);
      },
    };
  }
  workspaceHeatmap.sortKey = sortKey;
  workspaceHeatmap.color = color;
  workspaceHeatmap.legend = legend;
  App.workspaceHeatmap = workspaceHeatmap;
})();
