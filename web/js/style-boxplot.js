/* Team means have the same σ scale across the indicator rows. */
(function () {
  "use strict";
  const App = window.App;

  function summary(rows) {
    const observations = rows.filter(d => Number.isFinite(d.value))
      .sort((a, b) => a.value - b.value || d3.ascending(a.id, b.id));
    if (!observations.length) return null;
    const values = observations.map(d => d.value);
    const q1 = d3.quantileSorted(values, .25), q3 = d3.quantileSorted(values, .75);
    const fence = 1.5 * (q3 - q1);
    const low = values.find(value => value >= q1 - fence);
    const high = values[d3.bisectRight(values, q3 + fence) - 1];
    return {
      observations, min: values[0], max: values.at(-1),
      q1, median: d3.quantileSorted(values, .5), q3, low, high,
      outliers: observations.filter(d => d.value < low || d.value > high),
    };
  }

  function percentage(domain) {
    const scale = d3.scaleLinear().domain(domain).range([0, 100]);
    return value => scale(value) + "%";
  }

  function pins(track, domain, markers) {
    const x = percentage(domain);
    // Keep A and B on separate levels even when their means coincide.
    const marks = d3.select(track).select(".xp-box-plot").selectAll(".xp-box-pin")
      .data(markers.filter(d => Number.isFinite(d.value)), d => d.role)
      .join(enter => {
        const mark = enter.append("svg").attr("class", "xp-box-pin")
          .attr("width", 12).attr("height", 12).attr("viewBox", "-6 -6 12 12")
          .attr("transform", "translate(-6,-6)");
        mark.append("path").attr("d", d => d3.symbol({
          a: d3.symbolCircle, b: d3.symbolSquare, hover: d3.symbolCross,
        }[d.role]).size(d.role === "hover" ? 58 : 42)())
          .attr("transform", d => d.role === "b" ? "rotate(45)" : null);
        return mark;
      });
    marks.attr("data-id", d => d.id).attr("data-role", d => d.role).attr("data-value", d => d.value)
      .attr("x", d => x(d.value)).attr("y", d => ({ a: 5, b: 14, hover: 9.5 })[d.role]);
  }

  function draw(track, distribution, domain, markers) {
    track.replaceChildren();
    const svg = d3.select(track).append("svg").attr("class", "xp-box-plot").attr("aria-hidden", "true");
    const x = percentage(domain);
    if (domain[0] <= 0 && domain[1] >= 0) {
      svg.append("line").attr("class", "xp-box-zero")
        .attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", 19);
    }
    if (distribution) {
      const { observations, q1, median, q3, low, high, outliers } = distribution;
      const hasBox = observations.length >= 4;
      if (hasBox) {
        svg.append("line").attr("class", "xp-box-whisker")
          .attr("data-low", low).attr("data-high", high)
          .attr("x1", x(low)).attr("x2", x(high)).attr("y1", 9.5).attr("y2", 9.5);
        svg.selectAll(".xp-box-cap").data([low, high]).join("line").attr("class", "xp-box-cap")
          .attr("x1", x).attr("x2", x).attr("y1", 6).attr("y2", 13);
        svg.append("rect").attr("class", "xp-box-body").attr("data-q1", q1).attr("data-q3", q3)
          .attr("x", x(q1)).attr("y", 4.5).attr("height", 10)
          .attr("width", (q3 - q1) / (domain[1] - domain[0]) * 100 + "%");
        svg.append("line").attr("class", "xp-box-median").attr("data-value", median)
          .attr("x1", x(median)).attr("x2", x(median)).attr("y1", 3).attr("y2", 16);
      }
      const points = hasBox ? outliers : observations;
      const dots = svg.selectAll("circle").data(points).join("circle")
        .attr("class", hasBox ? "xp-box-outlier" : "xp-box-observation")
        .attr("data-id", d => d.id).attr("data-value", d => d.value)
        .attr("cx", d => x(d.value)).attr("cy", 9.5).attr("r", 2.8);
      dots.append("title").text(d => `${App.team[d.id]?.name || d.id} · ${App.signed(d.value)} σ`);
    }
    pins(track, domain, markers);
  }

  function axis(track, domain) {
    const x = percentage(domain);
    track.replaceChildren();
    const svg = d3.select(track).append("svg").attr("class", "xp-box-ticks").attr("translate", "no");
    const ticks = [...new Set([domain[0], 0, domain[1]])].filter(v => v >= domain[0] && v <= domain[1]);
    svg.selectAll("text").data(ticks).join("text").attr("x", x).attr("y", 12)
      .attr("text-anchor", v => v === domain[0] ? "start" : v === domain[1] ? "end" : "middle")
      .text(v => App.signed(v, 0));
  }

  App.styleBoxplot = { summary, draw, pins, axis };
})();
