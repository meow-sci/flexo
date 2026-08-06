import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `clonePartWithFreshAssets` — the safety-critical primitive behind duplicate-part and
 * import-as-new-parts (`plans/MULTI_PART_PLAN.md` §P2.04).
 *
 * The contract under test is invariant **I4**: custom-asset blob keys are
 * `pa:<projectId>:<kind>:<assetId>` with NO part segment, and KSA registers SubPart ids and GLB
 * mesh names globally per mod — so five id families must be re-minted, every reference to them
 * rewritten, and their binaries copied under the new keys. Everything else is a per-part
 * namespace (**I3**) and must come through byte-identical.
 *
 * The blob store is the one edge that needs a stand-in: `assetDb` is IndexedDB, which happy-dom
 * has none of. Replaced with an in-memory key→Blob map, the same `vi.mock` shape
 * `editorStore.test.ts` / `projectStore.test.ts` use — and with the REAL key format, so a copy
 * landing under the wrong project or the wrong asset id shows up in the key set.
 */
const blobs = new Map<string, Blob>();
vi.mock('./assetDb', () => ({
  assetKeys: {
    textureSource: (p: string, id: string) => `pa:${p}:tex-src:${id}`,
    textureKtx2: (p: string, id: string) => `pa:${p}:tex-ktx2:${id}`,
    meshGlb: (p: string, id: string) => `pa:${p}:mesh-glb:${id}`,
    importGlb: (p: string, id: string) => `pa:${p}:import-glb:${id}`,
    emissivePaint: (p: string, id: string) => `pa:${p}:emissive-paint:${id}`,
  },
  getAsset: async (key: string) => blobs.get(key),
  putAsset: async (key: string, data: Blob | Uint8Array, type = 'application/octet-stream') => {
    blobs.set(key, data instanceof Blob ? data : new Blob([data.slice()], { type }));
  },
  deleteAsset: async (key: string) => {
    blobs.delete(key);
  },
}));

import {
  DEFAULT_LAYER_ID,
  IVA_SEAT_LAYER_ID,
  KITTEN_LAYER_ID,
  createEmptyPart,
  createPartLight,
  createSubPartGameData,
  createTank,
  identityTransform,
  materialTextureIds,
  type CustomMesh,
  type EditingPart,
} from '../ksa/types';
import { clonePartWithFreshAssets } from './partClone';

const PROJECT = 'p_clone000001';

/** A blob whose bytes spell `text`, so a copy is comparable by CONTENT, not by identity. */
function put(kind: string, id: string, text: string): void {
  blobs.set(key(kind, id), new Blob([text], { type: 'application/octet-stream' }));
}

function key(kind: string, id: string): string {
  return `pa:${PROJECT}:${kind}:${id}`;
}

/** The stored bytes as text, or null when nothing is stored under that key. */
async function stored(kind: string, id: string): Promise<string | null> {
  const blob = blobs.get(key(kind, id));
  return blob ? await blob.text() : null;
}

/** Every key of one blob tier, sorted — for counting copies. */
function keysOfKind(kind: string): string[] {
  return [...blobs.keys()].filter((k) => k.startsWith(`pa:${PROJECT}:${kind}:`)).sort();
}

// ── the maximal source part ──────────────────────────────────────────────────
//
// One of everything the five remaps touch, PLUS a built-in (`Core.TrussBarA`) wearing each of
// the same reference kinds: a template this clone does not own must come through untouched, so
// every "did it change?" assertion has a matching "did it leave the rest alone?" twin.

const TEXTURES = ['Base', 'Metal', 'Rough', 'AO', 'ORM', 'Norm'] as const;

function importedMesh(id: string, name: string, subPartId: string): CustomMesh {
  return {
    id,
    name,
    subPartId,
    imported: {
      importId: 'imp_batch',
      // `meshName == subPartId` holds for an ORIGINAL import — the equality a clone breaks.
      meshName: subPartId,
      sourceFile: 'pods.glb',
      sourceNode: name.replace(' ', ''),
      sourceMaterial: 'Metal',
      triangles: 128,
      vertices: 66,
    },
    faceTextures: {},
  };
}

function maximalPart(): EditingPart {
  const part = createEmptyPart();
  part.partId = 'src_part';
  part.editorTags = ['Structural'];
  part.layers.push({ id: 'layer1', name: 'Hull' });

  for (const name of TEXTURES) {
    part.customTextures.push({
      id: `tex_${name.toLowerCase()}`,
      name,
      width: 4,
      height: 4,
      channel: 'baseColor',
    });
  }
  // ALL SIX channel slots mapped, so a channel the remap forgets cannot hide behind a sibling.
  part.customMaterials.push({
    id: 'mat_hull',
    name: 'Hull',
    baseColor: { kind: 'map', textureId: 'tex_base' },
    metalness: { kind: 'map', textureId: 'tex_metal' },
    roughness: { kind: 'map', textureId: 'tex_rough' },
    occlusion: { textureId: 'tex_ao' },
    ormPacked: { textureId: 'tex_orm' },
    normal: { textureId: 'tex_norm', strength: 1.5 },
  });

  part.customMeshes.push(
    {
      id: 'mesh_panel',
      name: 'Panel',
      subPartId: 'flexo_Panel_src',
      primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
      materialId: 'mat_hull',
      faceTextures: {
        right: { textureId: 'tex_base', uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } },
        top: { textureId: 'tex_orm', uvScale: { x: 2, y: 2 }, uvOffset: { x: 0, y: 0 } },
      },
      emissive: { shape: 'painted', color: { r: 0, g: 255, b: 128 }, strength: 0.3, coverage: 1 },
    },
    // TWO meshes cut from ONE dropped file: they share a batch id, and must keep sharing it.
    importedMesh('mesh_poda', 'Pod A', 'flexo_PodA_src'),
    importedMesh('mesh_podb', 'Pod B', 'flexo_PodB_src'),
    {
      id: 'mesh_visor',
      name: 'Visor',
      subPartId: 'flexo_hunter_visor_src',
      kitten: {
        kind: 'hunter',
        specKey: 'visor',
        diffuse: 'Textures/Characters/Kitten_Visor.ktx2',
        transparent: true,
      },
      faceTextures: {},
    },
  );

  for (const [instanceId, templateId] of [
    ['panel_1', 'flexo_Panel_src'],
    ['poda_1', 'flexo_PodA_src'],
    ['podb_1', 'flexo_PodB_src'],
    ['visor_1', 'flexo_hunter_visor_src'],
    ['trussbara_1', 'Core.TrussBarA'],
  ]) {
    part.placements.push({
      instanceId,
      subPartTemplateId: templateId,
      layerId: 'layer1',
      ...identityTransform(),
    });
  }

  part.connectors.push({
    id: '_connector1',
    flags: ['Internal'],
    capabilities: [],
    siblingIds: [],
    layerId: 'layer1',
    ...identityTransform(),
  });

  // A custom-owned, a built-in-owned and a part-level one, in that order, for both kinds.
  for (const [id, owner] of [
    ['_collider1', 'flexo_Panel_src'],
    ['_collider2', 'Core.TrussBarA'],
    ['_collider3', null],
  ] as [string, string | null][]) {
    part.colliders.push({
      id,
      shape: 'Box',
      ownerTemplateId: owner,
      layerId: DEFAULT_LAYER_ID,
      ...identityTransform(),
    });
  }
  part.lights.push(
    createPartLight('flexo_Panel_src', '_light1'),
    createPartLight('Core.TrussBarA', '_light2'),
    createPartLight(null, '_light3'),
  );

  part.ivaSeats.push({
    id: '_seat1',
    ksaId: 'SeatA',
    layerId: IVA_SEAT_LAYER_ID,
    ...identityTransform(),
  });
  part.kittens.push({
    id: 'kitten_1',
    kind: 'hunter',
    layerId: KITTEN_LAYER_ID,
    ...identityTransform(),
  });

  part.internalFlags = { flexo_Panel_src: true, 'Core.TrussBarA': false };

  part.subPartGameData.push(
    {
      ...createSubPartGameData('flexo_Panel_src'),
      tanks: [createTank()],
      // MODULE template ids scoped to PLACEMENT instance ids — neither family is re-minted.
      rockets: [
        {
          id: 'Engine',
          core: { id: 'ThrustChamber', subPartInstanceId: 'panel_1' },
          nozzles: [{ id: 'Nozzle', subPartInstanceId: 'poda_1' }],
        },
      ],
    },
    { ...createSubPartGameData('Core.TrussBarA'), tanks: [createTank()] },
  );

  part.gameData.displayName = 'Source';
  part.gameData.consumerFeedWiring.push({
    consumerId: 'ThrustChamber',
    subPartInstanceId: 'panel_1',
    feeds: [{ kind: 'connector', connectorId: '_connector1' }],
  });
  part.gameData.rockets.push({
    id: 'GasGenerator',
    core: { id: 'GasGeneratorChamber', subPartInstanceId: 'podb_1' },
    nozzles: [{ id: 'TurbineExhaustNozzle', subPartInstanceId: null }],
  });
  part.gameData.rocketControllers.push({
    id: 'LR91-AJ-3',
    kind: 'engine',
    rocketRefs: [{ id: 'Engine', subPartInstanceId: 'panel_1' }],
    controlMapFlags: null,
  });
  part.gameData.gimbals.push({
    subPartInstanceId: 'poda_1',
    maxAngleYDeg: 5,
    maxAngleZDeg: 5,
    constrainToCircle: true,
  });

  part.animations.push({
    id: 'anim_src',
    name: 'Deploy',
    durationSec: 2,
    mode: 'deployRetract',
    joints: [{ id: 'joint_a', name: 'Hinge', parentJointId: null, memberInstanceIds: ['panel_1'] }],
    keyframes: [
      { id: 'kf0', timeSec: 0, poses: { joint_a: identityTransform() } },
      { id: 'kf1', timeSec: 2, poses: { joint_a: identityTransform() } },
    ],
    restKeyframeId: 'kf1',
    solarTracking: null,
  });

  part.customReactions.push({
    id: 'MyKerolox_2.6',
    name: 'Custom Kerolox',
    category: 'Bipropellant',
    reactants: [{ phaseId: 'Kerosene(l)', massShare: 1 }],
    lut: [{ lnPressure: 9.5, temperatureK: 3200, gamma: 1.22, molarMassGPerMol: 22.4 }],
    burnRate: null,
    minimumBurnPressurePa: null,
    maxStablePressurePa: null,
    exhaustCondensedFraction: null,
  });

  return part;
}

/**
 * The binaries behind the source. Deliberately PARTIAL: `Base` has both tiers, `Metal` only its
 * source image, and the other four textures have nothing at all — a tier that was never written
 * must be skipped silently, never written blank (the container-gate tolerance).
 */
function seedBlobs(): void {
  put('tex-src', 'tex_base', 'base-src');
  put('tex-ktx2', 'tex_base', 'base-ktx2');
  put('tex-src', 'tex_metal', 'metal-src');
  put('import-glb', 'imp_batch', 'batch-glb');
  put('emissive-paint', 'mesh_panel', 'panel-glow');
}

// ── lookups that survive the re-mint (ids change, NAMES don't) ───────────────

function texId(part: EditingPart, name: string): string {
  return part.customTextures.find((t) => t.name === name)!.id;
}

function meshOf(part: EditingPart, name: string): CustomMesh {
  return part.customMeshes.find((m) => m.name === name)!;
}

function templateOf(part: EditingPart, instanceId: string): string {
  return part.placements.find((p) => p.instanceId === instanceId)!.subPartTemplateId;
}

/** The five re-minted id families, in the order the P2.04 table lists them. */
function families(part: EditingPart) {
  return {
    textures: part.customTextures.map((t) => t.id),
    materials: part.customMaterials.map((m) => m.id),
    meshes: part.customMeshes.map((m) => m.id),
    templates: part.customMeshes.map((m) => m.subPartId),
    imports: part.customMeshes.flatMap((m) => (m.imported ? [m.imported.importId] : [])),
  };
}

function allFamilyIds(part: EditingPart): Set<string> {
  return new Set(Object.values(families(part)).flat());
}

/** Every `subPartInstanceId` value in a document, in traversal order — the I3 witness. */
function instanceRefs(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) instanceRefs(item, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'subPartInstanceId' && typeof v === 'string') out.push(v);
      else instanceRefs(v, out);
    }
  }
  return out;
}

let source: EditingPart;
/** A deep snapshot of the source taken BEFORE the clone — the "did we mutate it?" oracle. */
let before: EditingPart;
let clone: EditingPart;

beforeEach(async () => {
  blobs.clear();
  seedBlobs();
  source = maximalPart();
  before = structuredClone(source);
  clone = await clonePartWithFreshAssets(source, PROJECT);
});

describe('clonePartWithFreshAssets — (a) fresh identity for all five families', () => {
  it('re-mints every id in every family, with zero overlap with the source', () => {
    const src = families(source);
    const dst = families(clone);
    const sourceIds = allFamilyIds(source);

    for (const family of Object.keys(src) as (keyof typeof src)[]) {
      // Same cardinality: the remap is TOTAL, not "the first one of each kind".
      expect(dst[family]).toHaveLength(src[family].length);
      for (const id of dst[family]) expect(sourceIds.has(id)).toBe(false);
    }

    // Distinct within each family too — a remap that handed every mesh the same fresh id
    // would satisfy "no overlap" and still be catastrophic.
    expect(new Set(dst.textures).size).toBe(6);
    expect(new Set(dst.materials).size).toBe(1);
    expect(new Set(dst.meshes).size).toBe(4);
    expect(new Set(dst.templates).size).toBe(4);
    // …except the import BATCH, which is one id per FILE: both pods still share exactly one,
    // so the single copy of that geometry GLB stays a single copy.
    expect(dst.imports).toHaveLength(2);
    expect(new Set(dst.imports).size).toBe(1);
  });

  it('mints ids in the authoring generators’ shapes', () => {
    for (const id of families(clone).textures) expect(id).toMatch(/^tex_[0-9a-f]{8}$/);
    expect(families(clone).materials[0]).toMatch(/^mat_[0-9a-f]{8}$/);
    for (const id of families(clone).meshes) expect(id).toMatch(/^mesh_[0-9a-f]{8}$/);
    expect(families(clone).imports[0]).toMatch(/^imp_[0-9a-f]{8}$/);
    // Template ids come from the SAME generators authoring uses: `flexo_` is mandatory (KSA
    // registers mesh names globally), primitives/imports name the mesh, kittens name the source.
    expect(meshOf(clone, 'Panel').subPartId).toMatch(/^flexo_Panel_[0-9a-f]{8}$/);
    expect(meshOf(clone, 'Pod A').subPartId).toMatch(/^flexo_Pod_A_[0-9a-f]{8}$/);
    expect(meshOf(clone, 'Visor').subPartId).toMatch(/^flexo_hunter_visor_[0-9a-f]{8}$/);
  });

  it('gives a SECOND clone of the same source another disjoint id set', async () => {
    const second = await clonePartWithFreshAssets(source, PROJECT);
    const first = allFamilyIds(clone);
    for (const id of allFamilyIds(second)) expect(first.has(id)).toBe(false);
  });

  it('never mutates the source document', () => {
    expect(source).toEqual(before);
  });
});

describe('clonePartWithFreshAssets — (b) every reference site from the P2.04 table', () => {
  it('rewrites the texture references: faceTextures + all six material channels', () => {
    const panel = meshOf(clone, 'Panel');
    expect(panel.faceTextures.right).toEqual({
      textureId: texId(clone, 'Base'),
      uvScale: { x: 1, y: 1 },
      uvOffset: { x: 0, y: 0 },
    });
    expect(panel.faceTextures.top?.textureId).toBe(texId(clone, 'ORM'));

    const hull = clone.customMaterials[0];
    expect(hull.baseColor).toEqual({ kind: 'map', textureId: texId(clone, 'Base') });
    expect(hull.metalness).toEqual({ kind: 'map', textureId: texId(clone, 'Metal') });
    expect(hull.roughness).toEqual({ kind: 'map', textureId: texId(clone, 'Rough') });
    expect(hull.occlusion).toEqual({ textureId: texId(clone, 'AO') });
    expect(hull.ormPacked).toEqual({ textureId: texId(clone, 'ORM') });
    expect(hull.normal).toEqual({ textureId: texId(clone, 'Norm'), strength: 1.5 });
    // Enumerated through the SAME helper the asset GC uses: not one slot still points at the
    // source's library (a channel the remap forgets would silently share the original's pixels).
    expect(materialTextureIds(hull)).toHaveLength(6);
    const sourceTextures = new Set(source.customTextures.map((t) => t.id));
    for (const id of materialTextureIds(hull)) expect(sourceTextures.has(id)).toBe(false);
  });

  it('rewrites the material reference on the mesh that carries one', () => {
    expect(meshOf(clone, 'Panel').materialId).toBe(clone.customMaterials[0].id);
    expect(meshOf(clone, 'Panel').materialId).not.toBe('mat_hull');
    // A kitten submesh carries its own PBR set and never names a material.
    expect(meshOf(clone, 'Visor').materialId).toBeUndefined();
  });

  it('rewrites the import batch id on every mesh cut from that file', () => {
    const podA = meshOf(clone, 'Pod A');
    const podB = meshOf(clone, 'Pod B');
    expect(podA.imported?.importId).not.toBe('imp_batch');
    expect(podB.imported?.importId).toBe(podA.imported?.importId);
  });

  it('repoints placements, SubPartGameData, internalFlags, colliders and lights', () => {
    const panel = meshOf(clone, 'Panel').subPartId;
    const podA = meshOf(clone, 'Pod A').subPartId;
    const podB = meshOf(clone, 'Pod B').subPartId;
    const visor = meshOf(clone, 'Visor').subPartId;

    expect(templateOf(clone, 'panel_1')).toBe(panel);
    expect(templateOf(clone, 'poda_1')).toBe(podA);
    expect(templateOf(clone, 'podb_1')).toBe(podB);
    expect(templateOf(clone, 'visor_1')).toBe(visor);
    // A placement on a BUILT-IN catalog template is content this clone does not own.
    expect(templateOf(clone, 'trussbara_1')).toBe('Core.TrussBarA');

    expect(clone.subPartGameData.map((s) => s.subPartTemplateId)).toEqual([
      panel,
      'Core.TrussBarA',
    ]);
    expect(clone.internalFlags).toEqual({ [panel]: true, 'Core.TrussBarA': false });
    expect(clone.colliders.map((c) => c.ownerTemplateId)).toEqual([panel, 'Core.TrussBarA', null]);
    expect(clone.lights.map((l) => l.ownerTemplateId)).toEqual([panel, 'Core.TrussBarA', null]);
  });

  it('leaves no source asset id anywhere in the cloned document', () => {
    // The ONE deliberate exception is `imported.meshName` (see the meshName case below), so it
    // is blanked before the scan rather than excused after it.
    const scrubbed = structuredClone(clone);
    for (const mesh of scrubbed.customMeshes) {
      if (mesh.imported) mesh.imported.meshName = '';
    }
    const json = JSON.stringify(scrubbed);
    for (const id of allFamilyIds(source)) expect(json).not.toContain(id);
  });
});

describe('clonePartWithFreshAssets — (c)/(d) the binaries', () => {
  it('copies every backed tier under the NEW keys and leaves the originals untouched', async () => {
    const base = texId(clone, 'Base');
    const metal = texId(clone, 'Metal');
    const batch = meshOf(clone, 'Pod A').imported!.importId;

    expect(await stored('tex-src', base)).toBe('base-src');
    expect(await stored('tex-ktx2', base)).toBe('base-ktx2');
    expect(await stored('tex-src', metal)).toBe('metal-src');
    expect(await stored('import-glb', batch)).toBe('batch-glb');

    // A clone COPIES: the source's bytes are still there, under the source's keys.
    expect(await stored('tex-src', 'tex_base')).toBe('base-src');
    expect(await stored('tex-ktx2', 'tex_base')).toBe('base-ktx2');
    expect(await stored('tex-src', 'tex_metal')).toBe('metal-src');
    expect(await stored('import-glb', 'imp_batch')).toBe('batch-glb');

    // A tier the source never wrote is skipped silently, never written blank.
    expect(await stored('tex-ktx2', metal)).toBeNull();
    for (const name of ['Rough', 'AO', 'ORM', 'Norm']) {
      expect(await stored('tex-src', texId(clone, name))).toBeNull();
      expect(await stored('tex-ktx2', texId(clone, name))).toBeNull();
    }

    // Exactly the five seeded blobs plus their five copies — nothing extra, nothing missing.
    expect(blobs.size).toBe(10);
    // …and ONE copy of the shared import batch, not one per mesh cut from it.
    expect(keysOfKind('import-glb')).toHaveLength(2);
  });

  it('carries the painted-glow bitmap to the new MESH id', async () => {
    const panel = meshOf(clone, 'Panel');
    expect(panel.id).not.toBe('mesh_panel');
    expect(await stored('emissive-paint', panel.id)).toBe('panel-glow');
    expect(await stored('emissive-paint', 'mesh_panel')).toBe('panel-glow');
    // Keyed by the MESH id — not by its template id, and not by anything else.
    expect(await stored('emissive-paint', panel.subPartId)).toBeNull();
    expect(keysOfKind('emissive-paint')).toEqual(
      [key('emissive-paint', 'mesh_panel'), key('emissive-paint', panel.id)].sort(),
    );
    // A mesh with no painted glow gets no bitmap.
    expect(await stored('emissive-paint', meshOf(clone, 'Pod A').id)).toBeNull();
  });

  it('writes nothing at all for a part with no custom assets', async () => {
    blobs.clear();
    const plain = createEmptyPart();
    plain.placements.push({
      instanceId: 'trussbara_1',
      subPartTemplateId: 'Core.TrussBarA',
      layerId: DEFAULT_LAYER_ID,
      ...identityTransform(),
    });
    const copy = await clonePartWithFreshAssets(plain, PROJECT);
    expect(copy).toEqual(plain);
    expect(copy).not.toBe(plain);
    expect(blobs.size).toBe(0);
  });
});

describe('clonePartWithFreshAssets — (e) imported meshName is deliberately NOT re-minted', () => {
  it('keeps every meshName byte-identical to the source', () => {
    expect(meshOf(clone, 'Pod A').imported?.meshName).toBe('flexo_PodA_src');
    expect(meshOf(clone, 'Pod B').imported?.meshName).toBe('flexo_PodB_src');
    // It names the geometry INSIDE the copied GLB, which is a byte copy still spelling the
    // original name — so the documented `meshName == subPartId` equality breaks ON PURPOSE.
    for (const mesh of clone.customMeshes.filter((m) => m.imported)) {
      expect(mesh.imported!.meshName).not.toBe(mesh.subPartId);
    }
    // Everything else on the source descriptor rides along verbatim; only the batch id moved.
    expect(meshOf(clone, 'Pod A').imported).toEqual({
      ...meshOf(source, 'Pod A').imported,
      importId: meshOf(clone, 'Pod A').imported!.importId,
    });
  });
});

describe('clonePartWithFreshAssets — (f)/(g)/(h) what stays put', () => {
  it('leaves every per-part entity id alone (I3 — ids are per-part namespaces)', () => {
    expect(clone.placements.map((p) => p.instanceId)).toEqual([
      'panel_1',
      'poda_1',
      'podb_1',
      'visor_1',
      'trussbara_1',
    ]);
    expect(clone.connectors.map((c) => c.id)).toEqual(['_connector1']);
    expect(clone.colliders.map((c) => c.id)).toEqual(['_collider1', '_collider2', '_collider3']);
    expect(clone.lights.map((l) => l.id)).toEqual(['_light1', '_light2', '_light3']);
    expect(clone.ivaSeats.map((s) => s.id)).toEqual(['_seat1']);
    expect(clone.kittens.map((k) => k.id)).toEqual(['kitten_1']);
    expect(clone.layers.map((l) => l.id)).toEqual(source.layers.map((l) => l.id));
    expect(clone.animations.map((a) => a.id)).toEqual(['anim_src']);
    expect(clone.animations[0].joints.map((j) => j.id)).toEqual(['joint_a']);
    expect(clone.animations[0].joints[0].memberInstanceIds).toEqual(['panel_1']);
    expect(clone.animations[0].keyframes.map((k) => k.id)).toEqual(['kf0', 'kf1']);
    expect(clone.animations[0].restKeyframeId).toBe('kf1');
    // `partId` is the CALLER's concern (duplicatePart suffixes it), never this primitive's.
    expect(clone.partId).toBe('src_part');
  });

  it('leaves MODULE template ids and every subPartInstanceId alone', () => {
    // `ConsumerFeedWiring.consumerId` and `SubPartIdRef.id` name engine MODULES
    // ("ThrustChamber"-class), never custom-mesh templates.
    expect(clone.gameData.consumerFeedWiring).toEqual([
      {
        consumerId: 'ThrustChamber',
        subPartInstanceId: 'panel_1',
        feeds: [{ kind: 'connector', connectorId: '_connector1' }],
      },
    ]);
    expect(clone.gameData.rockets).toEqual(source.gameData.rockets);
    expect(clone.gameData.rocketControllers).toEqual(source.gameData.rocketControllers);
    expect(clone.gameData.gimbals).toEqual(source.gameData.gimbals);
    const rocket = clone.subPartGameData[0].rockets[0];
    expect(rocket.core).toEqual({ id: 'ThrustChamber', subPartInstanceId: 'panel_1' });
    expect(rocket.nozzles).toEqual([{ id: 'Nozzle', subPartInstanceId: 'poda_1' }]);

    // Exhaustively: every instance-scoped reference in the whole document, unchanged.
    const refs = instanceRefs(clone);
    expect(refs).toEqual(instanceRefs(source));
    expect(refs).toEqual(expect.arrayContaining(['panel_1', 'poda_1', 'podb_1']));
  });

  it('leaves custom reaction ids alone (identical clones dedupe at export)', () => {
    expect(clone.customReactions).toEqual(source.customReactions);
    expect(clone.customReactions.map((r) => r.id)).toEqual(['MyKerolox_2.6']);
  });
});
