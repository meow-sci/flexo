import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYER_ID,
  IVA_SEAT_LAYER_ID,
  KITTEN_LAYER_ID,
  createEmptyPart,
  createCombustor,
  createPartLight,
  createSolidMotor,
  createSubPartGameData,
  createTank,
  identityTransform,
  type EditingPart,
} from '../ksa/types';
import {
  PROJECT_EXPORT_FORMAT,
  PROJECT_EXPORT_VERSION,
  buildProjectExport,
  envelopeToPart,
  hasCustomAssets,
  mergeProjectImport,
  parseProjectImport,
  serializeProjectJson,
} from './projectTransfer';
import { $part, exportHistory, importHistory, importProjectData, undo } from './editorStore';

/** A transform with all three components set to `n` (scale defaults to 1). */
function t(n = 0, scale = 1) {
  return {
    position: { x: n, y: n, z: n },
    rotation: { x: n, y: n, z: n },
    scale: { x: scale, y: scale, z: scale },
  };
}

/**
 * A representative source project: meshes across Default + 2 custom layers, a flagged
 * connector with a decoupler bound to it, a kitten, tanks, and an animation whose joint
 * member + solar-tracking reference specific placements (the references we must remap).
 */
function sourcePart(): EditingPart {
  const p = createEmptyPart();
  p.partId = 'source_part';
  p.layers.push({ id: 'layer1', name: 'Engines' }, { id: 'layer2', name: 'Wings' });
  p.placements.push(
    {
      instanceId: 'trussbara_1',
      subPartTemplateId: 'Core.TrussBarA',
      layerId: DEFAULT_LAYER_ID,
      ...t(1),
    },
    { instanceId: 'trussbara_2', subPartTemplateId: 'Core.TrussBarA', layerId: 'layer1', ...t(2) },
    { instanceId: 'wing_1', subPartTemplateId: 'Core.Wing', layerId: 'layer2', ...t(3) },
  );
  p.connectors.push({
    id: '_connector1',
    flags: ['Internal'],
    capabilities: [],
    siblingIds: [],
    layerId: 'layer1', // an ordinary layer, alongside the SubParts it attaches to
    ...t(0),
  });
  p.kittens.push({ id: 'kitten_1', kind: 'hunter', layerId: KITTEN_LAYER_ID, ...t(0) });
  p.editorTags.push('Structural');
  p.gameData.displayName = 'Source Display';
  p.gameData.customMass = 1234;
  p.gameData.batteries.push({ capacityWh: 5 });
  p.gameData.solarPanels.push({ outputWatts: 80, transform: identityTransform() });
  p.gameData.decoupler = { connectorId: '_connector1', force: 1000 };
  // Engine modules whose SubPart-instance refs (→ trussbara_2) must be remapped on import.
  p.gameData.rocketControllers.push({
    id: 'Engine1',
    kind: 'engine',
    rocketRefs: [{ id: 'Engine', subPartInstanceId: 'trussbara_2' }],
    controlMapFlags: null,
  });
  p.gameData.gimbals.push({
    subPartInstanceId: 'trussbara_2',
    maxAngleYDeg: 3,
    maxAngleZDeg: 3,
    constrainToCircle: false,
  });
  p.customReactions.push({
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
  p.subPartGameData.push({
    ...createSubPartGameData('Core.TrussBarA'),
    tanks: [createTank()],
  });
  p.animations.push({
    id: 'anim_src1',
    name: 'Deploy',
    durationSec: 2,
    mode: 'actuate',
    joints: [{ id: 'joint_a', name: 'Hinge', parentJointId: null, memberInstanceIds: ['wing_1'] }],
    keyframes: [
      { id: 'kf0', timeSec: 0, poses: { joint_a: identityTransform() } },
      { id: 'kf1', timeSec: 2, poses: { joint_a: identityTransform() } },
    ],
    solarTracking: {
      degreesPerSecond: 10,
      subPartInstanceId: 'trussbara_2',
      excludeInstanceIds: ['trussbara_1'],
    },
  });
  return p;
}

/** A part-ified kitten submesh descriptor (pure data — references game assets). */
function kittenMesh(subPartId = 'flexo_hunter_suit_abc') {
  return {
    id: 'mesh_k',
    name: 'Hunter Suit',
    subPartId,
    kitten: {
      kind: 'hunter' as const,
      specKey: 'suit',
      diffuse: 'Textures/Characters/Kitten_EMU_A.ktx2',
    },
    faceTextures: {},
  };
}

/** An imported glTF (binary-backed) custom mesh descriptor. */
function importedMesh() {
  return {
    id: 'mesh_imp',
    name: 'RCS Pod',
    subPartId: 'flexo_RcsPod_Metal_ab12cd34',
    imported: {
      importId: 'imp_1',
      meshName: 'flexo_RcsPod_Metal_ab12cd34',
      sourceFile: 'rcs_pod.glb',
      sourceNode: 'RcsPod',
      sourceMaterial: 'Metal',
      triangles: 128,
      vertices: 66,
    },
    faceTextures: {},
  };
}

/** A primitive (binary-backed) custom mesh descriptor. */
function primitiveMesh() {
  return {
    id: 'mesh_1',
    name: 'M',
    subPartId: 'sp_1',
    primitive: { kind: 'box' as const, params: { width: 1, height: 1, depth: 1 } },
    faceTextures: {},
  };
}

describe('buildProjectExport', () => {
  it('carries kitten meshes, drops primitive meshes + uploaded textures, stamps provenance', () => {
    const src = sourcePart();
    src.customTextures.push({ id: 'tex_1', name: 'T', width: 4, height: 4, channel: 'baseColor' });
    src.customMeshes.push(primitiveMesh(), kittenMesh());
    const env = buildProjectExport(src, 'MyShip');
    expect(env.format).toBe(PROJECT_EXPORT_FORMAT);
    expect(env.version).toBe(PROJECT_EXPORT_VERSION);
    expect(env.projectName).toBe('MyShip');
    expect(env.sourcePartId).toBe('source_part');
    // Only the kitten mesh is carried; the primitive is dropped; textures never exported.
    expect(env.data.customMeshes).toHaveLength(1);
    expect(env.data.customMeshes[0].subPartId).toBe('flexo_hunter_suit_abc');
    expect(env.data.customTextures).toEqual([]);
  });

  it('carries binary-backed meshes + textures when the container opts in', () => {
    const src = sourcePart();
    src.customTextures.push({ id: 'tex_1', name: 'T', width: 4, height: 4, channel: 'baseColor' });
    src.customMeshes.push(primitiveMesh(), kittenMesh());
    const env = buildProjectExport(src, 'MyShip', { includeBinaryBacked: true });
    expect(env.data.customMeshes).toHaveLength(2);
    expect(env.data.customTextures.map((t) => t.id)).toEqual(['tex_1']);
  });

  it('carries custom materials (pure descriptors)', () => {
    const src = sourcePart();
    src.customMaterials.push({
      id: 'mat_1',
      name: 'Red Metal',
      baseColor: { kind: 'color', color: { r: 255, g: 0, b: 0 } },
      metalness: { kind: 'value', value: 1 },
      roughness: { kind: 'value', value: 0.15 },
    });
    const env = buildProjectExport(src, 'MyShip');
    expect(env.data.customMaterials).toHaveLength(1);
    expect(env.data.customMaterials[0].name).toBe('Red Metal');
  });
});

describe('mergeProjectImport with custom materials', () => {
  it('adds materials not already present by id (re-pasting never duplicates)', () => {
    const src = sourcePart();
    src.customMaterials.push({
      id: 'mat_1',
      name: 'Red Metal',
      baseColor: { kind: 'color', color: { r: 255, g: 0, b: 0 } },
      metalness: { kind: 'value', value: 1 },
      roughness: { kind: 'value', value: 0.15 },
    });
    const env = buildProjectExport(src, 'Src');
    const once = mergeProjectImport(createEmptyPart(), env);
    expect(once.part.customMaterials).toHaveLength(1);
    const twice = mergeProjectImport(once.part, env);
    expect(twice.part.customMaterials).toHaveLength(1);
  });
});

describe('hasCustomAssets', () => {
  it('flags uploaded textures and primitive meshes, but not kitten meshes', () => {
    expect(hasCustomAssets(createEmptyPart())).toBe(false);

    const withTex = createEmptyPart();
    withTex.customTextures.push({
      id: 'tex_1',
      name: 'T',
      width: 1,
      height: 1,
      channel: 'baseColor',
    });
    expect(hasCustomAssets(withTex)).toBe(true);

    const withPrimitive = createEmptyPart();
    withPrimitive.customMeshes.push(primitiveMesh());
    expect(hasCustomAssets(withPrimitive)).toBe(true);

    const withKitten = createEmptyPart();
    withKitten.customMeshes.push(kittenMesh());
    expect(hasCustomAssets(withKitten)).toBe(false);
  });

  // An imported model's geometry is a GLB in IndexedDB — nothing in the JSON could rebuild it,
  // so the data-only paths must stay gated off and must not emit the descriptor either.
  it('flags imported glTF meshes and keeps them out of the payload', () => {
    const part = createEmptyPart();
    part.customMeshes.push(importedMesh());
    expect(hasCustomAssets(part)).toBe(true);
    expect(buildProjectExport(part, 'P').data.customMeshes).toEqual([]);

    // Even a hand-edited payload that smuggles one in is dropped by the merge.
    const env = buildProjectExport(createEmptyPart(), 'P');
    env.data.customMeshes = [importedMesh()];
    const merged = mergeProjectImport(createEmptyPart(), env);
    expect(merged.part.customMeshes).toEqual([]);
  });
});

describe('archive imports (binary-backed assets)', () => {
  /** A project with one primitive mesh, one imported mesh, a texture and a mapped material. */
  function binarySource(): EditingPart {
    const p = createEmptyPart();
    p.layers.push({ id: 'layer1', name: 'Hull' });
    p.customTextures.push({
      id: 'tex_1',
      name: 'Panel',
      width: 8,
      height: 8,
      channel: 'baseColor',
    });
    p.customMaterials.push({
      id: 'mat_1',
      name: 'Panel',
      baseColor: { kind: 'map', textureId: 'tex_1' },
      metalness: { kind: 'value', value: 0 },
      roughness: { kind: 'value', value: 0.5 },
    });
    const prim = {
      ...primitiveMesh(),
      materialId: 'mat_1',
      faceTextures: {
        right: { textureId: 'tex_1', uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } },
      },
    };
    p.customMeshes.push(prim, importedMesh());
    p.placements.push(
      { instanceId: 'sp_1_1', subPartTemplateId: 'sp_1', layerId: 'layer1', ...t(0) },
      {
        instanceId: 'rcs_1',
        subPartTemplateId: 'flexo_RcsPod_Metal_ab12cd34',
        layerId: 'layer1',
        ...t(0),
      },
    );
    return p;
  }

  const TABLE = [
    { kind: 'tex-src', id: 'tex_1' },
    { kind: 'mesh-glb', id: 'mesh_1' },
    { kind: 'import-glb', id: 'imp_1' },
  ];

  function archiveEnvelope() {
    const json = serializeProjectJson(
      buildProjectExport(binarySource(), 'Arch', { includeBinaryBacked: true }),
    );
    const parsed = parseProjectImport(json, { binaryAssets: TABLE });
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.env;
  }

  it('drops what needs bytes the container has not brought', () => {
    const json = serializeProjectJson(
      buildProjectExport(binarySource(), 'Arch', { includeBinaryBacked: true }),
    );
    const parsed = parseProjectImport(json, { binaryAssets: null });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // The IMPORTED mesh's GLB is its only copy, so it goes — with its placement, which would
    // otherwise name a template nothing owns.
    expect(parsed.env.data.customMeshes.map((m) => m.id)).toEqual(['mesh_1']);
    expect(parsed.env.data.placements.map((p) => p.subPartTemplateId)).toEqual(['sp_1']);
    // Textures are pixels and nothing else; without them the primitive survives untextured
    // (it rebuilds from its PrimitiveSpec) and every reference to the dropped texture is
    // reset rather than left dangling.
    expect(parsed.env.data.customTextures).toEqual([]);
    expect(parsed.env.data.customMeshes[0].faceTextures).toEqual({});
    expect(parsed.env.data.customMaterials[0].baseColor.kind).toBe('color');
  });

  it('keeps them when the table backs them, with fresh ids everywhere', () => {
    const env = archiveEnvelope();
    expect(env.data.customMeshes).toHaveLength(2);
    expect(env.data.customTextures).toHaveLength(1);

    const adoption = {
      textures: new Map([['tex_1', 'tex_new']]),
      copiedTextures: new Map([['tex_1', 'tex_new']]),
      meshes: new Map([
        ['mesh_1', 'mesh_new1'],
        ['mesh_imp', 'mesh_new2'],
      ]),
      imports: new Map([['imp_1', 'imp_new']]),
      hashes: new Map<string, string>(),
    };
    const { part } = mergeProjectImport(createEmptyPart(), env, { adoption });

    expect(part.customTextures.map((x) => x.id)).toEqual(['tex_new']);
    const prim = part.customMeshes.find((m) => m.primitive)!;
    const imported = part.customMeshes.find((m) => m.imported)!;
    expect(prim.id).toBe('mesh_new1');
    expect(imported.id).toBe('mesh_new2');
    // A fresh SubPart template id per mesh, and the placements follow it.
    expect(prim.subPartId).not.toBe('sp_1');
    expect(part.placements.map((p) => p.subPartTemplateId).sort()).toEqual(
      [prim.subPartId, imported.subPartId].sort(),
    );
    // The import BATCH is re-keyed, but `meshName` — the node name inside the GLB — is not.
    expect(imported.imported?.importId).toBe('imp_new');
    expect(imported.imported?.meshName).toBe('flexo_RcsPod_Metal_ab12cd34');
    // Every texture reference travels through the adoption map.
    expect(prim.faceTextures.right?.textureId).toBe('tex_new');
    const mat = part.customMaterials.find((m) => m.id === 'mat_1')!;
    expect(mat.baseColor).toEqual({ kind: 'map', textureId: 'tex_new' });
  });

  it('reuses a deduped texture id and copies no descriptor for it', () => {
    const env = archiveEnvelope();
    const adoption = {
      textures: new Map([['tex_1', 'tex_existing']]),
      copiedTextures: new Map<string, string>(),
      meshes: new Map([['mesh_1', 'mesh_new1']]),
      imports: new Map<string, string>(),
      hashes: new Map([['tex_existing', 'abc']]),
    };
    const destination = createEmptyPart();
    destination.customTextures.push({
      id: 'tex_existing',
      name: 'Panel',
      width: 8,
      height: 8,
      channel: 'baseColor',
    });
    const { part } = mergeProjectImport(destination, env, { adoption });

    // No second copy of the texture, and the hash learned while deduping is cached.
    expect(part.customTextures.map((x) => x.id)).toEqual(['tex_existing']);
    expect(part.customTextures[0].sha256).toBe('abc');
    expect(part.customMeshes.find((m) => m.primitive)?.faceTextures.right?.textureId).toBe(
      'tex_existing',
    );
    // The IMPORTED mesh had no entry in the plan, so it never lands — its geometry blob was
    // never copied, and a SubPart with no geometry is worse than one that is absent.
    expect(part.customMeshes.filter((m) => m.imported)).toEqual([]);
  });

  it('merges the same archive twice into two independent sets of meshes', () => {
    const env = archiveEnvelope();
    const first = mergeProjectImport(createEmptyPart(), env, {
      adoption: {
        textures: new Map([['tex_1', 'tex_a']]),
        copiedTextures: new Map([['tex_1', 'tex_a']]),
        meshes: new Map([['mesh_1', 'mesh_a']]),
        imports: new Map(),
        hashes: new Map(),
      },
    });
    const second = mergeProjectImport(first.part, env, {
      adoption: {
        textures: new Map([['tex_1', 'tex_a']]), // deduped onto the first import's texture
        copiedTextures: new Map(),
        meshes: new Map([['mesh_1', 'mesh_b']]),
        imports: new Map(),
        hashes: new Map(),
      },
    });
    expect(second.part.customMeshes).toHaveLength(2);
    expect(second.part.customTextures).toHaveLength(1);
    expect(new Set(second.part.customMeshes.map((m) => m.subPartId)).size).toBe(2);
    expect(second.part.placements).toHaveLength(2);
  });
});

describe('mergeProjectImport with a kitten mesh', () => {
  function kittenSource(): EditingPart {
    const p = createEmptyPart();
    p.layers.push({ id: 'layer1', name: 'Hunter Mesh' });
    p.customMeshes.push(kittenMesh());
    p.placements.push({
      instanceId: 'hunter_suit_1',
      subPartTemplateId: 'flexo_hunter_suit_abc',
      layerId: 'layer1',
      ...t(0),
    });
    return p;
  }

  it('restores the kitten mesh under a fresh subPartId and repoints its placement', () => {
    const env = buildProjectExport(kittenSource(), 'K');
    const { part } = mergeProjectImport(createEmptyPart(), env);
    expect(part.customMeshes).toHaveLength(1);
    const mesh = part.customMeshes[0];
    expect(mesh.kitten?.specKey).toBe('suit');
    expect(mesh.subPartId).not.toBe('flexo_hunter_suit_abc'); // fresh, collision-free id
    expect(mesh.subPartId.startsWith('flexo_hunter_suit_')).toBe(true);
    // The placement points at the NEW template id, and nothing references the source's.
    expect(part.placements.some((pl) => pl.subPartTemplateId === mesh.subPartId)).toBe(true);
    expect(part.placements.some((pl) => pl.subPartTemplateId === 'flexo_hunter_suit_abc')).toBe(
      false,
    );
  });

  it('duplicates the kitten mesh under another fresh id on a second import (additive)', () => {
    const env = buildProjectExport(kittenSource(), 'K');
    const once = mergeProjectImport(createEmptyPart(), env).part;
    const twice = mergeProjectImport(once, env).part;
    const ids = twice.customMeshes.map((m) => m.subPartId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2); // distinct ids, no collision
    const kittenPlacements = twice.placements.filter((pl) =>
      pl.subPartTemplateId.startsWith('flexo_hunter_suit_'),
    );
    expect(kittenPlacements).toHaveLength(2);
    expect(kittenPlacements.every((pl) => new Set(ids).has(pl.subPartTemplateId))).toBe(true);
  });
});

describe('mergeProjectImport into an empty project', () => {
  const env = buildProjectExport(sourcePart(), 'MyShip');
  const { part, summary, newLayerIds } = mergeProjectImport(createEmptyPart(), env);

  it('appends all meshes, connectors, kittens, and the animation', () => {
    expect(part.placements).toHaveLength(3);
    expect(part.connectors).toHaveLength(1);
    expect(part.kittens).toHaveLength(1);
    expect(part.animations).toHaveLength(1);
    expect(summary).toEqual({
      meshes: 3,
      connectors: 1,
      colliders: 0,
      ivaSeats: 0,
      lights: 0,
      kittens: 1,
      newLayers: 3,
      animations: 1,
    });
  });

  it('mirrors every source layer (including Default) as a NEW layer, leaving the existing Default empty', () => {
    expect(newLayerIds).toHaveLength(3);
    const names = part.layers
      .filter((l) => newLayerIds.includes(l.id))
      .map((l) => l.name)
      .sort();
    expect(names).toEqual(['Default', 'Engines', 'Wings']);
    // The built-in Default still exists but holds nothing imported.
    expect(part.layers.some((l) => l.id === DEFAULT_LAYER_ID)).toBe(true);
    expect(part.placements.some((p) => p.layerId === DEFAULT_LAYER_ID)).toBe(false);
    // The connector rode its own source layer ("Engines") through the same mapping the
    // placements did — it is an ordinary layer citizen, not a pinned one.
    const engines = part.placements.find((p) => p.instanceId === 'trussbara_2')?.layerId;
    expect(part.connectors[0].layerId).toBe(engines);
    expect(newLayerIds).toContain(part.connectors[0].layerId);
    // Kittens stay pinned to their built-in layer.
    expect(part.kittens[0].layerId).toBe(KITTEN_LAYER_ID);
  });

  it('gives the animation a fresh id and points its member at an existing placement', () => {
    const anim = part.animations[0];
    expect(anim.id).not.toBe('anim_src1');
    const placementIds = new Set(part.placements.map((p) => p.instanceId));
    expect(anim.joints[0].memberInstanceIds.every((id) => placementIds.has(id))).toBe(true);
    expect(anim.solarTracking?.subPartInstanceId).toBe('trussbara_2');
    expect(anim.solarTracking?.excludeInstanceIds).toEqual(['trussbara_1']);
  });

  it('adopts the source Part Id (destination still had the placeholder)', () => {
    expect(part.partId).toBe('source_part');
  });

  it('fills empty GameData fields and remaps the decoupler to the new connector', () => {
    expect(part.gameData.displayName).toBe('Source Display');
    expect(part.gameData.customMass).toBe(1234);
    expect(part.gameData.batteries).toHaveLength(1);
    expect(part.gameData.decoupler?.connectorId).toBe(part.connectors[0].id);
    expect(part.subPartGameData).toHaveLength(1);
    // The custom propellant + engine controller/gimbal are carried in.
    expect(part.customReactions.map((c) => c.id)).toEqual(['MyKerolox_2.6']);
    expect(part.gameData.rocketControllers).toHaveLength(1);
    expect(part.gameData.gimbals).toHaveLength(1);
  });
});

describe('mergeProjectImport into a non-empty project (remapping)', () => {
  it('avoids instanceId collisions and remaps animation references to the new ids', () => {
    const dest = createEmptyPart();
    dest.placements.push({
      instanceId: 'trussbara_1',
      subPartTemplateId: 'Core.TrussBarA',
      layerId: DEFAULT_LAYER_ID,
      ...t(0),
    });
    dest.partId = 'existing_part';
    dest.gameData.displayName = 'Existing';
    dest.gameData.customMass = 99;

    const env = buildProjectExport(sourcePart(), 'MyShip');
    const { part } = mergeProjectImport(dest, env);

    // A destination with a real Part Id keeps it (additive paste never renames).
    expect(part.partId).toBe('existing_part');

    // Existing trussbara_1 + two imported TrussBarA → _2, _3 (no collision).
    const trussIds = part.placements
      .filter((p) => p.subPartTemplateId === 'Core.TrussBarA')
      .map((p) => p.instanceId);
    expect(trussIds).toEqual(['trussbara_1', 'trussbara_2', 'trussbara_3']);

    // Source solar-tracking drove 'trussbara_2' → must now point at the new 'trussbara_3'.
    const anim = part.animations[0];
    expect(anim.joints[0].memberInstanceIds).toEqual(['wing_1']);
    expect(anim.solarTracking?.subPartInstanceId).toBe('trussbara_3');
    expect(anim.solarTracking?.excludeInstanceIds).toEqual(['trussbara_2']);

    // Singular GameData kept; arrays appended; decoupler filled (was null) + remapped.
    expect(part.gameData.displayName).toBe('Existing');
    expect(part.gameData.customMass).toBe(99);
    expect(part.gameData.batteries).toHaveLength(1);
    expect(part.connectors.map((c) => c.id)).toContain(part.gameData.decoupler?.connectorId);

    // Engine controller + gimbal refs that targeted 'trussbara_2' follow it to 'trussbara_3'.
    expect(part.gameData.rocketControllers[0].rocketRefs[0].subPartInstanceId).toBe('trussbara_3');
    expect(part.gameData.gimbals[0].subPartInstanceId).toBe('trussbara_3');
  });

  it('rewrites <ConnectorRef>s inside preserved raw XML onto the regenerated connector ids', () => {
    const src = sourcePart();
    src.gameData.unknownChildren = [
      {
        tag: 'Aligned',
        attrs: {},
        children: [
          { tag: 'ConnectorRef', attrs: { Id: '_connector1' }, children: [] },
          // Dangling ref (no such connector in the export) — left verbatim.
          { tag: 'ConnectorRef', attrs: { Id: '_connector99' }, children: [] },
        ],
      },
    ];
    const dest = createEmptyPart();
    dest.connectors.push({
      id: '_connector1',
      flags: [],
      capabilities: [],
      siblingIds: [],
      layerId: DEFAULT_LAYER_ID,
      ...t(0),
    });
    const { part } = mergeProjectImport(dest, buildProjectExport(src, 'X'));
    // The imported _connector1 renumbered to _connector2; the Aligned ref follows it.
    expect(part.connectors.map((c) => c.id)).toEqual(['_connector1', '_connector2']);
    expect(part.gameData.unknownChildren).toEqual([
      {
        tag: 'Aligned',
        attrs: {},
        children: [
          { tag: 'ConnectorRef', attrs: { Id: '_connector2' }, children: [] },
          { tag: 'ConnectorRef', attrs: { Id: '_connector99' }, children: [] },
        ],
      },
    ]);
    expect(part.gameData.decoupler?.connectorId).toBe('_connector2');
  });

  it('remaps every feed + capability reference on the paste path', () => {
    const src = sourcePart();
    src.connectors[0].capabilities = ['BulkFluid', 'DecouplerJoint'];
    src.gameData.combustors.push({
      ...createCombustor('GasGeneratorChamber'),
      feeds: [
        { kind: 'connector', connectorId: '_connector1' },
        { kind: 'container', containerId: 'Grain', subPartInstanceId: 'wing_1' },
      ],
    });
    src.gameData.solidMotors.push({
      ...createSolidMotor('MotorCore'),
      feeds: [{ kind: 'connector', connectorId: '_connector1' }],
    });
    src.gameData.consumerFeedWiring.push({
      consumerId: 'ThrustChamber',
      subPartInstanceId: 'wing_1',
      feeds: [{ kind: 'connector', connectorId: '_connector1' }],
    });
    src.subPartGameData.push({
      ...createSubPartGameData('Core.Wing'),
      combustors: [{ ...createCombustor('ThrustChamber'), feeds: [{ kind: 'parent' }] }],
      solidMotors: [
        {
          ...createSolidMotor('SubMotor'),
          feeds: [{ kind: 'connector', connectorId: '_connector1' }],
        },
      ],
    });

    // A destination that already owns _connector1 + wing_1 forces BOTH id spaces to shift.
    const dest = createEmptyPart();
    dest.connectors.push({
      id: '_connector1',
      flags: [],
      capabilities: [],
      siblingIds: [],
      layerId: DEFAULT_LAYER_ID,
      ...t(0),
    });
    dest.placements.push({
      instanceId: 'wing_1',
      subPartTemplateId: 'Core.Wing',
      layerId: DEFAULT_LAYER_ID,
      ...t(0),
    });

    const { part } = mergeProjectImport(dest, buildProjectExport(src, 'X'));
    const newConnectorId = part.connectors[1].id;
    const newWingId = part.placements.find(
      (p) => p.subPartTemplateId === 'Core.Wing' && p.instanceId !== 'wing_1',
    )!.instanceId;
    expect(newConnectorId).not.toBe('_connector1');
    expect(newWingId).not.toBe('wing_1');

    expect(part.connectors[1].capabilities).toEqual(['BulkFluid', 'DecouplerJoint']);
    expect(part.gameData.combustors[0].feeds).toEqual([
      { kind: 'connector', connectorId: newConnectorId },
      { kind: 'container', containerId: 'Grain', subPartInstanceId: newWingId },
    ]);
    expect(part.gameData.solidMotors[0].feeds).toEqual([
      { kind: 'connector', connectorId: newConnectorId },
    ]);
    expect(part.gameData.consumerFeedWiring).toEqual([
      {
        consumerId: 'ThrustChamber',
        subPartInstanceId: newWingId,
        feeds: [{ kind: 'connector', connectorId: newConnectorId }],
      },
    ]);
    const spd = part.subPartGameData.find((x) => x.subPartTemplateId === 'Core.Wing')!;
    expect(spd.combustors[0].feeds).toEqual([{ kind: 'parent' }]); // nothing to remap
    expect(spd.solidMotors[0].feeds).toEqual([{ kind: 'connector', connectorId: newConnectorId }]);
  });

  it('skips a coupling whose connector was not imported', () => {
    const src = sourcePart();
    src.connectors = []; // decoupler still references the (now absent) _connector1
    const env = buildProjectExport(src, 'X');
    const { part } = mergeProjectImport(createEmptyPart(), env);
    expect(part.gameData.decoupler).toBeNull();
  });

  it('drops solar-tracking when its drive subpart is dangling', () => {
    const src = sourcePart();
    src.animations[0].solarTracking!.subPartInstanceId = 'ghost_99';
    const env = buildProjectExport(src, 'X');
    const { part } = mergeProjectImport(createEmptyPart(), env);
    expect(part.animations[0].solarTracking).toBeNull();
  });
});

describe('parseProjectImport', () => {
  it('accepts a well-formed compact project', () => {
    const json = serializeProjectJson(buildProjectExport(sourcePart(), 'X'));
    const result = parseProjectImport(json);
    expect(result.ok).toBe(true);
  });

  it('rejects empty, non-JSON, wrong-format, and wrong-version input', () => {
    expect(parseProjectImport('').ok).toBe(false);
    expect(parseProjectImport('not json').ok).toBe(false);
    expect(parseProjectImport('{}').ok).toBe(false); // no format marker
    expect(parseProjectImport(JSON.stringify({ f: 'something-else', v: 1 })).ok).toBe(false);
    expect(parseProjectImport(JSON.stringify({ f: PROJECT_EXPORT_FORMAT, v: 999 })).ok).toBe(false);
    // v1 predates the 4892 reaction/tank key renames — rejected, never migrated.
    expect(parseProjectImport(JSON.stringify({ f: PROJECT_EXPORT_FORMAT, v: 1 })).ok).toBe(false);
    // v8's `CKeyframe.es` values are single whole-pose easings; reading them as the v9
    // per-channel {p,r,s} record would silently load LINEAR motion. Rejected, never converted.
    expect(parseProjectImport(JSON.stringify({ f: PROJECT_EXPORT_FORMAT, v: 8 })).ok).toBe(false);
    // v9 lights omit the layer token (it meant the now-deleted built-in Lights layer), so
    // they would decode onto a layer that no longer has that meaning. Rejected too.
    expect(parseProjectImport(JSON.stringify({ f: PROJECT_EXPORT_FORMAT, v: 9 })).ok).toBe(false);
  });

  it('backfills every optional field from a bare-marker payload', () => {
    const result = parseProjectImport(
      JSON.stringify({ f: PROJECT_EXPORT_FORMAT, v: PROJECT_EXPORT_VERSION }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.data.editorTags).toEqual([]);
      expect(result.env.data.layers).toEqual([]);
      expect(result.env.data.placements).toEqual([]);
      expect(result.env.data.subPartGameData).toEqual([]);
      expect(result.env.data.customMeshes).toEqual([]);
      expect(result.env.data.gameData.customMass).toBeNull();
    }
  });
});

describe('envelopeToPart', () => {
  it('faithfully reconstructs a standalone part (no id remapping) with built-in layers', () => {
    const env = buildProjectExport(sourcePart(), 'MyShip');
    const part = envelopeToPart(env);
    expect(part.partId).toBe('source_part');
    // Ids preserved verbatim — unlike the additive merge, nothing is regenerated.
    expect(part.placements.map((p) => p.instanceId)).toEqual([
      'trussbara_1',
      'trussbara_2',
      'wing_1',
    ]);
    expect(part.connectors[0].id).toBe('_connector1');
    expect(part.animations[0].id).toBe('anim_src1');
    expect(part.gameData.decoupler?.connectorId).toBe('_connector1');
    // The undeletable built-in layers are present.
    for (const id of [DEFAULT_LAYER_ID, IVA_SEAT_LAYER_ID, KITTEN_LAYER_ID]) {
      expect(part.layers.some((l) => l.id === id)).toBe(true);
    }
    // Binary-backed assets always start empty.
    expect(part.customTextures).toEqual([]);
  });

  it('re-homes an entity whose layerId names no layer in the payload onto Default', () => {
    const src = createEmptyPart();
    src.layers.push({ id: 'layer1', name: 'Engines' }, { id: 'layer2', name: 'Lamps' });
    src.placements.push({
      instanceId: 'trussbara_1',
      subPartTemplateId: 'Core.TrussBarA',
      layerId: 'layer1',
      ...t(1),
    });
    src.lights.push(
      { ...createPartLight(null, '_light1'), layerId: 'layer1' },
      { ...createPartLight(null, '_light2'), layerId: 'layer2' },
    );
    const env = buildProjectExport(src, 'S');
    // A hand-edited / foreign payload: the entities name a layer it never carried.
    env.data.layers = env.data.layers.filter((l) => l.id !== 'layer1');

    const part = envelopeToPart(env);
    expect(part.placements[0].layerId).toBe(DEFAULT_LAYER_ID);
    expect(part.lights[0].layerId).toBe(DEFAULT_LAYER_ID);
    // The light on the layer that DID survive keeps it — only broken references are touched.
    expect(part.lights[1].layerId).toBe('layer2');
  });
});

describe('collider merge', () => {
  it('appends colliders with fresh _colliderN ids on their mirrored source layer', () => {
    const src = createEmptyPart();
    src.colliders.push({
      id: '_collider1',
      shape: 'Cylinder',
      ownerTemplateId: null,
      ...t(0.5),
      layerId: DEFAULT_LAYER_ID,
    });
    const dest = createEmptyPart();
    dest.colliders.push({
      id: '_collider1',
      shape: 'Box',
      ownerTemplateId: null,
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    });

    const { part, summary } = mergeProjectImport(dest, buildProjectExport(src, 'S'));
    expect(part.colliders.map((c) => c.id)).toEqual(['_collider1', '_collider2']);
    expect(part.colliders[1].shape).toBe('Cylinder');
    expect(part.colliders[1].position).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
    // The destination's own collider stays put; the imported one lands on the fresh
    // mirror of the source's Default, never merging into the destination's Default.
    expect(part.colliders[0].layerId).toBe(DEFAULT_LAYER_ID);
    expect(part.colliders[1].layerId).not.toBe(DEFAULT_LAYER_ID);
    expect(part.layers.some((l) => l.id === part.colliders[1].layerId)).toBe(true);
    expect(summary.colliders).toBe(1);
  });

  it('puts an imported collider on the SAME layer as the SubParts it came in with', () => {
    const src = createEmptyPart();
    src.layers.push({ id: 'layer1', name: 'Engines' });
    src.placements.push({
      instanceId: 'trussbara_1',
      subPartTemplateId: 'Core.TrussBarA',
      layerId: 'layer1',
      ...t(1),
    });
    src.colliders.push({
      id: '_collider1',
      shape: 'Box',
      ownerTemplateId: null,
      ...identityTransform(),
      layerId: 'layer1',
    });

    const { part } = mergeProjectImport(createEmptyPart(), buildProjectExport(src, 'S'));
    expect(part.colliders[0].layerId).toBe(part.placements[0].layerId);
    expect(part.layers.find((l) => l.id === part.colliders[0].layerId)?.name).toBe('Engines');
  });

  it('leaves a SubPart owner pointing at a built-in template untouched', () => {
    const src = createEmptyPart();
    src.colliders.push({
      id: '_collider1',
      shape: 'Box',
      ownerTemplateId: 'CoreLandingA_Subpart_MediumFootA',
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    });
    const { part } = mergeProjectImport(createEmptyPart(), buildProjectExport(src, 'S'));
    expect(part.colliders[0].ownerTemplateId).toBe('CoreLandingA_Subpart_MediumFootA');
  });

  it('restores a built-in layer when a payload omits it', () => {
    const env = buildProjectExport(createEmptyPart(), 'S');
    env.data.layers = env.data.layers.filter((l) => l.id !== IVA_SEAT_LAYER_ID);
    expect(envelopeToPart(env).layers.map((l) => l.id)).toContain(IVA_SEAT_LAYER_ID);
  });
});

/** A seat at `n` on every axis, on the built-in IVA Seats layer. */
function seat(id: string, n = 0) {
  return { id, ksaId: null, ...t(n), layerId: IVA_SEAT_LAYER_ID };
}

describe('IVA seat transfer', () => {
  it('carries seats through buildProjectExport in document order', () => {
    const src = createEmptyPart();
    src.ivaSeats.push(seat('_seat1'), seat('_seat2', 0.5));
    const env = buildProjectExport(src, 'S');
    expect(env.data.ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat2']);
    expect(env.data.ivaSeats[1].position).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });

  it('envelopeToPart restores seats verbatim with the IVA Seats layer present', () => {
    const src = createEmptyPart();
    src.ivaSeats.push(seat('_seat1'), seat('_seat2', 0.25));
    const part = envelopeToPart(buildProjectExport(src, 'S'));
    // No id remapping on this path — the payload's ids are already consistent.
    expect(part.ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat2']);
    expect(part.ivaSeats.every((s) => s.layerId === IVA_SEAT_LAYER_ID)).toBe(true);
    expect(part.layers.map((l) => l.id)).toContain(IVA_SEAT_LAYER_ID);
  });

  it('restores the IVA Seats layer when a payload omits it', () => {
    const env = buildProjectExport(createEmptyPart(), 'S');
    env.data.layers = env.data.layers.filter((l) => l.id !== IVA_SEAT_LAYER_ID);
    expect(envelopeToPart(env).layers.map((l) => l.id)).toContain(IVA_SEAT_LAYER_ID);
  });

  it('appends pasted seats with fresh _seatN ids AFTER the existing ones', () => {
    const src = createEmptyPart();
    src.ivaSeats.push(seat('_seat1', 0.5), seat('_seat2', 0.75));
    const dest = createEmptyPart();
    dest.ivaSeats.push(seat('_seat1'));

    const { part, summary } = mergeProjectImport(dest, buildProjectExport(src, 'S'));
    // Fresh ids, no collision with the destination's existing _seat1…
    expect(part.ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat2', '_seat3']);
    // …the destination's seat 0 (the default seat) stays first…
    expect(part.ivaSeats[0].position).toEqual({ x: 0, y: 0, z: 0 });
    // …and the incoming seats keep their relative document order.
    expect(part.ivaSeats[1].position).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
    expect(part.ivaSeats[2].position).toEqual({ x: 0.75, y: 0.75, z: 0.75 });
    expect(part.ivaSeats.every((s) => s.layerId === IVA_SEAT_LAYER_ID)).toBe(true);
    expect(summary.ivaSeats).toBe(2);
  });
});

describe('light transfer', () => {
  it('carries lights through buildProjectExport and envelopeToPart verbatim', () => {
    const src = createEmptyPart();
    src.lights.push(
      { ...createPartLight(null, '_light1'), position: { x: 0.5, y: 0, z: 0 } },
      { ...createPartLight('Core.Wing', '_light2'), type: 'Point', rangeM: 2 },
    );
    const env = buildProjectExport(src, 'S');
    expect(env.data.lights.map((l) => l.id)).toEqual(['_light1', '_light2']);
    const part = envelopeToPart(env);
    // No id remapping on this path — the payload's ids are already consistent, and the
    // layers come from the payload wholesale, so an ordinary light layer survives as-is.
    expect(part.lights).toEqual(src.lights);
    expect(part.lights.every((l) => l.layerId === DEFAULT_LAYER_ID)).toBe(true);
  });

  it('appends pasted lights with fresh _lightN ids on their mirrored source layer', () => {
    const src = createEmptyPart();
    src.lights.push({
      ...createPartLight('CoreElectricalA_Subpart_SpotlightA', '_light1'),
      position: { x: 0.38, y: 0.21, z: 0 },
      color: { r: 1, g: 0.5, b: 0.25 },
      rayTracing: true,
    });
    const dest = createEmptyPart();
    dest.lights.push(createPartLight(null, '_light1'));

    const { part, summary } = mergeProjectImport(dest, buildProjectExport(src, 'S'));
    expect(part.lights.map((l) => l.id)).toEqual(['_light1', '_light2']);
    // A built-in SubPart owner is carried untouched (import never renames templates)…
    expect(part.lights[1].ownerTemplateId).toBe('CoreElectricalA_Subpart_SpotlightA');
    // …with every field intact.
    expect(part.lights[1].position).toEqual({ x: 0.38, y: 0.21, z: 0 });
    expect(part.lights[1].color).toEqual({ r: 1, g: 0.5, b: 0.25 });
    expect(part.lights[1].rayTracing).toBe(true);
    // The destination's own light stays put; the imported one lands on the fresh mirror of
    // the source's Default, never merging into the destination's Default (as a collider does).
    expect(part.lights[0].layerId).toBe(DEFAULT_LAYER_ID);
    expect(part.lights[1].layerId).not.toBe(DEFAULT_LAYER_ID);
    expect(part.layers.some((l) => l.id === part.lights[1].layerId)).toBe(true);
    expect(summary.lights).toBe(1);
  });

  it('puts an imported light on the SAME layer as the SubParts it came in with', () => {
    const src = createEmptyPart();
    src.layers.push({ id: 'layer1', name: 'Engines' });
    src.placements.push({
      instanceId: 'trussbara_1',
      subPartTemplateId: 'Core.TrussBarA',
      layerId: 'layer1',
      ...t(1),
    });
    src.lights.push({ ...createPartLight(null, '_light1'), layerId: 'layer1' });

    const { part } = mergeProjectImport(createEmptyPart(), buildProjectExport(src, 'S'));
    expect(part.lights[0].layerId).toBe(part.placements[0].layerId);
    expect(part.layers.find((l) => l.id === part.lights[0].layerId)?.name).toBe('Engines');
    // …and it is a real layer of the destination, never a dangling id.
    expect(part.layers.some((l) => l.id === part.lights[0].layerId)).toBe(true);
  });
});

describe('<Internal> flag transfer', () => {
  it('carries a flag on a BUILT-IN template the paste brings in', () => {
    const src = createEmptyPart();
    src.placements.push({
      instanceId: 'wing_1',
      subPartTemplateId: 'Core.Wing',
      layerId: DEFAULT_LAYER_ID,
      ...t(0),
    });
    src.internalFlags['Core.Wing'] = true;

    const { part } = mergeProjectImport(createEmptyPart(), buildProjectExport(src, 'S'));
    expect(part.internalFlags).toEqual({ 'Core.Wing': true });
  });

  it('routes the flag key through the template-id map for an imported kitten mesh', () => {
    const src = createEmptyPart();
    src.customMeshes.push(kittenMesh());
    src.placements.push({
      instanceId: 'hunter_suit_1',
      subPartTemplateId: 'flexo_hunter_suit_abc',
      layerId: DEFAULT_LAYER_ID,
      ...t(0),
    });
    src.internalFlags.flexo_hunter_suit_abc = true;

    const { part } = mergeProjectImport(createEmptyPart(), buildProjectExport(src, 'S'));
    // The mesh got a FRESH subPartId; the flag must follow it, not the dead source id.
    const freshId = part.customMeshes[0].subPartId;
    expect(freshId).not.toBe('flexo_hunter_suit_abc');
    expect(part.internalFlags).toEqual({ [freshId]: true });
  });

  it('does not clobber a destination flag for a template the paste does not bring', () => {
    const src = createEmptyPart();
    // A flag with no placement behind it: the payload does not bring this template in.
    src.internalFlags['Core.Wing'] = false;

    const dest = createEmptyPart();
    dest.placements.push({
      instanceId: 'wing_1',
      subPartTemplateId: 'Core.Wing',
      layerId: DEFAULT_LAYER_ID,
      ...t(0),
    });
    dest.internalFlags['Core.Wing'] = true;

    const { part } = mergeProjectImport(dest, buildProjectExport(src, 'S'));
    expect(part.internalFlags).toEqual({ 'Core.Wing': true });
  });

  it('leaves the destination alone when the payload carries no flags', () => {
    const dest = createEmptyPart();
    dest.internalFlags['Core.Wing'] = true;
    const { part } = mergeProjectImport(dest, buildProjectExport(createEmptyPart(), 'S'));
    expect(part.internalFlags).toEqual({ 'Core.Wing': true });
  });
});

/**
 * **P11E.03 — the per-channel easing model rides project transfer verbatim.**
 *
 * `mergeProjectImport` moves whole `PartAnimation` objects (a `structuredClone` plus a fresh
 * clip id and remapped member/solar refs), so the 11A schema change — per-channel
 * `JointSegmentEasing` and the `cubicSplineApprox` import flag — needs no transfer code of its
 * own. This suite is the REGRESSION that keeps it that way: a channel dropped in the codec or
 * flattened in the clone would silently paste LINEAR motion, which is exactly the class of
 * failure the constitution's "when in doubt it is breaking" rule exists for.
 *
 * The round trip is the real one: encode → JSON string → parse → additive paste through
 * `importProjectData`, which is also where the ONE-undo-step contract lives.
 */
describe('project transfer carries per-channel easings + the CubicSpline flag (P11E.03)', () => {
  /** A clip whose joint eases each channel DIFFERENTLY, plus the import flag and an anchor. */
  function easedSource(): EditingPart {
    const src = createEmptyPart();
    src.partId = 'eased_part';
    src.placements.push(
      { instanceId: 'panel_1', subPartTemplateId: 'Core.Wing', layerId: DEFAULT_LAYER_ID, ...t(0) },
      { instanceId: 'panel_2', subPartTemplateId: 'Core.Wing', layerId: DEFAULT_LAYER_ID, ...t(1) },
    );
    src.animations.push({
      id: 'anim_eased',
      name: 'Deploy',
      durationSec: 2,
      mode: 'deployRetract',
      cubicSplineApprox: true,
      restKeyframeId: 'kf1',
      joints: [
        { id: 'j_hinge', name: 'Hinge', parentJointId: null, memberInstanceIds: ['panel_1'] },
        { id: 'j_strut', name: 'Strut', parentJointId: 'j_hinge', memberInstanceIds: ['panel_2'] },
      ],
      keyframes: [
        {
          id: 'kf0',
          timeSec: 0,
          poses: { j_hinge: identityTransform(), j_strut: identityTransform() },
          easings: {
            // Divergent per channel — the whole point of the 11A model.
            j_hinge: {
              position: { kind: 'preset', preset: 'easeInOutCubic' },
              rotation: { kind: 'cubicBezier', x1: 0.2, y1: -0.3, x2: 0.8, y2: 1.4 },
            },
            // …and a joint that eases exactly one channel, with the other two absent.
            j_strut: { scale: { kind: 'preset', preset: 'easeOut' } },
          },
        },
        {
          id: 'kf1',
          timeSec: 2,
          poses: { j_hinge: identityTransform(), j_strut: identityTransform() },
        },
      ],
      solarTracking: null,
    });
    return src;
  }

  /** Encode → string → parse → the paste the Import Project dialog performs. */
  function paste(dest: EditingPart, src: EditingPart) {
    const parsed = parseProjectImport(serializeProjectJson(buildProjectExport(src, 'Eased')));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    return mergeProjectImport(dest, parsed.env);
  }

  it('deep-equals the easing maps after a full encode → parse → paste round trip', () => {
    const src = easedSource();
    const { part } = paste(createEmptyPart(), src);

    const anim = part.animations[0];
    // A fresh clip id (re-pasting the same export must never collide)…
    expect(anim.id).not.toBe('anim_eased');
    // …but the JOINT ids — which the easing maps are KEYED BY — are untouched, so the maps
    // are comparable verbatim.
    expect(anim.joints.map((j) => j.id)).toEqual(['j_hinge', 'j_strut']);
    const kf0 = anim.keyframes.find((k) => k.timeSec === 0)!;
    expect(kf0.easings).toEqual(src.animations[0].keyframes[0].easings);
    // Explicitly: the channels that were ABSENT are still absent (linear stays unstored).
    expect(kf0.easings!.j_hinge.scale).toBeUndefined();
    expect(kf0.easings!.j_strut.position).toBeUndefined();
    expect(kf0.easings!.j_strut.rotation).toBeUndefined();
    // The final column never carried easing and must not have grown one.
    expect(anim.keyframes.find((k) => k.timeSec === 2)!.easings).toBeUndefined();
  });

  it('preserves cubicSplineApprox and the rest anchor, and remaps members', () => {
    const dest = createEmptyPart();
    // A colliding instance id forces the paste to regenerate ids — the case where a dropped
    // remap would leave the joint driving nothing.
    dest.placements.push({
      instanceId: 'panel_1',
      subPartTemplateId: 'Core.Wing',
      layerId: DEFAULT_LAYER_ID,
      ...t(0),
    });

    const { part } = paste(dest, easedSource());
    const anim = part.animations[0];

    expect(anim.cubicSplineApprox).toBe(true);
    expect(anim.restKeyframeId).toBe('kf1');
    expect(anim.keyframes.some((k) => k.id === anim.restKeyframeId)).toBe(true);

    // Members point at placements that exist, and NOT at the destination's own panel_1.
    const pasted = new Set(part.placements.slice(1).map((p) => p.instanceId));
    const members = anim.joints.flatMap((j) => j.memberInstanceIds);
    expect(members).toHaveLength(2);
    expect(members.every((id) => pasted.has(id))).toBe(true);
    // The chain survives the paste too (easings are meaningless without it).
    expect(anim.joints[1].parentJointId).toBe('j_hinge');
  });

  it('pastes in exactly ONE undo step', () => {
    $part.set(createEmptyPart());
    importHistory({ undo: [], redo: [] });
    const parsed = parseProjectImport(
      serializeProjectJson(buildProjectExport(easedSource(), 'Eased')),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);

    importProjectData(parsed.env);
    expect(exportHistory().undo).toHaveLength(1);

    const kf0 = $part.get().animations[0].keyframes.find((k) => k.timeSec === 0)!;
    expect(kf0.easings!.j_hinge.rotation).toEqual({
      kind: 'cubicBezier',
      x1: 0.2,
      y1: -0.3,
      x2: 0.8,
      y2: 1.4,
    });

    // …and undoing it takes the whole paste — clip, easings and all — back out.
    undo();
    expect($part.get().animations).toHaveLength(0);
  });
});
