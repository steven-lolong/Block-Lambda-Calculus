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

function abstractionBlock(parameter: string, body: BlockState): BlockState {
  return {
    type: 'lambda_abstraction',
    fields: { PARAM: parameter },
    inputs: {
      BODY: { block: body }
    }
  };
}

function applicationBlock(func: BlockState, arg: BlockState): BlockState {
  return {
    type: 'lambda_application',
    inputs: {
      FUNC: { block: func },
      ARG: { block: arg }
    }
  };
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

function minusFromN(amount: number): BlockState {
  return numberOperatorBlock('-', variableBlock('n'), numberBlock(amount));
}

function factorialFunction(): BlockState {
  const body = numberOperatorBlock(
    '*',
    variableBlock('n'),
    numberOperatorBlock(
      '*',
      minusFromN(1),
      numberOperatorBlock('*', minusFromN(2), numberOperatorBlock('*', minusFromN(3), minusFromN(4)))
    )
  );

  return abstractionBlock('n', body);
}

function factorialFiveApplication(): BlockState {
  return applicationBlock(variableBlock('factorial'), numberBlock(5));
}

export const LAMBDA_EXAMPLES: Record<LambdaExampleId, LambdaExampleDefinition> = {
  'simple-factorial': {
    id: 'simple-factorial',
    title: 'Simple Factorial 5',
    description: 'Loads a factorial function and applies it to integer 5.',
    fileName: 'example-simple-factorial.blc',
    workspace: {
      blocks: {
        languageVersion: 0,
        blocks: [letBlock('factorial', factorialFunction(), factorialFiveApplication())]
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
