import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Download, ExternalLink, FolderInput, FolderSync, RefreshCw } from 'lucide-react';
import {
  Button,
  Chip,
  CopyDownloadBar,
  Dialog,
  DialogHeader,
  DisclosureSection,
  Modal,
  SectionTitle,
  ToggleButton,
  ToggleButtonGroup,
  monoTextareaFill,
  useIsPhone,
  warningBox,
} from './kit';
import { FindingsRows } from './data/FindingsList';
import { select, type EntityKind } from '../state/editorStore';
import { $partsSnapshot, exportEntriesFrom, switchPart } from '../state/partsStore';
import type { SavedPartEntry } from '../state/projectDb';
import { $projectName } from '../state/projectStore';
import { $catalogIndex } from '../state/catalogStore';
import { $reactionCatalog } from '../state/reactionStore';
import { $kittenTextureExport, $modelImportSettings } from '../state/settingsStore';
import { MODES, setMode } from '../state/modeStore';
import { openDialog } from '../state/dialogStore';
import { status, trackJob } from '../state/statusStore';
import {
  $modFolder,
  getWritableModFolder,
  modFolderStatusLabel,
  pickModFolder,
  requestModFolderPermission,
} from '../state/modFolderStore';
import {
  $exportPreview,
  buildTab,
  resetPreview,
  toNamedExportParts,
  watchExportInputs,
  type ExportTab,
} from '../state/exportPreviewStore';
import {
  collectProjectExportIssues,
  type ExportIssue,
  type IssueSeverity,
} from '../ksa/exportIssues';
import { computeClipIssues } from '../ksa/clipIssues';
import { openAnimationClip } from '../state/animationStore';
import {
  MOD_FOLDER_NAME,
  buildModZip,
  sanitizeBaseName,
  writeModToFolder,
  type NamedExportPart,
} from '../ksa/modExport';
import { notify, toast } from './toast';

/**
 * **Export to KSA** (dialog id `'export-ksa'`, size L, `⌘E` — design:
 * `plans/flexo_v2/design/design-projects-export.md` §6; foundation §10.6 binding
 * invariants). Replaces the v1 export dialog, which did four jobs in one scrolling column
 * (census: export-integration.md pain #1).
 *
 * Two modes on one toggle:
 *
 * - **Deliver mod** — the pre-flight, the mods-folder grant, the export-shaping settings as
 *   read-only chips, and the two delivery actions in a PINNED footer, so a part that trips
 *   several validators can no longer push the export buttons below the fold.
 * - **Inspect XML** — the Part / GameData / Assets preview, built lazily per tab by
 *   `exportPreviewStore` (design D11) instead of v1's rebuild-the-whole-bundle-per-keystroke
 *   effect.
 *
 * Three things are load-bearing and unchanged from v1:
 *
 * 1. **The non-blocking policy** (foundation §10.6): a `block` finding NEVER disables either
 *    button; the primary relabels `Export anyway (N blockers)`. WIP exports are legitimate.
 * 2. **The single-source property** (census §5): everything shown and everything written
 *    comes from `buildMultiModContent` / `buildMultiCustomBundle` (the former owns
 *    `expandGlassGlow`). The preview is the shipped bytes.
 * 3. **The write semantics**: non-overwrite `-N` suffixing for XML, binaries overwritten,
 *    `mod.toml` rebuilt from the folder listing — all owned by `writeModToFolder`, which
 *    this dialog calls and does not second-guess.
 *
 * **Undo enrollment: NONE** — export is read-only over `$part`.
 */
export function ExportKsaDialog({
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
      // L: cover on phone (S22), a wide card on desktop — the XML tabs need the width.
      variant="cover"
      className="sm:w-[95vw] sm:max-w-4xl"
    >
      <Dialog className="h-full">
        <ExportBody onClose={() => onOpenChange(false)} />
      </Dialog>
    </Modal>
  );
}

type ViewMode = 'deliver' | 'xml';

function ExportBody({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<ViewMode>('deliver');

  // The preview's lifecycle is the dialog's: watch the stamp inputs while open, and on close
  // abort any in-flight Assets build and drop every memo. Mount-only, no state written.
  useEffect(() => {
    const stopWatching = watchExportInputs();
    return () => {
      stopWatching();
      resetPreview();
    };
  }, []);

  return (
    <>
      <DialogHeader title="Export to KSA" onClose={onClose} />
      {/* Pinned above the scroll on every viewport — foundation §6.3 "mode toggle pinned top". */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <ToggleButtonGroup
          size="xs"
          className="w-auto"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[view]}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next === 'deliver' || next === 'xml') setView(next);
          }}
        >
          <ToggleButton id="deliver" size="sm" className="flex-none px-2">
            Deliver mod
          </ToggleButton>
          <ToggleButton id="xml" size="sm" className="flex-none px-2">
            Inspect XML
          </ToggleButton>
        </ToggleButtonGroup>
        <ExportScope />
      </div>
      {view === 'deliver' ? <DeliverMode onClose={onClose} /> : <InspectMode onClose={onClose} />}
    </>
  );
}

// ── the exported parts ───────────────────────────────────────────────────────

/**
 * The included parts of a registry snapshot, as the export builders' input — the P3.01
 * gathering seam, applied to a store READ rather than to `partsForExport()`: a zero-argument
 * store reader called in a render body would be memoized by the React Compiler against a
 * dependency it cannot see (`$partsSnapshot` exists for exactly this).
 */
function namedPartsOf(snapshot: readonly SavedPartEntry[]): NamedExportPart[] {
  return toNamedExportParts(exportEntriesFrom(snapshot));
}

/**
 * What this export covers: "Exporting N of M parts" with a chip per included part, in both
 * modes — one mod, N parts, all three files (D4). Deliberately NOT editable here: the
 * include flag is a per-part row control in the part dropdown, so this line reports and the
 * registry decides.
 */
function ExportScope() {
  const snapshot = useStore($partsSnapshot);
  const included = snapshot.filter((entry) => entry.includeInExport);
  const excluded = snapshot.length - included.length;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
      <span>
        Exporting {included.length} of {snapshot.length} part{snapshot.length === 1 ? '' : 's'}
      </span>
      {included.map((entry) => (
        <Chip key={entry.id}>{entry.name}</Chip>
      ))}
      {excluded > 0 && (
        <span className="text-fg-subtle">({excluded} excluded — toggle in the part list)</span>
      )}
    </div>
  );
}

// ── pre-flight ───────────────────────────────────────────────────────────────

const SEVERITY_TONE: Record<IssueSeverity, string> = {
  block: 'text-danger',
  warn: 'text-warning',
  info: 'text-fg-muted',
};

function severityTitle(severity: IssueSeverity, count: number): string {
  const plural = count === 1 ? '' : 's';
  if (severity === 'block') {
    return `🟥 ${count} blocker${plural} — KSA would refuse to load this mod`;
  }
  if (severity === 'warn') return `🟨 ${count} warning${plural} — loads, but misbehaves`;
  return `ℹ ${count} note${plural}`;
}

/** The label a jump row advertises, e.g. `→ Engine mode`. */
function jumpLabel(issue: ExportIssue): string {
  const mode = issue.jumpTarget?.mode;
  const label = MODES.find((m) => m.id === mode)?.label;
  return label ? `  → ${label} mode` : '';
}

/**
 * A jump, not a stack (foundation §2.5): the dialog closes, the mode switches with the
 * issue's focus payload, and — for Build, which takes no entry payload — the offending
 * entity is selected instead.
 */
function jumpToIssue(issue: ExportIssue, onClose: () => void): void {
  const target = issue.jumpTarget;
  if (!target) return;
  onClose();
  // The issue may belong to an INACTIVE part, whose entities no mode can focus until it is
  // hydrated — so the jump switches parts first (`partEntryId` is stamped by
  // `collectProjectExportIssues` for exactly this; cross-part issues carry none).
  if (issue.partEntryId) switchPart(issue.partEntryId);
  setMode(target.mode, target.focus);
  const entity = (target.focus as { entity?: { kind: EntityKind; id: string } } | undefined)
    ?.entity;
  if (entity) select([{ kind: entity.kind, id: entity.id }]);
}

/** One part's slice of a findings list. Cross-part findings land in the `Project` group. */
interface PartGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

/**
 * Groups findings by the part they belong to, **`Project` first**: a cross-part blocker (two
 * parts sharing a Part Id, a divergent propellant) is about the mod as a whole and names both
 * parts in its own prose, so it must not hide under either one.
 *
 * Keyed by `partEntryId`, never by the display name (invariant I3 — anything project-wide keys
 * by the registry id): two parts may legitimately share a name, and a rename must not reshuffle
 * React keys. `partName` is the label and nothing else.
 *
 * Part groups follow first-appearance order, which is registry order — `collectProjectExportIssues`
 * walks `parts` in order. Single-group lists render bare (invariant I8: a one-part project
 * looks exactly like it did before parts existed).
 */
function groupByPart<T extends { partEntryId?: string; partName?: string }>(
  rows: readonly T[],
): PartGroup<T>[] {
  const project = rows.filter((row) => row.partEntryId === undefined);
  const groups: PartGroup<T>[] =
    project.length > 0 ? [{ key: 'project', label: 'Project', rows: project }] : [];
  const byPart = new Map<string, T[]>();
  for (const row of rows) {
    if (row.partEntryId === undefined) continue;
    const existing = byPart.get(row.partEntryId);
    if (existing) existing.push(row);
    else byPart.set(row.partEntryId, [row]);
  }
  for (const [entryId, list] of byPart) {
    groups.push({ key: `part:${entryId}`, label: list[0].partName ?? entryId, rows: list });
  }
  return groups;
}

/** A findings group's sub-header — omitted entirely when the list has only one group. */
function GroupedFindings<T>({
  groups,
  children,
}: {
  groups: readonly PartGroup<T>[];
  children: (group: PartGroup<T>) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          {groups.length > 1 && <SectionTitle>{group.label}</SectionTitle>}
          {children(group)}
        </div>
      ))}
    </div>
  );
}

/**
 * The three severity boxes. Disclosures, so a noisy part cannot bury the controls below it
 * (pain #1): a box with more than three issues — and every box in Inspect mode or on a
 * phone — starts collapsed to its count line.
 *
 * The pre-flight is PROJECT-wide: every included part is validated (against its OWN custom
 * reactions merged over the core catalog — hence `$reactionCatalog`, not `$allReactionIndex`,
 * which merges the ACTIVE part's), plus the cross-part checks, and each box groups its rows
 * by part.
 */
function PreFlight({ collapsed, onClose }: { collapsed: boolean; onClose: () => void }) {
  const snapshot = useStore($partsSnapshot);
  const coreReactions = useStore($reactionCatalog);
  const catalog = useStore($catalogIndex);
  const parts = namedPartsOf(snapshot);
  const issues = collectProjectExportIssues(parts, coreReactions, catalog);
  const drafts = draftClips(parts);
  if (issues.length === 0 && drafts.length === 0) {
    return <p className="text-xs text-fg-subtle">Pre-flight found nothing to report.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Pre-flight</SectionTitle>
      <DraftClips drafts={drafts} onClose={onClose} />
      {(['block', 'warn', 'info'] as const).map((severity) => {
        const rows = issues.filter((i) => i.severity === severity);
        if (rows.length === 0) return null;
        return (
          <DisclosureSection
            key={severity}
            title={
              <span className={SEVERITY_TONE[severity]}>
                {severityTitle(severity, rows.length)}
              </span>
            }
            defaultExpanded={!collapsed && rows.length <= 3}
          >
            <GroupedFindings groups={groupByPart(rows)}>
              {(group) => (
                <FindingsRows
                  findings={group.rows.map((issue) => ({
                    issue,
                    message: `${issue.message}${jumpLabel(issue)}`,
                  }))}
                  tone={SEVERITY_TONE[severity]}
                  canSelect={(row) => row.issue.jumpTarget !== undefined}
                  onSelect={(row) => jumpToIssue(row.issue, onClose)}
                />
              )}
            </GroupedFindings>
          </DisclosureSection>
        );
      })}
    </div>
  );
}

/**
 * The clips the exporter will SKIP, with the reasons — the pre-flight's **Animations** block
 * (design-animation-mode.md §11.1). It consumes the very function every in-mode surface reads
 * (`computeClipIssues`, whose blockers mirror `isAnimationExportable`), so the dialog and the
 * clip rows can never disagree about what "draft" means.
 *
 * Runs over EVERY included part, stamped with the part it came from: a draft clip in an
 * inactive part is just as skipped, and must not vanish from the summary because the user
 * happens to be editing a different part.
 */
function draftClips(parts: readonly NamedExportPart[]) {
  return parts.flatMap((entry) => {
    const issues = computeClipIssues(entry.part);
    return entry.part.animations
      .map((anim) => ({
        id: anim.id,
        name: anim.name,
        partEntryId: entry.entryId,
        partName: entry.name,
        blockers: (issues[anim.id] ?? [])
          .filter((issue) => issue.severity === 'blocker')
          .map((issue) => issue.message),
      }))
      .filter((clip) => clip.blockers.length > 0);
  });
}

/**
 * Skipped clips are NOT export blockers (foundation §10.6's non-blocking policy is not even
 * in play here — the mod writes fine, one clip is simply absent), so they get their own
 * amber block instead of a row in the severity boxes, and the button never relabels for them.
 * Each row is a jump link: close, switch to Animation mode, open that clip (§2.5).
 */
function DraftClips({
  drafts,
  onClose,
}: {
  drafts: ReturnType<typeof draftClips>;
  onClose: () => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <DisclosureSection
      title={
        <span className="text-warning">
          🟨 {drafts.length} draft animation clip{drafts.length === 1 ? '' : 's'} — draft clips are
          skipped
        </span>
      }
      defaultExpanded={drafts.length <= 3}
    >
      <GroupedFindings groups={groupByPart(drafts)}>
        {(group) => (
          <FindingsRows
            findings={group.rows.map((clip) => ({
              clip,
              message: `${clip.name}: ${clip.blockers.join(' · ')}  → Animation mode`,
            }))}
            tone="text-warning"
            onSelect={(row) => {
              onClose();
              // Same rule as `jumpToIssue`: the clip may live in an inactive part.
              switchPart(row.clip.partEntryId);
              openAnimationClip(row.clip.id);
            }}
          />
        )}
      </GroupedFindings>
    </DisclosureSection>
  );
}

// ── deliver mode ─────────────────────────────────────────────────────────────

function DeliverMode({ onClose }: { onClose: () => void }) {
  const isPhone = useIsPhone();
  const snapshot = useStore($partsSnapshot);
  const projectName = useStore($projectName);
  const catalog = useStore($catalogIndex);
  const coreReactions = useStore($reactionCatalog);
  const folder = useStore($modFolder);
  const kittenTex = useStore($kittenTextureExport);
  const [busy, setBusy] = useState(false);

  const parts = namedPartsOf(snapshot);
  const base = sanitizeBaseName(projectName);
  const blockers = collectProjectExportIssues(parts, coreReactions, catalog).filter(
    (i) => i.severity === 'block',
  ).length;
  const unsupported = folder.status === 'unsupported';

  const writeToFolder = async () => {
    setBusy(true);
    const job = trackJob('Exporting to mods folder');
    try {
      // May prompt inline — this call site IS the user gesture (census §1.2).
      const dir = await getWritableModFolder();
      if (!dir) {
        toast({
          title: 'Folder access required',
          description: 'Grant write access to your mods folder first.',
          variant: 'warning',
        });
        return;
      }
      // The builder owns every write semantic: `-N` suffixing, binary overwrite,
      // mod.toml rebuilt from the folder listing.
      const result = await writeModToFolder(dir, parts, projectName, kittenTex, catalog);
      status(`${result.partFile} + GameData → ${dir.name}/${MOD_FOLDER_NAME} ✓`, {
        severity: 'success',
      });
      const written = [result.partFile, result.gameDataFile, result.assetsFile]
        .filter((name): name is string => name !== null)
        .join('\n');
      notify({
        severity: 'rich',
        title: 'Export complete',
        body:
          `${dir.name}/${MOD_FOLDER_NAME}\n${written}\n\n` +
          `mod.toml lists ${result.assets.length} XML file${result.assets.length === 1 ? '' : 's'}.\n` +
          preflightSummary(parts, coreReactions, catalog),
      });
    } catch (err) {
      console.warn('mod folder export failed', err);
      toast({
        title: 'Export failed',
        description: String((err as Error)?.message ?? err),
        variant: 'danger',
      });
    } finally {
      job.end();
      setBusy(false);
    }
  };

  const downloadZip = async () => {
    setBusy(true);
    const job = trackJob('Building mod zip');
    try {
      const blob = await buildModZip(parts, projectName, kittenTex, catalog);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${MOD_FOLDER_NAME}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      status(`${MOD_FOLDER_NAME}.zip downloaded ✓`, { severity: 'success' });
    } catch (err) {
      console.warn('mod zip export failed', err);
      toast({
        title: 'Export failed',
        description: String((err as Error)?.message ?? err),
        variant: 'danger',
      });
    } finally {
      job.end();
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <PreFlight collapsed={isPhone} onClose={onClose} />

        <div className="flex flex-col gap-2">
          <SectionTitle>Mods folder</SectionTitle>
          <ModFolderRow />
          <p className="text-xs leading-snug text-fg-subtle">
            Writes <span className="font-mono">{MOD_FOLDER_NAME}/</span>:{' '}
            <span className="font-mono">{base}Part.xml</span> ·{' '}
            <span className="font-mono">{base}GameData.xml</span> ·{' '}
            <span className="font-mono">{base}Assets.xml</span> ·{' '}
            <span className="font-mono">Meshes/ Textures/ Animations/</span>
          </p>
          <p className="text-xs leading-snug text-fg-subtle">
            Existing XML is never overwritten; <span className="font-mono">mod.toml</span>{' '}
            accumulates.
          </p>
        </div>

        <ExportSettingChips />
      </div>

      {/* Pinned: the controls are never scrolled away by a noisy pre-flight (pain #1). */}
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-border p-3 sm:flex-row sm:justify-end">
        <Button
          size="md"
          variant={unsupported ? 'primary' : 'ghost'}
          isDisabled={busy}
          onPress={downloadZip}
        >
          <Download size={16} /> Download mod zip
        </Button>
        {!unsupported && (
          <Button size="md" variant="primary" isDisabled={busy} onPress={writeToFolder}>
            <FolderInput size={16} />
            {busy
              ? 'Exporting…'
              : blockers > 0
                ? `Export anyway (${blockers} blocker${blockers === 1 ? '' : 's'})`
                : 'Export to mods folder'}
          </Button>
        )}
      </div>
    </>
  );
}

/** The pre-flight counts, frozen into the "Export complete" notification body. */
function preflightSummary(
  parts: Parameters<typeof collectProjectExportIssues>[0],
  coreReactions: Parameters<typeof collectProjectExportIssues>[1],
  catalog: Parameters<typeof collectProjectExportIssues>[2],
): string {
  const issues = collectProjectExportIssues(parts, coreReactions, catalog);
  const count = (severity: IssueSeverity) => issues.filter((i) => i.severity === severity).length;
  const drafts = draftClips(parts);
  return (
    `Pre-flight at export: ${count('block')} blocking · ${count('warn')} warning · ${count('info')} note.` +
    (drafts.length === 0
      ? ''
      : `\n${drafts.length} draft animation clip${drafts.length === 1 ? '' : 's'} skipped: ${drafts
          .map((clip) => clip.name)
          .join(', ')}.`)
  );
}

/**
 * The four grant states, v1 semantics verbatim (census §1.1.c) with the design's status
 * wording. `Forget` deliberately is NOT here — it lives in `File ▸ Mods Folder ▸` behind a
 * confirm, because losing the grant mid-export flow would be a trap.
 */
function ModFolderRow() {
  const folder = useStore($modFolder);

  if (folder.status === 'unsupported') {
    return (
      <div className={warningBox}>
        {modFolderStatusLabel(folder)} — use “Download mod zip” instead.
      </div>
    );
  }

  if (folder.status === 'needs-permission') {
    return (
      <div className={`${warningBox} flex items-center justify-between gap-2`}>
        <span className="min-w-0 truncate">{modFolderStatusLabel(folder)}</span>
        <Button size="sm" onPress={() => void requestModFolderPermission()}>
          <FolderSync size={14} /> Re-grant
        </Button>
      </div>
    );
  }

  if (folder.status === 'ready') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-panel-sunken px-2 py-1.5 text-xs">
        <span className="min-w-0 truncate text-fg-muted">{modFolderStatusLabel(folder)}</span>
        <Button size="sm" variant="ghost" onPress={() => void pickModFolder()}>
          Change…
        </Button>
      </div>
    );
  }

  return (
    <Button size="md" onPress={() => void pickModFolder()}>
      <FolderInput size={16} /> Choose mods folder…
    </Button>
  );
}

/**
 * The two preferences that silently shape the output (census pains #3 + `_VM` decimation),
 * shown read-only and deep-linked to their single editable home. `returnTo` re-opens this
 * dialog when Settings closes — stacking is banned, so the deep-link must have a way back.
 */
function ExportSettingChips() {
  const kittenTex = useStore($kittenTextureExport);
  const model = useStore($modelImportSettings);
  const openSettings = () =>
    openDialog({ id: 'settings', params: { tab: 'import-export', returnTo: 'export-ksa' } });
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Export settings</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" variant="secondary" onPress={openSettings}>
          Kitten textures: {kittenTex.mode === 'bundle' ? 'bundle' : 'reference'}
          <ExternalLink size={11} />
        </Button>
        <Button size="xs" variant="secondary" onPress={openSettings}>
          _VM decimation: {model.decimateViewMeshes ? 'on' : 'off'}
          <ExternalLink size={11} />
        </Button>
      </div>
    </div>
  );
}

// ── inspect XML mode ─────────────────────────────────────────────────────────

const TAB_LABELS: Record<ExportTab, string> = {
  part: 'Part',
  gamedata: 'GameData',
  assets: 'Assets',
};

const NO_ASSETS_PLACEHOLDER =
  '(No Assets XML — this part references only built-in SubParts directly, so the mod ships just Part + GameData XML.)';

function InspectMode({ onClose }: { onClose: () => void }) {
  const preview = useStore($exportPreview);
  const projectName = useStore($projectName);
  const base = sanitizeBaseName(projectName);
  const tab = preview.tab;

  // First paint builds the focused tab; every later build rides a tab click. Idempotent —
  // `buildTab` is memoized by the input stamp, so StrictMode's double mount builds once.
  useEffect(() => {
    void buildTab($exportPreview.get().tab);
  }, []);

  const assets = preview.assets;
  const body =
    tab === 'assets'
      ? assets === undefined || assets.building
        ? 'Building Assets XML…'
        : (assets.xml ?? NO_ASSETS_PLACEHOLDER)
      : (preview[tab]?.xml ?? 'Building…');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <PreFlight collapsed onClose={onClose} />
      <ToggleButtonGroup
        size="xs"
        className="w-auto shrink-0"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[tab]}
        onSelectionChange={(keys) => {
          const next = [...keys][0];
          if (next === 'part' || next === 'gamedata' || next === 'assets') void buildTab(next);
        }}
      >
        {(['part', 'gamedata', 'assets'] as const).map((id) => (
          <ToggleButton key={id} id={id} size="sm" className="flex-none px-2">
            {TAB_LABELS[id]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <textarea readOnly value={body} className={monoTextareaFill} spellCheck={false} />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {tab === 'assets' && assets !== undefined && !assets.building && (
            <span className="text-xs text-fg-subtle">
              ⟳ built {new Date(assets.builtAt).toLocaleTimeString()}
            </span>
          )}
          {tab === 'assets' && assets?.stale === true && (
            <span className="flex items-center gap-1 text-xs text-warning">
              Project changed
              <Button
                size="xs"
                variant="secondary"
                onPress={() => void buildTab('assets', { force: true })}
              >
                <RefreshCw size={11} /> Rebuild
              </Button>
            </span>
          )}
        </div>
        <CopyDownloadBar
          getText={() => body}
          filename={`${base}${tab === 'part' ? 'Part' : tab === 'gamedata' ? 'GameData' : 'Assets'}.xml`}
          mime="application/xml"
          downloadLabel="Download .xml"
        />
      </div>
    </div>
  );
}
