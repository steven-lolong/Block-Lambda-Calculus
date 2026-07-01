import * as Blockly from 'blockly';
import {
  arrangeBlocksVertically,
  arrangeTopBlocks,
  generatedStateForBlock,
  type BlockOrder,
  type ReductionKind
} from '../semantics/lambdaReduction';

type VizKind = ReductionKind;

type VisualizationOptions = {
  lightTheme: Blockly.Theme;
  darkTheme: Blockly.Theme;
  onResize: () => void;
};

interface View {
  workspace: Blockly.WorkspaceSvg | null;
  block: Blockly.BlockSvg | null;
  order: BlockOrder | null;
  lastError: string | null;
}

const KINDS: VizKind[] = ['structure', 'value'];
const TITLE: Record<VizKind, string> = {
  structure: 'Call-by-Structure',
  value: 'Call-by-Value'
};

const views: Record<VizKind, View> = {
  structure: { workspace: null, block: null, order: null, lastError: null },
  value: { workspace: null, block: null, order: null, lastError: null }
};

let active: VizKind = 'structure';
let options: VisualizationOptions | null = null;

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function dock(): HTMLElement | null {
  return byId<HTMLElement>('vizDock');
}

function hostOf(kind: VizKind): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.viz-host[data-kind="${kind}"]`);
}

function tabOf(kind: VizKind): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.viz-tab[data-kind="${kind}"]`);
}

function currentTheme(): Blockly.Theme {
  const mode = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  return mode === 'dark' ? options!.darkTheme : options!.lightTheme;
}

function blockIsDisposed(block: Blockly.BlockSvg): boolean {
  const maybeDisposed = block as Blockly.BlockSvg & { isDisposed?: () => boolean; disposed?: boolean };
  if (typeof maybeDisposed.isDisposed === 'function') return maybeDisposed.isDisposed();
  return maybeDisposed.disposed === true;
}

function isRenderableBlock(block: Blockly.BlockSvg | null): block is Blockly.BlockSvg {
  return !!block && !blockIsDisposed(block) && block.type === 'lambda_application';
}

function injectWorkspace(kind: VizKind): Blockly.WorkspaceSvg {
  const host = hostOf(kind);
  if (!host) throw new Error(`Missing visualization host for ${kind}`);
  return Blockly.inject(host, {
    renderer: 'zelos',
    theme: currentTheme(),
    readOnly: true,
    trashcan: false,
    comments: true,
    collapse: true,
    disable: true,
    grid: { spacing: 20, length: 3, snap: true },
    move: { scrollbars: true, drag: true, wheel: false },
    zoom: { controls: true, wheel: true, startScale: 0.92, maxScale: 3, minScale: 0.35, scaleSpeed: 1.15, pinch: true }
  } as Blockly.BlocklyOptions);
}

function ensureWorkspace(kind: VizKind): Blockly.WorkspaceSvg {
  if (!views[kind].workspace) views[kind].workspace = injectWorkspace(kind);
  return views[kind].workspace!;
}

function setActive(kind: VizKind): void {
  active = kind;
  for (const candidate of KINDS) {
    const host = hostOf(candidate);
    const tab = tabOf(candidate);
    if (host) host.dataset.active = String(candidate === kind);
    if (tab) tab.setAttribute('aria-selected', String(candidate === kind));
  }
  const empty = byId<HTMLDivElement>('vizEmpty');
  if (empty) empty.hidden = !!views[kind].block && !views[kind].lastError;
  updateInfo();
  resizeActive(0);
}

function updateInfo(): void {
  const info = byId<HTMLDivElement>('vizDockInfo');
  if (!info) return;
  const view = views[active];
  if (view.lastError) {
    info.textContent = `${TITLE[active]} · ${view.lastError}`;
    return;
  }
  info.textContent = view.block ? `${TITLE[active]} · ${view.block.type}` : '';
}

function resizeActive(delay = 0): void {
  const workspace = views[active].workspace;
  if (workspace) window.setTimeout(() => Blockly.svgResize(workspace), delay);
}

function renderEmptyMessage(kind: VizKind, message: string): void {
  const empty = byId<HTMLDivElement>('vizEmpty');
  if (empty) {
    empty.textContent = message;
    empty.hidden = false;
  }
  views[kind].lastError = message;
  updateInfo();
}

function stripIds<T>(state: T): T {
  if (!state || typeof state !== 'object') return state;
  if (Array.isArray(state)) return state.map(stripIds) as T;
  const copy = { ...(state as Record<string, unknown>) } as Record<string, unknown>;
  delete copy.id;

  const inputs = copy.inputs as Record<string, { block?: unknown }> | undefined;
  if (inputs) {
    for (const input of Object.values(inputs)) {
      if (input.block) input.block = stripIds(input.block);
    }
  }

  const next = copy.next as { block?: unknown } | undefined;
  if (next?.block) next.block = stripIds(next.block);
  return copy as T;
}

function appendState(workspace: Blockly.WorkspaceSvg, state: unknown): Blockly.BlockSvg | null {
  if (!state) return null;
  return Blockly.serialization.blocks.append(stripIds(state), workspace) as Blockly.BlockSvg;
}

function label(workspace: Blockly.WorkspaceSvg, text: string): Blockly.BlockSvg {
  const block = workspace.newBlock('lambda_viz_description') as Blockly.BlockSvg;
  block.setFieldValue(text, 'TEXT');
  if (workspace.rendered) {
    block.initSvg();
    block.render();
  }
  return block;
}

function addToOrder(order: BlockOrder, block: Blockly.BlockSvg | null): void {
  if (!block) return;
  order.map[order.order] = block.id;
  order.order += 1;
}

function savedSourceState(block: Blockly.BlockSvg): unknown {
  return Blockly.serialization.blocks.save(block, {
    addInputBlocks: true,
    addNextBlocks: false
  } as any);
}

function annotate(block: Blockly.BlockSvg | null, text: string): void {
  try {
    block?.setCommentText(text);
  } catch {
    /* comments are best effort in detached visualization workspaces */
  }
}

function renderEvaluationView(kind: VizKind, block: Blockly.BlockSvg, workspace: Blockly.WorkspaceSvg): BlockOrder {
  const order: BlockOrder = { order: 0, map: {} };
  const title = TITLE[kind];

  const inputLabel = label(workspace, `${title} input`);
  addToOrder(order, inputLabel);
  const sourceBlock = appendState(workspace, savedSourceState(block));
  annotate(sourceBlock, `${title} input\n\nThis is the original application block selected in the main workspace.`);
  addToOrder(order, sourceBlock);

  const resultLabel = label(workspace, `${title} result`);
  addToOrder(order, resultLabel);
  const resultState = generatedStateForBlock(block, kind);
  const resultBlock = appendState(workspace, resultState);
  annotate(resultBlock, `${title} result\n\nThe evaluator reduces the selected application with ${kind === 'value' ? 'call-by-value' : 'call-by-structure'} semantics.`);
  addToOrder(order, resultBlock);

  arrangeBlocksVertically(workspace, order, 36);
  return order;
}

export function isVisualizationOpen(): boolean {
  return dock()?.dataset.open === 'true';
}

export function setVisualizationOpen(open: boolean): void {
  const panel = dock();
  if (!panel) return;
  panel.dataset.open = String(open);
  byId<HTMLButtonElement>('toggleVizDock')?.setAttribute('aria-pressed', String(open));
  options?.onResize();
  if (open) resizeActive(40);
}

function renderView(kind: VizKind): void {
  const view = views[kind];
  const block = view.block;
  if (!isRenderableBlock(block)) {
    renderEmptyMessage(kind, 'Right-click an application block and choose Call-by-Structure or Call-by-Value.');
    return;
  }

  const workspace = ensureWorkspace(kind);
  workspace.clear();
  view.order = null;
  view.lastError = null;

  const empty = byId<HTMLDivElement>('vizEmpty');
  if (empty) empty.hidden = true;

  try {
    Blockly.svgResize(workspace);
    view.order = renderEvaluationView(kind, block, workspace);
  } catch (error) {
    console.error('[Block Lambda] visualization failed', error);
    view.order = null;
    const fallbackState = savedSourceState(block);
    workspace.clear();
    const order: BlockOrder = { order: 0, map: {} };
    addToOrder(order, label(workspace, `${TITLE[kind]} input`));
    addToOrder(order, appendState(workspace, fallbackState));
    arrangeBlocksVertically(workspace, order, 36);
    view.order = order;
    renderEmptyMessage(kind, error instanceof Error ? error.message : 'Could not render the reduction visualization.');
  }

  Blockly.svgResize(workspace);
  updateInfo();
}

export function openVisualization(kind: VizKind, block: Blockly.BlockSvg): void {
  const view = views[kind];
  view.block = block;
  view.order = null;
  view.lastError = null;

  setActive(kind);
  setVisualizationOpen(true);
  renderView(kind);
  resizeActive(40);
}

export function disposeVisualizationWorkspaces(): void {
  const shouldRerender = isVisualizationOpen() && !!views[active].block;
  for (const kind of KINDS) {
    views[kind].workspace?.dispose();
    views[kind].workspace = null;
    const host = hostOf(kind);
    if (host) host.innerHTML = '';
  }
  if (shouldRerender) renderView(active);
}

function initResizer(): void {
  const resizer = byId<HTMLDivElement>('vizResizer');
  if (!resizer) return;

  const applyHeight = (height: number): void => {
    const clamped = Math.max(170, Math.min(height, Math.round(window.innerHeight * 0.72)));
    document.documentElement.style.setProperty('--viz-height', `${clamped}px`);
    options?.onResize();
    resizeActive(0);
  };

  resizer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = dock()?.getBoundingClientRect().height ?? 320;
    const move = (moveEvent: PointerEvent): void => applyHeight(startHeight + (startY - moveEvent.clientY));
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  resizer.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowUp' ? 24 : event.key === 'ArrowDown' ? -24 : 0;
    if (!step) return;
    event.preventDefault();
    applyHeight((dock()?.getBoundingClientRect().height ?? 320) + step);
  });
}

export function initVisualizationPanel(initOptions: VisualizationOptions): void {
  options = initOptions;
  for (const kind of KINDS) tabOf(kind)?.addEventListener('click', () => {
    setActive(kind);
    if (views[kind].block) renderView(kind);
  });
  byId<HTMLButtonElement>('vizRerun')?.addEventListener('click', () => renderView(active));
  byId<HTMLButtonElement>('vizArrange')?.addEventListener('click', () => {
    const view = views[active];
    if (!view.workspace) return;
    if (view.order) arrangeBlocksVertically(view.workspace, view.order, 36);
    else arrangeTopBlocks(view.workspace);
    Blockly.svgResize(view.workspace);
  });
  byId<HTMLButtonElement>('vizCollapse')?.addEventListener('click', () => setVisualizationOpen(false));
  byId<HTMLButtonElement>('toggleVizDock')?.addEventListener('click', () => setVisualizationOpen(!isVisualizationOpen()));
  initResizer();
  window.addEventListener('resize', () => {
    if (isVisualizationOpen()) resizeActive(80);
  });
  setActive('structure');
}
