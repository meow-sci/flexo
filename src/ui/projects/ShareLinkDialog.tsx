import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button, Dialog, DialogHeader, Modal, dangerBox, noteBox } from '../kit';
import { $activePartId, $partsSnapshot } from '../../state/partsStore';
import { $currentProjectId, $projectIndex } from '../../state/projectIndexStore';
import { flushAutosave } from '../../state/projectStore';
import { getSnapshot, type SavedPartEntry } from '../../state/projectDb';
import { hasCustomAssets } from '../../state/projectTransfer';
import { createShareLink } from '../../state/projectShareLink';
import { openDialog } from '../../state/dialogStore';

/**
 * **Share Link…** (dialog id `'share-link'`, size M — design:
 * `plans/flexo_v2/design/design-projects-export.md` §5, decision D10).
 *
 * A single stateless URL that carries an ENTIRE project (compact JSON → Zstd → URL-safe
 * Base64; see `projectShareLink.ts`). Opening it gives the recipient the project as a new
 * local project — no server, no account. The pipeline is byte-identical to v1.
 *
 * **The `hasCustomAssets` split** (LOCKED #3 + D10). Archives removed that gate; share links
 * keep it, because the gate was never about policy — a URL cannot carry a texture's bytes. So
 * a project with binary assets does not get a broken link and does not get a greyed-out menu
 * item either (foundation Law: explain, don't grey): the dialog stays reachable, says what is
 * in the way, and hands over to Export archive…. Part-ified KITTEN meshes still share fine —
 * they are data-only references to game assets.
 *
 * **Undo enrollment: NONE** — sharing is read-only over the document.
 */
export interface ShareLinkParams {
  projectId?: string;
}

export function ShareLinkDialog({
  isOpen,
  onOpenChange,
  params,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  params?: ShareLinkParams;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      variant="center"
      className="max-w-2xl"
    >
      <Dialog>
        <ShareBody projectId={params?.projectId} onClose={() => onOpenChange(false)} />
      </Dialog>
    </Modal>
  );
}

/** How many characters make a URL risky in the wild (design §5). */
const LONG_LINK_CHARS = 8000;

function ShareBody({ projectId, onClose }: { projectId?: string; onClose: () => void }) {
  const currentId = useStore($currentProjectId);
  const index = useStore($projectIndex);
  const id = projectId || currentId;
  const isCurrent = id === currentId;
  const meta = index.find((row) => row.id === id) ?? null;

  const live = useStore($partsSnapshot);
  const activePartId = useStore($activePartId);

  /** For a non-current project the source is the STORED snapshot, loaded once (§5). */
  const [stored, setStored] = useState<{ parts: SavedPartEntry[]; activeIndex: number } | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (isCurrent) return;
    let alive = true;
    void getSnapshot(id)
      .then((snapshot) => {
        if (!alive) return;
        if (snapshot && snapshot.parts.length > 0) {
          const activeIndex = snapshot.parts.findIndex((p) => p.id === snapshot.activePartId);
          setStored({ parts: snapshot.parts, activeIndex: Math.max(activeIndex, 0) });
        } else setLoadError('That project could not be read from storage.');
      })
      .catch((err) => alive && setLoadError(String(err)));
    return () => {
      alive = false;
    };
  }, [id, isCurrent]);

  // Every part travels — a share is a project transfer, not a KSA export (P2.03).
  const parts = isCurrent ? live : stored?.parts;
  const activeIndex = isCurrent
    ? Math.max(
        (parts ?? []).findIndex((entry) => entry.id === activePartId),
        0,
      )
    : (stored?.activeIndex ?? 0);
  const name = meta?.name ?? 'Project';

  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const linkRef = useRef<HTMLPreElement>(null);

  const generate = async () => {
    if (!parts) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      // The current project's link must describe what is on screen, so pending autosave is
      // flushed first — the snapshot and the document then agree.
      if (isCurrent) await flushAutosave();
      setLink(await createShareLink(parts, name, activeIndex));
    } catch (err) {
      setError(`Could not build link: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * `navigator.clipboard` is **undefined outside a secure context** (a phone on a plain-HTTP
   * LAN URL), and iOS refuses a write that isn't inside a user gesture it recognises. Either
   * way this used to `console.warn` and change nothing on screen — a silent dead button on the
   * one flow that exists to hand a link to someone. So the failure path selects the link text
   * instead and says so: OS long-press ▸ Copy is the touch route from there.
   */
  const copy = async () => {
    if (!link) return;
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setCopyFailed(false);
    } catch (err) {
      console.warn('clipboard write failed', err);
      setCopyFailed(true);
      const pre = linkRef.current;
      const selection = window.getSelection();
      if (pre && selection) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  };

  return (
    <>
      <DialogHeader title={`Share “${name}”`} onClose={onClose} />
      <div className="flex flex-col gap-3 overflow-auto p-4">
        {loadError && <div className={dangerBox}>{loadError}</div>}

        {parts && hasCustomAssets(parts) ? (
          <WithAssetsExplainer parts={parts} projectId={id} onClose={onClose} />
        ) : (
          parts && (
            <>
              <p className="text-xs leading-snug text-fg-subtle">
                Generate a self-contained link to this project. Anyone who opens it gets a copy as a
                new project — no server, nothing saved online. The whole project (meshes, layers,
                connectors, kittens, kitten meshes, animations and GameData) is compressed into the
                link itself.
              </p>

              {link == null ? (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="primary"
                    isDisabled={busy}
                    onPress={() => void generate()}
                  >
                    {busy ? 'Generating…' : 'Generate link'}
                  </Button>
                </div>
              ) : (
                <>
                  <pre
                    ref={linkRef}
                    className="max-h-48 overflow-auto rounded-md border border-border bg-panel-sunken p-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-fg select-all"
                  >
                    {link}
                  </pre>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs tabular-nums text-fg-subtle">
                      {link.length.toLocaleString()} characters
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        isDisabled={busy}
                        onPress={() => void generate()}
                      >
                        Regenerate
                      </Button>
                      <Button size="sm" variant="primary" onPress={() => void copy()}>
                        {copied ? 'Copied!' : 'Copy link'}
                      </Button>
                    </div>
                  </div>
                  {copyFailed && (
                    <p className="text-xs text-warning">
                      This browser wouldn’t let the page write to the clipboard — the link above is
                      selected, so long-press or right-click it and choose Copy. (Clipboard access
                      needs an HTTPS page; a plain-http:// address never gets it.)
                    </p>
                  )}
                  {link.length > LONG_LINK_CHARS && (
                    <p className="text-xs text-warning">
                      Some browsers truncate URLs this long — consider an archive instead.
                    </p>
                  )}
                </>
              )}

              {error && <div className={dangerBox}>{error}</div>}
            </>
          )
        )}
      </div>
    </>
  );
}

/** The D10 state: enabled, explained, and pointed at the container that CAN carry bytes. */
function WithAssetsExplainer({
  parts,
  projectId,
  onClose,
}: {
  parts: readonly SavedPartEntry[];
  projectId: string;
  onClose: () => void;
}) {
  // Counted across every part — assets are per-part (D1), the blocker is project-wide.
  const textures = parts.reduce((sum, entry) => sum + entry.part.customTextures.length, 0);
  const meshes = parts.reduce(
    (sum, entry) => sum + entry.part.customMeshes.filter((mesh) => !mesh.kitten).length,
    0,
  );
  const summary = [
    textures > 0 ? `${textures} texture${textures === 1 ? '' : 's'}` : '',
    meshes > 0 ? `${meshes} mesh${meshes === 1 ? '' : 'es'}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <div className={noteBox}>
        <p className="text-sm text-fg">This project has binary assets ({summary}).</p>
        <p className="mt-1 text-xs leading-snug text-fg-muted">
          A share link is a URL — it can’t carry files. Export an archive instead; the recipient
          imports it via File ▸ Import Project….
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={onClose}>
          Close
        </Button>
        <Button
          size="sm"
          variant="primary"
          onPress={() => openDialog({ id: 'export-archive', params: { projectId } })}
        >
          Export archive instead…
        </Button>
      </div>
    </>
  );
}
