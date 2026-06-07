import * as THREE from 'three'
import { matrixFromTransform } from '../three/coords'
import { evalEasing, isLinearEasing } from './easing'
import { identityTransform } from './types'
import type { PartAnimation, SubPartPlacement, Transform } from './types'

/**
 * Builds the joint-skeleton "rig" KSA's KeyframeAnimationModule requires, and the
 * sampling math the in-editor preview shares with it.
 *
 * KSA RULE (KeyframeAnimationData.cs:178-204): animation channels must target
 * JOINT nodes; each moving SubPart is a NON-animated leaf named === its instance
 * Id, parented under its joint. KSA composes
 *   world(leaf,t) = leafStatic · jointLocal(t) · …up the animated-ancestor chain
 * and assigns the decomposed result to the SubPart's Part-local transform. So:
 *   - joint node base TRS  = the joint's rest LOCAL pose (keyframe-0, relative to parent)
 *   - joint channels       = the joint's local pose sampled at each keyframe
 *   - leaf static (Oₗ)     = W_J(rest)⁻¹ · placement  (the offset from the joint at rest)
 * giving world(leaf,t) = W_J(t) · W_J(rest)⁻¹ · placement — exactly the placement at
 * the rest keyframe (no load jump) and rigidly carried by the joint thereafter.
 * `rest` is {@link restAnchorTime}: the earliest keyframe (t=0) for hand-authored
 * animations, but the LAST keyframe for an imported KSA deploy clip (modeled deployed).
 *
 * All matrix math runs in three.js with the SAME calibrated mapping the editor uses
 * for placements ({@link matrixFromTransform}); glTF carries rotations as
 * quaternions in the shared KSA/three.js basis, so what the preview shows and what
 * KSA renders agree.
 */

/** A plain-number glTF node (three.js-free) consumed by {@link buildAnimationGlb}. */
export interface AnimRigNode {
  name: string
  translation: [number, number, number]
  /** Quaternion, glTF xyzw order. */
  rotation: [number, number, number, number]
  scale: [number, number, number]
  /** Indices into the rig's `nodes` array. */
  children: number[]
}

/** One animation channel: keyframe times + flat TRS output for a target node. */
export interface AnimRigChannel {
  node: number
  path: 'translation' | 'rotation' | 'scale'
  /** Keyframe times in seconds. */
  times: number[]
  /** Flat output values: 3/key for translation|scale, 4/key (xyzw) for rotation. */
  values: number[]
}

/** The full rig: a node tree (one root = the Part) + per-joint channels. */
export interface AnimRig {
  nodes: AnimRigNode[]
  /** Scene root node indices (just the Part node). */
  roots: number[]
  channels: AnimRigChannel[]
  /** Max keyframe time = KSA Duration. */
  durationSec: number
}

const SCALE_EPS = 1e-6

/**
 * Frames per second used to bake eased segments into dense LINEAR samples on export
 * (KSA only plays LINEAR/STEP samplers). Matches the density of KSA's own built-in
 * animations (~24-30 fps). Linear segments stay sparse (2 keys).
 */
export const BAKE_FPS = 30

/** Keyframes sorted ascending by time (a fresh array; the store keeps t=0 first). */
function sortedKeyframes(anim: PartAnimation) {
  return [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec)
}

/** A joint's pose at keyframe `k`, defaulting to identity if it has no entry. */
function poseOf(jointId: string, k: PartAnimation['keyframes'][number]): Transform {
  return k.poses[jointId] ?? identityTransform()
}

function poseParts(t: Transform): { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 } {
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  matrixFromTransform(t).decompose(pos, quat, scale)
  return { pos, quat, scale }
}

/**
 * The joint's LOCAL pose components (relative to its parent) at time `t`: linearly
 * interpolating position/scale and slerping rotation between bracketing keyframes,
 * with the segment progress warped by that joint's per-segment easing. Clamps to the
 * end keyframes outside [0, lastTime] (mirroring KSA's clamp). At an EXACT keyframe
 * time the result is that keyframe's pose verbatim (easing(0)=0, slerp/lerp at 0),
 * which keeps export baking byte-identical for un-eased segments.
 */
function sampleJointPartsLocal(
  anim: PartAnimation,
  jointId: string,
  t: number,
): { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 } {
  const kfs = sortedKeyframes(anim)
  if (kfs.length === 0) return { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) }
  if (t <= kfs[0].timeSec) return poseParts(poseOf(jointId, kfs[0]))
  const last = kfs[kfs.length - 1]
  if (t >= last.timeSec) return poseParts(poseOf(jointId, last))
  let i = 0
  while (i < kfs.length - 1 && kfs[i + 1].timeSec <= t) i++
  const a = kfs[i]
  const b = kfs[i + 1]
  const span = b.timeSec - a.timeSec
  const linear = span > 0 ? (t - a.timeSec) / span : 0
  // Warp the segment progress by this joint's OUTGOING easing on keyframe `a`.
  const alpha = evalEasing(a.easings?.[jointId], linear)
  const pa = poseParts(poseOf(jointId, a))
  const pb = poseParts(poseOf(jointId, b))
  return {
    pos: pa.pos.lerp(pb.pos, alpha),
    quat: pa.quat.slerp(pb.quat, alpha), // three.js slerp takes the shortest path
    scale: pa.scale.lerp(pb.scale, alpha),
  }
}

/**
 * The joint's LOCAL matrix (relative to its parent) at time `t` — the composed form
 * of {@link sampleJointPartsLocal}. Shared by the editor preview and export baking.
 */
export function sampleJointLocal(anim: PartAnimation, jointId: string, t: number): THREE.Matrix4 {
  const { pos, quat, scale } = sampleJointPartsLocal(anim, jointId, t)
  return new THREE.Matrix4().compose(pos, quat, scale)
}

/**
 * The per-joint set of times at which to bake its TRS channels: each eased segment is
 * subdivided to ~`fps` (dense LINEAR samples that reproduce the curve under KSA's
 * LINEAR playback); each linear segment contributes only its endpoint. For an
 * all-linear joint this returns exactly the keyframe times (sparse, unchanged output).
 */
function jointSampleTimes(anim: PartAnimation, joint: PartAnimation['joints'][number], fps: number): number[] {
  const kfs = sortedKeyframes(anim)
  if (kfs.length === 0) return []
  const times = [kfs[0].timeSec]
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]
    const b = kfs[i + 1]
    const span = b.timeSec - a.timeSec
    if (span > 0 && !isLinearEasing(a.easings?.[joint.id])) {
      const n = Math.max(1, Math.ceil(span * fps))
      for (let s = 1; s < n; s++) times.push(a.timeSec + (span * s) / n)
    }
    times.push(b.timeSec)
  }
  return times
}

/**
 * The joint's WORLD matrix (in Part space) at time `t`, composing its local pose up
 * the parent-joint chain: W_J = L_root · … · L_J. Cycle- and missing-parent-safe.
 */
export function jointWorld(anim: PartAnimation, jointId: string, t: number): THREE.Matrix4 {
  const byId = new Map(anim.joints.map((j) => [j.id, j]))
  let m = sampleJointLocal(anim, jointId, t)
  const seen = new Set<string>([jointId])
  let pid = byId.get(jointId)?.parentJointId ?? null
  while (pid && byId.has(pid) && !seen.has(pid)) {
    seen.add(pid)
    m = sampleJointLocal(anim, pid, t).multiply(m) // parentLocal · m
    pid = byId.get(pid)!.parentJointId
  }
  return m
}

/** The joint a placement is attached to, or null if it's not animated. */
export function findOwningJoint(anim: PartAnimation, instanceId: string): PartAnimation['joints'][number] | null {
  return anim.joints.find((j) => j.memberInstanceIds.includes(instanceId)) ?? null
}

/**
 * The timeline time of the animation's modeled-rest keyframe — the pose that equals
 * each SubPart's static placement, which preview + export anchor on. Defaults to the
 * earliest keyframe (t=0, the hand-authoring convention); an importer can point
 * {@link PartAnimation.restKeyframeId} at a later keyframe (a KSA deploy clip is
 * modeled fully-deployed = its LAST keyframe). Falls back to 0 if the id is stale.
 */
export function restAnchorTime(anim: PartAnimation): number {
  if (!anim.restKeyframeId) return 0
  return anim.keyframes.find((k) => k.id === anim.restKeyframeId)?.timeSec ?? 0
}

/**
 * The editor-preview override matrix for an animated SubPart at time `t`:
 * W_J(t) · W_J(rest)⁻¹ · placement, where `rest` is {@link restAnchorTime} (t=0 for
 * authored clips, the deployed LAST keyframe for an imported KSA deploy). Returns null
 * when the SubPart isn't attached to any joint (it should keep its static placement).
 */
export function previewOverrideMatrix(
  anim: PartAnimation,
  instanceId: string,
  t: number,
  placement: Transform,
): THREE.Matrix4 | null {
  const joint = findOwningJoint(anim, instanceId)
  if (!joint) return null
  const Wt = jointWorld(anim, joint.id, t)
  const Wrestinv = jointWorld(anim, joint.id, restAnchorTime(anim)).invert()
  return Wt.multiply(Wrestinv).multiply(matrixFromTransform(placement))
}

/** Every instance id attached to any joint in the animation. */
export function animatedInstanceIds(anim: PartAnimation): Set<string> {
  const out = new Set<string>()
  for (const j of anim.joints) for (const id of j.memberInstanceIds) out.add(id)
  return out
}

function decomposeToNode(name: string, m: THREE.Matrix4): AnimRigNode {
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  m.decompose(pos, quat, scale)
  return {
    name,
    translation: [pos.x, pos.y, pos.z],
    rotation: [quat.x, quat.y, quat.z, quat.w],
    scale: [scale.x, scale.y, scale.z],
    children: [],
  }
}

/**
 * Builds the {@link AnimRig} for one animation: a Part root node, a joint node per
 * {@link PartAnimation.joints} (nested by parentJointId), a named leaf per attached
 * placement, and translation/rotation (+ scale when it varies) channels per joint.
 */
export function buildAnimationRig(
  anim: PartAnimation,
  placements: readonly SubPartPlacement[],
  partId: string,
  opts: { fps?: number } = {},
): AnimRig {
  const fps = opts.fps ?? BAKE_FPS
  const placementById = new Map(placements.map((p) => [p.instanceId, p as Transform]))
  const nodes: AnimRigNode[] = []
  const push = (name: string, m: THREE.Matrix4): number => {
    nodes.push(decomposeToNode(name, m))
    return nodes.length - 1
  }

  // Root = the Part (identity). KSA finds the root as the node with no parent.
  const rootIdx = push(partId, new THREE.Matrix4())

  // One node per joint, base TRS = its rest LOCAL pose (keyframe 0, relative to parent).
  const jointNodeIdx = new Map<string, number>()
  for (const j of anim.joints) {
    jointNodeIdx.set(j.id, push(`jt_${j.id}`, sampleJointLocal(anim, j.id, 0)))
  }
  // Wire joint parenting (root joints hang off the Part node).
  for (const j of anim.joints) {
    const parent =
      j.parentJointId && jointNodeIdx.has(j.parentJointId) ? jointNodeIdx.get(j.parentJointId)! : rootIdx
    nodes[parent].children.push(jointNodeIdx.get(j.id)!)
  }
  // One leaf per attached placement, static TRS = W_J(rest)⁻¹ · placement (rest = the
  // modeled keyframe; t=0 for authored clips, the deployed LAST kf for a KSA import).
  const anchorT = restAnchorTime(anim)
  for (const j of anim.joints) {
    const w0inv = jointWorld(anim, j.id, anchorT).invert()
    for (const instId of j.memberInstanceIds) {
      const placement = placementById.get(instId)
      if (!placement) continue // placement removed — skip its leaf
      const offset = w0inv.clone().multiply(matrixFromTransform(placement))
      nodes[jointNodeIdx.get(j.id)!].children.push(push(instId, offset))
    }
  }

  // Channels: bake each joint's local pose over its own sample-time set — dense
  // across eased segments (so KSA's LINEAR playback reproduces the curve), sparse
  // (keyframe endpoints only) across linear segments.
  const kfs = sortedKeyframes(anim)
  const durationSec = Math.max(0, ...kfs.map((k) => k.timeSec))
  const channels: AnimRigChannel[] = []
  for (const j of anim.joints) {
    const node = jointNodeIdx.get(j.id)!
    const times = jointSampleTimes(anim, j, fps)
    const transl: number[] = []
    const rot: number[] = []
    const scl: number[] = []
    let prev: THREE.Quaternion | null = null
    let scaleVaries = false
    let firstScale: THREE.Vector3 | null = null
    for (const t of times) {
      const { pos, quat, scale } = sampleJointPartsLocal(anim, j.id, t)
      transl.push(pos.x, pos.y, pos.z)
      // Keep consecutive quaternions in the same hemisphere so KSA's slerp takes the
      // short way (q and -q are the same rotation but slerp differently) — across the
      // DENSE sample stream, not just keyframes.
      if (prev && prev.dot(quat) < 0) quat.set(-quat.x, -quat.y, -quat.z, -quat.w)
      rot.push(quat.x, quat.y, quat.z, quat.w)
      prev = quat
      scl.push(scale.x, scale.y, scale.z)
      if (!firstScale) firstScale = scale.clone()
      else if (Math.abs(scale.x - firstScale.x) > SCALE_EPS || Math.abs(scale.y - firstScale.y) > SCALE_EPS || Math.abs(scale.z - firstScale.z) > SCALE_EPS) {
        scaleVaries = true
      }
    }
    channels.push({ node, path: 'translation', times, values: transl })
    channels.push({ node, path: 'rotation', times, values: rot })
    if (scaleVaries) channels.push({ node, path: 'scale', times, values: scl })
  }

  return { nodes, roots: [rootIdx], channels, durationSec }
}
