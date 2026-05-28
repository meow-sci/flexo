import { useStore } from '@nanostores/react'
import { ProgressBar } from 'react-aria-components'
import {
  $browserPopupCount,
  $loadProgress,
  type DownloadInfo,
  type LoadProgressState,
} from '../state/loadProgressStore'

/**
 * Two always-available surfaces for the global asset {@link $loadProgress},
 * both rendering the same shared {@link Panel} widget:
 *
 * - {@link WorkspaceLoadProgress}: a panel centered 1rem off the bottom of the
 *   screen, for environment (HDR) downloads while the 3D workspace is visible.
 * - {@link PreviewLoadProgress}: a backdrop overlay centered over a preview pane,
 *   for the GLB/KTX2 downloads triggered by the Add Part / Add SubPart popups.
 *
 * The panel shows a `Loading N…` header (N = in-flight downloads) above one bar
 * per file, each determinate whenever the download reports a Content-Length.
 */
function FileBar({ download }: { download: DownloadInfo }) {
  return (
    <ProgressBar
      aria-label={`Downloading ${download.label}`}
      value={download.determinate ? download.percent : undefined}
      isIndeterminate={!download.determinate}
      className="block"
    >
      {({ percentage, isIndeterminate }) => (
        <div className="relative h-2 overflow-hidden rounded-full bg-cladd-surface-cut outline outline-1 -outline-offset-1 outline-cladd-outline">
          <div
            className={`h-full rounded-full bg-cladd-primary ${isIndeterminate ? 'animate-pulse' : ''}`}
            style={{ width: `${isIndeterminate ? 40 : percentage}%` }}
          />
        </div>
      )}
    </ProgressBar>
  )
}

/** Bytes → "1.1" MB string (single-decimal, SI megabytes). */
function mb(bytes: number): string {
  return (bytes / 1e6).toFixed(1)
}

function Panel({ state }: { state: LoadProgressState }) {
  const count = state.downloads.length
  let loaded = 0
  let total = 0
  for (const d of state.downloads) {
    loaded += d.loaded
    if (d.total > 0) total += d.total
  }
  const size = total > 0 ? ` (${mb(loaded)} of ${mb(total)} MB)` : ''
  return (
    <div className="flex w-72 max-w-full flex-col gap-0.5">
      <div className="text-xs tabular-nums text-cladd-fg-soft">
        Loading {count} asset{count === 1 ? '' : 's'}…{size}
      </div>
      {state.downloads.map((download) => (
        <FileBar key={download.id} download={download} />
      ))}
    </div>
  )
}

/** Bottom-center panel for the 3D workspace; hidden while an asset-browser popup is open. */
export function WorkspaceLoadProgress() {
  const state = useStore($loadProgress)
  const popupCount = useStore($browserPopupCount)
  if (!state.active || popupCount > 0) return null
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2">
      <div className="rounded-lg bg-cladd-surface/90 px-3 py-2 shadow-lg backdrop-blur">
        <Panel state={state} />
      </div>
    </div>
  )
}

/** Backdrop overlay centered over a preview pane (the parent must be positioned). */
export function PreviewLoadProgress() {
  const state = useStore($loadProgress)
  if (!state.active) return null
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-cladd-backdrop/60 backdrop-blur-sm">
      <div className="rounded-lg bg-cladd-surface px-4 py-3 shadow-lg">
        <Panel state={state} />
      </div>
    </div>
  )
}
