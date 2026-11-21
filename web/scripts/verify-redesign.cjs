// Playwright verification for the Style Twins single-screen workspace (1920×1080 presentation target).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE = (process.env.STYLE_TWINS_BASE_URL || "http://127.0.0.1:8642").replace(/\/$/, "");
const OUT = process.env.STYLE_TWINS_OUT_DIR || path.join(os.tmpdir(), "style-twins-verify");
fs.mkdirSync(OUT, { recursive: true });

async function settle(page, extraMs = 80) {
  await page.evaluate(async (ms) => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }, extraMs);
}

async function assertDesktopBounds(page, label) {
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const jump = document.getElementById("team-jump");
    const tabs = document.querySelector(".topbar .tabs");
    const topbar = document.querySelector(".topbar");
    const dnaScroll = document.getElementById("dna-scroll");
    const panels = ["map", "twins", "dna", "quad", "fate"].map((id) => {
      const el = document.querySelector(`[data-panel="${id}"]`);
      const r = el.getBoundingClientRect();
      return { id, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
    return {
      iw: window.innerWidth,
      ih: window.innerHeight,
      sw: doc.scrollWidth,
      sh: doc.scrollHeight,
      topbarH: topbar ? Math.round(topbar.getBoundingClientRect().height) : 0,
      jumpVisible: jump ? getComputedStyle(jump).display !== "none" : false,
      tabsVisible: tabs ? getComputedStyle(tabs).display !== "none" : false,
      dnaScrollH: dnaScroll ? dnaScroll.scrollHeight : 0,
      dnaClientH: dnaScroll ? dnaScroll.clientHeight : 0,
      panels,
    };
  });
  assert.ok(m.sw <= m.iw + 2, `${label}: horizontal overflow ${m.sw} > ${m.iw}`);
  assert.ok(m.sh <= m.ih + 2, `${label}: vertical overflow ${m.sh} > ${m.ih}`);
  assert.equal(m.jumpVisible, false, `${label}: #team-jump must be hidden on workspace route`);
  assert.equal(m.tabsVisible, false, `${label}: .topbar .tabs must be hidden on workspace route`);
  assert.ok(m.topbarH > 30 && m.topbarH <= 58, `${label}: merged .topbar height out of range (${m.topbarH})`);
  for (const p of m.panels) {
    assert.ok(p.w > 200 && p.h > 130, `${label}: panel ${p.id} too small (${p.w}x${p.h})`);
    assert.ok(p.bottom <= m.ih + 2, `${label}: panel ${p.id} clipped bottom ${p.bottom} > ${m.ih}`);
  }
  return m;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("response", (res) => { if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`); });
  page.on("requestfailed", (req) => failedRequests.push(`FAILED ${req.url()}`));

  // 1. Overview 1920x1080
  await page.goto(`${BASE}/#/story`, { waitUntil: "domcontentloaded" });
  await page.locator(".ws2").waitFor();
  await settle(page);

  const bounds1920 = await assertDesktopBounds(page, "1920x1080");
  assert.ok(bounds1920.panels[0].top <= 108, `1920x1080: Style Map should start <= 108px (got ${bounds1920.panels[0].top})`);
  assert.ok(
    bounds1920.dnaScrollH <= bounds1920.dnaClientH + 4,
    `1920x1080: Style DNA should fit all 48 teams without scroll (scrollH=${bounds1920.dnaScrollH}, clientH=${bounds1920.dnaClientH})`
  );
  const axisTexts = await page.locator(".sm-axis-lbl").allInnerTexts();
  assert.ok(axisTexts.length >= 2, "Style Map should render plain-language axis labels");
  for (const txt of axisTexts) {
    assert.ok(!/\bPC[12]\b/.test(txt), `Axis label must not show bare PC1/PC2: ${txt}`);
  }
  const mapVarBadge = await page.locator("#ws2-map-ctrl .ws2-badge-pill").innerText();
  assert.match(mapVarBadge, /X 51% · Y 17% · 10 dims/, "Map variance badge should show split X/Y variance");
  assert.equal(await page.locator("#sm-canvas .sm-node image").count(), 48, "Style Map must render 48 circular flags");
  assert.equal(await page.locator("#fq-canvas path.fq-mark.is-star").count(), 53, "Fate Quadrant must render 53 Gold star glyphs");

  // The overview states a comparison (twins vs dissimilar pairs), not a share of a circular cohort.
  const fateText = await page.locator("#ws2-fate-body").innerText();
  assert.match(fateText, /explain \+0\.15 of a 1\.69 goal gap/, "Overview headline should compare style share for twins");
  assert.match(fateText, /\+0\.77 of 2\.36/, "Overview should state the dissimilar-pair baseline");
  assert.doesNotMatch(fateText, /\d+%\s+of the gap/, "Overview must not show circular percentage shares");
  // Pair rows come only from the data-driven ★ cohort (≥90% similar, ≥1.0 gap); no author-picked pairs.
  const caseMeta = await page.locator(".wf2-case-row").evaluateAll((rows) => rows.map((r) => ({
    key: r.dataset.try,
    sim: parseFloat(r.querySelectorAll(".wf2-case-meta")[0].textContent),
    gap: parseFloat(r.querySelectorAll(".wf2-case-meta")[1].textContent),
  })));
  assert.equal(caseMeta.length, 53, "Overview lists all 53 ★ pairs");
  assert.ok(caseMeta.every((c) => c.sim >= 90 && c.gap >= 1), "Every listed pair must belong to the ★ cohort");
  assert.ok(!caseMeta.some((c) => /ESP-ARG|ARG-ESP/.test(c.key)), "ESP–ARG (44% similar) must not be injected");
  // Negative contributions are drawn left of zero rather than clamped away.
  const negSegments = await page.locator(".wf2-case-bar").evaluateAll((bars) => bars.filter((bar) => {
    const zero = parseFloat(bar.querySelector("u").style.left);
    return [...bar.querySelectorAll("i")].some((i) => parseFloat(i.style.left) < zero - 0.01 && parseFloat(i.style.width) > 0.01);
  }).length);
  assert.ok(negSegments >= 10, `Negative contributions must be visible (got ${negSegments} bars with a left segment)`);
  await page.screenshot({ path: path.join(OUT, "v3-overview-1920.png") });

  // 2. Removed modes stay removed (one encoding per panel).
  for (const sel of ['[data-omode]', '[data-dview]', '[data-dcol]', '[data-lmode="ego"]', '[data-act="trail"]', '[data-vmode="conn"]', '[data-vmode="table"]']) {
    assert.equal(await page.locator(sel).count(), 0, `${sel} control must not be rendered`);
  }

  // 3. Playstyle Highlight (architects -> 4/10 dials) + Isolate verifying negative -0.13 without clamping
  await page.locator('#ws2-arch-pills [data-arch="architects"]').click();
  await settle(page);
  assert.equal(await page.locator("#ws2-dial-cnt").innerText(), "4/10");
  assert.match(await page.locator(".dna-grp-row").innerText(), /Active \(4\)/i);
  assert.equal(await page.locator(".dna-col-row th.is-muted").count(), 6);
  // Highlight keeps all 48 teams visible across pairs unless Isolate clicked
  assert.equal(await page.locator("#ws2-team-cnt").innerText(), "48/48");
  await page.locator("#ws2-arch-isolate").click();
  await settle(page);
  assert.equal(await page.locator("#ws2-team-cnt").innerText(), "7/48");
  const isoFate = await page.locator("#ws2-fate-body").innerText();
  assert.match(isoFate, /−0\.13|−0\.1/, "Isolated Possession group must show negative style contribution instead of 0%");
  await page.locator('#ws2-arch-pills [data-arch="architects"]').click();
  await settle(page);
  assert.equal(await page.locator("#ws2-dial-cnt").innerText(), "10/10");

  // 4. Click Style DNA column heading -> sort descending & tint Style Map
  await page.locator('.dna-col-row button[data-dial-sort="dial0"]').click();
  await settle(page);
  const firstTeam = await page.locator("#dna-tbody tr.dna-team-row").first().getAttribute("data-team");
  assert.equal(firstTeam, "ESP", "Sorting by Possession descending puts Spain first");
  assert.equal(await page.locator('#sm-legend [data-act="clear-color"]').count(), 1);
  await page.locator('.dna-col-row button[data-dial-sort="dial0"]').click();
  await settle(page);
  assert.equal(await page.locator('#sm-legend [data-act="clear-color"]').count(), 0);

  // 5. Story Beat 1/2: captions are computed from the live model and spotlight the panels they describe.
  await page.locator('#ws2-story-nav [data-beat="1"]').click();
  await settle(page, 300);
  assert.deepEqual(
    await page.locator(".ws2-panel.is-beat-focus").evaluateAll((els) => els.map((e) => e.dataset.panel)),
    ["map", "dna"],
    "Beat 1 spotlights the Style Map and Style DNA"
  );
  await page.locator('#ws2-story-nav [data-beat="2"]').click();
  await settle(page, 300);
  const beat2 = await page.locator("#ws2-story-banner").innerText();
  assert.match(beat2, /1\.60 for teams that play differently/, "Beat 2 states the dissimilar median gap");
  assert.match(beat2, /0\.92 for style twins/, "Beat 2 states the twin median gap");
  assert.match(beat2, /53 twin pairs/, "Beat 2 counts the ★ pairs");
  await page.screenshot({ path: path.join(OUT, "v3-beat2-1920.png") });

  // 6. Story Beat 3 (USA vs ECU + Timeline + decreasing .tw2-sim widths)
  await page.locator('#ws2-story-nav [data-beat="3"]').click();
  await settle(page, 300);
  assert.equal(await page.locator(".dna-pin-row.is-a").getAttribute("data-team"), "USA");
  assert.equal(await page.locator(".dna-pin-row.is-b").getAttribute("data-team"), "ECU");
  assert.equal(await page.locator(".dna-diff-row").count(), 1);
  assert.match(
    await page.locator("#ws2-story-banner").innerText(),
    /USA and Ecuador are 99\.7% alike, yet USA averaged 1\.10 more goals per match\.\s+Biggest factor:\s+Finishing vs xG\s+\(\+1\.90\)/,
    "Beat 3 caption is computed from the selected pair"
  );
  assert.ok((await page.locator("#wf2-timeline").count()) === 1, "Beat 3 defaults Panel 5 to G1..Gn Timeline");
  const simWidths = await page.locator(".tw2-sim-track i").evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).width)));
  assert.ok(simWidths.length >= 6 && simWidths[0] > simWidths[5] + 4, `Twin similarity bars must reflect magnitude (${simWidths[0]} > ${simWidths[5]})`);
  await page.screenshot({ path: path.join(OUT, "v3-beat3-ecu-usa-1920.png") });

  // Also test Beads view on ECU vs USA (9 fixed-r shapes) + DNA zero-scroll even with A/B/A-B pinned!
  const dnaPinBounds = await page.evaluate(() => {
    const el = document.getElementById("dna-scroll");
    return { sh: el.scrollHeight, ch: el.clientHeight };
  });
  assert.ok(dnaPinBounds.sh <= dnaPinBounds.ch + 6, `1920x1080 pinned A/B/A-B DNA should fit without overflow (${dnaPinBounds.sh} <= ${dnaPinBounds.ch})`);
  await page.locator('#ws2-fate-ctrl [data-vmode="beads"]').click();
  await settle(page);
  assert.equal(await page.locator(".wf2-bead").count(), 9, "ECU (4) + USA (5) = 9 match beads");

  // DNA rows fill the panel at 1920×1080 without scrolling.
  const dnaFill = await page.evaluate(() => {
    const el = document.getElementById("dna-scroll");
    return { sh: el.scrollHeight, ch: el.clientHeight, rowH: parseFloat(getComputedStyle(el).getPropertyValue("--dna-row-h")) };
  });
  assert.ok(dnaFill.rowH >= 13, `DNA rows should grow to fill the panel (row height ${dnaFill.rowH}px)`);
  assert.ok(dnaFill.ch - dnaFill.sh < 60, `DNA should leave no large empty band (client ${dnaFill.ch}, content ${dnaFill.sh})`);

  // 7. Fate Quadrant Zoom ★ test + Reset
  await page.goto(`${BASE}/#/styles`, { waitUntil: "domcontentloaded" });
  await page.locator(".ws2").waitFor();
  await settle(page);
  await page.locator('#ws2-quad-ctrl [data-act="zoom-star"]').click();
  await settle(page);
  assert.equal(await page.locator('#ws2-quad-ctrl [data-act="clear-quad"]').count(), 1, "Zoom ★ activates Reset zoom ×");
  await page.locator('#ws2-quad-ctrl [data-act="clear-quad"]').click();
  await settle(page);

  // 8. Match Lab 4-band Semantic Substrate + Live Slider + Role 4x4 + Seriated Matrix
  await page.goto(`${BASE}/#/lab/2026-M034-ECU-CUW?team=ECU`, { waitUntil: "domcontentloaded" });
  await page.locator(".lab-network-svg").waitFor();
  await settle(page);
  const subTextBefore = await page.locator("#lab-kpi-sub").innerText();
  // Fire live input event (without change) to verify instant slider responsiveness!
  await page.locator("#lab-min").evaluate((el) => { el.value = String(Math.max(1, Number(el.value) + 3)); el.dispatchEvent(new Event("input", { bubbles: true })); });
  await settle(page);
  const subTextAfter = await page.locator("#lab-kpi-sub").innerText();
  assert.notEqual(subTextAfter, subTextBefore, "Match Lab #lab-min oninput must update network & KPIs immediately");
  await page.screenshot({ path: path.join(OUT, "v3-lab-substrate-1920.png") });

  await page.locator('[data-layout="pivot"]').click();
  await settle(page);
  assert.equal(await page.locator(".lab-pivot-card").count(), 2, "Role 4x4 PivotGraph renders both sides");

  await page.locator('[data-layout="matrix"]').click();
  await settle(page);
  await page.locator('[data-morder="seriated"]').click();
  await settle(page);

  // 9. zh-Hans comprehensive localization, Team A/B exclusion, Steer interactive drag & screenshots
  await page.goto(`${BASE}/#/story`, { waitUntil: "domcontentloaded" });
  await page.locator(".ws2").waitFor();
  await page.selectOption("#language-select", "zh-Hans");
  await settle(page, 180);
  assert.match(await page.locator(".ws2-title-group h1").innerText(), /打法相似/);
  await assertDesktopBounds(page, "1920x1080 zh-Hans overview");
  await page.screenshot({ path: path.join(OUT, "fixed-zh-overview.png") });

  const collectEnglishLeaks = async () => page.evaluate(() => {
    const allowedExact = new Set([
      "DNA", "CSV", "xG", "xGD", "GD", "PCA", "FIFA", "Yang '03", "y=x", "wSc",
      "W", "D", "L", "GK", "DF", "MF", "FW", "vs", "A", "B", "A / B", "A − B",
      "Style Twins", "Style Twins home", "Kansas City Stadium", "Hudl", "Worldcup26", "USA"
    ]);
    const isCodeOrAllowed = (s) => {
      if (!s || !/[A-Za-z]{2,}/.test(s)) return true;
      if (allowedExact.has(s)) return true;
      if (/^[A-Z]{2,3}$/.test(s)) return true;
      if (/^(?:[A-Z]{3}\s*[+−\-–]?\d|\d+(?:\.\d+)?[x×%]?$|G\d+|M\d+|v\s+[A-Z]{3})/.test(s)) return true;
      if (/^[+\-−]?\d+(?:\.\d+)?%?(?:\s*σ)?$/.test(s)) return true;
      if (/^(?:ECU|USA|ESP|ARG|TUR|NED|CRO|CUW)\s+[+\-−]\d/.test(s)) return true;
      return false;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const leaks = [];
    let node;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      if (!el || el.closest("[data-i18n-skip], [translate='no'], select, option, script, style, .sr-only")) continue;
      if (el.closest(".ws2-dialog")) continue;
      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (rect && rect.width === 0 && rect.height === 0) continue;
      const t = node.nodeValue.trim().replace(/\s+/g, " ");
      if (!t || isCodeOrAllowed(t)) continue;
      // Ignore pure player surname / full-name tokens in Match Lab SVG/cards or match date venue strings
      if (/^[A-Z][a-z]+(?:\s+[A-Z]{2,})?$/.test(t) && el.closest(".lab-page")) continue;
      if (/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*(?:\(|$)/.test(t) && el.closest(".lab-page")) continue;
      // Flag any text node containing >= 3-letter ASCII English word not in known abbreviations
      const words = t.match(/\b[A-Za-z]{3,}\b/g) || [];
      const nonAcronym = words.filter((w) => !["PivotGraph", "Shift", "DNA", "CSV", "xGD", "PCA", "FIFA", "USA", "Hudl", "Worldcup", "Yang", "Stadium", "Kansas", "City", "Galindez", "Hincapie", "Alcivar", "Pacho", "Estupinan", "Yeboah", "Valencia", "Vite", "Plata", "Franco", "Caicedo", "Rodriguez", "Preciado", "Angulo"].includes(w) && !/^[A-Z]{3}$/.test(w));
      if (nonAcronym.length > 0) leaks.push(t);
    }
    return [...new Set(leaks)];
  });

  const zhOverviewLeaks = await collectEnglishLeaks();
  assert.deepEqual(zhOverviewLeaks, [], `zh-Hans Overview untranslated leaks: ${JSON.stringify(zhOverviewLeaks)}`);

  const overviewCounts = await page.evaluate(() => ({
    twinPairs: document.querySelectorAll(".tw2-pair-row").length,
    caseRows: document.querySelectorAll(".wf2-case-row").length,
  }));
  assert.ok(overviewCounts.twinPairs >= 20, `Panel 2 Overview should list >= 20 star pairs, got ${overviewCounts.twinPairs}`);
  assert.equal(overviewCounts.caseRows, 53, `Panel 5 Overview should list the 53 ★ pairs, got ${overviewCounts.caseRows}`);

  // Tall 2048x1280 Mac display check (Panel 2/3/5 fill without bottom blank voids)
  await page.setViewportSize({ width: 2048, height: 1280 });
  await settle(page, 180);
  await assertDesktopBounds(page, "2048x1280 zh-Hans overview");
  await page.screenshot({ path: path.join(OUT, "fixed-zh-tall-2048.png") });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await settle(page, 140);

  // Clicking a Panel 5 pair-attribution row opens pair view, then return to Overview
  await page.locator(".wf2-case-row").first().click();
  await settle(page, 140);
  assert.equal(await page.locator(".wf2-tug-row").count(), 7, "Clicking Panel 5 case row opens 7-row Tug-of-War view");
  await page.goto(`${BASE}/#/story`, { waitUntil: "domcontentloaded" });
  await page.locator(".ws2").waitFor();
  await settle(page, 140);

  // Check Steer (调权重) foreground pill handles & drag behavior
  await page.locator('#ws2-map-ctrl [data-act="steer"]').click();
  await settle(page, 180);
  const steerMeta = await page.evaluate(() => {
    const steerLayer = document.querySelector(".sm-steer-layer");
    const nodesLayer = document.querySelector(".sm-nodes");
    const brushDisabled = document.querySelector(".sm-brush")?.classList.contains("is-disabled");
    const layerOrderOk = Boolean(steerLayer && nodesLayer && (nodesLayer.compareDocumentPosition(steerLayer) & Node.DOCUMENT_POSITION_FOLLOWING));
    const handles = [...document.querySelectorAll(".sm-steer-handle")].map((h) => {
      const r = h.getBoundingClientRect();
      return { dial: h.dataset.dial, text: h.textContent, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
    });
    return { layerOrderOk, brushDisabled, handleCount: handles.length, handles };
  });
  assert.equal(steerMeta.layerOrderOk, true, ".sm-steer-layer must render above .sm-nodes");
  assert.equal(steerMeta.brushDisabled, true, ".sm-brush must be disabled when Steer is active");
  assert.equal(steerMeta.handleCount, 10, "Steer mode must render all 10 draggable tactic pill handles");
  // Drag first pill handle radially outward relative to map center
  const h0 = steerMeta.handles[0];
  const mapCenter = await page.evaluate(() => {
    const r = document.querySelector("#sm-canvas svg").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const dx = h0.cx - mapCenter.x, dy = h0.cy - mapCenter.y;
  const len = Math.hypot(dx, dy) || 1;
  await page.mouse.move(h0.cx, h0.cy);
  await page.mouse.down();
  await page.mouse.move(h0.cx + (dx / len) * 55, h0.cy + (dy / len) * 55, { steps: 6 });
  await page.mouse.up();
  await settle(page, 220);
  assert.match(page.url(), /w=/, "Dragging Steer pill handle must commit dial weight w= to URL hash");
  assert.equal(await page.locator('#ws2-map-ctrl [data-act="clear-cohort"]').count(), 0, "Dragging Steer handle must NOT trigger map brush cohort");
  await page.screenshot({ path: path.join(OUT, "fixed-zh-steer.png") });
  await page.locator('#ws2-map-ctrl [data-act="reset-weights"]').click();
  await page.locator('#ws2-map-ctrl [data-act="steer"]').click();
  await settle(page, 120);

  // Check Story Beat 2 and Beat 3 in zh-Hans
  await page.locator('#ws2-story-nav [data-beat="2"]').click();
  await settle(page, 140);
  assert.deepEqual(await collectEnglishLeaks(), [], "zh-Hans Beat 2 must have zero English prose leaks");

  await page.locator('#ws2-story-nav [data-beat="3"]').click();
  await settle(page, 160);
  assert.deepEqual(await collectEnglishLeaks(), [], "zh-Hans Beat 3 Timeline must have zero English prose leaks");
  await assertDesktopBounds(page, "1920x1080 zh-Hans Beat 3");
  const zhDna = await page.evaluate(() => {
    const el = document.getElementById("dna-scroll");
    return { sh: el.scrollHeight, ch: el.clientHeight };
  });
  assert.ok(zhDna.sh <= zhDna.ch + 2, `zh-Hans Beat 3 DNA rows must fit after translation (${zhDna.sh} <= ${zhDna.ch})`);
  assert.match(await page.locator("#fq-canvas .fq-pair-tag.is-ab").textContent(), /相似度/, "Quadrant pair tag is translated");
  await page.screenshot({ path: path.join(OUT, "fixed-zh-beat3.png") });

  await page.locator('#ws2-fate-ctrl [data-vmode="beads"]').click();
  await settle(page, 120);
  assert.deepEqual(await collectEnglishLeaks(), [], "zh-Hans Beat 3 Beads must have zero English prose leaks");

  await page.locator('#ws2-story-nav [data-beat="4"]').click();
  await settle(page, 160);
  assert.deepEqual(await collectEnglishLeaks(), [], "zh-Hans Beat 4 must have zero English prose leaks");

  // Check Team A === Team B exclusion (阿根廷 cannot appear in Team B picker when A = 阿根廷)
  await page.goto(`${BASE}/#/styles?team=ARG`, { waitUntil: "domcontentloaded" });
  await page.locator(".ws2").waitFor();
  await settle(page, 160);
  assert.match(await page.locator("#ws2-pick-a .sel-val").innerText(), /阿根廷/);
  await page.locator("#ws2-pick-b .sel-btn").click();
  await settle(page, 100);
  const pickBTexts = await page.locator("#ws2-pick-b .sel-opt").allInnerTexts();
  assert.equal(pickBTexts.some((t) => t.includes("阿根廷")), false, "Team B dropdown must exclude Team A (阿根廷)");
  await page.screenshot({ path: path.join(OUT, "fixed-zh-pair-picker.png") });
  await page.keyboard.press("Escape");

  // Check Match Lab zh-Hans (Substrate, Role 4x4 Pivot, Matrix, Breaks)
  await page.goto(`${BASE}/#/lab/2026-M034-ECU-CUW?team=ECU`, { waitUntil: "domcontentloaded" });
  await page.locator(".lab-network-svg").waitFor();
  await settle(page, 180);
  assert.deepEqual(await collectEnglishLeaks(), [], "zh-Hans Match Lab Substrate must have zero English prose leaks");
  await page.locator('[data-layout="pivot"]').click();
  await settle(page, 120);
  assert.deepEqual(await collectEnglishLeaks(), [], "zh-Hans Match Lab Role 4x4 must have zero English prose leaks");
  await page.locator('[data-layout="matrix"]').click();
  await settle(page, 120);
  assert.deepEqual(await collectEnglishLeaks(), [], "zh-Hans Match Lab Matrix must have zero English prose leaks");
  await page.locator('[data-pane="breaks"]').click();
  await settle(page, 120);
  assert.deepEqual(await collectEnglishLeaks(), [], "zh-Hans Match Lab Line Breaks must have zero English prose leaks");

  await page.selectOption("#language-select", "en");
  await settle(page);

  // 10. 1440x900 laptop viewport bounds
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/#/story`, { waitUntil: "domcontentloaded" });
  await page.locator(".ws2").waitFor();
  await settle(page);
  const bounds1440 = await assertDesktopBounds(page, "1440x900");
  await page.screenshot({ path: path.join(OUT, "v3-overview-1440.png") });
  await page.goto(`${BASE}/#/styles?team=ECU&compare=USA`, { waitUntil: "domcontentloaded" });
  await page.locator(".dna-pin-row.is-a").waitFor();
  await settle(page);
  await assertDesktopBounds(page, "1440x900 ECU-USA");

  // 11. Secondary route #/method removes #ws2-topbar-slot and restores .topbar .tabs
  await page.goto(`${BASE}/#/method`, { waitUntil: "domcontentloaded" });
  await page.locator(".review-method").waitFor();
  await settle(page);
  const methodBar = await page.evaluate(() => ({
    slotCount: document.querySelectorAll("#ws2-topbar-slot").length,
    tabsVisible: getComputedStyle(document.querySelector(".topbar .tabs")).display !== "none",
  }));
  assert.equal(methodBar.slotCount, 0, "#/method must remove #ws2-topbar-slot");
  assert.equal(methodBar.tabsVisible, true, "#/method must restore .topbar .tabs");

  await page.goto(`${BASE}/#/styles`, { waitUntil: "domcontentloaded" });
  await page.locator(".ws2").waitFor();
  await settle(page);
  assert.equal(await page.locator("#ws2-topbar-slot").count(), 1, "#/styles must restore #ws2-topbar-slot");

  // 12. 390x844 mobile layout (no horizontal overflow)
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  const mob = await page.evaluate(() => ({
    iw: window.innerWidth,
    sw: document.documentElement.scrollWidth,
    panelCount: document.querySelectorAll(".ws2-panel").length,
  }));
  assert.ok(mob.sw <= mob.iw + 2, `390x844 horizontal overflow: ${mob.sw} > ${mob.iw}`);
  assert.equal(mob.panelCount, 5);
  await page.screenshot({ path: path.join(OUT, "v3-mobile-390.png") });

  await browser.close();

  assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join(" | ")}`);
  assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(" | ")}`);
  assert.equal(failedRequests.length, 0, `Failed requests: ${failedRequests.join(" | ")}`);

  console.log(JSON.stringify({ ok: true, bounds1920, bounds1440, mob }, null, 2));
})();
