/**
 * `VmProgram` <-> fixed-width bytecode words (step 3.5). Bridges the
 * structured, decoded `Instr[]` (isa.ts) — what `stepVm` actually executes —
 * and the fixed 32-bit word stream the Machine-code hex tab (3.6) renders.
 * `encode` is a pure data transform (it never touches interpretation); `decode`
 * is its exact inverse, so `decode(encode(prog))` is executable and behaves
 * identically to `prog` — a round-trip property test, `tests/vm.ts`.
 *
 * Word layout: `op(8) | a(8) | b(8) | c(8)`, one word per instruction, fixed
 * width (no multi-word encodings, no variable-length instructions). Every
 * register fits in 3 bits (`REG_COUNT = 8`), so `Bin` — the one instruction
 * with 4 real operands (dst, left, right, primitive) — nibble-packs its two
 * register reads into a single byte (`b = left<<4 | right`) and spends its own
 * byte on the primitive-op code; every other instruction has ≤ 3 operands and
 * needs no packing. `Jmp`/`JmpIf`'s branch offset is the one field that can be
 * genuinely negative (a future backward branch — this pipeline's acyclic CFGs
 * never emit one today, but the ISA's `Off` type is signed on purpose), so it
 * round-trips through a signed byte; every other field is a small
 * non-negative count/index and round-trips as a plain unsigned byte.
 *
 * Deliberately out of scope: `constants` / `functions` / `entry` / `strategy`
 * are **not** further byte-packed — they carry through `EncodedProgram` as
 * plain structured data. The "Machine-code hex tab" is specifically about the
 * *instruction stream*, the one thing this whole pipeline has been compiling
 * toward; a `Label` string or a `VmValue` union has no ISA-mandated wire shape
 * to be deliberate about, and inventing one would be encoding for its own
 * sake.
 *
 * `provenance` is a side table (one entry per word), never packed into the
 * word itself — real machine code has no room for a debug string, and keeping
 * it out of the byte layout is what makes the layout a faithful "this is what
 * the words actually encode" artifact rather than a debug format wearing a
 * hex costume. `decode` reattaches each entry to reconstruct a fully
 * block-traceable `Instr`.
 */
import type { CodeEntry, CodeIx, Instr, Op, VmProgram, VmValue } from './isa';
import type { PrimOpKind } from './core';
import type { ReductionKind } from './anf';

/* -------------------------------------------------------------- op tables */

/** Stable opcode numbering — array position is the encoded value. Order
 *  mirrors the `Op` union in isa.ts; changing it is an ISA version bump. */
const OPCODES: Op[] = [
  'Const', 'Move', 'Bin',
  'Alloc', 'Load', 'Store', 'LoadCode',
  'CallClos', 'TailCallClos', 'Force', 'TailForce', 'Ret',
  'Jmp', 'JmpIf',
  'Spill', 'Reload'
];
const OPCODE_OF = new Map<Op, number>(OPCODES.map((op, i) => [op, i]));

/** Every primitive operator this language has, with its kind — mirrors
 *  `computePrimitive` in lambdaReduction.ts exactly (12 operators: 4 numeric,
 *  3 boolean, 5 comparison). Array position is the encoded value. */
const PRIM_OPS: { op: string; kind: PrimOpKind }[] = [
  { op: '+', kind: 'num' }, { op: '-', kind: 'num' }, { op: '*', kind: 'num' }, { op: '/', kind: 'num' },
  { op: 'and', kind: 'bool' }, { op: 'or', kind: 'bool' }, { op: 'equal', kind: 'bool' },
  { op: '=', kind: 'cmp' }, { op: '<', kind: 'cmp' }, { op: '<=', kind: 'cmp' }, { op: '>', kind: 'cmp' }, { op: '>=', kind: 'cmp' }
];
const PRIM_INDEX = new Map<string, number>(PRIM_OPS.map((p, i) => [p.op, i]));

/* ------------------------------------------------------------- byte packing */

function u8(n: number, what: string): number {
  if (!Number.isInteger(n) || n < 0 || n > 0xff) throw new Error(`encode: ${what}=${n} does not fit an unsigned byte`);
  return n;
}
/** Pack two register operands into one byte — sound because `REG_COUNT <= 16`
 *  keeps every register within a nibble. */
function nibblePair(hi: number, lo: number, what: string): number {
  if (!Number.isInteger(hi) || hi < 0 || hi > 0xf || !Number.isInteger(lo) || lo < 0 || lo > 0xf) {
    throw new Error(`encode: ${what} register out of nibble range (left=${hi}, right=${lo})`);
  }
  return (hi << 4) | lo;
}
function signedByte(n: number, what: string): number {
  if (!Number.isInteger(n) || n < -128 || n > 127) throw new Error(`encode: ${what}=${n} does not fit a signed byte`);
  return n & 0xff;
}
function fromSignedByte(b: number): number {
  return b >= 128 ? b - 256 : b;
}
function packWord(op: number, a: number, b: number, c: number): number {
  return ((op & 0xff) << 24) | ((a & 0xff) << 16) | ((b & 0xff) << 8) | (c & 0xff);
}
function unpackWord(word: number): { op: number; a: number; b: number; c: number } {
  return { op: (word >>> 24) & 0xff, a: (word >>> 16) & 0xff, b: (word >>> 8) & 0xff, c: word & 0xff };
}

/* ----------------------------------------------------------------- encode */

type Prov = { sourceId?: string; sourceAliases?: string[] };

export interface EncodedProgram {
  strategy: ReductionKind;
  /** One 32-bit word per instruction, index-aligned with the source `code`. */
  words: number[];
  /** Debug side table, index-aligned with `words` — see the file header. */
  provenance: Prov[];
  functions: CodeEntry[];
  constants: VmValue[];
  entry: CodeIx;
}

function encodeInstr(ins: Instr): number {
  const op = OPCODE_OF.get(ins.op)!;
  switch (ins.op) {
    case 'Const': return packWord(op, u8(ins.dst, 'dst'), u8(ins.k, 'k'), 0);
    case 'Move': return packWord(op, u8(ins.dst, 'dst'), u8(ins.src, 'src'), 0);
    case 'Bin': {
      const prim = PRIM_INDEX.get(ins.prim);
      if (prim === undefined) throw new Error(`encode: unknown primitive operator '${ins.prim}'`);
      return packWord(op, u8(ins.dst, 'dst'), nibblePair(ins.left, ins.right, 'Bin'), u8(prim, 'prim'));
    }
    case 'Alloc': return packWord(op, u8(ins.dst, 'dst'), u8(ins.size, 'size'), 0);
    case 'Load': return packWord(op, u8(ins.dst, 'dst'), u8(ins.base, 'base'), u8(ins.off, 'off'));
    case 'Store': return packWord(op, u8(ins.base, 'base'), u8(ins.off, 'off'), u8(ins.src, 'src'));
    case 'LoadCode': return packWord(op, u8(ins.dst, 'dst'), u8(ins.code, 'code'), 0);
    case 'CallClos': return packWord(op, u8(ins.dst, 'dst'), u8(ins.clos, 'clos'), u8(ins.arg, 'arg'));
    case 'TailCallClos': return packWord(op, u8(ins.clos, 'clos'), u8(ins.arg, 'arg'), 0);
    case 'Force': return packWord(op, u8(ins.dst, 'dst'), u8(ins.thunk, 'thunk'), 0);
    case 'TailForce': return packWord(op, u8(ins.thunk, 'thunk'), 0, 0);
    case 'Ret': return packWord(op, u8(ins.src, 'src'), 0, 0);
    case 'Jmp': return packWord(op, signedByte(ins.target, 'target'), 0, 0);
    case 'JmpIf': return packWord(op, u8(ins.cond, 'cond'), signedByte(ins.target, 'target'), 0);
    case 'Spill': return packWord(op, u8(ins.slot, 'slot'), u8(ins.src, 'src'), 0);
    case 'Reload': return packWord(op, u8(ins.dst, 'dst'), u8(ins.slot, 'slot'), 0);
  }
}

function prov(ins: Instr): Prov {
  return { sourceId: ins.sourceId, sourceAliases: ins.sourceAliases };
}

/** `VmProgram.code` -> fixed-width words + a parallel provenance side table. */
export function encode(prog: VmProgram): EncodedProgram {
  return {
    strategy: prog.strategy,
    words: prog.code.map(encodeInstr),
    provenance: prog.code.map(prov),
    functions: prog.functions,
    constants: prog.constants,
    entry: prog.entry
  };
}

/* ----------------------------------------------------------------- decode */

function decodeInstr(word: number, p: Prov): Instr {
  const { op: opCode, a, b, c } = unpackWord(word);
  const op = OPCODES[opCode];
  if (op === undefined) throw new Error(`decode: unknown opcode ${opCode}`);
  switch (op) {
    case 'Const': return { op, dst: a, k: b, ...p };
    case 'Move': return { op, dst: a, src: b, ...p };
    case 'Bin': {
      const prim = PRIM_OPS[c];
      if (!prim) throw new Error(`decode: unknown primitive-op index ${c}`);
      return { op, dst: a, opKind: prim.kind, prim: prim.op, left: (b >> 4) & 0xf, right: b & 0xf, ...p };
    }
    case 'Alloc': return { op, dst: a, size: b, ...p };
    case 'Load': return { op, dst: a, base: b, off: c, ...p };
    case 'Store': return { op, base: a, off: b, src: c, ...p };
    case 'LoadCode': return { op, dst: a, code: b, ...p };
    case 'CallClos': return { op, dst: a, clos: b, arg: c, ...p };
    case 'TailCallClos': return { op, clos: a, arg: b, ...p };
    case 'Force': return { op, dst: a, thunk: b, ...p };
    case 'TailForce': return { op, thunk: a, ...p };
    case 'Ret': return { op, src: a, ...p };
    case 'Jmp': return { op, target: fromSignedByte(a), ...p };
    case 'JmpIf': return { op, cond: a, target: fromSignedByte(b), ...p };
    case 'Spill': return { op, slot: a, src: b, ...p };
    case 'Reload': return { op, dst: a, slot: b, ...p };
  }
}

/** Inverse of `encode`: reconstructs a fully executable `VmProgram`, with each
 *  instruction's provenance reattached from the side table. */
export function decode(enc: EncodedProgram): VmProgram {
  if (enc.words.length !== enc.provenance.length) {
    throw new Error('decode: words/provenance length mismatch');
  }
  return {
    strategy: enc.strategy,
    code: enc.words.map((w, i) => decodeInstr(w, enc.provenance[i])),
    functions: enc.functions,
    constants: enc.constants,
    entry: enc.entry
  };
}

/** Render one word as `0xAABBCCDD` (8 hex digits) for the Machine-code tab. */
export function wordHex(word: number): string {
  return `0x${(word >>> 0).toString(16).padStart(8, '0')}`;
}
