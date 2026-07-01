import * as Blockly from 'blockly';
import 'blockly/blocks';
import '../css/styles.css';
import { registerLambdaBlocks } from '../../core/blocks/lambdaBlocks';
import { generateLambdaCode } from '../../core/generator/lambdaGenerator';
import { renderToolbox } from '../../core/renderer/toolbox';
import { setupPanelControls, setupWorkspaceAutoResize } from '../../core/ui/layout';
import { registerLambdaContextMenus } from '../../core/ui/contextMenus';
import { disposeVisualizationWorkspaces, initVisualizationPanel, setVisualizationOpen } from '../../core/ui/visualizationPanel';

registerLambdaBlocks();
registerLambdaContextMenus();

const AUTOSAVE_STORAGE_KEY = 'block-lambda-autosave-workspace';
const AUTOSAVE_TIME_STORAGE_KEY = 'block-lambda-autosave-time';
const AUTOSAVE_INTERVAL_STORAGE_KEY = 'block-lambda-autosave-interval-minutes';
const AUTOSAVE_DEFAULT_INTERVAL_MINUTES = 2;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Block Lambda IDE could not find the required DOM element: #${id}`);
  }
  return element as T;
}

function clampAutosaveInterval(value: number): number {
  if (!Number.isFinite(value)) return AUTOSAVE_DEFAULT_INTERVAL_MINUTES;
  return Math.min(Math.max(Math.round(value), 2), 20);
}

function readAutosaveIntervalMinutes(): number {
  const stored = window.localStorage.getItem(AUTOSAVE_INTERVAL_STORAGE_KEY);
  return clampAutosaveInterval(stored ? Number(stored) : AUTOSAVE_DEFAULT_INTERVAL_MINUTES);
}

function formatAutosaveInterval(minutes: number): string {
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

const blocklyDiv = requireElement<HTMLDivElement>('blocklyDiv');
const toolboxPanel = requireElement<HTMLElement>('toolboxPanel');
const codeOutput = requireElement<HTMLElement>('codeOutput');
const statusLine = requireElement<HTMLElement>('statusLine');
const workspaceTitle = requireElement<HTMLElement>('workspaceTitle');
const workspaceFileLabel = requireElement<HTMLElement>('workspaceFileLabel');
const zoomLabel = requireElement<HTMLElement>('zoomLabel');
const blockCount = requireElement<HTMLElement>('blockCount');
const autosaveTime = requireElement<HTMLElement>('autosaveTime');
const autosaveInterval = requireElement<HTMLInputElement>('autosaveInterval');
const autosaveIntervalLabel = requireElement<HTMLElement>('autosaveIntervalLabel');

let currentWorkspaceFileName = 'block-lambda-workspace.blc';
let autosaveIntervalMinutes = readAutosaveIntervalMinutes();

const lightTheme = Blockly.Theme.defineTheme('blockLambdaLightTheme', {
  name: 'blockLambdaLightTheme',
  base: Blockly.Themes.Classic,
  blockStyles: {
    lambda_term: {
      colourPrimary: '#8839ef',
      colourSecondary: '#7287fd',
      colourTertiary: '#c6a0f6'
    },
    lambda_binding: {
      colourPrimary: '#1e66f5',
      colourSecondary: '#209fb5',
      colourTertiary: '#8aadf4'
    },
    lambda_grouping: {
      colourPrimary: '#179299',
      colourSecondary: '#40a02b',
      colourTertiary: '#8bd5ca'
    },
    lambda_literal: {
      colourPrimary: '#df8e1d',
      colourSecondary: '#fe640b',
      colourTertiary: '#eed49f'
    },
    lambda_operator: {
      colourPrimary: '#179299',
      colourSecondary: '#04a5e5',
      colourTertiary: '#40a02b'
    },
    lambda_control: {
      colourPrimary: '#ea76cb',
      colourSecondary: '#8839ef',
      colourTertiary: '#7287fd'
    },
    lambda_meta: {
      colourPrimary: '#6c6f85',
      colourSecondary: '#8c8fa1',
      colourTertiary: '#bcc0cc'
    }
  },
  componentStyles: {
    workspaceBackgroundColour: '#eff1f5',
    toolboxBackgroundColour: '#e6e9ef',
    toolboxForegroundColour: '#4c4f69',
    flyoutBackgroundColour: '#eff1f5',
    flyoutForegroundColour: '#4c4f69',
    flyoutOpacity: 1,
    scrollbarColour: '#8c8fa1',
    scrollbarOpacity: 0.62,
    insertionMarkerColour: '#8839ef',
    insertionMarkerOpacity: 0.30,
    cursorColour: '#8839ef',
    markerColour: '#179299'
  }
});

const darkTheme = Blockly.Theme.defineTheme('blockLambdaDarkTheme', {
  name: 'blockLambdaDarkTheme',
  base: Blockly.Themes.Classic,
  blockStyles: {
    lambda_term: {
      colourPrimary: '#c6a0f6',
      colourSecondary: '#b7bdf8',
      colourTertiary: '#f5bde6'
    },
    lambda_binding: {
      colourPrimary: '#8aadf4',
      colourSecondary: '#7dc4e4',
      colourTertiary: '#91d7e3'
    },
    lambda_grouping: {
      colourPrimary: '#8bd5ca',
      colourSecondary: '#a6da95',
      colourTertiary: '#91d7e3'
    },
    lambda_literal: {
      colourPrimary: '#eed49f',
      colourSecondary: '#f5a97f',
      colourTertiary: '#f4dbd6'
    },
    lambda_operator: {
      colourPrimary: '#8bd5ca',
      colourSecondary: '#91d7e3',
      colourTertiary: '#a6da95'
    },
    lambda_control: {
      colourPrimary: '#f5bde6',
      colourSecondary: '#c6a0f6',
      colourTertiary: '#b7bdf8'
    },
    lambda_meta: {
      colourPrimary: '#6e738d',
      colourSecondary: '#939ab7',
      colourTertiary: '#a5adcb'
    }
  },
  componentStyles: {
    workspaceBackgroundColour: '#24273a',
    toolboxBackgroundColour: '#1e2030',
    toolboxForegroundColour: '#cad3f5',
    flyoutBackgroundColour: '#24273a',
    flyoutForegroundColour: '#cad3f5',
    flyoutOpacity: 1,
    scrollbarColour: '#6e738d',
    scrollbarOpacity: 0.72,
    insertionMarkerColour: '#c6a0f6',
    insertionMarkerOpacity: 0.34,
    cursorColour: '#91d7e3',
    markerColour: '#8bd5ca'
  }
});

const workspace = Blockly.inject(blocklyDiv, {
  trashcan: true,
  grid: {
    spacing: 24,
    length: 3,
    colour: '#6e738d',
    snap: true
  },
  move: {
    scrollbars: true,
    drag: true,
    wheel: true
  },
  zoom: {
    controls: true,
    wheel: true,
    startScale: 0.92,
    maxScale: 2,
    minScale: 0.45,
    scaleSpeed: 1.08,
    pinch: true
  },
  renderer: 'zelos',
  theme: lightTheme
});

const resizeWorkspace = setupWorkspaceAutoResize(workspace, blocklyDiv);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tokenSpan(className: string, value: string): string {
  return `<span class="${className}">${escapeHtml(value)}</span>`;
}

function highlightLambdaCode(code: string): string {
  const tokenPattern = /(--[^\n]*|\b(?:let|in|if|then|else|and|or|true|false)\b|[λ.()=+\-*/]|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_']*|□|\s+|.)/gu;
  const tokens = code.match(tokenPattern) ?? [];

  return tokens.map((token) => {
    if (/^--/.test(token)) return tokenSpan('syntax-comment', token);
    if (/^\s+$/.test(token)) return escapeHtml(token);
    if (token === '□') return tokenSpan('syntax-hole', token);
    if (/^(?:let|in|if|then|else|and|or|true|false|[λ.()=+\-*/]|\d+(?:\.\d+)?)$/.test(token)) {
      return tokenSpan('syntax-terminal', token);
    }
    if (/^[A-Za-z_][A-Za-z0-9_']*$/.test(token)) {
      return tokenSpan('syntax-nonterminal', token);
    }
    return escapeHtml(token);
  }).join('');
}

function renderHighlightedCodeLines(code: string): string {
  const sourceLines = code.split('\n');
  const totalLines = Math.max(sourceLines.length, 5);
  return Array.from({ length: totalLines }, (_, index) => {
    const line = sourceLines[index] ?? '';
    return `<span class="code-line"><span class="line-number" aria-hidden="true">${index + 1}</span><span class="line-code">${highlightLambdaCode(line) || '&nbsp;'}</span></span>`;
  }).join('');
}

function setStatus(message: string): void {
  statusLine.textContent = message;
}

function getDisplayFileName(fileName: string): string {
  return fileName.replace(/\.blc$/i, '');
}

function setWorkspaceTitle(fileName?: string): void {
  const fileLabel = fileName ? getDisplayFileName(fileName) : '';
  workspaceTitle.textContent = 'Workspace';
  workspaceTitle.title = 'Workspace';
  workspaceFileLabel.textContent = fileLabel;
  workspaceFileLabel.title = fileName ?? 'No workspace file loaded';
  document.title = fileName ? `${fileLabel} - Block Lambda Calculus IDE` : 'Block Lambda Calculus IDE';
}

function updateZoomLabel(): void {
  const zoomPercent = Math.round(workspace.getScale() * 100);
  zoomLabel.textContent = `${zoomPercent}%`;
  zoomLabel.title = `Blockly zoom level: ${zoomPercent}%`;
}

function normalizeBlcFilename(value: string): string {
  const trimmed = value.trim().replace(/[\\/:*?"<>|]+/g, '-');
  const baseName = trimmed.length > 0 ? trimmed : 'block-lambda-workspace';
  return /\.blc$/i.test(baseName) ? baseName : `${baseName}.blc`;
}

function askForSaveFileName(): string | null {
  const suggestedName = currentWorkspaceFileName || 'block-lambda-workspace.blc';
  const answer = window.prompt('Save workspace as .blc file:', suggestedName);
  if (answer === null) return null;
  return normalizeBlcFilename(answer);
}

function updateAutosaveIntervalUi(): void {
  autosaveInterval.value = String(autosaveIntervalMinutes);
  autosaveIntervalLabel.textContent = formatAutosaveInterval(autosaveIntervalMinutes);
  autosaveInterval.title = `Autosave interval: ${formatAutosaveInterval(autosaveIntervalMinutes)}`;
}

function updateBlockCount(): void {
  blockCount.textContent = String(workspace.getAllBlocks(false).length);
}

function refreshCode(): void {
  const code = generateLambdaCode(workspace);
  codeOutput.dataset.rawCode = code;
  codeOutput.innerHTML = renderHighlightedCodeLines(code);
  updateBlockCount();
  updateZoomLabel();
}

function clearWorkspace(): void {
  setVisualizationOpen(false);
  workspace.clear();
  currentWorkspaceFileName = 'block-lambda-workspace.blc';
  setWorkspaceTitle();
  refreshCode();
  resizeWorkspace();
  setStatus('Workspace cleared.');
}

function downloadTextFile(filename: string, content: string, mimeType = 'application/json'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function saveWorkspace(): void {
  const fileName = askForSaveFileName();
  if (!fileName) {
    setStatus('Save cancelled.');
    return;
  }

  const workspaceState = Blockly.serialization.workspaces.save(workspace);
  const serialized = JSON.stringify(workspaceState, null, 2);
  downloadTextFile(fileName, serialized, 'application/x-block-lambda');
  currentWorkspaceFileName = fileName;
  setWorkspaceTitle(fileName);
  saveWorkspaceToAutosave(false);
  setStatus(`Workspace saved as ${fileName}. Local autosave updated.`);
}

function saveWorkspaceToAutosave(announce = false): void {
  try {
    const workspaceState = Blockly.serialization.workspaces.save(workspace);
    const serialized = JSON.stringify(workspaceState);
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, serialized);
    window.localStorage.setItem(AUTOSAVE_TIME_STORAGE_KEY, savedAt);

    const savedAtLabel = new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    autosaveTime.textContent = announce ? savedAtLabel : 'Just now';

    if (announce) {
      setStatus(`Autosaved locally at ${savedAtLabel}.`);
    }
  } catch (error) {
    console.error(error);
    setStatus('Could not autosave to local storage.');
  }
}

let autosaveTimer: number | undefined;

function scheduleAutosave(): void {
  if (autosaveTimer !== undefined) {
    window.clearTimeout(autosaveTimer);
  }

  const delayMs = autosaveIntervalMinutes * 60 * 1000;
  autosaveTimer = window.setTimeout(() => {
    saveWorkspaceToAutosave(true);
    autosaveTimer = undefined;
  }, delayMs);
}

function openFilePicker(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.blc,application/x-block-lambda';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      window.setTimeout(() => input.remove(), 0);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    }, { once: true });

    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    }, { once: true } as AddEventListenerOptions);

    input.click();
  });
}

async function loadWorkspace(): Promise<void> {
  const file = await openFilePicker();
  if (!file) {
    setStatus('Load cancelled.');
    return;
  }

  try {
    const serialized = await file.text();
    const workspaceState = JSON.parse(serialized) as Record<string, unknown>;
    setVisualizationOpen(false);
    workspace.clear();
    Blockly.serialization.workspaces.load(workspaceState, workspace);
    currentWorkspaceFileName = normalizeBlcFilename(file.name);
    setWorkspaceTitle(currentWorkspaceFileName);
    saveWorkspaceToAutosave(false);
    refreshCode();
    resizeWorkspace();
    setStatus(`Loaded workspace from ${file.name}. Local autosave updated.`);
  } catch (error) {
    console.error(error);
    setStatus('Could not load the selected .blc file.');
  }
}

function loadAutosave(): void {
  const serialized = window.localStorage.getItem(AUTOSAVE_STORAGE_KEY);
  const savedAt = window.localStorage.getItem(AUTOSAVE_TIME_STORAGE_KEY);

  if (!serialized) {
    setStatus('No local autosave was found in this browser.');
    return;
  }

  try {
    const workspaceState = JSON.parse(serialized) as Record<string, unknown>;
    setVisualizationOpen(false);
    workspace.clear();
    Blockly.serialization.workspaces.load(workspaceState, workspace);
    currentWorkspaceFileName = 'autosave-recovery.blc';
    setWorkspaceTitle(currentWorkspaceFileName);
    refreshCode();
    resizeWorkspace();
    const savedAtText = savedAt ? ` from ${new Date(savedAt).toLocaleString()}` : '';
    setStatus(`Loaded local autosave${savedAtText}.`);
  } catch (error) {
    console.error(error);
    setStatus('Could not load the local autosave. The saved data may be invalid.');
  }
}

renderToolbox(toolboxPanel, workspace, blocklyDiv);
setupPanelControls(workspace, {
  lightTheme,
  darkTheme,
  onRefreshCode: () => {
    refreshCode();
    setStatus('Code refreshed.');
  },
  onClearWorkspace: clearWorkspace,
  onSaveWorkspace: saveWorkspace,
  onLoadWorkspace: loadWorkspace,
  onLoadAutosave: loadAutosave,
  onResize: resizeWorkspace
});

initVisualizationPanel({
  lightTheme,
  darkTheme,
  onResize: resizeWorkspace
});

autosaveInterval.addEventListener('input', () => {
  autosaveIntervalMinutes = clampAutosaveInterval(Number(autosaveInterval.value));
  window.localStorage.setItem(AUTOSAVE_INTERVAL_STORAGE_KEY, String(autosaveIntervalMinutes));
  updateAutosaveIntervalUi();
  if (autosaveTimer !== undefined) {
    scheduleAutosave();
  }
  setStatus(`Autosave interval set to ${formatAutosaveInterval(autosaveIntervalMinutes)}.`);
});

workspace.addChangeListener((event) => {
  updateZoomLabel();
  if (event.isUiEvent) return;
  refreshCode();
  scheduleAutosave();
});

window.addEventListener('block-lambda:refresh-code', refreshCode);
window.addEventListener('block-lambda:theme-changed', disposeVisualizationWorkspaces);

function createStarterProgram(): void {
  if (workspace.getAllBlocks(false).length > 0) return;

  const abstraction = workspace.newBlock('lambda_abstraction');
  abstraction.setFieldValue('x', 'PARAM');
  abstraction.initSvg();
  abstraction.render();
  abstraction.moveBy(72, 72);

  const variable = workspace.newBlock('lambda_variable');
  variable.setFieldValue('x', 'NAME');
  variable.initSvg();
  variable.render();

  const bodyConnection = abstraction.getInput('BODY')?.connection;
  if (variable.outputConnection && bodyConnection) {
    variable.outputConnection.connect(bodyConnection);
  }

  workspace.cleanUp();
}

createStarterProgram();
updateAutosaveIntervalUi();
setWorkspaceTitle();
refreshCode();
saveWorkspaceToAutosave(false);
resizeWorkspace();
setStatus('Ready. Drag blocks from the toolbox, load a .blc file, or recover a local autosave.');
