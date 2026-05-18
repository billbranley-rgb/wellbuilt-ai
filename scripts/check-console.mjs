#!/usr/bin/env node
// Guardrail: user-facing "K1" / "Open console" CTAs must point to the
// canonical Perplexity-hosted K1 Command Center, while the in-page
// preview <iframe> keeps using the locally bundled console so the
// preview never depends on a live external host.
//
// History: PR #8 broke the CTAs by pointing them at
// https://k1.construction/assets/embed/console.html (popup blockers,
// cross-origin quirks). PR #9 first bundled console.html locally and
// pointed every CTA at the relative path. Bill then provided the
// Perplexity Computer URL below as the real destination — user-facing
// CTAs now go there in a new tab; the iframe preview still uses the
// local bundle as a same-origin fallback. The visible CTA label was
// later shortened from "Open full command center" to just "K1".
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
const CCC_URL    = "https://www.perplexity.ai/computer/a/k1-command-center-xSmQsNfrSlOEDkPYLQtHsQ";

const errors = [];
function fail(msg) { errors.push(msg); }
function ok(msg)   { console.log(`  ok  ${msg}`); }

// 1) The local asset must still exist and be non-trivial — it's the
//    same-origin fallback used by the embedded preview iframe.
if (!existsSync(ASSET_ABS)) {
  fail(`${ASSET_PATH} is missing — embedded console preview will 404`);
} else {
  const size = statSync(ASSET_ABS).size;
  if (size < 1024) fail(`${ASSET_PATH} is suspiciously small (${size} bytes) — looks like a placeholder, not the real console`);
  else ok(`${ASSET_PATH} exists (${size} bytes)`);

  const html = readFileSync(ASSET_ABS, "utf8");
  if (!/K1 Operating Console/i.test(html)) {
    fail(`${ASSET_PATH} does not contain "K1 Operating Console" — wrong file was copied`);
  } else ok(`${ASSET_PATH} title includes "K1 Operating Console"`);
}

const index = readFileSync(INDEX_ABS, "utf8");

// 2) No absolute https://k1.construction/.../console.html references should
//    remain — that was the original broken target.
const absMatches = [...index.matchAll(/https?:\/\/k1\.construction\/[^"'\s]*console\.html/gi)];
if (absMatches.length > 0) {
  for (const m of absMatches) {
    const line = index.slice(0, m.index).split("\n").length;
    fail(`index.html:${line} still references the absolute k1.construction console URL: ${m[0]}`);
  }
} else {
  ok("index.html has no absolute k1.construction console.html references");
}

// 3) Every user-facing "K1" command center link must point to the
//    Perplexity-hosted K1 Command Center URL. (Was previously labelled
//    "Open full command center"; the visible CTA text was shortened to
//    just "K1" — the destination is unchanged.)
const cccLinkRe = /<a\b[^>]*\bhref=(["'])([^"']+)\1[^>]*>\s*K1\s*<\/a>/g;
const cccMatches = [...index.matchAll(cccLinkRe)];
if (cccMatches.length === 0) {
  fail(`could not find any "K1" command center link in index.html`);
} else {
  let goodCount = 0;
  for (const m of cccMatches) {
    const href = m[2];
    const line = index.slice(0, m.index).split("\n").length;
    if (href === CCC_URL) goodCount++;
    else fail(`index.html:${line} "K1" command center href is ${JSON.stringify(href)} — should be ${JSON.stringify(CCC_URL)}`);
  }
  if (goodCount === cccMatches.length) ok(`${goodCount} "K1" command center link(s) point to the Perplexity K1 Command Center URL`);
}

// 4) The "Open console →" CTA next to the preview iframe should also point
//    to the same Perplexity URL — one consistent user-facing destination.
const consoleCtaRe = /<a\b[^>]*\bhref=(["'])([^"']+)\1[^>]*>\s*Open console\s*(?:→|&rarr;)?\s*<\/a>/gi;
const consoleCtaMatches = [...index.matchAll(consoleCtaRe)];
if (consoleCtaMatches.length === 0) {
  fail(`could not find any "Open console" link in index.html`);
} else {
  let goodCount = 0;
  for (const m of consoleCtaMatches) {
    const href = m[2];
    const line = index.slice(0, m.index).split("\n").length;
    if (href === CCC_URL) goodCount++;
    else fail(`index.html:${line} "Open console" href is ${JSON.stringify(href)} — should be ${JSON.stringify(CCC_URL)}`);
  }
  if (goodCount === consoleCtaMatches.length) ok(`${goodCount} "Open console" CTA(s) point to the Perplexity K1 Command Center URL`);
}

// 5) Because the Perplexity destination is cross-origin, those CTAs must
//    open in a new tab with safe rel attributes. (This inverts the old
//    rule, which forbade target="_blank" on the same-origin link.)
const ctaBlockRe = /<a\b[^>]*\bhref=["']https:\/\/www\.perplexity\.ai\/computer\/a\/k1-command-center[^"']*["'][^>]*>[^<]*<\/a>/g;
let relErrCount = errors.length;
for (const m of index.matchAll(ctaBlockRe)) {
  const tag = m[0];
  const line = index.slice(0, m.index).split("\n").length;
  if (!/\btarget=["']_blank["']/.test(tag)) {
    fail(`index.html:${line} user-facing console CTA is missing target="_blank" — needed for the cross-origin Perplexity destination`);
  }
  if (!/\brel=["'][^"']*noopener[^"']*["']/.test(tag)) {
    fail(`index.html:${line} user-facing console CTA is missing rel="noopener" — required when using target="_blank"`);
  }
}
if (errors.length === relErrCount) ok(`all user-facing console CTAs use target="_blank" with rel="noopener"`);

// 6) The in-page console preview <iframe> must keep using the local
//    same-origin bundle. The Perplexity URL is not guaranteed to be
//    iframe-embeddable, so we never point the iframe at it.
const iframeRe = /<iframe\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*\btitle=["'][^"']*[Cc]onsole[^"']*["']/g;
const iframeMatches = [...index.matchAll(iframeRe)];
if (iframeMatches.length === 0) {
  fail("could not find the console preview <iframe> in index.html");
} else {
  for (const m of iframeMatches) {
    const src = m[2];
    const line = index.slice(0, m.index).split("\n").length;
    if (src === ASSET_PATH || src === "/" + ASSET_PATH) ok(`console iframe src is ${ASSET_PATH}`);
    else fail(`index.html:${line} console iframe src is ${JSON.stringify(src)} — should be ${JSON.stringify(ASSET_PATH)} (do not iframe the Perplexity URL)`);
  }
}

if (errors.length) {
  console.error("\nconsole-check: FAILED");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("\nconsole-check: OK");
