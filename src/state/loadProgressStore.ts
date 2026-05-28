import { atom } from 'nanostores'

/**
 * Global, viewport-agnostic download progress for the large binary assets the
 * app streams at runtime — GLB mesh atlases, KTX2 texture atlases, and HDR
 * environments. Every asset loader funnels its byte progress here through
 * {@link trackDownload}, so a single UI surface can reflect downloads regardless
 * of which screen triggered them (env change in the 3D workspace, or the GLB/KTX2
 * fetches behind the import popups).
 *
 * Progress is real (byte-level) whenever the server sends Content-Length — three
 * .js's FileLoader streams the body and reports {loaded,total}. A download whose
 * size is unknown renders indeterminate. One {@link DownloadInfo} is exposed per
 * in-flight download so the UI can show a bar per file.
 */
export interface DownloadInfo {
  id: number
  /** Short label (the asset's filename) for accessibility. */
  label: string
  loaded: number
  total: number
  /** 0–100, valid only when {@link determinate}. */
  percent: number
  /** True once the download reported a Content-Length. */
  determinate: boolean
}

export interface LoadProgressState {
  /** True while at least one download is in flight. */
  active: boolean
  /** One entry per in-flight download, in start order. */
  downloads: DownloadInfo[]
}

const IDLE: LoadProgressState = { active: false, downloads: [] }

export const $loadProgress = atom<LoadProgressState>(IDLE)

interface Entry {
  loaded: number
  total: number
}

const entries = new Map<number, { label: string } & Entry>()
let seq = 0

function recompute(): void {
  if (entries.size === 0) {
    $loadProgress.set(IDLE)
    return
  }
  const downloads: DownloadInfo[] = []
  for (const [id, e] of entries) {
    const determinate = e.total > 0
    downloads.push({
      id,
      label: e.label,
      loaded: e.loaded,
      total: e.total,
      percent: determinate ? Math.min(100, (e.loaded / e.total) * 100) : 0,
      determinate,
    })
  }
  $loadProgress.set({ active: true, downloads })
}

export interface DownloadTracker {
  /** Report the latest byte counts. `total` is 0 when the size is unknown. */
  update(loaded: number, total: number): void
  /** Remove this download (success or failure). */
  done(): void
}

/** Register an in-flight download and get handles to report its progress. */
export function trackDownload(label: string): DownloadTracker {
  const id = ++seq
  entries.set(id, { label, loaded: 0, total: 0 })
  recompute()
  return {
    update(loaded, total) {
      const e = entries.get(id)
      if (!e) return
      e.loaded = loaded
      e.total = total
      recompute()
    },
    done() {
      if (entries.delete(id)) recompute()
    },
  }
}

/**
 * Number of open asset-browser popups (Add Part / Add SubPart). The workspace
 * progress bar hides while a popup is open because the popup shows its own
 * overlay variant over the preview pane.
 */
export const $browserPopupCount = atom(0)

export function openBrowserPopup(): void {
  $browserPopupCount.set($browserPopupCount.get() + 1)
}

export function closeBrowserPopup(): void {
  $browserPopupCount.set(Math.max(0, $browserPopupCount.get() - 1))
}
