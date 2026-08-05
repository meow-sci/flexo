import { useStore } from '@nanostores/react';
import { ChevronLeft, ChevronRight, Info, Link2, X } from 'lucide-react';
import { Kbd, Tooltip } from '../kit';
import { StatusChip, StatusChipButton, StatusDivider } from './StatusChip';
import { TOOL_ICONS } from './statusTokens';
import { $toolStatus, type ToolStatus } from '../../state/statusStore';
import { $seatView, enterSeatView, exitSeatView } from '../../state/ivaStore';
import { $part, select } from '../../state/editorStore';
import { $chainSession } from '../../state/chainStore';
import { $chainEval } from '../../three/chainEval';

/**
 * Status-bar segment 3 — the **tool segment** (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.2 #3; foundation §5, §2.6). Absorbs
 * v1's `SeatViewBar` (a floating bar that hard-coded `bottom-14` purely to clear the
 * TransformHud) and gives the measure tool and exhaust placement the visible armed state
 * they never had.
 *
 * The model comes from `statusStore.$toolStatus` (written by `toolStatusWiring`); this
 * component owns the ICONS and the inline CONTROLS, because `src/state/` may not import
 * react — an entry names a lucide icon and this map resolves it.
 *
 * The chain session renders as a second, compact chip rather than as the tool: chain is not
 * a tool (foundation §2.6), it co-exists with one, and its chip mirrors the chain window's
 * footer counts live.
 *
 * Undo enrollment: NONE.
 */

export function ToolSegment() {
  const tool = useStore($toolStatus);
  const chain = useStore($chainSession);

  if (!tool && !chain) return null;

  return (
    <>
      <StatusDivider />
      {tool && <ToolChip tool={tool} />}
      {chain && <ChainChip compact={tool !== null} />}
    </>
  );
}

function ToolChip({ tool }: { tool: ToolStatus }) {
  const Icon = TOOL_ICONS[tool.icon];

  return (
    <>
      <StatusChip>
        {Icon && <Icon size={13} className="shrink-0" />}
        <span className="truncate">{tool.text}</span>
        {tool.kbdHints?.map((chord, ci) => (
          <span key={ci} className="flex shrink-0 items-center gap-0.5">
            {chord.map((token) => (
              <Kbd key={token}>{token}</Kbd>
            ))}
          </span>
        ))}
      </StatusChip>
      {tool.toolId === 'seat-view' && <SeatViewControls />}
    </>
  );
}

/**
 * The seat-view controls, ported from `SeatViewBar` verbatim — prev/next with wrap, the
 * honesty tooltip and Exit.
 *
 * Cycling mirrors the game: `C` walks the seats in document order, so prev/next walk the
 * same list (and wrap), and the segment names the seat by its ordinal because a seat has no
 * other identity — `<IVASeat>` carries no name.
 */
function SeatViewControls() {
  const seatId = useStore($seatView);
  const part = useStore($part);

  const index = part.ivaSeats.findIndex((seat) => seat.id === seatId);
  if (seatId === null || index < 0) return null;
  const total = part.ivaSeats.length;

  /**
   * Moves `delta` seats along the cycle, wrapping — and follows with the selection so the
   * inspector shows the seat you are sitting in when you leave.
   */
  const go = (delta: number) => {
    const nextIndex = (index + delta + total) % total;
    const next = part.ivaSeats[nextIndex];
    if (!next) return;
    enterSeatView(next.id);
    select([{ kind: 'ivaSeat', id: next.id }]);
  };

  return (
    <>
      <StatusChipButton
        aria-label="Previous seat"
        isDisabled={total < 2}
        onPress={() => go(-1)}
        className="px-1"
      >
        <ChevronLeft size={13} />
      </StatusChipButton>
      <StatusChipButton
        aria-label="Next seat"
        isDisabled={total < 2}
        onPress={() => go(1)}
        className="px-1"
      >
        <ChevronRight size={13} />
      </StatusChipButton>

      {/* The honest-limits note is not decoration. flexo renders every SubPart regardless of
          `<Internal>`, so the preview shows more than the game's IVA view does; saying so is
          what keeps it from being read as a promise (plans/IVA_PLAN.md §6). Text verbatim
          from the v1 bar. */}
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
        <StatusChipButton aria-label="About this preview" className="px-1">
          <Info size={13} />
        </StatusChipButton>
      </Tooltip>

      <StatusChipButton onPress={() => exitSeatView()}>
        <X size={13} />
        Exit
        <Kbd>Esc</Kbd>
      </StatusChipButton>
    </>
  );
}

/**
 * A read-only mirror of the chain window's footer (design §1.2 #3): `⛓ 12 instances · +8
 * new`, or the evaluation error in red. Compact (`⛓ 12·+8`) when a tool is also armed, so
 * both fit.
 *
 * Passive on purpose for now: clicking should raise/focus the chain window, and there is no
 * window manager to raise it in yet — the palette is a fixed-position card that is already
 * on top. TODO(P5B): make this the raise-the-chain-window click target once the
 * FloatingWindow tenancy lands.
 */
function ChainChip({ compact }: { compact: boolean }) {
  const evalState = useStore($chainEval);
  const result = evalState?.result;
  const error = result?.error ?? null;
  const total = result?.totalInstances ?? 0;
  const created = result?.newCount ?? 0;

  return (
    <StatusChip className={error ? 'text-danger' : undefined}>
      <Link2 size={13} className="shrink-0" />
      {error ? (
        <span className="truncate">{error}</span>
      ) : (
        <span className="truncate">
          <span className="font-mono tabular-nums">{total}</span>
          {compact ? '·' : ' instances · '}
          <span className="font-mono tabular-nums">+{created}</span>
          {compact ? '' : ' new'}
        </span>
      )}
    </StatusChip>
  );
}
