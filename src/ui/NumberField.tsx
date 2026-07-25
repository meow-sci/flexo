import { useState } from 'react'
import { TextField } from './kit'
import { fmt } from './format'

/**
 * A draft-aware numeric field with a short inline label. Free-types while focused (local
 * string draft) and reflects external store changes (e.g. gizmo drags) when not focused.
 * Commits a parsed number on every valid keystroke; calls `onInteractionStart` once on focus
 * so a typing session collapses into one undo step. Display is rounded to ~5 decimals (vs
 * {@link PreciseNumberInput}, which preserves the exact value).
 */
export function NumberField(props: {
  /** Visible label — ONE character wide (the slot is `w-3`); use `ariaLabel` for the rest. */
  label: string
  /** Accessible name when {@link label} is a symbol (e.g. "Ø" ⇒ "Diameter"). */
  ariaLabel?: string
  value: number
  onCommit: (n: number) => void
  onInteractionStart?: () => void
  isDisabled?: boolean
}) {
  const { label, ariaLabel, value, onCommit, onInteractionStart, isDisabled } = props
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <label className="flex items-center gap-1">
      <span className="w-3 text-xs text-fg-subtle">{label}</span>
      <TextField
        size="sm"
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel ?? label}
        value={draft ?? fmt(value)}
        inputClassName="font-mono"
        isDisabled={isDisabled}
        onChange={(v) => {
          setDraft(v)
          const n = Number.parseFloat(v)
          if (Number.isFinite(n)) onCommit(n)
        }}
        onFocus={() => {
          setDraft(fmt(value))
          onInteractionStart?.()
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}
