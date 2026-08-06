/**
 * The imperative handle the **glow paint dialog** publishes for the hotkey registry
 * (design: design-surface-assets.md §1.6/D2; foundation §11.1 scope `surface:glow-paint`).
 *
 * `⌘Z`/`⇧⌘Z` inside the painter step its own in-dialog stroke stack — NOT the document's
 * undo history — so the binding has to reach a component's canvas state. The registry may
 * not import React, so the dialog registers plain functions here while it is mounted and the
 * binding calls through them, exactly as `outliner.search` reaches the Outliner's field via
 * `focusOutlinerSearch()`.
 *
 * Nothing here is state: no atom, no persistence, no undo enrollment.
 */

export interface GlowPaintHandlers {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

let handlers: GlowPaintHandlers | null = null;

/** Publishes (or clears, with `null`) the open painter's stroke-stack handle. */
export function registerGlowPaintHandlers(next: GlowPaintHandlers | null): void {
  handlers = next;
}

/** Steps one stroke back. No-op when the painter is closed or the stack is empty. */
export function glowPaintUndo(): void {
  handlers?.undo();
}

/** Steps one stroke forward. */
export function glowPaintRedo(): void {
  handlers?.redo();
}

/** Whether a stroke undo/redo is available right now — the bindings' `when` gate. */
export function glowPaintCanUndo(): boolean {
  return handlers?.canUndo() ?? false;
}

export function glowPaintCanRedo(): boolean {
  return handlers?.canRedo() ?? false;
}
