#!/usr/bin/env node
// Deterministic check: the K1 homepage must read field-mobile-first from the
// very top — the phrase must appear prominently near the top, and the first
// video proof in the Command Center area must be a narrated, audio-bearing
// reel marked with the field-mobile-first hero class.
//
// Why this exists: Bill asked for a field-mobile-first homepage. The named
// asset k1_juggernaut_field_kit_reel_with_voiceover.mp4 was not in the repo,
// so the strongest existing portrait/narrated reel (k1-field-anthem.mp4) is
// being promoted to the hero slot. This check pins the structural pieces of
// that decision so a future careless edit cannot quietly demote the field-
// mobile-first messaging or silently swap in a muted source.
//
// Run: node scripts/check-field-mobile-first.mjs
// Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const html = readFileSync(resolve(REPO_ROOT, "index.html"), "utf8");

const errors = [];
function fail(msg) { errors.push(msg); }
function ok(msg)   { console.log(`  ok  ${msg}`); }

// 1) The phrase "FIELD-MOBILE-FIRST" (case-insensitive) must appear in the
//    top 20% of index.html — i.e. near the top of the page, not buried in
//    the footer or a tutorial caption.
{
  const HAYSTACK = html.slice(0, Math.floor(html.length * 0.20));
  if (!/field[\s-]?mobile[\s-]?first/i.test(HAYSTACK)) {
    fail(`"field-mobile-first" phrase is not present in the top 20% of index.html — it must appear prominently near the top`);
  } else {
    ok(`"field-mobile-first" phrase appears near the top of index.html`);
  }
}

// 2) The phrase must also appear at least 2 times across the page so the
//    framing is reinforced, not a one-off accident.
{
  const count = (html.match(/field[\s-]?mobile[\s-]?first/gi) || []).length;
  if (count < 2) {
    fail(`"field-mobile-first" only appears ${count}× — expected at least 2 references for emphasis`);
  } else {
    ok(`"field-mobile-first" appears ${count}× across index.html`);
  }
}

// 3) The hero field-mobile-first video block must exist with the right
//    structural pieces: class vp--field-first, data-audio="yes", a reachable
//    www.k1.construction asset URL, and the audio affordance badge.
//
// The vp container has nested <div> children (poster, overlay), so a
// non-greedy regex would stop at the first inner </div>. Walk forward with
// a depth counter to capture the full block.
function extractVpBlock(haystack, openIdx) {
  const openEnd = haystack.indexOf(">", openIdx) + 1;
  const DIV_TAG_RE = /<\/?div\b[^>]*>/g;
  DIV_TAG_RE.lastIndex = openEnd;
  let depth = 1;
  let m;
  while ((m = DIV_TAG_RE.exec(haystack))) {
    if (m[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return haystack.slice(openIdx, m.index + m[0].length);
    } else if (!m[0].endsWith("/>")) {
      depth += 1;
    }
  }
  return null;
}
{
  const openRe = /<div\b[^>]*\bclass="[^"]*\bvp--field-first\b[^"]*"[^>]*>/;
  const openMatch = html.match(openRe);
  if (!openMatch) {
    fail(`could not find <div class="vp ... vp--field-first"> hero block — field-mobile-first reel is not on the page`);
  } else {
    const block = extractVpBlock(html, openMatch.index) || "";
    if (!/data-audio="yes"/.test(block)) {
      fail(`vp--field-first hero block is missing data-audio="yes" — voiceover declaration is required`);
    } else {
      ok(`vp--field-first hero block declares data-audio="yes"`);
    }
    const srcMatch = block.match(/data-src="([^"]+)"/);
    if (!srcMatch) {
      fail(`vp--field-first hero block has no data-src`);
    } else {
      const src = srcMatch[1];
      if (!/^https:\/\/www\.k1\.construction\/assets\/video\/.+\.mp4(?:\?|$)/i.test(src)) {
        fail(`vp--field-first hero block data-src must be a www.k1.construction/assets/video/*.mp4 URL — got ${JSON.stringify(src)}`);
      } else {
        ok(`vp--field-first hero block data-src is a www.k1.construction MP4: ${src}`);
      }
    }
    if (!/class="vp-audio"/.test(block)) {
      fail(`vp--field-first hero block is missing the <span class="vp-audio"> affordance badge`);
    } else {
      ok(`vp--field-first hero block carries the vp-audio affordance`);
    }
    if (!/class="vp-play"/.test(block)) {
      fail(`vp--field-first hero block is missing the vp-play button — JS will not be able to unmute and start it`);
    }
  }
}

// 4) The hero field-mobile-first block must sit BEFORE the Infinity Curve
//    explainer figure in source order — it is meant to be the FIRST video
//    proof on the page, not a side panel below the main explainer.
{
  const fmfIdx = html.indexOf('class="vp portrait vp--field-first"');
  const linearIdx = html.indexOf('class="linear-path"');
  const ratchetIdx = html.indexOf('class="infinity-ratchet"');
  const featuredIdx = html.indexOf('vp--featured');
  if (fmfIdx === -1) {
    fail(`could not locate the vp--field-first block by class string — markup may have drifted`);
  } else {
    if (linearIdx !== -1 && fmfIdx > linearIdx) {
      fail(`vp--field-first block appears AFTER the linear-path strip — must precede it (first video on the page)`);
    }
    if (ratchetIdx !== -1 && fmfIdx > ratchetIdx) {
      fail(`vp--field-first block appears AFTER the Infinity Curve figure — must precede it`);
    }
    if (featuredIdx !== -1 && fmfIdx > featuredIdx) {
      fail(`vp--field-first block appears AFTER the vp--featured explainer — must precede it`);
    }
    if (!errors.some(e => e.includes("vp--field-first block appears AFTER"))) {
      ok(`vp--field-first block precedes the linear-path strip, Infinity Curve figure, and vp--featured explainer`);
    }
  }
}

// 5) The block must carry a visible field-mobile-first caption / note —
//    the .vp-note--field-first text — so a viewer sees the framing in
//    plain language, not just a class name.
{
  if (!/class="vp-note vp-note--field-first"|class="vp-note--field-first"/.test(html)) {
    fail(`missing .vp-note--field-first caption — viewers need a visible explanation of the field-mobile-first framing`);
  } else {
    ok(`.vp-note--field-first caption present`);
  }
}

// 6) The supporting copy concepts Bill asked for must be present somewhere
//    near the top of the page so the messaging hangs together. We look in
//    the first 25% of the document so a copy change in the footer does not
//    silently satisfy this rule.
{
  const HAYSTACK = html.slice(0, Math.floor(html.length * 0.25)).toLowerCase();
  const concepts = [
    "command center starts where the work happens",
    "field crews capture truth first",
    "management controls",
    "validated field events",
  ];
  const missing = concepts.filter(c => !HAYSTACK.includes(c));
  if (missing.length) {
    fail(`top of page is missing field-mobile-first supporting concept(s): ${missing.map(s => JSON.stringify(s)).join(", ")}`);
  } else {
    ok(`top of page carries all field-mobile-first supporting concepts`);
  }
}

if (errors.length) {
  console.error("\nfield-mobile-first-check: FAILED");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("\nfield-mobile-first-check: OK");
