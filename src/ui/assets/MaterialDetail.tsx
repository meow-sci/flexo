import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button, InlineConfirmStrip } from '../kit';
import { $part } from '../../state/editorStore';
import { $assetUsage, addCustomMaterial } from '../../state/customAssetStore';
import { status } from '../../state/statusStore';
import { MaterialForm } from '../MaterialDialog';
import { useManagerNav } from './managerNav';
import { deleteMaterialLabel, deleteMaterialNow, requestDeleteMaterial } from './assetActions';

/**
 * **Material detail** (design: design-surface-assets.md §2.2 "Material"; D9 host #2): the
 * SAME `MaterialForm` the Surface sidebar opens as an overlay dialog, mounted here as a
 * pushed view — one component, two hosts, never a stacked modal. With no `materialId` it is
 * the manager's create form (`＋ New ▾ ▸ New Material…`).
 *
 * Around the form: `Duplicate`, the where-used mesh list, and delete under the §5.1 matrix
 * (a material is descriptor-only, so >0 uses asks inline with the count and 0 uses just does
 * it and offers `[Undo]`; no byte warning — no material owns bytes).
 *
 * **Undo enrollment**: one discrete step per save / duplicate / delete, all inside the store.
 */
export function MaterialDetail({ materialId }: { materialId?: string }) {
  const nav = useManagerNav();
  const part = useStore($part);
  const usage = useStore($assetUsage);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const material = materialId ? part.customMaterials.find((m) => m.id === materialId) : undefined;
  const meshes = material ? (usage.material.get(material.id)?.meshes ?? []) : [];

  const duplicate = async () => {
    if (!material) return;
    setBusy(true);
    try {
      const { id: _id, name, ...channels } = material;
      await addCustomMaterial(`${name} copy`, channels);
      status(`Duplicated “${name}”`);
      nav.reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col overflow-y-auto">
      <MaterialForm materialId={materialId} onSaved={nav.pop} onCancel={nav.pop} />

      {material && (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <section className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Where used
            </span>
            {meshes.length === 0 ? (
              <p className="text-xs text-fg-subtle">No mesh wears this material.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {meshes.map((meshId) => (
                  <Button
                    key={meshId}
                    size="xs"
                    variant="secondary"
                    onPress={() => nav.openDetail('mesh', meshId)}
                  >
                    {part.customMeshes.find((m) => m.id === meshId)?.name ?? 'mesh'}
                  </Button>
                ))}
              </div>
            )}
          </section>

          {confirmDelete ? (
            <InlineConfirmStrip
              label={deleteMaterialLabel(material, usage)}
              confirmLabel="Delete"
              onConfirm={() => {
                setConfirmDelete(false);
                deleteMaterialNow(material);
                nav.reset();
              }}
              onCancel={() => setConfirmDelete(false)}
            />
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={busy}
                onPress={() => void duplicate()}
              >
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="danger-ghost"
                onPress={() => {
                  // Returns true when it deleted outright (0 uses) — the view's subject is
                  // gone, so fall back to the list rather than render a dead detail.
                  if (requestDeleteMaterial(material, usage, () => setConfirmDelete(true))) {
                    nav.reset();
                  }
                }}
              >
                Delete material…
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
