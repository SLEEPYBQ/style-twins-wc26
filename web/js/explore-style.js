/* Three indicator comparisons linked to the map and heatmap. */
(function () {
  "use strict";
  const App = window.App;
  const indicators = App.dials.map(App.indicator);

  App.exploreStyle = function (host, { selectIndicator, previewIndicator, openCompare }) {
    host.innerHTML = `<header class="xp-head"><h2 id="ws-style-preview-title"></h2>
      <button type="button" class="xp-open">Style Profile</button></header>
      <p class="xp-caption"></p><div class="xp-style-rows"></div>`;
    const title = host.querySelector("h2");
    const open = host.querySelector(".xp-open");
    const caption = host.querySelector(".xp-caption");
    const list = d3.select(host.querySelector(".xp-style-rows"));
    open.onclick = openCompare;
    let scopeProfile, domain;

    function teamCodes(text) {
      const codes = document.createElement("bdi");
      codes.translate = false;
      codes.textContent = text;
      return codes;
    }

    function render({ state, full, ids }) {
      const { team: a, compare: b } = state;
      const kind = b ? "pair" : a ? "single" : "spread";
      const spread = kind === "spread";
      const pins = [a, b].filter(Boolean);
      const missing = pins.filter(id => !full.team[id]);
      const outside = pins.filter(id => !ids.includes(id));
      title.textContent = spread ? "Widest style ranges" : b ? "Largest style differences" : "Distinctive indicators";
      host.dataset.kind = kind;
      open.hidden = !a;
      open.textContent = b ? "Compare profiles" : "Style Profile";
      caption.replaceChildren();
      let rows = [];
      if (missing.length) {
        caption.append(teamCodes(missing.join(" / ")), " · ", "No matches in this scope.");
      } else if (spread && ids.length < 2) {
        caption.textContent = ids.length ? "At least two teams are needed to measure a range." : "No team matches these filters.";
      } else {
        if (spread) {
          caption.append("Highest minus lowest team mean", " · ", `${ids.length} / ${Object.keys(full.team).length} teams`);
        } else {
          if (b) caption.append(teamCodes(a + " − " + b));
          else caption.append(teamCodes(a), " − ", "Tournament mean");
          if (outside.length) caption.append(" · ", teamCodes(outside.join(" / ")), " · ", "Filtered out");
        }
        rows = indicators.map((_, index) => {
          if (!spread) {
            const av = full.team[a][index], bv = b ? full.team[b][index] : 0;
            return { index, value: Number.isFinite(av) && Number.isFinite(bv) ? av - bv : null };
          }
          const values = ids.map(id => full.team[id]?.[index]).filter(Number.isFinite);
          return { index, value: values.length < 2 ? null : d3.max(values) - d3.min(values) };
        }).filter(d => Number.isFinite(d.value))
          .sort((x, y) => Math.abs(y.value) - Math.abs(x.value) || x.index - y.index)
          .slice(0, 3);
      }
      // Use the same unit length for every selection and brush in the current scope.
      if (scopeProfile !== full) {
        const profiles = Object.values(full.team);
        const largest = d3.max(indicators, (_, i) => {
          const [lo, hi] = d3.extent(profiles, p => p[i]);
          return Math.max(Math.abs(lo), Math.abs(hi), hi - lo);
        });
        domain = Math.ceil((largest || 1) * 2) / 2;
        scopeProfile = full;
      }
      const zero = spread ? 0 : 50;
      const width = value => (spread ? 100 : 50) * Math.abs(value) / domain;
      const buttons = list.selectAll("button").data(rows, d => d.index).join(enter => {
        const button = enter.append("button").attr("type", "button").attr("class", "xp-style-row")
          .on("focus", (_, d) => previewIndicator(d.index))
          .on("pointerenter", (event, d) => { if (event.pointerType !== "touch") previewIndicator(d.index); })
          .on("click", (_, d) => selectIndicator(d.index));
        const name = button.append("span").attr("class", "xp-style-name");
        name.append("span");
        name.append("small").text(" ○").attr("aria-label", "Outside similarity").attr("title", "Outside similarity");
        button.append("span").attr("class", "xp-style-track").attr("aria-hidden", "true").append("i");
        button.append("span").attr("class", "xp-style-value").attr("dir", "ltr").attr("translate", "no");
        return button;
      });
      const selectedIndicator = state.view === "pairs" ? state.heatSort : state.color;
      buttons.attr("data-indicator", d => d.index)
        .attr("data-sign", d => d.value < 0 ? "negative" : "positive")
        .attr("data-value", d => d.value)
        .attr("aria-pressed", d => String(selectedIndicator === "dial" + d.index))
        .attr("title", state.view === "pairs" ? "Sort heatmap by this indicator" : "Colour map and sort heatmap");
      buttons.select(".xp-style-name span").text(d => indicators[d.index].label);
      buttons.select(".xp-style-name small").property("hidden", d => state.dials.includes(App.dials[d.index]));
      buttons.select(".xp-style-value").text(d => (spread ? App.fix(d.value, 2) : App.signed(d.value, 2)) + " σ");
      buttons.select("i").style("left", d => (zero - (d.value < 0 ? width(d.value) : 0)) + "%")
        .style("width", d => width(d.value) + "%");
    }

    list.on("pointerleave", () => {
      const focus = list.node().querySelector("button:focus-visible");
      previewIndicator(focus ? +focus.dataset.indicator : null);
    }).on("focusout", event => {
      if (!list.node().contains(event.relatedTarget)) previewIndicator(null);
    });
    return { render };
  };
})();
