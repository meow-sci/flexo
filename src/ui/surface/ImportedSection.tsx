import { useState } from 'react';
import { Button, InlineConfirmStrip, Switch } from '../kit';
import { SurfaceSection } from './SurfaceSection';
import { openImportModel, removeImport, setMeshTransparent } from '../../state/customAssetStore';
import { BYTE_DELETE_WARNING, IMPORT_REMOVAL_APPENDIX } from '../assets/bytePolicy';
import type { CustomMesh, ImportedMeshSource } from '../../ksa/types';

/**
 * **Imported** — read-only provenance for an imported SubPart, its one authoring choice
 * ("Render as glass"), and the batch actions (design: design-surface-assets.md §1.3
 * "Imported"; census §1.14).
 *
 * The provenance is what makes a re-import legible — `sourceNode`/`sourceMaterial` ARE the
 * replace-import match keys — and what tells the user which Blender object a SubPart came
 * from when one file split into a dozen. The glass toggle writes `imported.transparent`,
 * which the exporter routes to `<PartModelGlass>`; it deliberately changes nothing in the
 * editor preview (guardrail 7 — KSA glass is one fixed shader, so any preview flexo drew
 * would be a second, differently-wrong guess).
 *
 * **Undo enrollment**: `setMeshTransparent` and `removeImport` each push their own discrete
 * step. Removing an import DELETES BYTES, so it always confirms (design §5.1/§5.2).
 */
export function ImportedSection({
  mesh,
  imported,
}: {
  mesh: CustomMesh;
  imported: ImportedMeshSource;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <SurfaceSection title="Imported">
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <ProvenanceRow label="File" value={imported.sourceFile} />
        <ProvenanceRow label="Object" value={imported.sourceNode} />
        <ProvenanceRow label="Material" value={imported.sourceMaterial} />
        <ProvenanceRow label="Triangles" value={imported.triangles.toLocaleString()} />
        <ProvenanceRow label="Vertices" value={imported.vertices.toLocaleString()} />
      </dl>
      <Switch
        isSelected={!!imported.transparent}
        onChange={(v) => void setMeshTransparent(mesh.id, v)}
      >
        Render as glass
      </Switch>
      <p className="text-[11px] leading-snug text-fg-subtle">
        KSA glass is one fixed shader — about 75% opaque, barely tinted by the diffuse, and it
        can&apos;t glow. Editor preview stays opaque.
      </p>
      {confirmRemove ? (
        // The strip's own label is one truncating line, so the irreversibility sentence goes
        // ABOVE it in full — §14.3 requires it to be stated, which means readable.
        <div className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/10 p-1.5">
          <p className="text-[11px] leading-snug text-warning">
            {BYTE_DELETE_WARNING} {IMPORT_REMOVAL_APPENDIX}
          </p>
          <InlineConfirmStrip
            size="xs"
            label={`Remove “${imported.sourceFile}”?`}
            confirmLabel="Remove import"
            onConfirm={() => {
              setConfirmRemove(false);
              void removeImport(imported.importId);
            }}
            onCancel={() => setConfirmRemove(false)}
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="secondary"
            onPress={() => openImportModel([], imported.importId)}
          >
            Replace…
          </Button>
          <Button size="sm" variant="danger-ghost" onPress={() => setConfirmRemove(true)}>
            Remove import…
          </Button>
        </div>
      )}
    </SurfaceSection>
  );
}

export function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="truncate text-fg-muted" title={value}>
        {value}
      </dd>
    </>
  );
}
