import { useStore } from '@nanostores/react';
import { Play, Square } from 'lucide-react';
import { Button, Slider, cn } from './kit';
import {
  $animPreviewU,
  $animScrubbing,
  $animPlaying,
  $editKeyframeId,
  $playheadParked,
  $playheadSec,
  playAnimationPreview,
  stopAnimationPreview,
  cancelPlayback,
} from '../state/animationStore';
import { restAnchorTime } from '../ksa/animationRig';
import type { PartAnimation } from '../ksa/types';

/**
 * The animation preview control: a spring-loaded scrub slider plus a play button. Shared
 * by the inline editor (in the inspector) and the floating draggable toolbar over the
 * workspace — both drive the same {@link $animPreviewU}/{@link $animScrubbing} atoms, so
 * they stay in sync. Dragging only applies the joint override while held; releasing snaps
 * back to the modeled rest pose. Play runs the clip once at real speed then resets.
 */
export function PreviewScrubber({ anim, className }: { anim: PartAnimation; className?: string }) {
  const previewU = useStore($animPreviewU);
  const playing = useStore($animPlaying);

  return (
    <div className={cn('flex flex-1 items-center gap-2', className)}>
      <Slider
        aria-label="Animation preview"
        className="flex-1"
        value={previewU}
        minValue={0}
        maxValue={1}
        step={0.01}
        onChange={(v) => {
          // Grabbing the slider mid-play takes over scrubbing (stop auto-advance, keep pose).
          if ($animPlaying.get()) cancelPlayback();
          if (!$animScrubbing.get()) $animScrubbing.set(true);
          $editKeyframeId.set(null);
          const u = typeof v === 'number' ? v : v[0];
          $animPreviewU.set(u);
          $playheadSec.set(u * anim.durationSec); // keep the v2 playhead in step (11B takes over)
        }}
        onChangeEnd={() => {
          // Release → back to the modeled (static) pose; reset so the next grab starts at
          // the rest end (u=0) of the timeline.
          $animScrubbing.set(false);
          $animPreviewU.set(0);
          $playheadParked.set(false);
          $playheadSec.set(restAnchorTime(anim));
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-label={playing ? 'Stop preview' : 'Play preview once'}
        onPress={() => (playing ? stopAnimationPreview() : playAnimationPreview())}
      >
        {playing ? <Square size={13} /> : <Play size={13} />}
      </Button>
    </div>
  );
}
