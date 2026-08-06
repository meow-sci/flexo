import { useStore } from '@nanostores/react';
import { Brush, Crosshair, Film, Target } from 'lucide-react';
import { Button, Kbd } from '../kit';
import { FocusCardHeader, focusCard } from '../build/FocusCardHeader';
import { $activeTool } from '../../state/modeStore';
import {
  $activeAnimation,
  $activeJointId,
  $editKeyframeId,
  $memberPaintTarget,
  $pivotEditing,
  $pivotPickTarget,
  $timelineSelection,
  addAnimation,
} from '../../state/animationStore';
import { AnimClipCard } from './AnimClipCard';
import { AnimJointCard } from './AnimJointCard';
import { AnimKeyframeCard } from './AnimKeyframeCard';

/**
 * **Animation's left-sidebar ruleset** (design-animation-mode.md §8; foundation §7 stack,
 * §7.2). Content is a pure function of `(clip, joint, pin, timelineSelection, armed tool)`:
 *
 * 1. the armed tool's parameter card, when one is armed (foundation §7 item 1 — the live
 *    instructions themselves live in the STATUS BAR, so these stay one-liners);
 * 2. no clip → the mode cheat-card;
 * 3. clip, no joint → the Clip card;
 * 4. joint active (with or without a pin) → the Joint card;
 * 5. a column selected with no joint → the Keyframe card.
 *
 * **Undo enrollment: NONE.** Dispatching is view state; each card owns its own steps.
 */
export function AnimationFocusEditor() {
  const anim = useStore($activeAnimation);
  const jointId = useStore($activeJointId);
  const tool = useStore($activeTool);
  const pivotEditing = useStore($pivotEditing);
  const selection = useStore($timelineSelection);
  // Subscribed so the Joint card re-renders into (and out of) its POSE block when the pin
  // changes — the card itself reads the pin, but the dispatch owns the mount.
  useStore($editKeyframeId);

  const joint = anim?.joints.find((j) => j.id === jointId) ?? null;

  return (
    <div className="flex flex-col gap-2 p-(--density-panel-p)">
      {tool === 'member-paint' && <PaintToolCard />}
      {tool === 'pivot-pick' && <PivotPickToolCard />}
      {pivotEditing && <PivotToolCard />}
      {!anim ? (
        <CheatCard />
      ) : joint ? (
        <AnimJointCard anim={anim} joint={joint} />
      ) : selection.length > 0 ? (
        <AnimKeyframeCard anim={anim} />
      ) : (
        <AnimClipCard anim={anim} />
      )}
    </div>
  );
}

/** Tool parameter card — text only; the live instruction is the status bar's tool segment. */
function PaintToolCard() {
  const targetId = useStore($memberPaintTarget);
  const anim = useStore($activeAnimation);
  const joint = anim?.joints.find((j) => j.id === targetId) ?? null;
  return (
    <div className={focusCard}>
      <FocusCardHeader
        icon={Brush}
        title="Paint members"
        subtitle={joint ? `→ ${joint.name}` : 'pick a target joint first'}
      />
      <p className="text-[11px] text-fg-subtle">
        Click SubParts in the viewport to assign, unassign or move them to this joint. Each click is
        its own undo step. <Kbd>Esc</Kbd> when you’re done.
      </p>
    </div>
  );
}

/** The Edit-pivot arming card (design §9.4): the gizmo is amber and relocates the hinge. */
function PivotToolCard() {
  return (
    <div className={focusCard}>
      <FocusCardHeader icon={Target} title="Edit pivot" subtitle="anchored at the rest keyframe" />
      <p className="text-[11px] text-fg-subtle">
        Pivot edits happen at the rest anchor — the one frame where they are well defined. The amber
        handles and the numeric fields below move the hinge without changing the rendered geometry
        at any time. <Kbd>Esc</Kbd> when you’re done.
      </p>
    </div>
  );
}

/** The `pivot-pick` tool card — one click on a surface, then the tool disarms itself (§9.4). */
function PivotPickToolCard() {
  const target = useStore($pivotPickTarget);
  return (
    <div className={focusCard}>
      <FocusCardHeader
        icon={Crosshair}
        title="Pick pivot point"
        subtitle={target === 'working' ? '→ working pivot' : '→ joint pivot'}
      />
      <p className="text-[11px] text-fg-subtle">
        Click any mesh surface in the viewport to place the{' '}
        {target === 'working' ? 'throwaway posing anchor' : 'joint’s pivot (position only)'}.{' '}
        <Kbd>Esc</Kbd> cancels.
      </p>
    </div>
  );
}

/** The mode cheat-card (foundation §7 item 3): what the mode is, its keys, its first action. */
function CheatCard() {
  return (
    <div className={focusCard}>
      <FocusCardHeader icon={Film} title="Animation" />
      <p className="text-[11px] text-fg-subtle">
        Attach SubParts to joints, then pose them over the timeline.
      </p>
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-fg-subtle">
        <Kbd>Space</Kbd> play · <Kbd>K</Kbd> add key · <Kbd>,</Kbd>
        <Kbd>.</Kbd> step keys · <Kbd>Esc</Kbd> back to rest
      </div>
      <Button size="sm" variant="secondary" className="self-start" onPress={() => addAnimation()}>
        ＋ Animation
      </Button>
    </div>
  );
}
