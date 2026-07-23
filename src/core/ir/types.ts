/**
 * Structured types carried through the IR. Identical in shape to the internal
 * `Type` of ../type-inference/lambdaTypeInference.ts; step 1.2 (desugar) will
 * export a structured accessor from that module and convert its `Type` into
 * `IRType` (the same three constructors). Defined here so the `ir/` module owns
 * its type vocabulary with no inbound dependency on the inference module.
 */

export type IRType =
  | { kind: 'tvar'; id: number }
  | { kind: 'tcon'; name: 'int' | 'bool' }
  | { kind: 'tfun'; from: IRType; to: IRType };

/** Human name for a type-variable id: 0 -> 'a, 1 -> 'b, … 26 -> 'a1, … */
function varName(id: number): string {
  const letter = String.fromCharCode(97 + (id % 26));
  const suffix = id >= 26 ? String(Math.floor(id / 26)) : '';
  return `'${letter}${suffix}`;
}

/**
 * Pretty-print a type. The arrow is right-associative, so the domain is
 * parenthesized only when it is itself a function type.
 */
export function formatIRType(type: IRType): string {
  switch (type.kind) {
    case 'tvar':
      return varName(type.id);
    case 'tcon':
      return type.name;
    case 'tfun': {
      const from = type.from.kind === 'tfun' ? `(${formatIRType(type.from)})` : formatIRType(type.from);
      return `${from} -> ${formatIRType(type.to)}`;
    }
  }
}
