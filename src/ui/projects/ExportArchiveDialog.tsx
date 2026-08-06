import { createContext, use, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Button,
  Dialog,
  DialogViewStack,
  Modal,
  TextField,
  dangerBox,
  useDialogViewStack,
  type DialogView,
} from '../kit';
import { $currentProjectId, $projectIndex } from '../../state/projectIndexStore';
import { flushAutosave } from '../../state/projectStore';
import {
  archiveFileName,
  buildProjectArchive,
  gzipSupported,
  type ArchivePhase,
} from '../../state/projectArchive';
import { status, trackJob } from '../../state/statusStore';
import { toast } from '../toast';
import { formatBytes } from './projectFormat';

/**
 * **Export Project Archive…** (dialog id `'export-archive'`, S→M — design:
 * `plans/flexo_v2/design/design-projects-export.md` §4.2; LOCKED #3).
 *
 * Writes a `.flexo.tar.gz` for ANY project — the row action works without opening it, because
 * the builder reads the STORED snapshot and the project's namespaced blobs, never live editor
 * state (the current project flushes its autosave first). It replaces v1's "Export Project
 * Data" JSON textarea, which could not carry a single byte of a texture and disabled itself
 * whenever a project had one.
 *
 * Two views on one `DialogViewStack`: a summary with the file name, and an undismissable
 * progress view that owns the run. Cancel aborts the `AbortController`, so no partial file is
 * ever delivered.
 *
 * **Undo enrollment: NONE** — export is read-only over the document.
 */
export interface ExportArchiveParams {
  projectId?: string;
}

export function ExportArchiveDialog({
  isOpen,
  onOpenChange,
  params,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  params?: ExportArchiveParams;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      variant="center"
      className="max-w-lg"
    >
      <Dialog>
        <ExportBody projectId={params?.projectId} onClose={() => onOpenChange(false)} />
      </Dialog>
    </Modal>
  );
}

/**
 * The summary view reaches the stack through a context rather than a prop for the reason
 * `AssetManagerDialog` documents: the ROOT view's element is built in the same render as the
 * stack that would have to supply it.
 */
interface ExportNav {
  projectId: string;
  isCurrent: boolean;
  close: () => void;
  start: (fileName: string) => void;
}

const ExportNavContext = createContext<ExportNav>({
  projectId: '',
  isCurrent: false,
  close: () => {},
  start: () => {},
});

/** A module const, so the stack's root element is one stable descriptor. */
const SUMMARY_VIEW: DialogView = {
  id: 'summary',
  title: 'Export archive',
  element: <SummaryView />,
};

function ExportBody({ projectId, onClose }: { projectId?: string; onClose: () => void }) {
  const currentId = useStore($currentProjectId);
  const id = projectId || currentId;
  const stack = useDialogViewStack(SUMMARY_VIEW);

  const nav: ExportNav = {
    projectId: id,
    isCurrent: id === currentId,
    close: onClose,
    start: (fileName) =>
      stack.push({
        id: 'progress',
        title: 'Exporting…',
        element: (
          <ProgressView
            projectId={id}
            isCurrent={id === currentId}
            fileName={fileName}
            onDone={onClose}
            onCancelled={stack.pop}
          />
        ),
      }),
  };

  return (
    <ExportNavContext value={nav}>
      <DialogViewStack stack={stack} onClose={onClose} />
    </ExportNavContext>
  );
}

function SummaryView() {
  const nav = use(ExportNavContext);
  const index = useStore($projectIndex);
  const meta = index.find((row) => row.id === nav.projectId) ?? null;
  const [fileName, setFileName] = useState('');
  const onCancel = nav.close;
  const onExport = () => nav.start(fileName || meta?.name || 'project');
  const onFileName = setFileName;
  const value = fileName || meta?.name || '';
  if (!gzipSupported()) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className={dangerBox}>
          This browser cannot build archives — it has no built-in gzip compression (
          <span className="font-mono">CompressionStream</span>). Use a current Chrome, Edge, Firefox
          or Safari.
        </div>
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onPress={onCancel}>
            Close
          </Button>
        </div>
      </div>
    );
  }
  if (!meta) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className={dangerBox}>That project could not be read from storage.</div>
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onPress={onCancel}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  const counts = Object.entries(meta.counts)
    .filter(([, n]) => n > 0)
    .slice(0, 4)
    .map(([label, n]) => `${n} ${label}`)
    .join(' · ');

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-fg">{meta.name}</span>
        <span className="text-xs text-fg-subtle">{counts || 'empty project'}</span>
        {/* The archive carries EVERY part, and `meta.counts` above is their sum — so a
            multi-part project has to say how many documents that sum covers. */}
        {meta.parts.length > 1 && (
          <span className="text-xs text-fg-subtle">{meta.parts.length} parts</span>
        )}
        <span className="text-xs text-fg-subtle">
          {meta.bytes.assets > 0
            ? `assets ≈ ${formatBytes(meta.bytes.assets)}`
            : 'no binary assets'}
        </span>
      </div>
      <TextField
        size="sm"
        label="File name"
        aria-label="Archive file name"
        value={value}
        onChange={onFileName}
      />
      <span className="font-mono text-xs text-fg-subtle">→ {archiveFileName(value)}</span>
      <p className="text-xs leading-snug text-fg-subtle">
        The archive carries the whole project — its document plus every uploaded texture, primitive
        mesh and imported model. Re-import it with File ▸ Import Project….
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onPress={onExport}>
          Export
        </Button>
      </div>
    </div>
  );
}

const PHASE_LABELS: Record<ArchivePhase, string> = {
  collect: 'Collecting assets',
  pack: 'Packing',
  compress: 'Compressing',
};

/**
 * The undismissable run view. It OWNS the export: starting it on mount is what lets the
 * pushed view re-render its own progress without the parent re-pushing it.
 */
function ProgressView({
  projectId,
  isCurrent,
  fileName,
  onDone,
  onCancelled,
}: {
  projectId: string;
  isCurrent: boolean;
  fileName: string;
  onDone: () => void;
  onCancelled: () => void;
}) {
  const [phase, setPhase] = useState<ArchivePhase>('collect');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [controller] = useState(() => new AbortController());
  /**
   * The run must happen EXACTLY once. StrictMode deliberately mounts, unmounts and remounts
   * an effect in development, and building an archive is not idempotent — without this guard
   * the user would get two files (and, in the import dialog's twin, two merges).
   */
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let live = true;
    const job = trackJob('Exporting archive');
    void (async () => {
      try {
        if (isCurrent) await flushAutosave();
        const blob = await buildProjectArchive(projectId, {
          signal: controller.signal,
          onProgress: (nextPhase, done, total) => {
            if (!live) return;
            setPhase(nextPhase);
            setProgress({ done, total });
            job.setProgress(done, total || 1);
          },
        });
        await deliver(blob, archiveFileName(fileName));
        if (!live) return;
        status('Archive exported ✓', { severity: 'success' });
        toast({
          title: 'Archive exported',
          description: `${archiveFileName(fileName)} · ${formatBytes(blob.size)}`,
          variant: 'success',
        });
        onDone();
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          if (live) onCancelled();
          return;
        }
        const message = (err as Error)?.message ?? String(err);
        if (live) setError(message);
        toast({ title: 'Archive export failed', description: message, variant: 'danger' });
      } finally {
        job.end();
      }
    })();
    return () => {
      live = false;
    };
    // Mount-only: the run is started once, and cancelling aborts it rather than restarting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className={dangerBox}>{error}</div>
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onPress={onCancelled}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
  return (
    <div className="flex flex-col gap-3 p-4">
      <span className="text-sm text-fg">{PHASE_LABELS[phase]}…</span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-sunken">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${percent ?? 100}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-fg-subtle">
        {progress.total > 0 ? `${progress.done} / ${progress.total} files` : 'working…'}
      </span>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onPress={() => controller.abort()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** `showSaveFilePicker` when the browser has it, else a Blob + `<a download>`. */
async function deliver(blob: Blob, name: string): Promise<void> {
  if (typeof window !== 'undefined' && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        id: 'flexo-archive',
        suggestedName: name,
        types: [{ description: 'flexo project archive', accept: { 'application/gzip': ['.gz'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // The user dismissing the picker is not a failure — and neither is a browser that
      // advertises the API but refuses it in this context; fall through to the anchor.
      if ((err as Error)?.name === 'AbortError') throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
