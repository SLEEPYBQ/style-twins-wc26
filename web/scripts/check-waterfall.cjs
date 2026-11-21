// Used by verify-workspace-browser.cjs. Compare visible start/end geometry to delivered match rows.
const assert = require("node:assert/strict");
const path = require("node:path");

module.exports = async function checkWaterfall(page, base, output) {
  const open = async (route) => {
    await page.goto(base + "/" + route, { waitUntil: "domcontentloaded", timeout: 120000 });
    const [path, search] = route.split("?"), params = new URLSearchParams(search);
    const [a, b] = path.startsWith("#/twins/") ? path.split("/").slice(2) : [params.get("team"), params.get("compare")];
    const key = [a, b, params.get("scope") || "all"].join("/");
    await page.locator(`.wf[data-waterfall="${key}"]`).waitFor({ state: "attached", timeout: 120000 });
  };
  const chart = page.locator(".wf");
  const geometry = async (a, b, scope) => {
    const result = await chart.evaluate((el, { a, b, scope }) => {
      const list = (id) => Object.values(App.tm).filter(r => r.team_id === id && App.analysis.inScope(r, scope));
      const avg = (rows, f) => rows.reduce((acc, r) => acc + f(r), 0) / rows.length;
      const left = list(a), right = list(b);
      const ticks = [...el.querySelectorAll(".wf-ticks i")].map(i => [Number(i.textContent.replace("−", "-")), i.getBoundingClientRect().left]);
      const [v1, x1] = ticks[0], [v2, x2] = ticks.at(-1);
      const x = v => x1 + (v - v1) * (x2 - x1) / (v2 - v1);
      let prev = 0;
      return [...el.querySelectorAll(".wf-row")].map((row, i) => {
        const observed = row.dataset.step === "gd";
        const metric = observed ? r => r.goals - r.goals_opp : r => r.decomp[i];
        const diff = avg(left, metric) - avg(right, metric);
        const start = observed ? 0 : prev, end = start + diff;
        prev = end;
        const rect = row.querySelector(".wf-bar").getBoundingClientRect(), cap = row.querySelector(".wf-end").getBoundingClientRect();
        return [Math.abs(rect.width - Math.abs(x(end) - x(start))),
          Math.abs(rect.left - x(Math.min(start, end))),
          Math.abs(cap.left - x(end)),
          Math.abs(Number(row.querySelector("strong").textContent.replace("−", "-")) - diff)];
      });
    }, { a, b, scope });
    assert.equal(result.length,7);
    result.forEach(([w, l, end, rounded]) => assert.ok(Math.max(w, l, end) < 0.2 && rounded <= 0.0050001,
      `Incorrect waterfall geometry or label for ${a}/${b} (${scope}): ${[w,l,end,rounded]}`));
    const connectorOffsets = await chart.evaluate(el => {
      const lefts = selector => [...el.querySelectorAll(selector)].map(line => line.getBoundingClientRect().left);
      const starts = lefts(".wf-connector"), ends = lefts(".wf-from");
      return starts.map((start, i) => Math.abs(start - ends[i]));
    });
    assert.equal(connectorOffsets.length, 6);
    assert.ok(connectorOffsets.every(v => v < 0.1), "Connect each cumulative level to the next row");
  };
  await page.setViewportSize({width:1440,height:900});
  await open("#/styles?team=ECU&compare=USA");
  await geometry("ECU","USA","all");
  const finish = chart.locator('[data-step="c_finish"]');
  await finish.focus();
  assert.match(await chart.locator(".wf-detail").innerText(), /Goals scored minus xG created/);
  await finish.press("Enter");
  assert.equal(await finish.getAttribute("aria-pressed"), "true");
  await chart.locator('[data-step="c_keep"]').hover();
  assert.match(await chart.locator(".wf-detail").innerText(), /opposing finishing/);
  await chart.locator(".wf-head").hover();
  assert.match(await chart.locator(".wf-detail").innerText(), /Goals scored minus xG created/);
  await chart.locator("summary").click();
  assert.equal(await chart.locator("[data-record]").count(), 9);
  const record = chart.locator("[data-record]").first();
  const key = await record.getAttribute("data-record");
  await record.click();
  assert.equal(new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get("match"), key);
  assert.equal(await page.locator(`#ws-matches [data-match="${key}"]`).getAttribute("aria-selected"), "true");
  await chart.locator("summary").click();
  await chart.evaluate(el => window.scrollBy({top: el.closest("section").getBoundingClientRect().top - 72, behavior:"instant"}));
  await page.screenshot({path:path.join(output,"outcome-waterfall.png")});
  const before = await chart.locator(".wf-bar").evaluateAll(nodes=>nodes.map(node=>node.style.cssText));
  await open("#/styles?team=ECU&compare=USA&dials=0,1");
  assert.deepEqual(await chart.locator(".wf-bar").evaluateAll(nodes=>nodes.map(node=>node.style.cssText)), before);
  for (const [a,b,scope] of [["USA","ECU","all"],["CIV","SEN","all"],["NED","MEX","knockout"]]) {
    await open(`#/styles?team=${a}&compare=${b}&scope=${scope}`);
    await geometry(a,b,scope);
  }
  await open("#/styles?team=BIH&compare=GHA");
  await geometry("BIH","GHA","all");
  assert.equal(await chart.locator('[data-step="c_opp"] strong').textContent(), "−0.00005");
  await open("#/styles?team=IRQ&compare=NED&scope=knockout");
  assert.equal(await chart.locator(".wf-row").count(), 0);
  assert.match(await chart.innerText(), /match records/);

  await page.setViewportSize({width:390,height:844});
  await open("#/twins/ECU/USA?scope=group");
  await geometry("ECU","USA","group");
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
  await chart.locator('[data-step="c_finish"]').click();
  await chart.locator("summary").click();
  assert.equal(await chart.locator("[data-record]").count(), 6);
  await chart.evaluate(el => window.scrollBy({top: el.closest("section").getBoundingClientRect().top - 68, behavior:"instant"}));
  await page.screenshot({path:path.join(output,"outcome-waterfall-narrow.png")});
  await chart.locator("[data-record]").first().click();
  assert.ok(await page.locator("[data-evidence]").evaluate(el => el.matches(":focus")));
  for (const [locale, expected] of [["zh-Hans", "实际进球减去预期进球"], ["zh-Hant", "實際進球減去預期進球"]]) {
    await page.evaluate(lang => App.i18n.setLocale(lang), locale);
    await chart.locator('[data-step="c_finish"]').focus();
    await chart.locator(".wf-detail p").filter({hasText: expected}).waitFor();
    assert.equal(await chart.locator(".wf-row").count(), 7);
  }
  await page.evaluate(() => App.i18n.setLocale("en"));
};
