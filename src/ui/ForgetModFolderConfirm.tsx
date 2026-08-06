import { useStore } from '@nanostores/react';
import { ConfirmDialog } from './kit';
import { $modFolder, forgetModFolder } from '../state/modFolderStore';

/**
 * **Forget mods folder** (dialog id `'forget-mod-folder-confirm'` — design:
 * design-projects-export.md §7). `ConfirmDialog` is blessed here for the same reason as the
 * chain confirm: the raiser is a MENU item, so this is a top-level confirm rather than one
 * inside a dialog — and the consequence ("you'll re-pick the folder next export") needs more
 * than the one truncated line an `InlineConfirmStrip` gives (foundation §14.3).
 *
 * Like `DeletePartConfirm`, it is a component so that the grant read is a **subscription**: a
 * bare `$modFolder.get()` inside `DialogRoot`'s switch compiles to an empty-dependency memo
 * slot on a component that never unmounts, so the title would keep naming whichever folder was
 * granted the first time the confirm was opened.
 */
export function ForgetModFolderConfirm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const name = useStore($modFolder).name ?? 'mods';
  return (
    <ConfirmDialog
      isOpen
      onOpenChange={onOpenChange}
      title={`Forget access to “${name}”?`}
      text="flexo keeps no copy of the grant; you'll re-pick the folder next export. Nothing already written into the folder is touched."
      confirmLabel="Forget"
      confirmVariant="danger"
      onConfirm={() => {
        void forgetModFolder();
        onOpenChange(false);
      }}
    />
  );
}
