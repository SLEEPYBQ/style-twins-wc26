const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { window: { App: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/match-pulse-data.js'), 'utf8'), context);
for (const file of fs.readdirSync(path.join(root, 'data/matches'))) vm.runInContext(fs.readFileSync(path.join(root, 'data/matches', file), 'utf8'), context);
const P = context.window.App.matchPulseData, matches = Object.values(context.window.WC_MATCH);
let attempts = 0, supplemental = 0;
for (const match of matches) {
  const data = P.prepare(match);
  assert.equal(data.coverage.length, 2);
  for (const c of data.coverage) assert.equal(c.recorded, c.reported, match.id);
  const full = P.select(data);
  assert.equal(full.attempts.length, data.attempts.length);
  for (let side = 0; side < 2; side++) {
    assert.equal(data.goals.filter(e => e.scoringSide === side).length, match.score[side], `${match.id} score`);
    assert.equal(data.cumulative[side].at(-1).count, match.teams[side].stats.shots);
    for (const field of ['outcome', 'delivery', 'body']) assert.equal(P.group(full.attempts.filter(e => e.team === side), field).reduce((n, r) => n + r.count, 0), match.teams[side].stats.shots);
  }
  assert.equal(data.periods.map(p => P.select(data, p.start, p.end).attempts.length).reduce((a, b) => a + b, 0), data.attempts.length);
  const positions = P.positions(data);
  for (const period of data.periods) {
    assert.ok(positions.includes(period.start) && positions.includes(period.end), 'Preset boundaries must not snap to another half');
    assert.ok(P.select(data, period.start, period.end).attempts.every(e => e.period === period.id));
  }
  assert.ok(data.events.every((e, i) => i === 0 || e.x >= data.events[i - 1].x));
  assert.ok(data.events.every(e => Number.isFinite(e.x)));
  attempts += data.attempts.length; supplemental += data.supplementals.length;
}
assert.equal(matches.length, 104); assert.equal(attempts, 2571); assert.equal(supplemental, 6);
const england = P.prepare(matches.find(m => m.number === 22));
const stoppage = england.events.find(e => e.label === "45+5'");
const minute46 = england.events.find(e => e.label === "46'");
assert.ok(stoppage.x < minute46.x, 'First-half stoppage precedes the second half');
assert.equal(stoppage.period, 0);
assert.equal(P.select(england, 0, 0).attempts.length, 0);
assert.equal(P.select(england, 30, 10).attempts.length, P.select(england, 10, 30).attempts.length);
console.log(`Pulse checks passed: ${matches.length} fixtures, ${attempts} recorded attempts, ${supplemental} supplemental score events excluded; all scores and team totals reconcile.`);
