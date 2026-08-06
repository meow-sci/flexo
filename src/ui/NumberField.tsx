import { Minus, Plus } from 'lucide-react';
import { Button, TextField, useIsPhone } from './kit';
import { fmt } from './format';
import { clampNumber, trimFloatNoise, useNumberDraft } from './numberDraft';

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
  label: string;
  /** Accessible name when {@link label} is a symbol (e.g. "Ø" ⇒ "Diameter"). */
  ariaLabel?: string;
  value: number;
  onCommit: (n: number) => void;
  onInteractionStart?: () => void;
  /** Bounds: out-of-range keystrokes are not committed, and the final value is clamped. */
  min?: number;
  max?: number;
  /** Arrow-key increment (default 1); Shift ⇒ ×10, Alt ⇒ ×0.1. */
  step?: number;
  isDisabled?: boolean;
  /**
   * Render `[−]`/`[+]` buttons beside the input **on phones** (foundation §12's census
   * touch-gap rule; design-animation-mode.md §14 row 4). They are the touch equivalent of
   * ArrowUp/ArrowDown — same `step`, same single-undo-step contract via `onInteractionStart`
   * — for fields whose keyboard route does not exist on a phone. Desktop ignores the flag.
   */
  touchSteppers?: boolean;
}) {
  const {
    label,
    ariaLabel,
    value,
    onCommit,
    onInteractionStart,
    min,
    max,
    step,
    isDisabled,
    touchSteppers,
  } = props;
  const isPhone = useIsPhone();
  const field = useNumberDraft({
    value,
    onCommit,
    onInteractionStart,
    min,
    max,
    step,
    format: fmt,
  });

  const bump = (direction: 1 | -1) => {
    onInteractionStart?.();
    const next = clampNumber(trimFloatNoise(value + direction * (step ?? 1)), min, max);
    if (next !== value) onCommit(next);
  };

  return (
    <label className="flex items-center gap-1">
      <span className="w-3 text-xs text-fg-subtle">{label}</span>
      {touchSteppers && isPhone && (
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-11 shrink-0"
          isDisabled={isDisabled}
          aria-label={`Decrease ${ariaLabel ?? label}`}
          onPress={() => bump(-1)}
        >
          <Minus className="size-4" />
        </Button>
      )}
      <TextField
        size="sm"
        // must inputMode="url" so negative numbers can be managed on mobile devices, numeric/decimal/integer dont show "-" key
        inputMode="url"
        aria-label={ariaLabel ?? label}
        inputClassName="font-mono"
        isDisabled={isDisabled}
        {...field}
      />
      {touchSteppers && isPhone && (
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-11 shrink-0"
          isDisabled={isDisabled}
          aria-label={`Increase ${ariaLabel ?? label}`}
          onPress={() => bump(1)}
        >
          <Plus className="size-4" />
        </Button>
      )}
    </label>
  );
}
