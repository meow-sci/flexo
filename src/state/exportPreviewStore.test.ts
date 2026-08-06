import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEmptyPart } from '../ksa/types';

/**
 * The lazy XML preview (P10.02). The builders are mocked — what is under test is the
 * memo/stale/abort policy around them, i.e. exactly the behaviour v1 got wrong: the full
 * KTX2 bundle rebuilding on every keystroke while the dialog was open.
 */

let contentCalls = 0;
let bundleCalls = 0;
/** Resolves the pending mocked bundle build; set by the slow-build cases. */
let releaseBundle: ((xml: string | null) => void) | null = null;
/** Display names of the parts the last `buildMultiModContent` call received (D4 / I7). */
let lastPartsBuilt: string[] = [];

vi.mock('../ksa/modExport', () => ({
  partExportNs: (partId: string) => partId,
  buildMultiModContent: (parts: Array<{ part: unknown; name: string }>) => {
    contentCalls += 1;
    lastPartsBuilt = parts.map((p) => p.name);
    return {
      base: 'Mod',
      partFile: 'ModPart.xml',
      partXml: `<Part n="${contentCalls}"/>`,
      gameDataFile: 'ModGameData.xml',
      gameDataXml: `<GameData n="${contentCalls}"/>`,
      perPart: parts.map(({ part }) => ({
        entryId: '',
        name: '',
        ns: '',
        part,
        variants: new Map(),
        remap: new Map(),
        insetIds: new Set<string>(),
      })),
    };
  },
  buildMultiCustomBundle: (_content: unknown, _tex: unknown, opts?: { signal?: AbortSignal }) => {
    bundleCalls += 1;
    const n = bundleCalls;
    return new Promise((resolve, reject) => {
      releaseBundle = (xml) =>
        resolve({ assetsFile: 'ModAssets.xml', assetsXml: xml, binaries: [] });
      opts?.signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError')),
      );
      // Auto-resolve on the next microtask unless a test grabbed the release handle first.
      queueMicrotask(() => {
        if (autoResolve)
          resolve({ assetsFile: 'ModAssets.xml', assetsXml: `<Assets n="${n}"/>`, binaries: [] });
      });
    });
  },
}));

let autoResolve = true;

const { $part } = await import('./editorStore');
const { $projectName } = await import('./projectIndexStore');
const {
  $activePartId,
  createPart,
  initPartsForNewProject,
  setPartIncludeInExport,
  setPartOpacity,
  switchPart,
} = await import('./partsStore');
const { $exportPreview, buildTab, currentStamp, markStaleIfChanged, resetPreview } =
  await import('./exportPreviewStore');

beforeEach(() => {
  contentCalls = 0;
  bundleCalls = 0;
  autoResolve = true;
  releaseBundle = null;
  lastPartsBuilt = [];
  resetPreview();
  $part.set(createEmptyPart());
});

describe('currentStamp', () => {
  it('is stable while the inputs are, and changes when one of them does', () => {
    const first = currentStamp();
    expect(currentStamp()).toBe(first);
    $projectName.set(`project-${Math.random()}`);
    expect(currentStamp()).not.toBe(first);
  });
});

describe('buildTab — Part / GameData', () => {
  it('builds once per stamp, however often the tab is focused', () => {
    buildTab('part');
    buildTab('part');
    buildTab('gamedata');
    expect(contentCalls).toBe(1);
    expect($exportPreview.get().part?.xml).toBe('<Part n="1"/>');
    expect($exportPreview.get().gamedata?.xml).toBe('<GameData n="1"/>');
  });

  it('rebuilds after the document changes', () => {
    buildTab('part');
    $part.set(createEmptyPart());
    buildTab('part');
    expect(contentCalls).toBe(2);
  });

  it('records the focused tab', () => {
    buildTab('gamedata');
    expect($exportPreview.get().tab).toBe('gamedata');
  });
});

describe('buildTab — Assets', () => {
  it('does not run until the Assets tab is focused', async () => {
    buildTab('part');
    expect(bundleCalls).toBe(0);
    await buildTab('assets');
    expect(bundleCalls).toBe(1);
    expect($exportPreview.get().assets).toMatchObject({
      xml: '<Assets n="1"/>',
      building: false,
      stale: false,
    });
  });

  it('goes stale instead of rebuilding when the document changes', async () => {
    await buildTab('assets');
    $part.set(createEmptyPart());
    markStaleIfChanged();
    expect(bundleCalls).toBe(1);
    expect($exportPreview.get().assets?.stale).toBe(true);
    // The Part tab still re-derives — it is a cheap synchronous serialize.
    expect(contentCalls).toBe(1);
  });

  it('rebuilds exactly once when the stale tab is re-focused', async () => {
    await buildTab('assets');
    $part.set(createEmptyPart());
    markStaleIfChanged();
    await buildTab('assets');
    expect(bundleCalls).toBe(2);
    expect($exportPreview.get().assets).toMatchObject({ xml: '<Assets n="2"/>', stale: false });
  });

  it('re-focusing an up-to-date tab is free', async () => {
    await buildTab('assets');
    await buildTab('assets');
    expect(bundleCalls).toBe(1);
  });

  it('discards the result of a build a rebuild aborted', async () => {
    autoResolve = false;
    const first = buildTab('assets');
    const releaseFirst = releaseBundle!;
    // Force a second build: it aborts the first, whose late result must not land.
    autoResolve = true;
    const second = buildTab('assets', { force: true });
    releaseFirst('<Assets stale="true"/>');
    await first;
    await second;
    expect($exportPreview.get().assets?.xml).toBe('<Assets n="2"/>');
  });

  it('resetPreview aborts the in-flight build and clears every memo', async () => {
    buildTab('part');
    autoResolve = false;
    const pending = buildTab('assets');
    resetPreview();
    releaseBundle?.('<Assets late="true"/>');
    await pending;
    expect($exportPreview.get()).toEqual({ tab: 'part' });
  });
});

// ── the stamp is part-aware (MULTI_PART_PLAN P3.09) ──────────────────────────
//
// The exported parts list is NOT a stamp field (`partsForExport()` allocates a fresh array on
// every call, so it can never be identity-compared); it is a pure function of four tokens the
// stamp DOES hold — the active document, the registry list, which entry is active, and the
// inactive-document revision. These pin that every way a project's exported bytes can change
// reaches the preview.
describe('the stamp across parts', () => {
  let partOne = '';
  let partTwo = '';

  beforeEach(() => {
    initPartsForNewProject();
    partOne = $activePartId.get();
    partTwo = createPart(); // "Part 2"; creating switches to it…
    switchPart(partOne); // …so land back on part 1
  });

  it('goes stale when the user switches to another part', async () => {
    await buildTab('assets');
    expect($exportPreview.get().assets?.stale).toBe(false);
    switchPart(partTwo);
    markStaleIfChanged();
    // Stale, NOT rebuilt: rebuilding is a full texture encode and stays the user's decision.
    expect($exportPreview.get().assets?.stale).toBe(true);
    expect(bundleCalls).toBe(1);
  });

  it('goes stale when a part leaves the export (D4)', async () => {
    await buildTab('assets');
    setPartIncludeInExport(partTwo, false);
    markStaleIfChanged();
    expect($exportPreview.get().assets?.stale).toBe(true);
  });

  it('goes stale on a mutation in the ACTIVE part’s document', async () => {
    await buildTab('assets');
    $part.set({ ...$part.get(), partId: 'renamed_part' });
    markStaleIfChanged();
    expect($exportPreview.get().assets?.stale).toBe(true);
  });

  // Registry META rides `$partEntries` too, so nudging a ghost's opacity marks the preview
  // stale even though the exported bytes are identical. Deliberate over-invalidation
  // (acknowledged in `StampInputs`): a rebuild is lazy, memoized, and only ever OFFERED.
  it('also goes stale on a pure ghost-opacity change (accepted over-invalidation)', async () => {
    await buildTab('assets');
    setPartOpacity(partTwo, 0.4);
    markStaleIfChanged();
    expect($exportPreview.get().assets?.stale).toBe(true);
  });

  it('re-derives the cheap Part/GameData tabs on a switch instead of flagging them', () => {
    buildTab('part');
    expect(contentCalls).toBe(1);
    switchPart(partTwo);
    markStaleIfChanged();
    expect(contentCalls).toBe(2);
    expect($exportPreview.get().part?.xml).toBe('<Part n="2"/>');
  });

  it('builds every included part, and never an excluded one (D4 / I7)', () => {
    buildTab('part');
    expect(lastPartsBuilt).toEqual(['Part 1', 'Part 2']);
    setPartIncludeInExport(partTwo, false);
    markStaleIfChanged();
    expect(lastPartsBuilt).toEqual(['Part 1']);
  });
});
