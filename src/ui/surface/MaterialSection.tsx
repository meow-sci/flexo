import { useStore } from '@nanostores/react';
import { Button, ListBoxItem, Select } from '../kit';
import { SurfaceSection } from './SurfaceSection';
import { $part } from '../../state/editorStore';
import { setMeshMaterial } from '../../state/customAssetStore';
import { openDialog } from '../../state/dialogStore';
import type { CustomMesh } from '../../ksa/types';

/**
 * **Material** — whole-mesh material assignment (design: design-surface-assets.md §1.3
 * "Material", D9; census §1.6).
 *
 * `✎ Edit` / `＋ New` open `MaterialDialog` as a NORMAL OVERLAY dialog (nothing else is open
 * when the Surface sidebar is showing), which is half of D9's "same component, two mounts,
 * zero stacked modals" — the Asset Manager pushes the same form as a view instead. Creating
 * from here auto-assigns the result to this mesh (v1 behaviour kept), which is what the
 * dialog's `assignToMeshId` param carries.
 *
 * **Undo enrollment**: `setMeshMaterial` pushes its own discrete step; the dialog's Save
 * pushes one of its own. Nothing here pushes anything.
 */
export function MaterialSection({ mesh }: { mesh: CustomMesh }) {
  const part = useStore($part);
  const material = mesh.materialId
    ? part.customMaterials.find((m) => m.id === mesh.materialId)
    : undefined;

  // A face's own texture overrides the material's base color on THAT face, but KSA gets one
  // material per SubPart — so a mesh mixing several face textures exports lossily. Verbatim
  // v1 wording (parity row 1.6).
  const distinctFaceTextures = new Set(
    Object.values(mesh.faceTextures)
      .map((f) => f?.textureId)
      .filter(Boolean),
  );

  return (
    <SurfaceSection title="Material">
      <Select
        aria-label="Material"
        size="sm"
        selectedKey={mesh.materialId ?? ''}
        onSelectionChange={(k) => void setMeshMaterial(mesh.id, k ? String(k) : undefined)}
      >
        <ListBoxItem id="">(none)</ListBoxItem>
        {part.customMaterials.map((m) => (
          <ListBoxItem key={m.id} id={m.id}>
            {m.name}
          </ListBoxItem>
        ))}
      </Select>
      <div className="flex items-center gap-2">
        {material && (
          <Button
            size="sm"
            variant="secondary"
            onPress={() => openDialog({ id: 'material', params: { materialId: material.id } })}
          >
            ✎ Edit
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onPress={() => openDialog({ id: 'material', params: { assignToMeshId: mesh.id } })}
        >
          ＋ New
        </Button>
        {material && material.metalness.kind === 'value' && material.roughness.kind === 'value' && (
          <span className="ml-auto font-mono text-[11px] text-fg-subtle">
            M {Math.round(material.metalness.value * 100)}% · R{' '}
            {Math.round(material.roughness.value * 100)}%
          </span>
        )}
      </div>
      {distinctFaceTextures.size > 1 && (
        <p className="text-[11px] leading-snug text-warning">
          Faces use {distinctFaceTextures.size} different textures — the KSA export applies the
          first face’s texture to the whole mesh.
        </p>
      )}
    </SurfaceSection>
  );
}
