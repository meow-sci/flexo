import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button, InlineConfirmStrip, TextField } from '../kit';
import { $part, addSubPart, revealEntity, select } from '../../state/editorStore';
import { $assetUsage, updateCustomMesh } from '../../state/customAssetStore';
import { status } from '../../state/statusStore';
import { PRIMITIVE_LABELS } from '../../three/primitives';
import { KITTEN_LABELS, meshKind, type CustomMesh } from '../../ksa/types';
import { openMeshSurface } from '../surface/surfaceJump';
import { PrimitiveParams } from '../surface/IdentitySection';
import { ProvenanceRow } from '../surface/ImportedSection';
import { MeshThumb } from './AssetCards';
import { useManagerNav } from './managerNav';
import { deleteMeshLabel, deleteMeshNow, requestDeleteMesh } from './assetActions';

/**
 * **Mesh detail** (design: design-surface-assets.md §2.2 "Mesh") — for all three kinds
 * (primitive / imported / kitten, D6).
 *
 * It closes the census's headline UI gap from the library side: `updateCustomMesh` accepted
 * `name` and `primitive` patches that NOTHING called (census §1.9, pain #5), so a typo'd
 * name or a wrong-sized box meant delete-and-recreate — which loses every placement. The
 * dimension fields here are literally the Surface sidebar's `PrimitiveParams`, so a resize
 * behaves identically in both places: the atlas rebuilds off the mesh-signature diff and
 * `subPartId` never moves, which is what keeps placements, GameData, animations and
 * connectors resolving.
 *
 * `[Edit surface →]` is a JUMP (foundation §2.5): the dialog closes and Surface mode opens on
 * this mesh — never a dialog stacked over a mode.
 *
 * **Undo enrollment**: rename/resize are discrete `updateCustomMesh` steps; `Add instance` is
 * `addSubPart`'s own step; delete is `removeCustomMesh`'s.
 */
export function MeshDetail({ meshId }: { meshId: string }) {
  const nav = useManagerNav();
  const part = useStore($part);
  const usage = useStore($assetUsage);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const mesh = part.customMeshes.find((m) => m.id === meshId);
  if (!mesh) return <p className="p-4 text-sm text-fg-subtle">This mesh no longer exists.</p>;

  const use = usage.mesh.get(mesh.id);
  const placements = use?.placements ?? 0;
  const layerNames = (use?.layers ?? []).map(
    (id) => part.layers.find((l) => l.id === id)?.name ?? id,
  );

  const commitName = () => {
    const next = (nameDraft ?? '').trim();
    setNameDraft(null);
    if (!next || next === mesh.name) return;
    void updateCustomMesh(mesh.id, { name: next });
  };

  const selectPlacements = () => {
    const refs = part.placements
      .filter((p) => p.subPartTemplateId === mesh.subPartId)
      .map((p) => ({ kind: 'subpart' as const, id: p.instanceId }));
    if (refs.length === 0) return;
    select(refs);
    revealEntity('subpart', refs[0].id);
    nav.close();
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-start gap-3">
        <MeshThumb mesh={mesh} part={part} className="size-24" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TextField
            label="Name"
            size="sm"
            value={nameDraft ?? mesh.name}
            onChange={setNameDraft}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setNameDraft(null);
            }}
          />
          <span className="text-xs text-fg-muted">{kindCaption(mesh)}</span>
          <span className="truncate font-mono text-[11px] text-fg-subtle" title={mesh.subPartId}>
            {mesh.subPartId}
          </span>
        </div>
      </div>

      {mesh.primitive && <PrimitiveParams mesh={mesh} spec={mesh.primitive} />}
      {mesh.kitten && (
        <p className="text-xs text-fg-subtle">
          Geometry is baked from the {KITTEN_LABELS[mesh.kitten.kind]} kitten — its shape is not
          editable here.
        </p>
      )}
      {mesh.imported && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
          <ProvenanceRow label="File" value={mesh.imported.sourceFile} />
          <ProvenanceRow label="Object" value={mesh.imported.sourceNode} />
          <ProvenanceRow label="Material" value={mesh.imported.sourceMaterial} />
          <ProvenanceRow label="Triangles" value={mesh.imported.triangles.toLocaleString()} />
        </dl>
      )}

      <section className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          Where used
        </span>
        <p className={placements === 0 ? 'text-xs text-warning' : 'text-xs text-fg-muted'}>
          {placements === 0
            ? 'No placements — this template will not be exported.'
            : `×${placements} on ${layerNames.length === 1 ? 'layer' : 'layers'} ${layerNames.join(', ')}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              addSubPart(mesh.subPartId);
              status(`Instance of “${mesh.name}” added`);
            }}
          >
            Add instance
          </Button>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={placements === 0}
            onPress={selectPlacements}
          >
            Select placements
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              nav.close();
              openMeshSurface(mesh.id);
            }}
          >
            Edit surface →
          </Button>
        </div>
      </section>

      <div className="flex justify-end border-t border-border pt-3">
        {confirmDelete ? (
          <InlineConfirmStrip
            label={deleteMeshLabel(mesh, usage)}
            confirmLabel="Delete"
            onConfirm={() => {
              setConfirmDelete(false);
              deleteMeshNow(mesh, usage);
              nav.reset();
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : (
          <Button
            size="sm"
            variant="danger-ghost"
            onPress={() => {
              if (requestDeleteMesh(mesh, usage, () => setConfirmDelete(true))) nav.reset();
            }}
          >
            Delete mesh…
          </Button>
        )}
      </div>
    </div>
  );
}

/** `Primitive · Box` / `Imported glTF` / `Kitten · Hunter` — the Identity section's wording. */
function kindCaption(mesh: CustomMesh): string {
  switch (meshKind(mesh)) {
    case 'kitten':
      return `Kitten · ${mesh.kitten ? KITTEN_LABELS[mesh.kitten.kind] : 'submesh'}`;
    case 'imported':
      return 'Imported glTF';
    case 'primitive':
      return `Primitive · ${mesh.primitive ? PRIMITIVE_LABELS[mesh.primitive.kind] : 'mesh'}`;
  }
}
