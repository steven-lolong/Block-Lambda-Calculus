/**
 * Structured types carried through the IR. The source-language fragment
 * (`tvar`/`tcon`/`tfun`) is identical in shape to the internal `Type` of
 * ../type-inference/lambdaTypeInference.ts; `desugar.ts` converts its `Type`
 * into `IRType`. Defined here so the `ir/` module owns its type vocabulary
 * with no inbound dependency on the inference module.
 *
 * The remaining four constructors are the *target* of closure conversion
 * (step 2.3) — `⟦A→B⟧ = ∃γ. ((γ,⟦A⟧)→⟦B⟧) × γ` (Minamide–Morrisett–Harper).
 * They are added to this one shared type (rather than a separate target-type
 * module) so Core/ANF/Closure/FIR all speak the same `IRType`:
 *   - `tprod`   — the environment tuple γ;
 *   - `tcode`   — a closed code pointer `(env, param) → result`;
 *   - `texists` — packs the (block-specific) env type: `∃γ. body`;
 *   - `tclos`   — the closure arrow `A ⇒ B`, display sugar for
 *                 `∃γ. (tcode γ A B) × γ` (see `expandClos`). This is what
 *                 lets two blocks that capture different variables still
 *                 produce the *same* closure type and fit the same socket.
 * Never produced by `desugar`/`toAnf` — only by `closureConvert` (2.3) and
 * `liftFunctions` (2.4). Thunk types are erased: a call-by-structure env slot
 * or captured var of type `A` still has type `A` (`force` is
 * type-transparent), so `translateType` is identical under CbV and CbS.
 */

export type IRType =
  | { kind: 'tvar'; id: number }
  | { kind: 'tcon'; name: 'int' | 'bool' }
  | { kind: 'tfun'; from: IRType; to: IRType }
  | { kind: 'tprod'; items: IRType[] }
  | { kind: 'tcode'; env: IRType; param: IRType; result: IRType }
  | { kind: 'texists'; id: number; body: IRType }
  | { kind: 'tclos'; from: IRType; to: IRType };

/** Human name for a type-variable id: 0 -> 'a, 1 -> 'b, … 26 -> 'a1, … */
function varName(id: number): string {
  const letter = String.fromCharCode(97 + (id % 26));
  const suffix = id >= 26 ? String(Math.floor(id / 26)) : '';
  return `'${letter}${suffix}`;
}

/** Human name for an existential's bound γ id, disjoint in spelling from `varName`. */
function existsName(id: number): string {
  const suffix = id === 0 ? '' : String(id);
  return `'g${suffix}`;
}

/**
 * Pretty-print a type. The function arrows (`tfun`, `tclos`) are
 * right-associative, so the domain is parenthesized only when it is itself a
 * function/closure type.
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
    case 'tprod':
      return `⟨${type.items.map(formatIRType).join(', ')}⟩`;
    case 'tcode':
      return `(${formatIRType(type.env)}, ${formatIRType(type.param)}) -> ${formatIRType(type.result)}`;
    case 'texists':
      return `∃${existsName(type.id)}. ${formatIRType(type.body)}`;
    case 'tclos': {
      const from = type.from.kind === 'tfun' || type.from.kind === 'tclos'
        ? `(${formatIRType(type.from)})`
        : formatIRType(type.from);
      return `${from} ⇒ ${formatIRType(type.to)}`;
    }
  }
}

/**
 * Canonical existential encoding of the closure arrow `A ⇒ B`:
 * `∃γ. (tcode γ A B) × γ`. `tclos` is display sugar for exactly this shape —
 * expand on demand for the type checker (`checkClos`/`checkFir`, step 2.6)
 * rather than storing the expansion everywhere `tclos` is used. The bound
 * variable is scoped to `body` alone (each call introduces its own binder, so
 * a fixed local id of `0` never captures an outer variable — no global
 * counter needed for a deterministic, side-effect-free function).
 */
export function expandClos(from: IRType, to: IRType): IRType {
  const gamma: IRType = { kind: 'tvar', id: 0 };
  const code: IRType = { kind: 'tcode', env: gamma, param: from, result: to };
  return { kind: 'texists', id: 0, body: { kind: 'tprod', items: [code, gamma] } };
}
