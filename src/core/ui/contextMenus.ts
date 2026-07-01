import * as Blockly from 'blockly';
import { openVisualization } from './visualizationPanel';

type BlockScope = { block?: Blockly.BlockSvg };
const ScopeType = Blockly.ContextMenuRegistry.ScopeType;
type Item = Blockly.ContextMenuRegistry.RegistryItem;

let registered = false;

function show(when: boolean): 'enabled' | 'hidden' {
  return when ? 'enabled' : 'hidden';
}

export function registerLambdaContextMenus(): void {
  if (registered) return;
  registered = true;

  const registry = Blockly.ContextMenuRegistry.registry;
  const items: Item[] = [
    {
      id: 'lambdaVizCallByStructure',
      scopeType: ScopeType.BLOCK,
      displayText: 'Visualize ▸ Call-by-Structure',
      weight: 100,
      preconditionFn: (scope: BlockScope) => show(scope.block?.type === 'lambda_application'),
      callback: (scope: BlockScope) => {
        if (scope.block) openVisualization('structure', scope.block);
      }
    },
    {
      id: 'lambdaVizCallByValue',
      scopeType: ScopeType.BLOCK,
      displayText: 'Visualize ▸ Call-by-Value',
      weight: 101,
      preconditionFn: (scope: BlockScope) => show(scope.block?.type === 'lambda_application'),
      callback: (scope: BlockScope) => {
        if (scope.block) openVisualization('value', scope.block);
      }
    }
  ];

  for (const item of items) {
    if (!registry.getItem(item.id)) registry.register(item);
  }
}

