import { useStore } from '@nanostores/react'
import { ArrowUp } from 'lucide-react'
import { Button, Tooltip, useIsPhone } from './kit'
import { $nudgeAxis, $nudgeStep, type NudgeAxis } from '../state/editorStore'
import { FAST_NUDGE_MULTIPLIER } from '../three/nudgeSelection'
import { changeNudgeAxis, formatNudgeStep } from './nudgeControls'
import { Kbd } from './hotkeys/Kbd'
import { keyLabel } from './hotkeys/keyDisplay'

/** Arrow colour per axis, matching the three.js gizmo axis handles. */
const AXIS_COLOR: Record<NudgeAxis, string> = {
  x: '#ff0000', // gizmo X — red
  y: '#00ff00', // gizmo Y — green
  z: '#0000ff', // gizmo Z — blue
}

/**
 * Bottom-center status bubble for the arrow-key nudge tool. Sticks 0.5rem off the
 * bottom edge, centered. Shows the active nudge axis (with an up/down-arrow glyph
 * tinted to the gizmo's axis colour) and the current step distance; ↑/↓ nudge the
 * selection along this axis, ←/→ (or clicking the bubble) cycle which axis it is.
 * Keyboard-only feature, so it's hidden on phones.
 */
export function NudgeToolbar() {
  const isPhone = useIsPhone()
  const axis = useStore($nudgeAxis)
  const step = useStore($nudgeStep)

  if (isPhone) return null

  return (
    <div className="absolute inset-x-0 bottom-2 flex justify-center">
      <Tooltip content={<NudgeHint />}>
        <Button
          variant="secondary"
          onPress={() => changeNudgeAxis(1)}
          aria-label={`Nudge axis ${axis.toUpperCase()}, step ${formatNudgeStep(step)} metres. Left/right arrows change the axis.`}
          className="h-7 gap-1.5 rounded-full px-3 shadow-popover"
        >
          <ArrowUp size={13} style={{ color: AXIS_COLOR[axis] }} />
          <span className="font-mono text-sm font-semibold leading-none">{axis.toUpperCase()}</span>
          <span className="h-3.5 w-px bg-border" aria-hidden />
          <span className="font-mono text-xs leading-none text-fg-muted tabular-nums">
            {formatNudgeStep(step)} m
          </span>
        </Button>
      </Tooltip>
    </div>
  )
}

/** Tooltip rows: hotkey widget(s) first, then the description, like the help screen. */
function NudgeHint() {
  return (
    <div className="flex flex-col gap-1">
      <HintRow chords={[['↑'], ['↓']]} label="Nudge along axis" />
      <HintRow chords={[['shift', '↑'], ['shift', '↓']]} label={`Nudge ×${FAST_NUDGE_MULTIPLIER}`} />
      <HintRow chords={[['←'], ['→']]} label="Change axis" />
      <HintRow chords={[['shift', '←'], ['shift', '→']]} label="Change step" />
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
