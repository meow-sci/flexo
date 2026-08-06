import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { matrixFromTransform } from '../three/coords';
import { buildAnimationRig, previewOverrideMatrix } from './animationRig';
import { buildAnimationGlb } from './exportAnimationGlb';
import { decodeAnimationGlb, remapImportedAnimation, parseGlb } from './animationImport';
import { hasKsaAssets, ksaAsset } from './ksaTestAssets';
import type { CatalogAnimationModule, PartAnimation, SubPartPlacement, Transform } from './types';

function tf(
  over: { pos?: [number, number, number]; rot?: [number, number, number] } = {},
): Transform {
  const [px, py, pz] = over.pos ?? [0, 0, 0];
  const [rx, ry, rz] = over.rot ?? [0, 0, 0];
  return {
    position: { x: px, y: py, z: pz },
    rotation: { x: rx, y: ry, z: rz },
    scale: { x: 1, y: 1, z: 1 },
  };
}
function pl(instanceId: string, t: Transform): SubPartPlacement {
  return { instanceId, subPartTemplateId: 'T', layerId: 'default', ...t };
}
function glbBuffer(rig: ReturnType<typeof buildAnimationRig>): ArrayBuffer {
  const u8 = buildAnimationGlb(rig);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
const MODULE: CatalogAnimationModule = {
  moduleId: 'Test',
  showDeployRetract: false,
  glbPath: '',
  glbId: '',
  solarTracking: null,
};
function counterId() {
  let n = 0;
  return (prefix: string) => `${prefix}_${n++}`;
}

describe('decodeAnimationGlb — export → decode round-trip', () => {
  // hip(root) → knee(local +x 1) → foot leaf at x=2; hip turns 90° about Y at t=1.
  const foot = pl('foot_1', tf({ pos: [2, 0, 0] }));
  const orig: PartAnimation = {
    id: 'anim_leg',
    name: 'Leg',
    durationSec: 1,
    mode: 'deployRetract',
    joints: [
      { id: 'hip', name: 'Hip', parentJointId: null, memberInstanceIds: [] },
      { id: 'knee', name: 'Knee', parentJointId: 'hip', memberInstanceIds: ['foot_1'] },
    ],
    keyframes: [
      { id: 'k0', timeSec: 0, poses: { hip: tf(), knee: tf({ pos: [1, 0, 0] }) } },
      {
        id: 'k1',
        timeSec: 1,
        poses: { hip: tf({ rot: [0, Math.PI / 2, 0] }), knee: tf({ pos: [1, 0, 0] }) },
      },
    ],
    solarTracking: null,
  };
  const rig = buildAnimationRig(orig, [foot], 'Rover');
  const decoded = decodeAnimationGlb(glbBuffer(rig), {
    instanceIds: new Set(['foot_1']),
    module: MODULE,
  })!;

  it('recovers the joint chain (parent links) and the leaf members', () => {
    expect(decoded.joints).toHaveLength(2);
    const hip = decoded.joints.find((j) => j.parentIndex === null)!;
    const knee = decoded.joints.find((j) => j.parentIndex !== null)!;
    expect(decoded.joints[knee.parentIndex!]).toBe(hip);
    expect(knee.memberOriginalIds).toEqual(['foot_1']);
  });

  it('keeps a linear segment sparse (2 keyframe times)', () => {
    expect(decoded.keyframeTimes).toEqual([0, 1]);
  });

  it('reproduces the original leaf motion after remap', () => {
    const remapped = remapImportedAnimation(decoded, new Map([['foot_1', 'foot_1']]), counterId());
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const got = previewOverrideMatrix(remapped, 'foot_1', t, foot)!;
      const want = previewOverrideMatrix(orig, 'foot_1', t, foot)!;
      for (let i = 0; i < 16; i++) expect(got.elements[i]).toBeCloseTo(want.elements[i], 4);
    }
  });

  it('maps mode (deployRetract) and remaps solar-tracking instance ids', () => {
    const mod: CatalogAnimationModule = {
      ...MODULE,
      showDeployRetract: true,
      solarTracking: {
        degreesPerSecond: 5,
        subPartOriginalId: 'foot_1',
        excludeOriginalIds: ['ghost_9'],
      },
    };
    const d = decodeAnimationGlb(glbBuffer(rig), {
      instanceIds: new Set(['foot_1']),
      module: mod,
    })!;
    const remapped = remapImportedAnimation(d, new Map([['foot_1', 'newfoot']]), counterId());
    expect(remapped.mode).toBe('deployRetract');
    expect(remapped.solarTracking).toEqual({
      degreesPerSecond: 5,
      subPartInstanceId: 'newfoot',
      excludeInstanceIds: [],
    });
  });
});

describe('decodeAnimationGlb — CUBICSPLINE samplers (approximated, flagged)', () => {
  /** Packs a hand-written glTF JSON + float payload into a 2-chunk binary GLB. */
  function makeGlb(json: object, floats: number[]): ArrayBuffer {
    const pad4 = (n: number) => (4 - (n % 4)) % 4;
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const jsonLen = jsonBytes.length + pad4(jsonBytes.length);
    const bin = new Float32Array(floats);
    const binBytes = new Uint8Array(bin.buffer);
    const total = 12 + 8 + jsonLen + 8 + binBytes.length;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546c67, true); // 'glTF'
    dv.setUint32(4, 2, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, jsonLen, true);
    dv.setUint32(16, 0x4e4f534a, true); // JSON
    out.set(jsonBytes, 20);
    out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen); // JSON pads with spaces
    dv.setUint32(20 + jsonLen, binBytes.length, true);
    dv.setUint32(24 + jsonLen, 0x004e4942, true); // BIN
    out.set(binBytes, 28 + jsonLen);
    return out.buffer;
  }

  const S = Math.SQRT1_2; // sin/cos 45° — a 90° turn about Y
  const BOGUS = 9; // tangent slots: if the decoder read these, the pose would be garbage
  const tangent = [BOGUS, BOGUS, BOGUS, BOGUS];
  const floats = [
    0,
    1, // input times
    // key 0 triplet: inTangent, VALUE (identity), outTangent
    ...tangent,
    0,
    0,
    0,
    1,
    ...tangent,
    // key 1 triplet: inTangent, VALUE (90° about Y), outTangent
    ...tangent,
    0,
    S,
    0,
    S,
    ...tangent,
  ];
  const gltf = (interpolation: string, values: number[]) => ({
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'Part', children: [1] },
      { name: 'jt', children: [2] },
      { name: 'foot_1', translation: [2, 0, 0] },
    ],
    buffers: [{ byteLength: values.length * 4 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: (values.length - 2) * 4 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR' },
      { bufferView: 1, componentType: 5126, count: (values.length - 2) / 4, type: 'VEC4' },
    ],
    animations: [
      {
        samplers: [{ input: 0, output: 1, interpolation }],
        channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }],
      },
    ],
  });

  it('decodes the keyframe VALUES (not the tangents) and flags the clip', () => {
    const d = decodeAnimationGlb(makeGlb(gltf('CUBICSPLINE', floats), floats), {
      instanceIds: new Set(['foot_1']),
      module: MODULE,
    })!;
    expect(d.cubicSplineApprox).toBe(true);
    expect(d.keyframeTimes).toEqual([0, 1]);
    const q = (i: number) => {
      const out = new THREE.Quaternion();
      matrixFromTransform(d.joints[0].poses[i]).decompose(
        new THREE.Vector3(),
        out,
        new THREE.Vector3(),
      );
      return out;
    };
    expect(Math.abs(q(0).dot(new THREE.Quaternion(0, 0, 0, 1)))).toBeCloseTo(1, 5);
    expect(Math.abs(q(1).dot(new THREE.Quaternion(0, S, 0, S)))).toBeCloseTo(1, 5);
    // the flag rides through the remap onto the document model
    const remapped = remapImportedAnimation(d, new Map([['foot_1', 'foot_1']]), counterId());
    expect(remapped.cubicSplineApprox).toBe(true);
  });

  it('a LINEAR clip is NOT flagged', () => {
    const linear = [0, 1, 0, 0, 0, 1, 0, S, 0, S];
    const d = decodeAnimationGlb(makeGlb(gltf('LINEAR', linear), linear), {
      instanceIds: new Set(['foot_1']),
      module: MODULE,
    })!;
    expect(d.cubicSplineApprox).toBe(false);
    const remapped = remapImportedAnimation(d, new Map([['foot_1', 'foot_1']]), counterId());
    expect(remapped.cubicSplineApprox).toBeUndefined();
  });
});

describe('decodeAnimationGlb — modeled-rest detection (KSA model = deployed = last keyframe)', () => {
  // A one-joint deploy: hip turns +90° about Y over [0,1]; the foot leaf sits at +x 2.
  // The GLB is authored KSA-style (t=0 = stowed): foot's static offset puts it at its
  // t=0 world [2,0,0], so it traces [2,0,0] (stowed) → [0,0,-2] (deployed) by t=1.
  const orig: PartAnimation = {
    id: 'anim_arm',
    name: 'Arm',
    durationSec: 1,
    mode: 'deployRetract',
    joints: [{ id: 'hip', name: 'Hip', parentJointId: null, memberInstanceIds: ['foot_1'] }],
    keyframes: [
      { id: 'k0', timeSec: 0, poses: { hip: tf() } },
      { id: 'k1', timeSec: 1, poses: { hip: tf({ rot: [0, Math.PI / 2, 0] }) } },
    ],
    solarTracking: null,
  };
  const rig = buildAnimationRig(orig, [pl('foot_1', tf({ pos: [2, 0, 0] }))], 'Arm');
  const ab = glbBuffer(rig);
  // But the part is MODELED deployed: the XML places the foot at its LAST-keyframe world.
  const deployedFoot = pl('foot_1', tf({ pos: [0, 0, -2] }));
  const placements = new Map<string, Transform>([['foot_1', deployedFoot]]);
  const decodeWith = (p?: Map<string, Transform>) =>
    decodeAnimationGlb(ab, { instanceIds: new Set(['foot_1']), module: MODULE, placements: p })!;

  it('detects the placement matches the LAST keyframe (and defaults to first without placements)', () => {
    expect(decodeWith(placements).restAtLastKeyframe).toBe(true);
    expect(decodeWith(undefined).restAtLastKeyframe).toBe(false);
  });

  it('anchored at the rest (last) keyframe: rest pose = placement, scrub to t=0 folds to stowed', () => {
    const remapped = remapImportedAnimation(
      decodeWith(placements),
      new Map([['foot_1', 'foot_1']]),
      counterId(),
    );
    const last = remapped.keyframes.reduce((a, b) => (b.timeSec > a.timeSec ? b : a));
    const anim = { ...remapped, restKeyframeId: last.id };
    const pos = (t: number) => {
      const m = previewOverrideMatrix(anim, 'foot_1', t, deployedFoot)!;
      return [m.elements[12], m.elements[13], m.elements[14]];
    };
    // At the rest anchor (t=1) the deployed placement is reproduced exactly (no load jump).
    const [rx, ry, rz] = pos(1);
    expect(rx).toBeCloseTo(0, 4);
    expect(ry).toBeCloseTo(0, 4);
    expect(rz).toBeCloseTo(-2, 4);
    // Scrubbing to t=0 folds the foot back to its stowed world position [2,0,0].
    const [sx, sy, sz] = pos(0);
    expect(sx).toBeCloseTo(2, 4);
    expect(sy).toBeCloseTo(0, 4);
    expect(sz).toBeCloseTo(0, 4);
  });

  it('WITHOUT the rest anchor the deployed placement scatters (the original bug)', () => {
    const remapped = remapImportedAnimation(
      decodeWith(placements),
      new Map([['foot_1', 'foot_1']]),
      counterId(),
    );
    // restKeyframeId absent ⇒ anchor t=0 ⇒ the whole deploy is re-applied to an already-
    // deployed foot, flinging it off the [0,0,-2] mark instead of holding it.
    const atRest = previewOverrideMatrix(remapped, 'foot_1', 1, deployedFoot)!;
    const offMark = Math.hypot(atRest.elements[12] - 0, atRest.elements[14] - -2);
    expect(offMark).toBeGreaterThan(1);
  });
});

describe('decodeAnimationGlb — animated members carry the GLB rest pose, not the geometry placement', () => {
  // One-joint clip: hip turns +90° about Y over [0,1]; the leaf's GLB static offset puts
  // it at world [2,0,0] at the rest keyframe, tracing to [0,0,-2] at t=1. This mirrors the
  // KSA case where a SubPart's geometry <Position> disagrees with the GLB: KSA positions
  // animated SubParts SOLELY from the GLB, so the importer must too (via memberRestPlacements).
  const orig: PartAnimation = {
    id: 'anim_arm',
    name: 'Arm',
    durationSec: 1,
    mode: 'actuate',
    joints: [{ id: 'hip', name: 'Hip', parentJointId: null, memberInstanceIds: ['foot_1'] }],
    keyframes: [
      { id: 'k0', timeSec: 0, poses: { hip: tf() } },
      { id: 'k1', timeSec: 1, poses: { hip: tf({ rot: [0, Math.PI / 2, 0] }) } },
    ],
    solarTracking: null,
  };
  const ab = glbBuffer(buildAnimationRig(orig, [pl('foot_1', tf({ pos: [2, 0, 0] }))], 'Arm'));
  const expectPos = (t: Transform, x: number, y: number, z: number) => {
    expect(t.position.x).toBeCloseTo(x, 3);
    expect(t.position.y).toBeCloseTo(y, 3);
    expect(t.position.z).toBeCloseTo(z, 3);
  };

  it('captures the GLB world at the FIRST keyframe for an actuate clip (rest = t=0)', () => {
    const d = decodeAnimationGlb(ab, { instanceIds: new Set(['foot_1']), module: MODULE })!;
    expectPos(d.memberRestPlacements.get('foot_1')!, 2, 0, 0);
  });

  it('captures the GLB world at the LAST keyframe for a deploy clip (rest = deployed)', () => {
    // Modeled deployed: geometry places the foot at its last-keyframe world [0,0,-2].
    const placements = new Map<string, Transform>([
      ['foot_1', pl('foot_1', tf({ pos: [0, 0, -2] }))],
    ]);
    const d = decodeAnimationGlb(ab, {
      instanceIds: new Set(['foot_1']),
      module: MODULE,
      placements,
    })!;
    expect(d.restAtLastKeyframe).toBe(true);
    expectPos(d.memberRestPlacements.get('foot_1')!, 0, 0, -2);
  });

  it('anchored to the GLB rest pose, the preview traces the GLB path even when geometry disagrees', () => {
    const d = decodeAnimationGlb(ab, { instanceIds: new Set(['foot_1']), module: MODULE })!;
    const remapped = remapImportedAnimation(d, new Map([['foot_1', 'foot_1']]), counterId());
    // The catalog geometry placement is stale/rotated — but the importer overrides it with
    // the GLB rest pose, so the foot traces the GLB-faithful path [2,0,0] → [0,0,-2].
    const glbRest = pl('foot_1', d.memberRestPlacements.get('foot_1')!);
    const at = (t: number) => previewOverrideMatrix(remapped, 'foot_1', t, glbRest)!.elements;
    expect(at(0)[12]).toBeCloseTo(2, 3);
    expect(at(0)[14]).toBeCloseTo(0, 3);
    expect(at(1)[12]).toBeCloseTo(0, 3);
    expect(at(1)[14]).toBeCloseTo(-2, 3);
  });
});

describe('decodeAnimationGlb — real KSA solar panel asset', () => {
  const PATH = ksaAsset('Animations/CoreElectricalA_Prefab_SolarPanelB_Anim.glb');
  it.runIf(hasKsaAssets)('decodes the dense baked deploy into joints + many keyframes', () => {
    const buf = readFileSync(PATH);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    // The GLB leaf node names ARE the SubPart instance ids; gather them from the GLB itself.
    const { json } = parseGlb(ab);
    const instanceIds = new Set(
      (json.nodes ?? []).map((n) => n.name!).filter((nm) => /_Subpart_/.test(nm)),
    );
    const mod: CatalogAnimationModule = {
      moduleId: 'SolarPanelAnimation',
      showDeployRetract: true,
      glbPath: PATH,
      glbId: 'CoreElectricalA_Prefab_SolarPanelB_Anim',
      solarTracking: {
        degreesPerSecond: 5,
        subPartOriginalId: 'CoreStructuralA_Subpart_DriveRotorB1',
        excludeOriginalIds: ['CoreStructuralA_Subpart_DriveHousingB1'],
      },
    };
    const decoded = decodeAnimationGlb(ab, { instanceIds, module: mod })!;
    // 5 animated panel joints + RootJoint + RotaryJoint = 7 joints.
    expect(decoded.joints.length).toBeGreaterThanOrEqual(5);
    expect(decoded.joints.some((j) => /ArmJoint/.test(j.name))).toBe(true);
    expect(decoded.durationSec).toBeGreaterThan(9); // ~9.54s deploy
    expect(decoded.keyframeTimes.length).toBeGreaterThan(100); // dense baked (~230)
    // every animated joint carries at least one member leaf
    expect(decoded.joints.some((j) => j.memberOriginalIds.length > 0)).toBe(true);
    // a real chain: at least one joint has a joint parent
    expect(decoded.joints.some((j) => j.parentIndex !== null)).toBe(true);
  });
});

describe('decodeAnimationGlb — real KSA SetAHeightA (GLB disagrees with geometry placement)', () => {
  // The nested-joint deploy whose door SubParts' geometry <Position> is stale/rotated vs
  // the GLB. KSA positions animated SubParts SOLELY from the GLB, so memberRestPlacements
  // must yield the GLB rest pose (its world at the rest keyframe), NOT the geometry value —
  // which is what the importer overrides each door placement with. See partImport.ts.
  const PATH = ksaAsset('Animations/CoreServiceModuleA_Prefab_SetAHeightA_Anim.glb');
  // Door geometry placements (from CoreServiceModuleAAssets.xml) — they disagree with the GLB.
  const geomDoors: Record<string, [number, number, number]> = {
    CoreServiceModuleA_Subpart_SetADoorA1: [0, -0.7541, 0.7355],
    CoreServiceModuleA_Subpart_SetADoorA2: [0, 0.7541, -0.7355],
    CoreServiceModuleA_Subpart_SetADoorB1: [0, -0.7542, -0.7355],
    CoreServiceModuleA_Subpart_SetADoorB2: [0, 0.7542, 0.7355],
  };
  it.runIf(hasKsaAssets)(
    'captures each door’s GLB rest pose, not its stale geometry placement',
    () => {
      const buf = readFileSync(PATH);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const { json } = parseGlb(ab);
      const instanceIds = new Set(
        (json.nodes ?? []).map((n) => n.name!).filter((nm) => /_Subpart_/.test(nm)),
      );
      const placements = new Map<string, Transform>(
        Object.entries(geomDoors).map(([id, p]) => [id, pl(id, tf({ pos: p }))]),
      );
      const decoded = decodeAnimationGlb(ab, { instanceIds, module: MODULE, placements })!;
      // Nested chain: RootJoint + 4 Translate + 4 Rotate = 9 joints; doors modeled stowed (t=0).
      expect(decoded.joints.length).toBe(9);
      expect(decoded.restAtLastKeyframe).toBe(false);
      // All four doors are animated members with a captured GLB rest pose.
      const doors = [...decoded.memberRestPlacements.keys()].filter((k) => /SetADoor/.test(k));
      expect(doors).toHaveLength(4);
      for (const [id, g] of Object.entries(geomDoors)) {
        const rest = decoded.memberRestPlacements.get(id)!;
        const dist = Math.hypot(
          rest.position.x - g[0],
          rest.position.y - g[1],
          rest.position.z - g[2],
        );
        expect(dist).toBeGreaterThan(1); // GLB pose ≠ the stale geometry placement
      }
    },
  );
});
