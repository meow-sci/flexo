import { describe, it, expect } from 'vitest'
import { buildAnimationGlb } from './exportAnimationGlb'
import { buildAnimationRig } from './animationRig'
import type { PartAnimation, SubPartPlacement } from './types'

function parseGlb(glb: Uint8Array): {
  json: {
    nodes?: { name?: string; children?: number[] }[]
    animations?: { channels: { sampler: number; target: { node: number; path: string } }[]; samplers: { interpolation: string }[] }[]
    accessors?: { type: string; count: number; min?: number[]; max?: number[] }[]
    buffers?: { byteLength: number }[]
  }
  hasBin: boolean
} {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  expect(dv.getUint32(0, true)).toBe(0x46546c67) // glTF magic
  expect(dv.getUint32(8, true)).toBe(glb.length) // total length
  const jsonLen = dv.getUint32(12, true)
  expect(dv.getUint32(16, true)).toBe(0x4e4f534a) // JSON chunk
  expect(jsonLen % 4).toBe(0)
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)))
  const binStart = 20 + jsonLen
  const hasBin = binStart < glb.length && dv.getUint32(binStart + 4, true) === 0x004e4942
  if (hasBin) expect(dv.getUint32(binStart, true) % 4).toBe(0) // BIN chunk 4-aligned
  return { json, hasBin }
}

const placement: SubPartPlacement = {
  instanceId: 'panel_1',
  subPartTemplateId: 'T',
  layerId: 'default',
  position: { x: 1, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
}

const anim: PartAnimation = {
  id: 'anim_door',
  name: 'Door',
  durationSec: 2,
  mode: 'deployRetract',
  joints: [{ id: 'j', name: 'Hinge', parentJointId: null, memberInstanceIds: ['panel_1'] }],
  keyframes: [
    { id: 'k0', timeSec: 0, poses: { j: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } } },
    { id: 'k1', timeSec: 2, poses: { j: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, scale: { x: 1, y: 1, z: 1 } } } },
  ],
  solarTracking: null,
}

describe('buildAnimationGlb', () => {
  const glb = buildAnimationGlb(buildAnimationRig(anim, [placement], 'MyPart'))
  const { json, hasBin } = parseGlb(glb)

  it('produces a structurally valid 2-chunk GLB with a binary buffer', () => {
    expect(hasBin).toBe(true)
    expect(json.buffers?.[0]?.byteLength).toBeGreaterThan(0)
  })

  it('names the leaf node === the SubPart instance id (KSA matches by name)', () => {
    const names = (json.nodes ?? []).map((n) => n.name)
    expect(names).toContain('panel_1') // the SubPart leaf
    expect(names).toContain('MyPart') // the Part root
    expect(names).toContain('jt_j') // the joint node
  })

  it('emits exactly one animation targeting the JOINT node (not the leaf)', () => {
    expect(json.animations).toHaveLength(1)
    const jointIdx = (json.nodes ?? []).findIndex((n) => n.name === 'jt_j')
    const leafIdx = (json.nodes ?? []).findIndex((n) => n.name === 'panel_1')
    const targets = json.animations![0].channels.map((c) => c.target.node)
    expect(targets.every((n) => n === jointIdx)).toBe(true)
    expect(targets).not.toContain(leafIdx) // a directly-animated leaf would be a KSA no-op
  })

  it('emits translation + rotation channels with LINEAR samplers', () => {
    const paths = json.animations![0].channels.map((c) => c.target.path).sort()
    expect(paths).toEqual(['rotation', 'translation'])
    expect(json.animations![0].samplers.every((s) => s.interpolation === 'LINEAR')).toBe(true)
  })

  it('gives the time (input) accessor min/max so Duration is recoverable', () => {
    const input = (json.accessors ?? []).find((a) => a.type === 'SCALAR')
    expect(input?.min?.[0]).toBeCloseTo(0)
    expect(input?.max?.[0]).toBeCloseTo(2) // = KSA Duration
  })

  it('parents the leaf under the joint node', () => {
    const jointIdx = (json.nodes ?? []).findIndex((n) => n.name === 'jt_j')
    const leafIdx = (json.nodes ?? []).findIndex((n) => n.name === 'panel_1')
    expect(json.nodes![jointIdx].children).toContain(leafIdx)
  })
})
