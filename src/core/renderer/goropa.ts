import * as Blockly from 'blockly';

const GOROPA_RENDERER_NAME = 'goropa';
const ZHELOS_COMPAT_RENDERER_NAME = 'zelos';

type RendererConstructor = new (name: string) => Blockly.blockRendering.Renderer;

type BlocklyWithZelos = typeof Blockly & {
  zelos?: {
    Renderer?: RendererConstructor;
    ConstantProvider?: new () => Blockly.blockRendering.ConstantProvider;
  };
};

type BlocklyRegistry = typeof Blockly.registry & {
  unregister?: (type: string, name: string) => void;
  Type?: { RENDERER?: string };
};

const blocklyWithZelos = Blockly as BlocklyWithZelos;
const blocklyRegistry = Blockly.registry as BlocklyRegistry;

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

function registerRendererName(name: string, renderer: RendererConstructor, replaceExisting = false): void {
  try {
    Blockly.blockRendering.register(name, renderer);
  } catch (error) {
    const alreadyRegistered = error instanceof Error && /already registered/i.test(error.message);
    if (!alreadyRegistered) throw error;

    if (!replaceExisting) return;

    const rendererType = blocklyRegistry.Type?.RENDERER ?? 'renderer';
    blocklyRegistry.unregister?.(rendererType, name);
    Blockly.blockRendering.register(name, renderer);
  }
}

export function registerGoropaRenderer(): void {
  if (!blocklyWithZelos.zelos?.Renderer) {
    throw new Error('The goropa renderer requires Blockly zelos to be available.');
  }

  registerRendererName(GOROPA_RENDERER_NAME, GoropaRenderer);

  // The main entry currently asks Blockly for the Zelos renderer. Rebinding the
  // existing renderer key lets the IDE immediately use Goropa while keeping the
  // public Goropa renderer name available for future direct injection.
  registerRendererName(ZHELOS_COMPAT_RENDERER_NAME, GoropaRenderer, true);
}

export { GOROPA_RENDERER_NAME };
