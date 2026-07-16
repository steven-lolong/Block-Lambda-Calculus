/**
 * Semantics correspondence tests for the two reduction strategies and the
 * CEK machine.
 *
 * For each program: the substitution trace under Call-by-Structure (the
 * language default, as in Block-based-MNL) and Call-by-Value, and the CEK
 * machine under both strategies, must all reach the same final value; and
 * the substitution trace's salient rules ('beta', 'if-*', 'prim …') must
 * match the machine's salient rules in order — MNL's lockstep invariant.
 *
 * Also pins the MNL-alignment property that neither strategy reduces under
 * a binder: a bare abstraction is already a normal form.
 *
 * Run with: npm run test:semantics
 */
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { LAMBDA_EXAMPLES } from '../src/core/examples/lambdaExamples';
import { generateLambdaCode } from '../src/core/generator/lambdaGenerator';
import { parseLambdaTextToWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { computeReductionRun, renderLambdaReduction, type ReductionKind } from '../src/core/semantics/lambdaReduction';
import {
  formatMachineValue,
  injectCsekMachine,
  isSalientRule,
  pickProgramBlock,
  stepCsekMachine
} from '../src/core/machine/csekMachine';

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

/** Run the machine to completion, collecting its salient rule sequence. */
function machineRun(workspace: Blockly.Workspace, block: Blockly.Block, strategy: ReductionKind):
  { value: string; salient: string[]; status: string } {
  const initial = injectCsekMachine(block, strategy);
  if ('injectError' in initial) return { value: `inject error: ${initial.injectError}`, salient: [], status: 'error' };
  let state = initial;
  const salient: string[] = [];
  let guard = 0;
  while (state.status === 'running' && guard++ < 200000) {
    state = stepCsekMachine(workspace, state);
    if (isSalientRule(state.lastRule)) salient.push(state.lastRule!);
  }
  return {
    value: state.status === 'done' && state.result ? formatMachineValue(state.result) : `${state.status}: ${state.error}`,
    salient,
    status: state.status
  };
}

interface Case {
  name: string;
  source: string;
  expected: string;
  /** letrec unfolds differently in the two presentations; skip trace equality. */
  traceCheck?: boolean;
}

const CASES: Case[] = [
  // The copy-vs-lookup exemplar: CbS substitutes the unevaluated (3 * 7) into
  // both holes (duplicated work: two `prim *`); the machine's thunk lookup
  // re-runs it identically — the lazy version of the copying.
  { name: 'copy_vs_lookup', source: '(\\x. x + x) (3 * 7)', expected: '42' },
  { name: 'let_twice', source: 'let f = \\y. y + 1 in f (f 5)', expected: '7' },
  { name: 'shadowing', source: '(\\x. (\\x. x + 1) (x * 2)) 5', expected: '11' },
  { name: 'if_true', source: 'if 2 < 3 then 10 else 20', expected: '10' },
  { name: 'ho_twice', source: '(\\f. \\x. f (f x)) (\\y. y + 3) 5', expected: '11' },
  { name: 'bool_ops', source: 'if (1 < 2) and (3 < 2) then 1 else 0', expected: '0' },
  // `/` is typed int -> int -> int, so it must TRUNCATE: plain JS division
  // would make these well-typed `int` terms evaluate to 1.21 / 3.5 / -3.5.
  { name: 'div_exact', source: '6 / 3', expected: '2' },
  { name: 'div_truncates', source: '7 / 2', expected: '3' },
  { name: 'div_truncates_toward_zero', source: '(0 - 7) / 2', expected: '-3' },
  { name: 'div_hundreds_digit', source: '121 / 100', expected: '1' },
  { name: 'div_tens_digit', source: '121 / 10', expected: '12' },
  // The guard: x / 0 yields 0 rather than Infinity/NaN, keeping the value an int.
  { name: 'div_by_zero_guard', source: '121 / 0', expected: '0' },
  // Digit extraction, the whole point of a truncating `/`: 121 -> 1, 2, 1.
  { name: 'digit_ones', source: 'let n = 121 in n - ((n / 10) * 10)', expected: '1' },
  { name: 'digit_tens', source: 'let n = 121 in (n / 10) - ((n / 100) * 10)', expected: '2' },
  // The Palindrome example's term. The property the example exists to show is
  // that the answer DEPENDS on `number` — it derives the digits rather than
  // being handed them — so both of these must hold, not just the first.
  {
    name: 'palindrome_121_is_true',
    source: 'let number = 121 in let hundreds = number / 100 in let ones = number - ((number / 10) * 10) in if hundreds = ones then true else false',
    expected: 'true'
  },
  {
    name: 'palindrome_123_is_false',
    source: 'let number = 123 in let hundreds = number / 100 in let ones = number - ((number / 10) * 10) in if hundreds = ones then true else false',
    expected: 'false'
  },
  {
    name: 'letrec_factorial',
    source: 'letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5',
    expected: '120',
    traceCheck: false
  }
];

for (const c of CASES) {
  withProgram(c.source, (workspace, block) => {
    for (const kind of ['structure', 'value'] as ReductionKind[]) {
      const run = computeReductionRun(block, kind);
      check(`${c.name} · substitution ${kind} value`, run.finalValue === c.expected,
        `got ${JSON.stringify(run.finalValue)}, expected ${JSON.stringify(c.expected)}`);
      check(`${c.name} · substitution ${kind} reaches normal form`, run.normalForm && !run.truncated);

      const machine = machineRun(workspace, block, kind);
      check(`${c.name} · machine ${kind} value`, machine.value === c.expected,
        `got ${JSON.stringify(machine.value)}, expected ${JSON.stringify(c.expected)}`);

      if (c.traceCheck !== false) {
        const traceSalient = run.frames.map((f) => f.salient).filter((s): s is string => s !== null);
        check(
          `${c.name} · ${kind} salient lockstep (substitution ⇄ machine)`,
          JSON.stringify(traceSalient) === JSON.stringify(machine.salient),
          `substitution [${traceSalient.join(', ')}] vs machine [${machine.salient.join(', ')}]`
        );
      }
    }
  });
}

// CbS duplicates the argument's work per use-site; CbV does it once. On the
// exemplar this is visible as two `prim *` under structure and one under value
// — in BOTH presentations (that agreement is the point of the lockstep).
withProgram('(\\x. x + x) (3 * 7)', (workspace, block) => {
  const mulsOf = (rules: (string | null)[]): number => rules.filter((r) => r === 'prim *').length;
  const structRun = computeReductionRun(block, 'structure');
  const valueRun = computeReductionRun(block, 'value');
  check('duplicated work · CbS substitution has two prim *', mulsOf(structRun.frames.map((f) => f.salient)) === 2);
  check('shared work · CbV substitution has one prim *', mulsOf(valueRun.frames.map((f) => f.salient)) === 1);
  check('duplicated work · CbS machine has two prim *', mulsOf(machineRun(workspace, block, 'structure').salient) === 2);
  check('shared work · CbV machine has one prim *', mulsOf(machineRun(workspace, block, 'value').salient) === 1);
});

// MNL alignment: neither strategy reduces under a binder — a bare abstraction
// with a reducible body is already a normal form.
withProgram('\\y. 2 + 3 + y', (_workspace, block) => {
  for (const kind of ['structure', 'value'] as ReductionKind[]) {
    const run = computeReductionRun(block, kind);
    check(`no reduction under a binder (${kind})`, run.frames.length === 1 && run.normalForm,
      `got ${run.frames.length} frame(s), normalForm=${run.normalForm}`);
  }
});

/* ------------------------------------------------------------------ */
/* CbS / CbV visualization windows (renderLambdaReduction): the        */
/* MNL-parity property that EVERY recursive call is rendered.           */
/* ------------------------------------------------------------------ */

// Headless stand-ins for the BlockSvg-only methods the renderer touches.
const B = Blockly.Block.prototype as any;
if (!B.initSvg) B.initSvg = function () {};
if (!B.render) B.render = function () {};
if (!B.getHeightWidth) B.getHeightWidth = function () { return { height: 40, width: 120 }; };
if (!B.moveBy) B.moveBy = function () {};
if (!B.moveTo) B.moveTo = function () {};

/** Render the outermost application's reduction and count the beta pairs. */
function renderedBetaCount(source: string, kind: ReductionKind): number {
  return withProgram(source, (_main, block) => {
    const viz = new Blockly.Workspace();
    try {
      renderLambdaReduction(block as any, viz as any, kind);
      return viz.getAllBlocks(false)
        .filter((b) => b.type === 'lambda_viz_description')
        .map((b) => String(b.getFieldValue('TEXT') ?? ''))
        .filter((text) => text.startsWith('Substituted block')).length;
    } finally {
      viz.dispose();
    }
  });
}

// pickProgramBlock returns the outermost application for these sources.
const FACT = 'letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 3';
for (const kind of ['structure', 'value'] as ReductionKind[]) {
  // fac 3 → fac 2 → fac 1 → fac 0: four beta reductions must all render.
  // (Regression: a missing cmpop case left the if-condition unreduced, so
  // recursion stopped rendering after the FIRST beta.)
  check(`viz · factorial renders every recursive call (${kind})`,
    renderedBetaCount(FACT, kind) === 4,
    `got ${renderedBetaCount(FACT, kind)} beta pairs, expected 4`);
}
// CbS renders the duplicated copies' work; CbV renders the shared value's.
// Counts are anchored to rendering from the top-level let block (what
// pickProgramBlock selects): 4 beta pairs under CbS vs 3 under CbV — the
// strict inequality is the duplicated-work signature.
const LET_FN = 'let f = \\y. y + 1 in f (f 5)';
check('viz · CbS duplicates the argument reduction (4 betas)', renderedBetaCount(LET_FN, 'structure') === 4);
check('viz · CbV evaluates the argument once (3 betas)', renderedBetaCount(LET_FN, 'value') === 3);

/* ------------------------------------------------------------------ */
/* The shipped Palindrome example must be the real check, not just the  */
/* hand-written term above: load the EXAMPLE, evaluate it, then swap    */
/* its number and require the answer to follow. The example previously  */
/* hardcoded its digits and never read `number`, so 123 also said true. */
{
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(
    LAMBDA_EXAMPLES['palindrome-number'].workspace as never,
    workspace
  );
  const source = generateLambdaCode(workspace as never).trim();
  const shipped = computeReductionRun(workspace.getTopBlocks(true)[0], 'structure');
  workspace.dispose();

  check('example · palindrome 121 evaluates to true', shipped.finalValue === 'true',
    `got ${JSON.stringify(shipped.finalValue)}`);
  check('example · palindrome reads `number` (it is not hardcoded)',
    source.includes('number / 100') && source.includes('number / 10'),
    `generated: ${source}`);

  // The property that makes the example mean anything: change the number and
  // the verdict must change with it.
  const evalWith = (n: number): string => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(
      parseLambdaTextToWorkspaceState(source.replace('121', String(n))) as never,
      ws
    );
    const value = computeReductionRun(ws.getTopBlocks(true)[0], 'structure').finalValue;
    ws.dispose();
    return value;
  };
  for (const [n, expected] of [[121, 'true'], [131, 'true'], [222, 'true'], [123, 'false'], [100, 'false']] as const) {
    check(`example · palindrome of ${n} is ${expected}`, evalWith(n) === expected,
      `got ${JSON.stringify(evalWith(n))}`);
  }
}

console.log(failures === 0
  ? `All ${checks} semantics checks passed.`
  : `${failures}/${checks} semantics checks FAILED.`);
if (failures > 0) process.exitCode = 1;
