import { useRef, type PointerEvent } from 'react';
import type { Selection } from 'react-aria-components';

/**
 * Shift+click range selection for the app's multi-select lists.
 *
 * react-aria has its own range extension, but it cannot work here. `SelectionManager`
 * .extendSelection reads the range anchor off the `Selection` object it previously
 * handed to `onSelectionChange` — and every list in flexo is **controlled** from a
 * store, so what comes back down is a freshly built plain `Set` with no `anchorKey`.
 * With a null anchor react-aria anchors on the clicked row itself, and a Shift+click
 * degenerates into "add the one row you clicked". So the lists own the gesture: a row
 * pointer-down records the Shift+click, and the selection change react-aria fires for
 * it is replaced with the range computed here.
 *
 * The rule (see {@link shiftRangeSelection}): Shift+click selects everything between
 * the clicked row and the current selection — it only ever **grows** the selection.
 */

export interface ShiftRangeOptions {
  /** Every row key of the list, in displayed order (sections flattened). */
  orderedKeys: readonly string[];
  /** The keys currently selected — the same set handed to the list. */
  selectedKeys: ReadonlySet<string>;
  /**
   * Rows that may not be selected (a locked or hidden layer, in the Assets list).
   * They are skipped while filling a range instead of blocking it, so a range can
   * span past them. Defaults to "everything is selectable".
   */
  isSelectable?: (key: string) => boolean;
}

/**
 * The selection a Shift+click on `clickedKey` should produce: the current selection
 * plus every selectable row between the clicked row and the **nearest already-selected
 * row** (inclusive).
 *
 * For the ordinary case — a contiguous selection, or a single row — "nearest selected"
 * is the near edge of the selection, so this is exactly the expected convention:
 * clicking below the selection extends down to the click, clicking above extends up to
 * it, and everything in between comes along. Two consequences worth knowing:
 *
 * - It never shrinks. Shift+clicking *inside* the selection fills the closest gap
 *   rather than trimming the range (there is no persistent anchor to trim toward —
 *   selection here can also arrive from the 3D viewport or "select all in layer").
 * - A non-contiguous selection (built with Cmd/Ctrl+click) keeps its holes: only the
 *   span from the nearest selected row to the click is filled in.
 *
 * With nothing selected yet, a Shift+click is just a click on that row. Ties (a click
 * exactly midway between two selected rows) resolve to the earlier row.
 */
export function shiftRangeSelection(
  clickedKey: string,
  { orderedKeys, selectedKeys, isSelectable = () => true }: ShiftRangeOptions,
): Set<string> {
  // Starting from the current selection is what makes the gesture additive; it also
  // preserves selected rows that aren't listed right now (filtered out by a search).
  const next = new Set(selectedKeys);
  const clicked = orderedKeys.indexOf(clickedKey);
  if (clicked < 0) return next;

  let anchor = -1;
  let nearest = Infinity;
  for (let i = 0; i < orderedKeys.length; i++) {
    if (!selectedKeys.has(orderedKeys[i])) continue;
    const distance = Math.abs(i - clicked);
    // Strict `<` keeps the earlier row on a tie.
    if (distance < nearest) {
      nearest = distance;
      anchor = i;
    }
  }

  if (anchor < 0) {
    if (isSelectable(clickedKey)) next.add(clickedKey);
    return next;
  }

  const lo = Math.min(anchor, clicked);
  const hi = Math.max(anchor, clicked);
  for (let i = lo; i <= hi; i++) {
    const key = orderedKeys[i];
    if (isSelectable(key)) next.add(key);
  }
  return next;
}

export interface ShiftRangeSelect {
  /**
   * Spread onto every row of the list, so the gesture is seen before react-aria acts
   * on it. Row-level controls that already stop pointer-down propagation (the ⋮ menu
   * button) keep suppressing it, exactly as they suppress the row press.
   */
  rowProps: (key: string) => { onPointerDown: (e: PointerEvent) => void };
  /**
   * Wrap the `Selection` react-aria reports: returns the range for a Shift+click and
   * react-aria's own keys for every other gesture (plain click, Cmd/Ctrl+click,
   * Cmd/Ctrl+A, Shift+arrows).
   */
  resolveSelection: (keys: Selection) => Selection;
}

/**
 * Wires {@link shiftRangeSelection} into a controlled react-aria list. Call it with the
 * list's displayed row order and current selection, spread `rowProps(key)` on each row,
 * and run the incoming `Selection` through `resolveSelection` at the top of
 * `onSelectionChange`.
 */
export function useShiftRangeSelect(options: ShiftRangeOptions): ShiftRangeSelect {
  // The row a Shift+click landed on, awaiting the selection change react-aria is about
  // to fire for it. A ref, not state: it is written and read within a single event
  // dispatch and must never trigger a render.
  const pendingKey = useRef<string | null>(null);

  const onRowPointerDown = (key: string, e: PointerEvent) => {
    // Primary button only — Shift+right-click belongs to the row's context menu.
    if (!e.shiftKey || e.button !== 0) {
      pendingKey.current = null;
      return;
    }
    pendingKey.current = key;
    // react-aria selects on pointer-down, so `resolveSelection` runs later in THIS
    // dispatch. The microtask only cleans up after a Shift+click that produced no
    // selection change at all (a disabled row), so the next gesture can't misread it.
    queueMicrotask(() => {
      pendingKey.current = null;
    });
  };

  return {
    rowProps: (key) => ({ onPointerDown: (e) => onRowPointerDown(key, e) }),
    resolveSelection: (keys) => {
      const clicked = pendingKey.current;
      pendingKey.current = null;
      // `'all'` is Cmd/Ctrl+A, never a Shift+click.
      if (clicked == null || keys === 'all') return keys;
      return shiftRangeSelection(clicked, options);
    },
  };
}
