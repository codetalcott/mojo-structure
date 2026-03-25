import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseFile, parseParams } from "../src/parser.mjs";
import { formatSkeleton, formatSummary } from "../src/format.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseFile — basic.mojo", () => {
  const result = parseFile("basic.mojo", fixture("basic.mojo"));

  it("extracts imports including multi-line parens", () => {
    assert.equal(result.imports.length, 3);
    assert.equal(result.imports[0].module, "std.ffi");
    assert.deepEqual(result.imports[0].names, ["OwnedDLHandle"]);
    assert.equal(result.imports[2].module, "std.collections");
    assert.ok(result.imports[2].names.includes("Optional"));
    assert.ok(result.imports[2].names.includes("List"));
  });

  it("extracts comptime and alias declarations", () => {
    assert.equal(result.comptimes.length, 3);
    assert.equal(result.comptimes[0].name, "MyEnv");
    assert.equal(result.comptimes[1].name, "MAX_SIZE");
    assert.equal(result.comptimes[1].type, "Int");
    assert.equal(result.comptimes[1].value, "128");
    assert.equal(result.comptimes[2].name, "OldAlias");
    assert.equal(result.comptimes[2].value, "Int32");
  });

  it("extracts traits with methods", () => {
    assert.equal(result.traits.length, 2);

    const conv = result.traits[0];
    assert.equal(conv.name, "Convertible");
    assert.equal(conv.methods.length, 1);
    assert.equal(conv.methods[0].name, "convert");
    assert.equal(conv.methods[0].raises, true);
    assert.equal(conv.methods[0].returns, "MyEnv");

    const build = result.traits[1];
    assert.equal(build.name, "Buildable");
    assert.deepEqual(build.traits, ["Convertible"]);
    assert.equal(build.methods[0].decorators[0], "@staticmethod");
  });

  it("extracts trait doc comments", () => {
    assert.ok(result.traits[0].doc.includes("simple trait"));
  });

  it("extracts structs with fields and methods", () => {
    const point = result.structs.find((s) => s.name === "Point");
    assert.ok(point);
    assert.deepEqual(point.traits, ["Movable"]);
    assert.equal(point.fields.length, 2);
    assert.equal(point.fields[0].name, "x");
    assert.equal(point.fields[0].type, "Float64");
    assert.ok(point.fields[0].doc.includes("x coordinate"));
  });

  it("extracts struct methods with decorators", () => {
    const point = result.structs.find((s) => s.name === "Point");
    const origin = point.methods.find((m) => m.name === "origin");
    assert.ok(origin);
    assert.deepEqual(origin.decorators, ["@staticmethod"]);
    assert.equal(origin.returns, "Point");
  });

  it("extracts method docstrings", () => {
    const point = result.structs.find((s) => s.name === "Point");
    const dist = point.methods.find((m) => m.name === "distance");
    assert.equal(dist.doc, "Compute distance from origin.");
  });

  it("extracts inner comptime in structs", () => {
    const config = result.structs.find((s) => s.name === "Config");
    assert.equal(config.comptimes.length, 1);
    assert.equal(config.comptimes[0].name, "VERSION");
    assert.equal(config.comptimes[0].value, "1");
  });

  it("extracts top-level functions", () => {
    const greet = result.functions.find((f) => f.name === "greet");
    assert.ok(greet);
    assert.equal(greet.returns, "String");
    assert.equal(greet.params[0].name, "name");
    assert.equal(greet.params[0].type, "String");
    assert.equal(greet.doc, "Return a greeting.");
  });

  it("extracts generic functions with type params", () => {
    const add = result.functions.find((f) => f.name === "add");
    assert.ok(add);
    assert.equal(add.type_params, "[T: AnyType]");
  });

  it("extracts decorated functions", () => {
    const exp = result.functions.find((f) => f.name === "my_exported_func");
    assert.ok(exp);
    assert.deepEqual(exp.decorators, ['@export("my_func", ABI="C")']);
  });

  it("handles multi-line parameter lists", () => {
    const ml = result.functions.find((f) => f.name === "multi_line_params");
    assert.ok(ml);
    assert.equal(ml.params.length, 3);
    assert.equal(ml.raises, true);
    assert.equal(ml.returns, "String");
  });

  it("extracts struct doc comments", () => {
    const point = result.structs.find((s) => s.name === "Point");
    assert.ok(point.doc.includes("2D coordinate"));
  });
});

describe("parseFile — old_syntax.mojo (fn keyword)", () => {
  const result = parseFile("old_syntax.mojo", fixture("old_syntax.mojo"));

  it("extracts fn-declared functions", () => {
    const add = result.functions.find((f) => f.name === "add");
    assert.ok(add);
    assert.equal(add.returns, "Int");
  });

  it("extracts fn-declared methods in structs", () => {
    const counter = result.structs[0];
    assert.equal(counter.name, "Counter");
    assert.ok(counter.methods.find((m) => m.name === "increment"));
    assert.ok(counter.methods.find((m) => m.name === "get"));
  });

  it("handles raises on fn declarations", () => {
    const ds = result.functions.find((f) => f.name === "do_stuff");
    assert.ok(ds);
    assert.equal(ds.raises, true);
    assert.equal(ds.returns, "String");
  });

  it("extracts alias as comptime", () => {
    assert.equal(result.comptimes.length, 2);
    assert.equal(result.comptimes[0].name, "MyType");
    assert.equal(result.comptimes[1].name, "LIMIT");
  });
});

describe("parseParams", () => {
  it("handles empty params", () => {
    assert.deepEqual(parseParams(""), []);
  });

  it("handles self", () => {
    const p = parseParams("self");
    assert.equal(p.length, 1);
    assert.equal(p[0].name, "self");
    assert.equal(p[0].type, null);
  });

  it("handles keyword-only marker", () => {
    const p = parseParams("out self, *, copy: Self");
    assert.equal(p.length, 2); // * is filtered
    assert.equal(p[0].name, "out self");
    assert.equal(p[1].name, "copy");
    assert.equal(p[1].type, "Self");
  });

  it("handles nested brackets in types", () => {
    const p = parseParams("ptr: UnsafePointer[Byte, MutAnyOrigin], count: Int");
    assert.equal(p.length, 2);
    assert.equal(p[0].type, "UnsafePointer[Byte, MutAnyOrigin]");
    assert.equal(p[1].type, "Int");
  });
});

describe("formatSkeleton", () => {
  const result = parseFile("basic.mojo", fixture("basic.mojo"));
  const skeleton = formatSkeleton(result);

  it("includes trait signatures with ...", () => {
    assert.ok(skeleton.includes("trait Convertible:"));
    assert.ok(skeleton.includes("    def convert(self, env: MyEnv) raises -> MyEnv: ..."));
  });

  it("includes struct fields", () => {
    assert.ok(skeleton.includes("    var x: Float64"));
  });

  it("includes method signatures with ...", () => {
    assert.ok(skeleton.includes("    def distance(self) -> Float64: ..."));
  });

  it("includes decorators before methods", () => {
    assert.ok(skeleton.includes("    @staticmethod\n    def origin() -> Point: ..."));
  });

  it("includes imports", () => {
    assert.ok(skeleton.includes("from std.ffi import OwnedDLHandle"));
  });
});

describe("formatSummary", () => {
  const result = parseFile("basic.mojo", fixture("basic.mojo"));
  const summary = formatSummary(result);

  it("includes file name and counts", () => {
    assert.ok(summary.includes("basic.mojo:"));
    assert.ok(summary.includes("structs"));
    assert.ok(summary.includes("traits"));
    assert.ok(summary.includes("functions"));
    assert.ok(summary.includes("comptimes"));
  });
});
