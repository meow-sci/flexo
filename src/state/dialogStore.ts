import { atom } from 'nanostores';

/**
 * The single "which overlay dialog is open" atom (design:
 * `plans/flexo_v2/design/foundation.md` §10.1 + §4 "Dialog-opening commands"; §13
 * dialogStore row). Dialogs are mounted ONCE at root by `src/ui/shell/DialogRoot.tsx` and
 * opened by commands writing `{id, params}` here — which retires v1's per-button open
 * state and its controlled/uncontrolled dual APIs (census: shell-layout.md pain 6).
 *
 * **Exactly one dialog is open at a time. Stacking is banned** (foundation §10.1):
 * {@link openDialog} overwrites whatever was open. A nested flow (list → detail → confirm)
 * uses the kit `DialogViewStack` inside its own dialog, or an `InlineConfirmStrip` on the
 * row; `ConfirmDialog` stays blessed only for a top-level confirm that is not already
 * inside a dialog.
 *
 * **Layering (constitution)**: zero react / three imports. **Undo enrollment: NONE** —
 * dialog open state is ephemeral view state, never persisted, never in history.
 *
 * `$dialogViewStack` (foundation §13) is deliberately NOT created here: `DialogViewStack`
 * keeps its stack local to each adopting dialog.
 */

/**
 * Every root-hosted dialog. Adding a dialog = add its id here AND a case in
 * `DialogRoot.tsx`; there is no other registration step and no dynamic id.
 *
 * Deliberately ABSENT (they keep their v1 atoms until the import phase rehosts them):
 * `import-model` (`$importModelRequest`) in `src/state/customAssetStore.ts`, plus
 * `MeshPickerModal`, which stays local to the animation toolbar until the Animation phase.
 */
export type DialogId =
  | 'projects'
  | 'rename-project'
  | 'share-link'
  | 'export-project'
  | 'import-project'
  | 'export-ksa'
  | 'settings'
  | 'scale-everything'
  | 'asset-manager'
  // The v1 CustomAssetsModal, retired once the Asset Manager's last v1 surface dies.
  | 'custom-assets'
  | 'subpart-browser'
  | 'part-browser'
  | 'create-mesh'
  | 'upload-texture'
  | 'material'
  | 'glow-paint'
  | 'help'
  | 'about'
  | 'chain-discard-confirm';

export interface OpenDialog {
  id: DialogId;
  /**
   * Opaque payload for the host (e.g. `{tab: 'scene'}` for Settings deep-links,
   * `{steps: 3}` for the chain discard confirm). The host owns its shape — the store
   * never inspects it.
   */
  params?: unknown;
}

/** The open dialog, or `null` when none is. */
export const $openDialog = atom<OpenDialog | null>(null);

/** Opens a dialog, replacing any dialog already open (no stacking — §10.1). */
export function openDialog(d: OpenDialog): void {
  $openDialog.set(d);
}

/** Closes whatever is open. Safe to call when nothing is. */
export function closeDialog(): void {
  $openDialog.set(null);
}

/** With an id: is THAT dialog open. Without one: is ANY dialog open. */
export function isDialogOpen(id?: DialogId): boolean {
  const open = $openDialog.get();
  if (!open) return false;
  return id === undefined || open.id === id;
}
