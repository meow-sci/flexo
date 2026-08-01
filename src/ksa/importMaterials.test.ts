import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { GltfJson, LoadedModel, ModelSource } from '../three/loadModelFile';
import type { ImageLevel } from '../ktx/decodeImage';
import type { ImportGroup, ImportPlan } from './importPlan';
import {
  bakeBaseColorFactor,
  hashBytes,
  linearToSrgbByte,
  planImportMaterials,
  srgbByteToLinear,
  type ImportMaterialOptions,
  type ImportMaterialPlan,
} from './importMaterials';

/**
 * Inputs are synthetic glTF JSON + synthetic pixels — never a committed binary fixture.
 *
 * The image codecs are injected: happy-dom has no working 2D canvas, and the translation
 * itself is pure pixel math, so a trivially reversible "fake PNG" (2×u16 dimensions + raw
 * RGBA) lets every test read the GENERATED pixels back and assert on them exactly.
 */

function fakeEncode(level: ImageLevel): Uint8Array {
  const out = new Uint8Array(4 + level.rgba.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, level.width);
  view.setUint16(2, level.height);
  out.set(level.rgba, 4);
  return out;
}

function fakeDecode(bytes: Uint8Array): ImageLevel {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint16(0), height: view.getUint16(2), rgba: bytes.slice(4) };
}

const CODECS: ImportMaterialOptions = {
  decodeLevel: async (bytes) => fakeDecode(bytes),
  encodePng: async (level) => fakeEncode(level),
};

/** A uniform image — enough for every channel test (the maths is per-texel). */
function solid(r: number, g: number, b: number, width = 2, height = 2): ImageLevel {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

function group(key: string, materialIndex: number | null, sourceMaterial = 'Mat'): ImportGroup {
  return {
    key,
    suggestedName: key,
    sourceNode: key,
    sourceMaterial,
    material: new THREE.MeshStandardMaterial(),
    materialIndex,
    geometry: new THREE.BufferGeometry(),
    triangles: 0,
    vertices: 0,
    instances: [],
  };
}

function planOf(groups: ImportGroup[]): ImportPlan {
  return {
    fileName: 'model.glb',
    groups,
    warnings: [],
    totals: { subParts: groups.length, placements: 0, triangles: 0, vertices: 0, materials: 0 },
    bounds: { min: new THREE.Vector3(), max: new THREE.Vector3(), size: new THREE.Vector3() },
  };
}

function makeSource(json: GltfJson, images: ImageLevel[]): ModelSource {
  return {
    json,
    materialIndex: () => null,
    nodeName: () => null,
    imageBytes: async (index) => {
      const level = images[index];
      return level ? { bytes: fakeEncode(level), mime: 'image/png' } : null;
    },
  };
}

/** Runs the translation over a one-material, one-group document. */
async function translate(
  material: NonNullable<GltfJson['materials']>[number],
  images: ImageLevel[] = [],
  extra: Partial<GltfJson> = {},
): Promise<ImportMaterialPlan> {
  const json: GltfJson = {
    materials: [material],
    textures: images.map((_, i) => ({ source: i })),
    images: images.map(() => ({ mimeType: 'image/png' })),
    ...extra,
  };
  const model: LoadedModel = {
    scene: new THREE.Group(),
    fileName: 'model.glb',
    source: makeSource(json, images),
  };
  return planImportMaterials(model, planOf([group('g0', 0)]), CODECS);
}

/** The single generated image behind a texture spec key. */
function pixelsOf(plan: ImportMaterialPlan, key: string | undefined): ImageLevel {
  const spec = plan.textures.find((t) => t.key === key);
  if (!spec) throw new Error(`no texture spec for ${key}`);
  return fakeDecode(spec.bytes);
}

describe('base colour', () => {
  it('bakes a non-white baseColorFactor in LINEAR space, not byte space', async () => {
    // KSA's <PbrMaterial> has no colour multiplier (PbrMaterialReference.cs), so a tint MUST
    // become pixels. Doing it on sRGB bytes would darken wrongly: 0.5 × byte 128 = 64, but
    // half the LIGHT of a mid-grey re-encodes to 92.
    const plan = await translate(
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.5, 0.5, 0.5, 1],
          baseColorTexture: { index: 0 },
        },
      },
      [solid(128, 128, 128)],
    );
    const baked = pixelsOf(plan, plan.materials[0]!.baseColorTextureKey);
    expect(baked.rgba[0]).toBe(92);
    expect(baked.rgba[0]).not.toBe(64);
    expect(linearToSrgbByte(srgbByteToLinear(128) * 0.5)).toBe(92);
    // Alpha is forced opaque — KSA parts have no per-texel alpha.
    expect(baked.rgba[3]).toBe(255);
    expect(plan.textures[0]!.channel).toBe('baseColor');
  });

  it('ships the image verbatim when the factor is white', async () => {
    const image = solid(10, 20, 30);
    const plan = await translate(
      { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.4], baseColorTexture: { index: 0 } } },
      [image],
    );
    // Factor ALPHA is ignored (KSA is opaque or glass, never per-texel alpha) — still verbatim.
    expect(plan.textures).toHaveLength(1);
    expect([...plan.textures[0]!.bytes]).toEqual([...fakeEncode(image)]);
  });

  it('turns a texture-less factor into an sRGB base colour, not a texture', async () => {
    const plan = await translate({ pbrMetallicRoughness: { baseColorFactor: [0.5, 0, 1, 1] } });
    expect(plan.textures).toHaveLength(0);
    expect(plan.materials[0]!.baseColor).toEqual({
      r: linearToSrgbByte(0.5),
      g: 0,
      b: 255,
    });
  });

  it('bakeBaseColorFactor is a pure per-texel transform', () => {
    const out = bakeBaseColorFactor(solid(255, 255, 255, 1, 1), [1, 0, 0.5]);
    expect([...out.rgba]).toEqual([255, 0, linearToSrgbByte(0.5), 255]);
  });
});

describe('AoRoughMetal packing (R=AO, G=rough, B=metal — "Following GLTF spec")', () => {
  it('scalar-only material emits no ORM texture, just the factors', async () => {
    const plan = await translate({
      pbrMetallicRoughness: { metallicFactor: 0.25, roughnessFactor: 0.75 },
    });
    expect(plan.textures).toHaveLength(0);
    expect(plan.materials[0]).toMatchObject({ metalness: 0.25, roughness: 0.75 });
    expect(plan.materials[0]!.ormTextureKey).toBeUndefined();
  });

  it('metallic-roughness only: G→rough, B→metal, AO defaults to unoccluded', async () => {
    const plan = await translate(
      { pbrMetallicRoughness: { metallicRoughnessTexture: { index: 0 } } },
      [solid(9, 100, 200)],
    );
    const orm = pixelsOf(plan, plan.materials[0]!.ormTextureKey);
    expect(Array.from(orm.rgba.slice(0, 4))).toEqual([255, 100, 200, 255]);
  });

  it('occlusion only: R→AO, rough/metal come from the factors', async () => {
    const plan = await translate(
      {
        occlusionTexture: { index: 0 },
        pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 },
      },
      [solid(60, 7, 7)],
    );
    const orm = pixelsOf(plan, plan.materials[0]!.ormTextureKey);
    expect(Array.from(orm.rgba.slice(0, 4))).toEqual([60, 255, 0, 255]);
  });

  it('reuses ONE image verbatim when occlusion and MR share it and no factor bites', async () => {
    // Blender's "glTF Settings" ORM packing is already exactly KSA's layout.
    const image = solid(200, 100, 50);
    const plan = await translate(
      {
        occlusionTexture: { index: 0 },
        pbrMetallicRoughness: { metallicRoughnessTexture: { index: 0 } },
      },
      [image],
    );
    expect(plan.textures).toHaveLength(1);
    expect(plan.textures[0]!.channel).toBe('orm');
    expect([...plan.textures[0]!.bytes]).toEqual([...fakeEncode(image)]);
  });

  it('repacks when occlusion and MR are different images', async () => {
    const plan = await translate(
      {
        occlusionTexture: { index: 1 },
        pbrMetallicRoughness: { metallicRoughnessTexture: { index: 0 } },
      },
      [solid(0, 120, 240), solid(64, 0, 0)],
    );
    expect(plan.textures).toHaveLength(1);
    const orm = pixelsOf(plan, plan.materials[0]!.ormTextureKey);
    expect(Array.from(orm.rgba.slice(0, 4))).toEqual([64, 120, 240, 255]);
  });

  it('bakes metallic/roughness factors and occlusionStrength into the packed image', async () => {
    const plan = await translate(
      {
        occlusionTexture: { index: 1, strength: 0.5 },
        pbrMetallicRoughness: {
          metallicRoughnessTexture: { index: 0 },
          roughnessFactor: 0.5,
          metallicFactor: 0.25,
        },
      },
      [solid(0, 200, 200), solid(100, 0, 0)],
    );
    const orm = pixelsOf(plan, plan.materials[0]!.ormTextureKey);
    // AO: 255 + 0.5*(100-255) = 177.5 → 178. Rough: 200*0.5 = 100. Metal: 200*0.25 = 50.
    expect(Array.from(orm.rgba.slice(0, 4))).toEqual([178, 100, 50, 255]);
  });

  it('the shared-image fast path is NOT taken when a factor would change the pixels', async () => {
    const image = solid(200, 100, 50);
    const plan = await translate(
      {
        occlusionTexture: { index: 0 },
        pbrMetallicRoughness: { metallicRoughnessTexture: { index: 0 }, metallicFactor: 0.5 },
      },
      [image],
    );
    const orm = pixelsOf(plan, plan.materials[0]!.ormTextureKey);
    expect(Array.from(orm.rgba.slice(0, 4))).toEqual([200, 100, 25, 255]);
  });
});

describe('normal', () => {
  it('carries the scale as strength and does NOT pre-transform the pixels', async () => {
    // prepareChannelImage(..., 'normal', strength) owns KSA's X-flip + the strength bake at
    // encode time, and modExport re-derives strength ≠ 1 from this same source image.
    const image = solid(120, 130, 255);
    const plan = await translate({ normalTexture: { index: 0, scale: 2.5 } }, [image]);
    expect(plan.materials[0]!.normalStrength).toBe(2.5);
    const spec = plan.textures.find((t) => t.key === plan.materials[0]!.normalTextureKey)!;
    expect(spec.channel).toBe('normal');
    expect([...spec.bytes]).toEqual([...fakeEncode(image)]);
  });

  it('defaults the strength to 1', async () => {
    const plan = await translate({ normalTexture: { index: 0 } }, [solid(128, 128, 255)]);
    expect(plan.materials[0]!.normalStrength).toBe(1);
  });
});

describe('emissive', () => {
  it('factor-only builds a small solid glow bitmap', async () => {
    const plan = await translate({ emissiveFactor: [1, 0, 0] });
    const glow = fakeDecode(plan.materials[0]!.glowPng!);
    expect(glow.width).toBe(4);
    // rgb = the emissive colour; a = its linear luminance (Rec.709 red = 0.2126).
    expect(Array.from(glow.rgba.slice(0, 4))).toEqual([255, 0, 0, Math.round(0.2126 * 255)]);
    expect(plan.materials[0]!.glowColor).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('multiplies an emissive texture by the factor per texel, with luminance as the mask', async () => {
    const plan = await translate({ emissiveFactor: [0, 1, 0], emissiveTexture: { index: 0 } }, [
      solid(255, 128, 0),
    ]);
    const glow = fakeDecode(plan.materials[0]!.glowPng!);
    const greenLinear = srgbByteToLinear(128);
    expect(Array.from(glow.rgba.slice(0, 3))).toEqual([0, linearToSrgbByte(greenLinear), 0]);
    expect(glow.rgba[3]).toBe(Math.round(0.7152 * greenLinear * 255));
    expect(glow.width).toBe(2);
  });

  it('applies KHR_materials_emissive_strength as a multiplier on the factor', async () => {
    const plan = await translate({
      emissiveFactor: [0.1, 0.1, 0.1],
      extensions: { KHR_materials_emissive_strength: { emissiveStrength: 5 } },
    });
    const glow = fakeDecode(plan.materials[0]!.glowPng!);
    expect(Array.from(glow.rgba.slice(0, 3))).toEqual([
      linearToSrgbByte(0.5),
      linearToSrgbByte(0.5),
      linearToSrgbByte(0.5),
    ]);
  });

  it('a black emissive factor emits no glow at all, even with a texture', async () => {
    const plan = await translate({ emissiveTexture: { index: 0 } }, [solid(255, 255, 255)]);
    expect(plan.materials[0]!.glowPng).toBeUndefined();
  });
});

describe('alpha', () => {
  it('marks alphaMode BLEND transparent and leaves MASK/OPAQUE opaque', async () => {
    expect((await translate({ alphaMode: 'BLEND' })).materials[0]!.transparent).toBe(true);
    expect((await translate({ alphaMode: 'MASK' })).materials[0]!.transparent).toBeUndefined();
    expect((await translate({})).materials[0]!.transparent).toBeUndefined();
  });
});

describe('dedup', () => {
  it('one image + one channel + one factor set → ONE texture spec', async () => {
    // Two materials, both tinting the same image the same way.
    const image = solid(128, 128, 128);
    const json: GltfJson = {
      materials: [
        {
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0 },
            baseColorFactor: [0.5, 0.5, 0.5, 1],
          },
        },
        {
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0 },
            baseColorFactor: [0.5, 0.5, 0.5, 1],
          },
        },
      ],
      textures: [{ source: 0 }],
      images: [{}],
    };
    const model: LoadedModel = {
      scene: new THREE.Group(),
      fileName: 'm.glb',
      source: makeSource(json, [image]),
    };
    const plan = await planImportMaterials(model, planOf([group('a', 0), group('b', 1)]), CODECS);
    expect(plan.textures).toHaveLength(1);
    expect(plan.materials).toHaveLength(2);
    expect(plan.materials[0]!.baseColorTextureKey).toBe(plan.materials[1]!.baseColorTextureKey);
  });

  it('the SAME image used for two channels → TWO specs (each channel encodes differently)', async () => {
    const plan = await translate(
      { pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, normalTexture: { index: 0 } },
      [solid(128, 128, 255)],
    );
    expect(plan.textures).toHaveLength(2);
    expect(plan.textures.map((t) => t.channel).sort()).toEqual(['baseColor', 'normal']);
    // Same source bytes, different channel ⇒ different key.
    expect(plan.textures[0]!.key).not.toBe(plan.textures[1]!.key);
    expect([...plan.textures[0]!.bytes]).toEqual([...plan.textures[1]!.bytes]);
  });

  it('a differently-tinted copy of one image yields a SECOND spec', async () => {
    const image = solid(128, 128, 128);
    const json: GltfJson = {
      materials: [
        {
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0 },
            baseColorFactor: [0.5, 0.5, 0.5, 1],
          },
        },
        {
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0 },
            baseColorFactor: [0.25, 0.25, 0.25, 1],
          },
        },
      ],
      textures: [{ source: 0 }],
      images: [{}],
    };
    const model: LoadedModel = {
      scene: new THREE.Group(),
      fileName: 'm.glb',
      source: makeSource(json, [image]),
    };
    const plan = await planImportMaterials(model, planOf([group('a', 0), group('b', 1)]), CODECS);
    expect(plan.textures).toHaveLength(2);
  });

  it('two groups on the same glTF material share ONE material spec', async () => {
    const json: GltfJson = { materials: [{ pbrMetallicRoughness: { metallicFactor: 0.5 } }] };
    const model: LoadedModel = {
      scene: new THREE.Group(),
      fileName: 'm.glb',
      source: makeSource(json, []),
    };
    const plan = await planImportMaterials(model, planOf([group('a', 0), group('b', 0)]), CODECS);
    expect(plan.materials).toHaveLength(1);
    expect(plan.materialKeyByGroup.get('a')).toBe(plan.materialKeyByGroup.get('b'));
  });

  it('a group with no glTF material gets the glTF default material (white, metal 1, rough 1)', async () => {
    const model: LoadedModel = {
      scene: new THREE.Group(),
      fileName: 'm.glb',
      source: makeSource({}, []),
    };
    const plan = await planImportMaterials(model, planOf([group('a', null)]), CODECS);
    expect(plan.materials).toHaveLength(1);
    expect(plan.materials[0]).toMatchObject({
      metalness: 1,
      roughness: 1,
      baseColor: { r: 255, g: 255, b: 255 },
    });
  });
});

describe('hashBytes', () => {
  it('is deterministic, order-sensitive and length-sensitive', () => {
    expect(hashBytes(new Uint8Array([1, 2, 3]))).toBe(hashBytes(new Uint8Array([1, 2, 3])));
    expect(hashBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashBytes(new Uint8Array([3, 2, 1])));
    expect(hashBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashBytes(new Uint8Array([1, 2, 3, 0])));
    expect(hashBytes(new Uint8Array([1]))).toMatch(/^[0-9a-f]{16}$/);
  });

  it('matches the FNV-1a-64 reference value for "a"', () => {
    // FNV-1a 64 of the single byte 0x61 is 0xaf63dc4c8601ec8c.
    expect(hashBytes(new Uint8Array([0x61]))).toBe('af63dc4c8601ec8c');
  });
});

describe('no glTF source', () => {
  it('contributes nothing for a programmatically built scene', async () => {
    const plan = await planImportMaterials(
      { scene: new THREE.Group(), fileName: 'm.glb' },
      planOf([group('a', null)]),
      CODECS,
    );
    expect(plan.materials).toHaveLength(0);
    expect(plan.textures).toHaveLength(0);
    expect(plan.materialKeyByGroup.size).toBe(0);
  });
});
