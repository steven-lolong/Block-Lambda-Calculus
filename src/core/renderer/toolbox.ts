import * as Blockly from 'blockly';

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
      { type: 'lambda_number_comparison', label: 'number < number', description: '= < ≤ > ≥' },
      { type: 'lambda_boolean_operator', label: 'boolean and boolean', description: 'and / or / equal' },
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
  Variables: 'file',
  Abstraction: 'trace',
  Application: 'blocks',
  'Let Binding': 'sync',
  Operators: 'arrange',
  Literals: 'workspace'
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

function createIcon(name: string, className?: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('app-icon');
  if (className) svg.classList.add(className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.appendChild(use);
  return svg;
}

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

function defaultInsertionCoordinates(
  workspace: Blockly.WorkspaceSvg,
  block: Blockly.BlockSvg
): Blockly.utils.Coordinate {
  const metrics = workspace.getMetrics();
  if (!metrics) return new Blockly.utils.Coordinate(48, 48);

  const baseX = metrics.viewLeft + 48;
  const baseY = metrics.viewTop + 48;
  const blockSize = block.getHeightWidth();
  const horizontalStep = Math.max(120, blockSize.width + 28);
  const verticalStep = Math.max(72, blockSize.height + 28);
  const maxX = metrics.viewLeft + metrics.viewWidth - blockSize.width - 36;
  const maxY = metrics.viewTop + metrics.viewHeight - blockSize.height - 36;
  const occupied = workspace
    .getTopBlocks(false)
    .filter((candidate) => candidate.id !== block.id)
    .map((candidate) => (candidate as Blockly.BlockSvg).getBoundingRectangle());

  for (let x = baseX; x <= Math.max(baseX, maxX); x += horizontalStep) {
    for (let y = baseY; y <= Math.max(baseY, maxY); y += verticalStep) {
      const overlaps = occupied.some((bounds) => (
        x < bounds.right + 18
        && x + blockSize.width > bounds.left - 18
        && y < bounds.bottom + 18
        && y + blockSize.height > bounds.top - 18
      ));
      if (!overlaps) return new Blockly.utils.Coordinate(x, y);
    }
  }

  return new Blockly.utils.Coordinate(baseX, baseY);
}

function addBlockToWorkspace(
  workspace: Blockly.WorkspaceSvg,
  blockType: string,
  insertionPoint?: Blockly.utils.Coordinate
): void {
  if (!isKnownBlockType(blockType)) return;

  const existingEventGroup = Blockly.Events.getGroup();
  if (!existingEventGroup) Blockly.Events.setGroup(true);
  try {
    const block = workspace.newBlock(blockType);
    block.initSvg();
    block.render();

    const point = insertionPoint ?? defaultInsertionCoordinates(workspace, block);
    block.moveBy(point.x, point.y);
    block.select();
  } finally {
    if (!existingEventGroup) Blockly.Events.setGroup(false);
  }
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
  workspace: Blockly.WorkspaceSvg,
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

  const cleanup = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
  };
  const move = (moveEvent: PointerEvent) => updatePointerDrag(moveEvent, dropTarget);
  const up = (upEvent: PointerEvent) => {
    finishPointerDrag(upEvent, workspace, dropTarget);
    cleanup();
  };
  const cancel = () => {
    cancelPointerDrag(dropTarget);
    cleanup();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
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
  const empty = document.createElement('p');
  empty.className = 'toolbox-empty';
  empty.textContent = 'No blocks match this search.';
  empty.hidden = true;

  TOOLBOX.forEach((category, index) => {
    const details = document.createElement('details');
    details.className = 'toolbox-category';
    details.dataset.category = category.name;
    details.open = true;

    const summary = document.createElement('summary');
    const label = document.createElement('span');
    label.textContent = category.name;
    summary.append(
      createIcon(CATEGORY_ICONS[category.name] ?? 'blocks', 'category-icon'),
      label,
      createIcon('chevron-right', 'toolbox-disclosure-icon')
    );
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

      button.addEventListener('pointerdown', (event) => startPointerDrag(event, button, block.type, workspace, dropTarget));
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
  fragment.appendChild(empty);
  container.appendChild(fragment);

  const search = container.closest('#toolboxPanel')?.querySelector<HTMLInputElement>('#toolboxSearch');
  if (search) {
    search.oninput = () => {
      const query = search.value.trim().toLocaleLowerCase();
      let visibleCount = 0;

      for (const category of Array.from(list.querySelectorAll<HTMLDetailsElement>('.toolbox-category'))) {
        const cards = Array.from(category.querySelectorAll<HTMLButtonElement>('.toolbox-block-card'));
        let categoryMatches = 0;

        for (const card of cards) {
          const haystack = `${card.dataset.blockType ?? ''} ${card.textContent ?? ''}`.toLocaleLowerCase();
          const matches = query.length === 0 || haystack.includes(query);
          card.hidden = !matches;
          if (matches) categoryMatches += 1;
        }

        category.hidden = categoryMatches === 0;
        visibleCount += categoryMatches;
        if (query && categoryMatches > 0) category.open = true;
      }

      empty.hidden = visibleCount > 0;
    };
    search.dispatchEvent(new Event('input'));
  }
}
