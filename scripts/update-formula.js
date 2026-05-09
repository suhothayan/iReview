#!/usr/bin/env node
// Rewrites homebrew/ireview.rb for a new release tag.
//
// Usage: node scripts/update-formula.js <version>
//   e.g. node scripts/update-formula.js 0.2.0
//
// Reads SHA256SUMS from the matching GitHub release and substitutes
// `version`, all four `url` lines, and all four `sha256` lines.
// Run after publishing the release; commit the updated formula to the
// homebrew-tap repo.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORMULA = path.join(__dirname, "..", "homebrew", "ireview.rb");

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error("usage: update-formula.js <version>   e.g. 0.2.0");
  process.exit(1);
}

const tag = `v${version}`;
const sumsUrl = `https://github.com/suhothayan/iReview/releases/download/${tag}/SHA256SUMS`;

const res = await fetch(sumsUrl);
if (!res.ok) {
  console.error(`could not fetch ${sumsUrl}: ${res.status}`);
  process.exit(1);
}
const sums = Object.fromEntries(
  (await res.text())
    .trim()
    .split("\n")
    .map((line) => {
      const [sha, file] = line.split(/\s+/);
      return [file, sha];
    }),
);

const required = [
  "ireview-macos-arm64",
  "ireview-macos-x64",
  "ireview-linux-x64",
];
for (const f of required) {
  if (!sums[f]) {
    console.error(`SHA256SUMS missing entry for ${f}`);
    process.exit(1);
  }
}

let formula = fs.readFileSync(FORMULA, "utf8");

formula = formula.replace(/version "[^"]+"/, `version "${version}"`);

for (const file of required) {
  const urlRe = new RegExp(
    `url "https://github\\.com/suhothayan/iReview/releases/download/v[^/]+/${file}"`,
  );
  formula = formula.replace(
    urlRe,
    `url "https://github.com/suhothayan/iReview/releases/download/${tag}/${file}"`,
  );
}

const lines = formula.split("\n");
let lastFile = null;
for (let i = 0; i < lines.length; i++) {
  const urlMatch = lines[i].match(/\/([^/"]+)"\s*$/);
  if (urlMatch && required.includes(urlMatch[1])) {
    lastFile = urlMatch[1];
    continue;
  }
  if (lastFile && /sha256 "/.test(lines[i])) {
    lines[i] = lines[i].replace(/sha256 "[^"]+"/, `sha256 "${sums[lastFile]}"`);
    lastFile = null;
  }
}
formula = lines.join("\n");

fs.writeFileSync(FORMULA, formula);
console.log(`updated homebrew/ireview.rb to ${tag}`);
console.log("next: copy this file into the homebrew-tap repo and push");
