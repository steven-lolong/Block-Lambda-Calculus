/**
 * Shared provenance for every intermediate representation in the lowering
 * pipeline. Mirrors `TermBase` in ../semantics/lambdaReduction.ts so a node in
 * any IR can point back to the Blockly block(s) it came from — this is what
 * makes the pipeline block-traceable end to end.
 *
 * The helpers are the generic form of `withSource` / `withSources` in
 * lambdaReduction.ts, widened from `Term` to any `IRProvenance` node so one
 * implementation threads provenance through Core, ANF, and every later IR.
 */

export interface IRProvenance {
  /** Primary originating block id. */
  sourceId?: string;
  /** Extra block ids that collapsed into this node (e.g. an unwrapped paren). */
  sourceAliases?: string[];
}

function unique(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

/** Every block id a node traces back to. */
export function provSources(node: IRProvenance): string[] {
  return unique([node.sourceId, ...(node.sourceAliases ?? [])]);
}

/** Tag `node` with `id`, recording it as an alias when a primary already exists. */
export function withSource<T extends IRProvenance>(node: T, id?: string): T {
  if (!id) return node;
  if (!node.sourceId) return { ...node, sourceId: id };
  if (node.sourceId === id || node.sourceAliases?.includes(id)) return node;
  return { ...node, sourceAliases: unique([...(node.sourceAliases ?? []), id]) };
}

/**
 * Copy every source of `from` onto `node` — used when a pass synthesizes a node
 * (a fresh `let`, a `force`) that stands in for an existing subterm.
 */
export function withSources<T extends IRProvenance>(node: T, from: IRProvenance): T {
  let next = node;
  for (const id of provSources(from)) next = withSource(next, id);
  return next;
}
