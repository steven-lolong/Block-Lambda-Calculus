import assert from 'node:assert/strict';
import * as Blockly from 'blockly';
import { registerLambdaBlocks } from '../src/core/blocks/lambdaBlocks';
import { LAMBDA_EXAMPLES } from '../src/core/examples/lambdaExamples';
import { TUDE_CONNECTOR_GEOMETRY } from '../src/core/renderer/tude';
import {
  LAMBDA_BLOCK_CATEGORY,
  LAMBDA_BLOCK_PALETTES,
  LAMBDA_BLOCK_TYPES,
  LAMBDA_CATEGORY_STYLE,
  LAMBDA_GRAMMAR_CATEGORIES,
  getLambdaBlockStyle,
  getLambdaGrammarCategory
} from '../src/core/renderer/theme';
import { LAMBDA_TOOLBOX_CATEGORIES } from '../src/core/renderer/toolbox';

registerLambdaBlocks();

let checks = 0;

function check(label: string, assertion: () => void): void {
  checks += 1;
  try {
    assertion();
  } catch (error) {
    console.error(`FAIL ${label}`);
    throw error;
  }
}

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
}

function relativeLuminance(hex: string): number {
  const linear = [channel(hex, 1), channel(hex, 3), channel(hex, 5)].map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function rgbDistance(first: string, second: string): number {
  return Math.hypot(
    channel(first, 1) * 255 - channel(second, 1) * 255,
    channel(first, 3) * 255 - channel(second, 3) * 255,
    channel(first, 5) * 255 - channel(second, 5) * 255
  );
}

const registeredLambdaTypes = Object.keys(Blockly.Blocks)
  .filter((type) => type.startsWith('lambda_'))
  .sort();

check('the classification exhaustively matches registered Lambda blocks', () => {
  assert.deepEqual(registeredLambdaTypes, [...LAMBDA_BLOCK_TYPES].sort());
  assert.deepEqual(Object.keys(LAMBDA_BLOCK_CATEGORY).sort(), [...LAMBDA_BLOCK_TYPES].sort());
});

for (const blockType of LAMBDA_BLOCK_TYPES) {
  check(`${blockType} resolves to a valid grammatical category and style`, () => {
    const category = getLambdaGrammarCategory(blockType);
    assert.ok(LAMBDA_GRAMMAR_CATEGORIES.includes(category));
    assert.equal(getLambdaBlockStyle(blockType), LAMBDA_CATEGORY_STYLE[category]);

    const workspace = new Blockly.Workspace();
    try {
      const block = workspace.newBlock(blockType);
      assert.equal(block.getStyleName(), LAMBDA_CATEGORY_STYLE[category]);
    } finally {
      workspace.dispose();
    }
  });
}

check('unknown blocks fail explicitly instead of receiving a fallback color', () => {
  assert.throws(
    () => getLambdaGrammarCategory('lambda_unclassified_future_block'),
    /has no grammatical color category/
  );
  assert.throws(
    () => getLambdaBlockStyle('lambda_unclassified_future_block'),
    /has no grammatical color category/
  );
});

check('every toolbox block uses the centralized classification', () => {
  const toolboxTypes = LAMBDA_TOOLBOX_CATEGORIES.flatMap((category) => category.blocks.map((block) => block.type));
  assert.equal(new Set(toolboxTypes).size, toolboxTypes.length);
  for (const blockType of toolboxTypes) {
    assert.doesNotThrow(() => getLambdaGrammarCategory(blockType));
  }
  assert.deepEqual(
    toolboxTypes.slice().sort(),
    LAMBDA_BLOCK_TYPES.filter((type) => type !== 'lambda_viz_description').sort()
  );
});

for (const mode of ['light', 'dark'] as const) {
  const workspaceSurface = mode === 'light' ? '#f7f8fa' : '#171a20';
  const primaryColors: string[] = [];

  for (const category of LAMBDA_GRAMMAR_CATEGORIES) {
    const palette = LAMBDA_BLOCK_PALETTES[mode][category];
    check(`${mode} ${category} palette has valid colors and usable contrast`, () => {
      for (const value of Object.values(palette)) {
        assert.match(value, /^#[0-9a-f]{6}$/i);
      }
      assert.ok(contrastRatio('#ffffff', palette.colourPrimary) >= 4.5, 'white label contrast is below 4.5:1');
      assert.ok(contrastRatio(workspaceSurface, palette.colourPrimary) >= 3, 'workspace boundary contrast is below 3:1');
      assert.ok(contrastRatio(palette.colourPrimary, palette.colourTertiary) >= 1.4, 'outline contrast is too weak');
      primaryColors.push(palette.colourPrimary);
    });
  }

  check(`${mode} category primaries remain distinguishable`, () => {
    assert.equal(new Set(primaryColors).size, LAMBDA_GRAMMAR_CATEGORIES.length);
    for (let first = 0; first < primaryColors.length; first += 1) {
      for (let second = first + 1; second < primaryColors.length; second += 1) {
        assert.ok(rgbDistance(primaryColors[first], primaryColors[second]) >= 24);
      }
    }
  });
}

check('editable Blockly fields retain high text contrast', () => {
  assert.ok(contrastRatio('#ffffff', '#111318') >= 15);
});

check('Tude connector geometry remains pinned to the grammar-aware square mapping', () => {
  assert.deepEqual(TUDE_CONNECTOR_GEOMETRY, {
    reporterShapePolicy: 'square-for-all',
    pageGutterWidth: 16,
    valueSocketWidth: 22,
    valueSocketHeight: 20,
    statementNotchWidth: 36,
    statementNotchHeight: 8,
    cornerRadius: 0
  });
});

const expectedValueInputs: Readonly<Record<string, readonly string[]>> = {
  lambda_abstraction: ['BODY'],
  lambda_application: ['FUNC', 'ARG'],
  lambda_parentheses: ['TERM'],
  lambda_let: ['VALUE', 'BODY'],
  lambda_letrec: ['VALUE', 'BODY'],
  lambda_number_operator: ['LEFT', 'RIGHT'],
  lambda_number_comparison: ['LEFT', 'RIGHT'],
  lambda_boolean_operator: ['LEFT', 'RIGHT'],
  lambda_if: ['COND', 'THEN', 'ELSE']
};

for (const blockType of LAMBDA_BLOCK_TYPES) {
  check(`${blockType} retains its connection contract`, () => {
    const workspace = new Blockly.Workspace();
    try {
      const block = workspace.newBlock(blockType);
      const isSemanticAnnotation = blockType === 'lambda_viz_description';
      assert.equal(Boolean(block.outputConnection), !isSemanticAnnotation);
      assert.equal(block.previousConnection, null);
      assert.equal(block.nextConnection, null);
      if (block.outputConnection) assert.deepEqual(block.outputConnection.getCheck(), ['LambdaTerm']);

      const connectedInputs = block.inputList.filter((input) => input.connection);
      assert.deepEqual(connectedInputs.map((input) => input.name), expectedValueInputs[blockType] ?? []);
      for (const input of connectedInputs) {
        assert.deepEqual(input.connection?.getCheck(), ['LambdaTerm']);
      }
    } finally {
      workspace.dispose();
    }
  });
}

for (const blockType of LAMBDA_BLOCK_TYPES) {
  check(`${blockType} serialization round-trip preserves state and classification`, () => {
    const sourceWorkspace = new Blockly.Workspace();
    const restoredWorkspace = new Blockly.Workspace();
    try {
      sourceWorkspace.newBlock(blockType);
      const serialized = Blockly.serialization.workspaces.save(sourceWorkspace);
      Blockly.serialization.workspaces.load(serialized, restoredWorkspace);
      assert.deepEqual(Blockly.serialization.workspaces.save(restoredWorkspace), serialized);
      const restored = restoredWorkspace.getAllBlocks(false);
      assert.equal(restored.length, 1);
      assert.equal(restored[0].type, blockType);
      assert.equal(restored[0].getStyleName(), getLambdaBlockStyle(blockType));
    } finally {
      sourceWorkspace.dispose();
      restoredWorkspace.dispose();
    }
  });
}

for (const example of Object.values(LAMBDA_EXAMPLES)) {
  check(`example ${example.id} loads with classified blocks`, () => {
    const workspace = new Blockly.Workspace();
    try {
      Blockly.serialization.workspaces.load(example.workspace as never, workspace);
      const blocks = workspace.getAllBlocks(false);
      assert.ok(blocks.length > 0);
      for (const block of blocks) {
        assert.equal(block.getStyleName(), getLambdaBlockStyle(block.type));
      }
    } finally {
      workspace.dispose();
    }
  });
}

console.log(`All ${checks} block color checks passed.`);
