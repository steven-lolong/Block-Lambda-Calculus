import * as Blockly from 'blockly';
import { openVisualization } from './visualizationPanel';
import { showTypeInfoForBlock } from './typeInfoPopup';

type BlockScope = { block?: Blockly.BlockSvg };
type LambdaContextMenuEvent = CustomEvent<{
  action: 'type-info' | 'structure' | 'value';
  block?: Blockly.BlockSvg;
}>;
const ScopeType = Blockly.ContextMenuRegistry.ScopeType;
type Item = Blockly.ContextMenuRegistry.RegistryItem;

let registered = false;
let eventBridgeRegistered = false;

function show(when: boolean): 'enabled' | 'hidden' {
  return when ? 'enabled' : 'hidden';
}

function isLambdaTermBlock(block?: Blockly.Block): block is Blockly.BlockSvg {
  return Boolean(block?.outputConnection) && Boolean(block?.type.startsWith('lambda_')) && block?.type !== 'lambda_viz_description';
}

function isLambdaApplicationBlock(block?: Blockly.Block): block is Blockly.BlockSvg {
  return isLambdaTermBlock(block) && block.type === 'lambda_application';
}

function workspaceOf(block: Blockly.BlockSvg): Blockly.WorkspaceSvg {
  return block.workspace as Blockly.WorkspaceSvg;
}

function runContextAction(action: 'type-info' | 'structure' | 'value', block?: Blockly.BlockSvg): void {
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

export function registerLambdaContextMenus(): void {
  installPerBlockContextMenuBridge();
  if (registered) return;
  registered = true;

  const registry = Blockly.ContextMenuRegistry.registry;
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
    }
  ];

  for (const item of items) {
    if (!registry.getItem(item.id)) registry.register(item);
  }
}
