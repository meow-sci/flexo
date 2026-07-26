import { useRef, useState } from 'react'

/**
 * Shared editing model for the app's numeric inputs.
 *
 * Numeric fields are rendered as **text** inputs, never `type="number"`: a number input
 * sanitizes its own DOM value, so an in-progress entry like `-`, `.`, `0.` or `1e-` reads
 * back as the empty string and the controlled re-render erases what the user just typed.
 * Instead the field holds a raw string *draft* while focused, keeps every keystroke that
 * could still become a number, and only reconciles with the store on blur/Enter.
 */

/** A partially-typed number: optional sign, digits/decimal point, optional exponent tail. */
const PARTIAL_NUMBER = /^[+-]?\d*\.?\d*(?:[eE][+-]?\d*)?$/

/**
 * Whether `text` is a number the user could still be in the middle of typing — `''`, `-`,
 * `.`, `0.`, `1e-` all qualify. Used to drop junk keystrokes without ever rewriting the
 * draft (rewriting is what makes a field fight the person typing into it).
 */
export function isPartialNumber(text: string): boolean {
  if (text === '') return true
  // An exponent needs a mantissa; `e5` is not the start of any number.
  if (/^[+-]?[eE]/.test(text)) return false
  return PARTIAL_NUMBER.test(text)
}

/** Parse a draft to a finite number, or `null` if it isn't (yet) one. */
export function parseNumericDraft(text: string): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

export function clampNumber(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min
  if (max !== undefined && n > max) return max
  return n
}

/** Drop binary-float dust from arrow-key stepping (0.1 + 0.2 ⇒ 0.3) without flattening tiny values. */
export function trimFloatNoise(n: number): number {
  return Number.isFinite(n) ? Number(n.toPrecision(12)) : n
}

export interface NumberDraftOptions {
  value: number
  onCommit: (n: number) => void
  /** Called once when editing starts — push a single undo step per typing session. */
  onInteractionStart?: () => void
  min?: number
  max?: number
  /** Arrow-key increment (default 1); Shift ⇒ ×10, Alt ⇒ ×0.1. */
  step?: number
  /** Rendering of the committed value when the field is not being edited. */
  format?: (n: number) => string
}

/**
 * Draft state + input handlers for a numeric text field.
 *
 * - typing keeps the raw string, so `-`, `.`, `0.` and `1e-` survive as intermediate states
 * - each keystroke that parses to an in-range number commits live (gizmos/3D follow along)
 * - out-of-range keystrokes are *skipped*, not clamped — clamping `0` on the way to `0.5`
 *   would fight the typist; the clamp happens once, at the end
 * - blur/Enter finalize: clamp and commit, or restore the pre-edit value if what's left
 *   isn't a number at all (empty, `-`, `.`)
 * - Escape cancels the whole edit, ArrowUp/ArrowDown step by `step`
 *
 * Spread the result onto {@link TextField}: `<TextField inputMode="decimal" {...field} />`.
 */
export function useNumberDraft(options: NumberDraftOptions) {
  const { value, onCommit, onInteractionStart, min, max, step = 1, format = String } = options
  const [draft, setDraft] = useState<string | null>(null)
  /** Value at the time editing began — what Escape (or an unparseable draft) restores. */
  const preEdit = useRef(value)

  const commit = (n: number) => {
    if (n !== value) onCommit(n)
  }

  /** Resolve the draft into a committed value and hand display back to the store. */
  const finalize = () => {
    // No active draft ⇒ no edit to resolve; bail. This guard is load-bearing: after
    // Enter has finalized (draft nulled, focus kept), a selection change can re-bind
    // the still-focused field to a DIFFERENT entity — the eventual blur must not
    // commit the stale preEdit into it (it silently overwrote the new entity's value).
    if (draft === null) return
    const parsed = parseNumericDraft(draft)
    const next = parsed === null ? preEdit.current : clampNumber(parsed, min, max)
    preEdit.current = next
    commit(next)
    setDraft(null)
  }

  const revert = () => {
    commit(preEdit.current)
    setDraft(format(preEdit.current))
  }

  /**
   * Whether there is an edit worth cancelling. Because keystrokes commit live, the draft
   * usually already matches `value` — so "dirty" is measured against the pre-edit value,
   * not the current one.
   */
  const isDirty = () =>
    draft !== null && (value !== preEdit.current || draft !== format(preEdit.current))

  const nudge = (direction: 1 | -1, event: React.KeyboardEvent) => {
    const base = (draft === null ? null : parseNumericDraft(draft)) ?? value
    const scale = event.shiftKey ? 10 : event.altKey ? 0.1 : 1
    const next = clampNumber(trimFloatNoise(base + direction * step * scale), min, max)
    setDraft(format(next))
    commit(next)
  }

  return {
    value: draft ?? format(value),
    onChange: (text: string) => {
      if (!isPartialNumber(text)) return
      setDraft(text)
      const n = parseNumericDraft(text)
      if (n === null) return
      if (min !== undefined && n < min) return
      if (max !== undefined && n > max) return
      commit(n)
    },
    onFocus: () => {
      preEdit.current = value
      setDraft(format(value))
      onInteractionStart?.()
    },
    onBlur: finalize,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        // No preventDefault: a surrounding dialog's default action still runs, and it now
        // reads the committed value rather than a half-typed draft.
        finalize()
      } else if (event.key === 'Escape') {
        // Only swallow Escape when there is an edit to cancel, so an untouched field
        // still lets Escape close the popover/dialog it lives in.
        if (isDirty()) {
          event.preventDefault()
          event.stopPropagation()
          revert()
        }
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        nudge(1, event)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        nudge(-1, event)
      }
    },
  }
}
