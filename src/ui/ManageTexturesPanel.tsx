import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { X } from 'lucide-react'
import { Button as AriaButton } from 'react-aria-components'
import { Modal, Dialog, DialogHeader, Button, Select, ListBoxItem, TextField, useIsPhone } from './kit'
import { $part } from '../state/editorStore'
import { $managingMeshId, setManagingMeshId, updateMeshFaceConfig } from '../state/customAssetStore'
import { PRIMITIVE_FACE_KEYS, FACE_LABELS } from '../three/primitives'
import type { FaceTextureConfig, TextureWrap } from '../ksa/types'

const DEFAULT_CONFIG: FaceTextureConfig = {
  textureId: '',
  uvScale: { x: 1, y: 1 },
  uvOffset: { x: 0, y: 0 },
  wrap: 'repeat',
}

const WRAP_LABELS: { id: TextureWrap; label: string }[] = [
  { id: 'repeat', label: 'Tile (repeat)' },
  { id: 'mirror', label: 'Mirror' },
  { id: 'clamp', label: 'Stretch edge' },
]

/**
 * Floating panel for per-face texture + UV configuration on a custom mesh.
 * Rendered at the app root level so it floats over the 3D viewport.
 *
 * Desktop: absolute-positioned card on the left side (mirrors ContainerEditor).
 * Mobile: fullscreen modal.
 *
 * State is driven by $managingMeshId — set to a mesh id to open, null to close.
 */
export function ManageTexturesPanel() {
  const meshId = useStore($managingMeshId)
  const part = useStore($part)
  const isPhone = useIsPhone()

  const mesh = meshId ? part.customMeshes.find((m) => m.id === meshId) : undefined

  const faceKeys = mesh ? PRIMITIVE_FACE_KEYS[mesh.primitive.kind] : []
  // Persists the last user-chosen face; falls back to the first key when the mesh
  // changes (new faceKeys no longer include the stored value).
  const [selectedFace, setSelectedFace] = useState(faceKeys[0] ?? '')
  const activeFace = faceKeys.includes(selectedFace) ? selectedFace : (faceKeys[0] ?? '')

  const update = useCallback(
    (faceKey: string, patch: Partial<FaceTextureConfig>) => {
      const currentMesh = $part.get().customMeshes.find((m) => m.id === meshId)
      const existing = currentMesh?.faceTextures[faceKey] ?? DEFAULT_CONFIG
      void updateMeshFaceConfig(meshId!, faceKey, { ...existing, ...patch })
    },
    [meshId],
  )

  if (!mesh) return null

  const currentConfig: FaceTextureConfig = mesh.faceTextures[activeFace] ?? DEFAULT_CONFIG
  const close = () => setManagingMeshId(null)

  const inner = (
    <PanelContent
      faceKeys={faceKeys}
      selectedFace={activeFace}
      onFaceChange={setSelectedFace}
      currentConfig={currentConfig}
      update={update}
      onClose={close}
    />
  )

  if (isPhone) {
    return (
      <Modal isOpen onOpenChange={(v) => !v && close()} isDismissable variant="fullscreen">
        <Dialog>
          <DialogHeader title={`Textures: ${mesh.name}`} onClose={close} />
          <div className="overflow-y-auto p-4">{inner}</div>
        </Dialog>
      </Modal>
    )
  }

  return (
    <div className="absolute left-3 top-1/2 z-10 w-64 -translate-y-1/2 rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle">
          {mesh.primitive.kind} · {mesh.name}
        </span>
        <AriaButton
          onPress={close}
          aria-label="Close"
          className="flex size-6 items-center justify-center rounded text-fg-subtle outline-none hover:bg-white/10 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X size={14} />
        </AriaButton>
      </div>
      {inner}
    </div>
  )
}

interface PanelContentProps {
  faceKeys: readonly string[]
  selectedFace: string
  onFaceChange: (key: string) => void
  currentConfig: FaceTextureConfig
  update: (faceKey: string, patch: Partial<FaceTextureConfig>) => void
  onClose: () => void
}

function PanelContent({
  faceKeys,
  selectedFace,
  onFaceChange,
  currentConfig,
  update,
  onClose,
}: PanelContentProps) {
  const part = useStore($part)

  return (
    <div className="flex flex-col gap-3">
      {/* Face selector — hidden when there is only one face (sphere/plane). */}
      {faceKeys.length > 1 && (
        <Select
          label="Face"
          selectedKey={selectedFace}
          onSelectionChange={(k) => onFaceChange(String(k))}
        >
          {faceKeys.map((key) => (
            <ListBoxItem key={key} id={key}>
              {FACE_LABELS[key] ?? key}
            </ListBoxItem>
          ))}
        </Select>
      )}

      {/* Texture for this face */}
      <Select
        label="Texture"
        selectedKey={currentConfig.textureId}
        onSelectionChange={(k) => update(selectedFace, { textureId: String(k) })}
      >
        <ListBoxItem id="">(none)</ListBoxItem>
        {part.customTextures.map((t) => (
          <ListBoxItem key={t.id} id={t.id}>
            {t.name}
          </ListBoxItem>
        ))}
      </Select>

      {/* Wrap mode — how the texture behaves where UVs exceed 0–1 (scale > 1, or
          an offset that pushes past an edge). Disabled when no texture is set. */}
      <Select
        label="Wrap"
        selectedKey={currentConfig.wrap ?? 'repeat'}
        onSelectionChange={(k) => update(selectedFace, { wrap: k as TextureWrap })}
        isDisabled={!currentConfig.textureId}
      >
        {WRAP_LABELS.map(({ id, label }) => (
          <ListBoxItem key={id} id={id}>
            {label}
          </ListBoxItem>
        ))}
      </Select>

      {/* UV Scale */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-fg-muted">UV Scale</span>
        <p className="text-[11px] leading-snug text-fg-subtle">
          &gt;1 tiles the image, &lt;1 zooms into a region (pan it with offset).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <UvNumberField
            label="X"
            value={currentConfig.uvScale.x}
            onChange={(x) => update(selectedFace, { uvScale: { ...currentConfig.uvScale, x } })}
          />
          <UvNumberField
            label="Y"
            value={currentConfig.uvScale.y}
            onChange={(y) => update(selectedFace, { uvScale: { ...currentConfig.uvScale, y } })}
          />
        </div>
      </div>

      {/* UV Offset */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-fg-muted">UV Offset</span>
        <div className="grid grid-cols-2 gap-2">
          <UvNumberField
            label="X"
            value={currentConfig.uvOffset.x}
            onChange={(x) => update(selectedFace, { uvOffset: { ...currentConfig.uvOffset, x } })}
          />
          <UvNumberField
            label="Y"
            value={currentConfig.uvOffset.y}
            onChange={(y) => update(selectedFace, { uvOffset: { ...currentConfig.uvOffset, y } })}
          />
        </div>
      </div>

      <Button size="sm" variant="ghost" className="mt-1 self-end" onPress={onClose}>
        Close
      </Button>
    </div>
  )
}

/**
 * Numeric input for UV values. Maintains a local string draft so cursor position
 * is stable while typing. Commits on blur or Enter; resets on Escape or bad input.
 */
function UvNumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState(() => formatNum(value))
  const committed = useRef(value)

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value
      setDraft(formatNum(value))
    }
  }, [value])

  const commit = useCallback(() => {
    const n = parseFloat(draft)
    if (!isNaN(n)) {
      committed.current = n
      onChange(n)
      setDraft(formatNum(n))
    } else {
      setDraft(formatNum(committed.current))
    }
  }, [draft, onChange])

  return (
    <TextField
      label={label}
      size="sm"
      inputMode="decimal"
      value={draft}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          setDraft(formatNum(committed.current))
        }
      }}
    />
  )
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(4).replace(/\.?0+$/, '') || '0'
}
