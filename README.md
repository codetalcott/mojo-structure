# mojo-structure

Lightweight Mojo structure extractor — parse `.mojo` files into structural summaries for AI context generation.

Extracts structs, traits, functions, imports, comptime/alias declarations, decorators, fields, and method signatures while omitting implementation details. Zero dependencies.

## Install

```bash
npm install mojo-structure
```

Or run directly:

```bash
npx mojo-structure src/
```

## CLI Usage

```bash
# JSON output (default)
mojo-structure src/

# Mojo-like skeleton with ... bodies
mojo-structure src/main.mojo --skeleton

# One-line counts per file
mojo-structure src/ --format summary

# Read from stdin
cat lib.mojo | mojo-structure --stdin --skeleton
```

## Programmatic API

```js
import { parseFile, formatSkeleton, formatSummary } from "mojo-structure";

const source = fs.readFileSync("lib.mojo", "utf8");
const parsed = parseFile("lib.mojo", source);

// parsed has: { file, imports, vars, comptimes, structs, traits, functions }

console.log(formatSkeleton(parsed));  // Mojo-like skeleton
console.log(formatSummary(parsed));   // one-line summary
```

### `parseFile(filepath, source)`

Returns a structure object with:

- **imports** — `[{ module, names }]`
- **vars** — `[{ name, type, doc }]` module-level variables
- **comptimes** — `[{ name, type, value }]` comptime and alias declarations
- **structs** — `[{ name, type_params, traits, decorators, doc, fields, methods, comptimes, structs }]`
- **traits** — same shape as structs
- **functions** — `[{ name, type_params, params, returns, raises, decorators, doc }]`

### `parseParams(paramStr)`

Parses a parameter string into `[{ name, type }]`. Handles nested brackets, keyword-only markers (`*`), and argument conventions (`out`, `mut`, `ref`, `deinit`, `var`).

## Supported Mojo Syntax

- `def` and `fn` function keywords
- `comptime` and `alias` constant declarations
- `@staticmethod`, `@fieldwise_init`, `@export(...)`, `@always_inline`, `@implicit`, and other decorators
- Multi-line parameter lists with nested brackets
- Parametric structs/traits (`[T: AnyType]`), multi-line trait lists
- Nested structs, `comptime if`/`@parameter if` branches, module-level `var`
- `raises` modifier, `##` doc comments, `"""` docstrings
- `mut`, `out`, `deinit`, `ref`, `var` parameter conventions

## License

MIT
