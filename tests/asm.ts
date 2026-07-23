/**
 * Instruction-selection + register-allocation tests (src/core/ir/toAsm.ts, 3.4).
 *
 * The value-preservation invariant is carried one stage lower: a small VM
 * interpreter — a flat `Instr[]` over a bounded physical register file with
 * spill slots, an explicit heap, and the closure calling convention — run over
 * `selectAndAllocate(toCfg(toFir(...)))` must reach the same final value as the
 * substitution stepper (computeReductionRun), for every pinned case and every
 * shipped example, under BOTH strategies. So substitution ⇄ … ⇄ CFG ⇄ bytecode
 * all agree, and the duplicated-work signature (CbS fires `*` twice, CbV once)
 * survives register allocation. This interpreter is deliberately independent of
 * the shipped `stepVm` (3.5) so it is a genuine cross-check, not a tautology —
 * and it pins the operational contract the real VM must satisfy (Force
 * discriminates thunk vs closure by the code's `arity`).
 *
 * Three properties get their own teeth beyond value-preservation:
 *   - the factorial-CbV shape gate (the 3.4 GATE): the recursive function
 *     lowers to register code with a `JmpIf`, an `Alloc`, and a `CallClos`, and
 *     needs no spill slots;
 *   - a hand-built high-pressure function (12 simultaneously-live values) forces
 *     the allocator to spill — `Spill`/`Reload` are emitted, `slotCount > 0`,
 *     and it still computes the right value;
 *   - a hand-built tail `force` is peepholed to a `TailForce`.
 *
 * Run with: npm run test:asm
 */
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { LAMBDA_EXAMPLES } from '../src/core/examples/lambdaExamples';
import { parseLambdaTextToWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { inferLambdaWorkspaceTypes } from '../src/core/type-inference/lambdaTypeInference';
import { blockToTerm, computeReductionRun, type ReductionKind } from '../src/core/semantics/lambdaReduction';
import { pickProgramBlock } from '../src/core/machine/csekMachine';
import { desugar, makeTypeLookup, toAnfProgram, toFir, toCfg, selectAndAllocate } from '../src/core/ir';
import { CLOS_CODE, CLOS_ENV, REG_COUNT } from '../src/core/ir/isa';
import type { CodeEntry, Instr, VmProgram, VmValue } from '../src/core/ir/isa';
import type { CfgFunc, CfgProgram } from '../src/core/ir/lir';

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

function asmOf(workspace: Blockly.Workspace, block: Blockly.Block, kind: ReductionKind): VmProgram {
  const report = inferLambdaWorkspaceTypes(workspace);
  const core = desugar(blockToTerm(block), makeTypeLookup(report));
  return selectAndAllocate(toCfg(toFir(toAnfProgram(core, kind))));
}

/* ------------------------------------------------- tiny VM interpreter (oracle) */

interface Rec {
  fields: VmValue[];
}
interface Machine {
  prog: VmProgram;
  heap: Rec[];
  fired: string[];
  steps: number;
}
const MAX_STEPS = 5_000_000;

function foldBin(opKind: string, op: string, left: VmValue, right: VmValue, m: Machine): VmValue {
  m.fired.push(op);
  if (opKind === 'num') {
    if (left.tag !== 'int' || right.tag !== 'int') throw new Error('arithmetic expects ints');
    const a = left.n;
    const b = right.n;
    const n = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b
      : op === '/' ? (b === 0 ? 0 : Math.trunc(a / b)) : null;
    if (n === null) throw new Error(`unknown arithmetic operator ${op}`);
    return { tag: 'int', n };
  }
  if (opKind === 'bool') {
    if (left.tag !== 'bool' || right.tag !== 'bool') throw new Error('boolean operator expects booleans');
    const b = op === 'and' ? left.b && right.b : op === 'or' ? left.b || right.b
      : op === 'equal' ? left.b === right.b : null;
    if (b === null) throw new Error(`unknown boolean operator ${op}`);
    return { tag: 'bool', b };
  }
  if (left.tag !== 'int' || right.tag !== 'int') throw new Error('comparison expects ints');
  const a = left.n;
  const b = right.n;
  const r = op === '=' ? a === b : op === '<' ? a < b : op === '<=' ? a <= b
    : op === '>' ? a > b : op === '>=' ? a >= b : null;
  if (r === null) throw new Error(`unknown comparison operator ${op}`);
  return { tag: 'bool', b: r };
}

function asPtr(v: VmValue): number {
  if (v.tag !== 'ptr') throw new Error(`expected a heap pointer, got ${v.tag}`);
  return v.addr;
}

function invoke(m: Machine, closVal: VmValue, argVal: VmValue): VmValue {
  const rec = m.heap[asPtr(closVal)];
  const codeField = rec.fields[CLOS_CODE];
  if (codeField.tag !== 'code') throw new Error('CallClos on a non-closure record');
  return runFunc(m, codeField.code, rec.fields[CLOS_ENV], argVal);
}

function force(m: Machine, v: VmValue): VmValue {
  if (v.tag !== 'ptr') return v; // literal → identity
  const rec = m.heap[v.addr];
  const codeField = rec.fields[CLOS_CODE];
  if (codeField.tag !== 'code') return v;
  // Nullary code (arity 0) ⇒ a genuine thunk ⇒ invoke; unary ⇒ closure value ⇒ identity.
  if (m.prog.functions[codeField.code].arity === 0) return runFunc(m, codeField.code, rec.fields[CLOS_ENV], undefined);
  return v;
}

function runFunc(m: Machine, codeIx: number, envVal: VmValue, argVal: VmValue | undefined): VmValue {
  const entry = m.prog.functions[codeIx];
  const regs: VmValue[] = new Array<VmValue>(entry.regCount).fill({ tag: 'null' });
  const slots: VmValue[] = new Array<VmValue>(entry.slotCount).fill({ tag: 'null' });
  regs[0] = envVal;
  if (argVal !== undefined) regs[1] = argVal;
  let pc = entry.entry;
  for (;;) {
    if (++m.steps > MAX_STEPS) throw new Error('VM interpreter step budget exceeded');
    const ins = m.prog.code[pc];
    switch (ins.op) {
      case 'Const': regs[ins.dst] = m.prog.constants[ins.k]; pc++; break;
      case 'Move': regs[ins.dst] = regs[ins.src]; pc++; break;
      case 'Bin': regs[ins.dst] = foldBin(ins.opKind, ins.prim, regs[ins.left], regs[ins.right], m); pc++; break;
      case 'Alloc': {
        const addr = m.heap.length;
        m.heap.push({ fields: new Array<VmValue>(ins.size).fill({ tag: 'null' }) });
        regs[ins.dst] = { tag: 'ptr', addr };
        pc++;
        break;
      }
      case 'Load': regs[ins.dst] = m.heap[asPtr(regs[ins.base])].fields[ins.off]; pc++; break;
      case 'Store': m.heap[asPtr(regs[ins.base])].fields[ins.off] = regs[ins.src]; pc++; break;
      case 'LoadCode': regs[ins.dst] = { tag: 'code', code: ins.code }; pc++; break;
      case 'CallClos': regs[ins.dst] = invoke(m, regs[ins.clos], regs[ins.arg]); pc++; break;
      case 'TailCallClos': return invoke(m, regs[ins.clos], regs[ins.arg]);
      case 'Force': regs[ins.dst] = force(m, regs[ins.thunk]); pc++; break;
      case 'TailForce': return force(m, regs[ins.thunk]);
      case 'Ret': return regs[ins.src];
      case 'Jmp': pc += ins.target; break;
      case 'JmpIf': {
        const c = regs[ins.cond];
        if (c.tag !== 'bool') throw new Error('JmpIf on a non-boolean');
        pc = c.b ? pc + ins.target : pc + 1;
        break;
      }
      case 'Spill': slots[ins.slot] = regs[ins.src]; pc++; break;
      case 'Reload': regs[ins.dst] = slots[ins.slot]; pc++; break;
    }
  }
}

function formatVal(v: VmValue): string {
  if (v.tag === 'int') return Number.isInteger(v.n) ? String(v.n) : String(Number(v.n.toFixed(6)));
  if (v.tag === 'bool') return v.b ? 'true' : 'false';
  return 'function';
}

function runVm(prog: VmProgram): { value: string; fired: string[] } {
  const m: Machine = { prog, heap: [], fired: [], steps: 0 };
  const result = runFunc(m, prog.entry, { tag: 'null' }, undefined);
  return { value: formatVal(result), fired: m.fired };
}

/* ---------------------------------------------------------- structural helpers */

/** The instruction slice belonging to one code-table entry. */
function codeOf(prog: VmProgram, index: number): Instr[] {
  const start = prog.functions[index].entry;
  const end = index + 1 < prog.functions.length ? prog.functions[index + 1].entry : prog.code.length;
  return prog.code.slice(start, end);
}
function opsIn(instrs: Instr[]): Set<string> {
  return new Set(instrs.map((i) => i.op));
}
function findEntry(prog: VmProgram, pred: (e: CodeEntry) => boolean): number {
  return prog.functions.findIndex(pred);
}

/** Every function's register file fits the ABI (regCount ≤ REG_COUNT); every
 *  const/code index and jump target resolves. A cheap well-formedness net. */
function wellFormed(prog: VmProgram): string[] {
  const errs: string[] = [];
  for (const f of prog.functions) {
    if (f.regCount > REG_COUNT) errs.push(`${f.label}: regCount ${f.regCount} > ${REG_COUNT}`);
    if (f.entry < 0 || f.entry > prog.code.length) errs.push(`${f.label}: entry ${f.entry} out of range`);
  }
  prog.code.forEach((ins, i) => {
    if (ins.op === 'Const' && (ins.k < 0 || ins.k >= prog.constants.length)) errs.push(`#${i}: const ix ${ins.k} out of range`);
    if (ins.op === 'LoadCode' && (ins.code < 0 || ins.code >= prog.functions.length)) errs.push(`#${i}: code ix ${ins.code} out of range`);
    if ((ins.op === 'Jmp' || ins.op === 'JmpIf') && (i + ins.target < 0 || i + ins.target >= prog.code.length)) {
      errs.push(`#${i}: jump target ${i + ins.target} out of range`);
    }
  });
  return errs;
}

/* -------------------------------------------------------------- cases */
/* Same corpus as tests/cfg.ts, plus a tail-force-shaped source. */

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
    for (const kind of ['structure', 'value'] as ReductionKind[]) {
      const prog = asmOf(workspace, block, kind);
      const got = runVm(prog);
      const expected = computeReductionRun(block, kind).finalValue;
      check(`${c.name} · asm ${kind} value matches substitution`, got.value === expected,
        `asm got ${JSON.stringify(got.value)}, substitution expected ${JSON.stringify(expected)}`);
      const wf = wellFormed(prog);
      check(`${c.name} · asm ${kind} is well-formed`, wf.length === 0, wf.join('; '));
    }
  });
}

// The duplicated-work signature carries through register allocation unchanged.
withProgram('(\\x. x + x) (3 * 7)', (workspace, block) => {
  const muls = (ops: string[]): number => ops.filter((op) => op === '*').length;
  check('duplicated work · CbS asm fires two `*`', muls(runVm(asmOf(workspace, block, 'structure')).fired) === 2);
  check('shared work · CbV asm fires one `*`', muls(runVm(asmOf(workspace, block, 'value')).fired) === 1);
});

/* ------------------------------------ factorial-CbV shape gate (the 3.4 GATE) */

withProgram('letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5', (workspace, block) => {
  const prog = asmOf(workspace, block, 'value');
  check('factorial · CbV asm computes 120', runVm(prog).value === '120');

  const facIx = findEntry(prog, (e) => e.arity === 1);
  check('factorial · CbV has exactly one closure function', prog.functions.filter((e) => e.arity === 1).length === 1);
  if (facIx >= 0) {
    const fac = prog.functions[facIx];
    const ops = opsIn(codeOf(prog, facIx));
    check('factorial · CbV code branches (JmpIf), allocates (Alloc) and calls (CallClos)',
      ops.has('JmpIf') && ops.has('Alloc') && ops.has('CallClos'),
      `ops=${[...ops].join(',')}`);
    check('factorial · CbV needs no spill slots', fac.slotCount === 0, `slotCount=${fac.slotCount}`);
    check('factorial · CbV register file is small', fac.regCount <= REG_COUNT, `regCount=${fac.regCount}`);
  }
});

/* -------------------------- spill teeth: a hand-built high-pressure function */

// main: const v0..v11, then a left-folded sum. All 12 values are live at the
// first add, so pressure (12) exceeds REG_COUNT (8) and the allocator MUST spill.
{
  const instrs: CfgProgram['main']['blocks'][number]['instrs'] = [];
  for (let i = 0; i < 12; i++) instrs.push({ kind: 'const', dst: { id: i }, value: i + 1 });
  let cur = { id: 0 };
  let next = 12;
  for (let i = 1; i < 12; i++) {
    const d = { id: next++ };
    instrs.push({ kind: 'bin', dst: d, opKind: 'num', op: '+', left: cur, right: { id: i } });
    cur = d;
  }
  const main: CfgFunc = {
    label: 'main', kind: 'main', entry: 'b0',
    blocks: [{ id: 'b0', params: [], instrs, terminator: { kind: 'ret', value: cur } }]
  };
  const prog = selectAndAllocate({ strategy: 'value', functions: [], main });
  const mainEntry = prog.functions.find((e) => e.label === 'main')!;
  const ops = opsIn(codeOf(prog, prog.functions.indexOf(mainEntry)));
  check('spill · high pressure forces spill slots', mainEntry.slotCount > 0, `slotCount=${mainEntry.slotCount}`);
  check('spill · emits Spill and Reload', ops.has('Spill') && ops.has('Reload'), `ops=${[...ops].join(',')}`);
  check('spill · register file stays within REG_COUNT', mainEntry.regCount <= REG_COUNT, `regCount=${mainEntry.regCount}`);
  check('spill · still computes sum 1..12 = 78', runVm(prog).value === '78', runVm(prog).value);
  check('spill · well-formed', wellFormed(prog).length === 0, wellFormed(prog).join('; '));
}

/* --------------------------- tail-force teeth: a hand-built tail `force` */

// main builds a nullary-closure (thunk) that returns 42, then forces it in tail
// position (`force d, pair; ret d`) — which must peephole to a `TailForce`.
{
  const thunk: CfgFunc = {
    label: 'tf_thunk', kind: 'thunk', env: { id: 0 }, entry: 'b0',
    blocks: [{ id: 'b0', params: [], instrs: [{ kind: 'const', dst: { id: 1 }, value: 42 }], terminator: { kind: 'ret', value: { id: 1 } } }]
  };
  const main: CfgFunc = {
    label: 'main', kind: 'main', entry: 'b0',
    blocks: [{
      id: 'b0', params: [],
      instrs: [
        { kind: 'loadcode', dst: { id: 0 }, label: 'tf_thunk' },
        { kind: 'const', dst: { id: 1 }, value: null },
        { kind: 'alloc', dst: { id: 2 }, size: 2 },
        { kind: 'store', base: { id: 2 }, index: CLOS_CODE, src: { id: 0 } },
        { kind: 'store', base: { id: 2 }, index: CLOS_ENV, src: { id: 1 } },
        { kind: 'force', dst: { id: 3 }, src: { id: 2 } }
      ],
      terminator: { kind: 'ret', value: { id: 3 } }
    }]
  };
  const prog = selectAndAllocate({ strategy: 'value', functions: [thunk], main });
  const mainIx = prog.functions.findIndex((e) => e.label === 'main');
  const ops = opsIn(codeOf(prog, mainIx));
  check('tail-force · force+ret peepholes to TailForce', ops.has('TailForce') && !ops.has('Ret'), `ops=${[...ops].join(',')}`);
  check('tail-force · invokes the thunk (→ 42)', runVm(prog).value === '42', runVm(prog).value);
}

/* --------------------------------------------- every shipped example */

for (const id of Object.keys(LAMBDA_EXAMPLES) as (keyof typeof LAMBDA_EXAMPLES)[]) {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(LAMBDA_EXAMPLES[id].workspace as never, workspace);
  const block = pickProgramBlock(workspace)!;
  for (const kind of ['structure', 'value'] as ReductionKind[]) {
    const prog = asmOf(workspace, block, kind);
    const got = runVm(prog);
    const expected = computeReductionRun(block, kind).finalValue;
    check(`example ${id} · asm ${kind} value matches substitution`, got.value === expected,
      `asm got ${JSON.stringify(got.value)}, substitution expected ${JSON.stringify(expected)}`);
    check(`example ${id} · asm ${kind} is well-formed`, wellFormed(prog).length === 0, wellFormed(prog).join('; '));
  }
  workspace.dispose();
}

console.log(failures === 0
  ? `All ${checks} asm checks passed.`
  : `${failures}/${checks} asm checks FAILED.`);
if (failures > 0) process.exitCode = 1;
