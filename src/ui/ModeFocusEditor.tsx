import { useStore } from '@nanostores/react';
import { BuildFocusEditor } from './build/BuildFocusEditor';
import { $mode } from '../state/modeStore';

/**
 * The LEFT sidebar's body — "the focus editor" (design: `plans/flexo_v2/design/foundation.md`
 * §7). One switch on `$mode`, mirroring {@link ModeSidebar}'s switch for the right sidebar's
 * mode primary.
 *
 * The framework is shared by all five modes: each contributes a ruleset that answers *what am
 * I focused on, and what can I do to it?* as a pure function of `(mode, focus)` — tool
 * parameter card, then the focus card, then a mode cheat-card when nothing applies. Build's
 * ruleset is {@link BuildFocusEditor} (§7.1); Animation (§7.2), Data (§7.3), Engine (§7.4)
 * and Surface (§7.5) land with their own phases and plug in here.
 *
 * **Undo enrollment: NONE** — the mode is view state (foundation §13).
 */
export function ModeFocusEditor() {
  const mode = useStore($mode);

  if (mode === 'build') return <BuildFocusEditor />;

  // INTERIM: the other four modes keep their editors in the right sidebar / dialogs until
  // their own phases build a left ruleset. RULE ZERO — nothing is removed, so an empty slot
  // costs the user no feature.
  return (
    <p className="p-(--density-panel-p) text-xs text-fg-subtle">
      Nothing focused — this mode&rsquo;s focus editor arrives in a later phase.
    </p>
  );
}
