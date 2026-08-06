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

vi.mock('../ksa/modExport', () => ({
  expandGlassGlow: (part: unknown) => ({ part, insetIds: new Set<string>() }),
  buildModContent: () => {
    contentCalls += 1;
    return {
      base: 'Mod',
      variants: new Map(),
      partFile: 'ModPart.xml',
      partXml: `<Part n="${contentCalls}"/>`,
      gameDataFile: 'ModGameData.xml',
      gameDataXml: `<GameData n="${contentCalls}"/>`,
    };
  },
  buildCustomBundle: (
    _part: unknown,
    _base: string,
    _tex: unknown,
    _variants: unknown,
    _inset: unknown,
    opts?: { signal?: AbortSignal },
  ) => {
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
const { $exportPreview, buildTab, currentStamp, markStaleIfChanged, resetPreview } =
  await import('./exportPreviewStore');

beforeEach(() => {
  contentCalls = 0;
  bundleCalls = 0;
  autoResolve = true;
  releaseBundle = null;
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
