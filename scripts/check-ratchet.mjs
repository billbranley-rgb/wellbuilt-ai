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

// 6) Isotope rings tighten upward only — no scale > 1, no positive translateY.
{
  const body = extractKeyframesBody(css, "ic-isotope-cinch");
  if (body === null) fail("missing @keyframes ic-isotope-cinch — concentric rings will not tighten");
  else {
    // Scale values must be <= 1 (rings only tighten, never widen mid-loop).
    const scales = [...body.matchAll(/scale\(\s*(-?\d+(?:\.\d+)?)\s*\)/g)].map(m => parseFloat(m[1]));
    if (scales.length === 0) fail("ic-isotope-cinch has no scale() — rings won't visibly tighten");
    let sawTightening = false;
    for (const s of scales) {
      if (s > 1) fail(`ic-isotope-cinch has scale(${s}) > 1 — rings would widen, not tighten`);
      if (s < 1 && s > 0) sawTightening = true;
    }
    if (sawTightening) ok(`ic-isotope-cinch tightens (scales: ${scales.join(" → ")})`);

    // translateY must be 0 or negative — rings only drift upward.
    const ys = [...body.matchAll(/translateY\(\s*(-?\d+(?:\.\d+)?)\s*px?\s*\)/g)].map(m => parseFloat(m[1]));
    let sawUpward = false;
    for (const y of ys) {
      if (y > 0) fail(`ic-isotope-cinch has DOWNWARD translateY(${y}px) — must be 0 or negative`);
      if (y < 0) sawUpward = true;
    }
    if (sawUpward) ok(`ic-isotope-cinch drifts upward only (max ${Math.min(...ys)}px)`);

    // The ring animation must be stepped to match the vault click cadence.
    const ringRule = css.match(/\.ic-isotope-rings\s*\{([\s\S]*?)\}/);
    if (!ringRule) fail("missing .ic-isotope-rings rule");
    else {
      const stepsMatch = ringRule[1].match(/steps\(\s*(\d+)/);
      if (!stepsMatch) fail(".ic-isotope-rings is not stepped — rings should cinch in clicks, not smoothly");
      else ok(`.ic-isotope-rings uses steps(${stepsMatch[1]}, end) — synced with vault clicks`);
    }
  }
}

// 8) Screw-strip hub steps rightward only (no negative translateX) and is
//    stepped + seam-masked just like the vault.
{
  const body = extractKeyframesBody(css, "screw-strip-step");
  if (body === null) fail("missing @keyframes screw-strip-step — screw diagram hub will not climb");
  else {
    const xs = [...body.matchAll(/translateX\(\s*(-?\d+(?:\.\d+)?)\s*px?\s*\)/g)].map(m => parseFloat(m[1]));
    if (xs.length === 0) fail("screw-strip-step has no translateX values");
    let sawForward = false;
    for (const x of xs) {
      if (x < 0) fail(`screw-strip-step has BACKWARD translateX(${x}px) — hub must move forward only`);
      if (x > 0) sawForward = true;
    }
    if (sawForward) ok(`screw-strip-step travels rightward only (max +${Math.max(...xs)}px)`);

    const stripRule = css.match(/\.screw-strip-hub-wrap\s*\{([\s\S]*?)\}/);
    if (!stripRule) fail("missing .screw-strip-hub-wrap rule");
    else {
      const stepsMatch = stripRule[1].match(/steps\(\s*(\d+)/);
      if (!stepsMatch) fail(".screw-strip-hub-wrap is not stepped — hub should click, not glide");
      else ok(`.screw-strip-hub-wrap uses steps(${stepsMatch[1]}, end) — visible clicks`);
    }
  }
}
{
  const body = extractKeyframesBody(css, "screw-strip-seam");
  if (body === null) fail("missing @keyframes screw-strip-seam");
  else {
    const startsAtZero = /(?:^|[^\d])0%\s*\{\s*opacity:\s*0\s*[;}]/.test(body);
    const endsAtZero   = /100%\s*\{\s*opacity:\s*0\s*[;}]/.test(body);
    if (!startsAtZero) fail("screw-strip-seam does not start at opacity 0 — hub reset will be visible");
    if (!endsAtZero)   fail("screw-strip-seam does not end at opacity 0 — hub reset will be visible");
    if (startsAtZero && endsAtZero) ok("screw-strip-seam hides the hub reset (opacity 0 at both 0% and 100%)");
  }
}

// 9) Screw strip lives directly after the Infinity Curve figure in the
//    reading order (no major block between them). Confirm by checking that
//    .screw-strip appears after .infinity-ratchet's </figure> and before
//    the explainer-video closing div / .vp--featured.
{
  const ratchetClose = html.indexOf("</figure>", html.indexOf('class="infinity-ratchet"'));
  const screwOpen    = html.indexOf('class="screw-strip"');
  const featuredVid  = html.indexOf('class="vp vp--featured"');
  if (ratchetClose === -1 || screwOpen === -1) fail("could not locate ratchet figure close + screw-strip open");
  else if (screwOpen < ratchetClose) fail("screw-strip appears BEFORE Infinity Curve figure closes — order is wrong");
  else if (featuredVid !== -1 && screwOpen > featuredVid) fail("screw-strip appears AFTER the explainer video — should sit directly under the Infinity Curve");
  else {
    // Slice from after </figure> up to the START of the <figure class="screw-strip">
    // opening tag. Only whitespace and HTML comments are allowed between them.
    const figureOpenIdx = html.lastIndexOf("<figure", screwOpen);
    const between = html.slice(ratchetClose + "</figure>".length, figureOpenIdx);
    const stripped = between.replace(/<!--[\s\S]*?-->/g, "").trim();
    if (stripped.length > 0) fail(`unexpected markup between Infinity Curve and screw-strip: ${stripped.slice(0, 80)}`);
    else ok("screw-strip is the next sibling after the Infinity Curve figure (comments/whitespace only between)");
  }
}

// 7) Isotope seam hides the reset behind opacity 0 at both ends.
{
  const body = extractKeyframesBody(css, "ic-isotope-seam");
  if (body === null) fail("missing @keyframes ic-isotope-seam");
  else {
    const startsAtZero = /(?:^|[^\d])0%\s*\{\s*opacity:\s*0\s*[;}]/.test(body);
    const endsAtZero   = /100%\s*\{\s*opacity:\s*0\s*[;}]/.test(body);
    if (!startsAtZero) fail("ic-isotope-seam does not start at opacity 0 — ring reset will be visible");
    if (!endsAtZero)   fail("ic-isotope-seam does not end at opacity 0 — ring reset will be visible");
    if (startsAtZero && endsAtZero) ok("ic-isotope-seam hides the ring reset (opacity 0 at both 0% and 100%)");
  }
}

// 10) Linear path strip sits ABOVE the Infinity Curve figure in the source
//     order — the legacy 2D path reads as the "before," the Infinity Curve
//     reads as the K1 "after." Confirm position + presence of the five
//     traditional construction stages.
{
  const linearOpen   = html.indexOf('class="linear-path"');
  const ratchetOpen  = html.indexOf('class="infinity-ratchet"');
  if (linearOpen === -1) fail("missing .linear-path figure — straight-line 'before' comparison is not in the DOM");
  else if (ratchetOpen === -1) fail("missing .infinity-ratchet figure — Infinity Curve diagram is not in the DOM");
  else if (linearOpen > ratchetOpen) fail(".linear-path appears AFTER the Infinity Curve — should sit above it");
  else ok(".linear-path is above the Infinity Curve figure in source order");

  // The five traditional stages must all be labeled — these are the labels
  // the user asked for, "RFI to closeout."
  const stages = ["RFI", "SUBMITTAL", "CHANGE ORDER", "PUNCH", "CLOSEOUT"];
  const linearBlockEnd = html.indexOf("</figure>", linearOpen);
  if (linearOpen !== -1 && linearBlockEnd !== -1) {
    const block = html.slice(linearOpen, linearBlockEnd);
    const missing = stages.filter(s => !block.includes(s));
    if (missing.length) fail(`linear path missing stage label(s): ${missing.join(", ")}`);
    else ok(`linear path labels all five traditional stages (${stages.join(" → ")})`);
  }

  // The Infinity Curve must remain the larger, focal element — confirm its
  // SVG viewBox height (460) is materially larger than the linear strip's
  // (116). This is a proxy for "Infinity Curve is the focal point."
  const linearVB = html.match(/class="linear-path-svg"[^>]*viewBox="0 0 \d+ (\d+)"/);
  const ratchetVB = html.match(/class="infinity-ratchet-svg"[^>]*viewBox="0 0 \d+ (\d+)"/);
  if (linearVB && ratchetVB) {
    const lh = parseInt(linearVB[1], 10);
    const rh = parseInt(ratchetVB[1], 10);
    if (rh < lh * 2) fail(`Infinity Curve (viewBox h=${rh}) is not materially taller than linear strip (h=${lh}) — may not read as focal`);
    else ok(`Infinity Curve remains focal (viewBox height ${rh}px vs linear strip ${lh}px, ratio ${(rh/lh).toFixed(1)}×)`);
  }
}

// 11) Screw imagery legibility. Bill should not have to squint to see the
//     screw — the rod, threads, and ticks must be sized to read at viewing
//     distance.
//
//     a) Central rod: the outer guide channel inside .ic-cinch must be at
//        least 10px wide. The previous 5px hairline rod was the regression
//        Bill flagged.
//     b) Central ticks (.ic-cinch-tooth rects): at least 12×4 each.
//     c) Screw-strip horizontal rod: at least 16px tall.
//     d) Screw-strip ticks: at least 14×5 each.
{
  const cinchOpen = html.indexOf('class="ic-cinch"');
  if (cinchOpen === -1) fail("missing .ic-cinch group — central screw mechanism is gone");
  else {
    const block = html.slice(cinchOpen, cinchOpen + 6000);
    // Scan every <rect> inside .ic-cinch and pick the widest narrow rod
    // (the outer guide channel). The widest rect in this block is the
    // visible rod itself, not the inner shadow groove or the caps.
    const rectWidths = [...block.matchAll(/<rect\b[^>]*\bwidth="(\d+(?:\.\d+)?)"[^>]*\bheight="(\d+(?:\.\d+)?)"/g)]
      .map(m => ({ w: parseFloat(m[1]), h: parseFloat(m[2]) }))
      // Rod-shaped: tall and narrow (height > width × 4).
      .filter(r => r.h > r.w * 4);
    if (rectWidths.length === 0) fail("could not locate central screw guide rod inside .ic-cinch");
    else {
      const w = Math.max(...rectWidths.map(r => r.w));
      if (w < 10) fail(`central screw rod width=${w}px — Bill said he can barely see it; must be ≥10px`);
      else ok(`central screw rod is ${w}px wide (legible)`);
    }
    // Sample one tooth — all six are sized identically.
    const tooth = block.match(/<rect class="ic-cinch-tooth"[^>]*width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
    if (!tooth) fail("could not locate .ic-cinch-tooth rect");
    else {
      const tw = parseFloat(tooth[1]);
      const th = parseFloat(tooth[2]);
      if (tw < 12 || th < 4) fail(`central screw tick is ${tw}×${th}px — must be ≥12×4 to read as a click stop`);
      else ok(`central screw ticks are ${tw}×${th}px (legible click stops)`);
    }
  }

  // Screw-strip horizontal rod.
  const stripOpen = html.indexOf('class="screw-strip-svg"');
  if (stripOpen === -1) fail("missing .screw-strip-svg — horizontal screw panel is gone");
  else {
    const stripClose = html.indexOf("</svg>", stripOpen);
    const stripBlock = html.slice(stripOpen, stripClose);
    // The rod rect is the wide horizontal one (width="640") inside the strip.
    const rod = stripBlock.match(/<rect[^>]*width="640"[^>]*height="(\d+(?:\.\d+)?)"/);
    if (!rod) fail("could not locate horizontal screw-strip rod (width=640 rect)");
    else {
      const rh = parseFloat(rod[1]);
      if (rh < 16) fail(`screw-strip rod is only ${rh}px tall — must be ≥16px to read as a screw`);
      else ok(`screw-strip rod is ${rh}px tall (legible)`);
    }
    const stripTooth = stripBlock.match(/<rect class="ic-cinch-tooth"[^>]*width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
    if (!stripTooth) fail("could not locate screw-strip tick rect");
    else {
      const tw = parseFloat(stripTooth[1]);
      const th = parseFloat(stripTooth[2]);
      if (tw < 14 || th < 5) fail(`screw-strip tick is ${tw}×${th}px — must be ≥14×5 to read at viewing distance`);
      else ok(`screw-strip ticks are ${tw}×${th}px (legible click stops)`);
    }
  }
}

// 12) Linear strip uses a distinct accent color — not the same gold/teal as
//     the Infinity Curve. The "traditional construction" path should read as
//     the OLD lifecycle, visually separate from the live Infinity Curve.
//
//     Strategy: confirm a warm rust/amber color (any color containing the
//     "C76830" / "A04A1E" / "E08856" / "6E2F12" family of legacy-accent
//     hexes) appears inside the linear-path figure AND that the strip's
//     dominant labels are NOT the cool teal (#6FA8B0/#8FA3A8) used by the
//     Infinity Curve board.
{
  const linOpen = html.indexOf('class="linear-path"');
  if (linOpen === -1) fail("missing .linear-path — traditional strip is gone");
  else {
    const linClose = html.indexOf("</figure>", linOpen);
    const block = html.slice(linOpen, linClose);
    const RUST = /#C76830|#A04A1E|#E08856|#6E2F12/i;
    const COOL = /#6FA8B0|#8FA3A8|#5C7378|#3A4F54/i;
    const hasRust = RUST.test(block);
    const stillCool = COOL.test(block);
    if (!hasRust) fail("linear strip has no rust/amber accent color (#C76830/#A04A1E/#E08856) — should read as the legacy 'before' path");
    else ok("linear strip uses a distinct rust accent palette");
    if (stillCool) fail(`linear strip still contains steel/teal palette hex (${(block.match(COOL) || [""])[0]}) — accent must be distinct from Infinity Curve cool tones`);
    else ok("linear strip is free of the Infinity Curve's steel/teal palette");

    // Five stage labels are still all present (regression-guard the rename).
    const stages = ["RFI", "SUBMITTAL", "CHANGE ORDER", "PUNCH", "CLOSEOUT"];
    const missing = stages.filter(s => !block.includes(s));
    if (missing.length) fail(`linear path lost stage label(s) during recolor: ${missing.join(", ")}`);
    else ok(`linear strip preserves stage labels (${stages.join(" → ")})`);

    // The linear strip's CSS border-left must use the same rust accent so
    // the panel chrome agrees with the SVG inside it.
    const linRule = css.match(/\.linear-path\s*\{([\s\S]*?)\}/);
    if (!linRule) fail("missing .linear-path CSS rule");
    else if (!/#C76830|rgba\(199,\s*104,\s*48/i.test(linRule[1])) {
      fail(".linear-path CSS rule does not include the rust accent (#C76830 / rgba(199,104,48,...)) — panel chrome should match the SVG palette");
    } else ok(".linear-path panel chrome uses the rust accent");
  }
}

// 13) Central K1 vault is not so large that it hides the threaded rod. The
//     wheel-scale transform inside .ic-ratchet-spin must be < 0.85 so the
//     screw mechanism around it is visible. (Old: 0.85; polished: 0.72.)
{
  const spinOpen = html.indexOf("ic-ratchet-spin");
  if (spinOpen !== -1) {
    const slice = html.slice(spinOpen, spinOpen + 400);
    const m = slice.match(/<g transform="scale\((\d*\.?\d+)\)">\s*<use href="#ic-ratchet-wheel"/);
    if (!m) fail("could not parse central vault scale transform");
    else {
      const s = parseFloat(m[1]);
      if (s >= 0.85) fail(`central vault scale=${s} — too large; reduce to <0.85 so the screw mechanism reads`);
      else ok(`central vault scaled to ${s} (screw mechanism is not obscured)`);
    }
  }
}

if (errors.length) {
  console.error("\nratchet-check: FAILED");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("\nratchet-check: OK");
