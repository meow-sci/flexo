/**
 * Piece-catalog store: Core static pieces/objects + Core vessel SubParts
 * offered as static pieces + the stock vessel `<Part>` catalog (imported as
 * exploded SubPart placements — plans/ICRP_PLAN.md P1.03/P5.01 + the stock-part
 * import follow-up). Loaded once at boot.
 */
import { atom } from 'nanostores';
import { loadCoreCatalog, type CatalogSubPart } from '../../../../src/ksa/catalog';
import { $partCatalog, ensurePartCatalogLoaded } from '../../../../src/state/partCatalogStore';
import type { CatalogPart } from '../../../../src/ksa/partCatalog';
import type { PartCollider } from '../ksa/types';
import {
  loadStaticCatalog,
  type CatalogStaticObject,
  type CatalogStaticPiece,
} from '../ksa/staticCatalog';

export const $staticPieces = atom<CatalogStaticPiece[]>([]);
export const $vesselPieces = atom<CatalogStaticPiece[]>([]);
export const $staticObjects = atom<CatalogStaticObject[]>([]);
/** Stock vessel `<Part>` prefabs (flexo's catalog, shared store). */
export const $stockParts = $partCatalog;
/** Merged id → piece index (static + vessel; Core keeps the namespaces distinct). */
export const $pieceIndex = atom<Map<string, CatalogStaticPiece>>(new Map());
export const $catalogReady = atom(false);

/**
 * Maps a vessel `<SubPart>` onto the piece shape (fact F12: mesh/material
 * registries are global by id, so a mod `<StaticSubObject>` can reference them
 * with no binaries). Excluded: templates with no resolvable mesh node (the rare
 * named-atlas whole-scene case — its `<Mesh Id>` is an atlas id, which a static
 * PartModel cannot name) or no material. `<Internal>` interior props ARE
 * included — KSA ignores the flag for statics (fact F6), so they render; the
 * library badges them and hides them from the browse list until searched.
 */
export function vesselPieceFromSubPart(
  entry: CatalogSubPart,
  gameDataColliders?: readonly PartCollider[],
): CatalogStaticPiece | null {
  if (!entry.meshNodeName || !entry.materialId) return null;
  return {
    id: entry.id,
    origin: 'core-subpart',
    atlasUrl: entry.atlasUrl,
    meshNodeName: entry.meshNodeName,
    materialId: entry.materialId,
    diffuseUrl: entry.diffuseUrl,
    normalUrl: entry.normalUrl,
    aoRoughMetalUrl: entry.aoRoughMetalUrl,
    alphaUrl: undefined,
    terrain: false,
    internal: entry.internal ?? false,
    // Geometry-template colliders + the template's <SubPartGameData> colliders
    // (where MOST vessel colliders live — tanks etc.; KSA merges both, so the
    // exported <StaticSubObject> must carry both or vessels fall through).
    colliders: [...(entry.colliders ?? []), ...(gameDataColliders ?? [])],
    sourceFile: entry.sourceFile,
  };
}

/**
 * SubPart-template-owned colliders harvested from the Part catalog: every
 * `CatalogPart.colliders` entry with a non-null `ownerTemplateId` came from that
 * template's `<SubPartGameData>` (registered ONCE globally per template in KSA,
 * so any part's gathering yields the template's full set — first-wins).
 */
export function collectGameDataColliders(
  parts: readonly CatalogPart[],
): Map<string, PartCollider[]> {
  const out = new Map<string, PartCollider[]>();
  for (const part of parts) {
    const perTemplate = new Map<string, PartCollider[]>();
    for (const c of part.colliders) {
      if (!c.ownerTemplateId) continue;
      const list = perTemplate.get(c.ownerTemplateId) ?? [];
      list.push(c);
      perTemplate.set(c.ownerTemplateId, list);
    }
    for (const [templateId, list] of perTemplate) {
      if (!out.has(templateId)) out.set(templateId, list);
    }
  }
  return out;
}

let loading: Promise<void> | null = null;

/** Idempotent boot load (static catalog + SubPart catalog + Part catalog in parallel). */
export function ensureStaticCatalogLoaded(): Promise<void> {
  loading ??= Promise.all([loadStaticCatalog(), loadCoreCatalog(), ensurePartCatalogLoaded()]).then(
    ([staticCatalog, subParts]) => {
      const gameDataColliders = collectGameDataColliders($partCatalog.get());
      const vessel: CatalogStaticPiece[] = [];
      for (const entry of subParts) {
        const piece = vesselPieceFromSubPart(entry, gameDataColliders.get(entry.id));
        if (piece) vessel.push(piece);
      }
      $staticPieces.set(staticCatalog.pieces);
      $vesselPieces.set(vessel);
      $staticObjects.set(staticCatalog.objects);
      const index = new Map<string, CatalogStaticPiece>();
      // Static pieces win an (unexpected) id collision — they are the native kind.
      for (const piece of vessel) index.set(piece.id, piece);
      for (const piece of staticCatalog.pieces) index.set(piece.id, piece);
      $pieceIndex.set(index);
      $catalogReady.set(true);
    },
  );
  return loading;
}
