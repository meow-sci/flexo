import * as THREE from 'three';
import { atom, computed } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';
import type {
  AnimationKeyframe,
  AnimationMode,
  EasingChannel,
  EasingConfig,
  EditingPart,
  JointSegmentEasing,
  PartAnimation,
  SolarTrackingSpec,
  Transform,
  Vec3,
} from '../ksa/types';
import { createPartAnimation, identityTransform, VEC3_ONE } from '../ksa/types';
import { BAKE_FPS, jointWorld, restAnchorTime, sampleJointLocal } from '../ksa/animationRig';
import {
  EASING_CHANNELS,
  isLinearEasing,
  normalizeSegmentEasing,
  uniformSegmentEasing,
} from '../ksa/easing';
import { splitEasingConfigAt } from '../ksa/easingFit';
import { computeClipIssues } from '../ksa/clipIssues';
import { matrixFromTransform, transformFromMatrix } from '../three/coords';
import { $mode, armTool, disarmTool, registerModeHooks, registerTool, setMode } from './modeStore';
import { $part, $selection, pushUndo, type ToolMode } from './editorStore';

/**
 * Document actions + ephemeral editor state for custom animations (see
 * plans/FEATURE_ANIMATIONS_PLAN.md). Animations live on {@link EditingPart.animations}
 * (undo-tracked document state), so every discrete mutation here pushes undo and
 * replaces `$part` — exactly like the layer/gameData actions in editorStore. Pose
 * capture is a STREAMING mutation ({@link setJointPose}): no internal undo push, the
 * caller pushes once at the start of a gizmo drag / field focus.
 *
 * KSA model recap: an animation is a skeleton of {@link AnimationJoint}s; each moving
 * SubPart attaches to a joint and the export builds the leaf parenting + offsets. The
 * keyframe at t=0 is the rest pose (every joint identity by default); SubParts sit at
 * their placements until a later keyframe poses their joint.
 */

// ── ephemeral editor state (NOT in undo, like selection) ─────────────────────

/** The animation currently open in the editor (drives the preview + pose UI), or null. */
export const $activeAnimationId = atom<string | null>(null);
/** The joint whose pose the gizmo/fields edit, or null. */
export const $activeJointId = atom<string | null>(null);
/** The keyframe being posed (pins the preview to its time); null = free scrub. */
export const $editKeyframeId = atom<string | null>(null);
/**
 * True while the user is actively dragging the playhead. The viewport applies the joint
 * override while scrubbing (as it does while pinned, parked or playing); otherwise SubParts
 * show their static modeled placement. This is what lets an imported KSA deploy clip — whose
 * rest is the DEPLOYED last keyframe — sit deployed at rest yet still fold to stowed (t=0)
 * while you drag, springing back to the modeled pose on release.
 */
export const $animScrubbing = atom<boolean>(false);

/** True while {@link playAnimationPreview} is auto-advancing the scrubber (vs. a manual drag). */
export const $animPlaying = atom<boolean>(false);

/** The active animation object, or null. */
export const $activeAnimation = computed([$part, $activeAnimationId], (part, id) =>
  id ? (part.animations.find((a) => a.id === id) ?? null) : null,
);

/**
 * True while the Animations editor has a joint + keyframe open for posing. The
 * Move/Rotate/Scale toolbar normally appears only for a viewport selection, which is
 * empty during pose editing — this lets the Tool bar window show itself so all three
 * gizmos stay reachable while posing.
 */
export const $isPoseEditing = computed(
  [$mode, $activeAnimationId, $activeJointId, $editKeyframeId],
  (mode, animId, jointId, kfId) => mode === 'animation' && !!animId && !!jointId && !!kfId,
);

/**
 * Per-clip export diagnostics, keyed by animation id (design §11.1). Derived purely from
 * the document, so every surface — clip chips, the Clip card checklist, timeline hints, the
 * mode attention dot, the export pre-flight — reads the same answer.
 */
export const $clipIssues = computed([$part], computeClipIssues);

/**
 * How many clips the exporter would SKIP — the number behind the mode switcher's attention
 * dot and the export pre-flight's Animations block (design §11.1; foundation §2.2). A clip
 * counts as a draft exactly when it carries a `blocker`, which `computeClipIssues` derives
 * from the same three predicates as `isAnimationExportable`.
 */
export const $draftClipCount = computed(
  $clipIssues,
  (issues) =>
    Object.values(issues).filter((list) => list.some((issue) => issue.severity === 'blocker'))
      .length,
);

// ── v2 ephemeral atoms (never persisted, never undo; clamped by initAnimationStore) ──

/**
 * The playhead, in SECONDS (design-animation-mode.md §4.1) — the ONE preview time source
 * (`EditorScene.applyAnimationPreview` reads it directly; the v1 normalized `$animPreviewU`
 * is gone). HIGH FREQUENCY: every rAF tick of playback writes it, so only leaf components /
 * imperative canvas layers may subscribe (§5.8 — the v1 `PreviewProgressLabel` FPS lesson
 * is binding).
 */
export const $playheadSec = atom<number>(0);

/**
 * PARK state (§10.1): the playhead is deliberately held at `$playheadSec` and the posed
 * preview override is shown. False ⇒ REST: the scene is the modeled part.
 */
export const $playheadParked = atom<boolean>(false);

/** Selected timeline column (keyframe) ids — multi-select. */
export const $timelineSelection = atom<string[]>([]);

/** In-session keyframe clipboard; times are RELATIVE to the first copied column (§5.7). */
export const $animClipboard = atom<{
  columns: {
    dt: number;
    poses: Record<string, Transform>;
    easings?: Record<string, JointSegmentEasing>;
  }[];
} | null>(null);

/** A throwaway posing anchor (§9.4) — never exported, never part of the document. */
export const $workingPivot = atom<{
  kind: 'centroid' | 'subpart' | 'point';
  position: Vec3;
  sourceInstanceId?: string;
} | null>(null);

/** The explicit Pivot tool is armed (§9.4). */
export const $pivotEditing = atom<boolean>(false);

/**
 * Which pivot the armed `pivot-pick` tool will write the clicked surface point to (§9.4
 * item 3): the active JOINT's real pivot, or the throwaway WORKING pivot. Null whenever the
 * tool is not armed — the tool's `onCancel` clears it, so the two can never disagree.
 */
export const $pivotPickTarget = atom<'joint' | 'working' | null>(null);

/**
 * True while a {@link PoseGizmo} drag is in flight — the ephemeral flag the status bar's
 * modifier-hint provider keys the `X/Y/Z lock axis · ⌃ temp snap` row off (§9.2, §13).
 */
export const $poseDragActive = atom<boolean>(false);

/**
 * **The** per-gesture pose axis lock (§9.2): the status bar's hint reads it, and `PoseGizmo`
 * both writes it (the `X`/`Y`/`Z` keys) and applies it (a subscription). Null = free; it
 * resets at drag end and is never persisted.
 */
export const $poseDragLock = atom<{ axis: 'x' | 'y' | 'z'; space: 'local' | 'world' } | null>(null);

/**
 * The phone Tool bar's `[free|X|Y|Z]` segmented control (design §14 row 5) — touch has no
 * `X`/`Y`/`Z` keys, so the lock needs a pointer route. It only reaches the joint-LOCAL tier;
 * the world-axis second tap stays desktop-only, which §14 lists as a sanctioned reduction.
 */
export function setPoseAxisLock(axis: 'x' | 'y' | 'z' | null): void {
  $poseDragLock.set(axis ? { axis, space: 'local' } : null);
}

/**
 * The §9.6 posed-placement lock, published by `EditorScene.updateSelection` (the scene→UI
 * report pattern): the preview shows a POSED frame AND the selection contains something the
 * animation drives, so the placement gizmo is detached. v1 did this silently — census pain 8.
 */
export const $posedPlacementLock = atom<boolean>(false);

/** The right-sidebar Members takeover (§7). */
export const $membersView = atom<{ open: boolean; targetJointId: string | null }>({
  open: false,
  targetJointId: null,
});

/**
 * The instance id whose placement is PULSING because its Members-view row is hovered (or was
 * just tapped on touch) — design §7.6. Ephemeral; EditorScene subscribes and invalidates.
 */
export const $memberHoverId = atom<string | null>(null);

/**
 * Which channel tab the left Easing card opens on (§6.3's ✎ buttons, and the dopesheet's
 * segment double-click). `'uniform'` is the default view.
 */
export const $easingFocusChannel = atom<EasingChannel | 'uniform'>('uniform');

/** Timeline zoom/pan (§5.9). Ephemeral; re-fit on clip switch. */
export const $timelineView = atom<{ startSec: number; pxPerSec: number }>({
  startSec: 0,
  pxPerSec: 200,
});

/** Joint-tree disclosure, shared by the navigator tree and the timeline header column. */
export const $jointTreeCollapsed = atom<Record<string, boolean>>({});

/** Normalized playhead for rig sampling (0 when no clip / zero duration). */
export const $playheadU = computed([$playheadSec, $activeAnimation], (sec, anim) =>
  anim && anim.durationSec > 0 ? Math.min(1, Math.max(0, sec / anim.durationSec)) : 0,
);

// ── persisted UI prefs (§4.2) ────────────────────────────────────────────────

/** Transport preferences — loop / speed / latch (§5.5, §10.3). */
export const $animTransport = persistentJSON<{
  loop: boolean;
  speed: 0.25 | 0.5 | 1 | 2;
  latched: boolean;
}>('flexo:animTransport', { loop: false, speed: 1, latched: false });

/** Motion-trail display mode (§9.5). */
export const $animTrails = persistentJSON<'selected' | 'all' | 'off'>(
  'flexo:animTrails',
  'selected',
);

/** Duration-edit behavior: rescale every keyframe time, or keep them and move the tail (§8.2). */
export const $animDurationMode = persistentJSON<'rescale' | 'keepTimes'>(
  'flexo:animDurationMode',
  'rescale',
);

// ── playhead state machine (design §10) ───────────────────────────────────────

/** Clamps a time to the active clip's [0, duration]. */
function clampToClip(sec: number): number {
  const dur = $activeAnimation.get()?.durationSec ?? 0;
  return Math.min(Math.max(0, sec), Math.max(0, dur));
}

/**
 * PIN a column (§10.1 PINNED): parks the playhead at its time and attaches the pose gizmo.
 * Deliberately does NOT touch `$toolMode` — v1's auto tool pick is replaced by pivot
 * ROUTING at write-back (§9.4, lands in 11D), so selecting a keyframe never steals the
 * user's tool.
 */
export function selectKeyframeForEditing(animId: string, keyframeId: string): void {
  const anim = $part.get().animations.find((a) => a.id === animId);
  const k = anim?.keyframes.find((x) => x.id === keyframeId);
  if (!anim || !k) return;
  $editKeyframeId.set(keyframeId);
  $playheadSec.set(k.timeSec);
  $playheadParked.set(true);
}

/** PARK at `sec` (§10.1) and CLEAR the pin — a click elsewhere leaves the edited column. */
export function parkPlayhead(sec: number): void {
  const t = clampToClip(sec);
  $editKeyframeId.set(null);
  $playheadSec.set(t);
  $playheadParked.set(true);
}

/**
 * Return to REST ⚓ (§10.1): playback stopped, pin cleared, un-parked, playhead back at
 * {@link restAnchorTime} — the scene shows the modeled part again.
 */
export function returnToRest(): void {
  cancelPlayback();
  $editKeyframeId.set(null);
  $playheadParked.set(false);
  if ($animScrubbing.get()) $animScrubbing.set(false);
  const anim = $activeAnimation.get();
  $playheadSec.set(anim ? restAnchorTime(anim) : 0);
}

// ── scrub session (drag on the ruler / a track) — §10.3 ───────────────────────

let scrubOrigin: { sec: number; parked: boolean; pinId: string | null } | null = null;

/** Grabbing the playhead takes over playback (kept v1 semantic) and remembers the origin. */
export function beginScrub(): void {
  cancelPlayback();
  scrubOrigin = {
    sec: $playheadSec.get(),
    parked: $playheadParked.get(),
    pinId: $editKeyframeId.get(),
  };
  $animScrubbing.set(true);
}

export function scrubTo(sec: number): void {
  $playheadSec.set(clampToClip(sec));
}

/**
 * Release: SPRING by default (back to the pin / the pre-drag park / REST ⚓), or LATCH at
 * the release point when `$animTransport.latched`. **The pin always wins** — grabbing the
 * scrubber to check the motion and letting go puts you exactly back into editing (the v1
 * pin-loss, census pain 7, is dead).
 */
export function endScrub(): void {
  $animScrubbing.set(false);
  const o = scrubOrigin;
  scrubOrigin = null;
  if (!o) return;
  const anim = $activeAnimation.get();
  const pinKf = o.pinId ? anim?.keyframes.find((k) => k.id === o.pinId) : null;
  if (pinKf) {
    $editKeyframeId.set(pinKf.id);
    $playheadSec.set(pinKf.timeSec);
    $playheadParked.set(true);
    return;
  }
  if ($animTransport.get().latched) {
    $playheadParked.set(true);
    return;
  }
  if (o.parked) {
    $playheadSec.set(o.sec);
    $playheadParked.set(true);
    return;
  }
  returnToRest();
}

// ── preview playback ──────────────────────────────────────────────────────────

/** Handle of the in-flight requestAnimationFrame loop (0 = idle). */
let playRaf = 0;

/**
 * Stops the auto-play loop but LEAVES the current playhead/override in place — used when
 * the user grabs the scrubber mid-play to take over manually (the release then handles the
 * spring/latch reconciliation).
 */
export function cancelPlayback(): void {
  if (playRaf) cancelAnimationFrame(playRaf);
  playRaf = 0;
  if ($animPlaying.get()) $animPlaying.set(false);
}

/**
 * Stop (⏹): cancel playback AND return to the modeled rest pose. Safe to call when idle;
 * this is also the Animation-mode exit hook's teardown.
 */
export function stopAnimationPreview(): void {
  returnToRest();
}

/** Pause in place (§10.2): parks at the pause time; a pin at a DIFFERENT time is dropped. */
export function pausePreview(): void {
  cancelPlayback();
  const sec = $playheadSec.get();
  $playheadParked.set(true);
  if ($animScrubbing.get()) $animScrubbing.set(false);
  const pinId = $editKeyframeId.get();
  const pin = pinId ? $activeAnimation.get()?.keyframes.find((k) => k.id === pinId) : null;
  if (pin && Math.abs(sec - pin.timeSec) > 1e-6) $editKeyframeId.set(null);
}

/** Transport preferences (§5.5) — persisted, never undo. */
export function setLoop(loop: boolean): void {
  $animTransport.set({ ...$animTransport.get(), loop });
}
export function setSpeed(speed: 0.25 | 0.5 | 1 | 2): void {
  $animTransport.set({ ...$animTransport.get(), speed });
}
export function setLatched(latched: boolean): void {
  $animTransport.set({ ...$animTransport.get(), latched });
}

/** Steps the playhead by whole bake frames (1/30 s) and parks (§12.2 `←`/`→`). */
export function stepPlayhead(frames: number): void {
  parkPlayhead($playheadSec.get() + frames / BAKE_FPS);
}

/** Parks + PINS the previous/next column (§5.5 item 6 `,`/`.`); never wraps. */
export function stepToKeyframe(dir: 1 | -1): void {
  const anim = $activeAnimation.get();
  if (!anim) return;
  const sorted = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec);
  const now = $playheadSec.get();
  const next =
    dir === 1
      ? sorted.find((k) => k.timeSec > now + 1e-6)
      : [...sorted].reverse().find((k) => k.timeSec < now - 1e-6);
  if (next) selectKeyframeForEditing(anim.id, next.id);
}

/** Opens the Members view (§7), defaulting its target to the active joint. */
export function openMembersView(jointId?: string): void {
  $membersView.set({ open: true, targetJointId: jointId ?? $activeJointId.get() });
}

/** Closes the view and disarms member painting with it (design §7.4). */
export function closeMembersView(): void {
  $membersView.set({ open: false, targetJointId: null });
  disarmTool('member-paint');
  $memberHoverId.set(null);
}

/**
 * The joint member painting writes to: the Members view's target while it is open, else the
 * active joint (the phone flow arms paint and dismisses the sheet — design §7.4/§14).
 */
export const $memberPaintTarget = computed(
  [$membersView, $activeJointId],
  (view, activeJointId) => view.targetJointId ?? activeJointId,
);

/**
 * Instance ids toggled by the CURRENT paint session, newest last (design §7.4 / §14 row 3).
 * The Members grid flashes these rows when it comes back — on the phone the sheet is
 * dismissed while painting, so "what did I just change?" has no other answer. Ephemeral, and
 * cleared when a session is armed.
 */
export const $memberPaintChanges = atom<string[]>([]);

/**
 * `member-paint` is an Animation-only tenant of the single `$activeTool` slot (foundation
 * §2.6 row 5): arming any other tool cancels it, a mode switch cancels it, and Esc rung 5
 * disarms it — all through the slot, so this only owns the teardown of its own hover state.
 */
registerTool('member-paint', {
  allowedModes: ['animation'],
  onCancel: () => $memberHoverId.set(null),
});

/**
 * One paint click (design §7.4): unassigned → attach to the target, already on the target →
 * detach, on another joint → REASSIGN (one `attachToJoint` call — its within-clip exclusivity
 * does the move). Each outcome is exactly ONE discrete undo step, so undo peels click by
 * click. The caller composes the status flash from the returned verdict.
 */
export function paintMemberOnTarget(instanceId: string): {
  result: 'attached' | 'detached' | 'reassigned' | 'no-target' | 'not-a-subpart';
  jointName?: string;
  fromJointName?: string;
} {
  const animId = $activeAnimationId.get();
  const anim = $activeAnimation.get();
  const targetId = $memberPaintTarget.get();
  const target = anim?.joints.find((j) => j.id === targetId);
  if (!animId || !anim || !target) return { result: 'no-target' };
  // Guardrail 4, restated at the last possible moment: only SubPart PLACEMENTS can be
  // members. The viewport router refuses non-SubParts before it gets here, so this is the
  // belt-and-braces answer for any other caller.
  if (!$part.get().placements.some((p) => p.instanceId === instanceId))
    return { result: 'not-a-subpart' };
  const owner = anim.joints.find((j) => j.memberInstanceIds.includes(instanceId));
  const changed = $memberPaintChanges.get();
  if (!changed.includes(instanceId)) $memberPaintChanges.set([...changed, instanceId]);
  if (owner?.id === target.id) {
    detachMembers(animId, [instanceId]);
    return { result: 'detached', jointName: target.name };
  }
  attachToJoint(animId, target.id, [instanceId]);
  return owner
    ? { result: 'reassigned', jointName: target.name, fromJointName: owner.name }
    : { result: 'attached', jointName: target.name };
}

// ── pivot editing (design §9.4) ───────────────────────────────────────────────

/**
 * **Is a pose-gizmo drag a PIVOT edit right now?** (§9.4 anchor-column routing.)
 *
 * The answer is one rule and one rule only: *the pinned column IS the rest anchor*. There is
 * no meaningful "pose" there — the composed pose at the anchor equals the modeled placements
 * — so Move relocates the hinge and Rotate re-orients it, with or without the explicit
 * `⊕ Edit pivot` tool armed. This is what kills v1's three disagreeing t=0 sites (census
 * §4.6): on an imported deploy clip the anchor is the LAST keyframe, and selecting t=0 there
 * now pose-edits the stowed keyframe like any other column (no silent rebase).
 */
export const $pivotRouting = computed(
  [$mode, $activeAnimation, $editKeyframeId],
  (mode, anim, pinId) =>
    mode === 'animation' && !!anim && pinId !== null && pinId === anchorKeyframeId(anim),
);

/**
 * Scale has nothing to drive on a pivot — a pivot stays unit-scaled (kept invariant) — so it
 * degrades to Move while the drag is routed there, exactly as it degrades while placing an
 * exhaust. ONE rule, called by both the gizmo and the Tool bar, so the displayed tool can
 * never disagree with what a drag does.
 */
export function poseToolMode(mode: ToolMode, pivotRouting: boolean): ToolMode {
  return pivotRouting && mode === 'scale' ? 'translate' : mode;
}

/**
 * Arms the explicit `⊕ Edit pivot` tool (§9.4): parks + PINS the playhead on the rest-anchor
 * column — the only frame where a pivot edit is well defined — and flips the gizmo to its
 * amber handle set. A joint switch deliberately KEEPS it armed (rigging several hinges in a
 * row); a clip switch, a pin moved off the anchor, and leaving the mode all disarm.
 */
export function setPivotEditing(on: boolean): void {
  if (!on) {
    $pivotEditing.set(false);
    return;
  }
  const anim = $activeAnimation.get();
  if (!anim) return;
  const anchor = anchorKeyframeId(anim);
  if (anchor) selectKeyframeForEditing(anim.id, anchor);
  $pivotEditing.set(true);
}

/**
 * `pivot-pick` is the second Animation-only tenant of the single `$activeTool` slot
 * (foundation §2.6 row 6). Arming any other tool, a mode switch and Esc rung 5 all cancel it
 * through the slot; this owns only the teardown of its own target discriminator.
 */
registerTool('pivot-pick', {
  allowedModes: ['animation'],
  onCancel: () => $pivotPickTarget.set(null),
});

/** Arms `pivot-pick` for one click, aimed at the joint's real pivot or the working pivot. */
export function armPivotPick(target: 'joint' | 'working'): void {
  $pivotPickTarget.set(target);
  armTool('pivot-pick');
}

/**
 * Leaving Animation mode (design: foundation.md §2.4). Registered here rather than driven
 * from the UI so it runs on EVERY route out of the mode — the switcher, the status chip,
 * a digit key, a project load — not just the editor's own Close button.
 *
 * `$activeAnimationId`/`$activeJointId` deliberately SURVIVE, so returning to the mode
 * lands back on the clip you were editing. The pose gizmo, pivot marker and trajectories
 * need no hook: they are derived in the three layer from `$isPoseEditing`/`$mode`, which
 * flip the moment `$mode` leaves `'animation'`.
 */
registerModeHooks('animation', {
  /**
   * The cross-mode jump payload (foundation §2.5): `{animationId}` — what the export
   * pre-flight's draft rows and the palette's "Open clip: <name>" send when the editor is
   * somewhere else. Entering with no payload keeps whatever clip was last open.
   */
  onEnter: (payload) => {
    const animationId = (payload as { animationId?: string } | undefined)?.animationId;
    if (animationId) selectAnimationClip(animationId);
  },
  onExit: () => {
    $editKeyframeId.set(null); // end posing
    stopAnimationPreview(); // stop playback + spring back to the modeled rest pose
    closeMembersView(); // the takeover (and member painting with it) is mode-local
    $pivotEditing.set(false); // the pivot tool is mode-local too (§9.4)
    $workingPivot.set(null); // a throwaway anchor never survives the mode (§4.1)
    $posedPlacementLock.set(false);
  },
});

/**
 * Plays the ACTIVE clip's preview (§10.2). Starts at `$playheadSec` when parked or pinned
 * and at 0 from REST; advances at `$animTransport.speed`; `loop` wraps seamlessly. The pin
 * is SUSPENDED (not cleared) — the preview follows the playhead and the pin is restored on
 * pause/stop. Reaching the end with loop off either parks at the last keyframe (latched) or
 * returns to rest (the v1 play-once-then-snap default).
 *
 * The preview override anchors on {@link restAnchorTime} just like a manual drag, so an
 * imported deploy clip (modeled at its deployed last keyframe) folds stowed→deployed and
 * snaps back to its modeled rest on completion. No-op when there is no clip or it is
 * zero-length.
 */
export function playAnimationPreview(): void {
  const anim = $activeAnimation.get();
  if (!anim || anim.durationSec <= 0) return;
  const animId = anim.id;
  cancelPlayback();
  const parked = $playheadParked.get() || !!$editKeyframeId.get();
  let sec = parked ? clampToClip($playheadSec.get()) : 0;
  if (sec >= anim.durationSec) sec = 0; // replay rather than sit at the end
  $animScrubbing.set(true);
  $playheadSec.set(sec);
  $animPlaying.set(true);
  let prevTs = 0;
  const tick = (ts: number) => {
    if (!$animPlaying.get()) return; // stopped externally (stop already reset state)
    if ($activeAnimationId.get() !== animId) return stopAnimationPreview(); // clip switched
    if (!prevTs) prevTs = ts;
    const { loop, speed } = $animTransport.get();
    sec += ((ts - prevTs) / 1000) * speed;
    prevTs = ts;
    const dur = $activeAnimation.get()?.durationSec ?? anim.durationSec;
    if (sec >= dur) {
      if (loop) {
        sec = dur > 0 ? sec % dur : 0;
      } else {
        $playheadSec.set(dur);
        cancelPlayback();
        if ($animTransport.get().latched) {
          $animScrubbing.set(false);
          $playheadParked.set(true);
        } else {
          returnToRest();
        }
        return;
      }
    }
    $playheadSec.set(sec);
    playRaf = requestAnimationFrame(tick);
  };
  playRaf = requestAnimationFrame(tick);
}

// ── undo plumbing (mirrors customAssetStore.mutate, minus the atlas flag) ─────

function rid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

/** Discrete mutation: snapshot undo, clone, mutate, publish. */
function mutate(description: string, detail: string, fn: (part: EditingPart) => void): void {
  pushUndo(description, detail);
  const next = structuredClone($part.get());
  fn(next);
  $part.set(next);
}

/** Streaming mutation: no undo push (caller pushes at interaction start). */
function stream(fn: (part: EditingPart) => void): void {
  const next = structuredClone($part.get());
  fn(next);
  $part.set(next);
}

function findAnim(part: EditingPart, animId: string): PartAnimation | undefined {
  return part.animations.find((a) => a.id === animId);
}

/** Sorted keyframes (rest at t=0 first), as a live reference into the array. */
function sortKeyframes(anim: PartAnimation): void {
  anim.keyframes.sort((a, b) => a.timeSec - b.timeSec);
}

// ── animations ───────────────────────────────────────────────────────────────

/**
 * Opens a clip in the editor: makes it active and drops the joint/keyframe focus of the clip
 * that was open (they name entities of a DIFFERENT skeleton). No-op for an unknown id, and
 * never an undo step — which clip is open is view state.
 */
export function selectAnimationClip(animId: string): void {
  if (!$part.get().animations.some((a) => a.id === animId)) return;
  if ($activeAnimationId.get() === animId) return;
  $activeAnimationId.set(animId);
  $activeJointId.set(null);
  $editKeyframeId.set(null);
  $timelineSelection.set([]);
}

/**
 * The jump form of {@link selectAnimationClip} (foundation §2.5): switches to Animation mode
 * first when the caller is somewhere else — the export pre-flight's draft rows, the palette's
 * "Open clip: <name>". `setMode` is a no-op when already in the mode, hence the branch.
 */
export function openAnimationClip(animId: string): void {
  if ($mode.get() === 'animation') selectAnimationClip(animId);
  else setMode('animation', { animationId: animId });
}

/** Creates an animation, makes it active, returns its id. */
export function addAnimation(name = 'Animation', mode: AnimationMode = 'actuate'): string {
  const id = rid('anim');
  const anim = createPartAnimation(id, name);
  anim.mode = mode;
  mutate('add animation', anim.name, (p) => p.animations.push(anim));
  $activeAnimationId.set(id);
  $activeJointId.set(null);
  $editKeyframeId.set(null);
  $timelineSelection.set([]);
  $animScrubbing.set(false);
  $playheadParked.set(false);
  $playheadSec.set(0);
  return id;
}

/**
 * Deep-clones a clip with FRESH ids for the animation, every joint and every keyframe —
 * pose/easing maps and `parentJointId`/`restKeyframeId` are remapped through the old→new
 * id maps. Members and solar tracking are copied verbatim (they name the same placements).
 * Opens the copy. DISCRETE → one undo step.
 */
export function duplicateAnimation(animId: string): string | null {
  const src = findAnim($part.get(), animId);
  if (!src) return null;
  const newAnimId = rid('anim');
  const jointMap = new Map(src.joints.map((j) => [j.id, rid('joint')]));
  const kfMap = new Map(src.keyframes.map((k) => [k.id, rid('kf')]));
  const remapKeys = <T>(rec: Record<string, T>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const [jid, v] of Object.entries(rec)) {
      const next = jointMap.get(jid);
      if (next) out[next] = v;
    }
    return out;
  };
  const copy: PartAnimation = {
    ...structuredClone(src),
    id: newAnimId,
    name: `${src.name} (copy)`,
    joints: src.joints.map((j) => ({
      ...structuredClone(j),
      id: jointMap.get(j.id)!,
      parentJointId: j.parentJointId ? (jointMap.get(j.parentJointId) ?? null) : null,
    })),
    keyframes: src.keyframes.map((k) => {
      const clone = structuredClone(k);
      const out: AnimationKeyframe = {
        ...clone,
        id: kfMap.get(k.id)!,
        poses: remapKeys(clone.poses),
      };
      if (clone.easings) out.easings = remapKeys(clone.easings);
      return out;
    }),
  };
  if (src.restKeyframeId) {
    const anchor = kfMap.get(src.restKeyframeId);
    if (anchor) copy.restKeyframeId = anchor;
    else delete copy.restKeyframeId;
  }
  mutate('duplicate animation', copy.name, (p) => p.animations.push(copy));
  $activeAnimationId.set(newAnimId);
  $activeJointId.set(null);
  $editKeyframeId.set(null);
  $timelineSelection.set([]);
  return newAnimId;
}

export function removeAnimation(animId: string): void {
  const name = findAnim($part.get(), animId)?.name ?? '';
  mutate('remove animation', name, (p) => {
    p.animations = p.animations.filter((a) => a.id !== animId);
  });
  if ($activeAnimationId.get() === animId) {
    $activeAnimationId.set(null);
    $activeJointId.set(null);
    $editKeyframeId.set(null);
  }
}

export function renameAnimation(animId: string, name: string): void {
  const trimmed = name.trim();
  const anim = findAnim($part.get(), animId);
  if (!anim || !trimmed || anim.name === trimmed) return;
  mutate('rename animation', `${anim.name} → ${trimmed}`, (p) => {
    const a = findAnim(p, animId);
    if (a) a.name = trimmed;
  });
}

export function setAnimationMode(animId: string, mode: AnimationMode): void {
  mutate('animation mode', mode, (p) => {
    const a = findAnim(p, animId);
    if (a) a.mode = mode;
  });
}

/**
 * Sets the clip duration (s). STREAMING (the caller pushes undo at field focus).
 *
 * - `'rescale'` (default, v1 behavior): every keyframe time is scaled proportionally, so
 *   the motion keeps its shape and just runs faster/slower.
 * - `'keepTimes'`: keyframe times are untouched and only the tail moves; the value is
 *   clamped up to the last keyframe's time so no column can fall outside the clip (§8.2).
 *
 * `mode` defaults to the persisted `flexo:animDurationMode` preference.
 */
export function setAnimationDuration(
  animId: string,
  durationSec: number,
  mode: 'rescale' | 'keepTimes' = $animDurationMode.get(),
): void {
  const wanted = Math.max(0.01, durationSec);
  stream((p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    if (mode === 'keepTimes') {
      const last = Math.max(0, ...a.keyframes.map((k) => k.timeSec));
      a.durationSec = Math.max(wanted, last);
      return;
    }
    const old = a.durationSec;
    if (old > 0) for (const k of a.keyframes) k.timeSec = (k.timeSec / old) * wanted;
    a.durationSec = wanted;
    sortKeyframes(a);
  });
}

export function setSolarTracking(animId: string, spec: SolarTrackingSpec | null): void {
  mutate('solar tracking', spec ? 'on' : 'off', (p) => {
    const a = findAnim(p, animId);
    if (a) a.solarTracking = spec;
  });
}

// ── joints ─────────────────────────────────────────────────────────────────--

/**
 * Adds a joint, selects it, returns its id. The rest pose (in every keyframe) is seeded
 * at the current viewport selection's centroid so a fresh joint hinges near its parts
 * rather than at the part origin (identity when nothing is selected). Use
 * {@link setJointPivot} to snap it precisely onto a hinge afterwards.
 */
export function addJoint(
  animId: string,
  name = 'Joint',
  parentJointId: string | null = null,
): string {
  const id = rid('joint');
  const seed = selectionCentroidPose();
  mutate('add joint', name, (p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    a.joints.push({ id, name, parentJointId, memberInstanceIds: [] });
    for (const k of a.keyframes) k.poses[id] = cloneTransform(seed);
  });
  $activeJointId.set(id);
  return id;
}

/** A deep copy of a Transform (poses must not share mutable refs across keyframes). */
function cloneTransform(t: Transform): Transform {
  return { position: { ...t.position }, rotation: { ...t.rotation }, scale: { ...t.scale } };
}

/** A rest pose at the current viewport selection's centroid (identity if none selected). */
function selectionCentroidPose(): Transform {
  const placements = $part.get().placements;
  const pts = $selection
    .get()
    .flatMap((ref) =>
      ref.kind === 'subpart' ? (placements.find((p) => p.instanceId === ref.id) ?? []) : [],
    );
  if (pts.length === 0) return identityTransform();
  const c = { x: 0, y: 0, z: 0 };
  for (const pl of pts) {
    c.x += pl.position.x;
    c.y += pl.position.y;
    c.z += pl.position.z;
  }
  return {
    position: { x: c.x / pts.length, y: c.y / pts.length, z: c.z / pts.length },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

export function removeJoint(animId: string, jointId: string): void {
  mutate('remove joint', '', (p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    // Re-parent children to the removed joint's parent (keep the chain connected).
    const removed = a.joints.find((j) => j.id === jointId);
    const newParent = removed?.parentJointId ?? null;
    for (const j of a.joints) if (j.parentJointId === jointId) j.parentJointId = newParent;
    a.joints = a.joints.filter((j) => j.id !== jointId);
    for (const k of a.keyframes) delete k.poses[jointId];
  });
  if ($activeJointId.get() === jointId) $activeJointId.set(null);
}

export function renameJoint(animId: string, jointId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  mutate('rename joint', trimmed, (p) => {
    const j = findAnim(p, animId)?.joints.find((x) => x.id === jointId);
    if (j) j.name = trimmed;
  });
}

/** Sets a joint's parent (for chains), guarding against cycles and self-parenting. */
export function setJointParent(
  animId: string,
  jointId: string,
  parentJointId: string | null,
): void {
  mutate('joint parent', '', (p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    if (parentJointId && wouldCycle(a, jointId, parentJointId)) return;
    const j = a.joints.find((x) => x.id === jointId);
    if (j) j.parentJointId = parentJointId;
  });
}

/** True if making `parentId` the parent of `jointId` would create a cycle. */
function wouldCycle(anim: PartAnimation, jointId: string, parentId: string): boolean {
  if (parentId === jointId) return true;
  const byId = new Map(anim.joints.map((j) => [j.id, j]));
  let cur: string | null = parentId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === jointId) return true;
    seen.add(cur);
    cur = byId.get(cur)?.parentJointId ?? null;
  }
  return false;
}

/**
 * Attaches placements to a joint (removing them from any other joint in the SAME
 * animation so a SubPart isn't driven twice within one module).
 */
/**
 * Attaches placements to a joint (removing them from any other joint in the SAME animation
 * so a SubPart isn't driven twice within one module).
 *
 * **Only SubPart placements can be members** — connectors and kittens can never be driven
 * by a joint (a real KSA limitation, verified in the decomp). Ineligible ids are filtered
 * out and returned as `skipped` so the caller can explain the skip.
 */
export function attachToJoint(
  animId: string,
  jointId: string,
  instanceIds: readonly string[],
): { attached: number; skipped: number } {
  const part = $part.get();
  const eligible = instanceIds.filter((id) => part.placements.some((p) => p.instanceId === id));
  const skipped = instanceIds.length - eligible.length;
  if (eligible.length === 0) return { attached: 0, skipped };
  const jointName = findAnim(part, animId)?.joints.find((j) => j.id === jointId)?.name ?? 'joint';
  mutate('attach to joint', jointName, (p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    const set = new Set(eligible);
    for (const j of a.joints)
      j.memberInstanceIds = j.memberInstanceIds.filter((id) => !set.has(id));
    const target = a.joints.find((j) => j.id === jointId);
    if (target) target.memberInstanceIds.push(...eligible);
  });
  return { attached: eligible.length, skipped };
}

export function detachFromJoint(animId: string, jointId: string, instanceId: string): void {
  mutate('detach from joint', instanceId, (p) => {
    const j = findAnim(p, animId)?.joints.find((x) => x.id === jointId);
    if (j) j.memberInstanceIds = j.memberInstanceIds.filter((id) => id !== instanceId);
  });
}

/**
 * Detaches a BATCH of instance ids from whichever joint of the clip owns each — the Members
 * view's `[Unassign N]` and "Detach all". Membership is exclusive within a clip, so sweeping
 * every joint is both correct and idempotent. ONE discrete undo step; returns how many ids
 * were actually members.
 */
export function detachMembers(animId: string, instanceIds: readonly string[]): number {
  const anim = findAnim($part.get(), animId);
  if (!anim || instanceIds.length === 0) return 0;
  const wanted = new Set(instanceIds);
  const removed = anim.joints.reduce(
    (n, j) => n + j.memberInstanceIds.filter((id) => wanted.has(id)).length,
    0,
  );
  if (removed === 0) return 0;
  mutate('detach members', `${removed}`, (p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    for (const j of a.joints)
      j.memberInstanceIds = j.memberInstanceIds.filter((id) => !wanted.has(id));
  });
  return removed;
}

/**
 * Moves a joint in DOCUMENT order, which is also the dopesheet's row order and the export
 * order — the navigator tree's drop-between-rows gesture (design §6.2). `beforeJointId` names
 * the joint the dragged one lands in front of; `null` appends. DISCRETE → one undo step.
 */
export function reorderJoint(animId: string, jointId: string, beforeJointId: string | null): void {
  if (jointId === beforeJointId) return;
  mutate('reorder joint', '', (p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    const from = a.joints.findIndex((j) => j.id === jointId);
    if (from < 0) return;
    const [moved] = a.joints.splice(from, 1);
    const before = beforeJointId ? a.joints.findIndex((j) => j.id === beforeJointId) : -1;
    if (before < 0) a.joints.push(moved);
    else a.joints.splice(before, 0, moved);
  });
}

// ── keyframes (poses) ─────────────────────────────────────────────────────────

/** Two keyframe times closer than this are the same COLUMN (design §5.4). */
const COLUMN_EPS_SEC = 0.001;

/**
 * Inserts a keyframe at `timeSec` (clamped to >0), seeding each joint's pose from
 * the current curve at that time (so it starts on-path), selects it for editing,
 * and returns its id.
 *
 * MOTION-NEUTRAL (design §5.4): the incoming segment's easing is not dropped, it is
 * SUBDIVIDED exactly — per joint, per channel — by {@link splitEasingConfigAt}, so the
 * two halves reproduce the original curve through the on-curve pose we just sampled.
 *
 * A column already within {@link COLUMN_EPS_SEC} of `timeSec` makes this a NO-OP that
 * returns (and pins) that column's id, pushing no undo step.
 */
export function addKeyframe(animId: string, timeSec: number): string {
  const t = Math.max(0.001, timeSec);
  const hit = findAnim($part.get(), animId)?.keyframes.find(
    (k) => Math.abs(k.timeSec - t) < COLUMN_EPS_SEC,
  );
  if (hit) {
    $editKeyframeId.set(hit.id);
    return hit.id;
  }
  const id = rid('kf');
  mutate('add keyframe', `${t.toFixed(2)}s`, (p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    const poses: Record<string, Transform> = {};
    // Sampled with the ORIGINAL easing, BEFORE the insert mutates it — this is the
    // on-curve seed the exact split is re-based against.
    for (const j of a.joints) poses[j.id] = transformFromMatrix(sampleJointLocal(a, j.id, t));
    a.keyframes.push({ id, timeSec: t, poses });
    sortKeyframes(a);

    const idx = a.keyframes.findIndex((k) => k.id === id);
    const prev = idx > 0 ? a.keyframes[idx - 1] : null;
    const next = idx < a.keyframes.length - 1 ? a.keyframes[idx + 1] : null;
    if (prev?.easings && next) {
      const s = (t - prev.timeSec) / (next.timeSec - prev.timeSec);
      const inserted = a.keyframes[idx];
      for (const [jointId, seg] of Object.entries(prev.easings)) {
        const leftSeg: JointSegmentEasing = {};
        const rightSeg: JointSegmentEasing = {};
        for (const ch of EASING_CHANNELS) {
          const cfg = seg[ch];
          if (!cfg || isLinearEasing(cfg)) continue;
          const { left, right } = splitEasingConfigAt(cfg, s);
          if (left) leftSeg[ch] = left;
          if (right) rightSeg[ch] = right;
        }
        if (Object.keys(leftSeg).length > 0) prev.easings[jointId] = leftSeg;
        else delete prev.easings[jointId];
        if (Object.keys(rightSeg).length > 0) (inserted.easings ??= {})[jointId] = rightSeg;
      }
      if (Object.keys(prev.easings).length === 0) delete prev.easings;
    }
  });
  $editKeyframeId.set(id);
  return id;
}

/** The column whose composed pose equals the modeled placements (ABSENT ⇒ earliest). */
function anchorKeyframeId(anim: PartAnimation): string | null {
  if (anim.restKeyframeId && anim.keyframes.some((k) => k.id === anim.restKeyframeId))
    return anim.restKeyframeId;
  const earliest = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec)[0];
  return earliest?.id ?? null;
}

/**
 * Removes a batch of columns in ONE undo step. Two columns are PROTECTED and counted as
 * skipped (§5.6): the t=0 column (it pins the clip start) and the rest-anchor column (its
 * pose IS the modeled geometry — re-anchor elsewhere first).
 */
export function removeKeyframes(
  animId: string,
  ids: readonly string[],
): { removed: number; skipped: number } {
  const anim = findAnim($part.get(), animId);
  if (!anim || ids.length === 0) return { removed: 0, skipped: 0 };
  const anchor = anchorKeyframeId(anim);
  const unique = [...new Set(ids)];
  const removable = new Set(
    unique.filter((id) => {
      const k = anim.keyframes.find((x) => x.id === id);
      return !!k && k.timeSec !== 0 && k.id !== anchor;
    }),
  );
  const skipped = unique.length - removable.size;
  if (removable.size === 0) return { removed: 0, skipped };
  mutate('remove keyframes', `${removable.size}`, (p) => {
    const a = findAnim(p, animId);
    if (a) a.keyframes = a.keyframes.filter((x) => !removable.has(x.id));
  });
  $timelineSelection.set($timelineSelection.get().filter((id) => !removable.has(id)));
  const pin = $editKeyframeId.get();
  if (pin && removable.has(pin)) $editKeyframeId.set(null);
  return { removed: removable.size, skipped };
}

/** Single-column convenience over {@link removeKeyframes} (one exported surface). */
export function removeKeyframe(animId: string, keyframeId: string): void {
  removeKeyframes(animId, [keyframeId]);
}

/**
 * Retimes a set of columns by `dt` (STREAMING — the caller pushes undo at drag start).
 * Relative offsets are preserved: `dt` is clamped to the tightest bound across the whole
 * set so the group never deforms. The t=0 column is immovable and is dropped from the set
 * (reported via `blocked` for the UI's refuse-shake).
 */
export function moveKeyframes(
  animId: string,
  ids: readonly string[],
  dt: number,
): { blocked: boolean } {
  const anim = findAnim($part.get(), animId);
  if (!anim) return { blocked: false };
  const moving = ids
    .map((id) => anim.keyframes.find((k) => k.id === id))
    .filter((k): k is AnimationKeyframe => !!k && k.timeSec !== 0);
  const blocked = moving.length !== ids.length;
  if (moving.length === 0) return { blocked };
  const lo = Math.min(...moving.map((k) => k.timeSec));
  const hi = Math.max(...moving.map((k) => k.timeSec));
  const clamped = Math.min(Math.max(dt, 0.001 - lo), anim.durationSec - hi);
  const set = new Set(moving.map((k) => k.id));
  stream((p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    for (const k of a.keyframes) if (set.has(k.id)) k.timeSec += clamped;
    sortKeyframes(a);
  });
  return { blocked };
}

// ── keyframe clipboard (§5.7) ────────────────────────────────────────────────

/** Snapshots columns into {@link $animClipboard} with times relative to the first. No undo. */
export function copyKeyframes(ids: readonly string[]): number {
  const anim = $activeAnimation.get();
  if (!anim) return 0;
  const cols = anim.keyframes
    .filter((k) => ids.includes(k.id))
    .sort((a, b) => a.timeSec - b.timeSec);
  if (cols.length === 0) {
    $animClipboard.set(null);
    return 0;
  }
  const t0 = cols[0].timeSec;
  $animClipboard.set({
    columns: cols.map((k) => ({
      dt: k.timeSec - t0,
      poses: structuredClone(k.poses),
      ...(k.easings ? { easings: structuredClone(k.easings) } : {}),
    })),
  });
  return cols.length;
}

/**
 * Pastes the clipboard at the playhead in ONE undo step (§5.7): the first column lands at
 * `$playheadSec`, the rest keep their relative offsets (clamped into (0, duration] — the
 * clamp is reported). A target within 1 ms of an existing column REPLACES that column's
 * poses/easings and keeps its id; otherwise a new column is created, seeded ON-CURVE for
 * any joint the clipboard doesn't carry. Joints that no longer exist are dropped, so
 * pasting across clips works by joint id.
 */
export function pasteKeyframesAtPlayhead(): { pasted: number; clamped: boolean } {
  const clip = $animClipboard.get();
  const anim = $activeAnimation.get();
  if (!clip || clip.columns.length === 0 || !anim) return { pasted: 0, clamped: false };
  const animId = anim.id;
  const base = $playheadSec.get();
  const jointIds = new Set(anim.joints.map((j) => j.id));
  let clamped = false;
  const targets = clip.columns.map((c) => {
    const raw = base + c.dt;
    const t = Math.min(anim.durationSec, Math.max(0.001, raw));
    if (Math.abs(t - raw) > 1e-9) clamped = true;
    return { t, col: c };
  });
  // On-curve seeds sampled from the PRE-mutation curve, so a pasted column never bends
  // the joints it doesn't carry.
  const seeds = new Map<number, Record<string, Transform>>();
  for (const { t } of targets) {
    if (seeds.has(t)) continue;
    const poses: Record<string, Transform> = {};
    for (const j of anim.joints) poses[j.id] = transformFromMatrix(sampleJointLocal(anim, j.id, t));
    seeds.set(t, poses);
  }

  mutate('paste keys', `${targets.length}`, (p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    for (const { t, col } of targets) {
      const poses: Record<string, Transform> = { ...structuredClone(seeds.get(t)!) };
      for (const [jid, pose] of Object.entries(col.poses))
        if (jointIds.has(jid)) poses[jid] = structuredClone(pose);
      const easings: Record<string, JointSegmentEasing> = {};
      for (const [jid, seg] of Object.entries(col.easings ?? {})) {
        const norm = normalizeSegmentEasing(structuredClone(seg));
        if (jointIds.has(jid) && norm) easings[jid] = norm;
      }
      const hit = a.keyframes.find((k) => Math.abs(k.timeSec - t) < COLUMN_EPS_SEC);
      if (hit) {
        hit.poses = poses;
        if (Object.keys(easings).length) hit.easings = easings;
        else delete hit.easings;
        continue;
      }
      a.keyframes.push({
        id: rid('kf'),
        timeSec: t,
        poses,
        ...(Object.keys(easings).length ? { easings } : {}),
      });
    }
    sortKeyframes(a);
  });
  return { pasted: targets.length, clamped };
}

/**
 * Points {@link PartAnimation.restKeyframeId} at `kfId` — the column whose composed pose
 * equals the modeled placements (§5.6). Pointing it at the EARLIEST column deletes the
 * field instead, matching the "ABSENT ⇒ earliest" convention and keeping linear clips
 * byte-clean on the wire. DISCRETE → one undo step.
 */
export function setRestAnchor(animId: string, kfId: string): void {
  const anim = findAnim($part.get(), animId);
  const kf = anim?.keyframes.find((k) => k.id === kfId);
  if (!anim || !kf) return;
  const earliest = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec)[0];
  mutate('re-anchor rest', `@${kf.timeSec.toFixed(2)}s`, (p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    if (earliest && earliest.id === kfId) delete a.restKeyframeId;
    else a.restKeyframeId = kfId;
  });
}

// ── per-joint column edits (the diamond context menu, design §5.2) ───────────

/** Single-joint pose clipboard for the diamond menu's Copy pose / Paste pose. Ephemeral. */
export const $jointPoseClipboard = atom<Transform | null>(null);

/**
 * "Reset joint here to on-curve" (design §5.2): recomputes ONE joint's pose at a column
 * from its NEIGHBOURING segment — the column itself is excluded from the sample, so the
 * result is exactly where the joint would pass through if this column had never been
 * inserted. Turns a ◆ back into a ◇ without touching any other joint or the column's time.
 * DISCRETE → one undo step.
 */
export function resetJointPoseToCurve(animId: string, kfId: string, jointId: string): void {
  const anim = findAnim($part.get(), animId);
  const kf = anim?.keyframes.find((k) => k.id === kfId);
  if (!anim || !kf || anim.keyframes.length < 2) return;
  // Sample against a copy WITHOUT this column: `sampleJointLocal` clamps outside the range,
  // so an end column resolves to its surviving neighbour's pose (the honest answer there).
  const without: PartAnimation = {
    ...anim,
    keyframes: anim.keyframes.filter((k) => k.id !== kfId),
  };
  const onCurve = transformFromMatrix(sampleJointLocal(without, jointId, kf.timeSec));
  mutate('reset pose', `${kf.timeSec.toFixed(2)}s`, (p) => {
    const k = findAnim(p, animId)?.keyframes.find((x) => x.id === kfId);
    if (k) k.poses[jointId] = onCurve;
  });
}

/** Copies one joint's pose at a column into {@link $jointPoseClipboard}. No undo. */
export function copyJointPose(animId: string, kfId: string, jointId: string): boolean {
  const pose = findAnim($part.get(), animId)?.keyframes.find((k) => k.id === kfId)?.poses[jointId];
  if (!pose) return false;
  $jointPoseClipboard.set(cloneTransform(pose));
  return true;
}

/** Pastes the copied single-joint pose onto a column. DISCRETE → one undo step. */
export function pasteJointPose(animId: string, kfId: string, jointId: string): boolean {
  const pose = $jointPoseClipboard.get();
  if (!pose) return false;
  mutate('paste pose', '', (p) => {
    const k = findAnim(p, animId)?.keyframes.find((x) => x.id === kfId);
    if (k) k.poses[jointId] = cloneTransform(pose);
  });
  return true;
}

/** Moves a keyframe in time (streaming; can't move the rest keyframe off t=0). */
export function setKeyframeTime(animId: string, keyframeId: string, timeSec: number): void {
  stream((p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    const k = a.keyframes.find((x) => x.id === keyframeId);
    if (!k || k.timeSec === 0) return;
    k.timeSec = Math.min(a.durationSec, Math.max(0.001, timeSec));
    sortKeyframes(a);
  });
}

/**
 * Captures a joint's local pose at a keyframe — the core "pose snapshot". STREAMING:
 * no undo push (the caller pushes once at gizmo-drag start / field focus).
 */
export function setJointPose(
  animId: string,
  keyframeId: string,
  jointId: string,
  pose: Transform,
): void {
  stream((p) => {
    const k = findAnim(p, animId)?.keyframes.find((x) => x.id === keyframeId);
    if (k)
      k.poses[jointId] = {
        position: { ...pose.position },
        rotation: { ...pose.rotation },
        scale: { ...pose.scale },
      };
  });
}

// ── segment easing ─────────────────────────────────────────────────────────--

/**
 * Writes/clears one joint's outgoing PER-CHANNEL easing on a keyframe. An all-linear
 * segment is stored as ABSENT (entry deleted, then the map itself when it empties) so
 * exports stay byte-identical for linear clips and the data stays clean.
 */
function applySegmentEasing(
  k: AnimationKeyframe,
  jointId: string,
  seg: JointSegmentEasing | undefined,
): void {
  const norm = normalizeSegmentEasing(seg);
  if (!norm) {
    if (k.easings) {
      delete k.easings[jointId];
      if (Object.keys(k.easings).length === 0) delete k.easings;
    }
    return;
  }
  if (!k.easings) k.easings = {};
  k.easings[jointId] = norm;
}

/** Uniform-authoring shim: one config onto all three channels (linear ⇒ cleared). */
function applyEasing(k: AnimationKeyframe, jointId: string, cfg: EasingConfig): void {
  applySegmentEasing(k, jointId, uniformSegmentEasing(cfg));
}

/**
 * Sets (or clears) the easing for one joint over the segment LEAVING `keyframeId`. A
 * linear/identity config is stored as "absent" so export stays byte-identical and the
 * data stays clean. STREAMING: no undo push (caller pushes once at curve-drag start /
 * preset change).
 */
export function setJointSegmentEasing(
  animId: string,
  keyframeId: string,
  jointId: string,
  cfg: EasingConfig,
): void {
  stream((p) => {
    const k = findAnim(p, animId)?.keyframes.find((x) => x.id === keyframeId);
    if (k) applyEasing(k, jointId, cfg);
  });
}

/**
 * Sets ONE channel (or all three via `'uniform'`) of a joint's outgoing easing. STREAMING
 * (the caller pushes undo at curve-drag start / preset change). Linear clears the channel;
 * an all-linear segment is dropped entirely.
 */
export function setJointChannelEasing(
  animId: string,
  keyframeId: string,
  jointId: string,
  channel: EasingChannel | 'uniform',
  cfg: EasingConfig,
): void {
  stream((p) => {
    const k = findAnim(p, animId)?.keyframes.find((x) => x.id === keyframeId);
    if (!k) return;
    if (channel === 'uniform') {
      applySegmentEasing(k, jointId, uniformSegmentEasing(cfg));
      return;
    }
    const next: JointSegmentEasing = { ...k.easings?.[jointId] };
    if (isLinearEasing(cfg)) delete next[channel];
    else next[channel] = cfg;
    applySegmentEasing(k, jointId, next);
  });
}

/**
 * Copies one easing set onto EVERY joint for the segment leaving `keyframeId` (discrete
 * undo). Accepts either a full per-channel {@link JointSegmentEasing} or — for the v1
 * uniform UI still mounted until 11C — a single {@link EasingConfig} applied to all three
 * channels.
 */
export function setSegmentEasingAllJoints(
  animId: string,
  keyframeId: string,
  easing: JointSegmentEasing | EasingConfig,
): void {
  const seg: JointSegmentEasing | undefined =
    'kind' in easing ? uniformSegmentEasing(easing) : normalizeSegmentEasing(easing);
  mutate('segment easing', seg ? 'eased' : 'linear', (p) => {
    const a = findAnim(p, animId);
    const k = a?.keyframes.find((x) => x.id === keyframeId);
    if (!a || !k) return;
    for (const j of a.joints) applySegmentEasing(k, j.id, seg && structuredClone(seg));
  });
}

/**
 * Moves a joint's PIVOT — its rest position — by `delta`, carrying every keyframe's
 * pose position along so the pivot relocates rigidly: the joint's whole translation
 * curve shifts by the same amount. Because each SubPart's leaf offset is
 * `W_J(rest)⁻¹ · placement` (recomputed every frame), shifting all poses equally leaves
 * the rendered geometry unchanged at every t — only the rotation anchor moves. This is
 * the "draggable rotation anchor": drag the rest pivot to e.g. a hinge edge, then t>0
 * rotations swing around it. STREAMING (caller pushes undo at gizmo-drag start).
 */
export function moveJointPivot(animId: string, jointId: string, delta: Vec3): void {
  stream((p) => {
    const a = findAnim(p, animId);
    if (!a) return;
    for (const k of a.keyframes) {
      const pose = k.poses[jointId];
      if (pose) {
        pose.position.x += delta.x;
        pose.position.y += delta.y;
        pose.position.z += delta.z;
      }
    }
  });
}

/** The rotation component of a matrix, as a quaternion. */
function quatOf(m: THREE.Matrix4): THREE.Quaternion {
  const q = new THREE.Quaternion();
  m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  return q;
}

/**
 * Re-bases joint `jointId`'s REST frame onto `Wtgt` (a Part-space WORLD matrix, scale
 * already stripped) IN PLACE on `a`. Generalises {@link moveJointPivot} to an arbitrary
 * frame (position + orientation): with `B = Wtgt · W_J(rest)⁻¹` it rewrites every
 * keyframe's local pose to `P'(t) = W_parent(t)⁻¹ · B · W_J(t)`. This keeps the rest
 * ({@link restAnchorTime}) geometry exactly put (no load/preview jump — the leaf offset
 * `W_J(rest)⁻¹·placement` is recomputed) while rigidly carrying other-keyframe motion so
 * it now swings about the new pivot. The per-keyframe worlds are PRECOMPUTED from the
 * pre-mutation poses (the write loop must not read half-rewritten state).
 */
function rebaseJointToWorld(a: PartAnimation, jointId: string, Wtgt: THREE.Matrix4): void {
  const joint = a.joints.find((j) => j.id === jointId);
  if (!joint) return;
  const B = Wtgt.clone().multiply(jointWorld(a, jointId, restAnchorTime(a)).invert());
  const precomputed = a.keyframes.map((k) => ({
    k,
    Wk: jointWorld(a, jointId, k.timeSec),
    WpInv: joint.parentJointId
      ? jointWorld(a, joint.parentJointId, k.timeSec).invert()
      : new THREE.Matrix4(),
  }));
  for (const { k, Wk, WpInv } of precomputed) {
    k.poses[jointId] = transformFromMatrix(WpInv.multiply(B.clone().multiply(Wk))); // W_parent⁻¹ · B · W_J
  }
}

/** The desired new rest WORLD frame: `target` position, unit scale, and orientation from
 *  `target` (when `useOrientation`) or kept from the joint's current rest world. */
function pivotTargetWorld(
  a: PartAnimation,
  jointId: string,
  target: Transform,
  useOrientation: boolean,
): THREE.Matrix4 {
  const pos = new THREE.Vector3(target.position.x, target.position.y, target.position.z);
  const quat = useOrientation
    ? quatOf(matrixFromTransform({ ...target, scale: VEC3_ONE }))
    : quatOf(jointWorld(a, jointId, restAnchorTime(a)));
  return new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1));
}

/**
 * Snaps a joint's pivot (its REST frame) onto `target` — a Part-space frame, e.g. the
 * hinge placement the door should swing on. Preserves the t=0 geometry and re-centers
 * t>0 motion on the new pivot. `target.scale` is ignored (a pivot must stay unit-scaled).
 * With `orientation:false` only the position is adopted (the joint keeps its current
 * orientation, so you rotate about a world axis). DISCRETE → one undo step.
 */
export function setJointPivot(
  animId: string,
  jointId: string,
  target: Transform,
  opts: { orientation?: boolean } = {},
): void {
  const useOrientation = opts.orientation ?? true;
  mutate('set pivot', '', (p) => {
    const a = findAnim(p, animId);
    if (!a || !a.joints.some((j) => j.id === jointId)) return;
    rebaseJointToWorld(a, jointId, pivotTargetWorld(a, jointId, target, useOrientation));
  });
}

/**
 * Snaps the joint's pivot POSITION to the centroid of the current viewport selection,
 * keeping its orientation (§4.3). Routed through {@link setJointPivot} so the rest-geometry
 * -preserving rebase is never reimplemented. DISCRETE → one undo step.
 */
export function setJointPivotToCentroid(jointId: string): void {
  const animId = $activeAnimationId.get();
  if (!animId) return;
  setJointPivot(animId, jointId, selectionCentroidPose(), { orientation: false });
}

/**
 * Snaps the joint's pivot POSITION to a picked Part-space point (the `pivot-pick` tool),
 * keeping its orientation. DISCRETE → one undo step.
 */
export function setJointPivotPoint(jointId: string, worldPos: Vec3): void {
  const animId = $activeAnimationId.get();
  if (!animId) return;
  setJointPivot(
    animId,
    jointId,
    { position: { ...worldPos }, rotation: { x: 0, y: 0, z: 0 }, scale: { ...VEC3_ONE } },
    { orientation: false },
  );
}

/**
 * Streaming counterpart to {@link setJointPivot} for the Rest-pose Rotate gizmo:
 * re-bases the pivot to `worldFrame` (the gizmo proxy's Part-space frame; scale
 * stripped), letting a drag re-orient (and/or move) the pivot live without distorting
 * authored t>0 motion. No internal undo (drag-start pushed one).
 */
export function reorientJointPivot(animId: string, jointId: string, worldFrame: Transform): void {
  stream((p) => {
    const a = findAnim(p, animId);
    if (!a || !a.joints.some((j) => j.id === jointId)) return;
    rebaseJointToWorld(a, jointId, matrixFromTransform({ ...worldFrame, scale: VEC3_ONE }));
  });
}

// ── ephemeral-state clamping (after undo/redo or external $part swaps) ─────────

/**
 * Clamps every ephemeral animation atom to entities that still exist after any `$part`
 * change (undo/redo and project swap restore the document without touching these atoms —
 * design §4.3). Call once at app startup.
 */
export function initAnimationStore(): void {
  // A working pivot belongs to ONE joint on ONE clip (design §4.1): switching either makes
  // the throwaway anchor meaningless, so it is dropped rather than silently re-used.
  $activeJointId.subscribe(() => {
    if ($workingPivot.get() !== null) $workingPivot.set(null);
  });
  $activeAnimationId.subscribe(() => {
    if ($workingPivot.get() !== null) $workingPivot.set(null);
    if ($pivotEditing.get()) $pivotEditing.set(false); // a clip switch disarms (§9.4)
  });
  // The explicit pivot tool only means anything ON the anchor column, which is exactly what
  // `$pivotRouting` tests — so moving the pin anywhere else disarms it rather than leaving an
  // amber gizmo that would pose instead of relocating the hinge.
  $editKeyframeId.subscribe(() => {
    if ($pivotEditing.get() && !$pivotRouting.get()) $pivotEditing.set(false);
  });

  $part.subscribe((part) => {
    // (c) a working pivot picked off a placement dies with that placement, in any clip
    const src = $workingPivot.get()?.sourceInstanceId;
    if (src && !part.placements.some((p) => p.instanceId === src)) $workingPivot.set(null);

    const animId = $activeAnimationId.get();
    if (animId && !part.animations.some((a) => a.id === animId)) {
      $activeAnimationId.set(null);
      $activeJointId.set(null);
      $editKeyframeId.set(null);
      $timelineSelection.set([]);
      $membersView.set({ ...$membersView.get(), targetJointId: null });
      $playheadSec.set(0);
      $playheadParked.set(false);
      return;
    }
    const anim = animId ? part.animations.find((a) => a.id === animId) : null;
    if (!anim) return;
    if ($activeJointId.get() && !anim.joints.some((j) => j.id === $activeJointId.get()))
      $activeJointId.set(null);
    if ($editKeyframeId.get() && !anim.keyframes.some((k) => k.id === $editKeyframeId.get()))
      $editKeyframeId.set(null);
    // (a) drop timeline-selected columns that no longer exist
    const sel = $timelineSelection.get();
    if (sel.length > 0) {
      const alive = sel.filter((id) => anim.keyframes.some((k) => k.id === id));
      if (alive.length !== sel.length) $timelineSelection.set(alive);
    }
    // (b) the Members view stays OPEN but loses a deleted target joint
    const mv = $membersView.get();
    if (mv.targetJointId && !anim.joints.some((j) => j.id === mv.targetJointId))
      $membersView.set({ ...mv, targetJointId: null });
    // (d) keep the playhead inside the clip
    const sec = $playheadSec.get();
    const clamped = Math.min(Math.max(0, sec), Math.max(0, anim.durationSec));
    if (clamped !== sec) $playheadSec.set(clamped);
  });
}
