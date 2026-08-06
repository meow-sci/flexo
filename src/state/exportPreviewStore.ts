import { map } from 'nanostores';
import { $part } from './editorStore';
// `$projectName` is imported from its OWNER (`projectIndexStore`) rather than through
// `projectStore`'s re-export: this store needs the atom, not the persistence engine.
import { $projectName } from './projectIndexStore';
import { $catalogIndex } from './catalogStore';
import { $kittenTextureExport, $modelImportSettings } from './settingsStore';
import {
  buildMultiCustomBundle,
  buildMultiModContent,
  partExportNs,
  type NamedExportPart,
} from '../ksa/modExport';
import { $activePartId, $inactiveRevision, $partEntries, partsForExport } from './partsStore';

/**
 * **The Export dialog's XML preview** (design:
 * `plans/flexo_v2/design/design-projects-export.md` §6.2 + §11 store sketch; decision D11).
 *
 * v1 rebuilt the ENTIRE custom-asset bundle — every KTX2 encode, every GLB atlas, every
 * kitten bake — in an effect that re-ran on every document, project-name, catalog or
 * settings change for as long as the export dialog stayed open, even while the user was
 * looking at the Part tab and would never open Assets (census: export §1.1.b "perf note",
 * pain #2). Cancellation only suppressed the `setState`; the work still ran to completion.
 *
 * This store closes both holes:
 *
 * - **Lazy per tab.** Nothing is built until a tab is FOCUSED. Part and GameData come from
 *   one cheap synchronous `buildMultiModContent`; Assets runs the async bundle builder and
 *   only ever on the Assets tab.
 * - **Memoized by an input stamp** — `(part, partEntries, activePartId, inactiveRevision,
 *   projectName, catalog, kittenTextureExport, decimateViewMeshes)`, compared by IDENTITY
 *   (every one of those is an immutable value replaced on change), so re-focusing a tab is
 *   free. The exported PARTS list is derived from the first four (see {@link StampInputs}).
 * - **Stale, not re-run.** While the dialog is open, a change to those inputs does not
 *   rebuild the Assets XML; it flips `stale`, and the UI offers `Project changed —
 *   [Rebuild]`. Part/GameData are cheap, so they simply re-derive.
 * - **Actually abortable.** The in-flight bundle build holds an `AbortController` that a
 *   new build, a rebuild or closing the dialog aborts — `buildMultiCustomBundle` checks the
 *   signal at each per-part and per-asset boundary, so the encode chain stops.
 *
 * **The single-source invariant is untouched** (census: export §5 invariant 1): the preview
 * runs `buildMultiModContent` / `buildMultiCustomBundle` over `partsForExport()`, the exact
 * path `writeModToFolder` and `buildModZip` run, so previewed bytes and shipped bytes are the
 * same bytes — for every included part, not just the active one.
 *
 * **Layering (constitution)**: zero react / three imports. **Undo enrollment: NONE** —
 * read-only over the document.
 */

export type ExportTab = 'part' | 'gamedata' | 'assets';

export interface XmlPreview {
  stamp: string;
  xml: string;
}

export interface AssetsPreview {
  stamp: string;
  /** `null` = the project has no custom assets or variants (the explanatory placeholder). */
  xml: string | null;
  building: boolean;
  /** An input changed since this build; the UI offers a manual rebuild. */
  stale: boolean;
  /** `Date.now()` at completion — the "⟳ built …" caption. */
  builtAt: number;
}

export interface ExportPreviewState {
  tab: ExportTab;
  part?: XmlPreview;
  gamedata?: XmlPreview;
  assets?: AssetsPreview;
}

export const $exportPreview = map<ExportPreviewState>({ tab: 'part' });

// ── the input stamp ──────────────────────────────────────────────────────────

interface StampInputs {
  projectName: string;
  catalog: unknown;
  kittenTex: unknown;
  decimate: boolean;
  // ── the stable identity tokens the exported PARTS list is derived from ─────
  //
  // The parts list is deliberately NOT a field here: `partsForExport()` allocates a fresh
  // array (and fresh wrapper objects) on every call, so it can never be identity-compared,
  // and a field nothing compares would be a trap for a future editor (`a.parts === b.parts`
  // would pin the preview permanently stale). It is read on demand instead — {@link readParts},
  // called only by the builders. These four tokens are what it is a pure function of: the
  // ACTIVE part's document, the registry list, which entry is active, and a counter
  // bumped whenever a parked (inactive) document changes.
  //
  // Registry META edits ride `$partEntries` too — renaming a part, or nudging a ghost's
  // opacity/offset, marks the Assets preview stale even though the exported bytes are
  // identical. That over-invalidation is deliberate and cheap: a preview rebuild is lazy (only
  // a FOCUSED tab builds) and memoized by this very stamp, and `stale` only offers the user a
  // [Rebuild] button rather than running one.
  part: unknown;
  partEntries: unknown;
  activePartId: string;
  inactiveRevision: number;
}

/**
 * The parts to build, read fresh at build time (never stamped — see {@link StampInputs}).
 * Only the builders call it, so the per-mutation `markStaleIfChanged` tick allocates nothing.
 */
function readParts(): NamedExportPart[] {
  return toNamedExportParts(partsForExport());
}

function readInputs(): StampInputs {
  return {
    projectName: $projectName.get(),
    catalog: $catalogIndex.get(),
    kittenTex: $kittenTextureExport.get(),
    decimate: $modelImportSettings.get().decimateViewMeshes,
    part: $part.get(),
    partEntries: $partEntries.get(),
    activePartId: $activePartId.get(),
    inactiveRevision: $inactiveRevision.get(),
  };
}

function sameInputs(a: StampInputs, b: StampInputs): boolean {
  return (
    a.part === b.part &&
    a.partEntries === b.partEntries &&
    a.activePartId === b.activePartId &&
    a.inactiveRevision === b.inactiveRevision &&
    a.projectName === b.projectName &&
    a.catalog === b.catalog &&
    a.kittenTex === b.kittenTex &&
    a.decimate === b.decimate
  );
}

let stampSeq = 0;
let stampInputs: StampInputs | null = null;
let stampValue = '';

/**
 * A token for the current build inputs. Identity-compared and then NAMED, rather than
 * hashed: `$part` is a whole immutable document (hashing it every keystroke would cost more
 * than the preview) and the catalog is a Map. Same inputs ⇒ same token, every time.
 */
export function currentStamp(): string {
  const inputs = readInputs();
  if (stampInputs === null || !sameInputs(stampInputs, inputs)) {
    stampInputs = inputs;
    stampValue = `stamp:${++stampSeq}`;
  }
  return stampValue;
}

// ── building ─────────────────────────────────────────────────────────────────

/** The in-flight Assets build, so a newer one (or a close) can abort it. */
let assetsController: AbortController | null = null;

/**
 * Builds Part + GameData XML synchronously — one `buildMultiModContent` produces both, with
 * every included part as siblings inside each. `expandGlassGlow` is NOT called here:
 * `buildMultiModContent` owns it (P3.04), so calling it again would double the glow layer.
 */
function buildXmlTabs(stamp: string): void {
  const content = buildMultiModContent(readParts(), $projectName.get(), $catalogIndex.get());
  $exportPreview.setKey('part', { stamp, xml: content.partXml });
  $exportPreview.setKey('gamedata', { stamp, xml: content.gameDataXml });
}

async function buildAssets(stamp: string): Promise<void> {
  assetsController?.abort();
  const controller = new AbortController();
  assetsController = controller;
  const previous = $exportPreview.get().assets;
  $exportPreview.setKey('assets', {
    stamp,
    xml: previous?.xml ?? null,
    building: true,
    stale: false,
    builtAt: previous?.builtAt ?? 0,
  });
  try {
    const content = buildMultiModContent(readParts(), $projectName.get(), $catalogIndex.get());
    const bundle = await buildMultiCustomBundle(content, $kittenTextureExport.get(), {
      signal: controller.signal,
    });
    // A build that lost the race (aborted, or superseded by a newer one) discards its
    // result rather than stomping the current preview.
    if (controller.signal.aborted || assetsController !== controller) return;
    $exportPreview.setKey('assets', {
      stamp,
      xml: bundle.assetsXml,
      building: false,
      stale: false,
      builtAt: Date.now(),
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    if (assetsController !== controller) return;
    console.warn('assets XML preview build failed', err);
    $exportPreview.setKey('assets', {
      stamp,
      xml: null,
      building: false,
      stale: false,
      builtAt: Date.now(),
    });
  } finally {
    if (assetsController === controller) assetsController = null;
  }
}

/**
 * Focuses `tab` and builds it if its memo is missing or stamped stale. `force` is the
 * `[Rebuild]` button: it aborts the in-flight Assets build and starts a fresh one.
 *
 * **DEVIATION (logged)**: the plan's sketch takes `{signal}`. The AbortController is owned
 * HERE instead — the plan's own semantics ("a new build ABORTS the in-flight one via its
 * AbortController") require the store to hold it, and no caller has a signal of its own.
 */
export function buildTab(tab: ExportTab, opts?: { force?: boolean }): void | Promise<void> {
  const stamp = currentStamp();
  $exportPreview.setKey('tab', tab);
  if (tab === 'assets') {
    const current = $exportPreview.get().assets;
    const fresh = current !== undefined && current.stamp === stamp && !current.stale;
    if (fresh && !opts?.force) return;
    if (current?.building && !opts?.force) return;
    return buildAssets(stamp);
  }
  const current = $exportPreview.get()[tab];
  if (current !== undefined && current.stamp === stamp && !opts?.force) return;
  buildXmlTabs(stamp);
}

/**
 * Re-checks the stamp against what is built. Part/GameData re-derive (a synchronous
 * serialize); the Assets XML is merely flagged `stale` — rebuilding it is a full texture
 * encode and must stay the user's decision (design §6.2).
 */
export function markStaleIfChanged(): void {
  const stamp = currentStamp();
  const state = $exportPreview.get();
  if (state.part !== undefined && state.part.stamp !== stamp) buildXmlTabs(stamp);
  if (state.assets !== undefined && state.assets.stamp !== stamp && !state.assets.stale) {
    $exportPreview.setKey('assets', { ...state.assets, stale: true });
  }
}

/**
 * Subscribes {@link markStaleIfChanged} to every stamp input for as long as the dialog is
 * open. Returns the unsubscribe. (Lives here rather than in the dialog so the set of inputs
 * is defined exactly once, beside `currentStamp`.)
 */
export function watchExportInputs(): () => void {
  const unsubscribes = [
    $part.listen(markStaleIfChanged),
    $partEntries.listen(markStaleIfChanged),
    $activePartId.listen(markStaleIfChanged),
    $inactiveRevision.listen(markStaleIfChanged),
    $projectName.listen(markStaleIfChanged),
    $catalogIndex.listen(markStaleIfChanged),
    $kittenTextureExport.listen(markStaleIfChanged),
    $modelImportSettings.listen(markStaleIfChanged),
  ];
  return () => {
    for (const off of unsubscribes) off();
  };
}

/** Dialog close: aborts any in-flight build and drops every memo. */
export function resetPreview(): void {
  assetsController?.abort();
  assetsController = null;
  $exportPreview.set({ tab: 'part' });
}

// ── the multi-part gathering seam (MULTI_PART_PLAN P3.01) ────────────────────

/**
 * `partsForExport()` → the export builders' input. The mapper lives in the state layer
 * because `src/ksa/` may not import stores, and it is the ONE place that mints a part's
 * namespace token, so the preflight and the serializers can never disagree about which `ns`
 * a part exports under. Excluded parts never reach here (I7 / D4).
 */
export function toNamedExportParts(entries: ReturnType<typeof partsForExport>): NamedExportPart[] {
  return entries.map(({ entryId, name, part }) => ({
    entryId,
    name,
    ns: partExportNs(part.partId),
    part,
  }));
}
