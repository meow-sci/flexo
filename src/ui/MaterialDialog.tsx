import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import {
  Modal,
  Dialog,
  DialogHeader,
  DisclosureSection,
  Button,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Select,
  ListBoxItem,
  Slider,
  toast,
} from './kit'
import { $part } from '../state/editorStore'
import {
  $customTextureUrls,
  addCustomMaterial,
  updateCustomMaterial,
} from '../state/customAssetStore'
import type {
  BaseColorChannel,
  CustomMaterial,
  RgbColor,
  ScalarChannel,
  TextureChannel,
} from '../ksa/types'
import { createDefaultMaterial } from '../ksa/types'

/**
 * Create/edit a reusable {@link CustomMaterial}: base color (picked color or an
 * uploaded image), metalness + roughness sliders, and a live PBR preview sphere
 * under the same studio environment the editor uses. Uniform values export as 1×1
 * solid texels (KSA's PbrMaterial has no scalar params), so the preview numbers
 * ARE what ships.
 *
 * Mounted only while open, so per-open state initializes via useState. Edit mode
 * (materialId set) saves via updateCustomMaterial — one undo step per save.
 */
export function MaterialDialog({
  materialId,
  onClose,
  onCreated,
}: {
  /** Edit this material; absent = create a new one. */
  materialId?: string
  onClose: () => void
  /** Create mode: invoked with the new material (e.g. to auto-assign it). */
  onCreated?: (mat: CustomMaterial) => void
}) {
  const part = useStore($part)
  const textureUrls = useStore($customTextureUrls)
  const existing = materialId ? part.customMaterials.find((m) => m.id === materialId) : undefined
  const byChannel = (c: TextureChannel) => part.customTextures.filter((t) => t.channel === c)
  const baseColorTextures = byChannel('baseColor')
  const normalTextures = byChannel('normal')
  const occlusionTextures = byChannel('occlusion')
  const ormTextures = byChannel('orm')
  const roughnessTextures = byChannel('roughness')
  const metalnessTextures = byChannel('metalness')

  const seed = existing ?? createDefaultMaterial('', 'Material')
  const [name, setName] = useState(existing ? existing.name : 'Material')
  const [colorHex, setColorHex] = useState(
    seed.baseColor.kind === 'color' ? rgbToHex(seed.baseColor.color) : '#bfc4cc',
  )
  const [baseTextureId, setBaseTextureId] = useState(
    seed.baseColor.kind === 'map' ? seed.baseColor.textureId : '',
  )
  const [baseMode, setBaseMode] = useState<'color' | 'map'>(seed.baseColor.kind)
  const [metalness, setMetalness] = useState(scalar(seed.metalness))
  const [roughness, setRoughness] = useState(scalar(seed.roughness))
  const [metalMapId, setMetalMapId] = useState(mapId(seed.metalness))
  const [roughMapId, setRoughMapId] = useState(mapId(seed.roughness))
  const [occlusionMapId, setOcclusionMapId] = useState(seed.occlusion?.textureId ?? '')
  const [ormPackedId, setOrmPackedId] = useState(seed.ormPacked?.textureId ?? '')
  const [normalMapId, setNormalMapId] = useState(seed.normal?.textureId ?? '')
  const [normalStrength, setNormalStrength] = useState(seed.normal?.strength ?? 1)
  const [busy, setBusy] = useState(false)

  const hasAdvanced = !!(metalMapId || roughMapId || occlusionMapId || ormPackedId || normalMapId)
  const anyAdvancedTextures =
    normalTextures.length > 0 ||
    occlusionTextures.length > 0 ||
    ormTextures.length > 0 ||
    roughnessTextures.length > 0 ||
    metalnessTextures.length > 0

  const activePreset =
    MATERIAL_PRESETS.find((p) => p.metalness === metalness && p.roughness === roughness)?.id ??
    'custom'

  const applyPreset = (id: string) => {
    const p = MATERIAL_PRESETS.find((x) => x.id === id)
    if (!p) return
    setMetalness(p.metalness)
    setRoughness(p.roughness)
  }

  const buildChannels = (): Omit<CustomMaterial, 'id' | 'name'> => {
    const baseColor: BaseColorChannel =
      baseMode === 'map' && baseTextureId
        ? { kind: 'map', textureId: baseTextureId }
        : { kind: 'color', color: hexToRgb(colorHex) }
    // A packed ORM supersedes the separate AO/rough/metal channels.
    const usePacked = !!ormPackedId
    const scalarOrMap = (map: string, value: number): ScalarChannel =>
      map && !usePacked ? { kind: 'map', textureId: map } : { kind: 'value', value }
    return {
      baseColor,
      metalness: scalarOrMap(metalMapId, metalness),
      roughness: scalarOrMap(roughMapId, roughness),
      occlusion: !usePacked && occlusionMapId ? { textureId: occlusionMapId } : undefined,
      ormPacked: usePacked ? { textureId: ormPackedId } : undefined,
      normal: normalMapId ? { textureId: normalMapId, strength: normalStrength } : undefined,
    }
  }

  const submit = async () => {
    setBusy(true)
    try {
      if (existing) {
        await updateCustomMaterial(existing.id, { name, ...buildChannels() })
        toast({ title: 'Material saved', description: name, variant: 'success' })
      } else {
        const mat = await addCustomMaterial(name, buildChannels())
        toast({ title: 'Material created', description: name, variant: 'success' })
        onCreated?.(mat)
      }
      onClose()
    } catch (err) {
      console.warn('material save failed', err)
      toast({
        title: 'Save failed',
        description: String((err as Error)?.message ?? err),
        variant: 'danger',
      })
    } finally {
      setBusy(false)
    }
  }

  // Preview textures load from the SOURCE image blob URLs (plain PNG/JPG →
  // THREE.TextureLoader). Normal maps preview through three's standard glTF-convention
  // decode of the original — mathematically what KSA renders from the flipped export.
  const previewMapUrl = baseMode === 'map' && baseTextureId ? textureUrls[baseTextureId] : undefined
  const preview = {
    colorHex: baseMode === 'color' ? colorHex : undefined,
    mapUrl: previewMapUrl,
    metalness: metalMapId || ormPackedId ? 1 : metalness,
    roughness: roughMapId || ormPackedId ? 1 : roughness,
    normalMapUrl: normalMapId ? textureUrls[normalMapId] : undefined,
    normalStrength,
    ormUrl: ormPackedId ? textureUrls[ormPackedId] : undefined,
    roughMapUrl: !ormPackedId && roughMapId ? textureUrls[roughMapId] : undefined,
    metalMapUrl: !ormPackedId && metalMapId ? textureUrls[metalMapId] : undefined,
    occlusionMapUrl: !ormPackedId && occlusionMapId ? textureUrls[occlusionMapId] : undefined,
  }

  return (
    <Modal
      isOpen
      onOpenChange={(v) => !v && onClose()}
      isDismissable
      variant="fullscreen"
      className="max-w-md"
    >
      <Dialog>
        <DialogHeader title={existing ? 'Edit material' : 'Create material'} onClose={onClose} />
        <div className="flex flex-col gap-3 overflow-y-auto p-3">
          <MaterialPreview {...preview} />

          <Select label="Preset" value={activePreset} onChange={(k) => applyPreset(String(k))}>
            {activePreset === 'custom' && <ListBoxItem id="custom">Custom</ListBoxItem>}
            {MATERIAL_PRESETS.map((p) => (
              <ListBoxItem key={p.id} id={p.id}>
                {p.label}
              </ListBoxItem>
            ))}
          </Select>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-fg-muted">Base color</span>
            <div className="flex items-center gap-2">
              <ToggleButtonGroup
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[baseMode]}
                onSelectionChange={(keys) => {
                  const k = [...keys][0] as 'color' | 'map' | undefined
                  if (k) setBaseMode(k)
                }}
              >
                <ToggleButton id="color" size="sm">
                  Color
                </ToggleButton>
                <ToggleButton id="map" size="sm" isDisabled={baseColorTextures.length === 0}>
                  Image
                </ToggleButton>
              </ToggleButtonGroup>
              {baseMode === 'color' && (
                <input
                  type="color"
                  aria-label="Base color"
                  className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent"
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                />
              )}
            </div>
            {baseMode === 'map' && (
              <Select
                aria-label="Base color image"
                value={baseTextureId}
                onChange={(k) => setBaseTextureId(String(k))}
              >
                {baseColorTextures.map((t) => (
                  <ListBoxItem key={t.id} id={t.id}>
                    {t.name}
                  </ListBoxItem>
                ))}
              </Select>
            )}
          </div>

          <ScalarSlider
            label="Metalness"
            value={metalness}
            onChange={setMetalness}
            mapped={!!(metalMapId || ormPackedId)}
          />
          <ScalarSlider
            label="Roughness"
            value={roughness}
            onChange={setRoughness}
            mapped={!!(roughMapId || ormPackedId)}
          />

          {anyAdvancedTextures && (
            <DisclosureSection
              title="Advanced maps"
              defaultExpanded={hasAdvanced}
              badge={hasAdvanced ? '●' : undefined}
            >
              {normalTextures.length > 0 && (
                <>
                  <MapSelect
                    label="Normal map"
                    value={normalMapId}
                    onChange={setNormalMapId}
                    textures={normalTextures}
                  />
                  {normalMapId && (
                    <div className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-xs text-fg-muted">Strength</span>
                      <Slider
                        aria-label="Normal strength"
                        className="flex-1"
                        minValue={0}
                        maxValue={2}
                        step={0.05}
                        value={normalStrength}
                        onChange={(v) => setNormalStrength(v as number)}
                      />
                      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-fg-subtle">
                        {normalStrength.toFixed(2)}
                      </span>
                    </div>
                  )}
                </>
              )}
              {ormTextures.length > 0 && (
                <MapSelect
                  label="Packed ORM"
                  value={ormPackedId}
                  onChange={setOrmPackedId}
                  textures={ormTextures}
                />
              )}
              {ormPackedId ? (
                <p className="text-[11px] leading-snug text-fg-subtle">
                  The packed ORM supplies AO, roughness and metalness — the sliders and separate
                  maps are ignored while it’s set.
                </p>
              ) : (
                <>
                  {occlusionTextures.length > 0 && (
                    <MapSelect
                      label="AO map"
                      value={occlusionMapId}
                      onChange={setOcclusionMapId}
                      textures={occlusionTextures}
                    />
                  )}
                  {roughnessTextures.length > 0 && (
                    <MapSelect
                      label="Roughness map"
                      value={roughMapId}
                      onChange={setRoughMapId}
                      textures={roughnessTextures}
                    />
                  )}
                  {metalnessTextures.length > 0 && (
                    <MapSelect
                      label="Metalness map"
                      value={metalMapId}
                      onChange={setMetalMapId}
                      textures={metalnessTextures}
                    />
                  )}
                </>
              )}
            </DisclosureSection>
          )}

          <TextField label="Name" value={name} onChange={setName} size="sm" />

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" isDisabled={busy} onPress={submit}>
              {busy ? 'Saving…' : existing ? 'Save material' : 'Create material'}
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  )
}

function ScalarSlider({
  label,
  value,
  onChange,
  mapped = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  /** True when a map drives this channel — the slider is inert and shows "map". */
  mapped?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-fg-muted">{label}</span>
      <Slider
        aria-label={label}
        className="flex-1"
        minValue={0}
        maxValue={1}
        step={0.01}
        value={value}
        onChange={(v) => onChange(v as number)}
        isDisabled={mapped}
      />
      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-fg-subtle">
        {mapped ? 'map' : `${Math.round(value * 100)}%`}
      </span>
    </div>
  )
}

/** Texture picker for one advanced map slot ("(none)" clears it). */
function MapSelect({
  label,
  value,
  onChange,
  textures,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  textures: { id: string; name: string }[]
}) {
  return (
    <Select label={label} value={value} onChange={(k) => onChange(String(k))}>
      <ListBoxItem id="">(none)</ListBoxItem>
      {textures.map((t) => (
        <ListBoxItem key={t.id} id={t.id}>
          {t.name}
        </ListBoxItem>
      ))}
    </Select>
  )
}

/** Presets are just uniform metal/rough pairs — one click, then tweak (plan §3.6). */
const MATERIAL_PRESETS: { id: string; label: string; metalness: number; roughness: number }[] = [
  { id: 'matte-plastic', label: 'Matte plastic', metalness: 0, roughness: 0.85 },
  { id: 'glossy-plastic', label: 'Glossy plastic', metalness: 0, roughness: 0.2 },
  { id: 'painted-metal', label: 'Painted metal', metalness: 0, roughness: 0.4 },
  { id: 'polished-metal', label: 'Polished metal', metalness: 1, roughness: 0.12 },
  { id: 'brushed-metal', label: 'Brushed metal', metalness: 1, roughness: 0.4 },
  { id: 'cast-metal', label: 'Cast metal', metalness: 1, roughness: 0.75 },
  { id: 'chrome', label: 'Chrome / mirror', metalness: 1, roughness: 0.04 },
  { id: 'rubber', label: 'Rubber', metalness: 0, roughness: 0.95 },
  { id: 'neutral', label: 'Neutral (default)', metalness: 0, roughness: 0.5 },
]

interface PreviewState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  material: THREE.MeshStandardMaterial
  pmrem: THREE.PMREMGenerator
  envTarget: THREE.WebGLRenderTarget
}

interface MaterialPreviewProps {
  /** Uniform base color hex; ignored when {@link mapUrl} is set. */
  colorHex?: string
  /** Base-color SOURCE image blob URL — overrides the uniform color. */
  mapUrl?: string
  metalness: number
  roughness: number
  normalMapUrl?: string
  normalStrength?: number
  /** Packed ORM source image; overrides the separate grayscale maps below. */
  ormUrl?: string
  roughMapUrl?: string
  metalMapUrl?: string
  occlusionMapUrl?: string
}

/**
 * Live PBR preview: a sphere under the same RoomEnvironment ("Studio") the editor
 * scene uses, so metalness/roughness read exactly like the viewport. Textures load
 * from the SOURCE images via TextureLoader (approximate but representative — the
 * viewport renders the exact encoded .ktx2). Renders on demand — no animation loop.
 */
function MaterialPreview({
  colorHex,
  mapUrl,
  metalness,
  roughness,
  normalMapUrl,
  normalStrength = 1,
  ormUrl,
  roughMapUrl,
  metalMapUrl,
  occlusionMapUrl,
}: MaterialPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<PreviewState | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 0.85

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envTarget.texture

    const camera = new THREE.PerspectiveCamera(
      35,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      10,
    )
    camera.position.set(0, 0, 2.6)

    const material = new THREE.MeshStandardMaterial()
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.85, 48, 24), material)
    scene.add(sphere)

    stateRef.current = { renderer, scene, camera, material, pmrem, envTarget }
    return () => {
      stateRef.current = null
      sphere.geometry.dispose()
      material.dispose()
      envTarget.dispose()
      pmrem.dispose()
      renderer.dispose()
    }
  }, [])

  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    let cancelled = false
    const loadImage = async (url: string, srgb: boolean): Promise<THREE.Texture> => {
      const tex = await new THREE.TextureLoader().loadAsync(url)
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      return tex
    }
    const apply = async () => {
      const m = s.material
      m.metalness = metalness
      m.roughness = roughness
      if (mapUrl) {
        const tex = await loadImage(mapUrl, true)
        if (cancelled) return
        m.map = tex
        m.color.set(0xffffff)
      } else {
        m.map = null
        if (colorHex) {
          const { r, g, b } = hexToRgb(colorHex)
          m.color.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
        }
      }
      // Normal preview uses three's standard glTF-convention decode of the ORIGINAL
      // upload — mathematically what KSA renders from the X-flipped export.
      m.normalMap = normalMapUrl ? await loadImage(normalMapUrl, false) : null
      m.normalScale.set(normalStrength, normalStrength)
      const orm = ormUrl ? await loadImage(ormUrl, false) : null
      m.aoMap = orm ?? (occlusionMapUrl ? await loadImage(occlusionMapUrl, false) : null)
      m.roughnessMap = orm ?? (roughMapUrl ? await loadImage(roughMapUrl, false) : null)
      m.metalnessMap = orm ?? (metalMapUrl ? await loadImage(metalMapUrl, false) : null)
      if (cancelled) return
      m.needsUpdate = true
      s.renderer.render(s.scene, s.camera)
    }
    void apply().catch((err) => console.warn('flexo: material preview failed', err))
    return () => {
      cancelled = true
    }
  }, [
    colorHex,
    mapUrl,
    metalness,
    roughness,
    normalMapUrl,
    normalStrength,
    ormUrl,
    roughMapUrl,
    metalMapUrl,
    occlusionMapUrl,
  ])

  return (
    <canvas
      ref={canvasRef}
      className="h-40 w-full rounded-lg border border-border bg-panel-sunken"
      aria-label="Material preview"
    />
  )
}

function rgbToHex({ r, g, b }: RgbColor): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function hexToRgb(hex: string): RgbColor {
  const v = parseInt(hex.slice(1), 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

function scalar(c: ScalarChannel): number {
  return c.kind === 'value' ? c.value : 0.5
}

function mapId(c: ScalarChannel): string {
  return c.kind === 'map' ? c.textureId : ''
}
