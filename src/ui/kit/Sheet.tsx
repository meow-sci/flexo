import { useRef, useState, type ReactNode } from 'react';
import { ModalOverlay, Modal as AriaModal, DialogContext } from 'react-aria-components';
import { cn } from './styles';
import { usePointerDrag } from './usePointerDrag';
import { z } from './zIndex';

/**
 * THE phone bottom-sheet primitive (foundation §12): two detents (50% / 92% of the
 * dynamic viewport), a drag grabber, and drag-down-to-dismiss. Every phone sheet — the
 * Panel sheet (right-sidebar content), the Inspector sheet (left-sidebar content), the
 * MenuSheet, the notification sheet — is built from this one component; no bespoke
 * phone sheet forks.
 *
 * Tenants today: the `PanelSheet` (the mode's right-sidebar body), the Inspector sheet (the
 * left-sidebar focus editor), the condensed status bar's mode / active-layer pickers, and —
 * the one {@link SheetProps.blocking `blocking={false}`} tenant — the chain sheet.
 *
 * **Non-blocking mode** (foundation §12 "Floating windows": Chain → 50% NON-blocking
 * sheet). The chain session's live nudge-a-seed-and-watch-the-array-reflow loop is LOCKED
 * (DECISIONS.md), so its phone variant may not take the pointer: with `blocking={false}`
 * there is no `ModalOverlay`, no backdrop, no focus trap and no dismiss-on-outside-press —
 * the viewport above the sheet keeps orbiting and dragging. Everything else (detents,
 * grabber, drag-down-to-dismiss) is identical.
 *
 * `children` is a kit `<Dialog>`, exactly like {@link Modal}. The grabber is a flex
 * sibling above it, so the dialog should claim the rest of the sheet with
 * `className="min-h-0 flex-1"` rather than `h-full`.
 */
export interface SheetProps {
  isOpen: boolean;
  onOpenChange(open: boolean): void;
  /** Detents per foundation §12: '50' = half sheet, '92' = tall sheet. */
  detent?: '50' | '92';
  children: ReactNode;
  /** Accessible name for the contained dialog when it has no `<Heading slot="title">`. */
  ariaLabel?: string;
  /** `false` = no overlay, no focus trap: the viewport stays live behind it. Default `true`. */
  blocking?: boolean;
}

/** Downward drag (px) past which releasing the grabber dismisses the sheet. */
const DISMISS_PX = 80;

// The kit Modal's `sheet` recipe (Modal.tsx), specialized: a fixed detent height
// instead of `max-h-[88vh]`. Kept as plain strings so Sheet stays self-contained.
const overlayClass =
  'fixed inset-0 flex items-end justify-center bg-overlay/60 backdrop-blur-sm transition-opacity data-[entering]:opacity-0 data-[exiting]:opacity-0';
const surfaceClass =
  'flex w-full flex-col rounded-t-2xl border-t border-border bg-panel-raised text-fg shadow-popover transition-transform data-[entering]:translate-y-full data-[exiting]:translate-y-full';

export function Sheet({
  isOpen,
  onOpenChange,
  detent = '50',
  children,
  ariaLabel,
  blocking = true,
}: SheetProps) {
  const [offset, setOffset] = useState(0);
  // The pointer-up handler runs before the trailing move's setState is rendered, so the
  // dismiss decision reads the ref, never the (one frame stale) state.
  const offsetRef = useRef(0);

  const { onPointerDown, dragging } = usePointerDrag({
    // Down-only: an upward drag pins the sheet at its detent and never scrolls the body.
    onMove(_dx, dy) {
      const y = Math.max(0, dy);
      offsetRef.current = y;
      setOffset(y);
    },
    onEnd() {
      const dismiss = offsetRef.current > DISMISS_PX;
      offsetRef.current = 0;
      setOffset(0);
      if (dismiss) onOpenChange(false);
    },
  });

  const heightClass = detent === '92' ? 'h-[92dvh]' : 'h-[50dvh]';
  const dragStyle = dragging
    ? { transform: `translateY(${offset}px)`, transition: 'none' }
    : undefined;

  const body = (
    <>
      <div
        onPointerDown={onPointerDown}
        aria-hidden="true"
        className="flex h-6 w-full shrink-0 cursor-grab touch-none items-center justify-center"
      >
        <div className="h-1 w-10 rounded-full bg-border-strong" />
      </div>
      <DialogContext.Provider value={{ 'aria-label': ariaLabel }}>
        {children}
      </DialogContext.Provider>
    </>
  );

  // Non-blocking: a plain fixed container, deliberately NOT a react-aria overlay — an
  // overlay would trap focus and swallow the pointer, which is exactly what the chain
  // session may not do.
  if (!blocking) {
    if (!isOpen) return null;
    return (
      <div
        className={cn(surfaceClass, heightClass, 'fixed inset-x-0 bottom-0 pointer-events-auto')}
        style={{ zIndex: z.overlay, ...dragStyle }}
      >
        {body}
      </div>
    );
  }

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={overlayClass}
      style={{ zIndex: z.overlay }}
    >
      <AriaModal
        className={cn(surfaceClass, heightClass)}
        // While dragging, the sheet tracks the finger: the class transition would lag it.
        // Clearing both on release lets the same transition spring it back.
        style={dragStyle}
      >
        {body}
      </AriaModal>
    </ModalOverlay>
  );
}
