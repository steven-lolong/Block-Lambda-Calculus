import * as Blockly from 'blockly';
import { GOROPA_RENDERER_NAME, registerGoropaRenderer } from './goropa';

registerGoropaRenderer();

const originalInject = Blockly.inject;
let injectPatchedForGoropa = false;

function installGoropaInjectPatch(): void {
  if (injectPatchedForGoropa) return;
  injectPatchedForGoropa = true;

  (Blockly as typeof Blockly & { inject: typeof Blockly.inject }).inject = (container, options) => {
    const normalizedOptions = options && options.renderer === 'zelos'
      ? { ...options, renderer: GOROPA_RENDERER_NAME }
      : options;

    return originalInject(container, normalizedOptions);
  };
}

installGoropaInjectPatch();

type ToolboxBlock = {
  type: string;
  label: string;
  description: string;
};

type ToolboxCategory = {
  name: string;
  blocks: ToolboxBlock[];
};

const TOOLBOX: ToolboxCategory[] = [
  {
    name: 'Variables',
    blocks: [
      { type: 'lambda_variable', label: 'λ x .', description: 'x' }
    ]
  },
  {
    name: 'Abstraction',
    blocks: [
      { type: 'lambda_abstraction', label: 'λ x .', description: 'body' }
    ]
  },
  {
    name: 'Application',
    blocks: [
      { type: 'lambda_application', label: 'func arg', description: 'func · arg' },
      { type: 'lambda_parentheses', label: '( term )', description: 'grouping' }
    ]
  },
  {
    name: 'Let Binding',
    blocks: [
      { type: 'lambda_let', label: '≔ let x = in', description: 'bind value' },
      { type: 'lambda_letrec', label: '↻ letrec f = in', description: 'recursive bind' }
    ]
  },
  {
    name: 'Operators',
    blocks: [
      { type: 'lambda_number_operator', label: 'number + number', description: '+ − × ÷' },
      { type: 'lambda_boolean_operator', label: 'boolean and boolean', description: 'and / or / =' },
      { type: 'lambda_if', label: 'if then else', description: 'conditional' }
    ]
  },
  {
    name: 'Literals',
    blocks: [
      { type: 'lambda_boolean', label: 'True / False', description: 'boolean' },
      { type: 'lambda_number', label: '0 1 2', description: 'number' }
    ]
  }
];

const CATEGORY_ICONS: Record<string, string> = {
  Variables: 'λ',
  Abstraction: '↦',
  Application: '◇',
  'Let Binding': '≔',
  Operators: '±',
  Literals: '#'
};

type ActiveDrag = {
  blockType: string;
  pointerId: number;
  originX: number;
  originY: number;
  ghost: HTMLElement | null;
  source: HTMLButtonElement;
  didDrag: boolean;
};

let activeDrag: ActiveDrag | null = null;
let suppressNextClick = false;

function isKnownBlockType(blockType: string): boolean {
  return TOOLBOX.some((category) => category.blocks.some((block) => block.type === blockType));
}

function workspaceCoordinatesFromPointer(
  workspace: Blockly.WorkspaceSvg,
  clientX: number,
  clientY: number
): Blockly.utils.Coordinate {
  return Blockly.utils.svgMath.screenToWsCoordinates(
    workspace,
    new Blockly.utils.Coordinate(clientX, clientY)
  );
}

function defaultInsertionCoordinates(workspace: Blockly.WorkspaceSvg): Blockly.utils.Coordinate {
  const metrics = workspace.getMetrics();
  if (!metrics) return new Blockly.utils.Coordinate(48, 48);
  return new Blockly.utils.Coordinate(metrics.viewLeft + 48, metrics.viewTop + 48);
}

function addBlockToWorkspace(
  workspace: Blockly.WorkspaceSvg,
  blockType: string,
  insertionPoint?: Blockly.utils.Coordinate
): void {
  if (!isKnownBlockType(blockType)) return;

  const block = workspace.newBlock(blockType);
  block.initSvg();
  block.render();

  const point = insertionPoint ?? defaultInsertionCoordinates(workspace);
  block.moveBy(point.x, point.y);
  block.select();
  Blockly.svgResize(workspace);
}

function getWorkspaceDropSurface(dropTarget: HTMLElement): HTMLElement {
  return dropTarget.closest<HTMLElement>('.workspace-panel') ?? dropTarget;
}

function getElementAtPointer(clientX: number, clientY: number): Element | null {
  const ghost = activeDrag?.ghost;
  const previousPointerEvents = ghost?.style.pointerEvents;
  if (ghost) ghost.style.pointerEvents = 'none';
  const element = document.elementFromPoint(clientX, clientY);
  if (ghost && previousPointerEvents !== undefined) ghost.style.pointerEvents = previousPointerEvents;
  return element;
}

function isPointerOverWorkspace(clientX: number, clientY: number, dropTarget: HTMLElement): boolean {
  const dropSurface = getWorkspaceDropSurface(dropTarget);
  const element = getElementAtPointer(clientX, clientY);
  if (element?.closest('.blocklySvg, .blockly-canvas, .workspace-panel')) {
    return true;
  }

  const rect = dropSurface.getBoundingClientRect();
  return clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top
    && clientY <= rect.bottom;
}

function setDropHighlight(dropTarget: HTMLElement, isHighlighted: boolean): void {
  getWorkspaceDropSurface(dropTarget).classList.toggle('is-drag-over', isHighlighted);
}

function createDragGhost(source: HTMLButtonElement): HTMLElement {
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.classList.add('toolbox-drag-ghost');
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ghost);
  return ghost;
}

function moveDragGhost(ghost: HTMLElement, clientX: number, clientY: number): void {
  ghost.style.transform = `translate3d(${clientX + 14}px, ${clientY + 14}px, 0)`;
}

function startPointerDrag(
  event: PointerEvent,
  source: HTMLButtonElement,
  blockType: string,
  dropTarget: HTMLElement
): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  activeDrag = {
    blockType,
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    ghost: null,
    source,
    didDrag: false
  };

  source.setPointerCapture(event.pointerId);
  source.classList.add('is-pointer-ready');
  setDropHighlight(dropTarget, false);
}

function updatePointerDrag(event: PointerEvent, dropTarget: HTMLElement): void {
  if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;

  const distance = Math.hypot(event.clientX - activeDrag.originX, event.clientY - activeDrag.originY);
  if (!activeDrag.didDrag && distance < 7) return;

  if (!activeDrag.ghost) {
    activeDrag.ghost = createDragGhost(activeDrag.source);
  }

  activeDrag.didDrag = true;
  activeDrag.source.classList.add('is-dragging');
  moveDragGhost(activeDrag.ghost, event.clientX, event.clientY);
  setDropHighlight(dropTarget, isPointerOverWorkspace(event.clientX, event.clientY, dropTarget));
  event.preventDefault();
}

function finishPointerDrag(
  event: PointerEvent,
  workspace: Blockly.WorkspaceSvg,
  dropTarget: HTMLElement
): void {
  if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;

  const dragState = activeDrag;
  activeDrag = null;
  dragState.source.classList.remove('is-pointer-ready', 'is-dragging');
  setDropHighlight(dropTarget, false);

  if (dragState.ghost) {
    dragState.ghost.remove();
  }

  if (!dragState.didDrag) {
    return;
  }

  suppressNextClick = true;
  window.setTimeout(() => {
    suppressNextClick = false;
  }, 0);

  if (!isPointerOverWorkspace(event.clientX, event.clientY, dropTarget)) {
    return;
  }

  const point = workspaceCoordinatesFromPointer(workspace, event.clientX, event.clientY);
  addBlockToWorkspace(workspace, dragState.blockType, point);
}

function cancelPointerDrag(dropTarget: HTMLElement): void {
  if (!activeDrag) return;
  activeDrag.source.classList.remove('is-pointer-ready', 'is-dragging');
  activeDrag.ghost?.remove();
  activeDrag = null;
  setDropHighlight(dropTarget, false);
}

export function renderToolbox(
  container: HTMLElement,
  workspace: Blockly.WorkspaceSvg,
  dropTarget: HTMLElement
): void {
  const fragment = document.createDocumentFragment();
  const list = document.createElement('div');
  list.className = 'custom-toolbox-list';

  TOOLBOX.forEach((category, index) => {
    const details = document.createElement('details');
    details.className = 'toolbox-category';
    details.dataset.category = category.name;
    details.open = true;

    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="category-icon" aria-hidden="true">${CATEGORY_ICONS[category.name] ?? '•'}</span> ${category.name}`;
    details.appendChild(summary);

    const blocks = document.createElement('div');
    blocks.className = 'toolbox-block-list';

    category.blocks.forEach((block) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toolbox-block-card';
      button.dataset.blockType = block.type;
      button.setAttribute('aria-label', `Add ${block.label} block`);
      button.innerHTML = `
        <span class="toolbox-block-label">${block.label}</span>
        <span class="toolbox-block-description">${block.description}</span>
      `;

      button.addEventListener('pointerdown', (event) => startPointerDrag(event, button, block.type, dropTarget));
      button.addEventListener('pointermove', (event) => updatePointerDrag(event, dropTarget));
      button.addEventListener('pointerup', (event) => finishPointerDrag(event, workspace, dropTarget));
      button.addEventListener('pointercancel', () => cancelPointerDrag(dropTarget));
      button.addEventListener('click', () => {
        if (suppressNextClick) return;
        addBlockToWorkspace(workspace, block.type);
      });

      blocks.appendChild(button);
    });

    details.appendChild(blocks);
    if (index > 2) details.open = false;
    list.appendChild(details);
  });

  fragment.appendChild(list);
  container.appendChild(fragment);
}
