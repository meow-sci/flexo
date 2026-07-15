import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { X } from 'lucide-react'
import { Button as AriaButton } from 'react-aria-components'
import {
  Modal,
  Dialog,
  DialogHeader,
  Button,
  Select,
  ListBoxItem,
  TextField,
  Switch,
  useIsPhone,
} from './kit'
import { ColorAlphaField } from './ColorAlphaField'
import { MaterialDialog } from './MaterialDialog'
import { $part } from '../state/editorStore'
import {
  $managingMeshId,
  setManagingMeshId,
  setMeshMaterial,
  updateMeshFaceConfig,
  setMeshGlow,
  setMeshGlass,
  setMeshSurface,
  setGlowPaintMeshId,
} from '../state/customAssetStore'
import { $simulateGlass, setSimulateGlass } from '../state/settingsStore'
import { PRIMITIVE_FACE_KEYS, FACE_LABELS } from '../three/primitives'
import type {
  CustomMesh,
  EmissiveConfig,
  FaceTextureConfig,
  TextureWrap,
  VisorSurface,
} from '../ksa/types'

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

const DEFAULT_GLOW: EmissiveConfig = {
  shape: 'whole',
  color: { r: 120, g: 220, b: 255 },
  strength: 0.6,
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = parseInt(hex.slice(1), 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

/**
 * Floating panel for per-mesh material editing on a custom mesh: a Glow (emissive) / visor-surface
 * section for every mesh, plus per-face texture + UV controls for primitive meshes. Rendered at the
 * app root so it floats over the 3D viewport (desktop card / mobile fullscreen modal). Driven by
 * $managingMeshId — set to a mesh id to open, null to close.
 */
export function ManageTexturesPanel() {
  const meshId = useStore($managingMeshId)
  const part = useStore($part)
  const isPhone = useIsPhone()

  const mesh = meshId ? part.customMeshes.find((m) => m.id === meshId) : undefined

  // Per-face textures only exist for primitive meshes (kitten submeshes carry their own material).
  const faceKeys = mesh?.primitive ? PRIMITIVE_FACE_KEYS[mesh.primitive.kind] : []
  const [selectedFace, setSelectedFace] = useState(faceKeys[0] ?? '')
  const activeFace = faceKeys.includes(selectedFace) ? selectedFace : (faceKeys[0] ?? '')

  const update = (faceKey: string, patch: Partial<FaceTextureConfig>) => {
    const currentMesh = $part.get().customMeshes.find((m) => m.id === meshId)
    const existing = currentMesh?.faceTextures[faceKey] ?? DEFAULT_CONFIG
    void updateMeshFaceConfig(meshId!, faceKey, { ...existing, ...patch })
  }

  if (!mesh) return null

  const currentConfig: FaceTextureConfig = mesh.faceTextures[activeFace] ?? DEFAULT_CONFIG
  const close = () => setManagingMeshId(null)

  const inner = (
    <PanelContent
      mesh={mesh}
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
          <DialogHeader title={mesh.name} onClose={close} />
          <div className="overflow-y-auto p-4">{inner}</div>
        </Dialog>
      </Modal>
    )
  }

  return (
    <div className="absolute left-3 top-1/2 z-10 w-64 -translate-y-1/2 rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle">
          {mesh.primitive?.kind ?? 'kitten'} · {mesh.name}
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
  mesh: CustomMesh
  faceKeys: readonly string[]
  selectedFace: string
  onFaceChange: (key: string) => void
  currentConfig: FaceTextureConfig
  update: (faceKey: string, patch: Partial<FaceTextureConfig>) => void
  onClose: () => void
}

function PanelContent({
  mesh,
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
      {/* Material — primitive meshes only (kitten submeshes carry their own KSA PBR set). */}
      {mesh.primitive && <MaterialSection mesh={mesh} />}

      <GlowSection mesh={mesh} />

      {/* Per-face texture controls — primitive meshes only. */}
      {mesh.primitive && (
        <>
          {/* Face selector — hidden when there is only one face (sphere/plane). */}
          {faceKeys.length > 1 && (
            <Select label="Face" value={selectedFace} onChange={(k) => onFaceChange(String(k))}>
              {faceKeys.map((key) => (
                <ListBoxItem key={key} id={key}>
                  {FACE_LABELS[key] ?? key}
                </ListBoxItem>
              ))}
            </Select>
          )}

          {/* Texture for this face — base-color images only (data maps live on the material). */}
          <Select
            label="Texture"
            value={currentConfig.textureId}
            onChange={(k) => update(selectedFace, { textureId: String(k) })}
          >
            <ListBoxItem id="">(none)</ListBoxItem>
            {part.customTextures
              .filter((t) => t.channel === 'baseColor')
              .map((t) => (
                <ListBoxItem key={t.id} id={t.id}>
                  {t.name}
                </ListBoxItem>
              ))}
          </Select>

          {/* Wrap mode — how the texture behaves where UVs exceed 0–1. Disabled when no texture. */}
          <Select
            label="Wrap"
            value={currentConfig.wrap ?? 'repeat'}
            onChange={(k) => update(selectedFace, { wrap: k as TextureWrap })}
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
                onChange={(x) =>
                  update(selectedFace, { uvOffset: { ...currentConfig.uvOffset, x } })
                }
              />
              <UvNumberField
                label="Y"
                value={currentConfig.uvOffset.y}
                onChange={(y) =>
                  update(selectedFace, { uvOffset: { ...currentConfig.uvOffset, y } })
                }
              />
            </div>
          </div>
        </>
      )}

      <Button size="sm" variant="ghost" className="mt-1 self-end" onPress={onClose}>
        Close
      </Button>
    </div>
  )
}

/**
 * Whole-mesh material assignment: pick one of the project's CustomMaterials (color /
 * metal / rough), edit it in place, or create a new one auto-assigned to this mesh.
 * A face's own texture still overrides the material's base color on that face —
 * flagged below when the mesh mixes several face textures (export uses the first).
 */
function MaterialSection({ mesh }: { mesh: CustomMesh }) {
  const part = useStore($part)
  const [dialog, setDialog] = useState<'closed' | 'edit' | 'create'>('closed')
  const material = mesh.materialId
    ? part.customMaterials.find((m) => m.id === mesh.materialId)
    : undefined

  const distinctFaceTextures = new Set(
    Object.values(mesh.faceTextures)
      .map((f) => f?.textureId)
      .filter(Boolean),
  )

  return (
    <SectionShell title="Material">
      <Select
        aria-label="Material"
        value={mesh.materialId ?? ''}
        onChange={(k) => void setMeshMaterial(mesh.id, k ? String(k) : undefined)}
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
          <Button size="sm" variant="secondary" onPress={() => setDialog('edit')}>
            Edit…
          </Button>
        )}
        <Button size="sm" variant="ghost" onPress={() => setDialog('create')}>
          New material…
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
      {dialog === 'edit' && material && (
        <MaterialDialog materialId={material.id} onClose={() => setDialog('closed')} />
      )}
      {dialog === 'create' && (
        <MaterialDialog
          onClose={() => setDialog('closed')}
          onCreated={(mat) => void setMeshMaterial(mesh.id, mat.id)}
        />
      )}
    </SectionShell>
  )
}

/** Glow / visor-surface controls — a visor (glass-capable) gets the Surface selector; others a Glow mode. */
function GlowSection({ mesh }: { mesh: CustomMesh }) {
  return mesh.kitten?.transparent ? (
    <VisorSurfaceControls mesh={mesh} />
  ) : (
    <GlowModeControls mesh={mesh} />
  )
}

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-panel-sunken/40 p-2">
      <span className="text-[11px] uppercase tracking-wide text-fg-subtle">{title}</span>
      {children}
    </div>
  )
}

function TintField({ mesh }: { mesh: CustomMesh }) {
  const glass = mesh.glass ?? { tint: { r: 120, g: 200, b: 255 }, opacity: 0.45 }
  return (
    <ColorAlphaField
      label="Tint"
      color={rgbToHex(glass.tint)}
      opacity={glass.opacity ?? 0.45}
      onChange={({ color, opacity }) =>
        void setMeshGlass(mesh.id, { tint: hexToRgb(color), opacity })
      }
    />
  )
}

/** Glow color + strength (the slider maps to emissive strength 0..1). */
function GlowColorField({ mesh }: { mesh: CustomMesh }) {
  const e = mesh.emissive ?? DEFAULT_GLOW
  return (
    <ColorAlphaField
      label="Glow"
      color={rgbToHex(e.color)}
      opacity={e.strength}
      onChange={({ color, opacity }) =>
        void setMeshGlow(mesh.id, { ...e, color: hexToRgb(color), strength: opacity })
      }
    />
  )
}

function VisorSurfaceControls({ mesh }: { mesh: CustomMesh }) {
  const simulate = useStore($simulateGlass)
  const surface: VisorSurface = mesh.surface ?? 'glass'
  const showGlass = surface === 'glass' || surface === 'glassGlow'
  const showGlow = surface === 'glow' || surface === 'glassGlow'
  return (
    <SectionShell title="Visor surface">
      <Select
        label="Surface"
        value={surface}
        onChange={(k) => void setMeshSurface(mesh.id, k as VisorSurface)}
      >
        <ListBoxItem id="glass">Glass (translucent)</ListBoxItem>
        <ListBoxItem id="glow">Glow (opaque)</ListBoxItem>
        <ListBoxItem id="glassGlow">Glass + Glow (layered)</ListBoxItem>
      </Select>
      {showGlass && (
        <>
          <TintField mesh={mesh} />
          <Switch isSelected={simulate} onChange={setSimulateGlass}>
            Simulate in-game glass
          </Switch>
        </>
      )}
      {showGlow && <GlowColorField mesh={mesh} />}
      <p className="text-[11px] leading-snug text-fg-subtle">
        In-game KSA renders glass darker/subtler than shown (it can&apos;t glow). “Glow” makes the
        visor opaque; “Glass + Glow” keeps it see-through with a glow layer behind it.
      </p>
    </SectionShell>
  )
}

function GlowModeControls({ mesh }: { mesh: CustomMesh }) {
  const mode = mesh.emissive?.shape ?? 'off'
  const setMode = (m: string) => {
    if (m === 'off') {
      void setMeshGlow(mesh.id, undefined)
      return
    }
    const base = mesh.emissive ?? DEFAULT_GLOW
    void setMeshGlow(mesh.id, {
      shape: m as 'whole' | 'painted',
      color: base.color,
      strength: base.strength,
    })
  }
  return (
    <SectionShell title="Glow (emissive)">
      <Select label="Mode" selectedKey={mode} onSelectionChange={(k) => setMode(String(k))}>
        <ListBoxItem id="off">Off</ListBoxItem>
        <ListBoxItem id="whole">Whole mesh</ListBoxItem>
        <ListBoxItem id="painted">Painted spots</ListBoxItem>
      </Select>
      {mesh.emissive && <GlowColorField mesh={mesh} />}
      {mesh.emissive?.shape === 'painted' && (
        <Button size="sm" variant="secondary" onPress={() => setGlowPaintMeshId(mesh.id)}>
          Edit glow…
        </Button>
      )}
      <p className="text-[11px] leading-snug text-fg-subtle">
        Glow adds white light over the base color — pick a strong color + moderate strength; full
        strength washes toward white (like real KSA parts).
      </p>
    </SectionShell>
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

  const commit = () => {
    const n = parseFloat(draft)
    if (!isNaN(n)) {
      committed.current = n
      onChange(n)
      setDraft(formatNum(n))
    } else {
      setDraft(formatNum(committed.current))
    }
  }

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
