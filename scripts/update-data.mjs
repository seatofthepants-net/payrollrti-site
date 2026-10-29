#!/usr/bin/env node
// Pulls releases and download counts from GitHub and updates data/.
//   GITHUB_TOKEN=... node scripts/update-data.mjs
// Writes data/releases.json, data/prereleases.json (for /beta/), data/stats.json,
// and adds today's rows to data/downloads.csv (running it twice in a day replaces
// today's rows). Pre-releases never count as the latest release or in the stats.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const REPO = process.env.SOURCE_REPO || "seatofthepants-net/payrollrti";
const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "payrollrti-site" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function allReleases() {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

const raw = await allReleases();
const newestFirst = (a, b) => b.published_at.localeCompare(a.published_at);
const published = raw.filter((r) => !r.draft && !r.prerelease).sort(newestFirst);
const prereleased = raw.filter((r) => !r.draft && r.prerelease).sort(newestFirst);

const shape = (r) => {
  const dmgs = r.assets.filter((a) => a.name.toLowerCase().endsWith(".dmg"));
  const main = dmgs[0];
  return {
    tag: r.tag_name,
    version: r.tag_name.replace(/^v/i, ""),
    name: r.name || r.tag_name,
    published_at: r.published_at,
    html_url: r.html_url,
    body: r.body || "",
    dmg: main ? { name: main.name, url: main.browser_download_url, size: main.size } : null,
    downloads: dmgs.reduce((n, a) => n + a.download_count, 0),
  };
};
const releases = published.map(shape);
const prereleases = prereleased.map(shape);

const byVersion = Object.fromEntries(releases.map((r) => [r.version, r.downloads]));
const total = releases.reduce((n, r) => n + r.downloads, 0);
const now = new Date().toISOString();
const today = now.slice(0, 10);

// Only bump updatedAt when the numbers changed, so a quiet day makes no commit.
let prev = {};
try { prev = JSON.parse(readFileSync(join(DATA, "stats.json"), "utf8")); } catch {}
const changed = prev.total !== total || JSON.stringify(prev.byVersion) !== JSON.stringify(byVersion);
const stats = { total, byVersion, updatedAt: changed || !prev.updatedAt ? now : prev.updatedAt };

writeFileSync(join(DATA, "releases.json"), JSON.stringify(releases.map(({ downloads, ...r }) => r), null, 2) + "\n");
writeFileSync(join(DATA, "prereleases.json"), JSON.stringify(prereleases.map(({ downloads, ...r }) => r), null, 2) + "\n");
writeFileSync(join(DATA, "stats.json"), JSON.stringify(stats, null, 2) + "\n");

const csvPath = join(DATA, "downloads.csv");
const lines = readFileSync(csvPath, "utf8").trim().split("\n");
const header = lines[0] || "date,version,count";
const kept = lines.slice(1).filter((l) => l && !l.startsWith(`${today},`));
const todayRows = releases.map((r) => `${today},${r.version},${r.downloads}`);
writeFileSync(csvPath, [header, ...kept, ...todayRows].join("\n") + "\n");

console.log(`${releases.length} releases, ${prereleases.length} pre-releases, ${total} downloads, latest ${releases[0]?.version ?? "none"}, beta ${prereleases[0]?.version ?? "none"}`);
