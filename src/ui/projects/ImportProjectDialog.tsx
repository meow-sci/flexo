import { createContext, use, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Upload } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogViewStack,
  GridList,
  GridListItem,
  Modal,
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
import {
  importArchive,
  importEnvelopeAsParts,
  parseProjectArchive,
} from '../../state/projectArchive';
import type { ArchiveImportMode, ArchiveParseResult } from '../../state/projectArchive';
import {
  parseProjectImport,
  type ProjectExportData,
  type ProjectExportEnvelope,
} from '../../state/projectTransfer';
import { setMode } from '../../state/modeStore';
import { status } from '../../state/statusStore';
import { toast } from '../toast';
import { formatBytes } from './projectFormat';

/**
 * **Import Project…** (dialog id `'import-project'`, size M — design:
 * `plans/flexo_v2/design/design-projects-export.md` §4.3; foundation §10.9;
 * `plans/MULTI_PART_PLAN.md` P2.06).
 *
 * One flow for both containers — a `.flexo.tar.gz` archive (binaries included) or the plain
 * project JSON v1 could paste — and one destination choice out of three:
 *
 * - **New project**: a faithful reconstruction as a fresh saved project, switched to, with
 *   every part of the payload. Not an undo step — it arrives as a project, not as an edit.
 * - **Add as new part(s)** (default): every part of the payload joins the open project as its
 *   own part, each merged into an empty document so nothing already here is touched. An
 *   archive's textures and meshes are adopted into this project's namespace under fresh ids.
 * - **Merge into active part**: the additive paste — one payload part's content merged into
 *   the active document as **ONE undo step**, byte-identical textures deduping onto the ones
 *   already here. Offered only for a single-part payload, since merging N parts into one
 *   document has no meaning.
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
  run: (pending: Pending, mode: ArchiveImportMode) => void;
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
  const [destination, setDestination] = useState<ArchiveImportMode>('add-parts');

  const env = pending.kind === 'archive' ? pending.parsed.envelope : pending.env;
  // An archive states its parts in the manifest — the container's own inventory, readable
  // without inflating anything. A pasted envelope carries the same two fields per entry.
  const parts =
    pending.kind === 'archive'
      ? pending.parsed.manifest.parts
      : env.parts.map((entry) => ({ name: entry.name, partId: entry.sourcePartId }));
  const assetBytes =
    pending.kind === 'archive'
      ? pending.parsed.assets.reduce((sum, asset) => sum + asset.bytes.length, 0)
      : 0;
  const assetCount = pending.kind === 'archive' ? pending.parsed.assets.length : 0;
  // `uniqueProjectName` reads the same index this component subscribes to, so the preview
  // name is live rather than stamped when the view was pushed.
  void index;
  const newName = uniqueProjectName(projectNameOf(pending));

  // Project-wide totals: a payload is N parts, so the summary line adds them up.
  const total = (pick: (data: ProjectExportData) => number): number =>
    env.parts.reduce((sum, entry) => sum + pick(entry.data), 0);
  const counts: [string, number][] = [
    ['SubParts', total((d) => d.placements.length)],
    ['connectors', total((d) => d.connectors.length)],
    ['colliders', total((d) => d.colliders.length)],
    ['seats', total((d) => d.ivaSeats.length)],
    ['lights', total((d) => d.lights.length)],
    ['animations', total((d) => d.animations.length)],
    ['layers', total((d) => d.layers.length)],
  ];

  // "Merge into active part" folds ONE part's content into the open document; with several
  // parts on the wire there is no answer to "which one", so the row states why it is off.
  const mergeBlocked = parts.length > 1 ? `source has ${parts.length} parts` : null;
  const destinations: { id: ArchiveImportMode; label: string; detail: string }[] = [
    {
      id: 'new',
      label: 'New project',
      detail: `Becomes “${newName}” and opens it. Your current project is untouched, and this is not an undo step.`,
    },
    {
      id: 'add-parts',
      label: `Add as new part${parts.length === 1 ? '' : 's'}`,
      detail: `Adds ${parts.length} part${parts.length === 1 ? '' : 's'} to the project you have open. Nothing already in it is touched.`,
    },
    {
      id: 'merge-into-active',
      label: 'Merge into active part',
      detail: mergeBlocked ?? 'Adds everything to the part you are editing, as one undo step.',
    },
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

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-fg-muted">
          {parts.length === 1 ? '1 part' : `${parts.length} parts`}
        </span>
        <ul className="flex flex-col gap-0.5 rounded-md border border-border p-2">
          {parts.map((part, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-fg">{part.name}</span>
              <span className="shrink-0 truncate font-mono text-[11px] text-fg-subtle">
                {part.partId}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-fg-muted">Destination</span>
        <GridList
          aria-label="Destination"
          selectionMode="single"
          selectionBehavior="replace"
          disallowEmptySelection
          selectedKeys={[destination]}
          onSelectionChange={(keys) => {
            if (keys === 'all') return;
            const next = destinations.find((option) => keys.has(option.id));
            if (next) setDestination(next.id);
          }}
        >
          {destinations.map((option) => (
            <GridListItem
              key={option.id}
              id={option.id}
              textValue={option.label}
              isDisabled={option.id === 'merge-into-active' && mergeBlocked !== null}
              className="flex-col items-stretch gap-0.5"
            >
              <span className="text-sm text-fg">{option.label}</span>
              <span className="text-xs leading-snug text-fg-subtle">{option.detail}</span>
            </GridListItem>
          ))}
        </GridList>
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
  mode: ArchiveImportMode;
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
          finish(mode, result.name, pending.parsed.envelope.parts.length);
        } else if (mode === 'merge-into-active') {
          // A data-only payload brings no bytes, so the merge needs no adoption plan; the
          // dialog only offers this destination for a single-part source.
          const summary = importProjectData(pending.env.parts[0]);
          finish(mode, pending.env.projectName, 1, summary.meshes);
        } else if (mode === 'add-parts') {
          // Same path the archive takes, with an empty asset table: the parse boundary already
          // dropped every binary-backed descriptor a pasted payload could not carry.
          await importEnvelopeAsParts(pending.env, [], (done, total) => {
            if (live) setProgress({ done, total });
          });
          finish(mode, pending.env.projectName, pending.env.parts.length);
        } else {
          const created = await loadProjectAsNew(pending.env);
          finish(mode, created.name, pending.env.parts.length);
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
function finish(mode: ArchiveImportMode, name: string, parts: number, meshes?: number): void {
  setMode('build');
  const plural = parts === 1 ? '' : 's';
  if (mode === 'new') {
    status(`Opened “${name}”`, { severity: 'success' });
    toast({
      title: 'Project imported',
      description: `Opened as “${name}” with ${parts} part${plural}`,
      variant: 'success',
    });
    return;
  }
  if (mode === 'add-parts') {
    // Not an undo step: adding a part is registry lifecycle, not a document mutation (I6).
    status(`Added ${parts} part${plural} from “${name}”`, { severity: 'success' });
    toast({
      title: 'Parts imported',
      description: `${parts} part${plural} added from “${name}” — you are now editing the first.`,
      variant: 'success',
    });
    return;
  }
  toast({
    title: 'Project imported',
    description:
      meshes === undefined
        ? `“${name}” merged into this part — one ⌘Z undoes all of it.`
        : `${meshes} SubParts merged — one ⌘Z undoes all of it.`,
    variant: 'success',
  });
}
