import { useStore } from '@nanostores/react';
import {
  Anchor,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  Lock,
  LockOpen,
  Pause,
  Play,
  Plus,
  Repeat,
  Spline,
  Square,
} from 'lucide-react';
import {
  Button,
  ListBoxItem,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Select,
  ToggleButton,
  Tooltip,
  cn,
} from '../kit';
import { NumberField } from '../NumberField';
import { $layout, toggleTimeline } from '../../state/layoutStore';
import {
  $activeAnimation,
  $animPlaying,
  $animScrubbing,
  $animTrails,
  $animTransport,
  $editKeyframeId,
  $playheadParked,
  $playheadSec,
  parkPlayhead,
  pausePreview,
  playAnimationPreview,
  returnToRest,
  setLatched,
  setLoop,
  setSpeed,
  stepToKeyframe,
  stopAnimationPreview,
} from '../../state/animationStore';
import { restAnchorTime } from '../../ksa/animationRig';
import { insertKeyframeAtPlayhead } from './timelineActions';

/**
 * **The single home for playback** (design-animation-mode.md §5.5; foundation §6.3 death
 * list). Both v1 scrub surfaces — the inline `PreviewScrubber` and the floating
 * `FloatingPreviewToolbar` — are gone; this bar drives the 11A state machine, and the state
 * chip at its centre is the always-visible answer to "why does the scene look like this".
 *
 * **Perf discipline (guardrail 10, the `PreviewProgressLabel` lesson).** The high-frequency
 * `$playheadSec` atom is subscribed in EXACTLY two leaves — {@link TimeReadout} and
 * {@link StateChip}. Nothing else in this tree may read it: every rAF tick of playback
 * writes it, and a wider subscription re-reconciles the whole bar (and its react-aria
 * Select/Menu subtrees) ~60×/s.
 */
export function TransportBar() {
  const anim = useStore($activeAnimation);
  const playing = useStore($animPlaying);
  const parked = useStore($playheadParked);
  const transport = useStore($animTransport);
  const trails = useStore($animTrails);
  const collapsed = useStore($layout).timeline.collapsed;
  const disabled = !anim;

  return (
    <div className="flex h-8 flex-none items-center gap-1 border-b border-border bg-panel px-1.5">
      {/* 1 — play / pause. Play resumes from the parked/pinned time; pause parks in place. */}
      <Tooltip content={playing ? 'Pause (Space)' : 'Play (Space)'}>
        <Button
          size="xs"
          iconOnly
          variant="ghost"
          isDisabled={disabled}
          aria-label={playing ? 'Pause preview' : 'Play preview'}
          onPress={() => (playing ? pausePreview() : playAnimationPreview())}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </Button>
      </Tooltip>

      {/* 2 — stop: only meaningful while something holds the preview off its rest anchor. */}
      {(playing || parked) && (
        <Tooltip content="Stop and return to the modeled pose">
          <Button
            size="xs"
            iconOnly
            variant="ghost"
            aria-label="Stop preview"
            onPress={() => stopAnimationPreview()}
          >
            <Square size={12} />
          </Button>
        </Tooltip>
      )}

      {/* 3 — loop (persisted). */}
      <Tooltip content="Loop">
        <ToggleButton
          size="xs"
          aria-label="Loop preview"
          className="w-6 flex-none"
          isDisabled={disabled}
          isSelected={transport.loop}
          onChange={setLoop}
        >
          <Repeat size={12} />
        </ToggleButton>
      </Tooltip>

      {/* 4 — speed (persisted). */}
      <Select
        size="xs"
        aria-label="Playback speed"
        className="w-16 flex-none"
        isDisabled={disabled}
        selectedKey={String(transport.speed)}
        onSelectionChange={(k) => setSpeed(Number(k) as 0.25 | 0.5 | 1 | 2)}
      >
        <ListBoxItem id="0.25">0.25×</ListBoxItem>
        <ListBoxItem id="0.5">0.5×</ListBoxItem>
        <ListBoxItem id="1">1×</ListBoxItem>
        <ListBoxItem id="2">2×</ListBoxItem>
      </Select>

      <span className="h-4 w-px flex-none bg-border" />

      {/* 5 — to rest ⏮⚓. */}
      <Tooltip content="Show the modeled pose (rest anchor)">
        <Button
          size="xs"
          iconOnly
          variant="ghost"
          isDisabled={disabled}
          aria-label="Return to rest anchor"
          onPress={() => returnToRest()}
        >
          <Anchor size={12} />
        </Button>
      </Tooltip>

      {/* 6 — prev / next keyframe (parks + pins; never wraps). */}
      <Tooltip content="Previous keyframe (,)">
        <Button
          size="xs"
          iconOnly
          variant="ghost"
          isDisabled={disabled}
          aria-label="Previous keyframe"
          onPress={() => stepToKeyframe(-1)}
        >
          <ChevronFirst size={13} />
        </Button>
      </Tooltip>
      <Tooltip content="Next keyframe (.)">
        <Button
          size="xs"
          iconOnly
          variant="ghost"
          isDisabled={disabled}
          aria-label="Next keyframe"
          onPress={() => stepToKeyframe(1)}
        >
          <ChevronLast size={13} />
        </Button>
      </Tooltip>

      {/* 7 — time readout (leaf: subscribes $playheadSec). */}
      <TimeReadout />

      {/* 12 — the state chip, flexing between the readout and ＋Key (leaf). */}
      <StateChip />

      {/* 8 — insert a keyframe at the playhead. */}
      <Tooltip content="Insert keyframe at the playhead (K)">
        <Button
          size="xs"
          variant="secondary"
          className="flex-none px-2"
          isDisabled={disabled}
          onPress={() => insertKeyframeAtPlayhead()}
        >
          <Plus size={12} /> Key
        </Button>
      </Tooltip>

      {/* 9 — latch (persisted): hold the pose on release instead of springing back. */}
      <Tooltip
        content={
          transport.latched
            ? 'Latched — releasing a scrub parks at the release point'
            : 'Spring-loaded — releasing a scrub returns to where you were'
        }
      >
        <ToggleButton
          size="xs"
          aria-label="Latch the playhead"
          className="w-6 flex-none"
          isDisabled={disabled}
          isSelected={transport.latched}
          onChange={setLatched}
        >
          {transport.latched ? <Lock size={12} /> : <LockOpen size={12} />}
        </ToggleButton>
      </Tooltip>

      {/* 10 — motion-trails mirror menu (mirrors View ▸ Motion Trails; wired in 11D). */}
      <MenuTrigger>
        <Button size="xs" variant="ghost" className="flex-none px-1.5" aria-label="Motion trails">
          <Spline size={12} />
          <ChevronDown size={10} />
        </Button>
        <Popover>
          <Menu
            selectionMode="single"
            selectedKeys={[trails]}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (next === 'selected' || next === 'all' || next === 'off') $animTrails.set(next);
            }}
          >
            <MenuItem id="selected">Selected joint</MenuItem>
            <MenuItem id="all">All joints</MenuItem>
            <MenuItem id="off">Off</MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>

      {/* 11 — collapse to the 32px transport-only strip. */}
      <Tooltip content={collapsed ? 'Show the tracks' : 'Collapse to the transport strip'}>
        <Button
          size="xs"
          iconOnly
          variant="ghost"
          aria-label={collapsed ? 'Expand the timeline' : 'Collapse the timeline'}
          onPress={() => toggleTimeline()}
        >
          <ChevronDown
            size={13}
            className={cn('transition-transform', collapsed && 'rotate-180')}
          />
        </Button>
      </Tooltip>
    </div>
  );
}

/**
 * `t [1.240] / 3.00 s`. A LEAF: this and {@link StateChip} are the only components allowed
 * to subscribe `$playheadSec`. The field is `useNumberDraft`-based via {@link NumberField}
 * (`inputMode="url"` — the project-wide numeric mandate); committing parks the playhead.
 */
function TimeReadout() {
  const anim = useStore($activeAnimation);
  const sec = useStore($playheadSec);
  if (!anim) return null;
  return (
    <div className="flex flex-none items-center gap-1 font-mono tabular-nums">
      <div className="w-20">
        <NumberField
          label="t"
          ariaLabel="Playhead time, seconds"
          value={sec}
          min={0}
          max={anim.durationSec}
          step={0.05}
          onCommit={(n) => parkPlayhead(n)}
        />
      </div>
      <span className="text-xs text-fg-subtle">/ {anim.durationSec.toFixed(2)} s</span>
    </div>
  );
}

/**
 * The §5.5 state chip: `● pinned @1.20s` / `● pinned @⚓ (pivot)` / `parked @1.42s` /
 * `rest ⚓` / `▶ 0.86s`. It REPLACES v1's `PreviewProgressLabel` and answers, at a glance,
 * why the viewport shows what it shows. Amber while the posed-preview lock is in force
 * (design §9.6) — the same condition `EditorScene.isPreviewPosed` uses.
 */
function StateChip() {
  const anim = useStore($activeAnimation);
  const sec = useStore($playheadSec);
  const playing = useStore($animPlaying);
  const parked = useStore($playheadParked);
  const scrubbing = useStore($animScrubbing);
  const pinId = useStore($editKeyframeId);

  if (!anim) {
    return (
      <span className="min-w-0 flex-1 truncate px-2 text-xs text-fg-subtle">No clip open</span>
    );
  }

  const anchorT = restAnchorTime(anim);
  const atAnchor = Math.abs(sec - anchorT) <= 1e-6;
  const overrideActive = playing || parked || scrubbing || pinId !== null;
  // The §9.6 lock: a posed (non-anchor) preview is showing, so placement gizmos detach.
  const posed = overrideActive && !atAnchor;

  const text = playing
    ? `▶ ${sec.toFixed(2)}s`
    : pinId
      ? atAnchor
        ? 'pinned @⚓ (pivot)'
        : `pinned @${sec.toFixed(2)}s`
      : scrubbing
        ? `scrubbing @${sec.toFixed(2)}s`
        : parked
          ? `parked @${sec.toFixed(2)}s`
          : 'rest ⚓';

  return (
    <span
      className={cn(
        'min-w-0 flex-1 truncate px-2 text-xs tabular-nums',
        posed ? 'text-warning' : 'text-fg-muted',
      )}
      title={
        posed
          ? 'Posed preview — placements are locked until you return to the rest anchor'
          : 'The scene equals the modeled part'
      }
    >
      {pinId && !playing ? '● ' : ''}
      {text}
    </span>
  );
}
