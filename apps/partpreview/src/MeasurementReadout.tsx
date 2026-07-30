import { useStore } from '@nanostores/react'
import { formatVec } from '../../../src/measure/format'
import { $measurements, $partBounds } from './settings'

/**
 * The whole part's extents as one compact line of text.
 *
 * The editor draws a `CSS2DObject` label per axis (`MeasurementLayer`); three
 * floating labels are illegible in a 200×200 iframe, so the dimensions are shown
 * once, as HTML, instead.
 *
 * Always meters: that is KSA's native unit and, by design, this app exposes no
 * unit / orientation / precision options — just the one toggle.
 */
export function MeasurementReadout() {
  const show = useStore($measurements)
  const bounds = useStore($partBounds)
  if (!show || !bounds) return null

  return (
    // Bottom-left, but ABOVE the bottom edge: at 200px wide this line is ~123px
    // and the [−][+][⚙] bar is 92px, so `bottom-2` would have run underneath the
    // buttons (measured). `bottom-10` (40px) clears that 28px bar at bottom-2 and
    // also clears DownloadProgress's bar + "x of y MB" label at the very bottom.
    // pointer-events-none: it sits over the canvas and must never eat an orbit drag.
    <div className="pointer-events-none absolute bottom-10 left-2 text-[10px] tabular-nums text-fg-muted">
      {formatVec(bounds.size, 'm')}
    </div>
  )
}
