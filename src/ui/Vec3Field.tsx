import { cn } from './kit';
import { PreciseNumberInput } from './PreciseNumberInput';
import type { Vec3 } from '../ksa/types';

/**
 * Three numeric inputs (X/Y/Z) editing a {@link Vec3} in a row, with an optional leading
 * label. Each axis commits independently; `disabled` can lock individual axes (e.g. an
 * axis-locked measurement endpoint). Shared by the container + measurement editors.
 */
export function Vec3Field({
  label,
  labelWidth = 'w-12',
  value,
  disabled,
  min,
  max,
  step,
  onCommit,
  onInteractionStart,
}: {
  label?: string;
  /** Tailwind width for the leading label (default 'w-12'); single-char labels use 'w-3'. */
  labelWidth?: string;
  value: Vec3;
  disabled?: { x: boolean; y: boolean; z: boolean };
  /** Bounds/arrow-step applied to all three axes (see {@link PreciseNumberInput}). */
  min?: number;
  max?: number;
  step?: number;
  onCommit: (axis: keyof Vec3, value: number) => void;
  onInteractionStart?: () => void;
}) {
  const axes: (keyof Vec3)[] = ['x', 'y', 'z'];
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className={cn(labelWidth, 'shrink-0 text-xs text-fg-muted')}>{label}</span>}
      {axes.map((axis) => (
        <PreciseNumberInput
          key={axis}
          aria-label={`${label ?? ''} ${axis.toUpperCase()}`}
          className="min-w-0 flex-1"
          value={value[axis]}
          min={min}
          max={max}
          step={step}
          isDisabled={disabled?.[axis]}
          onInteractionStart={onInteractionStart}
          onCommit={(val) => onCommit(axis, val)}
        />
      ))}
    </div>
  );
}
