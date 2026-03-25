/**
 * mojo-structure — Lightweight Mojo structure extractor
 *
 * Library entry point. Import parseFile for programmatic use,
 * or use the CLI (src/cli.mjs) for command-line extraction.
 */

export { parseFile, parseParams } from "./parser.mjs";
export { formatSkeleton, formatSummary } from "./format.mjs";
