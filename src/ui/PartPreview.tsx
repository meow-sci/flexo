import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import type { CatalogPart } from '../ksa/partCatalog';
import { $catalogIndex } from '../state/catalogStore';
import { PartPreviewViewport } from '../three/PartPreviewViewport';

/**
 * Mounts a {@link PartPreviewViewport} into a full-size div and drives it from
 * the selected Part. The viewport lives for the component's lifetime; changing
 * `part` swaps the assembled meshes without re-creating the renderer.
 */
export function PartPreview({ part }: { part: CatalogPart | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<PartPreviewViewport | null>(null);
  const index = useStore($catalogIndex);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewport = new PartPreviewViewport(host);
    viewportRef.current = viewport;
    return () => {
      viewport.dispose();
      viewportRef.current = null;
    };
  }, []);

  useEffect(() => {
    void viewportRef.current?.setPart(part, index);
  }, [part, index]);

  return <div ref={hostRef} className="h-full w-full" />;
}
