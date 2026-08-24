/**
 * The Add browser (flexo's "Add ▸ SubPart…" pattern): one searched modal over
 * the whole piece catalog — Core prefabs, static pieces, vessel pieces
 * (interior props surface via search) and stock Parts (imported exploded onto a
 * new/existing layer). Click adds + closes; newly added things auto-drop to the
 * ground once their meshes land.
 */
import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Dialog, DialogHeader, Modal, SearchField } from '../../../../src/ui/kit';
import type { CatalogPart } from '../../../../src/ksa/partCatalog';
import {
  $pieceIndex,
  $staticObjects,
  $staticPieces,
  $stockParts,
  $vesselPieces,
} from '../state/catalogStore';
import { $activeObject, addPlacement, importStockPart } from '../state/docStore';
import { preparePartImport } from '../three/partImport';
import { getScene } from '../three/sceneHandle';
import type { CatalogStaticObject, CatalogStaticPiece } from '../ksa/staticCatalog';
import { importCatalogObject } from '../state/importCatalogObject';

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 pt-3 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
      {children}
    </div>
  );
}

function RowButton(props: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="w-full rounded px-2 py-1 text-left text-sm text-fg hover:bg-wash-hover"
      onClick={props.onClick}
    >
      {props.title}
      <span className="block text-xs text-fg-subtle">{props.subtitle}</span>
    </button>
  );
}

export function AddDialog({ onClose }: { onClose: () => void }) {
  const staticPieces = useStore($staticPieces);
  const vessel = useStore($vesselPieces);
  const prefabs = useStore($staticObjects);
  const parts = useStore($stockParts);
  const activeObject = useStore($activeObject);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState('__new__');
  const q = query.trim().toLowerCase();

  const matches = (s: string) => q === '' || s.toLowerCase().includes(q);
  const vesselFiltered = (
    q ? vessel.filter((p) => matches(p.id)) : vessel.filter((p) => !p.internal)
  ).slice(0, q ? 60 : 24);
  const partsFiltered = parts
    .filter((p) => matches(p.id) || p.editorTags.some((t) => matches(t)))
    .slice(0, q ? 60 : 24);
  const targetValid = target === '__new__' || activeObject.layers.some((l) => l.id === target);

  const addPiece = (piece: CatalogStaticPiece) => {
    const id = addPlacement(piece.id);
    getScene()?.groundWhenLoaded([id]);
    onClose();
  };
  const addPrefab = (obj: CatalogStaticObject) => {
    importCatalogObject(obj);
    onClose();
  };
  const addPart = (part: CatalogPart) => {
    const index = $pieceIndex.get();
    const pieceExists = (pieceId: string) => index.has(pieceId);
    const prepared = preparePartImport(part, pieceExists);
    const result = importStockPart(
      part,
      targetValid && target !== '__new__' ? { kind: 'existing', layerId: target } : { kind: 'new' },
      pieceExists,
      prepared.anchorColliders,
    );
    if (result.skippedTemplates.length > 0 || prepared.droppedPartColliders > 0) {
      console.warn(
        `icrp import ${part.id}: skipped ${result.skippedTemplates.length} template(s); ` +
          `dropped ${prepared.droppedPartColliders} part-level collider(s).`,
      );
    }
    getScene()?.groundWhenLoaded(result.imported);
    onClose();
  };

  return (
    <Modal isOpen onOpenChange={(open) => !open && onClose()} isDismissable>
      <Dialog className="w-[38rem] max-w-[92vw] p-4">
        <DialogHeader title="Add" onClose={onClose} />
        <div className="flex flex-col gap-2">
          <SearchField
            aria-label="Search catalog"
            placeholder="Search pieces, parts, prefabs…"
            autoFocus
            value={query}
            onChange={setQuery}
          />
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span>Stock parts import into</span>
            <select
              aria-label="Import into layer"
              className="rounded border border-border bg-panel-sunken px-1.5 py-1 text-xs text-fg"
              value={targetValid ? target : '__new__'}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="__new__">a new layer (named after the part)</option>
              {activeObject.layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <SectionHeader>Core prefabs</SectionHeader>
            {prefabs
              .filter((o) => matches(o.id))
              .map((obj) => (
                <RowButton
                  key={obj.id}
                  title={obj.id}
                  subtitle={`${obj.placements.length} placements · opens as a new object`}
                  onClick={() => addPrefab(obj)}
                />
              ))}
            <SectionHeader>Static pieces</SectionHeader>
            {staticPieces
              .filter((p) => matches(p.id))
              .map((piece) => (
                <RowButton
                  key={piece.id}
                  title={piece.id.replace(/^Core[^_]*_Subpart_/, '')}
                  subtitle={`${piece.terrain ? 'terrain · ' : ''}${piece.alphaUrl ? 'alpha · ' : ''}${piece.colliders.length} colliders`}
                  onClick={() => addPiece(piece)}
                />
              ))}
            <SectionHeader>Stock parts ({parts.length})</SectionHeader>
            {partsFiltered.map((part) => (
              <RowButton
                key={part.id}
                title={part.id.replace(/^Core[^_]*_Prefab_/, '')}
                subtitle={`${part.editorTags[0] ?? 'Part'} · ${part.placements.length} pieces · exploded onto a layer`}
                onClick={() => addPart(part)}
              />
            ))}
            <SectionHeader>Vessel pieces ({vessel.length})</SectionHeader>
            {vesselFiltered.map((piece) => (
              <RowButton
                key={piece.id}
                title={piece.id.replace(/^Core[^_]*_Subpart_/, '')}
                subtitle={`${piece.id.split('_')[0].replace(/^Core/, '')}${piece.internal ? ' · interior' : ''} · ${piece.colliders.length} colliders`}
                onClick={() => addPiece(piece)}
              />
            ))}
            {q === '' && (
              <div className="px-2 py-1 text-[11px] text-fg-subtle">
                Search to see everything (interior props only appear in search results).
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </Modal>
  );
}
