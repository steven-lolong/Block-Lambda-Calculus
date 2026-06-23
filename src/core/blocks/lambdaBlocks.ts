import * as Blockly from 'blockly';

export function registerLambdaBlocks(): void {
  Blockly.Blocks['lambda_variable'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('bound')
        .appendField(new Blockly.FieldTextInput('x'), 'NAME');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle('lambda_term');
      this.setTooltip('A lambda-calculus variable.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_abstraction'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('lambda, variable')
        .appendField(new Blockly.FieldTextInput('x'), 'PARAM')
        .appendField('.');
      this.appendValueInput('BODY')
        .setCheck('LambdaTerm')
        .appendField('body');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle('lambda_binding');
      this.setTooltip('Lambda abstraction: λx. body');
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
      this.setStyle('lambda_term');
      this.setTooltip('Function application: f x');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_parentheses'] = {
    init: function () {
      this.appendValueInput('TERM')
        .setCheck('LambdaTerm')
        .appendField('grouping');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle('lambda_grouping');
      this.setTooltip('Explicit grouping for a lambda term.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_let'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('let')
        .appendField(new Blockly.FieldTextInput('id'), 'NAME');
      this.appendValueInput('VALUE')
        .setCheck('LambdaTerm')
        .appendField('=');
      this.appendValueInput('BODY')
        .setCheck('LambdaTerm')
        .appendField('in');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle('lambda_binding');
      this.setTooltip('Let binding: let id = value in body');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_number'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('number')
        .appendField(new Blockly.FieldNumber(0), 'VALUE');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle('lambda_literal');
      this.setTooltip('A numeric literal for examples and encodings.');
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
      this.setStyle('lambda_literal');
      this.setTooltip('A boolean literal for examples and encodings.');
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
      this.setStyle('lambda_operator');
      this.setTooltip('Numeric operator: left op right.');
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
          ['=', '=']
        ]), 'OP');
      this.appendValueInput('RIGHT')
        .setCheck('LambdaTerm')
        .appendField('boolean');
      this.setInputsInline(true);
      this.setOutput(true, 'LambdaTerm');
      this.setStyle('lambda_operator');
      this.setTooltip('Boolean operator: left and/or/= right.');
      this.setHelpUrl('');
    }
  };

  Blockly.Blocks['lambda_if'] = {
    init: function () {
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
      this.setStyle('lambda_control');
      this.setTooltip('Conditional expression: if condition then true-branch else false-branch.');
      this.setHelpUrl('');
    }
  };
}
