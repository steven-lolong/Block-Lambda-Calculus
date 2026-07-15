import * as Blockly from 'blockly';
import { lambdaTermText } from '../generator/lambdaTermText';
import type { LambdaInferenceReport } from '../type-inference/lambdaTypeInference';
import { isCompactIdeLayout, requestIdeLayoutResize, type PanelController } from './layout';
import {
  readIdeLayoutState,
  updateIdeLayoutState,
  type ActivitySection,
  type BottomTab,
  type IdePerspective
} from './layoutState';
import { activateBottomTab, isVisualizationOpen, setVisualizationOpen } from './visualizationPanel';

type OutputTone = 'info' | 'success' | 'warning' | 'error';

type WorkbenchOptions = {
  getWorkspace: () => Blockly.WorkspaceSvg;
  panels: PanelController;
  synchronizeCode: () => void;
};

export type WorkbenchController = {
  appendOutput: (message: string, tone?: OutputTone) => void;
  applyPerspective: (perspective: IdePerspective) => void;
  renderDiagnostics: (report: LambdaInferenceReport) => void;
  setActivity: (activity: ActivitySection, ensureVisible?: boolean) => void;
  syncThemeControls: () => void;
};

type PaletteCommand = {
  label: string;
  detail?: string;
  keywords?: string;
  action: () => void;
};

const ACTIVITY_TITLES: Record<ActivitySection, string> = {
  blocks: 'Blocks',
  files: 'Project',
  problems: 'Problems',
  run: 'Run and Debug',
  settings: 'Settings'
};

const PERSPECTIVE_LABELS: Record<IdePerspective, string> = {
  edit: 'Edit',
  debug: 'Debug',
  types: 'Type Analysis',
  presentation: 'Presentation',
  custom: 'Custom'
};

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function humanizeBlockType(type?: string): string {
  if (!type) return 'Workspace';
  return type
    .replace(/^lambda_/, '')
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function focusBlock(workspace: Blockly.WorkspaceSvg, blockId?: string): void {
  if (!blockId) return;
  const block = workspace.getBlockById(blockId) as Blockly.BlockSvg | null;
  if (!block) return;
  block.select();
  workspace.centerOnBlock(block.id, true);
}

function replaceChildren(target: HTMLElement | null, children: Node[]): void {
  if (target) target.replaceChildren(...children);
}

function makeEmptyState(message: string): HTMLDivElement {
  const empty = document.createElement('div');
  empty.className = 'utility-empty empty-state-compact';
  empty.textContent = message;
  return empty;
}

function makeProblemRow(
  workspace: Blockly.WorkspaceSvg,
  message: string,
  blockId?: string,
  blockType?: string,
  compact = false
): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = compact ? 'problem-row problem-row-compact' : 'problem-row';
  if (blockId) row.dataset.blockId = blockId;

  const severity = document.createElement('span');
  severity.className = 'problem-severity';
  severity.setAttribute('aria-hidden', 'true');
  severity.textContent = '!';

  const body = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = message;
  const source = document.createElement('code');
  source.textContent = blockId ? `${humanizeBlockType(blockType)} · ${blockId.slice(0, 8)}` : humanizeBlockType(blockType);
  body.append(title, source);
  row.append(severity, body);
  row.disabled = !blockId;
  row.addEventListener('click', () => focusBlock(workspace, blockId));
  return row;
}

function renderDiagnosticsIntoWorkbench(workspace: Blockly.WorkspaceSvg, report: LambdaInferenceReport): void {
  const issueLabel = `${report.issueCount} problem${report.issueCount === 1 ? '' : 's'}`;
  const statusProblemCount = byId<HTMLElement>('statusProblemCount');
  const statusProblemIcon = byId<HTMLElement>('statusProblemIcon');
  const activityProblemCount = byId<HTMLElement>('activityProblemCount');
  const bottomProblemCount = byId<HTMLElement>('bottomProblemCount');
  const sidebarSummary = byId<HTMLElement>('sidebarProblemsSummary');
  const problemsSummary = byId<HTMLElement>('problemsPanelSummary');
  const typesSummary = byId<HTMLElement>('typesPanelSummary');

  if (statusProblemCount) statusProblemCount.textContent = issueLabel;
  if (statusProblemIcon) statusProblemIcon.textContent = report.hasErrors ? '!' : '✓';
  if (activityProblemCount) {
    activityProblemCount.textContent = String(report.issueCount);
    activityProblemCount.hidden = !report.hasErrors;
  }
  if (bottomProblemCount) {
    bottomProblemCount.textContent = String(report.issueCount);
    bottomProblemCount.hidden = !report.hasErrors;
  }
  if (sidebarSummary) sidebarSummary.textContent = report.hasErrors ? report.summary : 'No type problems detected.';
  if (problemsSummary) problemsSummary.textContent = report.hasErrors ? report.summary : 'No problems detected by type inference.';

  const problemRows = report.issues.length > 0
    ? report.issues.map((issue) => makeProblemRow(workspace, issue.message, issue.blockId, issue.blockType))
    : [makeEmptyState('No problems detected. Type inference is current.')];
  replaceChildren(byId('problemsList'), problemRows);

  const sidebarRows = report.issues.length > 0
    ? report.issues.map((issue) => makeProblemRow(workspace, issue.message, issue.blockId, issue.blockType, true))
    : [makeEmptyState('The workspace has no reported type issues.')];
  replaceChildren(byId('sidebarProblems'), sidebarRows);

  const topTypes = Array.from(report.topLevelTypes.entries());
  if (typesSummary) {
    typesSummary.textContent = `${topTypes.length} top-level term${topTypes.length === 1 ? '' : 's'} · ${report.summary}`;
  }
  const typeRows: Node[] = topTypes.map(([blockId, inferredType], index) => {
    const block = workspace.getBlockById(blockId);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'type-row';
    const term = document.createElement('code');
    term.className = 'type-term';
    term.textContent = block ? lambdaTermText(block) : `Term ${index + 1}`;
    term.title = term.textContent;
    const type = document.createElement('code');
    type.className = 'type-value';
    type.textContent = inferredType;
    row.append(term, type);
    row.addEventListener('click', () => focusBlock(workspace, blockId));
    return row;
  });
  replaceChildren(byId('typesList'), typeRows.length > 0 ? typeRows : [makeEmptyState('Add a top-level term to infer its type.')]);
}

export function initWorkbench(options: WorkbenchOptions): WorkbenchController {
  const app = byId<HTMLElement>('app');
  const sidebarTitle = byId<HTMLElement>('sidebarTitle');
  const perspectiveSelect = byId<HTMLSelectElement>('perspectiveSelect');
  const statusPerspective = byId<HTMLElement>('statusPerspective');
  const palette = byId<HTMLDialogElement>('commandPalette');
  const paletteInput = byId<HTMLInputElement>('commandPaletteInput');
  const paletteList = byId<HTMLElement>('commandPaletteList');
  const themeToggle = byId<HTMLInputElement>('themeToggle');
  let activeActivity = readIdeLayoutState().activity;
  let activePerspective = readIdeLayoutState().perspective;
  let priorPerspective: IdePerspective = activePerspective === 'presentation' ? 'edit' : activePerspective;
  let presentationRestore: ReturnType<typeof readIdeLayoutState> | null = null;
  let paletteSelection = 0;
  let filteredPaletteCommands: PaletteCommand[] = [];

  const closeMenus = (except?: HTMLElement): void => {
    for (const menu of document.querySelectorAll<HTMLElement>('.app-menu')) {
      if (menu === except) continue;
      const trigger = menu.querySelector<HTMLButtonElement>('.app-menu-trigger');
      const popup = menu.querySelector<HTMLElement>('.app-menu-popup');
      if (popup) popup.hidden = true;
      trigger?.setAttribute('aria-expanded', 'false');
    }
  };

  const closeCompactMenu = (): void => {
    app?.classList.remove('menu-open');
    const menuToggle = byId<HTMLButtonElement>('menuToggle');
    menuToggle?.setAttribute('aria-expanded', 'false');
    menuToggle?.setAttribute('aria-label', 'Open application menu');
  };

  const renderPerspective = (perspective: IdePerspective): void => {
    activePerspective = perspective;
    if (perspectiveSelect) perspectiveSelect.value = perspective;
    if (statusPerspective) statusPerspective.textContent = PERSPECTIVE_LABELS[perspective];
    app?.classList.toggle('presentation-mode', perspective === 'presentation');
    byId<HTMLButtonElement>('presentationMode')?.setAttribute('aria-pressed', String(perspective === 'presentation'));
  };

  const setActivity = (activity: ActivitySection, ensureVisible = true): void => {
    activeActivity = activity;
    if (ensureVisible) options.panels.setToolboxVisible(true, false);
    if (isCompactIdeLayout() && ensureVisible) {
      options.panels.setCodeVisible(false, false);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>('.activity-button[data-activity]')) {
      const selected = button.dataset.activity === activity;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    for (const view of document.querySelectorAll<HTMLElement>('[data-sidebar-view]')) {
      view.hidden = view.dataset.sidebarView !== activity;
    }
    if (sidebarTitle) sidebarTitle.textContent = ACTIVITY_TITLES[activity];
    updateIdeLayoutState(ensureVisible
      ? {
          activity,
          sidebarVisible: options.panels.isToolboxVisible(),
          codeVisible: options.panels.isCodeVisible()
        }
      : { activity });
    requestIdeLayoutResize();
  };

  const applyPerspective = (perspective: IdePerspective): void => {
    if (perspective === 'custom') {
      if (activePerspective === 'presentation' && presentationRestore) {
        const restore = presentationRestore;
        setActivity(restore.activity, false);
        options.panels.setToolboxVisible(restore.sidebarVisible, false);
        options.panels.setCodeVisible(restore.codeVisible, false);
        options.panels.setCodeMaximized(restore.codeVisible && restore.codeMaximized, false);
        activateBottomTab(restore.bottomTab, false);
        setVisualizationOpen(restore.bottomVisible, false);
        updateIdeLayoutState({ ...restore, perspective: 'custom' });
        presentationRestore = null;
        renderPerspective('custom');
        requestIdeLayoutResize();
        return;
      }
      renderPerspective('custom');
      updateIdeLayoutState({ perspective: 'custom' });
      return;
    }
    if (perspective === 'presentation' && activePerspective !== 'presentation') {
      priorPerspective = activePerspective;
      presentationRestore = readIdeLayoutState();
    } else if (perspective !== 'presentation') {
      priorPerspective = perspective;
      presentationRestore = null;
    }

    const preset = perspective === 'edit'
      ? { activity: 'blocks' as const, sidebar: true, code: true, bottom: false, tab: 'problems' as const }
      : perspective === 'debug'
        ? { activity: 'run' as const, sidebar: true, code: true, bottom: true, tab: 'stepper' as const }
        : perspective === 'types'
          ? { activity: 'problems' as const, sidebar: true, code: true, bottom: true, tab: 'types' as const }
          : { activity: activeActivity, sidebar: false, code: false, bottom: false, tab: readIdeLayoutState().bottomTab };

    setActivity(preset.activity, false);
    options.panels.setCodeMaximized(false, false);
    options.panels.setToolboxVisible(preset.sidebar, false);
    options.panels.setCodeVisible(preset.code, false);
    activateBottomTab(preset.tab, false);
    setVisualizationOpen(preset.bottom, false);
    renderPerspective(perspective);
    updateIdeLayoutState({
      activity: preset.activity,
      sidebarVisible: options.panels.isToolboxVisible(),
      codeVisible: options.panels.isCodeVisible(),
      codeMaximized: false,
      bottomVisible: preset.bottom,
      bottomTab: preset.tab,
      perspective
    });
    requestIdeLayoutResize();
    window.setTimeout(requestIdeLayoutResize, 100);
  };

  const markCustomPerspective = (): void => {
    if (activePerspective === 'custom') return;
    renderPerspective('custom');
    updateIdeLayoutState({ perspective: 'custom' });
  };

  const openBottomTab = (kind: BottomTab): void => {
    activateBottomTab(kind);
    markCustomPerspective();
  };

  const trigger = (id: string): void => {
    byId<HTMLElement>(id)?.click();
  };

  const toggleBottom = (): void => {
    setVisualizationOpen(!isVisualizationOpen());
    markCustomPerspective();
  };

  const workspaceUndo = (redo: boolean): void => {
    options.getWorkspace().undo(redo);
    requestIdeLayoutResize();
  };

  const zoom = (direction: number): void => {
    options.getWorkspace().zoomCenter(direction);
    requestIdeLayoutResize();
  };

  const showPalette = (): void => {
    closeMenus();
    if (!palette) return;
    if (typeof palette.showModal === 'function' && !palette.open) palette.showModal();
    else palette.setAttribute('open', '');
    if (paletteInput) paletteInput.value = '';
    paletteSelection = 0;
    renderPalette();
    window.setTimeout(() => paletteInput?.focus(), 0);
  };

  const closePalette = (): void => {
    if (!palette?.open) return;
    if (typeof palette.close === 'function') palette.close();
    else palette.removeAttribute('open');
  };

  const toggleTheme = (): void => {
    if (!themeToggle) return;
    themeToggle.checked = !themeToggle.checked;
    themeToggle.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const paletteCommands: PaletteCommand[] = [
    { label: 'File: New Workspace', detail: 'Ctrl+N', keywords: 'clear', action: () => trigger('clearWorkspace') },
    { label: 'File: Open Workspace…', detail: 'Ctrl+O', keywords: 'load blc', action: () => trigger('loadWorkspace') },
    { label: 'File: Save Workspace As…', detail: 'Ctrl+S', keywords: 'download blc', action: () => trigger('saveWorkspace') },
    { label: 'File: Recover Local Autosave', keywords: 'backup restore', action: () => trigger('loadAutosave') },
    { label: 'Edit: Undo', detail: 'Ctrl+Z', action: () => workspaceUndo(false) },
    { label: 'Edit: Redo', detail: 'Ctrl+Shift+Z', action: () => workspaceUndo(true) },
    { label: 'Build: Refresh Generated Output', detail: 'Ctrl+Shift+B', keywords: 'generate type', action: () => trigger('refreshCode') },
    { label: 'View: Toggle Primary Sidebar', detail: 'Ctrl+B', keywords: 'toolbox', action: () => { options.panels.toggleToolbox(); markCustomPerspective(); } },
    { label: 'View: Toggle Code and Inspector', detail: 'Ctrl+Alt+C', keywords: 'editor', action: () => { options.panels.toggleCode(); markCustomPerspective(); } },
    { label: 'View: Toggle Bottom Panel', detail: 'Ctrl+J', keywords: 'tools', action: toggleBottom },
    { label: 'View: Show Blocks', keywords: 'toolbox sidebar', action: () => setActivity('blocks') },
    { label: 'View: Show Project', keywords: 'files sidebar', action: () => setActivity('files') },
    { label: 'View: Show Problems', keywords: 'diagnostics errors', action: () => openBottomTab('problems') },
    { label: 'View: Show Inferred Types', keywords: 'analysis', action: () => openBottomTab('types') },
    { label: 'View: Show Output', keywords: 'log messages', action: () => openBottomTab('output') },
    { label: 'Run: Call-by-Structure Trace', keywords: 'evaluate reduction', action: () => openBottomTab('structure') },
    { label: 'Run: Call-by-Value Trace', keywords: 'evaluate reduction', action: () => openBottomTab('value') },
    { label: 'Run: CEK Machine', keywords: 'debug execution', action: () => openBottomTab('machine') },
    { label: 'Run: Lockstep Debugger', keywords: 'cek rewrite', action: () => openBottomTab('stepper') },
    { label: 'Perspective: Edit', action: () => applyPerspective('edit') },
    { label: 'Perspective: Debug', action: () => applyPerspective('debug') },
    { label: 'Perspective: Type Analysis', action: () => applyPerspective('types') },
    { label: 'Perspective: Presentation', detail: 'F11', action: () => applyPerspective('presentation') },
    { label: 'Preferences: Toggle Color Theme', keywords: 'dark light', action: toggleTheme },
    { label: 'Workspace: Zoom In', action: () => zoom(1) },
    { label: 'Workspace: Zoom Out', action: () => zoom(-1) },
    { label: 'Workspace: Zoom to Fit', action: () => { options.getWorkspace().zoomToFit(); requestIdeLayoutResize(); } },
    { label: 'Code: Synchronize from Workspace', keywords: 'generate editor', action: options.synchronizeCode }
  ];

  function renderPalette(): void {
    if (!paletteList) return;
    const query = (paletteInput?.value ?? '').trim().toLocaleLowerCase();
    filteredPaletteCommands = paletteCommands.filter((command) => {
      const haystack = `${command.label} ${command.detail ?? ''} ${command.keywords ?? ''}`.toLocaleLowerCase();
      return query.split(/\s+/).every((part) => haystack.includes(part));
    });
    paletteSelection = Math.min(paletteSelection, Math.max(0, filteredPaletteCommands.length - 1));
    paletteList.replaceChildren();
    if (filteredPaletteCommands.length === 0) {
      paletteList.append(makeEmptyState('No matching commands.'));
      return;
    }
    filteredPaletteCommands.forEach((command, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'palette-command command-palette-option';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === paletteSelection));
      const label = document.createElement('span');
      label.textContent = command.label;
      const detail = document.createElement('kbd');
      detail.textContent = command.detail ?? '';
      button.append(label, detail);
      button.addEventListener('pointermove', () => {
        if (paletteSelection === index) return;
        paletteSelection = index;
        renderPalette();
      });
      button.addEventListener('click', () => {
        closePalette();
        command.action();
      });
      paletteList.append(button);
    });
  }

  const syncThemeControls = (): void => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-theme-mode]')) {
      const selected = button.dataset.themeMode === current;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  };

  const appendOutput = (message: string, tone: OutputTone = 'info'): void => {
    const log = byId<HTMLElement>('outputLog');
    if (!log || !message) return;
    const row = document.createElement('div');
    row.className = 'output-entry';
    row.dataset.tone = tone;
    const time = document.createElement('time');
    time.className = 'output-time';
    time.dateTime = new Date().toISOString();
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const text = document.createElement('span');
    text.className = 'output-message';
    text.textContent = message;
    row.append(time, text);
    log.append(row);
    while (log.childElementCount > 100) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
  };

  for (const menu of document.querySelectorAll<HTMLElement>('.app-menu')) {
    const triggerButton = menu.querySelector<HTMLButtonElement>('.app-menu-trigger');
    const popup = menu.querySelector<HTMLElement>('.app-menu-popup');
    triggerButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = popup?.hidden ?? false;
      closeMenus(willOpen ? menu : undefined);
      if (popup) popup.hidden = !willOpen;
      triggerButton.setAttribute('aria-expanded', String(willOpen));
    });
    triggerButton?.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' || !popup) return;
      event.preventDefault();
      popup.hidden = false;
      triggerButton.setAttribute('aria-expanded', 'true');
      popup.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    popup?.addEventListener('keydown', (event) => {
      const items = Array.from(popup.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : Number.NaN;
      if (Number.isNaN(next) || items.length === 0) return;
      event.preventDefault();
      items[(next + items.length) % items.length].focus();
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const activityButton = target.closest<HTMLButtonElement>('[data-activity]');
    if (activityButton?.dataset.activity) {
      const requested = activityButton.dataset.activity as ActivitySection;
      const mayToggle = activityButton.classList.contains('activity-button');
      if (mayToggle && requested === activeActivity && options.panels.isToolboxVisible()) {
        options.panels.setToolboxVisible(false);
        markCustomPerspective();
      } else {
        setActivity(requested);
      }
      return;
    }

    const commandTarget = target.closest<HTMLElement>('[data-command-target]')?.dataset.commandTarget;
    if (commandTarget) {
      trigger(commandTarget);
      closeCompactMenu();
    }

    const panelCommand = target.closest<HTMLElement>('[data-panel-command]')?.dataset.panelCommand;
    if (panelCommand === 'sidebar') options.panels.toggleToolbox();
    if (panelCommand === 'code') options.panels.toggleCode();
    if (panelCommand === 'bottom') toggleBottom();
    if (panelCommand === 'sidebar' || panelCommand === 'code') markCustomPerspective();

    const bottomTab = target.closest<HTMLElement>('[data-bottom-tab]')?.dataset.bottomTab as BottomTab | undefined;
    if (bottomTab) {
      openBottomTab(bottomTab);
      closeCompactMenu();
    }

    const perspective = target.closest<HTMLElement>('[data-perspective]')?.dataset.perspective as IdePerspective | undefined;
    if (perspective) applyPerspective(perspective);

    const themeMode = target.closest<HTMLButtonElement>('button[data-theme-mode]')?.dataset.themeMode;
    if (themeMode && themeToggle) {
      const wantsDark = themeMode === 'dark';
      if (themeToggle.checked !== wantsDark) {
        themeToggle.checked = wantsDark;
        themeToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    if (target.closest('.app-menu-popup [role="menuitem"]') && !target.closest('[aria-haspopup="menu"]')) {
      closeMenus();
      closeCompactMenu();
    }
    if (!target.closest('.app-menu')) closeMenus();
    if (!target.closest('.topbar')) closeCompactMenu();
  });

  document.addEventListener('keydown', (event) => {
    const activeElement = document.activeElement;
    const editing = activeElement instanceof HTMLInputElement
      || activeElement instanceof HTMLTextAreaElement
      || activeElement instanceof HTMLSelectElement
      || (activeElement instanceof HTMLElement && activeElement.isContentEditable);
    const key = event.key.toLocaleLowerCase();

    if (event.key === 'Escape') {
      closeMenus();
      closePalette();
      closeCompactMenu();
      return;
    }
    if (event.key === 'F1' || ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'p')) {
      event.preventDefault();
      showPalette();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === 's') { event.preventDefault(); trigger('saveWorkspace'); }
    else if ((event.ctrlKey || event.metaKey) && key === 'o') { event.preventDefault(); trigger('loadWorkspace'); }
    else if ((event.ctrlKey || event.metaKey) && key === 'n') { event.preventDefault(); trigger('clearWorkspace'); }
    else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'b') { event.preventDefault(); options.panels.toggleToolbox(); markCustomPerspective(); }
    else if ((event.ctrlKey || event.metaKey) && key === 'j') { event.preventDefault(); toggleBottom(); }
    else if ((event.ctrlKey || event.metaKey) && event.altKey && key === 'c') { event.preventDefault(); options.panels.toggleCode(); markCustomPerspective(); }
    else if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'b') { event.preventDefault(); trigger('refreshCode'); }
    else if (event.key === 'F11') {
      event.preventDefault();
      applyPerspective(activePerspective === 'presentation' ? priorPerspective : 'presentation');
    } else if (!editing && (event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'z') {
      event.preventDefault();
      workspaceUndo(false);
    } else if (!editing && (event.ctrlKey || event.metaKey) && event.shiftKey && key === 'z') {
      event.preventDefault();
      workspaceUndo(true);
    } else if (!editing && event.key === '/') {
      event.preventDefault();
      setActivity('blocks');
      byId<HTMLInputElement>('toolboxSearch')?.focus();
    }
  });

  paletteInput?.addEventListener('input', () => {
    paletteSelection = 0;
    renderPalette();
  });
  paletteInput?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      paletteSelection = (paletteSelection + direction + filteredPaletteCommands.length) % Math.max(1, filteredPaletteCommands.length);
      renderPalette();
      paletteList?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && filteredPaletteCommands[paletteSelection]) {
      event.preventDefault();
      const command = filteredPaletteCommands[paletteSelection];
      closePalette();
      command.action();
    }
  });
  palette?.addEventListener('click', (event) => {
    if (event.target === palette) closePalette();
  });

  byId<HTMLButtonElement>('commandPaletteTrigger')?.addEventListener('click', showPalette);
  byId<HTMLButtonElement>('undoWorkspace')?.addEventListener('click', () => workspaceUndo(false));
  byId<HTMLButtonElement>('redoWorkspace')?.addEventListener('click', () => workspaceUndo(true));
  byId<HTMLButtonElement>('workspaceUndo')?.addEventListener('click', () => workspaceUndo(false));
  byId<HTMLButtonElement>('workspaceRedo')?.addEventListener('click', () => workspaceUndo(true));
  byId<HTMLButtonElement>('zoomOut')?.addEventListener('click', () => zoom(-1));
  byId<HTMLButtonElement>('zoomIn')?.addEventListener('click', () => zoom(1));
  byId<HTMLButtonElement>('zoomFit')?.addEventListener('click', () => {
    options.getWorkspace().zoomToFit();
    requestIdeLayoutResize();
  });
  byId<HTMLButtonElement>('presentationMode')?.addEventListener('click', () => {
    applyPerspective(activePerspective === 'presentation' ? priorPerspective : 'presentation');
  });
  byId<HTMLButtonElement>('synchronizeCode')?.addEventListener('click', options.synchronizeCode);
  perspectiveSelect?.addEventListener('change', () => applyPerspective(perspectiveSelect.value as IdePerspective));
  window.addEventListener('block-lambda:theme-changed', syncThemeControls);
  window.addEventListener('block-lambda:layout-state-changed', () => renderPerspective(readIdeLayoutState().perspective));

  for (const id of ['toggleToolboxPanel', 'showToolboxFromWorkspace', 'toggleCodePanel', 'showCodeFromWorkspace', 'maximizeCodePanel', 'toggleVizDock', 'vizCollapse']) {
    byId<HTMLElement>(id)?.addEventListener('click', () => window.setTimeout(() => renderPerspective(readIdeLayoutState().perspective), 0));
  }

  setActivity(activeActivity, false);
  renderPerspective(activePerspective);
  syncThemeControls();
  renderPalette();

  return {
    appendOutput,
    applyPerspective,
    renderDiagnostics: (report) => renderDiagnosticsIntoWorkbench(options.getWorkspace(), report),
    setActivity,
    syncThemeControls
  };
}
