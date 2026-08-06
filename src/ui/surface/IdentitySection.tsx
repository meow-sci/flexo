import { useState } from 'react';
import { Copy } from 'lucide-react';
import { TextField } from '../kit';
import { SurfaceSection } from './SurfaceSection';
import { PARAM_FIELDS } from '../primitiveParamFields';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { updateCustomMesh } from '../../state/customAssetStore';
import { status } from '../../state/statusStore';
import { PRIMITIVE_LABELS } from '../../three/primitives';
import { KITTEN_LABELS, meshKind, type CustomMesh, type PrimitiveSpec } from '../../ksa/types';

/**
 * **Identity** — rename a custom mesh and edit a primitive's dimensions AFTER creation
 * (design: design-surface-assets.md §1.3 "Identity"; census §1.9 + pain #5).
 *
 * This is the census's headline UI gap closed: `updateCustomMesh(id, {name})` and
 * `{primitive}` existed in the store with no caller, so a typo'd name or a wrong-sized box
 * meant delete-and-recreate — which loses every placement. Editing here keeps them: the atlas
 * rebuild is driven by the mesh-signature diff, and `subPartId` (the GLB node name AND the
 * Assets.xml id) never changes, so placements, GameData, animations and connectors all keep
 * resolving.
 *
 * **Undo enrollment**: each commit is one discrete `updateCustomMesh` step.
 */
export function IdentitySection({ mesh }: { mesh: CustomMesh }) {
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  const commitName = () => {
    const next = (nameDraft ?? '').trim();
    setNameDraft(null);
    if (!next || next === mesh.name) return;
    void updateCustomMesh(mesh.id, { name: next });
  };

  return (
    <SurfaceSection title="Identity" subtitle={mesh.name}>
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

      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-fg-subtle">SubPart id</span>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-left font-mono text-[11px] text-fg-muted hover:bg-wash-hover"
          title="Copy to clipboard"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(mesh.subPartId)
              .then(() => status('SubPart id copied', { severity: 'success' }));
          }}
        >
          <span className="min-w-0 flex-1 truncate">{mesh.subPartId}</span>
          <Copy size={11} className="shrink-0 text-fg-subtle" />
        </button>
        <span className="text-[11px] leading-snug text-fg-subtle">
          == GLB node name == Assets.xml id. Never changes on rename.
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-fg-subtle">Kind</span>
        <span className="text-xs text-fg-muted">{kindCaption(mesh)}</span>
      </div>

      {mesh.primitive && <PrimitiveParams mesh={mesh} spec={mesh.primitive} />}
    </SurfaceSection>
  );
}

/** `Primitive · Box` / `Imported glTF` / `Kitten · Hunter` (design §1.3). */
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

/**
 * The per-kind dimension fields, from the SAME `PARAM_FIELDS` table the creation dialog
 * renders. Every field is a `PreciseNumberInput` (`useNumberDraft` + `inputMode="url"`) so
 * mid-edit values like `.06` and `-` stay typeable and Escape reverts the field.
 */
function PrimitiveParams({ mesh, spec }: { mesh: CustomMesh; spec: PrimitiveSpec }) {
  const params = spec.params as unknown as Record<string, number>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {PARAM_FIELDS[spec.kind].map((field) => (
        <label key={field.key} className="flex flex-col gap-1">
          <span className="text-xs text-fg-subtle">{field.label}</span>
          <PreciseNumberInput
            aria-label={field.label}
            value={params[field.key] ?? 0}
            min={0}
            onCommit={(n) => {
              if (n === params[field.key]) return;
              // A fresh spec object, never a mutation of the document's own (Rules of React
              // + the store clones on write anyway).
              const next = {
                kind: spec.kind,
                params: { ...params, [field.key]: n },
              } as unknown as PrimitiveSpec;
              void updateCustomMesh(mesh.id, { primitive: next });
            }}
          />
        </label>
      ))}
    </div>
  );
}
