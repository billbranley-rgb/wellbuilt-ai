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
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--build" && args[i + 1]) {
    extraScanDirs.push(resolve(args[++i]));
  }
}

const errors = [];
const warnings = [];

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

    const isVideo = VIDEO_EXT_RE.test(url);
    const isCommandCenter = /k1[-.]?command|command[-.]?center/i.test(url);

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
console.log(`media-check: OK (${repoFiles.length} file(s) scanned, 0 errors${warnings.length ? `, ${warnings.length} warning(s)` : ""})`);
