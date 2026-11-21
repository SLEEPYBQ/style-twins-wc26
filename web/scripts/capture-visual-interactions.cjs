// Capture the classroom walkthrough from the running static site.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const base = process.env.STYLE_TWINS_BASE_URL || "http://127.0.0.1:8642";
const out = process.env.STYLE_TWINS_QA_OUTPUT || path.join(require("node:os").tmpdir(), "style-twins-walkthrough");

async function capture() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  async function pageFor(width, height, touch = false) {
    const page = await browser.newPage({ viewport: {width, height}, hasTouch: touch, reducedMotion: "reduce" });
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && message.location().url.startsWith(base)) errors.push(message.text());
    });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator("#ws-map .mark").first().waitFor();
    return page;
  }
  async function shot(page, file, selector) {
    if (selector) await page.locator(selector).first().evaluate(el => {
      const y = el.getBoundingClientRect().top + window.scrollY;
      const offset = document.querySelector(".topbar").getBoundingClientRect().bottom + 8;
      window.scrollTo({top: Math.max(0, y - offset), behavior: "instant"});
    });
    else await page.evaluate(() => window.scrollTo({top: 0, behavior: "instant"}));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), file + " page overflow");
    await page.screenshot({path: path.join(out, file + ".png")});
  }
  try {
    const page = await pageFor(1440, 900);
    await shot(page, "overview");
    const mark = id => page.locator('#ws-map .mark[data-team="' + id + '"]');
    await mark("ECU").press("Enter");
    await page.locator("#ws-C-title").hover();
    await shot(page, "team-a");
    await mark("USA").focus();
    await shot(page, "candidate-preview");
    await mark("USA").press("Enter");
    await page.locator('#ws-modes [data-mode="compare"]').click();
    await shot(page, "comparison");
    const profile = '[data-panel="D"]';
    await page.locator("#ws-lens [data-v=absolute]").click();
    await shot(page, "absolute-profiles", profile);
    await page.locator("#ws-lens [data-v=difference]").click();
    await page.locator("#ws-order [data-v=gap]").click();
    await page.locator(".lens-row").first().focus();
    await shot(page, "signed-differences", profile);
    await page.locator('#ws-modes [data-mode="explain"]').click();
    await page.locator('#ws-waterfall [data-step=c_finish]').click();
    await shot(page, "waterfall", '[data-panel="W"]');
    await page.locator('#ws-waterfall .wf-records summary').click();
    await shot(page, "waterfall-records", '[data-panel="W"]');
    await page.goto(base + "/#/styles?view=pairs");
    await page.locator(".wp-guide-button").click();
    await page.locator('.wp-result[data-pair="ECU-USA"]').focus();
    await shot(page, "team-pairs");
    await page.close();
    const laptop = await pageFor(1280, 800);
    await shot(laptop, "laptop-overview");
    await laptop.close();
    const phone = await pageFor(390, 844, true);
    await shot(phone, "phone-overview");
    await phone.goto(base + "/#/styles?team=ECU&compare=USA&lens=difference&order=gap");
    await phone.locator('#ws-modes [data-mode="compare"]').tap();
    await shot(phone, "phone-differences", profile);
    await phone.locator('#ws-modes [data-mode="explain"]').tap();
    await phone.locator("#ws-waterfall [data-step=c_finish]").tap();
    await shot(phone, "phone-waterfall", '[data-panel="W"]');
    await phone.selectOption("#language-select", "zh-Hans");
    await phone.locator('#ws-modes [data-mode="compare"]').tap();
    await shot(phone, "phone-differences-zh", profile);
    assert.match(await phone.locator("#ws-D-title").innerText(), /[\p{Script=Han}]/u);
    await phone.close();
    assert.deepEqual(errors, []);
    console.log("Captured the workspace walkthrough at 1440×900, 1280×800 and 390×844.");
  } finally {
    await browser.close();
  }
}
capture().catch(error => {console.error(error); process.exitCode = 1;});
