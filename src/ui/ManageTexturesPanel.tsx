import { useRef, useState } from 'react'
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
  Slider,
  TextField,
  Switch,
  useIsPhone,
} from './kit'
import { ColorAlphaField } from './ColorAlphaField'
import { useNumberDraft } from './numberDraft'
import { SliderRow } from './SliderRow'
import { MaterialDialog } from './MaterialDialog'
import { $part, addLight } from '../state/editorStore'
import {
  $managingMeshId,
  setManagingMeshId,
  setMeshMaterial,
  updateMeshFaceConfig,
  setMeshGlow,
  setMeshGlass,
  setMeshSurface,
  setMeshTransparent,
  setGlowPaintMeshId,
} from '../state/customAssetStore'
import { $simulateGlass, setSimulateGlass } from '../state/settingsStore'
import { PRIMITIVE_FACE_KEYS, FACE_LABELS } from '../three/primitives'
import { decodeImage } from '../ktx/decodeImage'
import {
  GLOW_RAMP_PRESETS,
  defaultGlowRamp,
  glowRampCss,
  glowRampFromImage,
  hexToRgb,
  normalizeGlowRamp,
  rgbToHex,
  sampleGlowRamp,
} from '../ktx/glowRamp'
import {
  createGlow,
  meshKind,
  type CustomMesh,
  type EmissiveConfig,
  type FaceTextureConfig,
  type GlowRamp,
  type GlowRampStop,
  type ImportedMeshSource,
  type RgbColor,
  type TextureWrap,
  type VisorSurface,
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

/** Emissive mask values above this blow a glow's color out to white in-game (see GlowSettings). */
const GLOW_WASHOUT_STRENGTH = 0.6

/** The kind label in the panel header — a primitive names its shape, the other two their kind. */
function meshKindLabel(mesh: CustomMesh): string {
  switch (meshKind(mesh)) {
    case 'kitten':
      return 'kitten'
    case 'imported':
      return 'imported'
    case 'primitive':
      return mesh.primitive?.kind ?? 'mesh'
  }
}

/**
 * Floating panel for per-mesh material editing on a custom mesh: a Glow (emissive) / visor-surface
 * section for every mesh, plus per-face texture + UV controls for primitive meshes and a
 * provenance + glass block for imported ones. Rendered at the app root so it floats over the 3D
 * viewport (desktop card / mobile fullscreen modal). Driven by $managingMeshId — set to a mesh
 * id to open, null to close.
 */
export function ManageTexturesPanel() {
  const meshId = useStore($managingMeshId)
  const part = useStore($part)
  const isPhone = useIsPhone()

  const mesh = meshId ? part.customMeshes.find((m) => m.id === meshId) : undefined

  // Per-face textures only exist for primitive meshes: a kitten submesh carries its own KSA PBR
  // set, and an imported mesh is one glTF primitive with exactly one material (a KSA <PartModel>).
  const faceKeys =
    mesh && meshKind(mesh) === 'primitive' && mesh.primitive
      ? PRIMITIVE_FACE_KEYS[mesh.primitive.kind]
      : []
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
    // max-h + scroll: an imported mesh adds a provenance/glass section on top of the material
    // and glow ones, which on a short viewport would otherwise run off the bottom of the card.
    <div className="absolute left-3 top-1/2 z-10 max-h-[calc(100vh-6rem)] w-64 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle">
          {meshKindLabel(mesh)} · {mesh.name}
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
  const kind = meshKind(mesh)

  return (
    <div className="flex flex-col gap-3">
      {/* Material — primitive + imported meshes (kitten submeshes carry their own KSA PBR set). */}
      {kind !== 'kitten' && <MaterialSection mesh={mesh} />}

      <GlowSection mesh={mesh} />

      {/* Provenance + the <PartModelGlass> opt-in — imported meshes only. */}
      {kind === 'imported' && mesh.imported && (
        <ImportedSection mesh={mesh} imported={mesh.imported} />
      )}

      {/* Per-face texture controls — primitive meshes only. */}
      {kind === 'primitive' && (
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

/**
 * Read-only provenance for an imported SubPart + its one authoring choice, "Render as glass".
 *
 * The provenance is what makes a re-import (Phase 5) legible — `sourceNode`/`sourceMaterial`
 * are the match keys — and what tells the user which Blender object a SubPart came from when
 * one file split into a dozen. The glass toggle writes `imported.transparent`, which the
 * exporter routes to `<PartModelGlass>`; it deliberately changes nothing in the editor
 * preview (see setMeshTransparent).
 */
function ImportedSection({ mesh, imported }: { mesh: CustomMesh; imported: ImportedMeshSource }) {
  return (
    <SectionShell title="Imported model">
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
    </SectionShell>
  )
}

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="truncate text-fg-muted" title={value}>
        {value}
      </dd>
    </>
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

/**
 * The glow controls shared by the visor and the plain-mesh sections.
 *
 * The two sliders are deliberately independent, because KSA's emissive can only ever ADD WHITE
 * (MeshIndirect.frag:286 — `gammaToLinear(vec3(mask) * 1.25)`, no colour input on that path):
 *  - **Color** puts the glow colour in the `<Diffuse>`; it reads wherever the surface is lit.
 *  - **Emissive** is the `<Emissive>` mask value; it is the white the game adds, and the only
 *    thing visible in shadow. Past ~0.6 it swamps the colour, which is the "my green glow is
 *    white" symptom. See analysis/KSA_EMISSIVE_AND_LUT.md.
 */
function GlowSettings({ mesh, glow }: { mesh: CustomMesh; glow: EmissiveConfig }) {
  const patch = (next: Partial<EmissiveConfig>) => void setMeshGlow(mesh.id, { ...glow, ...next })
  const ramped = !!glow.ramp
  return (
    <>
      {glow.shape === 'painted' && (
        <Select
          label="Color source"
          selectedKey={ramped ? 'ramp' : 'solid'}
          onSelectionChange={(k) =>
            k === 'ramp'
              ? patch({ ramp: defaultGlowRamp() })
              : void setMeshGlow(mesh.id, { ...glow, ramp: undefined })
          }
        >
          <ListBoxItem id="solid">Solid color</ListBoxItem>
          <ListBoxItem id="ramp">Color ramp (LUT)</ListBoxItem>
        </Select>
      )}
      {ramped && glow.ramp ? (
        <GlowRampEditor ramp={glow.ramp} onChange={(ramp) => patch({ ramp })} />
      ) : (
        <ColorAlphaField
          label="Color"
          color={rgbToHex(glow.color)}
          opacity={glow.coverage}
          onChange={({ color, opacity }) => patch({ color: hexToRgb(color), coverage: opacity })}
        />
      )}
      {ramped && (
        <SliderRow
          label="Coverage"
          ariaLabel="Glow color coverage"
          value={glow.coverage}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => patch({ coverage: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      )}
      <SliderRow
        label="Emissive"
        ariaLabel="Emissive mask strength"
        value={glow.strength}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => patch({ strength: v })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      {glow.strength > GLOW_WASHOUT_STRENGTH && (
        <p className="text-[11px] leading-snug text-warning">
          KSA adds this as WHITE, so this much emissive will wash the color out. Lower it and add a
          matching light for colored light.
        </p>
      )}
      <AddMatchingLightButton mesh={mesh} glow={glow} />
    </>
  )
}

/**
 * Adds a `<Light>` on this SubPart seeded with the glow's colour — the only mechanism that makes a
 * KSA part actually cast COLOURED light (`LightModule.TemplateData.ColorRgb`), since the emissive
 * map is white-only. A Point light at the SubPart origin; range/aim are edited in SubPart Data.
 */
function AddMatchingLightButton({ mesh, glow }: { mesh: CustomMesh; glow: EmissiveConfig }) {
  const color = glow.ramp ? sampleGlowRamp(glow.ramp, 1) : glow.color
  return (
    <Button
      size="sm"
      variant="secondary"
      onPress={() =>
        addLight(mesh.subPartId, {
          type: 'Point',
          color: { r: color.r / 255, g: color.g / 255, b: color.b / 255 },
        })
      }
    >
      Add matching light
    </Button>
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
      {showGlow && mesh.emissive && <GlowSettings mesh={mesh} glow={mesh.emissive} />}
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
    void setMeshGlow(mesh.id, {
      ...(mesh.emissive ?? createGlow()),
      shape: m as 'whole' | 'painted',
    })
  }
  return (
    <SectionShell title="Glow (emissive)">
      <Select label="Mode" selectedKey={mode} onSelectionChange={(k) => setMode(String(k))}>
        <ListBoxItem id="off">Off</ListBoxItem>
        <ListBoxItem id="whole">Whole mesh</ListBoxItem>
        <ListBoxItem id="painted">Painted spots</ListBoxItem>
      </Select>
      {mesh.emissive && <GlowSettings mesh={mesh} glow={mesh.emissive} />}
      {mesh.emissive?.shape === 'painted' && (
        <Button size="sm" variant="secondary" onPress={() => setGlowPaintMeshId(mesh.id)}>
          Edit glow…
        </Button>
      )}
      <p className="text-[11px] leading-snug text-fg-subtle">
        KSA has no colored emissive: it adds <em>white</em> × mask × 1.25 after lighting. Color
        lives in the base color (visible where lit); Emissive is the white (visible in shadow). For
        real colored light, keep Emissive low and add a matching light.
      </p>
    </SectionShell>
  )
}

/**
 * Editor for a {@link GlowRamp} — the greyscale-key → color gradient that mirrors how KSA keys its
 * own effects through a 1-px LUT (`temperatureLut`). KSA has no per-material LUT slot, so flexo
 * bakes the ramp into the diffuse at composite time; this is purely an authoring surface.
 *
 * Importing reads the image's MIDDLE row across its FULL width — flexo does not guess where a
 * gradient starts, so a screenshot with background margins imports those margins too (crop first,
 * or drag the stops afterwards).
 */
function GlowRampEditor({ ramp, onChange }: { ramp: GlowRamp; onChange: (r: GlowRamp) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState('')

  const importImage = async (file: File | undefined) => {
    if (!file) return
    try {
      const decoded = await decodeImage(file)
      onChange(normalizeGlowRamp(glowRampFromImage(decoded.levels[0]).stops))
      setImportError('')
    } catch {
      setImportError('Could not read that image.')
    }
  }

  const patchStop = (i: number, next: Partial<GlowRampStop>) =>
    onChange(normalizeGlowRamp(ramp.stops.map((s, j) => (j === i ? { ...s, ...next } : s))))

  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-5 w-full rounded border border-border"
        style={{ background: glowRampCss(ramp) }}
        aria-label="Color ramp preview"
      />
      <div className="flex items-center gap-2">
        {/* A command menu, not a value: selectedKey stays null so it re-shows the placeholder
            after a pick (the stops are editable afterwards, so there is no "current preset"). */}
        <Select
          aria-label="Ramp preset"
          size="sm"
          placeholder="Preset…"
          selectedKey={null}
          onSelectionChange={(k) => {
            const preset = GLOW_RAMP_PRESETS.find((p) => p.id === String(k))
            if (preset) onChange(normalizeGlowRamp(preset.ramp.stops))
          }}
          className="flex-1"
        >
          {GLOW_RAMP_PRESETS.map((p) => (
            <ListBoxItem key={p.id} id={p.id}>
              {p.label}
            </ListBoxItem>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onPress={() => fileInput.current?.click()}>
          Import…
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void importImage(e.target.files?.[0])}
        />
      </div>
      {importError && <p className="text-[11px] text-warning">{importError}</p>}
      {ramp.stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`Ramp stop ${i + 1} color`}
            className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border bg-transparent"
            value={rgbToHex(stop.color)}
            onChange={(e) => patchStop(i, { color: hexToRgb(e.target.value) })}
          />
          <Slider
            aria-label={`Ramp stop ${i + 1} position`}
            className="flex-1"
            minValue={0}
            maxValue={1}
            step={0.01}
            value={stop.at}
            onChange={(v) => patchStop(i, { at: v as number })}
          />
          <span className="w-8 shrink-0 text-right font-mono text-[11px] text-fg-subtle">
            {Math.round(stop.at * 100)}%
          </span>
          <AriaButton
            aria-label={`Remove ramp stop ${i + 1}`}
            className="shrink-0 rounded p-0.5 text-fg-subtle hover:text-fg disabled:opacity-30"
            isDisabled={ramp.stops.length <= 2}
            onPress={() => onChange({ stops: ramp.stops.filter((_, j) => j !== i) })}
          >
            <X size={12} />
          </AriaButton>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onPress={() =>
          onChange(normalizeGlowRamp([...ramp.stops, { at: 0.5, color: midStop(ramp) }]))
        }
      >
        Add stop
      </Button>
    </div>
  )
}

/** The ramp's own color at the midpoint — so a new stop lands on the curve instead of jumping. */
function midStop(ramp: GlowRamp): RgbColor {
  return sampleGlowRamp(ramp, 0.5)
}

/**
 * Numeric input for UV values — the shared draft field (see {@link useNumberDraft})
 * with ~4-decimal display; valid keystrokes commit live so the viewport previews
 * the tiling as you type.
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
  const field = useNumberDraft({ value, onCommit: onChange, format: formatNum })
  return (
    <TextField
      label={label}
      size="sm"
      // must inputMode="url" so negative numbers can be managed on mobile devices, numeric/decimal/integer dont show "-" key
      inputMode="url"
      {...field}
    />
  )
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(4).replace(/\.?0+$/, '') || '0'
}
