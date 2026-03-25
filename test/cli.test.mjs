import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "..", "src", "cli.mjs");

describe("CLI error handling", () => {
  it("prints friendly error for nonexistent path", () => {
    const r = spawnSync("node", [cli, "/no/such/path"], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes("path not found"));
  });

  it("prints error when no .mojo files found", () => {
    // src/ contains only .mjs files, no .mojo files
    const srcDir = join(__dirname, "..", "src");
    const r = spawnSync("node", [cli, srcDir], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes("No .mojo files found"));
  });
});
