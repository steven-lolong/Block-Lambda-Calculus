import * as Blockly from 'blockly';
import {
  arrangeBlocksVertically,
  arrangeTopBlocks,
  computeReductionRun,
  renderLambdaReduction,
  type BlockOrder,
  type ReductionFrame,
  type ReductionKind
} from '../semantics/lambdaReduction';
import { TUDE_RENDERER_NAME } from '../renderer/tude';

type VizKind = ReductionKind;
/** The reduction-trace tabs plus the step-through tab. */
type TabKind = VizKind | 'stepper';

type VisualizationOptions = {
  lightTheme: Blockly.Theme;
  darkTheme: Blockly.Theme;
  getRendererName?: () => string;
  getMainWorkspace?: () => Blockly.WorkspaceSvg | null;
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

interface StepperState {
  workspace: Blockly.WorkspaceSvg | null;
  frames: ReductionFrame[];
  index: number;
  kind: ReductionKind;
  truncated: boolean;
  finalValue: string;
  normalForm: boolean;
  stale: boolean;
  playTimer: number | null;
  listening: boolean;
}

const stepper: StepperState = {
  workspace: null,
  frames: [],
  index: 0,
  kind: 'structure',
  truncated: false,
  finalValue: '',
  normalForm: false,
  stale: false,
  playTimer: null,
  listening: false
};

const STEP_PLAY_INTERVAL_MS = 650;
const STEPPER_TITLE: Record<ReductionKind, string> = {
  structure: 'Call-by-Structure',
  value: 'Call-by-Value'
};

let active: TabKind = 'structure';
let options: VisualizationOptions | null = null;

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function dock(): HTMLElement | null {
  return byId<HTMLElement>('vizDock');
}

function hostOf(kind: TabKind): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.viz-host[data-kind="${kind}"]`);
}

function tabOf(kind: TabKind): HTMLElement | null {
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

function injectInto(host: HTMLElement): Blockly.WorkspaceSvg {
  return Blockly.inject(host, {
    renderer: options?.getRendererName?.() ?? TUDE_RENDERER_NAME,
    theme: currentTheme(),
    trashcan: false,
    comments: true,
    grid: { spacing: 20, length: 3, snap: true },
    move: { scrollbars: true, drag: true, wheel: false },
    zoom: { controls: true, wheel: true, startScale: 0.92, maxScale: 3, minScale: 0.35, scaleSpeed: 1.15, pinch: true }
  } as Blockly.BlocklyOptions);
}

function injectWorkspace(kind: VizKind): Blockly.WorkspaceSvg {
  const host = hostOf(kind);
  if (!host) throw new Error(`Missing visualization host for ${kind}`);
  return injectInto(host);
}

function ensureWorkspace(kind: VizKind): Blockly.WorkspaceSvg {
  if (!views[kind].workspace) views[kind].workspace = injectWorkspace(kind);
  return views[kind].workspace!;
}

function makeWorkspaceBlocksMovable(workspace: Blockly.WorkspaceSvg): void {
  for (const block of workspace.getAllBlocks(false)) {
    const blockSvg = block as Blockly.BlockSvg;
    blockSvg.setMovable(true);
    blockSvg.setDeletable(false);
    blockSvg.setEditable(true);
  }
}

const TABS: TabKind[] = ['structure', 'value', 'stepper'];

function setActive(kind: TabKind): void {
  active = kind;
  for (const candidate of TABS) {
    const host = hostOf(candidate);
    const tab = tabOf(candidate);
    if (host) host.dataset.active = String(candidate === kind);
    if (tab) tab.setAttribute('aria-selected', String(candidate === kind));
  }
  const empty = byId<HTMLDivElement>('vizEmpty');
  if (empty) empty.hidden = kind === 'stepper' || (!!views[kind].block && !views[kind].lastError);
  updateInfo();
  if (kind === 'stepper') resizeStepper(0);
  else resizeActive(0);
}

function updateInfo(): void {
  const info = byId<HTMLDivElement>('vizDockInfo');
  if (!info) return;
  if (active === 'stepper') {
    info.textContent = stepper.frames.length ? `Stepper · ${STEPPER_TITLE[stepper.kind]}` : '';
    return;
  }
  const view = views[active];
  if (view.lastError) {
    info.textContent = `${TITLE[active]} · ${view.lastError}`;
    return;
  }
  info.textContent = view.block ? `${TITLE[active]} · ${view.block.type}` : '';
}

function resizeActive(delay = 0): void {
  if (active === 'stepper') { resizeStepper(delay); return; }
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
    view.order = renderLambdaReduction(block, workspace, kind);
    makeWorkspaceBlocksMovable(workspace);
    if (!view.order || view.order.order === 0) {
      arrangeTopBlocks(workspace);
    }
  } catch (error) {
    console.error('[Block Lambda] visualization failed', error);
    view.order = null;
    workspace.clear();
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
  const shouldRerenderView = isVisualizationOpen() && active !== 'stepper' && !!views[active].block;
  const shouldRerenderStepper = isVisualizationOpen() && stepper.frames.length > 0;
  for (const kind of KINDS) {
    views[kind].workspace?.dispose();
    views[kind].workspace = null;
    const host = hostOf(kind);
    if (host) host.innerHTML = '';
  }
  stopStepperPlay();
  stepper.workspace?.dispose();
  stepper.workspace = null;
  const stepperMount = byId<HTMLElement>('stepperWorkspace');
  if (stepperMount) stepperMount.innerHTML = '';
  if (shouldRerenderView) renderView(active as VizKind);
  if (shouldRerenderStepper) renderStepperFrame();
}

/* ----------------------------------------------------------- the stepper */

function stepperMount(): HTMLElement | null {
  return byId<HTMLElement>('stepperWorkspace');
}

function ensureStepperWorkspace(): Blockly.WorkspaceSvg | null {
  if (stepper.workspace) return stepper.workspace;
  const mount = stepperMount();
  if (!mount) return null;
  stepper.workspace = injectInto(mount);
  return stepper.workspace;
}

function resizeStepper(delay = 0): void {
  const workspace = stepper.workspace;
  if (workspace) window.setTimeout(() => Blockly.svgResize(workspace), delay);
}

function stopStepperPlay(): void {
  if (stepper.playTimer !== null) {
    window.clearInterval(stepper.playTimer);
    stepper.playTimer = null;
  }
}

/** The top-level term to step: prefer an application, else the first term block. */
function pickProgramBlock(): Blockly.BlockSvg | null {
  const main = options?.getMainWorkspace?.();
  if (!main) return null;
  const tops = main
    .getTopBlocks(true)
    .filter((block): block is Blockly.BlockSvg =>
      !block.getParent() &&
      Boolean(block.outputConnection) &&
      block.type.startsWith('lambda_') &&
      block.type !== 'lambda_viz_description');
  if (tops.length === 0) return null;
  return tops.find((block) => block.type === 'lambda_application') ?? tops[0];
}

function attachStepperStaleListener(): void {
  if (stepper.listening) return;
  const main = options?.getMainWorkspace?.();
  if (!main) return;
  stepper.listening = true;
  main.addChangeListener((event: Blockly.Events.Abstract) => {
    if (stepper.frames.length === 0 || stepper.stale) return;
    if (event.isUiEvent) return;
    stepper.stale = true;
    stopStepperPlay();
    renderStepperStatus();
    renderStepperButtons();
  });
}

function loadStepper(): void {
  stopStepperPlay();
  attachStepperStaleListener();
  const block = pickProgramBlock();
  if (!block) {
    stepper.frames = [];
    stepper.index = 0;
    stepper.stale = false;
    renderStepperFrame();
    return;
  }
  try {
    const run = computeReductionRun(block, stepper.kind);
    stepper.frames = run.frames;
    stepper.truncated = run.truncated;
    stepper.normalForm = run.normalForm;
    stepper.finalValue = run.finalValue;
    stepper.index = 0;
    stepper.stale = false;
  } catch (error) {
    console.error('[Block Lambda] stepper failed', error);
    stepper.frames = [];
    stepper.index = 0;
  }
  renderStepperFrame();
}

function renderStepperFrame(): void {
  const workspace = ensureStepperWorkspace();
  if (workspace) {
    workspace.clear();
    const frame = stepper.frames[stepper.index];
    if (frame) {
      try {
        Blockly.svgResize(workspace);
        Blockly.serialization.workspaces.load(
          { blocks: { languageVersion: 0, blocks: [frame.state as object] } } as never,
          workspace
        );
        for (const block of workspace.getAllBlocks(false)) {
          const svg = block as Blockly.BlockSvg;
          svg.setMovable(true);
          svg.setDeletable(false);
        }
        arrangeTopBlocks(workspace);
        Blockly.svgResize(workspace);
        workspace.scrollCenter();
      } catch (error) {
        console.error('[Block Lambda] stepper render failed', error);
      }
    }
  }
  renderStepperStatus();
  renderStepperButtons();
  updateInfo();
}

function renderStepperStatus(): void {
  const status = byId<HTMLDivElement>('stepperStatus');
  if (!status) return;
  status.removeAttribute('data-state');
  if (stepper.frames.length === 0) {
    status.textContent = pickProgramBlock()
      ? 'Press ⟲ Load to step this program.'
      : 'Add a term to the workspace, then press ⟲ Load.';
    return;
  }
  if (stepper.stale) {
    status.textContent = 'Program changed — press ⟲ Load to restart.';
    status.dataset.state = 'stale';
    return;
  }
  const frame = stepper.frames[stepper.index];
  const total = stepper.frames.length - 1;
  const atEnd = stepper.index >= total;
  if (atEnd && stepper.truncated) {
    status.textContent = `step ${stepper.index}/${total}+ · trace limit reached`;
    status.dataset.state = 'stale';
    return;
  }
  if (atEnd) {
    status.textContent = `✓ value after ${total} step(s): ${stepper.finalValue}`;
    status.dataset.state = 'done';
    return;
  }
  status.textContent = `step ${stepper.index}/${total} · ${frame.label}`;
}

function renderStepperButtons(): void {
  const back = byId<HTMLButtonElement>('stepperBack');
  const step = byId<HTMLButtonElement>('stepperStep');
  const play = byId<HTMLButtonElement>('stepperPlay');
  const loaded = stepper.frames.length > 0 && !stepper.stale;
  const atEnd = stepper.index >= stepper.frames.length - 1;
  if (back) back.disabled = !loaded || stepper.index === 0;
  if (step) step.disabled = !loaded || atEnd;
  if (play) {
    play.disabled = !loaded || (atEnd && stepper.playTimer === null);
    play.textContent = stepper.playTimer === null ? '⏵' : '⏸';
  }
}

function stepperStep(): void {
  if (stepper.frames.length === 0 || stepper.stale) return;
  if (stepper.index >= stepper.frames.length - 1) return;
  stepper.index += 1;
  renderStepperFrame();
  if (stepper.index >= stepper.frames.length - 1) stopStepperPlay();
}

function stepperBack(): void {
  stopStepperPlay();
  if (stepper.index === 0) return;
  stepper.index -= 1;
  renderStepperFrame();
}

function stepperTogglePlay(): void {
  if (stepper.playTimer !== null) {
    stopStepperPlay();
    renderStepperButtons();
    return;
  }
  if (stepper.frames.length === 0 || stepper.stale || stepper.index >= stepper.frames.length - 1) return;
  stepper.playTimer = window.setInterval(stepperStep, STEP_PLAY_INTERVAL_MS);
  renderStepperButtons();
}

function setStepperStrategy(kind: ReductionKind): void {
  if (stepper.kind === kind) return;
  stepper.kind = kind;
  for (const button of [
    { id: 'stepperStrategyStructure', k: 'structure' as ReductionKind },
    { id: 'stepperStrategyValue', k: 'value' as ReductionKind }
  ]) {
    byId<HTMLButtonElement>(button.id)?.classList.toggle('is-active', button.k === kind);
  }
  if (stepper.frames.length > 0) loadStepper();
  else { renderStepperStatus(); updateInfo(); }
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
  tabOf('stepper')?.addEventListener('click', () => {
    setActive('stepper');
    // Auto-load on first open so the tab is useful without an extra click.
    if (stepper.frames.length === 0 && !stepper.stale && pickProgramBlock()) loadStepper();
    else renderStepperFrame();
  });

  byId<HTMLButtonElement>('stepperLoad')?.addEventListener('click', loadStepper);
  byId<HTMLButtonElement>('stepperBack')?.addEventListener('click', stepperBack);
  byId<HTMLButtonElement>('stepperStep')?.addEventListener('click', stepperStep);
  byId<HTMLButtonElement>('stepperPlay')?.addEventListener('click', stepperTogglePlay);
  byId<HTMLButtonElement>('stepperStrategyStructure')?.addEventListener('click', () => setStepperStrategy('structure'));
  byId<HTMLButtonElement>('stepperStrategyValue')?.addEventListener('click', () => setStepperStrategy('value'));

  byId<HTMLButtonElement>('vizRerun')?.addEventListener('click', () => {
    if (active === 'stepper') loadStepper();
    else renderView(active);
  });
  byId<HTMLButtonElement>('vizArrange')?.addEventListener('click', () => {
    if (active === 'stepper') {
      if (stepper.workspace) { arrangeTopBlocks(stepper.workspace); Blockly.svgResize(stepper.workspace); }
      return;
    }
    const view = views[active];
    if (!view.workspace) return;
    if (view.order) arrangeBlocksVertically(view.workspace, view.order, 36);
    else arrangeTopBlocks(view.workspace);
    makeWorkspaceBlocksMovable(view.workspace);
    Blockly.svgResize(view.workspace);
  });
  byId<HTMLButtonElement>('vizCollapse')?.addEventListener('click', () => setVisualizationOpen(false));
  byId<HTMLButtonElement>('toggleVizDock')?.addEventListener('click', () => setVisualizationOpen(!isVisualizationOpen()));
  initResizer();
  window.addEventListener('resize', () => {
    if (isVisualizationOpen()) resizeActive(80);
  });
  setActive('structure');
  renderStepperButtons();
}
