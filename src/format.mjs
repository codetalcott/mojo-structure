/**
 * format.mjs — Output formatters for parsed Mojo structure
 */

/**
 * Render as a compact "skeleton" — looks like Mojo source but bodies replaced with `...`
 */
export function formatSkeleton(parsed) {
  const out = [];

  for (const imp of parsed.imports) {
    if (imp.names.length) {
      out.push(`from ${imp.module} import ${imp.names.join(", ")}`);
    } else {
      out.push(`import ${imp.module}`);
    }
  }
  if (parsed.imports.length) out.push("");

  for (const ct of parsed.comptimes) {
    const typeAnno = ct.type ? `: ${ct.type}` : "";
    out.push(`comptime ${ct.name}${typeAnno} = ${ct.value}`);
  }
  if (parsed.comptimes.length) out.push("");

  for (const t of parsed.traits) {
    const traits = t.traits.length ? `(${t.traits.join(", ")})` : "";
    const tp = t.type_params || "";
    for (const d of t.decorators) out.push(d);
    out.push(`trait ${t.name}${tp}${traits}:`);
    for (const m of t.methods) {
      out.push(formatMethodSig(m, "    ") + " ...");
    }
    out.push("");
  }

  for (const s of parsed.structs) {
    const traits = s.traits.length ? `(${s.traits.join(", ")})` : "";
    const tp = s.type_params || "";
    for (const d of s.decorators) out.push(d);
    out.push(`struct ${s.name}${tp}${traits}:`);
    for (const f of s.fields) {
      out.push(`    var ${f.name}: ${f.type}`);
    }
    if (s.fields.length && s.methods.length) out.push("");
    for (const m of s.methods) {
      out.push(formatMethodSig(m, "    ") + " ...");
    }
    out.push("");
  }

  for (const f of parsed.functions) {
    for (const d of f.decorators) out.push(d);
    out.push(formatFnSig(f) + " ...");
  }

  return out.join("\n");
}

/**
 * Render one-line-per-file summary with counts.
 */
export function formatSummary(parsed) {
  const parts = [];
  if (parsed.structs.length) parts.push(`${parsed.structs.length} structs`);
  if (parsed.traits.length) parts.push(`${parsed.traits.length} traits`);
  if (parsed.functions.length) parts.push(`${parsed.functions.length} functions`);
  if (parsed.comptimes.length) parts.push(`${parsed.comptimes.length} comptimes`);
  return `${parsed.file}: ${parts.join(", ") || "(empty)"}`;
}

function formatMethodSig(m, indent) {
  const decos = m.decorators.map((d) => indent + d + "\n").join("");
  const tp = m.type_params || "";
  const params = m.params.map((p) => (p.type ? `${p.name}: ${p.type}` : p.name)).join(", ");
  const ret = m.returns ? ` -> ${m.returns}` : "";
  const raises = m.raises ? " raises" : "";
  return `${decos}${indent}def ${m.name}${tp}(${params})${raises}${ret}:`;
}

function formatFnSig(f) {
  const tp = f.type_params || "";
  const params = f.params.map((p) => (p.type ? `${p.name}: ${p.type}` : p.name)).join(", ");
  const ret = f.returns ? ` -> ${f.returns}` : "";
  const raises = f.raises ? " raises" : "";
  return `def ${f.name}${tp}(${params})${raises}${ret}:`;
}
