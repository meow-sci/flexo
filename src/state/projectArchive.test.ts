import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEmptyPart, type EditingPart } from '../ksa/types';
import { PROJECT_EXPORT_VERSION } from './projectCodec';

/**
 * The `.flexo.tar.gz` container, end to end (design-projects-export.md §4.1/§4.3).
 *
 * Both IndexedDB layers are replaced with in-memory maps — the same `vi.mock` split
 * `projectStore.test.ts` uses — so everything above the storage boundary is exercised for
 * real: the USTAR pack, the native gzip (Node 24 ships `CompressionStream`), the manifest,
 * the two exact-version gates and the abort path.
 */

const blobs = new Map<string, Blob>();
const metas = new Map<string, unknown>();
const snapshots = new Map<string, unknown>();
const thumbs = new Map<string, Blob>();

vi.mock('./assetDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./assetDb')>();
  return {
    ...actual,
    getAsset: async (key: string) => blobs.get(key),
    putAsset: async (key: string, data: Blob | Uint8Array, type = 'application/octet-stream') => {
      blobs.set(key, data instanceof Blob ? data : new Blob([data.slice()], { type }));
    },
    listProjectBlobs: async (projectId: string) =>
      [...blobs.keys()].filter((key) => key.startsWith(`pa:${projectId}:`)).sort(),
  };
});

vi.mock('./projectDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./projectDb')>();
  return {
    ...actual,
    getMeta: async (id: string) => metas.get(id),
    getSnapshot: async (id: string) => snapshots.get(id),
    getThumb: async (id: string) => thumbs.get(id),
  };
});

/**
 * `hydrateCustomAssets` republishes blob URLs and rebuilds three.js geometry — neither exists
 * under happy-dom. What the import path OWES it is a contract worth pinning, so the stub is a
 * spy: exactly ONE call per import, made after every new part is already in the registry.
 * (`projectArchive` reaches it through a dynamic import, so this factory only ever runs inside
 * a test — long after the module body below has initialized.)
 */
const hydrateCustomAssets = vi.fn(async () => {});
vi.mock('./customAssetStore', () => ({ hydrateCustomAssets }));

const {
  ARCHIVE_VERSION,
  archiveFileName,
  buildProjectArchive,
  importArchive,
  parseProjectArchive,
  planAssetAdoption,
  sha256Hex,
} = await import('./projectArchive');
const { tarUnpack, gunzip, gzip, tarPack } = await import('./tarArchive');
const { sumCounts } = await import('./projectDb');
const { $part, newPart } = await import('./editorStore');
const { $currentProjectId } = await import('./projectIndexStore');
const { $activePartId, $partEntries, getInactiveDoc, initPartsForNewProject } =
  await import('./partsStore');

const PROJECT = 'p_test00000001';

function texture(id: string) {
  return { id, name: id, width: 4, height: 4, channel: 'baseColor' as const };
}

/** One part as the stored snapshot holds it: registry meta, document, per-part view state. */
interface SeedPart {
  part: EditingPart;
  name?: string;
  visible?: boolean;
  opacity?: number;
  offset?: { x: number; y: number; z: number };
  includeInExport?: boolean;
}

/** The single-part project most cases here need. */
function seedProject(part: EditingPart): void {
  seedParts([{ part }]);
}

/** Seeds the stored records for an N-part project, `activeIndex` flagged as the active one. */
function seedParts(entries: SeedPart[], activeIndex = 0): void {
  const parts = entries.map((entry, i) => ({
    id: `pt_test0000${i + 1}`,
    name: entry.name ?? `Part ${i + 1}`,
    visible: entry.visible ?? true,
    opacity: entry.opacity ?? 1,
    offset: entry.offset ?? { x: 0, y: 0, z: 0 },
    includeInExport: entry.includeInExport ?? true,
    part: entry.part,
    layerView: {},
    activeLayerId: 'default',
  }));
  metas.set(PROJECT, {
    id: PROJECT,
    name: 'Rover-7',
    description: 'crew rover',
    parts: parts.map((p) => ({ id: p.id, name: p.name, partId: p.part.partId })),
    createdAt: 1,
    savedAt: 2,
    schemaVersion: 4,
    counts: sumCounts(parts.map((p) => p.part)),
    bytes: { snapshot: 0, history: 0, assets: 0 },
    hasThumb: false,
  });
  snapshots.set(PROJECT, {
    version: 4,
    parts,
    activePartId: parts[activeIndex].id,
    savedAt: 2,
  });
}

function put(kind: string, id: string, bytes: Uint8Array, mime = 'application/octet-stream'): void {
  blobs.set(`pa:${PROJECT}:${kind}:${id}`, new Blob([bytes.slice()], { type: mime }));
}

beforeEach(() => {
  blobs.clear();
  metas.clear();
  snapshots.clear();
  thumbs.clear();
});

describe('buildProjectArchive → parseProjectArchive', () => {
  it('round-trips the envelope, every asset byte and its hash', async () => {
    const part = createEmptyPart();
    part.customTextures.push(texture('tex_1'));
    part.customMeshes.push({
      id: 'mesh_1',
      name: 'Box',
      subPartId: 'flexo_Box_1',
      primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
      faceTextures: {
        right: { textureId: 'tex_1', uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } },
      },
    });
    part.placements.push({
      instanceId: 'box_1',
      subPartTemplateId: 'flexo_Box_1',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: 'default',
    });
    seedProject(part);
    const pixels = new Uint8Array([1, 2, 3, 4, 5]);
    put('tex-src', 'tex_1', pixels, 'image/png');
    put('mesh-glb', 'mesh_1', new Uint8Array([9, 9, 9]), 'model/gltf-binary');

    const phases: string[] = [];
    const archive = await buildProjectArchive(PROJECT, {
      onProgress: (phase) => {
        if (phases.at(-1) !== phase) phases.push(phase);
      },
    });
    expect(phases).toEqual(['collect', 'pack', 'compress']);

    // The manifest MUST be the first tar entry (§4.1).
    const entries = tarUnpack(await gunzip(new Uint8Array(await archive.arrayBuffer())));
    expect(entries[0].name).toBe('manifest.json');
    expect(entries.map((e) => e.name)).toContain('project.json');

    const parsed = await parseProjectArchive(archive);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.archiveVersion).toBe(ARCHIVE_VERSION);
    expect(parsed.manifest.exportVersion).toBe(PROJECT_EXPORT_VERSION);
    expect(parsed.manifest.name).toBe('Rover-7');
    expect(parsed.manifest.counts.subParts).toBe(1);
    // The binary-backed descriptors survive BECAUSE the container carries their bytes.
    const entry = parsed.envelope.parts[0];
    expect(entry.data.customTextures.map((t) => t.id)).toEqual(['tex_1']);
    expect(entry.data.customMeshes.map((m) => m.id)).toEqual(['mesh_1']);
    expect(entry.data.customMeshes[0].faceTextures.right?.textureId).toBe('tex_1');

    const src = parsed.assets.find((a) => a.kind === 'tex-src');
    expect(src?.bytes).toEqual(pixels);
    expect(src?.mime).toBe('image/png');
    expect(src?.sha256).toBe(await sha256Hex(pixels));
  });

  it('round-trips an asset-less project with an empty table', async () => {
    seedProject(createEmptyPart());
    const parsed = await parseProjectArchive(await buildProjectArchive(PROJECT));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.assets).toEqual([]);
    expect(parsed.manifest.assets).toEqual([]);
    expect(parsed.thumbnail).toBeNull();
  });

  it('carries the thumbnail when the project has one', async () => {
    const part = createEmptyPart();
    seedProject(part);
    (metas.get(PROJECT) as { hasThumb: boolean }).hasThumb = true;
    thumbs.set(PROJECT, new Blob([new Uint8Array([7, 7])], { type: 'image/webp' }));
    const parsed = await parseProjectArchive(await buildProjectArchive(PROJECT));
    expect(parsed.ok && parsed.thumbnail?.size).toBe(2);
  });
});

/**
 * **Multi-part archives** (`plans/MULTI_PART_PLAN.md` P2.06). One container, N parts: the
 * envelope carries every one, the manifest lists them for the import preview and sums their
 * counts, and the three import modes decide where they land.
 */
describe('multi-part archives', () => {
  /** A part with a texture, a material mapping it, one mesh and one placement — all `s`-keyed. */
  function binaryPart(s: string, kind: 'primitive' | 'imported'): EditingPart {
    const p = createEmptyPart();
    p.partId = `part_${s}`;
    p.customTextures.push(texture(`tex_${s}`));
    p.customMaterials.push({
      id: `mat_${s}`,
      name: `M${s}`,
      baseColor: { kind: 'map', textureId: `tex_${s}` },
      metalness: { kind: 'value', value: 0 },
      roughness: { kind: 'value', value: 0.5 },
    });
    p.customMeshes.push({
      id: `mesh_${s}`,
      name: `Pod ${s}`,
      subPartId: `flexo_Pod_${s}`,
      ...(kind === 'primitive'
        ? { primitive: { kind: 'box' as const, params: { width: 1, height: 1, depth: 1 } } }
        : {
            imported: {
              importId: `imp_${s}`,
              meshName: `flexo_Pod_${s}`,
              sourceFile: 'pods.glb',
              sourceNode: 'Pod',
              sourceMaterial: 'Metal',
              triangles: 128,
              vertices: 66,
            },
          }),
      materialId: `mat_${s}`,
      faceTextures: {
        right: { textureId: `tex_${s}`, uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } },
      },
    });
    p.placements.push({
      instanceId: 'pod_1',
      subPartTemplateId: `flexo_Pod_${s}`,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: 'default',
    });
    return p;
  }

  const BYTES = {
    tex_a: new Uint8Array([1, 1, 1]),
    mesh_a: new Uint8Array([2, 2]),
    tex_b: new Uint8Array([3, 3, 3, 3]),
    imp_b: new Uint8Array([4]),
  };

  /** Part 1 ("Core", primitive) at every default; Part 2 ("Booster", imported) at none. */
  function seedTwoParts(): { core: EditingPart; booster: EditingPart } {
    const core = binaryPart('a', 'primitive');
    const booster = binaryPart('b', 'imported');
    seedParts(
      [
        { part: core, name: 'Core' },
        {
          part: booster,
          name: 'Booster',
          visible: false,
          opacity: 0.4,
          offset: { x: 1, y: -2, z: 0.5 },
          includeInExport: false,
        },
      ],
      1,
    );
    put('tex-src', 'tex_a', BYTES.tex_a, 'image/png');
    put('mesh-glb', 'mesh_a', BYTES.mesh_a, 'model/gltf-binary');
    put('tex-src', 'tex_b', BYTES.tex_b, 'image/png');
    put('import-glb', 'imp_b', BYTES.imp_b, 'model/gltf-binary');
    return { core, booster };
  }

  async function parseTwoPartArchive() {
    const parsed = await parseProjectArchive(await buildProjectArchive(PROJECT));
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed;
  }

  it('round-trips every part, every blob, the manifest part list and the summed counts', async () => {
    const { core, booster } = seedTwoParts();
    const parsed = await parseTwoPartArchive();

    // The manifest's part list is the import preview's whole source of truth for them…
    expect(parsed.manifest.parts).toEqual([
      { name: 'Core', partId: 'part_a' },
      { name: 'Booster', partId: 'part_b' },
    ]);
    // …and its counts are PROJECT-wide totals, not one part's tally.
    expect(parsed.manifest.counts).toEqual(sumCounts([core, booster]));
    expect(parsed.manifest.counts.subParts).toBe(2);
    expect(parsed.manifest.counts.customTextures).toBe(2);
    expect(parsed.manifest.counts.customMeshes).toBe(2);

    // Every blob of every part rides along, bytes intact.
    expect(parsed.assets.map((a) => `${a.kind}/${a.id}`).sort()).toEqual([
      'import-glb/imp_b',
      'mesh-glb/mesh_a',
      'tex-src/tex_a',
      'tex-src/tex_b',
    ]);
    for (const asset of parsed.assets) {
      expect(asset.bytes).toEqual(BYTES[asset.id as keyof typeof BYTES]);
    }

    // Both parts, in registry order, with the active index and each one's view state.
    const entries = parsed.envelope.parts;
    expect(entries.map((e) => e.name)).toEqual(['Core', 'Booster']);
    expect(entries.map((e) => e.sourcePartId)).toEqual(['part_a', 'part_b']);
    expect(parsed.envelope.activePartIndex).toBe(1);
    expect(entries[0]).toMatchObject({
      visible: true,
      opacity: 1,
      offset: { x: 0, y: 0, z: 0 },
      includeInExport: true,
    });
    expect(entries[1]).toMatchObject({
      visible: false,
      opacity: 0.4,
      offset: { x: 1, y: -2, z: 0.5 },
      includeInExport: false,
    });
    // Each part's binary-backed descriptors survive BECAUSE the container carries their bytes,
    // and neither part's content crossed into the other.
    expect(entries[0].data.customMeshes.map((m) => m.id)).toEqual(['mesh_a']);
    expect(entries[1].data.customMeshes.map((m) => m.id)).toEqual(['mesh_b']);
    expect(entries[0].data.customTextures.map((t) => t.id)).toEqual(['tex_a']);
    expect(entries[1].data.customTextures.map((t) => t.id)).toEqual(['tex_b']);
    expect(entries[0].data.customMeshes[0].faceTextures.right?.textureId).toBe('tex_a');
    expect(entries[1].data.customMeshes[0].imported?.importId).toBe('imp_b');
  });

  describe('import modes', () => {
    beforeEach(() => {
      hydrateCustomAssets.mockClear();
      $currentProjectId.set(PROJECT);
      newPart();
      initPartsForNewProject();
    });

    it("'add-parts' appends every part with fresh ids, copies its blobs, lands on the first", async () => {
      seedTwoParts();
      const parsed = await parseTwoPartArchive();
      const existing = $partEntries.get()[0].id;
      const blobsBefore = new Set(blobs.keys());

      const result = await importArchive({ mode: 'add-parts', parsed });
      expect(result).toEqual({ mode: 'add-parts', name: 'Rover-7' });

      // Appended AFTER the project's own part, in the archive's registry order…
      const entries = $partEntries.get();
      expect(entries.map((e) => e.name)).toEqual(['Part 1', 'Core', 'Booster']);
      expect(entries[0].id).toBe(existing);
      // …with FRESH registry ids (a `pt_…` is project-internal and never travels)…
      expect(entries.map((e) => e.id)).not.toContain('pt_test00001');
      expect(new Set(entries.map((e) => e.id)).size).toBe(3);
      // …the archive's per-part view meta carried across…
      expect(entries[2]).toMatchObject({
        visible: false,
        opacity: 0.4,
        offset: { x: 1, y: -2, z: 0.5 },
        includeInExport: false,
      });
      // …and the user lands on the FIRST new part.
      expect($activePartId.get()).toBe(entries[1].id);

      // Every custom-asset id in both new parts is fresh and project-unique (I4) — this
      // archive came from THIS project, so a kept id would alias the original's blobs.
      const docs = [$part.get(), getInactiveDoc(entries[2].id)!.part];
      const ids = docs.flatMap((d) => [
        ...d.customTextures.map((t) => t.id),
        ...d.customMaterials.map((m) => m.id),
        ...d.customMeshes.flatMap((m) => [m.id, m.subPartId]),
        ...d.customMeshes.flatMap((m) => (m.imported ? [m.imported.importId] : [])),
      ]);
      for (const stale of [
        'tex_a',
        'tex_b',
        'mat_a',
        'mat_b',
        'mesh_a',
        'mesh_b',
        'imp_b',
        'flexo_Pod_a',
        'flexo_Pod_b',
      ]) {
        expect(ids).not.toContain(stale);
      }
      expect(new Set(ids).size).toBe(ids.length); // …and no two parts share one

      // References follow the fresh ids, within each part.
      const [docA, docB] = docs;
      expect(docA.customMeshes[0].materialId).toBe(docA.customMaterials[0].id);
      expect(docB.customMeshes[0].materialId).toBe(docB.customMaterials[0].id);
      expect(docA.customMeshes[0].faceTextures.right?.textureId).toBe(docA.customTextures[0].id);
      expect(docA.placements[0].subPartTemplateId).toBe(docA.customMeshes[0].subPartId);
      expect(docB.placements[0].subPartTemplateId).toBe(docB.customMeshes[0].subPartId);
      // `meshName` names geometry INSIDE the copied GLB and is deliberately not re-minted.
      expect(docB.customMeshes[0].imported?.meshName).toBe('flexo_Pod_b');

      // The bytes landed under those fresh ids — one new blob per adopted tier, contents intact.
      const added = [...blobs.keys()].filter((k) => !blobsBefore.has(k));
      expect(added).toHaveLength(4);
      const idOf = (kind: string) =>
        added.filter((k) => k.startsWith(`pa:${PROJECT}:${kind}:`)).map((k) => k.split(':').pop());
      expect(idOf('tex-src').sort()).toEqual(
        [docA.customTextures[0].id, docB.customTextures[0].id].sort(),
      );
      expect(idOf('mesh-glb')).toEqual([docA.customMeshes[0].id]);
      expect(idOf('import-glb')).toEqual([docB.customMeshes[0].imported!.importId]);
      expect(
        new Uint8Array(
          await blobs.get(`pa:${PROJECT}:tex-src:${docA.customTextures[0].id}`)!.arrayBuffer(),
        ),
      ).toEqual(BYTES.tex_a);

      // ONE hydrate for the whole batch, run after both parts were already in the registry.
      expect(hydrateCustomAssets).toHaveBeenCalledTimes(1);
    });

    // "Merge N parts into one document" has no meaning. The dialog disables the destination;
    // THIS guard is the authoritative one, so a command or a test calling in directly is
    // refused rather than silently dropping parts 2..N.
    it("'merge-into-active' is REFUSED for a multi-part source", async () => {
      seedTwoParts();
      const parsed = await parseTwoPartArchive();
      await expect(importArchive({ mode: 'merge-into-active', parsed })).rejects.toThrow(
        'takes a single-part source; this one has 2 parts',
      );
      // Nothing was applied: no part was added and the active document is still empty.
      expect($partEntries.get()).toHaveLength(1);
      expect($part.get().customMeshes).toEqual([]);
      expect(hydrateCustomAssets).not.toHaveBeenCalled();
    });

    it("'merge-into-active' still merges a SINGLE-part source into the active document", async () => {
      const only = binaryPart('a', 'primitive');
      seedParts([{ part: only, name: 'Core' }]);
      put('tex-src', 'tex_a', BYTES.tex_a, 'image/png');
      put('mesh-glb', 'mesh_a', BYTES.mesh_a, 'model/gltf-binary');
      const parsed = await parseProjectArchive(await buildProjectArchive(PROJECT));
      if (!parsed.ok) throw new Error(parsed.error);

      await expect(importArchive({ mode: 'merge-into-active', parsed })).resolves.toEqual({
        mode: 'merge-into-active',
        name: 'Rover-7',
      });
      // It merged into the ACTIVE part — no new registry entry.
      expect($partEntries.get()).toHaveLength(1);
      expect($part.get().customMeshes).toHaveLength(1);
      expect($part.get().placements).toHaveLength(1);
      expect(hydrateCustomAssets).toHaveBeenCalledTimes(1);
    });
  });
});

describe('parse errors (copy is rendered verbatim by the dialog)', () => {
  it('rejects a file that is not gzip/tar', async () => {
    const result = await parseProjectArchive(new Blob(['definitely not an archive']));
    expect(result).toEqual({ ok: false, error: 'Not a flexo archive.' });
  });

  it('rejects a wire-version mismatch with both numbers named', async () => {
    seedProject(createEmptyPart());
    const archive = await buildProjectArchive(PROJECT);
    const entries = tarUnpack(await gunzip(new Uint8Array(await archive.arrayBuffer())));
    const manifest = JSON.parse(new TextDecoder().decode(entries[0].bytes));
    manifest.exportVersion = PROJECT_EXPORT_VERSION + 1;
    entries[0] = {
      name: 'manifest.json',
      bytes: new TextEncoder().encode(JSON.stringify(manifest)),
    };
    const tampered = new Blob([(await gzip(tarPack(entries))).slice() as unknown as BlobPart]);

    const result = await parseProjectArchive(tampered);
    expect(result).toEqual({
      ok: false,
      error: `This archive uses format v${PROJECT_EXPORT_VERSION + 1}; this flexo reads v${PROJECT_EXPORT_VERSION}. flexo never converts formats — re-export it from a matching flexo version.`,
    });
  });

  it('rejects a container-layout mismatch', async () => {
    seedProject(createEmptyPart());
    const archive = await buildProjectArchive(PROJECT);
    const entries = tarUnpack(await gunzip(new Uint8Array(await archive.arrayBuffer())));
    const manifest = JSON.parse(new TextDecoder().decode(entries[0].bytes));
    manifest.archiveVersion = 2;
    entries[0] = {
      name: 'manifest.json',
      bytes: new TextEncoder().encode(JSON.stringify(manifest)),
    };
    const tampered = new Blob([(await gzip(tarPack(entries))).slice() as unknown as BlobPart]);

    const result = await parseProjectArchive(tampered);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(
      'This archive uses container format v2; this flexo reads v1. flexo never converts formats — re-export it from a matching flexo version.',
    );
  });

  it('rejects an archive whose manifest names a missing asset — nothing partial', async () => {
    const part = createEmptyPart();
    part.customTextures.push(texture('tex_ab12'));
    seedProject(part);
    put('tex-src', 'tex_ab12', new Uint8Array([1]), 'image/png');
    const archive = await buildProjectArchive(PROJECT);
    const entries = tarUnpack(await gunzip(new Uint8Array(await archive.arrayBuffer()))).filter(
      (entry) => entry.name !== 'assets/tex-src/tex_ab12',
    );
    const broken = new Blob([(await gzip(tarPack(entries))).slice() as unknown as BlobPart]);

    const result = await parseProjectArchive(broken);
    expect(result).toEqual({
      ok: false,
      error: 'Archive is incomplete (missing assets/tex-src/tex_ab12). Nothing was imported.',
    });
  });
});

describe('abort', () => {
  it('rejects with an AbortError and produces no Blob', async () => {
    const part = createEmptyPart();
    part.customTextures.push(texture('tex_1'), texture('tex_2'));
    seedProject(part);
    put('tex-src', 'tex_1', new Uint8Array([1]));
    put('tex-src', 'tex_2', new Uint8Array([2]));

    const controller = new AbortController();
    await expect(
      buildProjectArchive(PROJECT, {
        signal: controller.signal,
        onProgress: (phase, done) => {
          if (phase === 'collect' && done === 1) controller.abort();
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('planAssetAdoption', () => {
  it('dedups a byte-identical texture and mints fresh ids for everything else', async () => {
    const destination = createEmptyPart();
    destination.customTextures.push(texture('tex_dest'));
    const pixels = new Uint8Array([4, 5, 6]);
    blobs.set(`pa:${PROJECT}:tex-src:tex_dest`, new Blob([pixels.slice()]));

    const hash = await sha256Hex(pixels);
    const incomingTextures = [texture('tex_same'), texture('tex_new')];
    const incomingMeshes = [
      {
        id: 'mesh_1',
        name: 'Box',
        subPartId: 'flexo_Box_1',
        primitive: { kind: 'box' as const, params: { width: 1, height: 1, depth: 1 } },
        faceTextures: {},
      },
      {
        id: 'mesh_2',
        name: 'Panel',
        subPartId: 'flexo_Panel_1',
        imported: {
          importId: 'imp_1',
          meshName: 'flexo_Panel_1',
          sourceFile: 'p.glb',
          sourceNode: 'Panel',
          sourceMaterial: 'M',
          triangles: 2,
          vertices: 4,
        },
        faceTextures: {},
      },
      {
        id: 'mesh_3',
        name: 'Panel B',
        subPartId: 'flexo_PanelB_1',
        imported: {
          importId: 'imp_1',
          meshName: 'flexo_PanelB_1',
          sourceFile: 'p.glb',
          sourceNode: 'PanelB',
          sourceMaterial: 'M',
          triangles: 2,
          vertices: 4,
        },
        faceTextures: {},
      },
    ];
    const assets = [
      { kind: 'tex-src' as const, id: 'tex_same', bytes: pixels, mime: 'image/png', sha256: hash },
      {
        kind: 'tex-src' as const,
        id: 'tex_new',
        bytes: new Uint8Array([9]),
        mime: 'image/png',
        sha256: await sha256Hex(new Uint8Array([9])),
      },
      {
        kind: 'mesh-glb' as const,
        id: 'mesh_1',
        bytes: new Uint8Array([1]),
        mime: 'model/gltf-binary',
        sha256: '',
      },
      {
        kind: 'import-glb' as const,
        id: 'imp_1',
        bytes: new Uint8Array([2]),
        mime: 'model/gltf-binary',
        sha256: '',
      },
    ];

    const plan = await planAssetAdoption(
      PROJECT,
      destination,
      { textures: incomingTextures, meshes: incomingMeshes },
      assets,
    );
    // Identical bytes ⇒ reuse the incumbent, copy nothing.
    expect(plan.textures.get('tex_same')).toBe('tex_dest');
    expect(plan.copiedTextures.has('tex_same')).toBe(false);
    expect(plan.hashes.get('tex_dest')).toBe(hash);
    // Different bytes ⇒ a fresh id whose blobs get copied.
    expect(plan.copiedTextures.get('tex_new')).toMatch(/^tex_[0-9a-f]{8}$/);
    // Meshes never dedup, and one import BATCH gets exactly one fresh id.
    expect(plan.meshes.size).toBe(3);
    expect(new Set(plan.meshes.values()).size).toBe(3);
    expect(plan.imports.size).toBe(1);
    expect(plan.imports.get('imp_1')).toMatch(/^imp_[0-9a-f]{8}$/);
  });
});

describe('archiveFileName', () => {
  it('sanitizes and suffixes', () => {
    expect(archiveFileName('Rover-7')).toBe('Rover-7.flexo.tar.gz');
    expect(archiveFileName('  A/B:C  ')).toBe('ABC.flexo.tar.gz');
    expect(archiveFileName('***')).toBe('project.flexo.tar.gz');
  });
});
