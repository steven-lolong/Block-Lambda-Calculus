import * as Blockly from 'blockly';
import 'blockly/blocks';
import '../css/styles.css';
import { registerLambdaBlocks } from '../../core/blocks/lambdaBlocks';
import { generateLambdaCode } from '../../core/generator/lambdaGenerator';
import { renderToolbox } from '../../core/renderer/toolbox';
import { setupPanelControls, setupWorkspaceAutoResize } from '../../core/ui/layout';

registerLambdaBlocks();

const AUTOSAVE_STORAGE_KEY = 'block-lambda-autosave-workspace';
const AUTOSAVE_TIME_STORAGE_KEY = 'block-lambda-autosave-time';
const AUTOSAVE_DELAY_MS = 600;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Block Lambda IDE could not find the required DOM element: #${id}`);
  }
  return element as T;
}

const blocklyDiv = requireElement<HTMLDivElement>('blocklyDiv');
const toolboxPanel = requireElement<HTMLElement>('toolboxPanel');
const codeOutput = requireElement<HTMLElement>('codeOutput');
const statusLine = requireElement<HTMLElement>('statusLine');
const workspaceTitle = requireElement<HTMLElement>('workspaceTitle');

let currentWorkspaceFileName = 'block-lambda-workspace.blc';

const lightTheme = Blockly.Theme.defineTheme('blockLambdaLightTheme', {
  name: 'blockLambdaLightTheme',
  base: Blockly.Themes.Classic,
  blockStyles: {
    lambda_term: {
      colourPrimary: '#1f2937',
      colourSecondary: '#4b5563',
      colourTertiary: '#111827'
    },
    lambda_binding: {
      colourPrimary: '#374151',
      colourSecondary: '#6b7280',
      colourTertiary: '#111827'
    },
    lambda_grouping: {
      colourPrimary: '#6b7280',
      colourSecondary: '#9ca3af',
      colourTertiary: '#374151'
    },
    lambda_literal: {
      colourPrimary: '#52525b',
      colourSecondary: '#71717a',
      colourTertiary: '#27272a'
    }
  },
  componentStyles: {
    workspaceBackgroundColour: '#f7f7f8',
    toolboxBackgroundColour: '#ffffff',
    toolboxForegroundColour: '#111827',
    flyoutBackgroundColour: '#ffffff',
    flyoutForegroundColour: '#111827',
    flyoutOpacity: 1,
    scrollbarColour: '#6b7280',
    scrollbarOpacity: 0.55,
    insertionMarkerColour: '#111827',
    insertionMarkerOpacity: 0.25,
    cursorColour: '#111827',
    markerColour: '#111827'
  }
});

const darkTheme = Blockly.Theme.defineTheme('blockLambdaDarkTheme', {
  name: 'blockLambdaDarkTheme',
  base: Blockly.Themes.Classic,
  blockStyles: {
    lambda_term: {
      colourPrimary: '#d1d5db',
      colourSecondary: '#9ca3af',
      colourTertiary: '#f9fafb'
    },
    lambda_binding: {
      colourPrimary: '#a3a3a3',
      colourSecondary: '#d4d4d8',
      colourTertiary: '#f5f5f5'
    },
    lambda_grouping: {
      colourPrimary: '#71717a',
      colourSecondary: '#a1a1aa',
      colourTertiary: '#d4d4d8'
    },
    lambda_literal: {
      colourPrimary: '#e5e7eb',
      colourSecondary: '#9ca3af',
      colourTertiary: '#ffffff'
    }
  },
  componentStyles: {
    workspaceBackgroundColour: '#18181b',
    toolboxBackgroundColour: '#09090b',
    toolboxForegroundColour: '#f4f4f5',
    flyoutBackgroundColour: '#222226',
    flyoutForegroundColour: '#f5f5f5',
    flyoutOpacity: 1,
    scrollbarColour: '#a1a1aa',
    scrollbarOpacity: 0.62,
    insertionMarkerColour: '#ffffff',
    insertionMarkerOpacity: 0.28,
    cursorColour: '#ffffff',
    markerColour: '#ffffff'
  }
});

const workspace = Blockly.inject(blocklyDiv, {
  trashcan: true,
  grid: {
    spacing: 24,
    length: 3,
    colour: '#b8b8bf',
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
  const tokenPattern = /(--[^\n]*|\b(?:let|in|true|false)\b|[λ.()=]|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_']*|□|\s+|.)/gu;
  const tokens = code.match(tokenPattern) ?? [];

  return tokens.map((token) => {
    if (/^--/.test(token)) return tokenSpan('syntax-comment', token);
    if (/^\s+$/.test(token)) return escapeHtml(token);
    if (token === '□') return tokenSpan('syntax-hole', token);
    if (/^(?:let|in|true|false|[λ.()=]|\d+(?:\.\d+)?)$/.test(token)) {
      return tokenSpan('syntax-terminal', token);
    }
    if (/^[A-Za-z_][A-Za-z0-9_']*$/.test(token)) {
      return tokenSpan('syntax-nonterminal', token);
    }
    return escapeHtml(token);
  }).join('');
}

function setStatus(message: string): void {
  statusLine.textContent = message;
}

function getDisplayFileName(fileName: string): string {
  return fileName.replace(/\.blc$/i, '');
}

function setWorkspaceTitle(fileName?: string): void {
  const title = fileName ? getDisplayFileName(fileName) : 'Workspace';
  workspaceTitle.textContent = title;
  workspaceTitle.title = title;
  document.title = `${title} - Block Lambda Calculus IDE`;
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

function refreshCode(): void {
  const code = generateLambdaCode(workspace);
  codeOutput.innerHTML = highlightLambdaCode(code);
}

function clearWorkspace(): void {
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

    if (announce) {
      setStatus(`Autosaved locally at ${new Date(savedAt).toLocaleTimeString()}.`);
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

  autosaveTimer = window.setTimeout(() => {
    saveWorkspaceToAutosave(true);
    autosaveTimer = undefined;
  }, AUTOSAVE_DELAY_MS);
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

workspace.addChangeListener((event) => {
  if (event.isUiEvent) return;
  refreshCode();
  scheduleAutosave();
});

window.addEventListener('block-lambda:refresh-code', refreshCode);

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
setWorkspaceTitle();
refreshCode();
saveWorkspaceToAutosave(false);
resizeWorkspace();
setStatus('Ready. Drag blocks from the toolbox, load a .blc file, or recover a local autosave.');
