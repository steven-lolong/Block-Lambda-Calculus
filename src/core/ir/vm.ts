/**
 * Register-bytecode VM: state (step 3.1) + the interpreter (step 3.5).
 * `VmState` deliberately mirrors `CsekState` in ../machine/csekMachine.ts, and
 * `stepVm` mirrors `stepCsekMachine`'s exact shape — guard on `status`, clone
 * `previous` with its mutable arrays freshly sliced and the per-step counters
 * bumped, dispatch inside a try/catch that turns any thrown error into a
 * `stuck` state — so the machinery already built around the CSEK machine (a
 * pure `step`, a history stack for exact Back, the `focusBlockId` canvas
 * highlight, the salient-rule correspondence the Lockstep view aligns on) is
 * reused one level lower rather than rebuilt.
 *
 * The one thing the source machine did not need is a heap, and it is the reason
 * purity takes real discipline here: a step that `Alloc`s or `Store`s must
 * produce a *new* `heap` (array *and* the one written `HeapRecord` inside it) —
 * the previous snapshot's array and every record it points at are left
 * completely untouched, never mutated in place — so a history stack still
 * gives exact time travel *including heap state*, which a mutating VM would
 * lose. The same discipline applies to `frames`: every step re-slices the
 * frame stack and replaces only the one or two `Frame` objects it actually
 * writes (fresh `regs`/`slots` arrays), so no in-place mutation can leak
 * backward into an already-returned snapshot. `syncCount` counts the salient
 * ops (see `isSalientOp`), the counter the Lockstep view aligns against CSEK's
 * `isSalientRule`.
 */
import type { ReductionKind } from './anf';
import type { CodeIx, Instr, Op, Reg, Slot, VmProgram, VmValue } from './isa';
import { CLOS_CODE, CLOS_ENV } from './isa';
import type { PrimOpKind } from './core';

/** A heap record. `kind` is for the heap inspector only; the VM reads `fields`.
 *  A closure/thunk is a 2-field pair (`[code, env]`); an env tuple is n fields. */
export interface HeapRecord {
  kind: 'closure' | 'thunk' | 'env';
  fields: VmValue[];
  /** Provenance of the alloc site (the originating block). */
  sourceId?: string;
}

/**
 * One activation frame. Each frame owns its register file and spill slots
 * (per-frame isolation), plus the return linkage: where in the caller's frame
 * the result goes (`retReg`), where to resume (`retPc`), and which frame that
 * is (`retFrame`, `-1` at `main`). A `TailCallClos`/`TailForce` overwrites the
 * current frame while inheriting this linkage, so tail recursion is O(1) stack.
 */
export interface Frame {
  code: CodeIx;
  pc: number;
  regs: VmValue[];
  slots: VmValue[];
  retReg: Reg;
  retPc: number;
  retFrame: number;
  sourceId?: string;
}

export interface VmState {
  strategy: ReductionKind;
  frames: Frame[];
  heap: HeapRecord[];
  status: 'running' | 'done' | 'error';
  error: string | null;
  result: VmValue | null;
  stepCount: number;
  /** Count of salient ops so far — the Lockstep bridge aligns this with CSEK. */
  syncCount: number;
  lastOp: Op | 'halt' | 'stuck' | null;
  /** Provenance of the current instruction — drives the canvas highlight. */
  focusBlockId: string | null;
}

/* ====================================================================== */
/*  Interpreter (step 3.5)                                                 */
/* ====================================================================== */

const NULL_VALUE: VmValue = { tag: 'null' };
/** Frame-depth guard, mirroring csekMachine's `MAX_KONT` continuation guard —
 *  catches a runaway non-tail recursion rather than exhausting the host stack
 *  (frames live in a plain array, so JS recursion depth is not the limit; this
 *  bound exists to fail predictably instead of exhausting host memory). */
const MAX_FRAMES = 10000;

/** A fresh running state entered at `prog.entry` (`main`), one frame, empty
 *  heap — the `injectCsekMachine` analogue. */
export function injectVm(prog: VmProgram): VmState {
  const entry = prog.functions[prog.entry];
  const frame: Frame = {
    code: prog.entry,
    pc: entry.entry,
    regs: new Array<VmValue>(entry.regCount).fill(NULL_VALUE),
    slots: new Array<VmValue>(entry.slotCount).fill(NULL_VALUE),
    retReg: 0,
    retPc: 0,
    retFrame: -1 // no caller — popping this frame halts the program
  };
  return {
    strategy: prog.strategy,
    frames: [frame],
    heap: [],
    status: 'running',
    error: null,
    result: null,
    stepCount: 0,
    syncCount: 0,
    lastOp: null,
    focusBlockId: null
  };
}

/**
 * The ops that must line up 1:1 with CSEK's `isSalientRule`, so `syncCount`
 * tracks the same events the Lockstep bridge (3.7) counts on the CSEK side:
 * `CallClos`/`TailCallClos` ≈ beta (every closure entry, tail or not); `JmpIf`
 * ≈ if-true/if-false (every branch decision, whichever way it goes); `Bin` ≈
 * `prim *` (every successful primitive fold).
 *
 * `Force`/`TailForce` are deliberately **not** salient — this corrects the 3.1
 * sketch, which guessed "Force/TailForce ≈ beta". Tracing the duplicated-work
 * example `(\x. x + x) (3 * 7)` under call-by-structure against the *actual*
 * shipped `csekMachine.ts` shows why: CSEK's own thunk-lookup rule is
 * `'lookup'`, which `isSalientRule` explicitly excludes — forcing a thunk is
 * bookkeeping, not its own reduction event, regardless of whether the thunk
 * turns out to hold a genuine suspension (arity 0, gets invoked) or a value
 * being forced as a no-op (arity 1, identity). CSEK fires exactly 1 beta + 2
 * `prim *` + 1 `prim +` = 4 salient events for that program (one beta to bind
 * the thunk, two non-salient lookups that each re-run the suspended `3 * 7`
 * — each contributing its own salient `prim *` — then the final `prim +`).
 * The VM must fire the same 4: 1 CallClos + 2 Bin(`*`) + 1 Bin(`+`), with
 * both Force-invokes of the argument thunk contributing 0, exactly like
 * CSEK's two non-salient lookups. Counting Force itself would double the
 * `*` contribution per occurrence and break the alignment `tests/vm.ts`
 * checks for.
 */
export function isSalientOp(op: Op | 'halt' | 'stuck' | null): boolean {
  return op === 'CallClos' || op === 'TailCallClos' || op === 'JmpIf' || op === 'Bin';
}

/** Matches `formatMachineValue` so final values compare as text (3.7). A
 *  closure/thunk pointer, a bare code value, and `null` all print as
 *  `'function'` — mirrors `formatMachineValue`'s `Closure -> 'function'`; none
 *  of these should ever be the natural final result of a well-typed program,
 *  but the mapping stays total rather than partial. */
export function formatVmValue(v: VmValue): string {
  switch (v.tag) {
    case 'int':
      return Number.isInteger(v.n) ? String(v.n) : String(Number(v.n.toFixed(6)));
    case 'bool':
      return v.b ? 'true' : 'false';
    case 'ptr':
    case 'code':
    case 'null':
      return 'function';
  }
}

/** Mirrors `foldBinary`/`computePrimitive` exactly (including truncating `/`
 *  toward zero and the div-by-zero guard). */
function foldVmBinary(opKind: PrimOpKind, op: string, left: VmValue, right: VmValue): VmValue {
  if (opKind === 'num') {
    if (left.tag !== 'int' || right.tag !== 'int') throw new Error('arithmetic expects int operands');
    const a = left.n;
    const b = right.n;
    const n = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b
      : op === '/' ? (b === 0 ? 0 : Math.trunc(a / b)) : null;
    if (n === null) throw new Error(`unknown arithmetic operator '${op}'`);
    return { tag: 'int', n };
  }
  if (opKind === 'bool') {
    if (left.tag !== 'bool' || right.tag !== 'bool') throw new Error('boolean operator expects bool operands');
    const b = op === 'and' ? left.b && right.b : op === 'or' ? left.b || right.b : op === 'equal' ? left.b === right.b : null;
    if (b === null) throw new Error(`unknown boolean operator '${op}'`);
    return { tag: 'bool', b };
  }
  if (left.tag !== 'int' || right.tag !== 'int') throw new Error('comparison expects int operands');
  const a = left.n;
  const b = right.n;
  const r = op === '=' ? a === b : op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : null;
  if (r === null) throw new Error(`unknown comparison operator '${op}'`);
  return { tag: 'bool', b: r };
}

/** Resolve a closure/thunk pointer to its code index and captured env value —
 *  shared by `CallClos`, `TailCallClos`, `Force`, `TailForce`. */
function resolveClosure(heap: VmState['heap'], v: VmValue): { codeIx: CodeIx; envVal: VmValue } {
  if (v.tag !== 'ptr') throw new Error(`closure-invoke on a non-pointer value (${v.tag})`);
  const rec = heap[v.addr];
  if (!rec) throw new Error(`closure-invoke on a dangling pointer ${v.addr}`);
  const code = rec.fields[CLOS_CODE];
  if (code.tag !== 'code') throw new Error('closure-invoke on a record with no code pointer');
  return { codeIx: code.code, envVal: rec.fields[CLOS_ENV] };
}

/** Push a new activation frame for `codeIx`, mutating `state.frames` (already
 *  a fresh array for this step) in place — safe, since the pushed `Frame` is a
 *  wholly new object. Entry ABI: r0 = env, r1 = arg (only when `arity===1`). */
function enterFrame(
  prog: VmProgram, state: VmState, codeIx: CodeIx, envVal: VmValue, argVal: VmValue | null,
  retReg: Reg, retPc: number, retFrame: number, sourceId: string | undefined
): void {
  const entry = prog.functions[codeIx];
  if (!entry) throw new Error(`enter: unknown code index ${codeIx}`);
  const regs = new Array<VmValue>(entry.regCount).fill(NULL_VALUE);
  regs[0] = envVal;
  if (entry.arity === 1 && argVal !== null) regs[1] = argVal;
  state.frames.push({
    code: codeIx,
    pc: entry.entry,
    regs,
    slots: new Array<VmValue>(entry.slotCount).fill(NULL_VALUE),
    retReg,
    retPc,
    retFrame,
    sourceId
  });
}

/** Pop the frame at `idx` and deliver `v` to its caller — or, if it had none
 *  (`retFrame === -1`), halt the program with `v` as the result. Shared by
 *  `Ret` and the identity branch of `TailForce`. */
function doReturn(state: VmState, idx: number, v: VmValue): VmState {
  const cur = state.frames[idx];
  state.frames.pop();
  if (cur.retFrame === -1) {
    state.status = 'done';
    state.result = v;
    state.lastOp = 'halt';
    state.focusBlockId = null;
    return state;
  }
  const caller = state.frames[cur.retFrame];
  const regs = caller.regs.slice();
  regs[cur.retReg] = v;
  state.frames[cur.retFrame] = { ...caller, pc: cur.retPc, regs };
  return state;
}

function stuck(state: VmState, message: string): VmState {
  state.status = 'error';
  state.error = message;
  state.lastOp = 'stuck';
  return state;
}

/** Execute exactly one instruction from the current top frame, mutating the
 *  already-fresh `state` (frames/heap arrays sliced by `stepVm`) in place and
 *  returning it — mirrors `stepEval`/`stepValue`'s style in csekMachine.ts. */
function execOne(prog: VmProgram, state: VmState): VmState {
  const idx = state.frames.length - 1;
  const frame = state.frames[idx];
  const ins: Instr | undefined = prog.code[frame.pc];
  if (!ins) throw new Error(`program counter ${frame.pc} out of range in code ${frame.code}`);

  state.focusBlockId = ins.sourceId ?? null;
  state.lastOp = ins.op;
  if (isSalientOp(ins.op)) state.syncCount += 1;

  const reg = (r: Reg): VmValue => frame.regs[r];
  const writeReg = (r: Reg, v: VmValue): VmState => {
    const regs = frame.regs.slice();
    regs[r] = v;
    state.frames[idx] = { ...frame, regs, pc: frame.pc + 1 };
    return state;
  };
  const writeSlot = (s: Slot, v: VmValue): VmState => {
    const slots = frame.slots.slice();
    slots[s] = v;
    state.frames[idx] = { ...frame, slots, pc: frame.pc + 1 };
    return state;
  };
  const advance = (): VmState => {
    state.frames[idx] = { ...frame, pc: frame.pc + 1 };
    return state;
  };
  const jumpTo = (pc: number): VmState => {
    state.frames[idx] = { ...frame, pc };
    return state;
  };
  const allocHeap = (size: number): number => {
    const addr = state.heap.length;
    state.heap.push({ kind: 'env', fields: new Array<VmValue>(size).fill(NULL_VALUE), sourceId: ins.sourceId });
    return addr;
  };
  /** Copy-on-write a single record: a fresh `fields` array, never the old one
   *  mutated in place. Storing a `code` value into slot 0 (`CLOS_CODE`) is the
   *  precise, non-heuristic signal that this record is (becoming) a
   *  closure/thunk pair — its `arity` (0 vs 1) then distinguishes the two — so
   *  a plain env tuple, which never receives a raw `code` value in slot 0,
   *  simply never gets reclassified. */
  const storeHeap = (addr: number, index: number, v: VmValue): void => {
    const old = state.heap[addr];
    if (!old) throw new Error(`store to unallocated heap address ${addr}`);
    const fields = old.fields.slice();
    fields[index] = v;
    const kind = index === CLOS_CODE && v.tag === 'code'
      ? (prog.functions[v.code]?.arity === 0 ? 'thunk' : 'closure')
      : old.kind;
    state.heap[addr] = { ...old, fields, kind };
  };

  switch (ins.op) {
    case 'Const':
      return writeReg(ins.dst, prog.constants[ins.k]);
    case 'Move':
      return writeReg(ins.dst, reg(ins.src));
    case 'Bin':
      return writeReg(ins.dst, foldVmBinary(ins.opKind, ins.prim, reg(ins.left), reg(ins.right)));
    case 'Alloc':
      return writeReg(ins.dst, { tag: 'ptr', addr: allocHeap(ins.size) });
    case 'Load': {
      const base = reg(ins.base);
      if (base.tag !== 'ptr') throw new Error('Load on a non-pointer base');
      const rec = state.heap[base.addr];
      if (!rec) throw new Error(`Load from a dangling pointer ${base.addr}`);
      return writeReg(ins.dst, rec.fields[ins.off]);
    }
    case 'Store': {
      const base = reg(ins.base);
      if (base.tag !== 'ptr') throw new Error('Store to a non-pointer base');
      storeHeap(base.addr, ins.off, reg(ins.src));
      return advance();
    }
    case 'LoadCode':
      return writeReg(ins.dst, { tag: 'code', code: ins.code });
    case 'CallClos': {
      const { codeIx, envVal } = resolveClosure(state.heap, reg(ins.clos));
      enterFrame(prog, state, codeIx, envVal, reg(ins.arg), ins.dst, frame.pc + 1, idx, ins.sourceId);
      return state;
    }
    case 'TailCallClos': {
      const { codeIx, envVal } = resolveClosure(state.heap, reg(ins.clos));
      const argVal = reg(ins.arg);
      const cur = state.frames[idx];
      state.frames.pop();
      enterFrame(prog, state, codeIx, envVal, argVal, cur.retReg, cur.retPc, cur.retFrame, ins.sourceId);
      return state;
    }
    case 'Force': {
      const v = reg(ins.thunk);
      if (v.tag !== 'ptr') return writeReg(ins.dst, v); // literal → identity
      const rec = state.heap[v.addr];
      if (!rec) throw new Error(`Force on a dangling pointer ${v.addr}`);
      const code = rec.fields[CLOS_CODE];
      // Nullary code ⇒ a genuine thunk ⇒ invoke; unary ⇒ a closure value ⇒ identity.
      if (code.tag !== 'code' || prog.functions[code.code]?.arity !== 0) return writeReg(ins.dst, v);
      enterFrame(prog, state, code.code, rec.fields[CLOS_ENV], null, ins.dst, frame.pc + 1, idx, ins.sourceId);
      return state;
    }
    case 'TailForce': {
      const v = reg(ins.thunk);
      if (v.tag !== 'ptr') return doReturn(state, idx, v); // identity, in tail position → just return it
      const rec = state.heap[v.addr];
      if (!rec) throw new Error(`TailForce on a dangling pointer ${v.addr}`);
      const code = rec.fields[CLOS_CODE];
      if (code.tag !== 'code' || prog.functions[code.code]?.arity !== 0) return doReturn(state, idx, v);
      const cur = state.frames[idx];
      state.frames.pop();
      enterFrame(prog, state, code.code, rec.fields[CLOS_ENV], null, cur.retReg, cur.retPc, cur.retFrame, ins.sourceId);
      return state;
    }
    case 'Ret':
      return doReturn(state, idx, reg(ins.src));
    case 'Jmp':
      return jumpTo(frame.pc + ins.target);
    case 'JmpIf': {
      const c = reg(ins.cond);
      if (c.tag !== 'bool') throw new Error('JmpIf on a non-boolean');
      return jumpTo(c.b ? frame.pc + ins.target : frame.pc + 1);
    }
    case 'Spill':
      return writeSlot(ins.slot, reg(ins.src));
    case 'Reload':
      return writeReg(ins.dst, frame.slots[ins.slot]);
  }
}

/**
 * One instruction, pure w.r.t. `previous`: `frames`/`heap` are freshly sliced
 * before dispatch (mirroring `kont: previous.kont.slice()` in
 * `stepCsekMachine`), and `execOne` only ever replaces individual elements of
 * those fresh arrays — a written `Frame`/`HeapRecord` is always a new object,
 * never the old one mutated — so `previous` (and everything reachable from an
 * earlier entry in a caller's history stack) is provably untouched. That is
 * what makes Back exact time travel, including heap state, the one thing the
 * CSEK machine never had to get right.
 */
export function stepVm(prog: VmProgram, previous: VmState): VmState {
  if (previous.status !== 'running') return previous;
  const state: VmState = {
    ...previous,
    frames: previous.frames.slice(),
    heap: previous.heap.slice(),
    stepCount: previous.stepCount + 1,
    lastOp: null
  };
  if (state.frames.length > MAX_FRAMES) return stuck(state, 'call-stack overflow');
  try {
    return execOne(prog, state);
  } catch (error) {
    return stuck(state, error instanceof Error ? error.message : String(error));
  }
}

/** Step to completion or a step budget, like `runCsekMachine`. */
export function runVm(prog: VmProgram, initial: VmState, maxSteps = 200000): VmState {
  let state = initial;
  while (state.status === 'running' && state.stepCount < maxSteps) {
    state = stepVm(prog, state);
  }
  if (state.status === 'running') {
    return { ...state, status: 'error', error: `did not finish within ${maxSteps} steps` };
  }
  return state;
}
