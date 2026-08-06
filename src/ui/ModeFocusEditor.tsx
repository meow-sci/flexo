import { useStore } from '@nanostores/react';
import { BuildFocusEditor } from './build/BuildFocusEditor';
import { DataScopeForm } from './data/DataScopeForm';
import { ModuleEditor } from './engine/ModuleEditor';
import { SurfaceLeftPanel } from './surface/SurfaceLeftPanel';
import { AnimationFocusEditor } from './animation/AnimationFocusEditor';
import { $mode } from '../state/modeStore';

/**
 * The LEFT sidebar's body — "the focus editor" (design: `plans/flexo_v2/design/foundation.md`
 * §7). One switch on `$mode`, mirroring {@link ModeSidebar}'s switch for the right sidebar's
 * mode primary.
 *
 * The framework is shared by all five modes: each contributes a ruleset that answers *what am
 * I focused on, and what can I do to it?* as a pure function of `(mode, focus)` — tool
 * parameter card, then the focus card, then a mode cheat-card when nothing applies. Build's
 * ruleset is {@link BuildFocusEditor} (§7.1), Data's is {@link DataScopeForm} (§7.3),
 * Animation's is {@link AnimationFocusEditor} (§7.2), Engine's is {@link ModuleEditor} (§7.4)
 * and Surface's is {@link SurfaceLeftPanel} (§7.5) — every mode now answers.
 *
 * **Undo enrollment: NONE** — the mode is view state (foundation §13).
 */
export function ModeFocusEditor() {
  const mode = useStore($mode);

  if (mode === 'build') return <BuildFocusEditor />;
  // Data's ruleset is not a selection inspector: the LEFT panel shows the GameData form for
  // the scope the right navigator picked (foundation §7.3).
  if (mode === 'data') return <DataScopeForm />;
  // Engine's ruleset is the module the right tree focused — exactly one at a time (§7.4).
  if (mode === 'engine') return <ModuleEditor />;
  // Surface's ruleset is the picked FACE (plus the selection inspector and the read-only
  // built-in surface card beneath it) — §7.5.
  if (mode === 'surface') return <SurfaceLeftPanel />;
  // Animation's ruleset is the clip / joint / keyframe focus stack, plus the armed tool's
  // parameter card above it (§7.2, design-animation-mode.md §8).
  return <AnimationFocusEditor />;
}
