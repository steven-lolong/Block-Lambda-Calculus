import * as Blockly from 'blockly';

const GOROPA_RENDERER_NAME = 'goropa';

type BlocklyWithZelos = typeof Blockly & {
  zelos?: {
    Renderer?: new (name: string) => Blockly.blockRendering.Renderer;
    ConstantProvider?: new () => Blockly.blockRendering.ConstantProvider;
  };
};

const blocklyWithZelos = Blockly as BlocklyWithZelos;

class GoropaConstantProvider extends (blocklyWithZelos.zelos?.ConstantProvider ?? Blockly.blockRendering.ConstantProvider) {
  override init(): void {
    super.init();

    // Goropa keeps the Zelos rendering model, but removes rounded corners so
    // lambda blocks read more like rectangular text/program fragments.
    Object.assign(this, {
      CORNER_RADIUS: 0,
      FIELD_BORDER_RECT_RADIUS: 0,
      FIELD_TEXT_BASELINE_CENTER: true,
      FIELD_TEXT_FONTSIZE: 13,
      FIELD_TEXT_FONTWEIGHT: '500',
      FIELD_TEXT_FONTFAMILY:
        '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
      MIN_BLOCK_HEIGHT: 30,
      MIN_BLOCK_WIDTH: 34,
      MEDIUM_PADDING: 7,
      LARGE_PADDING: 12,
      STATEMENT_INPUT_PADDING_LEFT: 8,
      STATEMENT_INPUT_PADDING_RIGHT: 8
    });
  }
}

class GoropaRenderer extends (blocklyWithZelos.zelos?.Renderer ?? Blockly.blockRendering.Renderer) {
  protected override makeConstants_(): Blockly.blockRendering.ConstantProvider {
    return new GoropaConstantProvider();
  }
}

export function registerGoropaRenderer(): void {
  if (!blocklyWithZelos.zelos?.Renderer) {
    throw new Error('The goropa renderer requires Blockly zelos to be available.');
  }

  try {
    Blockly.blockRendering.register(GOROPA_RENDERER_NAME, GoropaRenderer);
  } catch (error) {
    // Blockly throws when a renderer name is already registered. This makes the
    // registration safe during hot reloads and repeated module evaluation.
    if (!(error instanceof Error) || !/already registered/i.test(error.message)) {
      throw error;
    }
  }
}

export { GOROPA_RENDERER_NAME };
