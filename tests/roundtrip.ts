/**
 * Round-trip tests for the Lambda block <-> text pipeline.
 *
 * block -> text: load a workspace state headlessly, generate Lambda code.
 * text -> block: parse Lambda code back into a workspace state.
 * A round trip must preserve the logical term structure (positions/ids aside).
 *
 * Run with: npm run test:roundtrip
 */
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { generateLambdaCode } from '../src/core/generator/lambdaGenerator';
import { parseLambdaTextToWorkspaceState, type LambdaWorkspaceState } from '../src/core/parser/lambdaTextParser';
import { LAMBDA_EXAMPLES } from '../src/core/examples/lambdaExamples';

registerLambdaBlocks();

let failures = 0;
let checks = 0;

function check(label: string, actual: string, expected: string): void {
  checks += 1;
  if (actual === expected) return;
  failures += 1;
  console.error(`FAIL ${label}`);
  console.error(`  expected: ${expected}`);
  console.error(`  actual:   ${actual}`);
}

function checkThrows(label: string, run: () => void): void {
  checks += 1;
  try {
    run();
    failures += 1;
    console.error(`FAIL ${label}: expected an error, but none was thrown`);
  } catch {
    // expected
  }
}

// Canonical JSON: sorted keys, positions and ids removed, so states built by
// hand, by the examples module, and by the parser compare structurally.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (key === 'x' || key === 'y' || key === 'id') continue;
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

type AnyWorkspaceState = LambdaWorkspaceState | { blocks: { languageVersion: number; blocks: unknown[] } };

function logical(state: AnyWorkspaceState): string {
  return JSON.stringify(canonicalize(state.blocks.blocks));
}

function generateFromState(state: AnyWorkspaceState): string {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state as never, workspace);
    return generateLambdaCode(workspace);
  } finally {
    workspace.dispose();
  }
}

function checkBlockToTextToBlock(label: string, state: AnyWorkspaceState): void {
  const code = generateFromState(state);
  let reparsed: LambdaWorkspaceState;
  try {
    reparsed = parseLambdaTextToWorkspaceState(code);
  } catch (error) {
    checks += 1;
    failures += 1;
    console.error(`FAIL ${label}: generated code did not re-parse: ${String(error)}\n  code: ${code}`);
    return;
  }
  check(`${label} (code: ${code.replace(/\n/g, ' | ')})`, logical(reparsed), logical(state));
}

function checkTextToBlockToText(label: string, source: string): void {
  const first = parseLambdaTextToWorkspaceState(source);
  const code = generateFromState(first);
  const second = parseLambdaTextToWorkspaceState(code);
  check(`${label} (source: ${source})`, logical(second), logical(first));
}

function state(...blocks: object[]): AnyWorkspaceState {
  return { blocks: { languageVersion: 0, blocks } };
}

// --- Examples shipped with the IDE must round-trip exactly. ---
for (const example of Object.values(LAMBDA_EXAMPLES)) {
  checkBlockToTextToBlock(`example ${example.id}`, example.workspace);
}

// --- Regressions: right-open terms inside application/operator operands. ---
const absIdentity = { type: 'lambda_abstraction', fields: { PARAM: 'x' }, inputs: { BODY: { block: { type: 'lambda_variable', fields: { NAME: 'x' } } } } };
const varY = { type: 'lambda_variable', fields: { NAME: 'y' } };

checkBlockToTextToBlock('apply abstraction to argument', state({
  type: 'lambda_application',
  inputs: { FUNC: { block: absIdentity }, ARG: { block: varY } }
}));

checkBlockToTextToBlock('if-term as operator operand', state({
  type: 'lambda_number_operator',
  fields: { OP: '+' },
  inputs: {
    LEFT: {
      block: {
        type: 'lambda_if',
        inputs: {
          COND: { block: { type: 'lambda_boolean', fields: { VALUE: 'true' } } },
          THEN: { block: { type: 'lambda_number', fields: { VALUE: 1 } } },
          ELSE: { block: { type: 'lambda_number', fields: { VALUE: 2 } } }
        }
      }
    },
    RIGHT: { block: { type: 'lambda_number', fields: { VALUE: 3 } } }
  }
}));

checkBlockToTextToBlock('let-term as application argument', state({
  type: 'lambda_application',
  inputs: {
    FUNC: { block: { type: 'lambda_variable', fields: { NAME: 'f' } } },
    ARG: {
      block: {
        type: 'lambda_let',
        fields: { NAME: 'a' },
        inputs: {
          VALUE: { block: { type: 'lambda_number', fields: { VALUE: 1 } } },
          BODY: { block: { type: 'lambda_variable', fields: { NAME: 'a' } } }
        }
      }
    }
  }
}));

// --- Regressions: negative number literals. ---
checkBlockToTextToBlock('negative number top-level', state({ type: 'lambda_number', fields: { VALUE: -5 } }));
checkBlockToTextToBlock('negative number as application argument', state({
  type: 'lambda_application',
  inputs: {
    FUNC: { block: { type: 'lambda_variable', fields: { NAME: 'f' } } },
    ARG: { block: { type: 'lambda_number', fields: { VALUE: -3 } } }
  }
}));
checkBlockToTextToBlock('negative number as subtraction operand', state({
  type: 'lambda_number_operator',
  fields: { OP: '-' },
  inputs: {
    LEFT: { block: { type: 'lambda_variable', fields: { NAME: 'x' } } },
    RIGHT: { block: { type: 'lambda_number', fields: { VALUE: -3 } } }
  }
}));

// --- Regressions: holes (missing inputs) stay holes instead of becoming variables. ---
checkBlockToTextToBlock('abstraction with empty body', state({ type: 'lambda_abstraction', fields: { PARAM: 'x' } }));
checkBlockToTextToBlock('application with missing argument', state({
  type: 'lambda_application',
  inputs: { FUNC: { block: { type: 'lambda_variable', fields: { NAME: 'f' } } } }
}));
checkBlockToTextToBlock('if with all inputs empty', state({ type: 'lambda_if' }));
checkBlockToTextToBlock('operator with missing left operand', state({
  type: 'lambda_number_operator',
  fields: { OP: '+' },
  inputs: { RIGHT: { block: { type: 'lambda_number', fields: { VALUE: 3 } } } }
}));

// --- Multiple top-level terms. ---
checkBlockToTextToBlock('two top-level terms', state(
  { ...absIdentity, x: 72, y: 72 },
  { type: 'lambda_number', fields: { VALUE: 42 }, x: 72, y: 222 }
));

// --- Non-term blocks are excluded from generated code. ---
{
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state(
      { type: 'lambda_viz_description', fields: { TEXT: 'Reduction step' } },
      { type: 'lambda_variable', fields: { NAME: 'x' } }
    ) as never, workspace);
    check('viz description block is not generated', generateLambdaCode(workspace), 'x');
  } finally {
    workspace.dispose();
  }
}

// --- Text -> block -> text stability. ---
checkTextToBlockToText('backslash lambda', '\\x. x');
checkTextToBlockToText('unicode lambda application', '(λx. x) 5');
checkTextToBlockToText('let with arithmetic', 'let x = 10 in x + 5');
checkTextToBlockToText('factorial', 'letrec f = λn. if n = 0 then 1 else n * (f (n - 1)) in f 5');
checkTextToBlockToText('boolean precedence', 'a and b or c = d');
checkTextToBlockToText('unary minus', 'x - -3');
checkTextToBlockToText('comments and blank lines', '-- a comment\nλx. x\n\nλy. y');
checkTextToBlockToText('holes', '(f □)');
checkTextToBlockToText('hole-only source is dropped', '□\n\nx');

// --- Parser must reject unusable input. ---
checkThrows('empty text', () => parseLambdaTextToWorkspaceState('   \n -- only a comment \n'));
checkThrows('hole-only text', () => parseLambdaTextToWorkspaceState('□'));
checkThrows('unclosed parenthesis', () => parseLambdaTextToWorkspaceState('(λx. x'));
checkThrows('missing lambda body separator', () => parseLambdaTextToWorkspaceState('λx x'));

if (failures > 0) {
  console.error(`\n${failures} of ${checks} round-trip checks failed.`);
  process.exit(1);
}
console.log(`All ${checks} round-trip checks passed.`);
