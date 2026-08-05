import { useStore } from '@nanostores/react';
import { $openDialog } from '../../state/dialogStore';

/**
 * The single mount point for every overlay dialog (design:
 * `plans/flexo_v2/design/foundation.md` §10.1). Mounted once in `src/app.tsx` for desktop
 * AND phone; dialogs portal to `document.body`, so its position in the tree is irrelevant.
 *
 * Only the dialog named by `dialogStore.$openDialog` is rendered — everything else is
 * unmounted. That is load-bearing twice over: the catalog browsers get their
 * "fresh session on open" semantics for free (their body state dies with the unmount),
 * and no dialog pays render cost while closed.
 *
 * ## Adding a dialog (the whole checklist)
 *
 * 1. Add its id to `DialogId` in `src/state/dialogStore.ts`.
 * 2. Add a `case` below rendering the dialog component with:
 *    `isOpen onOpenChange={(v) => { if (!v) closeDialog(); }}`
 *    — the `onOpenChange` is what keeps react-aria's own dismissal (Escape, backdrop
 *    click) working unchanged, which is Escape-ladder rung 2 (design:
 *    design-system-services.md §4.6). A dialog whose API is `onClose` instead gets
 *    `onClose={closeDialog}`.
 * 3. Open it from a command with `openDialog({id: '<id>'})` — never from local button
 *    state, and never nest one dialog inside another (use the kit `DialogViewStack` or
 *    `InlineConfirmStrip` instead).
 *
 * `open.params` is passed straight through to the host that understands it.
 */
export function DialogRoot() {
  const open = useStore($openDialog);
  if (!open) return null;
  switch (open.id) {
    // Hosts are added here as each dialog is rehosted onto dialogStore.
    default:
      return null;
  }
}
