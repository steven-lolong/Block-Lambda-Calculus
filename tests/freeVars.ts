/**
 * Unit tests for free-variable analysis over AnfExpr (src/core/ir/freeVars.ts).
 *
 * Checks the properties `closureConvert` (step 2.3) will rely on:
 *   - a nested lambda reports exactly its captured outer names, in
 *     first-occurrence order, with shadowed names excluded;
 *   - `bound` (e.g. lifted global labels) is never reported as free even when
 *     referenced;
 *   - `freeVarsExpr` (the unordered wrapper) agrees with `orderedFreeVars`.
 *
 * Run with: npm run test:freeVars
 */
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { parseLambdaTextToWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { inferLambdaWorkspaceTypes } from '../src/core/type-inference/lambdaTypeInference';
import { blockToTerm } from '../src/core/semantics/lambdaReduction';
import { pickProgramBlock } from '../src/core/machine/csekMachine';
import { desugar, makeTypeLookup, toAnf, makeFreshNames } from '../src/core/ir';
import { orderedFreeVars, freeVarsExpr } from '../src/core/ir/freeVars';
import type { AnfAtom, AnfBinding, AnfComp, AnfExpr } from '../src/core/ir/anf';

registerLambdaBlocks();

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail?: string): void {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

function withProgram<T>(source: string, run: (workspace: Blockly.Workspace, block: Blockly.Block) => T): T {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(parseLambdaTextToWorkspaceState(source), workspace);
    const block = pickProgramBlock(workspace);
    if (!block) throw new Error('no program block found');
    return run(workspace, block);
  } finally {
    workspace.dispose();
  }
}

/** ANF body of `source` under call-by-value (structure-agnostic for this analysis). */
function anfOf(source: string): AnfExpr {
  return withProgram(source, (workspace, block) => {
    const report = inferLambdaWorkspaceTypes(workspace);
    const term = blockToTerm(block);
    const core = desugar(term, makeTypeLookup(report));
    return toAnf(core, 'value', makeFreshNames());
  });
}

/**
 * Every nested `lam`, as its `(param, body)` pair, in traversal order — a
 * full structural walk (not just the `ret`/`let` positions a lambda is
 * normally named from), since a `lam` is atomic and can appear directly as a
 * call target in tail position.
 */
function nestedLambdas(e: AnfExpr): { param: string; body: AnfExpr }[] {
  const found: { param: string; body: AnfExpr }[] = [];

  const walkAtom = (atom: AnfAtom): void => {
    if (atom.kind === 'lam') {
      found.push({ param: atom.param, body: atom.body });
      walkExpr(atom.body);
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
      case 'letrec':
        walkBinding(expr.rhs);
        walkExpr(expr.body);
        return;
    }
  };

  walkExpr(e);
  return found;
}

/**
 * The capture set closure conversion would compute for `lam`: its body's free
 * variables excluding *only its own parameter* (supplied by the caller, not
 * captured) — not every enclosing binder, since a genuine outer capture
 * (e.g. `g`'s closure capturing `f`) must still be reported.
 */
function captures({ param, body }: { param: string; body: AnfExpr }): string[] {
  return orderedFreeVars(body, [param]);
}

/* -------------------------------------------------- nested-lambda capture, in order */
{
  // λf. λg. λx. f (g x) — f's own code is closed (nothing to capture); g's
  // code captures {f}; x's code captures {g, f} in first-occurrence order
  // (g is used first, via "g x", then f via "f t0").
  const body = anfOf('\\f. \\g. \\x. f (g x)');
  const nested = nestedLambdas(body);
  check('compose: three nested lambdas found (f, g, x)', nested.length === 3, `found ${nested.length}`);
  if (nested.length === 3) {
    const [f, g, x] = nested;
    check('compose: f is closed (captures nothing)', captures(f).length === 0, JSON.stringify(captures(f)));
    check('compose: g captures exactly {f}', JSON.stringify(captures(g)) === JSON.stringify(['f']), JSON.stringify(captures(g)));
    check(
      'compose: x captures {g, f} in first-occurrence order',
      JSON.stringify(captures(x)) === JSON.stringify(['g', 'f']),
      JSON.stringify(captures(x))
    );
  }
}

/* -------------------------------------------------- shadowing excludes the outer name */
{
  // (\x. (\x. x + 1) (x * 2)) 5 — the inner λx's body refers to its OWN x
  // (bound by that very lambda), not the outer x, so its capture set is empty.
  const body = anfOf('(\\x. (\\x. x + 1) (x * 2)) 5');
  const nested = nestedLambdas(body);
  check('shadowing: at least one nested lambda found', nested.length >= 1, `found ${nested.length}`);
  for (const lam of nested) {
    if (lam.param !== 'x') continue;
    check('shadowing: an inner λx captures nothing from its own λx-scope', captures(lam).length === 0, JSON.stringify(captures(lam)));
  }
}

/* -------------------------------------------------- `bound` suppresses reported names */
{
  // x's closure in compose (see above) genuinely captures {g, f}. Simulate
  // `f` already being a lifted global label (step 2.3's "known functions by
  // label" discipline, see clos.ts/fir.ts) by adding it to `bound` too, and
  // confirm it drops out while the real capture `g` remains.
  const body = anfOf('\\f. \\g. \\x. f (g x)');
  const [, , x] = nestedLambdas(body);
  const withoutGlobal = orderedFreeVars(x.body, ['x', 'f']);
  check(
    'bound: a name passed in `bound` is suppressed even though it is genuinely referenced',
    JSON.stringify(withoutGlobal) === JSON.stringify(['g']),
    JSON.stringify(withoutGlobal)
  );
}

/* -------------------------------------------------- freeVarsExpr agrees with orderedFreeVars */
{
  const body = anfOf('\\f. \\g. \\x. f (g x)');
  const nested = nestedLambdas(body);
  for (const lam of nested) {
    const ordered = new Set(captures(lam));
    const unordered = freeVarsExpr(lam.body);
    unordered.delete(lam.param);
    check(
      'freeVarsExpr (minus the lambda\'s own param) agrees with captures() as a set',
      ordered.size === unordered.size && [...ordered].every((name) => unordered.has(name)),
      `ordered=${JSON.stringify([...ordered])} unordered=${JSON.stringify([...unordered])}`
    );
  }
}

/* -------------------------------------------------- top-level closed program has no free vars */
{
  const body = anfOf('letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5');
  check('closed top-level program has no free variables', orderedFreeVars(body).length === 0, JSON.stringify(orderedFreeVars(body)));
}

console.log(`freeVars: ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
