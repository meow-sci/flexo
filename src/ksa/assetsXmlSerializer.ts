import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom'
import { prettyXml } from './partXmlSerializer'
import { VIEW_MESH_SUFFIX } from './exportGlb'

/**
 * Serializes the custom-asset "Assets" XML — the file that DEFINES user-created
 * SubParts, mirroring KSA Core's CoreXxxAAssets.xml: a default <MeshAtlas> (the
 * generated geometry GLB), one <PbrMaterial> per textured SubPart (referencing the
 * exported .ktx2 by relative Path), and one <SubPart> per custom mesh wiring a
 * <PartModel> to its <Mesh> node and <Material>.
 *
 * Only custom SubParts actually placed in the Part are emitted — built-in/Core
 * SubParts are owned by KSA Core and must NOT be re-declared here. The Part.xml
 * (serializePart) references these via <SubPart InstanceOf="subPartId">.
 *
 * Paths are relative to the mod folder (e.g. "Meshes/Foo.glb", "Textures/Bar.ktx2"),
 * matching how Core references its own binaries.
 */

export interface AssetsSubPartPlan {
  /** SubPart template id (== GLB node Mesh Id == placement.subPartTemplateId). */
  subPartId: string
  /** Material id, or null for an untextured SubPart (no <Material>/<PbrMaterial>). */
  materialId: string | null
  /** Diffuse .ktx2 path (relative to the mod, or absolute for a referenced asset), or null when untextured. */
  diffusePath: string | null
  /**
   * Per-SubPart Normal .ktx2 path. `undefined` → fall back to the shared
   * {@link AssetsPlan.normalPath} (synthetic flat normal); a string → use exactly this
   * path (a real kitten normal map). Lets kitten SubParts carry their own PBR while
   * primitive custom meshes keep using the shared synthetic.
   */
  normalPath?: string
  /** Per-SubPart AO/Rough/Metal .ktx2 path. `undefined` → fall back to {@link AssetsPlan.aoRoughMetalPath}. */
  aoRoughMetalPath?: string
  /**
   * Render through KSA's translucent glass path: emits `<PartModelGlass>` instead of
   * `<PartModel>` (an alpha-blended shader), for glass surfaces like the kitten visor.
   * The opaque `<PartModel>` path renders glass black/opaque.
   */
  glass?: boolean
}

/**
 * A "reference" SubPart: a project-unique SubPart that REUSES an existing (built-in)
 * Mesh + Material by id rather than declaring its own geometry/texture. Used to re-home
 * KSA's IVA (interior) props onto a non-Internal PartModel so they render outside IVA
 * mode (see buildIvaVariantMap in modExport.ts). Unlike {@link AssetsSubPartPlan} it emits
 * NO <PbrMaterial> (the material is built-in), NO <MeshView> (the built-in mesh has no
 * "_VM" view node), and needs no MeshAtlas.
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
  subParts: AssetsSubPartPlan[]
  /** Reference-only SubParts that reuse built-in Mesh/Material (e.g. de-IVA'd props). */
  referenceSubParts?: ReferenceSubPartPlan[]
  /**
   * Relative path to a shared flat-normal .ktx2 (RGB 128,128,255 = +Z).
   *
   * REQUIRED whenever any subpart is textured. KSA's thumbnail renderer
   * (ThumbnailRenderResources.AddDraw) dereferences `Material.NormalReference`
   * and `Material.PBRMap` WITHOUT a null check, so a <PbrMaterial> with only
   * <Diffuse> throws a NullReferenceException at startup. We emit synthetic
   * Normal + AoRoughMetal channels so every material is complete.
   */
  normalPath?: string
  /** Relative path to a shared AO/Rough/Metal .ktx2 (AO=255, Rough=128, Metal=0). */
  aoRoughMetalPath?: string
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
  // Every material gets all three channels KSA dereferences unconditionally in
  // its thumbnail renderer: <Diffuse>, <Normal>, <AoRoughMetal>. The latter two
  // point at shared synthetic textures (flat normal / neutral ORM) — omitting
  // them crashes KSA at startup (see AssetsPlan.normalPath).
  for (const sp of plan.subParts) {
    if (!sp.materialId || !sp.diffusePath) continue
    // Per-SubPart override (real kitten map) falls back to the shared synthetic.
    const effNormal = sp.normalPath !== undefined ? sp.normalPath : plan.normalPath
    const effOrm = sp.aoRoughMetalPath !== undefined ? sp.aoRoughMetalPath : plan.aoRoughMetalPath
    const mat = doc.createElement('PbrMaterial')
    mat.setAttribute('Id', sp.materialId)
    const diffuse = doc.createElement('Diffuse')
    diffuse.setAttribute('Path', sp.diffusePath)
    diffuse.setAttribute('Category', 'Vessel')
    mat.appendChild(diffuse)
    if (effNormal) {
      const normal = doc.createElement('Normal')
      normal.setAttribute('Path', effNormal)
      normal.setAttribute('Category', 'Vessel')
      mat.appendChild(normal)
    }
    if (effOrm) {
      const orm = doc.createElement('AoRoughMetal')
      orm.setAttribute('Path', effOrm)
      orm.setAttribute('Category', 'Vessel')
      mat.appendChild(orm)
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
    if (sp.materialId && sp.diffusePath) {
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
    // reuses: it's guaranteed to exist (buildIvaVariantMap skips entries without a mesh
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
