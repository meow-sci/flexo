import { useStore } from '@nanostores/react';
import { MoveDiagonal2, MoveHorizontal, MoveVertical, type LucideIcon } from 'lucide-react';
import { Kbd, keyLabel, Tooltip } from '../kit';
import { StatusChipButton, StatusDivider } from './StatusChip';
import { AXIS_COLOR, type AxisKey } from './axisColors';
import {
  $nudgeAxis,
  $nudgeStep,
  $rotateAxisOffset,
  $rotateStep,
  rotatePairAxisAt,
  ROTATE_PAIRS,
} from '../../state/editorStore';
import { $hasSelection } from '../../state/selectors';
import { FAST_NUDGE_MULTIPLIER } from '../../three/nudgeSelection';
import { changeNudgeAxis, formatNudgeStep } from '../nudgeControls';
import { changeRotateAxes } from '../rotateControls';
import { $mode } from '../../state/modeStore';

/**
 * Status-bar segment 8 — the **rotate and nudge chips** (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.2 #8, §1.5; foundation §5). Absorbs
 * v1's `TransformHud`, the bottom-center pill that floated over the viewport.
 *
 * The rotate and nudge keys are modal: `W`/`S` turns about whichever axis the current
 * mapping assigns, arrows nudge along whichever axis is active. Without a visible posture
 * readout every one of those keys is a guess — which is why this is a permanent segment and
 * not a popover. Clicking either chip cycles it, exactly as `R` and `→` do, and the chord
 * tables live in the tooltips verbatim from v1.
 *
 * Axis tints come from {@link AXIS_COLOR} — the SAME constants the 3D gizmo uses. v1 kept a
 * private `#ff0000`/`#00ff00`/`#0000ff` copy under a comment claiming it matched the gizmo;
 * it had drifted. The chips are now truthful.
 *
 * **Visibility** (§1.2 #8, the fix for v1's F3 gap): desktop only, and shown whenever the
 * mode is Build or Animation **OR** anything transformable is selected. The keys stay live
 * in the other modes through the viewport scope, and a keypress must never mutate the
 * document with zero posture feedback. Below ~860px the segment hides with the modifier
 * hints (§1.1) — keyboard affordances degrade first.
 *
 * Undo enrollment: NONE. `$nudgeAxis`/`$nudgeStep`/`$rotateStep`/`$rotateAxisOffset` are
 * persisted global preferences (`flexo:*`), not document state.
 */

/**
 * Double-headed arrow per axis, oriented to the default camera view: X reads left/right, Y
 * up/down, Z forward/back (depth, shown diagonally). Shared by both chips so an axis always
 * looks the same. Moved here verbatim from `TransformHud`.
 */
const AXIS_ICON: Record<AxisKey, LucideIcon> = {
  x: MoveHorizontal,
  y: MoveVertical,
  z: MoveDiagonal2,
};

/** A small colored double-headed arrow for `axis`. */
function AxisArrow({ axis, size = 12 }: { axis: AxisKey; size?: number }) {
  const Icon = AXIS_ICON[axis];
  return <Icon size={size} style={{ color: AXIS_COLOR[axis] }} aria-hidden />;
}

export function TransformChips() {
  const mode = useStore($mode);
  const hasSelection = useStore($hasSelection);
  const nudgeAxis = useStore($nudgeAxis);
  const nudgeStep = useStore($nudgeStep);
  const rotateStep = useStore($rotateStep);
  // The offset is READ as a value, not fetched from the store mid-render: `rotatePairAxis()`
  // reads the atom itself, which makes the render body non-idempotent and lets React
  // Compiler cache the pair arrows forever (measured — they stopped re-tinting on `R`).
  const rotateOffset = useStore($rotateAxisOffset);

  if (mode !== 'build' && mode !== 'animation' && !hasSelection) return null;

  return (
    // The whole segment, divider included, is one responsive unit (§1.1).
    <span className="hidden items-center min-[860px]:flex">
      <StatusDivider />

      <Tooltip content={<RotateHint />}>
        <StatusChipButton
          onPress={() => changeRotateAxes()}
          aria-label={`Rotate step ${rotateStep} degrees. ${ROTATE_PAIRS.map(
            (pair) =>
              `${pair.toUpperCase()} rotates ${rotatePairAxisAt(pair, rotateOffset).toUpperCase()}`,
          ).join(', ')}. Click to cycle the axes.`}
        >
          {ROTATE_PAIRS.map((pair) => (
            <span key={pair} className="flex items-center gap-0.5">
              <span className="font-mono text-[10px] font-semibold leading-none">
                {pair.toUpperCase()}
              </span>
              <AxisArrow axis={rotatePairAxisAt(pair, rotateOffset)} />
            </span>
          ))}
          <span className="font-mono tabular-nums">{rotateStep}°</span>
        </StatusChipButton>
      </Tooltip>

      <Tooltip content={<NudgeHint />}>
        <StatusChipButton
          onPress={() => changeNudgeAxis(1)}
          aria-label={`Nudge axis ${nudgeAxis.toUpperCase()}, step ${formatNudgeStep(nudgeStep)} metres. Left/right arrows change the axis.`}
        >
          <AxisArrow axis={nudgeAxis} />
          <span
            className="font-mono text-[11px] font-semibold leading-none"
            style={{ color: AXIS_COLOR[nudgeAxis] }}
          >
            {nudgeAxis.toUpperCase()}
          </span>
          <span className="font-mono tabular-nums">{formatNudgeStep(nudgeStep)} m</span>
        </StatusChipButton>
      </Tooltip>
    </span>
  );
}

/**
 * The rotate chord table — v1's `RotateHint`, verbatim.
 *
 * The `F`/`⇧F` step chords are the CURRENT bindings and must stay that way: the rebind to
 * `[`/`]` lands with the scoped hotkey registry, and the tooltip is updated in the same
 * change that makes it true. A tooltip that lies about a chord is worse than no tooltip.
 */
function RotateHint() {
  return (
    <div className="flex flex-col gap-1">
      <HintRow
        chords={[
          ['W', 'S'],
          ['A', 'D'],
          ['Q', 'E'],
        ]}
        label="Rotate selection"
      />
      <HintRow chords={[['R']]} label="Cycle rotation axes" />
      <HintRow chords={[['F'], ['shift', 'F']]} label="Rotation step (larger · smaller)" />
    </div>
  );
}

/** The nudge chord table — v1's `NudgeHint`, verbatim. */
function NudgeHint() {
  return (
    <div className="flex flex-col gap-1">
      <HintRow chords={[['↑'], ['↓']]} label="Nudge along axis" />
      <HintRow
        chords={[
          ['shift', '↑'],
          ['shift', '↓'],
        ]}
        label={`Nudge ×${FAST_NUDGE_MULTIPLIER}`}
      />
      <HintRow chords={[['←'], ['→']]} label="Change nudge axis" />
      <HintRow
        chords={[
          ['shift', '←'],
          ['shift', '→'],
        ]}
        label="Change nudge step"
      />
    </div>
  );
}

function HintRow({ chords, label, sep }: { chords: string[][]; label: string; sep?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex items-center gap-1">
        {chords.map((chord, ci) => (
          <span key={ci} className="flex items-center gap-1">
            {ci > 0 && sep && <span className="text-fg-subtle">{sep}</span>}
            {chord.map((token, ti) => (
              <Kbd key={ti}>{keyLabel(token)}</Kbd>
            ))}
          </span>
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
}
