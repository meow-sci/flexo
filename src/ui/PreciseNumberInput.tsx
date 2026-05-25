import { useState } from 'react'
import { Input } from '@cladd-ui/react'

/**
 * Numeric input that preserves the user's exact typed value — no step-snapping
 * or decimal rounding (unlike `NumberField`). Free-types while focused via a
 * local string draft; commits the parsed value (clamped to `[min, max]`) on
 * every valid keystroke, and reflects external store changes when not focused.
 */
export function PreciseNumberInput(props: {
  value: number
  onCommit: (n: number) => void
  min?: number
  max?: number
  className?: string
  disabled?: boolean
}) {
  const { value, onCommit, min, max, className, disabled } = props
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <Input
      size="sm"
      type="number"
      className={className}
      inputClassName="font-mono"
      disabled={disabled}
      value={draft ?? String(value)}
      onChange={(v: string) => {
        setDraft(v)
        const n = Number.parseFloat(v)
        if (!Number.isFinite(n)) return
        if (min !== undefined && n < min) return
        if (max !== undefined && n > max) return
        onCommit(n)
      }}
      onFocus={() => setDraft(String(value))}
      onBlur={() => setDraft(null)}
    />
  )
}
