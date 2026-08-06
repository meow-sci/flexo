import type { Command } from '../../state/commandStore';
import { $mode, setMode } from '../../state/modeStore';
import { $part } from '../../state/editorStore';
import { status, undoStatusAction } from '../../state/statusStore';
import {
  $activeAnimation,
  $activeJointId,
  $animPlaying,
  $timelineSelection,
  addAnimation,
  openAnimationClip,
  openMembersView,
  setPivotEditing,
  setRestAnchor,
} from '../../state/animationStore';
import { insertKeyframeAtPlayhead, togglePlayback } from '../animation/timelineActions';

/**
 * Animation-mode commands (design-animation-mode.md §13 palette list).
 *
 * **Palette-only, deliberately** — `MENU_SPEC` is the authoritative menubar tree and gives
 * Animation exactly two entries (View ▸ Motion Trails, Window ▸ Timeline, both already
 * registered by `viewCommands` / `windowCommands`); §13 says "no new top-level menus", so the
 * rest live here, exactly as `dataCommands.ts` / `surfaceCommands.ts` do for their modes. The
 * discoverable routes stay the mode switcher, `2`, and the navigator's own buttons.
 *
 * **Two ids are shared with the hotkey registry on purpose**: `anim.playPause` and
 * `anim.insertKeyframe` are the ids the `mode:animation` bindings carry, so `Space` / `K`,
 * the transport buttons and the palette rows are ONE action with ONE enablement rule — and
 * the palette shows the chord beside the row for free (foundation §4).
 *
 * Every row that needs a clip either enables itself off `$activeAnimation` or jumps into the
 * mode first (foundation §2.5): a palette run from Build mode must land somewhere useful
 * rather than silently doing nothing.
 *
 * **Undo enrollment: NONE of its own** — each row delegates to a store action or a timeline
 * action that owns its step (insert / re-anchor / new clip are discrete; the transport and
 * the view takeovers are never undoable).
 */

/** Enters Animation mode if we are elsewhere — every row below is a mode-local behaviour. */
function ensureMode(): void {
  if ($mode.get() !== 'animation') setMode('animation');
}

/** The one selected timeline column, or null when the selection is empty or plural. */
function soleSelectedColumn(): { animId: string; kfId: string } | null {
  const anim = $activeAnimation.get();
  const selection = $timelineSelection.get();
  if (!anim || selection.length !== 1) return null;
  const kf = anim.keyframes.find((k) => k.id === selection[0]);
  return kf ? { animId: anim.id, kfId: kf.id } : null;
}

export const ANIMATION_COMMANDS: Command[] = [
  {
    id: 'animation.newClip',
    title: 'New animation clip',
    keywords: 'animation clip create add new keyframe timeline',
    run: () => {
      ensureMode();
      addAnimation();
    },
  },
  {
    // Shared id with the `mode:animation` `Space` binding.
    id: 'anim.playPause',
    title: 'Play/Pause preview',
    keywords: 'animation play pause preview transport space scrub',
    enabled: () => $activeAnimation.get() !== null,
    disabledReason: 'Open an animation clip first',
    checked: () => $animPlaying.get(),
    run: () => {
      ensureMode();
      togglePlayback();
    },
  },
  {
    // Shared id with the `mode:animation` `K` binding.
    id: 'anim.insertKeyframe',
    title: 'Insert keyframe at playhead',
    keywords: 'animation keyframe insert add key playhead pose',
    enabled: () => $activeAnimation.get() !== null,
    disabledReason: 'Open an animation clip first',
    run: () => {
      ensureMode();
      insertKeyframeAtPlayhead();
    },
  },
  {
    id: 'animation.editMembers',
    title: 'Edit joint members',
    keywords: 'animation joint members attach subpart rig paint',
    enabled: () => $mode.get() !== 'animation' || $activeAnimation.get() !== null,
    disabledReason: 'Create an animation clip first',
    run: () => {
      // A cross-mode jump carries its context (foundation §2.5): switch first, then open.
      ensureMode();
      openMembersView();
    },
  },
  {
    id: 'animation.editPivot',
    title: 'Edit joint pivot',
    keywords: 'animation pivot hinge joint rest anchor gizmo',
    // The tool parks + pins on the rest anchor of the ACTIVE joint's clip, so it needs both.
    enabled: () => $activeAnimation.get() !== null && $activeJointId.get() !== null,
    disabledReason: 'Select a joint first',
    checked: () => false,
    run: () => {
      ensureMode();
      setPivotEditing(true);
    },
  },
  {
    id: 'animation.reanchorRest',
    title: 'Re-anchor rest at selected keyframe',
    keywords: 'animation rest anchor keyframe deploy modeled placements re-anchor',
    enabled: () => soleSelectedColumn() !== null,
    disabledReason: 'Select exactly one timeline column',
    run: () => {
      const target = soleSelectedColumn();
      if (!target) return;
      const kf = $activeAnimation.get()?.keyframes.find((k) => k.id === target.kfId);
      setRestAnchor(target.animId, target.kfId);
      status(
        `Rest anchor moved to @${(kf?.timeSec ?? 0).toFixed(2)}s — this keyframe now matches the modeled placements`,
        { severity: 'success', action: undoStatusAction() },
      );
    },
  },
];

/**
 * Dynamic provider: **"Open clip: Deploy"** per clip on the part (design §13). Re-evaluated on
 * every palette keystroke, so it always describes the live document — and it is the only route
 * to a clip that does not require being in Animation mode with the navigator in front of you.
 */
export function animationClipCommands(): Command[] {
  return $part.get().animations.map((anim) => ({
    id: `animation.openClip:${anim.id}`,
    title: `Open clip: ${anim.name}`,
    keywords: 'animation clip open switch timeline keyframes',
    run: () => openAnimationClip(anim.id),
  }));
}
