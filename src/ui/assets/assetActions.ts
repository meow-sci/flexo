import {
  planImportRemoval,
  removeCustomMaterial,
  removeCustomMesh,
  removeCustomTexture,
  removeImport,
  removeUnusedAssets,
  type AssetUsage,
} from '../../state/customAssetStore';
import { status, undoStatusAction } from '../../state/statusStore';
import type { CustomMaterial, CustomMesh, CustomTexture, EditingPart } from '../../ksa/types';
import type { ImportBatch } from './assetGroups';
import { plural, removalSummary, unusedAssets } from './assetGroups';
import type { ManagerNav } from './managerNav';
import {
  BYTE_DELETE_WARNING,
  CONFIRM_FREE_PLACEMENTS,
  IMPORT_REMOVAL_APPENDIX,
} from './bytePolicy';

/**
 * **The §5.1 confirm matrix, in one module** (design: design-surface-assets.md §5.1/§5.2;
 * foundation §14.3). Card ⋮ menus and detail views both call these, so a deletion cannot mean
 * two different things depending on where it was started from.
 *
 * Every count comes from {@link AssetUsage} — the selector the GC itself walks — never from
 * an ad-hoc recount (census pain #12).
 *
 * Two shapes of "ask":
 * - **tier 3** (bytes die): {@link ManagerNav.confirm} pushes a confirm VIEW carrying the
 *   full inventory and the {@link BYTE_DELETE_WARNING} paragraph. Never a stacked dialog.
 * - **undoable** (descriptor only): an INLINE strip on the row/detail, raised through the
 *   caller's `askInline` — or, under the ≤5 threshold, no question at all plus a status flash
 *   offering `[Undo]`. The `request*` pair returns `true` when it took that second route, so a
 *   detail view showing the now-deleted asset knows to fall back to the list.
 *
 * Undo enrollment: none of its own. Each store mutator pushes its own discrete step; this
 * module adds confirm chrome and wording only.
 */

/** Delete texture — ALWAYS confirms: the source + `.ktx2` blobs die immediately. */
export function requestDeleteTexture(
  nav: ManagerNav,
  texture: CustomTexture,
  usage: AssetUsage,
): void {
  const use = usage.texture.get(texture.id);
  const faces = use?.faces.length ?? 0;
  const materials = use?.materials.length ?? 0;
  nav.confirm({
    title: `Delete texture “${texture.name}”`,
    body:
      faces + materials === 0
        ? 'Nothing uses this texture.'
        : `Used by ${plural(faces, 'face')} and ${plural(materials, 'material slot')} — they become untextured.`,
    warning: BYTE_DELETE_WARNING,
    confirmLabel: 'Delete texture',
    onConfirm: () => removeCustomTexture(texture.id),
  });
}

/**
 * Delete material — descriptor-only, so it follows the undoable ladder: >0 uses asks with an
 * inline strip stating the count, 0 uses just does it and offers `[Undo]`.
 */
export function requestDeleteMaterial(
  material: CustomMaterial,
  usage: AssetUsage,
  askInline: () => void,
): boolean {
  if ((usage.material.get(material.id)?.meshes.length ?? 0) > 0) {
    askInline();
    return false;
  }
  deleteMaterialNow(material);
  return true;
}

/** The inline strip's label for a material still worn by meshes (v1 wording kept). */
export function deleteMaterialLabel(material: CustomMaterial, usage: AssetUsage): string {
  const meshes = usage.material.get(material.id)?.meshes.length ?? 0;
  const verb = meshes === 1 ? 'reverts' : 'revert';
  return `Delete “${material.name}”? ${plural(meshes, 'mesh', 'meshes')} ${verb} to the neutral look.`;
}

export function deleteMaterialNow(material: CustomMaterial): void {
  void removeCustomMaterial(material.id);
  status(`Deleted material “${material.name}”`, { action: undoStatusAction() });
}

/**
 * Delete mesh — the template AND its placements. ≤5 placements is a small, fully undoable
 * delete (no confirm + `[Undo]` flash); more than that states the counts first.
 */
export function requestDeleteMesh(
  mesh: CustomMesh,
  usage: AssetUsage,
  askInline: () => void,
): boolean {
  if ((usage.mesh.get(mesh.id)?.placements ?? 0) > CONFIRM_FREE_PLACEMENTS) {
    askInline();
    return false;
  }
  deleteMeshNow(mesh, usage);
  return true;
}

/** `Delete "Hull Box"? Deletes the mesh and its 8 placements.` (design §2.2 wording). */
export function deleteMeshLabel(mesh: CustomMesh, usage: AssetUsage): string {
  const placements = usage.mesh.get(mesh.id)?.placements ?? 0;
  return `Delete “${mesh.name}”? Deletes the mesh and its ${plural(placements, 'placement')}.`;
}

export function deleteMeshNow(mesh: CustomMesh, usage: AssetUsage): void {
  const placements = usage.mesh.get(mesh.id)?.placements ?? 0;
  void removeCustomMesh(mesh.id);
  status(
    placements > 0
      ? `Deleted “${mesh.name}” and ${plural(placements, 'placement')}`
      : `Deleted “${mesh.name}”`,
    { action: undoStatusAction() },
  );
}

/**
 * Remove import — ALWAYS confirms with the FULL `planImportRemoval` inventory (SubParts,
 * placements, orphaned materials/textures, the batch layer) plus the byte warning and its
 * import appendix: a batch GLB is the only copy of that geometry.
 */
export function requestRemoveImport(nav: ManagerNav, part: EditingPart, batch: ImportBatch): void {
  const plan = planImportRemoval(part, batch.importId);
  nav.confirm({
    title: `Remove import “${batch.sourceFile}”`,
    body: `${removalSummary({
      meshes: plan.meshIds.length,
      placements: plan.placements,
      materials: plan.materialIds.length,
      textures: plan.textureIds.length,
    })} will be removed. Materials and textures still used by another mesh are kept.`,
    items: batch.meshes.map((m) => m.name),
    warning: `${BYTE_DELETE_WARNING} ${IMPORT_REMOVAL_APPENDIX}`,
    confirmLabel: 'Remove import',
    onConfirm: () => void removeImport(batch.importId),
  });
}

/**
 * Delete all unused — tier 3, every item named. One `removeUnusedAssets` call so the whole
 * sweep is ONE undo step for the descriptors (the blobs go immediately, as always).
 */
export function requestDeleteAllUnused(
  nav: ManagerNav,
  part: EditingPart,
  usage: AssetUsage,
): void {
  const { textures, materials } = unusedAssets(part, usage);
  const ids = [...textures.map((t) => t.id), ...materials.map((m) => m.id)];
  if (ids.length === 0) return;
  nav.confirm({
    title: `Delete ${plural(ids.length, 'unused asset')}`,
    body: 'These are referenced by no face, no material channel and no mesh.',
    items: [
      ...textures.map((t) => `${t.name} (texture)`),
      ...materials.map((m) => `${m.name} (material)`),
    ],
    warning: BYTE_DELETE_WARNING,
    confirmLabel: 'Delete all unused',
    onConfirm: () => removeUnusedAssets(ids),
  });
}
