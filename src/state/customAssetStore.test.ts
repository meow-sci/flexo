import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';

// In-memory stand-in for the IndexedDB blob store (happy-dom has no indexedDB). Mirrors
// assetKeys so the import path's putAsset(assetKeys.importGlb(...)) is exercised for real.
vi.mock('./assetDb', () => {
  const store = new Map<string, Blob>();
  return {
    assetKeys: {
      textureSource: (id: string) => `tex-src:${id}`,
      textureKtx2: (id: string) => `tex-ktx2:${id}`,
      meshGlb: (id: string) => `mesh-glb:${id}`,
      importGlb: (id: string) => `import-glb:${id}`,
      emissivePaint: (id: string) => `emissive-paint:${id}`,
    },
    getAsset: async (key: string) => store.get(key),
    putAsset: async (key: string, data: Blob | Uint8Array, type = '') => {
      store.set(key, data instanceof Blob ? data : new Blob([data.slice()], { type }));
    },
    deleteAsset: async (key: string) => {
      store.delete(key);
    },
    __assetStore: store,
  };
});

// The imported-geometry cache resolves meshes by parsing a blob: URL through GLTFLoader,
// which happy-dom can't fetch. Stub the registry with the same contract (register → URL,
// name → geometry) so the store's catalog/render-cache wiring is what's under test.
vi.mock('../three/importedMeshCache', () => {
  const urls = new Map<string, string>();
  return {
    registerImportAtlas: (importId: string) => {
      const url = `blob:import/${importId}`;
      urls.set(importId, url);
      return url;
    },
    importAtlasUrl: (importId: string) => urls.get(importId) ?? null,
    ensureImportAtlas: async (importId: string) => urls.get(importId) ?? null,
    getImportedGeometry: async (importId: string) => {
      if (!urls.has(importId)) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
      );
      return g;
    },
    getImportedRawGeometry: async () => null,
    releaseImportAtlas: (importId: string) => urls.delete(importId),
    clearImportAtlases: () => urls.clear(),
  };
});

// happy-dom has no working 2D canvas, so the real decodeImage (createImageBitmap → canvas
// readback) can't run. Stub the DECODE only; the mip builder and the KTX2 encoder underneath
// it stay real, so the texture-creation path is exercised end to end.
vi.mock('../ktx/decodeImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ktx/decodeImage')>();
  const base = { width: 2, height: 2, rgba: new Uint8Array(16).fill(200) };
  return {
    ...actual,
    decodeImage: async () => ({ width: 2, height: 2, levels: actual.buildMipChain(base) }),
  };
});

// Loading a .ktx2 needs a WebGLRenderer to pick a transcode target (textureSupport), which
// there is no headless equivalent of. The material WIRING (which url lands in which slot) is
// what these tests assert, so hand back plain textures.
vi.mock('../three/TextureCache', async () => {
  const THREE = await import('three');
  return {
    loadTexture: async () => new THREE.Texture(),
    loadWrappedTexture: async () => new THREE.Texture(),
  };
});

// Avoid loading the real kitten gltfs (GLTFLoader/fetch/KTX2) — return tiny baked
// geometry for every submesh specKey and a stub material.
vi.mock('../three/kittenBake', () => ({
  bakeKittenSubMeshes: vi.fn(async () => {
    const THREE = await import('three');
    return ['suit', 'head', 'eye', 'helmet', 'visor', 'pack', 'packLabels'].map((specKey) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
      );
      return {
        specKey,
        label: specKey,
        source: { kind: 'hunter', specKey, diffuse: 'd' },
        geometry: g,
      };
    });
  }),
  buildKittenMaterial: vi.fn(async () => {
    const THREE = await import('three');
    return new THREE.MeshStandardMaterial();
  }),
}));

import { $historyList, $part, newPart, undo } from './editorStore';
import { $customCatalog } from './catalogStore';
import {
  $assetUsage,
  $unplacedCustomMeshes,
  addCustomMaterial,
  clearMeshFaceConfig,
  copyFaceConfigToAll,
  customMeshRenderCache,
  importModelAsMeshes,
  makeKittenMeshPart,
  matchImportedMeshes,
  planImportRemoval,
  removeCustomMaterial,
  removeImport,
  renameCustomTexture,
  replaceImport,
  setMeshGlowStreaming,
  setMeshMaterial,
  setMeshTransparent,
  updateCustomMaterial,
  updateCustomMesh,
} from './customAssetStore';
import { analyzeImport, DEFAULT_IMPORT_OPTIONS } from '../ksa/importPlan';
import { normalizeImport, type NormalizedImport } from '../ksa/importNormalize';
import type { ImportMaterialPlan, ImportMaterialSpec } from '../ksa/importMaterials';
import type { CustomMesh } from '../ksa/types';
import { assetKeys, getAsset } from './assetDb';

beforeEach(() => {
  newPart();
});

/**
 * A synthetic model, one object per entry, each placed `instances` times (all instances share
 * one geometry + material, so an object becomes ONE SubPart with N placements). Run through the
 * real analyze + normalize passes so the descriptors under test are the real shapes.
 */
async function synthesizeModel(
  objects: { name: string; instances: number }[],
  fileName = 'pod.glb',
): Promise<NormalizedImport> {
  const material = new THREE.MeshStandardMaterial();
  material.name = 'Metal';
  const scene = new THREE.Group();
  for (const object of objects) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < object.instances; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = object.name;
      mesh.position.set(i * 2, 0, 0);
      scene.add(mesh);
    }
  }
  const plan = analyzeImport({ scene, fileName }, DEFAULT_IMPORT_OPTIONS);
  return normalizeImport(plan, DEFAULT_IMPORT_OPTIONS);
}

/** The canonical fixture: "Hull" placed twice + a single "Nozzle" → 2 SubParts, 3 placements. */
async function synthesizeImport(): Promise<NormalizedImport> {
  return synthesizeModel([
    { name: 'Hull', instances: 2 },
    { name: 'Nozzle', instances: 1 },
  ]);
}

/**
 * The material half of an import, as {@link planImportMaterials} would produce it: three
 * textures (one per KSA slot that can carry an image) and one material both SubParts share.
 * Built here as plain data — the translation itself is covered by importMaterials.test.ts.
 */
function materialPlanFor(normalized: NormalizedImport, glow = false): ImportMaterialPlan {
  const material: ImportMaterialSpec = {
    key: 'mat:0',
    name: 'Metal',
    baseColorTextureKey: 'tex:base',
    ormTextureKey: 'tex:orm',
    normalTextureKey: 'tex:normal',
    normalStrength: 0.5,
    metalness: 1,
    roughness: 0.3,
  };
  if (glow) {
    material.glowPng = new Uint8Array([1, 2, 3]);
    material.glowColor = { r: 255, g: 64, b: 0 };
  }
  return {
    textures: [
      {
        key: 'tex:base',
        name: 'hull_basecolor',
        channel: 'baseColor',
        bytes: new Uint8Array([1]),
        mime: 'image/png',
      },
      {
        key: 'tex:orm',
        name: 'hull_orm',
        channel: 'orm',
        bytes: new Uint8Array([2]),
        mime: 'image/png',
      },
      {
        key: 'tex:normal',
        name: 'hull_normal',
        channel: 'normal',
        bytes: new Uint8Array([3]),
        mime: 'image/png',
      },
    ],
    materials: [material],
    materialKeyByGroup: new Map(normalized.meshes.map((m) => [m.materialGroupKey, 'mat:0'])),
    warnings: [],
  };
}

describe('custom materials', () => {
  it('add / update / remove are each one undo step', async () => {
    const mat = await addCustomMaterial('Red Metal', {
      baseColor: { kind: 'color', color: { r: 255, g: 0, b: 0 } },
      metalness: { kind: 'value', value: 1 },
      roughness: { kind: 'value', value: 0.15 },
    });
    expect($part.get().customMaterials).toHaveLength(1);
    expect(mat.id).toMatch(/^mat_/);
    expect(mat.metalness).toEqual({ kind: 'value', value: 1 });

    await updateCustomMaterial(mat.id, { roughness: { kind: 'value', value: 0.4 } });
    expect($part.get().customMaterials[0].roughness).toEqual({ kind: 'value', value: 0.4 });

    undo(); // revert the update
    expect($part.get().customMaterials[0].roughness).toEqual({ kind: 'value', value: 0.15 });
    undo(); // revert the add
    expect($part.get().customMaterials).toHaveLength(0);
  });

  it('removeCustomMaterial unassigns it from meshes', async () => {
    const mat = await addCustomMaterial('M');
    // A minimal primitive mesh referencing the material (bypasses addCustomMesh's
    // atlas rebuild — the assignment model is what's under test).
    $part.set({
      ...$part.get(),
      customMeshes: [
        {
          id: 'mesh_1',
          name: 'Box',
          subPartId: 'flexo_Box_1',
          primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
          faceTextures: {},
          materialId: mat.id,
        },
      ],
    });
    await removeCustomMaterial(mat.id);
    const p = $part.get();
    expect(p.customMaterials).toHaveLength(0);
    expect(p.customMeshes[0].materialId).toBeUndefined();
  });

  it('setMeshMaterial assigns and clears', async () => {
    const mat = await addCustomMaterial('M');
    $part.set({
      ...$part.get(),
      customMeshes: [
        {
          id: 'mesh_1',
          name: 'Box',
          subPartId: 'flexo_Box_1',
          primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
          faceTextures: {},
        },
      ],
    });
    await setMeshMaterial('mesh_1', mat.id);
    expect($part.get().customMeshes[0].materialId).toBe(mat.id);
    await setMeshMaterial('mesh_1', undefined);
    expect($part.get().customMeshes[0].materialId).toBeUndefined();
  });
});

describe('makeKittenMeshPart', () => {
  it('adds a "<Name> Mesh" layer + all submesh SubParts in ONE undo step', async () => {
    await makeKittenMeshPart('hunter');

    const p = $part.get();
    const layer = p.layers.find((l) => l.name === 'Hunter Mesh');
    expect(layer).toBeTruthy();
    // 7 submeshes: suit, head, eyes, helmet, visor, pack, pack labels.
    expect(p.customMeshes).toHaveLength(7);
    expect(p.placements).toHaveLength(7);
    expect(p.customMeshes.every((m) => m.kitten?.kind === 'hunter' && !m.primitive)).toBe(true);
    expect(p.placements.every((pl) => pl.layerId === layer!.id)).toBe(true);
    // Identity placements (geometry carries the body-root offset).
    expect(
      p.placements.every((pl) => pl.position.x === 0 && pl.position.y === 0 && pl.position.z === 0),
    ).toBe(true);
    // Unique instance ids.
    expect(new Set(p.placements.map((pl) => pl.instanceId)).size).toBe(7);

    // A single undo reverts the whole part-ification.
    undo();
    const after = $part.get();
    expect(after.customMeshes).toHaveLength(0);
    expect(after.placements).toHaveLength(0);
    expect(after.layers.some((l) => l.name === 'Hunter Mesh')).toBe(false);
  });

  it('keeps instance ids unique across two part-ified kittens of the same kind', async () => {
    await makeKittenMeshPart('hunter');
    await makeKittenMeshPart('hunter');
    const ids = $part.get().placements.map((pl) => pl.instanceId);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(ids).toContain('hunter_suit_1');
    expect(ids).toContain('hunter_suit_2');
  });
});

describe('importModelAsMeshes', () => {
  it('creates a file-named layer, one mesh per group and one placement per instance', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb');

    const p = $part.get();
    const layer = p.layers.find((l) => l.name === 'pod');
    expect(layer).toBeTruthy();

    // Hull (2 nodes, shared geometry+material) → 1 SubPart, 2 placements; Nozzle → 1 + 1.
    expect(p.customMeshes).toHaveLength(2);
    expect(p.placements).toHaveLength(3);
    expect(p.customMeshes.map((m) => m.name)).toEqual(['Hull', 'Nozzle']);
    expect(p.customMeshes.every((m) => !m.primitive && !m.kitten)).toBe(true);
    for (const m of p.customMeshes) {
      expect(m.imported?.importId).toBe(normalized.importId);
      expect(m.imported?.meshName).toBe(m.subPartId);
      expect(m.imported?.sourceFile).toBe('pod.glb');
      expect(m.imported?.triangles).toBeGreaterThan(0);
    }

    const hull = p.customMeshes[0];
    expect(p.placements.filter((pl) => pl.subPartTemplateId === hull.subPartId)).toHaveLength(2);
    expect(p.placements.every((pl) => pl.layerId === layer!.id)).toBe(true);
    expect(new Set(p.placements.map((pl) => pl.instanceId)).size).toBe(3);
    // The second Hull node's placement keeps its x offset (only scale is baked by default).
    expect(p.placements[1].position.x).toBeCloseTo(2);
  });

  it('publishes one $customCatalog entry per imported mesh, atlased to its own import GLB', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb');

    const entries = $customCatalog.get();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.id)).toEqual($part.get().customMeshes.map((m) => m.subPartId));
    for (const e of entries) {
      expect(e.sourceFile).toBe('(imported)');
      expect(e.atlasUrl).toBe(`blob:import/${normalized.importId}`);
      expect(e.meshNodeName).toBe(e.id);
    }
  });

  it('renders an imported mesh through the REAL material path, not the flat placeholder', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized));

    const subPartId = $part.get().customMeshes[0]!.subPartId;
    const cached = customMeshRenderCache.get(subPartId)!;
    expect(cached.materials).toHaveLength(1); // one material per mesh — a KSA <PartModel>
    const mat = cached.materials[0]!;
    expect(mat.map).toBeTruthy();
    expect(mat.normalMap).toBeTruthy();
    expect(mat.normalScale.x).toBe(0.5);
    // A packed ORM drives all three of three's separate maps, exactly like the export.
    expect(mat.aoMap).toBe(mat.roughnessMap);
    expect(mat.aoMap).toBe(mat.metalnessMap);
    // diffuseUrl makes the shared-material cache bust like the primitive path does.
    expect($customCatalog.get()[0]!.diffuseUrl).toBeTruthy();
  });

  it('composites an imported glow into the diffuse + mask, like a painted primitive', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized, true));
    const subPartId = $part.get().customMeshes[0]!.subPartId;
    const mat = customMeshRenderCache.get(subPartId)!.materials[0]!;
    // KSA adds WHITE × mask × 1.25 after lighting, so the colour must be in the diffuse and
    // the emissive UNIFORM must stay black (free for the selection highlight).
    expect(mat.emissiveMap).toBeTruthy();
    expect(mat.emissive.getHex()).toBe(0x000000);
  });

  it('creates the imported textures + material as ORDINARY flexo assets and assigns them', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized));

    const p = $part.get();
    // One CustomTexture per slot, each with the channel the translation authored it for.
    expect(p.customTextures.map((t) => t.channel)).toEqual(['baseColor', 'orm', 'normal']);
    expect(p.customTextures.every((t) => t.id.startsWith('tex_'))).toBe(true);

    // ONE material shared by both SubParts (they came from one glTF material).
    expect(p.customMaterials).toHaveLength(1);
    const mat = p.customMaterials[0]!;
    expect(mat.baseColor).toEqual({ kind: 'map', textureId: p.customTextures[0]!.id });
    expect(mat.ormPacked).toEqual({ textureId: p.customTextures[1]!.id });
    expect(mat.normal).toEqual({ textureId: p.customTextures[2]!.id, strength: 0.5 });
    // The scalars are what KSA gets when no packed ORM image exists.
    expect(mat.metalness).toEqual({ kind: 'value', value: 1 });
    expect(mat.roughness).toEqual({ kind: 'value', value: 0.3 });
    expect(p.customMeshes.every((m) => m.materialId === mat.id)).toBe(true);
  });

  it('stores an emissive material through the existing painted-glow shape', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized, true));

    for (const m of $part.get().customMeshes) {
      // Reusing 'painted' means glowFor / compositeGlow / the exporter all work unchanged.
      // coverage/strength = 1 pass the glTF emissive's own falloff (already in the bitmap's
      // alpha) through unscaled, so an import reproduces its source material exactly.
      expect(m.emissive).toEqual({
        shape: 'painted',
        color: { r: 255, g: 64, b: 0 },
        strength: 1,
        coverage: 1,
      });
      expect(await getAsset(assetKeys.emissivePaint(m.id))).toBeInstanceOf(Blob);
    }
  });

  it('imports with no material plan at all (geometry only)', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb');
    const p = $part.get();
    expect(p.customTextures).toHaveLength(0);
    expect(p.customMaterials).toHaveLength(0);
    expect(p.customMeshes.every((m) => m.materialId === undefined)).toBe(true);
  });

  it('keeps instance ids unique when the same model is imported twice', async () => {
    await importModelAsMeshes(await synthesizeImport(), 'pod.glb');
    await importModelAsMeshes(await synthesizeImport(), 'pod.glb');
    const ids = $part.get().placements.map((pl) => pl.instanceId);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toContain('hull_1');
    expect(ids).toContain('hull_3');
  });

  it('setMeshTransparent flips the <PartModelGlass> export flag on an imported mesh', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb');
    const meshId = $part.get().customMeshes[0]!.id;

    await setMeshTransparent(meshId, true);
    expect($part.get().customMeshes[0]!.imported?.transparent).toBe(true);
    await setMeshTransparent(meshId, false);
    // Cleared, not set to false — the flag is optional and absence is the default.
    expect($part.get().customMeshes[0]!.imported).not.toHaveProperty('transparent');
  });
});

describe('removeImport', () => {
  it('removes the batch meshes, placements, layer and orphaned material/textures', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized, true));

    const before = $part.get();
    expect(before.customMeshes).toHaveLength(2);
    expect(before.placements).toHaveLength(3);
    expect(before.customTextures).toHaveLength(3);
    expect(before.customMaterials).toHaveLength(1);
    const layerId = before.layers.find((l) => l.name === 'pod')!.id;

    await removeImport(normalized.importId);

    const after = $part.get();
    expect(after.customMeshes).toHaveLength(0);
    expect(after.placements).toHaveLength(0);
    // The batch's material and all three of its textures are now unreferenced → collected.
    expect(after.customMaterials).toHaveLength(0);
    expect(after.customTextures).toHaveLength(0);
    // The layer the import created is empty now, so it goes too.
    expect(after.layers.some((l) => l.id === layerId)).toBe(false);
    expect($customCatalog.get()).toHaveLength(0);
  });

  it('keeps a material (and its textures) that another mesh still uses', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized));

    // A hand-authored primitive adopts the imported material — the exact case provenance
    // tagging would get wrong and reference counting gets right.
    const matId = $part.get().customMaterials[0]!.id;
    $part.set({
      ...$part.get(),
      customMeshes: [
        ...$part.get().customMeshes,
        {
          id: 'mesh_keep',
          name: 'Box',
          subPartId: 'flexo_Box_keep',
          primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
          faceTextures: {},
          materialId: matId,
        },
      ],
    });

    await removeImport(normalized.importId);

    const after = $part.get();
    expect(after.customMeshes.map((m) => m.id)).toEqual(['mesh_keep']);
    expect(after.customMaterials).toHaveLength(1);
    expect(after.customTextures).toHaveLength(3);
    // Its binaries survive too.
    for (const t of after.customTextures) {
      expect(await getAsset(assetKeys.textureSource(t.id))).toBeInstanceOf(Blob);
    }
  });

  it('leaves an untouched second import batch alone', async () => {
    const first = await synthesizeImport();
    await importModelAsMeshes(first, 'pod.glb', materialPlanFor(first));
    const second = await synthesizeImport();
    await importModelAsMeshes(second, 'nozzle.glb', materialPlanFor(second));

    await removeImport(first.importId);

    const after = $part.get();
    expect(after.customMeshes.every((m) => m.imported?.importId === second.importId)).toBe(true);
    expect(after.customMeshes).toHaveLength(2);
    expect(after.placements).toHaveLength(3);
    expect(after.customMaterials).toHaveLength(1);
    expect(after.customTextures).toHaveLength(3);
    expect(await getAsset(assetKeys.importGlb(second.importId))).toBeInstanceOf(Blob);
  });

  it('deletes the batch GLB, the purged textures and the glow bitmaps from IndexedDB', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized, true));
    const before = $part.get();
    const textureIds = before.customTextures.map((t) => t.id);
    const meshIds = before.customMeshes.map((m) => m.id);
    expect(await getAsset(assetKeys.importGlb(normalized.importId))).toBeInstanceOf(Blob);

    await removeImport(normalized.importId);

    expect(await getAsset(assetKeys.importGlb(normalized.importId))).toBeUndefined();
    for (const id of textureIds) {
      expect(await getAsset(assetKeys.textureSource(id))).toBeUndefined();
      expect(await getAsset(assetKeys.textureKtx2(id))).toBeUndefined();
    }
    for (const id of meshIds) {
      expect(await getAsset(assetKeys.emissivePaint(id))).toBeUndefined();
    }
  });

  it('planImportRemoval never collects an asset nothing referenced in the first place', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized));
    // A material created in the Add menu and never assigned is NOT the import's litter.
    const spare = await addCustomMaterial('Spare');

    const plan = planImportRemoval($part.get(), normalized.importId);
    expect(plan.materialIds).not.toContain(spare.id);
    expect(plan.meshIds).toHaveLength(2);
    expect(plan.placements).toBe(3);
    expect(plan.textureIds).toHaveLength(3);

    await removeImport(normalized.importId);
    expect($part.get().customMaterials.map((m) => m.id)).toEqual([spare.id]);
  });

  it('is a no-op for an unknown import id', async () => {
    const normalized = await synthesizeImport();
    await importModelAsMeshes(normalized, 'pod.glb');
    await removeImport('nope');
    expect($part.get().customMeshes).toHaveLength(2);
  });
});

describe('replaceImport', () => {
  /** Drags the Hull placements somewhere, as a user arranging the model in the editor would. */
  function arrangeHullPlacements(subPartId: string): void {
    const p = $part.get();
    $part.set({
      ...p,
      placements: p.placements.map((pl) =>
        pl.subPartTemplateId === subPartId ? { ...pl, position: { x: 9, y: 9, z: 9 } } : pl,
      ),
    });
  }

  it('matched SubParts keep their id, subPartId and the placements the user arranged', async () => {
    const first = await synthesizeImport();
    await importModelAsMeshes(first, 'pod.glb', materialPlanFor(first));
    const hullBefore = $part.get().customMeshes[0]!;
    arrangeHullPlacements(hullBefore.subPartId);

    // The re-export: Hull survives (renamed in flexo, and re-materialled in Blender), Nozzle
    // is gone, Skirt is new.
    const second = await synthesizeModel([
      { name: 'Hull', instances: 2 },
      { name: 'Skirt', instances: 1 },
    ]);
    await replaceImport(first.importId, second, { updateMaterials: true }, materialPlanFor(second));

    const p = $part.get();
    expect(p.customMeshes).toHaveLength(2);
    const hull = p.customMeshes.find((m) => m.imported?.sourceNode === 'Hull')!;
    // IDENTITY PRESERVED: everything that references a SubPart keeps resolving.
    expect(hull.id).toBe(hullBefore.id);
    expect(hull.subPartId).toBe(hullBefore.subPartId);
    // …pointing at the NEW file's geometry, under the name that file gave it.
    expect(hull.imported!.importId).toBe(second.importId);
    expect(hull.imported!.meshName).toBe(second.meshes[0]!.subPartId);
    expect(hull.imported!.meshName).not.toBe(hull.subPartId);
    expect(hull.imported!.sourceFile).toBe('pod.glb');

    // The arrangement survives — the file's node transforms are NOT re-applied.
    const hullPlacements = p.placements.filter((pl) => pl.subPartTemplateId === hull.subPartId);
    expect(hullPlacements).toHaveLength(2);
    expect(hullPlacements.every((pl) => pl.position.x === 9)).toBe(true);

    // Removed: the SubPart the new file no longer contains, and its placement.
    expect(p.customMeshes.some((m) => m.imported?.sourceNode === 'Nozzle')).toBe(false);
    expect(p.placements.some((pl) => pl.subPartTemplateId === hullBefore.subPartId)).toBe(true);
    // Added: a brand-new SubPart with its own placement, on the batch's existing layer.
    const skirt = p.customMeshes.find((m) => m.imported?.sourceNode === 'Skirt')!;
    expect(skirt.subPartId).toBe(second.meshes[1]!.subPartId);
    const skirtPlacements = p.placements.filter((pl) => pl.subPartTemplateId === skirt.subPartId);
    expect(skirtPlacements).toHaveLength(1);
    expect(skirtPlacements[0]!.layerId).toBe(hullPlacements[0]!.layerId);
    expect(p.placements).toHaveLength(3);
  });

  it('adds only the SURPLUS placements when the new file has more copies of a mesh', async () => {
    const first = await synthesizeImport();
    await importModelAsMeshes(first, 'pod.glb');
    const hullId = $part.get().customMeshes[0]!.subPartId;
    arrangeHullPlacements(hullId);

    // Hull is now placed FOUR times in Blender; flexo has two placements it must not disturb.
    const second = await synthesizeModel([
      { name: 'Hull', instances: 4 },
      { name: 'Nozzle', instances: 1 },
    ]);
    await replaceImport(first.importId, second, { updateMaterials: false });

    const hullPlacements = $part.get().placements.filter((pl) => pl.subPartTemplateId === hullId);
    expect(hullPlacements).toHaveLength(4);
    expect(hullPlacements.filter((pl) => pl.position.x === 9)).toHaveLength(2);
    expect(new Set(hullPlacements.map((pl) => pl.instanceId)).size).toBe(4);
  });

  it('leaves surplus placements alone when the new file has fewer copies', async () => {
    const first = await synthesizeImport();
    await importModelAsMeshes(first, 'pod.glb');
    const hullId = $part.get().customMeshes[0]!.subPartId;

    const second = await synthesizeModel([
      { name: 'Hull', instances: 1 },
      { name: 'Nozzle', instances: 1 },
    ]);
    await replaceImport(first.importId, second, { updateMaterials: false });

    expect($part.get().placements.filter((pl) => pl.subPartTemplateId === hullId)).toHaveLength(2);
  });

  it('"Update materials from file" ON swaps the material and collects the orphans', async () => {
    const first = await synthesizeImport();
    await importModelAsMeshes(first, 'pod.glb', materialPlanFor(first));
    const before = $part.get();
    const oldMaterialId = before.customMaterials[0]!.id;
    const oldTextureIds = before.customTextures.map((t) => t.id);

    const second = await synthesizeImport();
    await replaceImport(first.importId, second, { updateMaterials: true }, materialPlanFor(second));

    const p = $part.get();
    // ONE material again — the old one is unreferenced after the swap, so it is collected
    // along with its three textures (the same reference counting "Remove import" uses).
    expect(p.customMaterials).toHaveLength(1);
    expect(p.customMaterials[0]!.id).not.toBe(oldMaterialId);
    expect(p.customTextures).toHaveLength(3);
    expect(p.customTextures.some((t) => oldTextureIds.includes(t.id))).toBe(false);
    expect(p.customMeshes.every((m) => m.materialId === p.customMaterials[0]!.id)).toBe(true);
    // The orphaned textures' binaries go too.
    for (const id of oldTextureIds) {
      expect(await getAsset(assetKeys.textureSource(id))).toBeUndefined();
    }
  });

  it('"Update materials from file" OFF keeps the material edits made in flexo', async () => {
    const first = await synthesizeImport();
    await importModelAsMeshes(first, 'pod.glb', materialPlanFor(first));
    const before = $part.get();
    const materialId = before.customMaterials[0]!.id;
    const textureIds = before.customTextures.map((t) => t.id);

    const second = await synthesizeImport();
    await replaceImport(
      first.importId,
      second,
      { updateMaterials: false },
      materialPlanFor(second),
    );

    const p = $part.get();
    // Nothing was created and nothing was collected — only the geometry pointer moved.
    expect(p.customMaterials.map((m) => m.id)).toEqual([materialId]);
    expect(p.customTextures.map((t) => t.id)).toEqual(textureIds);
    expect(p.customMeshes.every((m) => m.materialId === materialId)).toBe(true);
    expect(p.customMeshes.every((m) => m.imported!.importId === second.importId)).toBe(true);
    for (const id of textureIds) {
      expect(await getAsset(assetKeys.textureSource(id))).toBeInstanceOf(Blob);
    }
  });

  it('drops a glow the new file no longer emits (materials ON) but keeps it (materials OFF)', async () => {
    const first = await synthesizeImport();
    await importModelAsMeshes(first, 'pod.glb', materialPlanFor(first, true));
    expect($part.get().customMeshes.every((m) => m.emissive?.shape === 'painted')).toBe(true);

    const off = await synthesizeImport();
    await replaceImport(first.importId, off, { updateMaterials: false }, materialPlanFor(off));
    expect($part.get().customMeshes.every((m) => m.emissive?.shape === 'painted')).toBe(true);

    const on = await synthesizeImport();
    await replaceImport(off.importId, on, { updateMaterials: true }, materialPlanFor(on));
    expect($part.get().customMeshes.every((m) => m.emissive === undefined)).toBe(true);
  });

  it('publishes a catalog entry per surviving SubPart, atlased to the NEW batch GLB', async () => {
    const first = await synthesizeImport();
    await importModelAsMeshes(first, 'pod.glb');
    const second = await synthesizeModel([
      { name: 'Hull', instances: 2 },
      { name: 'Skirt', instances: 1 },
    ]);
    await replaceImport(first.importId, second, { updateMaterials: false });

    const entries = $customCatalog.get();
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e.atlasUrl).toBe(`blob:import/${second.importId}`);
    }
    // meshNodeName is the name INSIDE the new GLB, which is no longer the SubPart id for a
    // replaced mesh — the fallback geometry lookup depends on it being the truth.
    const hull = $part.get().customMeshes[0]!;
    const hullEntry = entries.find((e) => e.id === hull.subPartId)!;
    expect(hullEntry.meshNodeName).toBe(hull.imported!.meshName);
    expect(hullEntry.meshNodeName).not.toBe(hullEntry.id);
  });

  it('deletes the previous batch GLB and registers the new one', async () => {
    const first = await synthesizeImport();
    await importModelAsMeshes(first, 'pod.glb');
    const second = await synthesizeImport();
    await replaceImport(first.importId, second, { updateMaterials: false });

    expect(await getAsset(assetKeys.importGlb(first.importId))).toBeUndefined();
    expect(await getAsset(assetKeys.importGlb(second.importId))).toBeInstanceOf(Blob);
  });

  it('leaves another import batch untouched', async () => {
    const first = await synthesizeImport();
    await importModelAsMeshes(first, 'pod.glb', materialPlanFor(first));
    const other = await synthesizeImport();
    await importModelAsMeshes(other, 'nozzle.glb', materialPlanFor(other));

    const second = await synthesizeImport();
    await replaceImport(first.importId, second, { updateMaterials: true }, materialPlanFor(second));

    const p = $part.get();
    expect(p.customMeshes.filter((m) => m.imported!.importId === other.importId)).toHaveLength(2);
    expect(p.customMeshes.filter((m) => m.imported!.importId === second.importId)).toHaveLength(2);
    expect(p.customMaterials).toHaveLength(2);
    expect(p.customTextures).toHaveLength(6);
    expect(await getAsset(assetKeys.importGlb(other.importId))).toBeInstanceOf(Blob);
  });

  it('is a no-op for an unknown import id', async () => {
    const first = await synthesizeImport();
    await importModelAsMeshes(first, 'pod.glb');
    const second = await synthesizeImport();
    await replaceImport('nope', second, { updateMaterials: true });
    expect($part.get().customMeshes.every((m) => m.imported!.importId === first.importId)).toBe(
      true,
    );
  });
});

describe('matchImportedMeshes', () => {
  const mesh = (id: string, sourceNode: string, sourceMaterial: string): CustomMesh => ({
    id,
    name: id,
    subPartId: `flexo_${id}`,
    faceTextures: {},
    imported: {
      importId: 'imp_1',
      meshName: `flexo_${id}`,
      sourceFile: 'pod.glb',
      sourceNode,
      sourceMaterial,
      triangles: 1,
      vertices: 3,
    },
  });

  it('matches on (sourceNode, sourceMaterial) and reports the rest', () => {
    const existing = [mesh('a', 'Hull', 'Metal'), mesh('b', 'Nozzle', 'Metal')];
    const plan = matchImportedMeshes(existing, [
      { sourceNode: 'Nozzle', sourceMaterial: 'Metal' },
      { sourceNode: 'Hull', sourceMaterial: 'Paint' }, // same object, NEW material → not a match
    ]);
    expect(plan.matched.map((m) => m.mesh.id)).toEqual(['b']);
    expect(plan.added).toHaveLength(1);
    expect(plan.removed.map((m) => m.id)).toEqual(['a']);
  });

  it('matches duplicate (node, material) pairs first-come-first-served', () => {
    const existing = [mesh('a', 'Bolt', 'Metal'), mesh('b', 'Bolt', 'Metal')];
    const plan = matchImportedMeshes(existing, [
      { sourceNode: 'Bolt', sourceMaterial: 'Metal' },
      { sourceNode: 'Bolt', sourceMaterial: 'Metal' },
    ]);
    expect(plan.matched.map((m) => m.mesh.id)).toEqual(['a', 'b']);
    expect(plan.added).toHaveLength(0);
    expect(plan.removed).toHaveLength(0);
  });
});

/**
 * The Phase-8 store additions the Surface sidebar, the left Face card and the Asset Manager
 * all read (design-surface-assets.md §2.4, §7.1, D10).
 */
describe('surface-mode store additions', () => {
  const box = (over: Partial<CustomMesh> = {}): CustomMesh => ({
    id: 'mesh_1',
    name: 'Hull Box',
    subPartId: 'flexo_HullBox_a1',
    primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
    faceTextures: {},
    ...over,
  });

  const placement = (instanceId: string, templateId: string, layerId = 'default') => ({
    instanceId,
    subPartTemplateId: templateId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId,
  });

  /** How many UNDO entries the history holds right now. */
  const undoDepth = () => $historyList.get().filter((h) => h.stepsFromCurrent < 0).length;

  it('$assetUsage counts faces, material channels and placements', async () => {
    const mat = await addCustomMaterial('Steel', {
      baseColor: { kind: 'map', textureId: 'tex_base' },
      normal: { textureId: 'tex_normal', strength: 1 },
    });
    $part.set({
      ...$part.get(),
      customTextures: [
        { id: 'tex_base', name: 'base', width: 2, height: 2, channel: 'baseColor' },
        { id: 'tex_normal', name: 'nrm', width: 2, height: 2, channel: 'normal' },
        { id: 'tex_unused', name: 'unused', width: 2, height: 2, channel: 'baseColor' },
      ],
      customMeshes: [
        box({
          materialId: mat.id,
          faceTextures: {
            right: { textureId: 'tex_base', uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } },
            left: { textureId: 'tex_base', uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } },
          },
        }),
      ],
      placements: [
        placement('hull_1', 'flexo_HullBox_a1', 'default'),
        placement('hull_2', 'flexo_HullBox_a1', 'wings'),
      ],
    });

    const usage = $assetUsage.get();
    expect(usage.texture.get('tex_base')?.faces.map((f) => f.faceKey)).toEqual(['right', 'left']);
    expect(usage.texture.get('tex_base')?.materials).toEqual([{ matId: mat.id, slot: 'base' }]);
    expect(usage.texture.get('tex_normal')?.materials).toEqual([{ matId: mat.id, slot: 'normal' }]);
    // An unassigned texture is present with ZERO uses — that is what the manager's Unused
    // filter reads, so it must not simply be absent.
    expect(usage.texture.get('tex_unused')).toEqual({ faces: [], materials: [] });
    expect(usage.material.get(mat.id)?.meshes).toEqual(['mesh_1']);
    expect(usage.mesh.get('mesh_1')).toEqual({ placements: 2, layers: ['default', 'wings'] });
  });

  it('$unplacedCustomMeshes lists zero-placement templates only', () => {
    $part.set({
      ...$part.get(),
      customMeshes: [box(), box({ id: 'mesh_2', subPartId: 'flexo_Fin_b2', name: 'Fin' })],
      placements: [placement('hull_1', 'flexo_HullBox_a1')],
    });
    expect($unplacedCustomMeshes.get().map((m) => m.id)).toEqual(['mesh_2']);
  });

  it('renameCustomTexture is one undo step and keeps every reference intact', () => {
    $part.set({
      ...$part.get(),
      customTextures: [{ id: 'tex_base', name: 'old', width: 2, height: 2, channel: 'baseColor' }],
      customMeshes: [
        box({
          faceTextures: {
            right: { textureId: 'tex_base', uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } },
          },
        }),
      ],
    });
    const before = undoDepth();
    renameCustomTexture('tex_base', '  hull plate  ');

    expect(undoDepth()).toBe(before + 1);
    expect($part.get().customTextures[0].name).toBe('hull plate');
    expect($part.get().customTextures[0].id).toBe('tex_base');
    expect($part.get().customMeshes[0].faceTextures.right!.textureId).toBe('tex_base');

    undo();
    expect($part.get().customTextures[0].name).toBe('old');
  });

  it('updateCustomMesh primitive patch keeps the placements and the subPartId', async () => {
    $part.set({
      ...$part.get(),
      customMeshes: [box()],
      placements: [
        placement('hull_1', 'flexo_HullBox_a1'),
        placement('hull_2', 'flexo_HullBox_a1'),
      ],
    });
    await updateCustomMesh('mesh_1', {
      primitive: { kind: 'box', params: { width: 3, height: 1, depth: 1 } },
    });

    const p = $part.get();
    expect(p.customMeshes[0].primitive).toEqual({
      kind: 'box',
      params: { width: 3, height: 1, depth: 1 },
    });
    expect(p.customMeshes[0].subPartId).toBe('flexo_HullBox_a1');
    expect(p.placements).toHaveLength(2);
  });

  it('setMeshGlowStreaming(first=true) pushes exactly one undo entry across a drag', async () => {
    $part.set({
      ...$part.get(),
      customMeshes: [
        box({
          emissive: { shape: 'whole', color: { r: 1, g: 2, b: 3 }, strength: 0.2, coverage: 1 },
        }),
      ],
    });
    const before = undoDepth();

    await setMeshGlowStreaming('mesh_1', { strength: 0.3 }, true);
    await setMeshGlowStreaming('mesh_1', { strength: 0.4 }, false);
    await setMeshGlowStreaming('mesh_1', { strength: 0.5 }, false);

    expect(undoDepth()).toBe(before + 1);
    expect($part.get().customMeshes[0].emissive!.strength).toBe(0.5);
    undo();
    expect($part.get().customMeshes[0].emissive!.strength).toBe(0.2);
  });

  it('copyFaceConfigToAll is one undo step covering every face key', async () => {
    const cfg = { textureId: 'tex_base', uvScale: { x: 2, y: 2 }, uvOffset: { x: 0, y: 0 } };
    $part.set({
      ...$part.get(),
      customMeshes: [box({ faceTextures: { right: cfg } })],
    });
    const before = undoDepth();

    await copyFaceConfigToAll('mesh_1', 'right');

    expect(undoDepth()).toBe(before + 1);
    const faces = $part.get().customMeshes[0].faceTextures;
    expect(Object.keys(faces).sort()).toEqual(
      ['right', 'left', 'top', 'bottom', 'front', 'back'].sort(),
    );
    expect(faces.back).toEqual(cfg);
    // Cloned, not aliased — editing one face must never move another.
    expect(faces.back).not.toBe(faces.right);

    undo();
    expect(Object.keys($part.get().customMeshes[0].faceTextures)).toEqual(['right']);
  });

  it('clearMeshFaceConfig removes just that face', async () => {
    const cfg = { textureId: 'tex_base', uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } };
    $part.set({ ...$part.get(), customMeshes: [box({ faceTextures: { right: cfg, top: cfg } })] });
    await clearMeshFaceConfig('mesh_1', 'right');
    expect(Object.keys($part.get().customMeshes[0].faceTextures)).toEqual(['top']);
  });
});
