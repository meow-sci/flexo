/**
 * Workspace MODES (flexo's answer to complexity — foundation §2): one focus at
 * a time, the whole shell adapts. ICRP has three:
 *
 *  - **build**     place & arrange pieces (layers outliner, transform details)
 *  - **colliders** collision volumes (collider outliner + inspector; collider
 *                  wires forced visible and PICKABLE — in build mode they never
 *                  steal clicks from pieces)
 *  - **sites**     launch sites & the world (sites list/editor, site overlays
 *                  forced visible, object metres)
 *
 * `setMode` is the single choreography point (flexo's rule): leaving colliders
 * clears the collider selection so a hidden selection can't hold the gizmo.
 * Mode is view state — never undo-enrolled, never persisted into the doc.
 */
import { atom } from 'nanostores';
import { $colliderSelection } from './docStore';

export type WorkspaceMode = 'build' | 'colliders' | 'sites';

export const MODES: { id: WorkspaceMode; label: string; hint: string }[] = [
  { id: 'build', label: 'Build', hint: 'Place and arrange pieces (1)' },
  { id: 'colliders', label: 'Colliders', hint: 'See, add and edit collision volumes (2)' },
  { id: 'sites', label: 'Sites', hint: 'Launch sites and the exported world (3)' },
];

export const $mode = atom<WorkspaceMode>('build');

export function setMode(mode: WorkspaceMode): void {
  if ($mode.get() === mode) return;
  if ($mode.get() === 'colliders') $colliderSelection.set(null);
  $mode.set(mode);
}
