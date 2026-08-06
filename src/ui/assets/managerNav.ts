import { createContext, useContext, type ReactNode } from 'react';
import type { DialogView } from '../kit';
import type { KittenKind } from '../../ksa/types';

/**
 * **The Asset Manager's navigation contract** — how any view inside the manager pushes
 * another view, pops back, closes the dialog, or raises a confirm (design:
 * design-surface-assets.md §2.2/§2.4; foundation §10.1 "no modal-in-modal").
 *
 * It travels by context rather than by prop because the manager's ROOT view is built inside
 * the same render that creates the view stack — a prop would need the stack before the hook
 * that returns it. Pushed views render under the same provider, so they read the identical
 * object.
 *
 * Why an interface instead of handing views the raw `DialogViewStackApi`: a detail view must
 * not be able to invent its own confirm chrome. `confirm()` is the ONE way a destructive
 * action inside the manager asks the user, and it always renders as a pushed view — never a
 * stacked `ConfirmDialog` (§10.1).
 */

/** The three kinds that have a pushed detail view (§2.2). */
export type AssetDetailKind = 'texture' | 'material' | 'mesh';

/** A tier-3 confirm, rendered as a pushed view (foundation §14.3). */
export interface ManagerConfirm {
  title: string;
  /** What is about to happen, with counts read from `$assetUsage` (never recomputed). */
  body: ReactNode;
  /** Items named one per line — the import inventory, the unused list (§5.1). */
  items?: string[];
  /**
   * The irreversibility paragraph. Always one of the `bytePolicy` constants for a
   * byte-backed action; omitted for a descriptor-only confirm (a >5-placement mesh delete).
   */
  warning?: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** After confirming: back to the browser (default — the item is gone) or one view back. */
  returnTo?: 'root' | 'back';
}

/**
 * The five creation routes, from ONE place so the rail's `＋ New ▾` menu and every empty
 * state's buttons can never diverge (D1).
 *
 * The first three open as **pushed views** in the manager's own stack — same form component
 * the Add-menu S dialogs mount (D9/P8.16), never a second modal. The last two are **jumps**
 * (D8/S27): the manager closes and the existing `add.importModel` / `add.kittenMesh:<kind>`
 * commands run, because both land somewhere else (Import Review / Build mode).
 */
export interface ManagerCreate {
  uploadTexture(): void;
  newMaterial(): void;
  newMesh(): void;
  importModel(): void;
  kittenMesh(kind: KittenKind): void;
}

export interface ManagerNav {
  push(view: DialogView): void;
  pop(): void;
  /** Back to the browser list. */
  reset(): void;
  /** Dismisses the whole dialog — the "jump" half of a jump-not-stack handoff (D8). */
  close(): void;
  /** Pushes the detail view for one asset (§2.2). */
  openDetail(kind: AssetDetailKind, id: string): void;
  confirm(request: ManagerConfirm): void;
  create: ManagerCreate;
}

export const ManagerNavContext = createContext<ManagerNav | null>(null);

/** The manager's nav. Throws outside the manager, which is a programming error, not a state. */
export function useManagerNav(): ManagerNav {
  const nav = useContext(ManagerNavContext);
  if (!nav) throw new Error('useManagerNav must be used inside the Asset Manager dialog');
  return nav;
}
