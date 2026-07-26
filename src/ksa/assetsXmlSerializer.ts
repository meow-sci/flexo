import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom'
import type { Document as XmlDocument, Element as XmlElement } from '@xmldom/xmldom'
import {
  buildColliderElement,
  INHERITED_COLLIDER_COMPONENT_ID,
  prettyXml,
} from './partXmlSerializer'
import { VIEW_MESH_SUFFIX } from './exportGlb'
import type { PartCollider } from './types'

/**
 * Serializes the custom-asset "Assets" XML — the file that DEFINES user-created
 * SubParts, mirroring KSA Core's CoreXxxAAssets.xml: a default <MeshAtlas> (the
 * generated geometry GLB), the <PbrMaterial> list (each referencing its .ktx2
 * channels by relative Path), and one <SubPart> per custom mesh wiring a
 * <PartModel> to its <Mesh> node and <Material>.
 *
 * Materials are first-class and SHARED: multiple SubParts may reference one
 * <PbrMaterial Id> — exactly Core's pattern (one pack material serves every
 * SubPart in the pack). buildCustomBundle (modExport) dedupes identical resolved
 * channel sets into one entry.
 *
 * Only custom SubParts actually placed in the Part are emitted — built-in/Core
 * SubParts are owned by KSA Core and must NOT be re-declared here. The Part.xml
 * (serializePart) references these via <SubPart InstanceOf="subPartId">.
 *
 * Paths are relative to the mod folder (e.g. "Meshes/Foo.glb", "Textures/Bar.ktx2"),
 * matching how Core references its own binaries.
 */

/**
 * One <PbrMaterial> to declare. Diffuse + Normal + AoRoughMetal are REQUIRED:
 * KSA dereferences all three with no null check — both the thumbnail renderer
 * (ThumbnailRenderResources.AddDraw) and every placed part
 * (PartModel.WriteInstancesToGpu) — so a partial material crashes the game.
 * buildCustomBundle resolves uniform channels into 1×1 solid textures.
 */
export interface AssetsMaterialPlan {
  /** <PbrMaterial Id>. MUST be project-unique and never a Core id — KSA dedupes
   * materials by id (a duplicate silently becomes a reference to the first). */
  id: string
  /** Diffuse .ktx2 path (mod-relative, or absolute for a referenced kitten asset). */
  diffusePath: string
  /** Tangent-space normal .ktx2 path (the shared FlatNormal solid when unauthored). */
  normalPath: string
  /** Packed AO/Rough/Metal .ktx2 path (a solid texel for uniform channels). */
  aoRoughMetalPath: string
  /**
   * Emissive (glow) mask .ktx2 path. `undefined` → no <Emissive>. KSA samples it as a
   * grayscale mask (R) and ADDS it as white light × 1.25 after lighting; the glow COLOR
   * lives in the (composited) diffuse. Glass materials never carry one (KSA's glass
   * shader ignores emissive).
   */
  emissivePath?: string
}

export interface AssetsSubPartPlan {
  /** SubPart template id (== GLB node Mesh Id == placement.subPartTemplateId). */
  subPartId: string
  /**
   * Id of an {@link AssetsPlan.materials} entry. REQUIRED — KSA has no untextured `<PartModel>`:
   * `ThumbnailRenderResources.AddDraw` derefs `Material.DiffuseReference`/`NormalReference`/
   * `PBRMap` with no null guard, so a `<PartModel>` without `<Material>` NREs at startup before
   * the main menu, and zero shipped Core PartModels omit it. A mesh that resolves no texture or
   * material gets the shared neutral material instead (see modExport).
   */
  materialId: string
  /**
   * Render through KSA's translucent glass path: emits `<PartModelGlass>` instead of
   * `<PartModel>` (an alpha-blended shader), for glass surfaces like the kitten visor.
   * The opaque `<PartModel>` path renders glass black/opaque.
   */
  glass?: boolean
  /**
   * Emit `<Internal>true</Internal>` — interior-only geometry, which KSA renders in IVA camera
   * mode and nowhere else (`PartModel.cs:387`). Resolved by modExport's `resolveInternal`.
   * IGNORED (and never set) for a {@link glass} SubPart: `<PartModelGlass>` has no `<Internal>`
   * field at all — the only `[XmlElement("Internal")]` in the decomp is `PartModelModule.cs:35`.
   */
  internal?: boolean
}

/**
 * A "reference" SubPart: a project-unique SubPart that REUSES an existing (built-in)
 * Mesh + Material by id rather than declaring its own geometry/texture. Used for export
 * variants (see buildExportVariantMap in modExport.ts): re-declaring a built-in template under a
 * fresh id so flexo can change something about it — an overridden `<Internal>` (interior-only)
 * flag, or SubPart GameData that would otherwise redefine the shared built-in template. Unlike
 * {@link AssetsSubPartPlan} it emits NO <PbrMaterial> (the material is built-in) and needs no
 * MeshAtlas; it DOES emit a <MeshView> pointing at the reused render mesh for editor picking.
 */
export interface ReferenceSubPartPlan {
  /** New project-unique SubPart id (also the basis for its unique PartModel id). */
  subPartId: string
  /** Built-in <Mesh Id> to reference (NOT redeclared in this file). */
  meshId: string
  /** Built-in `<Material Id>` to reference. REQUIRED for the same reason as {@link AssetsSubPartPlan.materialId}. */
  materialId: string
  /**
   * Collision primitives the shadowed built-in `<SubPart>` declared. A variant inherits
   * NOTHING but the Mesh/Material it explicitly references, so these must be re-declared
   * here or the variant loses the built-in collision volume.
   */
  colliders?: PartCollider[]
  /**
   * Emit `<Internal>true</Internal>` — interior-only, rendered in IVA camera mode and nowhere
   * else (`PartModel.cs:387`). `false` emits nothing (KSA's default). The variant inherits
   * nothing from the built-in, so this is the ONLY thing that carries the flag either way: a
   * built-in Internal prop the user wants outside IVA becomes a variant with `false`, and a
   * variant of an Internal prop that exists for some other reason must keep `true`.
   */
  internal: boolean
  /**
   * The built-in's raw `<RayTracing>` token (`Disabled`/`Enabled`/`ShadowProxy`), copied forward
   * verbatim; null when the built-in authors none. Same inheritance rule as {@link internal} —
   * dropping it silently turns a `ShadowProxy` occluder into a VISIBLE mesh.
   */
  rayTracing: string | null
  /**
   * The built-in's `<ShadowCaster>` bool, copied forward; null when the built-in authors none
   * (KSA's default is `true`). Same inheritance rule as {@link rayTracing} — dropping Core's
   * explicit `false` (the medium-capsule windows) makes the variant start casting shadows.
   */
  shadowCaster: boolean | null
}

export interface AssetsPlan {
  /**
   * Relative path to the geometry mesh-atlas GLB, e.g. "Meshes/MyMod_MeshAtlas.glb".
   * Omit when this Assets file declares only {@link referenceSubParts} (no custom geometry).
   */
  meshAtlasPath?: string
  /** The <PbrMaterial> list (deduped; shared across SubParts like Core's pack materials). */
  materials?: AssetsMaterialPlan[]
  subParts: AssetsSubPartPlan[]
  /** Reference-only SubParts that reuse built-in Mesh/Material (the export variants). */
  referenceSubParts?: ReferenceSubPartPlan[]
}

/** `<Internal>true</Internal>` — legal ONLY inside a `<PartModel>` (never `<PartModelGlass>`). */
function internalElement(doc: XmlDocument): XmlElement {
  const el = doc.createElement('Internal')
  el.appendChild(doc.createTextNode('true'))
  return el
}

export function serializeAssets(plan: AssetsPlan): string {
  const doc = new DOMImplementation().createDocument(null, 'Assets', null)
  const assets = doc.documentElement!

  // Reference-only SubParts (export variants) reuse built-in geometry, so a file with
  // only those needs no MeshAtlas. Emit it only when custom geometry is declared.
  if (plan.meshAtlasPath) {
    const atlas = doc.createElement('MeshAtlas')
    atlas.setAttribute('Path', plan.meshAtlasPath)
    assets.appendChild(atlas)
  }

  // Materials first (Core lists PbrMaterials above the SubParts that use them).
  // Channel order mirrors Core: Diffuse, Normal, AoRoughMetal, then Emissive.
  for (const m of plan.materials ?? []) {
    const mat = doc.createElement('PbrMaterial')
    mat.setAttribute('Id', m.id)
    const channels: Array<[string, string | undefined]> = [
      ['Diffuse', m.diffusePath],
      ['Normal', m.normalPath],
      ['AoRoughMetal', m.aoRoughMetalPath],
      ['Emissive', m.emissivePath],
    ]
    for (const [name, path] of channels) {
      if (!path) continue
      const el = doc.createElement(name)
      el.setAttribute('Path', path)
      el.setAttribute('Category', 'Vessel')
      mat.appendChild(el)
    }
    assets.appendChild(mat)
  }

  for (const sp of plan.subParts) {
    const sub = doc.createElement('SubPart')
    sub.setAttribute('Id', sp.subPartId)
    // Glass surfaces (the kitten visor) render through KSA's translucent <PartModelGlass>
    // path; everything else uses the opaque <PartModel>. Both take the same Id/Mesh/Material.
    const model = doc.createElement(sp.glass ? 'PartModelGlass' : 'PartModel')
    // The PartModel Id MUST be unique per SubPart. KSA's PartModel.Get dedupes
    // PartModels by Template.Id (PartModel.cs) — an empty/missing Id collapses every
    // SubPart onto the first one's mesh+material, so a multi-SubPart part renders only
    // its first piece (stacked) in-game. Core always uses "<subPartId>_Model".
    model.setAttribute('Id', `${sp.subPartId}_Model`)
    // Interior-only geometry: rendered in IVA camera mode and nowhere else. Core writes it
    // first inside the <PartModel>; never emitted on the glass path (the field doesn't exist
    // there), which is why the plan's `internal` is already false for a glass SubPart.
    if (sp.internal && !sp.glass) model.appendChild(internalElement(doc))
    const mesh = doc.createElement('Mesh')
    mesh.setAttribute('Id', sp.subPartId)
    model.appendChild(mesh)
    // Unconditional: a <PartModel> without <Material> crashes KSA at startup (see the field doc).
    const material = doc.createElement('Material')
    material.setAttribute('Id', sp.materialId)
    model.appendChild(material)
    sub.appendChild(model)
    // View mesh wires the SubPart to its picking geometry. KSA's vehicle editor
    // only raycasts SubParts that carry a MeshViewModule (built from <MeshView>);
    // without it the placed part renders but can't be hovered/selected/right-clicked.
    // The "<id>_VM" mesh is emitted into the atlas by buildMeshAtlasGlb.
    const meshView = doc.createElement('MeshView')
    const viewMesh = doc.createElement('Mesh')
    viewMesh.setAttribute('Id', sp.subPartId + VIEW_MESH_SUFFIX)
    meshView.appendChild(viewMesh)
    sub.appendChild(meshView)
    assets.appendChild(sub)
  }

  // Reference SubParts: a fresh SubPart + a fresh PartModel pointing at a built-in Mesh
  // (and Material). No <PbrMaterial> (the material is built-in).
  //
  // The PartModel Id MUST be unique — KSA dedupes PartModels by Template.Id, so reusing the
  // built-in "<orig>_Model" id would collapse the variant back onto the original and every
  // <PartModel> property below (the built-in's own <Internal>, its <RayTracing>) would come
  // back with it, silently undoing the redeclaration. Unchanged and still load-bearing.
  //
  // A variant inherits NOTHING but the Mesh/Material it names, so <Internal>/<RayTracing>/
  // <ShadowCaster> are authored here explicitly and travel in BOTH directions: dropping
  // <Internal> makes a built-in interior prop render outside IVA, keeping it makes a
  // GameData-carrying variant stay interior.
  // Element order mirrors Core (Internal, Mesh, Material, RayTracing, ShadowCaster) — Core
  // authors Internal/Mesh/Material/RayTracing in CoreIVASpaceAAssets.xml and
  // Mesh/Material/ShadowCaster in CoreCommandAAssets.xml, and this order satisfies both.
  for (const sp of plan.referenceSubParts ?? []) {
    const sub = doc.createElement('SubPart')
    sub.setAttribute('Id', sp.subPartId)
    const model = doc.createElement('PartModel')
    model.setAttribute('Id', `${sp.subPartId}_Model`)
    if (sp.internal) model.appendChild(internalElement(doc))
    const mesh = doc.createElement('Mesh')
    mesh.setAttribute('Id', sp.meshId)
    model.appendChild(mesh)
    // Unconditional, same as the custom-SubPart path above.
    const material = doc.createElement('Material')
    material.setAttribute('Id', sp.materialId)
    model.appendChild(material)
    if (sp.rayTracing) {
      const rt = doc.createElement('RayTracing')
      rt.appendChild(doc.createTextNode(sp.rayTracing))
      model.appendChild(rt)
    }
    if (sp.shadowCaster !== null) {
      const sc = doc.createElement('ShadowCaster')
      sc.appendChild(doc.createTextNode(sp.shadowCaster ? 'true' : 'false'))
      model.appendChild(sc)
    }
    sub.appendChild(model)
    // View mesh — without a MeshViewModule (built from <MeshView>) KSA's editor won't
    // raycast the SubPart, so an export variant renders but can't be hovered/selected/
    // right-clicked. We point <MeshView> at the SAME built-in render mesh the PartModel
    // reuses: it's guaranteed to exist (buildExportVariantMap skips entries without a mesh
    // node) and resolves cross-mod exactly like the render <Mesh> above. We deliberately
    // do NOT reference "<meshId>_VM": built-in IVA atlases are inconsistent (CoreIVAPropA
    // ships a _VM per subpart, CoreIVASpaceA has only a handful for 333 subparts), so a
    // _VM reference would dangle for most parts. RayCastEgoSubPart only reads the view
    // mesh's vertex positions + normals, which any render mesh has.
    const meshView = doc.createElement('MeshView')
    const viewMesh = doc.createElement('Mesh')
    viewMesh.setAttribute('Id', sp.meshId)
    meshView.appendChild(viewMesh)
    sub.appendChild(meshView)
    // Carry the shadowed built-in's own collision volume forward (see the field docs).
    if (sp.colliders?.length) {
      sub.appendChild(buildColliderElement(doc, sp.colliders, INHERITED_COLLIDER_COMPONENT_ID))
    }
    assets.appendChild(sub)
  }

  const body = new XMLSerializer().serializeToString(doc)
  return '<?xml version="1.0" encoding="utf-8"?>\n' + prettyXml(body) + '\n'
}
