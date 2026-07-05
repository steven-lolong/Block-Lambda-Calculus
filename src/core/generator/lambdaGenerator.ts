import * as Blockly from 'blockly';
import { isLambdaTermBlock, lambdaTermText } from './lambdaTermText';

export type LambdaCodeGenerationOptions = {
  includeTypeAnnotations?: boolean;
  typeForBlock?: (block: Blockly.Block) => string | undefined;
  errorForBlock?: (block: Blockly.Block) => string | undefined;
};

function withTypeAnnotation(block: Blockly.Block, code: string, options: LambdaCodeGenerationOptions): string {
  if (!options.includeTypeAnnotations) return code;

  const error = options.errorForBlock?.(block);
  if (error) return `-- Type error: ${error}\n${code}`;

  const inferredType = options.typeForBlock?.(block);
  if (inferredType) return `-- Type: ${inferredType}\n${code}`;

  return code;
}

export function generateLambdaCode(
  workspace: Blockly.Workspace,
  options: LambdaCodeGenerationOptions = {}
): string {
  const topBlocks = workspace
    .getTopBlocks(true)
    .filter((block) => !block.getParent() && isLambdaTermBlock(block));

  if (topBlocks.length === 0) {
    return '-- Drag or click blocks from the toolbox to generate Lambda code.';
  }

  return topBlocks.map((block) => withTypeAnnotation(block, lambdaTermText(block), options)).join('\n\n');
}
