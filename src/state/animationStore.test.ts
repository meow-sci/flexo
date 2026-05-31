import { describe, it, expect, beforeEach } from 'vitest'
import { $part, undo, redo, importHistory } from './editorStore'
import { createEmptyPart } from '../ksa/types'
import {
  $activeAnimationId,
  $activeJointId,
  $editKeyframeId,
  $animPreviewU,
  addAnimation,
  addJoint,
  attachToJoint,
  addKeyframe,
  removeKeyframe,
  setJointPose,
  setJointParent,
  setAnimationDuration,
} from './animationStore'

const anim0 = () => $part.get().animations[0]

beforeEach(() => {
  $part.set(createEmptyPart())
  importHistory({ undo: [], redo: [] })
  $activeAnimationId.set(null)
  $activeJointId.set(null)
  $editKeyframeId.set(null)
  $animPreviewU.set(0)
})

describe('animationStore', () => {
  it('adds an animation and makes it active (undoable)', () => {
    const id = addAnimation('Door', 'deployRetract')
    expect($part.get().animations).toHaveLength(1)
    expect($activeAnimationId.get()).toBe(id)
    expect(anim0().mode).toBe('deployRetract')
    undo()
    expect($part.get().animations).toHaveLength(0)
    redo()
    expect($part.get().animations).toHaveLength(1)
  })

  it('adds a joint with an identity rest pose in every keyframe', () => {
    const aid = addAnimation('A')
    const jid = addJoint(aid, 'Hinge')
    const a = anim0()
    expect(a.joints).toHaveLength(1)
    // every keyframe (just the rest one) carries a pose for the new joint
    expect(a.keyframes.every((k) => k.poses[jid])).toBe(true)
  })

  it('attaching to a joint moves the part off any other joint in the same animation', () => {
    const aid = addAnimation('A')
    const j1 = addJoint(aid, 'J1')
    const j2 = addJoint(aid, 'J2')
    attachToJoint(aid, j1, ['panel_1'])
    expect(anim0().joints.find((j) => j.id === j1)!.memberInstanceIds).toContain('panel_1')
    attachToJoint(aid, j2, ['panel_1'])
    expect(anim0().joints.find((j) => j.id === j1)!.memberInstanceIds).not.toContain('panel_1')
    expect(anim0().joints.find((j) => j.id === j2)!.memberInstanceIds).toContain('panel_1')
  })

  it('adds a keyframe seeded with a pose for each joint and keeps t=0 first', () => {
    const aid = addAnimation('A')
    const jid = addJoint(aid, 'J')
    addKeyframe(aid, 1)
    const a = anim0()
    expect(a.keyframes).toHaveLength(2)
    const sorted = [...a.keyframes].sort((x, y) => x.timeSec - y.timeSec)
    expect(sorted[0].timeSec).toBe(0)
    expect(sorted[1].timeSec).toBeCloseTo(1)
    expect(sorted[1].poses[jid]).toBeTruthy()
  })

  it('captures a joint pose (streaming — no extra undo step)', () => {
    const aid = addAnimation('A')
    const jid = addJoint(aid, 'J')
    const kid = addKeyframe(aid, 1)
    setJointPose(aid, kid, jid, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 1.5, z: 0 }, scale: { x: 1, y: 1, z: 1 } })
    const kf = anim0().keyframes.find((k) => k.id === kid)!
    expect(kf.poses[jid].rotation.y).toBeCloseTo(1.5)
  })

  it('never removes the rest (t=0) keyframe', () => {
    const aid = addAnimation('A')
    const rest = anim0().keyframes[0]
    removeKeyframe(aid, rest.id)
    expect(anim0().keyframes).toHaveLength(1)
  })

  it('rescales keyframe times when the duration changes', () => {
    const aid = addAnimation('A')
    addJoint(aid, 'J')
    const kid = addKeyframe(aid, 1) // at t=1 (duration 1)
    setAnimationDuration(aid, 2)
    const kf = anim0().keyframes.find((k) => k.id === kid)!
    expect(kf.timeSec).toBeCloseTo(2)
    expect(anim0().durationSec).toBeCloseTo(2)
  })

  it('refuses to parent a joint to itself (cycle guard)', () => {
    const aid = addAnimation('A')
    const jid = addJoint(aid, 'J')
    setJointParent(aid, jid, jid)
    expect(anim0().joints.find((j) => j.id === jid)!.parentJointId).toBeNull()
  })
})
