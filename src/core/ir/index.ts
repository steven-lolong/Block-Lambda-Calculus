/**
 * Barrel for the lowering-pipeline IR. Steps 1.1–1.4: the data model
 * (provenance, structured types, Core, ANF) plus the passes `desugar`
 * (Term -> CoreTerm), `toAnf` (CoreTerm -> AnfExpr), and the pretty-printers.
 * Step 2.1 adds the closure IR and first-order IR data models (`clos.ts`,
 * `fir.ts`) that `closureConvert` (2.3) and `liftFunctions` (2.4) target.
 */
export * from './provenance';
export * from './types';
export * from './core';
export * from './anf';
export * from './clos';
export * from './fir';
export * from './lir';
export * from './isa';
export * from './vm';
export * from './freshNames';
export * from './freeVars';
export * from './closureConvert';
export * from './liftFunctions';
export * from './toCfg';
export * from './ssa';
export * from './toAsm';
export * from './encode';
export * from './closureCards';
export * from './desugar';
export * from './toAnf';
export * from './prettyPrinters';
