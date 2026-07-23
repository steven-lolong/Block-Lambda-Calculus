/**
 * Term -> CoreTerm. Unifies the three operator kinds into `prim`, attaches
 * each node's structured type from the inference report, and carries block
 * provenance forward unchanged.
 *
 * `letrec` stays a *named* recursive binding here (matching Term), not `fix`:
 * `fix` is a runtime-only marker the substitution stepper introduces when it
 * unrolls a letrec (see `fixpointFor` in ../semantics/lambdaReduction.ts) —
 * it never appears in a block-derived Term, so Core has no `fix` constructor.
 * Keeping the binding named is also what step 1.2's later passes need: it is
 * what makes a recursive definition liftable to a top-level function in the
 * first-order IR (phase 2).
 */
import * as Blockly from 'blockly';
import { pickProgramBlock } from '../machine/csekMachine';
import { blockToTerm, type Term } from '../semantics/lambdaReduction';
import {
  inferLambdaWorkspaceTypes,
  type LambdaInferenceReport,
  type Type as InferredType
} from '../type-inference/lambdaTypeInference';
import type { CoreTerm, PrimOpKind } from './core';
import type { IRType } from './types';

export type TypeLookup = (sourceId: string) => IRType | undefined;

function toIRType(type: InferredType): IRType {
  switch (type.kind) {
    case 'var':
      return { kind: 'tvar', id: type.id };
    case 'const':
      return { kind: 'tcon', name: type.name };
    case 'fun':
      return { kind: 'tfun', from: toIRType(type.from), to: toIRType(type.to) };
  }
}

/** Build a `sourceId -> IRType` lookup from an inference report's structured types. */
export function makeTypeLookup(report: LambdaInferenceReport): TypeLookup {
  const byBlock = new Map<string, IRType>();
  for (const [blockId, type] of report.blockTypesStructured) byBlock.set(blockId, toIRType(type));
  return (sourceId) => byBlock.get(sourceId);
}

function primOpKindOf(kind: 'numop' | 'boolop' | 'cmpop'): PrimOpKind {
  switch (kind) {
    case 'numop':
      return 'num';
    case 'boolop':
      return 'bool';
    case 'cmpop':
      return 'cmp';
  }
}

export function desugar(term: Term, types: TypeLookup): CoreTerm {
  const ty = term.sourceId ? types(term.sourceId) : undefined;
  const base = { sourceId: term.sourceId, sourceAliases: term.sourceAliases, ...(ty ? { ty } : {}) };

  switch (term.kind) {
    case 'var':
      return { kind: 'var', name: term.name, ...base };

    case 'abs': {
      const paramTy = ty?.kind === 'tfun' ? ty.from : undefined;
      return { kind: 'abs', param: term.param, paramTy, body: desugar(term.body, types), ...base };
    }

    case 'app':
      return { kind: 'app', func: desugar(term.func, types), arg: desugar(term.arg, types), ...base };

    case 'let':
      return { kind: 'let', name: term.name, value: desugar(term.value, types), body: desugar(term.body, types), ...base };

    case 'letrec':
      return { kind: 'letrec', name: term.name, value: desugar(term.value, types), body: desugar(term.body, types), ...base };

    case 'fix':
      throw new Error('desugar: unexpected runtime "fix" node in a block-derived term');

    case 'num':
      return { kind: 'num', value: term.value, ...base };

    case 'bool':
      return { kind: 'bool', value: term.value, ...base };

    case 'numop':
    case 'boolop':
    case 'cmpop':
      return {
        kind: 'prim',
        opKind: primOpKindOf(term.kind),
        op: term.op,
        left: desugar(term.left, types),
        right: desugar(term.right, types),
        ...base
      };

    case 'if':
      return {
        kind: 'if',
        cond: desugar(term.cond, types),
        then: desugar(term.thenTerm, types),
        else: desugar(term.elseTerm, types),
        ...base
      };

    case 'hole':
      return { kind: 'hole', label: term.label, ...base };
  }
}

/** Pick the workspace's program block, infer its types, and desugar to Core. */
export function desugarWorkspace(workspace: Blockly.Workspace): { core: CoreTerm; report: LambdaInferenceReport } {
  const report = inferLambdaWorkspaceTypes(workspace);
  const term = blockToTerm(pickProgramBlock(workspace));
  const core = desugar(term, makeTypeLookup(report));
  return { core, report };
}
