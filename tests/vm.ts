/**
 * VM interpreter + bytecode-encoder tests (src/core/ir/vm.ts, src/core/ir/encode.ts,
 * step 3.5). `stepVm` is now the *real*, final interpreter — unlike every
 * earlier stage (cfg.ts, asm.ts), this file does not hand-roll its own oracle
 * evaluator; it runs the shipped `runVm`/`stepVm` directly and checks the
 * result against `computeReductionRun` (the substitution stepper), for every
 * pinned case and every shipped example, under both strategies. So
 * substitution ⇄ … ⇄ CFG ⇄ asm ⇄ bytecode all agree end to end.
 *
 * Four properties specific to this stage, each with its own teeth:
 *
 *   - **syncCount alignment.** `stepVm`'s running `syncCount` must equal the
 *     number of salient rules CSEK fires for the *same* program — computed
 *     independently by stepping the real `stepCsekMachine` and counting
 *     `isSalientRule(state.lastRule)`. This is the Lockstep bridge's (3.7)
 *     actual correctness contract, not just a docstring claim.
 *
 *   - **exact time travel.** `stepVm` must be pure: stepping further must
 *     never retroactively change an earlier snapshot. Verified by capturing
 *     `JSON.stringify(state)` at every step of a real run (one with heap
 *     allocation *and* frame push/pop, so both COW paths are exercised), then
 *     re-checking every capture against its frozen snapshot after the full
 *     run completes.
 *
 *   - **tail calls are O(1) stack, under call-by-value.** An accumulator-style
 *     curried recursive function (`go acc n`) run at two different `n` must
 *     reach the *same* peak frame depth — the direct, empirical demonstration
 *     that `TailCallClos` replaces frames rather than growing them. Under
 *     call-by-structure the *same* program's peak depth grows with `n`
 *     instead — not a bug: CbS binds `acc`/`n` as unmemoized thunks, so
 *     forcing the innermost `n` requires forcing back through the whole
 *     deferred `n-1` chain, an orthogonal, genuine cost of the strategy that
 *     has nothing to do with whether the outer calls are tail calls. Both
 *     directions are asserted, so the O(1) claim is scoped to where it
 *     actually holds rather than papered over.
 *
 *   - **encode/decode round-trips.** `decode(encode(prog))` is checked for
 *     exact structural equality against `prog` (a real recursive deep-equal,
 *     not a key-order-sensitive JSON comparison), and separately re-run
 *     through `runVm` to confirm the round trip is still executable and
 *     matches substitution — proving the encoding is faithful, not just
 *     superficially reversible.
 *
 * Run with: npm run test:vm
 */
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { LAMBDA_EXAMPLES } from '../src/core/examples/lambdaExamples';
import { parseLambdaTextToWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { inferLambdaWorkspaceTypes } from '../src/core/type-inference/lambdaTypeInference';
import { blockToTerm, computeReductionRun, type ReductionKind } from '../src/core/semantics/lambdaReduction';
import { injectCsekMachine, isSalientRule, pickProgramBlock, stepCsekMachine } from '../src/core/machine/csekMachine';
import { desugar, makeTypeLookup, toAnfProgram, toFir, toCfg, selectAndAllocate } from '../src/core/ir';
import { injectVm, runVm, stepVm, formatVmValue, type VmState } from '../src/core/ir/vm';
import { encode, decode } from '../src/core/ir/encode';
import type { VmProgram } from '../src/core/ir/isa';

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

function vmOf(workspace: Blockly.Workspace, block: Blockly.Block, kind: ReductionKind): VmProgram {
  const report = inferLambdaWorkspaceTypes(workspace);
  const core = desugar(blockToTerm(block), makeTypeLookup(report));
  return selectAndAllocate(toCfg(toFir(toAnfProgram(core, kind))));
}

/** Human-readable final value, or `<status: error>` if the run did not land
 *  on a result — kept distinct from a real value so a mismatch is legible. */
function finalValueOf(state: VmState): string {
  if (state.status !== 'done' || state.result === null) {
    return `<${state.status}${state.error ? `: ${state.error}` : ''}>`;
  }
  return formatVmValue(state.result);
}

/** CSEK's own salient-rule count for the same program, computed independently
 *  (real `stepCsekMachine`, not a re-derivation) — the Lockstep bridge's
 *  actual cross-check target for `VmState.syncCount`. */
function csekSalientCount(workspace: Blockly.Workspace, block: Blockly.Block, kind: ReductionKind, maxSteps = 200000): number {
  const injected = injectCsekMachine(block, kind);
  if ('injectError' in injected) throw new Error(injected.injectError);
  let state = injected;
  let count = 0;
  while (state.status === 'running' && state.stepCount < maxSteps) {
    state = stepCsekMachine(workspace, state);
    if (isSalientRule(state.lastRule)) count++;
  }
  return count;
}

/** Order-independent structural equality (unlike JSON.stringify, immune to
 *  incidental key-insertion-order differences between construction sites). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => bk.includes(k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/* -------------------------------------------------------------- cases */
/* Same corpus as tests/asm.ts. */

const CASES: { name: string; source: string }[] = [
  { name: 'copy_vs_lookup', source: '(\\x. x + x) (3 * 7)' },
  { name: 'let_twice', source: 'let f = \\y. y + 1 in f (f 5)' },
  { name: 'shadowing', source: '(\\x. (\\x. x + 1) (x * 2)) 5' },
  { name: 'if_true', source: 'if 2 < 3 then 10 else 20' },
  { name: 'if_let_bound', source: '(if 2 < 3 then 10 else 20) + 1' },
  { name: 'ho_twice', source: '(\\f. \\x. f (f x)) (\\y. y + 3) 5' },
  { name: 'bool_ops', source: 'if (1 < 2) and (3 < 2) then 1 else 0' },
  { name: 'div_truncates_toward_zero', source: '(0 - 7) / 2' },
  { name: 'div_by_zero_guard', source: '121 / 0' },
  { name: 'tail_force', source: 'let x = 3 * 3 in x' },
  { name: 'compose', source: '(\\f. \\g. \\x. f (g x)) (\\y. y + 1) (\\z. z * 2) 5' },
  { name: 'letrec_factorial', source: 'letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5' }
];

/* ------------------------------------------------- value preservation */

for (const c of CASES) {
  withProgram(c.source, (workspace, block) => {
    for (const kind of ['structure', 'value'] as ReductionKind[]) {
      const prog = vmOf(workspace, block, kind);
      const final = runVm(prog, injectVm(prog));
      const expected = computeReductionRun(block, kind).finalValue;
      check(`${c.name} · vm ${kind} value matches substitution`, finalValueOf(final) === expected,
        `vm got ${finalValueOf(final)}, substitution expected ${JSON.stringify(expected)}`);
    }
  });
}

/* -------------------------------------------------- syncCount alignment */

for (const c of CASES) {
  withProgram(c.source, (workspace, block) => {
    for (const kind of ['structure', 'value'] as ReductionKind[]) {
      const prog = vmOf(workspace, block, kind);
      const final = runVm(prog, injectVm(prog));
      const csekCount = csekSalientCount(workspace, block, kind);
      check(`${c.name} · vm ${kind} syncCount aligns with CSEK's salient-rule count`,
        final.syncCount === csekCount, `vm.syncCount=${final.syncCount}, csek salient=${csekCount}`);
    }
  });
}

for (const id of Object.keys(LAMBDA_EXAMPLES) as (keyof typeof LAMBDA_EXAMPLES)[]) {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(LAMBDA_EXAMPLES[id].workspace as never, workspace);
  const block = pickProgramBlock(workspace)!;
  for (const kind of ['structure', 'value'] as ReductionKind[]) {
    const prog = vmOf(workspace, block, kind);
    const final = runVm(prog, injectVm(prog));
    const expected = computeReductionRun(block, kind).finalValue;
    check(`example ${id} · vm ${kind} value matches substitution`, finalValueOf(final) === expected,
      `vm got ${finalValueOf(final)}, substitution expected ${JSON.stringify(expected)}`);
    const csekCount = csekSalientCount(workspace, block, kind);
    check(`example ${id} · vm ${kind} syncCount aligns with CSEK's salient-rule count`,
      final.syncCount === csekCount, `vm.syncCount=${final.syncCount}, csek salient=${csekCount}`);
  }
  workspace.dispose();
}

/* ------------------------------- duplicated-work signature, at this stage */

withProgram('(\\x. x + x) (3 * 7)', (workspace, block) => {
  // Inspect the about-to-execute instruction before each step — the real
  // interpreter exposes only the opcode via lastOp, not which primitive, so a
  // per-primitive log is read from the program at the pre-step pc, mirroring
  // what tests/cfg.ts / tests/asm.ts logged inside their own oracles.
  function primsFired(prog: VmProgram): string[] {
    let state = injectVm(prog);
    const prims: string[] = [];
    while (state.status === 'running') {
      const top = state.frames[state.frames.length - 1];
      const ins = prog.code[top.pc];
      if (ins && ins.op === 'Bin') prims.push(ins.prim);
      state = stepVm(prog, state);
    }
    return prims;
  }
  const muls = (ps: string[]): number => ps.filter((p) => p === '*').length;
  check('duplicated work · CbS vm fires two `*`', muls(primsFired(vmOf(workspace, block, 'structure'))) === 2);
  check('shared work · CbV vm fires one `*`', muls(primsFired(vmOf(workspace, block, 'value'))) === 1);
});

/* --------------------------------------------------- exact time travel */

withProgram('letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5', (workspace, block) => {
  // CbV factorial: real heap allocation (the recursion-via-label closure) and
  // real frame push/pop (non-tail recursive calls) — exercises both COW paths.
  const prog = vmOf(workspace, block, 'value');
  let state = injectVm(prog);
  const captured: { state: VmState; snapshot: string }[] = [];
  let steps = 0;
  while (state.status === 'running' && steps < 5000) {
    captured.push({ state, snapshot: JSON.stringify(state) });
    state = stepVm(prog, state);
    steps++;
  }
  captured.push({ state, snapshot: JSON.stringify(state) });

  check('exact time travel · run completed', state.status === 'done', `status=${state.status} error=${state.error}`);
  check('exact time travel · captured a meaningful number of snapshots', captured.length > 10,
    `captured=${captured.length}`);
  const corrupted = captured.filter((c) => JSON.stringify(c.state) !== c.snapshot);
  check('exact time travel · earlier snapshots are untouched by every later step', corrupted.length === 0,
    `${corrupted.length} of ${captured.length} snapshots changed after being captured`);
});

/* --------------------------------- tail calls are O(1) stack (CbV only) */

function maxFrameDepth(prog: VmProgram, maxSteps = 200000): number {
  let state = injectVm(prog);
  let depth = 0;
  let steps = 0;
  while (state.status === 'running' && steps < maxSteps) {
    depth = Math.max(depth, state.frames.length);
    state = stepVm(prog, state);
    steps++;
  }
  return depth;
}

{
  const accumulator = (n: number): string =>
    `letrec go = \\acc. \\n. if n < 1 then acc else go (acc * n) (n - 1) in go 1 ${n}`;

  withProgram(accumulator(10), (ws10, block10) => {
    const depth10 = maxFrameDepth(vmOf(ws10, block10, 'value'));
    withProgram(accumulator(20), (ws20, block20) => {
      const depth20 = maxFrameDepth(vmOf(ws20, block20, 'value'));
      check('tail calls · CbV accumulator peak frame depth is independent of n (10! vs 20!)',
        depth10 === depth20, `depth(n=10)=${depth10}, depth(n=20)=${depth20}`);
    });
    const prog10 = vmOf(ws10, block10, 'value');
    const final10 = runVm(prog10, injectVm(prog10));
    check('tail calls · CbV accumulator still computes 10! = 3628800', finalValueOf(final10) === '3628800',
      finalValueOf(final10));
  });

  // CbS: the SAME program's peak depth grows with n — the unmemoized
  // thunk-chain cost (forcing `n` forces back through every deferred `n-1`),
  // orthogonal to and not fixed by tail-call frame reuse. Documenting this
  // (rather than only ever testing CbV) keeps the O(1) claim honestly scoped.
  withProgram(accumulator(3), (ws3, block3) => {
    const depth3 = maxFrameDepth(vmOf(ws3, block3, 'structure'));
    withProgram(accumulator(10), (ws10s, block10s) => {
      const depth10s = maxFrameDepth(vmOf(ws10s, block10s, 'structure'));
      check('tail calls · CbS accumulator peak frame depth GROWS with n (unmemoized thunk chain, not a bug)',
        depth10s > depth3, `depth(n=3)=${depth3}, depth(n=10)=${depth10s}`);
      const prog10s = vmOf(ws10s, block10s, 'structure');
      const final10s = runVm(prog10s, injectVm(prog10s));
      check('tail calls · CbS accumulator still computes 10! = 3628800', finalValueOf(final10s) === '3628800',
        finalValueOf(final10s));
    });
  });
}

/* ---------------------------------------------- encode/decode round trip */

for (const c of CASES) {
  withProgram(c.source, (workspace, block) => {
    for (const kind of ['structure', 'value'] as ReductionKind[]) {
      const prog = vmOf(workspace, block, kind);
      const roundTripped = decode(encode(prog));
      check(`${c.name} · vm ${kind} encode/decode round-trips structurally`, deepEqual(prog, roundTripped));
      const final = runVm(roundTripped, injectVm(roundTripped));
      const expected = computeReductionRun(block, kind).finalValue;
      check(`${c.name} · vm ${kind} decoded program still matches substitution`, finalValueOf(final) === expected,
        `decoded vm got ${finalValueOf(final)}, substitution expected ${JSON.stringify(expected)}`);
    }
  });
}

console.log(failures === 0
  ? `All ${checks} VM checks passed.`
  : `${failures}/${checks} VM checks FAILED.`);
if (failures > 0) process.exitCode = 1;
