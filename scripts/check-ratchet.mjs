#!/usr/bin/env node
// Deterministic verification for the central vault ratchet animation.
//
// Why this exists: the vault MUST visibly step upward in discrete clicks.
// Several invariants matter and are easy to regress:
//   1) The vault stays anchored — no motion-path / animateMotion / translateX
//      anywhere inside the .ic-ratchet-anchor block.
//   2) The cinch animation only ever runs forward/upward — every translateY
//      value in the cinch keyframes must be 0 or negative.
//   3) The animation IS stepped — `steps(...)` must appear on the cinch
//      animation so the climb reads as clicks, not a smooth drift.
//   4) The seam (where the vault snaps back to translateY(0)) is hidden
//      behind opacity 0 — the seam keyframes end at opacity 0 at 100%.
//
// Run: node scripts/check-ratchet.mjs
// Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const css = readFileSync(resolve(REPO_ROOT, "styles.css"), "utf8");
const html = readFileSync(resolve(REPO_ROOT, "index.html"), "utf8");

const errors = [];
function fail(msg) { errors.push(msg); }
function ok(msg) { console.log(`  ok  ${msg}`); }

// 1) No orbit/motion-path/translateX inside the .ic-ratchet-anchor SVG block.
{
  const anchorOpen = html.indexOf('class="ic-ratchet-anchor"');
  if (anchorOpen === -1) fail("could not find .ic-ratchet-anchor in index.html");
  else {
    // Block ends at the next closing </g> after we balance opens. Cheap
    // approach: read 2000 chars after the open tag — enough for this block.
    const block = html.slice(anchorOpen, anchorOpen + 2500);
    if (/animateMotion/i.test(block)) fail("animateMotion appears inside .ic-ratchet-anchor — vault must not orbit");
    if (/motion-path|motionPath/i.test(block)) fail("motion-path appears inside .ic-ratchet-anchor — vault must not orbit");
    if (/translateX\(/i.test(block)) fail("translateX appears inside .ic-ratchet-anchor — vault must stay centered");
    else ok("vault anchor block has no orbit/translateX");
  }
}

// 2) Cinch keyframes — every translateY must be 0 or negative (upward only).
//    Use a brace-aware extractor so the body of @keyframes is fully captured
//    even when nested rules appear.
function extractKeyframesBody(src, name) {
  const open = src.indexOf(`@keyframes ${name}`);
  if (open === -1) return null;
  const braceStart = src.indexOf("{", open);
  if (braceStart === -1) return null;
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(braceStart + 1, i);
}

{
  const body = extractKeyframesBody(css, "ic-ratchet-step");
  if (body === null) fail("missing @keyframes ic-ratchet-step");
  else {
    const yMatches = [...body.matchAll(/translateY\(\s*(-?\d+(?:\.\d+)?)\s*px?\s*\)/g)];
    if (yMatches.length === 0) fail("ic-ratchet-step has no translateY values");
    let allUpward = true;
    let sawNegative = false;
    for (const m of yMatches) {
      const v = parseFloat(m[1]);
      if (v > 0) { allUpward = false; fail(`ic-ratchet-step has DOWNWARD translateY(${v}px) — must be 0 or negative`); }
      if (v < 0) sawNegative = true;
    }
    if (allUpward && sawNegative) ok(`ic-ratchet-step travels upward only (${yMatches.length} translateY values, max -${Math.max(...yMatches.map(m => -parseFloat(m[1])))}px)`);
    else if (!sawNegative) fail("ic-ratchet-step never translates upward — vault won't climb");
  }
}

// 3) The cinch animation uses steps(...) — visible clicks, not a smooth drift.
{
  const cinchRule = css.match(/\.ic-ratchet-cinch\s*\{([\s\S]*?)\}/);
  if (!cinchRule) fail("missing .ic-ratchet-cinch rule");
  else {
    const body = cinchRule[1];
    const stepsMatch = body.match(/steps\(\s*(\d+)/);
    if (!stepsMatch) fail(".ic-ratchet-cinch animation is not stepped — must use steps(N, end) for visible clicks");
    else {
      const n = parseInt(stepsMatch[1], 10);
      if (n < 3) fail(`.ic-ratchet-cinch uses steps(${n}) — too few to read as ratchet clicks (need ≥3)`);
      else ok(`.ic-ratchet-cinch uses steps(${n}, end) — visible ratchet clicks`);
    }
  }
}

// 4) Seam keyframes hide the reset behind opacity 0 at the cycle boundary.
{
  const body = extractKeyframesBody(css, "ic-ratchet-seam");
  if (body === null) fail("missing @keyframes ic-ratchet-seam");
  else {
    // Confirm 0% and 100% are both opacity 0 (so the reset is invisible).
    // The body has shape: "0% { opacity: 0; } 6% { opacity: 1; } ... 100% { opacity: 0; }"
    const startsAtZero = /(?:^|[^\d])0%\s*\{\s*opacity:\s*0\s*[;}]/.test(body);
    const endsAtZero   = /100%\s*\{\s*opacity:\s*0\s*[;}]/.test(body);
    if (!startsAtZero) fail("ic-ratchet-seam does not start at opacity 0 — bottom snap will be visible");
    if (!endsAtZero)   fail("ic-ratchet-seam does not end at opacity 0 — top reset will be visible");
    if (startsAtZero && endsAtZero) ok("ic-ratchet-seam hides the reset (opacity 0 at both 0% and 100%)");
  }
}

// 5) No vault-orbit class on the anchor.
{
  if (/class="[^"]*\bic-ratchet-anchor\b[^"]*"/.test(html)) {
    const orbited = /class="[^"]*\bic-ratchet-anchor\b[^"]*(?:orbit|travel|motion)[^"]*"/i.test(html);
    if (orbited) fail(".ic-ratchet-anchor has an orbit/travel/motion class — vault must stay anchored");
    else ok(".ic-ratchet-anchor has no orbit class");
  }
}

if (errors.length) {
  console.error("\nratchet-check: FAILED");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("\nratchet-check: OK");
