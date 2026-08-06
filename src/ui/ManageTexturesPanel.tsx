import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { X } from 'lucide-react';
import { Button as AriaButton } from 'react-aria-components';
import {
  Modal,
  Dialog,
  DialogHeader,
  Button,
  Select,
  ListBoxItem,
  TextField,
  cn,
  panelChrome,
  useIsPhone,
} from './kit';
import { useNumberDraft } from './numberDraft';
import { MaterialSection } from './surface/MaterialSection';
import { GlowSection } from './surface/GlowSection';
import { VisorSection } from './surface/VisorSection';
import { ImportedSection } from './surface/ImportedSection';
import { $part } from '../state/editorStore';
import {
  $managingMeshId,
  setManagingMeshId,
  updateMeshFaceConfig,
} from '../state/customAssetStore';
import { PRIMITIVE_FACE_KEYS, FACE_LABELS } from '../three/primitives';
import { meshKind, type CustomMesh, type FaceTextureConfig, type TextureWrap } from '../ksa/types';

const DEFAULT_CONFIG: FaceTextureConfig = {
  textureId: '',
  uvScale: { x: 1, y: 1 },
  uvOffset: { x: 0, y: 0 },
  wrap: 'repeat',
};

const WRAP_LABELS: { id: TextureWrap; label: string }[] = [
  { id: 'repeat', label: 'Tile (repeat)' },
  { id: 'mirror', label: 'Mirror' },
  { id: 'clamp', label: 'Stretch edge' },
];

/** The kind label in the panel header — a primitive names its shape, the other two their kind. */
function meshKindLabel(mesh: CustomMesh): string {
  switch (meshKind(mesh)) {
    case 'kitten':
      return 'kitten';
    case 'imported':
      return 'imported';
    case 'primitive':
      return mesh.primitive?.kind ?? 'mesh';
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
  const meshId = useStore($managingMeshId);
  const part = useStore($part);
  const isPhone = useIsPhone();

  const mesh = meshId ? part.customMeshes.find((m) => m.id === meshId) : undefined;

  // Per-face textures only exist for primitive meshes: a kitten submesh carries its own KSA PBR
  // set, and an imported mesh is one glTF primitive with exactly one material (a KSA <PartModel>).
  const faceKeys =
    mesh && meshKind(mesh) === 'primitive' && mesh.primitive
      ? PRIMITIVE_FACE_KEYS[mesh.primitive.kind]
      : [];
  const [selectedFace, setSelectedFace] = useState(faceKeys[0] ?? '');
  const activeFace = faceKeys.includes(selectedFace) ? selectedFace : (faceKeys[0] ?? '');

  const update = (faceKey: string, patch: Partial<FaceTextureConfig>) => {
    const currentMesh = $part.get().customMeshes.find((m) => m.id === meshId);
    const existing = currentMesh?.faceTextures[faceKey] ?? DEFAULT_CONFIG;
    void updateMeshFaceConfig(meshId!, faceKey, { ...existing, ...patch });
  };

  if (!mesh) return null;

  const currentConfig: FaceTextureConfig = mesh.faceTextures[activeFace] ?? DEFAULT_CONFIG;
  const close = () => setManagingMeshId(null);

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
  );

  if (isPhone) {
    return (
      <Modal isOpen onOpenChange={(v) => !v && close()} isDismissable variant="fullscreen">
        <Dialog>
          <DialogHeader title={mesh.name} onClose={close} />
          <div className="overflow-y-auto p-4">{inner}</div>
        </Dialog>
      </Modal>
    );
  }

  return (
    // max-h + scroll: an imported mesh adds a provenance/glass section on top of the material
    // and glow ones, which on a short viewport would otherwise run off the bottom of the card.
    <div
      className={cn(
        'absolute left-3 top-1/2 z-10 max-h-[calc(100vh-6rem)] w-64 -translate-y-1/2 overflow-y-auto p-3',
        panelChrome,
      )}
    >
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
  );
}

interface PanelContentProps {
  mesh: CustomMesh;
  faceKeys: readonly string[];
  selectedFace: string;
  onFaceChange: (key: string) => void;
  currentConfig: FaceTextureConfig;
  update: (faceKey: string, patch: Partial<FaceTextureConfig>) => void;
  onClose: () => void;
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
  const part = useStore($part);
  const kind = meshKind(mesh);

  return (
    <div className="flex flex-col gap-3">
      {/* Material — primitive + imported meshes (kitten submeshes carry their own KSA PBR set). */}
      {kind !== 'kitten' && <MaterialSection mesh={mesh} />}

      {mesh.kitten?.transparent ? <VisorSection mesh={mesh} /> : <GlowSection mesh={mesh} />}

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
  );
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
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const field = useNumberDraft({ value, onCommit: onChange, format: formatNum });
  return (
    <TextField
      label={label}
      size="sm"
      // must inputMode="url" so negative numbers can be managed on mobile devices, numeric/decimal/integer dont show "-" key
      inputMode="url"
      {...field}
    />
  );
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4).replace(/\.?0+$/, '') || '0';
}
