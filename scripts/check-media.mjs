#!/usr/bin/env node
// Pre-deploy guardrail for the K1 / WellBuilt AI site.
//
// Why this exists: a prior deployment to k1.construction shipped without the
// MP4 assets and with broken links, so videos did not play in production.
// This script catches the same class of bug before a Vercel deploy by:
//   1) finding every local video reference (mp4/webm/mov/m4v) in source files,
//      and failing if the file is not present on disk,
//   2) flagging obviously broken patterns (empty src, placeholder URLs,
//      double slashes, smart quotes, stray whitespace inside attributes),
//   3) sanity-checking K1 Command Center hyperlinks so a typo in a hardcoded
//      URL surfaces before deploy.
//
// Usage:
//   node scripts/check-media.mjs              # scan repo root
//   node scripts/check-media.mjs --build dist # also scan a build output dir
//   npm run check:media                       # same, via package.json

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const SCAN_EXTS = new Set([".html", ".htm", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".vue", ".svelte"]);
const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v"];
const VIDEO_EXT_RE = new RegExp(`\\.(${VIDEO_EXTS.join("|")})\\b`, "i");
const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", ".vercel", "dist", "build", "out", ".turbo", ".cache", "scripts"]);

const args = process.argv.slice(2);
const extraScanDirs = [];
let doProbe = false;
let probeTimeoutMs = 8000;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--build" && args[i + 1]) {
    extraScanDirs.push(resolve(args[++i]));
  } else if (args[i] === "--probe") {
    doProbe = true;
  } else if (args[i] === "--probe-timeout" && args[i + 1]) {
    probeTimeoutMs = Number(args[++i]) || probeTimeoutMs;
  }
}

// Apex hosts that 404 their /assets/ subtree on the current deploy. Any
// hardcoded reference to one of these is a deploy-time 404 waiting to fire,
// even if the file exists on the www host. This is the exact bug class that
// made recipients report "the videos don't play" — the page rendered, the
// asset URLs returned 404, and the players sat with their posters showing.
// If apex /assets/ ever starts working again, drop entries from this list.
const BROKEN_APEX_ASSET_PREFIXES = [
  "https://k1.construction/assets/video/",
  "https://k1.construction/assets/posters/",
];

const errors = [];
const warnings = [];
const remoteAssetUrls = [];

function err(file, line, msg) { errors.push({ file, line, msg }); }
function warn(file, line, msg) { warnings.push({ file, line, msg }); }

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (IGNORED_DIRS.has(name)) continue;
    const full = join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (SCAN_EXTS.has(extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

// Extract URL-like strings from an attribute or JS literal context. Handles
// single, double, and backtick quotes plus bare HTML attribute values.
const URL_RE = /(?:src|href|poster|data-src|data-video|videoSrc|video_src|posterSrc)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s>]+))/gi;

function lineOf(src, idx) {
  return src.slice(0, idx).split("\n").length;
}

function isExternal(url) {
  return /^(?:https?:)?\/\//i.test(url) || /^(?:mailto:|tel:|data:|blob:)/i.test(url);
}

function isPlaceholder(url) {
  return /^(?:#|javascript:|TODO|FIXME|PLACEHOLDER|\{\{.*\}\})$/i.test(url.trim()) || url.trim() === "";
}

function resolveLocal(url, fromFile) {
  // Strip query string + hash fragment.
  const clean = url.split("#")[0].split("?")[0];
  if (!clean) return null;
  if (clean.startsWith("/")) return join(REPO_ROOT, clean.slice(1));
  return resolve(dirname(fromFile), clean);
}

function checkFile(file) {
  const src = readFileSync(file, "utf8");
  const rel = relative(REPO_ROOT, file);

  // Catch empty <video src=""> / <source src=""> directly — these never have
  // a video extension to trigger the URL_RE branch below.
  const EMPTY_VIDEO_SRC_RE = /<(video|source)\b[^>]*\bsrc\s*=\s*(?:""|''|``)/gi;
  for (const m of src.matchAll(EMPTY_VIDEO_SRC_RE)) {
    err(rel, lineOf(src, m.index), `<${m[1]}> has empty src — video will not play`);
  }

  for (const m of src.matchAll(URL_RE)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    const url = raw.trim();
    const ln = lineOf(src, m.index);

    // Detect broken patterns regardless of file type.
    if (raw !== url && url.length > 0) {
      warn(rel, ln, `attribute value has surrounding whitespace: ${JSON.stringify(raw)}`);
    }
    if (/[“”‘’]/.test(raw)) {
      err(rel, ln, `smart quotes in URL — will not load in browsers: ${JSON.stringify(raw)}`);
    }
    if (/\s/.test(url) && !url.startsWith("data:")) {
      err(rel, ln, `URL contains whitespace: ${JSON.stringify(url)}`);
    }

    // Apex /assets/* references currently 404 on Vercel — see
    // BROKEN_APEX_ASSET_PREFIXES at the top of the file. This was the bug
    // that made recipients report "the videos don't play." Fail loudly so
    // a future regression in any source file (HTML, JS, JSX) gets caught
    // before deploy.
    for (const bad of BROKEN_APEX_ASSET_PREFIXES) {
      if (url.startsWith(bad)) {
        const fixed = url.replace("https://k1.construction/", "https://www.k1.construction/");
        err(rel, ln, `apex asset URL 404s in production — use the www host: ${url} → ${fixed}`);
        // Also collect for the reachability probe so we still report it.
        remoteAssetUrls.push({ url, file: rel, line: ln });
        break;
      }
    }

    const isVideo = VIDEO_EXT_RE.test(url);
    const isCommandCenter = /k1[-.]?command|command[-.]?center/i.test(url);

    // Stash any www / external video or poster URL for the optional probe.
    if (isExternal(url) && (isVideo || /\/assets\/posters\//.test(url))) {
      remoteAssetUrls.push({ url, file: rel, line: ln });
    }

    if (!isVideo && !isCommandCenter) continue;

    if (isPlaceholder(url)) {
      err(rel, ln, `video/Command-Center reference is empty or a placeholder: ${JSON.stringify(url)}`);
      continue;
    }

    // Validate Command Center links — typo guard for hardcoded URLs.
    if (isCommandCenter) {
      if (isExternal(url)) {
        if (!/^https:\/\/[a-z0-9.-]+\/?/i.test(url)) {
          err(rel, ln, `Command Center link is not a valid https URL: ${JSON.stringify(url)}`);
        }
      } else if (!url.startsWith("/") && !url.startsWith(".")) {
        warn(rel, ln, `Command Center link is neither absolute nor relative: ${JSON.stringify(url)}`);
      }
    }

    // Validate local video assets — the actual fix for the prior incident.
    if (isVideo && !isExternal(url)) {
      const localPath = resolveLocal(url, file);
      if (!localPath) {
        err(rel, ln, `cannot resolve local video path: ${JSON.stringify(url)}`);
        continue;
      }
      if (!existsSync(localPath)) {
        err(rel, ln, `missing local video asset (deploy would 404): ${url} → ${relative(REPO_ROOT, localPath)}`);
        continue;
      }
      // Sanity check: file should be non-empty. A 0-byte mp4 is the classic
      // "asset committed as pointer / LFS not pulled" failure mode.
      const s = statSync(localPath);
      if (s.size === 0) {
        err(rel, ln, `local video asset is 0 bytes (likely LFS pointer or empty placeholder): ${url}`);
      } else if (s.size < 1024) {
        warn(rel, ln, `local video asset is suspiciously small (${s.size} bytes): ${url}`);
      }
    }
  }

}

// Always scan the repo root.
const repoFiles = walk(REPO_ROOT);
// Optionally scan a build output directory (e.g. dist/, out/) if --build was passed.
for (const dir of extraScanDirs) {
  if (!existsSync(dir)) {
    err(relative(REPO_ROOT, dir), 0, `--build directory does not exist: ${dir}`);
    continue;
  }
  walk(dir, repoFiles);
}

for (const f of repoFiles) checkFile(f);

// Optional reachability probe. Off by default so CI / offline dev environments
// do not flake on network failures, on by passing --probe. When on, every
// external video and poster URL referenced from the page is HEADed (then
// fallback to a tiny GET if HEAD is not allowed). Non-200 → error; network
// failure → warning so a flaky run does not block a deploy that is otherwise
// well-formed. This catches the exact apex-vs-www class of bug at runtime.
if (doProbe && remoteAssetUrls.length) {
  // Dedupe (the same poster may be referenced from multiple cards).
  const uniq = new Map();
  for (const r of remoteAssetUrls) if (!uniq.has(r.url)) uniq.set(r.url, r);
  const targets = [...uniq.values()];
  console.log(`media-check: probing ${targets.length} remote asset URL(s) (timeout ${probeTimeoutMs}ms)…`);

  async function probe(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), probeTimeoutMs);
    try {
      // HEAD first — cheap. Some CDNs (or strict origins) reject HEAD with
      // 4xx; in that case fall back to a Range GET of the first byte so we
      // still get a real status without downloading the whole file.
      let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
      if (res.status === 405 || res.status === 403) {
        res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal, headers: { Range: "bytes=0-0" } });
      }
      return { ok: res.ok || res.status === 206, status: res.status };
    } catch (e) {
      return { ok: false, status: 0, err: e && e.message ? e.message : String(e) };
    } finally {
      clearTimeout(t);
    }
  }

  // Probe in small batches so we don't hammer the CDN.
  const BATCH = 6;
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((t) => probe(t.url).then((r) => ({ ...t, ...r }))));
    for (const r of results) {
      if (r.ok) continue;
      if (r.status === 0) {
        // Network error — warn, do not fail. We do not want a flaky CI run
        // to block a deploy of well-formed HTML.
        warn(r.file, r.line, `could not reach asset (network error: ${r.err}): ${r.url}`);
      } else {
        err(r.file, r.line, `asset URL returned HTTP ${r.status}: ${r.url}`);
      }
    }
  }
}

const fmt = (e) => `  ${e.file}:${e.line}  ${e.msg}`;
if (warnings.length) {
  console.log(`media-check: ${warnings.length} warning(s)`);
  for (const w of warnings) console.log(fmt(w));
}
if (errors.length) {
  console.error(`media-check: ${errors.length} error(s)`);
  for (const e of errors) console.error(fmt(e));
  console.error("\nFix the references above before deploying. See scripts/check-media.mjs for what triggered each rule.");
  process.exit(1);
}
console.log(`media-check: OK (${repoFiles.length} file(s) scanned, 0 errors${warnings.length ? `, ${warnings.length} warning(s)` : ""}${doProbe ? `, ${remoteAssetUrls.length ? "probed remote URLs" : "no remote URLs to probe"}` : ""})`);
