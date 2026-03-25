#!/usr/bin/env node
/**
 * mojo-structure CLI
 *
 * Usage:
 *   mojo-structure src/                          # JSON output (default)
 *   mojo-structure src/ --skeleton               # Mojo-like skeleton
 *   mojo-structure src/ --format summary         # one-line counts per file
 *   mojo-structure --stdin < file.mojo           # read from stdin
 *   mojo-structure --stdin --skeleton < file.mojo
 *   cat file.mojo | mojo-structure --stdin       # pipe mode
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { parseFile } from "./parser.mjs";
import { formatSkeleton, formatSummary } from "./format.mjs";

// ── File collection ─────────────────────────────────────────────────────────

function collectMojoFiles(target) {
  const stat = statSync(target);
  if (stat.isFile()) return [target];

  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === "__pycache__" || entry === ".git" || entry === "build" || entry === "node_modules" || entry === ".agents") continue;
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else if (entry.endsWith(".mojo") && entry !== "__init__.mojo") files.push(full);
    }
  }
  walk(target);
  return files.sort();
}

function readStdin() {
  return readFileSync(0, "utf8");
}

// ── Argument parsing ────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`mojo-structure — Lightweight Mojo structure extractor

Usage:
  mojo-structure <path>              Parse file or directory (recursive)
  mojo-structure --stdin             Read Mojo source from stdin

Output formats:
  --format json                      Structured JSON (default)
  --skeleton                         Mojo-like skeleton with ... bodies
  --format summary                   One-line counts per file

Examples:
  mojo-structure src/
  mojo-structure src/main.mojo --skeleton
  cat lib.mojo | mojo-structure --stdin --skeleton
  mojo-structure src/ --format summary`);
  process.exit(0);
}

const useStdin = args.includes("--stdin");
const format = args.includes("--format")
  ? args[args.indexOf("--format") + 1]
  : args.includes("--skeleton")
    ? "skeleton"
    : "json";

// ── Main ────────────────────────────────────────────────────────────────────

let results;

if (useStdin) {
  const source = readStdin();
  results = [parseFile("<stdin>", source)];
} else {
  const target = args.find((a) => !a.startsWith("--")) || ".";
  let files;
  try {
    files = collectMojoFiles(target);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(`Error: path not found: ${target}`);
      process.exit(1);
    }
    throw err;
  }
  if (files.length === 0) {
    console.error(`No .mojo files found in: ${target}`);
    process.exit(1);
  }
  results = files.map((f) => {
    const source = readFileSync(f, "utf8");
    const basePath = relative(process.cwd(), f);
    return parseFile(basePath, source);
  });
}

if (format === "skeleton") {
  for (const r of results) {
    if (results.length > 1) console.log(`# ── ${r.file} ──\n`);
    console.log(formatSkeleton(r));
    if (results.length > 1) console.log("");
  }
} else if (format === "json") {
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
} else if (format === "summary") {
  for (const r of results) {
    console.log(formatSummary(r));
  }
} else {
  console.error(`Unknown format: ${format}`);
  process.exit(1);
}
