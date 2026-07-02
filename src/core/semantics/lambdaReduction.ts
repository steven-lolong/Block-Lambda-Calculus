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
  | { kind: 'if'; cond: Term; thenTerm: Term; elseTerm: Term }
  | { kind: 'hole'; label: string }
);

type ReductionEvent = {
  kind: 'beta' | 'let' | 'let-value' | 'letrec' | 'fix' | 'primitive' | 'if' | 'context';
  redex: Term;
  result: Term;
  label: string;
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
  if (term.kind === 'boolop') {
    if (term.op === '=' && term.left.kind === term.right.kind) {
      if (term.left.kind === 'num' && term.right.kind === 'num') return { kind: 'bool', value: term.left.value === term.right.value, ...sourcesFrom(term) };
      if (term.left.kind === 'bool' && term.right.kind === 'bool') return { kind: 'bool', value: term.left.value === term.right.value, ...sourcesFrom(term) };
    }
    if (term.left.kind === 'bool' && term.right.kind === 'bool') {
      if (term.op === 'and') return { kind: 'bool', value: term.left.value && term.right.value, ...sourcesFrom(term) };
      if (term.op === 'or') return { kind: 'bool', value: term.left.value || term.right.value, ...sourcesFrom(term) };
    }
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
    case 'boolop': {
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

    case 'abs': {
      if (kind === 'value') return { term, changed: false };
      const body = reduceOnceDetailed(term.body, kind);
      return body.changed ? { term: { kind: 'abs', param: term.param, body: body.term, ...sourcesFrom(term) }, changed: true, event: body.event } : { term, changed: false };
    }

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
    case 'boolop': return `(${pretty(term.left)} ${term.op} ${pretty(term.right)})`;
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

function annotate(root: Blockly.Block, term: Term): void {
  const size = termSize(term);
  const value = isValue(term) ? prettyRuntimeValue(term) : 'not yet a value';
  comment(root, `term:\n${prettyPreview(term)}\n\nvalue:\n${value}\n\nnodes:\n${size}`);
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

function appendTerm(workspace: Blockly.WorkspaceSvg, order: BlockOrder, term: Term, note?: string): Blockly.BlockSvg {
  if (termSize(term) > MAX_RENDERED_TERM_SIZE) {
    const omitted = label(workspace, `Term omitted: ${termSize(term)} nodes`);
    comment(omitted, note ?? 'The term is too large to render safely in the visualization workspace.');
    appendToOrder(order, omitted);
    return omitted;
  }
  const block = append(termToState(term), workspace);
  annotate(block, term);
  if (note) comment(block, `${block.getCommentText() ?? ''}\n\n${note}`.trim());
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

function displayArgumentForEvent(eventInfo: ReductionEvent, kind: ReductionKind): Term | null {
  if (eventInfo.kind !== 'beta' || eventInfo.redex.kind !== 'app') return null;
  return kind === 'value' ? evaluate(eventInfo.redex.arg, kind) : eventInfo.redex.arg;
}

function renderMnlStyleBetaDetails(workspace: Blockly.WorkspaceSvg, order: BlockOrder, eventInfo: ReductionEvent, kind: ReductionKind): void {
  if (eventInfo.kind !== 'beta' || eventInfo.redex.kind !== 'app' || eventInfo.redex.func.kind !== 'abs') return;
  const title = titleFor(kind);
  const parameter = eventInfo.redex.func.param;
  const argument = displayArgumentForEvent(eventInfo, kind);

  appendLabel(
    workspace,
    order,
    `Substituted block for parameter ${parameter}`,
    kind === 'value'
      ? 'CBV first reduces the argument to a value, then substitutes that value block.'
      : 'CBS substitutes the argument block structure directly, preserving its visual structure.'
  );
  if (argument) appendTerm(workspace, order, argument);

  appendLabel(workspace, order, `Function body of ${title}`, 'The body after substituting the parameter occurrence(s).');
  appendTerm(workspace, order, eventInfo.result);
}

function appendReductionState(
  workspace: Blockly.WorkspaceSvg,
  order: BlockOrder,
  eventInfo: ReductionEvent | undefined,
  wholeTermAfterStep: Term,
  kind: ReductionKind,
  index: number
): void {
  const title = titleFor(kind);
  const stepLabel = eventInfo?.label ?? 'structural reduction';
  appendLabel(workspace, order, `${title} step ${index}: ${stepLabel}`);

  if (eventInfo?.kind === 'beta') {
    renderMnlStyleBetaDetails(workspace, order, eventInfo, kind);
  } else if (eventInfo) {
    appendLabel(workspace, order, 'Reduced block');
    appendTerm(workspace, order, eventInfo.redex);
    appendLabel(workspace, order, 'Reduction result');
    appendTerm(workspace, order, eventInfo.result);
  }

  appendLabel(workspace, order, `Program after step ${index}`, 'Full block-structured program state after this single reduction.');
  appendTerm(workspace, order, wholeTermAfterStep);
}

export function renderLambdaReduction(appBlock: Blockly.Block, workspace: Blockly.WorkspaceSvg, kind: ReductionKind): BlockOrder {
  const order = newOrder();
  const title = titleFor(kind);
  const initial = blockToTerm(appBlock);
  let current = clone(initial);

  appendLabel(workspace, order, `${title} input`, 'The selected application from the main workspace.');
  appendTerm(workspace, order, current);

  let reachedLimit = false;
  for (let index = 1; index <= MAX_VISUALIZATION_STEPS; index += 1) {
    const next = reduceOnceDetailed(current, kind);
    if (!next.changed) break;
    appendReductionState(workspace, order, next.event, next.term, kind, index);
    current = next.term;

    if (termSize(current) > MAX_RENDERED_TERM_SIZE * 2) {
      reachedLimit = true;
      appendLabel(
        workspace,
        order,
        `${title} trace truncated`,
        `The intermediate term reached ${termSize(current)} nodes. The visible trace stops here to keep Blockly responsive.`
      );
      break;
    }
  }

  if (!reachedLimit) {
    const next = reduceOnceDetailed(current, kind);
    if (next.changed) {
      appendLabel(
        workspace,
        order,
        `${title} trace limit reached`,
        `Only the first ${MAX_VISUALIZATION_STEPS} single-step reductions are shown to keep the workspace usable.`
      );
    }
  }

  appendLabel(workspace, order, `${title} result`, 'Final visible result of the rendered reduction sequence.');
  appendTerm(workspace, order, current);
  arrangeBlocksVertically(workspace, order, 38);
  return order;
}

export function renderCopiedTerm(block: Blockly.Block, workspace: Blockly.WorkspaceSvg, kind: ReductionKind): BlockOrder {
  return renderLambdaReduction(block, workspace, kind);
}

export function generatedStateForBlock(block: Blockly.Block, kind: ReductionKind): any {
  return termToState(evaluate(blockToTerm(block), kind));
}

export function runtimeValueTextsForWorkspace(workspace: Blockly.Workspace, kind: ReductionKind = 'value'): Map<string, string> {
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
