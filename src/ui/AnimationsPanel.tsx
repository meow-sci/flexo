import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Trash2, Plus, Crosshair } from 'lucide-react'
import { Button, TextField, Select, ListBoxItem, Slider, Checkbox, DisclosureSection, cn } from './kit'
import { $part, pushUndo } from '../state/editorStore'
import { $selectedPlacements } from '../state/selectors'
import {
  $activeAnimation,
  $activeAnimationId,
  $activeJointId,
  $editKeyframeId,
  $animPreviewU,
  addAnimation,
  removeAnimation,
  renameAnimation,
  setAnimationMode,
  setAnimationDuration,
  addJoint,
  removeJoint,
  renameJoint,
  setJointParent,
  attachToJoint,
  detachFromJoint,
  addKeyframe,
  removeKeyframe,
  setKeyframeTime,
  setJointPose,
  setSolarTracking,
} from '../state/animationStore'
import { isAnimationExportable } from '../ksa/animationNaming'
import { identityTransform, type AnimationJoint, type AnimationKeyframe, type AnimationMode, type PartAnimation } from '../ksa/types'

const RAD2DEG = 180 / Math.PI
const DEG2RAD = Math.PI / 180

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 1e5) / 1e5)
}

/** A draft-aware numeric field (free-types while focused, reflects the store otherwise). */
function NumberField(props: {
  label: string
  value: number
  onCommit: (n: number) => void
  onFocus?: () => void
  isDisabled?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className="flex items-center gap-1">
      <span className="w-3 text-xs text-fg-subtle">{props.label}</span>
      <TextField
        size="sm"
        type="number"
        inputMode="decimal"
        aria-label={props.label}
        value={draft ?? fmt(props.value)}
        inputClassName="font-mono"
        isDisabled={props.isDisabled}
        onChange={(v) => {
          setDraft(v)
          const n = Number.parseFloat(v)
          if (Number.isFinite(n)) props.onCommit(n)
        }}
        onFocus={() => {
          setDraft(fmt(props.value))
          props.onFocus?.()
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}

/** The Animations authoring section (collapsible). Lives in the inspector so the
 *  3D viewport stays visible for the live preview scrubber. */
export function AnimationsPanel() {
  const part = useStore($part)
  const active = useStore($activeAnimation)
  const exportableCount = part.animations.filter(isAnimationExportable).length

  return (
    <DisclosureSection title="Animations" badge={part.animations.length || ''}>
      <div className="flex flex-col gap-1">
        {part.animations.map((anim) => (
          <AnimationRow key={anim.id} anim={anim} active={anim.id === active?.id} />
        ))}
        {part.animations.length === 0 && (
          <p className="text-xs text-fg-subtle">
            No animations. Add one to make doors, hinges, or jointed legs move in-game.
          </p>
        )}
        <Button size="sm" className="self-start" onPress={() => addAnimation()}>
          <Plus size={13} /> Animation
        </Button>
      </div>

      {active && <AnimationEditor anim={active} />}

      {part.animations.length > 0 && exportableCount < part.animations.length && (
        <p className="text-xs text-warning">
          {part.animations.length - exportableCount} animation(s) won’t export yet — each needs a
          joint with attached parts and a pose at t&gt;0.
        </p>
      )}
    </DisclosureSection>
  )
}

function AnimationRow({ anim, active }: { anim: PartAnimation; active: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-md border px-2 py-1',
        active ? 'border-accent bg-accent/10' : 'border-border bg-panel-sunken',
      )}
    >
      <button
        className="flex-1 truncate text-left text-sm"
        onClick={() => $activeAnimationId.set(anim.id)}
        title={anim.name}
      >
        {anim.name}
        {!isAnimationExportable(anim) && <span className="ml-1 text-xs text-fg-subtle">(draft)</span>}
      </button>
      <Button size="sm" variant="ghost" aria-label="Delete animation" onPress={() => removeAnimation(anim.id)}>
        <Trash2 size={13} />
      </Button>
    </div>
  )
}

function AnimationEditor({ anim }: { anim: PartAnimation }) {
  const editKfId = useStore($editKeyframeId)
  const previewU = useStore($animPreviewU)
  const [nameDraft, setNameDraft] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-panel-sunken p-2">
      <TextField
        size="sm"
        aria-label="Animation name"
        value={nameDraft ?? anim.name}
        onFocus={() => setNameDraft(anim.name)}
        onChange={(v) => setNameDraft(v)}
        onBlur={() => {
          if (nameDraft != null) renameAnimation(anim.id, nameDraft)
          setNameDraft(null)
        }}
      />

      <div className="flex items-end gap-2">
        <Select
          size="sm"
          label="Mode"
          className="flex-1"
          selectedKey={anim.mode}
          onSelectionChange={(k) => setAnimationMode(anim.id, k as AnimationMode)}
        >
          <ListBoxItem id="actuate">Actuate (0→1 slider)</ListBoxItem>
          <ListBoxItem id="deployRetract">Deploy / Retract</ListBoxItem>
        </Select>
        <div className="w-20">
          <NumberField
            label="s"
            value={anim.durationSec}
            onFocus={() => pushUndo('animation duration', anim.name)}
            onCommit={(n) => setAnimationDuration(anim.id, n)}
          />
        </div>
      </div>

      {/* Live preview scrubber (drives the viewport). */}
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-fg-subtle">
          Preview {editKfId ? '(pinned to edited pose)' : `${Math.round(previewU * 100)}%`}
        </span>
        <Slider
          aria-label="Preview"
          value={previewU}
          minValue={0}
          maxValue={1}
          step={0.01}
          onChange={(v) => {
            $editKeyframeId.set(null)
            $animPreviewU.set(typeof v === 'number' ? v : v[0])
          }}
        />
      </label>

      <JointsSection anim={anim} />
      <KeyframesSection anim={anim} />
      <PoseEditor anim={anim} />
      <SolarTrackingEditor anim={anim} />
    </div>
  )
}

/** Optional sun-tracking passthrough (KSA `<SolarTracking>`); deploy/retract only. */
function SolarTrackingEditor({ anim }: { anim: PartAnimation }) {
  if (anim.mode !== 'deployRetract') return null
  const members = anim.joints.flatMap((j) => j.memberInstanceIds)
  const st = anim.solarTracking
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-1.5">
      <Checkbox
        isSelected={!!st}
        onChange={(on) =>
          setSolarTracking(
            anim.id,
            on ? { degreesPerSecond: 5, subPartInstanceId: members[0] ?? '', excludeInstanceIds: [] } : null,
          )
        }
      >
        Sun tracking (solar panel)
      </Checkbox>
      {st && (
        <>
          <div className="flex items-end gap-2">
            <Select
              size="sm"
              label="Rotates to track"
              className="flex-1"
              selectedKey={st.subPartInstanceId || undefined}
              onSelectionChange={(k) => setSolarTracking(anim.id, { ...st, subPartInstanceId: String(k) })}
            >
              {members.map((m) => (
                <ListBoxItem key={m} id={m}>
                  {m}
                </ListBoxItem>
              ))}
            </Select>
            <div className="w-20">
              <NumberField label="°/s" value={st.degreesPerSecond} onCommit={(n) => setSolarTracking(anim.id, { ...st, degreesPerSecond: n })} />
            </div>
          </div>
          {members.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-fg-subtle">Stays fixed (doesn’t track):</span>
              {members.map((m) => (
                <Checkbox
                  key={m}
                  isSelected={st.excludeInstanceIds.includes(m)}
                  onChange={(on) =>
                    setSolarTracking(anim.id, {
                      ...st,
                      excludeInstanceIds: on ? [...st.excludeInstanceIds, m] : st.excludeInstanceIds.filter((x) => x !== m),
                    })
                  }
                >
                  <span className="font-mono text-xs">{m}</span>
                </Checkbox>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function JointsSection({ anim }: { anim: PartAnimation }) {
  const activeJointId = useStore($activeJointId)
  const selected = useStore($selectedPlacements)
  const selectedIds = selected.map((s) => s.placement.instanceId)

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-fg-subtle">Joints (pivots)</span>
      {anim.joints.map((joint) => (
        <JointRow
          key={joint.id}
          anim={anim}
          joint={joint}
          active={joint.id === activeJointId}
          selectedIds={selectedIds}
        />
      ))}
      <Button size="sm" className="self-start" onPress={() => addJoint(anim.id)}>
        <Plus size={13} /> Joint
      </Button>
    </div>
  )
}

function JointRow({
  anim,
  joint,
  active,
  selectedIds,
}: {
  anim: PartAnimation
  joint: AnimationJoint
  active: boolean
  selectedIds: string[]
}) {
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const others = anim.joints.filter((j) => j.id !== joint.id)

  return (
    <div className={cn('flex flex-col gap-1 rounded-md border p-1.5', active ? 'border-accent' : 'border-border')}>
      <div className="flex items-center gap-1">
        <button
          className="shrink-0 text-fg-subtle hover:text-fg"
          title="Select joint (edit its pivot/pose below)"
          onClick={() => $activeJointId.set(joint.id)}
        >
          <Crosshair size={14} className={active ? 'text-accent' : ''} />
        </button>
        <TextField
          size="sm"
          aria-label="Joint name"
          value={nameDraft ?? joint.name}
          onFocus={() => setNameDraft(joint.name)}
          onChange={(v) => setNameDraft(v)}
          onBlur={() => {
            if (nameDraft != null && nameDraft.trim()) renameJoint(anim.id, joint.id, nameDraft)
            setNameDraft(null)
          }}
        />
        <Button size="sm" variant="ghost" aria-label="Delete joint" onPress={() => removeJoint(anim.id, joint.id)}>
          <Trash2 size={13} />
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="secondary"
          isDisabled={selectedIds.length === 0}
          onPress={() => attachToJoint(anim.id, joint.id, selectedIds)}
        >
          Attach {selectedIds.length || ''} selected
        </Button>
        {others.length > 0 && (
          <Select
            size="sm"
            aria-label="Parent joint"
            className="flex-1"
            selectedKey={joint.parentJointId ?? 'none'}
            onSelectionChange={(k) => setJointParent(anim.id, joint.id, k === 'none' ? null : String(k))}
          >
            <ListBoxItem id="none">Root (Part)</ListBoxItem>
            {others.map((o) => (
              <ListBoxItem key={o.id} id={o.id}>
                under {o.name}
              </ListBoxItem>
            ))}
          </Select>
        )}
      </div>

      {joint.memberInstanceIds.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {joint.memberInstanceIds.map((id) => (
            <span key={id} className="flex items-center gap-0.5 rounded bg-panel px-1 py-0.5 font-mono text-xs">
              {id}
              <button className="text-fg-subtle hover:text-danger" onClick={() => detachFromJoint(anim.id, joint.id, id)}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <span className="text-xs text-fg-subtle">No parts attached — select parts in the viewport, then Attach.</span>
      )}
    </div>
  )
}

function KeyframesSection({ anim }: { anim: PartAnimation }) {
  const editKfId = useStore($editKeyframeId)
  const sorted = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec)

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-fg-subtle">Poses (keyframes)</span>
      {sorted.map((kf) => (
        <KeyframeRow key={kf.id} anim={anim} kf={kf} editing={kf.id === editKfId} />
      ))}
      <Button size="sm" className="self-start" onPress={() => addKeyframe(anim.id, anim.durationSec)}>
        <Plus size={13} /> Pose at {fmt(anim.durationSec)}s
      </Button>
    </div>
  )
}

function KeyframeRow({ anim, kf, editing }: { anim: PartAnimation; kf: AnimationKeyframe; editing: boolean }) {
  const isRest = kf.timeSec === 0
  return (
    <div className={cn('flex items-center gap-1 rounded-md border px-1.5 py-1', editing ? 'border-accent bg-accent/10' : 'border-border')}>
      <button
        className="flex-1 text-left text-sm"
        onClick={() => $editKeyframeId.set(kf.id)}
        title="Edit this pose (pins the preview here)"
      >
        {isRest ? 'Rest' : `${fmt(kf.timeSec)}s`}
        {editing && <span className="ml-1 text-xs text-accent">editing</span>}
      </button>
      {!isRest && (
        <div className="w-16">
          <NumberField label="t" value={kf.timeSec} onFocus={() => pushUndo('keyframe time', anim.name)} onCommit={(n) => setKeyframeTime(anim.id, kf.id, n)} />
        </div>
      )}
      {!isRest && (
        <Button size="sm" variant="ghost" aria-label="Delete pose" onPress={() => removeKeyframe(anim.id, kf.id)}>
          <Trash2 size={13} />
        </Button>
      )}
    </div>
  )
}

/** Numeric pose editor for the active joint at the edited keyframe (the snapshot UX). */
function PoseEditor({ anim }: { anim: PartAnimation }) {
  const jointId = useStore($activeJointId)
  const kfId = useStore($editKeyframeId)
  const joint = anim.joints.find((j) => j.id === jointId)
  const kf = anim.keyframes.find((k) => k.id === kfId)
  if (!joint || !kf) {
    return (
      <p className="rounded-md bg-panel px-2 py-1.5 text-xs text-fg-subtle">
        Select a joint (◎) and a pose to edit its position/rotation here. The “Rest” pose is the
        pivot/axis; later poses are where it moves to.
      </p>
    )
  }
  const pose = kf.poses[joint.id] ?? identityTransform()
  const isRest = kf.timeSec === 0

  const commit = (mut: (t: ReturnType<typeof identityTransform>) => void) => {
    const next = { position: { ...pose.position }, rotation: { ...pose.rotation }, scale: { ...pose.scale } }
    mut(next)
    setJointPose(anim.id, kf.id, joint.id, next)
  }
  const start = () => pushUndo('pose', `${joint.name} @ ${isRest ? 'rest' : `${fmt(kf.timeSec)}s`}`)
  const axes = ['x', 'y', 'z'] as const

  return (
    <div className="flex flex-col gap-2 rounded-md border border-accent/40 bg-panel p-2">
      <span className="text-xs">
        Posing <b>{joint.name}</b> @ {isRest ? 'Rest (pivot)' : `${fmt(kf.timeSec)}s`}
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-fg-subtle">
          {isRest ? 'Pivot position (m)' : 'Position (m)'}
        </span>
        <div className="grid grid-cols-3 gap-1">
          {axes.map((a) => (
            <NumberField
              key={a}
              label={a.toUpperCase()}
              value={pose.position[a]}
              onFocus={start}
              onCommit={(n) => commit((t) => (t.position[a] = n))}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-fg-subtle">Rotation (°)</span>
        <div className="grid grid-cols-3 gap-1">
          {axes.map((a) => (
            <NumberField
              key={a}
              label={a.toUpperCase()}
              value={pose.rotation[a] * RAD2DEG}
              onFocus={start}
              onCommit={(deg) => commit((t) => (t.rotation[a] = deg * DEG2RAD))}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
