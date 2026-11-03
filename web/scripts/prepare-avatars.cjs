// Copy the existing project's attributed avatar assets for portable delivery.
// Usage: node scripts/prepare-avatars.cjs
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const base = "https://baiqiaozhang.cc/style-twins/";
const isWebp = (data) => data.length >= 32 && data.toString("ascii", 0, 4) === "RIFF"
  && data.toString("ascii", 8, 12) === "WEBP" && data.readUInt32LE(4) + 8 === data.length;

async function saveAvatar(relativePath) {
  if (!relativePath.startsWith("img/avatars/") || relativePath.includes("..") || !relativePath.endsWith(".webp")) {
    throw new Error("Unexpected avatar path");
  }
  const destination = path.resolve(root, relativePath);
  try {
    if (isWebp(await fs.readFile(destination))) return "cached";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(new URL(relativePath, base), { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (!isWebp(data)) throw new Error("Response is not a valid WebP asset");
      const temporary = `${destination}.download`;
      await fs.writeFile(temporary, data);
      await fs.rename(temporary, destination);
      return "downloaded";
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function main() {
  const context = { window: {} };
  vm.runInNewContext(await fs.readFile(path.join(root, "data/avatars.js"), "utf8"), context);
  const assets = [...new Set(Object.values(context.window.WC_AVATARS))];
  await fs.mkdir(path.join(root, "img/avatars"), { recursive: true });
  const results = { total: assets.length, downloaded: 0, cached: 0, failures: [] };
  let next = 0, completed = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (next < assets.length) {
      const asset = assets[next++];
      try { results[await saveAvatar(asset)]++; }
      catch (error) { results.failures.push({ asset, reason: error.message }); }
      completed++;
      if (completed % 200 === 0) console.log(`${completed}/${assets.length} avatar assets processed`);
    }
  }));
  console.log(JSON.stringify(results, null, 2));
  if (results.failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
