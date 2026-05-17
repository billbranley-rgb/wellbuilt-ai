#!/usr/bin/env node
// Guardrail: "Open full command center" / "Open console" must work from the
// PR preview without depending on the live k1.construction host.
//
// Why this exists: PR #8 preview reported broken "Open full command center"
// behavior because the CTA pointed to https://k1.construction/assets/embed/
// console.html. That URL works in production but is unreliable from preview
// deployments (popup blockers on target="_blank", cross-origin embedding
// quirks, host outages). The fix bundles console.html locally and points
// every CTA + iframe at the same-deployment relative path. This script
// asserts the fix stays in place.
//
// Run: node scripts/check-console.mjs
// Exits non-zero on any failure.

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const ASSET_PATH = "assets/embed/console.html";
const ASSET_ABS  = resolve(REPO_ROOT, ASSET_PATH);
const INDEX_ABS  = resolve(REPO_ROOT, "index.html");

const errors = [];
function fail(msg) { errors.push(msg); }
function ok(msg)   { console.log(`  ok  ${msg}`); }

// 1) The local asset must exist and be non-trivial.
if (!existsSync(ASSET_ABS)) {
  fail(`${ASSET_PATH} is missing — preview "Open full command center" will 404`);
} else {
  const size = statSync(ASSET_ABS).size;
  if (size < 1024) fail(`${ASSET_PATH} is suspiciously small (${size} bytes) — looks like a placeholder, not the real console`);
  else ok(`${ASSET_PATH} exists (${size} bytes)`);

  // The bundled asset must look like the K1 Operating Console — the title
  // is the cheapest deterministic signal that we copied the right file.
  const html = readFileSync(ASSET_ABS, "utf8");
  if (!/K1 Operating Console/i.test(html)) {
    fail(`${ASSET_PATH} does not contain "K1 Operating Console" — wrong file was copied`);
  } else ok(`${ASSET_PATH} title includes "K1 Operating Console"`);
}

// 2) No absolute https://k1.construction/.../console.html references should
//    remain in index.html — they all need to be the relative path so the
//    preview deployment serves its own copy.
const index = readFileSync(INDEX_ABS, "utf8");
const absMatches = [...index.matchAll(/https?:\/\/k1\.construction\/[^"'\s]*console\.html/gi)];
if (absMatches.length > 0) {
  for (const m of absMatches) {
    const line = index.slice(0, m.index).split("\n").length;
    fail(`index.html:${line} still references the absolute console URL: ${m[0]}`);
  }
} else {
  ok("index.html has no absolute k1.construction console.html references");
}

// 3) At least one "Open full command center" link must use the relative path.
//    Bill specifically called out this CTA — it's the load-bearing entry
//    point. Match the link text in any tag, then check its href.
const cccLinkRe = /<a\b[^>]*\bhref=(["'])([^"']+)\1[^>]*>\s*Open full command center\s*<\/a>/gi;
const cccMatches = [...index.matchAll(cccLinkRe)];
if (cccMatches.length === 0) {
  fail(`could not find any "Open full command center" link in index.html`);
} else {
  let goodCount = 0;
  for (const m of cccMatches) {
    const href = m[2];
    const line = index.slice(0, m.index).split("\n").length;
    if (href === ASSET_PATH || href === "/" + ASSET_PATH) goodCount++;
    else fail(`index.html:${line} "Open full command center" href is ${JSON.stringify(href)} — should be ${JSON.stringify(ASSET_PATH)}`);
  }
  if (goodCount > 0) ok(`${goodCount} of ${cccMatches.length} "Open full command center" link(s) point to ${ASSET_PATH}`);
}

// 4) The primary CTAs must NOT open in a new tab — popup blockers on the
//    preview deployment were part of why the user said "it doesn't work."
//    Same-tab navigation works reliably on every preview/host combination.
const newTabRe = /<a\b[^>]*\btarget=["']_blank["'][^>]*>\s*Open (?:full command center|console)\b/gi;
const newTabMatches = [...index.matchAll(newTabRe)];
if (newTabMatches.length > 0) {
  for (const m of newTabMatches) {
    const line = index.slice(0, m.index).split("\n").length;
    fail(`index.html:${line} primary console CTA uses target="_blank" — drop it so the link works through popup blockers`);
  }
} else {
  ok(`primary console CTAs open in the same tab (no target="_blank")`);
}

// 5) The console preview iframe must use the local asset.
const iframeRe = /<iframe\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*\btitle=["'][^"']*[Cc]onsole[^"']*["']/g;
const iframeMatches = [...index.matchAll(iframeRe)];
if (iframeMatches.length === 0) {
  fail("could not find the console preview <iframe> in index.html");
} else {
  for (const m of iframeMatches) {
    const src = m[2];
    const line = index.slice(0, m.index).split("\n").length;
    if (src === ASSET_PATH || src === "/" + ASSET_PATH) ok(`console iframe src is ${ASSET_PATH}`);
    else fail(`index.html:${line} console iframe src is ${JSON.stringify(src)} — should be ${JSON.stringify(ASSET_PATH)}`);
  }
}

if (errors.length) {
  console.error("\nconsole-check: FAILED");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("\nconsole-check: OK");
