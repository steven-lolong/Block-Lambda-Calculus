import * as Blockly from 'blockly';
import 'blockly/blocks';
import '../css/tokens.css';
import '../css/styles.css';
import '../css/examples.css';
import { registerLambdaBlocks } from '../../core/blocks/lambdaBlocks';
import { generateLambdaCode } from '../../core/generator/lambdaGenerator';
import { generateLambdaFormalization } from '../../core/generator/lambdaFormalGenerator';
import { lambdaTermText } from '../../core/generator/lambdaTermText';
import { LambdaTextParseError, parseLambdaTextToWorkspaceState, type LambdaWorkspaceState } from '../../core/parser/lambdaTextParser';
import { annotateLambdaWorkspaceTypes, type LambdaInferenceReport } from '../../core/type-inference/lambdaTypeInference';
import { installLambdaInferenceDriver, runLambdaInferenceToFixpoint } from '../../core/type-inference/inferenceDriver';
import { TUDE_RENDERER_NAME, registerTudeRenderer } from '../../core/renderer/tude';
import { renderToolbox } from '../../core/renderer/toolbox';
import { registerIdeLayoutResizeListener, setupPanelControls, setupWorkspaceAutoResize } from '../../core/ui/layout';
import { registerLambdaContextMenus } from '../../core/ui/contextMenus';
import { disposeVisualizationWorkspaces, initVisualizationPanel, setVisualizationOpen } from '../../core/ui/visualizationPanel';
import { initWorkbench, type WorkbenchController } from '../../core/ui/workbench';
import { syncTypeInfoComments } from '../../core/ui/typeInfoPopup';
import { getLambdaExample, installExampleMenu, loadLambdaExample, type LambdaExampleId } from '../../core/examples/lambdaExamples';

registerLambdaBlocks();
registerLambdaContextMenus();
registerTudeRenderer();

const AUTOSAVE_STORAGE_KEY = 'block-lambda-autosave-workspace';
const AUTOSAVE_TIME_STORAGE_KEY = 'block-lambda-autosave-time';
const AUTOSAVE_INTERVAL_STORAGE_KEY = 'block-lambda-autosave-interval-minutes';
const AUTOSAVE_DEFAULT_INTERVAL_MINUTES = 2;
const BLOCKLY_RENDERER_STORAGE_KEY = 'block-lambda-blockly-renderer';
const ZELOS_RENDERER_NAME = 'zelos';
const THRASOS_RENDERER_NAME = 'thrasos';

type BlocklyRendererName = typeof TUDE_RENDERER_NAME | typeof ZELOS_RENDERER_NAME | typeof THRASOS_RENDERER_NAME;

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

function isBlocklyRendererName(value: string | null): value is BlocklyRendererName {
  return value === TUDE_RENDERER_NAME || value === ZELOS_RENDERER_NAME || value === THRASOS_RENDERER_NAME;
}

function readBlocklyRendererName(): BlocklyRendererName {
  const stored = window.localStorage.getItem(BLOCKLY_RENDERER_STORAGE_KEY);
  return isBlocklyRendererName(stored) ? stored : TUDE_RENDERER_NAME;
}

function formatAutosaveInterval(minutes: number): string {
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

const blocklyDiv = requireElement<HTMLDivElement>('blocklyDiv');
const blockToolboxContent = requireElement<HTMLElement>('blockToolboxContent');
const codeOutput = requireElement<HTMLElement>('codeOutput');
const lambdaEditorPane = requireElement<HTMLElement>('lambdaEditorPane');
const lambdaEditor = requireElement<HTMLTextAreaElement>('lambdaEditor');
const lambdaEditorHighlight = requireElement<HTMLElement>('lambdaEditorHighlight');
const lambdaEditorGutter = requireElement<HTMLElement>('lambdaEditorGutter');
const lambdaEditorStatus = requireElement<HTMLElement>('lambdaEditorStatus');
const statusLine = requireElement<HTMLElement>('statusLine');
const workspaceTitle = requireElement<HTMLElement>('workspaceTitle');
const workspaceFileLabel = requireElement<HTMLElement>('workspaceFileLabel');
const zoomLabel = requireElement<HTMLElement>('zoomLabel');
const blockCount = requireElement<HTMLElement>('blockCount');
const autosaveTime = requireElement<HTMLElement>('autosaveTime');
const autosaveInterval = requireElement<HTMLInputElement>('autosaveInterval');
const autosaveIntervalLabel = requireElement<HTMLElement>('autosaveIntervalLabel');
const examplesMenuButton = requireElement<HTMLButtonElement>('examplesMenuButton');
const examplesSubMenu = requireElement<HTMLElement>('examplesSubMenu');
const blocklyThemeMenuButton = requireElement<HTMLButtonElement>('blocklyThemeMenuButton');
const blocklyThemeSubMenu = requireElement<HTMLElement>('blocklyThemeSubMenu');
const codeTargetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-code-target]'));
const primaryCodeTargetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.code-tabs [data-code-target]'));
const typesPane = requireElement<HTMLElement>('typesPane');
const typeTargetOverview = requireElement<HTMLButtonElement>('typeTargetOverview');
const blocklyRendererButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-blockly-renderer]'));
const topbarFileName = requireElement<HTMLElement>('topbarFileName');
const projectFileLabel = requireElement<HTMLElement>('projectFileLabel');
const topSaveStatus = requireElement<HTMLElement>('topSaveStatus');
const blockInspectorPane = requireElement<HTMLElement>('blockInspectorPane');
const blockInspectorEmpty = requireElement<HTMLElement>('blockInspectorEmpty');
const blockInspectorContent = requireElement<HTMLElement>('blockInspectorContent');
const inspectorBlockKind = requireElement<HTMLElement>('inspectorBlockKind');
const inspectorBlockId = requireElement<HTMLElement>('inspectorBlockId');
const inspectorBlockTerm = requireElement<HTMLElement>('inspectorBlockTerm');
const inspectorBlockType = requireElement<HTMLElement>('inspectorBlockType');
const inspectorBlockStatus = requireElement<HTMLElement>('inspectorBlockStatus');
const inspectorBlockIssues = requireElement<HTMLElement>('inspectorBlockIssues');
const outlinePane = requireElement<HTMLElement>('outlinePane');
const programOutline = requireElement<HTMLDivElement>('programOutline');
const printDerivationButton = requireElement<HTMLButtonElement>('printDerivation');
const copyCodeButton = requireElement<HTMLButtonElement>('copyCode');
const synchronizeCodeButton = requireElement<HTMLButtonElement>('synchronizeCode');

let currentWorkspaceFileName = 'block-lambda-workspace.blc';
let autosaveIntervalMinutes = readAutosaveIntervalMinutes();
let activeBlocklyRenderer = readBlocklyRendererName();
let lastTypeReport: LambdaInferenceReport | null = null;
let activeCodeTarget: 'code' | 'formal' | 'inspector' | 'outline' = 'code';
let lambdaImportTimer: number | undefined;
let applyingCodeEditorText = false;
let suppressCodeEditorSyncUntil = 0;
let selectedBlockId: string | null = null;
let workbenchController: WorkbenchController | null = null;
const inspectorWorkspaces = new WeakSet<Blockly.WorkspaceSvg>();

const LAMBDA_EDITOR_HELP = '-- λ = \\ (you can type \\x. x or λx. x)';

function applyBlocklyRendererStyle(rendererName: BlocklyRendererName): void {
  document.documentElement.dataset.blocklyRenderer = rendererName;
}

applyBlocklyRendererStyle(activeBlocklyRenderer);

const lightTheme = Blockly.Theme.defineTheme('blockLambdaLightTheme', {
  name: 'blockLambdaLightTheme',
  base: Blockly.Themes.Classic,
  fontStyle: {
    family: 'Inter, Geist, system-ui, sans-serif',
    weight: '600',
    size: 9.75
  },
  blockStyles: {
    lambda_term: {
      colourPrimary: '#6341a1',
      colourSecondary: '#4f3481',
      colourTertiary: '#7c5ab5'
    },
    lambda_binding: {
      colourPrimary: '#245ca8',
      colourSecondary: '#1d4986',
      colourTertiary: '#4277bb'
    },
    lambda_grouping: {
      colourPrimary: '#116b64',
      colourSecondary: '#0e5650',
      colourTertiary: '#33847c'
    },
    lambda_literal: {
      colourPrimary: '#7a510d',
      colourSecondary: '#62410a',
      colourTertiary: '#976b25'
    },
    lambda_operator: {
      colourPrimary: '#146b68',
      colourSecondary: '#105653',
      colourTertiary: '#368481'
    },
    lambda_control: {
      colourPrimary: '#87336f',
      colourSecondary: '#6c2959',
      colourTertiary: '#a34f8c'
    },
    lambda_meta: {
      colourPrimary: '#46505f',
      colourSecondary: '#38404c',
      colourTertiary: '#606b7a'
    }
  },
  componentStyles: {
    workspaceBackgroundColour: '#f7f8fa',
    toolboxBackgroundColour: '#f5f7f9',
    toolboxForegroundColour: '#20242b',
    flyoutBackgroundColour: '#ffffff',
    flyoutForegroundColour: '#20242b',
    flyoutOpacity: 1,
    scrollbarColour: '#929aa5',
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
  fontStyle: {
    family: 'Inter, Geist, system-ui, sans-serif',
    weight: '600',
    size: 9.75
  },
  blockStyles: {
    lambda_term: {
      colourPrimary: '#7650b5',
      colourSecondary: '#5e4091',
      colourTertiary: '#906fc6'
    },
    lambda_binding: {
      colourPrimary: '#2e68b7',
      colourSecondary: '#255392',
      colourTertiary: '#4b82c8'
    },
    lambda_grouping: {
      colourPrimary: '#17776e',
      colourSecondary: '#125f58',
      colourTertiary: '#399087'
    },
    lambda_literal: {
      colourPrimary: '#8b5d16',
      colourSecondary: '#6f4a12',
      colourTertiary: '#a57631'
    },
    lambda_operator: {
      colourPrimary: '#18746e',
      colourSecondary: '#135d58',
      colourTertiary: '#3a8d88'
    },
    lambda_control: {
      colourPrimary: '#963f82',
      colourSecondary: '#783268',
      colourTertiary: '#ae5c9b'
    },
    lambda_meta: {
      colourPrimary: '#505a69',
      colourSecondary: '#404854',
      colourTertiary: '#6b7686'
    }
  },
  componentStyles: {
    workspaceBackgroundColour: '#171a20',
    toolboxBackgroundColour: '#1a1d24',
    toolboxForegroundColour: '#f1f3f5',
    flyoutBackgroundColour: '#1d2027',
    flyoutForegroundColour: '#f1f3f5',
    flyoutOpacity: 1,
    scrollbarColour: '#59616c',
    scrollbarOpacity: 0.72,
    insertionMarkerColour: '#c6a0f6',
    insertionMarkerOpacity: 0.34,
    cursorColour: '#91d7e3',
    markerColour: '#8bd5ca'
  }
});

function currentBlocklyTheme(): Blockly.Theme {
  return document.documentElement.dataset.theme === 'dark' ? darkTheme : lightTheme;
}

function injectMainWorkspace(rendererName: BlocklyRendererName): Blockly.WorkspaceSvg {
  return Blockly.inject(blocklyDiv, {
    trashcan: true,
    comments: true,
    contextMenu: true,
    grid: {
      spacing: 24,
      length: 3,
      colour: document.documentElement.dataset.theme === 'light' ? '#c8cfd8' : '#3b424d',
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
    renderer: rendererName,
    theme: currentBlocklyTheme()
  } as Blockly.BlocklyOptions);
}

let workspace = injectMainWorkspace(activeBlocklyRenderer);

const resizeWorkspace = setupWorkspaceAutoResize(() => workspace, blocklyDiv);

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
  const tokenPattern = /(--[^\n]*|\b(?:let|letrec|in|if|then|else|and|or|true|false|fix)\b|[λ\\.()=+\-*/]|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_']*|□|\s+|.)/gu;
  const tokens = code.match(tokenPattern) ?? [];

  return tokens.map((token) => {
    if (/^--/.test(token)) return tokenSpan('syntax-comment', token);
    if (/^\s+$/.test(token)) return escapeHtml(token);
    if (token === '□') return tokenSpan('syntax-hole', token);
    if (/^(?:let|letrec|in|if|then|else|and|or|true|false|fix|[λ\\.()=+\-*/]|\d+(?:\.\d+)?)$/.test(token)) {
      return tokenSpan('syntax-terminal', token);
    }
    if (/^[A-Za-z_][A-Za-z0-9_']*$/.test(token)) {
      return tokenSpan('syntax-nonterminal', token);
    }
    return escapeHtml(token);
  }).join('');
}

function humanizeBlockType(type: string): string {
  return type
    .replace(/^lambda_/, '')
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function renderBlockInspector(): void {
  const block = selectedBlockId ? workspace.getBlockById(selectedBlockId) : null;
  blockInspectorEmpty.hidden = !!block;
  blockInspectorContent.hidden = !block;
  if (!block) return;

  const issues = lastTypeReport?.blockIssues.get(block.id) ?? [];
  inspectorBlockKind.textContent = humanizeBlockType(block.type);
  inspectorBlockId.textContent = block.id;
  inspectorBlockId.title = block.id;
  inspectorBlockTerm.textContent = lambdaTermText(block);
  inspectorBlockTerm.title = inspectorBlockTerm.textContent;
  inspectorBlockType.textContent = lastTypeReport?.blockTypes.get(block.id) ?? 'unknown';
  inspectorBlockStatus.textContent = issues.length === 0 ? 'Type inference succeeded' : `${issues.length} issue${issues.length === 1 ? '' : 's'}`;
  inspectorBlockStatus.dataset.state = issues.length === 0 ? 'ok' : 'error';
  inspectorBlockIssues.hidden = issues.length === 0;
  inspectorBlockIssues.replaceChildren(...issues.map((message) => {
    const issue = document.createElement('div');
    issue.textContent = message;
    return issue;
  }));
}

function focusOutlineBlock(blockId: string): void {
  const target = workspace.getBlockById(blockId) as Blockly.BlockSvg | null;
  if (!target) return;
  workspace.centerOnBlock(target.id, true);
  Blockly.common.setSelected(target);
}

function renderOutline(): void {
  programOutline.replaceChildren();

  const topBlocks = workspace.getTopBlocks(true);
  if (topBlocks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'outline-empty';
    empty.textContent = 'The workspace has no blocks.';
    programOutline.appendChild(empty);
    return;
  }

  const addBlock = (block: Blockly.Block, depth: number): void => {
    const children = block.getChildren(true);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'outline-item';
    item.dataset.blockId = block.id;
    item.style.setProperty('--outline-depth', String(depth));
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-level', String(depth + 1));

    const disclosure = document.createElement('span');
    disclosure.className = 'outline-disclosure';
    disclosure.textContent = children.length > 0 ? '⌄' : '·';
    disclosure.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'outline-label';
    const blockText = block.toString(54, '…');
    label.textContent = blockText.replace(/\s+/g, ' ').trim() || block.type;

    const type = document.createElement('span');
    type.className = 'outline-type';
    type.textContent = humanizeBlockType(block.type);

    item.append(disclosure, label, type);
    item.addEventListener('click', () => focusOutlineBlock(block.id));
    programOutline.appendChild(item);
    children.forEach((child) => addBlock(child, depth + 1));
  };

  topBlocks.forEach((block) => addBlock(block, 0));
}

function printDerivation(): void {
  if (activeCodeTarget !== 'formal') return;
  const originalHtml = codeOutput.innerHTML;

  // Chromium does not fragment <fieldset>'s special internal layout across
  // printed pages reliably. Swap in ordinary elements with the same classes
  // for print layout, then restore the generated derivation DOM afterward.
  const replaceElement = (element: HTMLElement, tag: 'div'): HTMLElement => {
    const replacement = document.createElement(tag);
    for (const attribute of Array.from(element.attributes)) {
      replacement.setAttribute(attribute.name, attribute.value);
    }
    while (element.firstChild) replacement.appendChild(element.firstChild);
    element.replaceWith(replacement);
    return replacement;
  };
  for (const legend of Array.from(codeOutput.querySelectorAll<HTMLElement>('legend.legend-lambda'))) {
    replaceElement(legend, 'div');
  }
  for (const fieldset of Array.from(codeOutput.querySelectorAll<HTMLElement>('fieldset.fieldset-lambda'))) {
    replaceElement(fieldset, 'div');
  }

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('afterprint', cleanup);
    document.documentElement.classList.remove('printing-derivation');
    document.body.classList.remove('printing-derivation');
    codeOutput.innerHTML = originalHtml;
  };
  document.documentElement.classList.add('printing-derivation');
  document.body.classList.add('printing-derivation');
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
  // `print()` blocks in interactive browsers; this fallback covers cancelled
  // and headless print calls where `afterprint` may not fire.
  window.setTimeout(cleanup, 0);
}

function installCurrentWorkspaceInspector(): void {
  if (inspectorWorkspaces.has(workspace)) return;
  inspectorWorkspaces.add(workspace);
  workspace.addChangeListener((event) => {
    if (event.type === Blockly.Events.SELECTED) {
      const selected = event as Blockly.Events.Selected;
      selectedBlockId = selected.newElementId && workspace.getBlockById(selected.newElementId)
        ? selected.newElementId
        : null;
      renderBlockInspector();
      return;
    }
    if (selectedBlockId && !workspace.getBlockById(selectedBlockId)) {
      selectedBlockId = null;
      renderBlockInspector();
    }
  });
}

function renderCodeTargetTabs(): void {
  const showingCodeEditor = activeCodeTarget === 'code';
  const showingInspector = activeCodeTarget === 'inspector';
  const showingOutline = activeCodeTarget === 'outline';
  const showingFormal = activeCodeTarget === 'formal';
  const showingTypes = showingInspector || showingFormal;
  for (const button of codeTargetButtons) {
    const selected = button.id === 'codeTargetInspector'
      ? showingTypes
      : button.dataset.codeTarget === activeCodeTarget;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  typeTargetOverview.setAttribute('aria-selected', String(showingInspector));
  typeTargetOverview.tabIndex = showingInspector ? 0 : -1;
  typesPane.hidden = !showingTypes;
  codeOutput.hidden = !showingFormal;
  lambdaEditorPane.hidden = !showingCodeEditor;
  blockInspectorPane.hidden = !showingInspector;
  outlinePane.hidden = !showingOutline;
  synchronizeCodeButton.hidden = !showingCodeEditor;
  copyCodeButton.hidden = !(showingCodeEditor || showingFormal);
  printDerivationButton.hidden = !showingFormal;
}

function renderGeneratedOutput(report: LambdaInferenceReport): void {
  renderCodeTargetTabs();

  if (activeCodeTarget === 'inspector') {
    renderBlockInspector();
    return;
  }

  if (activeCodeTarget === 'outline') {
    renderOutline();
    return;
  }

  if (activeCodeTarget === 'formal') {
    const formalization = generateLambdaFormalization(workspace, report);
    codeOutput.dataset.rawCode = formalization.text;
    codeOutput.classList.add('formal-output');
    codeOutput.innerHTML = formalization.html;
    return;
  }

  if (!applyingCodeEditorText && Date.now() >= suppressCodeEditorSyncUntil) {
    syncLambdaEditorFromWorkspace();
  }
  codeOutput.dataset.rawCode = lambdaEditor.value;
  codeOutput.classList.remove('formal-output');
}

function generatedEditableLambdaCode(): string {
  const code = generateLambdaCode(workspace);
  const editableCode = code.startsWith('-- ') ? '' : code.replace(/λ/g, '\\');
  return editableCode ? `${LAMBDA_EDITOR_HELP}\n${editableCode}` : `${LAMBDA_EDITOR_HELP}\n`;
}

function syncLambdaEditorHighlightScroll(): void {
  lambdaEditorHighlight.scrollLeft = lambdaEditor.scrollLeft;
  lambdaEditorHighlight.scrollTop = lambdaEditor.scrollTop;
  lambdaEditorGutter.scrollTop = lambdaEditor.scrollTop;
}

function updateLambdaEditorHighlight(): void {
  lambdaEditorHighlight.innerHTML = highlightLambdaCode(lambdaEditor.value) || '&nbsp;';
  const totalLines = Math.max(lambdaEditor.value.split('\n').length, 5);
  lambdaEditorGutter.innerHTML = Array.from(
    { length: totalLines },
    (_, index) => `<span>${index + 1}</span>`
  ).join('');
  syncLambdaEditorHighlightScroll();
}

function hasLambdaEditorExpression(text: string): boolean {
  return text
    .split(/\r?\n/)
    .some((line) => line.replace(/--.*$/, '').trim().length > 0);
}

function setLambdaEditorStatus(message: string, state: 'idle' | 'ok' | 'error' = 'idle'): void {
  lambdaEditorStatus.textContent = message;
  if (state === 'idle') {
    lambdaEditorStatus.removeAttribute('data-state');
  } else {
    lambdaEditorStatus.dataset.state = state;
  }
}

function syncLambdaEditorFromWorkspace(): void {
  lambdaEditor.value = generatedEditableLambdaCode();
  codeOutput.dataset.rawCode = lambdaEditor.value;
  updateLambdaEditorHighlight();
  setLambdaEditorStatus(lambdaEditor.value.trim() ? 'Synchronized from workspace.' : '', 'idle');
}

function resetLambdaEditorSyncGuard(): void {
  if (lambdaImportTimer !== undefined) {
    window.clearTimeout(lambdaImportTimer);
    lambdaImportTimer = undefined;
  }
  applyingCodeEditorText = false;
  suppressCodeEditorSyncUntil = 0;
}

function activateCodeTarget(target: 'code' | 'formal' | 'inspector' | 'outline'): void {
  activeCodeTarget = target;
  if (target === 'code') {
    syncLambdaEditorFromWorkspace();
    window.setTimeout(() => lambdaEditor.focus(), 0);
  } else {
    if (lambdaImportTimer !== undefined) {
      window.clearTimeout(lambdaImportTimer);
      lambdaImportTimer = undefined;
    }
    if (target === 'inspector') renderBlockInspector();
    if (target === 'outline') renderOutline();
  }
  renderCodeTargetTabs();
  refreshCode(lastTypeReport ?? annotateLambdaWorkspaceTypes(workspace));
  setStatus(target === 'formal'
    ? 'Showing the typing derivation.'
    : target === 'inspector'
      ? 'Showing inferred types and selected-block type details.'
      : target === 'outline'
        ? 'Showing the program outline.'
        : 'Editing Lambda code.');
}

function synchronizeCodeFromWorkspace(): void {
  resetLambdaEditorSyncGuard();
  activeCodeTarget = 'code';
  syncLambdaEditorFromWorkspace();
  renderCodeTargetTabs();
  window.setTimeout(() => lambdaEditor.focus(), 0);
  setStatus('Lambda code synchronized from the workspace.');
}

function setTopSaveStatus(label: string, state: 'saved' | 'pending' | 'error' = 'saved'): void {
  topSaveStatus.dataset.state = state;
  const labelElement = topSaveStatus.querySelector<HTMLElement>('span:last-child');
  if (labelElement) labelElement.textContent = label;
  topSaveStatus.title = label;
}

function setStatus(message: string): void {
  statusLine.textContent = message;
  const normalized = message.toLocaleLowerCase();
  const tone = /could not|error|invalid|failed/.test(normalized)
    ? 'error'
    : /cancelled|missing|problem/.test(normalized)
      ? 'warning'
      : /saved|loaded|ready|synchronized|converted|refreshed|set to/.test(normalized)
        ? 'success'
        : 'info';
  workbenchController?.appendOutput(message, tone);
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
  topbarFileName.textContent = fileName ?? 'Untitled workspace';
  topbarFileName.title = fileName ?? 'Untitled workspace';
  projectFileLabel.textContent = fileName ?? currentWorkspaceFileName;
  projectFileLabel.title = fileName ?? currentWorkspaceFileName;
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

function askForSaveFileName(): Promise<string | null> {
  const dialog = document.getElementById('saveNameDialog') as HTMLDialogElement | null;
  const input = document.getElementById('saveNameInput') as HTMLInputElement | null;
  const suggestedName = (currentWorkspaceFileName || 'block-lambda-workspace.blc').replace(/\.blc$/i, '');
  if (!dialog || typeof dialog.showModal !== 'function' || !input) {
    return Promise.resolve(normalizeBlcFilename(suggestedName));
  }
  input.value = suggestedName;
  return new Promise<string | null>((resolve) => {
    const onClose = (): void => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'save' ? normalizeBlcFilename(input.value) : null);
    };
    dialog.addEventListener('close', onClose);
    dialog.returnValue = 'cancel';
    dialog.showModal();
    input.select();
  });
}

function updateAutosaveIntervalUi(): void {
  autosaveInterval.value = String(autosaveIntervalMinutes);
  autosaveIntervalLabel.textContent = formatAutosaveInterval(autosaveIntervalMinutes);
  autosaveInterval.title = `Autosave interval: ${formatAutosaveInterval(autosaveIntervalMinutes)}`;
}

function updateBlockCount(): void {
  blockCount.textContent = String(workspace.getAllBlocks(false).length);
}

function refreshCode(report = annotateLambdaWorkspaceTypes(workspace)): LambdaInferenceReport {
  lastTypeReport = report;
  renderGeneratedOutput(report);
  syncTypeInfoComments(workspace, report);
  workbenchController?.renderDiagnostics(report);
  renderBlockInspector();
  renderOutline();
  updateBlockCount();
  updateZoomLabel();
  return report;
}

function refreshAfterInference(report: LambdaInferenceReport): void {
  const refreshed = refreshCode(report);
  if (refreshed.hasErrors) setStatus(refreshed.summary);
  scheduleAutosave();
}

function installCurrentWorkspaceInferenceDriver(): void {
  installLambdaInferenceDriver(workspace, {
    onViewport: updateZoomLabel,
    onSettled: (report) => refreshAfterInference(report),
    onPassiveMove: scheduleAutosave
  });
}

function renderCurrentToolbox(): void {
  blockToolboxContent.querySelector('.custom-toolbox-list')?.remove();
  renderToolbox(blockToolboxContent, workspace, blocklyDiv);
}

function clearWorkspace(): void {
  resetLambdaEditorSyncGuard();
  setVisualizationOpen(false);
  workspace.clear();
  currentWorkspaceFileName = 'block-lambda-workspace.blc';
  setWorkspaceTitle();
  const report = runLambdaInferenceToFixpoint(workspace, 'clear-workspace');
  refreshCode(report);
  resizeWorkspace();
  setStatus(`Workspace cleared. ${report.summary}`);
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
  askForSaveFileName().then((fileName) => {
    if (!fileName) {
      setStatus('Save cancelled.');
      return;
    }
    writeWorkspaceFile(fileName);
  });
}

function writeWorkspaceFile(fileName: string): void {
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
    setTopSaveStatus('Saved locally', 'saved');

    if (announce) {
      setStatus(`Autosaved locally at ${savedAtLabel}.`);
    }
  } catch (error) {
    console.error(error);
    setTopSaveStatus('Autosave failed', 'error');
    setStatus('Could not autosave to local storage.');
  }
}

let autosaveTimer: number | undefined;

function scheduleAutosave(): void {
  if (autosaveTimer !== undefined) {
    window.clearTimeout(autosaveTimer);
  }

  const delayMs = autosaveIntervalMinutes * 60 * 1000;
  setTopSaveStatus('Autosave pending', 'pending');
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
    resetLambdaEditorSyncGuard();
    setVisualizationOpen(false);
    workspace.clear();
    Blockly.serialization.workspaces.load(workspaceState, workspace);
    currentWorkspaceFileName = normalizeBlcFilename(file.name);
    setWorkspaceTitle(currentWorkspaceFileName);
    saveWorkspaceToAutosave(false);
    const report = runLambdaInferenceToFixpoint(workspace, 'load-workspace');
    refreshCode(report);
    resizeWorkspace();
    setStatus(`Loaded workspace from ${file.name}. Local autosave updated. ${report.summary}`);
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
    resetLambdaEditorSyncGuard();
    setVisualizationOpen(false);
    workspace.clear();
    Blockly.serialization.workspaces.load(workspaceState, workspace);
    currentWorkspaceFileName = 'autosave-recovery.blc';
    setWorkspaceTitle(currentWorkspaceFileName);
    const report = runLambdaInferenceToFixpoint(workspace, 'load-autosave');
    refreshCode(report);
    resizeWorkspace();
    const savedAtText = savedAt ? ` from ${new Date(savedAt).toLocaleString()}` : '';
    setStatus(`Loaded local autosave${savedAtText}. ${report.summary}`);
  } catch (error) {
    console.error(error);
    setStatus('Could not load the local autosave. The saved data may be invalid.');
  }
}

type ExampleLoadChoice = 'replace' | 'merge' | 'cancel';

function askExampleLoadChoice(exampleId: LambdaExampleId): Promise<ExampleLoadChoice> {
  const dialog = document.getElementById('exampleLoadDialog') as HTMLDialogElement | null;
  if (!dialog || typeof dialog.showModal !== 'function') return Promise.resolve('replace');
  const example = getLambdaExample(exampleId);
  const name = document.getElementById('exampleLoadName');
  if (name) name.textContent = example.title;
  return new Promise<ExampleLoadChoice>((resolve) => {
    const onClose = (): void => {
      dialog.removeEventListener('close', onClose);
      const value = dialog.returnValue;
      resolve(value === 'replace' || value === 'merge' ? value : 'cancel');
    };
    dialog.addEventListener('close', onClose);
    dialog.returnValue = 'cancel';
    dialog.showModal();
  });
}

function appendLambdaExample(exampleId: LambdaExampleId): void {
  const example = getLambdaExample(exampleId);
  for (const block of example.workspace.blocks.blocks) {
    Blockly.serialization.blocks.append(block as Blockly.serialization.blocks.State, workspace);
  }
}

function applyExampleLoad(exampleId: LambdaExampleId, choice: ExampleLoadChoice): void {
  if (choice === 'cancel') return;
  try {
    resetLambdaEditorSyncGuard();
    setVisualizationOpen(false);
    const example = getLambdaExample(exampleId);
    if (choice === 'merge') appendLambdaExample(exampleId);
    else loadLambdaExample(workspace, exampleId);
    currentWorkspaceFileName = example.fileName;
    setWorkspaceTitle(currentWorkspaceFileName);
    saveWorkspaceToAutosave(false);
    const report = runLambdaInferenceToFixpoint(workspace, 'load-example');
    refreshCode(report);
    resizeWorkspace();
    setStatus(`Loaded example: ${example.title}. ${report.summary}`);
  } catch (error) {
    console.error(error);
    setStatus('Could not load the selected example.');
  }
}

function loadExampleWorkspace(exampleId: LambdaExampleId): void {
  if (workspace.getAllBlocks(false).length === 0) {
    applyExampleLoad(exampleId, 'replace');
    return;
  }
  askExampleLoadChoice(exampleId).then((choice) => applyExampleLoad(exampleId, choice));
}

function blocklyRendererLabel(rendererName: BlocklyRendererName): string {
  if (rendererName === ZELOS_RENDERER_NAME) return 'Zelos';
  if (rendererName === THRASOS_RENDERER_NAME) return 'Thrasos';
  return 'Tude';
}

function renderBlocklyRendererMenu(): void {
  applyBlocklyRendererStyle(activeBlocklyRenderer);

  for (const button of blocklyRendererButtons) {
    const rendererName = button.dataset.blocklyRenderer;
    button.setAttribute('aria-checked', String(rendererName === activeBlocklyRenderer));
  }

  blocklyThemeMenuButton.title = `Blockly theme: ${blocklyRendererLabel(activeBlocklyRenderer)}`;
}

function closeBlocklyThemeMenu(): void {
  blocklyThemeSubMenu.hidden = true;
  blocklyThemeMenuButton.setAttribute('aria-expanded', 'false');
}

function toggleBlocklyThemeMenu(): void {
  const willOpen = blocklyThemeSubMenu.hidden;
  blocklyThemeSubMenu.hidden = !willOpen;
  blocklyThemeMenuButton.setAttribute('aria-expanded', String(willOpen));
}

function setBlocklyRenderer(rendererName: BlocklyRendererName): void {
  closeBlocklyThemeMenu();
  if (rendererName === activeBlocklyRenderer) {
    setStatus(`Blockly theme already set to ${blocklyRendererLabel(rendererName)}.`);
    return;
  }

  const workspaceState = Blockly.serialization.workspaces.save(workspace);
  const scale = workspace.getScale();
  const blocklyParent = blocklyDiv.parentElement;

  activeBlocklyRenderer = rendererName;
  applyBlocklyRendererStyle(activeBlocklyRenderer);
  window.localStorage.setItem(BLOCKLY_RENDERER_STORAGE_KEY, rendererName);
  setVisualizationOpen(false);
  disposeVisualizationWorkspaces();

  Blockly.Events.disable();
  try {
    workspace.dispose();
    if (blocklyParent && !blocklyDiv.isConnected) blocklyParent.appendChild(blocklyDiv);
    blocklyDiv.innerHTML = '';

    workspace = injectMainWorkspace(activeBlocklyRenderer);
    Blockly.serialization.workspaces.load(workspaceState, workspace);
    workspace.setScale(scale);
  } finally {
    Blockly.Events.enable();
  }

  renderCurrentToolbox();
  installCurrentWorkspaceInferenceDriver();
  selectedBlockId = null;
  installCurrentWorkspaceInspector();
  renderBlocklyRendererMenu();

  const report = runLambdaInferenceToFixpoint(workspace, 'renderer-change');
  refreshCode(report);
  resizeWorkspace();
  setStatus(`Blockly theme set to ${blocklyRendererLabel(rendererName)}. ${report.summary}`);
}

function installBlocklyThemeMenu(): void {
  blocklyThemeMenuButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleBlocklyThemeMenu();
  });

  for (const button of blocklyRendererButtons) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const rendererName = button.dataset.blocklyRenderer ?? null;
      if (!isBlocklyRendererName(rendererName)) return;
      setBlocklyRenderer(rendererName);
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!blocklyThemeMenuButton.contains(target) && !blocklyThemeSubMenu.contains(target)) closeBlocklyThemeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeBlocklyThemeMenu();
  });

  renderBlocklyRendererMenu();
}

// Signature of the term structure only (block positions are irrelevant),
// used to detect editor input that would rebuild an identical workspace.
function logicalSignature(state: LambdaWorkspaceState): string {
  return JSON.stringify(state.blocks.blocks.map(({ x, y, ...logical }) => logical));
}

function workspaceLogicalSignature(): string | null {
  try {
    return logicalSignature(parseLambdaTextToWorkspaceState(generateLambdaCode(workspace)));
  } catch {
    return null;
  }
}

function applyLambdaTextToWorkspace(): void {
  const source = lambdaEditor.value.trim();
  codeOutput.dataset.rawCode = lambdaEditor.value;

  if (!hasLambdaEditorExpression(source)) {
    setLambdaEditorStatus('', 'idle');
    return;
  }

  try {
    const workspaceState = parseLambdaTextToWorkspaceState(source);
    const topBlockCount = workspaceState.blocks.blocks.length;
    const blockLabel = topBlockCount === 1 ? 'term' : 'terms';

    // Whitespace, comment, or formatting edits parse to the same structure;
    // skip the rebuild to keep block ids, undo history, and layout intact.
    if (logicalSignature(workspaceState) === workspaceLogicalSignature()) {
      setLambdaEditorStatus(`Workspace already matches (${topBlockCount} ${blockLabel}).`, 'ok');
      return;
    }
    suppressCodeEditorSyncUntil = Date.now() + 1500;
    applyingCodeEditorText = true;
    let report: LambdaInferenceReport;
    try {
      setVisualizationOpen(false);
      workspace.clear();
      Blockly.serialization.workspaces.load(workspaceState, workspace);
      workspace.cleanUp();
      currentWorkspaceFileName = 'lambda-text.blc';
      setWorkspaceTitle(currentWorkspaceFileName);
      saveWorkspaceToAutosave(false);
      report = runLambdaInferenceToFixpoint(workspace, 'lambda-text-import');
      refreshCode(report);
    } finally {
      applyingCodeEditorText = false;
    }
    resizeWorkspace();
    setLambdaEditorStatus(`Converted ${topBlockCount} ${blockLabel}.`, 'ok');
    setStatus(`Converted Lambda text to workspace blocks. ${report.summary}`);
  } catch (error) {
    const message = error instanceof LambdaTextParseError ? error.message : 'Could not parse Lambda text.';
    setLambdaEditorStatus(message, 'error');
    setStatus(message);
  }
}

function scheduleLambdaTextImport(): void {
  if (lambdaImportTimer !== undefined) window.clearTimeout(lambdaImportTimer);
  codeOutput.dataset.rawCode = lambdaEditor.value;
  updateLambdaEditorHighlight();
  setLambdaEditorStatus(hasLambdaEditorExpression(lambdaEditor.value) ? 'Parsing...' : '', 'idle');
  lambdaImportTimer = window.setTimeout(() => {
    lambdaImportTimer = undefined;
    applyLambdaTextToWorkspace();
  }, 450);
}

registerIdeLayoutResizeListener(syncLambdaEditorHighlightScroll);
renderCurrentToolbox();
const panelControls = setupPanelControls(() => workspace, {
  lightTheme,
  darkTheme,
  onRefreshCode: () => {
    const report = runLambdaInferenceToFixpoint(workspace, 'manual-refresh');
    refreshCode(report);
    setStatus(`Output refreshed. ${report.summary}`);
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
  getRendererName: () => activeBlocklyRenderer,
  getMainWorkspace: () => workspace,
  onResize: resizeWorkspace
});

workbenchController = initWorkbench({
  getWorkspace: () => workspace,
  panels: panelControls,
  synchronizeCode: synchronizeCodeFromWorkspace
});

installExampleMenu(examplesMenuButton, examplesSubMenu, loadExampleWorkspace);
installBlocklyThemeMenu();

for (const button of codeTargetButtons) {
  button.addEventListener('click', () => {
    const target = button.dataset.codeTarget;
    if (target !== 'code' && target !== 'formal' && target !== 'inspector' && target !== 'outline') return;
    activateCodeTarget(target);
  });
}

typeTargetOverview.addEventListener('click', () => activateCodeTarget('inspector'));

document.querySelector<HTMLElement>('.code-tabs')?.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
  const currentIndex = primaryCodeTargetButtons.indexOf(document.activeElement as HTMLButtonElement);
  if (currentIndex < 0) return;
  event.preventDefault();
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? primaryCodeTargetButtons.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + primaryCodeTargetButtons.length) % primaryCodeTargetButtons.length;
  primaryCodeTargetButtons[nextIndex].focus();
  primaryCodeTargetButtons[nextIndex].click();
});

document.querySelector<HTMLElement>('.type-tabs')?.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
  const buttons = [typeTargetOverview, requireElement<HTMLButtonElement>('codeTargetFormal')];
  const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (currentIndex < 0) return;
  event.preventDefault();
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? buttons.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[nextIndex].focus();
  buttons[nextIndex].click();
});

printDerivationButton.addEventListener('click', printDerivation);

lambdaEditor.addEventListener('input', scheduleLambdaTextImport);
lambdaEditor.addEventListener('scroll', syncLambdaEditorHighlightScroll);
updateLambdaEditorHighlight();

autosaveInterval.addEventListener('input', () => {
  autosaveIntervalMinutes = clampAutosaveInterval(Number(autosaveInterval.value));
  window.localStorage.setItem(AUTOSAVE_INTERVAL_STORAGE_KEY, String(autosaveIntervalMinutes));
  updateAutosaveIntervalUi();
  if (autosaveTimer !== undefined) {
    scheduleAutosave();
  }
  setStatus(`Autosave interval set to ${formatAutosaveInterval(autosaveIntervalMinutes)}.`);
});

installCurrentWorkspaceInferenceDriver();
installCurrentWorkspaceInspector();

window.addEventListener('block-lambda:refresh-code', () => {
  const report = runLambdaInferenceToFixpoint(workspace, 'external-refresh');
  refreshCode(report);
});
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
renderCodeTargetTabs();
setWorkspaceTitle();
const initialReport = runLambdaInferenceToFixpoint(workspace, 'initial-load');
refreshCode(initialReport);
saveWorkspaceToAutosave(false);
resizeWorkspace();
setStatus(`Ready. Drag blocks from the toolbox, load a .blc file, or recover a local autosave. ${initialReport.summary}`);
