import { useStore } from '@nanostores/react'
import { ProgressBar } from 'react-aria-components'
import { $loadProgress } from '../../../src/state/loadProgressStore'

/** Bytes → "1.1" MB string (single-decimal, SI megabytes). */
function mb(bytes: number): string {
  return (bytes / 1e6).toFixed(1)
}

/**
 * One compact aggregate bar pinned to the bottom edge, covering both loading
 * phases of the mini app.
 *
 * `catalogLoading` is a separate flag rather than another `$loadProgress` entry:
 * the catalog XML is fetched with plain `fetch` and never reports byte progress,
 * so that phase can only render indeterminate.
 *
 * The raw react-aria `ProgressBar` is used deliberately — the kit doesn't wrap it
 * (`src/ui/LoadProgress.tsx` does the same); this is that render-prop shape, smaller.
 */
export function DownloadProgress({ catalogLoading }: { catalogLoading: boolean }) {
  const state = useStore($loadProgress)
  if (!catalogLoading && !state.active) return null

  let loaded = 0
  let total = 0
  if (!catalogLoading) {
    for (const d of state.downloads) {
      loaded += d.loaded
      if (d.total > 0) total += d.total
    }
  }
  const determinate = !catalogLoading && total > 0

  return (
    // pointer-events-none: the overlay sits over the canvas and must never eat an
    // orbit drag. It hugs the bottom edge, clear of the bottom-right zoom buttons.
    <div className="pointer-events-none">
      {determinate && (
        <div className="absolute bottom-1.5 left-2 text-[10px] tabular-nums text-fg-muted">
          {mb(loaded)} of {mb(total)} MB
        </div>
      )}
      <ProgressBar
        aria-label={catalogLoading ? 'Loading part catalog' : 'Downloading assets'}
        value={determinate ? (loaded / total) * 100 : undefined}
        isIndeterminate={!determinate}
        className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-panel-sunken"
      >
        {({ percentage, isIndeterminate }) => (
          <div
            className={`h-full bg-accent ${isIndeterminate ? 'animate-pulse' : ''}`}
            style={{ width: `${isIndeterminate ? 40 : percentage}%` }}
          />
        )}
      </ProgressBar>
    </div>
  )
}
