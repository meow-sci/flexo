import { useStore } from '@nanostores/react';
import { Anchor, Diamond } from 'lucide-react';
import { Button, Chip, SectionTitle, cn } from '../kit';
import { NumberField } from '../NumberField';
import { FocusCardHeader, focusCard } from '../build/FocusCardHeader';
import { pushUndo } from '../../state/editorStore';
import { status, undoStatusAction } from '../../state/statusStore';
import {
  $activeJointId,
  $animClipboard,
  $easingFocusChannel,
  $timelineSelection,
  pasteKeyframesAtPlayhead,
  selectKeyframeForEditing,
  setKeyframeTime,
  setRestAnchor,
} from '../../state/animationStore';
import { copySelectedColumns, deleteSelectedColumns } from './timelineActions';
import { anchorColumnId, poseChannelDiff } from './dopeSheetModel';
import { describeEasing } from './easingLabels';
import { segmentEasingUniform } from '../../ksa/easing';
import type { PartAnimation } from '../../ksa/types';
import { fmt } from '../format';

/**
 * **The Keyframe card** — what the left focus editor shows when a timeline column is selected
 * and no joint is active (design-animation-mode.md §8.4; foundation §7.2 row 4).
 *
 * Its per-joint "moves at this key" rows are the ACCESSIBLE mirror of the dopesheet's ◆/◇
 * (design §5.8: "canvas is not the only path") — same ε, same verdict, in words. Clicking a
 * row hands the focus to that joint's card, pinned right here.
 *
 * **Undo enrollment:** the time field is STREAMING with one push at focus; delete/copy/paste
 * route through the timeline's shared actions, which own their own steps and status flashes.
 */
export function AnimKeyframeCard({ anim }: { anim: PartAnimation }) {
  const selection = useStore($timelineSelection);
  const clipboard = useStore($animClipboard);

  const sorted = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec);
  const selected = sorted.filter((k) => selection.includes(k.id));

  if (selected.length > 1) {
    return (
      <div className={focusCard}>
        <FocusCardHeader icon={Diamond} title={`${selected.length} keyframes selected`} />
        <div className="flex flex-wrap gap-1">
          {selected.map((kf) => (
            <Chip key={kf.id}>@{fmt(kf.timeSec)}s</Chip>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button size="xs" variant="secondary" onPress={() => deleteSelectedColumns()}>
            Delete {selected.length}…
          </Button>
          <Button size="xs" variant="ghost" onPress={() => copySelectedColumns()}>
            Copy
          </Button>
        </div>
      </div>
    );
  }

  const kf = selected[0];
  if (!kf) return null;
  const index = sorted.findIndex((k) => k.id === kf.id);
  const previous = index > 0 ? sorted[index - 1] : null;
  const isAnchor = anchorColumnId(anim) === kf.id;
  const isRest0 = kf.timeSec === 0;

  return (
    <div className={focusCard}>
      <FocusCardHeader icon={Diamond} title={`Keyframe @ ${fmt(kf.timeSec)}s`} />

      <div className="flex items-end gap-2">
        <div className="w-24">
          <NumberField
            label="t"
            ariaLabel="Keyframe time (seconds)"
            value={kf.timeSec}
            isDisabled={isRest0}
            min={0.001}
            max={anim.durationSec}
            onInteractionStart={() => pushUndo('keyframe time', anim.name)}
            onCommit={(n) => setKeyframeTime(anim.id, kf.id, n)}
          />
        </div>
        {isRest0 ? (
          <span className="text-[11px] text-fg-subtle">The first keyframe pins the clip start</span>
        ) : isAnchor ? (
          <span className="flex items-center gap-1 text-[11px] text-fg-muted">
            <Anchor className="size-3" aria-hidden /> Rest anchor
          </span>
        ) : (
          <Button size="xs" variant="ghost" onPress={() => setRestAnchor(anim.id, kf.id)}>
            Re-anchor here
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <SectionTitle>Moves at this key</SectionTitle>
        {anim.joints.length === 0 && (
          <p className="px-1 text-[11px] text-fg-subtle">This clip has no joints yet.</p>
        )}
        {anim.joints.map((joint) => {
          const diff = poseChannelDiff(previous?.poses[joint.id], kf.poses[joint.id]);
          const moves = diff.position || diff.rotation || diff.scale;
          const uniform = segmentEasingUniform(kf.easings?.[joint.id]);
          return (
            <div key={joint.id} className="flex items-center gap-1 text-xs">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:underline"
                onClick={() => {
                  $activeJointId.set(joint.id);
                  selectKeyframeForEditing(anim.id, kf.id);
                }}
              >
                {joint.name}
              </button>
              <span className={cn('shrink-0', moves ? 'text-fg-muted' : 'text-fg-subtle')}>
                {moves
                  ? [diff.position && 'pos', diff.rotation && 'rot', diff.scale && 'scale']
                      .filter(Boolean)
                      .join(' ')
                  : '(hold)'}
              </span>
              <button
                type="button"
                className="shrink-0 text-[11px] text-fg-subtle hover:text-fg hover:underline"
                onClick={() => {
                  $activeJointId.set(joint.id);
                  selectKeyframeForEditing(anim.id, kf.id);
                  $easingFocusChannel.set('uniform');
                }}
              >
                {uniform === 'mixed' ? 'per-channel' : describeEasing(uniform)}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1">
        <Button size="xs" variant="secondary" onPress={() => deleteSelectedColumns()}>
          Delete keyframe
        </Button>
        <Button size="xs" variant="ghost" onPress={() => copySelectedColumns()}>
          Copy
        </Button>
        <Button
          size="xs"
          variant="ghost"
          isDisabled={!clipboard}
          onPress={() => {
            const { pasted, clamped } = pasteKeyframesAtPlayhead();
            if (pasted === 0) return;
            status(
              `Pasted ${pasted} keyframe${pasted === 1 ? '' : 's'}${clamped ? ' — some clamped to the clip end' : ''}`,
              {
                severity: clamped ? 'warning' : 'success',
                action: undoStatusAction(),
              },
            );
          }}
        >
          Paste pose set
        </Button>
      </div>
    </div>
  );
}
