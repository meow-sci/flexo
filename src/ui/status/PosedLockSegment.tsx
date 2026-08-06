import { useStore } from '@nanostores/react';
import { Lock } from 'lucide-react';
import { Tooltip } from '../kit';
import { StatusChip, StatusChipButton, StatusDivider } from './StatusChip';
import { $posedPlacementLock, returnToRest } from '../../state/animationStore';

/**
 * The **posed-placement lock** segment (design-animation-mode.md §9.6; §13 "posed-lock
 * message") — the fix for census pain 8.
 *
 * The rule itself is v1's and is unchanged: while the preview shows a POSED (non-anchor)
 * frame and the selection contains something the clip drives, the placement gizmo detaches so
 * a drag can never bake a previewed transform into the document. v1 did that SILENTLY, and it
 * reads as a broken gizmo until you learn the rule. Now it says so, and offers the one-click
 * way out.
 *
 * It is a SEGMENT rather than a `status()` message on purpose: this is a CONDITION that holds
 * until the user acts, and the message channel is a single transient slot that a keystroke
 * would overwrite (design-system-services.md §1.2 #5). `EditorScene` publishes the condition
 * to `$posedPlacementLock`; this only renders it.
 *
 * **Undo enrollment: NONE** — `returnToRest()` moves the playhead, which is never undoable.
 */
export function PosedLockSegment() {
  const locked = useStore($posedPlacementLock);
  if (!locked) return null;

  return (
    <>
      <StatusDivider />
      <Tooltip content="This SubPart is animated and the preview is showing a posed frame, so moving it would bake the pose into the document.">
        <StatusChip className="text-warning">
          <Lock size={13} className="shrink-0" />
          <span className="truncate">Posed preview — placements locked</span>
        </StatusChip>
      </Tooltip>
      <StatusChipButton
        className="text-accent"
        aria-label="Return the playhead to the rest anchor"
        onPress={() => returnToRest()}
      >
        ⏮⚓ to rest to move parts
      </StatusChipButton>
    </>
  );
}
