import { useStore } from '@nanostores/react'
import { $catalogLoading } from '../../../src/state/catalogStore'
import { $partCatalogIndex, $partCatalogLoading } from '../../../src/state/partCatalogStore'
import { DownloadProgress } from './DownloadProgress'
import { PreviewCanvas } from './PreviewCanvas'
import { PART_ID } from './settings'

/** Centered muted message, legible down to a 200×200 iframe. */
function ErrorView({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center text-xs text-fg-muted">
      <div>{message}</div>
      {hint && <div className="text-[10px] text-fg-subtle">{hint}</div>}
    </div>
  )
}

export function App() {
  // Every store read happens unconditionally, before any early return.
  const partCatalogLoading = useStore($partCatalogLoading)
  const catalogLoading = useStore($catalogLoading)
  const partIndex = useStore($partCatalogIndex)

  let content
  if (!PART_ID) {
    content = <ErrorView message='Missing "part_id"' hint="?part_id=<id>&skybox_id=<id>" />
  } else if (partCatalogLoading || catalogLoading) {
    // No 3D context until the catalogs resolve — just the indeterminate bar.
    content = <DownloadProgress catalogLoading />
  } else {
    const part = partIndex.get(PART_ID)
    content = part ? (
      <>
        <PreviewCanvas part={part} />
        <DownloadProgress catalogLoading={false} />
      </>
    ) : (
      <ErrorView message={`Unknown part id "${PART_ID}"`} />
    )
  }

  return <div className="relative h-full w-full bg-canvas">{content}</div>
}
