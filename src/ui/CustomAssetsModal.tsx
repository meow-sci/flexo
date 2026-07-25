import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Palette, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogHeader,
  GridList,
  GridListItem,
  ListBoxItem,
  Modal,
  SectionTitle,
  Select,
} from './kit'
import { $part, addSubPart } from '../state/editorStore'
import {
  $customTextureUrls,
  openImportModel,
  planImportRemoval,
  removeCustomMaterial,
  removeCustomMesh,
  removeCustomTexture,
  removeImport,
  setManagingMeshId,
  setTextureChannel,
} from '../state/customAssetStore'
import { MaterialDialog } from './MaterialDialog'
import { CHANNEL_LABELS } from './channelLabels'
import {
  materialTextureIds,
  meshKind,
  type CustomMaterial,
  type CustomMesh,
  type CustomTexture,
  type EditingPart,
  type ImportedMeshSource,
  type TextureChannel,
} from '../ksa/types'

/** One import batch (one dropped glTF file) as the "Imported models" section shows it. */
interface ImportBatch {
  importId: string
  sourceFile: string
  meshes: (CustomMesh & { imported: ImportedMeshSource })[]
  placements: number
  triangles: number
  /** The textures this batch's SubParts are dressed in (via their materials). */
  textures: CustomTexture[]
}

/**
 * Groups the imported SubParts by their import batch, in first-appearance order.
 *
 * The batch's textures are RESOLVED, not tagged: whatever its meshes' materials point at
 * today — which is what the user actually sees on them, and stays truthful after a material
 * re-assignment (the same reference-counting stance as `planImportRemoval`).
 */
function groupImports(part: EditingPart): ImportBatch[] {
  const byId = new Map<string, ImportBatch>()
  for (const m of part.customMeshes) {
    if (meshKind(m) !== 'imported' || !m.imported) continue
    const imported = m.imported
    let batch = byId.get(imported.importId)
    if (!batch) {
      batch = {
        importId: imported.importId,
        sourceFile: imported.sourceFile,
        meshes: [],
        placements: 0,
        triangles: 0,
        textures: [],
      }
      byId.set(imported.importId, batch)
    }
    batch.meshes.push({ ...m, imported })
    batch.triangles += imported.triangles
    batch.placements += part.placements.filter((pl) => pl.subPartTemplateId === m.subPartId).length
  }
  for (const batch of byId.values()) {
    const texIds = new Set<string>()
    for (const m of batch.meshes) {
      const mat = m.materialId ? part.customMaterials.find((x) => x.id === m.materialId) : undefined
      if (mat) for (const id of materialTextureIds(mat)) texIds.add(id)
    }
    batch.textures = part.customTextures.filter((t) => texIds.has(t.id))
  }
  return [...byId.values()]
}

/** "3 SubParts, 5 placements, 2 materials, 4 textures" — the confirm dialog's inventory. */
function removalSummary(counts: {
  meshes: number
  placements: number
  materials: number
  textures: number
}): string {
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  return [
    plural(counts.meshes, 'SubPart'),
    plural(counts.placements, 'placement'),
    plural(counts.materials, 'material'),
    plural(counts.textures, 'texture'),
  ].join(', ')
}

/**
 * Management hub for the project's custom assets (uploaded textures + created
 * primitive meshes + imported models). Replaces the old floating CustomAssetsPanel: a texture
 * list (delete), a material list (edit / delete), a mesh list (add a new instance to the
 * scene — which dismisses the modal — manage that mesh's textures, or delete it), and one
 * group per imported model (its SubParts + "Remove import"). Creating textures/meshes stays
 * in the top toolbar's Add menu. Deletes are confirmed since they ripple (a deleted texture is
 * cleared from faces; a deleted mesh removes its instances).
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
  // Three disjoint mesh kinds, three different homes: part-ified kitten submeshes are managed
  // as placed SubParts on their layer (not here at all), imported ones get their own
  // per-batch section below, and the "Meshes" list is the hand-authored primitives.
  const customMeshes = part.customMeshes.filter((m) => meshKind(m) === 'primitive')
  const batches = groupImports(part)
  const [pendingTexture, setPendingTexture] = useState<CustomTexture | null>(null)
  const [pendingMesh, setPendingMesh] = useState<CustomMesh | null>(null)
  const [pendingMaterial, setPendingMaterial] = useState<CustomMaterial | null>(null)
  const [pendingImport, setPendingImport] = useState<ImportBatch | null>(null)
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null)

  const textureFaceUses = (id: string) =>
    customMeshes.reduce(
      (n, m) => n + Object.values(m.faceTextures).filter((f) => f?.textureId === id).length,
      0,
    )
  const meshInstanceCount = (m: CustomMesh) =>
    part.placements.filter((p) => p.subPartTemplateId === m.subPartId).length
  // Imported SubParts wear materials too — count every non-kitten mesh (kitten submeshes
  // carry their own KSA PBR set and never reference a CustomMaterial).
  const materialUses = (id: string) =>
    part.customMeshes.filter((m) => meshKind(m) !== 'kitten' && m.materialId === id).length
  const importRemoval = pendingImport ? planImportRemoval(part, pendingImport.importId) : null

  const addToScene = (m: CustomMesh) => {
    addSubPart(m.subPartId)
    onOpenChange(false)
  }
  const manageTextures = (m: CustomMesh) => {
    setManagingMeshId(m.id)
    onOpenChange(false)
  }
  /**
   * Re-import: hand the batch to the ONE import dialog in replace mode (it opens on its drop
   * step, since the point is to pick the file you just re-exported from Blender). This modal
   * closes — two stacked fullscreen modals would trap focus in the wrong one.
   */
  const replaceImport = (batch: ImportBatch) => {
    openImportModel([], batch.importId)
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
                      {/* Which PBR channel the image is for — changing re-encodes from source. */}
                      <Select
                        aria-label={`Channel for ${t.name}`}
                        value={t.channel ?? 'baseColor'}
                        onChange={(k) => void setTextureChannel(t.id, k as TextureChannel)}
                        className="w-44"
                      >
                        {(Object.keys(CHANNEL_LABELS) as TextureChannel[]).map((c) => (
                          <ListBoxItem key={c} id={c}>
                            {CHANNEL_LABELS[c]}
                          </ListBoxItem>
                        ))}
                      </Select>
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

            <section className="flex flex-col gap-2">
              <SectionTitle>Imported models ({batches.length})</SectionTitle>
              {batches.length === 0 ? (
                <p className="text-sm text-fg-subtle">
                  No imported models. Use “Import model…” in the Add menu, or drop a .glb onto the
                  viewport.
                </p>
              ) : (
                batches.map((batch) => (
                  <ImportBatchCard
                    key={batch.importId}
                    batch={batch}
                    instanceCount={meshInstanceCount}
                    onAddInstance={addToScene}
                    onManage={manageTextures}
                    onDeleteMesh={setPendingMesh}
                    onReplaceImport={() => replaceImport(batch)}
                    onRemoveImport={() => setPendingImport(batch)}
                  />
                ))
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

      <ConfirmDialog
        isOpen={pendingImport != null}
        onOpenChange={(open) => !open && setPendingImport(null)}
        title={`Remove import “${pendingImport?.sourceFile ?? ''}”`}
        text={
          importRemoval && (
            <>
              <p>
                {removalSummary({
                  meshes: importRemoval.meshIds.length,
                  placements: importRemoval.placements,
                  materials: importRemoval.materialIds.length,
                  textures: importRemoval.textureIds.length,
                })}{' '}
                will be removed. Materials and textures still used by another mesh are kept.
              </p>
              <p className="mt-2 text-warning">
                The imported geometry and textures are deleted from browser storage and cannot be
                restored by undo.
              </p>
            </>
          )
        }
        confirmLabel="Remove import"
        confirmVariant="danger"
        onConfirm={() => pendingImport && void removeImport(pendingImport.importId)}
      />

      {editingMaterialId && (
        <MaterialDialog materialId={editingMaterialId} onClose={() => setEditingMaterialId(null)} />
      )}
    </>
  )
}

/**
 * One imported model: a header with the batch's provenance + totals, then its SubParts as a
 * GridList (rows carry their own buttons, so GridList not ListBox — see AGENTS.md), then the
 * batch-wide "Remove import".
 */
function ImportBatchCard({
  batch,
  instanceCount,
  onAddInstance,
  onManage,
  onDeleteMesh,
  onReplaceImport,
  onRemoveImport,
}: {
  batch: ImportBatch
  instanceCount: (m: CustomMesh) => number
  onAddInstance: (m: CustomMesh) => void
  onManage: (m: CustomMesh) => void
  onDeleteMesh: (m: CustomMesh) => void
  onReplaceImport: () => void
  onRemoveImport: () => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-panel-sunken/40 p-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm" title={batch.importId}>
          {batch.sourceFile}
          <span className="ml-2 text-xs text-fg-subtle">
            {batch.meshes.length} SubPart{batch.meshes.length === 1 ? '' : 's'} · {batch.placements}{' '}
            placement{batch.placements === 1 ? '' : 's'} · {batch.triangles.toLocaleString()} tris
          </span>
        </span>
        {/* Iteration: re-export from Blender, drop the new file here, and the SubParts that
            kept their object+material name keep their identity (customAssetStore.replaceImport). */}
        <Button size="sm" variant="secondary" onPress={onReplaceImport}>
          <RefreshCw size={14} />
          Replace…
        </Button>
        <Button size="sm" variant="danger-ghost" onPress={onRemoveImport}>
          Remove import
        </Button>
      </div>

      <GridList aria-label={`SubParts from ${batch.sourceFile}`} className="gap-1 p-0">
        {batch.meshes.map((m) => (
          <GridListItem key={m.id} id={m.id} textValue={m.name} className="px-1">
            <span className="flex min-w-0 flex-1 flex-col" title={m.subPartId}>
              <span className="truncate">
                {m.name}
                <span className="ml-1 text-xs text-fg-subtle">
                  {instanceCount(m)}× · {m.imported.triangles.toLocaleString()} tris
                </span>
              </span>
              <span className="truncate text-xs text-fg-subtle">
                {m.imported.sourceNode} · {m.imported.sourceMaterial}
              </span>
            </span>
            <Button size="sm" variant="secondary" onPress={() => onAddInstance(m)}>
              <Plus size={14} />
              Add instance
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Manage ${m.name}`}
              onPress={() => onManage(m)}
            >
              <Palette size={16} />
            </Button>
            <Button
              size="sm"
              variant="danger-ghost"
              aria-label={`Delete SubPart ${m.name}`}
              onPress={() => onDeleteMesh(m)}
            >
              <Trash2 size={16} />
            </Button>
          </GridListItem>
        ))}
      </GridList>

      {batch.textures.length > 0 && (
        <p className="text-xs text-fg-subtle">
          Textures: {batch.textures.map((t) => t.name).join(', ')}
        </p>
      )}
    </div>
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
