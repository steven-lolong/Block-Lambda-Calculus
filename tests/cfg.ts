/**
 * Correctness tests for CFG construction (src/core/ir/toCfg.ts, step 3.2).
 *
 * Central invariant (extends tests/fir.ts one stage lower): a tiny CFG
 * interpreter — basic blocks over virtual registers, an explicit heap of
 * records, the two-object closure layout, and the explicit calling convention —
 * run over `toCfg(toFir(...))`, must reach the same final value as the
 * substitution stepper (computeReductionRun), for every pinned case and every
 * shipped example, under BOTH strategies. So substitution ⇄ … ⇄ FIR ⇄ CFG all
 * agree, and the duplicated-work signature (CbS fires `*` twice, CbV once)
 * survives lowering to explicit control flow + heap.
 *
 * The interpreter is the operational contract the register VM (3.5) must also
 * satisfy. Two details it pins down:
 *   - `force` on a genuine thunk (nullary code) invokes it; `force` on a
 *     closure *value* (unary code — e.g. a lambda passed as a call-by-structure
 *     argument) or a literal is the identity. The discriminator is the code's
 *     arity, i.e. `CfgFunc.kind === 'thunk'` — no heap tagging needed.
 *   - a recursive `letrec` thunk works only because the pair is allocated and
 *     the name bound before its (self-referential) env tuple is stored.
 *
 * Also checks a structural invariant: every `loadcode` label resolves to a real
 * function-table entry (no dangling code pointers after lowering).
 *
 * Run with: npm run test:cfg
 */
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { LAMBDA_EXAMPLES } from '../src/core/examples/lambdaExamples';
import { parseLambdaTextToWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { inferLambdaWorkspaceTypes } from '../src/core/type-inference/lambdaTypeInference';
import { blockToTerm, computeReductionRun, type ReductionKind } from '../src/core/semantics/lambdaReduction';
import { pickProgramBlock } from '../src/core/machine/csekMachine';
import { desugar, makeTypeLookup, toAnfProgram, toFir, toCfg } from '../src/core/ir';
import { CLOS_CODE, CLOS_ENV } from '../src/core/ir/isa';
import type { BasicBlock, CfgFunc, CfgInstr, CfgProgram } from '../src/core/ir/lir';
import type { Label } from '../src/core/ir/fir';

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

function cfgOf(workspace: Blockly.Workspace, block: Blockly.Block, kind: ReductionKind): CfgProgram {
  const report = inferLambdaWorkspaceTypes(workspace);
  const core = desugar(blockToTerm(block), makeTypeLookup(report));
  return toCfg(toFir(toAnfProgram(core, kind)));
}

/* --------------------------------------------------- tiny CFG interpreter */

type Val =
  | { tag: 'num'; n: number }
  | { tag: 'bool'; b: boolean }
  | { tag: 'ptr'; addr: number }
  | { tag: 'code'; label: Label }
  | { tag: 'null' };

interface Rec { fields: Val[] }

interface Machine {
  heap: Rec[];
  table: Map<Label, CfgFunc>;
  fired: string[];
  steps: number;
}

const MAX_STEPS = 5_000_000;

function toVal(v: number | boolean | null): Val {
  if (v === null) return { tag: 'null' };
  return typeof v === 'boolean' ? { tag: 'bool', b: v } : { tag: 'num', n: v };
}

function asPtr(v: Val): number {
  if (v.tag !== 'ptr') throw new Error(`expected a heap pointer, got ${v.tag}`);
  return v.addr;
}

function foldBin(opKind: string, op: string, left: Val, right: Val, m: Machine): Val {
  m.fired.push(op);
  if (opKind === 'num') {
    if (left.tag !== 'num' || right.tag !== 'num') throw new Error('arithmetic expects numbers');
    const a = left.n;
    const b = right.n;
    const n = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b
      : op === '/' ? (b === 0 ? 0 : Math.trunc(a / b)) : null;
    if (n === null) throw new Error(`unknown arithmetic operator ${op}`);
    return { tag: 'num', n };
  }
  if (opKind === 'bool') {
    if (left.tag !== 'bool' || right.tag !== 'bool') throw new Error('boolean operator expects booleans');
    const b = op === 'and' ? left.b && right.b : op === 'or' ? left.b || right.b
      : op === 'equal' ? left.b === right.b : null;
    if (b === null) throw new Error(`unknown boolean operator ${op}`);
    return { tag: 'bool', b };
  }
  if (left.tag !== 'num' || right.tag !== 'num') throw new Error('comparison expects numbers');
  const a = left.n;
  const b = right.n;
  const r = op === '=' ? a === b : op === '<' ? a < b : op === '<=' ? a <= b
    : op === '>' ? a > b : op === '>=' ? a >= b : null;
  if (r === null) throw new Error(`unknown comparison operator ${op}`);
  return { tag: 'bool', b: r };
}

function invokeClosure(closVal: Val, argVal: Val, m: Machine): Val {
  const rec = m.heap[asPtr(closVal)];
  const code = rec.fields[CLOS_CODE];
  if (code.tag !== 'code') throw new Error('callclos on a non-closure record');
  const func = m.table.get(code.label);
  if (!func) throw new Error(`dangling code label '${code.label}'`);
  return evalFunc(func, rec.fields[CLOS_ENV], argVal, m);
}

function forceVal(v: Val, m: Machine): Val {
  if (v.tag !== 'ptr') return v; // literal → identity
  const rec = m.heap[v.addr];
  const code = rec.fields[CLOS_CODE];
  if (code.tag !== 'code') return v;
  const func = m.table.get(code.label);
  // Nullary code ⇒ a genuine thunk ⇒ invoke; unary code ⇒ a closure value ⇒ identity.
  if (func && func.kind === 'thunk') return evalFunc(func, rec.fields[CLOS_ENV], undefined, m);
  return v;
}

function execInstr(ins: CfgInstr, regs: Map<number, Val>, m: Machine): void {
  if (++m.steps > MAX_STEPS) throw new Error('CFG interpreter step budget exceeded');
  const get = (r: { id: number }): Val => {
    const v = regs.get(r.id);
    if (v === undefined) throw new Error(`read of unset vreg %${r.id}`);
    return v;
  };
  switch (ins.kind) {
    case 'const': regs.set(ins.dst.id, toVal(ins.value)); return;
    case 'bin': regs.set(ins.dst.id, foldBin(ins.opKind, ins.op, get(ins.left), get(ins.right), m)); return;
    case 'move': regs.set(ins.dst.id, get(ins.src)); return;
    case 'alloc': {
      const addr = m.heap.length;
      m.heap.push({ fields: new Array<Val>(ins.size).fill({ tag: 'null' }) });
      regs.set(ins.dst.id, { tag: 'ptr', addr });
      return;
    }
    case 'load': regs.set(ins.dst.id, m.heap[asPtr(get(ins.base))].fields[ins.index]); return;
    case 'store': m.heap[asPtr(get(ins.base))].fields[ins.index] = get(ins.src); return;
    case 'loadcode': regs.set(ins.dst.id, { tag: 'code', label: ins.label }); return;
    case 'callclos': regs.set(ins.dst.id, invokeClosure(get(ins.clos), get(ins.arg), m)); return;
    case 'force': regs.set(ins.dst.id, forceVal(get(ins.src), m)); return;
  }
}

function evalFunc(func: CfgFunc, envVal: Val, argVal: Val | undefined, m: Machine): Val {
  const regs = new Map<number, Val>();
  if (func.env) regs.set(func.env.id, envVal);
  if (func.param && argVal !== undefined) regs.set(func.param.id, argVal);
  const blocks = new Map<string, BasicBlock>(func.blocks.map((bl) => [bl.id, bl]));
  const get = (r: { id: number }): Val => {
    const v = regs.get(r.id);
    if (v === undefined) throw new Error(`read of unset vreg %${r.id}`);
    return v;
  };

  let blockId = func.entry;
  for (;;) {
    const bl = blocks.get(blockId);
    if (!bl) throw new Error(`no such block ${blockId}`);
    for (const ins of bl.instrs) execInstr(ins, regs, m);
    const t = bl.terminator;
    switch (t.kind) {
      case 'ret':
        return get(t.value);
      case 'tailcallclos':
        return invokeClosure(get(t.clos), get(t.arg), m);
      case 'condbr': {
        const c = get(t.cond);
        if (c.tag !== 'bool') throw new Error('condbr on a non-boolean');
        blockId = c.b ? t.then : t.else;
        continue;
      }
      case 'br': {
        const args = t.args.map(get);
        blockId = t.target;
        const target = blocks.get(blockId);
        if (!target) throw new Error(`no such block ${blockId}`);
        target.params.forEach((pp, i) => regs.set(pp.id, args[i]));
        continue;
      }
    }
  }
}

function formatVal(v: Val): string {
  if (v.tag === 'num') return Number.isInteger(v.n) ? String(v.n) : String(Number(v.n.toFixed(6)));
  if (v.tag === 'bool') return v.b ? 'true' : 'false';
  return 'function';
}

function runCfg(prog: CfgProgram): { value: string; fired: string[] } {
  const m: Machine = { heap: [], table: new Map(prog.functions.map((f) => [f.label, f])), fired: [], steps: 0 };
  const result = evalFunc(prog.main, { tag: 'null' }, undefined, m);
  return { value: formatVal(result), fired: m.fired };
}

/* ------------------------------------------------- structural invariant */

function danglingLabels(prog: CfgProgram): string[] {
  const known = new Set(prog.functions.map((f) => f.label));
  const missing: string[] = [];
  const scan = (fn: CfgFunc): void => {
    for (const bl of fn.blocks) {
      for (const ins of bl.instrs) {
        if (ins.kind === 'loadcode' && !known.has(ins.label)) missing.push(ins.label);
      }
    }
  };
  prog.functions.forEach(scan);
  scan(prog.main);
  return missing;
}

/* -------------------------------------------------------------- cases */
/* Same corpus as tests/fir.ts / tests/closure.ts / tests/anf.ts. */

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
  { name: 'compose', source: '(\\f. \\g. \\x. f (g x)) (\\y. y + 1) (\\z. z * 2) 5' },
  { name: 'letrec_factorial', source: 'letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5' }
];

for (const c of CASES) {
  withProgram(c.source, (workspace, block) => {
    for (const kind of ['structure', 'value'] as ReductionKind[]) {
      const prog = cfgOf(workspace, block, kind);
      const got = runCfg(prog);
      const expected = computeReductionRun(block, kind).finalValue;
      check(`${c.name} · CFG ${kind} value matches substitution`, got.value === expected,
        `CFG got ${JSON.stringify(got.value)}, substitution expected ${JSON.stringify(expected)}`);
      check(`${c.name} · CFG ${kind} has no dangling code labels`, danglingLabels(prog).length === 0,
        JSON.stringify(danglingLabels(prog)));
    }
  });
}

// The duplicated-work signature carries through to the CFG unchanged.
withProgram('(\\x. x + x) (3 * 7)', (workspace, block) => {
  const muls = (ops: string[]): number => ops.filter((op) => op === '*').length;
  check('duplicated work · CbS CFG fires two `*`', muls(runCfg(cfgOf(workspace, block, 'structure')).fired) === 2);
  check('shared work · CbV CFG fires one `*`', muls(runCfg(cfgOf(workspace, block, 'value')).fired) === 1);
});

/* ---------------------------------------- factorial design note (Decision 2) */

withProgram('letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5', (workspace, block) => {
  const cbv = cfgOf(workspace, block, 'value');
  check('factorial · CbV lowers to one closure function (empty env, recursion via label)',
    cbv.functions.filter((f) => f.kind === 'closure').length === 1,
    `closures=${cbv.functions.filter((f) => f.kind === 'closure').length}`);
  check('factorial · CbV has no thunks (call-by-value)', cbv.functions.every((f) => f.kind !== 'thunk'));
  check('factorial · CbV result is 120', runCfg(cbv).value === '120');

  const cbs = cfgOf(workspace, block, 'structure');
  check('factorial · CbS lifts a recursive thunk', cbs.functions.some((f) => f.kind === 'thunk'));
  check('factorial · CbS result is 120', runCfg(cbs).value === '120');
});

/* --------------------------------------------- every shipped example */

for (const id of Object.keys(LAMBDA_EXAMPLES) as (keyof typeof LAMBDA_EXAMPLES)[]) {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(LAMBDA_EXAMPLES[id].workspace as never, workspace);
  const block = pickProgramBlock(workspace)!;
  for (const kind of ['structure', 'value'] as ReductionKind[]) {
    const prog = cfgOf(workspace, block, kind);
    const got = runCfg(prog);
    const expected = computeReductionRun(block, kind).finalValue;
    check(`example ${id} · CFG ${kind} value matches substitution`, got.value === expected,
      `CFG got ${JSON.stringify(got.value)}, substitution expected ${JSON.stringify(expected)}`);
    check(`example ${id} · CFG ${kind} has no dangling code labels`, danglingLabels(prog).length === 0);
  }
  workspace.dispose();
}

console.log(failures === 0
  ? `All ${checks} CFG checks passed.`
  : `${failures}/${checks} CFG checks FAILED.`);
if (failures > 0) process.exitCode = 1;
