import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Modal, Dialog, DialogHeader, Button, Slider } from './kit'
import { $glowPaintMeshId, setGlowPaintMeshId, setMeshGlowPainted } from '../state/customAssetStore'
import { $part } from '../state/editorStore'
import { assetKeys, getAsset } from '../state/assetDb'
import { glowRampCss, hexToRgb, rgbToHex, sampleGlowRamp } from '../ktx/glowRamp'
import type { CustomMesh } from '../ksa/types'

/**
 * In-browser paint canvas for a mesh's 'painted' glow bitmap: **alpha is the greyscale KEY** and
 * rgb is the glow color. The key drives both outputs at composite time — the color blended into
 * the diffuse (scaled by the mesh's Coverage) and the `<Emissive>` mask KSA adds as white (scaled
 * by its Emissive strength). See src/ktx/glowComposite.
 *
 * With a color ramp set, the brush color is ignored by the composite (the key indexes the ramp
 * instead), so the stamp is drawn THROUGH the ramp: the soft falloff walks down the gradient and
 * the canvas previews what the diffuse will actually get.
 *
 * Driven by $glowPaintMeshId. Apply writes a PNG to IndexedDB via setMeshGlowPainted.
 */
const SIZE = 512

export function GlowPaintDialog() {
  const meshId = useStore($glowPaintMeshId)
  const part = useStore($part)
  const mesh = meshId ? part.customMeshes.find((m) => m.id === meshId) : undefined
  if (!mesh) return null
  // Key by mesh id so brush state re-seeds (lazy initializers) each time a different mesh opens.
  return <PaintBody key={mesh.id} mesh={mesh} />
}

function PaintBody({ mesh }: { mesh: CustomMesh }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const painting = useRef(false)
  const ramp = mesh.emissive?.ramp
  const [color, setColor] = useState(() =>
    mesh.emissive ? rgbToHex(mesh.emissive.color) : '#78dcff',
  )
  const [brush, setBrush] = useState(48)
  const [intensity, setIntensity] = useState(0.8)
  const [eraser, setEraser] = useState(false)

  // Draw any saved bitmap onto the fresh canvas (no setState — keeps the effect a pure DOM sync).
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, SIZE, SIZE)
    let cancelled = false
    void (async () => {
      const blob = await getAsset(assetKeys.emissivePaint(mesh.id))
      if (cancelled || !blob) return
      const bmp = await createImageBitmap(blob)
      if (!cancelled) ctx.drawImage(bmp, 0, 0, SIZE, SIZE)
      bmp.close()
    })()
    return () => {
      cancelled = true
    }
  }, [mesh.id])

  const close = () => setGlowPaintMeshId(null)

  // Radial falloff steps. With a ramp, each step's rgb is the ramp color for the key AT that
  // step, so the stamp reproduces the LUT falloff; without one it is the flat brush color.
  const STAMP_STEPS = 8

  const stampAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * SIZE
    const y = ((clientY - rect.top) / rect.height) * SIZE
    const flat = hexToRgb(color)
    const peak = eraser ? 1 : intensity
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'
    const grad = ctx.createRadialGradient(x, y, 0, x, y, brush)
    for (let i = 0; i <= STAMP_STEPS; i++) {
      const t = i / STAMP_STEPS
      const key = peak * (1 - t)
      const c = ramp && !eraser ? sampleGlowRamp(ramp, key) : flat
      grad.addColorStop(t, `rgba(${c.r},${c.g},${c.b},${key})`)
    }
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, brush, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }

  const clear = () => canvasRef.current?.getContext('2d')?.clearRect(0, 0, SIZE, SIZE)

  const apply = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (blob) await setMeshGlowPainted(mesh.id, blob, hexToRgb(color))
    close()
  }

  return (
    <Modal isOpen onOpenChange={(v) => !v && close()} isDismissable>
      <Dialog>
        <DialogHeader title={`Paint glow: ${mesh.name}`} onClose={close} />
        <div className="flex flex-col gap-3 p-4">
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="aspect-square w-full touch-none rounded-lg border border-border bg-black/40"
            onPointerDown={(e) => {
              painting.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              stampAt(e.clientX, e.clientY)
            }}
            onPointerMove={(e) => {
              if (painting.current) stampAt(e.clientX, e.clientY)
            }}
            onPointerUp={() => {
              painting.current = false
            }}
          />
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-fg-muted">Color</span>
            {ramp ? (
              <div
                className="h-6 flex-1 rounded border border-border"
                style={{ background: glowRampCss(ramp) }}
                aria-label="Color ramp (brush color comes from the ramp)"
              />
            ) : (
              <input
                type="color"
                aria-label="Brush color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent"
              />
            )}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={eraser}
                onChange={(e) => setEraser(e.target.checked)}
              />{' '}
              Eraser
            </label>
          </div>
          <LabeledSlider
            label="Brush"
            min={4}
            max={128}
            step={1}
            value={brush}
            onChange={setBrush}
          />
          <LabeledSlider
            label="Intensity"
            min={0}
            max={1}
            step={0.01}
            value={intensity}
            onChange={setIntensity}
            pct
          />
          <div className="flex justify-between gap-2">
            <Button size="sm" variant="ghost" onPress={clear}>
              Clear
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onPress={close}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onPress={() => void apply()}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </Modal>
  )
}

function LabeledSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  pct,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  pct?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs text-fg-muted">{label}</span>
      <Slider
        aria-label={label}
        className="flex-1"
        minValue={min}
        maxValue={max}
        step={step}
        value={value}
        onChange={(v) => onChange(v as number)}
      />
      <span className="w-10 shrink-0 text-right font-mono text-[11px] text-fg-subtle">
        {pct ? `${Math.round(value * 100)}%` : value}
      </span>
    </div>
  )
}
