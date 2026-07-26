import { TextField } from './kit'
import { fmt } from './format'
import { useNumberDraft } from './numberDraft'

/**
 * A draft-aware numeric field with a short inline label. Free-types while focused (local
 * string draft — see {@link useNumberDraft} for the editing rules) and reflects external
 * store changes (e.g. gizmo drags) when not focused. Commits a parsed number on every valid
 * keystroke; calls `onInteractionStart` once on focus so a typing session collapses into one
 * undo step. Display is rounded to ~5 decimals (vs `PreciseNumberInput`, which preserves the
 * exact value).
 */
export function NumberField(props: {
  /** Visible label — ONE character wide (the slot is `w-3`); use `ariaLabel` for the rest. */
  label: string
  /** Accessible name when {@link label} is a symbol (e.g. "Ø" ⇒ "Diameter"). */
  ariaLabel?: string
  value: number
  onCommit: (n: number) => void
  onInteractionStart?: () => void
  /** Bounds: out-of-range keystrokes are not committed, and the final value is clamped. */
  min?: number
  max?: number
  /** Arrow-key increment (default 1); Shift ⇒ ×10, Alt ⇒ ×0.1. */
  step?: number
  isDisabled?: boolean
}) {
  const { label, ariaLabel, value, onCommit, onInteractionStart, min, max, step, isDisabled } =
    props
  const field = useNumberDraft({ value, onCommit, onInteractionStart, min, max, step, format: fmt })

  return (
    <label className="flex items-center gap-1">
      <span className="w-3 text-xs text-fg-subtle">{label}</span>
      <TextField
        size="sm"
        // must inputMode="url" so negative numbers can be managed on mobile devices, numeric/decimal/integer dont show "-" key
        inputMode="url"
        aria-label={ariaLabel ?? label}
        inputClassName="font-mono"
        isDisabled={isDisabled}
        {...field}
      />
    </label>
  )
}
