import * as Blockly from 'blockly';
import type { LambdaInferenceReport } from '../type-inference/lambdaTypeInference';
import { childBlock as child, fieldText as field, isLambdaTermBlock, lambdaTermText as term } from './lambdaTermText';

export type LambdaFormalization = {
  html: string;
  text: string;
};

type Derivation = {
  html: string;
  text: string;
  term: string;
  type: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function typeOf(block: Blockly.Block, report: LambdaInferenceReport): string {
  return report.topLevelTypes.get(block.id) ?? report.blockTypes.get(block.id) ?? 'unknown';
}

function errorsOf(block: Blockly.Block, report: LambdaInferenceReport): string[] {
  return report.blockIssues.get(block.id) ?? [];
}

function typeOfChild(block: Blockly.Block, inputName: string, report: LambdaInferenceReport): string {
  const target = child(block, inputName);
  return target ? typeOf(target, report) : 'unknown';
}

function splitFunctionType(type: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < type.length; i += 1) {
    const char = type[i];
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && type.startsWith(' -> ', i)) {
      return [type.slice(0, i).trim(), type.slice(i + 4).trim()];
    }
  }
  return null;
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function judgement(termValue: string, typeValue: string, hasErrors = false): string {
  const turnstile = hasErrors ? '⊬' : '⊢';
  const typeClass = hasErrors ? ' formal-type-error' : '';
  return [
    '<div class="formal-judgement">',
    '<span class="formal-gamma">Γ</span> ',
    `<span class="formal-turnstile">${turnstile}</span> `,
    `<span class="formal-term">${escapeHtml(termValue)}</span>`,
    ' : ',
    `<span class="formal-type${typeClass}">${escapeHtml(typeValue)}</span>`,
    '</div>'
  ].join('');
}

function splitter(ruleName: string): string {
  return `<hr class="hr-text" data-content="${escapeHtml(ruleName)}">`;
}

function premise(label: string, derivation: Derivation): string {
  return [
    '<fieldset class="fieldset-lambda">',
    `<legend class="legend-lambda"><span>${escapeHtml(label)}</span></legend>`,
    derivation.html,
    '</fieldset>'
  ].join('');
}

function assumption(label: string, statement: string): string {
  return [
    '<div class="formal-assumption">',
    `<span class="formal-assumption-label">${escapeHtml(label)}</span>`,
    `<span>${escapeHtml(statement)}</span>`,
    '</div>'
  ].join('');
}

function environmentPremise(name: string, typeValue: string, membership: string, hasErrors = false): string {
  const typeClass = hasErrors ? ' formal-type-error' : '';
  return [
    '<div class="formal-env-premise">',
    `<span class="formal-term">${escapeHtml(name)}</span>`,
    ' : ',
    `<span class="formal-type${typeClass}">${escapeHtml(typeValue)}</span>`,
    ' ',
    `<span class="formal-turnstile">${escapeHtml(membership)}</span>`,
    ' ',
    '<span class="formal-gamma">Γ</span>',
    '</div>'
  ].join('');
}

function varRuleLine(): string {
  return [
    '<div class="formal-var-line-row">',
    '<span class="formal-var-line"></span>',
    '<span class="formal-var-label">T-Var</span>',
    '</div>'
  ].join('');
}

function issueList(errors: string[]): string {
  if (errors.length === 0) return '';
  return [
    '<ul class="formal-issues">',
    ...errors.map((error) => `<li>${escapeHtml(error)}</li>`),
    '</ul>'
  ].join('');
}

function renderRule(
  ruleName: string,
  termValue: string,
  typeValue: string,
  premises: { label: string; derivation: Derivation }[],
  errors: string[] = [],
  extraHtml = '',
  extraText = ''
): Derivation {
  const premiseHtml = premises.length > 0
    ? `<div class="formal-premises">${premises.map(({ label, derivation }) => premise(label, derivation)).join('')}</div>`
    : '';
  const premiseText = premises.length > 0
    ? premises.map(({ label, derivation }) => `[${label}]\n${indent(derivation.text)}`).join('\n')
    : '';
  const errorText = errors.length > 0 ? `\nIssues:\n${errors.map((error) => `- ${error}`).join('\n')}` : '';
  const spacer = premiseText && extraText ? '\n' : '';

  return {
    html: `${extraHtml}${premiseHtml}${splitter(ruleName)}${judgement(termValue, typeValue, errors.length > 0)}${issueList(errors)}`,
    text: `${extraText}${spacer}${premiseText}${premiseText || extraText ? '\n' : ''}--- ${ruleName} ---\nΓ ${errors.length > 0 ? '|/-' : '|-'} ${termValue} : ${typeValue}${errorText}`,
    term: termValue,
    type: typeValue
  };
}

function renderVarRule(
  termValue: string,
  typeValue: string,
  name: string,
  membership: string,
  premiseText: string,
  errors: string[] = []
): Derivation {
  const errorText = errors.length > 0 ? `\nIssues:\n${errors.map((error) => `- ${error}`).join('\n')}` : '';
  return {
    html: [
      '<div class="formal-var-rule">',
      '<div class="formal-var-core">',
      environmentPremise(name, typeValue, membership, errors.length > 0),
      varRuleLine(),
      judgement(termValue, typeValue, errors.length > 0),
      '</div>',
      '</div>',
      issueList(errors)
    ].join(''),
    text: `${premiseText}\n--- T-Var ---\nΓ ${errors.length > 0 ? '|/-' : '|-'} ${termValue} : ${typeValue}${errorText}`,
    term: termValue,
    type: typeValue
  };
}

function missingDerivation(inputName: string): Derivation {
  return renderRule(
    'T-Hole',
    '□',
    'unknown',
    [],
    [`Missing ${inputName.toLowerCase()} input.`],
    '<div class="formal-hole">□</div>',
    '□'
  );
}

function childDerivation(block: Blockly.Block, inputName: string, report: LambdaInferenceReport): Derivation {
  const target = child(block, inputName);
  return target ? deriveBlock(target, report) : missingDerivation(inputName);
}

function deriveBlock(block: Blockly.Block, report: LambdaInferenceReport): Derivation {
  const blockTerm = term(block);
  const blockType = typeOf(block, report);
  const errors = errorsOf(block, report);

  switch (block.type) {
    case 'lambda_variable': {
      const name = field(block, 'NAME', 'x');
      const membership = errors.some((error) => error.startsWith('Unbound variable')) ? '∉' : '∈';
      const premiseText = `${name} : ${blockType} ${membership} Γ`;
      return renderVarRule(blockTerm, blockType, name, membership, premiseText, errors);
    }

    case 'lambda_abstraction': {
      const body = childDerivation(block, 'BODY', report);
      const parameter = field(block, 'PARAM', 'x');
      const splitType = splitFunctionType(blockType);
      const parameterType = splitType?.[0] ?? 'unknown';
      const assumptionHtml = assumption('assume', `${parameter} : ${parameterType}`);
      const assumptionText = `assume: ${parameter} : ${parameterType}`;
      return renderRule(
        'T-Abs',
        blockTerm,
        blockType,
        [{ label: 'body', derivation: body }],
        errors,
        assumptionHtml,
        assumptionText
      );
    }

    case 'lambda_application':
      return renderRule(
        'T-App',
        blockTerm,
        blockType,
        [
          { label: 'function', derivation: childDerivation(block, 'FUNC', report) },
          { label: 'argument', derivation: childDerivation(block, 'ARG', report) }
        ],
        errors
      );

    case 'lambda_parentheses':
      return renderRule(
        'T-Paren',
        blockTerm,
        blockType,
        [{ label: 'term', derivation: childDerivation(block, 'TERM', report) }],
        errors
      );

    case 'lambda_let': {
      const name = field(block, 'NAME', 'id');
      const valueType = typeOfChild(block, 'VALUE', report);
      const assumptionHtml = assumption('bind', `${name} : ${valueType}`);
      const assumptionText = `bind: ${name} : ${valueType}`;
      return renderRule(
        'T-Let',
        blockTerm,
        blockType,
        [
          { label: 'value', derivation: childDerivation(block, 'VALUE', report) },
          { label: 'body', derivation: childDerivation(block, 'BODY', report) }
        ],
        errors,
        assumptionHtml,
        assumptionText
      );
    }

    case 'lambda_letrec': {
      const name = field(block, 'NAME', 'f');
      const valueType = typeOfChild(block, 'VALUE', report);
      const assumptionHtml = assumption('recursive bind', `${name} : ${valueType}`);
      const assumptionText = `recursive bind: ${name} : ${valueType}`;
      return renderRule(
        'T-LetRec',
        blockTerm,
        blockType,
        [
          { label: 'definition', derivation: childDerivation(block, 'VALUE', report) },
          { label: 'body', derivation: childDerivation(block, 'BODY', report) }
        ],
        errors,
        assumptionHtml,
        assumptionText
      );
    }

    case 'lambda_number':
      return renderRule('T-Int', blockTerm, blockType, [], errors);

    case 'lambda_boolean':
      return renderRule('T-Bool', blockTerm, blockType, [], errors);

    case 'lambda_number_operator':
      return renderRule(
        'T-NumOp',
        blockTerm,
        blockType,
        [
          { label: 'left', derivation: childDerivation(block, 'LEFT', report) },
          { label: 'right', derivation: childDerivation(block, 'RIGHT', report) }
        ],
        errors
      );

    case 'lambda_boolean_operator': {
      const ruleName = field(block, 'OP', 'and') === '=' ? 'T-Eq' : 'T-BoolOp';
      return renderRule(
        ruleName,
        blockTerm,
        blockType,
        [
          { label: 'left', derivation: childDerivation(block, 'LEFT', report) },
          { label: 'right', derivation: childDerivation(block, 'RIGHT', report) }
        ],
        errors
      );
    }

    case 'lambda_if':
      return renderRule(
        'T-If',
        blockTerm,
        blockType,
        [
          { label: 'condition', derivation: childDerivation(block, 'COND', report) },
          { label: 'then', derivation: childDerivation(block, 'THEN', report) },
          { label: 'else', derivation: childDerivation(block, 'ELSE', report) }
        ],
        errors
      );

    default:
      return renderRule('T-Unsupported', blockTerm, blockType, [], [`Unsupported Lambda block '${block.type}'.`]);
  }
}

export function generateLambdaFormalization(
  workspace: Blockly.Workspace,
  report: LambdaInferenceReport
): LambdaFormalization {
  const topBlocks = workspace
    .getTopBlocks(true)
    .filter((block) => !block.getParent() && isLambdaTermBlock(block));

  if (topBlocks.length === 0) {
    const empty = 'Drag or click blocks from the toolbox to generate a formal derivation.';
    return {
      html: `<div class="formal-derivation"><div class="formal-empty">${escapeHtml(empty)}</div></div>`,
      text: empty
    };
  }

  const derivations = topBlocks.map((block) => deriveBlock(block, report));
  return {
    html: [
      '<div class="formal-derivation">',
      ...derivations.map((derivation, index) => [
        '<section class="formal-root">',
        `<h3>Term ${index + 1}</h3>`,
        derivation.html,
        '</section>'
      ].join('')),
      '</div>'
    ].join(''),
    text: derivations
      .map((derivation, index) => `Term ${index + 1}\n${derivation.text}`)
      .join('\n\n')
  };
}
