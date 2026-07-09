import * as Blockly from 'blockly';

export type LambdaExampleId =
  | 'identity-function'
  | 'let-binding'
  | 'if-else'
  | 'palindrome-number'
  | 'simple-factorial';

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

function booleanBlock(value: boolean): BlockState {
  return { type: 'lambda_boolean', fields: { VALUE: value ? 'true' : 'false' } };
}

function variableBlock(name: string): BlockState {
  return { type: 'lambda_variable', fields: { NAME: name } };
}

function abstractionBlock(parameter: string, body: BlockState, x?: number, y?: number): BlockState {
  return {
    type: 'lambda_abstraction',
    x,
    y,
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

function booleanOperatorBlock(op: string, left: BlockState, right: BlockState): BlockState {
  return {
    type: 'lambda_boolean_operator',
    fields: { OP: op },
    inputs: {
      LEFT: { block: left },
      RIGHT: { block: right }
    }
  };
}

function numberComparisonBlock(op: string, left: BlockState, right: BlockState): BlockState {
  return {
    type: 'lambda_number_comparison',
    fields: { OP: op },
    inputs: {
      LEFT: { block: left },
      RIGHT: { block: right }
    }
  };
}

function ifBlock(condition: BlockState, thenBranch: BlockState, elseBranch: BlockState): BlockState {
  return {
    type: 'lambda_if',
    inputs: {
      COND: { block: condition },
      THEN: { block: thenBranch },
      ELSE: { block: elseBranch }
    }
  };
}

function letBlock(name: string, value: BlockState, body: BlockState, x?: number, y?: number): BlockState {
  return {
    type: 'lambda_let',
    x,
    y,
    fields: { NAME: name },
    inputs: {
      VALUE: { block: value },
      BODY: { block: body }
    }
  };
}

function letrecBlock(name: string, value: BlockState, body: BlockState): BlockState {
  return {
    type: 'lambda_letrec',
    x: 72,
    y: 72,
    fields: { NAME: name },
    inputs: {
      VALUE: { block: value },
      BODY: { block: body }
    }
  };
}

function identityFunction(): BlockState {
  return abstractionBlock('x', variableBlock('x'), 72, 72);
}

function letBindingExample(): BlockState {
  return letBlock('x', numberBlock(10), numberOperatorBlock('+', variableBlock('x'), numberBlock(5)), 72, 72);
}

function ifElseExample(): BlockState {
  return ifBlock(numberComparisonBlock('=', numberBlock(7), numberBlock(7)), numberBlock(1), numberBlock(0));
}

function palindromeNumberExample(): BlockState {
  const outerDigitsMatch = numberComparisonBlock('=', variableBlock('hundreds'), variableBlock('ones'));
  const checkResult = ifBlock(outerDigitsMatch, booleanBlock(true), booleanBlock(false));

  return letBlock(
    'number',
    numberBlock(121),
    letBlock(
      'hundreds',
      numberBlock(1),
      letBlock('tens', numberBlock(2), letBlock('ones', numberBlock(1), checkResult))
    ),
    72,
    72
  );
}

function decrementN(): BlockState {
  return numberOperatorBlock('-', variableBlock('n'), numberBlock(1));
}

function factorialRecursiveCall(): BlockState {
  return applicationBlock(variableBlock('factorial'), decrementN());
}

function standardFactorialFunction(): BlockState {
  const condition = numberComparisonBlock('=', variableBlock('n'), numberBlock(0));
  const recursiveCase = numberOperatorBlock('*', variableBlock('n'), factorialRecursiveCall());
  return abstractionBlock('n', ifBlock(condition, numberBlock(1), recursiveCase));
}

function factorialFiveApplication(): BlockState {
  return applicationBlock(variableBlock('factorial'), numberBlock(5));
}

export const LAMBDA_EXAMPLES: Record<LambdaExampleId, LambdaExampleDefinition> = {
  'identity-function': {
    id: 'identity-function',
    title: 'Identity Function',
    description: 'Loads the polymorphic identity function λx. x.',
    fileName: 'example-identity-function.blc',
    workspace: {
      blocks: {
        languageVersion: 0,
        blocks: [identityFunction()]
      }
    }
  },
  'let-binding': {
    id: 'let-binding',
    title: 'Let Binding',
    description: 'Loads let x = 10 in x + 5.',
    fileName: 'example-let-binding.blc',
    workspace: {
      blocks: {
        languageVersion: 0,
        blocks: [letBindingExample()]
      }
    }
  },
  'if-else': {
    id: 'if-else',
    title: 'If Else',
    description: 'Loads if 7 = 7 then 1 else 0.',
    fileName: 'example-if-else.blc',
    workspace: {
      blocks: {
        languageVersion: 0,
        blocks: [ifElseExample()]
      }
    }
  },
  'palindrome-number': {
    id: 'palindrome-number',
    title: 'Palindrome Number 121',
    description: 'Loads a digit-based palindrome check for 121.',
    fileName: 'example-palindrome-number.blc',
    workspace: {
      blocks: {
        languageVersion: 0,
        blocks: [palindromeNumberExample()]
      }
    }
  },
  'simple-factorial': {
    id: 'simple-factorial',
    title: 'Standard Factorial 5',
    description: 'Loads the standard recursive factorial definition and applies it to integer 5.',
    fileName: 'example-standard-factorial.blc',
    workspace: {
      blocks: {
        languageVersion: 0,
        blocks: [letrecBlock('factorial', standardFactorialFunction(), factorialFiveApplication())]
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
