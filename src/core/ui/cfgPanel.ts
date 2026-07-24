import {
  cfgInstrText,
  cfgTerminatorText,
  provSources,
  reversePostorder,
  vregText,
  type BasicBlock,
  type CfgFunc,
  type CfgProgram
} from '../ir';
import { predecessors } from '../ir/ssa';
import { createBlockHighlighter, uniqueIds, type BlockHighlighter, type GetWorkspace } from './blockHighlight';

/*
 * The CFG tab (Lowering pane, step 3.6): one blocks+edges diagram per
 * function. Blocks are laid out in layers (longest path from the entry —
 * computed over `reversePostorder`, which is a valid topological order
 * because every `CfgFunc`'s block graph is acyclic, the same fact toAsm.ts's
 * instruction scheduler relies on) and edges are SVG paths measured from the
 * real DOM box positions *after* layout, not estimated — reading
 * `offsetLeft`/`offsetTop`/`offsetWidth`/`offsetHeight` right after append
 * forces the synchronous reflow that makes this exact, and this diagram never
 * pans or scrolls against a live canvas (unlike the 2.5 "no drawn connector
 * lines" call, which was specifically about linking cards to the *main*,
 * pannable/zoomable Blockly canvas), so a redraw-on-transform concern does not
 * apply here.
 *
 * Hovering a block highlights the union of every instruction's/terminator's
 * source block(s) in it (`provSources`), reusing the same cross-highlight
 * mechanism as the Closures tab (blockHighlight.ts).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

let highlighter: BlockHighlighter = createBlockHighlighter(() => null);

export function initCfgPanel(workspaceGetter: GetWorkspace): void {
  highlighter = createBlockHighlighter(workspaceGetter);
}

export function clearCfgHighlight(): void {
  highlighter.clearHighlight();
}

/* --------------------------------------------------------------------- layout */

/** Layer = 1 + the max layer of any predecessor (0 for the entry). A valid
 *  layering because `order` is topological: every predecessor of a block is
 *  processed — and therefore already layered — before the block itself. */
function layerOf(func: CfgFunc, order: BasicBlock[]): Map<string, number> {
  const preds = predecessors(func);
  const layer = new Map<string, number>();
  for (const bl of order) {
    const ps = (preds.get(bl.id) ?? []).filter((p) => layer.has(p));
    layer.set(bl.id, ps.length === 0 ? 0 : 1 + Math.max(...ps.map((p) => layer.get(p)!)));
  }
  return layer;
}

/** Blocks grouped into layer rows, each row in `order`'s relative order (a
 *  stable, deterministic left-to-right placement — no arbitrary re-sorting). */
function layerRows(func: CfgFunc): BasicBlock[][] {
  const order = reversePostorder(func);
  const layer = layerOf(func, order);
  const maxLayer = order.reduce((m, bl) => Math.max(m, layer.get(bl.id) ?? 0), 0);
  const rows: BasicBlock[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const bl of order) rows[layer.get(bl.id) ?? 0].push(bl);
  return rows;
}

/* ---------------------------------------------------------------------- edges */

interface Point { x: number; y: number }

function anchorBottom(box: HTMLElement): Point {
  return { x: box.offsetLeft + box.offsetWidth / 2, y: box.offsetTop + box.offsetHeight };
}
function anchorTop(box: HTMLElement): Point {
  return { x: box.offsetLeft + box.offsetWidth / 2, y: box.offsetTop };
}

function makeArrowMarker(id: string): SVGMarkerElement {
  const marker = document.createElementNS(SVG_NS, 'marker') as SVGMarkerElement;
  marker.setAttribute('id', id);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');
  const arrow = document.createElementNS(SVG_NS, 'path');
  arrow.setAttribute('d', 'M0,0 L10,5 L0,10 z');
  arrow.setAttribute('class', 'cfg-edge-arrowhead');
  marker.appendChild(arrow);
  return marker;
}

/** One CFG edge as a vertical S-curve (a straight line reads identically for
 *  same-column edges and is clearer than an elbow for the offset condbr pair). */
function drawEdge(svg: SVGSVGElement, markerId: string, from: HTMLElement, to: HTMLElement, xOffset: number, label: string | null): void {
  const a = anchorBottom(from);
  const b = anchorTop(to);
  a.x += xOffset;
  const midY = (a.y + b.y) / 2;
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', `M${a.x},${a.y} C${a.x},${midY} ${b.x},${midY} ${b.x},${b.y}`);
  path.setAttribute('class', 'cfg-edge');
  path.setAttribute('marker-end', `url(#${markerId})`);
  svg.appendChild(path);
  if (label) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String((a.x + b.x) / 2 + (xOffset >= 0 ? 6 : -10)));
    text.setAttribute('y', String(midY + 4));
    text.setAttribute('class', 'cfg-edge-label');
    text.textContent = label;
    svg.appendChild(text);
  }
}

/** Build the SVG edge overlay for one function's diagram. Must run *after*
 *  every block box is in the DOM (reads their laid-out positions). */
function drawEdges(func: CfgFunc, diagram: HTMLElement, boxes: Map<string, HTMLElement>): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.classList.add('cfg-edges');
  const width = diagram.scrollWidth;
  const height = diagram.scrollHeight;
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const markerId = `cfg-arrow-${func.label.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Math.random().toString(36).slice(2, 8)}`;
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.appendChild(makeArrowMarker(markerId));
  svg.appendChild(defs);

  for (const bl of func.blocks) {
    const from = boxes.get(bl.id);
    if (!from) continue;
    const t = bl.terminator;
    if (t.kind === 'br') {
      const to = boxes.get(t.target);
      if (to) drawEdge(svg, markerId, from, to, 0, null);
    } else if (t.kind === 'condbr') {
      const thenBox = boxes.get(t.then);
      const elseBox = boxes.get(t.else);
      if (thenBox) drawEdge(svg, markerId, from, thenBox, -10, 'T');
      if (elseBox) drawEdge(svg, markerId, from, elseBox, 10, 'F');
    }
  }
  return svg;
}

/* ----------------------------------------------------------------------- DOM */

function renderBlockBox(bl: BasicBlock): HTMLElement {
  const box = document.createElement('div');
  box.className = 'cfg-block';

  const head = document.createElement('div');
  head.className = 'cfg-block-head';
  head.textContent = bl.params.length ? `${bl.id}(${bl.params.map(vregText).join(', ')})` : bl.id;
  box.appendChild(head);

  const body = document.createElement('code');
  body.className = 'cfg-block-body ir-listing';
  body.textContent = [...bl.instrs.map(cfgInstrText), cfgTerminatorText(bl.terminator)].join('\n');
  box.appendChild(body);

  const ids = uniqueIds([...bl.instrs.flatMap((i) => provSources(i)), ...provSources(bl.terminator)]);
  if (ids.length > 0) {
    box.tabIndex = 0;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', `block ${bl.id}, linked to ${ids.length} source block${ids.length === 1 ? '' : 's'}`);
    highlighter.linkHover(box, ids);
    box.addEventListener('click', () => highlighter.jumpTo(ids[0]));
  }
  return box;
}

interface FuncShell {
  section: HTMLElement;
  diagram: HTMLElement;
  boxes: Map<string, HTMLElement>;
}

/** Build one function's header + layer rows + block boxes — everything except
 *  the SVG edges, which need real layout to measure and so must wait until
 *  this shell is attached to the live document (see `renderCfgDiagramInto`;
 *  `offsetLeft`/`offsetWidth`/etc. are all 0 on a detached subtree, which is
 *  exactly the bug a first pass here had — building the whole diagram,
 *  edges included, before ever attaching it to `host`). */
function buildFuncShell(func: CfgFunc): FuncShell {
  const section = document.createElement('div');
  section.className = 'cfg-func';

  const head = document.createElement('div');
  head.className = 'closure-card-head cfg-func-head';
  const title = document.createElement('span');
  title.className = 'closure-card-title';
  title.textContent = `${func.label} [${func.kind}]`;
  head.appendChild(title);

  const abiParts = [
    func.env ? `env=${vregText(func.env)}` : null,
    func.param ? `param=${vregText(func.param)}` : null
  ].filter((s): s is string => s !== null);
  if (abiParts.length > 0) {
    const abi = document.createElement('code');
    abi.className = 'closure-card-type';
    abi.textContent = abiParts.join(', ');
    head.appendChild(abi);
  }

  // Reuses the Closures tab's "jump to source" button verbatim — same look,
  // same behavior, no new CSS needed for a control that already exists.
  if (func.sourceId) {
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'closure-card-jump';
    jump.textContent = '↳ block';
    jump.title = "Show this function's source block";
    jump.addEventListener('click', () => highlighter.jumpTo(func.sourceId));
    highlighter.linkHover(jump, [func.sourceId]);
    head.appendChild(jump);
  }
  section.appendChild(head);

  const diagram = document.createElement('div');
  diagram.className = 'cfg-diagram';
  section.appendChild(diagram);

  const boxes = new Map<string, HTMLElement>();
  for (const row of layerRows(func)) {
    const rowEl = document.createElement('div');
    rowEl.className = 'cfg-layer';
    for (const bl of row) {
      const box = renderBlockBox(bl);
      boxes.set(bl.id, box);
      rowEl.appendChild(box);
    }
    diagram.appendChild(rowEl);
  }

  return { section, diagram, boxes };
}

/** Render the CFG tab's diagrams into `host`, one per function (`main` last,
 *  matching every other Lowering-stage's table order). Clears any stale
 *  highlight first (a stage/strategy switch must never leave a highlight
 *  pointing at a since-removed block).
 *
 *  Two passes, deliberately: every shell is built *and attached* to `host`
 *  first, and only then does a second pass measure box positions and draw
 *  edges — `host` is already live (it is the real Lowering-tab output
 *  element), so by the second pass every block box has real layout to read. */
export function renderCfgDiagramInto(host: HTMLElement, prog: CfgProgram): void {
  highlighter.clearHighlight();
  host.replaceChildren();

  const funcs = [...prog.functions, prog.main];
  const totalBlocks = funcs.reduce((n, f) => n + f.blocks.length, 0);
  const summary = document.createElement('div');
  summary.className = 'closures-summary';
  summary.textContent = `${funcs.length} function${funcs.length === 1 ? '' : 's'} · ${totalBlocks} block${totalBlocks === 1 ? '' : 's'}`;
  host.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'cfg-func-list';
  host.appendChild(list);

  const shells = funcs.map((func) => ({ func, ...buildFuncShell(func) }));
  for (const { section } of shells) list.appendChild(section);
  for (const { func, diagram, boxes } of shells) diagram.appendChild(drawEdges(func, diagram, boxes));
}
