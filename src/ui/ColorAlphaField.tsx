import { Slider } from './kit'

/**
 * Hex color picker plus an alpha (opacity) slider. The native `<input type="color">`
 * has no alpha channel, so opacity is a separate 0–100% control. Reused for the
 * container outline color and the containment-warning color.
 */
export function ColorAlphaField({
  label,
  color,
  opacity,
  onChange,
}: {
  label: string
  color: string
  opacity: number
  onChange: (next: { color: string; opacity: number }) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-fg-muted">{label}</span>
      <input
        type="color"
        aria-label={`${label} color`}
        className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border bg-transparent"
        value={color}
        onChange={(e) => onChange({ color: e.target.value, opacity })}
      />
      <Slider
        aria-label={`${label} opacity`}
        className="flex-1"
        minValue={0}
        maxValue={1}
        step={0.01}
        value={opacity}
        onChange={(v) => onChange({ color, opacity: v as number })}
      />
      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-fg-subtle">
        {Math.round(opacity * 100)}%
      </span>
    </div>
  )
}
