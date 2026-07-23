/**
 * The permanent register-bytecode ISA (step 3.1 data model). This is the
 * committed contract every later stage targets: instruction selection + linear-
 * scan register allocation (3.4) produce a `VmProgram`, the encoder (3.5)
 * serialises it, and the VM (`vm.ts`, 3.5) executes it. Encoded programs and
 * the end-to-end cross-check (3.7) depend on these definitions, so they change
 * only by an explicit ISA version bump.
 *
 * Machine model (see §2–§3 of the 3.1 design):
 *   - a bounded, per-frame register file `r0 … r{REG_COUNT-1}` plus a frame
 *     spill area (`Spill`/`Reload`); per-frame isolation means calls never
 *     clobber the caller, so there is no caller/callee-saved bookkeeping, while
 *     a function with more simultaneously-live values than `REG_COUNT` still
 *     spills — which is what makes 3.4's allocator do real work;
 *   - a heap of records (closure/thunk pairs and env tuples), built by the
 *     primitive `Alloc`/`Store`/`Load` (no fused constructor — recursive
 *     closures need allocate-then-backpatch);
 *   - the two-object closure layout: a closure/thunk is the pair
 *     `[ CLOS_CODE | CLOS_ENV ]`, `CLOS_ENV` pointing at the γ tuple (or `null`
 *     when the environment is empty). `proj(env, i)` is therefore `Load env, i`
 *     with no offset — `env` is the tuple, not the pair.
 *
 * Calling convention: on entry r0 = env pointer, r1 = argument (r1 absent for a
 * thunk's nullary code). Returns are explicit-register (`Ret rSrc`,
 * `CallClos rDst`). Every call is an indirect closure-invoke — even a
 * self-recursive call, which the FIR already lowered to "allocate a fresh
 * closure over the label, then call it".
 */
import type { IRProvenance } from './provenance';
import type { Label } from './fir';
import type { PrimOpKind } from './core';
import type { ReductionKind } from './anf';

/* -------------------------------------------------- permanent layout constants */

/** Closure/thunk pair, slot 0: the code value (a resolved `VmValue` of tag `code`). */
export const CLOS_CODE = 0;
/** Closure/thunk pair, slot 1: the environment γ tuple pointer, or `null`. */
export const CLOS_ENV = 1;
/** Physical registers per frame. Regalloc (3.4) spills what does not fit. */
export const REG_COUNT = 8;

/* --------------------------------------------------------------- operand kinds */

export type Reg = number;      // physical register index, 0 .. REG_COUNT-1
export type Slot = number;     // frame spill-slot index
export type ConstIx = number;  // index into VmProgram.constants
export type CodeIx = number;   // index into VmProgram.functions
export type Off = number;      // signed PC-relative branch offset (Jmp/JmpIf)

/* -------------------------------------------------------------------- opcodes */

export type Op =
  | 'Const' | 'Move' | 'Bin'
  | 'Alloc' | 'Load' | 'Store' | 'LoadCode'
  | 'CallClos' | 'TailCallClos' | 'Force' | 'TailForce' | 'Ret'
  | 'Jmp' | 'JmpIf'
  | 'Spill' | 'Reload';

/* --------------------------------------------------------------- machine values */

/**
 * A runtime value. Integers and booleans are immediates (never boxed); the heap
 * holds only closure/thunk pairs and env tuples, referenced by `ptr`. A `code`
 * value is a resolved code pointer — what `LoadCode` produces and a closure
 * carries in slot `CLOS_CODE`. `null` is the empty environment and the
 * uninitialised heap slot.
 */
export type VmValue =
  | { tag: 'int'; n: number }
  | { tag: 'bool'; b: boolean }
  | { tag: 'ptr'; addr: number }
  | { tag: 'code'; code: CodeIx }
  | { tag: 'null' };

/* ---------------------------------------------------------------- instructions */

/** One decoded instruction (what the VM steps; `encode`/`decode` (3.5) map it to
 *  words). Carries provenance per instruction, threaded from the CFG. */
export type Instr = IRProvenance & (
  | { op: 'Const'; dst: Reg; k: ConstIx }
  | { op: 'Move'; dst: Reg; src: Reg }
  | { op: 'Bin'; dst: Reg; opKind: PrimOpKind; prim: string; left: Reg; right: Reg }
  | { op: 'Alloc'; dst: Reg; size: number }
  | { op: 'Load'; dst: Reg; base: Reg; off: Off }
  | { op: 'Store'; base: Reg; off: Off; src: Reg }
  | { op: 'LoadCode'; dst: Reg; code: CodeIx }
  | { op: 'CallClos'; dst: Reg; clos: Reg; arg: Reg }
  | { op: 'TailCallClos'; clos: Reg; arg: Reg }
  | { op: 'Force'; dst: Reg; thunk: Reg }
  | { op: 'TailForce'; thunk: Reg }
  | { op: 'Ret'; src: Reg }
  | { op: 'Jmp'; target: Off }
  | { op: 'JmpIf'; cond: Reg; target: Off }
  | { op: 'Spill'; slot: Slot; src: Reg }
  | { op: 'Reload'; dst: Reg; slot: Slot }
);

/** One entry in the flat code table: where a function starts and how big its
 *  frame is. `arity` is 1 for closure code (env + arg), 0 for thunk code. */
export interface CodeEntry extends IRProvenance {
  label: Label;
  entry: number;      // index into VmProgram.code
  regCount: number;   // physical registers this frame uses (≤ REG_COUNT unless spilled)
  slotCount: number;  // spill slots this frame uses
  arity: 0 | 1;
}

/**
 * A fully lowered program: all functions concatenated into one flat `code`
 * array (branch offsets PC-relative), the code table, the constant pool, and
 * the `main` entry. `encode(prog)` (3.5) turns this into the words the
 * Machine-code tab renders as hex; the VM can run either form.
 */
export interface VmProgram {
  strategy: ReductionKind;
  code: Instr[];
  functions: CodeEntry[];
  constants: VmValue[];
  entry: CodeIx;
}
