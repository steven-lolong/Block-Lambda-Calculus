import * as Blockly from 'blockly';

export const TUDE_RENDERER_NAME = 'tude';

type ZelosShape = ReturnType<Blockly.zelos.ConstantProvider['shapeFor']>;
type TudeInsideCorners = Blockly.blockRendering.InsideCorners & {
  rightWidth: number;
  rightHeight: number;
  pathTopRight: string;
  pathBottomRight: string;
};

const PAGE_GUTTER_WIDTH = 16;
const VALUE_SOCKET_WIDTH = 22;
const VALUE_SOCKET_HEIGHT = 20;

function makeSquareReporterShape(type: number): Blockly.blockRendering.DynamicShape {
  return {
    type,
    isDynamic: true,
    width: () => PAGE_GUTTER_WIDTH,
    height: (height: number) => height,
    connectionOffsetY: (height: number) => height / 2,
    connectionOffsetX: (width: number) => -width,
    pathDown: (height: number) => `h ${-VALUE_SOCKET_WIDTH} v ${height} h ${VALUE_SOCKET_WIDTH}`,
    pathUp: (height: number) => `h ${-PAGE_GUTTER_WIDTH} v ${-height} h ${PAGE_GUTTER_WIDTH}`,
    pathRightDown: (height: number) => `h ${PAGE_GUTTER_WIDTH} v ${height} h ${-PAGE_GUTTER_WIDTH}`,
    pathRightUp: (height: number) => `h ${PAGE_GUTTER_WIDTH} v ${-height} h ${-PAGE_GUTTER_WIDTH}`
  };
}

function makeSquarePuzzleTab(type: number): Blockly.blockRendering.PuzzleTab {
  return {
    type,
    width: VALUE_SOCKET_WIDTH,
    height: VALUE_SOCKET_HEIGHT,
    pathDown: `v 4 h ${-VALUE_SOCKET_WIDTH} v ${VALUE_SOCKET_HEIGHT - 8} h ${VALUE_SOCKET_WIDTH} v 4`,
    pathUp: `v -4 h ${-VALUE_SOCKET_WIDTH} v ${-(VALUE_SOCKET_HEIGHT - 8)} h ${VALUE_SOCKET_WIDTH} v -4`
  };
}

function makeSquareStatementNotch(type: number): Blockly.blockRendering.Notch {
  return {
    type,
    width: 36,
    height: 8,
    pathLeft: 'h 12 v 8 h 12 v -8 h 12',
    pathRight: 'h -12 v 8 h -12 v -8 h -12'
  };
}

function makeSquareInsideCorners(): TudeInsideCorners {
  return {
    width: 0,
    height: 0,
    rightWidth: 0,
    rightHeight: 0,
    pathTop: '',
    pathBottom: '',
    pathTopRight: '',
    pathBottomRight: ''
  };
}

function makeSquareOutsideCorners(): Blockly.blockRendering.OutsideCorners {
  return {
    topLeft: '',
    topRight: '',
    bottomRight: '',
    bottomLeft: '',
    rightHeight: 0
  };
}

class TudeConstantsProvider extends Blockly.zelos.ConstantProvider {
  constructor() {
    super();

    this.CORNER_RADIUS = 0;
    this.CURSOR_RADIUS = 0;
    this.FIELD_BORDER_RECT_RADIUS = 0;
    this.TAB_WIDTH = VALUE_SOCKET_WIDTH;
    this.TAB_HEIGHT = VALUE_SOCKET_HEIGHT;
    this.EXTERNAL_VALUE_INPUT_PADDING = 16;
    this.EMPTY_INLINE_INPUT_PADDING = VALUE_SOCKET_WIDTH;
    this.EMPTY_INLINE_INPUT_HEIGHT = 32;
    this.EMPTY_STATEMENT_INPUT_HEIGHT = 20;
    this.MIN_BLOCK_WIDTH = 42;
    this.DUMMY_INPUT_MIN_HEIGHT = 32;
    this.MEDIUM_PADDING = 8;
    this.MEDIUM_LARGE_PADDING = 12;
    this.LARGE_PADDING = 16;
    this.STATEMENT_INPUT_PADDING_LEFT = 8;
    this.STATEMENT_INPUT_NOTCH_OFFSET = 8;
    this.STATEMENT_BOTTOM_SPACER = 0;
    this.SHAPE_IN_SHAPE_PADDING[this.SHAPES.SQUARE][0] = PAGE_GUTTER_WIDTH;
    this.SHAPE_IN_SHAPE_PADDING[this.SHAPES.SQUARE][this.SHAPES.HEXAGONAL] = PAGE_GUTTER_WIDTH;
    this.SHAPE_IN_SHAPE_PADDING[this.SHAPES.SQUARE][this.SHAPES.ROUND] = PAGE_GUTTER_WIDTH;
    this.SHAPE_IN_SHAPE_PADDING[this.SHAPES.SQUARE][this.SHAPES.SQUARE] = PAGE_GUTTER_WIDTH;
  }

  override init(): void {
    super.init();

    const squareReporter = makeSquareReporterShape(this.SHAPES.SQUARE);
    this.HEXAGONAL = squareReporter;
    this.ROUNDED = squareReporter;
    this.SQUARED = squareReporter;
    this.PUZZLE_TAB = makeSquarePuzzleTab(this.SHAPES.PUZZLE);
    this.NOTCH = makeSquareStatementNotch(this.SHAPES.NOTCH);
    this.INSIDE_CORNERS = makeSquareInsideCorners();
    this.OUTSIDE_CORNERS = makeSquareOutsideCorners();
    this.STATEMENT_INPUT_NOTCH_OFFSET = this.NOTCH_OFFSET_LEFT;
  }

  override shapeFor(connection: Blockly.RenderedConnection): ZelosShape {
    return super.shapeFor(connection);
  }
}

class TudeRenderInfo extends Blockly.zelos.RenderInfo {
  override getElemCenterline_(
    row: Blockly.blockRendering.Row,
    elem: Blockly.blockRendering.Measurable
  ): number {
    const isTopAlignedLabel = Blockly.blockRendering.Types.isField(elem)
      && elem.field instanceof Blockly.FieldLabel;
    if (isTopAlignedLabel) return row.yPos + elem.height / 2;
    return super.getElemCenterline_(row, elem);
  }
}

class TudeRenderer extends Blockly.zelos.Renderer {
  constructor(name: string) {
    super(name);
  }

  protected override makeConstants_(): TudeConstantsProvider {
    return new TudeConstantsProvider();
  }

  protected override makeRenderInfo_(block: Blockly.BlockSvg): TudeRenderInfo {
    return new TudeRenderInfo(this, block);
  }
}

function installTudeStyle(): void {
  if (typeof document === 'undefined' || document.getElementById('tude-renderer-style')) return;

  const style = document.createElement('style');
  style.id = 'tude-renderer-style';
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

export function registerTudeRenderer(): void {
  try {
    Blockly.blockRendering.register(TUDE_RENDERER_NAME, TudeRenderer);
  } catch (error) {
    // Webpack dev-server hot reload can evaluate this module more than once.
    if (!(error instanceof Error) || !/already registered/i.test(error.message)) throw error;
  }

  installTudeStyle();
}
