import { useStore } from '@nanostores/react'
import { $measurementSettings, $selectionBounds } from '../state/measurementStore'
import { formatLength } from '../measure/format'

/**
 * Bottom-left floating readout of the selected meshes' bounding-box dimensions
 * (width/height/depth + diagonal). Driven by {@link $selectionBounds}, which the
 * three.js {@link MeasurementLayer} writes from the live selection.
 */
export function MeasurementInfo() {
  const bounds = useStore($selectionBounds)
  const { unit } = useStore($measurementSettings)

  if (!bounds) return null

  const { size } = bounds
  const diagonal = Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z)
  const rows: [string, number][] = [
    ['Width (X)', size.x],
    ['Height (Y)', size.y],
    ['Depth (Z)', size.z],
    ['Diagonal', diagonal],
  ]

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 select-none rounded-xl border border-border bg-panel/95 px-3 py-2 text-fg shadow-popover backdrop-blur-md">
      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-fg-subtle">
        <span>Selection size</span>
        <span className="rounded bg-border px-1 capitalize">{bounds.mode}</span>
      </div>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 font-mono text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="text-right tabular-nums">{formatLength(value, unit)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
