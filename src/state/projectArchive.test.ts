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

const {
  ARCHIVE_VERSION,
  archiveFileName,
  buildProjectArchive,
  parseProjectArchive,
  planAssetAdoption,
  sha256Hex,
} = await import('./projectArchive');
const { tarUnpack, gunzip, gzip, tarPack } = await import('./tarArchive');
const { deriveCounts } = await import('./projectDb');

const PROJECT = 'p_test00000001';

function texture(id: string) {
  return { id, name: id, width: 4, height: 4, channel: 'baseColor' as const };
}

function seedProject(part: EditingPart): void {
  metas.set(PROJECT, {
    id: PROJECT,
    name: 'Rover-7',
    description: 'crew rover',
    partId: part.partId,
    createdAt: 1,
    savedAt: 2,
    schemaVersion: 2,
    counts: deriveCounts(part),
    bytes: { snapshot: 0, history: 0, assets: 0 },
    hasThumb: false,
  });
  snapshots.set(PROJECT, {
    version: 2,
    part,
    layerView: {},
    activeLayerId: 'default',
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
    expect(parsed.envelope.data.customTextures.map((t) => t.id)).toEqual(['tex_1']);
    expect(parsed.envelope.data.customMeshes.map((m) => m.id)).toEqual(['mesh_1']);
    expect(parsed.envelope.data.customMeshes[0].faceTextures.right?.textureId).toBe('tex_1');

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
