import { useStore } from '@nanostores/react';
import { Tooltip } from '../kit';
import { StatusChipButton, StatusDivider } from './StatusChip';
import { $mode } from '../../state/modeStore';
import { $surfaceFace, $surfaceMeshId, revealSurfaceMesh } from '../../state/surfaceModeStore';
import { $part } from '../../state/editorStore';
import { FACE_LABELS } from '../../three/primitives';

/**
 * The status bar's **Surface segment** — `mesh: Hull Box · face +X` (design:
 * design-surface-assets.md §1.5 "Status bar segments").
 *
 * Mounted only while `$mode === 'surface'`, like the Data and Engine segments. Clicking it
 * scrolls the picker to the mesh and flashes its row, which is the answer to "which of these
 * am I editing?" when the sidebar is scrolled down into the Glow section.
 *
 * **Undo enrollment: NONE.** Reading and navigating only.
 */
export function SurfaceSegment() {
  const mode = useStore($mode);
  const meshId = useStore($surfaceMeshId);
  const faceKey = useStore($surfaceFace);
  const part = useStore($part);

  if (mode !== 'surface') return null;
  const mesh = meshId ? part.customMeshes.find((m) => m.id === meshId) : undefined;

  return (
    <>
      <StatusDivider />
      <Tooltip content={mesh ? 'Scroll the picker to this mesh' : 'Pick a mesh in the sidebar'}>
        <StatusChipButton
          aria-label={mesh ? `Editing surface of ${mesh.name}` : 'No mesh picked'}
          onPress={() => revealSurfaceMesh(meshId)}
        >
          <span className="text-fg-subtle">mesh:</span>
          <span className="max-w-[18ch] truncate text-fg">{mesh?.name ?? '—'}</span>
          {mesh && faceKey && (
            <>
              <span className="text-fg-subtle">· face</span>
              <span className="text-fg">{FACE_LABELS[faceKey] ?? faceKey}</span>
            </>
          )}
        </StatusChipButton>
      </Tooltip>
    </>
  );
}
