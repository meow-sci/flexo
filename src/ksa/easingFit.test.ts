import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { hasKsaAssets, ksaAsset } from './ksaTestAssets'
import { fitAnimationEasing, subdivideEasing } from './easingFit'
import { evalBezierPoints, controlPointsOf, type BezierPoints } from './easing'
import { jointWorld } from './animationRig'
import { decodeAnimationGlb, remapImportedAnimation, parseGlb } from './animationImport'
import type { CatalogAnimationModule, PartAnimation, Transform } from './types'

function tf(rotY: number): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: rotY, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }
}

/** A single-joint door whose Y-rotation follows `progress(t)` over [0,1] at `fps`. */
function denseDoor(progress: (t: number) => number, fps = 30): PartAnimation {
  const keyframes = []
  for (let i = 0; i <= fps; i++) {
    const t = i / fps
    keyframes.push({ id: `k${i}`, timeSec: t, poses: { j: tf((Math.PI / 2) * progress(t)) } })
  }
  return {
    id: 'anim',
    name: 'Door',
    durationSec: 1,
    mode: 'actuate',
    joints: [{ id: 'j', name: 'Hinge', parentJointId: null, memberInstanceIds: ['panel'] }],
    keyframes,
    solarTracking: null,
  }
}

/** Largest position + angle discrepancy between two animations' joint worlds. */
function maxJointError(
  a: PartAnimation,
  b: PartAnimation,
  ts: number[],
): { pos: number; deg: number } {
  let pos = 0
  let deg = 0
  for (const j of a.joints) {
    for (const t of ts) {
      const pa = new THREE.Vector3()
      const qa = new THREE.Quaternion()
      const pb = new THREE.Vector3()
      const qb = new THREE.Quaternion()
      jointWorld(a, j.id, t).decompose(pa, qa, new THREE.Vector3())
      jointWorld(b, j.id, t).decompose(pb, qb, new THREE.Vector3())
      pos = Math.max(pos, pa.distanceTo(pb))
      deg = Math.max(deg, 2 * Math.acos(Math.min(1, Math.abs(qa.dot(qb)))) * (180 / Math.PI))
    }
  }
  return { pos, deg }
}

describe('subdivideEasing', () => {
  it('reproduces the parent curve over a time sub-range (renormalized)', () => {
    const full: BezierPoints = [0.42, 0, 0.58, 1]
    const [s0, s1] = [0.2, 0.7]
    const sub = subdivideEasing(full, s0, s1)
    const w0 = evalBezierPoints(full, s0)
    const w1 = evalBezierPoints(full, s1)
    for (let u = 0; u <= 1.0001; u += 0.1) {
      const expected = (evalBezierPoints(full, s0 + u * (s1 - s0)) - w0) / (w1 - w0)
      expect(evalBezierPoints(sub, u)).toBeCloseTo(expected, 2)
    }
  })
})

describe('fitAnimationEasing — round-trip oracle', () => {
  const orig: BezierPoints = [0.42, 0, 0.58, 1] // ease-in-out

  it('compresses a baked ease to 2 keyframes and recovers the curve', () => {
    const dense = denseDoor((t) => evalBezierPoints(orig, t))
    const fitted = fitAnimationEasing(dense)
    expect(fitted.keyframes.length).toBe(2)
    const seg = [...fitted.keyframes].sort((a, b) => a.timeSec - b.timeSec)[0]
    const recovered = controlPointsOf(seg.easings!['j'])
    for (let a = 0.1; a <= 0.9; a += 0.1) {
      expect(evalBezierPoints(recovered, a)).toBeCloseTo(evalBezierPoints(orig, a), 2)
    }
  })

  it('the compacted animation reproduces the dense motion within tolerance', () => {
    const dense = denseDoor((t) => evalBezierPoints(orig, t))
    const fitted = fitAnimationEasing(dense)
    const err = maxJointError(dense, fitted, [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9])
    expect(err.deg).toBeLessThan(0.6)
  })

  it('keeps a non-fittable (non-monotonic) joint dense', () => {
    // a back-and-forth wobble can't be one monotonic ease → stays dense
    const dense = denseDoor((t) => Math.sin(t * Math.PI)) // 0 → 1 → 0
    const fitted = fitAnimationEasing(dense)
    expect(fitted.keyframes.length).toBe(dense.keyframes.length)
  })
})

describe('fitAnimationEasing — real KSA solar panel (staged, overlapping windows)', () => {
  const PATH = ksaAsset('Animations/CoreElectricalA_Prefab_SolarPanelB_Anim.glb')
  it.runIf(hasKsaAssets)('compacts ~230 baked keys to a handful and reproduces the motion', () => {
    const buf = readFileSync(PATH)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const { json } = parseGlb(ab)
    const instanceIds = new Set(
      (json.nodes ?? []).map((n) => n.name!).filter((nm) => /_Subpart_/.test(nm)),
    )
    const mod: CatalogAnimationModule = {
      moduleId: 'SolarPanelAnimation',
      showDeployRetract: true,
      glbPath: PATH,
      glbId: 'x',
      solarTracking: null,
    }
    const decoded = decodeAnimationGlb(ab, { instanceIds, module: mod })!
    const idMap = new Map([...instanceIds].map((id) => [id, id]))
    let n = 0
    const dense = remapImportedAnimation(decoded, idMap, (p) => `${p}_${n++}`)
    const fitted = fitAnimationEasing(dense)

    expect(dense.keyframes.length).toBeGreaterThan(100)
    expect(fitted.keyframes.length).toBeLessThan(12) // ~230 → a handful of editable keys
    // Joint-world motion matches the dense baking across the deploy. The chain amplifies
    // each joint's local-angle tolerance into tip position, so the mid-deploy transient
    // is a few cm (endpoints are exact); this is visually faithful for a panel deploy.
    //
    // The POSITION bound tracks the shipped asset, not the fitter: 2026.7.10.5056
    // re-exported this clip through the in-repo GlbToXmlUtility (rev 5025), which rebaked
    // it at 211 dense keys instead of 230. Per-joint ANGULAR error is essentially
    // unchanged (2.70° → 2.83°); only the ~4 m chain's amplification of it moved
    // (6.6 cm → 12.6 cm), so the angular bound below is the real fit-quality assertion.
    const ts = Array.from({ length: 49 }, (_, i) => (i / 48) * dense.durationSec)
    const err = maxJointError(dense, fitted, ts)
    expect(err.pos).toBeLessThan(0.15) // < 15 cm tip transient on a multi-metre chain
    expect(err.deg).toBeLessThan(3.5)
  })
})
