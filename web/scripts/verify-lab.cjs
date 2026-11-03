// Run with node scripts/verify-lab.cjs from any working directory.
// Checks the actual lab aggregation and the source distributions, without a browser.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = {
  window: {},
  document: { getElementById: () => ({}) },
  URLSearchParams,
  d3: require(path.join(root, "js/d3.min.js")),
};
vm.createContext(context);
const load = (file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
for (const file of ["data/core.js", "data/sources.js", "js/util.js", "js/analysis.js", "js/view-lab.js"]) load(file);
for (const file of fs.readdirSync(path.join(root, "data/matches")).filter((file) => file.endsWith(".js"))) load(`data/matches/${file}`);
const App = context.window.App;
const matches = Object.values(context.window.WC_MATCH);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} differs from ${expected}`);

async function main() {
  assert.equal(matches.length, 104, "Expected the full 104-match dataset");
  let teamMatches = 0, recordedPasses = 0;
  for (const match of matches) {
    assert.equal(match.teams.length, 2, `${match.id}: two sides`);
    for (const team of match.teams) {
      teamMatches++;
      const label = `${match.id} / ${team.team_id}`;
      const directedKeys = new Set();
      for (const edge of team.edges) {
        assert.equal(edge.length, 3, `${label}: [sender, receiver, count]`);
        const [from, to, count] = edge;
        assert.ok(Number.isInteger(from) && from >= 0 && from < team.players.length, `${label}: sender index ${from}`);
        assert.ok(Number.isInteger(to) && to >= 0 && to < team.players.length, `${label}: receiver index ${to}`);
        assert.notEqual(from, to, `${label}: a recorded pass must connect different players`);
        assert.ok(Number.isInteger(count) && count > 0, `${label}: positive integer pass count`);
        const key = `${from}-${to}`;
        assert.ok(!directedKeys.has(key), `${label}: one matrix cell per directed pair ${key}`);
        directedKeys.add(key);
      }
      const network = App.labNetwork(team);
      const volume = sum(team.edges.map((edge) => edge[2]));
      assert.equal(network.volume, volume, `${label}: all recorded passes retained`);
      assert.equal(network.edges.length, team.edges.length, `${label}: all valid directed links retained`);
      assert.equal(network.nodes.length, team.players.length, `${label}: all players retained`);
      assert.equal(sum(network.nodes.map((node) => node.incoming)), volume, `${label}: incoming conservation`);
      assert.equal(sum(network.nodes.map((node) => node.outgoing)), volume, `${label}: outgoing conservation`);
      assert.equal(sum(network.nodes.map((node) => node.involvement)), 2 * volume, `${label}: two endpoints per pass`);
      close(sum(network.nodes.map((node) => node.share)), volume ? 1 : 0, `${label}: endpoint-share denominator`);
      assert.equal(sum(network.pairs.map((pair) => pair.total)), volume, `${label}: reciprocal-pair conservation`);
      for (const node of network.nodes) {
        assert.equal(node.involvement, node.incoming + node.outgoing, `${label}: player ${node.index} involvement`);
        close(node.share, volume ? node.involvement / (2 * volume) : 0, `${label}: player ${node.index} share`);
      }
      for (const pair of network.pairs) {
        assert.equal(pair.total, pair.ab + pair.ba, `${label}: two directed counts in reciprocal pair`);
        assert.equal(pair.ab, sum(team.edges.filter(([a, b]) => a === pair.a && b === pair.b).map((edge) => edge[2])), `${label}: forward pair count`);
        assert.equal(pair.ba, sum(team.edges.filter(([a, b]) => a === pair.b && b === pair.a).map((edge) => edge[2])), `${label}: reverse pair count`);
      }
      const lb = team.lb;
      assert.ok(lb && Number.isInteger(lb.att) && lb.att >= 0, `${label}: line-break attempts`);
      assert.ok(Number.isInteger(lb.cmp) && lb.cmp >= 0 && lb.cmp <= lb.att, `${label}: line-break completion bounds`);
      assert.deepEqual(Object.keys(lb.dir).sort(), ["around", "over", "through"], `${label}: three route categories`);
      assert.deepEqual(Object.keys(lb.lines).sort(), ["back", "fwd", "mid"], `${label}: three target-unit categories`);
      for (const count of [...Object.values(lb.dir), ...Object.values(lb.lines)]) assert.ok(Number.isInteger(count) && count >= 0, `${label}: non-negative marginal count`);
      assert.equal(sum(Object.values(lb.dir)), lb.att, `${label}: route marginal sums to attempts`);
      assert.equal(sum(Object.values(lb.lines)), lb.att, `${label}: target-unit marginal sums to attempts`);
      assert.equal(lb.cmp, team.stats.line_breaks, `${label}: completed line breaks match the team report`);
      recordedPasses += volume;
    }
  }
  assert.equal(teamMatches, 208);
  assert.equal(recordedPasses, 84308, "Known aggregate recorded pass volume");

  const england = context.window.WC_MATCH["2026-M022-ENG-CRO"].teams.find((team) => team.team_id === "ENG");
  const fixture = App.labNetwork(england);
  assert.equal(fixture.volume, 414, "England M022 recorded network passes");
  assert.equal(fixture.edges.length, 114, "England M022 directed connections");
  const konsa = fixture.nodes.find((node) => node.player.short === "Konsa");
  assert.equal(konsa.incoming, 55);
  assert.equal(konsa.outgoing, 66);
  assert.equal(konsa.involvement, 121);
  close(konsa.share, 121 / 828, "Konsa endpoint share");
  assert.equal(england.lb.att, 116);
  assert.equal(england.lb.cmp, 82);

  // An isolated player must not produce NaN or an invented connection/share.
  const isolated = App.labNetwork({ players: [{ short: "Isolated", num: 1, role: "GK" }], edges: [] });
  assert.equal(isolated.volume, 0);
  assert.equal(isolated.edges.length, 0);
  assert.equal(isolated.pairs.length, 0);
  assert.equal(isolated.nodes[0].incoming, 0);
  assert.equal(isolated.nodes[0].outgoing, 0);
  assert.equal(isolated.nodes[0].involvement, 0);
  assert.equal(isolated.nodes[0].share, 0);
  const empty = App.labNetwork({ players: [], edges: [] });
  assert.equal(empty.volume, 0);
  assert.equal(empty.nodes.length, 0);

  // Exercise the real view template using the real string-valued shootout fields.
  // The line-break pane needs only these small DOM stubs, not a chart/browser engine.
  const shootouts = matches.filter((match) => match.pens);
  assert.equal(shootouts.length, 3);
  for (const match of shootouts) {
    assert.equal(typeof match.pens, "string", `${match.id}: source shootout value is text`);
    const pane = { innerHTML: "" };
    const picker = {};
    const host = {
      innerHTML: "",
      querySelector: (selector) => selector === "#lab-pane" ? pane : picker,
      querySelectorAll: () => [],
    };
    App.views.lab(host, { pane: "breaks" }, match.id);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(host.innerHTML.includes(App.esc(match.pens)), `${match.id}: shootout text rendered without array assumptions`);
    assert.ok(host.innerHTML.includes("Match intelligence"), `${match.id}: main view rendered`);
    assert.ok(pane.innerHTML.includes("Opposition unit targeted"), `${match.id}: detail pane rendered`);
    assert.ok(!host.innerHTML.includes("Match data is unavailable"), `${match.id}: no async render error`);
    App._stop?.();
  }
  console.log("Match Lab checks passed");
  console.log(JSON.stringify({ matches: matches.length, teamMatches, recordedPasses, englandFixture: { passes: fixture.volume, directedConnections: fixture.edges.length }, shootoutViews: shootouts.length, zeroEdgeCases: 2 }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
