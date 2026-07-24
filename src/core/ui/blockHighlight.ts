import * as Blockly from 'blockly';

/*
 * Shared block cross-highlight, extracted from closuresPanel.ts (step 2.5) so
 * every Lowering-tab panel that links a DOM element back to its originating
 * workspace block(s) — Closures (2.5), CFG (3.6) — uses one implementation
 * rather than three drifting copies. Each panel owns its own highlighter
 * instance (`createBlockHighlighter`), since switching tabs must not leave a
 * stale highlight from a panel that is no longer visible.
 */

export type GetWorkspace = () => Blockly.WorkspaceSvg | null;

export interface BlockHighlighter {
  /** Set the highlighted set, diffing against the previous one (only the
   *  delta touches `setHighlighted`). */
  setHighlight(ids: string[]): void;
  clearHighlight(): void;
  /** Center the workspace on `id` and select it; a no-op for `undefined`. */
  jumpTo(id: string | undefined): void;
  /** Highlight `ids` on hover/focus, clear on leave/blur; a no-op when `ids`
   *  is empty (nothing to link). */
  linkHover(element: HTMLElement, ids: string[]): void;
}

export function createBlockHighlighter(getWorkspace: GetWorkspace): BlockHighlighter {
  let highlightedIds: string[] = [];

  function setHighlight(ids: string[]): void {
    const ws = getWorkspace();
    if (!ws) return;
    for (const id of highlightedIds) {
      if (ids.includes(id)) continue;
      (ws.getBlockById(id) as Blockly.BlockSvg | null)?.setHighlighted(false);
    }
    for (const id of ids) {
      (ws.getBlockById(id) as Blockly.BlockSvg | null)?.setHighlighted(true);
    }
    highlightedIds = ids;
  }

  function clearHighlight(): void {
    setHighlight([]);
  }

  function jumpTo(id: string | undefined): void {
    if (!id) return;
    const ws = getWorkspace();
    const block = ws?.getBlockById(id) as Blockly.BlockSvg | null;
    if (!ws || !block) return;
    ws.centerOnBlock(id);
    Blockly.common.setSelected(block);
  }

  function linkHover(element: HTMLElement, ids: string[]): void {
    if (ids.length === 0) return;
    element.addEventListener('mouseenter', () => setHighlight(ids));
    element.addEventListener('focus', () => setHighlight(ids));
    element.addEventListener('mouseleave', clearHighlight);
    element.addEventListener('blur', clearHighlight);
  }

  return { setHighlight, clearHighlight, jumpTo, linkHover };
}

export function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}
