#!/usr/bin/env node
// Deterministic check: the homepage carries the K1 lifecycle, system
// architecture (M08 / IP-COVERED), and Role-Based Permission Matrix
// content that Bill asked to surface from the K1 Command Center.
//
// History: the Command Center hosts the canonical lifecycle / four-gate /
// permissions content. We pulled the patent-safe language and matrix onto
// the front page so the homepage stands alone, but the strings are easy
// to break with a careless edit. This check fails fast if any of the
// required strings or the matrix structure has regressed.
//
// Run: node scripts/check-architecture.mjs
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

// 1) Required content strings — patent-safe language, lifecycle, gates, verbs.
const REQUIRED = [
  // Lifecycle headline + risk-model copy
  "Project lifecycle",
  "field event to risk model",
  "risk models",
  // System architecture posture
  "Four gates, one chain of custody",
  "PATENT-PENDING",
  "IP-COVERED",
  "K1 listens to the jobsite before it commands it",
  "does not autonomously stop work",
  // Lifecycle stage names (M01..M08 names)
  "Access Gate",
  "Activation Gate",
  "Human Validation Gate",
  "Evidence Vault",
  "Workflow Routing",
  "Control Panel",
  // Permission matrix structural strings
  "Role-Based Permission Matrix",
  "Foreman",
  "Super",
  ">PM<",          // header cell, avoid matching "PM /" etc.
  "Safety",
  "Exec View",
  // Legend
  "● FULL · ◐ CONDITIONAL · — NONE",
];

for (const needle of REQUIRED) {
  if (!html.includes(needle)) fail(`index.html is missing required string: ${JSON.stringify(needle)}`);
}
if (errors.length === 0) ok(`all ${REQUIRED.length} required architecture/lifecycle/matrix strings are present`);

// 2) The five K1 operating verbs must all appear in the dedicated verb
//    strip (Receive · Organize · Validate · Preserve · Route). We grep the
//    verb strip block itself so we don't get a false positive from prose.
const verbStripRe = /<div class="k1arch-verbs"[\s\S]*?<\/div>/;
const verbBlockMatch = html.match(verbStripRe);
if (!verbBlockMatch) {
  fail("missing .k1arch-verbs strip — five operating verbs are not surfaced");
} else {
  const block = verbBlockMatch[0];
  const verbs = ["Receive", "Organize", "Validate", "Preserve", "Route"];
  const missing = verbs.filter(v => !new RegExp(`>\\s*${v}\\s*<`).test(block));
  if (missing.length) fail(`verb strip is missing: ${missing.join(", ")}`);
  else ok(`verb strip carries all five verbs: ${verbs.join(" · ")}`);
}

// 3) Permission matrix structural integrity — 6 capability rows × 5 role
//    columns, with the exact symbol counts Bill specified.
const matrixRe = /<table class="k1arch-matrix">[\s\S]*?<\/table>/;
const matrixMatch = html.match(matrixRe);
if (!matrixMatch) {
  fail("could not find .k1arch-matrix table in index.html");
} else {
  const tbl = matrixMatch[0];

  // 5 role headers in the right order
  const expectedHeaders = ["Foreman", "Super", "PM", "Safety", "Exec View"];
  const headRe = /<thead>([\s\S]*?)<\/thead>/;
  const head = tbl.match(headRe);
  if (!head) fail("matrix has no <thead>");
  else {
    const headTxt = head[1];
    for (const h of expectedHeaders) {
      if (!new RegExp(`<th[^>]*>\\s*${h.replace(/ /g, "\\s+")}\\s*</th>`).test(headTxt)) {
        fail(`matrix header missing column: ${h}`);
      }
    }
    if (errors.length === 0 || !errors.some(e => e.includes("matrix header"))) {
      ok(`matrix has all 5 role columns in order: ${expectedHeaders.join(" · ")}`);
    }
  }

  // 6 capability rows in tbody — each with exactly 5 data cells
  const bodyRe = /<tbody>([\s\S]*?)<\/tbody>/;
  const body = tbl.match(bodyRe);
  if (!body) fail("matrix has no <tbody>");
  else {
    const rowMatches = [...body[1].matchAll(/<tr>[\s\S]*?<\/tr>/g)];
    if (rowMatches.length !== 6) fail(`matrix has ${rowMatches.length} rows, expected 6 capability rows`);
    else ok(`matrix has 6 capability rows`);

    for (const [i, row] of rowMatches.entries()) {
      const tds = (row[0].match(/<td\b/g) || []).length;
      if (tds !== 5) fail(`matrix row ${i + 1} has ${tds} <td> cells, expected 5 (one per role)`);
    }

    // Symbol totals: per Bill's spec the matrix must contain
    //   ● 18 times, ◐ 3 times, — 9 times
    const fullCount = (body[1].match(/●/g) || []).length;
    const condCount = (body[1].match(/◐/g) || []).length;
    const noneCount = (body[1].match(/—/g) || []).length;
    if (fullCount !== 18) fail(`matrix has ${fullCount} ● cells, expected 18`);
    if (condCount !== 3)  fail(`matrix has ${condCount} ◐ cells, expected 3`);
    if (noneCount !== 9)  fail(`matrix has ${noneCount} — cells, expected 9`);
    if (fullCount === 18 && condCount === 3 && noneCount === 9) {
      ok(`matrix symbol totals match spec (● 18 · ◐ 3 · — 9)`);
    }
  }
}

// 4) The new section CTA points to the Perplexity Command Center URL.
const ctaSectionRe = /<div class="k1arch-cta">[\s\S]*?<\/div>/;
const ctaBlock = html.match(ctaSectionRe);
if (!ctaBlock) fail("missing .k1arch-cta — new section has no Command Center CTA");
else {
  if (!ctaBlock[0].includes(CCC_URL)) {
    fail(`.k1arch-cta does not link to the Perplexity Command Center URL (${CCC_URL})`);
  } else ok(`new section CTA links to the Perplexity K1 Command Center`);
  if (!/target=["']_blank["']/.test(ctaBlock[0])) {
    fail(`.k1arch-cta is missing target="_blank" — Perplexity destination is cross-origin`);
  }
  if (!/rel=["'][^"']*noopener[^"']*["']/.test(ctaBlock[0])) {
    fail(`.k1arch-cta is missing rel="noopener" — required with target="_blank"`);
  }
}

// 5) The new section anchor itself exists.
if (!/id="architecture"/.test(html)) {
  fail(`#architecture section anchor not found in index.html`);
} else ok(`#architecture section anchor present`);

if (errors.length) {
  console.error("\narchitecture-check: FAILED");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("\narchitecture-check: OK");
