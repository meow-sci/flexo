/**
 * Handing keyboard focus back to the 3D viewport.
 *
 * The viewport host (`ViewportCanvas`) is `tabIndex={-1}` and focuses itself on
 * pointer-down, which is what keeps the `viewport` hotkey scope live — the nudge arrows,
 * WASDQER and ⌫ all go dead while a react-aria collection owns focus. Chrome that
 * deliberately gives focus up therefore needs a way to hand it back: the Outliner's second
 * Escape is the first caller (design: design-build-mode.md §2.5).
 *
 * A DOM lookup rather than a ref: the callers are panels and hotkey bindings with no
 * relationship to that component, and there is exactly one viewport host in the app.
 * Its own module (not `ViewportCanvas.tsx`) so the component file exports only components.
 */

/** Marks the focusable viewport host element. Stamped by `ViewportCanvas`. */
export const VIEWPORT_HOST_ATTR = 'data-viewport-host';

/** Focuses the 3D viewport host. No-op when the viewport is not mounted. */
export function focusViewport(): void {
  document.querySelector<HTMLElement>(`[${VIEWPORT_HOST_ATTR}]`)?.focus();
}
