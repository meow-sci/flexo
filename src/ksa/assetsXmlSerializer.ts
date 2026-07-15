import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom'
import { prettyXml } from './partXmlSerializer'
import { VIEW_MESH_SUFFIX } from './exportGlb'

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
  /** Id of an {@link AssetsPlan.materials} entry, or null for an untextured SubPart. */
  materialId: string | null
  /**
   * Render through KSA's translucent glass path: emits `<PartModelGlass>` instead of
   * `<PartModel>` (an alpha-blended shader), for glass surfaces like the kitten visor.
   * The opaque `<PartModel>` path renders glass black/opaque.
   */
  glass?: boolean
}

/**
 * A "reference" SubPart: a project-unique SubPart that REUSES an existing (built-in)
 * Mesh + Material by id rather than declaring its own geometry/texture. Used for export
 * variants (see buildExportVariantMap in modExport.ts): re-homing KSA's IVA (interior) props
 * onto a non-Internal PartModel so they render outside IVA, AND giving a built-in SubPart that
 * carries flexo GameData a fresh id so it doesn't redefine the shared built-in template. Unlike
 * {@link AssetsSubPartPlan} it emits NO <PbrMaterial> (the material is built-in) and needs no
 * MeshAtlas; it DOES emit a <MeshView> pointing at the reused render mesh for editor picking.
 */
export interface ReferenceSubPartPlan {
  /** New project-unique SubPart id (also the basis for its unique PartModel id). */
  subPartId: string
  /** Built-in <Mesh Id> to reference (NOT redeclared in this file). */
  meshId: string
  /** Built-in <Material Id> to reference, or null for an untextured SubPart. */
  materialId: string | null
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
  /** Reference-only SubParts that reuse built-in Mesh/Material (e.g. de-IVA'd props). */
  referenceSubParts?: ReferenceSubPartPlan[]
}

export function serializeAssets(plan: AssetsPlan): string {
  const doc = new DOMImplementation().createDocument(null, 'Assets', null)
  const assets = doc.documentElement!

  // Reference-only SubParts (de-IVA'd props) reuse built-in geometry, so a file with
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
    const mesh = doc.createElement('Mesh')
    mesh.setAttribute('Id', sp.subPartId)
    model.appendChild(mesh)
    if (sp.materialId) {
      const material = doc.createElement('Material')
      material.setAttribute('Id', sp.materialId)
      model.appendChild(material)
    }
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
  // (and Material). The PartModel Id MUST be unique — KSA dedupes PartModels by Template.Id,
  // so reusing the built-in "<orig>_Model" id would collapse back onto the original (e.g. an
  // IVA prop's Internal PartModel), defeating the de-IVA. No <PbrMaterial> (the material is
  // built-in).
  for (const sp of plan.referenceSubParts ?? []) {
    const sub = doc.createElement('SubPart')
    sub.setAttribute('Id', sp.subPartId)
    const model = doc.createElement('PartModel')
    model.setAttribute('Id', `${sp.subPartId}_Model`)
    const mesh = doc.createElement('Mesh')
    mesh.setAttribute('Id', sp.meshId)
    model.appendChild(mesh)
    if (sp.materialId) {
      const material = doc.createElement('Material')
      material.setAttribute('Id', sp.materialId)
      model.appendChild(material)
    }
    sub.appendChild(model)
    // View mesh — without a MeshViewModule (built from <MeshView>) KSA's editor won't
    // raycast the SubPart, so a de-IVA'd prop renders but can't be hovered/selected/
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
    assets.appendChild(sub)
  }

  const body = new XMLSerializer().serializeToString(doc)
  return '<?xml version="1.0" encoding="utf-8"?>\n' + prettyXml(body) + '\n'
}
