// Run with node scripts/verify-analysis.cjs from any working directory.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = { window: {}, document: { getElementById: () => ({}) }, URLSearchParams };
context.d3 = require(path.join(root, "js/d3.min.js"));
vm.createContext(context);
for (const file of ["data/core.js", "js/util.js", "js/analysis.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const App = context.window.App;
const A = App.analysis;
const plain = (value) => JSON.parse(JSON.stringify(value));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);

assert.equal(A.records.length, 208);
assert.equal(A.records.filter((row) => row.stage === "Group").length, 144);
assert.equal(A.rows("NED", "group").length, 3);
assert.equal(A.rows("NED", "knockout").length, 1);
assert.equal(A.rows("INVALID").length, 0);
assert.deepEqual(plain(A.readDials({ dials: "3,0,3,9,999,no,-1,2.5" })), [App.dials[0], App.dials[3], App.dials[9]]);
assert.equal(A.readDials({ dials: "3" }).length, 10);
assert.equal(A.readDials({ dials: ",,," }).length, 10);
const query = A.query([App.dials[3], App.dials[0]], { scope: "group", team: "NED", empty: "", skip: null });
assert.deepEqual(plain(A.readDials(new URLSearchParams(query))), [App.dials[0], App.dials[3]]);
assert.equal(new URLSearchParams(query).get("scope"), "group");
assert.equal(new URLSearchParams(query).has("empty"), false);

const ned = A.summary(A.rows("NED"));
close(ned.gd, 1.5);
close(ned.xg, 1.25);
close(ned.quality, 5 / 46);
close(A.summary(A.rows("NED", "group")).gd, 2);
close(A.summary(A.rows("NED", "knockout")).gd, 0);
const empty = A.summary([]);
assert.equal(empty.n, 0);
assert.equal(empty.gd, null);
assert.equal(empty.quality, null);
assert.ok(Object.values(empty.model).every((value) => value === null));
assert.equal(A.metric({ xg: 0, shots: 0 }, "quality"), null);
assert.equal(A.metric({ goals: 0, goals_opp: 0 }, "gd"), 0);
assert.equal(A.metric({ xg: null, xga: 0 }, "xgd"), null);
assert.equal(A.summary([{ xg: 1, shots: 1 }, { xg: 1, shots: 9 }]).quality, 0.2);

const knockout = A.space(App.dials, "knockout");
assert.equal(Object.keys(knockout.team).length, 32);
assert.equal(knockout.team.IRQ, undefined);
const twins = A.twinTable(knockout);
assert.equal(twins.pairs, 496);
assert.equal(twins.near.NED.length, 31);
assert.ok(twins.near.NED.every((neighbor) => neighbor.sim >= 0 && neighbor.sim <= 1));
const firstNedGroup = A.rows("NED", "group")[0];
const candidateList = A.nearest(firstNedGroup.key, App.dials, "group", 200);
assert.ok(candidateList.length > 0);
assert.ok(candidateList.every(({ row }) => row.team_id !== "NED" && row.match_id !== firstNedGroup.match_id && row.stage === "Group"));
assert.ok(candidateList.every((candidate, index) => index === 0 || candidate.distance >= candidateList[index - 1].distance));
close(A.distance(firstNedGroup.key, firstNedGroup.key, App.dials), 0);
assert.equal(A.distance("missing", firstNedGroup.key, App.dials), null);
assert.deepEqual(plain(A.nearest("missing", App.dials)), []);
const opponentRows = A.rows(firstNedGroup.opp_id).filter((row) => row.match_id !== firstNedGroup.match_id);
const opponent = A.opponent(firstNedGroup);
assert.equal(opponent.n, opponentRows.length);
close(opponent.xga, opponentRows.reduce((sum, row) => sum + row.xga, 0) / opponentRows.length);
assert.equal(A.opponent(null).n, 0);
assert.equal(A.opponent(null).xga, null);

console.log("Analysis regression checks passed");
console.log(JSON.stringify({ records: A.records.length, knockoutTeams: Object.keys(knockout.team).length, netherlands: plain(ned), nearest: plain(candidateList[0]) }, null, 2));
