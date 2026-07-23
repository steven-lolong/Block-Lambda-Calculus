/**
 * Correctness tests for lambda lifting (src/core/ir/liftFunctions.ts).
 *
 * Central invariant (extends tests/closure.ts one stage): a tiny FIR
 * evaluator, run over `toFir`'s output, must reach the same final value as
 * the substitution stepper (computeReductionRun) — for every pinned case and
 * every shipped example, under BOTH strategies. So substitution ⇄ machine ⇄
 * ANF ⇄ ClosIR ⇄ FIR must all agree.
 *
 * The FIR evaluator is simpler than the ClosIR one in tests/closure.ts: by
 * this stage every "known function by label" self-reference has already been
 * resolved to an explicit `clos { code: label, env }` reconstruction (see
 * liftFunctions.ts's header), so there is no ambient-globals fallback needed
 * at runtime — a `clos` value just carries its resolved `FirFunc` (looked up
 * once, by label, from the flat table) plus its captured env tuple.
 *
 * Also checks structural invariants lambda lifting must establish:
 *   - no dangling labels: every `clos.code` reference (in every function body
 *     and in `main`) resolves to a real table entry;
 *   - the factorial design note (pinned already at the ClosIR level in
 *     tests/closure.ts) survives lifting: CbV lifts to exactly one function
 *     table entry with an empty env, and `main` calls it through a resolved
 *     `clos{label, ⟨⟩}` — no residual bare `var fac`.
 *
 * Run with: npm run test:fir
 */
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { LAMBDA_EXAMPLES } from '../src/core/examples/lambdaExamples';
import { parseLambdaTextToWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { inferLambdaWorkspaceTypes } from '../src/core/type-inference/lambdaTypeInference';
import { blockToTerm, computeReductionRun, type ReductionKind } from '../src/core/semantics/lambdaReduction';
import { pickProgramBlock } from '../src/core/machine/csekMachine';
import { desugar, makeTypeLookup, toAnfProgram, toFir } from '../src/core/ir';
import type { FirAtom, FirBinding, FirComp, FirExpr, FirFunc, FirProgram, Label } from '../src/core/ir/fir';

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

function firOf(workspace: Blockly.Workspace, block: Blockly.Block, kind: ReductionKind): FirProgram {
  const report = inferLambdaWorkspaceTypes(workspace);
  const core = desugar(blockToTerm(block), makeTypeLookup(report));
  return toFir(toAnfProgram(core, kind));
}

/* -------------------------------------------------- tiny FIR evaluator */
/* CbV binds values; CbS binds thunks and re-forces on use (no memoization),
   exactly as the ANF/ClosIR evaluators. A `clos` value resolves its label to
   a `FirFunc` once, at construction; `callclos` just applies it. */

type FirVal =
  | { tag: 'num'; n: number }
  | { tag: 'bool'; b: boolean }
  | { tag: 'clos'; func: FirFunc; env: EnvEntry[] };

type EnvEntry =
  | FirVal
  | { tag: 'thunk'; body: FirExpr; env: EvalEnv; table: Map<Label, FirFunc> }
  | { tag: 'tuple'; items: EnvEntry[] };
type EvalEnv = { name: string; value: EnvEntry; parent: EvalEnv } | null;

let firedPrims: string[] = [];

function lookupEntry(env: EvalEnv, name: string): EnvEntry {
  for (let cursor = env; cursor; cursor = cursor.parent) {
    if (cursor.name === name) return cursor.value;
  }
  throw new Error(`unbound FIR variable ${name}`);
}

function force(entry: EnvEntry): FirVal {
  if (entry.tag === 'thunk') return evalExpr(entry.body, entry.env, entry.table);
  if (entry.tag === 'tuple') throw new Error('cannot force an environment tuple');
  return entry;
}

function atomValue(atom: FirAtom, env: EvalEnv, table: Map<Label, FirFunc>): FirVal {
  switch (atom.kind) {
    case 'num':
      return { tag: 'num', n: atom.value };
    case 'bool':
      return { tag: 'bool', b: atom.value };
    case 'var':
    case 'force':
      return force(lookupEntry(env, atom.name));
    case 'proj':
      return force(projSlot(env, atom.env, atom.index));
    case 'clos': {
      const func = table.get(atom.code);
      if (!func) throw new Error(`dangling function label '${atom.code}'`);
      return { tag: 'clos', func, env: atom.env.map((a) => atomEntry(a, env, table)) };
    }
    case 'hole':
      throw new Error('cannot evaluate a hole');
  }
}

function atomEntry(atom: FirAtom, env: EvalEnv, table: Map<Label, FirFunc>): EnvEntry {
  if (atom.kind === 'var' || atom.kind === 'force') return lookupEntry(env, atom.name);
  if (atom.kind === 'proj') return projSlot(env, atom.env, atom.index);
  return atomValue(atom, env, table);
}

function projSlot(env: EvalEnv, envName: string, index: number): EnvEntry {
  const tuple = lookupEntry(env, envName);
  if (tuple.tag !== 'tuple') throw new Error(`proj on a non-environment ${envName}`);
  return tuple.items[index];
}

function evalComp(comp: FirComp, env: EvalEnv, table: Map<Label, FirFunc>): FirVal {
  switch (comp.kind) {
    case 'callclos': {
      const fn = atomValue(comp.clos, env, table);
      if (fn.tag !== 'clos') throw new Error('calling a non-closure');
      const arg = atomEntry(comp.arg, env, table);
      const base: EvalEnv = { name: fn.func.param, value: arg, parent: null };
      const frame: EvalEnv = { name: fn.func.envParam, value: { tag: 'tuple', items: fn.env }, parent: base };
      return evalExpr(fn.func.body, frame, table);
    }
    case 'if': {
      const cond = atomValue(comp.cond, env, table);
      if (cond.tag !== 'bool') throw new Error('if condition must be boolean');
      return evalExpr(cond.b ? comp.then : comp.else, env, table);
    }
    case 'prim': {
      firedPrims.push(comp.op);
      const left = atomValue(comp.left, env, table);
      const right = atomValue(comp.right, env, table);
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

function bindingEntry(binding: FirBinding, env: EvalEnv, table: Map<Label, FirFunc>): EnvEntry {
  switch (binding.kind) {
    case 'atom':
      return atomEntry(binding.atom, env, table);
    case 'comp':
      return evalComp(binding.comp, env, table);
    case 'susp':
      return { tag: 'thunk', body: binding.body, env, table };
  }
}

function evalExpr(expr: FirExpr, env: EvalEnv, table: Map<Label, FirFunc>): FirVal {
  switch (expr.kind) {
    case 'ret':
      return atomValue(expr.atom, env, table);
    case 'tail':
      return evalComp(expr.comp, env, table);
    case 'let':
      return evalExpr(expr.body, { name: expr.name, value: bindingEntry(expr.rhs, env, table), parent: env }, table);
    case 'letrec': {
      const frame = { name: expr.name, value: undefined as unknown as EnvEntry, parent: env };
      frame.value = bindingEntry(expr.rhs, frame, table);
      return evalExpr(expr.body, frame, table);
    }
  }
}

function formatFirValue(v: FirVal): string {
  switch (v.tag) {
    case 'num':
      return Number.isInteger(v.n) ? String(v.n) : String(Number(v.n.toFixed(6)));
    case 'bool':
      return v.b ? 'true' : 'false';
    case 'clos':
      return 'function';
  }
}

function runFir(prog: FirProgram): { value: string; firedPrims: string[] } {
  firedPrims = [];
  const table = new Map(prog.functions.map((f) => [f.label, f]));
  const value = formatFirValue(evalExpr(prog.main, null, table));
  return { value, firedPrims };
}

/* ------------------------------------------------- structural invariants */

function walkFirAtom(atom: FirAtom, onLabel: (l: Label) => void): void {
  if (atom.kind === 'clos') onLabel(atom.code);
}
function walkFirComp(comp: FirComp, onLabel: (l: Label) => void): void {
  if (comp.kind === 'callclos') { walkFirAtom(comp.clos, onLabel); walkFirAtom(comp.arg, onLabel); }
  else if (comp.kind === 'prim') { walkFirAtom(comp.left, onLabel); walkFirAtom(comp.right, onLabel); }
  else { walkFirAtom(comp.cond, onLabel); walkFirExpr(comp.then, onLabel); walkFirExpr(comp.else, onLabel); }
}
function walkFirExpr(expr: FirExpr, onLabel: (l: Label) => void): void {
  switch (expr.kind) {
    case 'ret': walkFirAtom(expr.atom, onLabel); return;
    case 'tail': walkFirComp(expr.comp, onLabel); return;
    case 'let':
    case 'letrec':
      if (expr.rhs.kind === 'atom') walkFirAtom(expr.rhs.atom, onLabel);
      else if (expr.rhs.kind === 'comp') walkFirComp(expr.rhs.comp, onLabel);
      else walkFirExpr(expr.rhs.body, onLabel);
      walkFirExpr(expr.body, onLabel);
      return;
  }
}

function danglingLabels(prog: FirProgram): string[] {
  const known = new Set(prog.functions.map((f) => f.label));
  const missing: string[] = [];
  const onLabel = (l: Label): void => { if (!known.has(l)) missing.push(l); };
  walkFirExpr(prog.main, onLabel);
  for (const f of prog.functions) walkFirExpr(f.body, onLabel);
  return missing;
}

/* -------------------------------------------------------------- cases */
/* Same corpus as tests/closure.ts / tests/anf.ts / tests/semantics.ts. */

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
      const prog = firOf(workspace, block, kind);
      const got = runFir(prog);
      const expected = computeReductionRun(block, kind).finalValue;
      check(`${c.name} · FIR ${kind} value matches substitution`, got.value === expected,
        `FIR got ${JSON.stringify(got.value)}, substitution expected ${JSON.stringify(expected)}`);
      check(`${c.name} · FIR ${kind} has no dangling labels`, danglingLabels(prog).length === 0,
        JSON.stringify(danglingLabels(prog)));
    }
  });
}

// The duplicated-work signature carries through to FIR unchanged.
withProgram('(\\x. x + x) (3 * 7)', (workspace, block) => {
  const mulsOf = (ops: string[]): number => ops.filter((op) => op === '*').length;
  check('duplicated work · CbS FIR has two prim *', mulsOf(runFir(firOf(workspace, block, 'structure')).firedPrims) === 2);
  check('shared work · CbV FIR has one prim *', mulsOf(runFir(firOf(workspace, block, 'value')).firedPrims) === 1);
});

/* ------------------------------------------ factorial design note (Decision 2) */

withProgram('letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5', (workspace, block) => {
  const cbv = firOf(workspace, block, 'value');
  check('factorial · CbV lifts to exactly one function table entry', cbv.functions.length === 1,
    `got ${cbv.functions.length}`);
  if (cbv.functions.length === 1) {
    const [fac] = cbv.functions;
    check('factorial · CbV: the lifted function has an empty env', fac.envLayout.length === 0,
      `envLayout=${JSON.stringify(fac.envLayout)}`);
    check('factorial · CbV: the lifted function has no dangling labels in its own body',
      danglingLabels({ strategy: 'value', functions: cbv.functions, main: fac.body }).length === 0);
  }
  check('factorial · CbV: no residual bare var in main beyond ordinary local binding (dangling check passes)',
    danglingLabels(cbv).length === 0);

  const cbs = firOf(workspace, block, 'structure');
  check('factorial · CbS keeps the recursive binding as a `letrec` (no function-table entry needed)',
    cbs.functions.length >= 1); // the lambda itself still lifts to a table entry; env captures `fac` normally
});

/* --------------------------------------------- every shipped example */

for (const id of Object.keys(LAMBDA_EXAMPLES) as (keyof typeof LAMBDA_EXAMPLES)[]) {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(LAMBDA_EXAMPLES[id].workspace as never, workspace);
  const block = pickProgramBlock(workspace)!;

  for (const kind of ['structure', 'value'] as ReductionKind[]) {
    const prog = firOf(workspace, block, kind);
    const got = runFir(prog);
    const expected = computeReductionRun(block, kind).finalValue;
    check(`example ${id} · FIR ${kind} value matches substitution`, got.value === expected,
      `FIR got ${JSON.stringify(got.value)}, substitution expected ${JSON.stringify(expected)}`);
    check(`example ${id} · FIR ${kind} has no dangling labels`, danglingLabels(prog).length === 0);
  }
  workspace.dispose();
}

console.log(failures === 0
  ? `All ${checks} FIR checks passed.`
  : `${failures}/${checks} FIR checks FAILED.`);
if (failures > 0) process.exitCode = 1;
