import * as Blockly from 'blockly';
import { reducedTextForBlock } from '../semantics/lambdaReduction';
import { annotateLambdaWorkspaceTypes, type LambdaInferenceReport } from '../type-inference/lambdaTypeInference';

type StatusSink = (message: string) => void;

type ValueProvider = (block: Blockly.Block) => string;

export function isCommentableLambdaBlock(block: Blockly.Block): boolean {
  return Boolean(block.outputConnection) && block.type.startsWith('lambda_') && block.type !== 'lambda_viz_description';
}

function safeReducedValue(block: Blockly.Block): string {
  try {
    return reducedTextForBlock(block, 'value');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Could not compute value: ${message}`;
  }
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
    'Type',
    '----',
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
  valueForBlock: ValueProvider = safeReducedValue
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
  const message = prettyTypeValueComment(block, report);
  window.alert(message);

  const inferredType = report.blockTypes.get(block.id) ?? 'unknown';
  const issueCount = report.blockIssues.get(block.id)?.length ?? 0;
  setStatus(
    issueCount > 0
      ? `Shown type/value for ${block.type}; ${issueCount} type issue${issueCount === 1 ? '' : 's'}.`
      : `Shown type/value for ${block.type}: ${inferredType}.`
  );
}
