import * as Blockly from 'blockly';

function field(block: Blockly.Block, name: string, fallback = ''): string {
  const value = block.getFieldValue(name);
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function child(block: Blockly.Block, inputName: string): Blockly.Block | null {
  return block.getInputTargetBlock(inputName);
}

function term(block: Blockly.Block | null): string {
  if (!block) return '□';

  switch (block.type) {
    case 'lambda_variable':
      return field(block, 'NAME', 'x');

    case 'lambda_abstraction': {
      const parameter = field(block, 'PARAM', 'x');
      return `λ${parameter}. ${term(child(block, 'BODY'))}`;
    }

    case 'lambda_application': {
      const fn = term(child(block, 'FUNC'));
      const arg = term(child(block, 'ARG'));
      return `(${fn} ${arg})`;
    }

    case 'lambda_parentheses':
      return `(${term(child(block, 'TERM'))})`;

    case 'lambda_let': {
      const name = field(block, 'NAME', 'id');
      const value = term(child(block, 'VALUE'));
      const body = term(child(block, 'BODY'));
      return `let ${name} = ${value} in ${body}`;
    }

    case 'lambda_number':
      return field(block, 'VALUE', '0');

    case 'lambda_boolean':
      return field(block, 'VALUE', 'true');

    default:
      return `/* unsupported block: ${block.type} */`;
  }
}

export function generateLambdaCode(workspace: Blockly.WorkspaceSvg): string {
  const topBlocks = workspace
    .getTopBlocks(true)
    .filter((block) => !block.getParent());

  if (topBlocks.length === 0) {
    return '-- Drag or click blocks from the toolbox to generate Lambda code.';
  }

  return topBlocks.map((block) => term(block)).join('\n');
}
