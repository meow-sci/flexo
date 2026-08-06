import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Object3D } from 'three';
import { AlertTriangle, Info, PackageOpen, Pin, Upload } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogHeader,
  DisclosureSection,
  ListBoxItem,
  Modal,
  Select,
  Switch,
  TextField,
  Tooltip,
  cn,
  useIsPhone,
  warningBox,
} from '../kit';
import {
  $importModelRequest,
  closeImportModel,
  importModelAsMeshes,
  matchImportedMeshes,
  replaceImport,
  setImportModelFiles,
  type ImportMatchPlan,
} from '../../state/customAssetStore';
import { $part } from '../../state/editorStore';
import { openDialog } from '../../state/dialogStore';
import type { CustomMesh } from '../../ksa/types';
import { $modelImportSettings, setModelImportSettings } from '../../state/settingsStore';
import { loadModelFile, type LoadedModel } from '../../three/loadModelFile';
import { ModelPreviewViewport } from '../../three/ModelPreviewViewport';
import {
  analyzeImport,
  canMerge,
  DEFAULT_IMPORT_OPTIONS,
  plannedTotals,
  type ImportOptions,
  type ImportPlan,
} from '../../ksa/importPlan';
import { normalizeImport } from '../../ksa/importNormalize';
import { planImportMaterials, type ImportMaterialPlan } from '../../ksa/importMaterials';
import {
  estimateImportCost,
  formatBytes,
  groupWarnings,
  imageSizeOf,
  SCALE_PRESETS,
  type WarningGroup,
  type WarningSeverity,
} from '../../ksa/importEstimates';
import { VIEW_MESH_TRIANGLE_BUDGET } from '../../ksa/modExport';
import { fmt } from '../format';
import { useNumberDraft } from '../numberDraft';
import { toast } from '../toast';

/**
 * **Import Review** (dialog id `'import-review'`, size L — design: design-surface-assets.md
 * §3, D11; foundation §10.4). Three views, no wizard chrome:
 *
 *  1. **Drop**      — drop zone + file picker + the "How to export from Blender" recipe.
 *  2. **Review**    — the parsed model: a live 3D preview, the nine-stat grid, every warning
 *                     with its remedy, the replace-match summary — and the options, split
 *                     STRUCTURALLY into "This import only" and "Saved preferences 📌".
 *                     **Nothing has touched the document yet**; closing here leaves no trace.
 *  3. **Importing** — normalize + texture encode + store writes behind a phase line, then the
 *                     store selects the new placements and the dialog closes. Undismissable.
 *
 * WHY THE REVIEW VIEW EXISTS AT ALL: an import is a big, opinionated document mutation (a
 * layer, N SubParts, N textures, N materials, N placements) built from a file authored in
 * another tool under conventions flexo can only guess at. Wrong units and a wrong up-axis are
 * the two most common Blender-export mistakes and both produce a result that looks plausible
 * and is wrong — so the dialog measures the bounding box, previews the correction, and lets
 * the user fix it BEFORE anything is committed.
 *
 * **THE D11 SPLIT IS THE POINT OF THE REHOST.** v1 rendered all ten options as one flat
 * column, so the sticky ones and the per-import ones were indistinguishable — and a 0.01
 * scale left over from a millimetre model was the worst failure mode in the app. Here the two
 * groups are separately titled and boxed, the sticky group carries a pin glyph, and Scale
 * wears an amber `≠1` badge whenever it is not 1. Per-import state resets on EVERY open
 * because the body is keyed by `$importModelRequest.id` — a structural guarantee, not a
 * convention (guardrail 13).
 *
 * REPLACE MODE (`request.replaceImportId`) runs the same three views against an EXISTING
 * batch: Review additionally shows how the new file matches up — which SubParts keep their
 * identity, which are new, and which are about to disappear, **named** — and the commit swaps
 * that batch's geometry in place (`customAssetStore.replaceImport`).
 *
 * **Undo enrollment: NONE of its own.** `importModelAsMeshes` / `replaceImport` each write
 * their binaries first and then run ONE `mutate()` — one discrete undo step per import.
 */
export function ImportReviewDialog() {
  const request = useStore($importModelRequest);
  if (!request) return null;
  // Keyed by the request id so every open starts with fresh per-import state (D11).
  return (
    <ImportReviewBody
      key={request.id}
      initialFiles={request.files}
      replaceImportId={request.replaceImportId}
    />
  );
}

/** Re-analysis is cheap; re-parsing is not. Everything here derives from a parsed model. */
function ImportReviewBody({
  initialFiles,
  replaceImportId,
}: {
  initialFiles: File[];
  replaceImportId?: string;
}) {
  const settings = useStore($modelImportSettings);
  const part = useStore($part);
  const isPhone = useIsPhone();
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [materialPlan, setMaterialPlan] = useState<ImportMaterialPlan | null>(null);
  /** Non-null only during the Importing view; the message is the current phase. */
  const [importing, setImporting] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);

  // ── "This import only" (D11): component state, never persisted, reset on every open ──
  const [namePrefix, setNamePrefix] = useState('');
  const [scale, setScale] = useState(1);
  const [bakeTransforms, setBakeTransforms] = useState(false);
  const [doubleSided, setDoubleSided] = useState(false);
  const [merge, setMerge] = useState(false);
  /** Replace only. On (default): take the new file's textures/materials/glow too. */
  const [updateMaterials, setUpdateMaterials] = useState(true);

  const fileInput = useRef<HTMLInputElement>(null);

  // ── parse (Drop → Review) ──────────────────────────────────────────────────
  //
  // The effect only WRITES state from its async callbacks; the reset (model/plan/error) is
  // done by whoever changes `files`, so nothing here cascades a render.
  useEffect(() => {
    if (files.length === 0) return;
    let cancelled = false;
    loadModelFile(files)
      .then((loaded) => {
        if (!cancelled) setModel(loaded);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('flexo: model parse failed', err);
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        // The dialog stays open on its Drop view so another file can be picked.
        toast({ title: 'Could not read that model', description: message, variant: 'danger' });
      });
    return () => {
      cancelled = true;
    };
  }, [files]);

  /** The Drop view is still working: files chosen, nothing parsed yet and nothing to report. */
  const parsing = files.length > 0 && !model && !error;

  // Shared draft editing (see useNumberDraft); a zero/negative scale would degenerate the
  // preview and import, so those commits are ignored rather than clamped.
  const scaleField = useNumberDraft({
    value: scale,
    onCommit: (n) => {
      if (n > 0) setScale(n);
    },
  });

  // Analysis is re-run on every scale / up-axis change: it walks the already-parsed scene
  // graph and never touches the file, so it is cheap enough to drive the live preview,
  // bounds and stats. (The compiler caches it on exactly these inputs — which is why the
  // option object is built from ONLY the fields analysis reads.)
  const analyzeOptions: ImportOptions = {
    ...DEFAULT_IMPORT_OPTIONS,
    scale,
    upAxis: settings.upAxis,
  };
  const plan: ImportPlan | null = model ? analyzeImport(model, analyzeOptions) : null;

  // ── material translation (textures: count, VRAM, warnings) ─────────────────
  //
  // Decoding images is the expensive part of an import, so it runs ONCE per (model, texture
  // cap) — never per scale keystroke. It is analyzed against the DEFAULT options on purpose:
  // grouping and material identity are independent of scale/up-axis/merge, so the resulting
  // `materialKeyByGroup` is valid for the live plan too, and the same translated plan is
  // handed to the actual import (no second decode). Clearing the previous translation is the
  // job of whoever invalidates it (`pickFiles` / `changeTextureCap`), so this effect never
  // writes state synchronously.
  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    planImportMaterials(model, analyzeImport(model, DEFAULT_IMPORT_OPTIONS), {
      maxTextureSize: settings.maxTextureSize,
    })
      .then((translated) => {
        if (!cancelled) setMaterialPlan(translated);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('flexo: import material translation failed', err);
        setMaterialPlan({
          textures: [],
          materials: [],
          materialKeyByGroup: new Map(),
          warnings: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, [model, settings.maxTextureSize]);

  // ── replace mode ───────────────────────────────────────────────────────────
  //
  // The batch being replaced, and how the parsed file lines up against it — the SAME
  // `matchImportedMeshes` the store commits with, run here on the plan's groups so the review
  // view promises exactly what happens. Merging is deliberately not offered: it collapses
  // every object into ONE SubPart, which is a different granularity and could not preserve a
  // single existing SubPart identity.
  const existingBatch: CustomMesh[] = replaceImportId
    ? part.customMeshes.filter((m) => m.imported?.importId === replaceImportId)
    : [];
  const match: ImportMatchPlan<{ sourceNode: string; sourceMaterial: string }> | null =
    replaceImportId && plan ? matchImportedMeshes(existingBatch, plan.groups) : null;

  const mergeable = !replaceImportId && plan ? canMerge(plan) : false;
  const totals = plan ? plannedTotals(plan, merge && mergeable) : null;
  const cost = estimateImportCost({
    textureSizes: (materialPlan?.textures ?? []).map((t) => imageSizeOf(t.bytes)),
    maxTextureSize: settings.maxTextureSize,
    triangles: totals?.triangles ?? 0,
    vertices: totals?.vertices ?? 0,
    subParts: totals?.subParts ?? 0,
    viewMeshBudget: settings.decimateViewMeshes ? VIEW_MESH_TRIANGLE_BUDGET : undefined,
  });
  const warnings = groupWarnings([...(plan?.warnings ?? []), ...(materialPlan?.warnings ?? [])]);
  const canImport = !!plan && plan.groups.length > 0 && !importing;

  const pickFiles = (picked: File[]) => {
    if (picked.length === 0) return;
    setModel(null);
    setMaterialPlan(null);
    setError(null);
    setFiles(picked);
    // Mirror onto the request so a deep-link out and back re-parses this file rather than
    // dropping the user on an empty drop zone (the id is untouched — no remount).
    setImportModelFiles(picked);
  };

  /** `‹ Back` on the Review view: forget the parsed file and return to the Drop view. */
  const backToDrop = () => {
    setModel(null);
    setMaterialPlan(null);
    setError(null);
    setFiles([]);
    setImportModelFiles([]);
  };

  /** The VRAM/mod estimate and the encoded .ktx2 both depend on the cap — re-translate. */
  const changeTextureCap = (maxTextureSize: 1024 | 2048 | 4096) => {
    setMaterialPlan(null);
    setModelImportSettings({ maxTextureSize });
  };

  const runImport = async () => {
    if (!model || !plan) return;
    const options: ImportOptions = {
      scale,
      upAxis: settings.upAxis,
      bakeTransforms,
      bakeScale: settings.bakeScale,
      doubleSided,
      namePrefix,
      merge: merge && mergeable,
    };
    setError(null);
    setImporting('Translating materials…');
    try {
      // Reuse the translation the review view already paid for; only re-run it if the user
      // confirmed before it finished.
      const materials =
        materialPlan ??
        (await planImportMaterials(model, plan, { maxTextureSize: settings.maxTextureSize }));
      setImporting('Normalizing geometry…');
      const normalized = await normalizeImport(plan, options);
      setImporting(
        replaceImportId
          ? 'Swapping geometry and materials…'
          : 'Encoding textures and creating SubParts…',
      );
      try {
        if (replaceImportId) {
          await replaceImport(replaceImportId, normalized, { updateMaterials }, materials);
        } else {
          await importModelAsMeshes(normalized, model.fileName, materials);
        }
      } finally {
        // The atlas GLB is now the geometry's home (the editor renders from it via
        // importedMeshCache), so these working copies are ours to free.
        for (const mesh of normalized.meshes) mesh.geometry.dispose();
      }
      // The outcome is reported by the import-report notification (counts, removed SubParts,
      // warnings — posted by customAssetStore) plus its one-line status flash.
      closeImportModel();
    } catch (err: unknown) {
      console.error('flexo: model import failed', err);
      const message = err instanceof Error ? err.message : String(err);
      setImporting(null);
      setError(message);
      // `danger` ⇒ a red status flash AND a persistent unread notification-center entry.
      toast({ title: 'Import failed', description: message, variant: 'danger' });
    }
  };

  const reviewing = !!(model && plan && totals);

  return (
    <Modal
      isOpen
      // Closing mid-import would orphan half-written binaries, so Escape, the backdrop, the
      // header ✕ and the back chevron are ALL inert while the Importing view runs.
      onOpenChange={(open) => !open && !importing && closeImportModel()}
      isDismissable={!importing}
      variant={isPhone ? 'cover' : 'fullscreen'}
      className={isPhone ? undefined : 'max-w-4xl'}
    >
      <Dialog className="min-h-0">
        <DialogHeader
          title={
            importing
              ? replaceImportId
                ? 'Replacing model…'
                : 'Importing model…'
              : replaceImportId
                ? 'Replace model'
                : 'Import model'
          }
          onBack={reviewing && !importing ? backToDrop : undefined}
          onClose={() => {
            if (!importing) closeImportModel();
          }}
        />

        {reviewing && model && plan && totals ? (
          // The Importing view freezes the options: they were captured when Import was
          // pressed, so letting them look editable mid-run would lie about what is happening.
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:flex-row',
              importing && 'pointer-events-none opacity-60',
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {/* Phone: the preview is 40vh at the top of the scroll, then the stats strip
                  and the two option accordions (design §3.2 "Phone"). */}
              <div
                className={cn(
                  'shrink-0 overflow-hidden rounded-lg border border-border bg-panel-sunken',
                  isPhone ? 'h-[40vh]' : 'h-56 sm:h-72',
                )}
              >
                <ModelPreview scene={model.scene} scale={scale} upAxis={settings.upAxis} />
              </div>
              <p className="text-[11px] leading-snug text-fg-subtle">
                Preview of the source file with its own glTF materials — it answers “is this
                oriented, scaled and split the way I meant?”. The editor viewport after import is
                the accurate surface preview (it renders the real KSA material channels).
              </p>
              <Stats plan={plan} totals={totals} cost={cost} pending={!materialPlan} />
              {match && <ReplaceSummary match={match} batchSize={existingBatch.length} />}
              <Warnings groups={warnings} />
            </div>

            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-80">
              <OptionGroup
                title="This import only"
                caption="Reset every time this dialog opens."
                collapsible={isPhone}
                defaultOpen
              >
                <TextField
                  label="Name prefix"
                  size="sm"
                  value={namePrefix}
                  onChange={setNamePrefix}
                  placeholder="(none)"
                />

                <div className="flex flex-col gap-1">
                  <div className="flex items-end gap-2">
                    <TextField
                      label="Scale"
                      size="sm"
                      className="flex-1"
                      // must inputMode="url" so negative numbers can be managed on mobile
                      // devices — numeric/decimal/integer don't show the "-" key
                      inputMode="url"
                      {...scaleField}
                    />
                    {scale !== 1 && (
                      <Tooltip content="This model is being rescaled. Scale is never remembered between imports — it is a correction, not a preference.">
                        <span className="mb-1 shrink-0 rounded border border-warning/50 bg-warning/10 px-1.5 py-0.5 font-mono text-[11px] text-warning">
                          ≠1
                        </span>
                      </Tooltip>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {SCALE_PRESETS.map((preset) => (
                      <Tooltip key={preset.label} content={preset.hint}>
                        <Button
                          size="sm"
                          variant={scale === preset.value ? 'primary' : 'secondary'}
                          onPress={() => setScale(preset.value)}
                        >
                          {preset.label}
                        </Button>
                      </Tooltip>
                    ))}
                  </div>
                </div>

                <Switch isSelected={bakeTransforms} onChange={setBakeTransforms}>
                  Bake transforms to origin
                </Switch>
                <Switch isSelected={doubleSided} onChange={setDoubleSided}>
                  Make double-sided
                </Switch>
                {mergeable && (
                  <Switch isSelected={merge} onChange={setMerge}>
                    Merge into one SubPart
                  </Switch>
                )}
                {replaceImportId && (
                  <>
                    <Switch isSelected={updateMaterials} onChange={setUpdateMaterials}>
                      Update materials from file
                    </Switch>
                    <p className="text-[11px] leading-snug text-fg-subtle">
                      Off keeps material edits you made in flexo — only the geometry is swapped.
                    </p>
                  </>
                )}
              </OptionGroup>

              <OptionGroup
                title="Saved preferences"
                pinned
                caption="Remembered for the next import."
                collapsible={isPhone}
              >
                <Select
                  label="Up axis in the file"
                  size="sm"
                  selectedKey={settings.upAxis}
                  onSelectionChange={(key) =>
                    setModelImportSettings({ upAxis: key === 'z' ? 'z' : 'y' })
                  }
                >
                  <ListBoxItem id="y">Y-up (glTF / Blender default)</ListBoxItem>
                  <ListBoxItem id="z">Z-up (rotate −90° about X)</ListBoxItem>
                </Select>

                <Select
                  label="Max texture size"
                  size="sm"
                  selectedKey={String(settings.maxTextureSize)}
                  onSelectionChange={(key) => changeTextureCap(Number(key) as 1024 | 2048 | 4096)}
                >
                  <ListBoxItem id="1024">1024 px</ListBoxItem>
                  <ListBoxItem id="2048">2048 px</ListBoxItem>
                  <ListBoxItem id="4096">4096 px (expensive)</ListBoxItem>
                </Select>

                <Switch
                  isSelected={settings.bakeScale}
                  onChange={(v) => setModelImportSettings({ bakeScale: v })}
                >
                  Bake scale into geometry
                </Switch>

                <Switch
                  isSelected={settings.decimateViewMeshes}
                  onChange={(v) => setModelImportSettings({ decimateViewMeshes: v })}
                >
                  Decimate view meshes
                </Switch>
                <p className="text-[11px] leading-snug text-fg-subtle">
                  Affects export —{' '}
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-auto px-1 py-0 underline"
                    // The single editable home for all four of these is Settings ▸ Import &
                    // Export (D4); this toggle writes the same store. Stacking is banned, so
                    // this is a jump — `returnTo` brings the review back (the payload, files
                    // included, is still on `$importModelRequest`, so nothing is re-picked).
                    onPress={() =>
                      openDialog({
                        id: 'settings',
                        params: { tab: 'import-export', returnTo: 'import-review' },
                      })
                    }
                  >
                    Settings →
                  </Button>
                </p>
              </OptionGroup>

              <p className="text-[11px] leading-snug text-fg-subtle">
                Objects always split by material — KSA binds one material per SubPart, so that part
                isn’t a choice.
              </p>
            </div>
          </div>
        ) : (
          <DropView
            parsing={parsing}
            error={error}
            dropActive={dropActive}
            replacing={!!replaceImportId}
            onPick={() => fileInput.current?.click()}
            onDropActive={setDropActive}
            onFiles={pickFiles}
          />
        )}

        {/* Indeterminate: normalize + encode + store writes report no measurable progress,
            but they take seconds on a big model, so the bar exists to say "still working".
            The phase itself is the footer text below (which is what a reader gets). */}
        {importing && (
          <div aria-hidden className="h-0.5 shrink-0 overflow-hidden bg-panel-sunken">
            <div className="h-full w-2/5 animate-pulse bg-accent" />
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2.5">
          <span aria-live="polite" className="min-w-0 flex-1 truncate text-xs text-fg-subtle">
            {importing ?? (model ? model.fileName : '')}
          </span>
          <Button size="sm" variant="ghost" isDisabled={!!importing} onPress={closeImportModel}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            isDisabled={!canImport}
            onPress={() => void runImport()}
          >
            {importing
              ? replaceImportId
                ? 'Replacing…'
                : 'Importing…'
              : replaceImportId
                ? match
                  ? `Replace (${match.matched.length} kept, ${match.added.length} new, ${match.removed.length} removed)`
                  : 'Replace'
                : totals
                  ? `Import ${totals.subParts} SubPart${totals.subParts === 1 ? '' : 's'}`
                  : 'Import'}
          </Button>
        </div>

        {/* A `.gltf` needs its siblings (.bin + images) picked alongside it, hence `multiple`;
            `loadModelFile` picks the entry file out of the set and resolves the rest. */}
        <input
          ref={fileInput}
          type="file"
          accept=".glb,.gltf,.bin,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const input = e.currentTarget;
            const picked = Array.from(input.files ?? []);
            input.value = ''; // re-picking the same file must fire change again
            pickFiles(picked);
          }}
        />
      </Dialog>
    </Modal>
  );
}

/**
 * One titled, boxed option group — the structural half of D11. The pinned group carries the
 * pin glyph; on the phone both collapse into accordions with "This import only" open.
 */
function OptionGroup({
  title,
  caption,
  pinned,
  collapsible,
  defaultOpen,
  children,
}: {
  title: string;
  caption: string;
  pinned?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const body = (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] leading-snug text-fg-subtle">{caption}</p>
      {children}
    </div>
  );
  if (collapsible) {
    return (
      <DisclosureSection title={title} defaultExpanded={defaultOpen}>
        {body}
      </DisclosureSection>
    );
  }
  return (
    <section className="flex flex-col gap-2.5 rounded-lg border border-border bg-panel-sunken/40 p-2.5">
      <h3 className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
        {pinned && <Pin size={11} className="shrink-0" />}
        {title}
      </h3>
      {body}
    </section>
  );
}

// ── the Drop view ────────────────────────────────────────────────────────────

function DropView({
  parsing,
  error,
  dropActive,
  replacing,
  onPick,
  onDropActive,
  onFiles,
}: {
  parsing: boolean;
  error: string | null;
  dropActive: boolean;
  replacing: boolean;
  onPick: () => void;
  onDropActive: (active: boolean) => void;
  onFiles: (files: File[]) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {replacing && (
        <p className="rounded-lg border border-border bg-panel p-2 text-xs leading-snug text-fg-muted">
          Choose the re-exported file for this model — matched by object and material name. Objects
          that kept their name and material keep their SubPart, with every placement, GameData
          block, animation and connector that references it.
        </p>
      )}
      <button
        type="button"
        onClick={onPick}
        onDragOver={(e) => {
          e.preventDefault();
          onDropActive(true);
        }}
        onDragLeave={() => onDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          onDropActive(false);
          onFiles(Array.from(e.dataTransfer.files ?? []));
        }}
        className={`flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-fg-muted transition-colors ${
          dropActive ? 'border-accent bg-accent/10' : 'border-border bg-panel-sunken'
        }`}
      >
        {parsing ? (
          <>
            <PackageOpen size={24} />
            Reading the model…
          </>
        ) : (
          <>
            <Upload size={24} />
            <span>
              Drop a <span className="font-mono">.glb</span> here, or click to choose a file
            </span>
            <span className="max-w-md text-xs leading-snug text-fg-subtle">
              A <span className="font-mono">.gltf</span> needs its{' '}
              <span className="font-mono">.bin</span> and image files selected alongside it. You can
              also drop a model straight onto the 3D viewport.
            </span>
          </>
        )}
      </button>

      {error && (
        <div className={warningBox}>
          <span className="font-medium">That file couldn’t be read.</span> {error}
        </div>
      )}

      <DisclosureSection title="How to export from Blender">
        <p className="text-xs leading-snug text-fg-muted">
          File ▸ Export ▸ glTF 2.0, format <span className="font-mono">glTF Binary (.glb)</span>:
        </p>
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {BLENDER_RECIPE.map((row) => (
            <div key={row.section} className="contents">
              <dt className="text-fg-subtle">{row.section}</dt>
              <dd className="text-fg-muted">{row.setting}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs leading-snug text-fg-subtle">
          One material per object per SubPart (KSA renders one material per SubPart), everything
          single-sided (back faces are always culled), and model in metres — 1 Blender unit = 1 m =
          1 KSA unit.
        </p>
      </DisclosureSection>
    </div>
  );
}

/** The Blender export settings that map onto what KSA can actually load (plan §1.3). */
const BLENDER_RECIPE: readonly { section: string; setting: string }[] = [
  { section: 'Format', setting: 'glTF Binary (.glb)' },
  { section: 'Transform', setting: '+Y Up (the default — leave it on)' },
  {
    section: 'Data ▸ Mesh',
    setting: 'Apply Modifiers ON, UVs ON, Normals ON, Tangents OFF, Vertex Colors OFF',
  },
  { section: 'Data ▸ Material', setting: 'Materials: Export, Images: Automatic (PNG/JPEG)' },
  { section: 'Shape Keys / Skinning', setting: 'off (KSA parts have neither)' },
  { section: 'Compression', setting: 'Draco off preferred (accepted either way)' },
];

// ── Review-view pieces ───────────────────────────────────────────────────────

function ModelPreview({
  scene,
  scale,
  upAxis,
}: {
  scene: Object3D;
  scale: number;
  upAxis: 'y' | 'z';
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<ModelPreviewViewport | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewport = new ModelPreviewViewport(host);
    viewportRef.current = viewport;
    return () => {
      viewport.dispose();
      viewportRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewportRef.current?.setModel(scene, { scale, upAxis });
  }, [scene, scale, upAxis]);

  return <div ref={hostRef} className="h-full w-full" />;
}

function Stats({
  plan,
  totals,
  cost,
  pending,
}: {
  plan: ImportPlan;
  totals: ImportPlan['totals'];
  cost: ReturnType<typeof estimateImportCost>;
  pending: boolean;
}) {
  const size = plan.bounds.size;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-border bg-panel p-2 text-xs sm:grid-cols-3">
      <Stat label="SubParts" value={String(totals.subParts)} />
      <Stat label="Placements" value={String(totals.placements)} />
      <Stat label="Materials" value={String(totals.materials)} />
      <Stat label="Triangles" value={totals.triangles.toLocaleString()} />
      <Stat label="Vertices" value={totals.vertices.toLocaleString()} />
      <Stat label="Textures" value={pending ? '…' : String(cost.textureCount)} />
      <Stat
        label="Measured size"
        value={`${fmt(round2(size.x))} × ${fmt(round2(size.y))} × ${fmt(round2(size.z))} m`}
      />
      <Stat label="Mod size (est.)" value={pending ? '…' : formatBytes(cost.modBytes)} />
      <Stat
        label="In-game VRAM"
        value={pending ? '…' : formatBytes(cost.vramBytes)}
        tooltip="flexo's KTX2 textures are uncompressed RGBA8 + Zstd, so each one costs width × height × 4 bytes of VRAM in-game, plus a third again for its mip chain — a 4096² map is ~85 MB. Lower “Max texture size” to cut it."
      />
    </dl>
  );
}

/**
 * Replace mode's match summary: what the new file does to the batch that exists today.
 *
 * Matching is by (object name × material name) — see `matchImportedMeshes`. The REMOVED list is
 * spelled out by name rather than counted, because those SubParts and their placements are
 * about to disappear: their geometry is simply not in the new file any more.
 */
function ReplaceSummary({
  match,
  batchSize,
}: {
  match: ImportMatchPlan<{ sourceNode: string; sourceMaterial: string }>;
  batchSize: number;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-accent/40 bg-accent/5 p-2 text-xs">
      <span className="font-medium">
        Replacing {batchSize} SubPart{batchSize === 1 ? '' : 's'} — matched by object and material
        name
      </span>
      <dl className="grid grid-cols-3 gap-x-3">
        <Stat label="Kept" value={String(match.matched.length)} />
        <Stat label="New" value={String(match.added.length)} />
        <Stat label="Removed" value={String(match.removed.length)} />
      </dl>
      <p className="leading-snug text-fg-subtle">
        Kept SubParts hold on to their placements, GameData, animations and connectors — the
        arrangement you built survives.
      </p>
      {match.removed.length > 0 && (
        <p className="leading-snug text-warning">
          Not in the new file, so they and their placements are removed:{' '}
          {match.removed.map((m) => m.name).join(', ')}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="flex items-center gap-1 text-fg-subtle">
        {label}
        {tooltip && (
          <Tooltip content={tooltip}>
            <Button size="sm" variant="ghost" iconOnly aria-label={`${label}: why?`}>
              <Info size={12} />
            </Button>
          </Tooltip>
        )}
      </dt>
      <dd className="truncate font-mono text-fg">{value}</dd>
    </div>
  );
}

const SEVERITY_CLASS: Record<WarningSeverity, string> = {
  error: 'border-danger/40 bg-danger/10 text-danger',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  info: 'border-border bg-panel text-fg-muted',
};

function Warnings({ groups }: { groups: WarningGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <DisclosureSection
      title="What KSA can't represent"
      badge={String(groups.reduce((n, g) => n + g.items.length, 0))}
      defaultExpanded={groups[0]!.severity !== 'info'}
    >
      {groups.map((group) => (
        <div
          key={group.subject}
          className={`flex flex-col gap-1 rounded-lg border p-2 text-xs ${
            SEVERITY_CLASS[group.severity]
          }`}
        >
          <span className="flex items-center gap-1 font-medium">
            {group.severity !== 'info' && <AlertTriangle size={12} className="shrink-0" />}
            {group.subject}
          </span>
          {group.items.map((warning) => (
            <div key={`${warning.code}|${warning.subject}`} className="flex flex-col">
              <span className="leading-snug">{warning.message}</span>
              {warning.remedy && (
                <span className="leading-snug text-fg-subtle">Fix: {warning.remedy}</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </DisclosureSection>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
