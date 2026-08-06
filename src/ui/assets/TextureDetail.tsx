import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button, ListBoxItem, Select, TextField, cn } from '../kit';
import {
  $assetUsage,
  $customTextureUrls,
  replaceTextureImage,
  renameCustomTexture,
  setTextureChannel,
} from '../../state/customAssetStore';
import { $part } from '../../state/editorStore';
import { pickSurfaceFace } from '../../state/surfaceModeStore';
import { openMeshSurface } from '../surface/surfaceJump';
import { CHANNEL_LABELS, CHANNEL_ORDER } from '../channelLabels';
import { FACE_LABELS } from '../../three/primitives';
import { toast } from '../toast';
import type { TextureChannel } from '../../ksa/types';
import { useManagerNav } from './managerNav';
import { requestDeleteTexture } from './assetActions';
import { REPLACE_IMAGE_WARNING } from './bytePolicy';

/**
 * **Texture detail** (design: design-surface-assets.md §2.2 "Texture"): the preview at size,
 * the two edits v1 never had (rename, replace-in-place), the channel re-declaration it did,
 * where the image is used — and deletion under the §5.1 matrix.
 *
 * Both byte-touching actions ALWAYS confirm (foundation §14.3 tier 3): a texture's source and
 * `.ktx2` blobs live outside the undo document, so undo brings the row back and not the
 * pixels.
 *
 * **Undo enrollment**: `renameCustomTexture` / `setTextureChannel` / `replaceTextureImage` /
 * `removeCustomTexture` each push their own discrete step. Nothing here batches.
 */
export function TextureDetail({ textureId }: { textureId: string }) {
  const nav = useManagerNav();
  const part = useStore($part);
  const usage = useStore($assetUsage);
  const urls = useStore($customTextureUrls);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [fit, setFit] = useState(true);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Paste an image to replace this one — the same clipboard affordance the upload form has,
  // scoped to this view being mounted. The pick only ARMS the confirm; nothing is overwritten
  // until the user answers it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      setPendingFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const texture = part.customTextures.find((t) => t.id === textureId);
  if (!texture) {
    return <p className="p-4 text-sm text-fg-subtle">This texture no longer exists.</p>;
  }

  const use = usage.texture.get(texture.id);
  const url = urls[texture.id];

  const commitName = () => {
    const next = (nameDraft ?? '').trim();
    setNameDraft(null);
    if (!next || next === texture.name) return;
    renameCustomTexture(texture.id, next);
  };

  const doReplace = async (file: File) => {
    setBusy(true);
    try {
      await replaceTextureImage(texture.id, file);
      toast({ title: 'Image replaced', description: texture.name, variant: 'success' });
    } catch (err) {
      console.warn('texture replace failed', err);
      toast({
        title: 'Replace failed',
        description: String((err as Error)?.message ?? err),
        variant: 'danger',
      });
    } finally {
      setPendingFile(null);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div
        className={cn(
          'flex h-64 shrink-0 items-center justify-center overflow-auto rounded-lg border border-border',
        )}
        style={{
          background:
            'repeating-conic-gradient(rgb(255 255 255 / 6%) 0% 25%, rgb(0 0 0 / 25%) 0% 50%)',
          backgroundSize: '16px 16px',
        }}
      >
        {url ? (
          <img
            src={url}
            alt={texture.name}
            // Fit scales a small map UP to be inspectable; 1:1 shows the stored pixels.
            // Nearest-neighbour either way — a smoothed preview lies about the texels.
            className={fit ? 'max-h-full max-w-full object-contain' : 'max-w-none'}
            style={{ imageRendering: 'pixelated', height: fit ? '100%' : undefined }}
          />
        ) : (
          <span className="p-8 text-xs text-fg-subtle">
            Image bytes are missing from this browser.
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onPress={() => setFit(!fit)}>
          {fit ? 'View 1:1' : 'Fit'}
        </Button>
        <span className="font-mono text-xs text-fg-subtle">
          {texture.width}×{texture.height}
        </span>
      </div>

      <TextField
        label="Name"
        size="sm"
        value={nameDraft ?? texture.name}
        onChange={setNameDraft}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setNameDraft(null);
        }}
      />

      <Select
        label="This image is…"
        size="sm"
        selectedKey={texture.channel}
        onSelectionChange={(k) => void setTextureChannel(texture.id, String(k) as TextureChannel)}
      >
        {CHANNEL_ORDER.map((c) => (
          <ListBoxItem key={c} id={c}>
            {CHANNEL_LABELS[c]}
          </ListBoxItem>
        ))}
      </Select>
      {texture.channel === 'normal' && (
        <p className="text-[11px] leading-snug text-fg-subtle">
          Use a standard (OpenGL/glTF-convention) normal map — flexo applies KSA’s decoding
          convention automatically.
        </p>
      )}

      {/* Replace image — tier 3: the stored bytes are overwritten and the old ones are gone. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setPendingFile(file);
        }}
      />
      {pendingFile ? (
        <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-2">
          <p className="text-xs leading-snug text-warning">
            Replace “{texture.name}” with “{pendingFile.name}”? {REPLACE_IMAGE_WARNING}
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onPress={() => setPendingFile(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              isDisabled={busy}
              onPress={() => void doReplace(pendingFile)}
            >
              {busy ? 'Encoding…' : 'Replace image'}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onPress={() => fileInput.current?.click()}>
          Replace image…
        </Button>
      )}

      <section className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          Where used
        </span>
        {!use || (use.faces.length === 0 && use.materials.length === 0) ? (
          <p className="text-xs text-fg-subtle">Nothing uses this texture.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {use.faces.map((face) => {
              const mesh = part.customMeshes.find((m) => m.id === face.meshId);
              return (
                <Button
                  key={`${face.meshId}:${face.faceKey}`}
                  size="xs"
                  variant="secondary"
                  onPress={() => {
                    // Face reference → jump to Surface with that mesh AND that face picked.
                    nav.close();
                    openMeshSurface(face.meshId);
                    pickSurfaceFace(face.faceKey);
                  }}
                >
                  {mesh?.name ?? 'mesh'} · {FACE_LABELS[face.faceKey] ?? face.faceKey}
                </Button>
              );
            })}
            {use.materials.map((ref) => {
              const material = part.customMaterials.find((m) => m.id === ref.matId);
              return (
                <Button
                  key={`${ref.matId}:${ref.slot}`}
                  size="xs"
                  variant="secondary"
                  onPress={() => nav.openDetail('material', ref.matId)}
                >
                  {material?.name ?? 'material'} · {ref.slot}
                </Button>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex justify-end border-t border-border pt-3">
        <Button
          size="sm"
          variant="danger-ghost"
          onPress={() => requestDeleteTexture(nav, texture, usage)}
        >
          Delete texture…
        </Button>
      </div>
    </div>
  );
}
