import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { $catalogIndex } from '../state/catalogStore';
import { SubPartPreviewViewport } from '../three/SubPartPreviewViewport';

/**
 * Mounts a {@link SubPartPreviewViewport} into a full-size div and drives it from
 * the selected SubPart id. The viewport lives for the component's lifetime;
 * changing `subPartId` swaps the rendered mesh without re-creating the renderer.
 */
export function SubPartPreview({ subPartId }: { subPartId: string | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<SubPartPreviewViewport | null>(null);
  const index = useStore($catalogIndex);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewport = new SubPartPreviewViewport(host);
    viewportRef.current = viewport;
    return () => {
      viewport.dispose();
      viewportRef.current = null;
    };
  }, []);

  useEffect(() => {
    const entry = subPartId ? (index.get(subPartId) ?? null) : null;
    void viewportRef.current?.setSubPart(entry);
  }, [subPartId, index]);

  return <div ref={hostRef} className="h-full w-full" />;
}
