import * as Blockly from 'blockly';

export type LambdaExampleId = 'simple-factorial';

type BlockState = {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, string | number>;
  inputs?: Record<string, { block: BlockState }>;
};

type WorkspaceState = {
  blocks: {
    languageVersion: number;
    blocks: BlockState[];
  };
};

export type LambdaExampleDefinition = {
  id: LambdaExampleId;
  title: string;
  description: string;
  fileName: string;
  workspace: WorkspaceState;
};

type ExampleLoader = (exampleId: LambdaExampleId) => void;

function numberBlock(value: number): BlockState {
  return { type: 'lambda_number', fields: { VALUE: value } };
}

function variableBlock(name: string): BlockState {
  return { type: 'lambda_variable', fields: { NAME: name } };
}

function numberOperatorBlock(op: string, left: BlockState, right: BlockState): BlockState {
  return {
    type: 'lambda_number_operator',
    fields: { OP: op },
    inputs: {
      LEFT: { block: left },
      RIGHT: { block: right }
    }
  };
}

function letBlock(name: string, value: BlockState, body: BlockState): BlockState {
  return {
    type: 'lambda_let',
    x: 72,
    y: 72,
    fields: { NAME: name },
    inputs: {
      VALUE: { block: value },
      BODY: { block: body }
    }
  };
}

function factorialFiveExpression(): BlockState {
  return numberOperatorBlock(
    '*',
    numberBlock(5),
    numberOperatorBlock(
      '*',
      numberBlock(4),
      numberOperatorBlock('*', numberBlock(3), numberOperatorBlock('*', numberBlock(2), numberBlock(1)))
    )
  );
}

export const LAMBDA_EXAMPLES: Record<LambdaExampleId, LambdaExampleDefinition> = {
  'simple-factorial': {
    id: 'simple-factorial',
    title: 'Simple Factorial 5',
    description: 'Loads an expanded factorial expression: 5 * 4 * 3 * 2 * 1.',
    fileName: 'example-simple-factorial.blc',
    workspace: {
      blocks: {
        languageVersion: 0,
        blocks: [letBlock('factorial5', factorialFiveExpression(), variableBlock('factorial5'))]
      }
    }
  }
};

export function getLambdaExample(exampleId: LambdaExampleId): LambdaExampleDefinition {
  return LAMBDA_EXAMPLES[exampleId];
}

export function loadLambdaExample(workspace: Blockly.WorkspaceSvg, exampleId: LambdaExampleId): LambdaExampleDefinition {
  const example = getLambdaExample(exampleId);
  workspace.clear();
  Blockly.serialization.workspaces.load(example.workspace as any, workspace);
  workspace.cleanUp();
  return example;
}

export function installExampleMenu(
  button: HTMLButtonElement,
  menu: HTMLElement,
  onLoadExample: ExampleLoader
): void {
  function closeMenu(): void {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function openMenu(): void {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }

  function toggleMenu(): void {
    if (menu.hidden) openMenu();
    else closeMenu();
  }

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleMenu();
  });

  menu.querySelectorAll<HTMLButtonElement>('[data-example-id]').forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      const exampleId = item.dataset.exampleId as LambdaExampleId | undefined;
      if (!exampleId || !(exampleId in LAMBDA_EXAMPLES)) return;
      closeMenu();
      onLoadExample(exampleId);
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!button.contains(target) && !menu.contains(target)) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
}
