import * as Blockly from 'blockly';
import { isPhoneDrawerLayout, registerIdeLayoutResizeListener } from './layout';
import { readIdeLayoutState, updateIdeLayoutState, type BottomTab } from './layoutState';
import {
  arrangeBlocksVertically,
  arrangeTopBlocks,
  computeReductionRun,
  renderLambdaReduction,
  type BlockOrder,
  type ReductionFrame,
  type ReductionKind,
  type ReductionRun
} from '../semantics/lambdaReduction';
import {
  formatMachineValue,
  injectCsekMachine,
  isSalientRule,
  stepCsekMachine,
  type CsekState
} from '../machine/csekMachine';
import {
  initCsekPanel,
  machineStatusText,
  renderEnvInto,
  renderKontInto,
  resetCsekFromDock,
  setCsekTabVisible
} from './csekPanel';
import { TUDE_RENDERER_NAME } from '../renderer/tude';

type VizKind = ReductionKind;
/** The reduction-trace tabs, the lockstep stepper, and the CEK machine tab. */
type UtilityKind = 'problems' | 'output';
type TabKind = BottomTab;
type ActiveTabKind = Exclude<TabKind, 'types'>;
type SemanticKind = VizKind | 'machine' | 'stepper';

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
const UTILITY_KINDS = new Set<TabKind>(['problems', 'output']);
const SEMANTIC_KINDS: SemanticKind[] = ['structure', 'value', 'machine', 'stepper'];
function isUtilityKind(kind: TabKind): kind is UtilityKind {
  return kind === 'problems' || kind === 'output';
}
function isSemanticKind(kind: TabKind): kind is SemanticKind {
  return kind === 'structure' || kind === 'value' || kind === 'machine' || kind === 'stepper';
}
const TITLE: Record<VizKind, string> = {
  structure: 'Call-by-Structure',
  value: 'Call-by-Value'
};

const views: Record<VizKind, View> = {
  structure: { workspace: null, block: null, order: null, lastError: null },
  value: { workspace: null, block: null, order: null, lastError: null }
};

/** The machine's catch-up state paired with substitution frame i (lockstep). */
interface LockstepEntry {
  machine: CsekState;
  /** Salient rules matched so far, counted up to and including this frame. */
  syncCount: number;
  /** First disagreement between rewrite and machine, if any. */
  diverged: string | null;
}

interface StepperState {
  workspace: Blockly.WorkspaceSvg | null;
  frames: ReductionFrame[];
  /** pair[i] is the machine state after catching up to frames[i]; empty when
      the machine could not inject (the term side still steps alone). */
  pair: LockstepEntry[];
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
  pair: [],
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
const STEPPER_VIEW_PADDING = 24;
const STEPPER_TITLE: Record<ReductionKind, string> = {
  structure: 'Call-by-Structure',
  value: 'Call-by-Value'
};

let active: ActiveTabKind = 'problems';
let activeSemantic: SemanticKind = 'machine';
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
    // Same wheel behavior as the main workspace: with BOTH wheels enabled,
    // Blockly scrolls on plain wheel and zooms on ctrl+wheel.
    move: { scrollbars: { horizontal: true, vertical: true }, drag: true, wheel: true },
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

const TABS: TabKind[] = ['problems', 'output', 'types', 'structure', 'value', 'machine', 'stepper'];

function setActive(kind: TabKind, persist = true): void {
  const normalized: ActiveTabKind = kind === 'types' ? 'problems' : kind;
  const wasMachine = active === 'machine';
  active = normalized;
  if (isSemanticKind(active)) activeSemantic = active;
  for (const candidate of TABS) {
    const host = hostOf(candidate);
    const tab = tabOf(candidate);
    if (host) host.dataset.active = String(candidate === active);
    if (tab) {
      tab.setAttribute('aria-selected', String(candidate === active));
      tab.tabIndex = candidate === active ? 0 : -1;
    }
  }
  const semanticsActive = isSemanticKind(active);
  const semanticsTab = byId<HTMLButtonElement>('bottomTab-semantics');
  const semanticsViews = byId<HTMLElement>('semanticsViews');
  semanticsTab?.setAttribute('aria-selected', String(semanticsActive));
  if (semanticsTab) semanticsTab.tabIndex = semanticsActive ? 0 : -1;
  if (semanticsViews) semanticsViews.hidden = !semanticsActive;
  if (wasMachine !== (active === 'machine')) setCsekTabVisible(active === 'machine');
  const empty = byId<HTMLDivElement>('vizEmpty');
  if (empty) {
    if (isUtilityKind(active) || active === 'stepper' || active === 'machine') empty.hidden = true;
    else empty.hidden = !!views[active].block && !views[active].lastError;
  }
  const utility = isUtilityKind(active);
  const rerun = byId<HTMLButtonElement>('vizRerun');
  const arrange = byId<HTMLButtonElement>('vizArrange');
  if (rerun) rerun.hidden = utility;
  if (arrange) arrange.hidden = utility || active === 'machine';
  if (persist) updateIdeLayoutState({ bottomTab: active });
  updateInfo();
  if (active === 'stepper') resizeStepper(0);
  else resizeActive(0);
}

function updateInfo(): void {
  const info = byId<HTMLDivElement>('vizDockInfo');
  if (!info) return;
  if (active === 'problems') {
    info.textContent = 'Type inference diagnostics';
    return;
  }
  if (active === 'output') {
    info.textContent = 'Workbench and generator messages';
    return;
  }
  if (active === 'stepper') {
    info.textContent = stepper.frames.length ? `Lockstep · ${STEPPER_TITLE[stepper.kind]} rewriting with the CEK machine` : '';
    return;
  }
  if (active === 'machine') {
    info.textContent = 'CEK machine · walks the workspace blocks';
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
  if (isUtilityKind(active)) return;
  if (active === 'stepper') { resizeStepper(delay); return; }
  if (active === 'machine') return;
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

export function setVisualizationOpen(open: boolean, persist = true): void {
  const panel = dock();
  if (!panel) return;
  const visibilityChanged = panel.dataset.open !== String(open);
  panel.dataset.open = String(open);
  byId<HTMLButtonElement>('toggleVizDock')?.setAttribute('aria-pressed', String(open));
  if (persist && visibilityChanged) {
    updateIdeLayoutState({ bottomVisible: open, perspective: 'custom' });
    window.dispatchEvent(new CustomEvent('block-lambda:layout-state-changed'));
  }
  options?.onResize();
  if (open) resizeActive(40);
}

export function activateBottomTab(kind: BottomTab, open = true): void {
  setActive(kind);
  if (open) setVisualizationOpen(true);
  if (kind === 'stepper' && stepper.frames.length === 0 && !stepper.stale && pickProgramBlock()) loadStepper();
  if (kind === 'machine') setCsekTabVisible(true);
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
  const shouldRerenderView =
    isVisualizationOpen() && (active === 'structure' || active === 'value') && !!views[active].block;
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
  if (shouldRerenderView && (active === 'structure' || active === 'value')) renderView(active);
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
    renderStepperMachine();
    renderStepperAgree();
    renderStepperButtons();
  });
}

/**
 * Pair every substitution frame with a machine state, MNL lockstep style:
 * whenever the rewrite fires a salient rule, the machine advances until it
 * fires its next salient rule — the two must match, and the running counter
 * is the operational-correspondence claim, executed. Non-salient frames keep
 * the machine where it is; when rewriting finishes, the machine drains its
 * trailing administrative steps so both sides finish together.
 */
function buildLockstep(main: Blockly.WorkspaceSvg, block: Blockly.BlockSvg, run: ReductionRun): LockstepEntry[] {
  const injected = injectCsekMachine(block, stepper.kind);
  if ('injectError' in injected) return [];
  let machine = injected;
  let syncCount = 0;
  let diverged: string | null = null;
  const entries: LockstepEntry[] = [{ machine, syncCount, diverged }];

  for (let i = 1; i < run.frames.length; i++) {
    const salient = run.frames[i].salient;
    if (salient) {
      let fired: string | null = null;
      while (machine.status === 'running') {
        machine = stepCsekMachine(main, machine);
        if (isSalientRule(machine.lastRule)) {
          fired = machine.lastRule;
          break;
        }
      }
      if (fired === salient) syncCount++;
      else if (!diverged) diverged = `rewrite fired ${salient}, machine fired ${fired ?? machine.status}`;
    }
    entries.push({ machine, syncCount, diverged });
  }

  if (run.normalForm) {
    while (machine.status === 'running') {
      machine = stepCsekMachine(main, machine);
      if (isSalientRule(machine.lastRule) && !diverged) {
        diverged = `machine fired extra ${machine.lastRule} after rewriting finished`;
      }
    }
    entries[entries.length - 1] = { machine, syncCount, diverged };
  }
  return entries;
}

function loadStepper(): void {
  stopStepperPlay();
  attachStepperStaleListener();
  const block = pickProgramBlock();
  if (!block) {
    stepper.frames = [];
    stepper.pair = [];
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
    const main = options?.getMainWorkspace?.();
    stepper.pair = main ? buildLockstep(main, block, run) : [];
  } catch (error) {
    console.error('[Block Lambda] stepper failed', error);
    stepper.frames = [];
    stepper.pair = [];
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
        // arrangeTopBlocks() normalizes the frame's top blocks to workspace
        // origin (0, 0); scroll there directly instead of scrollCenter() so
        // the term stays anchored top-left instead of floating in the middle
        // of the (much wider) stepper pane.
        workspace.scroll(STEPPER_VIEW_PADDING, STEPPER_VIEW_PADDING);
      } catch (error) {
        console.error('[Block Lambda] stepper render failed', error);
      }
    }
  }
  renderStepperStatus();
  renderStepperMachine();
  renderStepperAgree();
  renderStepperButtons();
  updateInfo();
}

function renderStepperMachine(): void {
  const statusEl = byId<HTMLDivElement>('stepperMachineStatus');
  const envHost = byId<HTMLDivElement>('stepperMachineEnv');
  const kontHost = byId<HTMLDivElement>('stepperMachineKont');
  const entry = stepper.stale ? undefined : stepper.pair[stepper.index];
  const main = options?.getMainWorkspace?.() ?? null;
  if (statusEl) {
    statusEl.textContent = entry
      ? machineStatusText(entry.machine)
      : stepper.frames.length > 0 && !stepper.stale
        ? 'machine unavailable for this term'
        : '';
  }
  if (envHost) renderEnvInto(envHost, main, entry?.machine ?? null);
  if (kontHost) renderKontInto(kontHost, main, entry?.machine ?? null);
}

function renderStepperAgree(): void {
  const agree = byId<HTMLDivElement>('stepperAgree');
  if (!agree) return;
  agree.textContent = '';
  agree.removeAttribute('data-state');
  const entry = stepper.stale ? undefined : stepper.pair[stepper.index];
  if (!entry) return;
  if (entry.diverged) {
    agree.textContent = `⚠ diverged: ${entry.diverged}`;
    agree.dataset.state = 'diverged';
    return;
  }
  const atEnd = stepper.index >= stepper.frames.length - 1;
  if (atEnd && stepper.normalForm && entry.machine.status === 'done') {
    const machineValue = entry.machine.result ? formatMachineValue(entry.machine.result) : '—';
    const same = machineValue === stepper.finalValue;
    agree.textContent = same
      ? `In sync — ${entry.syncCount} salient rules matched, same value`
      : `⚠ same rules but DIFFERENT final values (machine: ${machineValue})`;
    agree.dataset.state = same ? 'sync' : 'diverged';
    return;
  }
  agree.textContent = `In sync — ${entry.syncCount} salient rules matched`;
  agree.dataset.state = 'sync';
}

function renderStepperStatus(): void {
  const status = byId<HTMLDivElement>('stepperStatus');
  if (!status) return;
  status.removeAttribute('data-state');
  if (stepper.frames.length === 0) {
    status.textContent = pickProgramBlock()
      ? 'Load a program to step it.'
      : 'Add a term to the workspace, then load it.';
    return;
  }
  if (stepper.stale) {
    status.textContent = 'Program changed — load it again to restart.';
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
    status.textContent = `Value after ${total} step(s): ${stepper.finalValue}`;
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
    play.querySelector('use')?.setAttribute('href', stepper.playTimer === null ? '#icon-play' : '#icon-pause');
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

  const syncResizerAvailability = (): void => {
    const drawer = isPhoneDrawerLayout();
    resizer.tabIndex = drawer ? -1 : 0;
    resizer.setAttribute('aria-disabled', String(drawer));
  };

  const applyHeight = (height: number): void => {
    const clamped = Math.max(180, Math.min(height, Math.round(window.innerHeight * 0.72)));
    document.documentElement.style.setProperty('--ide-bottom-panel-height', `${clamped}px`);
    resizer.setAttribute('aria-valuenow', String(clamped));
    updateIdeLayoutState({ bottomHeight: clamped, bottomMaximized: false });
    dock()?.setAttribute('data-maximized', 'false');
    const maximizeButton = byId<HTMLButtonElement>('vizMaximize');
    maximizeButton?.setAttribute('aria-pressed', 'false');
    if (maximizeButton) {
      maximizeButton.title = 'Maximize bottom panel';
      maximizeButton.setAttribute('aria-label', 'Maximize bottom panel');
    }
    options?.onResize();
    resizeActive(0);
  };

  resizer.addEventListener('pointerdown', (event) => {
    if (isPhoneDrawerLayout()) return;
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
    if (isPhoneDrawerLayout()) return;
    const step = event.key === 'ArrowUp' ? 24 : event.key === 'ArrowDown' ? -24 : 0;
    if (!step) return;
    event.preventDefault();
    applyHeight((dock()?.getBoundingClientRect().height ?? 320) + step);
  });

  resizer.setAttribute('aria-valuemin', '180');
  resizer.setAttribute('aria-valuemax', String(Math.round(window.innerHeight * 0.72)));
  resizer.setAttribute('aria-valuenow', String(readIdeLayoutState().bottomHeight));
  syncResizerAvailability();
  registerIdeLayoutResizeListener(syncResizerAvailability);
}

export function initVisualizationPanel(initOptions: VisualizationOptions): void {
  options = initOptions;
  const storedLayout = readIdeLayoutState();
  document.documentElement.style.setProperty('--ide-bottom-panel-height', `${storedLayout.bottomHeight}px`);
  dock()?.setAttribute('data-maximized', String(storedLayout.bottomMaximized));
  const maximizeButton = byId<HTMLButtonElement>('vizMaximize');
  maximizeButton?.setAttribute('aria-pressed', String(storedLayout.bottomMaximized));
  if (maximizeButton) {
    const label = storedLayout.bottomMaximized ? 'Restore bottom panel' : 'Maximize bottom panel';
    maximizeButton.title = label;
    maximizeButton.setAttribute('aria-label', label);
  }
  for (const kind of TABS) {
    const tab = tabOf(kind);
    const host = hostOf(kind);
    if (tab) {
      tab.id = `bottomTab-${kind}`;
      tab.setAttribute('aria-controls', `bottomPanel-${kind}`);
    }
    if (host) {
      host.id = `bottomPanel-${kind}`;
      host.setAttribute('role', 'tabpanel');
      host.setAttribute('aria-labelledby', `bottomTab-${kind}`);
    }
  }
  for (const kind of UTILITY_KINDS) tabOf(kind)?.addEventListener('click', () => setActive(kind));
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
  tabOf('machine')?.addEventListener('click', () => setActive('machine'));
  byId<HTMLButtonElement>('bottomTab-semantics')?.addEventListener('click', () => setActive(activeSemantic));
  document.querySelector<HTMLElement>('.viz-tabs')?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    const tabs = [tabOf('problems'), tabOf('output'), byId<HTMLElement>('bottomTab-semantics')]
      .filter((tab): tab is HTMLElement => !!tab);
    const currentIndex = tabs.indexOf(document.activeElement as HTMLElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  });
  document.querySelector<HTMLElement>('.semantics-tabs')?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    const tabs = SEMANTIC_KINDS.map(tabOf).filter((tab): tab is HTMLElement => !!tab);
    const currentIndex = tabs.indexOf(document.activeElement as HTMLElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  });

  byId<HTMLButtonElement>('stepperLoad')?.addEventListener('click', loadStepper);
  byId<HTMLButtonElement>('stepperBack')?.addEventListener('click', stepperBack);
  byId<HTMLButtonElement>('stepperStep')?.addEventListener('click', stepperStep);
  byId<HTMLButtonElement>('stepperPlay')?.addEventListener('click', stepperTogglePlay);
  byId<HTMLButtonElement>('stepperStrategyStructure')?.addEventListener('click', () => setStepperStrategy('structure'));
  byId<HTMLButtonElement>('stepperStrategyValue')?.addEventListener('click', () => setStepperStrategy('value'));

  byId<HTMLButtonElement>('vizRerun')?.addEventListener('click', () => {
    if (active === 'stepper') loadStepper();
    else if (active === 'machine') resetCsekFromDock();
    else if (isUtilityKind(active)) return;
    else renderView(active);
  });
  byId<HTMLButtonElement>('vizArrange')?.addEventListener('click', () => {
    if (active === 'stepper') {
      if (stepper.workspace) { arrangeTopBlocks(stepper.workspace); Blockly.svgResize(stepper.workspace); }
      return;
    }
    if (active === 'machine' || isUtilityKind(active)) return;
    const view = views[active];
    if (!view.workspace) return;
    if (view.order) arrangeBlocksVertically(view.workspace, view.order, 36);
    else arrangeTopBlocks(view.workspace);
    makeWorkspaceBlocksMovable(view.workspace);
    Blockly.svgResize(view.workspace);
  });
  byId<HTMLButtonElement>('vizCollapse')?.addEventListener('click', () => setVisualizationOpen(false));
  byId<HTMLButtonElement>('vizMaximize')?.addEventListener('click', () => {
    const panel = dock();
    if (!panel) return;
    const maximized = panel.dataset.maximized !== 'true';
    panel.dataset.maximized = String(maximized);
    byId<HTMLButtonElement>('vizMaximize')?.setAttribute('aria-pressed', String(maximized));
    const label = maximized ? 'Restore bottom panel' : 'Maximize bottom panel';
    byId<HTMLButtonElement>('vizMaximize')!.title = label;
    byId<HTMLButtonElement>('vizMaximize')!.setAttribute('aria-label', label);
    updateIdeLayoutState({ bottomMaximized: maximized });
    options?.onResize();
    resizeActive(40);
  });
  initResizer();
  registerIdeLayoutResizeListener(() => {
    if (isVisualizationOpen()) resizeActive(80);
  });
  initCsekPanel(() => options?.getMainWorkspace?.() ?? null);
  if (isSemanticKind(storedLayout.bottomTab)) activeSemantic = storedLayout.bottomTab;
  setActive(storedLayout.bottomTab, false);
  setVisualizationOpen(storedLayout.bottomVisible, false);
  renderStepperButtons();
}
