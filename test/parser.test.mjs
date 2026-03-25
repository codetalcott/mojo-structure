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

// ── modern_syntax.mojo (mojo-syntax skill patterns) ─────────────────────

describe("parseFile — modern_syntax.mojo (skill patterns)", () => {
  const result = parseFile("modern_syntax.mojo", fixture("modern_syntax.mojo"));

  it("extracts comptime declarations including trait composition", () => {
    const n = result.comptimes.find((c) => c.name === "N");
    assert.ok(n);
    assert.equal(n.value, "1024");

    const key = result.comptimes.find((c) => c.name === "KeyElement");
    assert.ok(key);
    assert.equal(key.value, "Copyable & Hashable & Equatable");

    const greeting = result.comptimes.find((c) => c.name === "GREETING");
    assert.ok(greeting);
    assert.equal(greeting.type, "StaticString");
  });

  it("extracts comptime function types (closures)", () => {
    const mf = result.comptimes.find((c) => c.name === "MyFunc");
    assert.ok(mf);
    assert.ok(mf.value.includes("capturing"));

    const sf = result.comptimes.find((c) => c.name === "SIMDFunc");
    assert.ok(sf);
    assert.ok(sf.value.includes("fn[width: Int]"));
  });

  it("extracts @fieldwise_init decorated struct", () => {
    const point = result.structs.find((s) => s.name === "Point");
    assert.ok(point);
    assert.deepEqual(point.decorators, ["@fieldwise_init"]);
    assert.deepEqual(point.traits, ["Copyable", "Movable", "Writable"]);
    assert.equal(point.fields.length, 2);
  });

  it("extracts parametric struct with Self.T fields", () => {
    const container = result.structs.find((s) => s.name === "Container");
    assert.ok(container);
    assert.equal(container.type_params, "[T: Writable]");
    assert.equal(container.fields[0].name, "data");
    assert.equal(container.fields[0].type, "Self.T");
    const get = container.methods.find((m) => m.name === "get");
    assert.ok(get);
    assert.equal(get.returns, "Self.T");
  });

  it("extracts multi-line parametric struct with nested brackets", () => {
    const span = result.structs.find((s) => s.name === "Span");
    assert.ok(span);
    assert.ok(span.type_params.includes("mut: Bool"));
    assert.ok(span.type_params.includes("Origin[mut=mut]"));
    assert.deepEqual(span.traits, ["ImplicitlyCopyable", "Sized"]);
    assert.equal(span.fields.length, 2);
    assert.equal(span.fields[0].type, "UnsafePointer[Self.T]");
  });

  it("extracts argument conventions (out, mut, deinit, ref, var)", () => {
    const mb = result.structs.find((s) => s.name === "ManagedBuffer");
    assert.ok(mb);
    const init = mb.methods.find((m) => m.name === "__init__");
    assert.ok(init.params.find((p) => p.name === "out self"));
    assert.ok(init.params.find((p) => p.name === "var value"));

    const modify = mb.methods.find((m) => m.name === "modify");
    assert.ok(modify.params.find((p) => p.name === "mut self"));

    const consume = mb.methods.find((m) => m.name === "consume");
    assert.ok(consume.params.find((p) => p.name === "deinit self"));

    const view = mb.methods.find((m) => m.name === "view");
    assert.ok(view.params.find((p) => p.name === "ref self"));
    assert.equal(view.returns, "ref[self] Int");
  });

  it("extracts lifecycle methods (copy, move, del)", () => {
    const res = result.structs.find((s) => s.name === "Resource");
    assert.ok(res);
    assert.equal(res.methods.length, 4); // __init__, copy, move, __del__
    const del = res.methods.find((m) => m.name === "__del__");
    assert.ok(del);
    assert.ok(del.params.find((p) => p.name === "deinit self"));
  });

  it("extracts Writable write_to and write_repr_to methods", () => {
    const mt = result.structs.find((s) => s.name === "MyType2");
    assert.ok(mt);
    assert.ok(mt.methods.find((m) => m.name === "write_to"));
    assert.ok(mt.methods.find((m) => m.name === "write_repr_to"));
    const wt = mt.methods.find((m) => m.name === "write_to");
    assert.ok(wt.params.find((p) => p.type === "Some[Writer]"));
  });

  it("extracts iterator structs with inner comptime", () => {
    const iter = result.structs.find((s) => s.name === "MyIter");
    assert.ok(iter);
    assert.equal(iter.comptimes.length, 1);
    assert.equal(iter.comptimes[0].name, "Element");
    assert.equal(iter.comptimes[0].type, "Movable");
    assert.equal(iter.comptimes[0].value, "Int");

    const next = iter.methods.find((m) => m.name === "__next__");
    assert.ok(next);
    assert.equal(next.raises, true);
    assert.equal(next.returns, "Int");
  });

  it("extracts @implicit decorator on constructors", () => {
    const w = result.structs.find((s) => s.name === "Wrapper");
    assert.ok(w);
    const init = w.methods.find((m) => m.name === "__init__");
    assert.deepEqual(init.decorators, ["@implicit"]);
  });

  it("extracts decorator variety (@always_inline, @no_inline, @deprecated)", () => {
    const fast = result.functions.find((f) => f.name === "fast_add");
    assert.deepEqual(fast.decorators, ["@always_inline"]);

    const slow = result.functions.find((f) => f.name === "slow_path");
    assert.deepEqual(slow.decorators, ["@no_inline"]);

    const old = result.functions.find((f) => f.name === "old_api");
    assert.ok(old.decorators[0].includes("@deprecated"));
    assert.ok(old.decorators[0].includes("use new_api instead"));
  });

  it("extracts raises functions", () => {
    const mf = result.functions.find((f) => f.name === "might_fail");
    assert.ok(mf);
    assert.equal(mf.raises, true);
    assert.equal(mf.returns, "Int");
  });
});

// ── gpu_kernel.mojo (mojo-gpu-fundamentals skill patterns) ──────────────

describe("parseFile — gpu_kernel.mojo (GPU skill patterns)", () => {
  const result = parseFile("gpu_kernel.mojo", fixture("gpu_kernel.mojo"));

  it("extracts GPU-related imports", () => {
    const gpuImport = result.imports.find((i) => i.module === "std.gpu");
    assert.ok(gpuImport);
    assert.ok(gpuImport.names.includes("global_idx"));

    const layoutImport = result.imports.find((i) => i.module === "layout");
    assert.ok(layoutImport);
    assert.ok(layoutImport.names.includes("LayoutTensor"));
  });

  it("extracts comptime layout and dimension constants", () => {
    assert.ok(result.comptimes.find((c) => c.name === "dtype"));
    assert.ok(result.comptimes.find((c) => c.name === "SIZE"));
    assert.ok(result.comptimes.find((c) => c.name === "BLOCK_SIZE"));

    const layout = result.comptimes.find((c) => c.name === "layout");
    assert.ok(layout);
    assert.equal(layout.value, "Layout.row_major(SIZE)");

    const numBlocks = result.comptimes.find((c) => c.name === "NUM_BLOCKS");
    assert.equal(numBlocks.value, "ceildiv(SIZE, BLOCK_SIZE)");
  });

  it("extracts kernel functions with LayoutTensor params", () => {
    const add = result.functions.find((f) => f.name === "add_kernel");
    assert.ok(add);
    assert.equal(add.params.length, 4);
    assert.ok(add.params[0].type.includes("LayoutTensor"));
    assert.ok(add.params[0].type.includes("MutAnyOrigin"));
    assert.equal(add.params[3].name, "size");
    assert.equal(add.params[3].type, "Int");
  });

  it("extracts kernel with complex multi-line LayoutTensor params", () => {
    const tiled = result.functions.find((f) => f.name === "tiled_kernel");
    assert.ok(tiled);
    assert.equal(tiled.params.length, 2);
    assert.ok(tiled.params[0].type.includes("LayoutTensor"));
  });

  it("extracts kernel with UnsafePointer params", () => {
    const reduce = result.functions.find((f) => f.name === "reduce_kernel");
    assert.ok(reduce);
    assert.ok(reduce.params[0].type.includes("UnsafePointer[Int32, MutAnyOrigin]"));
  });

  it("extracts host main() as raises function", () => {
    const main = result.functions.find((f) => f.name === "main");
    assert.ok(main);
    assert.equal(main.raises, true);
  });

  it("has no structs (kernels are plain functions)", () => {
    assert.equal(result.structs.length, 0);
  });
});

// ── python_interop.mojo (mojo-python-interop skill patterns) ────────────

describe("parseFile — python_interop.mojo (Python interop skill patterns)", () => {
  const result = parseFile("python_interop.mojo", fixture("python_interop.mojo"));

  it("extracts PythonModuleBuilder imports", () => {
    const pbImport = result.imports.find((i) =>
      i.module === "std.python.bindings",
    );
    assert.ok(pbImport);
    assert.ok(pbImport.names.includes("PythonModuleBuilder"));
  });

  it("extracts fn-declared free functions with PythonObject params", () => {
    const add = result.functions.find((f) => f.name === "add");
    assert.ok(add);
    assert.equal(add.params[0].type, "PythonObject");
    assert.equal(add.returns, "PythonObject");
    assert.equal(add.raises, true);
  });

  it("extracts @fieldwise_init struct with multiple @staticmethod methods", () => {
    const counter = result.structs.find((s) => s.name === "Counter");
    assert.ok(counter);
    assert.deepEqual(counter.decorators, ["@fieldwise_init"]);
    assert.deepEqual(counter.traits, ["Defaultable", "Movable", "Writable"]);

    const statics = counter.methods.filter((m) =>
      m.decorators.includes("@staticmethod"),
    );
    assert.equal(statics.length, 4); // py_init, increment, get_count, config
  });

  it("extracts py_init with multi-line params", () => {
    const counter = result.structs.find((s) => s.name === "Counter");
    const pyInit = counter.methods.find((m) => m.name === "py_init");
    assert.ok(pyInit);
    assert.ok(pyInit.params.find((p) => p.name === "out self"));
    assert.ok(pyInit.params.find((p) => p.type === "PythonObject"));
  });

  it("extracts auto-downcast method pattern (UnsafePointer[Self, MutAnyOrigin])", () => {
    const counter = result.structs.find((s) => s.name === "Counter");
    const gc = counter.methods.find((m) => m.name === "get_count");
    assert.ok(gc);
    assert.ok(gc.params[0].type.includes("UnsafePointer[Self, MutAnyOrigin]"));
  });

  it("extracts kwargs method pattern", () => {
    const counter = result.structs.find((s) => s.name === "Counter");
    const config = counter.methods.find((m) => m.name === "config");
    assert.ok(config);
    assert.ok(config.params.find((p) => p.type.includes("OwnedKwargsDict")));
  });

  it("extracts @export fn PyInit_ entry point", () => {
    const pyInit = result.functions.find((f) =>
      f.name === "PyInit_counter_module",
    );
    assert.ok(pyInit);
    assert.deepEqual(pyInit.decorators, ["@export"]);
    assert.equal(pyInit.returns, "PythonObject");
  });

  it("extracts def functions alongside fn functions", () => {
    const usePy = result.functions.find((f) => f.name === "use_python");
    assert.ok(usePy);
    assert.equal(usePy.raises, true);

    const conv = result.functions.find((f) => f.name === "convert_types");
    assert.ok(conv);
    assert.equal(conv.raises, true);
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
