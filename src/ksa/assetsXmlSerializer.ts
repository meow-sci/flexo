import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import type { Document as XmlDocument, Element as XmlElement } from '@xmldom/xmldom';
import { prettyXml } from './partXmlSerializer';
import { VIEW_MESH_SUFFIX } from './exportGlb';
import type { RawXmlNode } from './types';

/** Serialize current KSA file assets, materials and independent SubPart definitions. */

/**
 * One <PbrMaterial> to declare. Diffuse + Normal + AoRoughMetal are REQUIRED:
 * KSA dereferences all three with no null check — both the thumbnail renderer
 * (ThumbnailRenderResources.AddDraw) and every placed part
 * (PartModel.WriteInstancesToGpu) — so a partial material crashes the game.
 * buildMultiCustomBundle resolves uniform channels into 1×1 solid textures.
 */
export interface AssetsMaterialPlan {
  /** <PbrMaterial Id>. Must be unique across the material registry, including Core. */
  id: string;
  /** Diffuse .ktx2 path (mod-relative, or absolute for a referenced kitten asset). */
  diffusePath: string;
  /** Tangent-space normal .ktx2 path (the shared FlatNormal solid when unauthored). */
  normalPath: string;
  /** Packed AO/Rough/Metal .ktx2 path (a solid texel for uniform channels). */
  aoRoughMetalPath: string;
  /**
   * Emissive (glow) mask .ktx2 path. `undefined` → no <Emissive>. KSA samples it as a
   * grayscale mask (R) and ADDS it as white light × 1.25 after lighting; the glow COLOR
   * lives in the (composited) diffuse. Glass materials never carry one (KSA's glass
   * shader ignores emissive).
   */
  emissivePath?: string;
}

export interface AssetsSubPartPlan {
  /** SubPart template id (== GLB node Mesh Id == placement.subPartTemplateId). */
  subPartId: string;
  /**
   * Id of an {@link AssetsPlan.materials} entry. REQUIRED — KSA has no untextured `<PartModel>`:
   * `ThumbnailRenderResources.AddDraw` derefs `Material.DiffuseReference`/`NormalReference`/
   * `PBRMap` with no null guard, so a `<PartModel>` without `<Material>` NREs at startup before
   * the main menu, and zero shipped Core PartModels omit it. A mesh that resolves no texture or
   * material gets the shared neutral material instead (see modExport).
   */
  materialId: string;
  /**
   * Render through KSA's translucent glass path: emits `<PartModelGlass>` instead of
   * `<PartModel>` (an alpha-blended shader), for glass surfaces like the kitten visor.
   * The opaque `<PartModel>` path renders glass black/opaque.
   */
  glass?: boolean;
  /**
   * Emit `<Internal>true</Internal>` — interior-only geometry, which KSA renders in IVA camera
   * mode and nowhere else (`PartModel.cs:387`). Resolved by modExport's `resolveInternal`.
   * IGNORED (and never set) for a {@link glass} SubPart: `<PartModelGlass>` has no `<Internal>`
   * field at all — the only `[XmlElement("Internal")]` in the decomp is `PartModelModule.cs:35`.
   */
  internal?: boolean;
}

/**
 * A "reference" SubPart: a project-unique SubPart that REUSES an existing (built-in)
 * Mesh + Material by id rather than declaring its own geometry/texture. Used for export
 * variants (see buildExportVariantMap in modExport.ts): re-declaring a built-in template under a
 * fresh id so flexo can change something about it — an overridden `<Internal>` (interior-only)
 * flag, or SubPart GameData that would otherwise redefine the shared built-in template. Unlike
 * {@link AssetsSubPartPlan} it emits NO <PbrMaterial> (the material is built-in) and needs no
 * MeshAtlas; it preserves the resolved render components and their original MeshView references.
 */
export interface ReferenceSubPartPlan {
  subPartId: string;
  /** Complete independent row, with gameplay supplied by the patch where edited. */
  row: RawXmlNode;
}

export interface AssetsPlan {
  /**
   * Relative path to the geometry mesh-atlas GLB, e.g. "Meshes/MyMod_MeshAtlas.glb".
   * Omit when this Assets file declares only {@link referenceSubParts} (no custom geometry).
   */
  meshAtlasPath?: string;
  /** The <PbrMaterial> list (deduped; shared across SubParts like Core's pack materials). */
  materials?: AssetsMaterialPlan[];
  subParts: AssetsSubPartPlan[];
  /** Reference-only SubParts that reuse built-in Mesh/Material (the export variants). */
  referenceSubParts?: ReferenceSubPartPlan[];
}

/** `<Internal>true</Internal>` — legal ONLY inside a `<PartModel>` (never `<PartModelGlass>`). */
function internalElement(doc: XmlDocument): XmlElement {
  const el = doc.createElement('Internal');
  el.appendChild(doc.createTextNode('true'));
  return el;
}

/**
 * Guards the global registries this file writes into: KSA registers `<PbrMaterial>` and
 * `<SubPart>` by id across the mod. Duplicate definitions are rejected by the content prepass.
 * Project-unique asset ids and per-part variant namespaces prevent those collisions.
 */
function claimId(seen: Set<string>, kind: string, id: string): void {
  if (seen.has(id.toLowerCase())) {
    throw new Error(
      `flexo export: duplicate <${kind} Id="${id}"> in the exported mod — KSA rejects duplicate asset definitions`,
    );
  }
  seen.add(id.toLowerCase());
}

/**
 * Serializes N per-part plans into ONE `<Assets>` document — the mod's shared
 * `<Base>Assets.xml`. Each plan contributes, in order, its `<MeshAtlas>` (when it declares
 * custom geometry), its `<PbrMaterial>`s, its custom `<SubPart>`s and its reference
 * `<SubPart>`s; plans follow one another in list order. Multiple `<MeshAtlas>` elements per
 * file are first-class — `KSA/MeshAtlasFileReference.cs` `DoLoad()` registers each GLB mesh
 * by NAME, so one atlas per part can supply its own uniquely named meshes.
 */
export function serializeAssets(plans: AssetsPlan[]): string {
  const doc = new DOMImplementation().createDocument(null, 'Assets', null);
  const assets = doc.documentElement!;
  const materialIds = new Set<string>();
  const subPartIds = new Set<string>();
  const atlasIds = new Set<string>();
  const textureIds = new Set<string>();
  const textures = new Map<string, string>();

  for (const plan of plans) {
    if (plan.meshAtlasPath) {
      const id = `flexo_MeshAtlas_${plan.meshAtlasPath.replace(/[^A-Za-z0-9]+/g, '_')}`;
      claimId(atlasIds, 'MeshAtlas', id);
      const atlas = doc.createElement('MeshAtlas');
      atlas.setAttribute('Id', id);
      atlas.setAttribute('Path', plan.meshAtlasPath);
      assets.appendChild(atlas);
    }
    for (const m of plan.materials ?? []) {
      claimId(materialIds, 'PbrMaterial', m.id);
      const mat = doc.createElement('PbrMaterial');
      mat.setAttribute('Id', m.id);
      const channels: Array<[string, string | undefined]> = [
        ['Diffuse', m.diffusePath],
        ['Normal', m.normalPath],
        ['AoRoughMetal', m.aoRoughMetalPath],
        ['Emissive', m.emissivePath],
      ];
      for (const [name, path] of channels) {
        if (!path) continue;
        let id = textures.get(path);
        if (!id) {
          id = `${m.id}_${name}`;
          claimId(textureIds, 'Texture', id);
          textures.set(path, id);
          const texture = doc.createElement('Texture');
          texture.setAttribute('Id', id);
          texture.setAttribute('Path', path);
          texture.setAttribute('Category', 'Vessel');
          assets.appendChild(texture);
        }
        const slot = doc.createElement(name);
        slot.setAttribute('Ref', id);
        mat.appendChild(slot);
      }
      assets.appendChild(mat);
    }
    for (const sp of plan.subParts) {
      claimId(subPartIds, 'SubPart', sp.subPartId);
      const sub = doc.createElement('SubPart');
      sub.setAttribute('Id', sp.subPartId);
      const components = doc.createElement('Components');
      const model = doc.createElement(sp.glass ? 'PartModelGlass' : 'PartModel');
      model.setAttribute('Key', `${sp.subPartId}_Model`);
      if (sp.internal && !sp.glass) model.appendChild(internalElement(doc));
      const mesh = doc.createElement('Mesh');
      mesh.setAttribute('Ref', sp.subPartId);
      model.appendChild(mesh);
      const material = doc.createElement('Material');
      material.setAttribute('Ref', sp.materialId);
      model.appendChild(material);
      components.appendChild(model);
      const meshView = doc.createElement('MeshView');
      const viewMesh = doc.createElement('Mesh');
      viewMesh.setAttribute('Ref', sp.subPartId + VIEW_MESH_SUFFIX);
      meshView.appendChild(viewMesh);
      components.appendChild(meshView);
      sub.appendChild(components);
      assets.appendChild(sub);
    }
    for (const sp of plan.referenceSubParts ?? []) {
      claimId(subPartIds, 'SubPart', sp.subPartId);
      const sub = rawElement(doc, sp.row);
      sub.setAttribute('Id', sp.subPartId);
      assets.appendChild(sub);
    }
  }
  const body = new XMLSerializer().serializeToString(doc);
  return '<?xml version="1.0" encoding="utf-8"?>\n' + prettyXml(body) + '\n';
}

function rawElement(doc: XmlDocument, node: RawXmlNode): XmlElement {
  const el = doc.createElement(node.tag);
  for (const [key, value] of Object.entries(node.attrs)) el.setAttribute(key, value);
  if (node.text) el.appendChild(doc.createTextNode(node.text));
  for (const child of node.children) el.appendChild(rawElement(doc, child));
  return el;
}
