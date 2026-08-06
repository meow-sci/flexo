import { useStore } from '@nanostores/react';
import { ConfirmDialog } from '../kit';
import { $activePartMeta, deletePart } from '../../state/partsStore';
import { toast } from '../toast';

/**
 * **Delete Part…** (dialog id `'part-delete-confirm'` — plan: `plans/MULTI_PART_PLAN.md` P4.02).
 * Structurally the twin of `RenamePartDialog`, and for the same reason: it always targets the
 * ACTIVE part, so it **subscribes** to `$activePartMeta` rather than taking a params payload
 * that could go stale between the menu opening and the command running.
 *
 * It is a component rather than a `ConfirmDialog` inlined into `DialogRoot`'s switch because a
 * bare `$activePartMeta.get()` in that switch is a NON-reactive read: the React Compiler caches
 * it in an empty-dependency memo slot, and `DialogRoot` is mounted once at app root and never
 * unmounts — so opening this confirm over part B after having opened it over part A would still
 * name A, and confirm would delete A. `useStore` is what makes the read correct.
 *
 * `ConfirmDialog` is blessed here because the raiser is a MENU item, so this IS the top-level
 * confirm — and the consequence (the part's undo history and custom assets go with it, I6)
 * needs more than an `InlineConfirmStrip`'s one line. The popover's per-row delete uses that
 * strip instead (P4.04): two entry points, one `deletePart`.
 *
 * **Undo enrollment: NONE** — deleting a part is registry lifecycle, not document state (I6),
 * which is exactly why naming the wrong part is unrecoverable.
 */
export function DeletePartConfirm({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const meta = useStore($activePartMeta);
  if (!meta) return null;
  return (
    <ConfirmDialog
      isOpen
      onOpenChange={onOpenChange}
      title={`Delete part “${meta.name}”?`}
      text="Its contents, undo history and custom assets are removed. This cannot be undone."
      confirmLabel="Delete"
      confirmVariant="danger"
      onConfirm={() => {
        if (deletePart(meta.id)) toast({ title: `Deleted part: ${meta.name}` });
        onOpenChange(false);
      }}
    />
  );
}
