import { Button } from '../kit';

/**
 * The two catalog browsers' shared furniture (design: design-build-mode.md §6.2/§6.3;
 * foundation §10.10). Both dialogs are the same machine over a different catalog, so the
 * pieces that encode the *rules* live here and the two dialogs stay thin.
 *
 * The rules, once:
 * - **result cap** — a search never silently truncates (census pain 6): when the match set
 *   is longer than {@link MAX_RESULTS} the list ends in a row saying how many of how many
 *   are shown and what to do about it;
 * - **commit gestures** — single click / arrow keys **preview only**; double-click, Enter
 *   and `[Add]` **add and stay** (multi-add is the primary flow); `[Add & Close]` is the
 *   explicit exit-committing action. A stray row click can no longer commit — that is the
 *   logged deliberate behavior change from v1 (foundation §10.10).
 */

/**
 * How many matches a browser list renders. Kept at v1's number: the cap exists because the
 * preview pane makes long lists pointless, not because rendering is slow.
 */
export const MAX_RESULTS = 200;

/**
 * The cap indicator (design §6.2 wireframe: "200 of 431 shown — refine search"). Renders
 * nothing while the whole match set fits, which is the common case.
 */
export function ResultCapRow({ shown, total }: { shown: number; total: number }) {
  if (shown >= total) return null;
  return (
    <div className="border-t border-border px-3 py-1.5 text-xs text-fg-subtle">
      {shown} of {total} shown — refine search
    </div>
  );
}

/**
 * The footer commit row both browsers end with. `[Add]` keeps the dialog open so a session
 * can place several things; `[Add & Close]` is the one-and-done exit.
 */
export function BrowserCommitRow({
  isDisabled,
  onAdd,
  onAddAndClose,
}: {
  isDisabled: boolean;
  onAdd: () => void;
  onAddAndClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2">
      <Button size="sm" variant="primary" isDisabled={isDisabled} onPress={onAdd}>
        Add
      </Button>
      <Button size="sm" isDisabled={isDisabled} onPress={onAddAndClose}>
        Add &amp; Close
      </Button>
    </div>
  );
}
