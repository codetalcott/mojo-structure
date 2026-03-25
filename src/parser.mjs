/**
 * parser.mjs — Mojo structure parser
 *
 * Extracts structural information from Mojo source code:
 * structs, traits, functions, imports, comptime aliases, decorators,
 * fields, and method signatures — while omitting implementation details.
 */

// ── Patterns ────────────────────────────────────────────────────────────────

const RE = {
  // Top-level declarations (column 0)
  struct: /^struct\s+(\w+)(\[.+?\])?(?:\(([^)]+)\))?:/,
  trait: /^trait\s+(\w+)(\[.+?\])?(?:\(([^)]+)\))?:/,
  comptime: /^comptime\s+(\w+)(?::\s*(\w+))?\s*=\s*(.+)/,
  alias: /^alias\s+(\w+)(?::\s*(\w+))?\s*=\s*(.+)/,
  importFrom: /^from\s+(\S+)\s+import\s+(.+)/,
  importBare: /^import\s+(\S+)/,
  decorator: /^(@\w+(?:\(.*?\))?)/,
  docComment: /^##\s?(.*)/,

  // Inside structs/traits (indented)
  field: /^\s{4}var\s+(\w+):\s*(.+)/,
  innerDecorator: /^\s{4}(@\w+(?:\(.*?\))?)/,
  innerComptime: /^\s{4}comptime\s+(\w+)(?::\s*(\w+))?\s*=\s*(.+)/,
  innerAlias: /^\s{4}alias\s+(\w+)(?::\s*(\w+))?\s*=\s*(.+)/,
  innerDocComment: /^\s{4}##\s?(.*)/,
  docstringClose: /^(.*?)"""/,
};

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseFile(filepath, source) {
  const lines = source.split("\n");
  const result = {
    file: filepath,
    imports: [],
    comptimes: [],
    structs: [],
    traits: [],
    functions: [],
  };

  let i = 0;
  let pendingDecorators = [];
  let pendingDocs = [];

  while (i < lines.length) {
    const line = lines[i];

    // ── Blank / pure comment lines ──
    if (line.trim() === "" || /^\s*#(?!#)/.test(line)) {
      if (line.trim() === "") pendingDocs = [];
      i++;
      continue;
    }

    // ── Doc comment (##) at top level ──
    const docMatch = line.match(RE.docComment);
    if (docMatch) {
      pendingDocs.push(docMatch[1]);
      i++;
      continue;
    }

    // ── Decorator at top level ──
    const decoMatch = line.match(RE.decorator);
    if (decoMatch) {
      pendingDecorators.push(decoMatch[1]);
      i++;
      continue;
    }

    // ── Import ──
    const impFrom = line.match(RE.importFrom);
    if (impFrom) {
      let names = impFrom[2];
      if (names.includes("(") && !names.includes(")")) {
        while (i + 1 < lines.length && !lines[i].includes(")")) {
          i++;
          names += " " + lines[i].trim();
        }
      }
      names = names.replace(/[()]/g, "").trim();
      result.imports.push({
        module: impFrom[1],
        names: names.split(/\s*,\s*/).filter(Boolean),
      });
      i++;
      continue;
    }

    const impBare = line.match(RE.importBare);
    if (impBare) {
      result.imports.push({ module: impBare[1], names: [] });
      i++;
      continue;
    }

    // ── Comptime / alias ──
    const ctMatch = line.match(RE.comptime) || line.match(RE.alias);
    if (ctMatch) {
      result.comptimes.push({
        name: ctMatch[1],
        type: ctMatch[2] || null,
        value: ctMatch[3].trim(),
      });
      i++;
      continue;
    }

    // ── Struct ──
    const structLine = collectStructOrTraitHeader(lines, i, "struct");
    if (structLine) {
      const structMatch = structLine.text.match(RE.struct);
      if (structMatch) {
        const node = parseStructOrTrait(structMatch, lines, structLine.bodyStart, pendingDecorators, pendingDocs);
        result.structs.push(node.decl);
        i = node.nextLine;
        pendingDecorators = [];
        pendingDocs = [];
        continue;
      }
    }

    // ── Trait ──
    const traitLine = collectStructOrTraitHeader(lines, i, "trait");
    if (traitLine) {
      const traitMatch = traitLine.text.match(RE.trait);
      if (traitMatch) {
        const node = parseStructOrTrait(traitMatch, lines, traitLine.bodyStart, pendingDecorators, pendingDocs);
        result.traits.push(node.decl);
        i = node.nextLine;
        pendingDecorators = [];
        pendingDocs = [];
        continue;
      }
    }

    // ── Top-level function (def or fn) ──
    const fnLine = collectSignature(lines, i);
    if (fnLine) {
      const fnMatch = matchSignature(fnLine.text);
      if (fnMatch) {
        const doc = collectDocstring(lines, fnLine.nextBodyLine);
        result.functions.push({
          name: fnMatch.name,
          type_params: fnMatch.type_params,
          params: parseParams(fnMatch.params),
          returns: fnMatch.returns,
          raises: fnLine.text.includes(" raises"),
          decorators: [...pendingDecorators],
          doc: pendingDocs.length ? pendingDocs.join("\n") : doc,
        });
        pendingDecorators = [];
        pendingDocs = [];
        i = skipBody(lines, fnLine.nextBodyLine, 0);
        continue;
      }
    }

    // ── Anything else — skip ──
    pendingDecorators = [];
    pendingDocs = [];
    i++;
  }

  return result;
}

/**
 * Parse a struct or trait block: fields, methods, inner comptimes.
 */
function parseStructOrTrait(match, lines, bodyStartLine, decorators, docs) {
  const rawTraits = match[3] || "";
  const decl = {
    name: match[1],
    type_params: match[2] || null,
    traits: rawTraits ? rawTraits.split(/\s*,\s*/).map((t) => t.trim()).filter(Boolean) : [],
    decorators: [...decorators],
    doc: docs.length ? docs.join("\n") : null,
    fields: [],
    methods: [],
    comptimes: [],
  };

  let i = bodyStartLine;
  let pendingDecorators = [];
  let pendingDocs = [];

  while (i < lines.length) {
    const line = lines[i];

    // End of block: non-empty line at column 0
    if (line.length > 0 && line[0] !== " " && line[0] !== "\t") break;

    if (line.trim() === "") {
      pendingDocs = [];
      i++;
      continue;
    }

    // Inner doc comment
    const innerDoc = line.match(RE.innerDocComment);
    if (innerDoc) {
      pendingDocs.push(innerDoc[1]);
      i++;
      continue;
    }

    // Inner decorator
    const innerDeco = line.match(RE.innerDecorator);
    if (innerDeco) {
      pendingDecorators.push(innerDeco[1]);
      i++;
      continue;
    }

    // Field
    const fieldMatch = line.match(RE.field);
    if (fieldMatch) {
      decl.fields.push({
        name: fieldMatch[1],
        type: fieldMatch[2].trim(),
        doc: pendingDocs.length ? pendingDocs.join("\n") : null,
      });
      pendingDocs = [];
      i++;
      continue;
    }

    // Inner comptime / alias
    const ctMatch = line.match(RE.innerComptime) || line.match(RE.innerAlias);
    if (ctMatch) {
      decl.comptimes.push({
        name: ctMatch[1],
        type: ctMatch[2] || null,
        value: ctMatch[3].trim(),
      });
      i++;
      continue;
    }

    // Method
    const methodLine = collectSignature(lines, i, 4);
    if (methodLine) {
      const mMatch = matchSignature(methodLine.text.trim());
      if (mMatch) {
        const doc = collectDocstring(lines, methodLine.nextBodyLine);
        decl.methods.push({
          name: mMatch.name,
          type_params: mMatch.type_params,
          params: parseParams(mMatch.params),
          returns: mMatch.returns,
          raises: methodLine.text.includes(" raises"),
          decorators: [...pendingDecorators],
          doc: pendingDocs.length ? pendingDocs.join("\n") : doc,
        });
        pendingDecorators = [];
        pendingDocs = [];
        i = skipBody(lines, methodLine.nextBodyLine, 4);
        continue;
      }
    }

    i++;
  }

  return { decl, nextLine: i };
}

// ── Struct/trait header helpers ──────────────────────────────────────────────

/**
 * Collect a possibly multi-line struct/trait header.
 * Handles: `struct Name[T: Trait](\n    Parent1, Parent2,\n):`
 * Returns { text, bodyStart } or null.
 */
function collectStructOrTraitHeader(lines, i, keyword) {
  const line = lines[i];
  if (!line.startsWith(keyword + " ")) return null;

  let text = line;
  let j = i + 1;

  // If parens or brackets aren't closed, keep collecting
  while (
    (countChar(text, "(") > countChar(text, ")") ||
     countChar(text, "[") > countChar(text, "]")) &&
    j < lines.length
  ) {
    text += " " + lines[j].trim();
    j++;
  }

  // Strip trailing `:` and normalize whitespace
  text = text.replace(/:\s*$/, "").trim() + ":";
  return { text, bodyStart: j };
}

// ── Signature helpers ───────────────────────────────────────────────────────

/**
 * Match a cleaned-up signature line against def/fn patterns.
 * Returns { name, type_params, params, returns } or null.
 */
function matchSignature(text) {
  // Supports both `def` and `fn` (older Mojo)
  const m = text.match(
    /^(?:def|fn)\s+(\w+)(\[.*?\])?\(([^)]*)\)(?:\s*raises\s*)?(?:\s*->\s*(.+?))?$/,
  );
  if (!m) return null;
  return {
    name: m[1],
    type_params: m[2] || null,
    params: m[3],
    returns: m[4]?.trim() || null,
  };
}

/**
 * Collect a possibly multi-line function signature starting at line i.
 * Returns { text, nextBodyLine, ellipsis } or null.
 */
function collectSignature(lines, i, indent = 0) {
  const prefix = " ".repeat(indent);
  const line = lines[i];
  if (!line.startsWith(prefix + "def ") && !line.startsWith(prefix + "fn ")) return null;

  let text = line;
  let j = i + 1;

  // If parens aren't closed, keep collecting
  while (countChar(text, "(") > countChar(text, ")") && j < lines.length) {
    text += " " + lines[j].trim();
    j++;
  }

  // Strip trailing `: ...` (single-line trait/abstract methods) and trailing `:`
  const hasEllipsis = /:\s*\.\.\./.test(text);
  let cleaned = text.replace(/:\s*\.\.\.\s*$/, "").replace(/:\s*$/, "");
  // Normalize `raises`
  cleaned = cleaned.replace(/\)\s*raises\s*/, ") raises ");
  return { text: cleaned, nextBodyLine: hasEllipsis ? i + 1 : j, ellipsis: hasEllipsis };
}

function countChar(s, ch) {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

/**
 * Try to extract a docstring from the first line(s) of a function body.
 */
function collectDocstring(lines, startLine) {
  if (startLine >= lines.length) return null;
  const first = lines[startLine];

  const single = first.match(/^\s+"""(.+)"""/);
  if (single) return single[1].trim();

  const open = first.match(/^\s+"""(.*)/);
  if (open) {
    const parts = open[1] ? [open[1]] : [];
    for (let j = startLine + 1; j < lines.length; j++) {
      const close = lines[j].match(RE.docstringClose);
      if (close) {
        if (close[1].trim()) parts.push(close[1].trim());
        return parts.join("\n");
      }
      parts.push(lines[j].trim());
    }
  }

  return null;
}

/**
 * Skip a function/method body. Returns the line index after the body.
 */
function skipBody(lines, startLine, parentIndent) {
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    const lineIndent = line.search(/\S/);
    if (lineIndent <= parentIndent) break;
    i++;
  }
  return i;
}

/**
 * Parse a parameter string into [{name, type}].
 */
export function parseParams(paramStr) {
  if (!paramStr.trim()) return [];

  const params = [];
  let depth = 0;
  let current = "";

  for (const ch of paramStr) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      params.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) params.push(current.trim());

  return params
    .filter(Boolean)
    .map((p) => {
      p = p.trim();
      if (p === "*") return null;
      const colonIdx = p.indexOf(":");
      if (colonIdx === -1) return { name: p, type: null };
      return {
        name: p.slice(0, colonIdx).trim(),
        type: p.slice(colonIdx + 1).trim(),
      };
    })
    .filter(Boolean);
}
