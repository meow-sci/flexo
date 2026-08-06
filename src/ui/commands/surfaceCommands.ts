import type { Command } from '../../state/commandStore';
import { openDialog } from '../../state/dialogStore';
import { $part } from '../../state/editorStore';
import { $surfaceMeshId } from '../../state/surfaceModeStore';
import { openMeshSurface } from '../surface/surfaceJump';

/**
 * Surface-mode commands (design: design-surface-assets.md §1.7).
 *
 * **Palette-only, deliberately** — the discoverable route into the mode is the mode switcher,
 * `5` and `mode.surface`; these are the *pick* shortcuts on top of it, exactly as
 * `dataCommands.ts` is for Data scopes.
 *
 * **DEVIATION (logged).** The design's §1.7 list also names `assets.uploadTexture`,
 * `assets.newMaterial`, `assets.newPrimitiveMesh`, `assets.importModel` and
 * `assets.makeKittenMesh.<kind>`. Those five behaviours are ALREADY registered commands —
 * `add.uploadTexture`, `add.newMaterial`, `add.primitiveMesh`, `add.importModel`,
 * `add.kittenMesh:<kind>` (foundation §3's Add tree, landed in P2) — and every Surface
 * surface runs them by those ids. Registering `assets.*` twins would not throw (different
 * ids) but would put two identical rows in the ⌘K palette for each, which is the same
 * mistake the plan forbids for `assets.openManager` vs `window.assetManager`. One id per
 * behaviour, per Law 4.
 *
 * **Undo enrollment: NONE** — a mode switch and a mesh pick are ephemeral view state.
 */
export const SURFACE_COMMANDS: Command[] = [
  {
    id: 'surface.editGlowPaint',
    title: 'Edit glow paint…',
    keywords: 'glow paint emissive canvas brush bitmap',
    // Only meaningful for a picked mesh whose glow is the PAINTED shape — the dialog edits
    // that bitmap and nothing else.
    enabled: () => {
      const meshId = $surfaceMeshId.get();
      if (!meshId) return false;
      const mesh = $part.get().customMeshes.find((m) => m.id === meshId);
      return mesh?.emissive?.shape === 'painted';
    },
    disabledReason: 'Pick a mesh whose Glow mode is "Painted spots"',
    run: () => {
      const meshId = $surfaceMeshId.get();
      if (meshId) openDialog({ id: 'glow-paint', params: { meshId } });
    },
  },
];

/**
 * Dynamic provider: "Edit surface: Hull Box" per custom mesh — kitten submeshes included
 * (D6). Re-evaluated on every palette keystroke, so it always describes the live document.
 * Running one is the same jump the Build inspector's "Edit Surface →" makes.
 */
export function surfacePickCommands(): Command[] {
  return $part.get().customMeshes.map((mesh) => ({
    id: `surface.pickMesh:${mesh.id}`,
    title: `Edit surface: ${mesh.name}`,
    keywords: `surface material glow uv texture ${mesh.subPartId}`,
    run: () => openMeshSurface(mesh.id),
  }));
}
