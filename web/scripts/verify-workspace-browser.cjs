// Run with Chromium and Playwright while serving web/ at STYLE_TWINS_BASE_URL.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const base = (process.env.STYLE_TWINS_BASE_URL || "http://127.0.0.1:8642").replace(/\/$/, "");
const output = process.env.STYLE_TWINS_QA_OUTPUT || path.join(os.tmpdir(), "style-twins-workspace-qa");
const heatRows = "#ws-heat tbody tr[data-team]";
const mapMarks = "#ws-map .mark[data-team]";
const ids = (page, selector) => page.locator(selector).evaluateAll(nodes => nodes.map(node => node.dataset.team));
const params = page => new URLSearchParams(new URL(page.url()).hash.split("?")[1]);
const heatTeam = (page, id) => page.locator(heatRows + '[data-team="' + id + '"]');
const mapTeam = (page, id) => page.locator(mapMarks + '[data-team="' + id + '"]');

async function overview(page) {
  await page.goto(base + "/#/styles");
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#ws-heat tbody tr[data-team]") || document.querySelector("#view .card h3"));
  assert.equal(await page.locator(heatRows).count(), 48, (await page.locator("#view").innerText()).slice(0,200));
  await page.evaluate(async () => {
    window.scrollTo({top:0, left:0, behavior:"instant"});
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await page.locator(mapMarks).count(), 48);
  assert.equal(await page.locator(heatRows + " td[data-i]").count(), 480);
  assert.equal(await page.locator("#ws-twins [data-team]:visible, #ws-profile [data-team]:visible, #ws-matches [data-match]:visible").count(), 0);
}

async function checkCustomUnits(page, teamId, matchId = null) {
  // Independently invert the rendered linear scales using their labeled ticks.
  const readings = await page.evaluate(({teamId, matchId}) => {
    const selector = matchId ? "#ws-map svg > path" : '#ws-map .mark[data-team="' + teamId + '"]';
    const position = document.querySelector(selector).transform.baseVal.consolidate().matrix;
    const rows = matchId ? [App.tm[matchId]] : Object.values(App.tm).filter(row => row.team_id === teamId && row.stage === "Group");
    return [["x", "middle", position.e, 0], ["y", "end", position.f, 9]].map(([axis, anchor, coordinate, i]) => {
      const ticks = [...document.querySelectorAll("#ws-map .axis text")]
        .filter(node => node.getAttribute("text-anchor") === anchor && Number.isFinite(Number(node.textContent)));
      const [first, last] = [ticks[0], ticks.at(-1)];
      const guides = [...document.querySelectorAll("#ws-map .grid line")]
        .filter(line => line.getAttribute(axis + "1") === line.getAttribute(axis + "2"))
        .map(line => Number(line.getAttribute(axis + "1")));
      const fraction = (coordinate - guides[0]) / (guides.at(-1) - guides[0]);
      const plotted = Number(first.textContent) + fraction * (Number(last.textContent) - Number(first.textContent));
      const expected = rows.reduce((sum, row) => sum + row.dials[i], 0) / rows.length;
      return {axis, plotted, expected};
    });
  }, {teamId, matchId});
  for (const {axis, plotted, expected} of readings) {
    assert.ok(Math.abs(plotted - expected) < 0.01, axis + " plotted " + plotted + " should equal raw " + expected);
  }
  assert.match(await page.locator("#ws-map .axis .title").first().textContent(), /%/);
}

async function run() {
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}, acceptDownloads:true});
    const navigationTimeout = Number(process.env.STYLE_TWINS_NAV_TIMEOUT_MS);
    if (navigationTimeout > 0 && Number.isFinite(navigationTimeout)) page.setDefaultNavigationTimeout(navigationTimeout);
    const errors = [];
    page.on("pageerror", err => errors.push(err.message));
    // The router catches rendering exceptions and reports them through console.error.
    page.on("console", message => {
      if (message.type() === "error" && /(?:Type|Syntax|Reference|Range)Error/.test(message.text())) errors.push(message.text());
    });
    for (const [name, width, height] of [["desktop",1440,900],["laptop",1280,800],["phone",390,844]]) {
      console.log("Viewport", name, width, height);
      await page.setViewportSize({width,height});
      await page.mouse.move(0, 0);
      await overview(page);
      await page.waitForFunction(() => {
        const host = document.querySelector("#ws-map");
        const box = host.querySelector("svg").viewBox.baseVal;
        return Math.abs(box.width - host.clientWidth) <= 1 && Math.abs(box.height - host.clientHeight) <= 1;
      });
      const layout = await page.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        map: document.querySelector("#ws-map").getBoundingClientRect().width,
        heat: document.querySelector("#ws-heat").getBoundingClientRect().width
      }));
      assert.ok(layout.pageWidth <= width + 1, name + " page overflow: " + layout.pageWidth);
      assert.ok(layout.map >= 200 && layout.heat >= 200, name + " chart width: " + JSON.stringify(layout));
      await page.screenshot({path:path.join(output,"workspace-" + name + ".png")});
      if (name === "phone") {
        await page.locator("#ws-heat").scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,"workspace-phone-heatmap.png")});
      }
      // Exercise the narrow/desktop scroll containers and team selection at every size.
      await heatTeam(page, "ECU").locator("button").first().click();
      assert.equal(params(page).get("team"), "ECU");
      assert.equal(params(page).has("compare"), false);
      assert.equal(await page.locator("#ws-twins [data-team]").first().getAttribute("data-team"), "USA");
      await page.locator("#ws-twins [data-team]").first().click();
      assert.equal(params(page).get("compare"), "USA");
      assert.equal(await page.locator("#ws-matches [data-match]").count(), 9);
    }

    await page.setViewportSize({width:1440,height:900});
    await overview(page);
    assert.match(await page.locator("#ws-projection").innerText(), /variation.*10.*indicators/i);
    const maxError = await page.evaluate(() => {
      const rows = Object.values(App.tm);
      const avg = values => values.reduce((a,b) => a+b,0)/values.length;
      let error = 0;
      for (let i = 0; i < App.dials.length; i++) {
        const mean = avg(rows.map(r => r.dials[i]));
        const sd = Math.sqrt(avg(rows.map(r => (r.dials[i]-mean) ** 2)));
        for (const tr of document.querySelectorAll("#ws-heat tr[data-team]")) {
          const expected = avg(rows.filter(r => r.team_id === tr.dataset.team).map(r => r.dials[i]));
          const cell = tr.querySelector('td[data-i="' + i + '"]');
          error = Math.max(error, Math.abs(Number(cell.dataset.raw)-expected),
            Math.abs(Number(cell.dataset.z)-(expected-mean)/sd));
        }
      }
      return error;
    });
    assert.ok(maxError < 1e-8, "Heatmap raw means and population z-scores should match all 208 records");
    const initialUrl = page.url();
    await heatTeam(page, "ECU").locator("td[data-i]").first().hover();
    assert.match(await mapTeam(page, "ECU").getAttribute("class"), /is-hover/);
    assert.equal(page.url(), initialUrl, "Hover must be transient");
    await page.locator("#ws-brush").hover();
    assert.doesNotMatch(await mapTeam(page, "ECU").getAttribute("class"), /is-hover/);
    await mapTeam(page, "ECU").focus();
    assert.match(await heatTeam(page, "ECU").getAttribute("class"), /is-hover/);
    await mapTeam(page, "ECU").press("Enter");
    assert.equal(params(page).get("team"), "ECU");
    await heatTeam(page, "USA").locator("button").first().click();
    assert.equal(params(page).get("compare"), "USA");

    await page.locator("#ws-swap").click();
    assert.equal(params(page).get("team"), "USA");
    assert.equal(params(page).get("compare"), "ECU");
    await page.locator("#ws-swap").click();
    await page.locator("#ws-pick-b .sel-btn").click();
    await page.locator("#ws-pick-b .sel-opt").filter({hasText:"Clear comparison"}).click();
    assert.equal(params(page).get("team"), "ECU");
    assert.equal(params(page).has("compare"), false);
    assert.equal(await page.locator("#ws-profile [data-team='ECU']").count(), 10);
    assert.equal(await page.locator("#ws-matches tr[data-match]").count(), 4);
    await page.locator("#ws-pick-b .sel-btn").click();
    await page.locator("#ws-pick-b input").fill("USA");
    await page.locator("#ws-pick-b .sel-opt").click();
    assert.equal(params(page).get("compare"), "USA");

    // The view's nearest-team order must use the selected dimensions and scope.
    await page.locator("#ws-heat-sort").selectOption("near");
    assert.deepEqual((await ids(page, heatRows)).slice(0, 2), ["ECU","USA"]);
    await page.locator("#ws-dials input[data-i='0']").uncheck();
    assert.equal(await page.locator("#ws-heat thead th[data-i='0']").getAttribute("data-model"), "out");
    const expected = await page.evaluate(() => {
      const dials = App.analysis.readDials(new URLSearchParams(location.hash.split("?")[1]));
      return App.analysis.twinTable(App.analysis.space(dials, "all")).near.ECU.map(n => n.id);
    });
    assert.deepEqual(await ids(page, heatRows), ["ECU",...expected]);
    assert.deepEqual((await ids(page, "#ws-twins [data-team]")).slice(0, 5), expected.slice(0, 5));
    await page.locator("#ws-dials-all").click();

    const group = await page.evaluate(() => App.team.ECU.archetype);
    const included = await page.evaluate(group => App.teams.filter(t => t.archetype === group).map(t => t.id), group);
    await page.locator("#ws-group").selectOption(group);
    assert.deepEqual((await ids(page, heatRows)).sort(), included.sort());
    assert.equal(await page.locator("#ws-dials input:checked").count(), 10, "A style group filters teams only");
    const meanCell = page.locator("#ws-heat .hm-group-mean td[data-i='0']");
    const groupScores = await page.locator(heatRows + " td[data-i='0']").evaluateAll(cells => cells.map(cell => Number(cell.dataset.z)));
    const groupMean = groupScores.reduce((sum, score) => sum + score, 0) / groupScores.length;
    assert.ok(Math.abs(Number(await meanCell.getAttribute("data-z")) - groupMean) < 1e-8);
    await page.locator("#ws-search").fill("Ecuador");
    await page.waitForFunction(() => document.querySelectorAll("#ws-heat tr[data-team]").length === 1);
    assert.ok(Math.abs(Number(await meanCell.getAttribute("data-z")) - groupMean) < 1e-8, "Filtering one team should preserve its group reference");
    await page.locator("#ws-search").fill("");
    await page.waitForFunction(n => document.querySelectorAll("#ws-heat tr[data-team]").length === n, included.length);
    await page.locator("#ws-group").selectOption("");
    const orderByPossession = page.locator("#ws-heat thead th[data-i='0'] button");
    await orderByPossession.focus();
    await orderByPossession.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.order), "dial0");
    assert.equal(params(page).get("heatSort"), "dial0");
    const column = await page.locator(heatRows + " td[data-i='0']").evaluateAll(cells => cells.map(c => Number(c.dataset.z)));
    assert.deepEqual(column, [...column].sort((a,b) => b-a));
    assert.ok(column[0] > 0 && column.at(-1) < 0);
    const order = await ids(page, heatRows);
    await page.reload();
    assert.deepEqual(await ids(page, heatRows), order, "Column ordering should survive reload");

    // A brush changes the visible cohort in both tables while preserving pinned teams.
    await page.locator("#ws-brush").click();
    const overlay = await page.locator("#ws-map .brush .overlay").boundingBox();
    const center = await mapTeam(page, "ECU").locator("circle").first().boundingBox();
    const targetX = center.x + center.width/2, targetY = center.y + center.height/2;
    await page.mouse.move(Math.max(overlay.x + 1, targetX - 8), Math.max(overlay.y + 1, targetY - 8));
    await page.mouse.down();
    await page.mouse.move(Math.min(overlay.x + overlay.width - 1, targetX + 8), Math.min(overlay.y + overlay.height - 1, targetY + 8), {steps:5});
    await page.mouse.up();
    const brushedIds = await ids(page, heatRows);
    assert.ok(brushedIds.includes("ECU") && brushedIds.length < 48, "Brush should restrict heatmap");
    assert.deepEqual((await ids(page, "#ws-teams tbody tr[data-team]:not(.is-out)")).sort(), brushedIds.sort());
    assert.equal(params(page).get("compare"), "USA");
    await page.locator("[data-clear='cohort']").click();
    assert.equal(await page.locator(heatRows).count(), 48);

    // Export orders filtered teams as displayed and retains canonical data values in every locale.
    await page.locator("#ws-group").selectOption(group);
    await page.locator("#ws-teams [data-sort='gd']").click();
    await page.locator("#language-select").selectOption("zh-Hant");
    const expectedCsv = await page.evaluate(() => [...document.querySelectorAll("#ws-teams tbody tr[data-team]:not(.is-out)")].map(row => {
      const team = App.team[row.dataset.team];
      return [team.name, App.arch[team.archetype].name.replace(/^The /, "")];
    }));
    assert.ok(expectedCsv.length > 1 && expectedCsv.length < 48);
    const downloadEvent = page.waitForEvent("download");
    await page.locator("#ws-export").click();
    const download = await downloadEvent;
    const csv = fs.readFileSync(await download.path(), "utf8").trim().split("\n");
    const keys = csv.slice(1).map(line => line.slice(1,-1).split('","').slice(0,2));
    assert.deepEqual(keys, expectedCsv);
    await page.locator("#language-select").selectOption("en");
    await page.locator("#ws-group").selectOption("");

    await page.locator("#ws-scope [data-v='group']").click();
    assert.equal(await page.locator("#ws-matches [data-match]").count(), 6);
    assert.match(await page.locator("#ws-sim-reference").innerText(), /1128 team pairs in scope at least this far apart/);
    const references = await page.locator("#ws-outcomes line title").allTextContents();
    const groupAvg = await page.evaluate(() => {
      const values = Object.values(App.tm).filter(r => r.stage === "Group").map(r => r.xg).filter(Number.isFinite);
      return (values.reduce((a,b) => a+b,0)/values.length).toFixed(2);
    });
    assert.ok(references.some(label => /(?:scope|group)/i.test(label) && label.includes(groupAvg)), "Outcome reference should identify scoped mean xG: " + references);
    await page.locator("#ws-view [data-v='custom']").click();
    await page.locator("#ws-x").selectOption("dial0");
    await page.locator("#ws-y").selectOption("dial9");
    await checkCustomUnits(page, "ECU");

    const evidence = page.locator('#ws-matches tr[data-match="2026-M034-ECU-CUW_ECU"]');
    await evidence.click();
    assert.equal(await evidence.getAttribute("aria-selected"), "true");
    await checkCustomUnits(page, "ECU", "2026-M034-ECU-CUW_ECU");
    const matchLink = page.locator('#ws-match-actions a[href^="#/lab/"]');
    const matchUrl = await matchLink.getAttribute("href");
    assert.match(matchUrl, /2026-M034-ECU-CUW/);
    await page.locator("[data-panel='F']").scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,"workspace-ecuador-match.png")});
    const retained = page.url();
    await matchLink.click();
    await page.waitForURL(/#\/lab\/2026-M034-ECU-CUW/);
    await page.goBack();
    assert.equal(page.url(), retained);
    assert.equal(await evidence.getAttribute("aria-selected"), "true");
    await page.locator("#ws-view [data-v='pca']").click();
    await page.evaluate(() => window.scrollTo({top:0, left:0, behavior:"instant"}));
    await page.screenshot({path:path.join(output,"workspace-ecuador-usa.png")});
    await page.locator("#ws-reset").click();
    assert.equal(params(page).has("team"), false);
    assert.equal(params(page).has("compare"), false);
    assert.equal(await page.locator("#ws-matches [data-match]:visible").count(), 0);
    // Trigger reset in the same browser task as the input, before the search debounce can commit.
    await page.evaluate(() => {
      const input = document.querySelector("#ws-search");
      input.focus();
      input.value = "Ecuador";
      input.dispatchEvent(new Event("input", {bubbles:true}));
      const reset = document.querySelector("#ws-reset");
      reset.focus();
      reset.click();
    });
    await page.waitForTimeout(250);
    assert.equal(params(page).has("search"), false);
    assert.equal(await page.locator("#ws-search").inputValue(), "");
    assert.equal(await page.locator(heatRows).count(), 48);

    await page.goto(base + "/#/styles?team=IRQ&scope=knockout&heatSort=near");
    assert.equal(await page.locator(heatRows).count(), 32);
    assert.equal(await page.locator("#ws-twins [data-team]").count(), 0);
    assert.match(await page.locator("#ws-summary").innerText(), /no matches/i);
    await page.locator("#ws-search").fill("no such team");
    await page.waitForFunction(() => !document.querySelector("#ws-heat tbody tr[data-team]"));
    assert.equal(await page.locator("#ws-map .mark").count(), 32);
    assert.deepEqual(errors, []);
    console.log("Workspace browser checks passed for overview, A/B selection, linked hover, indicator changes, sorting, group/brush filtering, raw units, scope references, match evidence, navigation and three viewport sizes.");
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
