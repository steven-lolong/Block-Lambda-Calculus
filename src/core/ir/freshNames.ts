/**
 * Deterministic fresh-name supply for the naming passes (toAnf, and later the
 * closure/lift passes). Names are stable (t0, t1, …) so rendered IR and golden
 * tests do not churn. Seed `avoid` with `freeVars(core)` (to be exported from
 * ../semantics/lambdaReduction) so a generated name never shadows a real one.
 */

export interface FreshNames {
  /** Next unused name; `base` customizes the prefix (defaults to `t`). */
  fresh(base?: string): string;
}

export function makeFreshNames(avoid: Set<string> = new Set()): FreshNames {
  const used = new Set(avoid);
  const counters = new Map<string, number>();
  return {
    fresh(base = 't'): string {
      let n = counters.get(base) ?? 0;
      let name = `${base}${n}`;
      while (used.has(name)) {
        n += 1;
        name = `${base}${n}`;
      }
      counters.set(base, n + 1);
      used.add(name);
      return name;
    }
  };
}
