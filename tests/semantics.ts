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
import { parseLambdaTextToWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { computeReductionRun, type ReductionKind } from '../src/core/semantics/lambdaReduction';
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

console.log(failures === 0
  ? `All ${checks} semantics checks passed.`
  : `${failures}/${checks} semantics checks FAILED.`);
if (failures > 0) process.exitCode = 1;
