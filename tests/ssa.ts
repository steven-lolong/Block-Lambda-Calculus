/**
 * SSA verification tests (src/core/ir/ssa.ts, step 3.3).
 *
 * The property test IS the SSA guarantee: `checkSsa(toCfg(toFir(...)))` returns
 * no violations for every pinned case and every shipped example under BOTH
 * strategies — i.e. the CFG that step 3.2 lowers is already valid SSA (one
 * definition per vreg, every use dominated by its definition, block-argument
 * arity matching every edge), with no construction pass needed.
 *
 * Negative controls give the checker teeth: three hand-built malformed CFGs
 * (a double definition, an undominated cross-branch use, and an arity mismatch)
 * must each be REJECTED — otherwise a checker that always returned `[]` would
 * pass the corpus vacuously.
 *
 * φ projection: `computePhis` must present each join's block parameters as
 * φ-nodes whose sources are exactly that block's predecessors, each valuing a
 * defined vreg — and the one `let`-bound `if` in the corpus must actually
 * produce a φ.
 *
 * Run with: npm run test:ssa
 */
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { LAMBDA_EXAMPLES } from '../src/core/examples/lambdaExamples';
import { parseLambdaTextToWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { inferLambdaWorkspaceTypes } from '../src/core/type-inference/lambdaTypeInference';
import { blockToTerm, type ReductionKind } from '../src/core/semantics/lambdaReduction';
import { pickProgramBlock } from '../src/core/machine/csekMachine';
import { desugar, makeTypeLookup, toAnfProgram, toFir, toCfg } from '../src/core/ir';
import { checkSsa, checkSsaFunc, computePhis, predecessors } from '../src/core/ir/ssa';
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

function cfgOf(workspace: Blockly.Workspace, block: Blockly.Block, kind: ReductionKind): CfgProgram {
  const report = inferLambdaWorkspaceTypes(workspace);
  const core = desugar(blockToTerm(block), makeTypeLookup(report));
  return toCfg(toFir(toAnfProgram(core, kind)));
}

/** Every vreg a function defines (params + block params + instruction dsts). */
function defSet(func: CfgFunc): Set<number> {
  const s = new Set<number>();
  if (func.env) s.add(func.env.id);
  if (func.param) s.add(func.param.id);
  for (const bl of func.blocks) {
    bl.params.forEach((p) => s.add(p.id));
    for (const ins of bl.instrs) if (ins.kind !== 'store') s.add(ins.dst.id);
  }
  return s;
}

/** φ-node well-formedness for one function. */
function checkPhis(func: CfgFunc): string[] {
  const errs: string[] = [];
  const defs = defSet(func);
  const preds = predecessors(func);
  const phis = computePhis(func);
  for (const bl of func.blocks) {
    const ps = phis.get(bl.id) ?? [];
    if (ps.length !== bl.params.length) errs.push(`${func.label}:${bl.id} φ count ${ps.length} != ${bl.params.length}`);
    const nPreds = (preds.get(bl.id) ?? []).length;
    ps.forEach((phi, i) => {
      if (phi.dest.id !== bl.params[i].id) errs.push(`${func.label}:${bl.id} φ${i} dest mismatch`);
      if (phi.sources.length !== nPreds) errs.push(`${func.label}:${bl.id} φ${i} has ${phi.sources.length} sources for ${nPreds} preds`);
      for (const s of phi.sources) if (!defs.has(s.value.id)) errs.push(`${func.label}:${bl.id} φ${i} sources undefined %${s.value.id}`);
    });
  }
  return errs;
}

/* --------------------------------------------------------------- corpus */

const CASES: { name: string; source: string }[] = [
  { name: 'copy_vs_lookup', source: '(\\x. x + x) (3 * 7)' },
  { name: 'let_twice', source: 'let f = \\y. y + 1 in f (f 5)' },
  { name: 'shadowing', source: '(\\x. (\\x. x + 1) (x * 2)) 5' },
  { name: 'if_let_bound', source: '(if 2 < 3 then 10 else 20) + 1' },
  { name: 'ho_twice', source: '(\\f. \\x. f (f x)) (\\y. y + 3) 5' },
  { name: 'compose', source: '(\\f. \\g. \\x. f (g x)) (\\y. y + 1) (\\z. z * 2) 5' },
  { name: 'letrec_factorial', source: 'letrec fac = \\n. if n < 1 then 1 else n * (fac (n - 1)) in fac 5' }
];

for (const c of CASES) {
  withProgram(c.source, (workspace, block) => {
    for (const kind of ['structure', 'value'] as ReductionKind[]) {
      const prog = cfgOf(workspace, block, kind);
      const ssa = checkSsa(prog);
      check(`${c.name} · ${kind} is valid SSA`, ssa.length === 0, ssa.join('; '));
      const phiErrs = [...prog.functions, prog.main].flatMap(checkPhis);
      check(`${c.name} · ${kind} φ-nodes well-formed`, phiErrs.length === 0, phiErrs.join('; '));
    }
  });
}

// A `let`-bound `if` is the corpus's one real join — it must produce a φ.
withProgram('(if 2 < 3 then 10 else 20) + 1', (workspace, block) => {
  const prog = cfgOf(workspace, block, 'value');
  const total = [...prog.functions, prog.main]
    .flatMap((f) => [...computePhis(f).values()])
    .reduce((n, ps) => n + ps.length, 0);
  check('let-bound if produces exactly one φ-node (2 sources)', total === 1,
    `total φ = ${total}`);
  const phi = [...computePhis(prog.main).values()].flat()[0];
  check('that φ has one source per predecessor branch', !!phi && phi.sources.length === 2,
    phi ? `sources=${phi.sources.length}` : 'no φ found');
});

/* ---------------------------------------------- every shipped example */

for (const id of Object.keys(LAMBDA_EXAMPLES) as (keyof typeof LAMBDA_EXAMPLES)[]) {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(LAMBDA_EXAMPLES[id].workspace as never, workspace);
  const block = pickProgramBlock(workspace)!;
  for (const kind of ['structure', 'value'] as ReductionKind[]) {
    const prog = cfgOf(workspace, block, kind);
    const ssa = checkSsa(prog);
    check(`example ${id} · ${kind} is valid SSA`, ssa.length === 0, ssa.join('; '));
    const phiErrs = [...prog.functions, prog.main].flatMap(checkPhis);
    check(`example ${id} · ${kind} φ-nodes well-formed`, phiErrs.length === 0, phiErrs.join('; '));
  }
  workspace.dispose();
}

/* ------------------------------------ negative controls (checker has teeth) */

const doubleDef: CfgFunc = {
  label: 'bad_doubledef', kind: 'main', entry: 'b0',
  blocks: [{
    id: 'b0', params: [],
    instrs: [
      { kind: 'const', dst: { id: 0 }, value: 1 },
      { kind: 'const', dst: { id: 0 }, value: 2 } // %0 redefined
    ],
    terminator: { kind: 'ret', value: { id: 0 } }
  }]
};
check('rejects a double definition', checkSsaFunc(doubleDef).some((e) => /defined more than once/.test(e)),
  checkSsaFunc(doubleDef).join('; '));

const undominated: CfgFunc = {
  label: 'bad_undom', kind: 'main', entry: 'b0',
  blocks: [
    { id: 'b0', params: [], instrs: [{ kind: 'const', dst: { id: 0 }, value: true }], terminator: { kind: 'condbr', cond: { id: 0 }, then: 'b1', thenArgs: [], else: 'b2', elseArgs: [] } },
    { id: 'b1', params: [], instrs: [{ kind: 'const', dst: { id: 1 }, value: 10 }], terminator: { kind: 'br', target: 'b3', args: [] } },
    { id: 'b2', params: [], instrs: [{ kind: 'const', dst: { id: 2 }, value: 20 }], terminator: { kind: 'br', target: 'b3', args: [] } },
    { id: 'b3', params: [], instrs: [{ kind: 'move', dst: { id: 3 }, src: { id: 1 } }], terminator: { kind: 'ret', value: { id: 3 } } } // %1 defined only in b1
  ]
};
check('rejects an undominated cross-branch use', checkSsaFunc(undominated).some((e) => /not dominated/.test(e)),
  checkSsaFunc(undominated).join('; '));

const badArity: CfgFunc = {
  label: 'bad_arity', kind: 'main', entry: 'b0',
  blocks: [
    { id: 'b0', params: [], instrs: [{ kind: 'const', dst: { id: 0 }, value: 1 }], terminator: { kind: 'br', target: 'b1', args: [] } }, // 0 args
    { id: 'b1', params: [{ id: 1 }], instrs: [], terminator: { kind: 'ret', value: { id: 1 } } } // expects 1
  ]
};
check('rejects a block-argument arity mismatch', checkSsaFunc(badArity).some((e) => /args for .* params/.test(e)),
  checkSsaFunc(badArity).join('; '));

console.log(failures === 0
  ? `All ${checks} SSA checks passed.`
  : `${failures}/${checks} SSA checks FAILED.`);
if (failures > 0) process.exitCode = 1;
