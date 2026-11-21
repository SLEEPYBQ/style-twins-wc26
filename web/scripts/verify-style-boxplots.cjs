// Run against the staged or local web/ server via STYLE_TWINS_BASE_URL.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = (process.env.STYLE_TWINS_BASE_URL || "http://127.0.0.1:8642").replace(/\/$/, "");
const rows = "#ws-style-preview .xp-style-row";
const heatRows = "#ws-heat tbody tr[data-team]";
const mapTeam = id => `#ws-map .mark[data-team="${id}"]`;
const heatCell = id => `${heatRows}[data-team="${id}"] td[data-i="0"]`;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} expected ${expected}`);

// Read the visible teams in the linked heatmap as an independent source for
// the quartiles, Tukey whiskers and identities of observations beyond them.
async function verifyDistributions(page) {
  const teams = await page.locator(heatRows + ":visible").evaluateAll(elements => elements.map(row => ({
    id: row.dataset.team,
    z: [...row.querySelectorAll("td[data-i]")].map(cell => Number(cell.dataset.z))
  })));
  const plots = await page.locator(rows).evaluateAll(elements => elements.map(row => ({
    i: Number(row.dataset.indicator),
    box: {...row.querySelector(".xp-box-body").dataset},
    median: Number(row.querySelector(".xp-box-median").dataset.value),
    whisker: {...row.querySelector(".xp-box-whisker").dataset},
    width: row.querySelector(".xp-box-body").getBoundingClientRect().width,
    whiskerWidth: row.querySelector(".xp-box-whisker").getBoundingClientRect().width,
    outliers: [...row.querySelectorAll(".xp-box-outlier")].map(dot => dot.dataset.id).sort()
  })));
  assert.equal(plots.length, 3);
  for (const plot of plots) {
    const sorted = teams.map(team => team.z[plot.i]).sort((a,b) => a-b);
    const quantile = p => {
      const i = (sorted.length - 1) * p;
      return sorted[Math.floor(i)] + (i % 1) * (sorted[Math.ceil(i)] - sorted[Math.floor(i)]);
    };
    const q1 = quantile(.25), q3 = quantile(.75), fence = 1.5 * (q3 - q1);
    const inside = sorted.filter(v => v >= q1 - fence && v <= q3 + fence);
    near(Number(plot.box.q1), q1);
    near(Number(plot.box.q3), q3);
    near(plot.median, quantile(.5));
    near(Number(plot.whisker.low), inside[0]);
    near(Number(plot.whisker.high), inside.at(-1));
    const expectedFraction = (q3 - q1) / (inside.at(-1) - inside[0]);
    assert.ok(Math.abs(plot.width / plot.whiskerWidth - expectedFraction) < .005,
      "Rendered box width encodes the middle half of the team values");
    const outside = teams.filter(t => t.z[plot.i] < inside[0] || t.z[plot.i] > inside.at(-1));
    assert.deepEqual(plot.outliers, outside.map(t => t.id).sort());
  }
}

async function verifyMarkers(page, id, role) {
  const selector = `.xp-box-pin[data-role="${role}"][data-id="${id}"]`;
  await page.locator(selector).first().waitFor();
  const values = await page.locator(rows).evaluateAll((elements, {id, selector}) => elements.map(row => {
    const cell = document.querySelector(`#ws-heat tr[data-team="${id}"] td[data-i="${row.dataset.indicator}"]`);
    return [Number(row.querySelector(selector).dataset.value), Number(cell.dataset.z)];
  }), {id, selector});
  assert.equal(values.length, 3);
  values.forEach(([actual, expected]) => near(actual, expected));
}

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = [];
    page.on("pageerror", err => errors.push(err.message));
    await page.route(/^https:\/\/fonts\./, route => route.abort());
    await page.goto(base + "/#/styles", {waitUntil:"domcontentloaded"});
    await page.locator(".xp-box-body").first().waitFor();
    await verifyDistributions(page);
    const ranges = await page.locator(rows).evaluateAll(elements => elements.map(row => Number(row.dataset.value).toFixed(2)));
    assert.deepEqual(ranges, ["3.41", "3.41", "3.09"]);

    await page.locator("#ws-group").selectOption({index:1});
    const groupSize = await page.locator(heatRows + ":visible").count();
    assert.ok(groupSize >= 4 && groupSize < 48);
    await verifyDistributions(page);
    await page.locator("#ws-group").selectOption("");

    const overview = page.url();
    await page.locator(mapTeam("ESP") + " .team-fill").hover();
    await verifyMarkers(page, "ESP", "hover");
    await page.locator(heatCell("ECU")).focus();
    await verifyMarkers(page, "ECU", "hover");
    assert.equal(page.url(), overview);
    await page.locator(heatCell("ECU")).press("Enter");
    await verifyMarkers(page, "ECU", "a");
    await page.locator(mapTeam("USA")).press("Enter");
    await verifyMarkers(page, "USA", "b");
    await verifyMarkers(page, "ECU", "a");
    await verifyDistributions(page);

    const row = page.locator(rows).first();
    const indicator = "dial" + await row.getAttribute("data-indicator");
    await row.press("Enter");
    assert.equal(await page.locator("#ws-heat-sort").inputValue(), indicator);
    assert.equal(await page.locator("#ws-color").inputValue(), indicator);
    await page.locator('#ws-scope [data-v="group"]').click();
    await verifyDistributions(page);
    await verifyMarkers(page, "ECU", "a");
    await verifyMarkers(page, "USA", "b");

    await page.goto(base + "/#/styles?cohort=CAN,USA");
    await page.locator(".xp-box-observation").first().waitFor();
    assert.equal(await page.locator(".xp-box-body").count(), 0, "Small cohorts show individual observations");
    for (const r of await page.locator(rows).all()) {
      const teams = await r.locator(".xp-box-observation").evaluateAll(dots => dots.map(d => d.dataset.id).sort());
      assert.deepEqual(teams, ["CAN", "USA"]);
    }
    await page.locator("#ws-search").fill("zzzzzz");
    await page.locator(rows).first().waitFor({state:"detached"});
    assert.equal(await page.locator(".xp-box-pin, .xp-box-observation").count(), 0);

    await page.setViewportSize({width:390, height:844});
    await page.goto(base + "/#/styles");
    await page.locator(".xp-box-body").first().waitFor();
    await page.locator("#ws-style-preview").scrollIntoViewIfNeeded();
    const tracks = await page.locator(".xp-box-plot").evaluateAll(nodes => nodes.map(el => {
      const {left, right, width} = el.getBoundingClientRect();
      return width > 0 && left >= 0 && right <= window.innerWidth;
    }));
    assert.deepEqual(tracks, [true,true,true]);
    assert.deepEqual(errors, []);
    console.log("Passed style boxplots: cohort statistics, linked team markers, indicator selection, match scope, sparse filters and phone layout.");
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
