import { useStore } from '@nanostores/react';
import { Maximize2, Pause, Play } from 'lucide-react';
import { Button, cn } from '../kit';
import { $mode } from '../../state/modeStore';
import {
  $activeAnimation,
  $animPlaying,
  $playheadSec,
  pausePreview,
  playAnimationPreview,
} from '../../state/animationStore';
import { $timelineSheetOpen, openTimelineSheet } from '../shell/phone/phoneSheets';
import { PhoneTimelineSheet } from './PhoneTimelineSheet';

/**
 * **The phone transport chip** (design-animation-mode.md §14 row 1; foundation §12 Timeline
 * row) — `[▶] Deploy ▓▓▓░ 1.2s [⤢]`, docked directly above the condensed status bar while
 * Animation mode is active. It is the phone's replacement for v1's pinned
 * `FloatingPreviewToolbar` slot, and the only way into the fullscreen Timeline sheet.
 *
 * **Perf discipline (guardrail 10 — the `PreviewProgressLabel` lesson, restated for touch).**
 * `$playheadSec` ticks every rAF of playback, so it is subscribed in EXACTLY one leaf here
 * ({@link ChipProgress}) — the play button, the clip name and the expand button never
 * re-render during playback.
 *
 * Undo enrollment: NONE — transport state is ephemeral (§15).
 */
export function PhoneTransportChip() {
  const mode = useStore($mode);
  const anim = useStore($activeAnimation);
  const playing = useStore($animPlaying);
  const sheetOpen = useStore($timelineSheetOpen);

  if (mode !== 'animation') return null;

  return (
    <>
      <div className="flex min-h-11 flex-none items-center gap-1 border-t border-border bg-panel px-1 text-xs">
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-11 shrink-0"
          isDisabled={!anim}
          aria-label={playing ? 'Pause preview' : 'Play preview'}
          onPress={() => (playing ? pausePreview() : playAnimationPreview())}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <span className={cn('max-w-[10ch] shrink-0 truncate', anim ? 'text-fg' : 'text-fg-subtle')}>
          {anim ? anim.name : 'No clip'}
        </span>
        <ChipProgress />
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-11 shrink-0"
          aria-label="Open the timeline"
          onPress={openTimelineSheet}
        >
          <Maximize2 className="size-4" />
        </Button>
      </div>

      {/* The sheet renders nothing while closed, so every open is a fresh mount of the
          dopesheet — and closing it leaves playback running (the state is in the store). */}
      <PhoneTimelineSheet
        isOpen={sheetOpen}
        onOpenChange={(open) => $timelineSheetOpen.set(open)}
      />
    </>
  );
}

/**
 * The progress bar + time readout — the ONE leaf allowed to subscribe `$playheadSec`. The bar
 * is a plain DOM width, so a 60 Hz playhead costs one style write per frame and no react-aria
 * subtree reconcile.
 */
function ChipProgress() {
  const anim = useStore($activeAnimation);
  const sec = useStore($playheadSec);
  if (!anim) return <span className="min-w-0 flex-1" />;
  const pct = anim.durationSec > 0 ? Math.min(100, (sec / anim.durationSec) * 100) : 0;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <div
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-panel-sunken"
        role="progressbar"
        aria-label="Playhead"
        aria-valuenow={Math.round(pct)}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 font-mono tabular-nums text-fg-muted">{sec.toFixed(2)}s</span>
    </div>
  );
}
