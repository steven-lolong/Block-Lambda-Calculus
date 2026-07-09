import * as Blockly from 'blockly';
import { openVisualization } from './visualizationPanel';
import { showTypeInfoForBlock } from './typeInfoPopup';
import { downloadScreenshot } from './screenshot';

type LambdaContextMenuAction = 'type-info' | 'structure' | 'value';
type BlockScope = { block?: Blockly.BlockSvg };
type WorkspaceScope = { workspace?: Blockly.WorkspaceSvg };
type LambdaContextMenuEvent = CustomEvent<{
  action: LambdaContextMenuAction;
  block?: Blockly.BlockSvg;
}>;
const ScopeType = Blockly.ContextMenuRegistry.ScopeType;
type Item = Blockly.ContextMenuRegistry.RegistryItem;
type RegistryWithOptionalLookup = {
  register: (item: Item) => void;
  getItem?: (id: string) => unknown;
};

let registered = false;
let eventBridgeRegistered = false;
let fallbackMenu: HTMLDivElement | null = null;
const fallbackWorkspaces = new WeakSet<Blockly.WorkspaceSvg>();

function show(when: boolean): 'enabled' | 'hidden' {
  return when ? 'enabled' : 'hidden';
}

function isLambdaTermBlock(block?: Blockly.Block | null): block is Blockly.BlockSvg {
  return Boolean(block?.outputConnection) && Boolean(block?.type.startsWith('lambda_')) && block?.type !== 'lambda_viz_description';
}

function isLambdaApplicationBlock(block?: Blockly.Block | null): block is Blockly.BlockSvg {
  return isLambdaTermBlock(block) && block.type === 'lambda_application';
}

function workspaceOf(block: Blockly.BlockSvg): Blockly.WorkspaceSvg {
  return block.workspace as Blockly.WorkspaceSvg;
}

function runContextAction(action: LambdaContextMenuAction, block?: Blockly.BlockSvg): void {
  if (action === 'type-info') {
    if (isLambdaTermBlock(block)) showTypeInfoForBlock(workspaceOf(block), block);
    return;
  }
  if (isLambdaApplicationBlock(block)) openVisualization(action, block);
}

function installPerBlockContextMenuBridge(): void {
  if (eventBridgeRegistered) return;
  eventBridgeRegistered = true;
  window.addEventListener('block-lambda:context-menu-action', (event) => {
    const detail = (event as LambdaContextMenuEvent).detail;
    runContextAction(detail.action, detail.block);
  });
}

function hideFallbackContextMenu(): void {
  if (!fallbackMenu) return;
  fallbackMenu.hidden = true;
  fallbackMenu.innerHTML = '';
}

function ensureFallbackContextMenu(): HTMLDivElement {
  if (fallbackMenu) return fallbackMenu;
  fallbackMenu = document.createElement('div');
  fallbackMenu.className = 'block-lambda-context-menu';
  fallbackMenu.hidden = true;
  fallbackMenu.setAttribute('role', 'menu');
  Object.assign(fallbackMenu.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    zIndex: '100000',
    minWidth: '230px',
    padding: '7px',
    border: '1px solid rgba(183, 189, 248, 0.38)',
    borderRadius: '14px',
    background: 'rgba(30, 32, 48, 0.98)',
    boxShadow: '0 20px 52px rgba(0, 0, 0, 0.38)',
    backdropFilter: 'blur(14px)'
  });
  document.body.appendChild(fallbackMenu);

  document.addEventListener('pointerdown', (event) => {
    if (!fallbackMenu || fallbackMenu.hidden) return;
    const target = event.target;
    if (target instanceof Node && fallbackMenu.contains(target)) return;
    hideFallbackContextMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideFallbackContextMenu();
  });

  window.addEventListener('resize', hideFallbackContextMenu);
  window.addEventListener('blur', hideFallbackContextMenu);
  return fallbackMenu;
}

function appendFallbackMenuButton(
  menu: HTMLDivElement,
  label: string,
  action: LambdaContextMenuAction,
  block: Blockly.BlockSvg
): void {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'block-lambda-context-menu-item';
  item.setAttribute('role', 'menuitem');
  item.textContent = label;
  Object.assign(item.style, {
    display: 'block',
    width: '100%',
    padding: '9px 11px',
    color: '#cad3f5',
    border: '0',
    borderRadius: '10px',
    background: 'transparent',
    cursor: 'pointer',
    font: '600 13px Inter, ui-sans-serif, system-ui, sans-serif',
    textAlign: 'left',
    whiteSpace: 'nowrap'
  });
  item.addEventListener('pointerenter', () => {
    item.style.background = 'rgba(198, 160, 246, 0.18)';
  });
  item.addEventListener('pointerleave', () => {
    item.style.background = 'transparent';
  });
  item.addEventListener('click', () => {
    hideFallbackContextMenu();
    runContextAction(action, block);
  });
  menu.appendChild(item);
}

function positionFallbackMenu(menu: HTMLDivElement, clientX: number, clientY: number): void {
  menu.hidden = false;
  menu.style.left = '0px';
  menu.style.top = '0px';
  const rect = menu.getBoundingClientRect();
  const left = Math.min(clientX, window.innerWidth - rect.width - 8);
  const top = Math.min(clientY, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function blockFromContextMenuEvent(workspace: Blockly.WorkspaceSvg, event: MouseEvent): Blockly.BlockSvg | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const blockRoot = target.closest<SVGElement>('[data-id]');
  const blockId = blockRoot?.getAttribute('data-id');
  if (!blockId) return null;
  const block = workspace.getBlockById(blockId) as Blockly.BlockSvg | null;
  return isLambdaTermBlock(block) ? block : null;
}

function showFallbackContextMenu(workspace: Blockly.WorkspaceSvg, event: MouseEvent): void {
  const block = blockFromContextMenuEvent(workspace, event);
  if (!block) return;

  event.preventDefault();
  event.stopPropagation();

  const menu = ensureFallbackContextMenu();
  menu.innerHTML = '';
  appendFallbackMenuButton(menu, 'Show Type and Value', 'type-info', block);

  if (isLambdaApplicationBlock(block)) {
    appendFallbackMenuButton(menu, 'Evaluate - Call-by-Structure', 'structure', block);
    appendFallbackMenuButton(menu, 'Evaluate - Call-by-Value', 'value', block);
  }

  positionFallbackMenu(menu, event.clientX, event.clientY);
}

export function installLambdaContextMenuFallback(workspace: Blockly.WorkspaceSvg): void {
  if (fallbackWorkspaces.has(workspace)) return;
  fallbackWorkspaces.add(workspace);
  const parentSvg = (workspace as any).getParentSvg?.() as SVGSVGElement | undefined;
  const injectionDiv = (workspace as any).getInjectionDiv?.() as HTMLElement | undefined;
  const target = parentSvg ?? injectionDiv;
  target?.addEventListener('contextmenu', (event) => showFallbackContextMenu(workspace, event as MouseEvent), true);
}

function isContextMenuRegistered(registry: RegistryWithOptionalLookup, id: string): boolean {
  if (typeof registry.getItem !== 'function') return false;
  return !!registry.getItem(id);
}

export function registerLambdaContextMenus(): void {
  installPerBlockContextMenuBridge();
  if (registered) return;
  registered = true;

  const registry = Blockly.ContextMenuRegistry.registry as RegistryWithOptionalLookup;
  const items: Item[] = [
    {
      id: 'lambdaShowTypeAndValue',
      scopeType: ScopeType.BLOCK,
      displayText: 'Show Type and Value',
      weight: 96,
      preconditionFn: (scope: BlockScope) => show(isLambdaTermBlock(scope.block)),
      callback: (scope: BlockScope) => runContextAction('type-info', scope.block)
    },
    {
      id: 'lambdaVizCallByStructure',
      scopeType: ScopeType.BLOCK,
      displayText: 'Evaluate - Call-by-Structure',
      weight: 100,
      preconditionFn: (scope: BlockScope) => show(isLambdaApplicationBlock(scope.block)),
      callback: (scope: BlockScope) => runContextAction('structure', scope.block)
    },
    {
      id: 'lambdaVizCallByValue',
      scopeType: ScopeType.BLOCK,
      displayText: 'Evaluate - Call-by-Value',
      weight: 101,
      preconditionFn: (scope: BlockScope) => show(isLambdaApplicationBlock(scope.block)),
      callback: (scope: BlockScope) => runContextAction('value', scope.block)
    },
    {
      // Download the workspace's blocks as a PNG. WORKSPACE scope, so it appears on the
      // workspace background (the per-block fallback menu leaves background clicks to the
      // native menu) and on any visualization workspace.
      id: 'lambdaDownloadScreenshot',
      scopeType: ScopeType.WORKSPACE,
      displayText: 'Download Screenshot',
      weight: 99,
      preconditionFn: (scope: WorkspaceScope) =>
        show(!!(scope.workspace && scope.workspace.getTopBlocks(false).length > 0)),
      callback: (scope: WorkspaceScope) => {
        const ws = scope.workspace ?? (Blockly.getMainWorkspace() as Blockly.WorkspaceSvg);
        if (ws) downloadScreenshot(ws);
      }
    }
  ];

  for (const item of items) {
    if (!isContextMenuRegistered(registry, item.id)) registry.register(item);
  }
}
