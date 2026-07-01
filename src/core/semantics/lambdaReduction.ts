import * as Blockly from 'blockly';

export type ReductionKind = 'structure' | 'value';

export interface BlockOrder {
  order: number;
  map: Record<number, string>;
}

type Term =
  | { kind: 'var'; name: string }
  | { kind: 'abs'; param: string; body: Term }
  | { kind: 'app'; func: Term; arg: Term }
  | { kind: 'let'; name: string; value: Term; body: Term }
  | { kind: 'num'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'numop'; op: string; left: Term; right: Term }
  | { kind: 'boolop'; op: string; left: Term; right: Term }
  | { kind: 'if'; cond: Term; thenTerm: Term; elseTerm: Term }
  | { kind: 'hole'; label: string };

const FULL_BLOCK = { addInputBlocks: true, addNextBlocks: false } as any;
const MAX_REDUCTION_STEPS = 160;

const newOrder = (): BlockOrder => ({ order: 0, map: {} });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function field(block: Blockly.Block, name: string, fallback = ''): string {
  const value = block.getFieldValue(name);
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function child(block: Blockly.Block, inputName: string): Blockly.Block | null {
  return block.getInputTargetBlock(inputName);
}

function blockToTerm(block: Blockly.Block | null): Term {
  if (!block) return { kind: 'hole', label: '□' };
  switch (block.type) {
    case 'lambda_variable':
      return { kind: 'var', name: field(block, 'NAME', 'x') };
    case 'lambda_abstraction':
      return { kind: 'abs', param: field(block, 'PARAM', 'x'), body: blockToTerm(child(block, 'BODY')) };
    case 'lambda_application':
      return { kind: 'app', func: blockToTerm(child(block, 'FUNC')), arg: blockToTerm(child(block, 'ARG')) };
    case 'lambda_parentheses':
      return blockToTerm(child(block, 'TERM'));
    case 'lambda_let':
      return { kind: 'let', name: field(block, 'NAME', 'id'), value: blockToTerm(child(block, 'VALUE')), body: blockToTerm(child(block, 'BODY')) };
    case 'lambda_number':
      return { kind: 'num', value: Number(field(block, 'VALUE', '0')) || 0 };
    case 'lambda_boolean':
      return { kind: 'bool', value: field(block, 'VALUE', 'true') === 'true' };
    case 'lambda_number_operator':
      return { kind: 'numop', op: field(block, 'OP', '+'), left: blockToTerm(child(block, 'LEFT')), right: blockToTerm(child(block, 'RIGHT')) };
    case 'lambda_boolean_operator':
      return { kind: 'boolop', op: field(block, 'OP', 'and'), left: blockToTerm(child(block, 'LEFT')), right: blockToTerm(child(block, 'RIGHT')) };
    case 'lambda_if':
      return {
        kind: 'if',
        cond: blockToTerm(child(block, 'COND')),
        thenTerm: blockToTerm(child(block, 'THEN')),
        elseTerm: blockToTerm(child(block, 'ELSE'))
      };
    default:
      return { kind: 'hole', label: block.type };
  }
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
    case 'numop':
    case 'boolop':
      return union(freeVars(term.left), freeVars(term.right));
    case 'if':
      return union(freeVars(term.cond), freeVars(term.thenTerm), freeVars(term.elseTerm));
    default:
      return new Set();
  }
}

function union(...sets: Set<string>[]): Set<string> {
  const result = new Set<string>();
  for (const set of sets) for (const value of set) result.add(value);
  return result;
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
      return term.name === from ? { kind: 'var', name: to } : clone(term);
    case 'abs':
      return {
        kind: 'abs',
        param: term.param === from ? to : term.param,
        body: rename(term.body, from, to)
      };
    case 'app':
      return { kind: 'app', func: rename(term.func, from, to), arg: rename(term.arg, from, to) };
    case 'let':
      return {
        kind: 'let',
        name: term.name === from ? to : term.name,
        value: rename(term.value, from, to),
        body: rename(term.body, from, to)
      };
    case 'numop':
      return { kind: 'numop', op: term.op, left: rename(term.left, from, to), right: rename(term.right, from, to) };
    case 'boolop':
      return { kind: 'boolop', op: term.op, left: rename(term.left, from, to), right: rename(term.right, from, to) };
    case 'if':
      return {
        kind: 'if',
        cond: rename(term.cond, from, to),
        thenTerm: rename(term.thenTerm, from, to),
        elseTerm: rename(term.elseTerm, from, to)
      };
    default:
      return clone(term);
  }
}

function substitute(term: Term, name: string, replacement: Term): Term {
  switch (term.kind) {
    case 'var':
      return term.name === name ? clone(replacement) : clone(term);
    case 'abs': {
      if (term.param === name) return clone(term);
      const replacementFree = freeVars(replacement);
      if (!replacementFree.has(term.param)) {
        return { kind: 'abs', param: term.param, body: substitute(term.body, name, replacement) };
      }
      const avoid = union(freeVars(term.body), replacementFree, new Set([name]));
      const fresh = freshName(term.param, avoid);
      const renamedBody = rename(term.body, term.param, fresh);
      return { kind: 'abs', param: fresh, body: substitute(renamedBody, name, replacement) };
    }
    case 'app':
      return { kind: 'app', func: substitute(term.func, name, replacement), arg: substitute(term.arg, name, replacement) };
    case 'let': {
      const value = substitute(term.value, name, replacement);
      if (term.name === name) return { kind: 'let', name: term.name, value, body: clone(term.body) };
      const replacementFree = freeVars(replacement);
      if (!replacementFree.has(term.name)) {
        return { kind: 'let', name: term.name, value, body: substitute(term.body, name, replacement) };
      }
      const avoid = union(freeVars(term.body), replacementFree, new Set([name]));
      const fresh = freshName(term.name, avoid);
      return { kind: 'let', name: fresh, value, body: substitute(rename(term.body, term.name, fresh), name, replacement) };
    }
    case 'numop':
      return { kind: 'numop', op: term.op, left: substitute(term.left, name, replacement), right: substitute(term.right, name, replacement) };
    case 'boolop':
      return { kind: 'boolop', op: term.op, left: substitute(term.left, name, replacement), right: substitute(term.right, name, replacement) };
    case 'if':
      return {
        kind: 'if',
        cond: substitute(term.cond, name, replacement),
        thenTerm: substitute(term.thenTerm, name, replacement),
        elseTerm: substitute(term.elseTerm, name, replacement)
      };
    default:
      return clone(term);
  }
}

function isValue(term: Term): boolean {
  return term.kind === 'abs' || term.kind === 'num' || term.kind === 'bool';
}

function computePrimitive(term: Term): Term | null {
  if (term.kind === 'numop' && term.left.kind === 'num' && term.right.kind === 'num') {
    if (term.op === '+') return { kind: 'num', value: term.left.value + term.right.value };
    if (term.op === '-') return { kind: 'num', value: term.left.value - term.right.value };
    if (term.op === '*') return { kind: 'num', value: term.left.value * term.right.value };
    if (term.op === '/') return { kind: 'num', value: term.right.value === 0 ? 0 : term.left.value / term.right.value };
  }
  if (term.kind === 'boolop') {
    if (term.op === '=' && term.left.kind === term.right.kind) {
      if (term.left.kind === 'num' && term.right.kind === 'num') return { kind: 'bool', value: term.left.value === term.right.value };
      if (term.left.kind === 'bool' && term.right.kind === 'bool') return { kind: 'bool', value: term.left.value === term.right.value };
    }
    if (term.left.kind === 'bool' && term.right.kind === 'bool') {
      if (term.op === 'and') return { kind: 'bool', value: term.left.value && term.right.value };
      if (term.op === 'or') return { kind: 'bool', value: term.left.value || term.right.value };
    }
  }
  return null;
}

function reduceOnce(term: Term, kind: ReductionKind): { term: Term; changed: boolean } {
  switch (term.kind) {
    case 'app': {
      if (term.func.kind === 'abs' && (kind === 'structure' || isValue(term.arg))) {
        return { term: substitute(term.func.body, term.func.param, term.arg), changed: true };
      }
      const func = reduceOnce(term.func, kind);
      if (func.changed) return { term: { kind: 'app', func: func.term, arg: term.arg }, changed: true };
      if (kind === 'value') {
        const arg = reduceOnce(term.arg, kind);
        if (arg.changed) return { term: { kind: 'app', func: term.func, arg: arg.term }, changed: true };
      }
      return { term, changed: false };
    }
    case 'let':
      return { term: substitute(term.body, term.name, kind === 'value' ? evaluate(term.value, kind) : term.value), changed: true };
    case 'numop':
    case 'boolop': {
      const left = reduceOnce(term.left, kind);
      if (left.changed) return { term: { ...term, left: left.term }, changed: true };
      const right = reduceOnce(term.right, kind);
      if (right.changed) return { term: { ...term, right: right.term }, changed: true };
      const primitive = computePrimitive(term);
      return primitive ? { term: primitive, changed: true } : { term, changed: false };
    }
    case 'if': {
      const cond = reduceOnce(term.cond, kind);
      if (cond.changed) return { term: { ...term, cond: cond.term }, changed: true };
      if (term.cond.kind === 'bool') return { term: term.cond.value ? term.thenTerm : term.elseTerm, changed: true };
      return { term, changed: false };
    }
    case 'abs': {
      const body = reduceOnce(term.body, kind);
      return body.changed ? { term: { kind: 'abs', param: term.param, body: body.term }, changed: true } : { term, changed: false };
    }
    default:
      return { term, changed: false };
  }
}

function evaluate(term: Term, kind: ReductionKind): Term {
  let current = clone(term);
  for (let i = 0; i < MAX_REDUCTION_STEPS; i++) {
    const next = reduceOnce(current, kind);
    if (!next.changed) return current;
    current = next.term;
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
    case 'num':
      return { type: 'lambda_number', fields: { VALUE: term.value } };
    case 'bool':
      return { type: 'lambda_boolean', fields: { VALUE: term.value ? 'true' : 'false' } };
    case 'numop':
      return { type: 'lambda_number_operator', fields: { OP: term.op }, inputs: { LEFT: { block: termToState(term.left) }, RIGHT: { block: termToState(term.right) } } };
    case 'boolop':
      return { type: 'lambda_boolean_operator', fields: { OP: term.op }, inputs: { LEFT: { block: termToState(term.left) }, RIGHT: { block: termToState(term.right) } } };
    case 'if':
      return {
        type: 'lambda_if',
        inputs: {
          COND: { block: termToState(term.cond) },
          THEN: { block: termToState(term.thenTerm) },
          ELSE: { block: termToState(term.elseTerm) }
        }
      };
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
    case 'num': return String(term.value);
    case 'bool': return String(term.value);
    case 'numop':
    case 'boolop': return `(${pretty(term.left)} ${term.op} ${pretty(term.right)})`;
    case 'if': return `if ${pretty(term.cond)} then ${pretty(term.thenTerm)} else ${pretty(term.elseTerm)}`;
    case 'hole': return term.label;
  }
}

function save(block: Blockly.Block): any {
  return Blockly.serialization.blocks.save(block, FULL_BLOCK);
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

function annotate(root: Blockly.Block, term: Term): void {
  try {
    root.setCommentText(`term:\n${pretty(term)}`);
  } catch {
    /* Comment rendering is best-effort in detached workspaces. */
  }
}

export function arrangeBlocksVertically(workspace: Blockly.WorkspaceSvg, order: BlockOrder, vspace = 32): void {
  if (!workspace.rendered) return;
  Blockly.Events.disable();
  try {
    let cursorY = 0;
    for (let i = 0; i <= order.order; i++) {
      const block = workspace.getBlockById(order.map[i]) as Blockly.BlockSvg | null;
      if (!block?.isMovable()) continue;
      const xy = block.getRelativeToSurfaceXY();
      block.moveBy(-xy.x, cursorY - xy.y);
      cursorY = block.getRelativeToSurfaceXY().y + block.getHeightWidth().height + vspace;
    }
  } finally {
    Blockly.Events.enable();
  }
}

export function arrangeTopBlocks(workspace: Blockly.WorkspaceSvg): void {
  const order = newOrder();
  for (const block of workspace.getTopBlocks(false)) {
    order.map[order.order] = block.id;
    order.order += 1;
  }
  arrangeBlocksVertically(workspace, order);
}

export function renderLambdaReduction(appBlock: Blockly.Block, workspace: Blockly.WorkspaceSvg, kind: ReductionKind): BlockOrder {
  const order = newOrder();
  const func = child(appBlock, 'FUNC');
  const arg = child(appBlock, 'ARG');
  const funcTerm = blockToTerm(func);
  const argTerm = blockToTerm(arg);
  const reducedFunc = evaluate(funcTerm, kind);
  const parameter = reducedFunc.kind === 'abs' ? reducedFunc.param : 'arg';
  const substitutionTerm = kind === 'value' ? evaluate(argTerm, kind) : argTerm;

  const substLabel = label(workspace, kind === 'value' ? `Value for ${parameter}` : `Structure for ${parameter}`);
  order.map[order.order++] = substLabel.id;
  const substitutionBlock = append(termToState(substitutionTerm), workspace);
  annotate(substitutionBlock, substitutionTerm);
  order.map[order.order++] = substitutionBlock.id;

  const bodyLabel = label(workspace, kind === 'value' ? 'Function body of CbV' : 'Function body of CbS');
  order.map[order.order++] = bodyLabel.id;

  const bodyTerm = reducedFunc.kind === 'abs'
    ? substitute(reducedFunc.body, reducedFunc.param, substitutionTerm)
    : { kind: 'app', func: reducedFunc, arg: substitutionTerm } as Term;
  const resultTerm = evaluate(bodyTerm, kind);
  const bodyBlock = append(termToState(resultTerm), workspace);
  annotate(bodyBlock, resultTerm);
  order.map[order.order++] = bodyBlock.id;

  arrangeBlocksVertically(workspace, order);
  return order;
}

export function renderCopiedTerm(block: Blockly.Block, workspace: Blockly.WorkspaceSvg, kind: ReductionKind): BlockOrder {
  const order = newOrder();
  const term = evaluate(blockToTerm(block), kind);
  const root = append(termToState(term), workspace);
  annotate(root, term);
  order.map[order.order++] = root.id;
  arrangeBlocksVertically(workspace, order);
  return order;
}

export function generatedStateForBlock(block: Blockly.Block, kind: ReductionKind): any {
  return termToState(evaluate(blockToTerm(block), kind));
}

