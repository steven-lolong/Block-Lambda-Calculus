import * as Blockly from 'blockly';
import { isValidLambdaName } from '../parser/lambdaTextParser';
import { getLambdaBlockStyle } from '../renderer/theme';

// Restrict names to identifiers the Lambda text parser can read back,
// so every block program stays convertible to text and back.
function nameField(defaultName: string): Blockly.FieldTextInput {
  const field = new Blockly.FieldTextInput(defaultName);
  field.setValidator((value: string) => {
    const trimmed = value.trim();
    return isValidLambdaName(trimmed) ? trimmed : null;
  });
  return field;
}

export function registerLambdaBlocks(): void {
  Blockly.Blocks['lambda_variable'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('bound')
        .appendField(nameField('x'), 'NAME');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle(getLambdaBlockStyle('lambda_variable'));
      this.setTooltip('A lambda-calculus variable. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_abstraction'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('lambda, variable')
        .appendField(nameField('x'), 'PARAM')
        .appendField('.');
      this.appendValueInput('BODY')
        .setCheck('LambdaTerm')
        .appendField('body');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle(getLambdaBlockStyle('lambda_abstraction'));
      this.setTooltip('Lambda abstraction: λx. body. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_application'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('application of');
      this.appendValueInput('FUNC')
        .setCheck('LambdaTerm')
        .appendField('function');
      this.appendValueInput('ARG')
        .setCheck('LambdaTerm')
        .appendField('over');
      this.setOutput(true, 'LambdaTerm');
      this.setInputsInline(false);
      this.setStyle(getLambdaBlockStyle('lambda_application'));
      this.setTooltip('Function application: f x. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_parentheses'] = {
    init: function () {
      this.appendValueInput('TERM')
        .setCheck('LambdaTerm')
        .appendField('grouping');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle(getLambdaBlockStyle('lambda_parentheses'));
      this.setTooltip('Explicit grouping for a lambda term. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_let'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('let')
        .appendField(nameField('id'), 'NAME');
      this.appendValueInput('VALUE')
        .setCheck('LambdaTerm')
        .appendField('=');
      this.appendValueInput('BODY')
        .setCheck('LambdaTerm')
        .appendField('in');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle(getLambdaBlockStyle('lambda_let'));
      this.setTooltip('Let binding: let id = value in body. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_letrec'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('letrec')
        .appendField(nameField('factorial'), 'NAME');
      this.appendValueInput('VALUE')
        .setCheck('LambdaTerm')
        .appendField('=');
      this.appendValueInput('BODY')
        .setCheck('LambdaTerm')
        .appendField('in');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle(getLambdaBlockStyle('lambda_letrec'));
      this.setTooltip('Recursive let binding: letrec f = value in body. Use it for recursive functions such as factorial.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_number'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('number')
        .appendField(new Blockly.FieldNumber(0), 'VALUE');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle(getLambdaBlockStyle('lambda_number'));
      this.setTooltip('A numeric literal for examples and encodings. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_boolean'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('boolean')
        .appendField(new Blockly.FieldDropdown([
          ['true', 'true'],
          ['false', 'false']
        ]), 'VALUE');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle(getLambdaBlockStyle('lambda_boolean'));
      this.setTooltip('A boolean literal for examples and encodings. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_number_operator'] = {
    init: function () {
      this.appendValueInput('LEFT')
        .setCheck('LambdaTerm')
        .appendField('number');
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([
          ['+', '+'],
          ['−', '-'],
          ['×', '*'],
          ['÷', '/']
        ]), 'OP');
      this.appendValueInput('RIGHT')
        .setCheck('LambdaTerm')
        .appendField('number');
      this.setInputsInline(true);
      this.setOutput(true, 'LambdaTerm');
      this.setStyle(getLambdaBlockStyle('lambda_number_operator'));
      this.setTooltip('Numeric operator: left op right. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_number_comparison'] = {
    init: function () {
      this.appendValueInput('LEFT')
        .setCheck('LambdaTerm')
        .appendField('number');
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([
          ['=', '='],
          ['<', '<'],
          ['≤', '<='],
          ['>', '>'],
          ['≥', '>=']
        ]), 'OP');
      this.appendValueInput('RIGHT')
        .setCheck('LambdaTerm')
        .appendField('number');
      this.setInputsInline(true);
      this.setOutput(true, 'LambdaTerm');
      this.setStyle(getLambdaBlockStyle('lambda_number_comparison'));
      this.setTooltip('Numeric comparison: left =/</≤/>/≥ right, yielding a boolean. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_boolean_operator'] = {
    init: function () {
      this.appendValueInput('LEFT')
        .setCheck('LambdaTerm')
        .appendField('boolean');
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([
          ['and', 'and'],
          ['or', 'or'],
          ['equal', 'equal']
        ]), 'OP');
      this.appendValueInput('RIGHT')
        .setCheck('LambdaTerm')
        .appendField('boolean');
      this.setInputsInline(true);
      this.setOutput(true, 'LambdaTerm');
      this.setStyle(getLambdaBlockStyle('lambda_boolean_operator'));
      this.setTooltip('Boolean operator: left and/or/equal right (booleans only). Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_if'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('if expression');
      this.appendValueInput('COND')
        .setCheck('LambdaTerm')
        .appendField('if');
      this.appendValueInput('THEN')
        .setCheck('LambdaTerm')
        .appendField('then');
      this.appendValueInput('ELSE')
        .setCheck('LambdaTerm')
        .appendField('else');
      this.setOutput(true, 'LambdaTerm');
      this.setInputsInline(false);
      this.setStyle(getLambdaBlockStyle('lambda_if'));
      this.setTooltip('Conditional expression: if condition then true-branch else false-branch. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_viz_description'] = {
    init: function () {
      this.appendDummyInput()
        .appendField(new Blockly.FieldTextInput('Reduction step'), 'TEXT');
      this.setStyle(getLambdaBlockStyle('lambda_viz_description'));
      this.setTooltip('Reduction visualization label.');
      this.setHelpUrl('');
    }
  };
}
