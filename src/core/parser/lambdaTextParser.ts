type LambdaAst =
  | { kind: 'var'; name: string }
  | { kind: 'abs'; param: string; body: LambdaAst }
  | { kind: 'app'; func: LambdaAst; arg: LambdaAst }
  | { kind: 'let'; name: string; value: LambdaAst; body: LambdaAst }
  | { kind: 'letrec'; name: string; value: LambdaAst; body: LambdaAst }
  | { kind: 'num'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'numop'; op: string; left: LambdaAst; right: LambdaAst }
  | { kind: 'boolop'; op: string; left: LambdaAst; right: LambdaAst }
  | { kind: 'if'; cond: LambdaAst; thenTerm: LambdaAst; elseTerm: LambdaAst };

export type LambdaBlockState = {
  type: string;
  x?: number;
  y?: number;
  fields?: Record<string, string | number>;
  inputs?: Record<string, { block: LambdaBlockState }>;
};

export type LambdaWorkspaceState = {
  blocks: {
    languageVersion: number;
    blocks: LambdaBlockState[];
  };
};

type TokenKind = 'identifier' | 'number' | 'keyword' | 'symbol' | 'eof';

type Token = {
  kind: TokenKind;
  value: string;
  index: number;
};

const KEYWORDS = new Set(['lambda', 'let', 'letrec', 'in', 'if', 'then', 'else', 'true', 'false', 'and', 'or', 'fix']);

export class LambdaTextParseError extends Error {
  constructor(message: string, readonly index: number) {
    super(message);
    this.name = 'LambdaTextParseError';
  }
}

function stripLineComment(line: string): string {
  return line.replace(/--.*$/, '');
}

function splitTopLevelSources(text: string): string[] {
  const sources: string[] = [];
  let current: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const stripped = stripLineComment(line).trim();
    if (!stripped) {
      if (current.length > 0) {
        sources.push(current.join(' '));
        current = [];
      }
      continue;
    }
    current.push(stripped);
  }

  if (current.length > 0) sources.push(current.join(' '));
  return sources;
}

function normalizeSymbol(value: string): string {
  if (value === '−') return '-';
  if (value === '×') return '*';
  if (value === '÷') return '/';
  return value;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_']/.test(source[index])) index += 1;
      const value = source.slice(start, index);
      tokens.push({ kind: KEYWORDS.has(value) ? 'keyword' : 'identifier', value, index: start });
      continue;
    }

    if (/\d/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /\d/.test(source[index])) index += 1;
      if (source[index] === '.' && /\d/.test(source[index + 1] ?? '')) {
        index += 1;
        while (index < source.length && /\d/.test(source[index])) index += 1;
      }
      tokens.push({ kind: 'number', value: source.slice(start, index), index: start });
      continue;
    }

    const symbol = normalizeSymbol(char);
    if ('λ\\.()=+-*/'.includes(symbol)) {
      tokens.push({ kind: 'symbol', value: symbol, index });
      index += 1;
      continue;
    }

    if (char === '□') {
      tokens.push({ kind: 'identifier', value: '□', index });
      index += 1;
      continue;
    }

    throw new LambdaTextParseError(`Unexpected character "${char}".`, index);
  }

  tokens.push({ kind: 'eof', value: '', index: source.length });
  return tokens;
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): LambdaAst {
    const expression = this.parseExpression(new Set(['eof']));
    this.expectKind('eof', 'Expected end of Lambda text.');
    return expression;
  }

  private current(): Token {
    return this.tokens[this.position];
  }

  private peek(offset = 1): Token {
    return this.tokens[this.position + offset] ?? this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const token = this.current();
    this.position = Math.min(this.position + 1, this.tokens.length - 1);
    return token;
  }

  private matches(value: string): boolean {
    return this.current().value === value;
  }

  private atStop(stopValues: Set<string>): boolean {
    const token = this.current();
    return stopValues.has(token.value) || stopValues.has(token.kind);
  }

  private expectValue(value: string, message: string): Token {
    if (!this.matches(value)) throw new LambdaTextParseError(message, this.current().index);
    return this.advance();
  }

  private expectKind(kind: TokenKind, message: string): Token {
    if (this.current().kind !== kind) throw new LambdaTextParseError(message, this.current().index);
    return this.advance();
  }

  private parseExpression(stopValues: Set<string>): LambdaAst {
    if (this.atStop(stopValues)) {
      throw new LambdaTextParseError('Expected a Lambda expression.', this.current().index);
    }

    if (this.matches('let')) return this.parseLet(false, stopValues);
    if (this.matches('letrec')) return this.parseLet(true, stopValues);
    if (this.matches('if')) return this.parseIf(stopValues);
    if (this.matches('λ') || this.matches('\\') || this.matches('lambda')) return this.parseAbstraction(stopValues);
    return this.parseOr(stopValues);
  }

  private parseLet(recursive: boolean, stopValues: Set<string>): LambdaAst {
    this.advance();
    const name = this.expectKind('identifier', `Expected a name after ${recursive ? 'letrec' : 'let'}.`).value;
    this.expectValue('=', `Expected "=" after ${name}.`);
    const value = this.parseExpression(new Set([...stopValues, 'in']));
    this.expectValue('in', 'Expected "in" after let value.');
    const body = this.parseExpression(stopValues);
    return recursive ? { kind: 'letrec', name, value, body } : { kind: 'let', name, value, body };
  }

  private parseIf(stopValues: Set<string>): LambdaAst {
    this.advance();
    const cond = this.parseExpression(new Set([...stopValues, 'then']));
    this.expectValue('then', 'Expected "then" after if condition.');
    const thenTerm = this.parseExpression(new Set([...stopValues, 'else']));
    this.expectValue('else', 'Expected "else" after then branch.');
    const elseTerm = this.parseExpression(stopValues);
    return { kind: 'if', cond, thenTerm, elseTerm };
  }

  private parseAbstraction(stopValues: Set<string>): LambdaAst {
    this.advance();
    const params: string[] = [];

    while (this.current().kind === 'identifier') {
      params.push(this.advance().value);
    }

    if (params.length === 0) {
      throw new LambdaTextParseError('Expected a parameter after lambda.', this.current().index);
    }

    this.expectValue('.', 'Expected "." after lambda parameter.');
    const body = this.parseExpression(stopValues);
    return params.reduceRight<LambdaAst>((nestedBody, param) => ({ kind: 'abs', param, body: nestedBody }), body);
  }

  private parseOr(stopValues: Set<string>): LambdaAst {
    let left = this.parseAnd(stopValues);
    while (!this.atStop(stopValues) && this.matches('or')) {
      const op = this.advance().value;
      left = { kind: 'boolop', op, left, right: this.parseAnd(stopValues) };
    }
    return left;
  }

  private parseAnd(stopValues: Set<string>): LambdaAst {
    let left = this.parseEquality(stopValues);
    while (!this.atStop(stopValues) && this.matches('and')) {
      const op = this.advance().value;
      left = { kind: 'boolop', op, left, right: this.parseEquality(stopValues) };
    }
    return left;
  }

  private parseEquality(stopValues: Set<string>): LambdaAst {
    let left = this.parseAdditive(stopValues);
    while (!this.atStop(stopValues) && this.matches('=')) {
      const op = this.advance().value;
      left = { kind: 'boolop', op, left, right: this.parseAdditive(stopValues) };
    }
    return left;
  }

  private parseAdditive(stopValues: Set<string>): LambdaAst {
    let left = this.parseMultiplicative(stopValues);
    while (!this.atStop(stopValues) && (this.matches('+') || this.matches('-'))) {
      const op = this.advance().value;
      left = { kind: 'numop', op, left, right: this.parseMultiplicative(stopValues) };
    }
    return left;
  }

  private parseMultiplicative(stopValues: Set<string>): LambdaAst {
    let left = this.parseApplication(stopValues);
    while (!this.atStop(stopValues) && (this.matches('*') || this.matches('/'))) {
      const op = this.advance().value;
      left = { kind: 'numop', op, left, right: this.parseApplication(stopValues) };
    }
    return left;
  }

  private parseApplication(stopValues: Set<string>): LambdaAst {
    let left = this.parsePrimary(stopValues);
    while (!this.atStop(stopValues) && this.startsPrimary()) {
      left = { kind: 'app', func: left, arg: this.parsePrimary(stopValues) };
    }
    return left;
  }

  private startsPrimary(): boolean {
    const token = this.current();
    return token.kind === 'identifier'
      || token.kind === 'number'
      || token.value === '('
      || token.value === 'true'
      || token.value === 'false'
      || token.value === 'fix';
  }

  private parsePrimary(stopValues: Set<string>): LambdaAst {
    const token = this.current();

    if (this.atStop(stopValues)) {
      throw new LambdaTextParseError('Expected a Lambda term.', token.index);
    }

    if (token.kind === 'identifier') {
      this.advance();
      return { kind: 'var', name: token.value };
    }

    if (token.kind === 'number') {
      this.advance();
      return { kind: 'num', value: Number(token.value) };
    }

    if (token.value === 'true' || token.value === 'false') {
      this.advance();
      return { kind: 'bool', value: token.value === 'true' };
    }

    if (token.value === 'fix') {
      this.advance();
      return { kind: 'var', name: 'fix' };
    }

    if (token.value === '(') {
      this.advance();
      if (this.matches(')')) {
        throw new LambdaTextParseError('Expected an expression inside parentheses.', this.current().index);
      }
      const expression = this.parseExpression(new Set([...stopValues, ')']));
      this.expectValue(')', 'Expected ")" after grouped expression.');
      return expression;
    }

    if (this.peek().value === '.') {
      throw new LambdaTextParseError('Lambda abstraction must start with λ, \\ or lambda.', token.index);
    }

    throw new LambdaTextParseError(`Unexpected token "${token.value}".`, token.index);
  }
}

function blockState(ast: LambdaAst): LambdaBlockState {
  switch (ast.kind) {
    case 'var':
      return { type: 'lambda_variable', fields: { NAME: ast.name } };
    case 'abs':
      return { type: 'lambda_abstraction', fields: { PARAM: ast.param }, inputs: { BODY: { block: blockState(ast.body) } } };
    case 'app':
      return { type: 'lambda_application', inputs: { FUNC: { block: blockState(ast.func) }, ARG: { block: blockState(ast.arg) } } };
    case 'let':
      return { type: 'lambda_let', fields: { NAME: ast.name }, inputs: { VALUE: { block: blockState(ast.value) }, BODY: { block: blockState(ast.body) } } };
    case 'letrec':
      return { type: 'lambda_letrec', fields: { NAME: ast.name }, inputs: { VALUE: { block: blockState(ast.value) }, BODY: { block: blockState(ast.body) } } };
    case 'num':
      return { type: 'lambda_number', fields: { VALUE: ast.value } };
    case 'bool':
      return { type: 'lambda_boolean', fields: { VALUE: ast.value ? 'true' : 'false' } };
    case 'numop':
      return { type: 'lambda_number_operator', fields: { OP: ast.op }, inputs: { LEFT: { block: blockState(ast.left) }, RIGHT: { block: blockState(ast.right) } } };
    case 'boolop':
      return { type: 'lambda_boolean_operator', fields: { OP: ast.op }, inputs: { LEFT: { block: blockState(ast.left) }, RIGHT: { block: blockState(ast.right) } } };
    case 'if':
      return { type: 'lambda_if', inputs: { COND: { block: blockState(ast.cond) }, THEN: { block: blockState(ast.thenTerm) }, ELSE: { block: blockState(ast.elseTerm) } } };
  }
}

export function parseLambdaTextToWorkspaceState(text: string): LambdaWorkspaceState {
  const sources = splitTopLevelSources(text);

  if (sources.length === 0) {
    throw new LambdaTextParseError('Enter a Lambda expression.', 0);
  }

  return {
    blocks: {
      languageVersion: 0,
      blocks: sources.map((source, index) => ({
        ...blockState(new Parser(tokenize(source)).parse()),
        x: 72,
        y: 72 + index * 150
      }))
    }
  };
}
