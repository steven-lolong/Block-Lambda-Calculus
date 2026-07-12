import * as Blockly from 'blockly';
import { reducedTextForBlock, runtimeValueTextsForWorkspace } from '../semantics/lambdaReduction';
import { annotateLambdaWorkspaceTypes, type LambdaInferenceReport } from '../type-inference/lambdaTypeInference';

type StatusSink = (message: string) => void;

type ValueProvider = (block: Blockly.Block) => string;

export function isCommentableLambdaBlock(block: Blockly.Block): boolean {
  return Boolean(block.outputConnection) && block.type.startsWith('lambda_') && block.type !== 'lambda_viz_description';
}

function safeReducedValue(block: Blockly.Block): string {
  try {
    // Call-by-structure is the language's default evaluation strategy (as in
    // Block-based-MNL); in this pure calculus both strategies agree on values.
    return reducedTextForBlock(block, 'structure');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Could not compute value: ${message}`;
  }
}

type RuntimeValueCacheEntry = { signature: string; values: Map<string, string> };

const runtimeValueCache = new WeakMap<Blockly.Workspace, RuntimeValueCacheEntry>();

// Positions and icons (comments, warnings) do not affect runtime values, so
// they are excluded to keep the cache valid across drags and comment writes.
const SIGNATURE_SKIP_KEYS = new Set(['x', 'y', 'icons']);

function runtimeValueSignature(workspace: Blockly.Workspace): string {
  const state = Blockly.serialization.workspaces.save(workspace) as Record<string, unknown>;
  return JSON.stringify(state['blocks'] ?? null, (key, value) => (SIGNATURE_SKIP_KEYS.has(key) ? undefined : value));
}

export function contextualValueProvider(workspace: Blockly.Workspace): ValueProvider {
  const signature = runtimeValueSignature(workspace);
  const cached = runtimeValueCache.get(workspace);
  const values = cached && cached.signature === signature
    ? cached.values
    : runtimeValueTextsForWorkspace(workspace, 'structure');
  runtimeValueCache.set(workspace, { signature, values });
  return (block) => values.get(block.id) ?? safeReducedValue(block);
}

function indent(text: string, prefix = '  '): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function prettyBlockName(block: Blockly.Block): string {
  return block.type
    .replace(/^lambda_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function prettyTypeValueComment(
  block: Blockly.Block,
  report: LambdaInferenceReport,
  valueForBlock: ValueProvider = safeReducedValue
): string {
  const inferredType = report.blockTypes.get(block.id) ?? 'unknown';
  const issues = report.blockIssues.get(block.id) ?? [];
  const value = valueForBlock(block);
  const status = issues.length > 0 ? 'Type issues found' : 'Well typed';

  const sections = [
    'Block Lambda Type Info',
    '======================',
    '',
    'Block',
    '-----',
    indent(`${prettyBlockName(block)}\n${block.type}`),
    '',
    'Polymorphic Type',
    '----------------',
    indent(inferredType),
    '',
    'Value',
    '-----',
    indent(value),
    '',
    'Status',
    '------',
    indent(status)
  ];

  if (issues.length > 0) {
    sections.push('', 'Issues', '------', indent(issues.map((issue) => `- ${issue}`).join('\n')));
  }

  return sections.join('\n');
}

export function syncTypeInfoComments(
  workspace: Blockly.WorkspaceSvg,
  report: LambdaInferenceReport,
  valueForBlock: ValueProvider = contextualValueProvider(workspace)
): number {
  const blocks = workspace.getAllBlocks(false).filter(isCommentableLambdaBlock);

  Blockly.Events.disable();
  try {
    for (const block of blocks) {
      const nextComment = prettyTypeValueComment(block, report, valueForBlock);
      if (block.getCommentText() !== nextComment) {
        block.setCommentText(nextComment);
      }
    }
  } finally {
    Blockly.Events.enable();
  }

  return blocks.length;
}

export function showTypeInfoForBlock(
  workspace: Blockly.WorkspaceSvg,
  block: Blockly.Block,
  setStatus: StatusSink = () => undefined
): void {
  const report = annotateLambdaWorkspaceTypes(workspace);
  const message = prettyTypeValueComment(block, report, contextualValueProvider(workspace));
  window.alert(message);

  const inferredType = report.blockTypes.get(block.id) ?? 'unknown';
  const issueCount = report.blockIssues.get(block.id)?.length ?? 0;
  setStatus(
    issueCount > 0
      ? `Shown type/value for ${block.type}; ${issueCount} type issue${issueCount === 1 ? '' : 's'}.`
      : `Shown type/value for ${block.type}: ${inferredType}.`
  );
}
