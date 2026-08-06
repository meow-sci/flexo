import { computed } from 'nanostores';
import { setToolStatus, type ToolStatus } from '../../state/statusStore';
import { $seatView } from '../../state/ivaStore';
import { $part } from '../../state/editorStore';
import { $measurePending } from '../../state/measurementStore';
import { $activeNozzleTarget, nozzleTargetLabel } from '../../state/engineStore';
import { $activeTool, $marqueeRect } from '../../state/modeStore';
import {
  $activeAnimation,
  $activeJointId,
  $memberPaintTarget,
  $pivotEditing,
  $pivotPickTarget,
} from '../../state/animationStore';

/**
 * Feeds the status bar's tool segment (`statusStore.$toolStatus`) from the single
 * `$activeTool` slot (design: `plans/flexo_v2/design/foundation.md` §2.6 — "each tool owns
 * a status segment, an Esc-ladder rung and a cancel-on-mode-switch hook";
 * `design-system-services.md` §1.2 #3).
 *
 * **One derivation, not one per tool.** The slot holds at most one tool, so the segment is a
 * pure function of `(slot, that tool's sub-state)`. Keeping it in ONE `computed` — rather
 * than having each store push a model on arm and clear it on disarm — is what makes the
 * segment incapable of getting stuck showing a tool that is no longer armed: there is no
 * "clear" to forget.
 *
 * The chain session is deliberately absent: chain is NOT a tool (foundation §2.6 — it is a
 * parallel non-modal session that co-exists with any tool), so `ToolSegment` mirrors it from
 * `$chainSession`/`$chainEval` as a second, compact chip instead.
 *
 * Undo enrollment: NONE. Nothing here writes document state.
 */

const $derivedToolStatus = computed(
  [
    $activeTool,
    $seatView,
    $part,
    $activeNozzleTarget,
    $measurePending,
    $marqueeRect,
    $memberPaintTarget,
    $pivotPickTarget,
    $pivotEditing,
    $activeAnimation,
    $activeJointId,
  ],
  (
    activeTool,
    seatId,
    part,
    nozzleTarget,
    measurePending,
    marqueeRect,
    paintTargetId,
    pivotPickTarget,
    pivotEditing,
    activeAnim,
    activeJointId,
  ): ToolStatus | null => {
    switch (activeTool) {
      case 'seat-view': {
        const index = part.ivaSeats.findIndex((seat) => seat.id === seatId);
        // A vanished seat is torn down by EditorScene a beat later; show nothing meanwhile
        // rather than "Seat 0 / 3".
        if (index < 0) return null;
        return {
          toolId: 'seat-view',
          icon: 'Eye',
          text: `Seat ${index + 1} / ${part.ivaSeats.length}`,
        };
      }

      case 'measure':
        // The live two-step instruction the v1 tool never had: `$measurePending` carries the
        // half-placed first point (design-build-mode.md §8.1). Escape (ladder rung 5)
        // cancels the pending point AND disarms in one press.
        return {
          toolId: 'measure',
          icon: 'Ruler',
          text: measurePending ? 'Measure — click second point' : 'Measure — click first point',
          kbdHints: [['Esc']],
        };

      case 'marquee':
        // The marquee holds the slot for the whole gesture, so an armed-but-idle `B` and a
        // live drag are the same tool with two instructions (design-build-mode.md §1.4).
        return marqueeRect
          ? {
              toolId: 'marquee',
              icon: 'BoxSelect',
              text: 'Box select — release to select',
              kbdHints: [['Esc']],
            }
          : { toolId: 'marquee', icon: 'BoxSelect', text: 'Box select — drag to select' };

      case 'exhaust':
        if (!nozzleTarget) return null;
        return {
          toolId: 'exhaust',
          icon: 'Flame',
          // `nozzleTargetLabel` already spells the `· FX` channel suffix.
          text: `Exhaust: ${nozzleTargetLabel(nozzleTarget)}`,
          kbdHints: [['Esc']],
        };

      case 'member-paint': {
        // The target joint is the Members view's, falling back to the active joint (the phone
        // flow arms paint and dismisses the sheet) — design-animation-mode.md §7.4.
        const joint = paintTargetId
          ? (part.animations.flatMap((a) => a.joints).find((j) => j.id === paintTargetId)?.name ??
            null)
          : null;
        return {
          toolId: 'member-paint',
          icon: 'Brush',
          text: joint
            ? `Paint members → ${joint} · click SubParts to toggle`
            : 'Paint members — pick a target joint first',
          kbdHints: [['Esc']],
        };
      }

      case 'pivot-pick':
        // Foundation §2.6 row 6, verbatim — with the TARGET spelled out, because the same
        // tool serves the joint's real pivot and the throwaway working one (§9.4).
        return {
          toolId: 'pivot-pick',
          icon: 'Crosshair',
          text:
            pivotPickTarget === 'working'
              ? 'Pick working pivot — click a surface'
              : 'Pick pivot point — click a surface',
          kbdHints: [['Esc']],
        };

      default: {
        // Not a `$activeTool` tenant: `⊕ Edit pivot` is a MODE of the pose gizmo, not a
        // pointer tool (it has no click gesture of its own), so it renders in the same
        // segment without occupying the slot — design §9.4 item 1(c).
        if (!pivotEditing) return null;
        const joint = activeAnim?.joints.find((j) => j.id === activeJointId);
        return {
          toolId: 'pivot-edit',
          icon: 'Target',
          text: joint
            ? `Edit pivot — ${joint.name} · drag to relocate the hinge`
            : 'Edit pivot — select a joint',
          kbdHints: [['Esc']],
        };
      }
    }
  },
);

let started = false;

/**
 * Starts the subscription. Idempotent, so React StrictMode's double-invoked effects and a
 * hot reload are both harmless (the same guard `initModifierListeners` uses).
 */
export function initToolStatusWiring(): void {
  if (started) return;
  started = true;
  // A `computed` is lazy — subscribing is what makes it evaluate at all. Never unsubscribed:
  // the tool segment exists for the life of the app.
  let last = '';
  $derivedToolStatus.subscribe((model) => {
    // The computed depends on `$part`, so it rebuilds its object on every document edit.
    // Writing an equal-but-new object would re-render the segment on every keystroke of a
    // gizmo drag for nothing, so compare the rendered content and skip.
    const key = model ? `${model.toolId}|${model.icon}|${model.text}` : '';
    if (key === last) return;
    last = key;
    setToolStatus(model);
  });
}
