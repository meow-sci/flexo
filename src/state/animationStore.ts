import * as THREE from 'three'
import { atom, computed } from 'nanostores'
import type {
  AnimationKeyframe,
  AnimationMode,
  EasingConfig,
  EditingPart,
  PartAnimation,
  SolarTrackingSpec,
  Transform,
  Vec3,
} from '../ksa/types'
import { createPartAnimation, identityTransform, VEC3_ONE } from '../ksa/types'
import { jointWorld, sampleJointLocal } from '../ksa/animationRig'
import { isLinearEasing } from '../ksa/easing'
import { matrixFromTransform, transformFromMatrix } from '../three/coords'
import { $inspectorMode } from './uiStore'
import { $part, $selectedIndices, $toolMode, pushUndo } from './editorStore'

/**
 * Document actions + ephemeral editor state for custom animations (see
 * plans/FEATURE_ANIMATIONS_PLAN.md). Animations live on {@link EditingPart.animations}
 * (undo-tracked document state), so every discrete mutation here pushes undo and
 * replaces `$part` — exactly like the layer/gameData actions in editorStore. Pose
 * capture is a STREAMING mutation ({@link setJointPose}): no internal undo push, the
 * caller pushes once at the start of a gizmo drag / field focus.
 *
 * KSA model recap: an animation is a skeleton of {@link AnimationJoint}s; each moving
 * SubPart attaches to a joint and the export builds the leaf parenting + offsets. The
 * keyframe at t=0 is the rest pose (every joint identity by default); SubParts sit at
 * their placements until a later keyframe poses their joint.
 */

// ── ephemeral editor state (NOT in undo, like selection) ─────────────────────

/** The animation currently open in the editor (drives the preview + pose UI), or null. */
export const $activeAnimationId = atom<string | null>(null)
/** The joint whose pose the gizmo/fields edit, or null. */
export const $activeJointId = atom<string | null>(null)
/** The keyframe being posed (pins the preview to its time); null = free scrub. */
export const $editKeyframeId = atom<string | null>(null)
/** Free preview scrub position 0→1 (mapped to 0→duration). 0 = rest pose. */
export const $animPreviewU = atom<number>(0)

/** The active animation object, or null. */
export const $activeAnimation = computed([$part, $activeAnimationId], (part, id) =>
  id ? part.animations.find((a) => a.id === id) ?? null : null,
)

/**
 * True while the Animations editor has a joint + keyframe open for posing. The
 * Move/Rotate/Scale toolbar normally appears only for a viewport selection, which is
 * empty during pose editing — this lets {@link SelectionToolbar} show it so all three
 * gizmos stay reachable while posing.
 */
export const $isPoseEditing = computed(
  [$inspectorMode, $activeAnimationId, $activeJointId, $editKeyframeId],
  (mode, animId, jointId, kfId) => mode === 'anim' && !!animId && !!jointId && !!kfId,
)

/**
 * Selects a keyframe for pose editing and auto-picks the 3D gizmo tool: Move for the
 * rest pivot (t=0, so a drag relocates the rotation anchor) and Rotate for a later
 * pose (so a drag swings the joint). The user can still switch tools afterwards.
 */
export function selectKeyframeForEditing(animId: string, keyframeId: string): void {
  $editKeyframeId.set(keyframeId)
  const k = $activeAnimation.get()?.keyframes.find((x) => x.id === keyframeId)
  if (k && $activeAnimationId.get() === animId) $toolMode.set(k.timeSec === 0 ? 'translate' : 'rotate')
}

// ── undo plumbing (mirrors customAssetStore.mutate, minus the atlas flag) ─────

function rid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}

/** Discrete mutation: snapshot undo, clone, mutate, publish. */
function mutate(description: string, detail: string, fn: (part: EditingPart) => void): void {
  pushUndo(description, detail)
  const next = structuredClone($part.get())
  fn(next)
  $part.set(next)
}

/** Streaming mutation: no undo push (caller pushes at interaction start). */
function stream(fn: (part: EditingPart) => void): void {
  const next = structuredClone($part.get())
  fn(next)
  $part.set(next)
}

function findAnim(part: EditingPart, animId: string): PartAnimation | undefined {
  return part.animations.find((a) => a.id === animId)
}

/** Sorted keyframes (rest at t=0 first), as a live reference into the array. */
function sortKeyframes(anim: PartAnimation): void {
  anim.keyframes.sort((a, b) => a.timeSec - b.timeSec)
}

// ── animations ───────────────────────────────────────────────────────────────

/** Creates an animation, makes it active, returns its id. */
export function addAnimation(name = 'Animation', mode: AnimationMode = 'actuate'): string {
  const id = rid('anim')
  const anim = createPartAnimation(id, name)
  anim.mode = mode
  mutate('add animation', anim.name, (p) => p.animations.push(anim))
  $activeAnimationId.set(id)
  $activeJointId.set(null)
  $editKeyframeId.set(null)
  $animPreviewU.set(0)
  return id
}

export function removeAnimation(animId: string): void {
  const name = findAnim($part.get(), animId)?.name ?? ''
  mutate('remove animation', name, (p) => {
    p.animations = p.animations.filter((a) => a.id !== animId)
  })
  if ($activeAnimationId.get() === animId) {
    $activeAnimationId.set(null)
    $activeJointId.set(null)
    $editKeyframeId.set(null)
  }
}

export function renameAnimation(animId: string, name: string): void {
  const trimmed = name.trim()
  const anim = findAnim($part.get(), animId)
  if (!anim || !trimmed || anim.name === trimmed) return
  mutate('rename animation', `${anim.name} → ${trimmed}`, (p) => {
    const a = findAnim(p, animId)
    if (a) a.name = trimmed
  })
}

export function setAnimationMode(animId: string, mode: AnimationMode): void {
  mutate('animation mode', mode, (p) => {
    const a = findAnim(p, animId)
    if (a) a.mode = mode
  })
}

/** Sets the duration (s); rescales every keyframe time proportionally to keep shape. */
export function setAnimationDuration(animId: string, durationSec: number): void {
  const dur = Math.max(0.01, durationSec)
  // streaming: duration is typed in a numeric field (caller focus-pushes once)
  stream((p) => {
    const a = findAnim(p, animId)
    if (!a) return
    const old = a.durationSec
    if (old > 0) for (const k of a.keyframes) k.timeSec = (k.timeSec / old) * dur
    a.durationSec = dur
    sortKeyframes(a)
  })
}

export function setSolarTracking(animId: string, spec: SolarTrackingSpec | null): void {
  mutate('solar tracking', spec ? 'on' : 'off', (p) => {
    const a = findAnim(p, animId)
    if (a) a.solarTracking = spec
  })
}

// ── joints ─────────────────────────────────────────────────────────────────--

/**
 * Adds a joint, selects it, returns its id. The rest pose (in every keyframe) is seeded
 * at the current viewport selection's centroid so a fresh joint hinges near its parts
 * rather than at the part origin (identity when nothing is selected). Use
 * {@link setJointPivot} to snap it precisely onto a hinge afterwards.
 */
export function addJoint(animId: string, name = 'Joint', parentJointId: string | null = null): string {
  const id = rid('joint')
  const seed = selectionCentroidPose()
  mutate('add joint', name, (p) => {
    const a = findAnim(p, animId)
    if (!a) return
    a.joints.push({ id, name, parentJointId, memberInstanceIds: [] })
    for (const k of a.keyframes) k.poses[id] = cloneTransform(seed)
  })
  $activeJointId.set(id)
  return id
}

/** A deep copy of a Transform (poses must not share mutable refs across keyframes). */
function cloneTransform(t: Transform): Transform {
  return { position: { ...t.position }, rotation: { ...t.rotation }, scale: { ...t.scale } }
}

/** A rest pose at the current viewport selection's centroid (identity if none selected). */
function selectionCentroidPose(): Transform {
  const placements = $part.get().placements
  const pts = $selectedIndices.get().map((i) => placements[i]).filter(Boolean)
  if (pts.length === 0) return identityTransform()
  const c = { x: 0, y: 0, z: 0 }
  for (const pl of pts) {
    c.x += pl.position.x
    c.y += pl.position.y
    c.z += pl.position.z
  }
  return {
    position: { x: c.x / pts.length, y: c.y / pts.length, z: c.z / pts.length },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }
}

export function removeJoint(animId: string, jointId: string): void {
  mutate('remove joint', '', (p) => {
    const a = findAnim(p, animId)
    if (!a) return
    // Re-parent children to the removed joint's parent (keep the chain connected).
    const removed = a.joints.find((j) => j.id === jointId)
    const newParent = removed?.parentJointId ?? null
    for (const j of a.joints) if (j.parentJointId === jointId) j.parentJointId = newParent
    a.joints = a.joints.filter((j) => j.id !== jointId)
    for (const k of a.keyframes) delete k.poses[jointId]
  })
  if ($activeJointId.get() === jointId) $activeJointId.set(null)
}

export function renameJoint(animId: string, jointId: string, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  mutate('rename joint', trimmed, (p) => {
    const j = findAnim(p, animId)?.joints.find((x) => x.id === jointId)
    if (j) j.name = trimmed
  })
}

/** Sets a joint's parent (for chains), guarding against cycles and self-parenting. */
export function setJointParent(animId: string, jointId: string, parentJointId: string | null): void {
  mutate('joint parent', '', (p) => {
    const a = findAnim(p, animId)
    if (!a) return
    if (parentJointId && wouldCycle(a, jointId, parentJointId)) return
    const j = a.joints.find((x) => x.id === jointId)
    if (j) j.parentJointId = parentJointId
  })
}

/** True if making `parentId` the parent of `jointId` would create a cycle. */
function wouldCycle(anim: PartAnimation, jointId: string, parentId: string): boolean {
  if (parentId === jointId) return true
  const byId = new Map(anim.joints.map((j) => [j.id, j]))
  let cur: string | null = parentId
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    if (cur === jointId) return true
    seen.add(cur)
    cur = byId.get(cur)?.parentJointId ?? null
  }
  return false
}

/**
 * Attaches placements to a joint (removing them from any other joint in the SAME
 * animation so a SubPart isn't driven twice within one module).
 */
export function attachToJoint(animId: string, jointId: string, instanceIds: readonly string[]): void {
  if (instanceIds.length === 0) return
  mutate('attach to joint', `${instanceIds.length} part${instanceIds.length === 1 ? '' : 's'}`, (p) => {
    const a = findAnim(p, animId)
    if (!a) return
    const set = new Set(instanceIds)
    for (const j of a.joints) j.memberInstanceIds = j.memberInstanceIds.filter((id) => !set.has(id))
    const target = a.joints.find((j) => j.id === jointId)
    if (target) target.memberInstanceIds.push(...instanceIds)
  })
}

export function detachFromJoint(animId: string, jointId: string, instanceId: string): void {
  mutate('detach from joint', instanceId, (p) => {
    const j = findAnim(p, animId)?.joints.find((x) => x.id === jointId)
    if (j) j.memberInstanceIds = j.memberInstanceIds.filter((id) => id !== instanceId)
  })
}

// ── keyframes (poses) ─────────────────────────────────────────────────────────

/**
 * Inserts a keyframe at `timeSec` (clamped to >0), seeding each joint's pose from
 * the current curve at that time (so it starts on-path), selects it for editing,
 * and returns its id.
 */
export function addKeyframe(animId: string, timeSec: number): string {
  const id = rid('kf')
  const t = Math.max(0.001, timeSec)
  mutate('add keyframe', `${t.toFixed(2)}s`, (p) => {
    const a = findAnim(p, animId)
    if (!a) return
    const poses: Record<string, Transform> = {}
    for (const j of a.joints) poses[j.id] = transformFromMatrix(sampleJointLocal(a, j.id, t))
    a.keyframes.push({ id, timeSec: t, poses })
    sortKeyframes(a)
    // Inserting into a segment halves the preceding keyframe's outgoing easing span —
    // drop it so both sub-segments are linear through the on-curve pose we just
    // sampled (re-author easing per sub-segment afterwards; see AnimationKeyframe).
    const idx = a.keyframes.findIndex((k) => k.id === id)
    const prev = idx > 0 ? a.keyframes[idx - 1] : null
    if (prev?.easings) delete prev.easings
  })
  $editKeyframeId.set(id)
  return id
}

export function removeKeyframe(animId: string, keyframeId: string): void {
  mutate('remove keyframe', '', (p) => {
    const a = findAnim(p, animId)
    if (!a) return
    const k = a.keyframes.find((x) => x.id === keyframeId)
    if (!k || k.timeSec === 0) return // never remove the rest (t=0) keyframe
    a.keyframes = a.keyframes.filter((x) => x.id !== keyframeId)
  })
  if ($editKeyframeId.get() === keyframeId) $editKeyframeId.set(null)
}

/** Moves a keyframe in time (streaming; can't move the rest keyframe off t=0). */
export function setKeyframeTime(animId: string, keyframeId: string, timeSec: number): void {
  stream((p) => {
    const a = findAnim(p, animId)
    if (!a) return
    const k = a.keyframes.find((x) => x.id === keyframeId)
    if (!k || k.timeSec === 0) return
    k.timeSec = Math.min(a.durationSec, Math.max(0.001, timeSec))
    sortKeyframes(a)
  })
}

/**
 * Captures a joint's local pose at a keyframe — the core "pose snapshot". STREAMING:
 * no undo push (the caller pushes once at gizmo-drag start / field focus).
 */
export function setJointPose(animId: string, keyframeId: string, jointId: string, pose: Transform): void {
  stream((p) => {
    const k = findAnim(p, animId)?.keyframes.find((x) => x.id === keyframeId)
    if (k) k.poses[jointId] = { position: { ...pose.position }, rotation: { ...pose.rotation }, scale: { ...pose.scale } }
  })
}

// ── segment easing ─────────────────────────────────────────────────────────--

/** Writes/clears one joint's outgoing easing on a keyframe (linear ⇒ delete the entry). */
function applyEasing(k: AnimationKeyframe, jointId: string, cfg: EasingConfig): void {
  if (isLinearEasing(cfg)) {
    if (k.easings) {
      delete k.easings[jointId]
      if (Object.keys(k.easings).length === 0) delete k.easings
    }
    return
  }
  if (!k.easings) k.easings = {}
  k.easings[jointId] = cfg
}

/**
 * Sets (or clears) the easing for one joint over the segment LEAVING `keyframeId`. A
 * linear/identity config is stored as "absent" so export stays byte-identical and the
 * data stays clean. STREAMING: no undo push (caller pushes once at curve-drag start /
 * preset change).
 */
export function setJointSegmentEasing(animId: string, keyframeId: string, jointId: string, cfg: EasingConfig): void {
  stream((p) => {
    const k = findAnim(p, animId)?.keyframes.find((x) => x.id === keyframeId)
    if (k) applyEasing(k, jointId, cfg)
  })
}

/** Sets the same easing on EVERY joint for the segment leaving `keyframeId` (discrete undo). */
export function setSegmentEasingAllJoints(animId: string, keyframeId: string, cfg: EasingConfig): void {
  mutate('segment easing', isLinearEasing(cfg) ? 'linear' : 'eased', (p) => {
    const a = findAnim(p, animId)
    const k = a?.keyframes.find((x) => x.id === keyframeId)
    if (!a || !k) return
    for (const j of a.joints) applyEasing(k, j.id, cfg)
  })
}

/**
 * Moves a joint's PIVOT — its rest (t=0) position — by `delta`, carrying every
 * keyframe's pose position along so the pivot relocates rigidly: the joint's whole
 * translation curve shifts by the same amount. Because each SubPart's leaf offset is
 * `W_J(0)⁻¹ · placement` (recomputed every frame), shifting all poses equally leaves
 * the rendered geometry unchanged at every t — only the rotation anchor moves. This is
 * the "draggable rotation anchor": drag the rest pivot to e.g. a hinge edge, then t>0
 * rotations swing around it. STREAMING (caller pushes undo at gizmo-drag start).
 */
export function moveJointPivot(animId: string, jointId: string, delta: Vec3): void {
  stream((p) => {
    const a = findAnim(p, animId)
    if (!a) return
    for (const k of a.keyframes) {
      const pose = k.poses[jointId]
      if (pose) {
        pose.position.x += delta.x
        pose.position.y += delta.y
        pose.position.z += delta.z
      }
    }
  })
}

/** The rotation component of a matrix, as a quaternion. */
function quatOf(m: THREE.Matrix4): THREE.Quaternion {
  const q = new THREE.Quaternion()
  m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
  return q
}

/**
 * Re-bases joint `jointId`'s REST (t=0) frame onto `Wtgt` (a Part-space WORLD matrix,
 * scale already stripped) IN PLACE on `a`. Generalises {@link moveJointPivot} to an
 * arbitrary frame (position + orientation): with `B = Wtgt · W_J(0)⁻¹` it rewrites every
 * keyframe's local pose to `P'(t) = W_parent(t)⁻¹ · B · W_J(t)`. This keeps the t=0
 * geometry exactly put (no load/preview jump — the leaf offset `W_J(0)⁻¹·placement` is
 * recomputed) while rigidly carrying t>0 motion so it now swings about the new pivot.
 * The per-keyframe worlds are PRECOMPUTED from the pre-mutation poses (the write loop
 * must not read half-rewritten state).
 */
function rebaseJointToWorld(a: PartAnimation, jointId: string, Wtgt: THREE.Matrix4): void {
  const joint = a.joints.find((j) => j.id === jointId)
  if (!joint) return
  const B = Wtgt.clone().multiply(jointWorld(a, jointId, 0).invert())
  const precomputed = a.keyframes.map((k) => ({
    k,
    Wk: jointWorld(a, jointId, k.timeSec),
    WpInv: joint.parentJointId ? jointWorld(a, joint.parentJointId, k.timeSec).invert() : new THREE.Matrix4(),
  }))
  for (const { k, Wk, WpInv } of precomputed) {
    k.poses[jointId] = transformFromMatrix(WpInv.multiply(B.clone().multiply(Wk))) // W_parent⁻¹ · B · W_J
  }
}

/** The desired new rest WORLD frame: `target` position, unit scale, and orientation from
 *  `target` (when `useOrientation`) or kept from the joint's current rest world. */
function pivotTargetWorld(a: PartAnimation, jointId: string, target: Transform, useOrientation: boolean): THREE.Matrix4 {
  const pos = new THREE.Vector3(target.position.x, target.position.y, target.position.z)
  const quat = useOrientation ? quatOf(matrixFromTransform({ ...target, scale: VEC3_ONE })) : quatOf(jointWorld(a, jointId, 0))
  return new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1))
}

/**
 * Snaps a joint's pivot (its REST frame) onto `target` — a Part-space frame, e.g. the
 * hinge placement the door should swing on. Preserves the t=0 geometry and re-centers
 * t>0 motion on the new pivot. `target.scale` is ignored (a pivot must stay unit-scaled).
 * With `orientation:false` only the position is adopted (the joint keeps its current
 * orientation, so you rotate about a world axis). DISCRETE → one undo step.
 */
export function setJointPivot(
  animId: string,
  jointId: string,
  target: Transform,
  opts: { orientation?: boolean } = {},
): void {
  const useOrientation = opts.orientation ?? true
  mutate('set pivot', '', (p) => {
    const a = findAnim(p, animId)
    if (!a || !a.joints.some((j) => j.id === jointId)) return
    rebaseJointToWorld(a, jointId, pivotTargetWorld(a, jointId, target, useOrientation))
  })
}

/**
 * Streaming counterpart to {@link setJointPivot} for the Rest-pose Rotate gizmo:
 * re-bases the pivot to `worldFrame` (the gizmo proxy's Part-space frame; scale
 * stripped), letting a drag re-orient (and/or move) the pivot live without distorting
 * authored t>0 motion. No internal undo (drag-start pushed one).
 */
export function reorientJointPivot(animId: string, jointId: string, worldFrame: Transform): void {
  stream((p) => {
    const a = findAnim(p, animId)
    if (!a || !a.joints.some((j) => j.id === jointId)) return
    rebaseJointToWorld(a, jointId, matrixFromTransform({ ...worldFrame, scale: VEC3_ONE }))
  })
}

// ── ephemeral-state clamping (after undo/redo or external $part swaps) ─────────

/**
 * Clamps the active animation/joint/keyframe ids to entities that still exist after
 * any `$part` change (undo/redo restores the document without touching these atoms).
 * Call once at app startup.
 */
export function initAnimationStore(): void {
  $part.subscribe((part) => {
    const animId = $activeAnimationId.get()
    if (animId && !part.animations.some((a) => a.id === animId)) {
      $activeAnimationId.set(null)
      $activeJointId.set(null)
      $editKeyframeId.set(null)
      return
    }
    const anim = animId ? part.animations.find((a) => a.id === animId) : null
    if (anim) {
      if ($activeJointId.get() && !anim.joints.some((j) => j.id === $activeJointId.get())) $activeJointId.set(null)
      if ($editKeyframeId.get() && !anim.keyframes.some((k) => k.id === $editKeyframeId.get())) $editKeyframeId.set(null)
    }
  })
}
