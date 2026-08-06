import type { Command } from '../../state/commandStore';
import { $mode, setMode } from '../../state/modeStore';
import { $activeAnimation, openMembersView } from '../../state/animationStore';

/**
 * Animation-mode commands (design-animation-mode.md §13 palette list).
 *
 * **Palette-only, deliberately** — the discoverable routes into these behaviours are the mode
 * switcher, `2`, and the navigator's own buttons; the palette rows are the keyboard shortcut
 * on top of them, exactly as `dataCommands.ts` / `surfaceCommands.ts` are for their modes.
 *
 * Only "Edit joint members" ships here (P11C.02's entry-point list); the rest of §13's roster
 * — insert keyframe, play/pause, edit pivot, re-anchor, new clip, dynamic "Open clip: <name>"
 * — lands with the diagnostics/palette task that owns them.
 *
 * **Undo enrollment: NONE.** Opening the Members view is view state; the assignments made
 * inside it push their own discrete steps.
 */
export const ANIMATION_COMMANDS: Command[] = [
  {
    id: 'animation.editMembers',
    title: 'Edit joint members',
    keywords: 'animation joint members attach subpart rig paint',
    enabled: () => $mode.get() !== 'animation' || $activeAnimation.get() !== null,
    disabledReason: 'Create an animation clip first',
    run: () => {
      // A cross-mode jump carries its context (foundation §2.5): switch first, then open.
      if ($mode.get() !== 'animation') setMode('animation');
      openMembersView();
    },
  },
];
