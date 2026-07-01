import * as Blockly from 'blockly';
import { reducedTextForBlock } from '../semantics/lambdaReduction';
import { annotateLambdaWorkspaceTypes } from '../type-inference/lambdaTypeInference';

const TYPE_INFO_ICON_CLASS = 'lambda-type-info-icon';
const TYPE_INFO_FIELD_NAME = 'TYPE_INFO';

type StatusSink = (message: string) => void;

type SvgBackedBlock = Blockly.Block & {
  getSvgRoot?: () => Element | null;
  getField?: (name: string) => unknown;
};

type LastShown = {
  blockId: string;
  at: number;
};

function isElement(target: EventTarget | null): target is Element {
  return target instanceof Element;
}

function hasTypeInfoField(block: Blockly.Block): boolean {
  return Boolean((block as SvgBackedBlock).getField?.(TYPE_INFO_FIELD_NAME));
}

function candidateIconElement(target: EventTarget | null): Element | null {
  if (!isElement(target)) return null;

  const classMatch = target.closest(`.${TYPE_INFO_ICON_CLASS}`);
  if (classMatch) return classMatch;

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
    const root = block.getSvgRoot?.();
    if (root?.contains(icon) && hasTypeInfoField(block)) return block;
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
    'Block Lambda - Type and Value',
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
      ? `Shown type/value for ${block.type}; ${issueCount} type issue${issueCount === 1 ? '' : 's'}.`
      : `Shown type/value for ${block.type}: ${inferredType}.`
  );
}

export function installTypeInfoPopup(
  workspace: Blockly.WorkspaceSvg,
  hostElement: HTMLElement,
  setStatus: StatusSink = () => undefined
): void {
  let lastShown: LastShown | null = null;

  const handlePointer = (event: Event): void => {
    const block = blockForIconTarget(workspace, event.target);
    if (!block) return;

    event.preventDefault();
    event.stopPropagation();

    const now = Date.now();
    if (lastShown?.blockId === block.id && now - lastShown.at < 350) return;
    lastShown = { blockId: block.id, at: now };

    showTypeInfoForBlock(workspace, block, setStatus);
  };

  hostElement.addEventListener('pointerup', handlePointer, true);
  hostElement.addEventListener('click', handlePointer, true);
}
