#!/usr/bin/env node
/* Monthly letterboxd.json refresh for Watchlist (Stub).
 *
 * What it does:
 *   1. Candidates = every tmdbId already in letterboxd.json + TMDB top_rated /
 *      popular / now_playing / upcoming pages (new acclaimed films enter the gate).
 *   2. Resolves each film's Letterboxd page by title-slug (film pages are not
 *      bot-protected; listing pages are, so we never scrape lists).
 *   3. Verifies the page's data-tmdb-id actually matches, then reads the
 *      aggregate rating (0-5) and stores it x2 on the app's 0-10 scale.
 *
 * Usage:  TMDB_KEY=<key> node scripts/refresh-letterboxd.mjs [--limit N] [--out letterboxd.json]
 * Cost:   $0. Politeness: ~3 req/sec to letterboxd.com; a full run is ~90 min.
 *         Run it from a monthly wake on the 1st, then commit the changed json.
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TMDB_KEY = process.env.TMDB_KEY;
if (!TMDB_KEY) { console.error("TMDB_KEY env var required"); process.exit(1); }
const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;
const outPath = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : join(ROOT, "letterboxd.json");

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(path, params = {}) {
  const u = new URL(`https://api.themoviedb.org/3${path}`);
  u.searchParams.set("api_key", TMDB_KEY);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u);
  if (!r.ok) throw new Error(`TMDB ${path}: ${r.status}`);
  return r.json();
}

function slugify(title) {
  return title.toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['\u2019]/g, "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function lbRating(tmdbId, title, year) {
  const base = slugify(title);
  const candidates = year ? [base, `${base}-${year}`] : [base];
  for (const slug of candidates) {
    try {
      const r = await fetch(`https://letterboxd.com/film/${slug}/`, { headers: UA, redirect: "follow" });
      if (r.status === 404 || r.status === 403) { await sleep(300); continue; }
      if (!r.ok) { await sleep(1000); continue; }
      const html = await r.text();
      const idM = html.match(/data-tmdb-id="(\d+)"/);
      if (!idM || Number(idM[1]) !== tmdbId) { await sleep(300); continue; } // right slug, wrong film
      const rM = html.match(/"ratingValue":([0-9.]+)/) || html.match(/ratingValue\\?":\\?([0-9.]+)/);
      if (!rM) return null;
      return Math.round(parseFloat(rM[1]) * 2 * 10) / 10; // 0-5 -> 0-10, 1 decimal
    } catch { await sleep(1000); }
  }
  return null;
}

const existing = JSON.parse(readFileSync(join(ROOT, "letterboxd.json"), "utf8"));
const candidates = new Map(); // tmdbId -> {title, year} (filled from TMDB)
Object.keys(existing).forEach((id) => candidates.set(Number(id), null));

// fresh blood: acclaimed + popular + current films from TMDB
for (const [path, pages] of [["/movie/top_rated", 15], ["/movie/popular", 10], ["/movie/now_playing", 3], ["/movie/upcoming", 3]]) {
  for (let p = 1; p <= pages; p++) {
    try {
      const d = await tmdb(path, { page: p });
      (d.results || []).forEach((r) => { if (!candidates.has(r.id)) candidates.set(r.id, { title: r.title, year: (r.release_date || "").slice(0, 4) }); });
    } catch (e) { console.error("tmdb list fail", path, p, e.message); }
  }
}

const ids = [...candidates.keys()].slice(0, limit === Infinity ? undefined : limit);
console.log(`candidates: ${ids.length} (${Object.keys(existing).length} existing)`);
const out = {};
let done = 0, hit = 0, miss = 0;
for (const id of ids) {
  try {
    let meta = candidates.get(id);
    if (!meta) {
      const d = await tmdb(`/movie/${id}`);
      meta = { title: d.title, year: (d.release_date || "").slice(0, 4) };
      await sleep(40);
    }
    const rating = await lbRating(id, meta.title, meta.year);
    if (rating != null) { out[id] = rating; hit++; } else miss++;
  } catch (e) { miss++; }
  done++;
  if (done % 50 === 0) console.log(`${done}/${ids.length}  hit ${hit}  miss ${miss}`);
  await sleep(300); // ~3 req/s to letterboxd
}
// keep an existing entry if the rescrape missed it (transient 403s must not shrink the dataset)
Object.entries(existing).forEach(([id, r]) => { if (!(id in out)) out[id] = r; });
const sorted = Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
writeFileSync(outPath, JSON.stringify(sorted));
console.log(`wrote ${Object.keys(sorted).length} ratings -> ${outPath} (was ${Object.keys(existing).length})`);
