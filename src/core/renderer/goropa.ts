import * as Blockly from 'blockly';

export const GOROPA_RENDERER_NAME = 'goropa';

type RendererConstructor = new (name: string) => unknown;
type ConstantsConstructor = new () => Record<string, unknown>;
type BlocklyRuntime = typeof Blockly & {
  blockRendering?: {
    Renderer?: RendererConstructor;
    ConstantProvider?: ConstantsConstructor;
    register?: (name: string, renderer: RendererConstructor) => void;
  };
  zelos?: {
    Renderer?: RendererConstructor;
    ConstantProvider?: ConstantsConstructor;
  };
};

type BlocklyInject = typeof Blockly.inject & { __goropaPatched?: boolean };

const runtime = Blockly as BlocklyRuntime;
const blockRendering = runtime.blockRendering;
const zelos = runtime.zelos;

const ZelosRendererBase = (zelos?.Renderer ?? blockRendering?.Renderer) as RendererConstructor | undefined;
const ZelosConstantsBase = (zelos?.ConstantProvider ?? blockRendering?.ConstantProvider) as ConstantsConstructor | undefined;

function setOptionalConstant(target: Record<string, unknown>, name: string, value: unknown): void {
  if (name in target) target[name] = value;
}

class GoropaConstantsProvider extends (ZelosConstantsBase ?? class {}) {
  constructor() {
    super();
    this.applySquareGeometry();
  }

  init(): void {
    this.applySquareGeometry();

    const parentInit = Object.getPrototypeOf(GoropaConstantsProvider.prototype).init as (() => void) | undefined;
    if (typeof parentInit === 'function') parentInit.call(this);

    this.applySquareGeometry();
  }

  private applySquareGeometry(): void {
    const constants = this as Record<string, unknown>;

    // Goropa uses the same base renderer family as Zelos, but deliberately
    // removes rounded block and field corners. The result keeps Blockly's
    // connection semantics while making lambda blocks read more like text.
    constants.CORNER_RADIUS = 0;
    setOptionalConstant(constants, 'FIELD_BORDER_RECT_RADIUS', 0);
    setOptionalConstant(constants, 'EMPTY_INLINE_INPUT_PADDING', 5);
    setOptionalConstant(constants, 'EMPTY_STATEMENT_INPUT_HEIGHT', 20);
    setOptionalConstant(constants, 'MEDIUM_PADDING', 7);
    setOptionalConstant(constants, 'LARGE_PADDING', 12);
    setOptionalConstant(constants, 'STATEMENT_INPUT_PADDING_LEFT', 8);
    setOptionalConstant(constants, 'STATEMENT_INPUT_PADDING_RIGHT', 8);
  }
}

class GoropaRenderer extends (ZelosRendererBase ?? class {}) {
  constructor(name = GOROPA_RENDERER_NAME) {
    super(name);
  }

  makeConstants_(): GoropaConstantsProvider {
    return new GoropaConstantsProvider();
  }
}

function installGoropaStyle(): void {
  if (typeof document === 'undefined' || document.getElementById('goropa-renderer-style')) return;

  const style = document.createElement('style');
  style.id = 'goropa-renderer-style';
  style.textContent = `
    .blocklyPath,
    .blocklyPathLight,
    .blocklyPathDark {
      stroke-linejoin: miter;
      stroke-linecap: butt;
    }

    .blocklyEditableText > rect,
    .blocklyNonEditableText > rect,
    .blocklyDropdownRect,
    .blocklyTextBackground {
      rx: 0;
      ry: 0;
    }
  `;
  document.head.appendChild(style);
}

export function registerGoropaRenderer(): void {
  if (!blockRendering?.register || !ZelosRendererBase || !ZelosConstantsBase) {
    throw new Error('The goropa renderer requires Blockly block rendering and the Zelos renderer base classes.');
  }

  try {
    blockRendering.register(GOROPA_RENDERER_NAME, GoropaRenderer as RendererConstructor);
  } catch (error) {
    // Webpack dev-server hot reload can evaluate this module more than once.
    if (!(error instanceof Error) || !/already registered/i.test(error.message)) throw error;
  }

  installGoropaStyle();
}

export function preferGoropaForZelosWorkspaces(): void {
  const injectHost = Blockly as unknown as { inject: BlocklyInject };
  if (injectHost.inject.__goropaPatched) return;

  const originalInject = injectHost.inject.bind(Blockly) as typeof Blockly.inject;
  const patchedInject = ((container: Element | string, options?: Blockly.BlocklyOptions) => {
    const nextOptions = options
      ? {
        ...options,
        renderer: !options.renderer || options.renderer === 'zelos' ? GOROPA_RENDERER_NAME : options.renderer
      }
      : { renderer: GOROPA_RENDERER_NAME } as Blockly.BlocklyOptions;

    return originalInject(container, nextOptions as Blockly.BlocklyOptions);
  }) as BlocklyInject;

  patchedInject.__goropaPatched = true;
  injectHost.inject = patchedInject;
}

registerGoropaRenderer();
preferGoropaForZelosWorkspaces();
