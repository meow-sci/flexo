import { useStore } from '@nanostores/react';
import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import { Button, Kbd, Tooltip } from './kit';
import { $seatView, enterSeatView, exitSeatView } from '../state/ivaStore';
import { $part, selectIvaSeat } from '../state/editorStore';

/**
 * The floating bar shown while sitting in an IVA seat — the only chrome the seat preview
 * gets, since the rest of the viewport IS the preview (plans/IVA_PLAN.md §3.6).
 *
 * Cycling here mirrors the game: `C` walks the seats in document order, so prev/next walk
 * the same list (and wrap), and the bar names the seat by its ordinal because a seat has
 * no other identity — `<IVASeat>` carries no name.
 *
 * The honest-limits note is not decoration. flexo renders every SubPart regardless of
 * `<Internal>`, so this shows more than the game's IVA view does; saying so in the UI is
 * what keeps the preview from being read as a promise (§6, "The preview is not the game
 * view").
 */
export function SeatViewBar() {
  const seatId = useStore($seatView);
  const part = useStore($part);

  const index = part.ivaSeats.findIndex((s) => s.id === seatId);
  // A vanished seat is torn down by EditorScene; until that lands, render nothing.
  if (seatId === null || index < 0) return null;
  const total = part.ivaSeats.length;

  /** Moves `delta` seats along the cycle, wrapping — and follows with the selection so
   *  the inspector shows the seat you are sitting in when you leave. */
  const go = (delta: number) => {
    const nextIndex = (index + delta + total) % total;
    const next = part.ivaSeats[nextIndex];
    if (!next) return;
    enterSeatView(next.id);
    selectIvaSeat(nextIndex);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-14 z-30 flex justify-center px-2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-panel/95 px-2 py-1.5 shadow-popover backdrop-blur-md">
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          aria-label="Previous seat"
          isDisabled={total < 2}
          onPress={() => go(-1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="select-none whitespace-nowrap px-1 text-sm">
          Seat {index + 1} / {total}
        </span>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          aria-label="Next seat"
          isDisabled={total < 2}
          onPress={() => go(1)}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Tooltip
          content={
            <div className="flex flex-col gap-1">
              <p>
                Drag to look around. The look limits, eye position and 50° field of view are the
                game&apos;s own.
              </p>
              <p>
                Not identical to the game view: flexo draws every SubPart, interior or not, so you
                also see the hull from in here. Mouse smoothing and KSA&apos;s look sensitivity are
                not simulated.
              </p>
            </div>
          }
          delay={200}
        >
          <Button iconOnly size="sm" variant="ghost" aria-label="About this preview">
            <Info className="size-4" />
          </Button>
        </Tooltip>
        <Button size="sm" variant="ghost" onPress={() => exitSeatView()}>
          <X className="size-4" />
          Exit
          <Kbd>Esc</Kbd>
        </Button>
      </div>
    </div>
  );
}
