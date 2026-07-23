/**
 * Correctness tests for closure conversion (src/core/ir/closureConvert.ts).
 *
 * Central invariant (extends tests/anf.ts one stage): a tiny ClosIR evaluator,
 * run over `closureConvert`'s output, must reach the same final value as the
 * substitution stepper (computeReductionRun) — for every pinned case and every
 * shipped example, under BOTH strategies. So substitution ⇄ machine ⇄ ANF ⇄
 * ClosIR must all agree.
 *
 * The ClosIR evaluator mirrors the ANF one, plus the three shapes that are new
 * in this IR: a `clos` value carries its captured environment tuple, `proj`
 * reads a slot of it, and `callclos` unpacks + applies. Recursion under
 * call-by-value is closed the way the runbook specifies — "known functions by
 * label": a `let fac = clos{…}` carrier registers `fac` in an ambient globals
 * table, and the bare `var fac` self-reference inside the (closed) code body
 * resolves through it. Under call-by-structure the recursive `letrec` thunk
 * survives and the closure captures it, so no globals are involved.
 *
 * Also pins the factorial design note (Decision 2): the CbV recursive lambda is
 * lifted to a `let` carrier with an EMPTY env and a bare-var self-reference (no
 * surviving letrec), while the CbS recursive binding survives as a `letrec`
 * thunk.
 *
 * Run with: npm run test:closure
 */
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { LAMBDA_EXAMPLES } from '../src/core/examples/lambdaExamples';
import { parseLambdaTextToWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { inferLambdaWorkspaceTypes } from '../src/core/type-inference/lambdaTypeInference';
import { blockToTerm, computeReductionRun, type ReductionKind } from '../src/core/semantics/lambdaReduction';
import { pickProgramBlock } from '../src/core/machine/csekMachine';
import { desugar, makeTypeLookup, toAnfProgram, closureConvert } from '../src/core/ir';
import type { ClosAtom, ClosBinding, ClosCode, ClosComp, ClosExpr } from '../src/core/ir/clos';

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

function closOf(workspace: Blockly.Workspace, block: Blockly.Block, kind: ReductionKind): ClosExpr {
  const report = inferLambdaWorkspaceTypes(workspace);
  const core = desugar(blockToTerm(block), makeTypeLookup(report));
  return closureConvert(toAnfProgram(core, kind)).body;
}

/* -------------------------------------------------- tiny ClosIR evaluator */
/* CbV binds values; CbS binds thunks and re-forces on use (no memoization),
   exactly as the ANF evaluator in tests/anf.ts. New here: a `clos` value holds
   its captured env tuple, `proj` indexes it, and a bare `var` that misses the
   (closed) local scope resolves through the ambient globals table — the "known
   function by label" recursion path. */

type ClosVal =
  | { tag: 'num'; n: number }
  | { tag: 'bool'; b: boolean }
  | { tag: 'clos'; code: ClosCode; env: EnvEntry[] };

type EnvEntry =
  | ClosVal
  | { tag: 'thunk'; body: ClosExpr; env: EvalEnv; globals: Globals }
  | { tag: 'tuple'; items: EnvEntry[] };
type EvalEnv = { name: string; value: EnvEntry; parent: EvalEnv } | null;
type Globals = Map<string, ClosVal>;

/** Op labels of every `prim` fired during the most recent `runClos` call. */
let firedPrims: string[] = [];

function lookupEntry(env: EvalEnv, name: string, globals: Globals): EnvEntry {
  for (let cursor = env; cursor; cursor = cursor.parent) {
    if (cursor.name === name) return cursor.value;
  }
  const global = globals.get(name);
  if (global) return global; // known function by label (recursive self-reference)
  throw new Error(`unbound clos variable ${name}`);
}

function force(entry: EnvEntry): ClosVal {
  if (entry.tag === 'thunk') return evalExpr(entry.body, entry.env, entry.globals);
  if (entry.tag === 'tuple') throw new Error('cannot force an environment tuple');
  return entry;
}

/** A value (forced) — for positions that must hold a genuine value. */
function atomValue(atom: ClosAtom, env: EvalEnv, globals: Globals): ClosVal {
  switch (atom.kind) {
    case 'num':
      return { tag: 'num', n: atom.value };
    case 'bool':
      return { tag: 'bool', b: atom.value };
    case 'var':
    case 'force':
      return force(lookupEntry(env, atom.name, globals));
    case 'proj':
      return force(projSlot(env, atom.env, atom.index, globals));
    case 'clos':
      return { tag: 'clos', code: atom.code, env: atom.env.map((a) => atomEntry(a, env, globals)) };
    case 'hole':
      throw new Error('cannot evaluate a hole');
  }
}

/** An entry (thunk-preserving) — for env slots and binding right-hand sides,
 *  so a captured call-by-structure thunk stays lazy across the capture. */
function atomEntry(atom: ClosAtom, env: EvalEnv, globals: Globals): EnvEntry {
  if (atom.kind === 'var' || atom.kind === 'force') return lookupEntry(env, atom.name, globals);
  if (atom.kind === 'proj') return projSlot(env, atom.env, atom.index, globals);
  return atomValue(atom, env, globals);
}

function projSlot(env: EvalEnv, envName: string, index: number, globals: Globals): EnvEntry {
  const tuple = lookupEntry(env, envName, globals);
  if (tuple.tag !== 'tuple') throw new Error(`proj on a non-environment ${envName}`);
  return tuple.items[index];
}

function evalComp(comp: ClosComp, env: EvalEnv, globals: Globals): ClosVal {
  switch (comp.kind) {
    case 'callclos': {
      const fn = atomValue(comp.clos, env, globals);
      if (fn.tag !== 'clos') throw new Error('calling a non-closure');
      const arg = atomEntry(comp.arg, env, globals);
      // Code is closed: only its env tuple + param are in scope (globals stay ambient).
      const base: EvalEnv = { name: fn.code.param, value: arg, parent: null };
      const frame: EvalEnv = { name: fn.code.envParam, value: { tag: 'tuple', items: fn.env }, parent: base };
      return evalExpr(fn.code.body, frame, globals);
    }
    case 'if': {
      const cond = atomValue(comp.cond, env, globals);
      if (cond.tag !== 'bool') throw new Error('if condition must be boolean');
      return evalExpr(cond.b ? comp.then : comp.else, env, globals);
    }
    case 'prim': {
      firedPrims.push(comp.op);
      const left = atomValue(comp.left, env, globals);
      const right = atomValue(comp.right, env, globals);
      if (comp.opKind === 'num') {
        if (left.tag !== 'num' || right.tag !== 'num') throw new Error('arithmetic expects numbers');
        const a = left.n;
        const b = right.n;
        const n =
          comp.op === '+' ? a + b
            : comp.op === '-' ? a - b
              : comp.op === '*' ? a * b
                : comp.op === '/' ? (b === 0 ? 0 : Math.trunc(a / b))
                  : null;
        if (n === null) throw new Error(`unknown arithmetic operator ${comp.op}`);
        return { tag: 'num', n };
      }
      if (comp.opKind === 'bool') {
        if (left.tag !== 'bool' || right.tag !== 'bool') throw new Error('boolean operator expects booleans');
        const b =
          comp.op === 'and' ? left.b && right.b
            : comp.op === 'or' ? left.b || right.b
              : comp.op === 'equal' ? left.b === right.b
                : null;
        if (b === null) throw new Error(`unknown boolean operator ${comp.op}`);
        return { tag: 'bool', b };
      }
      if (left.tag !== 'num' || right.tag !== 'num') throw new Error('comparison expects numbers');
      const a = left.n;
      const b = right.n;
      const result =
        comp.op === '=' ? a === b
          : comp.op === '<' ? a < b
            : comp.op === '<=' ? a <= b
              : comp.op === '>' ? a > b
                : comp.op === '>=' ? a >= b
                  : null;
      if (result === null) throw new Error(`unknown comparison operator ${comp.op}`);
      return { tag: 'bool', b: result };
    }
  }
}

function bindingEntry(binding: ClosBinding, env: EvalEnv, globals: Globals): EnvEntry {
  switch (binding.kind) {
    case 'atom':
      return atomEntry(binding.atom, env, globals);
    case 'comp':
      return evalComp(binding.comp, env, globals);
    case 'susp':
      return { tag: 'thunk', body: binding.body, env, globals };
  }
}

/** Register a name that binds a closure value into the ambient globals, so a
 *  bare self-reference inside that closure's (closed) code body resolves. */
function registerGlobal(name: string, entry: EnvEntry, globals: Globals): void {
  if (entry.tag === 'clos') globals.set(name, entry);
}

function evalExpr(expr: ClosExpr, env: EvalEnv, globals: Globals): ClosVal {
  switch (expr.kind) {
    case 'ret':
      return atomValue(expr.atom, env, globals);
    case 'tail':
      return evalComp(expr.comp, env, globals);
    case 'let': {
      const value = bindingEntry(expr.rhs, env, globals);
      registerGlobal(expr.name, value, globals);
      return evalExpr(expr.body, { name: expr.name, value, parent: env }, globals);
    }
    case 'letrec': {
      const frame = { name: expr.name, value: undefined as unknown as EnvEntry, parent: env };
      frame.value = bindingEntry(expr.rhs, frame, globals);
      registerGlobal(expr.name, frame.value, globals);
      return evalExpr(expr.body, frame, globals);
    }
  }
}

function formatClosValue(v: ClosVal): string {
  switch (v.tag) {
    case 'num':
      return Number.isInteger(v.n) ? String(v.n) : String(Number(v.n.toFixed(6)));
    case 'bool':
      return v.b ? 'true' : 'false';
    case 'clos':
      return 'function';
  }
}

function runClos(expr: ClosExpr): { value: string; firedPrims: string[] } {
  firedPrims = [];
  const value = formatClosValue(evalExpr(expr, null, new Map()));
  return { value, firedPrims };
}

/* --------------------------------------- structural walkers (shape checks) */

function walkExpr(expr: ClosExpr, onExpr: (e: ClosExpr) => void, onAtom: (a: ClosAtom) => void): void {
  onExpr(expr);
  const atom = (a: ClosAtom): void => {
    onAtom(a);
    if (a.kind === 'clos') { a.env.forEach(atom); walkExpr(a.code.body, onExpr, onAtom); }
  };
  const comp = (c: ClosComp): void => {
    if (c.kind === 'callclos') { atom(c.clos); atom(c.arg); }
    else if (c.kind === 'prim') { atom(c.left); atom(c.right); }
    else { atom(c.cond); walkExpr(c.then, onExpr, onAtom); walkExpr(c.else, onExpr, onAtom); }
  };
  switch (expr.kind) {
    case 'ret': atom(expr.atom); return;
    case 'tail': comp(expr.comp); return;
    case 'let':
    case 'letrec':
      if (expr.rhs.kind === 'atom') atom(expr.rhs.atom);
      else if (expr.rhs.kind === 'comp') comp(expr.rhs.comp);
      else walkExpr(expr.rhs.body, onExpr, onAtom);
      walkExpr(expr.body, onExpr, onAtom);
      return;
  }
}

/** The clos atom a top-level `let name = clos{…}` carrier binds, if any. */
function carrierClos(expr: ClosExpr, name: string): (ClosAtom & { kind: 'clos' }) | undefined {
  let found: (ClosAtom & { kind: 'clos' }) | undefined;
  walkExpr(expr, (e) => {
    if ((e.kind === 'let' || e.kind === 'letrec') && e.name === name
        && e.rhs.kind === 'atom' && e.rhs.atom.kind === 'clos') {
      found ??= e.rhs.atom;
    }
  }, () => { /* atoms not needed */ });
  return found;
}

function countExprs(expr: ClosExpr, pred: (e: ClosExpr) => boolean): number {
  let n = 0;
  walkExpr(expr, (e) => { if (pred(e)) n += 1; }, () => { /* atoms not needed */ });
  return n;
}

function codeHasBareVar(code: ClosCode, name: string): boolean {
  let found = false;
  walkExpr(code.body, () => { /* exprs not needed */ }, (a) => { if (a.kind === 'var' && a.name === name) found = true; });
  return found;
}

/* -------------------------------------------------------------- cases */
/* Same corpus as tests/anf.ts / tests/semantics.ts. */

const CASES: { name: string; source: string }[] = [
  { name: 'copy_vs_lookup', source: '(\\x. x + x) (3 * 7)' },
  { name: 'let_twice', source: 'let f = \\y. y + 1 in f (f 5)' },
  { name: 'shadowing', source: '(\\x. (\\x. x + 1) (x * 2)) 5' },
  { name: 'if_true', source: 'if 2 < 3 then 10 else 20' },
  { name: 'ho_twice', source: '(\\f. \\x. f (f x)) (\\y. y + 3) 5' },
  { name: 'bool_ops', source: 'if (1 < 2) and (3 < 2) then 1 else 0' },
  { name: 'div_truncates_toward_zero', source: '(0 - 7) / 2' },
  { name: 'div_by_zero_guard', source: '121 / 0' },
  {
    name: 'palindrome_121_is_true',
    source: 'let number = 121 in let hundreds = number / 100 in let ones = number - ((number / 10) * 10) in if hundreds = ones then true else false'
  },
  { name: 'compose', source: '(\\f. \\g. \\x. f (g x)) (\\y. y + 1) (\\z. z * 2) 5' },
  { name: 'letrec_factorial', source: 'letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5' }
];

for (const c of CASES) {
  withProgram(c.source, (workspace, block) => {
    for (const kind of ['structure', 'value'] as ReductionKind[]) {
      const closBody = closOf(workspace, block, kind);
      const got = runClos(closBody);
      const expected = computeReductionRun(block, kind).finalValue;
      check(`${c.name} · ClosIR ${kind} value matches substitution`, got.value === expected,
        `ClosIR got ${JSON.stringify(got.value)}, substitution expected ${JSON.stringify(expected)}`);
    }
  });
}

// The duplicated-work signature carries through to ClosIR unchanged: CbS
// re-forces the argument at each use (two `prim *`), CbV shares it (one).
withProgram('(\\x. x + x) (3 * 7)', (workspace, block) => {
  const mulsOf = (ops: string[]): number => ops.filter((op) => op === '*').length;
  check('duplicated work · CbS ClosIR has two prim *', mulsOf(runClos(closOf(workspace, block, 'structure')).firedPrims) === 2);
  check('shared work · CbV ClosIR has one prim *', mulsOf(runClos(closOf(workspace, block, 'value')).firedPrims) === 1);
});

/* ------------------------------------------ factorial design note (Decision 2) */

withProgram('letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5', (workspace, block) => {
  const cbv = closOf(workspace, block, 'value');
  check('factorial · CbV lifts the recursive lambda to a `let` carrier (no surviving letrec)',
    countExprs(cbv, (e) => e.kind === 'letrec') === 0);

  const fac = carrierClos(cbv, 'fac');
  check('factorial · CbV binds `fac` to a clos carrier', fac !== undefined);
  if (fac) {
    check('factorial · CbV: fac captures nothing (empty env)',
      fac.env.length === 0 && fac.code.envLayout.length === 0,
      `env=${fac.env.length} layout=${fac.code.envLayout.length}`);
    check('factorial · CbV: self-reference stays a bare `var fac` (label resolved at lift)',
      codeHasBareVar(fac.code, 'fac'));
  }

  const cbs = closOf(workspace, block, 'structure');
  check('factorial · CbS keeps the recursive binding as a surviving `letrec` thunk',
    countExprs(cbs, (e) => e.kind === 'letrec' && e.name === 'fac' && e.rhs.kind === 'susp') === 1);
});

/* --------------------------------------------- every shipped example */

for (const id of Object.keys(LAMBDA_EXAMPLES) as (keyof typeof LAMBDA_EXAMPLES)[]) {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(LAMBDA_EXAMPLES[id].workspace as never, workspace);
  const block = pickProgramBlock(workspace)!;

  for (const kind of ['structure', 'value'] as ReductionKind[]) {
    const got = runClos(closOf(workspace, block, kind));
    const expected = computeReductionRun(block, kind).finalValue;
    check(`example ${id} · ClosIR ${kind} value matches substitution`, got.value === expected,
      `ClosIR got ${JSON.stringify(got.value)}, substitution expected ${JSON.stringify(expected)}`);
  }
  workspace.dispose();
}

console.log(failures === 0
  ? `All ${checks} closure-conversion checks passed.`
  : `${failures}/${checks} closure-conversion checks FAILED.`);
if (failures > 0) process.exitCode = 1;
