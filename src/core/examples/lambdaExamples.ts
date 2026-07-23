import * as Blockly from 'blockly';

export type LambdaExampleId =
  | 'identity-function'
  | 'currying-closures'
  | 'function-composition'
  | 'apply-twice'
  | 'twice-twice'
  | 'let-polymorphism'
  | 'copy-vs-lookup'
  | 'shadowing'
  | 'normal-form-binder'
  | 'simple-factorial'
  | 'fibonacci'
  | 'gcd-euclid';

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

/**
 * `let add = \x. \y. x + y in let inc = add 1 in inc 41`  =>  42
 *
 * Partial application: `add 1` returns a FUNCTION that has captured x = 1.
 * The CEK machine's Environment column is where that capture is visible.
 */
function curryingClosuresExample(): BlockState {
  const add = abstractionBlock('x', abstractionBlock('y', numberOperatorBlock('+', variableBlock('x'), variableBlock('y'))));
  return letBlock(
    'add',
    add,
    letBlock('inc', applicationBlock(variableBlock('add'), numberBlock(1)),
      applicationBlock(variableBlock('inc'), numberBlock(41))),
    72,
    72
  );
}

/**
 * `let compose = \f. \g. \x. f (g x) in compose (\n. n * 2) (\n. n + 3) 5`  =>  16
 *
 * Functions as arguments AND as results: compose takes two functions and
 * returns a third. (5 + 3) * 2 = 16 — g runs first.
 */
function functionCompositionExample(): BlockState {
  const compose = abstractionBlock('f', abstractionBlock('g', abstractionBlock('x',
    applicationBlock(variableBlock('f'), applicationBlock(variableBlock('g'), variableBlock('x'))))));
  const double = abstractionBlock('n', numberOperatorBlock('*', variableBlock('n'), numberBlock(2)));
  const addThree = abstractionBlock('n', numberOperatorBlock('+', variableBlock('n'), numberBlock(3)));
  return letBlock(
    'compose',
    compose,
    applicationBlock(applicationBlock(applicationBlock(variableBlock('compose'), double), addThree), numberBlock(5)),
    72,
    72
  );
}

/**
 * `(\f. \x. f (f x)) (\y. y + 3) 5`  =>  11
 *
 * A function parameter applied to its own output: 5 + 3 + 3.
 */
function applyTwiceExample(): BlockState {
  const twice = abstractionBlock('f', abstractionBlock('x',
    applicationBlock(variableBlock('f'), applicationBlock(variableBlock('f'), variableBlock('x')))), 72, 72);
  const addThree = abstractionBlock('y', numberOperatorBlock('+', variableBlock('y'), numberBlock(3)));
  return applicationBlock(applicationBlock(twice, addThree), numberBlock(5));
}

/**
 * `let twice = \f. \x. f (f x) in twice twice (\n. n + 1) 0`  =>  4
 *
 * `twice` applied to ITSELF: doing-twice done twice is doing-it 2x2 = 4 times.
 * Legal and well-typed, unlike the self-application `\x. x x`, which the
 * occurs check rejects.
 */
function twiceTwiceExample(): BlockState {
  const twice = abstractionBlock('f', abstractionBlock('x',
    applicationBlock(variableBlock('f'), applicationBlock(variableBlock('f'), variableBlock('x')))));
  const inc = abstractionBlock('n', numberOperatorBlock('+', variableBlock('n'), numberBlock(1)));
  return letBlock(
    'twice',
    twice,
    applicationBlock(applicationBlock(applicationBlock(variableBlock('twice'), variableBlock('twice')), inc), numberBlock(0)),
    72,
    72
  );
}

/**
 * `let id = \x. x in if id true then id 42 else 0`  =>  42
 *
 * The let-polymorphism example: `id` is used at BOTH bool and int in one
 * program. Hindley-Milner generalizes a let-bound type into a scheme
 * (forall 'a. 'a -> 'a) and instantiates it fresh per use. A lambda-bound
 * parameter is monomorphic, so the same trick inside \id. ... is a type error.
 */
function letPolymorphismExample(): BlockState {
  return letBlock(
    'id',
    abstractionBlock('x', variableBlock('x')),
    ifBlock(
      applicationBlock(variableBlock('id'), booleanBlock(true)),
      applicationBlock(variableBlock('id'), numberBlock(42)),
      numberBlock(0)
    ),
    72,
    72
  );
}

/**
 * `(\x. x + x) (3 * 7)`  =>  42
 *
 * The copy-vs-lookup exemplar the two strategies exist to contrast.
 * Call-by-Structure substitutes the UNEVALUATED (3 * 7) into both holes and
 * multiplies twice; Call-by-Value reduces the argument once and copies 21.
 * Same answer, different work — watch the `prim *` count.
 */
function copyVsLookupExample(): BlockState {
  const body = numberOperatorBlock('+', variableBlock('x'), variableBlock('x'));
  return applicationBlock(
    abstractionBlock('x', body, 72, 72),
    numberOperatorBlock('*', numberBlock(3), numberBlock(7))
  );
}

/**
 * `(\x. (\x. x + 1) (x * 2)) 5`  =>  11
 *
 * The inner binder shadows the outer one: the `x` in `x + 1` is the inner
 * parameter (bound to 5 * 2 = 10), not the outer 5.
 */
function shadowingExample(): BlockState {
  const inner = abstractionBlock('x', numberOperatorBlock('+', variableBlock('x'), numberBlock(1)));
  const outerBody = applicationBlock(inner, numberOperatorBlock('*', variableBlock('x'), numberBlock(2)));
  return applicationBlock(abstractionBlock('x', outerBody, 72, 72), numberBlock(5));
}

/**
 * `\y. 2 + 3 + y`  =>  itself (a function, typed int -> int)
 *
 * An abstraction IS a value: neither strategy reduces under a binder, so the
 * `2 + 3` inside is left alone and the term is already a normal form (zero
 * steps). This is the property Block-Lambda-Calculus shares with MNL.
 */
function normalFormBinderExample(): BlockState {
  return abstractionBlock(
    'y',
    numberOperatorBlock('+', numberOperatorBlock('+', numberBlock(2), numberBlock(3)), variableBlock('y')),
    72,
    72
  );
}

/**
 * `letrec fib = \n. if n < 2 then n else fib (n-1) + fib (n-2) in fib 6`  =>  8
 *
 * TREE recursion — two recursive calls per level — where factorial's is
 * linear. Kept at 6 deliberately: the reduction budget is ~480 frames, and
 * fib 8 exceeds it under Call-by-Structure.
 */
function fibonacciExample(): BlockState {
  const recurse = (offset: number): BlockState =>
    applicationBlock(variableBlock('fib'), numberOperatorBlock('-', variableBlock('n'), numberBlock(offset)));
  const body = abstractionBlock('n', ifBlock(
    numberComparisonBlock('<', variableBlock('n'), numberBlock(2)),
    variableBlock('n'),
    numberOperatorBlock('+', recurse(1), recurse(2))
  ));
  return letrecBlock('fib', body, applicationBlock(variableBlock('fib'), numberBlock(6)));
}

/**
 * `letrec gcd = \a. \b. if b = 0 then a else gcd b (a - ((a / b) * b)) in gcd 48 18`  =>  6
 *
 * Euclid's algorithm. The language has no modulo, so it is BUILT from integer
 * division: `a - (a / b) * b` is `a mod b` exactly because `/` truncates.
 */
function gcdEuclidExample(): BlockState {
  const modulo = numberOperatorBlock(
    '-',
    variableBlock('a'),
    numberOperatorBlock('*', numberOperatorBlock('/', variableBlock('a'), variableBlock('b')), variableBlock('b'))
  );
  const body = abstractionBlock('a', abstractionBlock('b', ifBlock(
    numberComparisonBlock('=', variableBlock('b'), numberBlock(0)),
    variableBlock('a'),
    applicationBlock(applicationBlock(variableBlock('gcd'), variableBlock('b')), modulo)
  )));
  return letrecBlock('gcd', body,
    applicationBlock(applicationBlock(variableBlock('gcd'), numberBlock(48)), numberBlock(18)));
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
  'currying-closures': {
    id: 'currying-closures',
    title: 'Currying & Closures',
    description: 'let add = λx. λy. x + y in let inc = add 1 in inc 41 ⇒ 42. Partial application captures x = 1 in a closure — watch the CEK Environment column.',
    fileName: 'example-currying-closures.blc',
    workspace: { blocks: { languageVersion: 0, blocks: [curryingClosuresExample()] } }
  },
  'function-composition': {
    id: 'function-composition',
    title: 'Function Composition',
    description: 'compose (λn. n * 2) (λn. n + 3) 5 ⇒ 16. Functions taken as arguments and returned as results.',
    fileName: 'example-function-composition.blc',
    workspace: { blocks: { languageVersion: 0, blocks: [functionCompositionExample()] } }
  },
  'apply-twice': {
    id: 'apply-twice',
    title: 'Apply Twice',
    description: '(λf. λx. f (f x)) (λy. y + 3) 5 ⇒ 11. A function parameter applied to its own output.',
    fileName: 'example-apply-twice.blc',
    workspace: { blocks: { languageVersion: 0, blocks: [applyTwiceExample()] } }
  },
  'twice-twice': {
    id: 'twice-twice',
    title: 'Twice Twice',
    description: 'twice twice (λn. n + 1) 0 ⇒ 4. A combinator applied to itself — legal, unlike λx. x x, which the occurs check rejects.',
    fileName: 'example-twice-twice.blc',
    workspace: { blocks: { languageVersion: 0, blocks: [twiceTwiceExample()] } }
  },
  'let-polymorphism': {
    id: 'let-polymorphism',
    title: 'Let-Polymorphism',
    description: 'let id = λx. x in if id true then id 42 else 0 ⇒ 42. One id used at BOTH bool and int — the Hindley-Milner let generalization.',
    fileName: 'example-let-polymorphism.blc',
    workspace: { blocks: { languageVersion: 0, blocks: [letPolymorphismExample()] } }
  },
  'copy-vs-lookup': {
    id: 'copy-vs-lookup',
    title: 'Copy vs Lookup (CbS ⇄ CbV)',
    description: '(λx. x + x) (3 * 7) ⇒ 42. Call-by-Structure copies the unevaluated 3 * 7 into both holes and multiplies twice; Call-by-Value multiplies once.',
    fileName: 'example-copy-vs-lookup.blc',
    workspace: { blocks: { languageVersion: 0, blocks: [copyVsLookupExample()] } }
  },
  'shadowing': {
    id: 'shadowing',
    title: 'Shadowing',
    description: '(λx. (λx. x + 1) (x * 2)) 5 ⇒ 11. The inner binder shadows the outer one.',
    fileName: 'example-shadowing.blc',
    workspace: { blocks: { languageVersion: 0, blocks: [shadowingExample()] } }
  },
  'normal-form-binder': {
    id: 'normal-form-binder',
    title: 'Normal Form (no reduction under a binder)',
    description: 'λy. 2 + 3 + y is already a value: neither strategy reduces under a binder, so 2 + 3 is left alone — zero steps.',
    fileName: 'example-normal-form-binder.blc',
    workspace: { blocks: { languageVersion: 0, blocks: [normalFormBinderExample()] } }
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
  },
  fibonacci: {
    id: 'fibonacci',
    title: 'Fibonacci 6',
    description: 'letrec fib = λn. if n < 2 then n else fib (n-1) + fib (n-2) in fib 6 ⇒ 8. Tree recursion — two calls per level — where factorial’s is linear.',
    fileName: 'example-fibonacci.blc',
    workspace: { blocks: { languageVersion: 0, blocks: [fibonacciExample()] } }
  },
  'gcd-euclid': {
    id: 'gcd-euclid',
    title: 'GCD (Euclid)',
    description: 'gcd 48 18 ⇒ 6. The language has no modulo, so it is built from integer division: a - (a / b) * b is a mod b because ÷ truncates.',
    fileName: 'example-gcd-euclid.blc',
    workspace: { blocks: { languageVersion: 0, blocks: [gcdEuclidExample()] } }
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
  function closeMenu(returnFocus = false): void {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus) window.setTimeout(() => button.focus({ preventScroll: true }), 0);
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

  button.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    openMenu();
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  });

  menu.addEventListener('keydown', (event) => {
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'));
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? currentIndex + 1
          : event.key === 'ArrowUp'
            ? currentIndex - 1
            : Number.NaN;
    if (Number.isNaN(nextIndex)) return;
    event.preventDefault();
    items[(nextIndex + items.length) % items.length].focus();
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
    if (event.key === 'Escape' && !menu.hidden) closeMenu(true);
  });
}
