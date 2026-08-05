import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { ProgressBar } from 'react-aria-components';
import { Chip, DialogTrigger, Popover, PopoverDialog } from '../kit';
import { StatusChipButton } from './StatusChip';
import { $progress, type Job } from '../../state/statusStore';

/**
 * Status-bar segment 6 — the **progress readout** (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.2 #6, §1.5; foundation §5). Absorbs
 * v1's `WorkspaceLoadProgress`, the bottom-center panel that stacked visually against the
 * TransformHud and the seat bar.
 *
 * Data is `statusStore.$progress`, which merges the existing `trackDownload` funnel (HDR /
 * GLB / KTX2) with `trackJob` rows so long non-download work — archive builds, mod zips —
 * shares one surface instead of inventing its own.
 *
 * Two deltas from v1 (§1.5):
 * - The **hide-while-a-browser-is-open swap is deleted.** v1 hid the workspace panel
 *   whenever `$browserPopupCount > 0` so the two surfaces could never both show. The status
 *   segment now always renders while work is in flight, and the catalog browsers keep their
 *   own `PreviewLoadProgress` pane overlay — both may show, which is honest (§1.2 #6).
 * - Per-file detail moves into a click-through popover instead of being a permanent
 *   multi-row panel over the viewport.
 *
 * **The render loop is untouched**: this subscribes to a store that only ticks on real
 * download/job progress events, and the animated indeterminate state is a CSS animation.
 * Nothing here schedules a frame (foundation §14.5).
 *
 * Undo enrollment: NONE. Persistence: NONE.
 */

/**
 * Whether the segment renders: `$progress.active`, held true for 500ms after it drops
 * (§1.2 #6 "min-display 500ms — no flicker on cache hits"). A cache hit finishes inside one
 * frame, and a bar that appears and vanishes within it reads as a glitch, not as progress.
 *
 * A store rather than component state on purpose. The linger is a property of the WORK, not
 * of a mounted component — and deriving it inside the component would mean setting state
 * synchronously from an effect, which is exactly the cascading-render pattern React
 * Compiler and the lint rule both reject. Out here it is an ordinary external subscription
 * that the component simply reads.
 */
const $progressVisible = atom(false);

let hideTimer: ReturnType<typeof setTimeout> | null = null;

$progress.subscribe((state) => {
  if (state.active) {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    $progressVisible.set(true);
    return;
  }
  // Already hidden, or already counting down — nothing to arm.
  if (!$progressVisible.get() || hideTimer !== null) return;
  hideTimer = setTimeout(() => {
    hideTimer = null;
    $progressVisible.set(false);
  }, 500);
});

/** Bytes → "1.1" MB string (single-decimal, SI megabytes). Ported from `LoadProgress`. */
function mb(bytes: number): string {
  return (bytes / 1e6).toFixed(1);
}

/**
 * Keeps the head and tail of a long asset path: the interesting parts of
 * `Textures/Environments/…/kiln_4k.ktx2` are both ends, never the middle.
 */
function truncateMiddle(label: string, max = 34): string {
  if (label.length <= max) return label;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${label.slice(0, head)}…${label.slice(label.length - tail)}`;
}

/** The shared bar recipe — determinate fill, or a pulsing 40% stub when the size is unknown. */
function Bar({
  percent,
  label,
  className,
}: {
  percent: number | null;
  label: string;
  className?: string;
}) {
  return (
    <ProgressBar
      aria-label={label}
      value={percent ?? undefined}
      isIndeterminate={percent === null}
      className={className}
    >
      {({ percentage, isIndeterminate }) => (
        <div className="relative h-1.5 overflow-hidden rounded-full bg-panel-sunken outline outline-1 -outline-offset-1 outline-border">
          <div
            className={`h-full rounded-full bg-accent ${isIndeterminate ? 'animate-pulse' : ''}`}
            style={{ width: `${isIndeterminate ? 40 : percentage}%` }}
          />
        </div>
      )}
    </ProgressBar>
  );
}

export function ProgressSegment() {
  const progress = useStore($progress);
  const visible = useStore($progressVisible);
  const [open, setOpen] = useState(false);

  if (!visible) return null;

  const { percent, jobs } = progress;

  return (
    // "Rows disappear on completion; the popover auto-closes when empty" (§1.2 #6) — as a
    // derived condition, so nothing has to set state from an effect to close it.
    <DialogTrigger isOpen={open && jobs.length > 0} onOpenChange={setOpen}>
      <StatusChipButton
        aria-label={
          percent === null
            ? `Loading ${jobs.length} item${jobs.length === 1 ? '' : 's'}`
            : `Loading ${jobs.length} item${jobs.length === 1 ? '' : 's'}, ${Math.round(percent)}%`
        }
        className="flex-none"
      >
        <Bar percent={percent} label="Overall progress" className="block w-24" />
        {percent !== null && (
          <span className="w-8 text-right font-mono tabular-nums">{Math.round(percent)}%</span>
        )}
        {jobs.length > 1 && <Chip>{jobs.length} files</Chip>}
      </StatusChipButton>

      {/* react-aria mounts the popover's children only while it is OPEN, so the rows below
          subscribe fresh on each open AND keep updating live from the store while it stays
          open — the compiler never gets to freeze a stale snapshot. */}
      <Popover placement="top" className="w-80">
        <PopoverDialog aria-label="Downloads in progress" className="flex flex-col gap-2">
          <ProgressRows />
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  );
}

function ProgressRows() {
  const { jobs } = useStore($progress);

  if (jobs.length === 0) {
    return <span className="text-xs text-fg-subtle">Nothing in flight.</span>;
  }

  return (
    <>
      {jobs.map((job) => (
        <ProgressRow key={job.id} job={job} />
      ))}
    </>
  );
}

function ProgressRow({ job }: { job: Job }) {
  const total = job.total;
  const percent = total !== null && total > 0 ? Math.min(100, (job.loaded / total) * 100) : null;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate" title={job.label}>
          {truncateMiddle(job.label)}
        </span>
        <span className="shrink-0 font-mono tabular-nums text-fg-muted">
          {total !== null && total > 0
            ? `${mb(job.loaded)} / ${mb(total)} MB`
            : `${mb(job.loaded)} MB`}
        </span>
      </div>
      <Bar percent={percent} label={job.label} className="block" />
    </div>
  );
}
