/**
 * Low IR / control-flow graph (step 3.1 data model). The target of `toCfg`
 * (3.2): every `FirFunc` becomes a `CfgFunc` of basic blocks over virtual
 * registers, with the two structural changes the register machine forces —
 *
 *   - **control is explicit.** A FIR `if` (whose branches are full expressions)
 *     becomes a `condbr` terminator into two blocks; a `let`-bound `if` merges
 *     its branches at a **join block** carrying one block parameter (the SSA
 *     join form — φ-nodes are the equivalent classical presentation; 3.3 may
 *     add them). A tail `callclos` becomes a `tailcallclos` terminator.
 *
 *   - **the heap is explicit.** A FIR `clos { code, env }` / `susp` thunk is not
 *     a single node any more: it lowers to primitive `alloc` + `loadcode` +
 *     `store` sequences building the two-object closure layout of §3.1
 *     (`[ code | env ]` pair + a separate γ tuple), so "closure alloc → heap
 *     alloc/store" is literally visible. Emitting the primitives (rather than a
 *     fused `mkclos`) is also what lets a recursive `letrec` thunk be built by
 *     allocate-then-backpatch — allocate the pair, bind the name, then store a
 *     self-reference into its env tuple.
 *
 * Every instruction and terminator carries `IRProvenance`, so each lowered
 * operation still points back to the block it came from (the 3.2 contract).
 * Values flow between blocks only through block parameters and the ABI
 * registers (`env` = r0, `param` = r1 on entry) — there is no ambient
 * environment chain any more; that is the whole point of this stage.
 */
import type { IRProvenance } from './provenance';
import type { PrimOpKind } from './core';
import type { Label } from './fir';
import type { ReductionKind } from './anf';

/** A virtual register: unbounded SSA-ish value name (`%0`, `%1`, …). `hint`
 *  carries the source name when there is one, purely for readable dumps. */
export interface VReg {
  id: number;
  hint?: string;
}

/** A basic-block key within one `CfgFunc` (`b0`, `b1`, …). */
export type BlockId = string;

/**
 * A straight-line instruction — never transfers control except `callclos`/
 * `force`, which return to the next instruction (only *tail* calls and branches
 * end a block, and those are `Terminator`s). Every instruction that produces a
 * value names its `dst` virtual register.
 */
export type CfgInstr = IRProvenance & (
  | { kind: 'const'; dst: VReg; value: number | boolean | null }
  | { kind: 'bin'; dst: VReg; opKind: PrimOpKind; op: string; left: VReg; right: VReg }
  | { kind: 'move'; dst: VReg; src: VReg }
  | { kind: 'alloc'; dst: VReg; size: number }                       // heap record → ptr
  | { kind: 'load'; dst: VReg; base: VReg; index: number }           // dst ← Heap[base+index]
  | { kind: 'store'; base: VReg; index: number; src: VReg }          // Heap[base+index] ← src
  | { kind: 'loadcode'; dst: VReg; label: Label }                    // dst ← code value for a function
  | { kind: 'callclos'; dst: VReg; clos: VReg; arg: VReg }           // non-tail closure-invoke
  | { kind: 'force'; dst: VReg; src: VReg }                          // thunk → invoke; value → identity (CbS)
);

/**
 * A block terminator — the one control-transfer at the end of every block.
 * `br`/`condbr` carry the argument list for the target block's parameters (the
 * SSA join mechanism). `tailcallclos` is the tail closure-invoke: it hands its
 * result straight to the current function's caller.
 */
export type Terminator = IRProvenance & (
  | { kind: 'ret'; value: VReg }
  | { kind: 'br'; target: BlockId; args: VReg[] }
  | { kind: 'condbr'; cond: VReg; then: BlockId; thenArgs: VReg[]; else: BlockId; elseArgs: VReg[] }
  | { kind: 'tailcallclos'; clos: VReg; arg: VReg }
);

export interface BasicBlock {
  id: BlockId;
  /** Block parameters (join values). Empty for the entry and for branch blocks
   *  that do not merge; a `let`-bound `if`'s join block carries exactly one. */
  params: VReg[];
  instrs: CfgInstr[];
  terminator: Terminator;
}

/**
 * One function: a `FirFunc` (`kind: 'closure'`), a lifted call-by-structure
 * thunk body (`kind: 'thunk'`, no `param`), or the program entry
 * (`kind: 'main'`, no `env`/`param`). On entry `env` is bound to r0 (the γ
 * tuple pointer) and `param` to r1 (the argument); `blocks[0]` (id `entry`) is
 * the entry block.
 */
export interface CfgFunc extends IRProvenance {
  label: Label;
  kind: 'closure' | 'thunk' | 'main';
  env?: VReg;
  param?: VReg;
  entry: BlockId;
  blocks: BasicBlock[];
}

export interface CfgProgram {
  strategy: ReductionKind;
  /** Lifted FIR functions plus every lifted `susp`/thunk body, definition order. */
  functions: CfgFunc[];
  main: CfgFunc;
}

/** Every block a terminator can branch to (for CFG edge/traversal helpers). */
export function terminatorTargets(term: Terminator): BlockId[] {
  switch (term.kind) {
    case 'br':
      return [term.target];
    case 'condbr':
      return [term.then, term.else];
    case 'ret':
    case 'tailcallclos':
      return [];
  }
}

/** Blocks in reverse-postorder from the entry (entry first, unreachable
 *  dropped) — a valid linear schedule/layout order because every `CfgFunc`'s
 *  block graph is acyclic (recursion is a `callclos`/`tailcallclos` into a
 *  fresh frame, never a back-edge). Shared by instruction selection (toAsm.ts,
 *  which needs a schedule) and the CFG diagram (cfgPanel.ts, which needs a
 *  top-to-bottom layer order) — one graph-order computation, not two. */
export function reversePostorder(func: CfgFunc): BasicBlock[] {
  const byId = new Map(func.blocks.map((b) => [b.id, b]));
  const visited = new Set<string>();
  const post: string[] = [];
  const dfs = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const bl = byId.get(id);
    if (!bl) return;
    for (const s of terminatorTargets(bl.terminator)) dfs(s);
    post.push(id);
  };
  dfs(func.entry);
  return post.reverse().map((id) => byId.get(id)!);
}

/* ----------------------------------------------------- instruction def / use */
/* Shared by the SSA verifier (ssa.ts) and the register allocator (toAsm.ts):
 * the single source of truth for which virtual registers each node defines and
 * reads. Keeping them here — with the data model — avoids two drifting copies. */

/** The virtual register an instruction defines, if any (`store` defines none). */
export function instrDef(ins: CfgInstr): VReg | null {
  return ins.kind === 'store' ? null : ins.dst;
}

/** The virtual registers an instruction reads. */
export function instrUses(ins: CfgInstr): VReg[] {
  switch (ins.kind) {
    case 'const':
    case 'alloc':
    case 'loadcode':
      return [];
    case 'move':
    case 'force':
      return [ins.src];
    case 'load':
      return [ins.base];
    case 'store':
      return [ins.base, ins.src];
    case 'bin':
      return [ins.left, ins.right];
    case 'callclos':
      return [ins.clos, ins.arg];
  }
}

/** The virtual registers a terminator reads. */
export function termUses(term: Terminator): VReg[] {
  switch (term.kind) {
    case 'ret':
      return [term.value];
    case 'br':
      return term.args;
    case 'condbr':
      return [term.cond, ...term.thenArgs, ...term.elseArgs];
    case 'tailcallclos':
      return [term.clos, term.arg];
  }
}
