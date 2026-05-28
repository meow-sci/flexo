import { trackDownload } from '../state/loadProgressStore'

/** Filename (last path segment, query stripped) for a download label. */
function fileLabel(url: string): string {
  const path = url.split('?')[0]
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || url
}

/**
 * Runs a three.js loader's `loadAsync(url, onProgress)` while reporting its byte
 * progress to the global {@link trackDownload} store. Pass a callback that wires
 * the supplied `onProgress` into the loader; the download is registered for the
 * lifetime of the returned promise and removed on settle (success or error).
 */
export async function withProgress<T>(
  url: string,
  run: (onProgress: (event: ProgressEvent) => void) => Promise<T>,
): Promise<T> {
  const tracker = trackDownload(fileLabel(url))
  try {
    return await run((event) => {
      tracker.update(event.loaded, event.lengthComputable ? event.total : 0)
    })
  } finally {
    tracker.done()
  }
}
