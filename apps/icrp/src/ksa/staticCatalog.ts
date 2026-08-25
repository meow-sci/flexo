/**
 * Loads the KSA "Core" static-object catalog: `<StaticSubObject>` piece templates,
 * `<StaticObject>` prefabs and `<StaticObjectGameData>` metres, from the Core
 * asset XML served under /ksa/ (same pipeline as flexo's SubPart catalog).
 *
 * Schema authority (plans/ICRP_PLAN.md §0.3 F1–F3, F10):
 *  - `<StaticSubObject Id>` = `<PartModel>`* + `<Collider>`* only
 *    (`decomp/KSA/StaticSubObjectTemplate.cs`). Static-only PartModel fields:
 *    `<Terrain>true</Terrain>` and the material's `<Alpha>` slot.
 *  - `<StaticObject Id>` = `<SubObject Id InstanceOf><Transform/>`* +
 *    `<PartModel>`* + `<Collider>`* + three `DistanceReference`s (all-NaN = unset).
 *  - `<StaticObjectGameData Id>` merges onto the object: lists APPEND, distances
 *    override only when set (`StaticObjectTemplate.ApplyGameData`).
 */
import { fetchXmlFile, toUrl } from '../../../../src/ksa/catalog';
import {
  collidersFromElement,
  directChildren,
  readDistanceM,
  readTransform,
} from '../../../../src/ksa/partXmlParser';
import type { PartCollider, Transform } from './types';

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
  /** The `Id` attribute (informational; bundler writes the mesh name). */
  instanceId: string;
  /** `InstanceOf` — a `<StaticSubObject>` id (the ONLY thing it can name, F3). */
  instanceOf: string;
  transform: Transform;
}

/** One `<StaticObject>` prefab with its GameData merged (F10). */
export interface CatalogStaticObject {
  id: string;
  placements: CatalogStaticPlacement[];
  /** Object-level colliders (`ownerTemplateId` = null). */
  colliders: PartCollider[];
  /** Merged metres; null = unset in both Assets and GameData. */
  groundOffsetM: number | null;
  surfaceHeightM: number | null;
  footprintRadiusM: number | null;
  sourceFile: string;
}

/** A parsed `<StaticObjectGameData>` (same shape as the object it targets). */
export interface CatalogStaticGameData {
  id: string;
  placements: CatalogStaticPlacement[];
  colliders: PartCollider[];
  groundOffsetM: number | null;
  surfaceHeightM: number | null;
  footprintRadiusM: number | null;
}

export interface StaticCatalog {
  pieces: CatalogStaticPiece[];
  objects: CatalogStaticObject[];
}

interface MaterialPaths {
  diffuse?: string;
  normal?: string;
  aoRoughMetal?: string;
  alpha?: string;
}

function firstChildByTag(parent: Element, tag: string): Element | null {
  return directChildren(parent, tag)[0] ?? null;
}

/** Collects `<PbrMaterial>`s (global by Id — cross-file refs are legal, first-wins). */
function collectMaterials(doc: Document, out: Map<string, MaterialPaths>): void {
  for (const mat of Array.from(doc.getElementsByTagName('PbrMaterial'))) {
    const id = mat.getAttribute('Id');
    if (!id || out.has(id)) continue;
    out.set(id, {
      diffuse: firstChildByTag(mat, 'Diffuse')?.getAttribute('Path') ?? undefined,
      normal: firstChildByTag(mat, 'Normal')?.getAttribute('Path') ?? undefined,
      aoRoughMetal: firstChildByTag(mat, 'AoRoughMetal')?.getAttribute('Path') ?? undefined,
      alpha: firstChildByTag(mat, 'Alpha')?.getAttribute('Path') ?? undefined,
    });
  }
}

/** The file's default (Id-less) `<MeshAtlas Path>`, or null. */
function defaultAtlasPath(doc: Document): string | null {
  for (const atlas of Array.from(doc.getElementsByTagName('MeshAtlas'))) {
    const path = atlas.getAttribute('Path');
    if (path && !atlas.getAttribute('Id')) return path;
  }
  return null;
}

function readPlacements(owner: Element): CatalogStaticPlacement[] {
  const out: CatalogStaticPlacement[] = [];
  for (const sub of directChildren(owner, 'SubObject')) {
    const instanceOf = sub.getAttribute('InstanceOf');
    if (!instanceOf) continue; // IsValid() requires InstanceOf; KSA skips these too
    out.push({
      instanceId: sub.getAttribute('Id') ?? instanceOf,
      instanceOf,
      transform: readTransform(sub),
    });
  }
  return out;
}

/** Reads the three `DistanceReference` metres off an object/GameData element. */
function readMeters(el: Element): {
  groundOffsetM: number | null;
  surfaceHeightM: number | null;
  footprintRadiusM: number | null;
} {
  return {
    groundOffsetM: readDistanceM(firstChildByTag(el, 'GroundOffset')),
    surfaceHeightM: readDistanceM(firstChildByTag(el, 'SurfaceHeight')),
    footprintRadiusM: readDistanceM(firstChildByTag(el, 'FootprintRadius')),
  };
}

/**
 * Parses one Assets document. Two-phase caller contract: `collectMaterials` must
 * have seen EVERY document first (materials resolve globally), while the mesh
 * atlas resolves per-file (the bundler emits one default atlas per file).
 */
export function parseStaticAssetsFile(
  doc: Document,
  sourceFile: string,
  materials: ReadonlyMap<string, MaterialPaths>,
  out: { pieces: CatalogStaticPiece[]; objects: CatalogStaticObject[] },
  gameData: CatalogStaticGameData[],
): void {
  const atlasPath = defaultAtlasPath(doc);

  for (const sub of Array.from(doc.getElementsByTagName('StaticSubObject'))) {
    const id = sub.getAttribute('Id');
    if (!id) continue;
    const partModel = firstChildByTag(sub, 'PartModel');
    const meshId = partModel ? firstChildByTag(partModel, 'Mesh')?.getAttribute('Id') : null;
    if (!partModel || !meshId) {
      // KSA logs "has a PartModel 'X' with no mesh" and skips it (StaticObject.cs:148).
      console.warn(`icrp catalog: ${sourceFile}: StaticSubObject '${id}' has no mesh — skipped`);
      continue;
    }
    if (!atlasPath) {
      console.warn(`icrp catalog: ${sourceFile}: no default <MeshAtlas> — '${id}' skipped`);
      continue;
    }
    const materialId = firstChildByTag(partModel, 'Material')?.getAttribute('Id') ?? undefined;
    const mat = materialId ? materials.get(materialId) : undefined;
    const terrain =
      firstChildByTag(partModel, 'Terrain')?.textContent?.trim().toLowerCase() === 'true';
    out.pieces.push({
      id,
      origin: 'core-static',
      atlasUrl: toUrl(atlasPath),
      meshNodeName: meshId,
      materialId,
      diffuseUrl: mat?.diffuse ? toUrl(mat.diffuse) : undefined,
      normalUrl: mat?.normal ? toUrl(mat.normal) : undefined,
      aoRoughMetalUrl: mat?.aoRoughMetal ? toUrl(mat.aoRoughMetal) : undefined,
      alphaUrl: mat?.alpha ? toUrl(mat.alpha) : undefined,
      terrain,
      colliders: collidersFromElement(sub, id),
      sourceFile,
    });
  }

  for (const obj of Array.from(doc.getElementsByTagName('StaticObject'))) {
    const id = obj.getAttribute('Id');
    if (!id) continue;
    out.objects.push({
      id,
      placements: readPlacements(obj),
      colliders: collidersFromElement(obj, null),
      ...readMeters(obj),
      sourceFile,
    });
  }

  for (const gd of Array.from(doc.getElementsByTagName('StaticObjectGameData'))) {
    const id = gd.getAttribute('Id');
    if (!id) continue;
    gameData.push({
      id,
      placements: readPlacements(gd),
      colliders: collidersFromElement(gd, null),
      ...readMeters(gd),
    });
  }
}

/**
 * Applies GameData onto its object exactly like `StaticObjectTemplate.ApplyGameData`
 * (StaticObjectTemplate.cs:73-90): lists APPEND, distances replace only when set.
 * GameData whose id matches no object is dropped (KSA logs an error there).
 */
export function mergeStaticGameData(
  objects: CatalogStaticObject[],
  gameData: readonly CatalogStaticGameData[],
): void {
  const byId = new Map(objects.map((o) => [o.id, o]));
  for (const gd of gameData) {
    const obj = byId.get(gd.id);
    if (!obj) {
      console.warn(`icrp catalog: StaticObjectGameData '${gd.id}' matches no StaticObject`);
      continue;
    }
    obj.placements.push(...gd.placements);
    obj.colliders.push(...gd.colliders);
    if (gd.groundOffsetM !== null) obj.groundOffsetM = gd.groundOffsetM;
    if (gd.surfaceHeightM !== null) obj.surfaceHeightM = gd.surfaceHeightM;
    if (gd.footprintRadiusM !== null) obj.footprintRadiusM = gd.footprintRadiusM;
  }
}

/** Parses a set of already-fetched documents into a merged catalog (two-phase). */
export function parseStaticCatalog(docs: { doc: Document; file: string }[]): StaticCatalog {
  const materials = new Map<string, MaterialPaths>();
  for (const { doc } of docs) collectMaterials(doc, materials);
  const out: StaticCatalog = { pieces: [], objects: [] };
  const gameData: CatalogStaticGameData[] = [];
  for (const { doc, file } of docs) parseStaticAssetsFile(doc, file, materials, out, gameData);
  mergeStaticGameData(out.objects, gameData);
  out.pieces.sort((a, b) => a.id.localeCompare(b.id));
  out.objects.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** Fetches and parses every Core static-asset file. */
export async function loadStaticCatalog(): Promise<StaticCatalog> {
  const docs: { doc: Document; file: string }[] = [];
  await Promise.all(
    STATIC_ASSET_FILES.map(async (file) => {
      const r = await fetchXmlFile(file);
      if (r.kind === 'missing') {
        console.error(`icrp catalog: required asset file ${file} not found`);
        return;
      }
      if (r.kind === 'ok') docs.push({ doc: r.doc, file });
    }),
  );
  const catalog = parseStaticCatalog(docs);
  console.info(
    `icrp catalog: ${catalog.pieces.length} pieces, ${catalog.objects.length} objects loaded`,
  );
  return catalog;
}

/** Builds an id→piece index for O(1) lookups. */
export function indexStaticPieces(pieces: CatalogStaticPiece[]): Map<string, CatalogStaticPiece> {
  return new Map(pieces.map((p) => [p.id, p]));
}
