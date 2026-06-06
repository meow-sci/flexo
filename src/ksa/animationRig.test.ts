import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildAnimationRig, previewOverrideMatrix, type AnimRig, type AnimRigChannel } from './animationRig'
import { matrixFromTransform } from '../three/coords'
import type { PartAnimation, SubPartPlacement, Transform } from './types'

/** A Transform with identity defaults, overridden per-axis. */
function tf(over: { pos?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] } = {}): Transform {
  const [px, py, pz] = over.pos ?? [0, 0, 0]
  const [rx, ry, rz] = over.rot ?? [0, 0, 0]
  const [sx, sy, sz] = over.scale ?? [1, 1, 1]
  return { position: { x: px, y: py, z: pz }, rotation: { x: rx, y: ry, z: rz }, scale: { x: sx, y: sy, z: sz } }
}

function pl(instanceId: string, t: Transform): SubPartPlacement {
  return { instanceId, subPartTemplateId: 'T', layerId: 'default', ...t }
}

/**
 * Reconstructs a leaf node's WORLD matrix from the rig the way KSA does — standard
 * glTF animation playback (every joint in our rig is animated and leaves are direct
 * children of joints, so KSA's nearest-animated-ancestor chain equals the real
 * parent chain). This is INDEPENDENT of animationRig's own sampler.
 */
function evaluateLeafWorld(rig: AnimRig, leafName: string, t: number): THREE.Matrix4 {
  const objs = rig.nodes.map((n) => {
    const o = new THREE.Object3D()
    o.matrixAutoUpdate = false
    o.position.set(n.translation[0], n.translation[1], n.translation[2])
    o.quaternion.set(n.rotation[0], n.rotation[1], n.rotation[2], n.rotation[3])
    o.scale.set(n.scale[0], n.scale[1], n.scale[2])
    return o
  })
  rig.nodes.forEach((n, i) => n.children.forEach((c) => objs[i].add(objs[c])))
  for (const ch of rig.channels) {
    const v = sampleChannel(ch, t)
    const o = objs[ch.node]
    if (ch.path === 'translation') o.position.set(v[0], v[1], v[2])
    else if (ch.path === 'rotation') o.quaternion.set(v[0], v[1], v[2], v[3])
    else o.scale.set(v[0], v[1], v[2])
  }
  for (const o of objs) o.updateMatrix()
  objs[rig.roots[0]].updateMatrixWorld(true)
  const idx = rig.nodes.findIndex((n) => n.name === leafName)
  return objs[idx].matrixWorld.clone()
}

function sampleChannel(ch: AnimRigChannel, t: number): number[] {
  const comps = ch.path === 'rotation' ? 4 : 3
  const n = ch.times.length
  const get = (i: number) => ch.values.slice(i * comps, i * comps + comps)
  if (t <= ch.times[0]) return get(0)
  if (t >= ch.times[n - 1]) return get(n - 1)
  let i = 0
  while (i < n - 1 && ch.times[i + 1] <= t) i++
  const alpha = (t - ch.times[i]) / (ch.times[i + 1] - ch.times[i])
  const a = get(i)
  const b = get(i + 1)
  if (ch.path === 'rotation') {
    const q = new THREE.Quaternion(a[0], a[1], a[2], a[3]).slerp(new THREE.Quaternion(b[0], b[1], b[2], b[3]), alpha)
    return [q.x, q.y, q.z, q.w]
  }
  return a.map((v, k) => v + (b[k] - v) * alpha)
}

function position(m: THREE.Matrix4): [number, number, number] {
  const p = new THREE.Vector3().setFromMatrixPosition(m)
  return [p.x, p.y, p.z]
}

function expectMatrixClose(a: THREE.Matrix4, b: THREE.Matrix4): void {
  for (let i = 0; i < 16; i++) expect(a.elements[i]).toBeCloseTo(b.elements[i], 5)
}

function expectMatrixCloseTo(a: THREE.Matrix4, b: THREE.Matrix4, digits: number): void {
  for (let i = 0; i < 16; i++) expect(a.elements[i]).toBeCloseTo(b.elements[i], digits)
}

describe('buildAnimationRig — single joint (door/hinge)', () => {
  // A panel at x=1, a root joint pivoting about Y from 0° (rest) to 90° (open).
  const placement = pl('panel_1', tf({ pos: [1, 0, 0] }))
  const anim: PartAnimation = {
    id: 'anim_door',
    name: 'Door',
    durationSec: 1,
    mode: 'actuate',
    joints: [{ id: 'j', name: 'Hinge', parentJointId: null, memberInstanceIds: ['panel_1'] }],
    keyframes: [
      { id: 'k0', timeSec: 0, poses: { j: tf() } },
      { id: 'k1', timeSec: 1, poses: { j: tf({ rot: [0, Math.PI / 2, 0] }) } },
    ],
    solarTracking: null,
  }
  const rig = buildAnimationRig(anim, [placement], 'MyPart')

  it('reproduces the static placement at rest (t=0) — no load jump', () => {
    expectMatrixClose(evaluateLeafWorld(rig, 'panel_1', 0), matrixFromTransform(placement))
  })

  it('rotates the panel about the pivot to the target pose at t=duration', () => {
    // +90° about Y maps (1,0,0) → (0,0,-1).
    const [x, y, z] = position(evaluateLeafWorld(rig, 'panel_1', 1))
    expect(x).toBeCloseTo(0, 5)
    expect(y).toBeCloseTo(0, 5)
    expect(z).toBeCloseTo(-1, 5)
  })

  it('the glb-reconstructed motion matches the editor preview formula at every t', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expectMatrixClose(evaluateLeafWorld(rig, 'panel_1', t), previewOverrideMatrix(anim, 'panel_1', t, placement)!)
    }
  })

  it('names the leaf node === the SubPart instance id (KSA matches by name)', () => {
    expect(rig.nodes.some((n) => n.name === 'panel_1')).toBe(true)
    expect(rig.nodes[rig.roots[0]].name).toBe('MyPart')
  })
})

describe('buildAnimationRig — kinematic chain (spider leg / FK)', () => {
  // hip(root) → knee(local +x by 1) → foot leaf at part-space x=2.
  // Rotating ONLY the hip 90° about Y must swing the foot to (0,0,-2).
  const foot = pl('foot_1', tf({ pos: [2, 0, 0] }))
  const anim: PartAnimation = {
    id: 'anim_leg',
    name: 'Leg',
    durationSec: 1,
    mode: 'actuate',
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
  const rig = buildAnimationRig(anim, [foot], 'Rover')

  it('places the foot at rest', () => {
    expect(position(evaluateLeafWorld(rig, 'foot_1', 0))).toEqual([
      expect.closeTo(2, 5),
      expect.closeTo(0, 5),
      expect.closeTo(0, 5),
    ])
  })

  it('propagates the hip rotation through the chain to the foot', () => {
    const [x, y, z] = position(evaluateLeafWorld(rig, 'foot_1', 1))
    expect(x).toBeCloseTo(0, 5)
    expect(y).toBeCloseTo(0, 5)
    expect(z).toBeCloseTo(-2, 5)
  })

  it('nests the knee joint node under the hip joint node', () => {
    const hipIdx = rig.nodes.findIndex((n) => n.name === 'jt_hip')
    const kneeIdx = rig.nodes.findIndex((n) => n.name === 'jt_knee')
    expect(rig.nodes[hipIdx].children).toContain(kneeIdx)
    expect(rig.nodes[kneeIdx].children).toContain(rig.nodes.findIndex((n) => n.name === 'foot_1'))
  })
})

describe('buildAnimationRig — easing / export re-baking', () => {
  const placement = pl('panel_1', tf({ pos: [1, 0, 0] }))
  function door(easing?: { kind: 'preset'; preset: 'easeInOut' }): PartAnimation {
    return {
      id: 'anim_door',
      name: 'Door',
      durationSec: 1,
      mode: 'actuate',
      joints: [{ id: 'j', name: 'Hinge', parentJointId: null, memberInstanceIds: ['panel_1'] }],
      keyframes: [
        { id: 'k0', timeSec: 0, poses: { j: tf() }, ...(easing ? { easings: { j: easing } } : {}) },
        { id: 'k1', timeSec: 1, poses: { j: tf({ rot: [0, Math.PI / 2, 0] }) } },
      ],
      solarTracking: null,
    }
  }

  it('keeps linear-only segments sparse — channel times === keyframe times', () => {
    const rig = buildAnimationRig(door(), [placement], 'MyPart')
    for (const ch of rig.channels) expect(ch.times).toEqual([0, 1])
  })

  it('bakes an eased segment into dense LINEAR samples at ~fps', () => {
    const rig = buildAnimationRig(door({ kind: 'preset', preset: 'easeInOut' }), [placement], 'MyPart', { fps: 30 })
    const rot = rig.channels.find((c) => c.path === 'rotation')!
    expect(rot.times.length).toBe(31) // ceil(1*30) subdivisions + 1
    expect(rot.times[0]).toBe(0)
    expect(rot.times[rot.times.length - 1]).toBe(1)
  })

  it('the dense-baked eased motion reconstructs the editor preview at every t', () => {
    const anim = door({ kind: 'preset', preset: 'easeInOut' })
    const rig = buildAnimationRig(anim, [placement], 'MyPart', { fps: 30 })
    // KSA replays the dense channels with LINEAR interpolation; that must match the
    // eased preview formula within the baking density tolerance.
    // ~0.001 chord error is the LINEAR approximation of the curve between 30fps samples.
    for (const t of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
      expectMatrixCloseTo(evaluateLeafWorld(rig, 'panel_1', t), previewOverrideMatrix(anim, 'panel_1', t, placement)!, 2)
    }
  })

  it('easing actually changes the motion vs. linear (lags before midpoint)', () => {
    const eased = door({ kind: 'preset', preset: 'easeInOut' })
    const linear = door()
    // ease-in-out lags linear in the first half — the panel has swept a smaller angle.
    const e = position(previewOverrideMatrix(eased, 'panel_1', 0.25, placement)!)
    const l = position(previewOverrideMatrix(linear, 'panel_1', 0.25, placement)!)
    // larger remaining x  ⇒ smaller swept angle
    expect(e[0]).toBeGreaterThan(l[0])
  })
})
