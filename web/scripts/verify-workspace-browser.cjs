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

const modeTab = (page, mode) => page.locator(`#ws-modes button[data-mode="${mode}"]`);
const openTool = (page, tool) => page.locator(`#ws-utilities [data-tool="${tool}"]`).click();
const closeTool = page => page.locator("#ws-tools-dialog .ws-dialog-close").click();

async function overview(page) {
  await page.goto(base + "/");
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
  assert.equal(await page.locator("[data-panel='E']").isVisible(), false);
  assert.equal(await page.locator("#ws-color").inputValue(), "dial0");
  assert.equal(await page.locator(".ws-primary .hm-scale:visible").count(), 1, "Both views share a quantitative scale");
  await checkHeatOrder(page, 0);
  await checkIndicatorFills(page, 0);
}

async function checkHeaderNavigation(page) {
  const controls = page.locator(".topbar, .topbar .brand, .topbar [data-tab], .language-control .sel-btn");
  const bounds = () => controls.evaluateAll(nodes => nodes.map(node => {
    const {x, y, width, height} = node.getBoundingClientRect();
    return [node.dataset.tab || node.className, ...[x, y, width, height].map(Math.round)];
  }));
  const workspaceBounds = await bounds();
  for (const tab of ["matches", "lab", "method", "styles"]) {
    const link = `[data-tab="${tab}"]`;
    await page.locator(link).click();
    await page.locator(link + ".on").waitFor();
    assert.deepEqual(await bounds(), workspaceBounds, "Top navigation moved on " + tab);
  }
}

// The heatmap and map should paint the same team with exactly the same colour.
async function checkIndicatorFills(page, index) {
  const wrongTeams = await page.locator(heatRows).evaluateAll((rows, i) => rows.filter(row => {
    const cell = row.querySelector('td[data-i="' + i + '"]');
    const point = document.querySelector('#ws-map .mark[data-team="' + row.dataset.team + '"] circle:not(.halo)');
    return getComputedStyle(point).fill !== getComputedStyle(cell).backgroundColor;
  }).map(row => row.dataset.team), index);
  assert.deepEqual(wrongTeams, [], "Map colours should match heatmap column " + index);
}

async function checkHeatOrder(page, index) {
  assert.equal(await page.locator("#ws-heat-sort").inputValue(), "dial" + index);
  const column = await page.locator(heatRows + ' td[data-i="' + index + '"]').evaluateAll(cells => cells.map(c => Number(c.dataset.z)));
  assert.deepEqual(column, [...column].sort((a,b) => b-a));
  assert.ok(column[0] > 0 && column.at(-1) < 0);
}

async function checkLinkedOrdering(page) {
  // Explicit group and outcome orders from shared links remain available independently of colour.
  await page.goto(base + "/#/styles?color=dial2&heatSort=group");
  assert.equal(await page.locator("#ws-heat-sort").inputValue(), "group");
  await checkIndicatorFills(page, 2);
  await page.locator("#ws-heat-sort").selectOption("gd");
  assert.equal(await page.locator("#ws-color").inputValue(), "dial2");
  await page.reload();
  assert.equal(await page.locator("#ws-heat-sort").inputValue(), "gd");
  await checkIndicatorFills(page, 2);
  const positions = () => page.locator(mapMarks).evaluateAll(marks => marks.map(m => [m.dataset.team, m.getAttribute("transform")]));
  const original = await positions();
  await page.locator("#ws-color").selectOption("dial5");
  await checkHeatOrder(page, 5);
  await checkIndicatorFills(page, 5);
  await page.locator("#ws-heat-sort").selectOption("dial7");
  await checkHeatOrder(page, 7);
  assert.equal(await page.locator("#ws-color").inputValue(), "dial7");
  await checkIndicatorFills(page, 7);
  await page.locator("#ws-heat thead [data-order='dial8']").click();
  await page.locator("#ws-C-title").hover();
  assert.equal(await page.locator("#ws-color").inputValue(), "dial8");
  await checkHeatOrder(page, 8);
  await checkIndicatorFills(page, 8);
  assert.deepEqual(await positions(), original, "Changing the observed indicator keeps PCA positions fixed");
  await page.reload();
  assert.equal(await page.locator("#ws-color").inputValue(), "dial8");
  await checkHeatOrder(page, 8);
}

async function checkIndicatorPreview(page) {
  const header = page.locator("#ws-heat th[data-i='8'] button");
  const ranks = await ids(page, "#ws-twins [data-team]");
  const rowOrder = await ids(page, heatRows);
  const url = page.url();
  const marks = page.locator(mapMarks);
  const positions = () => marks.evaluateAll(nodes => nodes.map(node => [node.dataset.team, node.getAttribute("transform")]));
  const fills = () => marks.evaluateAll(nodes => nodes.map(node => getComputedStyle(node.querySelector("circle:not(.halo)")).fill));
  const originalPositions = await positions(), originalFills = await fills();

  await header.hover();
  await checkIndicatorFills(page, 8);
  assert.deepEqual(await ids(page, heatRows), rowOrder, "Hovering an indicator should not reorder the heatmap");
  assert.deepEqual(await positions(), originalPositions, "Inspecting an indicator must keep points in place");
  assert.deepEqual(await ids(page, "#ws-twins [data-team]"), ranks);
  await page.locator(".ws-primary").screenshot({path:path.join(output, "workspace-indicator-preview.png")});
  assert.equal(page.url(), url, "Inspecting a column must preserve the model, pins and URL");
  await page.locator("#ws-C-title").hover();
  assert.deepEqual(await fills(), originalFills, "Restore the chosen encoding on pointer exit");

  await page.locator("#ws-heat thead th[data-i='7'] button").focus();
  await page.keyboard.press("Tab");
  assert.equal(await header.evaluate(el => el === document.activeElement), true);
  await checkIndicatorFills(page, 8);
  await page.locator("#ws-reset").focus();
  assert.deepEqual(await fills(), originalFills, "Restore the chosen encoding on keyboard focus exit");
}

async function checkTeamRanks(page) {
  await page.goto(base + "/#/styles?team=GER&compare=URU&color=group");
  await page.locator("#ws-heat tbody tr[data-team]").first().waitFor();
  await modeTab(page, "compare").click();
  await page.locator("#ws-profile .lens-row").first().waitFor();
  await modeTab(page, "explore").click();
  await checkIndicatorPreview(page);
  const readout = page.locator("#ws-readout");
  const url = page.url();
  const expectedTwins = (await ids(page, "#ws-twins .ws-twin")).slice(0, 5).sort();
  assert.deepEqual(await page.locator("#ws-map .relationship.is-near").evaluateAll(links => links.map(l => l.dataset.to).sort()), expectedTwins);
  assert.deepEqual((await ids(page, heatRows + ":has(.hm-near-rank)")).sort(), expectedTwins);
  assert.equal(await page.locator("#ws-map .relationship[data-to='URU'].is-pair").count(), 1);
  await heatTeam(page, "GER").locator("button").evaluate(el => el.focus());
  await page.locator(".hm-pins button[data-locate='URU']").click();
  assert.ok(await heatTeam(page, "URU").locator("button").evaluate(el => el === document.activeElement));
  const profileBeforeHover = await page.locator("#ws-profile .lens-row").first().elementHandle();
  await mapTeam(page, "FRA").locator("circle").last().hover();
  const france = await readout.innerText();
  assert.match(france, /PCA distance rank\s*#1\b/i);
  assert.match(france, /Style similarity rank\s*#8\b/i);
  assert.match(france, /crosses/i);
  const gdGap = await page.evaluate(() => {
    const A = App.analysis;
    return App.signed(A.summary(A.rows("GER", "all")).gd - A.summary(A.rows("FRA", "all")).gd, 2);
  });
  assert.ok(france.includes(gdGap) && france.includes("GER − FRA"), "Preview gives the signed A-minus-focus goal gap per match");
  assert.ok(await profileBeforeHover.evaluate(node => node.isConnected), "Moving across teams should only update the profile overlay");
  const gap = page.locator("#ws-heat tr.is-compared td.is-gap");
  assert.deepEqual(await gap.evaluateAll(cells => cells.map(c => [c.parentElement.dataset.team, c.dataset.i]).sort()),
    [["FRA","5"],["GER","5"]], "Crosses has the largest standardized gap for this pair");
  assert.equal(page.url(), url, "Hovering France must keep Uruguay pinned as B");
  await page.locator(".ws-primary").screenshot({path:path.join(output, "workspace-pca-rank.png")});
  await mapTeam(page, "URU").focus();
  assert.match(await readout.innerText(), /Style similarity rank\s*#1\b/i);
  await page.locator("#ws-view [data-v='custom']").click();
  await mapTeam(page, "FRA").focus();
  const custom = await readout.innerText();
  assert.doesNotMatch(custom, /PCA/i, "Only PCA mode can identify a PCA neighbour");
  assert.match(custom, /Style similarity rank\s*#8\b/i);
  await openTool(page, "similar");
  await page.locator("#ws-dials input[data-i='5']").uncheck();
  await closeTool(page);
  await mapTeam(page, "FRA").focus();
  assert.match(await readout.innerText(), /Style similarity rank\s*#6\b/i);
  assert.deepEqual(await gap.evaluateAll(cells => cells.map(c => c.dataset.i)), ["8","8"],
    "With crosses omitted the largest selected difference is press after loss");
}

async function checkMapRefit(page) {
  await page.goto(base + "/#/styles?team=GER", {waitUntil:"domcontentloaded"});
  await mapTeam(page, "GER").waitFor();
  await openTool(page, "similar");
  for (const preference of ["reduce", "no-preference"]) {
    await page.emulateMedia({reducedMotion:preference});
    const result = await page.evaluate(() => {
      const svg = () => document.querySelector("#ws-map svg");
      const position = () => svg().querySelector('.mark[data-team="GER"]').getAttribute("transform");
      const changeIndicators = () => document.querySelector('#ws-dials input[data-i="5"]').click();
      const before = position(), old = svg();
      changeIndicators();
      const refit = svg(), after = position(), animation = getComputedStyle(refit).animationName;
      const frames = refit.getAnimations().flatMap(a => a.effect.getKeyframes());
      changeIndicators();
      return { before, after, restored:position(), oldDetached:!old.isConnected && !refit.isConnected,
        animation, properties:frames.flatMap(frame => Object.keys(frame)) };
    });
    assert.notEqual(result.before, result.after, "The selected indicators should refit PCA");
    assert.equal(result.before, result.restored, "Rapid refits restore the original positions");
    assert.ok(result.oldDetached, "Older projections should never animate over the current one");
    assert.equal(result.animation, preference === "reduce" ? "none" : "ws-reveal");
    if (preference === "no-preference") {
      assert.ok(result.properties.includes("opacity"));
      assert.ok(!result.properties.includes("transform"), "A refit must not imply movement in a fixed plane");
    }
  }
  await closeTool(page);
}

async function checkTouchIndicator(page) {
  const picker = page.locator("#ws-color");
  await picker.selectOption("dial8");
  assert.equal(params(page).get("color"), "dial8");
  await checkIndicatorFills(page, 8);
  await checkHeatOrder(page, 8);
  await page.reload();
  assert.equal(await picker.inputValue(), "dial8");
  await checkIndicatorFills(page, 8);
  await picker.selectOption("state");
}

async function checkPairExplorer(page) {
  await page.goto(base + "/#/styles");
  await page.locator("#ws-view [data-v='pairs']").click();
  const pointSelector = "#ws-pairs .wp-chart circle[data-pair]";
  const points = page.locator(pointSelector);
  assert.equal(await points.count(), 1128);
  assert.equal(await page.locator(".ws-primary .hm-scale:visible").count(), 1, "Pair mode still explains heatmap colours");
  assert.equal(new Set(await points.evaluateAll(nodes => nodes.map(node => node.dataset.pair))).size, 1128);
  const guide = page.locator("#ws-pairs .wp-guide-button");
  const qualifying = await points.evaluateAll(nodes => nodes.filter(node => Number(node.dataset.sim) >= 90 && Number(node.dataset.gap) >= 1).map(node => node.dataset.pair).sort());
  assert.equal(qualifying.length, 53, "Full-tournament guide has 53 observed pairs");
  await guide.click();
  const shown = () => page.locator(pointSelector + ":not(.is-out)").evaluateAll(nodes => nodes.map(node => node.dataset.pair).sort());
  assert.deepEqual(await shown(), qualifying);
  assert.equal(await guide.getAttribute("aria-pressed"), "true");
  assert.equal(params(page).has("team"), false);
  assert.equal(await page.locator(heatRows).count(), 48);
  await page.reload();
  await guide.waitFor();
  assert.deepEqual(await shown(), qualifying, "Guide is restored by the same shareable pair region");
  await guide.press("Enter");
  assert.equal(await points.count(), 1128);
  assert.equal(await guide.getAttribute("aria-pressed"), "false");
  assert.equal(params(page).has("pairRegion"), false);
  await checkPairFilters(page, points);

  const pair = page.locator(pointSelector + "[data-pair='ECU-USA']");
  assert.ok(Math.abs(Number(await pair.getAttribute("data-gap")) - 1.1) < 1e-8);
  assert.ok(Math.abs(Number(await pair.getAttribute("data-sim")) - 99.73404255319149) < 1e-8);
  await pair.scrollIntoViewIfNeeded();
  // Find a blank starting point to the left of this pair, as nearby pairs can overlap.
  const rect = await pair.evaluate(node => {
    const chart = node.ownerSVGElement, overlay = chart.querySelector(".brush .overlay");
    const hit = node.getBoundingClientRect();
    const x = hit.x + hit.width / 2, y = hit.y + hit.height / 2;
    for (let dx = 10; dx <= 60; dx += 5) for (let dy = 6; dy <= 30; dy += 3) {
      const start = {x:x - dx, y:y - dy};
      if (document.elementFromPoint(start.x, start.y) === overlay) {
        return {start, end:{x:x + 4, y:y + 4}};
      }
    }
    throw new Error("Could not start the pair brush on blank space");
  });
  await mouseDrag(page, rect.start, rect.end);
  const included = await page.locator(pointSelector + ":not(.is-out)").count();
  assert.ok(included > 0 && included < 1128, "The pair brush should narrow the shortlist");
  assert.equal(await page.locator(heatRows).count(), 48, "A pair region must preserve the team cohort");
  assert.equal(params(page).has("team"), false, "Brushing pairs leaves the comparison open until a pair is chosen");
  assert.ok(params(page).get("pairRegion"), "The pair region should be shareable");
  await page.reload();
  assert.equal(await page.locator(pointSelector + ":not(.is-out)").count(), included);
  const result = page.locator("#ws-pairs .wp-result[data-pair='ECU-USA']");
  for (let seen = 0; !(await result.count()) && seen < included; seen += 8) {
    await page.locator("#ws-pairs .wp-next").click();
  }
  await page.locator("#ws-pairs").screenshot({path:path.join(output, "workspace-pair-region.png")});
  await result.focus();
  await result.press("Enter");
  assert.equal(params(page).get("team"), "ECU");
  assert.equal(params(page).get("compare"), "USA");
  assert.equal(await page.locator(mapMarks).count(), 48);
  await page.goBack();
  assert.equal(await page.locator(pointSelector + ":not(.is-out)").count(), included);
  await page.locator("#ws-clear-pair-region").click();
  assert.equal(await page.locator(pointSelector + ":not(.is-out)").count(), 1128);
  await pair.click();
  assert.equal(params(page).get("team"), "ECU");
  assert.equal(params(page).get("compare"), "USA");
}

async function checkTouchPairs(page) {
  await page.locator("#ws-view [data-v='pairs']").tap();
  const first = page.locator("#ws-pairs .wp-result[data-pair]").first();
  const ids = (await first.getAttribute("data-pair")).split("-");
  const priorA = params(page).get("team");
  if (ids[1] === priorA) ids.reverse();
  await first.tap();
  assert.equal(params(page).get("team"), ids[0]);
  assert.equal(params(page).get("compare"), ids[1]);
  assert.ok(await page.locator("#ws-map").isVisible());
}

async function checkPairFilters(page, points) {
  const group = await page.evaluate(() => App.team.ECU.archetype);
  await page.locator("#ws-group").selectOption(group);
  const eligible = await ids(page, heatRows);
  assert.equal(await points.count(), eligible.length * (eligible.length - 1) / 2);
  await page.locator("#ws-group").selectOption("");

  const search = page.locator("#ws-search");
  await search.fill("Ecuador");
  await page.waitForFunction(() => document.querySelectorAll("#ws-heat tbody tr[data-team]").length === 1);
  assert.equal(await points.count(), 0, "One team has no unordered pairs");
  await search.fill("no such team");
  await page.waitForFunction(() => !document.querySelector("#ws-heat tbody tr[data-team]"));
  assert.equal(await points.count(), 0);
  await search.fill("");
  await page.waitForFunction(() => document.querySelectorAll("#ws-heat tbody tr[data-team]").length === 48);
  assert.equal(await points.count(), 1128);
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

// Work in viewport coordinates, just as a user dragging on the rendered plot would.
// Canada's isolated point makes a top strip a reproducible small cohort at each size.
async function topStrip(page) {
  await page.locator("#ws-map").scrollIntoViewIfNeeded();
  const plot = await page.locator("#ws-map .grid").boundingBox();
  const canada = await mapTeam(page, "CAN").locator("circle").last().boundingBox();
  const start = {x: plot.x + 3, y: plot.y + 3};
  const end = {x: plot.x + plot.width - 3, y: canada.y + canada.height / 2 + 3};
  assert.ok(end.y - start.y > 5, "Brush starts in blank plot space above Canada");
  return {start, end};
}

async function mouseDrag(page, start, end, beforeRelease) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, {steps:6});
  if (beforeRelease) await beforeRelease();
  await page.mouse.up();
}

async function checkEscape(page) {
  const cohort = ["TUR", "URU"];
  await page.goto(base + "/#/styles?cohort=TUR,URU&team=TUR&compare=URU&color=dial5&heatSort=dial5");
  const selected = page.url();
  const selectedRows = async () => (await ids(page, heatRows + ":visible")).sort();
  assert.deepEqual(await selectedRows(), cohort);

  const picker = page.locator("#ws-pick-a .sel-btn");
  await picker.click();
  await page.keyboard.press("Escape");
  assert.equal(await picker.getAttribute("aria-expanded"), "false");
  assert.equal(page.url(), selected, "Dismissing a team menu keeps the selection");

  const {start, end} = await topStrip(page);
  await mouseDrag(page, start, end, async () => {
    assert.ok((await selectedRows()).includes("CAN"), "A new drag previews teams outside the saved region");
    await page.keyboard.press("Escape");
    assert.deepEqual(await selectedRows(), cohort);
    await page.mouse.move(end.x - 8, end.y + 4);
  });
  assert.equal(page.url(), selected, "Releasing a cancelled drag keeps the saved region");
  assert.deepEqual(await selectedRows(), cohort);

  await page.keyboard.press("Escape");
  assert.equal(params(page).has("cohort"), false);
  assert.equal(await page.locator(heatRows).count(), 48);
  assert.equal(params(page).get("team"), "TUR");
  assert.equal(params(page).get("compare"), "URU");
  await page.keyboard.press("Escape");
  assert.equal(params(page).has("team") || params(page).has("compare"), false);
  assert.equal(await page.locator("#ws-color").inputValue(), "dial5");
  assert.equal(await page.locator("#ws-heat-sort").inputValue(), "dial5");
  const unselected = page.url();
  await page.keyboard.press("Escape");
  assert.equal(page.url(), unselected, "Escape with no selection preserves the view");

  await page.goto(base + "/#/styles?view=pairs&cohort=TUR,URU&pairRegion=95,100,5,6");
  await page.locator("#ws-clear-pair-region").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(params(page).has("pairRegion"), false);
  assert.equal(params(page).get("view"), "pairs");
  assert.deepEqual(await selectedRows(), cohort, "Clearing a pair region keeps the team cohort");
  assert.equal(await page.locator("#ws-pairs .wp-dot:not(.is-out)").count(), 1);
}

async function touchDrag(session, start, end, beforeRelease) {
  await session.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [start]});
  for (let i = 1; i <= 6; i++) {
    const x = start.x + (end.x - start.x) * i / 6;
    const y = start.y + (end.y - start.y) * i / 6;
    await session.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x, y}]});
  }
  if (beforeRelease) await beforeRelease();
  await session.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
}

async function checkTouchBrush(page) {
  const button = page.locator("#ws-brush");
  assert.ok(await button.isVisible(), "Touch users can explicitly arm a brush");
  assert.equal(await button.getAttribute("aria-pressed"), "false");
  const session = await page.context().newCDPSession(page);
  const {start} = await topStrip(page);
  const scrollY = await page.evaluate(() => window.scrollY);
  await touchDrag(session, {x:start.x, y:start.y + 85}, start);
  await page.waitForFunction(y => window.scrollY > y + 15, scrollY);
  assert.equal(params(page).has("cohort"), false, "A normal swipe scrolls without filtering");

  await button.tap();
  assert.equal(await button.getAttribute("aria-pressed"), "true");
  const strip = await topStrip(page);
  const beforeBrush = await page.evaluate(() => window.scrollY);
  await touchDrag(session, strip.start, strip.end, async () => {
    const whileBrushing = await page.evaluate(() => window.scrollY);
    assert.ok(Math.abs(whileBrushing - beforeBrush) < 2, "Armed brush keeps the plot stationary during the gesture");
  });
  await page.waitForFunction(() => new URLSearchParams(location.hash.split("?")[1]).has("cohort"));
  const cohort = await ids(page, heatRows);
  assert.ok(cohort.includes("CAN") && cohort.length < 48);
  assert.equal(await button.getAttribute("aria-pressed"), "false");
  assert.equal(params(page).get("team"), "ECU");
  assert.equal(params(page).get("compare"), "USA");
  await page.locator("[data-clear='cohort']").tap();
  assert.equal(await page.locator(heatRows).count(), 48);
  // A connected mouse still supports direct dragging on a touch-capable device.
  const hybridStrip = await topStrip(page);
  await mouseDrag(page, hybridStrip.start, hybridStrip.end);
  assert.deepEqual(await ids(page, heatRows), cohort);
  await session.detach();
}

async function run() {
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}, acceptDownloads:true});
    const phone = await browser.newPage({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
    const navigationTimeout = Number(process.env.STYLE_TWINS_NAV_TIMEOUT_MS);
    const errors = [];
    for (const client of [page, phone]) {
      if (navigationTimeout > 0 && Number.isFinite(navigationTimeout)) client.setDefaultNavigationTimeout(navigationTimeout);
      client.on("pageerror", err => errors.push(err.message));
      // The router catches rendering exceptions and reports them through console.error.
      client.on("console", message => {
        if (message.type() === "error" && /(?:Type|Syntax|Reference|Range)Error/.test(message.text())) errors.push(message.text());
      });
    }
    for (const [name, width, height, client] of [["desktop",1440,900,page],["laptop",1280,800,page],["phone",390,844,phone]]) {
      console.log("Viewport", name, width, height);
      await client.setViewportSize({width,height});
      await client.mouse.move(0, 0);
      await overview(client);
      await checkHeaderNavigation(client);
      await client.waitForFunction(() => {
        const host = document.querySelector("#ws-map");
        const box = host.querySelector("svg").viewBox.baseVal;
        return Math.abs(box.width - host.clientWidth) <= 1 && Math.abs(box.height - host.clientHeight) <= 1;
      });
      const layout = await client.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        map: document.querySelector("#ws-map").getBoundingClientRect().width,
        heat: document.querySelector("#ws-heat").getBoundingClientRect().width
      }));
      assert.ok(layout.pageWidth <= width + 1, name + " page overflow: " + layout.pageWidth);
      assert.ok(layout.map >= 200 && layout.heat >= 200, name + " chart width: " + JSON.stringify(layout));
      await client.screenshot({path:path.join(output,"workspace-" + name + ".png")});
      if (name === "phone") {
        await client.locator("#ws-heat").scrollIntoViewIfNeeded();
        await client.screenshot({path:path.join(output,"workspace-phone-heatmap.png")});
      }
      // Exercise the narrow/desktop scroll containers and team selection at every size.
      if (client === phone) await mapTeam(client, "ECU").locator("circle").last().tap();
      else await heatTeam(client, "ECU").locator("button").first().click();
      assert.equal(params(client).get("team"), "ECU");
      assert.equal(params(client).has("compare"), false);
      const nearest = client.locator("#ws-near-strip [data-team]");
      assert.equal(await nearest.first().getAttribute("data-team"), "USA");
      await modeTab(client, "compare").click();
      assert.ok(await client.locator("[data-panel='D']").isVisible());
      assert.equal(await client.locator("#ws-profile [data-team='ECU']").count(), 10);
      await modeTab(client, "explain").click();
      assert.ok(await client.locator("[data-panel='F']").isVisible());
      assert.equal(await client.locator("[data-panel='E']").isVisible(), false);
      await modeTab(client, "explore").click();
      await nearest.first().click();
      assert.equal(params(client).get("compare"), "USA");
      await modeTab(client, "explain").click();
      assert.equal(await client.locator("#ws-matches [data-match]:visible").count(), 9);
      await client.locator("#ws-evidence-view [data-v='outcomes']").click();
      assert.ok(await client.locator("[data-panel='E']").isVisible());
      await modeTab(client, "explore").click();
      if (client === phone) {
        await checkTouchIndicator(client);
        await checkTouchBrush(client);
        await client.locator("[data-clear='cohort']").tap();
        await checkTouchPairs(client);
      }
    }

    await page.setViewportSize({width:1440,height:900});
    await checkEscape(page);
    await checkLinkedOrdering(page);
    await checkPairExplorer(page);
    await checkTeamRanks(page);
    await checkMapRefit(page);
    await require("./verify-lens-browser.cjs")(page, base, output);
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
    await mapTeam(page, "ESP").locator(".team-fill").hover();
    assert.match(await page.locator("#ws-readout").innerText(), /Possession\s*57\.9%/);
    assert.match(await page.locator("#ws-heat-value").innerText(), /Possession\s*57\.9%/);
    await heatTeam(page, "ECU").locator("td[data-i]").first().hover();
    assert.match(await mapTeam(page, "ECU").getAttribute("class"), /is-hover/);
    assert.equal(page.url(), initialUrl, "Hover must be transient");
    assert.equal(await page.locator("#ws-brush").isVisible(), false, "Mouse selection requires no brush button");
    await page.locator("#ws-C-title").hover();
    assert.doesNotMatch(await mapTeam(page, "ECU").getAttribute("class"), /is-hover/);
    const region = await topStrip(page);
    await mouseDrag(page, region.start, region.end, async () => {
      const cohort = await ids(page, heatRows + ":visible");
      assert.ok(cohort.length > 0 && cohort.length < 48);
      assert.equal(Number(await page.locator('.xp-cohort-mark[data-game="1"]').getAttribute("data-count")), cohort.length,
        "uncommitted brush filters the trend's participating teams");
      assert.equal(page.url(), initialUrl);
    });
    await page.locator("[data-clear='cohort']").click();
    await mapTeam(page, "ECU").focus();
    assert.match(await heatTeam(page, "ECU").getAttribute("class"), /is-hover/);
    await mapTeam(page, "ECU").press("Enter");
    assert.equal(params(page).get("team"), "ECU");
    await mapTeam(page, "USA").locator("circle").last().click();
    assert.equal(params(page).get("compare"), "USA");

    await page.locator("#ws-swap").click();
    assert.equal(params(page).get("team"), "USA");
    assert.equal(params(page).get("compare"), "ECU");
    await page.locator("#ws-swap").click();
    await page.locator("#ws-pick-b .sel-btn").click();
    await page.locator("#ws-pick-b .sel-opt").filter({hasText:"Clear comparison"}).click();
    assert.equal(params(page).get("team"), "ECU");
    assert.equal(params(page).has("compare"), false);
    await modeTab(page, "compare").click();
    assert.equal(await page.locator("#ws-profile [data-team='ECU']:visible").count(), 10);
    await modeTab(page, "explain").click();
    assert.equal(await page.locator("[data-panel='E']").isVisible(), false);
    assert.equal(await page.locator("#ws-matches tr[data-match]:visible").count(), 4);
    await modeTab(page, "explore").click();
    await page.locator("#ws-pick-b .sel-btn").click();
    await page.locator("#ws-pick-b input").fill("USA");
    await page.locator("#ws-pick-b .sel-opt").click();
    assert.equal(params(page).get("compare"), "USA");

    // The view's nearest-team order must use the selected dimensions and scope.
    await page.locator("#ws-heat-sort").selectOption("near");
    assert.deepEqual((await ids(page, heatRows)).slice(0, 2), ["ECU","USA"]);
    await openTool(page, "similar");
    await page.locator("#ws-dials input[data-i='0']").uncheck();
    assert.equal(await page.locator("#ws-heat thead th[data-i='0']").getAttribute("data-model"), "out");
    const expected = await page.evaluate(() => {
      const dials = App.analysis.readDials(new URLSearchParams(location.hash.split("?")[1]));
      return App.analysis.twinTable(App.analysis.space(dials, "all")).near.ECU.map(n => n.id);
    });
    assert.deepEqual(await ids(page, heatRows), ["ECU",...expected]);
    assert.deepEqual((await ids(page, "#ws-twins [data-team]")).slice(0, 5), expected.slice(0, 5));
    await page.locator("#ws-dials-all").click();
    await closeTool(page);

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
    await checkHeatOrder(page, 0);
    assert.equal(await page.locator("#ws-color").inputValue(), "dial0");
    const order = await ids(page, heatRows);
    await page.reload();
    assert.deepEqual(await ids(page, heatRows), order, "Column ordering should survive reload");

    // A brush changes the visible cohort in both tables while preserving pinned teams.
    await page.locator("[data-goal-view=distribution]").click();
    const {start, end} = await topStrip(page);
    const beforeBrush = page.url();
    let preview;
    await mouseDrag(page, start, end, async () => {
      await page.waitForFunction(() => [...document.querySelectorAll("#ws-heat tbody tr[data-team]")].filter(row => row.getClientRects().length).length < 48);
      preview = await ids(page, heatRows + ":visible");
      assert.ok(preview.includes("CAN") && preview.length < 48, "Heatmap should show the subset while dragging");
      const plotted = await ids(page, ".xp-goals-mark:not(.is-out)");
      assert.deepEqual(plotted.sort(), [...preview].sort(), "outcome distribution follows the live brush");
      // The table is in a drawer. Its rows still update during the unfinished drag.
      assert.deepEqual((await ids(page, "#ws-teams tbody tr[data-team]:not(.is-out):not([hidden])")).sort(), [...preview].sort());
      assert.equal(await page.locator("#ws-teams tr[data-team='ECU'].is-out .ws-pinned-note:not([hidden])").count(), 1);
      assert.match(await page.locator("#ws-heat .hm-count").innerText(), new RegExp("^" + preview.length + "\\s*/\\s*48\\b"));
      assert.equal(page.url(), beforeBrush, "Drag previews should not add history entries");
      await page.screenshot({path:path.join(output,"workspace-live-brush.png")});
    });
    const brushedIds = await ids(page, heatRows);
    assert.deepEqual(brushedIds, preview, "Releasing the brush commits the preview");
    assert.ok(brushedIds.includes("CAN") && brushedIds.length < 48, "Brush should restrict heatmap");
    assert.deepEqual((await ids(page, "#ws-teams tbody tr[data-team]:not(.is-out)")).sort(), brushedIds.sort());
    assert.equal(params(page).get("team"), "ECU");
    assert.equal(params(page).get("compare"), "USA");
    await openTool(page, "table");
    assert.deepEqual((await ids(page, "#ws-teams tbody tr[data-team]:not(.is-out):visible")).sort(), [...preview].sort());
    assert.ok(await page.locator("#ws-teams tr[data-team='ECU'].is-out .ws-pinned-note").isVisible(), "A remains identifiable outside the committed region");
    await closeTool(page);
    const retainedCohort = page.url();
    const blank = (await topStrip(page)).start;
    await page.mouse.click(blank.x, blank.y);
    await mouseDrag(page, blank, {x:blank.x + 3, y:blank.y + 1});
    assert.equal(page.url(), retainedCohort, "A blank click or a slight movement preserves the current cohort");
    await mouseDrag(page, start, end);
    assert.deepEqual(await ids(page, heatRows), preview, "Reapplying the same region restores the committed rows");
    const plot = await page.locator("#ws-map .grid").boundingBox();
    const algeria = await mapTeam(page, "ALG").locator(".team-fill").boundingBox();
    const bottomLeft = {x:plot.x + 3, y:plot.y + plot.height - 3};
    const bottomRight = {x:plot.x + plot.width - 3, y:bottomLeft.y};
    await mouseDrag(page, bottomRight, {x:algeria.x - 3, y:algeria.y - 3}, async () => {
      assert.deepEqual(await ids(page, heatRows + ":visible"), ["ALG"], "A replacement brush can reach teams outside the initial region");
      assert.equal(page.url(), retainedCohort);
    });
    assert.deepEqual(await ids(page, heatRows), ["ALG"]);
    assert.equal(params(page).get("cohort"), "ALG");
    await mouseDrag(page, bottomLeft, {x:bottomLeft.x + 10, y:bottomLeft.y - 10}, async () => {
      assert.equal(await page.locator(heatRows + ":visible").count(), 0);
      assert.ok(await page.locator(".hm-empty").isVisible());
      assert.equal(params(page).get("cohort"), "ALG", "Empty preview must preserve the previous region until release");
    });
    assert.equal(await page.locator(heatRows).count(), 0);
    await page.reload();
    assert.equal(await page.locator(heatRows).count(), 0, "An empty region survives reload");
    await page.locator("[data-clear='cohort']").click();
    assert.equal(await page.locator(heatRows).count(), 48);

    // Export orders filtered teams as displayed and retains canonical data values in every locale.
    await page.locator("#ws-group").selectOption(group);
    await page.locator("#language-select").selectOption("zh-Hant");
    await openTool(page, "table");
    await page.locator("#ws-teams [data-sort='gd']").click();
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
    await closeTool(page);
    await page.locator("#language-select").selectOption("en");
    await page.locator("#ws-group").selectOption("");

    await page.locator("#ws-scope [data-v='group']").click();
    await modeTab(page, "compare").click();
    assert.match(await page.locator("#ws-sim-reference").innerText(), /1128 team pairs in scope at least this far apart/);
    await modeTab(page, "explain").click();
    await page.locator("#ws-evidence-view [data-v='matches']").click();
    assert.equal(await page.locator("#ws-matches [data-match]:visible").count(), 6);
    await page.locator("#ws-evidence-view [data-v='outcomes']").click();
    const references = await page.locator("#ws-outcomes line title").allTextContents();
    const groupAvg = await page.evaluate(() => {
      const values = Object.values(App.tm).filter(r => r.stage === "Group").map(r => r.xg).filter(Number.isFinite);
      return (values.reduce((a,b) => a+b,0)/values.length).toFixed(2);
    });
    assert.ok(references.some(label => /(?:scope|group)/i.test(label) && label.includes(groupAvg)), "Outcome reference should identify scoped mean xG: " + references);
    await modeTab(page, "explore").click();
    await page.locator("#ws-view [data-v='custom']").click();
    await page.locator("#ws-x").selectOption("dial0");
    await page.locator("#ws-y").selectOption("dial9");
    await checkCustomUnits(page, "ECU");

    await modeTab(page, "explain").click();
    await page.locator("#ws-evidence-view [data-v='matches']").click();
    const evidence = page.locator('#ws-matches tr[data-match="2026-M034-ECU-CUW_ECU"]');
    await evidence.click();
    assert.equal(await evidence.getAttribute("aria-selected"), "true");
    await modeTab(page, "explore").click();
    await checkCustomUnits(page, "ECU", "2026-M034-ECU-CUW_ECU");
    await modeTab(page, "explain").click();
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
    await modeTab(page, "explore").click();
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
    await require("./check-waterfall.cjs")(page, base, output);
    assert.deepEqual(errors, []);
    console.log("Workspace browser checks passed for overview, A/B selection, linked indicator colours, team-pair exploration, PCA and similarity ranks, indicator changes, sorting, group filters, direct mouse brushing, touch scrolling and brushing, raw units, scope references, match evidence, navigation and three viewport sizes.");
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
