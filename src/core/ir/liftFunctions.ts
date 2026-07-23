/**
 * ClosExpr -> FirExpr (step 2.4): lambda lifting. Hoists every inline
 * `ClosCode` to a labeled entry in a flat `FirProgram.functions` table,
 * replacing `clos.code: ClosCode` with `clos.code: Label`. Every other node
 * is re-typed identically over `FirAtom` in place of `ClosAtom` — this is
 * exactly the one-field delta `fir.ts` documents, which is what keeps this
 * pass small and mechanical.
 *
 * Discovery order = definition order: a `clos` is lifted (its label minted,
 * its table slot reserved) *before* its own code body is walked, so an outer
 * closure's function entry precedes the entries for any closures nested
 * inside it (matches the worked example in the design plan: code_f, code_g,
 * code_x, in that order for `compose`).
 *
 * The one non-mechanical piece is resolving a "known function by label"
 * self-reference (see `closureConvert.ts`'s header, Decision 2): a
 * `letrec`-lifted call-by-value lambda is emitted by 2.3 as a plain
 * `let name = clos{...}` carrier whose OWN (closed) code body contains a bare
 * `var name` — deliberately left unresolved, because at 2.3's point in the
 * pipeline there is no label yet to resolve it to. This pass:
 *
 *   1. Registers every named carrier (`let`/`letrec name = atom{clos{...}}`)
 *      as a "global" — `name -> { label, capturedOrder }` — both for lifting
 *      that closure's OWN body (self-reference) and for every later name/
 *      closure in the program (a *sibling* closure that also excluded `name`
 *      from its own captures, because 2.3 threads the letrec-lifted name
 *      through `ctx.globals` for the rest of the program too — see
 *      `closureConvert.ts`'s `letrecExpr`). Registering every carrier
 *      (not just recursive ones) is harmless: the fallback only ever fires
 *      when a bare `var` is otherwise unresolved, which by `checkClos`'s
 *      closedness contract can only happen for this exact mechanism.
 *   2. When lifting hits a bare `var`/`force` that is not locally bound
 *      (not `envParam`, `param`, or a local `let`/`letrec` seen so far in
 *      the *current* closed code), it looks the name up in the globals table
 *      and reconstructs `clos { code: label, env }`. `env` is rebuilt by
 *      resolving each of the global's own `capturedOrder` names the same
 *      way — which is exactly right for genuine self-reference (those names
 *      are the current code's own projection-preamble locals) and for the
 *      empty-environment case (nothing to resolve, e.g. `letrec fac = ...`
 *      at top level). A cross-closure reference to a *non-empty-environment*
 *      global — a case the "known functions by label" discipline does not
 *      cover soundly (transitively re-capturing the global's own captures is
 *      unimplemented) — surfaces as a clear "escapes its closed function
 *      body" error rather than silently miscompiling; the corpus never hits
 *      this (only top-level, closed recursive functions are exercised).
 *
 * Provenance and determinism follow the same conventions as `closureConvert.ts`
 * (`withSources`-equivalent field copying, `FreshNames` seeded from every name
 * already in the program so minted labels never collide with a source name).
 */
import type { AnfProgram } from './anf';
import type { ClosAtom, ClosBinding, ClosComp, ClosExpr, ClosProgram } from './clos';
import type { FirAtom, FirBinding, FirComp, FirExpr, FirFunc, FirProgram, Label } from './fir';
import type { IRProvenance } from './provenance';
import type { IRType } from './types';
import { closureConvert } from './closureConvert';
import { makeFreshNames, type FreshNames } from './freshNames';

/** What a registered global needs for a caller to reconstruct its closure
 *  value: the table label, and the names (in the global's own captured
 *  order) that must be resolved to rebuild its environment tuple. */
interface GlobalInfo {
  label: Label;
  capturedOrder: string[];
}

interface Ctx {
  /** Deterministic label/name supply, shared for the whole program. */
  fresh: FreshNames;
  /** Flat function table, shared for the whole program (mutated in place;
   *  never copied — every `Ctx` variant threads the same array reference). */
  functions: FirFunc[];
  /** name -> (label, captured names) for every carrier seen so far, threaded
   *  forward through the rest of the program (mirrors `closureConvert.ts`'s
   *  `ctx.globals` accumulation through a `letrecExpr`'s continuation). */
  globals: Map<string, GlobalInfo>;
  /** Names bound in the *current* closed code's scope (reset on entering a
   *  new `ClosCode`; envParam/param plus every local `let`/`letrec` seen so
   *  far). Not used to restrict an unclosed scope (`main`, a continuation) —
   *  there every reference is ordinary lexical scoping and always resolves. */
  locals: Set<string>;
}

function withLocal(ctx: Ctx, name: string): Ctx {
  if (ctx.locals.has(name)) return ctx;
  const locals = new Set(ctx.locals);
  locals.add(name);
  return { ...ctx, locals };
}

function withGlobal(ctx: Ctx, name: string, info: GlobalInfo): Ctx {
  const globals = new Map(ctx.globals);
  globals.set(name, info);
  return { ...ctx, globals };
}

/* ------------------------------------------------ provenance / type helpers */

function prov(node: IRProvenance): { sourceId?: string; sourceAliases?: string[] } {
  return { sourceId: node.sourceId, sourceAliases: node.sourceAliases };
}
function tyOf(node: { ty?: IRType }): { ty?: IRType } {
  return node.ty ? { ty: node.ty } : {};
}

/* --------------------------------------------------------- variable lookup */

/** Resolve a bare `var`/`force` atom: local passthrough, or a global
 *  reconstruction (see header). Throws if neither applies — the closedness
 *  contract makes that an internal-consistency bug or an unsupported case. */
function resolveVarLike(atom: ClosAtom & { kind: 'var' | 'force' }, ctx: Ctx): FirAtom {
  if (ctx.locals.has(atom.name)) return { kind: atom.kind, name: atom.name, ...prov(atom), ...tyOf(atom) };
  const global = ctx.globals.get(atom.name);
  if (global) {
    if (atom.kind === 'force') {
      throw new Error(
        `liftFunctions: '${atom.name}' is a known-function-by-label global and cannot be forced ` +
        '(call-by-structure recursion never goes through this mechanism — see closureConvert.ts)'
      );
    }
    return reconstructGlobal(global, atom, ctx);
  }
  throw new Error(
    `liftFunctions: variable '${atom.name}' escapes its closed function body — either an internal-consistency ` +
    'bug, or a cross-closure reference to a non-empty-environment global (unsupported; see this file\'s header)'
  );
}

function reconstructGlobal(info: GlobalInfo, src: IRProvenance, ctx: Ctx): FirAtom {
  const env = info.capturedOrder.map((name) => resolveVarLike({ kind: 'var', name, ...prov(src) }, ctx));
  return { kind: 'clos', code: info.label, env, ...prov(src) };
}

/* --------------------------------------------------------------- lifting a clos */

interface LiftedClos {
  atom: FirAtom;
  label: Label;
  capturedOrder: string[];
}

/**
 * Lift one `clos { code, env }` atom: mint its label, reserve its table slot
 * (so an outer closure's entry precedes its nested closures' entries), lift
 * its body with a *fresh* local scope (`envParam`, `param` only — the code is
 * closed), and fill the table slot. `env` (the values captured *at this
 * construction site*) is lifted in the *caller's* scope, not the new body
 * scope. `selfName`, when given, registers this closure as a global — visible
 * both inside its own body (self-reference) and, via the caller, to the rest
 * of the program (a later sibling closure's cross-reference).
 */
function liftClosAtom(closAtom: ClosAtom & { kind: 'clos' }, ctx: Ctx, labelBase: string, selfName?: string): LiftedClos {
  const capturedOrder = closAtom.env.map((slot) => {
    if (slot.kind !== 'var') {
      throw new Error('liftFunctions: expected a captured environment slot to be a plain variable reference');
    }
    return slot.name;
  });
  const env = closAtom.env.map((slot) => liftAtom(slot, ctx));

  const label = ctx.fresh.fresh(labelBase);
  const code = closAtom.code;

  const slotIndex = ctx.functions.length;
  ctx.functions.push(undefined as unknown as FirFunc); // reserved; filled below

  let bodyCtx: Ctx = { ...ctx, locals: new Set([code.envParam, code.param]) };
  if (selfName) bodyCtx = withGlobal(bodyCtx, selfName, { label, capturedOrder });
  const body = liftExpr(code.body, bodyCtx);

  ctx.functions[slotIndex] = {
    label,
    envParam: code.envParam,
    envLayout: code.envLayout,
    param: code.param,
    ...(code.paramTy ? { paramTy: code.paramTy } : {}),
    ...(code.resultTy ? { resultTy: code.resultTy } : {}),
    body,
    ...prov(code)
  };

  const atom: FirAtom = { kind: 'clos', code: label, env, ...prov(closAtom), ...tyOf(closAtom) };
  return { atom, label, capturedOrder };
}

/* --------------------------------------------------------------------- atoms */

function liftAtom(atom: ClosAtom, ctx: Ctx): FirAtom {
  switch (atom.kind) {
    case 'num':
      return { kind: 'num', value: atom.value, ...prov(atom), ...tyOf(atom) };
    case 'bool':
      return { kind: 'bool', value: atom.value, ...prov(atom), ...tyOf(atom) };
    case 'hole':
      return { kind: 'hole', label: atom.label, ...prov(atom) };
    case 'proj':
      return { kind: 'proj', env: atom.env, index: atom.index, ...prov(atom) };
    case 'var':
    case 'force':
      return resolveVarLike(atom, ctx);
    case 'clos':
      // Anonymous (not a named let/letrec carrier) — no self-reference is
      // possible, so no global registration; named as `code_<param>` purely
      // for readable labels (fn0, fn1, ... would be equally correct).
      return liftClosAtom(atom, ctx, atom.code.param).atom;
  }
}

/* ------------------------------------------------------------------ comps */

function liftComp(comp: ClosComp, ctx: Ctx): FirComp {
  switch (comp.kind) {
    case 'callclos':
      return { kind: 'callclos', clos: liftAtom(comp.clos, ctx), arg: liftAtom(comp.arg, ctx), ...prov(comp) };
    case 'prim':
      return {
        kind: 'prim', opKind: comp.opKind, op: comp.op,
        left: liftAtom(comp.left, ctx), right: liftAtom(comp.right, ctx), ...prov(comp)
      };
    case 'if':
      return {
        kind: 'if', cond: liftAtom(comp.cond, ctx),
        then: liftExpr(comp.then, ctx), else: liftExpr(comp.else, ctx), ...prov(comp)
      };
  }
}

/* --------------------------------------------------------------- bindings */

function liftBinding(binding: ClosBinding, ctx: Ctx): FirBinding {
  switch (binding.kind) {
    case 'atom':
      return { kind: 'atom', atom: liftAtom(binding.atom, ctx) };
    case 'comp':
      return { kind: 'comp', comp: liftComp(binding.comp, ctx) };
    case 'susp':
      return { kind: 'susp', body: liftExpr(binding.body, ctx) };
  }
}

/* ----------------------------------------------------------------- exprs */

function liftExpr(expr: ClosExpr, ctx: Ctx): FirExpr {
  switch (expr.kind) {
    case 'ret':
      return { kind: 'ret', atom: liftAtom(expr.atom, ctx), ...prov(expr) };
    case 'tail':
      return { kind: 'tail', comp: liftComp(expr.comp, ctx), ...prov(expr) };

    case 'let':
    case 'letrec': {
      // A named carrier (`let`/`letrec name = atom{clos{...}}`) — lift the
      // closure and register `name` as a global, both for its own body (self-
      // reference) and for the continuation (a later sibling cross-reference).
      // closureConvert.ts only ever emits `let` for this shape (Decision 2),
      // never `letrec`, but the two are handled identically for robustness.
      if (expr.rhs.kind === 'atom' && expr.rhs.atom.kind === 'clos') {
        const lifted = liftClosAtom(expr.rhs.atom, ctx, expr.name, expr.name);
        const contCtx = withGlobal(withLocal(ctx, expr.name), expr.name, { label: lifted.label, capturedOrder: lifted.capturedOrder });
        const body = liftExpr(expr.body, contCtx);
        return { kind: expr.kind, name: expr.name, rhs: { kind: 'atom', atom: lifted.atom }, body, ...prov(expr) };
      }

      if (expr.kind === 'let') {
        // Non-recursive: `name` is not visible in its own rhs.
        const rhs = liftBinding(expr.rhs, ctx);
        const body = liftExpr(expr.body, withLocal(ctx, expr.name));
        return { kind: 'let', name: expr.name, rhs, body, ...prov(expr) };
      }
      // Recursive thunk (call-by-structure): `name` is visible in its own
      // rhs (a cyclic thunk — `force name` inside it re-enters the binding).
      const selfCtx = withLocal(ctx, expr.name);
      const rhs = liftBinding(expr.rhs, selfCtx);
      return { kind: 'letrec', name: expr.name, rhs, body: liftExpr(expr.body, selfCtx), ...prov(expr) };
    }
  }
}

/* --------------------------------------------------------- name collection */

function collectClosNames(expr: ClosExpr, acc: Set<string>): void {
  const atom = (a: ClosAtom): void => {
    if (a.kind === 'var' || a.kind === 'force') acc.add(a.name);
    else if (a.kind === 'proj') acc.add(a.env);
    else if (a.kind === 'clos') {
      acc.add(a.code.envParam);
      acc.add(a.code.param);
      a.env.forEach(atom);
      collectClosNames(a.code.body, acc);
    }
  };
  const comp = (c: ClosComp): void => {
    if (c.kind === 'callclos') { atom(c.clos); atom(c.arg); }
    else if (c.kind === 'prim') { atom(c.left); atom(c.right); }
    else { atom(c.cond); collectClosNames(c.then, acc); collectClosNames(c.else, acc); }
  };
  const binding = (b: ClosBinding): void => {
    if (b.kind === 'atom') atom(b.atom);
    else if (b.kind === 'comp') comp(b.comp);
    else collectClosNames(b.body, acc);
  };
  switch (expr.kind) {
    case 'ret': atom(expr.atom); return;
    case 'tail': comp(expr.comp); return;
    case 'let':
    case 'letrec': acc.add(expr.name); binding(expr.rhs); collectClosNames(expr.body, acc); return;
  }
}

/** Lift a whole program (`ClosProgram` -> `FirProgram`). */
export function liftFunctions(prog: ClosProgram): FirProgram {
  const avoid = new Set<string>();
  collectClosNames(prog.body, avoid);
  const functions: FirFunc[] = [];
  const ctx: Ctx = { fresh: makeFreshNames(avoid), functions, globals: new Map(), locals: new Set() };
  const main = liftExpr(prog.body, ctx);
  return { strategy: prog.strategy, functions, main };
}

/** Convenience: `liftFunctions . closureConvert . toAnfProgram`, in one call. */
export function toFir(prog: AnfProgram): FirProgram {
  return liftFunctions(closureConvert(prog));
}
