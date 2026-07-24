import { buildClosureCards, type ClosProgram, type ClosureCapture, type ClosureCard, type IRType } from '../ir';
import { makeTypeFormatter, type TypeFormatter } from '../ir/prettyPrinters';
import { createBlockHighlighter, uniqueIds, type BlockHighlighter, type GetWorkspace } from './blockHighlight';

/*
 * The Closures tab (Lowering pane, step 2.5): renders one card per closure —
 * its identity, type, and captured-variable set — and cross-highlights the
 * captured blocks in the main workspace on hover/focus (blockHighlight.ts,
 * extracted here in 3.6 once the CFG panel needed the same mechanism).
 */

let highlighter: BlockHighlighter = createBlockHighlighter(() => null);

export function initClosuresPanel(workspaceGetter: GetWorkspace): void {
  highlighter = createBlockHighlighter(workspaceGetter);
}

export function clearClosuresHighlight(): void {
  highlighter.clearHighlight();
}

/* ------------------------------------------------------------------ card DOM */

function typeText(formatType: TypeFormatter, ty: IRType | undefined): string {
  return ty ? formatType(ty) : '?';
}

function pluralUses(n: number): string {
  return `${n} use${n === 1 ? '' : 's'}`;
}

function makeChip(capture: ClosureCapture, formatType: TypeFormatter): HTMLElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'capture-chip';

  const name = document.createElement('span');
  name.className = 'capture-chip-name';
  name.textContent = capture.name;

  const ty = document.createElement('span');
  ty.className = 'capture-chip-type';
  ty.textContent = `: ${typeText(formatType, capture.ty)}`;

  const uses = document.createElement('span');
  uses.className = 'capture-chip-uses';
  uses.textContent = pluralUses(capture.blockIds.length);

  chip.append(name, ty, uses);
  chip.setAttribute(
    'aria-label',
    `captured variable ${capture.name}, type ${typeText(formatType, capture.ty)}, closes over ${pluralUses(capture.blockIds.length)}`
  );

  if (capture.blockIds.length === 0) {
    chip.disabled = true;
  } else {
    highlighter.linkHover(chip, capture.blockIds);
    chip.addEventListener('click', () => highlighter.jumpTo(capture.blockIds[0]));
  }
  return chip;
}

function makeCard(card: ClosureCard, formatType: TypeFormatter): HTMLElement {
  const el = document.createElement('div');
  el.className = 'closure-card';

  const head = document.createElement('div');
  head.className = 'closure-card-head';

  const title = document.createElement('span');
  title.className = 'closure-card-title';
  title.textContent = card.letrecName ? `λ${card.param} · letrec ${card.letrecName}` : `λ${card.param}`;
  head.appendChild(title);

  const type = document.createElement('code');
  type.className = 'closure-card-type';
  type.textContent = card.closureTy
    ? formatType(card.closureTy)
    : `${typeText(formatType, card.paramTy)} → ${typeText(formatType, card.resultTy)}`;
  head.appendChild(type);

  if (card.sourceId) {
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'closure-card-jump';
    jump.textContent = '↳ block';
    jump.title = "Show this closure's source block";
    jump.addEventListener('click', () => highlighter.jumpTo(card.sourceId));
    highlighter.linkHover(jump, [card.sourceId]);
    head.appendChild(jump);
  }

  el.appendChild(head);

  const captures = document.createElement('div');
  captures.className = 'closure-card-captures';

  if (card.captures.length === 0) {
    const badge = document.createElement('span');
    badge.className = 'closure-closed-badge';
    badge.textContent = card.recursesViaLabel ? 'nothing · closed — recursion via label' : 'nothing · closed';
    captures.appendChild(badge);
  } else {
    const label = document.createElement('span');
    label.className = 'closure-card-captures-label';
    label.textContent = 'captures';
    captures.appendChild(label);

    const chipList = document.createElement('div');
    chipList.className = 'capture-chip-list';
    for (const capture of card.captures) chipList.appendChild(makeChip(capture, formatType));
    captures.appendChild(chipList);
  }
  el.appendChild(captures);

  // Hovering the card body (outside a specific chip) highlights everything
  // this closure touches — the source block plus every capture's blocks.
  const allIds = uniqueIds([...(card.sourceId ? [card.sourceId] : []), ...card.captures.flatMap((c) => c.blockIds)]);
  highlighter.linkHover(el, allIds);

  return el;
}

/* --------------------------------------------------------------- top-level */

/** Render the Closures tab's card list into `host`. Clears any stale
 *  highlight first (a re-render — e.g. a stage/strategy switch — should never
 *  leave a highlight pointing at a since-removed card). */
export function renderClosureCardsInto(host: HTMLElement, prog: ClosProgram): void {
  clearClosuresHighlight();
  host.replaceChildren();

  const cards = buildClosureCards(prog);
  const formatType = makeTypeFormatter();

  const summary = document.createElement('div');
  summary.className = 'closures-summary';
  const closedCount = cards.filter((c) => c.captures.length === 0).length;
  summary.textContent = cards.length === 0
    ? 'No closures'
    : `${cards.length} closure${cards.length === 1 ? '' : 's'} · ${closedCount} closed`;
  host.appendChild(summary);

  if (cards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'closures-empty';
    empty.textContent = 'No closures — this program builds no functions.';
    host.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'closure-card-list';
  for (const card of cards) list.appendChild(makeCard(card, formatType));
  host.appendChild(list);
}
