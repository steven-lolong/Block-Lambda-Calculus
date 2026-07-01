import * as Blockly from 'blockly';
import {
  arrangeBlocksVertically,
  arrangeTopBlocks,
  renderCopiedTerm,
  renderLambdaReduction,
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
  sourceWorkspace: Blockly.WorkspaceSvg | null;
  sourceBlockId: string | null;
  order: BlockOrder | null;
  lastError: string | null;
}

const KINDS: VizKind[] = ['structure', 'value'];
const TITLE: Record<VizKind, string> = {
  structure: 'Call-by-Structure',
  value: 'Call-by-Value'
};

const views: Record<VizKind, View> = {
  structure: { workspace: null, sourceWorkspace: null, sourceBlockId: null, order: null, lastError: null },
  value: { workspace: null, sourceWorkspace: null, sourceBlockId: null, order: null, lastError: null }
};

let active: VizKind = 'structure';
let options: VisualizationOptions | null = null;
let pendingRender = 0;

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
  const disposable = block as Blockly.BlockSvg & { isDisposed?: () => boolean; disposed?: boolean };
  if (typeof disposable.isDisposed === 'function') return disposable.isDisposed();
  return disposable.disposed === true;
}

function selectedBlock(kind: VizKind): Blockly.BlockSvg | null {
  const view = views[kind];
  if (!view.sourceWorkspace || !view.sourceBlockId) return null;
  const block = view.sourceWorkspace.getBlockById(view.sourceBlockId) as Blockly.BlockSvg | null;
  return block && !blockIsDisposed(block) ? block : null;
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

function hasSelection(kind: VizKind): boolean {
  return !!views[kind].sourceBlockId && !views[kind].lastError;
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
  if (empty) empty.hidden = hasSelection(kind);
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
  const block = selectedBlock(active);
  info.textContent = block ? `${TITLE[active]} · ${block.type}` : '';
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
  const block = selectedBlock(kind);
  if (!block) {
    renderEmptyMessage(kind, 'Select an application block, then choose Call-by-Structure or Call-by-Value.');
    return;
  }

  try {
    view.lastError = null;
    const empty = byId<HTMLDivElement>('vizEmpty');
    if (empty) empty.hidden = true;

    const workspace = ensureWorkspace(kind);
    Blockly.svgResize(workspace);
    workspace.clear();
    view.order = block.type === 'lambda_application'
      ? renderLambdaReduction(block, workspace, kind)
      : renderCopiedTerm(block, workspace, kind);
    Blockly.svgResize(workspace);
    if (view.order) arrangeBlocksVertically(workspace, view.order);
    else arrangeTopBlocks(workspace);
    updateInfo();
  } catch (error) {
    console.error(error);
    view.order = null;
    renderEmptyMessage(kind, error instanceof Error ? error.message : 'Could not render the reduction visualization.');
  }
}

function scheduleRender(kind: VizKind): void {
  window.clearTimeout(pendingRender);
  pendingRender = window.setTimeout(() => {
    renderView(kind);
    resizeActive(40);
  }, 80);
}

export function openVisualization(kind: VizKind, block: Blockly.BlockSvg): void {
  const view = views[kind];
  view.sourceWorkspace = block.workspace as Blockly.WorkspaceSvg;
  view.sourceBlockId = block.id;
  view.order = null;
  view.lastError = null;

  setVisualizationOpen(true);
  setActive(kind);
  scheduleRender(kind);
}

export function disposeVisualizationWorkspaces(): void {
  const shouldRerender = isVisualizationOpen() && !!views[active].sourceBlockId;
  for (const kind of KINDS) {
    views[kind].workspace?.dispose();
    views[kind].workspace = null;
    const host = hostOf(kind);
    if (host) host.innerHTML = '';
  }
  if (shouldRerender) scheduleRender(active);
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
    if (views[kind].sourceBlockId) scheduleRender(kind);
  });
  byId<HTMLButtonElement>('vizRerun')?.addEventListener('click', () => scheduleRender(active));
  byId<HTMLButtonElement>('vizArrange')?.addEventListener('click', () => {
    const view = views[active];
    if (!view.workspace) return;
    if (view.order) arrangeBlocksVertically(view.workspace, view.order);
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
