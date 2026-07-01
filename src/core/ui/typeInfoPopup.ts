import * as Blockly from 'blockly';
import { reducedTextForBlock } from '../semantics/lambdaReduction';
import { annotateLambdaWorkspaceTypes } from '../type-inference/lambdaTypeInference';

const TYPE_INFO_ICON_CLASS = 'lambda-type-info-icon';
const TYPE_INFO_CLICK_CLASS = 'lambda-type-info-click-target';
const TYPE_INFO_FIELD_NAME = 'TYPE_INFO';
const TYPE_INFO_BOUND_ATTR = 'data-block-lambda-type-info-bound';

type StatusSink = (message: string) => void;

type SvgBackedBlock = Blockly.Block & {
  getSvgRoot?: () => Element | null;
  getField?: (name: string) => unknown;
};

type SvgBackedField = {
  getSvgRoot?: () => Element | null;
};

type LastShown = {
  blockId: string;
  at: number;
};

function isElement(target: EventTarget | null): target is Element {
  return target instanceof Element;
}

function typeInfoField(block: Blockly.Block): SvgBackedField | null {
  return ((block as SvgBackedBlock).getField?.(TYPE_INFO_FIELD_NAME) as SvgBackedField | null | undefined) ?? null;
}

function typeInfoFieldRoot(block: Blockly.Block): Element | null {
  const fieldRoot = typeInfoField(block)?.getSvgRoot?.();
  if (fieldRoot) return fieldRoot;

  const blockRoot = (block as SvgBackedBlock).getSvgRoot?.();
  const classMatch = blockRoot?.querySelector(`.${TYPE_INFO_ICON_CLASS}`);
  if (classMatch) return classMatch;

  const candidates = Array.from(blockRoot?.querySelectorAll('*') ?? []);
  return candidates.find((candidate) => candidate.textContent?.trim() === '?') ?? null;
}

function hasTypeInfoField(block: Blockly.Block): boolean {
  return Boolean(typeInfoField(block));
}

function candidateIconElement(target: EventTarget | null): Element | null {
  if (!isElement(target)) return null;

  const explicitMatch = target.closest(`.${TYPE_INFO_CLICK_CLASS}, .${TYPE_INFO_ICON_CLASS}`);
  if (explicitMatch) return explicitMatch;

  let current: Element | null = target;
  while (current) {
    if (current.textContent?.trim() === '?') return current;
    current = current.parentElement;
  }

  return null;
}

function blockForIconTarget(workspace: Blockly.WorkspaceSvg, target: EventTarget | null): Blockly.Block | null {
  const icon = candidateIconElement(target);
  if (!icon) return null;

  for (const block of workspace.getAllBlocks(false) as SvgBackedBlock[]) {
    const fieldRoot = typeInfoFieldRoot(block);
    if (fieldRoot?.contains(icon) || icon.contains(fieldRoot ?? null)) return block;

    const blockRoot = block.getSvgRoot?.();
    if (blockRoot?.contains(icon) && hasTypeInfoField(block)) return block;
  }

  return null;
}

function safeReducedValue(block: Blockly.Block): string {
  try {
    return reducedTextForBlock(block, 'value');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Could not compute value: ${message}`;
  }
}

function typeInfoMessage(workspace: Blockly.WorkspaceSvg, block: Blockly.Block): string {
  const report = annotateLambdaWorkspaceTypes(workspace);
  const inferredType = report.blockTypes.get(block.id) ?? 'unknown';
  const issues = report.blockIssues.get(block.id) ?? [];
  const value = safeReducedValue(block);

  const lines = [
    'Block Lambda - Type',
    '',
    `Block: ${block.type}`,
    `Type: ${inferredType}`,
    `Value: ${value}`
  ];

  if (issues.length > 0) {
    lines.push('', 'Type issues:', ...issues.map((issue) => `- ${issue}`));
  }

  return lines.join('\n');
}

export function showTypeInfoForBlock(
  workspace: Blockly.WorkspaceSvg,
  block: Blockly.Block,
  setStatus: StatusSink = () => undefined
): void {
  const message = typeInfoMessage(workspace, block);
  window.alert(message);

  const report = annotateLambdaWorkspaceTypes(workspace);
  const inferredType = report.blockTypes.get(block.id) ?? 'unknown';
  const issueCount = report.blockIssues.get(block.id)?.length ?? 0;
  setStatus(
    issueCount > 0
      ? `Shown type for ${block.type}; ${issueCount} type issue${issueCount === 1 ? '' : 's'}.`
      : `Shown type for ${block.type}: ${inferredType}.`
  );
}

function stopBlocklyDrag(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

export function installTypeInfoPopup(
  workspace: Blockly.WorkspaceSvg,
  hostElement: HTMLElement,
  setStatus: StatusSink = () => undefined
): void {
  let lastShown: LastShown | null = null;
  let bindFrame = 0;

  const showForBlock = (block: Blockly.Block): void => {
    const now = Date.now();
    if (lastShown?.blockId === block.id && now - lastShown.at < 350) return;
    lastShown = { blockId: block.id, at: now };
    showTypeInfoForBlock(workspace, block, setStatus);
  };

  const bindTypeInfoFields = (): void => {
    for (const block of workspace.getAllBlocks(false) as SvgBackedBlock[]) {
      if (!hasTypeInfoField(block)) continue;
      const fieldRoot = typeInfoFieldRoot(block);
      if (!fieldRoot || fieldRoot.getAttribute(TYPE_INFO_BOUND_ATTR) === 'true') continue;

      fieldRoot.setAttribute(TYPE_INFO_BOUND_ATTR, 'true');
      fieldRoot.setAttribute('role', 'button');
      fieldRoot.setAttribute('tabindex', '0');
      fieldRoot.setAttribute('aria-label', 'Show inferred type for this block');
      fieldRoot.classList.add(TYPE_INFO_CLICK_CLASS);
      (fieldRoot as HTMLElement | SVGElement).style.pointerEvents = 'all';
      (fieldRoot as HTMLElement | SVGElement).style.cursor = 'pointer';

      fieldRoot.addEventListener('pointerdown', stopBlocklyDrag, true);
      fieldRoot.addEventListener('pointerup', (event) => {
        stopBlocklyDrag(event);
        showForBlock(block);
      }, true);
      fieldRoot.addEventListener('click', (event) => {
        stopBlocklyDrag(event);
        showForBlock(block);
      }, true);
      fieldRoot.addEventListener('keydown', (event) => {
        if (!(event instanceof KeyboardEvent)) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        stopBlocklyDrag(event);
        showForBlock(block);
      }, true);
    }
  };

  const scheduleBind = (): void => {
    if (bindFrame) window.cancelAnimationFrame(bindFrame);
    bindFrame = window.requestAnimationFrame(() => {
      bindFrame = 0;
      bindTypeInfoFields();
    });
  };

  const handlePointer = (event: Event): void => {
    const block = blockForIconTarget(workspace, event.target);
    if (!block) return;
    stopBlocklyDrag(event);
    showForBlock(block);
  };

  workspace.addChangeListener(() => scheduleBind());
  [0, 80, 180, 360, 720].forEach((delay) => window.setTimeout(scheduleBind, delay));

  hostElement.addEventListener('pointerdown', (event) => {
    if (blockForIconTarget(workspace, event.target)) stopBlocklyDrag(event);
  }, true);
  hostElement.addEventListener('pointerup', handlePointer, true);
  hostElement.addEventListener('click', handlePointer, true);
}
