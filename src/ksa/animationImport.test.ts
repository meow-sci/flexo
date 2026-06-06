import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { buildAnimationRig, previewOverrideMatrix } from './animationRig'
import { buildAnimationGlb } from './exportAnimationGlb'
import { decodeAnimationGlb, remapImportedAnimation, parseGlb } from './animationImport'
import type { CatalogAnimationModule, PartAnimation, SubPartPlacement, Transform } from './types'

function tf(over: { pos?: [number, number, number]; rot?: [number, number, number] } = {}): Transform {
  const [px, py, pz] = over.pos ?? [0, 0, 0]
  const [rx, ry, rz] = over.rot ?? [0, 0, 0]
  return { position: { x: px, y: py, z: pz }, rotation: { x: rx, y: ry, z: rz }, scale: { x: 1, y: 1, z: 1 } }
}
function pl(instanceId: string, t: Transform): SubPartPlacement {
  return { instanceId, subPartTemplateId: 'T', layerId: 'default', ...t }
}
function glbBuffer(rig: ReturnType<typeof buildAnimationRig>): ArrayBuffer {
  const u8 = buildAnimationGlb(rig)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}
const MODULE: CatalogAnimationModule = { moduleId: 'Test', showDeployRetract: false, glbPath: '', glbId: '', solarTracking: null }
function counterId() {
  let n = 0
  return (prefix: string) => `${prefix}_${n++}`
}

describe('decodeAnimationGlb — export → decode round-trip', () => {
  // hip(root) → knee(local +x 1) → foot leaf at x=2; hip turns 90° about Y at t=1.
  const foot = pl('foot_1', tf({ pos: [2, 0, 0] }))
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
      { id: 'k1', timeSec: 1, poses: { hip: tf({ rot: [0, Math.PI / 2, 0] }), knee: tf({ pos: [1, 0, 0] }) } },
    ],
    solarTracking: null,
  }
  const rig = buildAnimationRig(orig, [foot], 'Rover')
  const decoded = decodeAnimationGlb(glbBuffer(rig), { instanceIds: new Set(['foot_1']), module: MODULE })!

  it('recovers the joint chain (parent links) and the leaf members', () => {
    expect(decoded.joints).toHaveLength(2)
    const hip = decoded.joints.find((j) => j.parentIndex === null)!
    const knee = decoded.joints.find((j) => j.parentIndex !== null)!
    expect(decoded.joints[knee.parentIndex!]).toBe(hip)
    expect(knee.memberOriginalIds).toEqual(['foot_1'])
  })

  it('keeps a linear segment sparse (2 keyframe times)', () => {
    expect(decoded.keyframeTimes).toEqual([0, 1])
  })

  it('reproduces the original leaf motion after remap', () => {
    const remapped = remapImportedAnimation(decoded, new Map([['foot_1', 'foot_1']]), counterId())
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const got = previewOverrideMatrix(remapped, 'foot_1', t, foot)!
      const want = previewOverrideMatrix(orig, 'foot_1', t, foot)!
      for (let i = 0; i < 16; i++) expect(got.elements[i]).toBeCloseTo(want.elements[i], 4)
    }
  })

  it('maps mode (deployRetract) and remaps solar-tracking instance ids', () => {
    const mod: CatalogAnimationModule = {
      ...MODULE,
      showDeployRetract: true,
      solarTracking: { degreesPerSecond: 5, subPartOriginalId: 'foot_1', excludeOriginalIds: ['ghost_9'] },
    }
    const d = decodeAnimationGlb(glbBuffer(rig), { instanceIds: new Set(['foot_1']), module: mod })!
    const remapped = remapImportedAnimation(d, new Map([['foot_1', 'newfoot']]), counterId())
    expect(remapped.mode).toBe('deployRetract')
    expect(remapped.solarTracking).toEqual({ degreesPerSecond: 5, subPartInstanceId: 'newfoot', excludeInstanceIds: [] })
  })
})

describe('decodeAnimationGlb — real KSA solar panel asset', () => {
  const PATH = 'thirdparty/ksa/Content/Core/Animations/CoreElectricalA_Prefab_SolarPanelB_Anim.glb'
  const present = existsSync(PATH)
  it.runIf(present)('decodes the dense baked deploy into joints + many keyframes', () => {
    const buf = readFileSync(PATH)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    // The GLB leaf node names ARE the SubPart instance ids; gather them from the GLB itself.
    const { json } = parseGlb(ab)
    const instanceIds = new Set((json.nodes ?? []).map((n) => n.name!).filter((nm) => /_Subpart_/.test(nm)))
    const mod: CatalogAnimationModule = {
      moduleId: 'SolarPanelAnimation',
      showDeployRetract: true,
      glbPath: PATH,
      glbId: 'CoreElectricalA_Prefab_SolarPanelB_Anim',
      solarTracking: { degreesPerSecond: 5, subPartOriginalId: 'CoreStructuralA_Subpart_DriveRotorB1', excludeOriginalIds: ['CoreStructuralA_Subpart_DriveHousingB1'] },
    }
    const decoded = decodeAnimationGlb(ab, { instanceIds, module: mod })!
    // 5 animated panel joints + RootJoint + RotaryJoint = 7 joints.
    expect(decoded.joints.length).toBeGreaterThanOrEqual(5)
    expect(decoded.joints.some((j) => /ArmJoint/.test(j.name))).toBe(true)
    expect(decoded.durationSec).toBeGreaterThan(9) // ~9.54s deploy
    expect(decoded.keyframeTimes.length).toBeGreaterThan(100) // dense baked (~230)
    // every animated joint carries at least one member leaf
    expect(decoded.joints.some((j) => j.memberOriginalIds.length > 0)).toBe(true)
    // a real chain: at least one joint has a joint parent
    expect(decoded.joints.some((j) => j.parentIndex !== null)).toBe(true)
  })
})
