import { useEffect, useRef } from 'react';
import { Button } from './Button';

/**
 * Row-level destructive confirm rendered IN PLACE (design-system-services §7.5) — the
 * second leg of killing modal-in-modal. The CALLER swaps its row content for this strip;
 * the strip never overlays or portals.
 *
 * Confirm policy (foundation §14.3): reserved for destructive actions that are large,
 * whole-container, or not fully undoable. The `label` carries the irreversibility wording
 * ("…the image bytes cannot be recovered") — that is the caller's job, not the strip's.
 */
export function InlineConfirmStrip({
  label,
  confirmLabel,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
  timeoutMs = 8000,
  size = 'sm',
}: {
  /** e.g. `Delete "Hull"?` — irreversibility wording is the caller's job. */
  label: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  /** Auto-cancel after this long unanswered (design-system-services §7.5: 8s). */
  timeoutMs?: number;
  /** `sm` in dialogs, `xs` in sidebars (foundation §14.4). */
  size?: 'xs' | 'sm';
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest-callback ref so an inline `onCancel` arrow from the caller cannot restart the
  // countdown on every render.
  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  });
  useEffect(() => {
    timer.current = setTimeout(() => cancel.current(), timeoutMs);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [timeoutMs]);

  const stopTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <div className="flex min-w-0 items-center gap-(--density-gap)">
      <span className="min-w-0 flex-1 truncate text-xs text-fg">{label}</span>
      <Button
        size={size}
        variant={confirmVariant}
        onPress={() => {
          stopTimer();
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button
        size={size}
        variant="ghost"
        autoFocus
        onPress={() => {
          stopTimer();
          onCancel();
        }}
      >
        Cancel
      </Button>
    </div>
  );
}
