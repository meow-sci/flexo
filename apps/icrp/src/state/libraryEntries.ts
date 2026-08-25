/**
 * Pure library-catalog builders shared by the Library palette, the dev debug
 * handle and the build-time thumbnail generator (scripts/generate-icrp-thumbs)
 * — one definition of "what the library shows" and "what one entry looks like
 * in 3D".
 */
import type { CatalogPart } from '../../../../src/ksa/partCatalog';
import type { CatalogStaticObject, CatalogStaticPiece } from '../ksa/staticCatalog';
import type { PreviewEntry } from '../three/CatalogPreviewViewport';
import { identityTransform } from '../ksa/types';

export type LibKind = 'pad' | 'part' | 'piece';

export interface LibEntry {
  id: string;
  kind: LibKind;
  title: string;
  tags: string[];
  piece?: CatalogStaticPiece;
  prefab?: CatalogStaticObject;
  part?: CatalogPart;
}

export function libShortTitle(id: string): string {
  return id.replace(/^Core[^_]*_(Subpart|Prefab)_/, '');
}

export function buildLibraryEntries(input: {
  prefabs: readonly CatalogStaticObject[];
  parts: readonly CatalogPart[];
  staticPieces: readonly CatalogStaticPiece[];
  vesselPieces: readonly CatalogStaticPiece[];
}): LibEntry[] {
  const out: LibEntry[] = [];
  for (const prefab of input.prefabs) {
    out.push({ id: prefab.id, kind: 'pad', title: libShortTitle(prefab.id), tags: [], prefab });
  }
  for (const part of input.parts) {
    out.push({
      id: part.id,
      kind: 'part',
      title: libShortTitle(part.id),
      tags: part.editorTags,
      part,
    });
  }
  for (const piece of input.staticPieces) {
    out.push({ id: piece.id, kind: 'piece', title: libShortTitle(piece.id), tags: [], piece });
  }
  for (const piece of input.vesselPieces) {
    if (piece.internal) continue; // interior props stay searchable in the Add dialog
    out.push({ id: piece.id, kind: 'piece', title: libShortTitle(piece.id), tags: [], piece });
  }
  const kindOrder: Record<LibKind, number> = { pad: 0, part: 1, piece: 2 };
  out.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.title.localeCompare(b.title));
  return out;
}

/** Resolves an entry to the (piece, transform) set its 3D thumb/preview renders. */
export function previewEntriesFor(
  entry: LibEntry,
  index: ReadonlyMap<string, CatalogStaticPiece>,
): PreviewEntry[] {
  if (entry.piece) return [{ piece: entry.piece, transform: identityTransform() }];
  if (entry.prefab) {
    return entry.prefab.placements.flatMap((pl) => {
      const piece = index.get(pl.instanceOf);
      return piece ? [{ piece, transform: pl.transform }] : [];
    });
  }
  if (entry.part) {
    return entry.part.placements.flatMap((pl) => {
      const piece = index.get(pl.subPartTemplateId);
      return piece
        ? [{ piece, transform: { position: pl.position, rotation: pl.rotation, scale: pl.scale } }]
        : [];
    });
  }
  return [];
}
