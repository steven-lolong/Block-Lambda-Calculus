import * as Blockly from 'blockly';

export type LambdaTypeIssue = {
  blockId?: string;
  blockType?: string;
  message: string;
};

export type LambdaInferenceReport = {
  blockTypes: Map<string, string>;
  blockIssues: Map<string, string[]>;
  topLevelTypes: Map<string, string>;
  issues: LambdaTypeIssue[];
  issueCount: number;
  hasErrors: boolean;
  summary: string;
};

type Type = TypeVariable | TypeConstant | TypeFunction;

type TypeVariable = {
  kind: 'var';
  id: number;
};

type TypeConstantName = 'int' | 'bool';

type TypeConstant = {
  kind: 'const';
  name: TypeConstantName;
};

type TypeFunction = {
  kind: 'fun';
  from: Type;
  to: Type;
};

type TypeScheme = {
  vars: number[];
  type: Type;
};

type TypeEnvironment = Map<string, TypeScheme>;

type InferenceState = {
  nextTypeVariable: number;
  substitution: Map<number, Type>;
  blockTypes: Map<string, Type>;
  topLevelTypes: Map<string, Type>;
  issues: LambdaTypeIssue[];
};

type LambdaTypedBlock = Blockly.Block & {
  termType?: string;
  termScheme?: string;
  termTypeHasNoError?: boolean;
  isComplete?: boolean;
};

const INT_TYPE: TypeConstant = { kind: 'const', name: 'int' };
const BOOL_TYPE: TypeConstant = { kind: 'const', name: 'bool' };

class LambdaTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LambdaTypeError';
  }
}

function freshTypeVariable(state: InferenceState): TypeVariable {
  const variable: TypeVariable = { kind: 'var', id: state.nextTypeVariable };
  state.nextTypeVariable += 1;
  return variable;
}

function functionType(from: Type, to: Type): TypeFunction {
  return { kind: 'fun', from, to };
}

function cloneEnvironment(env: TypeEnvironment): TypeEnvironment {
  return new Map(env);
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

function typeName(type: Type): string {
  switch (type.kind) {
    case 'var':
      return `'${type.id}`;
    case 'const':
      return type.name;
    case 'fun':
      return `${typeName(type.from)} -> ${typeName(type.to)}`;
  }
}

function applySubstitution(type: Type, substitution: Map<number, Type>, protectedVars = new Set<number>()): Type {
  switch (type.kind) {
    case 'var': {
      if (protectedVars.has(type.id)) return type;
      const replacement = substitution.get(type.id);
      return replacement ? applySubstitution(replacement, substitution, protectedVars) : type;
    }
    case 'const':
      return type;
    case 'fun':
      return functionType(
        applySubstitution(type.from, substitution, protectedVars),
        applySubstitution(type.to, substitution, protectedVars)
      );
  }
}

function occurs(typeVariableId: number, type: Type, state: InferenceState): boolean {
  const applied = applySubstitution(type, state.substitution);
  switch (applied.kind) {
    case 'var':
      return applied.id === typeVariableId;
    case 'const':
      return false;
    case 'fun':
      return occurs(typeVariableId, applied.from, state) || occurs(typeVariableId, applied.to, state);
  }
}

function bindTypeVariable(variable: TypeVariable, type: Type, state: InferenceState): void {
  const applied = applySubstitution(type, state.substitution);
  if (applied.kind === 'var' && applied.id === variable.id) return;
  if (occurs(variable.id, applied, state)) {
    throw new LambdaTypeError(`Recursive type is not allowed: ${typeName(variable)} occurs in ${typeName(applied)}.`);
  }
  state.substitution.set(variable.id, applied);
}

function unify(left: Type, right: Type, state: InferenceState): void {
  const a = applySubstitution(left, state.substitution);
  const b = applySubstitution(right, state.substitution);

  if (a.kind === 'var') {
    bindTypeVariable(a, b, state);
    return;
  }

  if (b.kind === 'var') {
    bindTypeVariable(b, a, state);
    return;
  }

  if (a.kind === 'const' && b.kind === 'const') {
    if (a.name !== b.name) throw new LambdaTypeError(`Expected ${a.name}, but found ${b.name}.`);
    return;
  }

  if (a.kind === 'fun' && b.kind === 'fun') {
    unify(a.from, b.from, state);
    unify(a.to, b.to, state);
    return;
  }

  throw new LambdaTypeError(`Cannot unify ${formatType(a, state)} with ${formatType(b, state)}.`);
}

function freeTypeVariables(type: Type, state: InferenceState, protectedVars = new Set<number>()): Set<number> {
  const applied = applySubstitution(type, state.substitution, protectedVars);
  switch (applied.kind) {
    case 'var':
      return new Set([applied.id]);
    case 'const':
      return new Set();
    case 'fun': {
      const variables = freeTypeVariables(applied.from, state, protectedVars);
      for (const id of freeTypeVariables(applied.to, state, protectedVars)) variables.add(id);
      return variables;
    }
  }
}

function freeSchemeVariables(scheme: TypeScheme, state: InferenceState): Set<number> {
  const protectedVars = new Set(scheme.vars);
  const variables = freeTypeVariables(scheme.type, state, protectedVars);
  for (const id of scheme.vars) variables.delete(id);
  return variables;
}

function freeEnvironmentVariables(env: TypeEnvironment, state: InferenceState): Set<number> {
  const variables = new Set<number>();
  for (const scheme of env.values()) {
    for (const id of freeSchemeVariables(scheme, state)) variables.add(id);
  }
  return variables;
}

function generalize(env: TypeEnvironment, type: Type, state: InferenceState): TypeScheme {
  const applied = applySubstitution(type, state.substitution);
  const typeVariables = freeTypeVariables(applied, state);
  const envVariables = freeEnvironmentVariables(env, state);
  const quantified = Array.from(typeVariables).filter((id) => !envVariables.has(id));
  return { vars: quantified, type: applied };
}

function instantiate(scheme: TypeScheme, state: InferenceState): Type {
  const replacements = new Map<number, TypeVariable>();
  for (const id of scheme.vars) replacements.set(id, freshTypeVariable(state));

  function replace(type: Type): Type {
    const applied = applySubstitution(type, state.substitution, new Set(scheme.vars));
    switch (applied.kind) {
      case 'var':
        return replacements.get(applied.id) ?? applied;
      case 'const':
        return applied;
      case 'fun':
        return functionType(replace(applied.from), replace(applied.to));
    }
  }

  return replace(scheme.type);
}

function addIssue(state: InferenceState, block: Blockly.Block | null, message: string): void {
  state.issues.push({
    blockId: block?.id,
    blockType: block?.type,
    message
  });
}

function inferChild(block: Blockly.Block, inputName: string, env: TypeEnvironment, state: InferenceState): Type {
  const target = child(block, inputName);
  if (!target) {
    addIssue(state, block, `Missing ${inputName.toLowerCase()} input.`);
    return freshTypeVariable(state);
  }
  return inferTerm(target, env, state);
}

function rememberType(block: Blockly.Block, type: Type, state: InferenceState): Type {
  state.blockTypes.set(block.id, type);
  return type;
}

function inferTerm(block: Blockly.Block, env: TypeEnvironment, state: InferenceState): Type {
  try {
    switch (block.type) {
      case 'lambda_variable': {
        const name = field(block, 'NAME', 'x');
        const scheme = env.get(name);
        if (!scheme) {
          addIssue(state, block, `Unbound variable '${name}'.`);
          return rememberType(block, freshTypeVariable(state), state);
        }
        return rememberType(block, instantiate(scheme, state), state);
      }

      case 'lambda_abstraction': {
        const parameter = field(block, 'PARAM', 'x');
        const parameterType = freshTypeVariable(state);
        const scopedEnv = cloneEnvironment(env);
        scopedEnv.set(parameter, { vars: [], type: parameterType });
        const bodyType = inferChild(block, 'BODY', scopedEnv, state);
        return rememberType(block, functionType(applySubstitution(parameterType, state.substitution), bodyType), state);
      }

      case 'lambda_application': {
        const functionTerm = inferChild(block, 'FUNC', env, state);
        const argumentTerm = inferChild(block, 'ARG', env, state);
        const resultType = freshTypeVariable(state);
        unify(functionTerm, functionType(argumentTerm, resultType), state);
        return rememberType(block, resultType, state);
      }

      case 'lambda_parentheses':
        return rememberType(block, inferChild(block, 'TERM', env, state), state);

      case 'lambda_let': {
        const name = field(block, 'NAME', 'id');
        const valueType = inferChild(block, 'VALUE', env, state);
        const scheme = generalize(env, valueType, state);
        const bodyEnv = cloneEnvironment(env);
        bodyEnv.set(name, scheme);
        return rememberType(block, inferChild(block, 'BODY', bodyEnv, state), state);
      }

      case 'lambda_letrec': {
        const name = field(block, 'NAME', 'f');
        const recursiveType = freshTypeVariable(state);
        const recursiveEnv = cloneEnvironment(env);
        recursiveEnv.set(name, { vars: [], type: recursiveType });
        const valueType = inferChild(block, 'VALUE', recursiveEnv, state);
        unify(recursiveType, valueType, state);
        const scheme = generalize(env, recursiveType, state);
        const bodyEnv = cloneEnvironment(env);
        bodyEnv.set(name, scheme);
        return rememberType(block, inferChild(block, 'BODY', bodyEnv, state), state);
      }

      case 'lambda_number':
        return rememberType(block, INT_TYPE, state);

      case 'lambda_boolean':
        return rememberType(block, BOOL_TYPE, state);

      case 'lambda_number_operator': {
        const left = inferChild(block, 'LEFT', env, state);
        const right = inferChild(block, 'RIGHT', env, state);
        unify(left, INT_TYPE, state);
        unify(right, INT_TYPE, state);
        return rememberType(block, INT_TYPE, state);
      }

      case 'lambda_boolean_operator': {
        const operator = field(block, 'OP', 'and');
        const left = inferChild(block, 'LEFT', env, state);
        const right = inferChild(block, 'RIGHT', env, state);
        if (operator === 'and' || operator === 'or') {
          unify(left, BOOL_TYPE, state);
          unify(right, BOOL_TYPE, state);
        } else {
          unify(left, right, state);
        }
        return rememberType(block, BOOL_TYPE, state);
      }

      case 'lambda_if': {
        const condition = inferChild(block, 'COND', env, state);
        const thenBranch = inferChild(block, 'THEN', env, state);
        const elseBranch = inferChild(block, 'ELSE', env, state);
        unify(condition, BOOL_TYPE, state);
        unify(thenBranch, elseBranch, state);
        return rememberType(block, thenBranch, state);
      }

      default:
        addIssue(state, block, `Unsupported Lambda block '${block.type}'.`);
        return rememberType(block, freshTypeVariable(state), state);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addIssue(state, block, message);
    return rememberType(block, freshTypeVariable(state), state);
  }
}

function formatType(type: Type, state: InferenceState): string {
  const printer = createTypePrinter(state);
  return printer(type);
}

function createTypePrinter(state: InferenceState): (type: Type) => string {
  const names = new Map<number, string>();

  function variableName(id: number): string {
    const existing = names.get(id);
    if (existing) return existing;

    const index = names.size;
    const letter = String.fromCharCode(97 + (index % 26));
    const suffix = index >= 26 ? String(Math.floor(index / 26)) : '';
    const name = `'${letter}${suffix}`;
    names.set(id, name);
    return name;
  }

  function print(type: Type, parenthesizeFunction = false): string {
    const applied = applySubstitution(type, state.substitution);
    switch (applied.kind) {
      case 'var':
        return variableName(applied.id);
      case 'const':
        return applied.name;
      case 'fun': {
        const rendered = `${print(applied.from, applied.from.kind === 'fun')} -> ${print(applied.to)}`;
        return parenthesizeFunction ? `(${rendered})` : rendered;
      }
    }
  }

  return print;
}

function groupIssuesByBlock(issues: LambdaTypeIssue[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const issue of issues) {
    if (!issue.blockId) continue;
    const existing = grouped.get(issue.blockId) ?? [];
    existing.push(issue.message);
    grouped.set(issue.blockId, existing);
  }
  return grouped;
}

function makeSummary(topLevelCount: number, issueCount: number): string {
  if (issueCount === 0) {
    return `Polymorphic inference ok for ${topLevelCount} top-level term${topLevelCount === 1 ? '' : 's'}.`;
  }
  return `Polymorphic inference found ${issueCount} issue${issueCount === 1 ? '' : 's'}.`;
}

export function inferLambdaWorkspaceTypes(workspace: Blockly.Workspace): LambdaInferenceReport {
  const state: InferenceState = {
    nextTypeVariable: 0,
    substitution: new Map(),
    blockTypes: new Map(),
    topLevelTypes: new Map(),
    issues: []
  };

  const topBlocks = workspace
    .getTopBlocks(true)
    .filter((block) => !block.getParent() && isLambdaTermBlock(block));

  for (const block of topBlocks) {
    const type = inferTerm(block, new Map(), state);
    state.topLevelTypes.set(block.id, type);
  }

  const blockTypes = new Map<string, string>();
  for (const [blockId, type] of state.blockTypes) {
    blockTypes.set(blockId, formatType(type, state));
  }

  const topLevelTypes = new Map<string, string>();
  for (const [blockId, type] of state.topLevelTypes) {
    topLevelTypes.set(blockId, formatType(type, state));
  }

  const blockIssues = groupIssuesByBlock(state.issues);
  const issueCount = state.issues.length;

  return {
    blockTypes,
    blockIssues,
    topLevelTypes,
    issues: state.issues.slice(),
    issueCount,
    hasErrors: issueCount > 0,
    summary: makeSummary(topBlocks.length, issueCount)
  };
}

export function writeLambdaInferenceMetadata(workspace: Blockly.Workspace, report: LambdaInferenceReport): void {
  for (const block of workspace.getAllBlocks(false).filter(isLambdaTermBlock)) {
    const typed = block as LambdaTypedBlock;
    const issues = report.blockIssues.get(block.id) ?? [];
    const inferredType = report.blockTypes.get(block.id) ?? 'unknown';
    typed.termType = inferredType;
    typed.termScheme = inferredType;
    typed.termTypeHasNoError = issues.length === 0;
    typed.isComplete = !issues.some((issue) => issue.startsWith('Missing '));
  }
}

export function annotateLambdaWorkspaceTypes(
  workspace: Blockly.Workspace,
  report = inferLambdaWorkspaceTypes(workspace)
): LambdaInferenceReport {
  const blocks = workspace.getAllBlocks(false).filter(isLambdaTermBlock);
  writeLambdaInferenceMetadata(workspace, report);

  Blockly.Events.disable();
  try {
    for (const block of blocks) {
      const messages = report.blockIssues.get(block.id) ?? [];
      block.setWarningText(messages.length > 0 ? `Polymorphic type inference:\n${messages.join('\n')}` : null, 'lambda-type-inference');
    }
  } finally {
    Blockly.Events.enable();
  }

  return report;
}
