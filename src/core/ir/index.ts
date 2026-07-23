/**
 * Barrel for the lowering-pipeline IR. Steps 1.1–1.4: the data model
 * (provenance, structured types, Core, ANF) plus the passes `desugar`
 * (Term -> CoreTerm), `toAnf` (CoreTerm -> AnfExpr), and the pretty-printers.
 */
export * from './provenance';
export * from './types';
export * from './core';
export * from './anf';
export * from './freshNames';
export * from './desugar';
export * from './toAnf';
export * from './prettyPrinters';
