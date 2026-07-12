import * as Blockly from 'blockly';
import type { ReductionKind } from '../semantics/lambdaReduction';
import {
  formatMachineValue,
  injectCsekMachine,
  pickProgramBlock,
  stepCsekMachine,
  type CsekState,
  type Env,
  type EnvEntry,
  type Kont
} from '../machine/csekMachine';

/*
 * The CEK machine tab of the viz dock (the module keeps its historical `csek`
 * name), modeled on Block-based-MNL's
 * csekPanel: Load / Back / Step / Play over the pure machine in
 * machine/csekMachine.ts, with three live surfaces — the focus block is
 * highlighted in the MAIN workspace (the machine walks the real block tree),
 * and the environment chain and continuation stack render as panels.
 * `stepCsekMachine` is pure in the state, so Back is just a history stack.
 * Editing the program stales the loaded machine.
 */

const PLAY_INTERVAL_MS = 500;
const MAX_HISTORY = 5000;

type GetWorkspace = () => Blockly.WorkspaceSvg | null;

let getWorkspace: GetWorkspace = () => null;
// Call-by-structure is the language's default evaluation strategy (as in
// Block-based-MNL); like MNL's machine tab, there is no per-tab strategy
// switch — the machine runs the language's semantics. The CbV mode is still
// exercised by the Stepper tab's lockstep when its strategy is CbV.
const strategy: ReductionKind = 'structure';
let current: CsekState | null = null;
let history: CsekState[] = [];
let stale = false;
let playTimer: number | null = null;
let listening = false;
let highlightedId: string | null = null;

const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

/* ------------------------------------------------------------- highlight */

function setHighlight(blockId: string | null): void {
  const ws = getWorkspace();
  if (!ws) return;
  if (highlightedId && highlightedId !== blockId) {
    (ws.getBlockById(highlightedId) as Blockly.BlockSvg | null)?.setHighlighted(false);
  }
  if (blockId) {
    const block = ws.getBlockById(blockId) as Blockly.BlockSvg | null;
    if (block) {
      block.setHighlighted(true);
      ws.centerOnBlock?.(blockId);
    }
  }
  highlightedId = blockId;
}

/* -------------------------------------------------------------- describe */

function blockText(workspace: Blockly.Workspace | null, blockId: string | null): string {
  if (!workspace || !blockId) return '—';
  const block = workspace.getBlockById(blockId);
  if (!block) return '—';
  const text = block.toString();
  return text.length > 64 ? `${text.slice(0, 61)}…` : text;
}

function entryText(workspace: Blockly.Workspace | null, entry: EnvEntry): string {
  if (entry.tag === 'Thunk') return `⧖ ${blockText(workspace, entry.blockId)}`;
  return formatMachineValue(entry);
}

export function displayEnv(state: CsekState): Env {
  if (state.control.kind === 'eval') return state.control.env;
  for (const frame of [...state.kont].reverse()) {
    if ('env' in frame && frame.env !== undefined) return frame.env;
  }
  return null;
}

export function frameLabel(workspace: Blockly.Workspace | null, frame: Kont): string {
  switch (frame.tag) {
    case 'KArg': return `apply · argument ${blockText(workspace, frame.argId)} next`;
    case 'KApply': return 'apply · waiting for the argument';
    case 'KBranch': return 'if · pick a branch';
    case 'KBinRight': return `${frame.op} · evaluate right operand`;
    case 'KBinFold': return `${frame.op} · fold with ${formatMachineValue(frame.left)}`;
    case 'KBind': return `bind ${frame.name}`;
  }
}

export function machineStatusText(state: CsekState | null): string {
  if (!state) return '';
  if (state.status === 'error') return `⨯ stuck after ${state.stepCount} step(s): ${state.error}`;
  if (state.status === 'done') {
    return `✓ value after ${state.stepCount} step(s): ${state.result ? formatMachineValue(state.result) : '—'}`;
  }
  return `step ${state.stepCount}${state.lastRule ? ` · ${state.lastRule}` : ''}`;
}

/* ------------------------------------------------- shared panel rendering */

function emptyNote(host: HTMLElement, text: string): void {
  const empty = document.createElement('div');
  empty.className = 'machine-empty-note';
  empty.textContent = text;
  host.appendChild(empty);
}

export function renderEnvInto(host: HTMLElement, workspace: Blockly.Workspace | null, state: CsekState | null): void {
  host.innerHTML = '';
  if (!state) return;
  let cursor = displayEnv(state);
  const seen = new Set<string>();
  let count = 0;
  while (cursor && count < 200) {
    const row = document.createElement('div');
    row.className = 'machine-env-row' + (seen.has(cursor.name) ? ' is-shadowed' : '');
    const name = document.createElement('span');
    name.className = 'machine-env-name';
    name.textContent = cursor.name;
    const value = document.createElement('span');
    value.className = 'machine-env-value';
    value.textContent = entryText(workspace, cursor.value);
    row.append(name, value);
    host.appendChild(row);
    seen.add(cursor.name);
    cursor = cursor.parent;
    count++;
  }
  if (count === 0) emptyNote(host, '(empty)');
}

export function renderKontInto(host: HTMLElement, workspace: Blockly.Workspace | null, state: CsekState | null): void {
  host.innerHTML = '';
  if (!state) return;
  const frames = [...state.kont].reverse();
  frames.forEach((frame, i) => {
    const row = document.createElement('div');
    row.className = 'machine-kont-row' + (i === 0 ? ' is-top' : '');
    row.textContent = frameLabel(workspace, frame);
    host.appendChild(row);
  });
  if (frames.length === 0) emptyNote(host, '(empty — top level)');
}

/* ---------------------------------------------------------------- render */

function renderStatus(): void {
  const status = byId<HTMLDivElement>('machineStatus');
  if (!status) return;
  status.removeAttribute('data-state');
  if (!current) {
    status.textContent = 'Press ⟲ Load to run the program on the CEK machine.';
    return;
  }
  if (stale) {
    status.textContent = 'Program changed — press ⟲ Load to restart.';
    status.dataset.state = 'stale';
    return;
  }
  status.textContent = machineStatusText(current);
  if (current.status === 'error') status.dataset.state = 'error';
  else if (current.status === 'done') status.dataset.state = 'done';
}

function renderButtons(): void {
  const canStep = !!current && !stale && current.status === 'running';
  const step = byId<HTMLButtonElement>('machineStep');
  const play = byId<HTMLButtonElement>('machinePlay');
  const back = byId<HTMLButtonElement>('machineBack');
  if (step) step.disabled = !canStep;
  if (play) {
    play.disabled = !canStep && playTimer === null;
    play.textContent = playTimer === null ? '⏵' : '⏸';
  }
  if (back) back.disabled = history.length === 0 || stale;
}

function renderControl(): void {
  const el = byId<HTMLDivElement>('machineControl');
  if (!el) return;
  if (!current || stale) {
    el.textContent = '';
    return;
  }
  const c = current.control;
  el.textContent =
    c.kind === 'eval'
      ? `eval  ${blockText(getWorkspace(), c.blockId)}`
      : `value  ${formatMachineValue(c.value)}`;
}

function renderAll(): void {
  renderStatus();
  renderButtons();
  renderControl();
  const ws = getWorkspace();
  const envHost = byId<HTMLDivElement>('machineEnv');
  const kontHost = byId<HTMLDivElement>('machineKont');
  if (envHost) renderEnvInto(envHost, ws, current && !stale ? current : null);
  if (kontHost) renderKontInto(kontHost, ws, current && !stale ? current : null);
  if (current && !stale && current.status === 'running') setHighlight(current.focusBlockId);
  else setHighlight(null);
}

/* --------------------------------------------------------------- actions */

function stopPlay(): void {
  if (playTimer !== null) {
    window.clearInterval(playTimer);
    playTimer = null;
  }
}

function attachWorkspaceListener(): void {
  if (listening) return;
  const ws = getWorkspace();
  if (!ws) return;
  listening = true;
  ws.addChangeListener((event: Blockly.Events.Abstract) => {
    if (!current || stale) return;
    if (event.isUiEvent) return;
    stale = true;
    stopPlay();
    renderAll();
  });
}

function loadMachine(): void {
  stopPlay();
  history = [];
  stale = false;
  const ws = getWorkspace();
  if (!ws) return;
  attachWorkspaceListener();
  const initial = injectCsekMachine(pickProgramBlock(ws), strategy);
  if ('injectError' in initial) {
    current = null;
    renderAll();
    const status = byId<HTMLDivElement>('machineStatus');
    if (status) {
      status.textContent = initial.injectError;
      status.dataset.state = 'error';
    }
    return;
  }
  current = initial;
  renderAll();
}

function stepOnce(): void {
  const ws = getWorkspace();
  if (!ws || !current || stale || current.status !== 'running') return;
  if (history.length >= MAX_HISTORY) history.shift();
  history.push(current);
  current = stepCsekMachine(ws, current);
  renderAll();
  if (current.status !== 'running') stopPlay();
}

function stepBack(): void {
  stopPlay();
  const previous = history.pop();
  if (!previous) return;
  current = previous;
  renderAll();
}

function togglePlay(): void {
  if (playTimer !== null) {
    stopPlay();
    renderButtons();
    return;
  }
  if (!current || stale || current.status !== 'running') return;
  playTimer = window.setInterval(stepOnce, PLAY_INTERVAL_MS);
  renderButtons();
}

/* -------------------------------------------------------------- exports */

/** viz-dock ⟳ Re-run delegates here when the machine tab is active. */
export function resetCsekFromDock(): void {
  loadMachine();
}

export function setCsekTabVisible(visible: boolean): void {
  if (!visible) {
    setHighlight(null);
    return;
  }
  // Auto-load on first open so the tab is useful without an extra click.
  if (!current && !stale && getWorkspace() && pickProgramBlock(getWorkspace()!)) loadMachine();
  else if (current && !stale && current.status === 'running') setHighlight(current.focusBlockId);
}

export function initCsekPanel(workspaceGetter: GetWorkspace): void {
  getWorkspace = workspaceGetter;
  byId<HTMLButtonElement>('machineLoad')?.addEventListener('click', loadMachine);
  byId<HTMLButtonElement>('machineStep')?.addEventListener('click', stepOnce);
  byId<HTMLButtonElement>('machineBack')?.addEventListener('click', stepBack);
  byId<HTMLButtonElement>('machinePlay')?.addEventListener('click', togglePlay);
  renderAll();
}
