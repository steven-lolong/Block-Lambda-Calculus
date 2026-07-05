import * as Blockly from 'blockly';

export function fieldText(block: Blockly.Block, name: string, fallback = ''): string {
  const value = block.getFieldValue(name);
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

export function childBlock(block: Blockly.Block, inputName: string): Blockly.Block | null {
  return block.getInputTargetBlock(inputName);
}

export function isLambdaTermBlock(block: Blockly.Block): boolean {
  return Boolean(block.outputConnection) && block.type.startsWith('lambda_') && block.type !== 'lambda_viz_description';
}

// Constructs whose textual form extends as far right as possible; they must be
// parenthesized when printed inside an application or operator operand, or the
// re-parse would pull the surrounding operand into their body.
function isRightOpen(block: Blockly.Block | null): boolean {
  return block !== null && (
    block.type === 'lambda_abstraction'
    || block.type === 'lambda_let'
    || block.type === 'lambda_letrec'
    || block.type === 'lambda_if'
  );
}

// Bare negative literals re-parse as a binary minus in operand position.
function isNegativeNumber(block: Blockly.Block | null): boolean {
  return block !== null && block.type === 'lambda_number' && Number(block.getFieldValue('VALUE')) < 0;
}

function operand(block: Blockly.Block, inputName: string): string {
  const target = childBlock(block, inputName);
  const text = lambdaTermText(target);
  return isRightOpen(target) || isNegativeNumber(target) ? `(${text})` : text;
}

export function lambdaTermText(block: Blockly.Block | null): string {
  if (!block) return '□';

  switch (block.type) {
    case 'lambda_variable':
      return fieldText(block, 'NAME', 'x');

    case 'lambda_abstraction': {
      const parameter = fieldText(block, 'PARAM', 'x');
      return `λ${parameter}. ${lambdaTermText(childBlock(block, 'BODY'))}`;
    }

    case 'lambda_application': {
      const fn = operand(block, 'FUNC');
      const arg = operand(block, 'ARG');
      return `(${fn} ${arg})`;
    }

    case 'lambda_parentheses':
      return `(${lambdaTermText(childBlock(block, 'TERM'))})`;

    case 'lambda_let': {
      const name = fieldText(block, 'NAME', 'id');
      const value = lambdaTermText(childBlock(block, 'VALUE'));
      const body = lambdaTermText(childBlock(block, 'BODY'));
      return `let ${name} = ${value} in ${body}`;
    }

    case 'lambda_letrec': {
      const name = fieldText(block, 'NAME', 'f');
      const value = lambdaTermText(childBlock(block, 'VALUE'));
      const body = lambdaTermText(childBlock(block, 'BODY'));
      return `letrec ${name} = ${value} in ${body}`;
    }

    case 'lambda_number':
      return fieldText(block, 'VALUE', '0');

    case 'lambda_boolean':
      return fieldText(block, 'VALUE', 'true');

    case 'lambda_number_operator': {
      const left = operand(block, 'LEFT');
      const operator = fieldText(block, 'OP', '+');
      const right = operand(block, 'RIGHT');
      return `(${left} ${operator} ${right})`;
    }

    case 'lambda_boolean_operator': {
      const left = operand(block, 'LEFT');
      const operator = fieldText(block, 'OP', 'and');
      const right = operand(block, 'RIGHT');
      return `(${left} ${operator} ${right})`;
    }

    case 'lambda_if': {
      const condition = lambdaTermText(childBlock(block, 'COND'));
      const thenBranch = lambdaTermText(childBlock(block, 'THEN'));
      const elseBranch = lambdaTermText(childBlock(block, 'ELSE'));
      return `if ${condition} then ${thenBranch} else ${elseBranch}`;
    }

    default:
      return `/* unsupported block: ${block.type} */`;
  }
}
