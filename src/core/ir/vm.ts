/**
 * Register-bytecode VM state (step 3.1 data model; the interpreter itself is
 * step 3.5). `VmState` deliberately mirrors `CsekState` in
 * ../machine/csekMachine.ts so the machinery already built around the CSEK
 * machine — a pure `step`, a history stack for exact Back, the `focusBlockId`
 * canvas highlight, and the salient-rule correspondence used by the Lockstep
 * view — is reused one level lower rather than rebuilt.
 *
 * The one thing the source machine did not need is a heap, and it is the reason
 * `stepVm` must stay pure: a step that `Alloc`s or `Store`s produces a *new*
 * `VmState` with a new `heap` (the previous snapshot untouched), so a history
 * stack still gives exact time travel — including heap state — which a mutating
 * VM would lose. `syncCount` counts the salient ops (see `isSalientOp`), the
 * counter the Lockstep view aligns against CSEK's `isSalientRule`.
 *
 * Function signatures fixed here, implemented in 3.5:
 *
 *   injectVm(prog: VmProgram): VmState
 *       — a running state entered at `prog.entry` (main), one frame, empty heap.
 *   stepVm(prog: VmProgram, state: VmState): VmState
 *       — one instruction; pure w.r.t. `state`; returns the successor snapshot.
 *   runVm(prog: VmProgram, initial: VmState, maxSteps?: number): VmState
 *       — step to completion (or a step budget), like `runCsekMachine`.
 *   isSalientOp(op: Op | null): boolean
 *       — CallClos/TailCallClos/Force/TailForce ≈ beta, JmpIf ≈ if-true/false,
 *         Bin ≈ prim: the ops that must line up 1:1 with CSEK's salient rules.
 *   formatVmValue(v: VmValue): string
 *       — matches `formatMachineValue` so final values compare as text (3.7).
 */
import type { ReductionKind } from './anf';
import type { CodeIx, Op, Reg, VmValue } from './isa';

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
