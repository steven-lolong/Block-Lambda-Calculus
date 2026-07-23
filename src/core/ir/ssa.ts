/**
 * SSA verification + φ-node projection over the CFG (step 3.3).
 *
 * There is deliberately no SSA *construction* pass here, and that is the point:
 * the destination-passing lowering of step 3.2 already emits single-assignment
 * code with a block parameter at every join — the well-known consequence of
 * lowering an ANF/CPS-shaped IR (Appel, "SSA is functional programming"). So
 * 3.3 is verification, not transformation:
 *
 *   - `checkSsa` confirms the invariants a construction pass would have had to
 *     establish — exactly one definition per virtual register, every use
 *     dominated by its definition, and a block-argument list on every edge whose
 *     arity matches the target's parameters — so the property test *is* the SSA
 *     guarantee, run over the whole corpus. It is also a standalone verifier of
 *     `toCfg`'s output (a malformed CFG is a checker error, not a crash later).
 *
 *   - `computePhis` presents those same joins in the classical φ-node vocabulary
 *     (`%p = φ(v₁ from pred₁, …)`), derived from the block parameters and the
 *     argument each predecessor passes for them. Block arguments and φ-nodes are
 *     inter-derivable; the CFG keeps the block-argument form as its single
 *     source of truth (no two-representation drift), and this is the on-demand φ
 *     view the CFG/Assembly tab (3.6) renders and instruction selection (3.4)
 *     lowers to per-edge moves.
 */
import type { BasicBlock, CfgFunc, CfgProgram, VReg } from './lir';
import { instrDef, instrUses, terminatorTargets, termUses } from './lir';

/** A φ-node: one join-block parameter, valued per incoming edge. */
export interface Phi {
  dest: VReg;
  sources: { pred: string; value: VReg }[];
}

/* ------------------------------------------------------------ graph helpers */

/** Predecessor blocks of each block (empty list for the entry / unreachable). */
export function predecessors(func: CfgFunc): Map<string, string[]> {
  const preds = new Map<string, string[]>();
  for (const bl of func.blocks) preds.set(bl.id, []);
  for (const bl of func.blocks) {
    for (const succ of terminatorTargets(bl.terminator)) {
      const list = preds.get(succ);
      if (list) list.push(bl.id);
    }
  }
  return preds;
}

/** Blocks reachable from the entry (a well-formed CFG has no unreachable block). */
function reachable(func: CfgFunc, byId: Map<string, BasicBlock>): Set<string> {
  const seen = new Set<string>();
  const stack = [func.entry];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const bl = byId.get(id);
    if (bl) for (const succ of terminatorTargets(bl.terminator)) stack.push(succ);
  }
  return seen;
}

/** Dominator sets (iterative dataflow): `dom(n) = {n} ∪ ⋂ dom(p)` over preds. */
function dominators(func: CfgFunc, live: Set<string>, preds: Map<string, string[]>): Map<string, Set<string>> {
  const dom = new Map<string, Set<string>>();
  for (const id of live) dom.set(id, id === func.entry ? new Set([id]) : new Set(live));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of live) {
      if (id === func.entry) continue;
      const domSets = (preds.get(id) ?? []).filter((p) => live.has(p)).map((p) => dom.get(p)!);
      const next = new Set<string>([id]);
      if (domSets.length > 0) {
        for (const b of domSets[0]) {
          if (b !== id && domSets.every((ds) => ds.has(b))) next.add(b);
        }
      }
      const cur = dom.get(id)!;
      if (next.size !== cur.size || [...next].some((x) => !cur.has(x))) {
        dom.set(id, next);
        changed = true;
      }
    }
  }
  return dom;
}

/* -------------------------------------------------------------- φ projection */

/** φ-nodes at each block, derived from its parameters and the arguments its
 *  predecessors pass on the edge into it. Blocks with no parameters map to `[]`. */
export function computePhis(func: CfgFunc): Map<string, Phi[]> {
  const preds = predecessors(func);
  const byId = new Map(func.blocks.map((bl) => [bl.id, bl]));
  const result = new Map<string, Phi[]>();
  for (const bl of func.blocks) {
    const phis: Phi[] = bl.params.map((dest, i) => {
      const sources = (preds.get(bl.id) ?? []).map((pred) => {
        const term = byId.get(pred)!.terminator;
        let value: VReg | undefined;
        if (term.kind === 'br' && term.target === bl.id) value = term.args[i];
        else if (term.kind === 'condbr') {
          if (term.then === bl.id) value = term.thenArgs[i];
          else if (term.else === bl.id) value = term.elseArgs[i];
        }
        if (!value) throw new Error(`computePhis: predecessor ${pred} passes no arg ${i} to ${bl.id}`);
        return { pred, value };
      });
      return { dest, sources };
    });
    result.set(bl.id, phis);
  }
  return result;
}

/* ---------------------------------------------------------------- the checker */

/** Verify the SSA invariants of one function; returns human-readable violations
 *  (empty when well-formed). */
export function checkSsaFunc(func: CfgFunc): string[] {
  const errors: string[] = [];
  const where = `${func.label}`;
  const byId = new Map(func.blocks.map((bl) => [bl.id, bl]));

  // (1) exactly one definition per vreg; record def site (block, position).
  //     Position -1 = "at block entry" (func/block parameters).
  const def = new Map<number, { block: string; pos: number }>();
  const define = (reg: VReg, block: string, pos: number): void => {
    if (def.has(reg.id)) errors.push(`${where}: vreg %${reg.id} defined more than once`);
    else def.set(reg.id, { block, pos });
  };
  if (func.env) define(func.env, func.entry, -1);
  if (func.param) define(func.param, func.entry, -1);
  for (const bl of func.blocks) {
    bl.params.forEach((p) => define(p, bl.id, -1));
    bl.instrs.forEach((ins, i) => {
      const d = instrDef(ins);
      if (d) define(d, bl.id, i);
    });
  }

  const live = reachable(func, byId);
  for (const bl of func.blocks) if (!live.has(bl.id)) errors.push(`${where}: block ${bl.id} is unreachable`);
  const preds = predecessors(func);
  const dom = dominators(func, live, preds);

  // (2) every use is dominated by its definition.
  const checkUse = (reg: VReg, block: string, pos: number): void => {
    const d = def.get(reg.id);
    if (!d) {
      errors.push(`${where}: use of undefined vreg %${reg.id} in ${block}`);
      return;
    }
    const ok = d.block === block ? d.pos < pos : (dom.get(block)?.has(d.block) ?? false);
    if (!ok) errors.push(`${where}: use of %${reg.id} in ${block} not dominated by its definition in ${d.block}`);
  };
  for (const bl of func.blocks) {
    if (!live.has(bl.id)) continue;
    bl.instrs.forEach((ins, i) => instrUses(ins).forEach((u) => checkUse(u, bl.id, i)));
    termUses(bl.terminator).forEach((u) => checkUse(u, bl.id, bl.instrs.length));
  }

  // (3) every edge carries a block-argument list matching the target's params.
  const checkEdge = (fromArgs: VReg[], target: string, from: string): void => {
    const t = byId.get(target);
    if (!t) {
      errors.push(`${where}: edge ${from} -> ${target} targets a missing block`);
      return;
    }
    if (fromArgs.length !== t.params.length) {
      errors.push(`${where}: edge ${from} -> ${target} passes ${fromArgs.length} args for ${t.params.length} params`);
    }
  };
  for (const bl of func.blocks) {
    const t = bl.terminator;
    if (t.kind === 'br') checkEdge(t.args, t.target, bl.id);
    else if (t.kind === 'condbr') {
      checkEdge(t.thenArgs, t.then, bl.id);
      checkEdge(t.elseArgs, t.else, bl.id);
    }
  }

  return errors;
}

/** Verify the SSA invariants of a whole program (every function + `main`). */
export function checkSsa(prog: CfgProgram): string[] {
  return [...prog.functions, prog.main].flatMap(checkSsaFunc);
}
