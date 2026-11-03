// Run with node web/scripts/verify-i18n.cjs from the project root,
// or node scripts/verify-i18n.cjs from web/. No dependencies or browser required.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const languages = ["es", "fr", "pt", "de", "it", "ar", "ja", "ko", "zh-Hans", "zh-Hant"];
const chineseLocales = ["zh-Hans", "zh-Hant"];
const read = (file) => {
  const location = path.join(root, file);
  assert.ok(fs.existsSync(location), `Required localization file is missing: ${file}`);
  return fs.readFileSync(location, "utf8");
};
const sources = Object.fromEntries([
  "data/core.js", "data/matches/2026-M022-ENG-CRO.js",
  "js/i18n-catalogs.js", "js/i18n-glossary.js", "js/i18n.js",
].map((file) => [file, read(file)]));
const plain = (value) => JSON.parse(JSON.stringify(value));
const placeholderBag = (value) => (value.match(/\{\d+\}/g) || []).sort();

function fakeElement(name = "div", children = []) {
  const attributes = new Map();
  const element = {
    nodeType: 1, localName: name, childNodes: children, parentElement: null,
    getAttribute: (key) => attributes.has(key) ? attributes.get(key) : null,
    setAttribute: (key, value) => attributes.set(key, String(value)),
    closest: () => null,
    contains: (node) => node === element || children.some((child) => child === node || child.contains?.(node)),
    addEventListener: () => {},
  };
  for (const child of children) child.parentElement = element;
  // A translated string must never enter the HTML parser, even if its value has tags.
  Object.defineProperty(element, "innerHTML", { set() { throw new Error("Translation attempted an unsafe innerHTML write"); } });
  return element;
}

function createHarness({ stored = null, withDOM = false, storageBlocked = false } = {}) {
  const writes = [], events = [], textNode = { nodeType: 3, nodeValue: "Pass network", parentElement: null };
  const html = fakeElement("html", [textNode]);
  const window = {
    navigator: { language: "zh-CN", languages: ["zh-CN", "ja-JP"] },
    localStorage: {
      getItem(key) { assert.equal(key, "style-twins-language"); if (storageBlocked) throw new Error("Storage unavailable"); return stored; },
      setItem(key, value) { if (storageBlocked) throw new Error("Storage unavailable"); writes.push([key, value]); },
    },
    dispatchEvent: (event) => { events.push(event); return true; },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  };
  const context = { window, navigator: window.navigator, Intl, console };
  if (withDOM) window.document = context.document = { documentElement: html, readyState: "complete" };
  vm.createContext(context);
  const load = (file) => vm.runInContext(sources[file], context, { filename: file });
  load("data/core.js");
  load("data/matches/2026-M022-ENG-CRO.js");
  window.App = { teams: window.WC.teams };
  load("js/i18n-catalogs.js");
  load("js/i18n-glossary.js");
  load("js/i18n.js");
  return { context, window, engine: window.App.i18n, html, textNode, events, writes };
}

function checkDictionary(dictionaries, label) {
  assert.ok(dictionaries && typeof dictionaries === "object", `${label}: locale dictionaries exist`);
  assert.deepEqual(Object.keys(dictionaries).sort(), [...languages].sort(), `${label}: exactly the ${languages.length} supported translations`);
  const reference = Object.keys(dictionaries[languages[0]]).sort();
  assert.ok(reference.length > 0, `${label}: keys are not empty`);
  for (const locale of languages) {
    const actualKeys = Object.keys(dictionaries[locale]);
    const expectedSet = new Set(reference), actualSet = new Set(actualKeys);
    const missing = reference.filter((key) => !actualSet.has(key));
    const extra = actualKeys.filter((key) => !expectedSet.has(key));
    assert.ok(!missing.length && !extra.length, `${label}/${locale}: key parity failed (${missing.length} missing, ${extra.length} extra). Examples: ${JSON.stringify({ missing: missing.slice(0, 3), extra: extra.slice(0, 3) })}`);
    for (const key of reference) {
      const translated = dictionaries[locale][key];
      assert.ok(key.trim(), `${label}/${locale}: non-empty source key`);
      assert.equal(typeof translated, "string", `${label}/${locale}/${key}: text value`);
      assert.ok(translated.trim(), `${label}/${locale}/${key}: non-empty translation`);
      assert.deepEqual(placeholderBag(translated), placeholderBag(key), `${label}/${locale}/${key}: placeholders preserved, including multiplicity`);
    }
  }
  return reference.length;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const main = createHarness();
const { window, engine } = main;
const catalogKeys = checkDictionary(window.STYLE_TWINS_MESSAGES, "Messages");
const glossaryKeys = checkDictionary(window.STYLE_TWINS_GLOSSARY, "Glossary");
for (const locale of languages) {
  for (const key of ["Pass network", "Pass matrix", "Expected goals", "Line breaks", "Through", "Around", "Over", "England", "Scotland"]) {
    assert.ok(window.STYLE_TWINS_GLOSSARY[locale][key]?.trim(), `Glossary/${locale}: required football or region term ${key}`);
  }
}

// Reordering is valid, omission/duplication is not. Compare bags, not sets.
assert.deepEqual(placeholderBag("{0} then {1} and {0}"), placeholderBag("{1} / {0} / {0}"));
assert.notDeepEqual(placeholderBag("{0} then {1} and {0}"), placeholderBag("{0} and {1}"));
assert.notDeepEqual(placeholderBag("{0} and {1}"), placeholderBag("{0} and {2}"));

assert.equal(engine.locales[0], "en", "English remains the first/default locale");
assert.deepEqual(plain(engine.locales).sort(), ["en", ...languages].sort());
assert.equal(engine.locale, "en", "New visitors start in English, ignoring zh-CN navigator language");
assert.equal(engine.t("  Pass network\n"), "  Pass network\n", "English output is the literal source");
assert.equal(engine.setLocale("xx"), false, "Unsupported locale rejected");
assert.equal(engine.locale, "en");
assert.equal(engine.setLocale("es"), true);
assert.equal(engine.setLocale("invalid"), false);
assert.equal(engine.locale, "es", "Invalid change retains the valid current language");
assert.equal(main.writes.at(-1)[1], "es", "Invalid language is not persisted");
assert.equal(createHarness({ stored: "unsupported" }).engine.locale, "en", "Invalid saved language falls back to English");
assert.equal(createHarness({ stored: "de" }).engine.locale, "de", "Explicit saved preference is honored");
for (const locale of chineseLocales) {
  assert.equal(createHarness({ stored: locale }).engine.locale, locale, `${locale}: explicit Chinese preference survives a new session`);
}
const blocked = createHarness({ storageBlocked: true }).engine;
assert.equal(blocked.locale, "en");
assert.equal(blocked.setLocale("ja"), true, "Storage failure does not break switching");

assert.deepEqual(plain(engine.template("  England   −1.28 xG vs Croatia +0.50  ")), {
  key: "{0} {1} xG vs {2} {3}", values: ["England", "−1.28", "Croatia", "+0.50"],
});
assert.deepEqual(plain(engine.template("England 2–1 France")), {
  key: "{0} {1}–{2} {3}", values: ["England", "2", "1", "France"],
});
assert.deepEqual(plain(engine.template("ENGLAND −1.28 xG vs CROATIA +0.50")), {
  key: "{0} {1} xG vs {2} {3}", values: ["ENGLAND", "−1.28", "CROATIA", "+0.50"],
}, "Uppercase team labels use the same template as canonical names");
assert.deepEqual(plain(engine.template("ENG +1.25; CRO -0.50; 62.5%")), {
  key: "{0} {1}; {2} {3}; {4}", values: ["ENG", "+1.25", "CRO", "-0.50", "62.5%"],
});
assert.deepEqual(plain(engine.template("Compare {7} with {7}")), {
  key: "Compare {0} with {1}", values: ["{7}", "{7}"],
});
assert.deepEqual(plain(engine.template("Konsa → Stones: 6 passes")), {
  key: "{0} → {1}: {2} passes", values: ["Konsa", "Stones", "6"],
});
assert.deepEqual(plain(engine.template("M22 · Full-match pass counts")), {
  key: "M{0} · Full-match pass counts", values: ["22"],
}, "Standalone match labels tokenize their numeric suffix");
assert.deepEqual(plain(engine.template("Englandish 2026_M022 xG123")), {
  key: "Englandish 2026_M022 xG123", values: [],
}, "Names and numbers inside identifiers are not partial tokens");

// Exercise substitution directly, including reordered and reused placeholders.
const probe = "Invariant probe England −1.28 Croatia +0.50";
const probeKey = engine.template(probe).key;
const previous = window.STYLE_TWINS_MESSAGES.es[probeKey];
window.STYLE_TWINS_MESSAGES.es[probeKey] = "{2}: {3}; {0}: {1}; repeat {1}";
assert.equal(engine.t(probe), `${engine.t("Croatia")}: +0.50; ${engine.t("England")}: −1.28; repeat −1.28`);
assert.equal(engine.t(`  ${probe}\n`), `  ${engine.t(probe)}\n`, "Outer whitespace is preserved");
if (previous === undefined) delete window.STYLE_TWINS_MESSAGES.es[probeKey];
else window.STYLE_TWINS_MESSAGES.es[probeKey] = previous;

// Both Chinese scripts need real football translations, not English fallback,
// while signed values, percentages and canonical identifiers remain untouched.
const chineseLabels = {};
for (const locale of chineseLocales) {
  engine.setLocale(locale);
  assert.equal(main.writes.at(-1)[1], locale, `${locale}: language preference persisted`);
  chineseLabels[locale] = {};
  for (const label of ["Pass network", "Expected goals"]) {
    const translated = engine.t(label);
    assert.notEqual(translated, label, `${locale}/${label}: must not fall back to English`);
    assert.match(translated, /\p{Script=Han}/u, `${locale}/${label}: must contain Chinese text`);
    assert.match(translated, /球/u, `${locale}/${label}: football term retains its meaning`);
    chineseLabels[locale][label] = translated;
  }
  assert.equal(engine.t("Spain"), "西班牙", `${locale}: localized Spain label resolves for team search`);
  assert.equal(engine.t("ESP"), "ESP", `${locale}: country display names do not change team IDs`);
  const source = "Chinese numeric probe Spain −1.28 62.5% +0.50";
  const key = engine.template(source).key;
  const messages = window.STYLE_TWINS_MESSAGES[locale];
  const oldValue = messages[key];
  const prefix = locale === "zh-Hans" ? "占比" : "佔比";
  messages[key] = `${prefix} {2}；{0}：{1}；差值 {3}`;
  assert.equal(engine.t(source), `${prefix} 62.5%；西班牙：−1.28；差值 +0.50`, `${locale}: reordered placeholders preserve exact numeric strings`);
  if (oldValue === undefined) delete messages[key]; else messages[key] = oldValue;
}
for (const label of ["Pass network", "Expected goals"]) {
  assert.notEqual(chineseLabels["zh-Hans"][label], chineseLabels["zh-Hant"][label], `${label}: Simplified and Traditional script variants are distinct`);
}

const unknown = "A deliberately unknown analysis label zzqv";
assert.equal(engine.t(unknown), unknown, "Unknown text falls back to its English source");
assert.ok(engine.missing.has(engine.template(unknown).key), "Unknown labels are observable for coverage checks");

// Translating UI labels must not translate canonical names, IDs, numerical data,
// match source paths, event fields or URL state in the underlying dataset.
const canonical = { core: window.WC, match: window.WC_MATCH["2026-M022-ENG-CRO"] };
const before = JSON.stringify(canonical);
deepFreeze(canonical);
const literals = ["−1.28", "+0.50", "62.5%", "ENG", "CRO", "2026-M022-ENG-CRO", "#/lab/2026-M022-ENG-CRO?team=ENG&min=4", "Konsa", "Stones", "js/view-lab.js"];
for (const locale of ["en", ...languages]) {
  assert.equal(engine.setLocale(locale), true);
  for (const literal of literals) assert.equal(engine.t(literal), literal, `${locale}: canonical literal ${literal}`);
  for (const team of window.WC.teams) { engine.t(team.name); engine.t(team.id); }
  for (const side of canonical.match.teams) {
    engine.t(`${side.name} ${side.stats.xg} xG`);
    for (const player of side.players) engine.t(player.short);
  }
}
assert.equal(JSON.stringify(canonical), before, "All canonical data remains byte-for-byte identical");

// Protect literal identifiers even from a mistaken translation entry.
engine.setLocale("es");
for (const literal of ["ENG", "Konsa", "M22", "GK", "DF", "MF", "FW", "#/lab/2026-M022-ENG-CRO?team=ENG&min=4"]) {
  const messages = window.STYLE_TWINS_MESSAGES.es;
  const oldValue = messages[literal];
  messages[literal] = "Incorrect identifier translation";
  assert.equal(engine.t(literal), literal, `Canonical identifier guard: ${literal}`);
  if (oldValue === undefined) delete messages[literal]; else messages[literal] = oldValue;
}

// Minimal DOM boundary: reversible translation is a text-node operation, never
// an HTML write. Root's browser QA separately checks real DOM/layout behavior.
const dom = createHarness({ withDOM: true });
assert.equal(dom.html.lang, "en");
assert.equal(dom.html.dir, "ltr");
dom.engine.setLocale("ar");
assert.equal(dom.html.lang, "ar");
assert.equal(dom.html.dir, "rtl");
assert.equal(dom.textNode.nodeValue, dom.engine.t("Pass network"));
assert.equal(dom.events.at(-1).type, "languagechange");
assert.equal(dom.events.at(-1).detail.locale, "ar");
dom.engine.setLocale("fr");
assert.equal(dom.html.dir, "ltr");
assert.equal(dom.textNode.nodeValue, dom.engine.t("Pass network"), "Translation uses original source when switching languages");
for (const locale of chineseLocales) {
  dom.engine.setLocale(locale);
  assert.equal(dom.html.lang, locale);
  assert.equal(dom.html.dir, "ltr", `${locale}: Chinese interface keeps left-to-right layout`);
  assert.equal(dom.textNode.nodeValue, dom.engine.t("Pass network"), `${locale}: DOM uses the correct catalog`);
  assert.match(dom.textNode.nodeValue, /\p{Script=Han}/u);
  assert.equal(dom.writes.at(-1)[1], locale, `${locale}: DOM language switch persists preference`);
  dom.engine.setLocale("en");
  assert.equal(dom.textNode.nodeValue, "Pass network", `${locale}: returning to English restores original text exactly`);
}
dom.engine.setLocale("en");
assert.equal(dom.textNode.nodeValue, "Pass network", "Returning to English restores the exact original text");
const markup = '<img src="x" onerror="alert(1)">literal';
dom.window.STYLE_TWINS_MESSAGES.es["Untrusted translation probe"] = markup;
dom.textNode.nodeValue = "Untrusted translation probe";
dom.engine.setLocale("es");
assert.equal(dom.textNode.nodeValue, markup, "Markup-looking translation is assigned as literal text");
assert.equal(dom.html.childNodes.length, 1, "Translation creates no markup nodes");
dom.engine.setLocale("en");
assert.equal(dom.textNode.nodeValue, "Untrusted translation probe");

console.log("Localization checks passed");
console.log(JSON.stringify({ defaultLocale: "en", translatedLocales: languages.length, chineseLocales, catalogKeysPerLocale: catalogKeys, glossaryKeysPerLocale: glossaryKeys, canonicalTeamCount: window.WC.teams.length, canonicalMatch: canonical.match.id, reversibleDOM: true, literalMarkup: true }, null, 2));
