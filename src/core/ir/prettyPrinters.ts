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
import type { ClosAtom, ClosBinding, ClosCode, ClosComp, ClosExpr, ClosProgram } from './clos';
import type { FirAtom, FirBinding, FirComp, FirExpr, FirFunc, FirProgram } from './fir';
import type { BasicBlock, CfgFunc, CfgInstr, CfgProgram, Terminator, VReg } from './lir';
import type { Instr, Reg, VmProgram, VmValue } from './isa';
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
export type TypeFormatter = (type: IRType) => string;

export function makeTypeFormatter(): TypeFormatter {
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
      case 'tprod':
        return `⟨${type.items.map(format).join(', ')}⟩`;
      case 'tcode':
        return `(${format(type.env)}, ${format(type.param)}) -> ${format(type.result)}`;
      case 'texists':
        return `∃'g. ${format(type.body)}`;
      case 'tclos': {
        const from = type.from.kind === 'tfun' || type.from.kind === 'tclos'
          ? `(${format(type.from)})`
          : format(type.from);
        return `${from} ⇒ ${format(type.to)}`;
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

/* ============================================================================
   Closure IR pretty-printer
   ============================================================================ */

function closAtomText(atom: ClosAtom): string {
  switch (atom.kind) {
    case 'var':
      return atom.name;
    case 'num':
      return String(atom.value);
    case 'bool':
      return atom.value ? 'true' : 'false';
    case 'proj':
      return `proj(${atom.env}, ${atom.index})`;
    case 'force':
      return `force ${atom.name}`;
    case 'hole':
      return '□';
    case 'clos':
      return `clos(${closCodeText(atom.code)}, ⟨${atom.env.map(closAtomText).join(', ')}⟩)`;
  }
}

function closCodeText(code: ClosCode): string {
  return `λ(${code.envParam}, ${code.param}). ${closExprText(code.body)}`;
}

function closCompText(comp: ClosComp): string {
  switch (comp.kind) {
    case 'callclos':
      return `callclos(${closAtomText(comp.clos)}, ${closAtomText(comp.arg)})`;
    case 'prim':
      return `(${closAtomText(comp.left)} ${comp.op} ${closAtomText(comp.right)})`;
    case 'if':
      return `if ${closAtomText(comp.cond)} then ${closExprText(comp.then)} else ${closExprText(comp.else)}`;
  }
}

function closBindingText(binding: ClosBinding): string {
  switch (binding.kind) {
    case 'atom':
      return closAtomText(binding.atom);
    case 'comp':
      return closCompText(binding.comp);
    case 'susp':
      return `thunk{ ${closExprText(binding.body)} }`;
  }
}

function closExprText(expr: ClosExpr): string {
  switch (expr.kind) {
    case 'ret':
      return closAtomText(expr.atom);
    case 'tail':
      return closCompText(expr.comp);
    case 'let':
      return `let ${expr.name} = ${closBindingText(expr.rhs)} in ${closExprText(expr.body)}`;
    case 'letrec':
      return `letrec ${expr.name} = ${closBindingText(expr.rhs)} in ${closExprText(expr.body)}`;
  }
}

export function prettyPrintClosProgram(prog: ClosProgram): IRFormalization {
  const header = `-- Strategy: ${prog.strategy}\n`;
  const body = closExprText(prog.body);
  const text = header + body;
  const html = `<code class="ir-listing">${escapeHtml(text)}</code>`;
  return { html, text };
}

/* ============================================================================
   First-order IR pretty-printer
   ============================================================================ */

function firAtomText(atom: FirAtom): string {
  switch (atom.kind) {
    case 'var':
      return atom.name;
    case 'num':
      return String(atom.value);
    case 'bool':
      return atom.value ? 'true' : 'false';
    case 'proj':
      return `proj(${atom.env}, ${atom.index})`;
    case 'force':
      return `force ${atom.name}`;
    case 'hole':
      return '□';
    case 'clos':
      return `clos(${atom.code}, ⟨${atom.env.map(firAtomText).join(', ')}⟩)`;
  }
}

function firCompText(comp: FirComp): string {
  switch (comp.kind) {
    case 'callclos':
      return `callclos(${firAtomText(comp.clos)}, ${firAtomText(comp.arg)})`;
    case 'prim':
      return `(${firAtomText(comp.left)} ${comp.op} ${firAtomText(comp.right)})`;
    case 'if':
      return `if ${firAtomText(comp.cond)} then ${firExprText(comp.then)} else ${firExprText(comp.else)}`;
  }
}

function firBindingText(binding: FirBinding): string {
  switch (binding.kind) {
    case 'atom':
      return firAtomText(binding.atom);
    case 'comp':
      return firCompText(binding.comp);
    case 'susp':
      return `thunk{ ${firExprText(binding.body)} }`;
  }
}

function firExprText(expr: FirExpr): string {
  switch (expr.kind) {
    case 'ret':
      return firAtomText(expr.atom);
    case 'tail':
      return firCompText(expr.comp);
    case 'let':
      return `let ${expr.name} = ${firBindingText(expr.rhs)} in ${firExprText(expr.body)}`;
    case 'letrec':
      return `letrec ${expr.name} = ${firBindingText(expr.rhs)} in ${firExprText(expr.body)}`;
  }
}

function firFuncText(func: FirFunc): string {
  return `${func.label}(${func.envParam}, ${func.param}) =\n  ${firExprText(func.body)}`;
}

export function prettyPrintFirProgram(prog: FirProgram): IRFormalization {
  const header = `-- Strategy: ${prog.strategy}\n`;
  const functionsText = prog.functions.map(firFuncText).join('\n\n');
  const mainText = `main =\n  ${firExprText(prog.main)}`;
  const text = header + (functionsText ? `${functionsText}\n\n` : '') + mainText;
  const html = `<code class="ir-listing">${escapeHtml(text)}</code>`;
  return { html, text };
}

/* ============================================================================
   Low IR / CFG pretty-printer (step 3.6)
   ============================================================================ */

export function vregText(reg: VReg): string {
  return reg.hint ? `%${reg.id}<${reg.hint}>` : `%${reg.id}`;
}

/** One straight-line instruction, register-machine mnemonic style — also the
 *  per-block content the CFG diagram (cfgPanel.ts) renders inside each box. */
export function cfgInstrText(ins: CfgInstr): string {
  switch (ins.kind) {
    case 'const':
      return `${vregText(ins.dst)} = const ${ins.value === null ? 'null' : ins.value}`;
    case 'bin':
      return `${vregText(ins.dst)} = ${vregText(ins.left)} ${ins.op} ${vregText(ins.right)}`;
    case 'move':
      return `${vregText(ins.dst)} = ${vregText(ins.src)}`;
    case 'alloc':
      return `${vregText(ins.dst)} = alloc ${ins.size}`;
    case 'load':
      return `${vregText(ins.dst)} = load ${vregText(ins.base)}[${ins.index}]`;
    case 'store':
      return `store ${vregText(ins.base)}[${ins.index}] = ${vregText(ins.src)}`;
    case 'loadcode':
      return `${vregText(ins.dst)} = loadcode ${ins.label}`;
    case 'callclos':
      return `${vregText(ins.dst)} = callclos ${vregText(ins.clos)} ${vregText(ins.arg)}`;
    case 'force':
      return `${vregText(ins.dst)} = force ${vregText(ins.src)}`;
  }
}

/** A block's one control transfer — also used by the CFG diagram to label
 *  each edge (`condbr` splits into a "T"/"F" pair). */
export function cfgTerminatorText(term: Terminator): string {
  switch (term.kind) {
    case 'ret':
      return `ret ${vregText(term.value)}`;
    case 'br':
      return term.args.length === 0 ? `br ${term.target}` : `br ${term.target}(${term.args.map(vregText).join(', ')})`;
    case 'condbr':
      return `condbr ${vregText(term.cond)} ? ${term.then} : ${term.else}`;
    case 'tailcallclos':
      return `tailcallclos ${vregText(term.clos)} ${vregText(term.arg)}`;
  }
}

function cfgBlockText(block: BasicBlock): string {
  const header = block.params.length ? `${block.id}(${block.params.map(vregText).join(', ')}):` : `${block.id}:`;
  const lines = [header, ...block.instrs.map((i) => `  ${cfgInstrText(i)}`), `  ${cfgTerminatorText(block.terminator)}`];
  return lines.join('\n');
}

function cfgFuncText(func: CfgFunc): string {
  const abi = [func.env ? `env=${vregText(func.env)}` : null, func.param ? `param=${vregText(func.param)}` : null]
    .filter((s): s is string => s !== null)
    .join(', ');
  const header = `${func.label} [${func.kind}]${abi ? ` (${abi})` : ''}:`;
  return `${header}\n${func.blocks.map(cfgBlockText).join('\n')}`;
}

export function prettyPrintCfgProgram(prog: CfgProgram): IRFormalization {
  const header = `-- Strategy: ${prog.strategy}\n\n`;
  const text = header + [...prog.functions, prog.main].map(cfgFuncText).join('\n\n');
  const html = `<code class="ir-listing">${escapeHtml(text)}</code>`;
  return { html, text };
}

/* ============================================================================
   Register bytecode (VmProgram) pretty-printer — the Assembly stage (3.6)
   ============================================================================ */

function vmConstText(v: VmValue): string {
  switch (v.tag) {
    case 'int':
      return String(v.n);
    case 'bool':
      return v.b ? 'true' : 'false';
    case 'code':
      return `&code#${v.code}`;
    case 'ptr':
      return `ptr#${v.addr}`;
    case 'null':
      return 'null';
  }
}

/** One physical-register instruction, at flat code index `index` (so a jump's
 *  self-relative offset can print as the absolute target it lands on) —
 *  shared by the Assembly listing and the Machine-code pane's per-word label. */
export function asmInstrText(ins: Instr, index: number, prog: VmProgram): string {
  const r = (reg: Reg): string => `r${reg}`;
  switch (ins.op) {
    case 'Const':
      return `${r(ins.dst)} = const ${vmConstText(prog.constants[ins.k])}`;
    case 'Move':
      return `${r(ins.dst)} = ${r(ins.src)}`;
    case 'Bin':
      return `${r(ins.dst)} = ${r(ins.left)} ${ins.prim} ${r(ins.right)}`;
    case 'Alloc':
      return `${r(ins.dst)} = alloc ${ins.size}`;
    case 'Load':
      return `${r(ins.dst)} = [${r(ins.base)}+${ins.off}]`;
    case 'Store':
      return `[${r(ins.base)}+${ins.off}] = ${r(ins.src)}`;
    case 'LoadCode':
      return `${r(ins.dst)} = &${prog.functions[ins.code]?.label ?? `code#${ins.code}`}`;
    case 'CallClos':
      return `${r(ins.dst)} = callclos ${r(ins.clos)} ${r(ins.arg)}`;
    case 'TailCallClos':
      return `tailcallclos ${r(ins.clos)} ${r(ins.arg)}`;
    case 'Force':
      return `${r(ins.dst)} = force ${r(ins.thunk)}`;
    case 'TailForce':
      return `tailforce ${r(ins.thunk)}`;
    case 'Ret':
      return `ret ${r(ins.src)}`;
    case 'Jmp':
      return `jmp #${index + ins.target}`;
    case 'JmpIf':
      return `jmpif ${r(ins.cond)}, #${index + ins.target}`;
    case 'Spill':
      return `spill [${ins.slot}] = ${r(ins.src)}`;
    case 'Reload':
      return `${r(ins.dst)} = [${ins.slot}]`;
  }
}

/** The kind label an `asmInstrText`-style listing shows at a function's entry
 *  point — `CodeEntry` keeps only `arity` (0/1), not the closure/thunk/main
 *  distinction `CfgFunc.kind` had, so `main` is recovered by its reserved
 *  label and everything else falls out of arity. */
export function asmFuncKind(label: string, arity: 0 | 1): 'thunk' | 'main' | 'closure' {
  // `main` must be checked first: it is arity 0 (no param) just like a thunk, so
  // an arity-first test would mislabel the program entry as `thunk`.
  if (label === 'main') return 'main';
  return arity === 0 ? 'thunk' : 'closure';
}

export function prettyPrintVmProgram(prog: VmProgram): IRFormalization {
  const byEntry = new Map(prog.functions.map((f) => [f.entry, f]));
  const lines: string[] = [`-- Strategy: ${prog.strategy}`, ''];
  prog.code.forEach((ins, i) => {
    const entry = byEntry.get(i);
    if (entry) {
      lines.push(`${entry.label}:  ; ${asmFuncKind(entry.label, entry.arity)}, regs=${entry.regCount}, slots=${entry.slotCount}`);
    }
    lines.push(`  ${String(i).padStart(3, ' ')}: ${asmInstrText(ins, i, prog)}`);
  });
  const text = lines.join('\n');
  const html = `<code class="ir-listing">${escapeHtml(text)}</code>`;
  return { html, text };
}
