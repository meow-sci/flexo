import { createContext, use, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Upload } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogViewStack,
  Modal,
  ToggleButton,
  ToggleButtonGroup,
  cn,
  dangerBox,
  monoTextarea,
  noteBox,
  useDialogViewStack,
  type DialogView,
} from '../kit';
import { $projectIndex, uniqueProjectName } from '../../state/projectIndexStore';
import { importProjectData } from '../../state/editorStore';
import { loadProjectAsNew } from '../../state/projectStore';
import { importArchive, parseProjectArchive } from '../../state/projectArchive';
import type { ArchiveParseResult } from '../../state/projectArchive';
import { parseProjectImport, type ProjectExportEnvelope } from '../../state/projectTransfer';
import { setMode } from '../../state/modeStore';
import { status } from '../../state/statusStore';
import { toast } from '../toast';
import { formatBytes } from './projectFormat';

/**
 * **Import Project…** (dialog id `'import-project'`, size M — design:
 * `plans/flexo_v2/design/design-projects-export.md` §4.3; foundation §10.9).
 *
 * One flow for both containers — a `.flexo.tar.gz` archive (binaries included) or the plain
 * project JSON v1 could paste — and one destination choice:
 *
 * - **Merge into current project** (default): additive, with fresh collision-free ids and
 *   every cross-reference rewritten, as **ONE undo step**. An archive's textures and meshes
 *   are adopted into this project's namespace; byte-identical textures dedupe onto the ones
 *   already here.
 * - **Open as new project**: a faithful reconstruction as a fresh saved project, switched to.
 *   Not an undo step — it arrives as a project, not as an edit.
 *
 * v1 accepted a pasted string and nothing else (census pain #8); the paste box is kept, and
 * drop / file-pick are added beside it.
 */
export function ImportProjectDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
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
        <ImportBody onClose={() => onOpenChange(false)} />
      </Dialog>
    </Modal>
  );
}

/** What the Pick view produced: an archive with its assets, or a bare JSON envelope. */
type Pending =
  | { kind: 'archive'; parsed: Extract<ArchiveParseResult, { ok: true }> }
  | { kind: 'json'; env: ProjectExportEnvelope };

interface ImportNav {
  close: () => void;
  review: (pending: Pending) => void;
  run: (pending: Pending, mode: 'merge' | 'new') => void;
  back: () => void;
}

const ImportNavContext = createContext<ImportNav>({
  close: () => {},
  review: () => {},
  run: () => {},
  back: () => {},
});

/** A module const, so the stack's root element is one stable descriptor. */
const PICK_VIEW: DialogView = { id: 'pick', title: 'Import project', element: <PickView /> };

function ImportBody({ onClose }: { onClose: () => void }) {
  const stack = useDialogViewStack(PICK_VIEW);

  const nav: ImportNav = {
    close: onClose,
    back: stack.pop,
    review: (pending) =>
      stack.push({
        id: 'review',
        title: `Import “${projectNameOf(pending)}”`,
        element: <ReviewView pending={pending} />,
      }),
    run: (pending, mode) =>
      stack.push({
        id: 'importing',
        title: 'Importing…',
        element: <ImportingView pending={pending} mode={mode} onDone={onClose} />,
      }),
  };

  return (
    <ImportNavContext value={nav}>
      <DialogViewStack stack={stack} onClose={onClose} />
    </ImportNavContext>
  );
}

function projectNameOf(pending: Pending): string {
  return pending.kind === 'archive'
    ? pending.parsed.manifest.name
    : pending.env.projectName || 'project';
}

// ── view 1: pick ─────────────────────────────────────────────────────────────

const ARCHIVE_SUFFIXES = ['.tar.gz', '.tgz'];

function PickView() {
  const nav = use(ImportNavContext);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const proceed = async () => {
    setBusy(true);
    setError(null);
    try {
      if (file && ARCHIVE_SUFFIXES.some((suffix) => file.name.toLowerCase().endsWith(suffix))) {
        const parsed = await parseProjectArchive(file);
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        nav.review({ kind: 'archive', parsed });
        return;
      }
      // A `.json` file and the paste box are the same wire form; neither carries a byte, so
      // both parse with `binaryAssets: null` (the v1 drop rule).
      const source = file ? await file.text() : text;
      const parsed = parseProjectImport(source, { binaryAssets: null });
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      nav.review({ kind: 'json', env: parsed.env });
    } catch (err) {
      setError((err as Error)?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files[0];
          if (dropped) setFile(dropped);
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center',
          dragging && 'border-accent bg-accent/5',
        )}
      >
        <Upload size={18} className="text-fg-subtle" />
        <p className="text-xs text-fg-muted">
          Drop a <span className="font-mono">.flexo.tar.gz</span> or{' '}
          <span className="font-mono">.flexo.json</span> here
        </p>
        <label className="cursor-default">
          <input
            type="file"
            accept=".gz,.tgz,.json,application/gzip,application/json"
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <span className="rounded-md border border-border px-2 py-1 text-xs text-fg hover:border-border-strong">
            Choose file…
          </span>
        </label>
        {file && <span className="font-mono text-[11px] text-fg-subtle">{file.name}</span>}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-fg-muted">…or paste exported project JSON:</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste exported project JSON here…"
          className={cn(monoTextarea, 'h-32')}
          spellCheck={false}
        />
      </label>

      {error && <div className={dangerBox}>{error}</div>}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={nav.close}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          isDisabled={busy || (!file && !text.trim())}
          onPress={() => void proceed()}
        >
          {busy ? 'Reading…' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}

// ── view 2: review ───────────────────────────────────────────────────────────

function ReviewView({ pending }: { pending: Pending }) {
  const nav = use(ImportNavContext);
  const index = useStore($projectIndex);
  const [destination, setDestination] = useState<'merge' | 'new'>('merge');

  const env = pending.kind === 'archive' ? pending.parsed.envelope : pending.env;
  const assetBytes =
    pending.kind === 'archive'
      ? pending.parsed.assets.reduce((sum, asset) => sum + asset.bytes.length, 0)
      : 0;
  const assetCount = pending.kind === 'archive' ? pending.parsed.assets.length : 0;
  // `uniqueProjectName` reads the same index this component subscribes to, so the preview
  // name is live rather than stamped when the view was pushed.
  void index;
  const newName = uniqueProjectName(projectNameOf(pending));

  const counts: [string, number][] = [
    ['SubParts', env.data.placements.length],
    ['connectors', env.data.connectors.length],
    ['colliders', env.data.colliders.length],
    ['seats', env.data.ivaSeats.length],
    ['lights', env.data.lights.length],
    ['animations', env.data.animations.length],
    ['layers', env.data.layers.length],
  ];

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className={noteBox}>
        {pending.kind === 'archive'
          ? `Archive OK · format v${pending.parsed.manifest.archiveVersion} · wire v${pending.parsed.manifest.exportVersion}`
          : `Project JSON OK · wire v${env.version}`}
      </div>

      <p className="text-xs text-fg-muted">
        {counts
          .filter(([, n]) => n > 0)
          .map(([label, n]) => `${n} ${label}`)
          .join(' · ') || 'empty project'}
        {assetCount > 0 && ` · ${assetCount} assets (${formatBytes(assetBytes)})`}
      </p>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-fg-muted">Destination</span>
        <ToggleButtonGroup
          size="md"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[destination]}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next === 'merge' || next === 'new') setDestination(next);
          }}
        >
          <ToggleButton id="merge">Merge into current project</ToggleButton>
          <ToggleButton id="new">Open as new project</ToggleButton>
        </ToggleButtonGroup>
        <p className="text-xs leading-snug text-fg-subtle">
          {destination === 'merge'
            ? 'Adds everything to the project you have open, as one undo step.'
            : `Becomes “${newName}” and opens it. Your current project is untouched, and this is not an undo step.`}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={nav.back}>
          Back
        </Button>
        <Button size="sm" variant="primary" onPress={() => nav.run(pending, destination)}>
          Import
        </Button>
      </div>
    </div>
  );
}

// ── view 3: importing ────────────────────────────────────────────────────────

/**
 * The undismissable run view. It owns the import so its own progress state re-renders it
 * without the parent re-pushing the view.
 */
function ImportingView({
  pending,
  mode,
  onDone,
}: {
  pending: Pending;
  mode: 'merge' | 'new';
  onDone: () => void;
}) {
  const nav = use(ImportNavContext);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  /**
   * Exactly once. StrictMode's development mount/unmount/remount would otherwise import the
   * archive TWICE — two undo steps, two copies of every mesh (verified in the browser).
   */
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let live = true;
    void (async () => {
      try {
        if (pending.kind === 'archive') {
          const result = await importArchive({
            mode,
            parsed: pending.parsed,
            onProgress: (done, total) => {
              if (live) setProgress({ done, total });
            },
          });
          finish(mode, result.name);
        } else if (mode === 'merge') {
          const summary = importProjectData(pending.env);
          finish(mode, pending.env.projectName, summary.meshes);
        } else {
          const created = await loadProjectAsNew(pending.env);
          finish(mode, created.name);
        }
        if (live) onDone();
      } catch (err) {
        const message = (err as Error)?.message ?? String(err);
        if (live) setError(message);
        toast({ title: 'Import failed', description: message, variant: 'danger' });
      }
    })();
    return () => {
      live = false;
    };
    // Mount-only: the import runs once, and its inputs were fixed when the view was pushed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className={dangerBox}>{error}</div>
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onPress={nav.back}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <span className="text-sm text-fg">
        {progress.total > 0 ? `Copying assets… ${progress.done}/${progress.total}` : 'Importing…'}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-sunken">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{
            width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 100}%`,
          }}
        />
      </div>
    </div>
  );
}

/** Success reporting + the §4.3 landing: Build mode, with the import's own layers revealed. */
function finish(mode: 'merge' | 'new', name: string, meshes?: number): void {
  setMode('build');
  if (mode === 'new') {
    status(`Opened “${name}”`, { severity: 'success' });
    toast({ title: 'Project imported', description: `Opened as “${name}”`, variant: 'success' });
    return;
  }
  toast({
    title: 'Project imported',
    description:
      meshes === undefined
        ? `“${name}” merged into this project — one ⌘Z undoes all of it.`
        : `${meshes} SubParts merged — one ⌘Z undoes all of it.`,
    variant: 'success',
  });
}
