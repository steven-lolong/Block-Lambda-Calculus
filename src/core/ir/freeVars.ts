/**
 * Free-variable analysis over `AnfExpr` (step 2.2). This is the input
 * `closureConvert` (2.3) needs to decide, for every `lam`, exactly which
 * outer names its code must capture — and in what order, so the resulting
 * environment layout is deterministic and rendered IR does not churn between
 * runs.
 *
 * `orderedFreeVars` is the primary export: a first-occurrence-ordered list of
 * the names free in an expression, excluding a caller-supplied `bound` set
 * (e.g. already-lifted global function labels, which must never be captured
 * — see `fir.ts`'s "known functions by label" discipline). `freeVarsExpr` is
 * a thin wrapper for callers that only need the unordered set (mirrors
 * `freeVars` in ../semantics/lambdaReduction.ts, generalized to `AnfExpr`).
 */
import type { AnfAtom, AnfBinding, AnfComp, AnfExpr } from './anf';

/**
 * Names free in `e`, excluding everything in `bound`, in first-occurrence
 * order under a left-to-right, outside-in traversal. Lexical scoping is
 * tracked as the traversal descends (lambda params, `let`/`letrec` names),
 * so a shadowed outer name is never reported as free.
 */
export function orderedFreeVars(e: AnfExpr, bound: Iterable<string> = []): string[] {
  const boundSet = new Set(bound);
  const seen = new Set<string>();
  const order: string[] = [];

  const note = (name: string): void => {
    if (boundSet.has(name) || seen.has(name)) return;
    seen.add(name);
    order.push(name);
  };

  const withBound = <T>(name: string, run: () => T): T => {
    const wasBound = boundSet.has(name);
    boundSet.add(name);
    try {
      return run();
    } finally {
      if (!wasBound) boundSet.delete(name);
    }
  };

  const walkAtom = (atom: AnfAtom): void => {
    switch (atom.kind) {
      case 'var':
      case 'force':
        note(atom.name);
        return;
      case 'num':
      case 'bool':
      case 'hole':
        return;
      case 'lam':
        withBound(atom.param, () => walkExpr(atom.body));
        return;
    }
  };

  const walkComp = (comp: AnfComp): void => {
    switch (comp.kind) {
      case 'app':
        walkAtom(comp.func);
        walkAtom(comp.arg);
        return;
      case 'prim':
        walkAtom(comp.left);
        walkAtom(comp.right);
        return;
      case 'if':
        walkAtom(comp.cond);
        walkExpr(comp.then);
        walkExpr(comp.else);
        return;
    }
  };

  const walkBinding = (binding: AnfBinding): void => {
    switch (binding.kind) {
      case 'atom':
        walkAtom(binding.atom);
        return;
      case 'comp':
        walkComp(binding.comp);
        return;
      case 'susp':
        walkExpr(binding.body);
        return;
    }
  };

  const walkExpr = (expr: AnfExpr): void => {
    switch (expr.kind) {
      case 'ret':
        walkAtom(expr.atom);
        return;
      case 'tail':
        walkComp(expr.comp);
        return;
      case 'let':
        walkBinding(expr.rhs);
        withBound(expr.name, () => walkExpr(expr.body));
        return;
      case 'letrec':
        // The bound name is visible in its own right-hand side (recursive).
        withBound(expr.name, () => {
          walkBinding(expr.rhs);
          walkExpr(expr.body);
        });
        return;
    }
  };

  walkExpr(e);
  return order;
}

/** Unordered free variables of `e` — a thin wrapper over `orderedFreeVars`. */
export function freeVarsExpr(e: AnfExpr): Set<string> {
  return new Set(orderedFreeVars(e));
}
