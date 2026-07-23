/**
 * Correctness tests for the lowering pipeline's Core and ANF passes
 * (src/core/ir/{desugar,toAnf}.ts).
 *
 * The central invariant: a tiny ANF evaluator, run over `toAnfProgram`'s
 * output, must reach the same final value as the substitution stepper
 * (computeReductionRun) and the CEK machine — for every pinned case and every
 * shipped example, under BOTH strategies. This extends the substitution ⇄
 * machine lockstep invariant in tests/semantics.ts one level: substitution ⇄
 * machine ⇄ ANF must all agree.
 *
 * Also checks the two properties the design explicitly commits to:
 *   - call-by-value ANF never contains a `force` atom or a `susp` binding —
 *     the strategy split is a real absence, not just an unused tag;
 *   - call-by-structure duplicates primitive work exactly like the
 *     substitution trace and the machine do (the copy-vs-lookup exemplar).
 *
 * Run with: npm run test:anf
 */
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { LAMBDA_EXAMPLES } from '../src/core/examples/lambdaExamples';
import { parseLambdaTextToWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { inferLambdaWorkspaceTypes } from '../src/core/type-inference/lambdaTypeInference';
import { blockToTerm, computeReductionRun, type ReductionKind } from '../src/core/semantics/lambdaReduction';
import { pickProgramBlock } from '../src/core/machine/csekMachine';
import { desugar, makeTypeLookup, toAnfProgram, prettyPrintCore, prettyPrintAnfProgram } from '../src/core/ir';
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

/* -------------------------------------------------- tiny ANF evaluator */
/* Mirrors the CEK machine (../src/core/machine/csekMachine.ts): CbV binds
   values, CbS binds thunks, and a variable lookup forces (re-enters) a thunk
   with no memoization — duplicated work is duplicated evaluation, not shared. */

type EvalValue =
  | { tag: 'num'; n: number }
  | { tag: 'bool'; b: boolean }
  | { tag: 'clo'; param: string; body: AnfExpr; env: EvalEnv };

type EnvEntry = EvalValue | { tag: 'thunk'; body: AnfExpr; env: EvalEnv };
type EvalEnv = { name: string; value: EnvEntry; parent: EvalEnv } | null;

/** Op labels of every `prim` fired during the most recent `runAnf` call. */
let firedPrims: string[] = [];

function lookupEntry(env: EvalEnv, name: string): EnvEntry {
  for (let cursor = env; cursor; cursor = cursor.parent) {
    if (cursor.name === name) return cursor.value;
  }
  throw new Error(`unbound ANF variable ${name}`);
}

function force(entry: EnvEntry): EvalValue {
  return entry.tag === 'thunk' ? evalExpr(entry.body, entry.env) : entry;
}

function atomValue(atom: AnfAtom, env: EvalEnv): EvalValue {
  switch (atom.kind) {
    case 'num':
      return { tag: 'num', n: atom.value };
    case 'bool':
      return { tag: 'bool', b: atom.value };
    case 'lam':
      return { tag: 'clo', param: atom.param, body: atom.body, env };
    case 'var':
      return force(lookupEntry(env, atom.name));
    case 'force':
      return force(lookupEntry(env, atom.name));
    case 'hole':
      throw new Error('cannot evaluate a hole');
  }
}

/** An application argument: a bare `var` aliases the existing (possibly
 *  thunked) entry unforced, matching `normalizeArg`'s CbS aliasing in toAnf.ts. */
function argEntry(atom: AnfAtom, env: EvalEnv): EnvEntry {
  return atom.kind === 'var' ? lookupEntry(env, atom.name) : atomValue(atom, env);
}

/* Mirrors foldBinary in csekMachine.ts / computePrimitive in
   lambdaReduction.ts exactly, including truncating division and / by 0 -> 0. */
function evalComp(comp: AnfComp, env: EvalEnv): EvalValue {
  switch (comp.kind) {
    case 'app': {
      const fn = atomValue(comp.func, env);
      if (fn.tag !== 'clo') throw new Error('applying a non-function');
      return evalExpr(fn.body, { name: fn.param, value: argEntry(comp.arg, env), parent: fn.env });
    }
    case 'if': {
      const cond = atomValue(comp.cond, env);
      if (cond.tag !== 'bool') throw new Error('if condition must be boolean');
      return evalExpr(cond.b ? comp.then : comp.else, env);
    }
    case 'prim': {
      firedPrims.push(comp.op);
      const left = atomValue(comp.left, env);
      const right = atomValue(comp.right, env);
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

function bindingEntry(binding: AnfBinding, env: EvalEnv): EnvEntry {
  switch (binding.kind) {
    case 'atom':
      return atomValue(binding.atom, env);
    case 'comp':
      return evalComp(binding.comp, env);
    case 'susp':
      return { tag: 'thunk', body: binding.body, env };
  }
}

function evalExpr(expr: AnfExpr, env: EvalEnv): EvalValue {
  switch (expr.kind) {
    case 'ret':
      return atomValue(expr.atom, env);
    case 'tail':
      return evalComp(expr.comp, env);
    case 'let':
      return evalExpr(expr.body, { name: expr.name, value: bindingEntry(expr.rhs, env), parent: env });
    case 'letrec': {
      const frame = { name: expr.name, value: undefined as unknown as EnvEntry, parent: env };
      frame.value = bindingEntry(expr.rhs, frame);
      return evalExpr(expr.body, frame);
    }
  }
}

/** Matches formatMachineValue in csekMachine.ts, so values compare as text. */
function formatEvalValue(v: EvalValue): string {
  switch (v.tag) {
    case 'num':
      return Number.isInteger(v.n) ? String(v.n) : String(Number(v.n.toFixed(6)));
    case 'bool':
      return v.b ? 'true' : 'false';
    case 'clo':
      return 'function';
  }
}

function runAnf(expr: AnfExpr): { value: string; firedPrims: string[] } {
  firedPrims = [];
  const value = formatEvalValue(evalExpr(expr, null));
  return { value, firedPrims };
}

/* ---------------------------------------------- structural invariants */

function exprMentionsThunkOrForce(expr: AnfExpr): boolean {
  const atomHas = (atom: AnfAtom): boolean =>
    atom.kind === 'force' || (atom.kind === 'lam' && exprMentionsThunkOrForce(atom.body));
  const compHas = (comp: AnfComp): boolean => {
    if (comp.kind === 'app') return atomHas(comp.func) || atomHas(comp.arg);
    if (comp.kind === 'prim') return atomHas(comp.left) || atomHas(comp.right);
    return atomHas(comp.cond) || exprMentionsThunkOrForce(comp.then) || exprMentionsThunkOrForce(comp.else);
  };
  const bindingHas = (binding: AnfBinding): boolean =>
    binding.kind === 'susp' || (binding.kind === 'atom' ? atomHas(binding.atom) : compHas(binding.comp));
  switch (expr.kind) {
    case 'ret':
      return atomHas(expr.atom);
    case 'tail':
      return compHas(expr.comp);
    case 'let':
    case 'letrec':
      return bindingHas(expr.rhs) || exprMentionsThunkOrForce(expr.body);
  }
}

/* -------------------------------------------------------------- cases */
/* Mirrors tests/semantics.ts's CASES: independent coverage, same sources,
   so both suites exercise the identical corpus of block-derived programs. */

interface Case {
  name: string;
  source: string;
}

const CASES: Case[] = [
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
  {
    name: 'letrec_factorial',
    source: 'letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5'
  }
];

function coreAndAnf(workspace: Blockly.Workspace, block: Blockly.Block, kind: ReductionKind) {
  const report = inferLambdaWorkspaceTypes(workspace);
  const core = desugar(blockToTerm(block), makeTypeLookup(report));
  const program = toAnfProgram(core, kind);
  return { core, program };
}

for (const c of CASES) {
  withProgram(c.source, (workspace, block) => {
    for (const kind of ['structure', 'value'] as ReductionKind[]) {
      const { program } = coreAndAnf(workspace, block, kind);
      const anfResult = runAnf(program.body);
      const substValue = computeReductionRun(block, kind).finalValue;

      check(`${c.name} · ANF ${kind} value matches substitution`, anfResult.value === substValue,
        `ANF got ${JSON.stringify(anfResult.value)}, substitution expected ${JSON.stringify(substValue)}`);

      if (kind === 'value') {
        check(`${c.name} · CbV ANF has no thunk/force`, !exprMentionsThunkOrForce(program.body));
      }
    }
  });
}

// The duplicated-work signature, now demonstrated by the ANF evaluator
// itself: CbS re-forces the thunked argument at each use (two `prim *`);
// CbV shares the already-computed value (one `prim *`).
withProgram('(\\x. x + x) (3 * 7)', (workspace, block) => {
  const mulsOf = (ops: string[]): number => ops.filter((op) => op === '*').length;
  const structural = coreAndAnf(workspace, block, 'structure');
  const value = coreAndAnf(workspace, block, 'value');
  check('duplicated work · CbS ANF has two prim *', mulsOf(runAnf(structural.program.body).firedPrims) === 2);
  check('shared work · CbV ANF has one prim *', mulsOf(runAnf(value.program.body).firedPrims) === 1);
});

// Light golden check on the letrec/factorial shape: pins the presence of the
// expected constructs (named recursive binding, a genuinely named
// intermediate, and the CbS/CbV force/thunk split) without pinning brittle
// exact fresh-name text.
withProgram('letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5', (workspace, block) => {
  const report = inferLambdaWorkspaceTypes(workspace);
  const core = desugar(blockToTerm(block), makeTypeLookup(report));

  const coreText = prettyPrintCore(core).text;
  check('factorial · Core keeps a named recursive binding', coreText.startsWith('letrec fac = '),
    `got ${JSON.stringify(coreText)}`);
  check('factorial · Core unifies the comparison into prim', coreText.includes('n < 1'), `got ${JSON.stringify(coreText)}`);

  const cbv = prettyPrintAnfProgram(toAnfProgram(core, 'value')).text;
  check('factorial · CbV ANF names an intermediate', /let t\d+ =/.test(cbv), `got ${JSON.stringify(cbv)}`);
  check('factorial · CbV ANF has no force/thunk', !cbv.includes('force') && !cbv.includes('thunk{'));

  const cbs = prettyPrintAnfProgram(toAnfProgram(core, 'structure')).text;
  check('factorial · CbS ANF forces the recursive call', cbs.includes('force'), `got ${JSON.stringify(cbs)}`);
});

/* --------------------------------------------- every shipped example */
/* Oracle-based: cross-check against the substitution trace (itself already
   pinned against the CEK machine in tests/semantics.ts) rather than
   duplicating that suite's hand-pinned value table — covers every shipped
   example automatically as new ones are added. */

for (const id of Object.keys(LAMBDA_EXAMPLES) as (keyof typeof LAMBDA_EXAMPLES)[]) {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(LAMBDA_EXAMPLES[id].workspace as never, workspace);
  const block = pickProgramBlock(workspace)!;

  for (const kind of ['structure', 'value'] as ReductionKind[]) {
    const { program } = coreAndAnf(workspace, block, kind);
    const anfResult = runAnf(program.body);
    const substValue = computeReductionRun(block, kind).finalValue;
    check(`example ${id} · ANF ${kind} value matches substitution`, anfResult.value === substValue,
      `ANF got ${JSON.stringify(anfResult.value)}, substitution expected ${JSON.stringify(substValue)}`);
  }
  workspace.dispose();
}

console.log(failures === 0
  ? `All ${checks} ANF checks passed.`
  : `${failures}/${checks} ANF checks FAILED.`);
if (failures > 0) process.exitCode = 1;
