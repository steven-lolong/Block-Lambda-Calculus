import * as Blockly from 'blockly';

type LambdaContextMenuAction = 'type-info' | 'structure' | 'value';
type BlockContextMenuOptions = Array<Blockly.ContextMenuOption | Blockly.LegacyContextMenuOption>;

function dispatchContextMenuAction(block: Blockly.BlockSvg, action: LambdaContextMenuAction): void {
  window.dispatchEvent(new CustomEvent('block-lambda:context-menu-action', {
    detail: { action, block }
  }));
}

function installLambdaContextMenu(block: Blockly.Block): void {
  const blockSvg = block as Blockly.BlockSvg;
  blockSvg.customContextMenu = (options: BlockContextMenuOptions) => {
    options.push({
      text: 'Show Type and Value',
      enabled: true,
      callback: () => dispatchContextMenuAction(blockSvg, 'type-info')
    });

    if (blockSvg.type !== 'lambda_application') return;

    options.push(
      {
        text: 'Evaluate - Call-by-Structure',
        enabled: true,
        callback: () => dispatchContextMenuAction(blockSvg, 'structure')
      },
      {
        text: 'Evaluate - Call-by-Value',
        enabled: true,
        callback: () => dispatchContextMenuAction(blockSvg, 'value')
      }
    );
  };
}

export function registerLambdaBlocks(): void {
  Blockly.Blocks['lambda_variable'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('bound')
        .appendField(new Blockly.FieldTextInput('x'), 'NAME');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle('lambda_term');
      this.setTooltip('A lambda-calculus variable. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
      installLambdaContextMenu(this);
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
      this.setTooltip('Lambda abstraction: λx. body. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
      installLambdaContextMenu(this);
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
      this.setTooltip('Function application: f x. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
      installLambdaContextMenu(this);
    }
  };

  Blockly.Blocks['lambda_parentheses'] = {
    init: function () {
      this.appendValueInput('TERM')
        .setCheck('LambdaTerm')
        .appendField('grouping');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle('lambda_grouping');
      this.setTooltip('Explicit grouping for a lambda term. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
      installLambdaContextMenu(this);
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
      this.setTooltip('Let binding: let id = value in body. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
      installLambdaContextMenu(this);
    }
  };

  Blockly.Blocks['lambda_letrec'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('letrec')
        .appendField(new Blockly.FieldTextInput('factorial'), 'NAME');
      this.appendValueInput('VALUE')
        .setCheck('LambdaTerm')
        .appendField('=');
      this.appendValueInput('BODY')
        .setCheck('LambdaTerm')
        .appendField('in');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle('lambda_binding');
      this.setTooltip('Recursive let binding: letrec f = value in body. Use it for recursive functions such as factorial.');
      this.setHelpUrl('');
      installLambdaContextMenu(this);
    }
  };

  Blockly.Blocks['lambda_number'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('number')
        .appendField(new Blockly.FieldNumber(0), 'VALUE');
      this.setOutput(true, 'LambdaTerm');
      this.setStyle('lambda_literal');
      this.setTooltip('A numeric literal for examples and encodings. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
      installLambdaContextMenu(this);
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
      this.setTooltip('A boolean literal for examples and encodings. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
      installLambdaContextMenu(this);
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
      this.setTooltip('Numeric operator: left op right. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
      installLambdaContextMenu(this);
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
      this.setTooltip('Boolean operator: left and/or/= right. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
      installLambdaContextMenu(this);
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
      this.setStyle('lambda_control');
      this.setTooltip('Conditional expression: if condition then true-branch else false-branch. Open the Blockly comment icon to see the inferred type and value.');
      this.setHelpUrl('');
      installLambdaContextMenu(this);
    }
  };

  Blockly.Blocks['lambda_viz_description'] = {
    init: function () {
      this.appendDummyInput()
        .appendField(new Blockly.FieldTextInput('Reduction step'), 'TEXT');
      this.setStyle('lambda_meta');
      this.setTooltip('Reduction visualization label.');
      this.setHelpUrl('');
    }
  };
}
