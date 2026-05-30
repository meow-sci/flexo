import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom'
import { prettyXml } from './partXmlSerializer'

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
  /** Relative path to the diffuse .ktx2, or null when untextured. */
  diffusePath: string | null
}

export interface AssetsPlan {
  /** Relative path to the geometry mesh-atlas GLB, e.g. "Meshes/MyMod_MeshAtlas.glb". */
  meshAtlasPath: string
  subParts: AssetsSubPartPlan[]
}

export function serializeAssets(plan: AssetsPlan): string {
  const doc = new DOMImplementation().createDocument(null, 'Assets', null)
  const assets = doc.documentElement!

  const atlas = doc.createElement('MeshAtlas')
  atlas.setAttribute('Path', plan.meshAtlasPath)
  assets.appendChild(atlas)

  // Materials first (Core lists PbrMaterials above the SubParts that use them).
  for (const sp of plan.subParts) {
    if (!sp.materialId || !sp.diffusePath) continue
    const mat = doc.createElement('PbrMaterial')
    mat.setAttribute('Id', sp.materialId)
    const diffuse = doc.createElement('Diffuse')
    diffuse.setAttribute('Path', sp.diffusePath)
    diffuse.setAttribute('Category', 'Vessel')
    mat.appendChild(diffuse)
    assets.appendChild(mat)
  }

  for (const sp of plan.subParts) {
    const sub = doc.createElement('SubPart')
    sub.setAttribute('Id', sp.subPartId)
    const model = doc.createElement('PartModel')
    const mesh = doc.createElement('Mesh')
    mesh.setAttribute('Id', sp.subPartId)
    model.appendChild(mesh)
    if (sp.materialId && sp.diffusePath) {
      const material = doc.createElement('Material')
      material.setAttribute('Id', sp.materialId)
      model.appendChild(material)
    }
    sub.appendChild(model)
    assets.appendChild(sub)
  }

  const body = new XMLSerializer().serializeToString(doc)
  return '<?xml version="1.0" encoding="utf-8"?>\n' + prettyXml(body) + '\n'
}
