import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Redo2, Undo2 } from 'lucide-react';
import { Button, Dialog, DialogHeader, InlineConfirmStrip, Modal, Slider, Tooltip } from './kit';
import {
  $customTextureUrls,
  getPrimaryTextureId,
  previewMeshGlowPaint,
  setMeshGlowPainted,
} from '../state/customAssetStore';
import { registerGlowPaintCancel } from '../state/surfaceModeStore';
import { registerGlowPaintHandlers } from './glowPaintControls';
import { $part } from '../state/editorStore';
import { assetKeys, getAsset } from '../state/assetDb';
import { glowRampCss, hexToRgb, rgbToHex, sampleGlowRamp } from '../ktx/glowRamp';
import type { CustomMesh } from '../ksa/types';

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
 * Hosted by `dialogStore` under id `'glow-paint'` with params `{meshId}` (design:
 * design-surface-assets.md §1.6). Three bounded v2 upgrades over the v1 painter (D2):
 *
 * 1. **Per-stroke undo** — an in-dialog stack of canvas snapshots, driven by `⌘Z`/`⇧⌘Z` at
 *    hotkey scope `surface:glow-paint` so the chord never reaches the DOCUMENT's undo while
 *    the painter is open. The stack is dialog-local; the document sees exactly one step, at
 *    Apply.
 * 2. **Underlay** — the mesh's current diffuse at 50% over a checkerboard, so a stroke can be
 *    aimed at something instead of at a black square.
 * 3. **Live 3D preview on stroke end** — the working bitmap runs through the SAME
 *    `glowComposite` path the export uses (`previewMeshGlowPaint`), view-only until Apply.
 */
const SIZE = 512;

/** Snapshot cap (design D2: "cap 32, drop oldest"). 32 × 512² RGBA ≈ 32 MB worst case. */
const MAX_STROKES = 32;

export function GlowPaintDialog({ meshId, onClose }: { meshId: string; onClose: () => void }) {
  const part = useStore($part);
  const mesh = part.customMeshes.find((m) => m.id === meshId);
  if (!mesh) return null;
  // Key by mesh id so brush state re-seeds (lazy initializers) each time a different mesh opens.
  return <PaintBody key={mesh.id} mesh={mesh} onClose={onClose} />;
}

function PaintBody({ mesh, onClose }: { mesh: CustomMesh; onClose: () => void }) {
  const textureUrls = useStore($customTextureUrls);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const ramp = mesh.emissive?.ramp;
  const [color, setColor] = useState(() =>
    mesh.emissive ? rgbToHex(mesh.emissive.color) : '#78dcff',
  );
  const [brush, setBrush] = useState(48);
  const [intensity, setIntensity] = useState(0.8);
  const [eraser, setEraser] = useState(false);
  // Stack DEPTHS, not the stacks: the buttons need to re-render, the pixels do not.
  const [depths, setDepths] = useState({ undo: 0, redo: 0 });
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const ctx2d = () => canvasRef.current?.getContext('2d') ?? null;

  // Draw any saved bitmap onto the fresh canvas (no setState — keeps the effect a pure DOM sync).
  useEffect(() => {
    const ctx = ctx2d();
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    let cancelled = false;
    void (async () => {
      const blob = await getAsset(assetKeys.emissivePaint(mesh.id));
      if (cancelled || !blob) return;
      const bmp = await createImageBitmap(blob);
      if (!cancelled) ctx.drawImage(bmp, 0, 0, SIZE, SIZE);
      bmp.close();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx2d reads a ref; mesh.id keys the body
  }, [mesh.id]);

  /** The working bitmap, for the live 3D preview and for Apply. */
  const toBlob = async (): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  };

  const publishPreview = async () => {
    const blob = await toBlob();
    if (blob) await previewMeshGlowPaint(mesh.id, blob);
  };

  const pushSnapshot = () => {
    const ctx = ctx2d();
    if (!ctx) return;
    undoStack.current.push(ctx.getImageData(0, 0, SIZE, SIZE));
    if (undoStack.current.length > MAX_STROKES) undoStack.current.shift();
    redoStack.current = [];
    setDepths({ undo: undoStack.current.length, redo: 0 });
  };

  const step = (from: ImageData[], to: ImageData[]) => {
    const ctx = ctx2d();
    const snapshot = from.pop();
    if (!ctx || !snapshot) return;
    to.push(ctx.getImageData(0, 0, SIZE, SIZE));
    ctx.putImageData(snapshot, 0, 0);
    setDepths({ undo: undoStack.current.length, redo: redoStack.current.length });
    void publishPreview();
  };

  const undoStroke = () => step(undoStack.current, redoStack.current);
  const redoStroke = () => step(redoStack.current, undoStack.current);

  // The `surface:glow-paint` bindings reach the stroke stack through this handle (the hotkey
  // registry may not import React). Registered for as long as the painter is mounted.
  useEffect(() => {
    registerGlowPaintHandlers({
      undo: undoStroke,
      redo: redoStroke,
      canUndo: () => undoStack.current.length > 0,
      canRedo: () => redoStack.current.length > 0,
    });
    return () => registerGlowPaintHandlers(null);
  });

  // Radial falloff steps. With a ramp, each step's rgb is the ramp color for the key AT that
  // step, so the stamp reproduces the LUT falloff; without one it is the flat brush color.
  const STAMP_STEPS = 8;

  const stampAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * SIZE;
    const y = ((clientY - rect.top) / rect.height) * SIZE;
    const flat = hexToRgb(color);
    const peak = eraser ? 1 : intensity;
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    const grad = ctx.createRadialGradient(x, y, 0, x, y, brush);
    for (let i = 0; i <= STAMP_STEPS; i++) {
      const t = i / STAMP_STEPS;
      const key = peak * (1 - t);
      const c = ramp && !eraser ? sampleGlowRamp(ramp, key) : flat;
      grad.addColorStop(t, `rgba(${c.r},${c.g},${c.b},${key})`);
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, brush, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  };

  /** `Clear` is itself stroke-undoable (design D2) — snapshot before the wipe. */
  const clear = () => {
    pushSnapshot();
    ctx2d()?.clearRect(0, 0, SIZE, SIZE);
    void publishPreview();
  };

  const dirty = depths.undo > 0 || depths.redo > 0;

  /** Drops the view-only preview and closes. Shared by Cancel, Esc and the mode-exit hook. */
  const discard = () => {
    void previewMeshGlowPaint(mesh.id, null);
    onClose();
  };

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else discard();
  };

  // Leaving Surface mode closes the painter "via its normal cancel semantics" (foundation
  // §2.4) — i.e. through the same dirty-discard confirm, not a silent dismissal.
  useEffect(() => {
    registerGlowPaintCancel(requestClose);
    return () => registerGlowPaintCancel(null);
  });

  const apply = async () => {
    const blob = await toBlob();
    if (blob) await setMeshGlowPainted(mesh.id, blob, hexToRgb(color));
    onClose();
  };

  // The underlay is the mesh's own base-color image, drawn under the canvas at 50% over a
  // checkerboard so a stroke can be aimed. SOURCE image, not the encoded .ktx2 — the same
  // approximation MaterialDialog's preview sphere already makes (a KTX2 is not drawable in a
  // 2D context), and it is a backdrop, not a preview of the export.
  const underlayUrl = textureUrls[getPrimaryTextureId(mesh)];

  return (
    <Modal isOpen onOpenChange={(v) => !v && requestClose()} isDismissable>
      {/* `data-surface` puts the painter in the `surface:glow-paint` hotkey scope, which is
          what makes ⌘Z step a STROKE instead of the document (foundation §11.1 precedence). */}
      <Dialog data-surface="glow-paint">
        <DialogHeader title={`Paint glow: ${mesh.name}`} onClose={requestClose} />
        <div className="flex flex-col gap-3 p-4">
          <div
            className="relative aspect-square w-full overflow-hidden rounded-lg border border-border"
            style={{ background: CHECKERBOARD, backgroundSize: '16px 16px' }}
          >
            {underlayUrl && (
              <img
                src={underlayUrl}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 size-full object-cover opacity-50"
              />
            )}
            <canvas
              ref={canvasRef}
              width={SIZE}
              height={SIZE}
              className="absolute inset-0 size-full touch-none"
              onPointerDown={(e) => {
                painting.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                pushSnapshot();
                stampAt(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (painting.current) stampAt(e.clientX, e.clientY);
              }}
              onPointerUp={() => {
                if (!painting.current) return;
                painting.current = false;
                // Stroke end → refresh the 3D mesh through the shared composite path.
                void publishPreview();
              }}
            />
          </div>
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
          {confirmDiscard ? (
            <InlineConfirmStrip
              label="Discard the strokes you painted? They have not been applied."
              confirmLabel="Discard"
              onConfirm={discard}
              onCancel={() => setConfirmDiscard(false)}
            />
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Tooltip content="Undo stroke (⌘Z) — the document's undo is untouched">
                  <Button
                    iconOnly
                    size="sm"
                    variant="ghost"
                    aria-label="Undo stroke"
                    isDisabled={depths.undo === 0}
                    onPress={undoStroke}
                  >
                    <Undo2 size={14} />
                  </Button>
                </Tooltip>
                <Tooltip content="Redo stroke (⇧⌘Z)">
                  <Button
                    iconOnly
                    size="sm"
                    variant="ghost"
                    aria-label="Redo stroke"
                    isDisabled={depths.redo === 0}
                    onPress={redoStroke}
                  >
                    <Redo2 size={14} />
                  </Button>
                </Tooltip>
                <Button size="sm" variant="ghost" onPress={clear}>
                  Clear
                </Button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onPress={requestClose}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onPress={() => void apply()}>
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}

/** Transparency checkerboard behind the underlay (CSS only — nothing is drawn for it). */
const CHECKERBOARD =
  'repeating-conic-gradient(rgb(255 255 255 / 6%) 0% 25%, rgb(0 0 0 / 25%) 0% 50%)';

function LabeledSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  pct,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  pct?: boolean;
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
  );
}
