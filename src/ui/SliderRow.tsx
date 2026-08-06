import type { ReactNode } from 'react';
import { Slider } from './kit';

/**
 * A labeled slider row with a right-aligned mono readout — the slider-only sibling of
 * {@link ColorAlphaField}. `onInteractionStart` fires on pointer-down so a whole drag
 * collapses into one undo step; `format` renders the readout from the current value
 * (defaults to the bare number).
 */
export function SliderRow({
  label,
  ariaLabel,
  value,
  min,
  max,
  step = 1,
  onChange,
  onInteractionStart,
  onInteractionEnd,
  format,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onInteractionStart?: () => void;
  /**
   * react-aria's `onChangeEnd` — the END of one interaction (pointer release, or a settled
   * keyboard step). Streaming callers re-arm their "first event of this drag" latch here, so
   * a keyboard-driven slider gets the same one-push-per-interaction undo behaviour a pointer
   * drag does (`onInteractionStart` alone never fires for the keyboard).
   */
  onInteractionEnd?: (value: number) => void;
  format?: (value: number) => ReactNode;
}) {
  return (
    <div className="flex items-center gap-2" onPointerDown={onInteractionStart}>
      <span className="w-12 shrink-0 text-xs text-fg-muted">{label}</span>
      <Slider
        aria-label={ariaLabel}
        className="flex-1"
        minValue={min}
        maxValue={max}
        step={step}
        value={value}
        onChange={(v) => onChange(v as number)}
        onChangeEnd={onInteractionEnd ? (v) => onInteractionEnd(v as number) : undefined}
      />
      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-fg-subtle">
        {format ? format(value) : value}
      </span>
    </div>
  );
}
