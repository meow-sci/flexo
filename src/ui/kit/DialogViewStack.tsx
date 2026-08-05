import { useState } from 'react';
import { DialogHeader } from './Modal';

/**
 * The modal-in-modal killer (foundation §10.1; design-system-services §7.5): a dialog owns
 * a pushable stack of views (`list → detail → confirm`) instead of opening a second Modal.
 * The header grows a `‹` back chevron at depth > 1 and Escape pops the top view before the
 * dialog itself dismisses (Escape ladder rung 2 — foundation §11.4).
 */

/** One page in a dialog's navigation stack. */
export interface DialogView {
  /** Stable identity for the view (debugging + caller-side comparisons). */
  id: string;
  title: React.ReactNode;
  element: React.ReactNode;
}

export interface DialogViewStackApi {
  /** Depth ≥ 1: index 0 is the root, the last entry is the one that renders. */
  views: DialogView[];
  top: DialogView;
  push(view: DialogView): void;
  /** No-op at depth 1. */
  pop(): void;
  /** Back to `[root]`. */
  reset(): void;
}

/**
 * Owns the view stack for one dialog. `root` is read fresh on every render (only the
 * pushed views are held in state), so a root view whose element depends on live state
 * never goes stale behind a push.
 */
export function useDialogViewStack(root: DialogView): DialogViewStackApi {
  const [pushed, setPushed] = useState<DialogView[]>([]);
  return {
    views: [root, ...pushed],
    top: pushed.at(-1) ?? root,
    push: (view: DialogView) => setPushed((prev) => [...prev, view]),
    pop: () => setPushed((prev) => (prev.length === 0 ? prev : prev.slice(0, -1))),
    reset: () => setPushed((prev) => (prev.length === 0 ? prev : [])),
  };
}

/**
 * Renders the stack's top view under a {@link DialogHeader}. Only the top view is mounted —
 * push/pop is navigation, not tabs. Place directly inside a kit `Dialog`.
 *
 * Escape is handled in the BUBBLE phase on purpose: `useNumberDraft` stops propagation only
 * while a field is dirty, so a dirty numeric field's revert (ladder rung 1) still wins, and
 * stopping propagation here keeps react-aria's Modal dismiss from also firing.
 */
export function DialogViewStack({
  stack,
  onClose,
}: {
  stack: DialogViewStackApi;
  onClose: () => void;
}) {
  const depth = stack.views.length;
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || depth <= 1) return;
        event.preventDefault();
        event.stopPropagation();
        stack.pop();
      }}
    >
      <DialogHeader
        title={stack.top.title}
        onClose={onClose}
        onBack={depth > 1 ? stack.pop : undefined}
      />
      {stack.top.element}
    </div>
  );
}
