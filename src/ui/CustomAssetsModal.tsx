import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Palette, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, Dialog, DialogHeader, Modal, SectionTitle } from './kit'
import { $part, addSubPart } from '../state/editorStore'
import {
  $customTextureUrls,
  removeCustomMaterial,
  removeCustomMesh,
  removeCustomTexture,
  setManagingMeshId,
} from '../state/customAssetStore'
import { MaterialDialog } from './MaterialDialog'
import type { CustomMaterial, CustomMesh, CustomTexture } from '../ksa/types'

/**
 * Management hub for the project's custom assets (uploaded textures + created
 * primitive meshes). Replaces the old floating CustomAssetsPanel: a texture list
 * (delete) and a mesh list (add a new instance to the scene — which dismisses the
 * modal — manage that mesh's textures, or delete it). Creating textures/meshes
 * stays in the top toolbar's Add menu. Deletes are confirmed since they ripple
 * (a deleted texture is cleared from faces; a deleted mesh removes its instances).
 */
export function CustomAssetsModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const part = useStore($part)
  const thumbs = useStore($customTextureUrls)
  const { customTextures } = part
  // Part-ified kitten submeshes are managed as placed SubParts on their layer, not as
  // editable primitives — keep them out of the custom-mesh manager.
  const customMeshes = part.customMeshes.filter((m) => !m.kitten)
  const [pendingTexture, setPendingTexture] = useState<CustomTexture | null>(null)
  const [pendingMesh, setPendingMesh] = useState<CustomMesh | null>(null)
  const [pendingMaterial, setPendingMaterial] = useState<CustomMaterial | null>(null)
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null)

  const textureFaceUses = (id: string) =>
    customMeshes.reduce(
      (n, m) => n + Object.values(m.faceTextures).filter((f) => f?.textureId === id).length,
      0,
    )
  const meshInstanceCount = (m: CustomMesh) =>
    part.placements.filter((p) => p.subPartTemplateId === m.subPartId).length
  const materialUses = (id: string) => customMeshes.filter((m) => m.materialId === id).length

  const addToScene = (m: CustomMesh) => {
    addSubPart(m.subPartId)
    onOpenChange(false)
  }
  const manageTextures = (m: CustomMesh) => {
    setManagingMeshId(m.id)
    onOpenChange(false)
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isDismissable
        variant="fullscreen"
        className="max-w-2xl"
      >
        <Dialog>
          <DialogHeader title="Custom Assets" onClose={() => onOpenChange(false)} />
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
            <section className="flex flex-col gap-2">
              <SectionTitle>Textures ({customTextures.length})</SectionTitle>
              {customTextures.length === 0 ? (
                <p className="text-sm text-fg-subtle">
                  No textures. Use “Upload texture…” in the Add menu.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {customTextures.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-white/[0.04]"
                    >
                      <span className="h-9 w-9 shrink-0 overflow-hidden rounded border border-border bg-panel-sunken">
                        {thumbs[t.id] && (
                          <img
                            src={thumbs[t.id]}
                            alt={t.name}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={`${t.name} (${t.width}×${t.height})`}
                      >
                        {t.name}
                        <span className="ml-1 text-xs text-fg-subtle">
                          {t.width}×{t.height}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="danger-ghost"
                        aria-label={`Delete texture ${t.name}`}
                        onPress={() => setPendingTexture(t)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <SectionTitle>Materials ({part.customMaterials.length})</SectionTitle>
              {part.customMaterials.length === 0 ? (
                <p className="text-sm text-fg-subtle">
                  No materials. Use “Create material…” in the Add menu.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {part.customMaterials.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-white/[0.04]"
                    >
                      <MaterialSwatch material={m} thumbs={thumbs} />
                      <span className="min-w-0 flex-1 truncate" title={m.id}>
                        {m.name}
                        <span className="ml-1 font-mono text-xs text-fg-subtle">
                          {materialSummary(m)}
                        </span>
                      </span>
                      <span className="text-xs text-fg-subtle">
                        {materialUses(m.id)} mesh{materialUses(m.id) === 1 ? '' : 'es'}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit material ${m.name}`}
                        onPress={() => setEditingMaterialId(m.id)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-ghost"
                        aria-label={`Delete material ${m.name}`}
                        onPress={() => setPendingMaterial(m)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <SectionTitle>Meshes ({customMeshes.length})</SectionTitle>
              {customMeshes.length === 0 ? (
                <p className="text-sm text-fg-subtle">
                  No meshes. Use “Create mesh…” in the Add menu.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {customMeshes.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-white/[0.04]"
                    >
                      <span className="min-w-0 flex-1 truncate" title={m.subPartId}>
                        {m.name}{' '}
                        <span className="text-xs text-fg-subtle">({m.primitive?.kind})</span>
                      </span>
                      <Button size="sm" variant="secondary" onPress={() => addToScene(m)}>
                        <Plus size={14} />
                        Add instance
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Manage textures for ${m.name}`}
                        onPress={() => manageTextures(m)}
                      >
                        <Palette size={16} />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-ghost"
                        aria-label={`Delete mesh ${m.name}`}
                        onPress={() => setPendingMesh(m)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Dialog>
      </Modal>

      <ConfirmDialog
        isOpen={pendingTexture != null}
        onOpenChange={(open) => !open && setPendingTexture(null)}
        title={`Delete texture “${pendingTexture?.name ?? ''}”`}
        text={
          pendingTexture
            ? textureFaceUses(pendingTexture.id) > 0
              ? `This texture is used on ${textureFaceUses(pendingTexture.id)} face${textureFaceUses(pendingTexture.id) === 1 ? '' : 's'}; those faces will become untextured.`
              : 'This texture is not used by any mesh.'
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => pendingTexture && removeCustomTexture(pendingTexture.id)}
      />

      <ConfirmDialog
        isOpen={pendingMesh != null}
        onOpenChange={(open) => !open && setPendingMesh(null)}
        title={`Delete mesh “${pendingMesh?.name ?? ''}”`}
        text={
          pendingMesh
            ? meshInstanceCount(pendingMesh) > 0
              ? `${meshInstanceCount(pendingMesh)} scene instance${meshInstanceCount(pendingMesh) === 1 ? '' : 's'} of this mesh will also be removed.`
              : 'This mesh has no instances in the scene.'
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => pendingMesh && void removeCustomMesh(pendingMesh.id)}
      />

      <ConfirmDialog
        isOpen={pendingMaterial != null}
        onOpenChange={(open) => !open && setPendingMaterial(null)}
        title={`Delete material “${pendingMaterial?.name ?? ''}”`}
        text={
          pendingMaterial
            ? materialUses(pendingMaterial.id) > 0
              ? `${materialUses(pendingMaterial.id)} mesh${materialUses(pendingMaterial.id) === 1 ? '' : 'es'} use this material; they'll revert to the neutral look.`
              : 'This material is not used by any mesh.'
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => pendingMaterial && void removeCustomMaterial(pendingMaterial.id)}
      />

      {editingMaterialId && (
        <MaterialDialog materialId={editingMaterialId} onClose={() => setEditingMaterialId(null)} />
      )}
    </>
  )
}

/** Small preview chip: the picked color, or the base-color image thumbnail. */
function MaterialSwatch({
  material,
  thumbs,
}: {
  material: CustomMaterial
  thumbs: Record<string, string>
}) {
  const base = material.baseColor
  return (
    <span className="h-9 w-9 shrink-0 overflow-hidden rounded border border-border bg-panel-sunken">
      {base.kind === 'color' ? (
        <span
          className="block h-full w-full"
          style={{ backgroundColor: `rgb(${base.color.r} ${base.color.g} ${base.color.b})` }}
        />
      ) : (
        thumbs[base.textureId] && (
          <img src={thumbs[base.textureId]} alt="" className="h-full w-full object-cover" />
        )
      )}
    </span>
  )
}

/** Compact metal/rough readout, e.g. "M 100% · R 15%" (uniform channels only). */
function materialSummary(m: CustomMaterial): string {
  const pct = (c: CustomMaterial['metalness']) =>
    c.kind === 'value' ? `${Math.round(c.value * 100)}%` : 'map'
  return `M ${pct(m.metalness)} · R ${pct(m.roughness)}`
}
