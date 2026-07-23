/**
 * ClosProgram -> ClosureCard[] (step 2.5, Closures tab data layer). Pure,
 * DOM-free: walks the closure IR (in definition order — matching
 * `liftFunctions.ts`'s discovery order, outer closure before its nested
 * closures) and produces one `ClosureCard` per `clos { code, env }` atom, the
 * shape the Closures tab renders as a capture-map (see the design plan,
 * "Step 2.5 — Closures tab design").
 *
 * A card's `captures` are read straight off the `clos` atom's `env` (the
 * ordered free variables `closureConvert` computed) paired with `envLayout`'s
 * types; each capture's `blockIds` link BOTH the capture site (the `env` atom
 * itself, evaluated in the enclosing scope) and every read of that name
 * inside the closure's own body — the "draw the captured-var set against the
 * blocks it closes over" the design calls for.
 *
 * `recursesViaLabel` recognizes Decision 2's "known functions by label" case
 * (see `closureConvert.ts`'s header): a closed (`captures.length === 0`)
 * closure that is the direct rhs of a named `let` carrier (call-by-value
 * turns a recursive `letrec`-of-a-lambda into a plain `let` once the name is
 * "known by label" — see `closureConvert.ts`'s letrec branch), whose own body
 * still mentions that carrier's name — the label self-reference
 * `closureConvert` deliberately leaves unresolved (it is `liftFunctions`, not
 * this module, that turns it into an explicit table entry). A running
 * `knownLabels` set (threaded through `buildClosureCards` in definition
 * order, mirroring `closureConvert.ts`'s own `ctx.globals` threading) keeps a
 * *later* closure that merely reuses an already-registered label's name
 * (shadowing, not recursion) from being misread as recursive itself. This is
 * a display heuristic, not a checker, but it is scope-aware, not a raw text
 * scan.
 */
import type { ClosAtom, ClosBinding, ClosComp, ClosExpr, ClosProgram } from './clos';
import { provSources } from './provenance';
import type { IRType } from './types';

export interface ClosureCapture {
  name: string;
  ty?: IRType;
  /** Every block this capture links to: the capture site (in the enclosing
   *  scope) plus every read of `name` inside the closure's own body. */
  blockIds: string[];
}

export interface ClosureCard {
  /** Stable render key: the closure's source block id, or a synthesized one
   *  for a node with no provenance (shouldn't normally occur). */
  id: string;
  sourceId?: string;
  param: string;
  paramTy?: IRType;
  resultTy?: IRType;
  /** The closure arrow type (`A ⇒ B`), when the source lambda was typed. */
  closureTy?: IRType;
  /** Set when this closure is a genuinely recursive binding — a real
   *  `letrec` (call-by-structure) or a call-by-value closure that recurses
   *  via its known-function label (`recursesViaLabel`). Unset for an
   *  ordinary, non-recursive named `let`. */
  letrecName?: string;
  /** Ordered (first-occurrence) capture set; empty means closed. */
  captures: ClosureCapture[];
  recursesViaLabel: boolean;
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

/** True when `rhs` is exactly a closure's own capture-projection preamble
 *  slot (`proj(envParam, i)`, synthesized by `convertLam`) — never a genuine
 *  user-level rebinding, regardless of what name it's attached to. */
function isCaptureProjection(rhs: ClosBinding, envParam: string): boolean {
  return rhs.kind === 'atom' && rhs.atom.kind === 'proj' && rhs.atom.env === envParam;
}

/**
 * Every block id linked to a `var`/`force` atom named `name` within `expr` —
 * scope-aware: a local `let`/`letrec` that genuinely rebinds `name` to
 * something else shadows every occurrence after that point, the same way
 * `freeVars.ts`'s `orderedFreeVars` treats shadowing. The closure's own
 * capture-projection preamble (`let name = proj(envParam, i) in ...`) is
 * deliberately NOT treated as a rebinding — it *is* the capture, so every
 * read of `name` below it is exactly what's being searched for; only a
 * *different* local binder reusing the same name counts as a shadow. Does
 * not descend into a *nested* closure's own body — env atoms there are
 * evaluated in the current scope, so only those are followed; the nested
 * body's own reads belong to its own card.
 */
function collectNameOccurrences(expr: ClosExpr, name: string, envParam: string): string[] {
  const ids: string[] = [];

  const atom = (a: ClosAtom, shadowed: boolean): void => {
    if (!shadowed && (a.kind === 'var' || a.kind === 'force') && a.name === name) ids.push(...provSources(a));
    else if (a.kind === 'clos') a.env.forEach((e) => atom(e, shadowed));
  };
  const comp = (c: ClosComp, shadowed: boolean): void => {
    if (c.kind === 'callclos') { atom(c.clos, shadowed); atom(c.arg, shadowed); }
    else if (c.kind === 'prim') { atom(c.left, shadowed); atom(c.right, shadowed); }
    else { atom(c.cond, shadowed); walk(c.then, shadowed); walk(c.else, shadowed); }
  };
  const binding = (b: ClosBinding, shadowed: boolean): void => {
    if (b.kind === 'atom') atom(b.atom, shadowed);
    else if (b.kind === 'comp') comp(b.comp, shadowed);
    else walk(b.body, shadowed);
  };
  const walk = (e: ClosExpr, shadowed: boolean): void => {
    switch (e.kind) {
      case 'ret': atom(e.atom, shadowed); return;
      case 'tail': comp(e.comp, shadowed); return;
      case 'let':
      case 'letrec': {
        const rebinds = e.name === name && !isCaptureProjection(e.rhs, envParam);
        // A `letrec`'s rhs sees its own name as bound; a `let`'s rhs does not.
        binding(e.rhs, shadowed || (e.kind === 'letrec' && rebinds));
        walk(e.body, shadowed || rebinds);
        return;
      }
    }
  };

  walk(expr, false);
  return ids;
}

interface Binder {
  name: string;
  isLetrec: boolean;
}

function cardFor(
  atom: ClosAtom & { kind: 'clos' },
  binder: Binder | undefined,
  knownLabels: Set<string>,
  id: string
): ClosureCard {
  const code = atom.code;
  const captures: ClosureCapture[] = atom.env.map((slot, i) => {
    const name = slot.kind === 'var' ? slot.name : `#${i}`;
    const ty = code.envLayout[i];
    const blockIds = uniqueIds([...provSources(slot), ...collectNameOccurrences(code.body, name, code.envParam)]);
    return { name, ty, blockIds };
  });

  // Decision 2's "known functions by label": a closed closure whose own body
  // still bare-references its *own* binder name is the call-by-value
  // recursive-lambda-to-label rewrite — but only the first time that name is
  // seen. A later closure that merely reuses an already-registered label's
  // name (shadowing) is excluded via `knownLabels`, since its body reference
  // resolves to the *earlier* label, not to itself.
  const recursesViaLabel =
    captures.length === 0 &&
    !!binder &&
    !binder.isLetrec &&
    !knownLabels.has(binder.name) &&
    collectNameOccurrences(code.body, binder.name, code.envParam).length > 0;

  if (recursesViaLabel && binder) knownLabels.add(binder.name);

  const isRecursive = (binder?.isLetrec ?? false) || recursesViaLabel;

  return {
    id,
    sourceId: atom.sourceId,
    param: code.param,
    paramTy: code.paramTy,
    resultTy: code.resultTy,
    closureTy: atom.ty,
    letrecName: isRecursive ? binder?.name : undefined,
    captures,
    recursesViaLabel
  };
}

/** Walk a whole program, collecting one card per `clos` atom in definition
 *  (outer-before-nested) order — mirrors `liftFunctions.ts`'s discovery order. */
export function buildClosureCards(prog: ClosProgram): ClosureCard[] {
  const cards: ClosureCard[] = [];
  const knownLabels = new Set<string>();
  let anonCounter = 0;

  const visitClos = (atom: ClosAtom & { kind: 'clos' }, binder?: Binder): void => {
    const id = atom.sourceId ?? `clos-${anonCounter++}`;
    cards.push(cardFor(atom, binder, knownLabels, id));
    visitExpr(atom.code.body);
  };
  const visitAtom = (a: ClosAtom): void => {
    if (a.kind === 'clos') visitClos(a);
  };
  const visitComp = (c: ClosComp): void => {
    if (c.kind === 'callclos') { visitAtom(c.clos); visitAtom(c.arg); }
    else if (c.kind === 'prim') { visitAtom(c.left); visitAtom(c.right); }
    else { visitAtom(c.cond); visitExpr(c.then); visitExpr(c.else); }
  };
  // Only a `let`/`letrec name = atom{clos}` binding site carries a name —
  // every other position (a callclos operand, an if branch, an env slot) is
  // necessarily an anonymous closure.
  const visitBinding = (b: ClosBinding, binder: Binder): void => {
    if (b.kind === 'atom') {
      if (b.atom.kind === 'clos') visitClos(b.atom, binder);
      else visitAtom(b.atom);
    } else if (b.kind === 'comp') visitComp(b.comp);
    else visitSuspBody(b.body, binder);
  };
  // A call-by-structure `letrec name = susp{...}` thunk's body is the
  // closure this letrec binds when it's a direct `ret <clos>` (the ordinary
  // "recursive binding survives as a captured thunk" shape) — pass the
  // binder through so that card still shows `· letrec name`. Anything less
  // direct has no single closure to name, so it falls back to the ordinary
  // (unnamed) traversal.
  const visitSuspBody = (e: ClosExpr, binder: Binder): void => {
    if (e.kind === 'ret' && e.atom.kind === 'clos') visitClos(e.atom, binder);
    else visitExpr(e);
  };
  const visitExpr = (e: ClosExpr): void => {
    switch (e.kind) {
      case 'ret': visitAtom(e.atom); return;
      case 'tail': visitComp(e.comp); return;
      case 'let': visitBinding(e.rhs, { name: e.name, isLetrec: false }); visitExpr(e.body); return;
      case 'letrec': visitBinding(e.rhs, { name: e.name, isLetrec: true }); visitExpr(e.body); return;
    }
  };

  visitExpr(prog.body);
  return cards;
}
