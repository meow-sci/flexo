import { Dialog, Sheet } from '../../kit';
import { ModeSidebar } from '../../ModeSidebar';

/**
 * The phone **Panel sheet** (design: foundation §12, Sheet row): the right sidebar's body —
 * the current mode's primary panel — as a bottom sheet, opened by re-tapping the active tab
 * in the `ModeTabBar`.
 *
 * It hosts the IDENTICAL desktop component ({@link ModeSidebar}) rather than a phone fork,
 * which is the whole point of the phone framework: when a mode phase replaces its sidebar
 * body, the sheet inherits it for nothing. Density is the `sm` tier the phone surfaces use;
 * the panel's own controls carry the 44px minimum rows.
 *
 * The sheet renders nothing while closed (react-aria's `ModalOverlay`), so each open is a
 * fresh mount of the panel — no stale first-render predicates.
 *
 * Undo enrollment: NONE — sheet visibility is ephemeral view state.
 */
export function PanelSheet({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet isOpen={isOpen} onOpenChange={onOpenChange} detent="92" ariaLabel="Panel">
      <Dialog className="min-h-0 flex-1 overflow-y-auto p-2">
        <ModeSidebar />
      </Dialog>
    </Sheet>
  );
}
