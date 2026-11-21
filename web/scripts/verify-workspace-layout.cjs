// Serve web/ locally and run with Playwright and Chromium. Measurements use CSS pixels.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const base = (process.env.STYLE_TWINS_BASE_URL || "http://127.0.0.1:8642").replace(/\/$/, "");
const output = process.env.STYLE_TWINS_QA_OUTPUT || path.join(os.tmpdir(), "style-twins-viewport-qa");
const tolerance = 2;
const tab = mode => `#ws-modes [data-mode="${mode}"]`;
const team = (page, id) => page.locator(`#ws-map .mark[data-team="${id}"]`);
const measurements = [];

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function ready(page, mode) {
  await page.locator(`.ws[data-mode="${mode}"]`).waitFor();
  assert.equal(await page.locator(tab(mode)).getAttribute("aria-selected"), "true");
  await settle(page);
}

async function gotoMode(page, mode) {
  await page.locator(tab(mode)).click();
  await ready(page, mode);
}

// Check every clipping ancestor as well as the viewport. A dropdown can be within
// the viewport numerically while being cut off by a chart panel with overflow:hidden.
async function fullyVisible(node, name) {
  const issue = await node.evaluate((el, eps) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return "has no area";
    const outside = (lo, hi, min, max) => lo < min - eps || hi > max + eps;
    if (outside(r.left, r.right, 0, innerWidth) || outside(r.top, r.bottom, 0, innerHeight))
      return `viewport ${innerWidth}×${innerHeight} versus ${JSON.stringify(r.toJSON())}`;
    // Native dialogs are placed on the top layer.
    const dialog = el.closest("dialog[open]");
    for (let parent = el.parentElement; parent && parent !== dialog?.parentElement; parent = parent.parentElement) {
      const css = getComputedStyle(parent), rect = parent.getBoundingClientRect();
      if (css.overflowX !== "visible" && outside(r.left, r.right, rect.left, rect.right))
        return "clipped horizontally by " + (parent.id || parent.className);
      if (css.overflowY !== "visible" && outside(r.top, r.bottom, rect.top, rect.bottom))
        return "clipped vertically by " + (parent.id || parent.className);
    }
    return "";
  }, tolerance);
  assert.ok(!issue, `${name} ${issue}`);
}

async function viewport(page, stage, mobile = false) {
  const m = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    docWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight,
    pageY: window.scrollY, mode: document.querySelector(".ws").dataset.mode
  }));
  assert.ok(m.docWidth <= m.width + tolerance, `${stage} page overflow ${JSON.stringify(m)}`);
  if (!mobile) {
    assert.ok(m.docHeight <= m.height + tolerance && m.pageY <= tolerance, `${stage} page scroll ${JSON.stringify(m)}`);
    const keepOnScreen = [".topbar", ".ws-context", "#ws-pick-a .sel-btn", "#ws-pick-b .sel-btn", "#ws-modes"];
    await Promise.all(keepOnScreen.map(s => fullyVisible(page.locator(s), stage + " " + s)));
  }
  measurements.push({stage, ...m});
}

async function capture(page, name) {
  await settle(page);
  await page.screenshot({path: path.join(output, name + ".png"), animations: "disabled"});
}

async function svgBox(page, selector) {
  const svg = page.locator(selector);
  await fullyVisible(svg, selector);
  const geometry = await svg.evaluate(el => {
    const box = el.getBoundingClientRect(), view = el.viewBox.baseVal;
    return [view.width, view.height, box.width, box.height];
  });
  assert.ok(Math.abs(geometry[0] - geometry[2]) <= tolerance && Math.abs(geometry[1] - geometry[3]) <= tolerance,
    `${selector} stale SVG viewBox ${geometry}`);
  assert.ok(geometry[2] >= 200 && geometry[3] >= 100, `${selector} has no usable plot area ${geometry}`);
}

async function checkExplore(page) {
  await svgBox(page, "#ws-map svg");
  const text = await page.locator("#ws-map .axis text").all();
  await Promise.all(text.map(label => fullyVisible(label, "map axis label")));
  const labels = ["#ws-style-preview", "#ws-outcome-preview", ".xp-style-row:last-child", ".xp-goals-readout", "#ws-view", "#ws-legend", "#ws-projection", "#ws-readout", ".hm-tools", ".hm-readout"];
  await Promise.all(labels.map(s => fullyVisible(page.locator(s), s)));
  const matrix = page.locator(".hm-scroll");
  const extent = await matrix.evaluate(el => [el.clientHeight, el.scrollHeight]);
  assert.ok(extent[0] >= 100, "heatmap must show multiple rows and its headings");
  if (extent[1] > extent[0]) {
    await matrix.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await fullyVisible(page.locator("#ws-heat tbody tr[data-team] .hm-team").last(), "last heatmap team");
    await matrix.evaluate(el => { el.scrollTop = 0; });
  }
}

async function checkDrawer(page, tool) {
  const trigger = page.locator(`#ws-utilities [data-tool="${tool}"]`);
  await trigger.click();
  const dialog = page.locator("#ws-tools-dialog[open]");
  await fullyVisible(dialog, tool + " dialog");
  await fullyVisible(dialog.locator(".ws-dialog-close"), "close dialog");
  if (tool === "table") {
    await fullyVisible(dialog.locator("#ws-export"), "CSV export");
    const last = dialog.locator("#ws-teams tr[data-team]").last();
    await last.scrollIntoViewIfNeeded();
    await fullyVisible(last, "last team table row");
  } else {
    await fullyVisible(dialog.locator("#ws-dials label").last(), "last similarity indicator");
  }
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0);
  assert.ok(await trigger.evaluate(el => el === document.activeElement), "restore focus after closing " + tool);
}

async function popupOptions(page, id) {
  const picker = page.locator(id + " + .sel-enhanced");
  await picker.locator(".sel-btn").click();
  await fullyVisible(picker.locator(".sel-pop"), id + " popover");
  const last = picker.locator("[role=option]").last();
  await last.scrollIntoViewIfNeeded();
  await fullyVisible(last, id + " last option");
  assert.ok(await last.evaluate(el => {
    const {x,y,width,height} = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(x + width/2, y + height/2));
  }), id + " last option covered by another element");
  await page.keyboard.press("Escape");
}

async function modeCost(page) {
  await page.evaluate(() => {
    const saved = [[App.analysis, "space"], [App.analysis, "twinTable"], [App, "pca2"]].map(([obj,key]) => {
      const original = obj[key], calls = [];
      obj[key] = function (...args) {
        calls.push(key);
        return original.apply(this, args);
      };
      return {obj, key, original, calls};
    });
    window.finishModeProbe = () => {
      for (const {obj, key, original} of saved) obj[key] = original;
      delete window.finishModeProbe;
      return saved.flatMap(method => method.calls);
    };
  });
  let calls;
  try {
    await gotoMode(page, "compare");
    await gotoMode(page, "explain");
    await gotoMode(page, "explore");
  } finally {
    calls = await page.evaluate(() => window.finishModeProbe());
  }
  assert.deepEqual(calls, [], "pure mode switches must reuse the current PCA, team vectors and ranks");
}

async function desktop(page, width, height) {
  // Resize the already-mounted application as well as testing fresh shared URLs.
  await page.setViewportSize({width, height});
  await page.goto(base + "/#/styles", {waitUntil: "domcontentloaded"});
  await ready(page, "explore");
  assert.equal(await page.locator("#ws-map .mark").count(), 48);
  await viewport(page, "all teams");
  await checkExplore(page);
  if (width === 1920 || width === 1440) await capture(page, `explore-${width}x${height}`);

  await gotoMode(page, "compare");
  await viewport(page, "empty compare");
  await gotoMode(page, "explain");
  await viewport(page, "empty explain");
  await gotoMode(page, "explore");
  await team(page, "ECU").press("Enter");
  await settle(page);
  await viewport(page, "one team");
  await gotoMode(page, "explain");
  assert.equal(await page.locator("#ws-matches tr[data-match]:visible").count(), 4);
  assert.ok(await page.locator("#ws-evidence-view [data-v=outcomes]").isDisabled());
  await viewport(page, "one team's match evidence");
  await gotoMode(page, "explore");
  await team(page, "USA").press("Enter");
  await settle(page);
  await viewport(page, "two teams");
  await checkExplore(page);
  if (width === 1366) {
    await capture(page, "laptop-1366x768");
    await modeCost(page);
    await popupOptions(page, "#ws-heat-sort");
    await page.locator("#ws-view [data-v=custom]").click();
    await popupOptions(page, "#ws-x");
    await popupOptions(page, "#ws-y");
    await page.locator("#ws-view [data-v=pca]").click();
  }

  const picker = page.locator("#ws-pick-b");
  await picker.locator(".sel-btn").click();
  await fullyVisible(picker.locator(".sel-pop"), "Team B listbox");
  await picker.locator("input").press("Escape");
  const ranges = page.locator(".ws-range-filters");
  await ranges.locator("summary").click();
  await fullyVisible(ranges.locator("summary + div"), "outcome range popover");
  await ranges.locator("summary").click();
  await checkDrawer(page, "table");
  await checkDrawer(page, "similar");

  await gotoMode(page, "compare");
  await page.locator("#ws-lens [data-v=difference]").click();
  await page.locator("#ws-order [data-v=gap]").click();
  await settle(page);
  await viewport(page, "difference lens");
  assert.equal(await page.locator(".lens-row").count(), 10);
  for (const s of ["#ws-lens", "#ws-order", ".lens-scale", ".lens-rows", ".lens-readout"])
    await fullyVisible(page.locator(s), s);
  if (width === 1440) await capture(page, "compare-1440x900");

  await gotoMode(page, "explain");
  const waterfall = page.locator("#ws-waterfall");
  const disclosure = waterfall.locator(".wf-records");
  if (await disclosure.evaluate(el => el.open)) await disclosure.locator("summary").click();
  await waterfall.locator('[data-step="c_finish"]').click();
  await viewport(page, "outcome evidence");
  for (const s of [".wf-head", ".wf-colheads", ".wf-row[data-step=gd]", ".wf-ticks", ".wf-detail", ".wf-note"])
    await fullyVisible(waterfall.locator(s), s);
  assert.equal(await page.locator("#ws-matches tr[data-match]").count(), 9);
  if (width === 1440) await capture(page, "explain-1440x900");
  await waterfall.locator(".wf-records summary").click();
  const lastMatch = waterfall.locator("[data-record]").last();
  const key = await lastMatch.getAttribute("data-record");
  await lastMatch.click();
  assert.equal(await page.locator(`#ws-matches tr[data-match="${key}"]`).getAttribute("aria-selected"), "true");
  await viewport(page, "expanded contribution records");
  await page.locator("#ws-evidence-view [data-v=outcomes]").click();
  await settle(page);
  await svgBox(page, "#ws-outcomes svg");
  await page.locator("#ws-evidence-view [data-v=matches]").click();

  await page.locator(".ws-credits summary").click();
  await fullyVisible(page.locator(".foot a[href*='Alamyy/Worldcup26']"), "original source credit");
  await viewport(page, "credits open");
  await page.locator(".ws-credits summary").click();
}

async function sharing(page) {
  const route = "/#/styles?team=ECU&compare=USA&scope=group&dials=0,1,4,9&cohort=ECU,USA&heatSort=near&color=group&view=custom&x=dial0&y=gd";
  const params = () => new URLSearchParams(new URL(page.url()).hash.split("?")[1]);
  const original = new URLSearchParams(route.split("?")[1]);
  await page.goto(base + route);
  await ready(page, "explore");
  await page.locator(tab("explore")).press("ArrowRight");
  await ready(page, "compare");
  assert.ok(await page.locator(tab("compare")).evaluate(el => el === document.activeElement));
  await page.keyboard.press("End");
  await ready(page, "explain");
  for (const [key, value] of original) assert.equal(params().get(key), value, "mode preserved " + key);
  const shared = page.url();
  await page.reload();
  await ready(page, "explain");
  assert.equal(page.url(), shared);
  await page.goBack();
  await ready(page, "compare");
  await page.goForward();
  await ready(page, "explain");
  await page.locator(tab("explain")).press("Home");
  await ready(page, "explore");
  assert.equal(await page.locator("#ws-heat tbody tr[data-team]").count(), 2);
  // A new size while Explore remains active must resize both SVG dimensions.
  await page.setViewportSize({width: 1366, height: 768});
  await settle(page);
  await svgBox(page, "#ws-map svg");
}

async function linkedExplorePanels(page) {
  await page.setViewportSize({width:1440, height:900});
  await page.goto(base + "/#/styles");
  await ready(page, "explore");
  const rows = page.locator("#ws-style-preview .xp-style-row");
  const marks = page.locator("#ws-outcome-preview .xp-goals-mark");
  async function verifyValues(a, b) {
    const expected = await page.evaluate(([a,b]) => {
      const records = Object.values(App.tm);
      const plotted = [...document.querySelectorAll("#ws-heat tbody tr[data-team]")].map(el => el.dataset.team);
      const mean = values => values.reduce((s,v) => s+v, 0) / values.length;
      const gd = {};
      const z = {};
      for (const id of new Set([...plotted, a, b].filter(Boolean))) {
        const games = records.filter(r => r.team_id === id);
        gd[id] = mean(games.map(r => r.goals - r.goals_opp));
        z[id] = App.dials.map((_,i) => {
          const baseline = mean(records.map(r => r.dials[i]));
          const sd = Math.sqrt(mean(records.map(r => (r.dials[i]-baseline)**2)));
          return (mean(games.map(r => r.dials[i]))-baseline) / sd;
        });
      }
      const top = App.dials.map((_, i) => ({i, v: a ? z[a][i] - (b ? z[b][i] : 0) :
        Math.max(...plotted.map(id => z[id][i])) - Math.min(...plotted.map(id => z[id][i]))}))
        .sort((l,r) => Math.abs(r.v)-Math.abs(l.v) || l.i-r.i).slice(0,3);
      return {gd,top};
    }, [a,b]);
    const actual = await rows.evaluateAll(els => els.map(el => [Number(el.dataset.indicator),Number(el.dataset.value)]));
    assert.equal(actual.length, 3);
    actual.forEach(([i,v], j) => {
      assert.equal(i, expected.top[j].i);
      assert.ok(Math.abs(v-expected.top[j].v) < 1e-8);
    });
    const points = await marks.evaluateAll(els => els.map(el => [el.dataset.team,Number(el.dataset.gd)]));
    assert.deepEqual(points.map(p => p[0]).sort(), Object.keys(expected.gd).sort());
    for (const [id, v] of points) assert.ok(Math.abs(expected.gd[id]-v) < 1e-8);
  }
  await verifyValues();
  const dot = id => page.locator(`.xp-goals-mark[data-team="${id}"]`);
  await dot("UZB").focus();
  assert.ok(await team(page, "UZB").evaluate(el => el.classList.contains("is-hover")));
  await dot("UZB").press("Enter");
  await verifyValues("UZB");
  await dot("GER").press("Enter");
  await verifyValues("UZB","GER");
  const i = await rows.first().getAttribute("data-indicator");
  await rows.first().focus();
  await rows.first().press("Enter");
  assert.equal(await page.locator("#ws-color").inputValue(), "dial" + i);
  assert.equal(await page.locator("#ws-heat-sort").inputValue(), "dial" + i);
  await page.locator("#ws-style-preview .xp-open").click();
  await ready(page,"compare");
  assert.equal(await page.locator("#ws-lens [data-v=difference]").getAttribute("aria-pressed"), "true");
  await page.goBack();
  await ready(page,"explore");
  await page.locator("#ws-outcome-preview .xp-open").click();
  await ready(page,"explain");
  assert.ok(await page.locator("#ws-matches tbody [data-match]:visible").count() > 0);
  await page.goBack();
  await ready(page,"explore");
  await page.locator("#ws-swap").click();
  await verifyValues("GER","UZB");
  await page.goto(base + "/#/styles?cohort=ECU,USA");
  await ready(page,"explore");
  await verifyValues();
  await page.goto(base + "/#/styles?search=zzzzzz");
  await ready(page,"explore");
  assert.equal(await marks.count(), 0);
  assert.equal(await rows.count(), 0);
}

async function keyboardRows(page) {
  await page.goto(base + "/#/styles?mode=compare&team=ECU");
  await ready(page, "compare");
  const rankedId = await page.locator("#ws-twins [data-team]").first().getAttribute("data-team");
  const ranked = page.locator(`#ws-twins [data-team="${rankedId}"]`);
  await ranked.press("Enter");
  assert.equal(new URLSearchParams(page.url().split("?")[1]).get("compare"), rankedId);
  assert.ok(await ranked.evaluate(el => document.activeElement === el), "selected ranking row keeps keyboard focus");

  await page.locator("#ws-utilities [data-tool=table]").click();
  const pinA = page.locator("#ws-teams tr[data-team=TUR] [data-pick=A]");
  await pinA.press("Space");
  assert.equal(await pinA.getAttribute("aria-pressed"), "true");
  assert.ok(await pinA.evaluate(el => document.activeElement === el), "recreated A pin keeps focus");
  const row = page.locator("#ws-teams tr[data-team=CAN]");
  await row.press("Enter");
  assert.equal(await row.locator("[data-pick=B]").getAttribute("aria-pressed"), "true");
  assert.ok(await row.evaluate(el => document.activeElement === el), "recreated team row keeps focus");
  await page.keyboard.press("Escape");
}

async function matchTrends(page) {
  await page.goto(base + "/#/styles");
  await ready(page, "explore");
  const panel = page.locator("#ws-outcome-preview");
  const trend = panel.locator("[data-goal-view=trend]");
  const distribution = panel.locator("[data-goal-view=distribution]");
  const point = panel.locator(".xp-trend-mark");
  const series = id => point.evaluateAll((els, teamId) => els.filter(el => el.dataset.team === teamId)
    .map(el => [Number(el.dataset.game), Number(el.dataset.gd)]).sort((a,b) => a[0] - b[0]), id);
  const ecuador = [[1,-1],[2,0],[3,1],[4,-2]];
  const usa = [[1,3],[2,2],[3,-1],[4,2],[5,-3]];
  assert.equal(await panel.locator(".xp-goals-mark:visible").count(), 48);
  assert.ok(await panel.locator(".xp-trend-plot").isHidden());
  await team(page, "ECU").press("Enter");
  await trend.click();
  assert.deepEqual(await series("ECU"), ecuador);
  assert.equal(await point.count(), 4, "one team produces only its own matches");
  await panel.locator('[data-match="2026-M034-ECU-CUW_ECU"]').focus();
  const readout = await panel.locator(".xp-goals-readout").innerText();
  assert.match(readout, /2\.76/);
  assert.match(readout, /0\.63/);

  await team(page, "USA").press("Enter");
  assert.deepEqual(await series("USA"), usa);
  assert.deepEqual(await series("ECU"), ecuador);
  const share = page.url();
  assert.equal(new URLSearchParams(new URL(share).hash.split("?")[1]).get("goalView"), "trend");
  await page.reload();
  await ready(page, "explore");
  assert.deepEqual(await series("USA"), usa);
  await fullyVisible(panel.locator(".xp-trend-plot"), "two team match trends");
  await capture(page, "explore-match-trends");
  await distribution.click();
  assert.equal(await panel.locator(".xp-goals-mark:visible").count(), 48);
  await trend.click();
  await page.locator("#ws-scope [data-v=group]").click();
  assert.deepEqual(await series("ECU"), ecuador.slice(0, 3));
  assert.deepEqual(await series("USA"), usa.slice(0, 3));
  await page.locator("#ws-scope [data-v=knockout]").click();
  assert.deepEqual(await series("ECU"), ecuador.slice(3));
  assert.deepEqual(await series("USA"), usa.slice(3));

  const key = "2026-M094-USA-BEL_USA";
  await panel.locator(`.xp-trend-mark[data-match="${key}"]`).press("Enter");
  await ready(page, "explain");
  const params = new URLSearchParams(new URL(page.url()).hash.split("?")[1]);
  for (const [name,value] of Object.entries({team:"ECU", compare:"USA", scope:"knockout", match:key}))
    assert.equal(params.get(name), value);
  assert.equal(await page.locator('#ws-matches [aria-selected=true]:visible').getAttribute("data-match"), key);
  await page.goBack();
  await ready(page, "explore");
  assert.ok(await panel.locator(".xp-trend-plot").isVisible());

  await page.goto(base + "/#/styles?team=QAT&scope=knockout&goalView=trend");
  await ready(page, "explore");
  assert.equal(await point.count(), 0, "no knockout records for Qatar");
  await page.goto(base + "/#/styles?team=QAT&compare=USA&scope=knockout&goalView=trend");
  await ready(page, "explore");
  assert.deepEqual(await series("USA"), usa.slice(3));
  assert.deepEqual(await series("QAT"), []);

  // Both opening matches ended +3. A pointer must be able to pick either match.
  await page.goto(base + "/#/styles?team=USA&compare=ARG&goalView=trend");
  await ready(page, "explore");
  for (const opener of ["2026-M004-USA-PAR_USA", "2026-M019-ARG-ALG_ARG"]) {
    await panel.locator(`.xp-trend-mark[data-match="${opener}"]`).click();
    await ready(page, "explain");
    assert.equal(await page.locator("#ws-matches [aria-selected=true]").getAttribute("data-match"), opener);
    await page.goBack();
    await ready(page, "explore");
  }
  await page.locator("#ws-reset").click();
  assert.equal(await panel.locator(".xp-goals-mark:visible").count(), 48);
  assert.ok(await panel.locator(".xp-trend-plot").isHidden());
}

async function translatedLayout(page) {
  for (const lang of ["zh-Hans", "zh-Hant", "ar"]) {
    await page.evaluate(locale => App.i18n.setLocale(locale), lang);
    await settle(page);
    assert.equal(await page.locator("html").getAttribute("lang"), lang);
    assert.notEqual(await page.locator(tab("explore")).innerText(), "Explore");
    await page.locator('#ws-utilities [data-tool="table"]').click();
    assert.notEqual(await page.locator(".ws-dialog-close").innerText(), "Close");
    await page.keyboard.press("Escape");
    await gotoMode(page, "compare");
    await viewport(page, lang + " compare");
    await gotoMode(page, "explain");
    await viewport(page, lang + " explain");
    await page.locator("#ws-pick-b .sel-btn").click();
    await fullyVisible(page.locator("#ws-pick-b .sel-pop"), lang + " B picker");
    await page.locator("#ws-pick-b input").press("Escape");
    await gotoMode(page, "explore");
  }
  await page.evaluate(() => App.i18n.setLocale("en"));
}

async function phone(browser, errors) {
  const page = await openPage(browser, errors, {viewport: {width:390,height:844}, isMobile:true, hasTouch:true});
  await page.goto(base + "/#/styles");
  await ready(page, "explore");
  await viewport(page, "phone overview", true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), "phone scrolls naturally");
  await capture(page, "phone-390x844");
  await page.locator("#ws-pick-a .sel-btn").tap();
  await fullyVisible(page.locator("#ws-pick-a .sel-pop"), "phone team picker");
  await page.locator("#ws-pick-a input").fill("ECU");
  await page.locator("#ws-pick-a .sel-opt").last().tap();
  await page.locator("#ws-pick-b .sel-btn").tap();
  await page.locator("#ws-pick-b input").fill("USA");
  await page.locator("#ws-pick-b .sel-opt").last().tap();
  await page.locator("#ws-outcome-preview [data-goal-view=trend]").tap();
  await viewport(page, "phone match trends", true);
  const match = "2026-M034-ECU-CUW_ECU";
  await page.locator(`.xp-trend-mark[data-match="${match}"]`).tap();
  await ready(page, "explain");
  assert.equal(await page.locator("#ws-matches [aria-selected=true]").getAttribute("data-match"), match);
  await page.goBack();
  await ready(page, "explore");
  await page.locator("#ws-style-preview .xp-open").tap();
  await ready(page, "compare");
  await fullyVisible(page.locator("#ws-modes"), "phone drill-through shows mode tabs");
  assert.ok(await page.evaluate(() => window.scrollY < 2));
  await page.locator("#ws-lens [data-v=difference]").tap();
  await viewport(page, "phone compare", true);
  await page.locator(tab("explain")).tap();
  await ready(page, "explain");
  await page.locator("#ws-waterfall [data-step=c_finish]").tap();
  await page.locator("#ws-waterfall summary").tap();
  await page.locator("#ws-waterfall [data-record]").last().tap();
  assert.equal(await page.locator("#ws-matches [aria-selected=true]").count(), 1);
  await viewport(page, "phone explain", true);
}

async function openPage(browser, errors, options) {
  const page = await browser.newPage({reducedMotion:"reduce", ...options});
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", msg => { if (msg.type() === "error" && /(?:Type|Syntax|Reference|Range)Error/.test(msg.text())) errors.push(msg.text()); });
  return page;
}

(async () => {
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch();
  try {
    const errors = [];
    const page = await openPage(browser, errors, {});
    for (const [width, height] of [[1920,1080], [1440,900], [1366,768], [1280,800]]) {
      await desktop(page, width, height);
      console.log(`Viewport ${width}×${height} passed`);
    }
    await sharing(page);
    await translatedLayout(page);
    await keyboardRows(page);
    await linkedExplorePanels(page);
    await matchTrends(page);
    await phone(browser, errors);
    assert.deepEqual(errors, []);
    const report = {browser: await browser.version(), tolerance, measurements, pageErrors: errors};
    fs.writeFileSync(path.join(output, "viewport-checks.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("Mode layout, resizing, popovers, share links, keyboard history and phone touch checks passed.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
