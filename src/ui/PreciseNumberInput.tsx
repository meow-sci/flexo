import { TextField } from './kit'
import { useNumberDraft } from './numberDraft'

/**
 * Numeric input that preserves the user's exact typed value — no step-snapping
 * or decimal rounding (unlike `NumberField`, which rounds the display).
 * Free-types while focused via a local string draft (see {@link useNumberDraft}
 * for the editing rules), commits every valid in-range keystroke, and reflects
 * external store changes when not focused.
 */
export function PreciseNumberInput(props: {
  value: number
  onCommit: (n: number) => void
  /** Called once when the field gains focus — use to push a single undo step
   *  so a whole typing session collapses into one undo (see editor-state docs). */
  onInteractionStart?: () => void
  /** Bounds: out-of-range keystrokes are not committed, and the final value is clamped. */
  min?: number
  max?: number
  /** Arrow-key increment (default 1); Shift ⇒ ×10, Alt ⇒ ×0.1. */
  step?: number
  className?: string
  isDisabled?: boolean
  'aria-label': string
}) {
  const { value, onCommit, onInteractionStart, min, max, step, className, isDisabled } = props
  const field = useNumberDraft({ value, onCommit, onInteractionStart, min, max, step })

  return (
    <TextField
      size="sm"
      // must inputMode="url" so negative numbers can be managed on mobile devices, numeric/decimal/integer dont show "-" key
      inputMode="url"
      aria-label={props['aria-label']}
      className={className}
      inputClassName="font-mono"
      isDisabled={isDisabled}
      {...field}
    />
  )
}
