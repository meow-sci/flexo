import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { ChevronUp, X } from 'lucide-react';
import { Button, Dialog, Sheet } from './kit';
import { ModeFocusEditor } from './ModeFocusEditor';
import { $selectionCount } from './../state/selectors';

/**
 * The phone **Inspector sheet** (foundation §12 Sheet row; design-build-mode.md §11 item 2)
 * — the LEFT sidebar's content, opened from a selection FAB in the viewport's corner.
 *
 * The split between the two phone sheets mirrors the desktop's two sidebars exactly:
 * the **Panel sheet** (re-tap the active mode tab) hosts the mode primary — the Outliner in
 * Build — and this one hosts the focus editor. It renders the IDENTICAL desktop component
 * ({@link ModeFocusEditor}), so every per-kind card, the multi-select panel, the aid editors
 * and the tool parameter cards arrive with the same focus-slot rules and no phone fork. The
 * one phone ADDITION is inside the transform card: `TouchNudgeCluster`, which gives touch
 * the nudge and rotate the keyboard gets from the arrows and `W`/`S`.
 *
 * The FAB carries the selection count so the sheet is discoverable while collapsed, and the
 * whole viewport stays free of chrome until it is opened.
 *
 * The sheet renders nothing while closed (react-aria's `ModalOverlay`), so each open is a
 * fresh mount — no first-render predicate frozen by React Compiler.
 *
 * Undo enrollment: NONE — sheet visibility is ephemeral view state.
 */
export function MobileInspector() {
  const [open, setOpen] = useState(false);
  const selectedCount = useStore($selectionCount);

  return (
    <>
      <Button
        size="lg"
        variant="secondary"
        className="absolute bottom-3 right-3 min-h-11 shadow-popover"
        onPress={() => setOpen(true)}
        aria-label="Open inspector"
      >
        <ChevronUp className="size-4" />
        <span>Inspector</span>
        {selectedCount > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-fg">
            {selectedCount}
          </span>
        )}
      </Button>

      <Sheet isOpen={open} onOpenChange={setOpen} detent="92" ariaLabel="Inspector">
        <Dialog className="min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-end border-b border-border px-2 py-1">
            <Button
              iconOnly
              size="sm"
              variant="ghost"
              className="size-11"
              aria-label="Close inspector"
              onPress={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ModeFocusEditor />
          </div>
        </Dialog>
      </Sheet>
    </>
  );
}
