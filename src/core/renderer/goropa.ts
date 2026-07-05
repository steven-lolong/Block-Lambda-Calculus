import * as Blockly from 'blockly';

export const GOROPA_RENDERER_NAME = 'goropa';

type RendererConstructor = new (name: string) => unknown;
type ConstantsConstructor = new () => Record<string, unknown>;
type ShapeRecord = Record<string, unknown>;
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

function squareValueShape(type: number): ShapeRecord {
  return {
    type,
    isDynamic: true,
    width: () => 0,
    height: (height: number) => height,
    connectionOffsetY: (height: number) => height / 2,
    connectionOffsetX: () => 0,
    pathDown: (height: number) => `v ${height}`,
    pathUp: (height: number) => `v ${-height}`,
    pathRightDown: (height: number) => `v ${height}`,
    pathRightUp: (height: number) => `v ${-height}`
  };
}

function squarePuzzleTab(type: number): ShapeRecord {
  return {
    type,
    width: 8,
    height: 15,
    pathDown: 'v 3 h -8 v 9 h 8 v 3',
    pathUp: 'v -3 h -8 v -9 h 8 v -3'
  };
}

function squareStatementNotch(type: number): ShapeRecord {
  return {
    type,
    width: 36,
    height: 8,
    pathLeft: 'h 12 v 8 h 12 v -8 h 12',
    pathRight: 'h -12 v 8 h -12 v -8 h -12'
  };
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
    const shapes = constants.SHAPES as Record<string, number> | undefined;
    const squareType = shapes?.SQUARE ?? 3;
    const puzzleType = shapes?.PUZZLE ?? 4;
    const notchType = shapes?.NOTCH ?? 5;
    const squareShape = squareValueShape(squareType);

    // Goropa uses the same base renderer family as Zelos, but deliberately
    // removes rounded block, reporter, tab, notch, and field corners. Zelos
    // normally maps value/output connections to ROUNDED by default; Goropa
    // remaps those reporter shapes to a straight rectangular profile so
    // LambdaTerm blocks read like text/program fragments instead of ellipses.
    constants.CORNER_RADIUS = 0;
    constants.CURSOR_RADIUS = 0;
    constants.ROUNDED = squareShape;
    constants.HEXAGONAL = squareShape;
    constants.SQUARED = squareShape;
    constants.PUZZLE_TAB = squarePuzzleTab(puzzleType);
    constants.NOTCH = squareStatementNotch(notchType);
    constants.INSIDE_CORNERS = {
      width: 0,
      height: 0,
      rightWidth: 0,
      rightHeight: 0,
      pathTop: '',
      pathBottom: '',
      pathTopRight: '',
      pathBottomRight: ''
    };
    constants.OUTSIDE_CORNERS = {
      topLeft: '',
      topRight: '',
      bottomRight: '',
      bottomLeft: '',
      rightHeight: 0
    };

    setOptionalConstant(constants, 'FIELD_BORDER_RECT_RADIUS', 0);
    setOptionalConstant(constants, 'EMPTY_INLINE_INPUT_PADDING', 5);
    setOptionalConstant(constants, 'EMPTY_STATEMENT_INPUT_HEIGHT', 20);
    setOptionalConstant(constants, 'MEDIUM_PADDING', 7);
    setOptionalConstant(constants, 'LARGE_PADDING', 12);
    setOptionalConstant(constants, 'STATEMENT_INPUT_PADDING_LEFT', 8);
    setOptionalConstant(constants, 'STATEMENT_INPUT_PADDING_RIGHT', 8);
    setOptionalConstant(constants, 'STATEMENT_INPUT_NOTCH_OFFSET', 8);
    setOptionalConstant(constants, 'STATEMENT_BOTTOM_SPACER', 0);
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
