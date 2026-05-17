#!/usr/bin/env node
// Deterministic check: index.html ships polished public link-preview
// metadata, not internal/dev labels.
//
// Why this exists: a shared link to k1.construction once previewed with
// an internal-sounding title (e.g. "field fix"). Link previews are the
// first impression for buyers and partners; an internal label there is
// a credibility leak. This check fails fast if the title / description /
// OG / Twitter tags are missing, point at the wrong URL, or contain
// dev-only vocabulary that should never reach a customer's phone.
//
// Run: node scripts/check-meta.mjs
// Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const html = readFileSync(resolve(REPO_ROOT, "index.html"), "utf8");

const errors = [];
const fail = (m) => errors.push(m);
const ok = (m) => console.log(`  ok  ${m}`);

function matchTitle(src) {
  const m = src.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : null;
}

function matchMeta(src, attr, name) {
  // attr is "name" or "property"
  const re = new RegExp(
    `<meta\\s+[^>]*${attr}\\s*=\\s*["']${name}["'][^>]*>`,
    "i"
  );
  const tag = src.match(re);
  if (!tag) return null;
  const c = tag[0].match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i);
  return c ? (c[1] ?? c[2] ?? "").trim() : "";
}

// Words that must NEVER show up in a public link preview. These are the
// internal / dev labels that triggered this fix.
const FORBIDDEN = [
  "field fix",
  "hotfix",
  "preview",
  "vercel preview",
  "branch",
  /\bPR\b/,        // word-boundary so "proper" / "Proof" don't trip it
  /\bpr-?\d+/i,    // pr-123 / PR42
];

function hasForbidden(value, label) {
  if (value == null) return;
  for (const f of FORBIDDEN) {
    const hit = typeof f === "string"
      ? value.toLowerCase().includes(f.toLowerCase())
      : f.test(value);
    if (hit) fail(`${label} contains forbidden internal/dev term (${f}): ${JSON.stringify(value)}`);
  }
}

// 1) <title>
const title = matchTitle(html);
if (!title) fail("<title> tag is missing");
else if (title.length < 10) fail(`<title> is too short to be a real preview: ${JSON.stringify(title)}`);
else if (!/k1/i.test(title) || !/construction/i.test(title))
  fail(`<title> should mention K1 and Construction: ${JSON.stringify(title)}`);
else ok(`<title>: ${title}`);
hasForbidden(title, "<title>");

// 2) meta description
const desc = matchMeta(html, "name", "description");
if (!desc) fail('<meta name="description"> is missing');
else if (desc.length < 40) fail(`meta description is too short: ${JSON.stringify(desc)}`);
else ok(`meta description: ${desc}`);
hasForbidden(desc, "meta description");

// 3) Open Graph
const ogChecks = [
  ["og:type",        "website"],
  ["og:site_name",   /K1 Construction/i],
  ["og:title",       /k1.*construction/i],
  ["og:description", null],     // presence + non-empty
  ["og:url",         /^https:\/\/(?:www\.)?k1\.construction\/?$/i],
  ["og:image",       /^https:\/\/[a-z0-9.-]+\/.+\.(?:jpg|jpeg|png|webp)$/i],
];
for (const [name, want] of ogChecks) {
  const v = matchMeta(html, "property", name);
  if (v == null) { fail(`<meta property="${name}"> is missing`); continue; }
  if (!v) { fail(`<meta property="${name}"> is empty`); continue; }
  if (want instanceof RegExp && !want.test(v)) {
    fail(`<meta property="${name}"> value ${JSON.stringify(v)} does not match ${want}`);
    continue;
  }
  if (typeof want === "string" && v !== want) {
    fail(`<meta property="${name}"> expected ${JSON.stringify(want)} got ${JSON.stringify(v)}`);
    continue;
  }
  ok(`${name}: ${v}`);
  hasForbidden(v, name);
}

// 4) Twitter card
const twChecks = [
  ["twitter:card",        /^summary(?:_large_image)?$/i],
  ["twitter:title",       /k1.*construction/i],
  ["twitter:description", null],
];
for (const [name, want] of twChecks) {
  const v = matchMeta(html, "name", name);
  if (v == null) { fail(`<meta name="${name}"> is missing`); continue; }
  if (!v) { fail(`<meta name="${name}"> is empty`); continue; }
  if (want instanceof RegExp && !want.test(v)) {
    fail(`<meta name="${name}"> value ${JSON.stringify(v)} does not match ${want}`);
    continue;
  }
  ok(`${name}: ${v}`);
  hasForbidden(v, name);
}

if (errors.length) {
  console.error(`\nmeta-check: ${errors.length} error(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nmeta-check: OK");
