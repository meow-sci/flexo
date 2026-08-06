import { $part } from '../../state/editorStore';
import { $mode, setMode } from '../../state/modeStore';
import {
  faceKeysFor,
  pickSurfaceFace,
  pickSurfaceMesh,
  revealSurfaceMesh,
  type SurfaceModePayload,
} from '../../state/surfaceModeStore';

/**
 * **"Edit Surface →"** — the one cross-mode jump into Surface mode (design:
 * design-surface-assets.md §1.2; foundation §2.5 "a jump, not a stack").
 *
 * Its own tiny module for the same reason `subPartDataJump.ts` is: the Build inspector, the
 * Outliner row menu, the palette provider and (in a later task) the Asset Manager all take
 * this route, and a second spelling of the payload would let them drift. The payload seeds
 * the mesh AND its first face, so the viewport highlight is meaningful the instant the mode
 * opens rather than after one more click.
 *
 * Undo enrollment: NONE — a mode switch is never an undo step.
 */
export function openMeshSurface(meshId: string): void {
  const mesh = $part.get().customMeshes.find((m) => m.id === meshId);
  const surfaceFace = mesh ? (faceKeysFor(mesh)[0] ?? null) : null;
  // Already in Surface: `setMode` is a documented no-op on the current mode, so the pick has
  // to be applied directly (and the picker revealed, since the row may be scrolled away).
  if ($mode.get() === 'surface') {
    pickSurfaceMesh(meshId);
    pickSurfaceFace(surfaceFace);
    revealSurfaceMesh(meshId);
    return;
  }
  const payload: SurfaceModePayload = { surfaceMeshId: meshId, surfaceFace };
  setMode('surface', payload);
}
