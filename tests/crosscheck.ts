/**
 * The cross-check invariant (step 3.7) — the one test that guards the whole
 * compiler.
 *
 * For every pinned case and every shipped example, under BOTH strategies,
 * three *independently implemented* evaluators must agree on the final value:
 *
 *   1. **substitution** — `computeReductionRun`, the tree-rewriting reference
 *      semantics (the spec everything else is judged against);
 *   2. **the CEK machine** — `runCsekMachine`, an environment machine that
 *      walks the real block tree (a completely different evaluation strategy:
 *      closures + a kontinuation stack, no term rewriting);
 *   3. **the register bytecode VM** — run through its *serialized* form
 *      (`decode(encode(selectAndAllocate(toCfg(toFir(toAnfProgram(desugar(...)))))))`),
 *      i.e. the whole lowering pipeline plus the bytecode encoder/decoder plus
 *      the register machine.
 *
 * Three unrelated implementations converging on the same value for every
 * program is a strong end-to-end correctness signal: a bug anywhere in
 * desugar → ANF → closure conversion → lambda lifting → CFG → SSA-shape →
 * instruction selection → register allocation → bytecode encode/decode → the VM
 * would break the third agreement, and a bug in the reference semantics would
 * break all three. This subsumes every earlier stage's value-preservation test
 * into a single guard, and — because the VM side runs `decode(encode(·))`, not
 * the in-memory `VmProgram` directly — it also guards serialization: the bytes
 * the Machine-code tab shows are the bytes that get executed and checked here.
 *
 * Run with: npm run test:crosscheck
 */
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { LAMBDA_EXAMPLES } from '../src/core/examples/lambdaExamples';
import { parseLambdaTextToWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { inferLambdaWorkspaceTypes } from '../src/core/type-inference/lambdaTypeInference';
import { blockToTerm, computeReductionRun, type ReductionKind } from '../src/core/semantics/lambdaReduction';
import { formatMachineValue, injectCsekMachine, pickProgramBlock, runCsekMachine } from '../src/core/machine/csekMachine';
import { desugar, makeTypeLookup, toAnfProgram, toFir, toCfg, selectAndAllocate } from '../src/core/ir';
import { injectVm, runVm, formatVmValue } from '../src/core/ir/vm';
import { decode, encode } from '../src/core/ir/encode';

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

/** The substitution reference value. */
function substitutionValue(block: Blockly.Block, kind: ReductionKind): string {
  return computeReductionRun(block, kind).finalValue;
}

/** The CEK machine's final value (or a `<status>` marker if it did not finish
 *  on a value — kept distinct so a mismatch is legible rather than silent). */
function cekValue(workspace: Blockly.Workspace, block: Blockly.Block, kind: ReductionKind): string {
  const injected = injectCsekMachine(block, kind);
  if ('injectError' in injected) return `<inject error: ${injected.injectError}>`;
  const final = runCsekMachine(workspace, injected);
  if (final.status !== 'done' || final.result === null) return `<${final.status}${final.error ? `: ${final.error}` : ''}>`;
  return formatMachineValue(final.result);
}

/** The bytecode VM's final value, run through the *serialized* form so the
 *  encoder/decoder is on the checked path, not bypassed. */
function bytecodeValue(workspace: Blockly.Workspace, block: Blockly.Block, kind: ReductionKind): string {
  const report = inferLambdaWorkspaceTypes(workspace);
  const core = desugar(blockToTerm(block), makeTypeLookup(report));
  const prog = selectAndAllocate(toCfg(toFir(toAnfProgram(core, kind))));
  const executable = decode(encode(prog));
  const final = runVm(executable, injectVm(executable));
  if (final.status !== 'done' || final.result === null) return `<${final.status}${final.error ? `: ${final.error}` : ''}>`;
  return formatVmValue(final.result);
}

/** The one invariant: substitution ≡ CEK ≡ bytecode, for one program+strategy. */
function crossCheck(name: string, workspace: Blockly.Workspace, block: Blockly.Block, kind: ReductionKind): void {
  const sub = substitutionValue(block, kind);
  const cek = cekValue(workspace, block, kind);
  const vm = bytecodeValue(workspace, block, kind);
  check(`${name} · ${kind} · substitution ≡ CEK ≡ bytecode`, sub === cek && cek === vm,
    `substitution=${JSON.stringify(sub)}, CEK=${JSON.stringify(cek)}, bytecode=${JSON.stringify(vm)}`);
}

/* -------------------------------------------------------------- corpus */

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

for (const c of CASES) {
  withProgram(c.source, (workspace, block) => {
    for (const kind of ['structure', 'value'] as ReductionKind[]) crossCheck(c.name, workspace, block, kind);
  });
}

/* ------------------------------------------------- every shipped example */

for (const id of Object.keys(LAMBDA_EXAMPLES) as (keyof typeof LAMBDA_EXAMPLES)[]) {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(LAMBDA_EXAMPLES[id].workspace as never, workspace);
  const block = pickProgramBlock(workspace)!;
  for (const kind of ['structure', 'value'] as ReductionKind[]) crossCheck(`example ${id}`, workspace, block, kind);
  workspace.dispose();
}

console.log(failures === 0
  ? `All ${checks} cross-check invariants hold (substitution ≡ CEK ≡ bytecode).`
  : `${failures}/${checks} cross-check invariants FAILED.`);
if (failures > 0) process.exitCode = 1;
