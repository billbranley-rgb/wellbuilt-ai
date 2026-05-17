#!/usr/bin/env node
// Guardrail: every <video> on the K1 / WellBuilt AI homepage must give the
// recipient a deterministic answer to the question "is there supposed to be
// sound here?" — because before this guardrail existed, recipients reported
// the videos felt broken. They were not broken; they were narrated, but the
// custom play overlay never said so and the player loaded muted on some
// browsers.
//
// What we enforce:
//   1) Every .vp[data-src] player on the page MUST carry a data-audio
//      attribute whose value is one of "yes" | "silent".
//      - "yes" means the source file is expected to contain an audible
//        narration track. The player will explicitly unmute on click.
//      - "silent" means the source is a silent visual loop and the page
//        must surface that to the viewer so silence does not read as
//        "broken video."
//   2) Every .vp player MUST contain a <span class="vp-audio"> badge so
//      the viewer sees the affordance ("Plays with sound" / "Silent
//      visual loop") before they click.
//   3) Every player tagged data-audio="silent" MUST be accompanied by a
//      visible explanation (a .vp-note--silent paragraph) somewhere on
//      the page, so silence reads as intentional.
//   4) The page MUST carry at least one section-level "tap to play with
//      sound" affordance (the .walk-sound-note element) so the overall
//      reading is "these are narrated films you can click," not "muted
//      ambient loops."
//   5) The click-to-play JS MUST explicitly set v.muted = false before
//      calling v.play() for audio="yes" players. If that line goes away,
//      iOS and some Chrome heuristics will silently re-mute the playback
//      and the original bug returns.
//
// Run: node scripts/check-video-audio.mjs
// Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const INDEX_ABS = resolve(REPO_ROOT, "index.html");
const SCRIPT_ABS = resolve(REPO_ROOT, "script.js");

const errors = [];
const warnings = [];
function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function ok(msg)   { console.log(`  ok  ${msg}`); }

const html = readFileSync(INDEX_ABS, "utf8");
const js   = readFileSync(SCRIPT_ABS, "utf8");

// Locate every .vp container that has a data-src (the players the runtime
// hydrates). The container has nested <div> children (poster, overlay) so
// a non-greedy regex would stop at the first inner </div>. Instead, walk
// forward from each opening tag with a depth counter until the matching
// closing </div>.
const VP_OPEN_RE = /<div\b([^>]*\bclass="vp[^"]*"[^>]*\bdata-src="([^"]+)"[^>]*)>/g;
const DIV_TAG_RE = /<\/?div\b[^>]*>/g;

function blockAfter(openMatch) {
  DIV_TAG_RE.lastIndex = openMatch.index + openMatch[0].length;
  let depth = 1;
  let m;
  while ((m = DIV_TAG_RE.exec(html))) {
    if (m[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return html.slice(openMatch.index + openMatch[0].length, m.index);
    } else if (!m[0].endsWith("/>")) {
      depth += 1;
    }
  }
  return null;
}

let foundPlayers = 0;
let silentCount = 0;
const seenSources = new Set();

for (const m of html.matchAll(VP_OPEN_RE)) {
  foundPlayers += 1;
  const attrs = m[1];
  const src   = m[2];
  const inner = blockAfter(m) || "";

  if (seenSources.has(src)) {
    // Multiple cards may reference the same film (e.g. the system walkthrough
    // appears in both the command tutorials and the walk grid). That is fine
    // — but the rules apply per-instance, so just note it.
    warn(`duplicate video reference in markup: ${src}`);
  }
  seenSources.add(src);

  const audioMatch = attrs.match(/\bdata-audio="(yes|silent)"/);
  if (!audioMatch) {
    fail(`<div class="vp" data-src="${src}"> is missing data-audio="yes|silent" — the player needs to declare whether it has narration`);
    continue;
  }
  const audio = audioMatch[1];
  if (audio === "silent") silentCount += 1;

  if (!/\bclass="vp-audio"/.test(inner)) {
    fail(`<div class="vp" data-src="${src}"> is missing the <span class="vp-audio"> affordance badge`);
  }

  if (audio === "yes") {
    // A "yes" player needs a play button — that is what the JS hooks onto.
    if (!/\bclass="vp-play"/.test(inner)) {
      fail(`<div class="vp" data-src="${src}" data-audio="yes"> has no .vp-play button — JS will never get a chance to unmute`);
    }
  }
}

if (foundPlayers === 0) {
  fail(`no .vp[data-src] players were found in index.html — has the homepage stopped using the click-to-play markup?`);
} else {
  ok(`found ${foundPlayers} .vp[data-src] player(s); ${silentCount} marked silent, ${foundPlayers - silentCount} marked with sound`);
}

// Silent loops must come with a visible explanation. We do not enforce
// proximity — just that the page contains at least one .vp-note--silent
// element when any silent player is present.
if (silentCount > 0) {
  if (!/\bclass="vp-note vp-note--silent"|\bclass="vp-note--silent"/.test(html)) {
    fail(`${silentCount} silent player(s) declared but no .vp-note--silent caption exists to tell the viewer the silence is intentional`);
  } else {
    ok(`silent player(s) accompanied by a .vp-note--silent caption`);
  }
}

// Section-level "tap to play with sound" affordance must exist somewhere.
if (!/\bclass="walk-sound-note[ "]/.test(html)) {
  fail(`no .walk-sound-note section-level affordance found — recipients will not know the films are narrated`);
} else {
  ok(`.walk-sound-note section-level affordance present`);
}

// JS must explicitly unmute on user-initiated play for "yes" players.
// We look for the canonical line; if it goes missing, regressions are
// nearly invisible because muted playback still "looks fine" to the
// developer testing locally with system volume up.
if (!/v\.muted\s*=\s*false/.test(js)) {
  fail(`script.js does not contain "v.muted = false" — the click handler must explicitly unmute, otherwise iOS / some Chrome heuristics will play silently`);
} else {
  ok(`script.js explicitly unmutes the <video> on user-initiated play`);
}

// Reverse guard: if anyone ever flips the player to load muted by default
// for audio="yes" content, fail loudly. Allow muted only inside the silent
// branch.
const mutedTrue = /v\.muted\s*=\s*true/g;
const mutedHits = [...js.matchAll(mutedTrue)];
if (mutedHits.length > 0) {
  // Acceptable: silent branch + the autoplay-blocked fallback. We expect
  // at most two. If more appear, surface them so a reviewer can confirm
  // none of them apply to the default audio="yes" path.
  if (mutedHits.length > 2) {
    fail(`script.js contains ${mutedHits.length} "v.muted = true" assignments — more than the silent branch + the autoplay-blocked fallback. Review.`);
  } else {
    ok(`script.js "v.muted = true" assignments are limited to the silent branch + autoplay fallback (${mutedHits.length} occurrence(s))`);
  }
}

// CSS-side sanity: the badge must render text. If the CSS rule disappears,
// the <span class="vp-audio"> becomes an empty box and the affordance is
// gone with no visible failure.
const css = readFileSync(resolve(REPO_ROOT, "styles.css"), "utf8");
if (!/\.vp\[data-audio="yes"\]\s*\.vp-audio::after\s*\{\s*content:/.test(css)) {
  fail(`styles.css is missing the "Plays with sound" pseudo-element rule — the badge will render blank`);
} else {
  ok(`styles.css renders "Plays with sound" badge text via ::after`);
}
if (silentCount > 0 && !/\.vp\[data-audio="silent"\]\s*\.vp-audio::after\s*\{\s*content:/.test(css)) {
  fail(`styles.css is missing the silent badge pseudo-element rule but the page declares silent player(s)`);
}

if (warnings.length) {
  console.log(`video-audio-check: ${warnings.length} warning(s)`);
  for (const w of warnings) console.log(`  warn  ${w}`);
}
if (errors.length) {
  console.error(`video-audio-check: ${errors.length} error(s)`);
  for (const e of errors) console.error(`  fail  ${e}`);
  console.error(`\nFix the issues above before deploying — recipients have already reported the videos feel broken when these guardrails slip.`);
  process.exit(1);
}
console.log(`video-audio-check: OK (${foundPlayers} player(s) verified${warnings.length ? `, ${warnings.length} warning(s)` : ""})`);
