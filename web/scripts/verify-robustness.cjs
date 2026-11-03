// Run: node scripts/verify-robustness.cjs. Uses supplied data, no network.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = { window: {}, document: { getElementById: () => ({}) }, URLSearchParams };
context.d3 = require(path.join(root, "js/d3.min.js"));
vm.createContext(context);
for (const file of ["data/core.js", "js/util.js", "js/analysis.js", "js/robustness.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const App = context.window.App, A = App.analysis, R = App.robustness;
const plain = (value) => JSON.parse(JSON.stringify(value));
const close = (actual, expected, label = "value") => assert.ok(Math.abs(actual - expected) < 1e-10, `${label}: ${actual} != ${expected}`);
const original = JSON.stringify(App.tm);
const ned = R.audit("NED", "CRO");
assert.equal(ned.valid, true);
assert.deepEqual(plain(ned.counts), [4, 4]);
assert.equal(ned.indicators.length, 10);
assert.equal(ned.matches.length, 8);
assert.equal(ned.base.rankA, 1);
assert.deepEqual(plain(R.summarize(ned.indicators)), { n: 10, min: 1, max: 2, top5: 10 });
assert.deepEqual(plain(R.summarize(ned.matches)), { n: 8, min: 1, max: 10, top5: 6 });

// An independent raw-data calculation checks the reference scale, means, RMS,
// competition rank and empirical pair percentile for every NED/CRO scenario.
const raw = Object.entries(App.tm).map(([key, row]) => ({ key, ...row }));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const population = App.dials.map((_, index) => {
  const values = raw.map((row) => row.dials[index]), mu = mean(values);
  return { mu, sd: Math.sqrt(mean(values.map((value) => (value - mu) ** 2))) || 1 };
});
function independentlyEvaluate(scenario, audit) {
  const scopeRows = raw.filter((row) => audit.scope === "group" ? row.stage === "Group" : audit.scope === "knockout" ? row.stage !== "Group" : true);
  const profiles = {};
  for (const team of App.teams) {
    const rows = scopeRows.filter((row) => row.team_id === team.id && row.key !== scenario.omittedKey);
    if (!rows.length) continue;
    profiles[team.id] = scenario.dials.map((dial) => {
      const index = App.dials.indexOf(dial), { mu, sd } = population[index];
      return mean(rows.map((row) => (row.dials[index] - mu) / sd));
    });
  }
  const distance = (first, second) => Math.sqrt(mean(profiles[first].map((value, index) => (value - profiles[second][index]) ** 2)));
  const pairDistance = distance(audit.a, audit.b);
  const allPairs = [], ids = Object.keys(profiles);
  ids.forEach((first, i) => ids.slice(i + 1).forEach((second) => allPairs.push(distance(first, second))));
  const rank = (id) => 1 + ids.filter((other) => other !== id && distance(id, other) < pairDistance - 1e-12).length;
  close(scenario.distance, pairDistance, `${scenario.id} RMS`);
  assert.equal(scenario.rankA, rank(audit.a));
  assert.equal(scenario.rankB, rank(audit.b));
  assert.equal(scenario.benchmarkPairs, allPairs.length);
  // Exclude only distances strictly lower; tolerance protects the selected pair's
  // own representation from last-bit floating point differences in reference sums.
  close(scenario.percentile, 1 - allPairs.filter((value) => value < pairDistance - 1e-12).length / allPairs.length, `${scenario.id} percentile`);
  scenario.gaps.forEach((gap, index) => {
    close(gap.a, profiles[audit.a][index]);
    close(gap.b, profiles[audit.b][index]);
    close(gap.difference, gap.a - gap.b);
    assert.ok(gap.share >= 0 && gap.share <= 1);
  });
  close(scenario.gaps.reduce((sum, gap) => sum + gap.share, 0), pairDistance > 0 ? 1 : 0);
}
for (const scenario of [ned.base, ...ned.indicators, ...ned.matches]) {
  independentlyEvaluate(scenario, ned);
  assert.equal(scenario.nearA.length, 47);
  assert.equal(scenario.nearB.length, 47);
  assert.ok(scenario.rankA >= 1 && scenario.rankA <= 47);
  assert.ok(scenario.rankB >= 1 && scenario.rankB <= 47);
  assert.ok(scenario.percentile >= 0 && scenario.percentile <= 1);
  assert.ok([...scenario.nearA, ...scenario.nearB].every((neighbor) => Number.isFinite(neighbor.distance)));
}
const reversed = R.audit("CRO", "NED");
for (const scenario of [ned.base, ...ned.indicators, ...ned.matches]) {
  const reverse = [reversed.base, ...reversed.indicators, ...reversed.matches].find((item) => item.id === scenario.id);
  close(scenario.distance, reverse.distance);
  close(scenario.percentile, reverse.percentile);
  assert.equal(scenario.rankA, reverse.rankB);
  assert.equal(scenario.rankB, reverse.rankA);
}
const group = R.audit("NED", "CRO", App.dials, "group");
assert.deepEqual(plain(group.counts), [3, 3]);
assert.equal(group.matches.length, 6);
independentlyEvaluate(group.matches[0], group);
const knockout = R.audit("NED", "CRO", App.dials, "knockout");
assert.equal(knockout.valid, true);
assert.equal(knockout.matches.length, 0);
assert.equal(knockout.notes.length, 2);
assert.equal(knockout.base.nearA.length, 31);
assert.equal(knockout.base.benchmarkPairs, 496);
independentlyEvaluate(knockout.base, knockout);
assert.equal(R.audit("NED", "IRQ", App.dials, "knockout").valid, false);
assert.equal(R.audit("NED", "NED").valid, false);
assert.equal(R.audit("missing", "CRO").valid, false);
const two = R.audit("NED", "CRO", App.dials.slice(0, 2));
assert.equal(two.indicators.length, 0);
assert.equal(two.matches.length, 8);
assert.equal(two.notes.length, 1);
assert.deepEqual(plain(R.summarize([])), { n: 0, min: null, max: null, top5: 0 });
assert.equal(R.audit("ESP", "GER").matches.length, 12);
assert.equal(R.audit("MEX", "SWE").matches.length, 9);
assert.equal(JSON.stringify(ned), JSON.stringify(R.audit("NED", "CRO")), "audit must be deterministic");
assert.equal(JSON.stringify(App.tm), original, "audit must not mutate imported records");
// Synthetic profiles isolate equal-distance and zero-distance behavior.
const originalSpace = A.space, originalRows = A.rows;
try {
  A.rows = () => [{}];
  A.space = () => ({ team: { NED: [0, 0], CRO: [1, 0], GER: [-1, 0] }, match: {} });
  const tied = R.audit("NED", "CRO", App.dials.slice(0, 2));
  assert.equal(tied.base.rankA, 1, "equal distances share a competition rank");
  close(tied.base.percentile, 1);
  A.space = () => ({ team: { NED: [0, 0], CRO: [0, 0], GER: [1, 0] }, match: {} });
  const identical = R.audit("NED", "CRO", App.dials.slice(0, 2));
  close(identical.base.distance, 0);
  assert.ok(identical.base.gaps.every((gap) => gap.share === 0));
  A.space = () => ({ team: { NED: [0, 0] }, match: {} });
  assert.equal(R.audit("NED", "CRO", App.dials.slice(0, 2)).valid, false);
} finally {
  A.space = originalSpace;
  A.rows = originalRows;
}
console.log("Robustness verification passed: independent RMS / ranks / percentile, symmetry, scopes, omission counts, bounds, determinism.");
console.log(JSON.stringify({ nedCro: { baselineRank: ned.base.rankA, indicators: plain(R.summarize(ned.indicators)), matches: plain(R.summarize(ned.matches)) }, knockoutNeighbors: knockout.base.nearA.length }));

// Controller regression with a minimal DOM/render adapter. This deliberately
// exercises real click handlers and route updates; graphical appearance remains
// a browser QA concern. It catches stale closures after successive rebuilds.
const makeNode = (dataset = {}) => ({
  dataset, clientWidth: 900, innerHTML: "", textContent: "", attributes: {}, classes: {},
  setAttribute(key, value) { this.attributes[key] = value; },
  classList: { toggle() {} },
});
const viewRoot = {
  html: "", nodes: new Map(), groups: {},
  set innerHTML(value) {
    this.html = value; this.nodes = new Map();
    this.groups = {
      "[data-dial]": App.dials.map((_, index) => makeNode({ dial: String(index) })),
      "[data-test]": ["indicators", "matches"].map((test) => makeNode({ test })),
      "[data-direction]": ["a", "b"].map((direction) => makeNode({ direction })),
    };
  },
  get innerHTML() { return this.html; },
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, makeNode());
    return this.nodes.get(selector);
  },
  querySelectorAll(selector) { return this.groups[selector] || []; },
};
const noOpSelection = () => {
  let selection;
  selection = new Proxy({}, { get: () => () => selection });
  return selection;
};
context.d3 = { ...context.d3, select: noOpSelection };
context.window.matchMedia = () => ({ matches: true });
App.cleanup = () => {};
App.onResize = () => {};
vm.runInContext(fs.readFileSync(path.join(root, "js/view-robustness.js"), "utf8"), context, { filename: "js/view-robustness.js" });
let viewParams = {}, latestAudit;
const originalAudit = R.audit;
R.audit = (...args) => { latestAudit = originalAudit(...args); return latestAudit; };
const controller = App.views.robustness(viewRoot, viewParams, "NED", "CRO");
App.go = (hash) => {
  viewParams = Object.fromEntries(new URLSearchParams(hash.split("?")[1] || ""));
  controller.update(viewParams);
};
const expectDials = (count) => {
  assert.equal(latestAudit.dials.length, count);
  assert.ok(viewRoot.innerHTML.includes(`${count} selected style indicators`));
};
for (const [dial, count] of [[0, 9], [1, 8], [1, 9], [0, 10]]) {
  viewRoot.querySelectorAll("[data-dial]")[dial].onclick();
  expectDials(count);
}
for (const scope of ["group", "knockout", "group", "all"]) {
  viewParams = { ...viewParams, scope };
  controller.update(viewParams);
  assert.equal(latestAudit.scope, scope);
  expectDials(10);
  assert.equal(latestAudit.matches.length, scope === "all" ? 8 : scope === "group" ? 6 : 0);
}
viewRoot.querySelectorAll("[data-test]")[1].onclick();
assert.equal(viewParams.test, "matches");
assert.ok(viewRoot.querySelector("[data-chart-caption]").textContent.includes("team–match"));
viewRoot.querySelectorAll("[data-direction]")[1].onclick();
assert.equal(viewParams.direction, "b");
assert.ok(viewRoot.querySelector("[data-chart-caption]").textContent.startsWith("Netherlands"));
const omitted = latestAudit.matches.find((scenario) => scenario.omittedTeam === "NED");
viewParams = { ...viewParams, scenario: omitted.id };
controller.update(viewParams);
const detail = viewRoot.querySelector("[data-detail]").innerHTML;
const labHref = detail.match(/href="(#\/lab\/[^\"]+)"/)[1].replaceAll("&amp;", "&");
assert.ok(labHref.startsWith(`#/lab/${App.tm[omitted.omittedKey].match_id}?`));
const labParams = new URLSearchParams(labHref.split("?")[1]);
assert.equal(labParams.get("team"), "NED");
assert.ok(labParams.get("return").startsWith("#/robustness/NED/CRO?"));
assert.ok(labParams.get("return").includes(encodeURIComponent(omitted.id)));
R.audit = originalAudit;
console.log("Robustness controller regression passed: two metric removals/restores, repeated scope rebuilds, tabs, reverse ranks, lab return context.");
