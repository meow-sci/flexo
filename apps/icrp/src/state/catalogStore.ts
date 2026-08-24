/**
 * Piece-catalog store: Core static pieces/objects + Core vessel SubParts
 * offered as static pieces (plans/ICRP_PLAN.md P1.03/P5.01), loaded at boot.
 */
import { atom } from 'nanostores';
import { loadCoreCatalog, type CatalogSubPart } from '../../../../src/ksa/catalog';
import {
  loadStaticCatalog,
  type CatalogStaticObject,
  type CatalogStaticPiece,
} from '../ksa/staticCatalog';

export const $staticPieces = atom<CatalogStaticPiece[]>([]);
export const $vesselPieces = atom<CatalogStaticPiece[]>([]);
export const $staticObjects = atom<CatalogStaticObject[]>([]);
/** Merged id → piece index (static + vessel; Core keeps the namespaces distinct). */
export const $pieceIndex = atom<Map<string, CatalogStaticPiece>>(new Map());
export const $catalogReady = atom(false);

/**
 * Maps a vessel `<SubPart>` onto the piece shape (fact F12: mesh/material
 * registries are global by id, so a mod `<StaticSubObject>` can reference them
 * with no binaries). Excluded: templates with no resolvable mesh node (the rare
 * named-atlas whole-scene case — its `<Mesh Id>` is an atlas id, which a static
 * PartModel cannot name) and `<Internal>` interior props (cosmetic filter).
 */
export function vesselPieceFromSubPart(entry: CatalogSubPart): CatalogStaticPiece | null {
  if (!entry.meshNodeName || entry.internal || !entry.materialId) return null;
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
    colliders: entry.colliders ?? [],
    sourceFile: entry.sourceFile,
  };
}

let loading: Promise<void> | null = null;

/** Idempotent boot load (static catalog + vessel SubPart catalog in parallel). */
export function ensureStaticCatalogLoaded(): Promise<void> {
  loading ??= Promise.all([loadStaticCatalog(), loadCoreCatalog()]).then(
    ([staticCatalog, subParts]) => {
      const vessel: CatalogStaticPiece[] = [];
      for (const entry of subParts) {
        const piece = vesselPieceFromSubPart(entry);
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
