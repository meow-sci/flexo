import { useStore } from '@nanostores/react';
import { Pencil } from 'lucide-react';
import { Button, Chip, Tooltip } from '../kit';
import {
  $activeAnimation,
  $activeJointId,
  $easingFocusChannel,
  $editKeyframeId,
  setSegmentEasingAllJoints,
} from '../../state/animationStore';
import { EASING_CHANNELS, segmentEasingUniform } from '../../ksa/easing';
import { fmt } from '../format';
import { AnimSection } from './AnimSection';
import { CHANNEL_LABELS, describeEasing } from './easingLabels';

/**
 * **The EASING overview** — the navigator's read-and-jump view of the pinned column's
 * OUTGOING segment for the active joint (design-animation-mode.md §6.3; foundation §8.2
 * item 3). The editor itself is the left card (§8.3); this block answers "what is this
 * segment doing on each channel, and is it uniform?" at a glance.
 *
 * Per-channel easing is LOCKED #8: `position`, `rotation` and `scale` each carry their own
 * curve, a linear channel is stored ABSENT, and the "Uniform" chip reads `mixed` the moment
 * the three disagree.
 *
 * **Undo enrollment:** `[Apply to all joints]` is the one mutation and it is discrete
 * (`setSegmentEasingAllJoints` pushes internally). The ✎ buttons only move a view atom.
 */
export function EasingOverviewSection() {
  const anim = useStore($activeAnimation);
  const jointId = useStore($activeJointId);
  const pinId = useStore($editKeyframeId);

  const sorted = [...(anim?.keyframes ?? [])].sort((a, b) => a.timeSec - b.timeSec);
  const index = sorted.findIndex((k) => k.id === pinId);
  const pinned = index >= 0 ? sorted[index] : null;
  const next = index >= 0 ? sorted[index + 1] : undefined;
  const joint = anim?.joints.find((j) => j.id === jointId) ?? null;
  const segment = pinned && joint ? pinned.easings?.[joint.id] : undefined;
  const uniform = segmentEasingUniform(segment);

  const subtitle =
    joint && pinned && next
      ? `${joint.name} @${fmt(pinned.timeSec)}→${fmt(next.timeSec)}s`
      : undefined;

  return (
    <AnimSection id="easing" title="Easing" subtitle={subtitle}>
      {!pinned || !joint ? (
        <p className="px-1 text-xs text-fg-subtle">Select a keyframe to edit its outgoing easing</p>
      ) : !next ? (
        <p className="px-1 text-xs text-fg-subtle">Final keyframe — no outgoing segment</p>
      ) : (
        <>
          {EASING_CHANNELS.map((channel) => (
            <div key={channel} className="flex items-center gap-1 px-1 text-xs">
              <span className="w-16 shrink-0 text-fg-muted">{CHANNEL_LABELS[channel]}</span>
              <span className="min-w-0 flex-1 truncate">{describeEasing(segment?.[channel])}</span>
              <Tooltip content={`Edit the ${CHANNEL_LABELS[channel].toLowerCase()} curve`}>
                <Button
                  iconOnly
                  size="xs"
                  variant="ghost"
                  className="size-5 shrink-0"
                  aria-label={`Edit ${CHANNEL_LABELS[channel]} easing`}
                  onPress={() => $easingFocusChannel.set(channel)}
                >
                  <Pencil className="size-3" />
                </Button>
              </Tooltip>
            </div>
          ))}
          <div className="flex items-center gap-1 px-1">
            <Chip className="shrink-0">
              Uniform: {uniform === 'mixed' ? 'mixed' : describeEasing(uniform)}
            </Chip>
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto"
              // Discrete: the store pushes its own step, so no caller push here.
              onPress={() => anim && setSegmentEasingAllJoints(anim.id, pinned.id, segment ?? {})}
            >
              Apply to all joints
            </Button>
          </div>
        </>
      )}
    </AnimSection>
  );
}
