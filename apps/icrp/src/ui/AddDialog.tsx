/**
 * The Add browser, rebuilt on flexo's catalog-browser pattern (BrowserPopup
 * cover shell + list | preview / details splits + preview-first commit
 * gestures): type CHIPS filter the four catalog kinds, fuzzy search, a single
 * click drives the 3D preview + details, double-click / Enter / the footer
 * buttons commit. Stock Parts import exploded onto a new/chosen layer.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Selection } from 'react-aria-components';
import { Chip, GridList, GridListItem, SearchField, SectionTitle } from '../../../../src/ui/kit';
import { BrowserLayout, BrowserPopup } from '../../../../src/ui/BrowserShell';
import {
  BrowserCommitRow,
  MAX_RESULTS,
  ResultCapRow,
} from '../../../../src/ui/build/browserCommon';
import { PreviewLoadProgress } from '../../../../src/ui/LoadProgress';
import { fuzzyFind } from '../../../../src/ui/fuzzyMatch';
import type { CatalogPart } from '../../../../src/ksa/partCatalog';
import {
  $pieceIndex,
  $staticObjects,
  $staticPieces,
  $stockParts,
  $vesselPieces,
} from '../state/catalogStore';
import { $activeObject, addPlacement, importStockPart } from '../state/docStore';
import { importCatalogObject } from '../state/importCatalogObject';
import { preparePartImport } from '../three/partImport';
import { getScene } from '../three/sceneHandle';
import { CatalogPreviewViewport, type PreviewEntry } from '../three/CatalogPreviewViewport';
import { identityTransform } from '../ksa/types';
import type { CatalogStaticObject, CatalogStaticPiece } from '../ksa/staticCatalog';

type EntryKind = 'prefab' | 'static-piece' | 'part' | 'vessel-piece';

interface AddEntry {
  id: string;
  kind: EntryKind;
  title: string;
  subtitle: string;
  piece?: CatalogStaticPiece;
  prefab?: CatalogStaticObject;
  part?: CatalogPart;
}

const KIND_LABEL: Record<EntryKind, string> = {
  prefab: 'Prefabs',
  'static-piece': 'Static pieces',
  part: 'Parts',
  'vessel-piece': 'Vessel pieces',
};

const KIND_CHIP: Record<EntryKind, string> = {
  prefab: 'prefab',
  'static-piece': 'static',
  part: 'part',
  'vessel-piece': 'vessel',
};

export function AddDialog({ onClose }: { onClose: () => void }) {
  return (
    <BrowserPopup title="Add" open onOpenChange={(open) => !open && onClose()}>
      <BrowserBody onClose={onClose} />
    </BrowserPopup>
  );
}

function BrowserBody({ onClose }: { onClose: () => void }) {
  const staticPieces = useStore($staticPieces);
  const vessel = useStore($vesselPieces);
  const prefabs = useStore($staticObjects);
  const parts = useStore($stockParts);
  const activeObject = useStore($activeObject);
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<Set<EntryKind>>(
    new Set(['prefab', 'static-piece', 'part', 'vessel-piece']),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layerTarget, setLayerTarget] = useState('__new__');

  const entries: AddEntry[] = [
    ...prefabs.map(
      (obj): AddEntry => ({
        id: `prefab:${obj.id}`,
        kind: 'prefab',
        title: obj.id,
        subtitle: `${obj.placements.length} placements · opens as a new object`,
        prefab: obj,
      }),
    ),
    ...staticPieces.map(
      (piece): AddEntry => ({
        id: `static:${piece.id}`,
        kind: 'static-piece',
        title: piece.id.replace(/^Core[^_]*_Subpart_/, ''),
        subtitle: `${piece.terrain ? 'terrain · ' : ''}${piece.alphaUrl ? 'alpha · ' : ''}${piece.colliders.length} colliders`,
        piece,
      }),
    ),
    ...parts.map(
      (part): AddEntry => ({
        id: `part:${part.id}`,
        kind: 'part',
        title: part.id.replace(/^Core[^_]*_Prefab_/, ''),
        subtitle: `${part.editorTags[0] ?? 'Part'} · ${part.placements.length} pieces → layer`,
        part,
      }),
    ),
    ...vessel.map(
      (piece): AddEntry => ({
        id: `vessel:${piece.id}`,
        kind: 'vessel-piece',
        title: piece.id.replace(/^Core[^_]*_Subpart_/, ''),
        subtitle: `${piece.id.split('_')[0].replace(/^Core/, '')}${piece.internal ? ' · interior' : ''} · ${piece.colliders.length} colliders`,
        piece,
      }),
    ),
  ];

  const q = query.trim();
  const matches = entries.filter((e) => {
    if (!kinds.has(e.kind)) return false;
    // Interior props only surface when searched for (they'd bury the list).
    if (e.kind === 'vessel-piece' && e.piece?.internal && q === '') return false;
    return fuzzyFind(q, e.title).matched || fuzzyFind(q, idOf(e)).matched;
  });
  const filtered = matches.slice(0, MAX_RESULTS);
  const selected = selectedId ? (entries.find((e) => e.id === selectedId) ?? null) : null;

  const toggleKind = (kind: EntryKind) => {
    setKinds((prev) => {
      const all: EntryKind[] = ['prefab', 'static-piece', 'part', 'vessel-piece'];
      // Everything active → the click SOLOS that kind (the filter gesture);
      // a solo chip clicked again restores all; otherwise toggle membership,
      // never allowing an empty set.
      if (prev.size === all.length) return new Set([kind]);
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next.size === 0 ? new Set(all) : next;
    });
  };

  const commit = (entry: AddEntry): void => {
    if (entry.kind === 'prefab' && entry.prefab) {
      importCatalogObject(entry.prefab);
      onClose(); // replaces the project's active object — always one-and-done
      return;
    }
    if (entry.kind === 'part' && entry.part) {
      const index = $pieceIndex.get();
      const pieceExists = (pieceId: string) => index.has(pieceId);
      const prepared = preparePartImport(entry.part, pieceExists);
      const result = importStockPart(
        entry.part,
        layerTarget !== '__new__' && activeObject.layers.some((l) => l.id === layerTarget)
          ? { kind: 'existing', layerId: layerTarget }
          : { kind: 'new' },
        pieceExists,
        prepared.anchorColliders,
        prepared.anchorConnectors,
      );
      getScene()?.groundWhenLoaded(result.imported);
      return;
    }
    if (entry.piece) {
      const id = addPlacement(entry.piece.id);
      getScene()?.groundWhenLoaded([id]);
    }
  };

  const commitSelected = () => {
    if (selected) commit(selected);
  };

  const commitAndClose = () => {
    if (!selected) return;
    commit(selected);
    onClose();
  };

  const onSelection = (keys: Selection) => {
    if (keys === 'all') return;
    setSelectedId(([...keys][0] as string) ?? null);
  };

  const listPane = (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-panel-sunken">
      {filtered.length === 0 ? (
        <div className="p-3 text-sm text-fg-subtle">
          {entries.length === 0 ? 'Loading catalog…' : 'No matches'}
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto">
            <GridList
              aria-label="Catalog"
              selectionMode="single"
              // "replace": arrows drive the selection (and thus the preview); with
              // onAction present, a MOUSE action commits on double-click/Enter only
              // — the preview-first gesture model (flexo's browsers).
              selectionBehavior="replace"
              selectedKeys={selectedId ? [selectedId] : []}
              onSelectionChange={onSelection}
              onAction={(key) => {
                const entry = entries.find((e) => e.id === String(key));
                if (entry) commit(entry);
              }}
              items={filtered}
              dependencies={[query, kinds]}
            >
              {(e) => (
                <GridListItem id={e.id} textValue={e.title}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{e.title}</span>
                    <span className="truncate text-[11px] text-fg-subtle">{e.subtitle}</span>
                  </span>
                  <Chip className="shrink-0">{KIND_CHIP[e.kind]}</Chip>
                </GridListItem>
              )}
            </GridList>
          </div>
          <ResultCapRow shown={filtered.length} total={matches.length} />
        </>
      )}
    </div>
  );

  const previewPane = (
    <div className="relative h-full overflow-hidden rounded-lg border border-border bg-panel-sunken">
      {selected ? (
        <EntryPreview entry={selected} />
      ) : (
        <div className="flex h-full items-center justify-center text-fg-subtle">
          Select an entry to preview
        </div>
      )}
      <PreviewLoadProgress />
    </div>
  );

  const detailsPane = (
    <div className="h-full overflow-auto rounded-lg border border-border bg-panel-sunken p-3">
      {selected ? (
        <EntryDetails entry={selected} layerTarget={layerTarget} onLayerTarget={setLayerTarget} />
      ) : (
        <span className="text-sm text-fg-subtle">Select an entry to see its details.</span>
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5">
      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <SearchField
          size="sm"
          className="min-w-0 sm:flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Search the catalog (fuzzy)"
          aria-label="Search catalog"
          autoFocus
        />
        <div className="flex shrink-0 items-center gap-1">
          {(Object.keys(KIND_LABEL) as EntryKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={kinds.has(kind)}
              className={
                kinds.has(kind)
                  ? 'rounded-full border border-accent bg-accent/15 px-2.5 py-0.5 text-xs text-fg'
                  : 'rounded-full border border-border px-2.5 py-0.5 text-xs text-fg-muted hover:bg-wash-hover'
              }
              onClick={() => toggleKind(kind)}
            >
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      </div>

      <BrowserLayout list={listPane} preview={previewPane} details={detailsPane} />

      <BrowserCommitRow
        isDisabled={!selected}
        onAdd={commitSelected}
        onAddAndClose={commitAndClose}
      />
    </div>
  );
}

function idOf(e: AddEntry): string {
  return e.piece?.id ?? e.prefab?.id ?? e.part?.id ?? e.title;
}

/** Resolves an entry to the (piece, transform) set the 3D preview renders. */
function previewEntries(entry: AddEntry): PreviewEntry[] {
  const index = $pieceIndex.get();
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
        ? [
            {
              piece,
              transform: { position: pl.position, rotation: pl.rotation, scale: pl.scale },
            },
          ]
        : [];
    });
  }
  return [];
}

function EntryPreview({ entry }: { entry: AddEntry }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<CatalogPreviewViewport | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewport = new CatalogPreviewViewport(host);
    viewportRef.current = viewport;
    return () => {
      viewport.dispose();
      viewportRef.current = null;
    };
  }, []);

  useEffect(() => {
    void viewportRef.current?.setEntries(previewEntries(entry));
  }, [entry]);

  return <div ref={hostRef} className="h-full w-full" />;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="truncate font-mono text-fg-muted">{value}</dd>
    </>
  );
}

function EntryDetails({
  entry,
  layerTarget,
  onLayerTarget,
}: {
  entry: AddEntry;
  layerTarget: string;
  onLayerTarget: (v: string) => void;
}) {
  const activeObject = useStore($activeObject);
  const index = useStore($pieceIndex);
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-sm text-fg">{idOf(entry)}</span>
        <span className="text-fg-subtle">{KIND_LABEL[entry.kind]}</span>
      </div>

      {entry.piece && (
        <div>
          <SectionTitle>Piece</SectionTitle>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <Row label="Mesh" value={entry.piece.meshNodeName} />
            {entry.piece.materialId && <Row label="Material" value={entry.piece.materialId} />}
            <Row label="Colliders" value={String(entry.piece.colliders.length)} />
            {entry.piece.terrain && (
              <Row label="Terrain" value="takes the planet-ground look in-game" />
            )}
            {entry.piece.alphaUrl && <Row label="Alpha" value="blended (draws after opaque)" />}
            {entry.piece.internal && (
              <Row label="Interior" value="an IVA prop — renders fine as a static" />
            )}
            <Row label="Source" value={entry.piece.sourceFile} />
          </dl>
        </div>
      )}

      {entry.prefab && (
        <div>
          <SectionTitle>Prefab</SectionTitle>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <Row label="Placements" value={String(entry.prefab.placements.length)} />
            <Row
              label="Metres"
              value={`G ${entry.prefab.groundOffsetM ?? '—'} · S ${entry.prefab.surfaceHeightM ?? '—'} · F ${entry.prefab.footprintRadiusM ?? '—'}`}
            />
          </dl>
          <p className="mt-2 text-fg-subtle">
            Opens as a NEW object replacing the current project (commits close the dialog).
          </p>
        </div>
      )}

      {entry.part && (
        <div>
          <SectionTitle>Stock part</SectionTitle>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <Row label="Tags" value={entry.part.editorTags.join(', ') || '—'} />
            <Row label="Pieces" value={String(entry.part.placements.length)} />
            <Row
              label="Importable"
              value={String(
                entry.part.placements.filter((pl) => index.has(pl.subPartTemplateId)).length,
              )}
            />
            <Row
              label="Colliders"
              value={`${entry.part.colliders.filter((c) => c.ownerTemplateId === null).length} part-level (ride the anchor piece)`}
            />
            {entry.part.diameterM !== null && (
              <Row label="Diameter" value={`${entry.part.diameterM} m`} />
            )}
          </dl>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-fg-subtle">Import into</span>
            <select
              aria-label="Import into layer"
              className="min-w-0 flex-1 rounded border border-border bg-panel px-1.5 py-1 text-xs text-fg"
              value={layerTarget}
              onChange={(e) => onLayerTarget(e.target.value)}
            >
              <option value="__new__">a new layer (named after the part)</option>
              {activeObject.layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
