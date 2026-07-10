import * as Blockly from 'blockly';
import type { ReductionKind } from '../semantics/lambdaReduction';

/*
 * CSEK abstract machine for the block lambda calculus: Control / Environment /
 * Kontinuation, walking the REAL block tree of the main workspace by block id —
 * the machine never copies or mutates blocks. Per the research note
 * "CSEK fit for Block-Lambda-Calculus" (T2BB repo), the language is pure
 * (no references, no heap), so the CSESK design of Block-based-MNL applies
 * with the store S dropped.
 *
 * Both reduction strategies of the substitution semantics are supported:
 *   - 'value'      call-by-value: arguments evaluate to machine values before
 *                  beta; environments bind values (closures capture by chain).
 *   - 'structure'  call-by-structure: arguments bind as thunks (block + env)
 *                  and re-evaluate at every variable lookup — env lookup is
 *                  the lazy version of the physical copying the substitution
 *                  stepper performs, and duplicated work shows up as repeated
 *                  primitive rules, exactly like duplicated block structure.
 *
 * `stepCsekMachine` is pure with respect to the state (it only reads the
 * workspace), so time travel is a history stack, as in Block-based-MNL.
 */

/* ----------------------------------------------------------------- values */

export type MachineValue =
  | { tag: 'Num'; n: number }
  | { tag: 'Bool'; b: boolean }
  | Closure;

export interface Closure {
  tag: 'Closure';
  param: string;
  /** Body block id in the main workspace — the machine never copies blocks. */
  bodyId: string;
  env: Env;
  /** Set when bound by letrec; enables recursion via self-binding on apply. */
  name?: string;
}

/** A suspended computation — call-by-structure environments bind these. */
export interface Thunk {
  tag: 'Thunk';
  blockId: string;
  env: Env;
}

export type EnvEntry = MachineValue | Thunk;

/** Immutable association chain; sharing tails is what makes capture cheap. */
export type Env = { name: string; value: EnvEntry; parent: Env } | null;

export function lookup(env: Env, name: string): EnvEntry | undefined {
  let cursor = env;
  while (cursor) {
    if (cursor.name === name) return cursor.value;
    cursor = cursor.parent;
  }
  return undefined;
}

/** Matches prettyRuntimeValue in lambdaReduction.ts so final values compare as text. */
export function formatMachineValue(value: MachineValue): string {
  switch (value.tag) {
    case 'Num':
      return Number.isInteger(value.n) ? String(value.n) : String(Number(value.n.toFixed(6)));
    case 'Bool':
      return value.b ? 'true' : 'false';
    case 'Closure':
      return 'function';
  }
}

/* -------------------------------------------------------- continuations */

export type OpKind = 'numop' | 'boolop' | 'cmpop';

export type Kont =
  /** function evaluated next; then handle the argument (eval or thunk). */
  | { tag: 'KArg'; argId: string | null; env: Env; blockId: string }
  /** call-by-value only: argument evaluated next; then apply fn. */
  | { tag: 'KApply'; fn: MachineValue; blockId: string }
  | { tag: 'KBranch'; thenId: string | null; elseId: string | null; env: Env; blockId: string }
  | { tag: 'KBinRight'; opKind: OpKind; op: string; rightId: string | null; env: Env; blockId: string }
  | { tag: 'KBinFold'; opKind: OpKind; op: string; left: MachineValue; blockId: string }
  /** call-by-value let: rhs evaluated next; then bind and evaluate the body. */
  | { tag: 'KBind'; name: string; bodyId: string | null; env: Env; blockId: string };

/* ----------------------------------------------------------------- state */

export type Control =
  | { kind: 'eval'; blockId: string; env: Env }
  | { kind: 'value'; value: MachineValue };

export interface CsekState {
  strategy: ReductionKind;
  control: Control;
  kont: Kont[];
  status: 'running' | 'done' | 'error';
  error: string | null;
  result: MachineValue | null;
  stepCount: number;
  lastRule: string | null;
  focusBlockId: string | null;
}

/** The rules that must agree with the substitution stepper, per program run. */
export function isSalientRule(rule: string | null): boolean {
  if (!rule) return false;
  return rule === 'beta' || rule === 'if-true' || rule === 'if-false' || rule.startsWith('prim ');
}

type AnyBlock = Blockly.Block;

const child = (block: AnyBlock, name: string): AnyBlock | null => block.getInputTargetBlock(name);

function fieldOf(block: AnyBlock, name: string, fallback = ''): string {
  const value = block.getFieldValue(name);
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function isLambdaTermBlock(block: AnyBlock): boolean {
  return Boolean(block.outputConnection) && block.type.startsWith('lambda_') && block.type !== 'lambda_viz_description';
}

/** The top-level term to run: prefer an application, else the first term block. */
export function pickProgramBlock(workspace: Blockly.Workspace): AnyBlock | null {
  const tops = workspace
    .getTopBlocks(true)
    .filter((block) => !block.getParent() && isLambdaTermBlock(block));
  if (tops.length === 0) return null;
  return tops.find((block) => block.type === 'lambda_application') ?? tops[0];
}

/* ---------------------------------------------------------------- inject */

export function injectCsekMachine(block: AnyBlock | null, strategy: ReductionKind): CsekState | { injectError: string } {
  if (!block) return { injectError: 'No term to run — add a lambda term to the workspace.' };
  return {
    strategy,
    control: { kind: 'eval', blockId: block.id, env: null },
    kont: [],
    status: 'running',
    error: null,
    result: null,
    stepCount: 0,
    lastRule: null,
    focusBlockId: block.id
  };
}

/* ------------------------------------------------------------------ step */

const MAX_KONT = 20000;

export function stepCsekMachine(workspace: Blockly.Workspace, previous: CsekState): CsekState {
  if (previous.status !== 'running') return previous;
  const state: CsekState = {
    ...previous,
    kont: previous.kont.slice(),
    stepCount: previous.stepCount + 1,
    lastRule: null
  };
  if (state.kont.length > MAX_KONT) return stuck(state, 'continuation stack overflow');
  try {
    if (state.control.kind === 'eval') {
      const block = workspace.getBlockById(state.control.blockId);
      if (!block) return stuck(state, 'a block disappeared while stepping — reload the machine');
      return stepEval(state, block, state.control.env);
    }
    return stepValue(state, state.control.value);
  } catch (error) {
    return stuck(state, error instanceof Error ? error.message : String(error));
  }
}

function stuck(state: CsekState, message: string): CsekState {
  state.status = 'error';
  state.error = message;
  state.lastRule = 'stuck';
  return state;
}

function value(state: CsekState, v: MachineValue, rule: string, focus?: string | null): CsekState {
  state.control = { kind: 'value', value: v };
  state.lastRule = rule;
  if (focus !== undefined) state.focusBlockId = focus;
  return state;
}

function evalNext(state: CsekState, blockId: string | null, env: Env, rule: string, ifMissing: string): CsekState {
  if (!blockId) return stuck(state, ifMissing);
  state.control = { kind: 'eval', blockId, env };
  state.lastRule = rule;
  state.focusBlockId = blockId;
  return state;
}

/** Enter a closure body with its captured env, the self-name, and the argument. */
function enterClosure(state: CsekState, fn: Closure, argument: EnvEntry): CsekState {
  let env = fn.env;
  if (fn.name) env = { name: fn.name, value: fn, parent: env };
  env = { name: fn.param, value: argument, parent: env };
  return evalNext(state, fn.bodyId, env, 'beta', 'closure body is missing');
}

/** Skip lambda_parentheses wrappers when a rule needs the syntactic shape. */
function unwrapParens(block: AnyBlock | null): AnyBlock | null {
  let cursor = block;
  while (cursor && cursor.type === 'lambda_parentheses') cursor = child(cursor, 'TERM');
  return cursor;
}

function opKindOf(type: string): OpKind | null {
  if (type === 'lambda_number_operator') return 'numop';
  if (type === 'lambda_boolean_operator') return 'boolop';
  if (type === 'lambda_number_comparison') return 'cmpop';
  return null;
}

function stepEval(state: CsekState, block: AnyBlock, env: Env): CsekState {
  switch (block.type) {
    case 'lambda_number':
      return value(state, { tag: 'Num', n: Number(fieldOf(block, 'VALUE', '0')) || 0 }, 'const', block.id);
    case 'lambda_boolean':
      return value(state, { tag: 'Bool', b: fieldOf(block, 'VALUE', 'true') === 'true' }, 'const', block.id);

    case 'lambda_parentheses':
      return evalNext(state, child(block, 'TERM')?.id ?? null, env, 'paren', 'parentheses are empty');

    case 'lambda_variable': {
      const name = fieldOf(block, 'NAME', 'x');
      const found = lookup(env, name);
      if (found === undefined) return stuck(state, `unbound variable ${name}`);
      if (found.tag === 'Thunk') {
        // call-by-structure: re-run the suspended block — the lazy duplicate
        return evalNext(state, found.blockId, found.env, 'lookup', 'thunk block is missing');
      }
      return value(state, found, 'lookup', block.id);
    }

    case 'lambda_abstraction': {
      const body = child(block, 'BODY');
      if (!body) return stuck(state, 'lambda has no body');
      return value(state, { tag: 'Closure', param: fieldOf(block, 'PARAM', 'x'), bodyId: body.id, env }, 'closure', block.id);
    }

    case 'lambda_application': {
      state.kont.push({ tag: 'KArg', argId: child(block, 'ARG')?.id ?? null, env, blockId: block.id });
      return evalNext(state, child(block, 'FUNC')?.id ?? null, env, 'app-fun', 'application has no function term');
    }

    case 'lambda_let': {
      const name = fieldOf(block, 'NAME', 'id');
      const valueBlock = child(block, 'VALUE');
      const bodyId = child(block, 'BODY')?.id ?? null;
      if (!valueBlock) return stuck(state, `let ${name} has no bound term`);
      if (state.strategy === 'structure') {
        const bound: Env = { name, value: { tag: 'Thunk', blockId: valueBlock.id, env }, parent: env };
        return evalNext(state, bodyId, bound, 'let', `let ${name} has no body`);
      }
      state.kont.push({ tag: 'KBind', name, bodyId, env, blockId: block.id });
      return evalNext(state, valueBlock.id, env, 'let-value', 'missing let value');
    }

    case 'lambda_letrec': {
      const name = fieldOf(block, 'NAME', 'f');
      const valueBlock = child(block, 'VALUE');
      const bodyId = child(block, 'BODY')?.id ?? null;
      if (!valueBlock) return stuck(state, `letrec ${name} has no bound term`);
      if (state.strategy === 'structure') {
        // recursive thunk: its env chain contains the binding itself
        const bound = { name, value: undefined as unknown as EnvEntry, parent: env };
        bound.value = { tag: 'Thunk', blockId: valueBlock.id, env: bound };
        return evalNext(state, bodyId, bound, 'letrec', `letrec ${name} has no body`);
      }
      const fnBlock = unwrapParens(valueBlock);
      if (!fnBlock || fnBlock.type !== 'lambda_abstraction') {
        return stuck(state, `letrec ${name} must bind a lambda under call-by-value`);
      }
      const body = child(fnBlock, 'BODY');
      if (!body) return stuck(state, 'lambda has no body');
      const closure: Closure = { tag: 'Closure', param: fieldOf(fnBlock, 'PARAM', 'x'), bodyId: body.id, env, name };
      return evalNext(state, bodyId, { name, value: closure, parent: env }, 'letrec', `letrec ${name} has no body`);
    }

    case 'lambda_if': {
      state.kont.push({
        tag: 'KBranch',
        thenId: child(block, 'THEN')?.id ?? null,
        elseId: child(block, 'ELSE')?.id ?? null,
        env,
        blockId: block.id
      });
      return evalNext(state, child(block, 'COND')?.id ?? null, env, 'if-cond', 'if has no condition');
    }

    case 'lambda_number_operator':
    case 'lambda_boolean_operator':
    case 'lambda_number_comparison': {
      const opKind = opKindOf(block.type)!;
      const op = fieldOf(block, 'OP', opKind === 'boolop' ? 'and' : '+');
      state.kont.push({ tag: 'KBinRight', opKind, op, rightId: child(block, 'RIGHT')?.id ?? null, env, blockId: block.id });
      return evalNext(state, child(block, 'LEFT')?.id ?? null, env, 'binop-left', 'operator has no left operand');
    }

    default:
      return stuck(state, `the machine does not know block ${block.type}`);
  }
}

function stepValue(state: CsekState, v: MachineValue): CsekState {
  const frame = state.kont.pop();
  if (!frame) {
    state.status = 'done';
    state.result = v;
    state.lastRule = 'halt';
    state.focusBlockId = null;
    return state;
  }

  switch (frame.tag) {
    case 'KArg': {
      if (state.strategy === 'structure') {
        // call-by-structure: the argument binds unevaluated, as a thunk
        if (v.tag !== 'Closure') return stuck(state, 'application expects a function value');
        if (!frame.argId) return stuck(state, 'application has no argument');
        return enterClosure(state, v, { tag: 'Thunk', blockId: frame.argId, env: frame.env });
      }
      state.kont.push({ tag: 'KApply', fn: v, blockId: frame.blockId });
      return evalNext(state, frame.argId, frame.env, 'app-arg', 'application has no argument');
    }

    case 'KApply': {
      if (frame.fn.tag !== 'Closure') return stuck(state, 'application expects a function value');
      return enterClosure(state, frame.fn, v);
    }

    case 'KBranch': {
      if (v.tag !== 'Bool') return stuck(state, 'if condition must evaluate to a boolean');
      const branch = v.b ? frame.thenId : frame.elseId;
      return evalNext(state, branch, frame.env, v.b ? 'if-true' : 'if-false', 'selected branch is missing');
    }

    case 'KBinRight': {
      state.kont.push({ tag: 'KBinFold', opKind: frame.opKind, op: frame.op, left: v, blockId: frame.blockId });
      return evalNext(state, frame.rightId, frame.env, 'binop-right', 'operator has no right operand');
    }

    case 'KBinFold':
      return foldBinary(state, frame, v);

    case 'KBind': {
      const env: Env = { name: frame.name, value: v, parent: frame.env };
      return evalNext(state, frame.bodyId, env, 'let', `let ${frame.name} has no body`);
    }
  }
}

/* Mirrors computePrimitive in lambdaReduction.ts exactly (including / by 0). */
function foldBinary(state: CsekState, frame: Extract<Kont, { tag: 'KBinFold' }>, right: MachineValue): CsekState {
  const { opKind, op, left, blockId } = frame;
  const rule = `prim ${op}`;
  if (opKind === 'numop') {
    if (left.tag !== 'Num' || right.tag !== 'Num') return stuck(state, 'arithmetic expects numbers');
    const l = left.n;
    const r = right.n;
    const n = op === '+' ? l + r : op === '-' ? l - r : op === '*' ? l * r : op === '/' ? (r === 0 ? 0 : l / r) : null;
    if (n === null) return stuck(state, `unknown arithmetic operator ${op}`);
    return value(state, { tag: 'Num', n }, rule, blockId);
  }
  if (opKind === 'boolop') {
    if (left.tag !== 'Bool' || right.tag !== 'Bool') return stuck(state, 'boolean operator expects booleans');
    const l = left.b;
    const r = right.b;
    const b = op === 'and' ? l && r : op === 'or' ? l || r : op === 'equal' ? l === r : null;
    if (b === null) return stuck(state, `unknown boolean operator ${op}`);
    return value(state, { tag: 'Bool', b }, rule, blockId);
  }
  if (left.tag !== 'Num' || right.tag !== 'Num') return stuck(state, 'comparison expects numbers');
  const l = left.n;
  const r = right.n;
  const b =
    op === '=' ? l === r : op === '<' ? l < r : op === '<=' ? l <= r : op === '>' ? l > r : op === '>=' ? l >= r : null;
  if (b === null) return stuck(state, `unknown comparison operator ${op}`);
  return value(state, { tag: 'Bool', b }, rule, blockId);
}

/* ------------------------------------------------------------------- run */

export function runCsekMachine(workspace: Blockly.Workspace, initial: CsekState, maxSteps = 200000): CsekState {
  let state = initial;
  while (state.status === 'running' && state.stepCount < maxSteps) {
    state = stepCsekMachine(workspace, state);
  }
  if (state.status === 'running') {
    return { ...state, status: 'error', error: `did not finish within ${maxSteps} steps` };
  }
  return state;
}
