/** Shell dialog state (session-only), so menu items and hotkeys share one switch. */
import { atom } from 'nanostores';

export const $exportOpen = atom(false);
export const $addOpen = atom(false);

/** Phone-only sidebar drawers (App renders panels as overlays when phone). */
export const $leftPanelOpen = atom(false);
export const $rightPanelOpen = atom(false);
