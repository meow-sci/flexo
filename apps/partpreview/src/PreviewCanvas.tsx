import { useEffect, useRef } from 'react'
import { useStore } from '@nanostores/react'
import type { CatalogPart } from '../../../src/ksa/partCatalog'
import { $catalogIndex } from '../../../src/state/catalogStore'
import { PartPreviewViewport } from '../../../src/three/PartPreviewViewport'
import { $connectors, $previewLighting } from './settings'
import { ZoomControls } from './ZoomControls'

/**
 * Connector cube size in meters. Mirrors the `$connectorSettings` default and is
 * passed explicitly so the user's persisted editor value can never leak into a
 * wiki render (this app never reads that persistent store — see ./settings.ts).
 */
const DEFAULT_CONNECTOR_SIZE = 0.125

/** The 3D preview itself: one `PartPreviewViewport` plus its floating zoom buttons. */
export function PreviewCanvas({ part }: { part: CatalogPart }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<PartPreviewViewport | null>(null)
  const index = useStore($catalogIndex)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const viewport = new PartPreviewViewport(host, {
      lighting: $previewLighting,
      showConnectors: $connectors.get(),
      connectorSize: DEFAULT_CONNECTOR_SIZE,
      fillFraction: 0.9,
      reframeOnResize: true,
    })
    viewportRef.current = viewport
    // Fires immediately with the current value — idempotent with the option above.
    const unsubscribe = $connectors.subscribe((show) => viewport.setShowConnectors(show))
    return () => {
      unsubscribe()
      viewport.dispose()
      viewportRef.current = null
    }
  }, [])

  useEffect(() => {
    void viewportRef.current?.setPart(part, index)
  }, [part, index])

  return (
    // Must stay `relative`: the overlays anchor to it.
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      <ZoomControls onZoom={(factor) => viewportRef.current?.zoomBy(factor)} />
    </div>
  )
}
