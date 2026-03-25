# CLAUDE.md

## Project

**mojo-structure** — Lightweight Mojo structure extractor for AI context generation.

Parses `.mojo` files and extracts structural information (structs, traits, functions, imports, comptime/alias declarations, decorators, fields, method signatures) while omitting implementation details. Produces compact summaries suitable for LLM context windows.

## Commands

```bash
npm test                                    # run all tests
node src/cli.mjs path/to/src/              # JSON output (default)
node src/cli.mjs path/to/file.mojo --skeleton  # Mojo-like skeleton
node src/cli.mjs path/to/src/ --format summary  # one-line counts
cat file.mojo | node src/cli.mjs --stdin        # pipe mode
```

## Architecture

```
src/parser.mjs    # Core parser: parseFile(), parseParams()
src/format.mjs    # Output formatters: formatSkeleton(), formatSummary()
src/index.mjs     # Library entry point (re-exports)
src/cli.mjs       # CLI with --stdin, --skeleton, --format options
test/             # node:test tests + .mojo fixtures
```

### Parser design

Line-by-line regex parser using indentation for scope. No AST library dependencies.

- **Top-level dispatch**: imports, comptime/alias, struct, trait, def/fn
- **Struct/trait block parser**: fields (`var`), methods (`def`/`fn`), inner comptime, decorators, doc comments
- **Multi-line signatures**: paren-counting to join continuation lines
- **Body skipping**: indentation-based — skips everything deeper than the declaration's indent level
- **Single-line trait methods**: detects `: ...` suffix, doesn't try to skip a body

### Mojo syntax support

- `def` (current) and `fn` (legacy) function keywords
- `comptime` (current) and `alias` (legacy) constant declarations
- `@staticmethod`, `@export(...)`, and other decorators
- Multi-line parameter lists with nested brackets
- Parametric structs/traits (`[T: AnyType]`), multi-line trait lists
- Nested structs, `comptime if`/`@parameter if` branches, module-level `var`
- `raises` modifier, `##` doc comments, `"""` docstrings
- `mut`, `out`, `deinit`, `ref`, `var` parameter modifiers

### Legacy syntax policy

We support `fn` and `alias` because real codebases are mid-transition. Other removed syntax (`inout`, `owned`, `@value`, `let`, etc.) either lives inside bodies we skip or parses naturally as raw strings in parameter positions. Don't add new special handling for patterns the language is removing.

## Development workflow

TDD: write a test fixture in `test/fixtures/`, add test cases in `test/parser.test.mjs`, then implement.
