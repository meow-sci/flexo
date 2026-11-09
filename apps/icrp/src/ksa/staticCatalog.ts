/** Resolved current Core static pieces and objects for ICRP. */
import { fetchXmlFile, toUrl } from '../../../../src/ksa/catalog';
import {
  collidersFromElement,
  directChildren,
  readDistanceM,
  readTransform,
} from '../../../../src/ksa/partXmlParser';
import type { PartCollider, Transform } from './types';
import {
  contentSource,
  resolveContent,
  type ResolvedContent,
} from '../../../../src/ksa/contentXml';
import { loadCoreContent } from '../../../../src/ksa/coreContent';

/** Core files that declare static-object assets (KSA 2026.8.22.5348). */
export const STATIC_ASSET_FILES = [
  'CoreLaunchPadAAssets.xml',
  'CoreLaunchPadBAssets.xml',
  'CoreLaunchPadCAssets.xml',
  'CoreLaunchPadAGameData.xml',
];

/** One `<StaticSubObject>` piece template, resolved to renderable assets. */
/** Human-short piece name for UI rows ("CoreLaunchPadA_Subpart_FootpathA" → "FootpathA"). */
export function pieceShortName(pieceId: string): string {
  return pieceId.replace(/^Core[^_]*_(Subpart|Prefab)_/, '');
}

export interface CatalogStaticPiece {
  /** `<StaticSubObject Id>`, e.g. "CoreLaunchPadA_Subpart_FootpathA". */
  id: string;
  /**
   * Where the piece comes from (plan D6): 'core-static' = a Core
   * `<StaticSubObject>` (referenced by id on export, nothing declared);
   * 'core-subpart' = a Core vessel `<SubPart>` (export declares a NEW
   * `<StaticSubObject>` referencing the Core mesh/material by id — fact F12).
   */
  origin: 'core-static' | 'core-subpart';
  /** URL of the GLB mesh atlas holding the mesh node. */
  atlasUrl: string;
  /** Node name inside the atlas (= `<Mesh Id>`; Core keeps node name == mesh name). */
  meshNodeName: string;
  materialId?: string;
  diffuseUrl?: string;
  normalUrl?: string;
  aoRoughMetalUrl?: string;
  /** `<PbrMaterial><Alpha>` — single-channel blend mask (render bucket: Blended). */
  alphaUrl?: string;
  /** `<PartModel><Terrain>true</Terrain>` — the game swaps in the planet-ground look. */
  terrain: boolean;
  /**
   * The vessel `<Internal>` flag (interior/IVA prop). KSA IGNORES it for
   * statics (fact F6) — the mesh renders — so these are legitimate pieces; the
   * library merely badges them and keeps them out of the unsearched list.
   */
  internal?: boolean;
  /** Colliders authored on the piece (`ownerTemplateId` = the piece id). */
  colliders: PartCollider[];
  sourceFile: string;
}

/** One `<SubObject>` placement inside a `<StaticObject>`. */
export interface CatalogStaticPlacement {
  /** The placement Key. */
  instanceId: string;
  /** `Ref` — a `<StaticSubObject>` id. */
  instanceOf: string;
  transform: Transform;
}

/** One `<StaticObject>` prefab with its GameData merged (F10). */
export interface CatalogStaticObject {
  id: string;
  placements: CatalogStaticPlacement[];
  /** Object-level colliders (`ownerTemplateId` = null). */
  colliders: PartCollider[];
  /** Resolved metres; null = unset. */
  groundOffsetM: number | null;
  surfaceHeightM: number | null;
  footprintRadiusM: number | null;
  sourceFile: string;
}

export interface StaticCatalog {
  pieces: CatalogStaticPiece[];
  objects: CatalogStaticObject[];
}

function firstChildByTag(parent: Element, tag: string): Element | null {
  return directChildren(parent, tag)[0] ?? null;
}

function readStaticColliders(owner: Element, ownerId: string | null): PartCollider[] {
  const wrapper = firstChildByTag(owner, 'Colliders');
  if (!wrapper) return [];
  const fake = owner.ownerDocument!.createElement('SubPart');
  const components = owner.ownerDocument!.createElement('Components');
  for (const collider of directChildren(wrapper, 'Collider'))
    components.appendChild(collider.cloneNode(true));
  fake.appendChild(components);
  return collidersFromElement(fake, ownerId);
}

/** Parse the resolved global content using the shared mesh-name index. */
export function staticCatalogFromContent(
  content: ResolvedContent,
  meshIndex: Record<string, string>,
): StaticCatalog {
  const rows = Array.from(content.doc.documentElement.childNodes).filter(
    (n): n is Element => n.nodeType === 1,
  );
  const byId = (tag: string) =>
    new Map(
      rows.filter((e) => e.tagName === tag).map((e) => [e.getAttribute('Id')!.toLowerCase(), e]),
    );
  const textures = byId('Texture');
  const materials = byId('PbrMaterial');
  const pieces: CatalogStaticPiece[] = [];
  const objects: CatalogStaticObject[] = [];
  for (const sub of rows.filter((e) => e.tagName === 'StaticSubObject')) {
    const id = sub.getAttribute('Id')!;
    const models = firstChildByTag(sub, 'PartModels');
    const model = models && firstChildByTag(models, 'PartModel');
    const mesh = model && firstChildByTag(model, 'Mesh')?.getAttribute('Ref');
    if (!model || !mesh) continue;
    const atlas = meshIndex[mesh.toLowerCase()];
    if (!atlas) throw new Error(`Unresolved mesh ${mesh} on ${id}`);
    const materialId = firstChildByTag(model, 'Material')?.getAttribute('Ref') ?? undefined;
    const material = materialId && materials.get(materialId.toLowerCase());
    if (materialId && !material) throw new Error(`Unresolved material ${materialId} on ${id}`);
    const texture = (slot: string) => {
      const ref = material && firstChildByTag(material, slot)?.getAttribute('Ref');
      if (!ref) return undefined;
      const path = textures.get(ref.toLowerCase())?.getAttribute('Path');
      if (!path) throw new Error(`Unresolved texture ${ref} on ${id}`);
      return toUrl(path);
    };
    pieces.push({
      id,
      origin: 'core-static',
      atlasUrl: toUrl(atlas),
      meshNodeName: mesh,
      materialId,
      diffuseUrl: texture('Diffuse'),
      normalUrl: texture('Normal'),
      aoRoughMetalUrl: texture('AoRoughMetal'),
      alphaUrl: texture('Alpha'),
      terrain: firstChildByTag(model, 'Terrain')?.textContent?.trim().toLowerCase() === 'true',
      colliders: readStaticColliders(sub, id),
      sourceFile: contentSource(content, 'StaticSubObject', id),
    });
  }
  for (const obj of rows.filter((e) => e.tagName === 'StaticObject')) {
    const id = obj.getAttribute('Id')!;
    const wrapper = firstChildByTag(obj, 'SubObjects');
    const placements = wrapper
      ? directChildren(wrapper, 'SubObject').flatMap((sub) => {
          const instanceOf = sub.getAttribute('Ref');
          return instanceOf
            ? [
                {
                  instanceId: sub.getAttribute('Key') ?? instanceOf,
                  instanceOf,
                  transform: readTransform(sub),
                },
              ]
            : [];
        })
      : [];
    objects.push({
      id,
      placements,
      colliders: readStaticColliders(obj, null),
      groundOffsetM: readDistanceM(firstChildByTag(obj, 'GroundOffset')),
      surfaceHeightM: readDistanceM(firstChildByTag(obj, 'SurfaceHeight')),
      footprintRadiusM: readDistanceM(firstChildByTag(obj, 'FootprintRadius')),
      sourceFile: contentSource(content, 'StaticObject', id),
    });
  }
  return {
    pieces: pieces.sort((a, b) => a.id.localeCompare(b.id)),
    objects: objects.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function parseStaticCatalog(
  docs: { doc: Document; file: string }[],
  meshIndex: Record<string, string>,
): StaticCatalog {
  return staticCatalogFromContent(resolveContent(docs), meshIndex);
}

export async function loadStaticCatalog(): Promise<StaticCatalog> {
  const [core, response, ...results] = await Promise.all([
    loadCoreContent(),
    fetch(toUrl('mesh-index.json')),
    ...STATIC_ASSET_FILES.map(fetchXmlFile),
  ]);
  if (!response.ok) throw new Error('Unable to load KSA mesh index');
  const docs = results.flatMap((result, i) =>
    result.kind === 'ok' ? [{ doc: result.doc, file: STATIC_ASSET_FILES[i] }] : [],
  );
  return staticCatalogFromContent(
    resolveContent([{ doc: core.doc, file: 'Core' }, ...docs]),
    (await response.json()) as Record<string, string>,
  );
}

/** Builds an id→piece index for O(1) lookups. */
export function indexStaticPieces(pieces: CatalogStaticPiece[]): Map<string, CatalogStaticPiece> {
  return new Map(pieces.map((p) => [p.id, p]));
}
