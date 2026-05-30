import { useState } from 'react'
import { useStore } from '@nanostores/react'
import {
  Modal,
  Dialog,
  DialogHeader,
  Button,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Select,
  ListBoxItem,
  toast,
} from './kit'
import { $part } from '../state/editorStore'
import { addCustomMesh } from '../state/customAssetStore'
import { DEFAULT_PRIMITIVE_PARAMS, PRIMITIVE_KINDS, PRIMITIVE_LABELS } from '../three/primitives'
import type { PrimitiveKind, PrimitiveSpec } from '../ksa/types'

interface CreateMeshDialogProps {
  onClose: () => void
}

/**
 * Create a primitive mesh (box/cylinder/sphere/plane), set its dimensions, and
 * apply a custom texture. On confirm it becomes a custom SubPart template, is
 * placed in the scene, and selected. v1 = one texture stretched across the mesh.
 *
 * Mounted only while open (see AddButton) so per-open state initializes via
 * useState with no reset effect.
 */
export function CreateMeshDialog({ onClose }: CreateMeshDialogProps) {
  const part = useStore($part)
  const textures = part.customTextures
  const [kind, setKind] = useState<PrimitiveKind>('box')
  const [params, setParams] = useState<Record<string, number>>({ ...DEFAULT_PRIMITIVE_PARAMS.box })
  const [name, setName] = useState('Panel')
  const [textureId, setTextureId] = useState<string>(() => textures[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  const changeKind = (k: PrimitiveKind) => {
    setKind(k)
    setParams({ ...(DEFAULT_PRIMITIVE_PARAMS[k] as unknown as Record<string, number>) })
  }

  const buildSpec = (): PrimitiveSpec => {
    switch (kind) {
      case 'box':
        return { kind, params: { width: params.width, height: params.height, depth: params.depth } }
      case 'cylinder':
        return {
          kind,
          params: { radius: params.radius, height: params.height, radialSegments: params.radialSegments },
        }
      case 'sphere':
        return { kind, params: { radius: params.radius, segments: params.segments } }
      case 'plane':
        return { kind, params: { width: params.width, height: params.height } }
    }
  }

  const submit = async () => {
    setBusy(true)
    try {
      await addCustomMesh({ name, primitive: buildSpec(), textureId })
      toast({ title: 'Mesh created', description: name, variant: 'success' })
      onClose()
    } catch (err) {
      console.warn('mesh create failed', err)
      toast({ title: 'Create failed', description: String((err as Error)?.message ?? err), variant: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const fields = PARAM_FIELDS[kind]

  return (
    <Modal isOpen onOpenChange={(v) => !v && onClose()} isDismissable variant="fullscreen" className="max-w-md">
      <Dialog>
        <DialogHeader title="Create mesh" onClose={onClose} />
        <div className="flex flex-col gap-3 p-3">
          <ToggleButtonGroup
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[kind]}
            onSelectionChange={(keys) => {
              const k = [...keys][0] as PrimitiveKind | undefined
              if (k) changeKind(k)
            }}
          >
            {PRIMITIVE_KINDS.map((k) => (
              <ToggleButton key={k} id={k} size="sm">
                {PRIMITIVE_LABELS[k]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <div className="grid grid-cols-2 gap-2">
            {fields.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                size="sm"
                value={String(params[f.key] ?? '')}
                onChange={(v) => {
                  const n = Number(v)
                  if (!Number.isNaN(n)) setParams((p) => ({ ...p, [f.key]: n }))
                }}
              />
            ))}
          </div>

          <TextField label="Name" value={name} onChange={setName} size="sm" />

          {textures.length > 0 ? (
            <Select label="Texture" selectedKey={textureId} onSelectionChange={(k) => setTextureId(String(k))}>
              <ListBoxItem id="">(none)</ListBoxItem>
              {textures.map((t) => (
                <ListBoxItem key={t.id} id={t.id}>
                  {t.name}
                </ListBoxItem>
              ))}
            </Select>
          ) : (
            <p className="text-xs text-fg-muted">No textures yet — upload one to texture this mesh.</p>
          )}

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" isDisabled={busy} onPress={submit}>
              {busy ? 'Creating…' : 'Create mesh'}
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  )
}

interface ParamField {
  key: string
  label: string
}

/** Editable numeric fields per primitive kind (keys match the param interfaces). */
const PARAM_FIELDS: Record<PrimitiveKind, ParamField[]> = {
  box: [
    { key: 'width', label: 'Width (m)' },
    { key: 'height', label: 'Height (m)' },
    { key: 'depth', label: 'Depth (m)' },
  ],
  cylinder: [
    { key: 'radius', label: 'Radius (m)' },
    { key: 'height', label: 'Height (m)' },
    { key: 'radialSegments', label: 'Segments' },
  ],
  sphere: [
    { key: 'radius', label: 'Radius (m)' },
    { key: 'segments', label: 'Segments' },
  ],
  plane: [
    { key: 'width', label: 'Width (m)' },
    { key: 'height', label: 'Height (m)' },
  ],
}
