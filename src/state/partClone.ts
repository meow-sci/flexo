/**
 * Cloning ONE part document with FRESH custom-asset identity — the primitive behind
 * `duplicatePart` (P2.05) and import-as-new-parts (P2.06). See
 * `plans/MULTI_PART_PLAN.md` §P2.04.
 *
 * **Why (invariant I4, §0.5).** Custom-asset blob keys are `pa:<projectId>:<kind>:<assetId>`
 * ({@link assetKeys}) with NO part segment, and KSA registers `<SubPart>` ids and GLB mesh
 * names GLOBALLY per mod (§0.3), so `CustomTexture.id`, `CustomMaterial.id`,
 * `CustomMesh.id`, `ImportedMeshSource.importId` and a custom mesh's `subPartId` must be
 * unique across ALL parts of a project. A plain `structuredClone` would alias every blob
 * (deleting one part's assets blanks its twin's binaries) and collide SubPart ids at export.
 * So the clone re-mints exactly five id families, rewrites every reference to them, and
 * copies the binaries under the new keys.
 *
 * Deliberately NOT re-minted, because entity ids are PER-PART namespaces (invariant I3 —
 * two parts may both contain `_light1`): placement instance ids, connector / collider /
 * light / IVA-seat / kitten / layer ids, animation + keyframe ids, tank and container ids,
 * `partId` (the caller's concern) and `customReactions[].id` (identical clones dedupe at
 * export; divergent edits surface as a preflight blocker).
 */

import type { CustomMaterial, CustomMesh, EditingPart } from '../ksa/types';
import { assetKeys, getAsset, putAsset } from './assetDb';
import { randomId } from './ids';
import type { ProjectId } from './projectDb';

/**
 * Local copies of `customAssetStore`'s generators, following the precedent in
 * `projectArchive.ts` and `importNormalize.ts`. Importing them would make
 * `partsStore -> partClone -> customAssetStore -> partsStore` a real cycle, and the one-way
 * rule is exactly why `customAssetStore` injects its blob sweep through a registration slot.
 * `randomId` rather than `crypto.randomUUID` — the latter is undefined outside a secure
 * context (see ids.ts), which a phone on a plain-HTTP LAN URL hits.
 */
function shortId(): string {
  return randomId().replace(/-/g, '').slice(0, 8);
}

/** Asset-id-safe token, matching `customAssetStore.sanitizeIdent`. */
function sanitizeIdent(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Asset';
}

/**
 * Deep-copies `source` and gives every custom asset in it a brand-new identity, copying the
 * binaries that back it into `projectId`'s blob namespace under the new keys.
 *
 * `hydrateCustomAssets()` is deliberately NOT called here: the caller registers the returned
 * document as a part first, then hydrates once (P2.05 step 6).
 */
export async function clonePartWithFreshAssets(
  source: EditingPart,
  projectId: ProjectId,
): Promise<EditingPart> {
  const part = structuredClone(source);

  // ── the five remaps, built BEFORE anything is rewritten ────────────────────
  const textureIds = new Map<string, string>();
  for (const texture of part.customTextures) textureIds.set(texture.id, `tex_${shortId()}`);

  const materialIds = new Map<string, string>();
  for (const material of part.customMaterials) materialIds.set(material.id, `mat_${shortId()}`);

  const meshIds = new Map<string, string>();
  const templateIds = new Map<string, string>();
  const importIds = new Map<string, string>();
  /** OLD mesh ids whose glow is a painted bitmap — the only meshes with a blob to copy. */
  const paintedMeshIds: string[] = [];
  for (const mesh of part.customMeshes) {
    meshIds.set(mesh.id, `mesh_${shortId()}`);
    templateIds.set(mesh.subPartId, freshTemplateId(mesh));
    // ONE fresh batch id per import file, shared by every mesh cut from it, so the single
    // copy of that geometry GLB stays a single copy.
    if (mesh.imported && !importIds.has(mesh.imported.importId)) {
      importIds.set(mesh.imported.importId, `imp_${shortId()}`);
    }
    if (mesh.emissive?.shape === 'painted') paintedMeshIds.push(mesh.id);
  }

  // ── one walk over every reference site ─────────────────────────────────────
  for (const texture of part.customTextures) texture.id = remap(textureIds, texture.id);

  for (const material of part.customMaterials) {
    material.id = remap(materialIds, material.id);
    remapMaterialTextures(material, textureIds);
  }

  for (const mesh of part.customMeshes) {
    mesh.id = remap(meshIds, mesh.id);
    mesh.subPartId = remap(templateIds, mesh.subPartId);
    if (mesh.materialId) mesh.materialId = remap(materialIds, mesh.materialId);
    for (const face of Object.values(mesh.faceTextures)) {
      if (face) face.textureId = remap(textureIds, face.textureId);
    }
    if (mesh.imported) {
      mesh.imported.importId = remap(importIds, mesh.imported.importId);
      // `imported.meshName` is deliberately LEFT ALONE. It names the geometry INSIDE the
      // copied GLB, which is a byte copy of the original and still spells the original name.
      // `types.ts` documents `meshName == subPartId`; that equality holds only for an
      // original import, and a clone breaks it ON PURPOSE — rewriting it here would make
      // every cloned imported mesh resolve to no geometry at all.
    }
  }

  for (const placement of part.placements) {
    placement.subPartTemplateId = remap(templateIds, placement.subPartTemplateId);
  }
  for (const data of part.subPartGameData) {
    data.subPartTemplateId = remap(templateIds, data.subPartTemplateId);
  }
  for (const collider of part.colliders) {
    if (collider.ownerTemplateId) {
      collider.ownerTemplateId = remap(templateIds, collider.ownerTemplateId);
    }
  }
  for (const light of part.lights) {
    if (light.ownerTemplateId) light.ownerTemplateId = remap(templateIds, light.ownerTemplateId);
  }
  part.internalFlags = Object.fromEntries(
    Object.entries(part.internalFlags).map(([templateId, internal]) => [
      remap(templateIds, templateId),
      internal,
    ]),
  );
  // `ConsumerFeedWiring.consumerId` and `SubPartIdRef.id` are NOT template ids — they name
  // engine MODULES ("ThrustChamber"-class, types.ts:696/:870-876) — and their
  // `subPartInstanceId` companions are placement instance ids, which stay put under I3.

  // ── the binaries ───────────────────────────────────────────────────────────
  // The `mesh-glb` tier is deliberately NOT copied: no primitive GLB is ever stored, so the
  // tier is reserved-but-unwritten (see `projectTransfer.ts`'s `meshBacking` note).
  for (const [oldId, newId] of textureIds) {
    await copyBlob(
      assetKeys.textureSource(projectId, oldId),
      assetKeys.textureSource(projectId, newId),
    );
    await copyBlob(
      assetKeys.textureKtx2(projectId, oldId),
      assetKeys.textureKtx2(projectId, newId),
    );
  }
  for (const [oldId, newId] of importIds) {
    await copyBlob(assetKeys.importGlb(projectId, oldId), assetKeys.importGlb(projectId, newId));
  }
  for (const oldId of paintedMeshIds) {
    const newId = remap(meshIds, oldId);
    await copyBlob(
      assetKeys.emissivePaint(projectId, oldId),
      assetKeys.emissivePaint(projectId, newId),
    );
  }

  return part;
}

/**
 * The new id for `old`, or `old` itself when it belongs to no remapped family — which is the
 * CORRECT answer for a reference into content this clone does not own: a placement on a
 * built-in catalog template, a `<SubPartGameData>` or collider owned by a Core SubPart.
 */
function remap(map: ReadonlyMap<string, string>, old: string): string {
  return map.get(old) ?? old;
}

/**
 * A fresh SubPart template id, minted by the SAME generators the authoring paths use so a
 * clone's ids are indistinguishable from freshly authored ones: kitten submeshes name their
 * source (`customAssetStore.makeKittenMeshPart`), while primitives (`addCustomMesh`) and
 * imports (`importNormalize.normalizeImport`) both mint `flexo_<sanitized name>_<shortId>`.
 * The `flexo_` prefix is mandatory — KSA registers mesh names globally, so an un-prefixed
 * name can collide with Core content.
 */
function freshTemplateId(mesh: CustomMesh): string {
  if (mesh.kitten) return `flexo_${mesh.kitten.kind}_${mesh.kitten.specKey}_${shortId()}`;
  return `flexo_${sanitizeIdent(mesh.name)}_${shortId()}`;
}

/**
 * Rewrites all six {@link CustomMaterial} texture slots. SIBLINGS: `materialTextureIds`
 * (`ksa/types.ts`, usage counts + the asset GC) and `materialTextureSlots`
 * (`customAssetStore.ts`, `$assetUsage`) enumerate the same six — a new channel must be added
 * to ALL THREE or a cloned material silently keeps pointing at the original part's texture.
 */
function remapMaterialTextures(
  material: CustomMaterial,
  textureIds: ReadonlyMap<string, string>,
): void {
  if (material.baseColor.kind === 'map') {
    material.baseColor.textureId = remap(textureIds, material.baseColor.textureId);
  }
  if (material.metalness.kind === 'map') {
    material.metalness.textureId = remap(textureIds, material.metalness.textureId);
  }
  if (material.roughness.kind === 'map') {
    material.roughness.textureId = remap(textureIds, material.roughness.textureId);
  }
  if (material.occlusion) {
    material.occlusion.textureId = remap(textureIds, material.occlusion.textureId);
  }
  if (material.ormPacked) {
    material.ormPacked.textureId = remap(textureIds, material.ormPacked.textureId);
  }
  if (material.normal) material.normal.textureId = remap(textureIds, material.normal.textureId);
}

/**
 * Copies one stored binary to a new key. An absent source is NOT an error and is skipped
 * silently — the same tolerance the archive's blob copy has (`copyAdoptedBlobs`): a tier
 * that was never written (an unpainted mesh's glow bitmap, a `.ktx2` still being encoded)
 * regenerates on demand.
 */
async function copyBlob(from: string, to: string): Promise<void> {
  const blob = await getAsset(from);
  if (blob) await putAsset(to, blob);
}
