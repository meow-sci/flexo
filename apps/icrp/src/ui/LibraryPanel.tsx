/**
 * The Library palette — build mode's LEFT sidebar (the "jump in and add stuff"
 * surface): thumbnail cards for every pad prefab, stock Part and piece, with
 * kind chips, editor-tag chips (Fuel Tanks, Electrical, …) and fuzzy search.
 * One CLICK adds to the scene: parts land exploded on their own new layer
 * (double-click in the viewport selects that layer = the whole part), pieces
 * land on the active layer; everything drops just east of the current build,
 * grounded and selected with the Move tool armed so the very next drag
 * magnet-snaps it into place. The Add dialog (`A`) stays for the big-preview
 * browse; this palette is the fast path.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Box } from 'lucide-react';
import { SearchField, Tooltip, cn } from '../../../../src/ui/kit';
import { fuzzyFind } from '../../../../src/ui/fuzzyMatch';
import {
  $pieceIndex,
  $staticObjects,
  $staticPieces,
  $stockParts,
  $vesselPieces,
} from '../state/catalogStore';
import {
  addPlacement,
  importStockPart,
  setPlacementTransformsBatch,
  getPlacement,
} from '../state/docStore';
import { importCatalogObject } from '../state/importCatalogObject';
import { preparePartImport } from '../three/partImport';
import { getScene } from '../three/sceneHandle';
import { $catalogThumbs, requestCatalogThumb } from '../three/catalogThumbs';
import { setTool } from '../state/toolStore';
import { identityTransform, type Transform } from '../ksa/types';
import {
  buildLibraryEntries,
  previewEntriesFor,
  type LibEntry,
  type LibKind,
} from '../state/libraryEntries';

const KIND_LABEL: Record<LibKind, string> = { pad: 'Pads', part: 'Parts', piece: 'Pieces' };
const MAX_TILES = 60;

export function LibraryPanel() {
  const prefabs = useStore($staticObjects);
  const parts = useStore($stockParts);
  const staticPieces = useStore($staticPieces);
  const vesselPieces = useStore($vesselPieces);
  const pieceIndex = useStore($pieceIndex);
  const thumbs = useStore($catalogThumbs);
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<ReadonlySet<LibKind>>(new Set(['pad', 'part', 'piece']));
  const [tag, setTag] = useState<string | null>(null);

  const entries = useMemo<LibEntry[]>(
    () => buildLibraryEntries({ prefabs, parts, staticPieces, vesselPieces }),
    [prefabs, parts, staticPieces, vesselPieces],
  );

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    for (const part of parts) for (const t of part.editorTags) seen.add(t);
    // Editor-internal flags, not categories a builder browses by.
    seen.delete('Hidden');
    seen.delete('NoFaceSnapping');
    return [...seen].sort();
  }, [parts]);

  const filtered = useMemo(() => {
    let list = entries.filter((e) => kinds.has(e.kind));
    if (tag) list = list.filter((e) => e.kind !== 'part' || e.tags.includes(tag));
    const q = query.trim();
    if (q) {
      list = list.filter((e) => fuzzyFind(q, e.title).matched || fuzzyFind(q, e.id).matched);
    }
    return list;
  }, [entries, kinds, tag, query]);

  const shown = filtered.slice(0, MAX_TILES);

  // Thumbnails: request lazily for what is actually shown (idle-queued).
  useEffect(() => {
    for (const e of shown) {
      requestCatalogThumb(e.id, previewEntriesFor(e, pieceIndex));
    }
  }, [shown, pieceIndex]);

  const toggleKind = (kind: LibKind) => {
    setKinds((prev) => {
      const all: LibKind[] = ['pad', 'part', 'piece'];
      if (prev.size === all.length) return new Set([kind]);
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next.size === 0 ? new Set(all) : next;
    });
  };

  const add = (entry: LibEntry) => {
    if (entry.prefab) {
      importCatalogObject(entry.prefab);
      return;
    }
    const spawnEast = getScene()?.spawnEast() ?? 0;
    if (entry.part) {
      const pieceExists = (pieceId: string) => pieceIndex.has(pieceId);
      const prepared = preparePartImport(entry.part, pieceExists);
      const result = importStockPart(
        entry.part,
        { kind: 'new' },
        pieceExists,
        prepared.anchorColliders,
        prepared.anchorConnectors,
      );
      if (spawnEast !== 0) {
        // Same undo step as the import (no pushUndo between).
        const updates = new Map<string, Transform>();
        for (const id of result.imported) {
          const pl = getPlacement(id);
          if (!pl) continue;
          updates.set(id, {
            ...pl.transform,
            position: { ...pl.transform.position, y: pl.transform.position.y + spawnEast },
          });
        }
        setPlacementTransformsBatch(updates);
      }
      getScene()?.groundWhenLoaded(result.imported);
    } else if (entry.piece) {
      const t = identityTransform();
      t.position.y = spawnEast;
      const id = addPlacement(entry.piece.id, t);
      getScene()?.groundWhenLoaded([id]);
    }
    // Arm the Move tool: the next gesture is always "drag it into place".
    setTool('translate');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-1.5 px-3 pt-3 pb-2">
        <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Library</div>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search parts & pieces"
          aria-label="Search library"
        />
        <div className="flex flex-wrap items-center gap-1">
          {(Object.keys(KIND_LABEL) as LibKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={kinds.has(kind)}
              className={
                kinds.has(kind)
                  ? 'rounded-full border border-accent bg-accent/15 px-2 py-0.5 text-[11px] text-fg'
                  : 'rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-muted hover:bg-wash-hover'
              }
              onClick={() => toggleKind(kind)}
            >
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
        {kinds.has('part') && allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tag === t}
                className={
                  tag === t
                    ? 'rounded-full border border-accent bg-accent/15 px-2 py-0.5 text-[11px] text-fg'
                    : 'rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-subtle hover:bg-wash-hover'
                }
                onClick={() => setTag(tag === t ? null : t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="grid grid-cols-3 gap-1.5">
          {shown.map((entry) => (
            <Tooltip key={`${entry.kind}:${entry.id}`} content={tileHint(entry)}>
              <button
                type="button"
                className="flex flex-col items-center gap-0.5 rounded border border-transparent p-1 hover:border-border hover:bg-wash-hover"
                aria-label={`Add ${entry.title}`}
                onClick={() => add(entry)}
              >
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-panel-sunken">
                  {thumbs[entry.id] ? (
                    <img src={thumbs[entry.id]} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <Box className="size-5 text-fg-subtle" aria-hidden />
                  )}
                </span>
                <span
                  className={cn(
                    'w-full truncate text-center text-[10px]',
                    entry.kind === 'part' ? 'text-fg' : 'text-fg-muted',
                  )}
                >
                  {entry.title}
                </span>
              </button>
            </Tooltip>
          ))}
        </div>
        {filtered.length > MAX_TILES && (
          <div className="px-1 py-1.5 text-[11px] text-fg-subtle">
            {filtered.length - MAX_TILES} more — refine the search or chips.
          </div>
        )}
        {shown.length === 0 && (
          <div className="px-1 py-1.5 text-[11px] text-fg-subtle">Nothing matches.</div>
        )}
      </div>
      <div className="border-t border-border px-3 py-1.5 text-[10px] leading-snug text-fg-subtle">
        Click a card to add it, then drag it into place — the magnet snaps parts to each other.
        Double-click a placed piece to grab its whole part.
      </div>
    </div>
  );
}

function tileHint(entry: LibEntry): string {
  if (entry.kind === 'pad') return `${entry.id} — click to open as a new object`;
  if (entry.kind === 'part') {
    const tags = entry.tags.length > 0 ? ` (${entry.tags.join(', ')})` : '';
    return `${entry.id}${tags} — click to add on its own layer`;
  }
  return `${entry.id} — click to add to the active layer`;
}
