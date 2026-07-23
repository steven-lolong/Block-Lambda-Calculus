/**
 * AnfExpr -> ClosExpr (step 2.3): type-preserving closure conversion.
 *
 * The whole rewrite is local. Only two node shapes actually change; everything
 * else is copied structurally (a `var`/`force`/`num`/`bool` atom converts to
 * itself), which is what keeps this pass small:
 *
 *   - ANF `lam`  ->  `clos { code, env }`.  `env` is the lambda's ordered free
 *     variables as `var` atoms (`orderedFreeVars`, step 2.2). `code` is closed
 *     and opens with a projection preamble — `let yᵢ = proj(envParam, i)` for
 *     each captured `yᵢ` — so the rest of the body is textually the original
 *     ANF, still referring to `yᵢ` by name (still `force yᵢ` under CbS). This
 *     is the Minamide–Morrisett–Harper translation, whose type action is the
 *     arrow homomorphism `translateType`: `⟦A→B⟧ = ⟦A⟧ ⇒ ⟦B⟧`.
 *   - ANF `app`  ->  `callclos` (unpack the closure and apply its code).
 *
 * Recursion — the "known functions by label" discipline (see `fir.ts`):
 *   - Under **call-by-value** a `letrec` binds a bare `lam` (see `toAnf`).
 *     Its name joins `globals`, so the lambda never captures *itself*: a closed
 *     recursive function (factorial) gets an empty env. Self-references stay a
 *     bare `var fac`; `liftFunctions` (2.4) resolves them to the lifted label.
 *     The binding is emitted as a plain `let fac = clos{…}` (recursion is
 *     closed through the global label, not through the binding), so no `letrec`
 *     survives for a lambda.
 *   - Under **call-by-structure** a `letrec` always binds a `susp` thunk. It
 *     survives as a `letrec`, and the inner `lam` captures the recursive name
 *     normally through the cyclic thunk — no label machinery needed.
 *
 * Provenance: every synthesized node (`clos`, `proj`, `callclos`, each preamble
 * `let`) inherits the source ids of the ANF `lam`/`app` it implements, so the
 * closure IR stays block-traceable. Determinism: env layout follows
 * `orderedFreeVars` (first occurrence) and env params come from `FreshNames`.
 *
 * Types are best-effort here and made precise/checked in step 2.6
 * (`checkClos`): the arrow translation (`clos.ty`, `code.paramTy/resultTy`) is
 * exact whenever inference typed the lambda, while an env-slot type falls back
 * to a placeholder when a captured let-binding carried no inferred type.
 */
import type { AnfAtom, AnfBinding, AnfComp, AnfExpr, AnfProgram } from './anf';
import type { ClosAtom, ClosBinding, ClosCode, ClosComp, ClosExpr, ClosProgram } from './clos';
import type { IRProvenance } from './provenance';
import type { IRType } from './types';
import { orderedFreeVars } from './freeVars';
import { makeFreshNames, type FreshNames } from './freshNames';

type LamAtom = Extract<AnfAtom, { kind: 'lam' }>;

/** Env-slot type used when a captured binding carried no inferred type (see
 *  header). Harmless for value semantics; `checkClos` (2.6) is the real judge. */
const UNKNOWN_TY: IRType = { kind: 'tvar', id: 0 };

interface Ctx {
  /** letrec-lifted (call-by-value) global function names currently in scope. */
  globals: Set<string>;
  /** translated types of in-scope names, for filling env layouts (best-effort). */
  gamma: Map<string, IRType>;
  /** deterministic supply for env-parameter names. */
  fresh: FreshNames;
}

/* ------------------------------------------------------------ type translation */

/**
 * `⟦·⟧` — a homomorphism, identity everywhere except the source arrow, which
 * becomes the closure arrow: `⟦A→B⟧ = ⟦A⟧ ⇒ ⟦B⟧`. The closure-only formers are
 * mapped through too so the function is total, though `desugar`/`toAnf` never
 * emit them.
 */
export function translateType(ty: IRType): IRType {
  switch (ty.kind) {
    case 'tvar':
    case 'tcon':
      return ty;
    case 'tfun':
      return { kind: 'tclos', from: translateType(ty.from), to: translateType(ty.to) };
    case 'tclos':
      return { kind: 'tclos', from: translateType(ty.from), to: translateType(ty.to) };
    case 'tprod':
      return { kind: 'tprod', items: ty.items.map(translateType) };
    case 'tcode':
      return { kind: 'tcode', env: translateType(ty.env), param: translateType(ty.param), result: translateType(ty.result) };
    case 'texists':
      return { kind: 'texists', id: ty.id, body: translateType(ty.body) };
  }
}

/* ------------------------------------ provenance / type helpers (mirror toAnf) */

function prov(node: IRProvenance): { sourceId?: string; sourceAliases?: string[] } {
  return { sourceId: node.sourceId, sourceAliases: node.sourceAliases };
}

function translatedTy(node: { ty?: IRType }): { ty?: IRType } {
  return node.ty ? { ty: translateType(node.ty) } : {};
}

/* ------------------------------------------------- Clos constructors (typed) */

function aVar(name: string, src: IRProvenance, ty?: IRType): ClosAtom {
  return { kind: 'var', name, ...prov(src), ...(ty ? { ty } : {}) };
}
function aProj(env: string, index: number, src: IRProvenance): ClosAtom {
  return { kind: 'proj', env, index, ...prov(src) };
}
function eRet(atom: ClosAtom, src: IRProvenance): ClosExpr {
  return { kind: 'ret', atom, ...prov(src) };
}
function eTail(comp: ClosComp, src: IRProvenance): ClosExpr {
  return { kind: 'tail', comp, ...prov(src) };
}
function eLet(name: string, rhs: ClosBinding, body: ClosExpr, src: IRProvenance): ClosExpr {
  return { kind: 'let', name, rhs, body, ...prov(src) };
}
function eLetrec(name: string, rhs: ClosBinding, body: ClosExpr, src: IRProvenance): ClosExpr {
  return { kind: 'letrec', name, rhs, body, ...prov(src) };
}

/* --------------------------------------------------------- gamma bookkeeping */

function withGammaVar(ctx: Ctx, name: string, ty: IRType | undefined): Ctx {
  if (!ty) return ctx;
  const gamma = new Map(ctx.gamma);
  gamma.set(name, ty);
  return { ...ctx, gamma };
}

/** Best-effort translated type of a binding's value (for env-layout lookups). */
function bestBindingType(binding: AnfBinding): IRType | undefined {
  switch (binding.kind) {
    case 'atom':
      return binding.atom.ty ? translateType(binding.atom.ty) : undefined;
    case 'comp': {
      const c = binding.comp;
      if (c.kind === 'prim') return { kind: 'tcon', name: c.opKind === 'num' ? 'int' : 'bool' };
      if (c.kind === 'app' && c.func.ty?.kind === 'tfun') return translateType(c.func.ty.to);
      return undefined; // callclos of an untyped function / if: precise type lands in 2.6
    }
    case 'susp':
      return undefined; // a thunk's type is erased anyway (its erasure is the result type)
  }
}

/* ------------------------------------------------------------------- the pass */

/**
 * `λparam. body` with free variables `captured` -> a `clos { code, env }` atom.
 * `code` is closed over `(envParam, param)`; its body is `captured`'s
 * projection preamble followed by the converted `body`.
 */
function convertLam(lam: LamAtom, ctx: Ctx): ClosAtom {
  const captured = orderedFreeVars(lam.body, [lam.param, ...ctx.globals]);
  const envParam = ctx.fresh.fresh('env');

  const lamTy = lam.ty;
  const paramTy = lamTy?.kind === 'tfun' ? translateType(lamTy.from) : undefined;
  const resultTy = lamTy?.kind === 'tfun' ? translateType(lamTy.to) : undefined;
  const envLayout = captured.map((name) => ctx.gamma.get(name) ?? UNKNOWN_TY);

  // Inside the code, the param and each captured name (now a projection) are
  // the only value bindings; carry their types for any nested capture.
  const innerGamma = new Map<string, IRType>();
  if (paramTy) innerGamma.set(lam.param, paramTy);
  captured.forEach((name, i) => innerGamma.set(name, envLayout[i]));
  const innerCtx: Ctx = { globals: ctx.globals, gamma: innerGamma, fresh: ctx.fresh };

  // Projection preamble, outermost-first: `let y₀ = proj(env,0) in … in body`.
  let body = convertExpr(lam.body, innerCtx);
  for (let i = captured.length - 1; i >= 0; i -= 1) {
    body = eLet(captured[i], { kind: 'atom', atom: aProj(envParam, i, lam) }, body, lam);
  }

  const code: ClosCode = {
    envParam,
    envLayout,
    param: lam.param,
    ...(paramTy ? { paramTy } : {}),
    ...(resultTy ? { resultTy } : {}),
    body,
    ...prov(lam)
  };
  const env = captured.map((name) => aVar(name, lam, ctx.gamma.get(name)));
  return { kind: 'clos', code, env, ...prov(lam), ...translatedTy(lam) };
}

function convertAtom(atom: AnfAtom, ctx: Ctx): ClosAtom {
  switch (atom.kind) {
    case 'var':
      return { kind: 'var', name: atom.name, ...prov(atom), ...translatedTy(atom) };
    case 'num':
      return { kind: 'num', value: atom.value, ...prov(atom), ...translatedTy(atom) };
    case 'bool':
      return { kind: 'bool', value: atom.value, ...prov(atom), ...translatedTy(atom) };
    case 'force':
      return { kind: 'force', name: atom.name, ...prov(atom), ...translatedTy(atom) };
    case 'hole':
      return { kind: 'hole', label: atom.label, ...prov(atom) };
    case 'lam':
      return convertLam(atom, ctx);
  }
}

function convertComp(comp: AnfComp, ctx: Ctx): ClosComp {
  switch (comp.kind) {
    case 'app':
      return { kind: 'callclos', clos: convertAtom(comp.func, ctx), arg: convertAtom(comp.arg, ctx), ...prov(comp) };
    case 'prim':
      return {
        kind: 'prim', opKind: comp.opKind, op: comp.op,
        left: convertAtom(comp.left, ctx), right: convertAtom(comp.right, ctx), ...prov(comp)
      };
    case 'if':
      return {
        kind: 'if', cond: convertAtom(comp.cond, ctx),
        then: convertExpr(comp.then, ctx), else: convertExpr(comp.else, ctx), ...prov(comp)
      };
  }
}

function convertBinding(binding: AnfBinding, ctx: Ctx): ClosBinding {
  switch (binding.kind) {
    case 'atom':
      return { kind: 'atom', atom: convertAtom(binding.atom, ctx) };
    case 'comp':
      return { kind: 'comp', comp: convertComp(binding.comp, ctx) };
    case 'susp':
      return { kind: 'susp', body: convertExpr(binding.body, ctx) };
  }
}

function convertExpr(expr: AnfExpr, ctx: Ctx): ClosExpr {
  switch (expr.kind) {
    case 'ret':
      return eRet(convertAtom(expr.atom, ctx), expr);
    case 'tail':
      return eTail(convertComp(expr.comp, ctx), expr);
    case 'let': {
      const rhs = convertBinding(expr.rhs, ctx);
      const bodyCtx = withGammaVar(ctx, expr.name, bestBindingType(expr.rhs));
      return eLet(expr.name, rhs, convertExpr(expr.body, bodyCtx), expr);
    }
    case 'letrec': {
      // Call-by-value recursive lambda: "known function by label" — the name
      // becomes a global (never captured by itself), emitted as a `let` carrier.
      if (expr.rhs.kind === 'atom' && expr.rhs.atom.kind === 'lam') {
        const globalCtx: Ctx = { ...ctx, globals: new Set(ctx.globals).add(expr.name) };
        const closAtom = convertLam(expr.rhs.atom, globalCtx);
        const bodyCtx = withGammaVar(globalCtx, expr.name, closAtom.ty);
        return eLet(expr.name, { kind: 'atom', atom: closAtom }, convertExpr(expr.body, bodyCtx), expr);
      }
      // Call-by-structure thunk (or a degenerate non-lambda CbV letrec): the
      // recursive binding survives; the inner lambda captures the name normally.
      const rhs = convertBinding(expr.rhs, ctx);
      const bodyCtx = withGammaVar(ctx, expr.name, bestBindingType(expr.rhs));
      return eLetrec(expr.name, rhs, convertExpr(expr.body, bodyCtx), expr);
    }
  }
}

/* --------------------------------------------------------- name collection */

function collectAnfNames(expr: AnfExpr, acc: Set<string>): void {
  const atom = (a: AnfAtom): void => {
    if (a.kind === 'var' || a.kind === 'force') acc.add(a.name);
    else if (a.kind === 'lam') { acc.add(a.param); collectAnfNames(a.body, acc); }
  };
  const comp = (c: AnfComp): void => {
    if (c.kind === 'app') { atom(c.func); atom(c.arg); }
    else if (c.kind === 'prim') { atom(c.left); atom(c.right); }
    else { atom(c.cond); collectAnfNames(c.then, acc); collectAnfNames(c.else, acc); }
  };
  const binding = (b: AnfBinding): void => {
    if (b.kind === 'atom') atom(b.atom);
    else if (b.kind === 'comp') comp(b.comp);
    else collectAnfNames(b.body, acc);
  };
  switch (expr.kind) {
    case 'ret': atom(expr.atom); return;
    case 'tail': comp(expr.comp); return;
    case 'let':
    case 'letrec': acc.add(expr.name); binding(expr.rhs); collectAnfNames(expr.body, acc); return;
  }
}

/** Closure-convert a whole program (`AnfProgram` -> `ClosProgram`). */
export function closureConvert(prog: AnfProgram): ClosProgram {
  const avoid = new Set<string>();
  collectAnfNames(prog.body, avoid);
  const ctx: Ctx = { globals: new Set(), gamma: new Map(), fresh: makeFreshNames(avoid) };
  return { strategy: prog.strategy, body: convertExpr(prog.body, ctx) };
}
