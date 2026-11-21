/* Ranked indicators and team positions share the map and heatmap's scope and filters. */
(function () {
  "use strict";
  const App = window.App;
  const indicators = App.dials.map(App.indicator);
  const boxes = App.styleBoxplot;
  const sigma = value => App.signed(value, 2) + " σ";

  App.exploreStyle = function (host, { selectIndicator, previewIndicator, openCompare }) {
    host.innerHTML = `<header class="xp-head"><h2 id="ws-style-preview-title"></h2>
      <button type="button" class="xp-open">Style Profile</button></header>
      <p class="xp-caption"></p><div class="xp-style-rows"></div>
      <div class="xp-box-axis"><span title="Team mean, standard deviations from the tournament average">Team mean (σ)</span>
        <span class="xp-box-axis-track" aria-hidden="true"></span><span class="xp-style-value"></span></div>`;
    const title = host.querySelector("h2");
    const open = host.querySelector(".xp-open");
    const caption = host.querySelector(".xp-caption");
    const list = d3.select(host.querySelector(".xp-style-rows"));
    const axis = host.querySelector(".xp-box-axis");
    open.onclick = openCompare;
    let scopeProfile, domain, teamA, teamB, active;

    function teamKey(id, role) {
      const code = document.createElement("bdi");
      code.translate = false;
      code.className = "xp-box-team";
      code.dataset.role = role;
      code.textContent = (role === "hover" ? "" : role.toUpperCase() + " ") + id;
      return code;
    }

    function markers(index) {
      return [[teamA, "a"], [teamB, "b"], [active, "hover"]]
        .filter(([id]) => id && Number.isFinite(scopeProfile.team[id]?.[index]))
        .map(([id, role]) => ({ id, role, value: scopeProfile.team[id][index] }));
    }

    function highlight(id) {
      const next = id && id !== teamA && id !== teamB && scopeProfile?.team[id] ? id : null;
      if (next === active) return;
      active = next;
      caption.querySelector('[data-role="hover"]')?.remove();
      if (active && !axis.hidden) caption.append(teamKey(active, "hover"));
      list.selectAll(".xp-style-track").each(function (d) {
        boxes.pins(this, domain, markers(d.index));
      });
    }

    function rowDetails(row) {
      const stats = row.distribution;
      const details = [indicators[row.index].label];
      if (stats && stats.observations.length >= 4) {
        details.push("Middle 50%: " + App.fix(stats.q1, 2) + " … " + sigma(stats.q3),
          "Median: " + sigma(stats.median),
          "Whiskers: " + App.fix(stats.low, 2) + " … " + sigma(stats.high),
          "Outliers: " + stats.outliers.length);
      } else if (stats) {
        for (const { id, value } of stats.observations) details.push(id + ": " + sigma(value));
      }
      for (const id of [teamA, teamB]) {
        const value = scopeProfile.team[id]?.[row.index];
        if (Number.isFinite(value)) details.push(id + ": " + sigma(value));
      }
      return details.join(" · ");
    }

    function render({ state, full, ids, hover }) {
      const { team: a, compare: b } = state;
      teamA = a;
      teamB = b;
      active = null;
      const spread = !a;
      const kind = b ? "pair" : a ? "single" : "spread";
      const pins = [a, b].filter(Boolean);
      const missing = pins.filter(id => !full.team[id]);
      title.textContent = spread ? "Widest style ranges" : b ? "Largest style differences" : "Distinctive indicators";
      host.dataset.kind = kind;
      open.hidden = !a;
      open.textContent = b ? "Compare profiles" : "Style Profile";
      caption.replaceChildren();

      // Keep identical team values at the same positions while filtering or changing A/B.
      if (scopeProfile !== full) {
        const [lo, hi] = d3.extent(Object.values(full.team).flat().filter(Number.isFinite));
        domain = [Math.min(-1, Math.floor(lo ?? 0)), Math.max(1, Math.ceil(hi ?? 0))];
        scopeProfile = full;
      }

      let rows = [];
      if (missing.length) {
        caption.append(missing.join(" / "), " · ", "No matches in this scope.");
      } else if (spread && ids.length < 2) {
        caption.textContent = ids.length ? "At least two teams are needed to measure a range." : "No team matches these filters.";
      } else {
        caption.append(`${ids.length} / ${Object.keys(full.team).length} teams`);
        if (ids.length >= 4) {
          for (const [key, text] of [["box", "Middle 50%"], ["median", "Median"], ["outliers", "Outliers"]]) {
            const label = document.createElement("span");
            label.className = "xp-box-kind-key";
            label.dataset.key = key;
            label.textContent = text;
            if (key === "box") label.title = "Middle 50% of team means";
            if (key === "outliers") label.title = "Whiskers reach the outermost team values within 1.5 IQR of the box.";
            caption.append(label);
          }
        } else if (ids.length) {
          caption.append(" · ", "One dot per team");
        }
        for (const [role, id] of [["a", a], ["b", b]]) {
          if (!id) continue;
          caption.append(teamKey(id, role));
          if (!ids.includes(id)) caption.append(" (", "Filtered out", ")");
        }

        rows = indicators.map((_, index) => {
          const distribution = boxes.summary(ids.map(id => ({ id, value: full.team[id][index] })));
          let value = null;
          if (spread) {
            if (distribution?.observations.length >= 2) value = distribution.max - distribution.min;
          } else {
            const av = full.team[a][index], bv = b ? full.team[b][index] : 0;
            if (Number.isFinite(av) && Number.isFinite(bv)) value = av - bv;
          }
          return { index, distribution, value };
        }).filter(d => Number.isFinite(d.value))
          .sort((x, y) => Math.abs(y.value) - Math.abs(x.value) || x.index - y.index)
          .slice(0, 3);
      }
      axis.hidden = !rows.length;
      if (rows.length) {
        const label = axis.querySelector(".xp-style-value");
        label.textContent = spread ? "Range" : b ? "A − B" : "vs mean";
        label.translate = !b;
        label.title = spread ? "Highest minus lowest team mean" : b ? a + " − " + b : "Tournament mean";
        boxes.axis(axis.querySelector(".xp-box-axis-track"), domain);
      }
      const buttons = list.selectAll("button").data(rows, d => d.index).join(enter => {
        const button = enter.append("button").attr("type", "button").attr("class", "xp-style-row")
          .on("focus", (_, d) => previewIndicator(d.index))
          .on("pointerenter", (event, d) => { if (event.pointerType !== "touch") previewIndicator(d.index); })
          .on("click", (_, d) => selectIndicator(d.index));
        const name = button.append("span").attr("class", "xp-style-name");
        name.append("span");
        name.append("small").text(" ○").attr("aria-label", "Outside similarity").attr("title", "Outside similarity");
        button.append("span").attr("class", "xp-style-track").attr("aria-hidden", "true");
        button.append("span").attr("class", "xp-style-value").attr("dir", "ltr").attr("translate", "no");
        return button;
      });
      const selectedIndicator = state.view === "pairs" ? state.heatSort : state.color;
      buttons.attr("data-indicator", d => d.index)
        .attr("data-value", d => d.value)
        .attr("aria-pressed", d => String(selectedIndicator === "dial" + d.index))
        .attr("title", d => rowDetails(d) + " · " +
          (state.view === "pairs" ? "Sort heatmap by this indicator" : "Colour map and sort heatmap"));
      buttons.select(".xp-style-name span").text(d => indicators[d.index].label);
      buttons.select(".xp-style-name small").property("hidden", d => state.dials.includes(App.dials[d.index]));
      buttons.select(".xp-style-value").text(d => (spread ? App.fix(d.value, 2) : App.signed(d.value, 2)) + " σ");
      buttons.select(".xp-style-track").each(function (d) {
        boxes.draw(this, d.distribution, domain, markers(d.index));
      });
      highlight(hover);
    }

    list.on("pointerleave", () => {
      const focus = list.node().querySelector("button:focus-visible");
      previewIndicator(focus ? +focus.dataset.indicator : null);
    }).on("focusout", event => {
      if (!list.node().contains(event.relatedTarget)) previewIndicator(null);
    });
    return { render, highlight };
  };
})();
