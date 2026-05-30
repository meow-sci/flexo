import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildMeshAtlasGlb } from './exportGlb'

/** Parses a binary GLB's JSON chunk back into an object. */
function parseGlbJson(glb: Uint8Array): { meshes?: { name?: string }[]; nodes?: { name?: string; mesh?: number }[] } {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  expect(dv.getUint32(0, true)).toBe(0x46546c67) // glTF magic
  const jsonLen = dv.getUint32(12, true)
  expect(dv.getUint32(16, true)).toBe(0x4e4f534a) // JSON chunk
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)))
}

describe('buildMeshAtlasGlb', () => {
  it('names the glTF MESH (not just the node) so KSA can resolve it', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const glb = await buildMeshAtlasGlb([{ name: 'flexo_Panel_abc123', geometry }])
    const json = parseGlbJson(glb)
    // KSA reads meshes[i].name — this is the regression we guard.
    expect(json.meshes?.[0]?.name).toBe('flexo_Panel_abc123')
    // flexo's own importer reads the node name — keep it too.
    expect(json.nodes?.[0]?.name).toBe('flexo_Panel_abc123')
  })

  it('names every mesh in a multi-node atlas', async () => {
    const glb = await buildMeshAtlasGlb([
      { name: 'flexo_A', geometry: new THREE.BoxGeometry(1, 1, 1) },
      { name: 'flexo_B', geometry: new THREE.SphereGeometry(0.5, 8, 6) },
    ])
    const json = parseGlbJson(glb)
    const meshNames = (json.meshes ?? []).map((m) => m.name).sort()
    expect(meshNames).toEqual(['flexo_A', 'flexo_B'])
  })

  it('produces a structurally valid GLB (4-byte aligned JSON chunk)', async () => {
    const glb = await buildMeshAtlasGlb([{ name: 'flexo_X', geometry: new THREE.PlaneGeometry(1, 1) }])
    const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    expect(dv.getUint32(8, true)).toBe(glb.length) // total length matches
    const jsonLen = dv.getUint32(12, true)
    expect(jsonLen % 4).toBe(0) // JSON chunk padded to 4 bytes
  })
})
