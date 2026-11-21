// Serves as a focused check and is also called by verify-workspace-browser.cjs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function checkLens(page, base, output) {
  await page.goto(base + "/#/styles?team=ECU&compare=USA", {waitUntil:"domcontentloaded"});
  const rows = page.locator(".lens-row"), mode = page.locator("#ws-lens"), scope = page.locator("#ws-scope");
  await rows.first().waitFor();
  const absolute = mode.locator('[data-v="absolute"]'), difference = mode.locator('[data-v="difference"]');
  const numerical = async () => page.evaluate(() => {
    const records = Object.values(App.tm), p = new URLSearchParams(location.hash.split("?")[1]);
    const summary = id => {
      const matches = records.filter(r => r.team_id === id && App.analysis.inScope(r, p.get("scope") || "all"));
      const raw = App.dials.map((_, i) => d3.mean(matches, r => r.dials[i]));
      const z = raw.map((x,i) => {
        const mean = d3.mean(records, r=>r.dials[i]);
        return (x-mean) / Math.sqrt(d3.mean(records, r=>(r.dials[i]-mean)**2));
      });
      return { raw, z, gd: d3.mean(matches,r=>r.goals-r.goals_opp) };
    };
    const a = summary(p.get("team")), b = summary(p.get("compare"));
    const delta = a.z.map((v,i)=>v-b.z[i]);
    const scope = p.get("scope") || "all", selected = App.analysis.readDials(Object.fromEntries(p));
    const sim = App.analysis.twinTable(App.analysis.space(selected,scope)).near[p.get("team")].find(t=>t.id===p.get("compare")).sim;
    return { a, b, delta, gap: App.signed(a.gd-b.gd,2), percentile: App.fix(sim*100,1)+"%" };
  });
  const verifyBars = async expected => {
    const actual = await rows.evaluateAll(nodes => nodes.map(n=>{
      const track = n.querySelector(".lens-track").getBoundingClientRect(), bar = n.querySelector(".lens-bar").getBoundingClientRect();
      return { i:+n.dataset.indicator, delta:+n.dataset.delta, length:bar.width/track.width,
        left:(bar.left-track.left)/track.width, right:(bar.right-track.left)/track.width };
    }));
    const domain = Math.max(0.5,Math.ceil(Math.max(...expected.delta.map(Math.abs))*2)/2);
    assert.equal(actual.length,10);
    for (const r of actual) {
      const d = expected.delta[r.i];
      assert.ok(Math.abs(r.delta-d)<1e-8,"A−B equals difference of independently standardized raw means");
      assert.ok(Math.abs((d<0?r.right:r.left)-.5)<.002,"Bar starts at zero");
      assert.ok(Math.abs(r.length-Math.abs(d)/(2*domain))<.002,"Bar length is proportional to signed difference magnitude");
    }
  };
  const expected = await numerical();
  assert.equal(await absolute.getAttribute("aria-pressed"),"true");
  assert.equal(await rows.count(),10);
  assert.match(await page.locator("#ws-summary").innerText(),new RegExp(expected.percentile.replace(".","\\.")));
  assert.ok((await page.locator("#ws-summary").innerText()).includes(expected.gap));
  await page.locator(".lens-row[data-indicator='5']").focus();
  assert.equal(await page.locator(".hm-table thead .lens-linked").getAttribute("data-i"),"5");
  assert.equal(await page.locator(".hm-table thead .is-inspected").getAttribute("data-i"),"0","The map still encodes the committed column");
  for (const [side,v] of [[expected.a,"ECU"],[expected.b,"USA"]]) {
    const txt = await page.locator(".lens-readout .lens-detail-team").filter({hasText:v}).innerText();
    assert.ok(txt.includes(side.raw[5].toFixed(1)));
    assert.ok(txt.includes(Math.abs(side.z[5]).toFixed(2)));
  }
  assert.equal(await page.locator("#ws-color").inputValue(),"dial0");
  if (output) await page.locator('[data-panel="D"]').screenshot({path:path.join(output,"dna-absolute.png")});
  await difference.click();
  assert.equal(new URLSearchParams(page.url().split("?")[1]).get("lens"),"difference");
  await verifyBars(expected);
  await page.locator('#ws-order [data-v="gap"]').click();
  const ranks = await rows.evaluateAll(ns=>ns.map(n=>+n.dataset.rank));
  assert.deepEqual(ranks,[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(await rows.locator(".lens-name small").count(),3);
  const first = await rows.first().getAttribute("data-indicator");
  await rows.first().focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await rows.nth(1).evaluate(n=>n===document.activeElement),true);
  if (output) await page.locator('[data-panel="D"]').screenshot({path:path.join(output,"dna-difference.png")});
  await page.locator(`#ws-dials input[data-i="${first}"]`).uncheck();
  assert.equal(await rows.locator(".lens-name i[title='Outside similarity']").count(),1);
  await verifyBars(expected);
  await page.locator("#ws-swap").click();
  const swapped = await numerical();
  assert.deepEqual(swapped.delta,expected.delta.map(v=>-v));
  await verifyBars(swapped);
  await scope.locator('[data-v="group"]').click();
  await verifyBars(await numerical());
  await page.reload({waitUntil:"domcontentloaded"});
  await rows.first().waitFor();
  assert.equal(await difference.getAttribute("aria-pressed"),"true");
  await absolute.click();
  await page.goBack();
  assert.equal(await difference.getAttribute("aria-pressed"),"true");
  await page.locator("#ws-matches tbody [data-match]").first().click();
  assert.equal(await absolute.getAttribute("aria-pressed"),"true");
  assert.equal(await page.locator(".lens-overlay.is-match:visible").count(),10);
}
module.exports = checkLens;
if (require.main === module) {
  const { chromium } = require("playwright");
  (async () => {
    const browser = await chromium.launch();
    const output = process.env.STYLE_TWINS_QA_OUTPUT;
    if (output) fs.mkdirSync(output,{recursive:true});
    try {
      const p = await browser.newPage({viewport:{width:1440,height:900}}), errors = [];
      p.setDefaultNavigationTimeout(90000);
      await p.route(/^https:\/\/fonts\./, route => route.abort());
      p.on("pageerror",e=>errors.push(e.message));
      await checkLens(p,process.env.STYLE_TWINS_BASE_URL || "http://127.0.0.1:8642",output);
      assert.deepEqual(errors,[]);
      console.log("DNA lens checks passed: raw values, standardized differences, bar geometry, sorting, links, URL and match overlay.");
    } finally { await browser.close(); }
  })().catch(e=>{console.error(e);process.exitCode=1;});
}
