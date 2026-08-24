/**
 * Piece-catalog store: the Core static pieces/objects, loaded once at boot.
 * (Vessel-SubPart pieces join in P5 via flexo's `parseAssetsFile`.)
 */
import { atom } from 'nanostores';
import {
  indexStaticPieces,
  loadStaticCatalog,
  type CatalogStaticObject,
  type CatalogStaticPiece,
} from '../ksa/staticCatalog';

export const $staticPieces = atom<CatalogStaticPiece[]>([]);
export const $staticObjects = atom<CatalogStaticObject[]>([]);
export const $pieceIndex = atom<Map<string, CatalogStaticPiece>>(new Map());
export const $catalogReady = atom(false);

let loading: Promise<void> | null = null;

/** Idempotent boot load. */
export function ensureStaticCatalogLoaded(): Promise<void> {
  loading ??= loadStaticCatalog().then((catalog) => {
    $staticPieces.set(catalog.pieces);
    $staticObjects.set(catalog.objects);
    $pieceIndex.set(indexStaticPieces(catalog.pieces));
    $catalogReady.set(true);
  });
  return loading;
}
