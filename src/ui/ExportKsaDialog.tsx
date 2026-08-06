import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Download, ExternalLink, FolderInput, FolderSync, RefreshCw } from 'lucide-react';
import {
  Button,
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
import { $part, select, type EntityKind } from '../state/editorStore';
import { $projectName } from '../state/projectStore';
import { $catalogIndex } from '../state/catalogStore';
import { $allReactionIndex } from '../state/reactionStore';
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
  watchExportInputs,
  type ExportTab,
} from '../state/exportPreviewStore';
import { collectExportIssues, type ExportIssue, type IssueSeverity } from '../ksa/exportIssues';
import { MOD_FOLDER_NAME, buildModZip, sanitizeBaseName, writeModToFolder } from '../ksa/modExport';
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
 *    comes from `expandGlassGlow` → `buildModContent` / `buildCustomBundle`. The preview is
 *    the shipped bytes.
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
      </div>
      {view === 'deliver' ? <DeliverMode onClose={onClose} /> : <InspectMode onClose={onClose} />}
    </>
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
  setMode(target.mode, target.focus);
  const entity = (target.focus as { entity?: { kind: EntityKind; id: string } } | undefined)
    ?.entity;
  if (entity) select([{ kind: entity.kind, id: entity.id }]);
}

/**
 * The three severity boxes. Disclosures, so a noisy part cannot bury the controls below it
 * (pain #1): a box with more than three issues — and every box in Inspect mode or on a
 * phone — starts collapsed to its count line.
 */
function PreFlight({ collapsed, onClose }: { collapsed: boolean; onClose: () => void }) {
  const part = useStore($part);
  const reactions = useStore($allReactionIndex);
  const catalog = useStore($catalogIndex);
  const issues = collectExportIssues(part, reactions, catalog);
  if (issues.length === 0) {
    return <p className="text-xs text-fg-subtle">Pre-flight found nothing to report.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Pre-flight</SectionTitle>
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
            <FindingsRows
              findings={rows.map((issue) => ({
                issue,
                message: `${issue.message}${jumpLabel(issue)}`,
              }))}
              tone={SEVERITY_TONE[severity]}
              canSelect={(row) => row.issue.jumpTarget !== undefined}
              onSelect={(row) => jumpToIssue(row.issue, onClose)}
            />
          </DisclosureSection>
        );
      })}
    </div>
  );
}

// ── deliver mode ─────────────────────────────────────────────────────────────

function DeliverMode({ onClose }: { onClose: () => void }) {
  const isPhone = useIsPhone();
  const part = useStore($part);
  const projectName = useStore($projectName);
  const catalog = useStore($catalogIndex);
  const reactions = useStore($allReactionIndex);
  const folder = useStore($modFolder);
  const kittenTex = useStore($kittenTextureExport);
  const [busy, setBusy] = useState(false);

  const base = sanitizeBaseName(projectName);
  const blockers = collectExportIssues(part, reactions, catalog).filter(
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
      const result = await writeModToFolder(dir, part, projectName, kittenTex, catalog);
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
          preflightSummary(part, reactions, catalog),
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
      const blob = await buildModZip(part, projectName, kittenTex, catalog);
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
  part: Parameters<typeof collectExportIssues>[0],
  reactions: Parameters<typeof collectExportIssues>[1],
  catalog: Parameters<typeof collectExportIssues>[2],
): string {
  const issues = collectExportIssues(part, reactions, catalog);
  const count = (severity: IssueSeverity) => issues.filter((i) => i.severity === severity).length;
  return `Pre-flight at export: ${count('block')} blocking · ${count('warn')} warning · ${count('info')} note.`;
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
