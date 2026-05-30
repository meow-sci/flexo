import { useStore } from '@nanostores/react'
import { MoveDiagonal2, MoveHorizontal, MoveVertical, type LucideIcon } from 'lucide-react'
import { Button, Tooltip, useIsPhone } from './kit'
import {
  $nudgeAxis,
  $nudgeStep,
  $rotateAxisOffset,
  $rotateStep,
  rotatePairAxis,
  ROTATE_PAIRS,
  type NudgeAxis,
} from '../state/editorStore'
import { FAST_NUDGE_MULTIPLIER } from '../three/nudgeSelection'
import { changeNudgeAxis, formatNudgeStep } from './nudgeControls'
import { changeRotateAxes } from './rotateControls'
import { Kbd } from './hotkeys/Kbd'
import { keyLabel } from './hotkeys/keyDisplay'

/** Arrow colour per axis, matching the three.js gizmo axis handles. */
const AXIS_COLOR: Record<NudgeAxis, string> = {
  x: '#ff0000', // gizmo X — red
  y: '#00ff00', // gizmo Y — green
  z: '#0000ff', // gizmo Z — blue
}

/**
 * Double-headed arrow per axis, oriented to the default camera view: X reads
 * left/right, Y up/down, Z forward/back (depth, shown diagonally). Shared by both
 * the rotate and nudge sections so an axis always looks the same.
 */
const AXIS_ICON: Record<NudgeAxis, LucideIcon> = {
  x: MoveHorizontal,
  y: MoveVertical,
  z: MoveDiagonal2,
}

/** A small colored double-headed arrow for `axis`. */
function AxisArrow({ axis, size = 13 }: { axis: NudgeAxis; size?: number }) {
  const Icon = AXIS_ICON[axis]
  return <Icon size={size} style={{ color: AXIS_COLOR[axis] }} aria-hidden />
}

/**
 * Bottom-center transform HUD: a single status bubble with two clusters separated
 * by a vertical rule. Left — the rotate tool: each key pair (Q/E, W/S, A/D) with a
 * colored double-headed arrow for the world axis it currently turns about, plus the
 * step angle; click (or press R) to cycle the axis assignment, F/⇧F change the step.
 * Right — the arrow-key nudge tool: the active axis (same axis arrow) and step
 * distance; click (or ←/→) to cycle the axis. Keyboard-only, so hidden on phones.
 */
export function TransformHud() {
  const isPhone = useIsPhone()
  const nudgeAxis = useStore($nudgeAxis)
  const nudgeStep = useStore($nudgeStep)
  const rotateStep = useStore($rotateStep)
  // Subscribe so the rotate arrows re-render when R cycles the axis mapping.
  useStore($rotateAxisOffset)

  if (isPhone) return null

  return (
    <div className="absolute inset-x-0 bottom-2 flex justify-center">
      <div className="flex h-7 items-center rounded-full border border-border bg-white/[0.04] shadow-popover">
        <Tooltip content={<RotateHint />}>
          <Button
            variant="ghost"
            onPress={() => changeRotateAxes()}
            aria-label={`Rotate step ${rotateStep} degrees. ${ROTATE_PAIRS.map(
              (p) => `${p.toUpperCase()} rotates ${rotatePairAxis(p).toUpperCase()}`,
            ).join(', ')}. Click to cycle the axes.`}
            className="h-full gap-2 rounded-l-full px-3"
          >
            {ROTATE_PAIRS.map((pair) => (
              <span key={pair} className="flex items-center gap-1">
                <span className="font-mono text-[10px] font-semibold leading-none text-fg-muted">
                  {pair.toUpperCase()}
                </span>
                <AxisArrow axis={rotatePairAxis(pair)} />
              </span>
            ))}
            <span className="font-mono text-xs leading-none text-fg-muted tabular-nums">
              {rotateStep}°
            </span>
          </Button>
        </Tooltip>

        <span className="h-3.5 w-px bg-border" aria-hidden />

        <Tooltip content={<NudgeHint />}>
          <Button
            variant="ghost"
            onPress={() => changeNudgeAxis(1)}
            aria-label={`Nudge axis ${nudgeAxis.toUpperCase()}, step ${formatNudgeStep(nudgeStep)} metres. Left/right arrows change the axis.`}
            className="h-full gap-1.5 rounded-r-full px-3"
          >
            <AxisArrow axis={nudgeAxis} />
            <span className="font-mono text-sm font-semibold leading-none">
              {nudgeAxis.toUpperCase()}
            </span>
            <span className="h-3.5 w-px bg-border" aria-hidden />
            <span className="font-mono text-xs leading-none text-fg-muted tabular-nums">
              {formatNudgeStep(nudgeStep)} m
            </span>
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}

/** Tooltip rows for the rotate cluster (left side of the HUD). */
function RotateHint() {
  return (
    <div className="flex flex-col gap-1">
      <HintRow chords={[['W', 'S'], ['A', 'D'], ['Q', 'E']]} label="Rotate selection" />
      <HintRow chords={[['R']]} label="Cycle rotation axes" />
      <HintRow chords={[['F'], ['shift', 'F']]} label="Rotation step (larger · smaller)" />
    </div>
  )
}

/** Tooltip rows for the nudge cluster (right side of the HUD). */
function NudgeHint() {
  return (
    <div className="flex flex-col gap-1">
      <HintRow chords={[['↑'], ['↓']]} label="Nudge along axis" />
      <HintRow chords={[['shift', '↑'], ['shift', '↓']]} label={`Nudge ×${FAST_NUDGE_MULTIPLIER}`} />
      <HintRow chords={[['←'], ['→']]} label="Change nudge axis" />
      <HintRow chords={[['shift', '←'], ['shift', '→']]} label="Change nudge step" />
    </div>
  )
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
  )
}
