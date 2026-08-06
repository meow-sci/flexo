import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Anchor, Check, Copy, ClipboardPaste, Trash2, X } from 'lucide-react';
import { Button, Dialog, InlineConfirmStrip, Sheet, ToggleButton } from '../kit';
import { status, undoStatusAction } from '../../state/statusStore';
import {
  $activeAnimation,
  $animClipboard,
  $timelineSelection,
  setRestAnchor,
} from '../../state/animationStore';
import { TransportBar } from './TransportBar';
import { TrackHeaderColumn } from './TrackHeaderColumn';
import { DopeSheetCanvas } from './DopeSheetCanvas';
import {
  $timelineDeleteConfirm,
  copySelectedColumns,
  deleteSelectedColumns,
  pasteColumnsAtPlayhead,
  commitColumnDelete,
} from './timelineActions';

/**
 * **The phone Timeline sheet** (design-animation-mode.md §14 row 1; foundation §12 Timeline
 * row — "fullscreen sheet", LOCKED). Opened from the transport chip's `⤢`.
 *
 * It is the SAME timeline: {@link TransportBar} at the phone density plus the identical
 * {@link TrackHeaderColumn} + {@link DopeSheetCanvas}, whose touch table (tap = park / pin,
 * long-press + drag = retime, pinch = zoom, two-finger = pan) lives in the canvas itself.
 * There is no forked phone timeline logic anywhere (foundation §12).
 *
 * Two things are phone-only, and both are stand-ins for a MODIFIER the phone does not have:
 * the `[☑ select]` header toggle (the ⇧-marquee) and the selected-column action row (⌘C /
 * ⌘V / ⌫ / re-anchor).
 *
 * Closing returns to the viewport with playback untouched — the playhead, the pin and the
 * play loop are all `animationStore` state, so the sheet is pure chrome over them.
 *
 * Undo enrollment: NONE of its own — every action delegates to the shared timeline actions,
 * which own their steps and their `[Undo]` flashes.
 */
export function PhoneTimelineSheet({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet isOpen={isOpen} onOpenChange={onOpenChange} detent="92" ariaLabel="Timeline">
      <Dialog className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TimelineSheetBody onClose={() => onOpenChange(false)} />
      </Dialog>
    </Sheet>
  );
}

function TimelineSheetBody({ onClose }: { onClose: () => void }) {
  const anim = useStore($activeAnimation);
  const selection = useStore($timelineSelection);
  const clipboard = useStore($animClipboard);
  const confirm = useStore($timelineDeleteConfirm);
  // Select mode is sheet-local: it is an input MODE for this surface, not editor state, and
  // it must not survive a close (a stale toggle would silently change what a tap does).
  const [selectMode, setSelectMode] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-11 flex-none items-center gap-1 border-b border-border px-1">
        <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-fg">
          {anim ? anim.name : 'No clip'}
        </span>
        <ToggleButton
          size="md"
          // No extra tint: the kit's selected state is already `bg-accent text-accent-fg`,
          // and adding `text-accent` on top of it paints the label onto its own background.
          className="min-h-11 flex-none px-2"
          aria-label="Select columns by tapping"
          isSelected={selectMode}
          onChange={setSelectMode}
        >
          <Check className="size-4" /> select
        </ToggleButton>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-11 shrink-0"
          aria-label="Close the timeline"
          onPress={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <TransportBar phone />

      {anim ? (
        <div className="flex min-h-0 flex-1">
          <TrackHeaderColumn anim={anim} />
          <DopeSheetCanvas anim={anim} selectMode={selectMode} />
        </div>
      ) : (
        <p className="flex flex-1 items-center justify-center p-4 text-xs text-fg-subtle">
          No animation clips — create one from the Animation panel.
        </p>
      )}

      {/* The ⇧-marquee's replacement produces a selection with no keyboard behind it, so its
          four operations get real buttons (design §14 row 1). */}
      {selection.length > 0 && (
        <div className="flex min-h-11 flex-none items-center gap-1 border-t border-border px-1">
          <span className="shrink-0 px-1 text-xs text-fg-muted">{selection.length} selected</span>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11"
            onPress={() => copySelectedColumns()}
          >
            <Copy className="size-4" /> Copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11"
            isDisabled={!clipboard}
            onPress={() => pasteColumnsAtPlayhead()}
          >
            <ClipboardPaste className="size-4" /> Paste
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11"
            isDisabled={selection.length !== 1}
            onPress={() => reanchor()}
          >
            <Anchor className="size-4" /> Re-anchor
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 text-danger"
            onPress={() => deleteSelectedColumns()}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}

      {/* The >5-column question renders IN the sheet, never as a dialog stacked over it
          (foundation §14.3) — the same rule the desktop dock follows. */}
      {confirm && (
        <div className="flex-none border-t border-border px-2 py-1">
          <InlineConfirmStrip
            size="sm"
            label={`Delete ${confirm.ids.length} keyframes?`}
            confirmLabel="Delete"
            onConfirm={() => commitColumnDelete(confirm.ids)}
            onCancel={() => $timelineDeleteConfirm.set(null)}
          />
        </div>
      )}
    </div>
  );
}

/** Re-anchor the one selected column — the touch route to the diamond menu's action (§5.6). */
function reanchor(): void {
  const anim = $activeAnimation.get();
  const [kfId] = $timelineSelection.get();
  const kf = anim?.keyframes.find((k) => k.id === kfId);
  if (!anim || !kf) return;
  setRestAnchor(anim.id, kf.id);
  status(
    `Rest anchor moved to @${kf.timeSec.toFixed(2)}s — this keyframe now matches the modeled placements`,
    { severity: 'success', action: undoStatusAction() },
  );
}
