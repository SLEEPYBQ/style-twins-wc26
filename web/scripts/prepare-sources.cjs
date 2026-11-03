// Rebuild source links and local flag assets from the public data providers.
// Usage: node scripts/prepare-sources.cjs
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const csvUrl = "https://raw.githubusercontent.com/Alamyy/Worldcup26/main/data/csv/matches.csv";

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  return response.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(field.replace(/\r$/, ""));
      field = "";
      if (char === "\n") { rows.push(row); row = []; }
    } else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  if (quoted) throw new Error("Unterminated field in upstream CSV");
  const headers = rows.shift();
  return rows.filter((values) => values.length > 1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}

async function main() {
  const context = { window: {} };
  vm.runInNewContext(await fs.readFile(path.join(root, "data/core.js"), "utf8"), context);
  const matches = context.window.WC.matches;
  const table = parseCsv(await download(csvUrl));
  const upstream = new Map(table.map((row) => [row.match_id, row]));
  if (upstream.size !== table.length) throw new Error("Duplicate match IDs in upstream CSV");
  const sources = {};
  for (const match of matches) {
    const row = upstream.get(match.id);
    if (!row || row.home_team_id !== match.home || row.away_team_id !== match.away || row.date !== match.date) {
      throw new Error(`Source metadata does not match local record ${match.id}`);
    }
    if (Number.parseInt(row.home_score, 10) !== match.score[0] || Number.parseInt(row.away_score, 10) !== match.score[1]) {
      throw new Error(`Source score does not match local record ${match.id}`);
    }
    const url = new URL(row.source_url);
    if (url.protocol !== "https:" || url.hostname !== "www.fifatrainingcentre.com") {
      throw new Error(`Unexpected report destination for ${match.id}`);
    }
    // matches.csv provides no duration field. Do not infer a duration from the score.
    sources[match.id] = { url: url.href, date: row.date };
  }
  await fs.writeFile(path.join(root, "data/sources.js"), `/* Report links verified against Worldcup26 matches.csv. */\nwindow.WC_SOURCES = ${JSON.stringify(sources, null, 2)};\n`);

  const util = await fs.readFile(path.join(root, "js/util.js"), "utf8");
  const isoBlock = util.match(/const ISO = \{([\s\S]*?)\};/);
  if (!isoBlock) throw new Error("Flag ISO mapping was not found in util.js");
  const iso = Object.fromEntries([...isoBlock[1].matchAll(/([A-Z]{3}): "([a-z-]+)"/g)].map((match) => [match[1], match[2]]));
  const codes = [...new Set(context.window.WC.teams.map((team) => iso[team.id]))];
  if (codes.some((code) => !code)) throw new Error("A team has no flag ISO mapping");
  await fs.mkdir(path.join(root, "img/flags"), { recursive: true });
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < codes.length) {
      const code = codes[next++];
      const svg = await download(`https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/flags/1x1/${code}.svg`);
      if (!svg.includes("<svg")) throw new Error(`Invalid SVG for ${code}`);
      await fs.writeFile(path.join(root, "img/flags", `${code}.svg`), svg);
    }
  }));
  console.log(`Verified ${matches.length} report links against IDs, teams, dates and scores. Downloaded ${codes.length} local flags.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
