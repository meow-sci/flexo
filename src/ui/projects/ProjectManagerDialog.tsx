import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Selection } from 'react-aria-components';
import {
  Download,
  ExternalLink,
  LayoutGrid,
  List,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Chip,
  Dialog,
  DialogHeader,
  GridList,
  GridListItem,
  InlineConfirmStrip,
  ListBoxItem,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Modal,
  Popover,
  SearchField,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  cn,
  dangerBox,
} from '../kit';
import { openDialog } from '../../state/dialogStore';
import {
  createProject,
  deleteProject,
  duplicateProject,
  openProject,
} from '../../state/projectStore';
import {
  $autosaveHealth,
  $currentProjectId,
  $projectIndex,
  $storageEstimate,
  refreshStorageEstimate,
  renameProject,
  setProjectDescription,
} from '../../state/projectIndexStore';
import {
  $lockedElsewhere,
  $projectManagerView,
  $projectThumbUrls,
  ensureProjectThumb,
  refreshProjectLocks,
  releaseProjectThumbs,
  setProjectManagerView,
  type ProjectManagerSort,
} from '../../state/projectManagerStore';
import type { ProjectMeta } from '../../state/projectDb';
import { status } from '../../state/statusStore';
import { fuzzyAny } from '../fuzzyMatch';
import { formatBytes, relativeTime, sizeLine, totalBytes } from './projectFormat';

/**
 * **The Project Manager overlay** (dialog id `'projects'`, size L, `⌘O` — design:
 * `plans/flexo_v2/design/design-projects-export.md` §2; foundation §10.2; LOCKED #3).
 *
 * Every saved project as a card or a row: thumbnail, description, counts, created/saved
 * times, size, and the full action set (open · rename · describe · duplicate · save as ·
 * export archive · share · open in new tab · delete). It replaces v1's "Load Project" modal,
 * which listed a name, a SubPart count and a timestamp — derived by parsing every project's
 * whole localStorage snapshot on open — and whose delete opened a nested confirm dialog.
 *
 * Everything renders from `$projectIndex`, the reactive metadata index, so a rename in
 * ANOTHER TAB lands here without a poke; the only per-row I/O is the lazy thumbnail read.
 *
 * **No modal-in-modal** (foundation §10.1): deletion confirms with an inline strip ON the
 * row, and the other flows open their own root-hosted dialog through `dialogStore` (which
 * closes this one — dialogs never stack).
 *
 * **Undo enrollment: NONE.** Project lifecycle and metadata are not document mutations
 * (design §1.8); project deletion is not undoable at all, which is why it always confirms
 * with the irreversibility stated (foundation §14.3).
 */
export function ProjectManagerDialog({
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
      variant="cover"
      className="sm:w-[95vw] sm:max-w-[72rem]"
    >
      <Dialog className="h-full">
        <ManagerBody onClose={() => onOpenChange(false)} />
      </Dialog>
    </Modal>
  );
}

const SORT_LABELS: Record<ProjectManagerSort, string> = {
  saved: 'Last saved',
  created: 'Created',
  name: 'Name A–Z',
  size: 'Size',
};

function ManagerBody({ onClose }: { onClose: () => void }) {
  const projects = useStore($projectIndex);
  const currentId = useStore($currentProjectId);
  const prefs = useStore($projectManagerView);
  const health = useStore($autosaveHealth);
  const [query, setQuery] = useState('');
  // `Date.now()` is banned in a render body (Rules of React), so the relative timestamps are
  // stamped once per open — the same pattern the notification center uses.
  const [now] = useState(() => Date.now());
  /** The row showing its inline destructive strip (§2.2 — never a nested modal). */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Session-scoped reads that have no store of their own to drive them: the lock snapshot
  // (Web Locks has no change event) and the quota estimate. Both write STORES, never
  // component state, so this stays a Rules-of-React-clean effect.
  useEffect(() => {
    void refreshProjectLocks();
    void refreshStorageEstimate();
    return releaseProjectThumbs;
  }, []);

  const current = projects.find((p) => p.id === currentId) ?? null;
  const others = projects.filter((p) => p.id !== currentId);
  const matching = query.trim()
    ? others.filter((p) =>
        fuzzyAny(query, p.name, p.description, ...p.parts.flatMap((x) => [x.name, x.partId])),
      )
    : others;
  const sorted = sortProjects(matching, prefs.sort);

  // Thumbnails are read lazily, one IndexedDB get per visible card. Kicked off from an EFFECT
  // rather than from the cards' render bodies: `ensureProjectThumb` is idempotent, but a store
  // write belongs after the paint, not during it (Rules of React).
  useEffect(() => {
    if (current?.hasThumb) ensureProjectThumb(current.id);
    for (const row of sorted) if (row.hasThumb) ensureProjectThumb(row.id);
  });

  return (
    <>
      <DialogHeader title="Projects" onClose={onClose} />

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <SearchField
          size="sm"
          aria-label="Search projects"
          placeholder="Search name, description, part id…"
          value={query}
          onChange={setQuery}
          className="min-w-40 flex-1"
        />
        <Select
          aria-label="Sort projects"
          size="sm"
          className="w-40"
          selectedKey={prefs.sort}
          onSelectionChange={(key) => setProjectManagerView({ sort: key as ProjectManagerSort })}
        >
          {(Object.keys(SORT_LABELS) as ProjectManagerSort[]).map((sort) => (
            <ListBoxItem key={sort} id={sort}>
              Sort: {SORT_LABELS[sort]}
            </ListBoxItem>
          ))}
        </Select>
        <ToggleButtonGroup
          size="xs"
          className="w-auto shrink-0"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[prefs.view]}
          onSelectionChange={(keys) => {
            const view = [...keys][0];
            if (view === 'grid' || view === 'list') setProjectManagerView({ view });
          }}
        >
          <ToggleButton id="grid" size="sm" className="w-8 flex-none" aria-label="Grid view">
            <LayoutGrid size={13} />
          </ToggleButton>
          <ToggleButton id="list" size="sm" className="w-8 flex-none" aria-label="List view">
            <List size={13} />
          </ToggleButton>
        </ToggleButtonGroup>
        <Button size="sm" variant="secondary" onPress={() => void createProject()}>
          <Plus size={13} /> New Project
        </Button>
        <Button size="sm" variant="secondary" onPress={() => openDialog({ id: 'import-project' })}>
          <Download size={13} /> Import…
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        {health === 'failing' && (
          <div className={dangerBox}>
            Autosave is failing — free space by deleting a project, or export archives as backups.
          </div>
        )}

        {current && (
          <CurrentCard
            meta={current}
            now={now}
            pendingDelete={pendingDelete === current.id}
            onAskDelete={() => setPendingDelete(current.id)}
            onClearPending={() => setPendingDelete(null)}
            onClose={onClose}
          />
        )}

        {projects.length <= 1 && !query.trim() && (
          <p className="px-1 text-xs text-fg-subtle">
            Projects live in your browser and autosave as you work. Import an archive or start
            building — Add ▸ SubPart….
          </p>
        )}

        {sorted.length === 0 && query.trim() ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <p className="text-sm text-fg-muted">No projects match “{query.trim()}”.</p>
            <Button size="sm" variant="secondary" onPress={() => setQuery('')}>
              Clear search
            </Button>
          </div>
        ) : (
          <ProjectCollection
            projects={sorted}
            now={now}
            view={prefs.view}
            pendingDelete={pendingDelete}
            onAskDelete={setPendingDelete}
            onClearPending={() => setPendingDelete(null)}
            onClose={onClose}
          />
        )}
      </div>

      <ManagerFooter onClose={onClose} />
    </>
  );
}

function sortProjects(rows: ProjectMeta[], sort: ProjectManagerSort): ProjectMeta[] {
  const out = [...rows];
  switch (sort) {
    case 'created':
      return out.sort((a, b) => b.createdAt - a.createdAt);
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name));
    case 'size':
      return out.sort((a, b) => totalBytes(b) - totalBytes(a));
    case 'saved':
      return out.sort((a, b) => b.savedAt - a.savedAt);
  }
}

// ── the current project's wide card ──────────────────────────────────────────

function CurrentCard({
  meta,
  now,
  pendingDelete,
  onAskDelete,
  onClearPending,
  onClose,
}: {
  meta: ProjectMeta;
  now: number;
  pendingDelete: boolean;
  onAskDelete: () => void;
  onClearPending: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-panel-sunken p-3">
      <div className="flex min-w-0 gap-3">
        <ProjectThumb meta={meta} className="h-[5.4rem] w-[9.6rem] shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <InlineName meta={meta} />
            <Chip className="shrink-0 text-accent">CURRENT</Chip>
            <span className="flex-1" />
            {/* The phone card is 390px wide: the timestamp would squeeze the name to two
                characters, and it is repeated in the meta line below anyway. */}
            <span className="hidden shrink-0 text-xs text-fg-subtle sm:inline">
              saved {relativeTime(meta.savedAt, now)}
            </span>
          </div>
          <CountsLine meta={meta} />
          <InlineDescription meta={meta} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
            <span>{sizeLine(meta)}</span>
            <span>·</span>
            <span>saved {relativeTime(meta.savedAt, now)}</span>
            <span>·</span>
            <span>created {new Date(meta.createdAt).toLocaleDateString()}</span>
            {/* One part → its KSA export id, as before; many → how many there are. */}
            {meta.parts.length === 1
              ? meta.parts[0].partId && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{meta.parts[0].partId}</span>
                  </>
                )
              : meta.parts.length > 1 && (
                  <>
                    <span>·</span>
                    <span>{meta.parts.length} parts</span>
                  </>
                )}
          </div>
        </div>
      </div>

      {pendingDelete ? (
        <DeleteConfirm meta={meta} isCurrent onDone={onClearPending} />
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onPress={() => openDialog({ id: 'rename-project' })}>
            Rename
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => openDialog({ id: 'export-archive', params: { projectId: meta.id } })}
          >
            Export archive…
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => openDialog({ id: 'share-link', params: { projectId: meta.id } })}
          >
            Share…
          </Button>
          <RowActionsMenu meta={meta} isCurrent onAskDelete={onAskDelete} onClose={onClose} />
        </div>
      )}
    </div>
  );
}

/** Click the name → a text field; Enter commits (auto-suffixed), Escape reverts (§2.2). */
function InlineName({ meta }: { meta: ProjectMeta }) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const value = (draft ?? '').trim();
    setDraft(null);
    if (!value || value === meta.name) return;
    void renameProject(meta.id, value).then((applied) => {
      if (applied && applied !== value) status(`Renamed to “${applied}” (name taken)`);
    });
  };

  if (draft === null) {
    return (
      <button
        type="button"
        className="min-w-0 truncate rounded px-1 text-sm font-semibold text-fg hover:bg-white/[0.06]"
        title="Click to rename"
        onClick={() => setDraft(meta.name)}
      >
        {meta.name}
      </button>
    );
  }
  return (
    <TextField
      size="sm"
      autoFocus
      aria-label="Project name"
      className="min-w-0 flex-1"
      value={draft}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') {
          event.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}

const DESCRIPTION_SOFT_CAP = 500;

/** The ✎ description editor: multiline, soft-capped counter, commit on blur/Enter (§2.2). */
function InlineDescription({ meta }: { meta: ProjectMeta }) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const value = draft ?? '';
    setDraft(null);
    if (value === meta.description) return;
    void setProjectDescription(meta.id, value.slice(0, DESCRIPTION_SOFT_CAP));
  };

  if (draft === null) {
    return (
      <button
        type="button"
        className="flex min-w-0 items-center gap-1 rounded px-1 text-left text-xs text-fg-muted hover:bg-white/[0.06]"
        onClick={() => setDraft(meta.description)}
      >
        <span className="min-w-0 truncate">
          {meta.description || <span className="text-fg-subtle">Add a description…</span>}
        </span>
        <Pencil size={11} className="shrink-0 text-fg-subtle" />
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <textarea
        autoFocus
        aria-label="Project description"
        rows={2}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Escape') {
            event.stopPropagation();
            setDraft(null);
          }
        }}
        className="w-full resize-y rounded-md border border-border bg-panel-sunken p-2 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
        placeholder="What is this project?"
      />
      <span
        className={cn(
          'self-end text-[11px] tabular-nums',
          draft.length > DESCRIPTION_SOFT_CAP ? 'text-warning' : 'text-fg-subtle',
        )}
      >
        {draft.length} / {DESCRIPTION_SOFT_CAP}
      </span>
    </div>
  );
}

// ── the other projects ───────────────────────────────────────────────────────

function ProjectCollection({
  projects,
  now,
  view,
  pendingDelete,
  onAskDelete,
  onClearPending,
  onClose,
}: {
  projects: ProjectMeta[];
  now: number;
  view: 'grid' | 'list';
  pendingDelete: string | null;
  onAskDelete: (id: string) => void;
  onClearPending: () => void;
  onClose: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const onSelectionChange = (selection: Selection) => {
    if (selection === 'all') return;
    const key = [...selection][0];
    setSelectedKey(key === undefined ? null : String(key));
  };
  const open = (id: string) => {
    void openProject(id);
    onClose();
  };
  return (
    <GridList
      aria-label="Projects"
      selectionMode="single"
      selectionBehavior="replace"
      items={projects}
      selectedKeys={selectedKey ? new Set([selectedKey]) : new Set()}
      onSelectionChange={onSelectionChange}
      dependencies={[view, pendingDelete, now]}
      className={cn(
        view === 'grid'
          ? 'grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] items-start gap-2'
          : 'flex flex-col gap-0.5',
      )}
    >
      {(meta: ProjectMeta) => (
        <GridListItem
          id={meta.id}
          textValue={meta.name}
          onAction={() => open(meta.id)}
          className={
            view === 'grid'
              ? cn(
                  'flex-col items-stretch border border-border p-2',
                  // A confirming card spans the row: the strip is one truncating line and a
                  // 11rem tile would clip the question.
                  pendingDelete === meta.id && 'col-span-full',
                )
              : ''
          }
        >
          {pendingDelete === meta.id ? (
            <DeleteConfirm meta={meta} onDone={onClearPending} />
          ) : view === 'grid' ? (
            <ProjectCardBody
              meta={meta}
              now={now}
              onOpen={() => open(meta.id)}
              onAskDelete={() => onAskDelete(meta.id)}
              onClose={onClose}
            />
          ) : (
            <ProjectRowBody
              meta={meta}
              now={now}
              onOpen={() => open(meta.id)}
              onAskDelete={() => onAskDelete(meta.id)}
              onClose={onClose}
            />
          )}
        </GridListItem>
      )}
    </GridList>
  );
}

function ProjectCardBody({
  meta,
  now,
  onOpen,
  onAskDelete,
  onClose,
}: {
  meta: ProjectMeta;
  now: number;
  onOpen: () => void;
  onAskDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <ProjectThumb meta={meta} className="aspect-video w-full" />
      <div className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs text-fg" title={meta.name}>
          {meta.name}
        </span>
        <LockBadge id={meta.id} />
      </div>
      <CountsLine meta={meta} short />
      <span className="text-[11px] text-fg-subtle">saved {relativeTime(meta.savedAt, now)}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" className="flex-1" onPress={onOpen}>
          Open
        </Button>
        <RowActionsMenu meta={meta} onAskDelete={onAskDelete} onClose={onClose} />
      </div>
    </div>
  );
}

function ProjectRowBody({
  meta,
  now,
  onOpen,
  onAskDelete,
  onClose,
}: {
  meta: ProjectMeta;
  now: number;
  onOpen: () => void;
  onAskDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <ProjectThumb meta={meta} className="h-9 w-16 shrink-0" />
      <div className="flex min-w-0 flex-[2] flex-col">
        <span className="flex min-w-0 items-center gap-1 truncate text-xs text-fg">
          {meta.name}
          <LockBadge id={meta.id} />
        </span>
        {meta.description && (
          <span className="truncate text-[11px] text-fg-subtle">{meta.description}</span>
        )}
      </div>
      <div className="hidden min-w-0 flex-[2] sm:block">
        <CountsLine meta={meta} short />
      </div>
      <span className="hidden w-20 shrink-0 text-right text-[11px] text-fg-subtle sm:block">
        {relativeTime(meta.savedAt, now)}
      </span>
      <span className="hidden w-20 shrink-0 text-right text-[11px] tabular-nums text-fg-subtle sm:block">
        {formatBytes(totalBytes(meta))}
      </span>
      <Button size="sm" variant="secondary" className="shrink-0" onPress={onOpen}>
        Open
      </Button>
      <RowActionsMenu meta={meta} onAskDelete={onAskDelete} onClose={onClose} />
    </div>
  );
}

/**
 * The ⋮ row menu (§2.2). A `Menu` inside a `GridList` row — never a `Select`, which crashes
 * inside a react-aria collection — and the Popover MOUNTS its body, so every item's live
 * state is re-read on each open rather than frozen at first render.
 */
function RowActionsMenu({
  meta,
  isCurrent,
  onAskDelete,
  onClose,
}: {
  meta: ProjectMeta;
  isCurrent?: boolean;
  onAskDelete: () => void;
  onClose: () => void;
}) {
  const duplicate = () => {
    void duplicateProject(meta.id).then((id) => {
      if (!id) return;
      status(`Duplicated → “${meta.name} copy”`, {
        action: {
          label: 'Open',
          run: () => {
            void openProject(id);
          },
        },
      });
    });
  };
  const saveAs = () => {
    void duplicateProject(meta.id).then((id) => {
      if (id) void openProject(id);
    });
  };
  return (
    <MenuTrigger>
      <Button size="sm" iconOnly variant="ghost" aria-label={`Actions for ${meta.name}`}>
        <MoreVertical size={14} />
      </Button>
      <Popover className="w-56">
        <Menu aria-label={`Project actions for ${meta.name}`}>
          {!isCurrent && (
            <MenuItem
              density="dense"
              onAction={() => {
                void openProject(meta.id);
                onClose();
              }}
            >
              Open
            </MenuItem>
          )}
          <MenuItem density="dense" onAction={duplicate}>
            Duplicate
          </MenuItem>
          {isCurrent && (
            <MenuItem density="dense" onAction={saveAs}>
              Save As…
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem
            density="dense"
            onAction={() => openDialog({ id: 'export-archive', params: { projectId: meta.id } })}
          >
            Export archive…
          </MenuItem>
          <MenuItem
            density="dense"
            onAction={() => openDialog({ id: 'share-link', params: { projectId: meta.id } })}
          >
            Share…
          </MenuItem>
          <MenuItem
            density="dense"
            onAction={() => window.open(`${import.meta.env.BASE_URL}?project=${meta.id}`)}
          >
            <span className="flex flex-1 items-center gap-1.5">
              Open in new tab <ExternalLink size={11} className="text-fg-subtle" />
            </span>
          </MenuItem>
          <MenuSeparator />
          <MenuItem density="dense" variant="danger" onAction={onAskDelete}>
            <span className="flex flex-1 items-center gap-1.5">
              <Trash2 size={12} /> Delete…
            </span>
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/**
 * Row-level delete (§2.2, foundation §14.3). Deleting a project is NOT undoable, so the
 * irreversibility is stated in full — on its own line above the strip, because the strip
 * truncates its label to one line and this sentence must never be the part that gets cut.
 */
function DeleteConfirm({
  meta,
  isCurrent,
  onDone,
}: {
  meta: ProjectMeta;
  isCurrent?: boolean;
  onDone: () => void;
}) {
  const assets =
    meta.bytes.assets > 0 ? ` and its ${formatBytes(meta.bytes.assets)} of assets` : '';
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <p className="text-xs leading-snug text-fg-muted">
        This permanently removes the project{assets}. Undo cannot restore it.
        {isCurrent && ' You’ll be switched to your most recent project.'}
      </p>
      <InlineConfirmStrip
        label={`Delete “${meta.name}”?`}
        confirmLabel="Delete"
        onConfirm={() => {
          void deleteProject(meta.id);
          onDone();
        }}
        onCancel={onDone}
      />
    </div>
  );
}

// ── small pieces ─────────────────────────────────────────────────────────────

function ProjectThumb({ meta, className }: { meta: ProjectMeta; className?: string }) {
  const urls = useStore($projectThumbUrls);
  const url = urls[meta.id];
  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-md border border-border bg-panel-sunken text-fg-subtle',
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-sm">⬚</span>
      )}
    </div>
  );
}

function LockBadge({ id }: { id: string }) {
  const locked = useStore($lockedElsewhere);
  if (!locked.has(id)) return null;
  return (
    <span className="shrink-0 text-[11px] text-warning" title="Open in another tab">
      ● open in another tab
    </span>
  );
}

/** Non-zero counts only, with the full table on hover (§2.1). */
function CountsLine({ meta, short }: { meta: ProjectMeta; short?: boolean }) {
  const { counts } = meta;
  const rows: [string, number][] = [
    ['SubParts', counts.subParts],
    ['connectors', counts.connectors],
    ['colliders', counts.colliders],
    ['seats', counts.seats],
    ['lights', counts.lights],
    ['kittens', counts.kittens],
    ['animations', counts.animations],
    ['layers', counts.layers],
    ['textures', counts.customTextures],
    ['materials', counts.customMaterials],
    ['meshes', counts.customMeshes],
  ];
  const live = rows.filter(([, n]) => n > 0);
  const shown = short ? live.slice(0, 2) : live;
  return (
    <span
      className="min-w-0 truncate text-[11px] text-fg-subtle"
      title={rows.map(([label, n]) => `${n} ${label}`).join('\n')}
    >
      {live.length === 0 ? 'empty' : shown.map(([label, n]) => `${n} ${label}`).join(' · ')}
    </span>
  );
}

function ManagerFooter({ onClose }: { onClose: () => void }) {
  const estimate = useStore($storageEstimate);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void navigator.storage?.persisted?.().then((value) => {
      if (live) setPersisted(value);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-xs text-fg-subtle">
      <span>All changes autosave — there is no Save button.</span>
      {estimate && (
        <span className="tabular-nums">
          Storage: {formatBytes(estimate.usage)} used of ~{formatBytes(estimate.quota)}
        </span>
      )}
      <span className="flex-1" />
      {persisted === false && (
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            void navigator.storage?.persist?.().then((granted) => setPersisted(granted));
          }}
        >
          Keep storage persistent
        </Button>
      )}
      <Button size="sm" variant="secondary" onPress={onClose}>
        Close
      </Button>
    </div>
  );
}
