import * as Blockly from 'blockly';

export type ReductionKind = 'structure' | 'value';

export interface BlockOrder {
  order: number;
  map: Record<number, string>;
}

type TermBase = { sourceId?: string; sourceAliases?: string[] };

type Term = TermBase & (
  | { kind: 'var'; name: string }
  | { kind: 'abs'; param: string; body: Term }
  | { kind: 'app'; func: Term; arg: Term }
  | { kind: 'let'; name: string; value: Term; body: Term }
  | { kind: 'letrec'; name: string; value: Term; body: Term }
  | { kind: 'fix'; target: Term }
  | { kind: 'num'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'numop'; op: string; left: Term; right: Term }
  | { kind: 'boolop'; op: string; left: Term; right: Term }
  | { kind: 'cmpop'; op: string; left: Term; right: Term }
  | { kind: 'if'; cond: Term; thenTerm: Term; elseTerm: Term }
  | { kind: 'hole'; label: string }
);

type ReductionEvent = {
  kind: 'beta' | 'let' | 'let-value' | 'letrec' | 'fix' | 'primitive' | 'if' | 'context';
  redex: Term;
  result: Term;
  label: string;
  /** True when the step happened inside a lambda body (call-by-structure
      normalization the machine, which stops at closures, never performs). */
  underLambda?: boolean;
};

type RuntimeEnv = Map<string, Term>;

type ReductionRenderContext = {
  workspace: Blockly.WorkspaceSvg;
  order: BlockOrder;
  kind: ReductionKind;
  betaCount: number;
  truncated: boolean;
  resolving: Set<string>;
};

const MAX_REDUCTION_STEPS = 480;
const MAX_VISUALIZATION_STEPS = 96;
const MAX_RENDERED_TERM_SIZE = 220;

const newOrder = (): BlockOrder => ({ order: 0, map: {} });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function unique(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function termSources(term: Term): string[] {
  return unique([term.sourceId, ...(term.sourceAliases ?? [])]);
}

function withSource<T extends Term>(term: T, sourceId?: string): T {
  if (!sourceId) return term;
  if (!term.sourceId) return { ...term, sourceId } as T;
  if (term.sourceId === sourceId || term.sourceAliases?.includes(sourceId)) return term;
  return { ...term, sourceAliases: unique([...(term.sourceAliases ?? []), sourceId]) } as T;
}

function withSources<T extends Term>(term: T, source: Term): T {
  let next = term;
  for (const id of termSources(source)) next = withSource(next, id);
  return next;
}

function sourcesFrom(term: Term): Pick<TermBase, 'sourceId' | 'sourceAliases'> {
  return { sourceId: term.sourceId, sourceAliases: term.sourceAliases };
}

function field(block: Blockly.Block, name: string, fallback = ''): string {
  const value = block.getFieldValue(name);
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function child(block: Blockly.Block, inputName: string): Blockly.Block | null {
  return block.getInputTargetBlock(inputName);
}

function isLambdaTermBlock(block: Blockly.Block): boolean {
  return Boolean(block.outputConnection) && block.type.startsWith('lambda_') && block.type !== 'lambda_viz_description';
}

function blockToTerm(block: Blockly.Block | null): Term {
  if (!block) return { kind: 'hole', label: '□' };
  const sourceId = block.id;
  switch (block.type) {
    case 'lambda_variable':
      return { kind: 'var', name: field(block, 'NAME', 'x'), sourceId };
    case 'lambda_abstraction':
      return { kind: 'abs', param: field(block, 'PARAM', 'x'), body: blockToTerm(child(block, 'BODY')), sourceId };
    case 'lambda_application':
      return { kind: 'app', func: blockToTerm(child(block, 'FUNC')), arg: blockToTerm(child(block, 'ARG')), sourceId };
    case 'lambda_parentheses':
      return withSource(blockToTerm(child(block, 'TERM')), sourceId);
    case 'lambda_let':
      return { kind: 'let', name: field(block, 'NAME', 'id'), value: blockToTerm(child(block, 'VALUE')), body: blockToTerm(child(block, 'BODY')), sourceId };
    case 'lambda_letrec':
      return { kind: 'letrec', name: field(block, 'NAME', 'f'), value: blockToTerm(child(block, 'VALUE')), body: blockToTerm(child(block, 'BODY')), sourceId };
    case 'lambda_number':
      return { kind: 'num', value: Number(field(block, 'VALUE', '0')) || 0, sourceId };
    case 'lambda_boolean':
      return { kind: 'bool', value: field(block, 'VALUE', 'true') === 'true', sourceId };
    case 'lambda_number_operator':
      return { kind: 'numop', op: field(block, 'OP', '+'), left: blockToTerm(child(block, 'LEFT')), right: blockToTerm(child(block, 'RIGHT')), sourceId };
    case 'lambda_boolean_operator':
      return { kind: 'boolop', op: field(block, 'OP', 'and'), left: blockToTerm(child(block, 'LEFT')), right: blockToTerm(child(block, 'RIGHT')), sourceId };
    case 'lambda_number_comparison':
      return { kind: 'cmpop', op: field(block, 'OP', '='), left: blockToTerm(child(block, 'LEFT')), right: blockToTerm(child(block, 'RIGHT')), sourceId };
    case 'lambda_if':
      return {
        kind: 'if',
        cond: blockToTerm(child(block, 'COND')),
        thenTerm: blockToTerm(child(block, 'THEN')),
        elseTerm: blockToTerm(child(block, 'ELSE')),
        sourceId
      };
    default:
      return { kind: 'hole', label: block.type, sourceId };
  }
}

function inputNameForChild(parent: Blockly.Block, childBlock: Blockly.Block): string | null {
  for (const input of ((parent as any).inputList ?? []) as any[]) {
    const target = input.connection?.targetBlock?.();
    if (target === childBlock) return input.name ?? null;
  }
  return null;
}

function contextualEnvForBlock(block: Blockly.Block): RuntimeEnv {
  const env: RuntimeEnv = new Map();
  const shadowed = new Set<string>();
  let childBlock: Blockly.Block = block;
  let parent = childBlock.getParent();

  while (parent) {
    const inputName = inputNameForChild(parent, childBlock);

    if (parent.type === 'lambda_abstraction' && inputName === 'BODY') {
      shadowed.add(field(parent, 'PARAM', 'x'));
    }

    if (parent.type === 'lambda_let' && inputName === 'BODY') {
      const name = field(parent, 'NAME', 'id');
      if (!shadowed.has(name) && !env.has(name)) env.set(name, blockToTerm(child(parent, 'VALUE')));
      shadowed.add(name);
    }

    if (parent.type === 'lambda_letrec' && (inputName === 'BODY' || inputName === 'VALUE')) {
      const name = field(parent, 'NAME', 'f');
      if (!shadowed.has(name) && !env.has(name)) env.set(name, blockToTerm(child(parent, 'VALUE')));
      shadowed.add(name);
    }

    childBlock = parent;
    parent = childBlock.getParent();
  }

  return env;
}

function union(...sets: Set<string>[]): Set<string> {
  const result = new Set<string>();
  for (const set of sets) for (const value of set) result.add(value);
  return result;
}

function freeVars(term: Term): Set<string> {
  switch (term.kind) {
    case 'var':
      return new Set([term.name]);
    case 'abs': {
      const vars = freeVars(term.body);
      vars.delete(term.param);
      return vars;
    }
    case 'app':
      return union(freeVars(term.func), freeVars(term.arg));
    case 'let': {
      const vars = union(freeVars(term.value), freeVars(term.body));
      vars.delete(term.name);
      return vars;
    }
    case 'letrec': {
      const vars = union(freeVars(term.value), freeVars(term.body));
      vars.delete(term.name);
      return vars;
    }
    case 'fix':
      return freeVars(term.target);
    case 'numop':
    case 'boolop':
    case 'cmpop':
      return union(freeVars(term.left), freeVars(term.right));
    case 'if':
      return union(freeVars(term.cond), freeVars(term.thenTerm), freeVars(term.elseTerm));
    default:
      return new Set();
  }
}

function freshName(base: string, avoid: Set<string>): string {
  let index = 1;
  let candidate = `${base}_${index}`;
  while (avoid.has(candidate)) {
    index += 1;
    candidate = `${base}_${index}`;
  }
  return candidate;
}

function rename(term: Term, from: string, to: string): Term {
  switch (term.kind) {
    case 'var':
      return term.name === from ? { kind: 'var', name: to, ...sourcesFrom(term) } : clone(term);
    case 'abs':
      return { kind: 'abs', param: term.param === from ? to : term.param, body: rename(term.body, from, to), ...sourcesFrom(term) };
    case 'app':
      return { kind: 'app', func: rename(term.func, from, to), arg: rename(term.arg, from, to), ...sourcesFrom(term) };
    case 'let':
      return { kind: 'let', name: term.name === from ? to : term.name, value: rename(term.value, from, to), body: rename(term.body, from, to), ...sourcesFrom(term) };
    case 'letrec':
      return { kind: 'letrec', name: term.name === from ? to : term.name, value: rename(term.value, from, to), body: rename(term.body, from, to), ...sourcesFrom(term) };
    case 'fix':
      return { kind: 'fix', target: rename(term.target, from, to), ...sourcesFrom(term) };
    case 'numop':
      return { kind: 'numop', op: term.op, left: rename(term.left, from, to), right: rename(term.right, from, to), ...sourcesFrom(term) };
    case 'boolop':
      return { kind: 'boolop', op: term.op, left: rename(term.left, from, to), right: rename(term.right, from, to), ...sourcesFrom(term) };
    case 'cmpop':
      return { kind: 'cmpop', op: term.op, left: rename(term.left, from, to), right: rename(term.right, from, to), ...sourcesFrom(term) };
    case 'if':
      return { kind: 'if', cond: rename(term.cond, from, to), thenTerm: rename(term.thenTerm, from, to), elseTerm: rename(term.elseTerm, from, to), ...sourcesFrom(term) };
    default:
      return clone(term);
  }
}

function substitute(term: Term, name: string, replacement: Term): Term {
  switch (term.kind) {
    case 'var':
      return term.name === name ? withSources(clone(replacement), term) : clone(term);
    case 'abs': {
      if (term.param === name) return clone(term);
      const replacementFree = freeVars(replacement);
      if (!replacementFree.has(term.param)) {
        return { kind: 'abs', param: term.param, body: substitute(term.body, name, replacement), ...sourcesFrom(term) };
      }
      const avoid = union(freeVars(term.body), replacementFree, new Set([name]));
      const fresh = freshName(term.param, avoid);
      return { kind: 'abs', param: fresh, body: substitute(rename(term.body, term.param, fresh), name, replacement), ...sourcesFrom(term) };
    }
    case 'app':
      return { kind: 'app', func: substitute(term.func, name, replacement), arg: substitute(term.arg, name, replacement), ...sourcesFrom(term) };
    case 'let': {
      const value = substitute(term.value, name, replacement);
      if (term.name === name) return { kind: 'let', name: term.name, value, body: clone(term.body), ...sourcesFrom(term) };
      const replacementFree = freeVars(replacement);
      if (!replacementFree.has(term.name)) {
        return { kind: 'let', name: term.name, value, body: substitute(term.body, name, replacement), ...sourcesFrom(term) };
      }
      const avoid = union(freeVars(term.body), replacementFree, new Set([name]));
      const fresh = freshName(term.name, avoid);
      return { kind: 'let', name: fresh, value, body: substitute(rename(term.body, term.name, fresh), name, replacement), ...sourcesFrom(term) };
    }
    case 'letrec': {
      if (term.name === name) return clone(term);
      const replacementFree = freeVars(replacement);
      if (!replacementFree.has(term.name)) {
        return { kind: 'letrec', name: term.name, value: substitute(term.value, name, replacement), body: substitute(term.body, name, replacement), ...sourcesFrom(term) };
      }
      const avoid = union(freeVars(term.value), freeVars(term.body), replacementFree, new Set([name]));
      const fresh = freshName(term.name, avoid);
      const renamed = rename(term, term.name, fresh);
      return substitute(renamed, name, replacement);
    }
    case 'fix':
      return { kind: 'fix', target: substitute(term.target, name, replacement), ...sourcesFrom(term) };
    case 'numop':
      return { kind: 'numop', op: term.op, left: substitute(term.left, name, replacement), right: substitute(term.right, name, replacement), ...sourcesFrom(term) };
    case 'boolop':
      return { kind: 'boolop', op: term.op, left: substitute(term.left, name, replacement), right: substitute(term.right, name, replacement), ...sourcesFrom(term) };
    case 'cmpop':
      return { kind: 'cmpop', op: term.op, left: substitute(term.left, name, replacement), right: substitute(term.right, name, replacement), ...sourcesFrom(term) };
    case 'if':
      return { kind: 'if', cond: substitute(term.cond, name, replacement), thenTerm: substitute(term.thenTerm, name, replacement), elseTerm: substitute(term.elseTerm, name, replacement), ...sourcesFrom(term) };
    default:
      return clone(term);
  }
}

function fixpointFor(term: Extract<Term, { kind: 'letrec' }>): Term {
  return {
    kind: 'fix',
    target: {
      kind: 'abs',
      param: term.name,
      body: term.value,
      ...sourcesFrom(term)
    },
    ...sourcesFrom(term)
  };
}

function isValue(term: Term): boolean {
  return term.kind === 'abs' || term.kind === 'num' || term.kind === 'bool';
}

function computePrimitive(term: Term): Term | null {
  if (term.kind === 'numop' && term.left.kind === 'num' && term.right.kind === 'num') {
    if (term.op === '+') return { kind: 'num', value: term.left.value + term.right.value, ...sourcesFrom(term) };
    if (term.op === '-') return { kind: 'num', value: term.left.value - term.right.value, ...sourcesFrom(term) };
    if (term.op === '*') return { kind: 'num', value: term.left.value * term.right.value, ...sourcesFrom(term) };
    if (term.op === '/') return { kind: 'num', value: term.right.value === 0 ? 0 : term.left.value / term.right.value, ...sourcesFrom(term) };
  }
  if (term.kind === 'boolop' && term.left.kind === 'bool' && term.right.kind === 'bool') {
    if (term.op === 'and') return { kind: 'bool', value: term.left.value && term.right.value, ...sourcesFrom(term) };
    if (term.op === 'or') return { kind: 'bool', value: term.left.value || term.right.value, ...sourcesFrom(term) };
    if (term.op === 'equal') return { kind: 'bool', value: term.left.value === term.right.value, ...sourcesFrom(term) };
  }
  if (term.kind === 'cmpop' && term.left.kind === 'num' && term.right.kind === 'num') {
    const l = term.left.value;
    const r = term.right.value;
    if (term.op === '=') return { kind: 'bool', value: l === r, ...sourcesFrom(term) };
    if (term.op === '<') return { kind: 'bool', value: l < r, ...sourcesFrom(term) };
    if (term.op === '<=') return { kind: 'bool', value: l <= r, ...sourcesFrom(term) };
    if (term.op === '>') return { kind: 'bool', value: l > r, ...sourcesFrom(term) };
    if (term.op === '>=') return { kind: 'bool', value: l >= r, ...sourcesFrom(term) };
  }
  return null;
}

function event(kind: ReductionEvent['kind'], redex: Term, result: Term, label: string): ReductionEvent {
  return { kind, redex: clone(redex), result: clone(result), label };
}

function reduceOnceDetailed(term: Term, kind: ReductionKind): { term: Term; changed: boolean; event?: ReductionEvent } {
  switch (term.kind) {
    case 'app': {
      if (term.func.kind === 'abs' && (kind === 'structure' || isValue(term.arg))) {
        const result = withSources(substitute(term.func.body, term.func.param, term.arg), term);
        return { term: result, changed: true, event: event('beta', term, result, `β-reduction for parameter ${term.func.param}`) };
      }

      const func = reduceOnceDetailed(term.func, kind);
      if (func.changed) {
        return { term: { kind: 'app', func: func.term, arg: term.arg, ...sourcesFrom(term) }, changed: true, event: func.event };
      }

      if (kind === 'value') {
        const arg = reduceOnceDetailed(term.arg, kind);
        if (arg.changed) {
          return { term: { kind: 'app', func: term.func, arg: arg.term, ...sourcesFrom(term) }, changed: true, event: arg.event };
        }
      }

      return { term, changed: false };
    }

    case 'let': {
      if (kind === 'value' && !isValue(term.value)) {
        const value = reduceOnceDetailed(term.value, kind);
        if (value.changed) {
          const result: Term = { kind: 'let', name: term.name, value: value.term, body: term.body, ...sourcesFrom(term) };
          return { term: result, changed: true, event: value.event ?? event('let-value', term.value, value.term, `evaluate let value ${term.name}`) };
        }
      }
      const result = withSources(substitute(term.body, term.name, term.value), term);
      return { term: result, changed: true, event: event('let', term, result, `let substitution for ${term.name}`) };
    }

    case 'letrec': {
      const result: Term = { kind: 'let', name: term.name, value: fixpointFor(term), body: term.body, ...sourcesFrom(term) };
      return { term: result, changed: true, event: event('letrec', term, result, `recursive binding ${term.name} as fixpoint`) };
    }

    case 'fix': {
      if (term.target.kind === 'abs') {
        const result = withSources(substitute(term.target.body, term.target.param, term), term);
        return { term: result, changed: true, event: event('fix', term, result, `unfold fixpoint ${term.target.param}`) };
      }
      const target = reduceOnceDetailed(term.target, kind);
      return target.changed ? { term: { kind: 'fix', target: target.term, ...sourcesFrom(term) }, changed: true, event: target.event } : { term, changed: false };
    }

    case 'numop':
    case 'boolop':
    case 'cmpop': {
      const left = reduceOnceDetailed(term.left, kind);
      if (left.changed) return { term: { ...term, left: left.term }, changed: true, event: left.event };
      const right = reduceOnceDetailed(term.right, kind);
      if (right.changed) return { term: { ...term, right: right.term }, changed: true, event: right.event };
      const primitive = computePrimitive(term);
      return primitive ? { term: primitive, changed: true, event: event('primitive', term, primitive, 'primitive computation') } : { term, changed: false };
    }

    case 'if': {
      const cond = reduceOnceDetailed(term.cond, kind);
      if (cond.changed) return { term: { ...term, cond: cond.term }, changed: true, event: cond.event };
      if (term.cond.kind === 'bool') {
        const result = withSources(clone(term.cond.value ? term.thenTerm : term.elseTerm), term);
        return { term: result, changed: true, event: event('if', term, result, term.cond.value ? 'select then branch' : 'select else branch') };
      }
      return { term, changed: false };
    }

    case 'abs':
      // A lambda is a value under BOTH strategies — neither reduces under a
      // binder, matching Block-based-MNL's CbS (its evaluator and Call-by-
      // Structure windows never reduce inside an abstraction; the body is
      // reduced only after an application substitutes the parameter). The
      // CEK machine agrees: a closure's body is entered only at beta.
      return { term, changed: false };

    default:
      return { term, changed: false };
  }
}

function reduceOnce(term: Term, kind: ReductionKind): { term: Term; changed: boolean } {
  const next = reduceOnceDetailed(term, kind);
  return { term: next.term, changed: next.changed };
}

function prettyRuntimeValue(term: Term): string {
  switch (term.kind) {
    case 'num': return Number.isInteger(term.value) ? String(term.value) : String(Number(term.value.toFixed(6)));
    case 'bool': return term.value ? 'true' : 'false';
    case 'abs': return 'function';
    case 'hole': return '';
    default: return `not a value: ${pretty(term)}`;
  }
}

function recordRuntimeValues(term: Term, values: Map<string, string>): void {
  if (isValue(term)) {
    for (const id of termSources(term)) values.set(id, prettyRuntimeValue(term));
  }

  switch (term.kind) {
    case 'abs':
      recordRuntimeValues(term.body, values);
      break;
    case 'app':
      recordRuntimeValues(term.func, values);
      recordRuntimeValues(term.arg, values);
      break;
    case 'let':
    case 'letrec':
      recordRuntimeValues(term.value, values);
      recordRuntimeValues(term.body, values);
      break;
    case 'fix':
      recordRuntimeValues(term.target, values);
      break;
    case 'numop':
    case 'boolop':
    case 'cmpop':
      recordRuntimeValues(term.left, values);
      recordRuntimeValues(term.right, values);
      break;
    case 'if':
      recordRuntimeValues(term.cond, values);
      recordRuntimeValues(term.thenTerm, values);
      recordRuntimeValues(term.elseTerm, values);
      break;
    default:
      break;
  }
}

function evaluate(term: Term, kind: ReductionKind, values?: Map<string, string>): Term {
  let current = clone(term);
  if (values) recordRuntimeValues(current, values);

  for (let i = 0; i < MAX_REDUCTION_STEPS; i++) {
    const next = reduceOnce(current, kind);
    if (!next.changed) {
      if (values) recordRuntimeValues(current, values);
      return current;
    }
    current = next.term;
    if (values) recordRuntimeValues(current, values);
  }

  if (values) {
    for (const id of termSources(current)) values.set(id, `stopped after ${MAX_REDUCTION_STEPS} steps: ${pretty(current)}`);
  }
  return current;
}

function envWithout(env: RuntimeEnv, name: string): RuntimeEnv {
  if (!env.has(name)) return env;
  const next = new Map(env);
  next.delete(name);
  return next;
}

function envWith(env: RuntimeEnv, name: string, value: Term): RuntimeEnv {
  const next = new Map(env);
  next.set(name, value);
  return next;
}

function evaluateWithEnv(
  term: Term,
  kind: ReductionKind,
  env: RuntimeEnv,
  resolving = new Set<string>(),
  depth = 0
): Term {
  if (depth > MAX_REDUCTION_STEPS) return clone(term);

  switch (term.kind) {
    case 'var': {
      const bound = env.get(term.name);
      if (!bound || resolving.has(term.name)) return clone(term);
      resolving.add(term.name);
      try {
        return withSources(evaluateWithEnv(bound, kind, env, resolving, depth + 1), term);
      } finally {
        resolving.delete(term.name);
      }
    }

    case 'abs':
      return clone(term);

    case 'app': {
      const func = evaluateWithEnv(term.func, kind, env, resolving, depth + 1);
      if (func.kind === 'abs') {
        const arg = kind === 'value'
          ? evaluateWithEnv(term.arg, kind, env, resolving, depth + 1)
          : clone(term.arg);
        const bodyEnv = envWithout(env, func.param);
        return evaluateWithEnv(withSources(substitute(func.body, func.param, arg), term), kind, bodyEnv, resolving, depth + 1);
      }
      const arg = kind === 'value' ? evaluateWithEnv(term.arg, kind, env, resolving, depth + 1) : clone(term.arg);
      return { kind: 'app', func, arg, ...sourcesFrom(term) };
    }

    case 'let': {
      const value = kind === 'value'
        ? evaluateWithEnv(term.value, kind, env, resolving, depth + 1)
        : clone(term.value);
      return evaluateWithEnv(term.body, kind, envWith(env, term.name, value), resolving, depth + 1);
    }

    case 'letrec':
      return evaluateWithEnv(term.body, kind, envWith(env, term.name, term.value), resolving, depth + 1);

    case 'fix': {
      const target = evaluateWithEnv(term.target, kind, env, resolving, depth + 1);
      if (target.kind !== 'abs') return { kind: 'fix', target, ...sourcesFrom(term) };
      return evaluateWithEnv(withSources(substitute(target.body, target.param, term), term), kind, env, resolving, depth + 1);
    }

    case 'numop':
    case 'boolop':
    case 'cmpop': {
      const left = evaluateWithEnv(term.left, kind, env, resolving, depth + 1);
      const right = evaluateWithEnv(term.right, kind, env, resolving, depth + 1);
      const primitive = computePrimitive({ ...term, left, right });
      return primitive ?? { ...term, left, right };
    }

    case 'if': {
      const cond = evaluateWithEnv(term.cond, kind, env, resolving, depth + 1);
      if (cond.kind === 'bool') {
        return evaluateWithEnv(cond.value ? term.thenTerm : term.elseTerm, kind, env, resolving, depth + 1);
      }
      return { ...term, cond };
    }

    default:
      return clone(term);
  }
}

function termToState(term: Term): any {
  switch (term.kind) {
    case 'var':
      return { type: 'lambda_variable', fields: { NAME: term.name } };
    case 'abs':
      return { type: 'lambda_abstraction', fields: { PARAM: term.param }, inputs: { BODY: { block: termToState(term.body) } } };
    case 'app':
      return { type: 'lambda_application', inputs: { FUNC: { block: termToState(term.func) }, ARG: { block: termToState(term.arg) } } };
    case 'let':
      return { type: 'lambda_let', fields: { NAME: term.name }, inputs: { VALUE: { block: termToState(term.value) }, BODY: { block: termToState(term.body) } } };
    case 'letrec':
      return { type: 'lambda_letrec', fields: { NAME: term.name }, inputs: { VALUE: { block: termToState(term.value) }, BODY: { block: termToState(term.body) } } };
    case 'fix':
      return { type: 'lambda_application', inputs: { FUNC: { block: { type: 'lambda_variable', fields: { NAME: 'fix' } } }, ARG: { block: termToState(term.target) } } };
    case 'num':
      return { type: 'lambda_number', fields: { VALUE: term.value } };
    case 'bool':
      return { type: 'lambda_boolean', fields: { VALUE: term.value ? 'true' : 'false' } };
    case 'numop':
      return { type: 'lambda_number_operator', fields: { OP: term.op }, inputs: { LEFT: { block: termToState(term.left) }, RIGHT: { block: termToState(term.right) } } };
    case 'boolop':
      return { type: 'lambda_boolean_operator', fields: { OP: term.op }, inputs: { LEFT: { block: termToState(term.left) }, RIGHT: { block: termToState(term.right) } } };
    case 'cmpop':
      return { type: 'lambda_number_comparison', fields: { OP: term.op }, inputs: { LEFT: { block: termToState(term.left) }, RIGHT: { block: termToState(term.right) } } };
    case 'if':
      return { type: 'lambda_if', inputs: { COND: { block: termToState(term.cond) }, THEN: { block: termToState(term.thenTerm) }, ELSE: { block: termToState(term.elseTerm) } } };
    case 'hole':
      return { type: 'lambda_variable', fields: { NAME: term.label } };
  }
}

function pretty(term: Term): string {
  switch (term.kind) {
    case 'var': return term.name;
    case 'abs': return `λ${term.param}. ${pretty(term.body)}`;
    case 'app': return `(${pretty(term.func)} ${pretty(term.arg)})`;
    case 'let': return `let ${term.name} = ${pretty(term.value)} in ${pretty(term.body)}`;
    case 'letrec': return `letrec ${term.name} = ${pretty(term.value)} in ${pretty(term.body)}`;
    case 'fix': return `fix (${pretty(term.target)})`;
    case 'num': return String(term.value);
    case 'bool': return String(term.value);
    case 'numop':
    case 'boolop':
    case 'cmpop': return `(${pretty(term.left)} ${term.op} ${pretty(term.right)})`;
    case 'if': return `if ${pretty(term.cond)} then ${pretty(term.thenTerm)} else ${pretty(term.elseTerm)}`;
    case 'hole': return term.label;
  }
}

function prettyPreview(term: Term, maxLength = 260): string {
  const text = pretty(term);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function termSize(term: Term): number {
  switch (term.kind) {
    case 'abs':
      return 1 + termSize(term.body);
    case 'app':
      return 1 + termSize(term.func) + termSize(term.arg);
    case 'let':
    case 'letrec':
      return 1 + termSize(term.value) + termSize(term.body);
    case 'fix':
      return 1 + termSize(term.target);
    case 'numop':
    case 'boolop':
      return 1 + termSize(term.left) + termSize(term.right);
    case 'if':
      return 1 + termSize(term.cond) + termSize(term.thenTerm) + termSize(term.elseTerm);
    default:
      return 1;
  }
}

function append(state: any, workspace: Blockly.WorkspaceSvg): Blockly.BlockSvg {
  return Blockly.serialization.blocks.append(clone(state), workspace) as Blockly.BlockSvg;
}

function label(workspace: Blockly.WorkspaceSvg, text: string): Blockly.BlockSvg {
  const block = workspace.newBlock('lambda_viz_description') as Blockly.BlockSvg;
  block.setFieldValue(text, 'TEXT');
  if (workspace.rendered) {
    block.initSvg();
    block.render();
  }
  return block;
}

function comment(block: Blockly.Block | null, text: string): void {
  try {
    block?.setCommentText(text);
  } catch {
    /* Detached visualization workspaces may skip comment rendering. */
  }
}

function termCommentText(term: Term, runtimeValue: Term = term, note?: string): string {
  const size = termSize(term);
  const value = isValue(runtimeValue) ? prettyRuntimeValue(runtimeValue) : 'not yet a value';
  const base = `term:\n${prettyPreview(term)}\n\nvalue:\n${value}\n\nnodes:\n${size}`;
  return note ? `${base}\n\n${note}` : base;
}

function annotate(root: Blockly.Block, term: Term, runtimeValue: Term = term, note?: string): void {
  comment(root, termCommentText(term, runtimeValue, note));
}

function appendToOrder(order: BlockOrder, block: Blockly.BlockSvg): void {
  order.map[order.order] = block.id;
  order.order += 1;
}

function appendLabel(workspace: Blockly.WorkspaceSvg, order: BlockOrder, text: string, note?: string): Blockly.BlockSvg {
  const block = label(workspace, text);
  if (note) comment(block, note);
  appendToOrder(order, block);
  return block;
}

function appendTerm(
  workspace: Blockly.WorkspaceSvg,
  order: BlockOrder,
  term: Term,
  note?: string,
  runtimeValue: Term = term
): Blockly.BlockSvg {
  if (termSize(term) > MAX_RENDERED_TERM_SIZE) {
    const omitted = label(workspace, `Term omitted: ${termSize(term)} nodes`);
    comment(omitted, note ?? 'The term is too large to render safely in the visualization workspace.');
    appendToOrder(order, omitted);
    return omitted;
  }
  const block = append(termToState(term), workspace);
  annotate(block, term, runtimeValue, note);
  appendToOrder(order, block);
  return block;
}

function blockHeight(block: Blockly.BlockSvg): number {
  const dimensions = (block as any).getHeightWidth?.();
  if (dimensions?.height) return Number(dimensions.height);
  try {
    return block.getSvgRoot()?.getBBox?.().height ?? 48;
  } catch {
    return 48;
  }
}

export function arrangeBlocksVertically(workspace: Blockly.WorkspaceSvg, order: BlockOrder, vspace = 32): void {
  if (!workspace.rendered) return;
  Blockly.Events.disable();
  try {
    let cursorY = 0;
    for (let i = 0; i <= order.order; i++) {
      const block = workspace.getBlockById(order.map[i]) as Blockly.BlockSvg | null;
      if (!block) continue;
      const xy = block.getRelativeToSurfaceXY();
      block.moveBy(-xy.x, cursorY - xy.y);
      cursorY = block.getRelativeToSurfaceXY().y + blockHeight(block) + vspace;
    }
  } finally {
    Blockly.Events.enable();
  }
}

export function arrangeTopBlocks(workspace: Blockly.WorkspaceSvg): void {
  const order = newOrder();
  for (const block of workspace.getTopBlocks(false)) {
    appendToOrder(order, block as Blockly.BlockSvg);
  }
  arrangeBlocksVertically(workspace, order);
}

function titleFor(kind: ReductionKind): string {
  return kind === 'value' ? 'Call-by-Value' : 'Call-by-Structure';
}

/* ----------------------------------------------------------- step-through */
/* A discrete, navigable reduction: the whole current term is serialized at
   every small step so the stepper UI can render one state at a time and move
   back and forth by index. This reuses the same reduceOnceDetailed engine that
   the full-trace view uses, so the stepper and the trace never disagree. */

export interface ReductionFrame {
  /** 0 = the initial term; each later frame is one small step further. */
  index: number;
  /** termToState(term) — a serialized block tree for the whole current term. */
  state: unknown;
  /** The event kind that produced this frame ('initial' for frame 0). */
  rule: string;
  /** Human-readable description of the step that produced this frame. */
  label: string;
  /** The frame's value text when it is a value; '' otherwise. */
  value: string;
  /** Salient rule id ('beta', 'if-true', 'prim +', …) when this step is one
      the CEK machine must also fire, in the same order; null otherwise. */
  salient: string | null;
}

export interface ReductionRun {
  frames: ReductionFrame[];
  /** True when the step budget was hit before reaching a normal form. */
  truncated: boolean;
  /** True when reduction reached an irreducible term within the budget. */
  normalForm: boolean;
  /** Pretty value (or "not a value: …") of the final frame's term. */
  finalValue: string;
}

/** Resolve free variables bound by enclosing let/letrec blocks in the workspace. */
function inlineEnv(term: Term, env: RuntimeEnv): Term {
  let resolved = term;
  for (const [name, value] of env) resolved = substitute(resolved, name, value);
  return resolved;
}

/** The salient rule id of a reduction event — the rules the machine mirrors. */
function salientOf(ev: ReductionEvent | undefined): string | null {
  if (!ev || ev.underLambda) return null;
  if (ev.kind === 'beta') return 'beta';
  if (ev.kind === 'if' && ev.redex.kind === 'if' && ev.redex.cond.kind === 'bool') {
    return ev.redex.cond.value ? 'if-true' : 'if-false';
  }
  if (ev.kind === 'primitive' && (ev.redex.kind === 'numop' || ev.redex.kind === 'boolop' || ev.redex.kind === 'cmpop')) {
    return `prim ${ev.redex.op}`;
  }
  return null;
}

/** Compute the full sequence of reduction states for a block, one per small step. */
export function computeReductionRun(block: Blockly.Block, kind: ReductionKind): ReductionRun {
  let term = inlineEnv(blockToTerm(block), contextualEnvForBlock(block));
  const frames: ReductionFrame[] = [];
  const push = (rule: string, label: string, salient: string | null): void => {
    frames.push({
      index: frames.length,
      state: termToState(term),
      rule,
      label,
      value: isValue(term) ? prettyRuntimeValue(term) : '',
      salient
    });
  };

  push('initial', 'Initial term', null);

  let steps = 0;
  for (; steps < MAX_REDUCTION_STEPS; steps++) {
    const next = reduceOnceDetailed(term, kind);
    if (!next.changed) break;
    term = next.term;
    push(next.event?.kind ?? 'context', next.event?.label ?? 'reduction step', salientOf(next.event));
  }

  const truncated = steps >= MAX_REDUCTION_STEPS;
  return { frames, truncated, normalForm: !truncated, finalValue: prettyRuntimeValue(term) };
}

function parameterValueNote(original: Term, evaluated: Term, kind: ReductionKind): string {
  const strategy = kind === 'value' ? 'CBV' : 'CBS';
  const summary = isValue(evaluated) ? prettyRuntimeValue(evaluated) : prettyPreview(evaluated);
  return `${strategy} evaluates the parameter first.\n\nParameter evaluation result:\n${summary}`;
}

function mnlStrategyName(kind: ReductionKind): string {
  return kind === 'value' ? 'CbV' : 'CbS';
}

function reductionOnTerm(term: Term, ctx: ReductionRenderContext, env: RuntimeEnv): Term {
  if (ctx.truncated) return evaluateWithEnv(term, ctx.kind, env);

  switch (term.kind) {
    case 'var': {
      const bound = env.get(term.name);
      if (!bound || ctx.resolving.has(term.name)) return clone(term);
      ctx.resolving.add(term.name);
      try {
        return withSources(reductionOnTerm(bound, ctx, env), term);
      } finally {
        ctx.resolving.delete(term.name);
      }
    }

    case 'abs':
      reductionOnTerm(term.body, ctx, envWithout(env, term.param));
      return clone(term);

    case 'app': {
      const funcValue = reductionOnTerm(term.func, ctx, env);
      const argValue = reductionOnTerm(term.arg, ctx, env);
      if (funcValue.kind === 'abs') {
        return renderBetaReductionTerm(funcValue.body, funcValue.param, term.arg, ctx, env);
      }
      return { kind: 'app', func: funcValue, arg: argValue, ...sourcesFrom(term) };
    }

    case 'let': {
      const value = reductionOnTerm(term.value, ctx, env);
      return reductionOnTerm(term.body, ctx, envWith(env, term.name, ctx.kind === 'value' ? value : term.value));
    }

    case 'letrec':
      return reductionOnTerm(term.body, ctx, envWith(env, term.name, term.value));

    case 'fix': {
      const target = reductionOnTerm(term.target, ctx, env);
      if (target.kind !== 'abs') return { kind: 'fix', target, ...sourcesFrom(term) };
      return reductionOnTerm(withSources(substitute(target.body, target.param, term), term), ctx, env);
    }

    case 'numop':
    case 'boolop': {
      const left = reductionOnTerm(term.left, ctx, env);
      const right = reductionOnTerm(term.right, ctx, env);
      const primitive = computePrimitive({ ...term, left, right });
      return primitive ?? { ...term, left, right };
    }

    case 'if': {
      const cond = reductionOnTerm(term.cond, ctx, env);
      if (cond.kind === 'bool') return reductionOnTerm(cond.value ? term.thenTerm : term.elseTerm, ctx, env);
      return { ...term, cond };
    }

    default:
      return clone(term);
  }
}

function renderBetaReductionTerm(
  functionBody: Term,
  parameter: string,
  originalArgument: Term,
  ctx: ReductionRenderContext,
  env: RuntimeEnv
): Term {
  if (ctx.betaCount >= MAX_VISUALIZATION_STEPS) {
    ctx.truncated = true;
    return evaluateWithEnv({ kind: 'app', func: { kind: 'abs', param: parameter, body: functionBody }, arg: originalArgument }, ctx.kind, env);
  }
  ctx.betaCount += 1;

  const evaluatedArgument = reductionOnTerm(originalArgument, ctx, env);
  const displayedArgument = ctx.kind === 'value' ? evaluatedArgument : originalArgument;
  const substitutionArgument = ctx.kind === 'value' ? evaluatedArgument : originalArgument;
  const parameterNote = `${parameterValueNote(originalArgument, evaluatedArgument, ctx.kind)}\n\nParameter: ${parameter}`;

  appendLabel(
    ctx.workspace,
    ctx.order,
    'Substituted block for parameter',
    ctx.kind === 'value'
      ? 'CBV substitutes the evaluated value block.'
      : 'CBS substitutes the original block structure after evaluating it for annotations.'
  );
  appendTerm(ctx.workspace, ctx.order, displayedArgument, parameterNote, evaluatedArgument);

  const body = substitute(functionBody, parameter, substitutionArgument);
  appendLabel(ctx.workspace, ctx.order, `Function body of ${mnlStrategyName(ctx.kind)}`);
  const bodyBlock = appendTerm(ctx.workspace, ctx.order, body);
  const bodyValue = reductionOnTerm(body, ctx, envWithout(env, parameter));
  annotate(bodyBlock, body, bodyValue);
  return bodyValue;
}

export function renderLambdaReduction(appBlock: Blockly.Block, workspace: Blockly.WorkspaceSvg, kind: ReductionKind): BlockOrder {
  const order = newOrder();
  const initial = blockToTerm(appBlock);
  const env = contextualEnvForBlock(appBlock);
  const ctx: ReductionRenderContext = {
    workspace,
    order,
    kind,
    betaCount: 0,
    truncated: false,
    resolving: new Set()
  };

  if (initial.kind === 'app') {
    const funcValue = evaluateWithEnv(initial.func, kind, env);
    if (funcValue.kind === 'abs') {
      renderBetaReductionTerm(funcValue.body, funcValue.param, initial.arg, ctx, env);
    } else {
      reductionOnTerm(initial, ctx, env);
    }
  } else {
    reductionOnTerm(initial, ctx, env);
  }

  if (ctx.truncated) {
    appendLabel(
      workspace,
      order,
      `${titleFor(kind)} trace limit reached`,
      `Only the first ${MAX_VISUALIZATION_STEPS} beta reductions are shown to keep the workspace usable.`
    );
  }

  if (order.order === 0) {
    const value = evaluateWithEnv(initial, kind, env);
    appendLabel(workspace, order, `${titleFor(kind)} block`, 'No reducible beta-redex was found for the selected application.');
    appendTerm(workspace, order, initial, undefined, value);
  }

  arrangeBlocksVertically(workspace, order, 38);
  return order;
}

export function renderCopiedTerm(block: Blockly.Block, workspace: Blockly.WorkspaceSvg, kind: ReductionKind): BlockOrder {
  return renderLambdaReduction(block, workspace, kind);
}

export function generatedStateForBlock(block: Blockly.Block, kind: ReductionKind): any {
  return termToState(evaluate(blockToTerm(block), kind));
}

export function runtimeValueTextsForWorkspace(workspace: Blockly.Workspace, kind: ReductionKind = 'structure'): Map<string, string> {
  const values = new Map<string, string>();
  const topBlocks = workspace.getTopBlocks(true).filter((block) => !block.getParent() && isLambdaTermBlock(block));

  for (const block of topBlocks) {
    evaluate(blockToTerm(block), kind, values);
  }

  for (const block of workspace.getAllBlocks(false).filter(isLambdaTermBlock)) {
    if (!values.has(block.id)) values.set(block.id, reducedTextForBlock(block, kind));
  }

  return values;
}

export function reducedTextForBlock(block: Blockly.Block, kind: ReductionKind): string {
  return prettyRuntimeValue(evaluate(blockToTerm(block), kind));
}
