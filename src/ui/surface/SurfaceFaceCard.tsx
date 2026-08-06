import { useRef } from 'react';
import { useStore } from '@nanostores/react';
import { Button, ListBoxItem, Select } from '../kit';
import { focusCard } from '../build/FocusCardHeader';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { TextureRow } from '../MaterialDialog';
import {
  $customTextureUrls,
  clearMeshFaceConfig,
  copyFaceConfigToAll,
  updateMeshFaceConfig,
} from '../../state/customAssetStore';
import { $faceDraft, setFaceDraft } from '../../state/surfaceModeStore';
import { $part } from '../../state/editorStore';
import { FACE_LABELS } from '../../three/primitives';
import type { CustomMesh, FaceTextureConfig, TextureWrap } from '../../ksa/types';

/**
 * **The Face card** — Surface mode's left focus editor (design: design-surface-assets.md §1.4;
 * foundation §7.5). The face SELECTOR is the right sidebar's chip row; this is the editor,
 * which is the LOCKED left/right split.
 *
 * **Preview vs commit** (binding, design §1.4): as the user TYPES a UV number the value
 * streams into `$faceDraft` and `EditorScene` re-bakes the picked mesh's UVs view-only, so the
 * viewport tiles live exactly as v1's floating panel did — but the DOCUMENT commit happens
 * once, on field commit (Enter/blur), as ONE discrete `updateMeshFaceConfig` step. That is
 * what makes "live preview as you type" and "one undo step per edit" both true; v1 committed
 * every keystroke to the document.
 *
 * The Texture and Wrap selects commit immediately (discrete) — they are single choices, not
 * typing sessions.
 */

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

export function SurfaceFaceCard({ mesh, faceKey }: { mesh: CustomMesh; faceKey: string }) {
  const part = useStore($part);
  const textureUrls = useStore($customTextureUrls);
  const draft = useStore($faceDraft);

  const stored = mesh.faceTextures[faceKey] ?? DEFAULT_CONFIG;
  // The draft wins WHILE it belongs to this face, so the fields show what the viewport shows.
  const config =
    draft && draft.meshId === mesh.id && draft.faceKey === faceKey ? draft.cfg : stored;

  /** Streams a partial edit into the view-only draft (no document write). */
  const preview = (patch: Partial<FaceTextureConfig>) =>
    setFaceDraft({ meshId: mesh.id, faceKey, cfg: { ...config, ...patch } });

  /**
   * Writes the document (one discrete undo step) and drops the draft. A no-op edit is
   * skipped, so tabbing through a field — or reverting it with Escape — never leaves a
   * phantom entry in the undo history.
   */
  const commit = (patch: Partial<FaceTextureConfig>) => {
    setFaceDraft(null);
    const next = { ...config, ...patch };
    if (JSON.stringify(next) === JSON.stringify(stored)) return;
    void updateMeshFaceConfig(mesh.id, faceKey, next);
  };

  const baseColorTextures = part.customTextures.filter((t) => t.channel === 'baseColor');

  return (
    <div className={focusCard}>
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-fg">Face: {FACE_LABELS[faceKey] ?? faceKey}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">{mesh.name}</span>
      </div>

      <Select
        label="Texture"
        size="sm"
        selectedKey={config.textureId}
        onSelectionChange={(k) => commit({ textureId: String(k) })}
      >
        <ListBoxItem id="" textValue="(none)">
          (none)
        </ListBoxItem>
        {baseColorTextures.map((t) => (
          <ListBoxItem key={t.id} id={t.id} textValue={t.name}>
            <TextureRow name={t.name} url={textureUrls[t.id]} />
          </ListBoxItem>
        ))}
      </Select>

      <Select
        label="Wrap"
        size="sm"
        selectedKey={config.wrap ?? 'repeat'}
        onSelectionChange={(k) => commit({ wrap: k as TextureWrap })}
        isDisabled={!config.textureId}
      >
        {WRAP_LABELS.map(({ id, label }) => (
          <ListBoxItem key={id} id={id}>
            {label}
          </ListBoxItem>
        ))}
      </Select>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-fg-muted">UV scale</span>
        <p className="text-[11px] leading-snug text-fg-subtle">
          &gt;1 tiles the image, &lt;1 zooms into a region (pan it with offset).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <UvField
            label="X"
            value={stored.uvScale.x}
            onPreview={(x) => preview({ uvScale: { ...config.uvScale, x } })}
            onCommit={(x) => commit({ uvScale: { ...config.uvScale, x } })}
            onRevert={() => setFaceDraft(null)}
          />
          <UvField
            label="Y"
            value={stored.uvScale.y}
            onPreview={(y) => preview({ uvScale: { ...config.uvScale, y } })}
            onCommit={(y) => commit({ uvScale: { ...config.uvScale, y } })}
            onRevert={() => setFaceDraft(null)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-fg-muted">UV offset</span>
        <div className="grid grid-cols-2 gap-2">
          <UvField
            label="X"
            value={stored.uvOffset.x}
            onPreview={(x) => preview({ uvOffset: { ...config.uvOffset, x } })}
            onCommit={(x) => commit({ uvOffset: { ...config.uvOffset, x } })}
            onRevert={() => setFaceDraft(null)}
          />
          <UvField
            label="Y"
            value={stored.uvOffset.y}
            onPreview={(y) => preview({ uvOffset: { ...config.uvOffset, y } })}
            onCommit={(y) => commit({ uvOffset: { ...config.uvOffset, y } })}
            onRevert={() => setFaceDraft(null)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="secondary"
          isDisabled={!mesh.faceTextures[faceKey]}
          onPress={() => void copyFaceConfigToAll(mesh.id, faceKey)}
        >
          Copy to all faces
        </Button>
        <Button
          size="sm"
          variant="ghost"
          isDisabled={!mesh.faceTextures[faceKey]}
          onPress={() => {
            setFaceDraft(null);
            void clearMeshFaceConfig(mesh.id, faceKey);
          }}
        >
          Clear face
        </Button>
      </div>
    </div>
  );
}

/**
 * One UV number, wired to the preview/commit split.
 *
 * `PreciseNumberInput` commits every VALID keystroke through its `onCommit`, which is exactly
 * the live-preview stream this card wants — so that stream feeds `$faceDraft`, and the
 * DOCUMENT write happens on blur/Enter with the last previewed value.
 *
 * `value` is deliberately the STORED number, not the draft: that is what `useNumberDraft`
 * reverts to on Escape, which is what makes "Esc mid-edit reverts the field and the preview"
 * true (design §1.4).
 */
function UvField({
  label,
  value,
  onPreview,
  onCommit,
  onRevert,
}: {
  label: string;
  value: number;
  onPreview: (n: number) => void;
  onCommit: (n: number) => void;
  onRevert: () => void;
}) {
  // The value the blur will commit. A ref, written only from EVENT handlers (never in the
  // render body — that would be a ref write during render).
  const latest = useRef(value);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-fg-subtle">{label}</span>
      <span
        onFocus={() => {
          latest.current = value;
        }}
        onBlur={() => onCommit(latest.current)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLElement).blur();
          if (e.key === 'Escape') {
            latest.current = value;
            onRevert();
          }
        }}
      >
        <PreciseNumberInput
          aria-label={label}
          value={value}
          onCommit={(n) => {
            latest.current = n;
            onPreview(n);
          }}
        />
      </span>
    </label>
  );
}
