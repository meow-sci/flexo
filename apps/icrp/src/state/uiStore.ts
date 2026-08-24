/** Shell dialog state (session-only), so menu items and hotkeys share one switch. */
import { atom } from 'nanostores';

export const $exportOpen = atom(false);
export const $addOpen = atom(false);
