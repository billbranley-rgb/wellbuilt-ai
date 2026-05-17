#!/usr/bin/env node
// Deterministic verification for the Project Lifecycle section.
//
// Why this exists: the front page now mirrors the milestone board from the
// K1 Command Center (M01 Access Gate → M08 System Architecture). Several
// things must stay in place or the section silently drifts away from the
// source-of-truth board:
//   1) The section exists with id="lifecycle" and a title that mentions
//      "Project lifecycle" + a "field event → risk model" framing.
//   2) The lifecycle copy explicitly says validated events seal at
//      closeout and feed forward into future estimating and risk models.
//   3) All eight M-stage labels (Access Gate, Activation Gate / Live Bind,
//      Field Capture, Human Validation, Evidence Vault, Workflow Routing,
//      Control Panel, System Architecture) appear once each, in order.
//   4) The footer CTA opens the canonical Perplexity-hosted K1 Command
//      Center in a new tab — same destination as the other front-page
//      "Open full command center" CTAs.
//   5) The section is reachable from the primary nav (#lifecycle anchor).
//
// Run: node scripts/check-lifecycle.mjs
// Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const html = readFileSync(resolve(REPO_ROOT, "index.html"), "utf8");
const CCC_URL = "https://www.perplexity.ai/computer/a/k1-command-center-xSmQsNfrSlOEDkPYLQtHsQ";

const errors = [];
function fail(msg) { errors.push(msg); }
function ok(msg)   { console.log(`  ok  ${msg}`); }

// 1) Section exists.
const sectionOpen = html.indexOf('id="lifecycle"');
if (sectionOpen === -1) fail('missing <section id="lifecycle"> in index.html');
else ok('lifecycle section is present');

// Slice out the lifecycle section body — from the section open to the next
// </section>. All subsequent checks operate on this slice so we don't get
// false positives from other parts of the page.
let sectionBody = "";
if (sectionOpen !== -1) {
  const close = html.indexOf("</section>", sectionOpen);
  if (close === -1) fail("lifecycle section is not closed");
  else sectionBody = html.slice(sectionOpen, close);
}

// 2) Title + risk-model framing.
{
  if (!/Project lifecycle/i.test(sectionBody)) fail('lifecycle section does not contain the eyebrow/title text "Project lifecycle"');
  else ok('lifecycle section title includes "Project lifecycle"');

  if (!/field event/i.test(sectionBody) || !/risk model/i.test(sectionBody)) {
    fail('lifecycle section is missing the "field event → risk model" framing');
  } else ok('lifecycle section frames the flow from field event to risk model');

  if (!/seal at closeout|seal\s+at\s+closeout/i.test(sectionBody) && !/closeout/i.test(sectionBody)) {
    fail('lifecycle section does not mention closeout');
  } else ok('lifecycle section mentions closeout');

  if (!/future estimating/i.test(sectionBody)) {
    fail('lifecycle section does not mention "future estimating"');
  } else ok('lifecycle section mentions future estimating');
}

// 3) Eight M-stage milestones, each with the label phrasing from the
//    Command Center board, in order.
const milestones = [
  { tag: "M01", label: "Access Gate" },
  { tag: "M02", label: "Activation Gate" },
  { tag: "M03", label: "Field Capture" },
  { tag: "M04", label: "Human Validation" },
  { tag: "M05", label: "Evidence Vault" },
  { tag: "M06", label: "Workflow Routing" },
  { tag: "M07", label: "Control Panel" },
  { tag: "M08", label: "System Architecture" },
];

let lastIdx = -1;
let outOfOrder = false;
for (const { tag, label } of milestones) {
  // Tag must appear inside the section.
  const tagIdx = sectionBody.indexOf(tag);
  if (tagIdx === -1) { fail(`lifecycle milestone tag ${tag} is missing`); continue; }
  if (tagIdx <= lastIdx) { fail(`milestone ${tag} appears out of order in the rail`); outOfOrder = true; }
  lastIdx = tagIdx;
  // Label must also appear (case-insensitive substring), inside the
  // section, ideally near its tag.
  const labelRe = new RegExp(label.replace(/\s+/g, "\\s+"), "i");
  if (!labelRe.test(sectionBody)) fail(`lifecycle milestone ${tag} is missing its label "${label}"`);
}
if (!outOfOrder) ok(`all 8 milestones (M01–M08) are present and in order`);

// "Live Bind" and "Risk Models / risk models" specifically — the source
// board uses those exact phrases.
if (!/Live Bind/i.test(sectionBody)) fail('lifecycle section is missing the "Live Bind" phrasing for M02');
else ok('lifecycle section uses the "Live Bind" phrasing');

if (!/risk model/i.test(sectionBody)) fail('lifecycle section is missing the "risk model" phrase');
else ok('lifecycle section includes the "risk model" phrase');

// 4) Footer CTA points at the canonical Perplexity Command Center URL,
//    opens in a new tab with safe rel attrs. The "Open full command
//    center" link inside this section must be the Perplexity URL — the
//    global check-console.mjs check verifies all such links, but we
//    re-check here to make sure this section specifically participates.
{
  const ctaRe = /<a\b[^>]*\bhref=(["'])([^"']+)\1[^>]*>\s*Open full command center\s*<\/a>/i;
  const m = sectionBody.match(ctaRe);
  if (!m) fail('lifecycle section is missing an "Open full command center" CTA');
  else {
    if (m[2] !== CCC_URL) fail(`lifecycle CTA href is ${JSON.stringify(m[2])} — should be the Perplexity K1 Command Center URL`);
    else ok('lifecycle CTA points to the Perplexity K1 Command Center URL');
    const tag = m[0];
    if (!/\btarget=["']_blank["']/.test(tag)) fail('lifecycle CTA is missing target="_blank"');
    if (!/\brel=["'][^"']*noopener[^"']*["']/.test(tag)) fail('lifecycle CTA is missing rel="noopener"');
  }
}

// 5) Primary nav reaches the section.
if (!/href="#lifecycle"/.test(html)) fail('primary nav has no link to #lifecycle');
else ok('primary nav links to #lifecycle');

if (errors.length) {
  console.error("\nlifecycle-check: FAILED");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("\nlifecycle-check: OK");
