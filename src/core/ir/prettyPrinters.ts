/**
 * Pretty-printers for Core and ANF. Output `{ html, text }` following the
 * pattern of `../generator/lambdaFormalGenerator.ts`, suitable for rendering
 * in the Inspector tabs.
 *
 * Both treat types as optional metadata (not printed) — the tabs will render
 * them separately. The text form is the main readable output.
 */
import type { CoreTerm } from './core';
import type { AnfAtom, AnfBinding, AnfComp, AnfExpr, AnfProgram } from './anf';
import type { IRType } from './types';

export interface IRFormalization {
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A type-variable namer that assigns 'a, 'b, … by first occurrence within a
 * single printout — the same scheme as `createTypePrinter` in
 * lambdaTypeInference.ts, so the Lowering tab's variable letters agree with
 * the Types tab's instead of exposing raw inference ids. Stateful, so one is
 * created per top-level pretty-print call.
 */
type TypeFormatter = (type: IRType) => string;

function makeTypeFormatter(): TypeFormatter {
  const names = new Map<number, string>();
  const nameOf = (id: number): string => {
    const existing = names.get(id);
    if (existing) return existing;
    const index = names.size;
    const letter = String.fromCharCode(97 + (index % 26));
    const suffix = index >= 26 ? String(Math.floor(index / 26)) : '';
    const name = `'${letter}${suffix}`;
    names.set(id, name);
    return name;
  };
  const format = (type: IRType): string => {
    switch (type.kind) {
      case 'tvar':
        return nameOf(type.id);
      case 'tcon':
        return type.name;
      case 'tfun': {
        const from = type.from.kind === 'tfun' ? `(${format(type.from)})` : format(type.from);
        return `${from} -> ${format(type.to)}`;
      }
    }
  };
  return format;
}

/* ============================================================================
   Core pretty-printer
   ============================================================================ */

/** Check if a Core term extends rightward and needs parens in operand position. */
function isRightOpen(core: CoreTerm): boolean {
  return core.kind === 'abs' || core.kind === 'let' || core.kind === 'letrec' || core.kind === 'if';
}

/** Pretty-print a Core term, parenthesizing when needed in operand position. */
function coreTextOperand(core: CoreTerm, formatType: TypeFormatter): string {
  const text = coreText(core, formatType);
  return isRightOpen(core) ? `(${text})` : text;
}

function coreText(core: CoreTerm, formatType: TypeFormatter): string {
  switch (core.kind) {
    case 'var':
      return core.name;

    case 'num':
      return String(core.value);

    case 'bool':
      return core.value ? 'true' : 'false';

    case 'abs': {
      const paramStr = core.paramTy ? `${core.param}: ${formatType(core.paramTy)}` : core.param;
      return `λ${paramStr}. ${coreText(core.body, formatType)}`;
    }

    case 'app': {
      const fn = coreTextOperand(core.func, formatType);
      const arg = coreTextOperand(core.arg, formatType);
      return `(${fn} ${arg})`;
    }

    case 'let': {
      const value = coreText(core.value, formatType);
      const body = coreText(core.body, formatType);
      return `let ${core.name} = ${value} in ${body}`;
    }

    case 'letrec': {
      const value = coreText(core.value, formatType);
      const body = coreText(core.body, formatType);
      return `letrec ${core.name} = ${value} in ${body}`;
    }

    case 'prim': {
      const left = coreTextOperand(core.left, formatType);
      const right = coreTextOperand(core.right, formatType);
      return `(${left} ${core.op} ${right})`;
    }

    case 'if': {
      const cond = coreText(core.cond, formatType);
      const thenB = coreText(core.then, formatType);
      const elseB = coreText(core.else, formatType);
      return `if ${cond} then ${thenB} else ${elseB}`;
    }

    case 'hole':
      return `□`;
  }
}

export function prettyPrintCore(core: CoreTerm): IRFormalization {
  const text = coreText(core, makeTypeFormatter());
  const html = `<code class="ir-listing">${escapeHtml(text)}</code>`;
  return { html, text };
}

/* ============================================================================
   ANF pretty-printer
   ============================================================================ */

function anfAtomText(atom: AnfAtom): string {
  switch (atom.kind) {
    case 'var':
      return atom.name;
    case 'num':
      return String(atom.value);
    case 'bool':
      return atom.value ? 'true' : 'false';
    case 'lam':
      return `λ${atom.param}. ${anfExprText(atom.body)}`;
    case 'force':
      return `force ${atom.name}`;
    case 'hole':
      return '□';
  }
}

function anfCompText(comp: AnfComp): string {
  switch (comp.kind) {
    case 'app':
      return `(${anfAtomText(comp.func)} ${anfAtomText(comp.arg)})`;
    case 'prim':
      return `(${anfAtomText(comp.left)} ${comp.op} ${anfAtomText(comp.right)})`;
    case 'if':
      return `if ${anfAtomText(comp.cond)} then ${anfExprText(comp.then)} else ${anfExprText(comp.else)}`;
  }
}

function anfBindingText(binding: AnfBinding): string {
  switch (binding.kind) {
    case 'atom':
      return anfAtomText(binding.atom);
    case 'comp':
      return anfCompText(binding.comp);
    case 'susp':
      return `thunk{ ${anfExprText(binding.body)} }`;
  }
}

function anfExprText(expr: AnfExpr): string {
  switch (expr.kind) {
    case 'ret':
      return anfAtomText(expr.atom);

    case 'tail':
      return anfCompText(expr.comp);

    case 'let': {
      const rhs = anfBindingText(expr.rhs);
      const body = anfExprText(expr.body);
      return `let ${expr.name} = ${rhs} in ${body}`;
    }

    case 'letrec': {
      const rhs = anfBindingText(expr.rhs);
      const body = anfExprText(expr.body);
      return `letrec ${expr.name} = ${rhs} in ${body}`;
    }
  }
}

export function prettyPrintAnfExpr(expr: AnfExpr): IRFormalization {
  const text = anfExprText(expr);
  const html = `<code class="ir-listing">${escapeHtml(text)}</code>`;
  return { html, text };
}

export function prettyPrintAnfProgram(prog: AnfProgram): IRFormalization {
  const header = `-- Strategy: ${prog.strategy}\n`;
  const body = anfExprText(prog.body);
  const text = header + body;
  const html = `<code class="ir-listing">${escapeHtml(text)}</code>`;
  return { html, text };
}
