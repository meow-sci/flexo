import { atom } from 'nanostores';

/**
 * The phone's two sheet slots, hoisted out of component state (design: foundation §12;
 * design-data-engine-modes.md §A8).
 *
 * They were component-local until Data mode needed the two sheets to hand off to each other:
 * tapping a scope row in the **Panel** sheet closes it and opens the **Inspector** sheet on
 * that scope, `‹ Scopes` goes back, and "Select in 3D" / the coupling "Show →" eye CLOSE the
 * Inspector sheet so the highlight they just made is actually visible. None of those senders
 * is inside the component that owns the sheet, so the open flags cannot live there.
 *
 * Only ONE may be open at a time — they occupy the same physical slot, and a stacked pair
 * would bury the viewport the phone affordances exist to reveal.
 *
 * Ephemeral view state: never persisted, never an undo step (foundation §13).
 */

export const $panelSheetOpen = atom(false);
export const $inspectorSheetOpen = atom(false);
/**
 * The third slot: Animation mode's **fullscreen Timeline sheet** (foundation §12 Timeline
 * row; design-animation-mode.md §14), opened from the docked transport chip. It shares the
 * one-at-a-time rule with the other two — it covers the screen, so a Panel sheet under it
 * would be unreachable — but it is deliberately its own atom, because playback and the
 * playhead live in `animationStore` and survive the sheet closing.
 */
export const $timelineSheetOpen = atom(false);

export function openPanelSheet(): void {
  $inspectorSheetOpen.set(false);
  $timelineSheetOpen.set(false);
  $panelSheetOpen.set(true);
}

export function openInspectorSheet(): void {
  $panelSheetOpen.set(false);
  $timelineSheetOpen.set(false);
  $inspectorSheetOpen.set(true);
}

export function openTimelineSheet(): void {
  $panelSheetOpen.set(false);
  $inspectorSheetOpen.set(false);
  $timelineSheetOpen.set(true);
}

/** Closes all three — what a "go look at the viewport" action does (§A8 "Select in 3D"). */
export function closePhoneSheets(): void {
  $panelSheetOpen.set(false);
  $inspectorSheetOpen.set(false);
  $timelineSheetOpen.set(false);
}
