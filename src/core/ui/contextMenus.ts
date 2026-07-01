import * as Blockly from 'blockly';
import { openVisualization } from './visualizationPanel';
import { showTypeInfoForBlock } from './typeInfoPopup';

type BlockScope = { block?: Blockly.BlockSvg };
const ScopeType = Blockly.ContextMenuRegistry.ScopeType;
type Item = Blockly.ContextMenuRegistry.RegistryItem;

let registered = false;

function show(when: boolean): 'enabled' | 'hidden' {
  return when ? 'enabled' : 'hidden';
}

function isLambdaTermBlock(block?: Blockly.Block): block is Blockly.BlockSvg {
  return Boolean(block?.outputConnection) && Boolean(block?.type.startsWith('lambda_')) && block?.type !== 'lambda_viz_description';
}

function workspaceOf(block: Blockly.BlockSvg): Blockly.WorkspaceSvg {
  return block.workspace as Blockly.WorkspaceSvg;
}

export function registerLambdaContextMenus(): void {
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
      callback: (scope: BlockScope) => {
        if (isLambdaTermBlock(scope.block)) showTypeInfoForBlock(workspaceOf(scope.block), scope.block);
      }
    },
    {
      id: 'lambdaVizCallByStructure',
      scopeType: ScopeType.BLOCK,
      displayText: 'Evaluate - Call-by-Structure',
      weight: 100,
      preconditionFn: (scope: BlockScope) => show(isLambdaTermBlock(scope.block)),
      callback: (scope: BlockScope) => {
        if (isLambdaTermBlock(scope.block)) openVisualization('structure', scope.block);
      }
    },
    {
      id: 'lambdaVizCallByValue',
      scopeType: ScopeType.BLOCK,
      displayText: 'Evaluate - Call-by-Value',
      weight: 101,
      preconditionFn: (scope: BlockScope) => show(isLambdaTermBlock(scope.block)),
      callback: (scope: BlockScope) => {
        if (isLambdaTermBlock(scope.block)) openVisualization('value', scope.block);
      }
    }
  ];

  for (const item of items) {
    if (!registry.getItem(item.id)) registry.register(item);
  }
}
