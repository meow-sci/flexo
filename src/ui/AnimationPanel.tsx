import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Trash2, Plus, Crosshair, ChevronLeft, Move3d, RotateCcw } from 'lucide-react'
import { Button, TextField, Select, ListBoxItem, Slider, Checkbox, Tooltip, cn } from './kit'
import { $part, $toolMode, pushUndo } from '../state/editorStore'
import { $selectedPlacements, $selectedPlacement } from '../state/selectors'
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
  setJointPivot,
  selectKeyframeForEditing,
  setSolarTracking,
} from '../state/animationStore'
import { isAnimationExportable } from '../ksa/animationNaming'
import { identityTransform, type AnimationJoint, type AnimationKeyframe, type AnimationMode, type PartAnimation, type SubPartPlacement } from '../ksa/types'

const RAD2DEG = 180 / Math.PI
const DEG2RAD = Math.PI / 180

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 1e5) / 1e5)
}

/** Clears the active animation and its joint/keyframe sub-selection (back to the list). */
function closeAnimation(): void {
  $activeAnimationId.set(null)
  $activeJointId.set(null)
  $editKeyframeId.set(null)
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

/**
 * The full-sidebar Animations editor (inspector 'anim' mode). Shows the animation
 * list on top with the active animation's editor filling the space below. Escape
 * unwinds the deepest selection (keyframe → joint → animation). The 3D viewport
 * drives the live preview + pose gizmos; this panel owns the structural editing.
 */
export function AnimationPanel() {
  const part = useStore($part)
  const active = useStore($activeAnimation)
  const exportableCount = part.animations.filter(isAnimationExportable).length

  // Escape unwinds keyframe → joint → animation (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if ($editKeyframeId.get()) $editKeyframeId.set(null)
      else if ($activeJointId.get()) $activeJointId.set(null)
      else if ($activeAnimationId.get()) closeAnimation()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 rounded-xl border border-border bg-panel p-2">
      <div className="flex max-h-44 shrink-0 flex-col gap-1 overflow-auto">
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
        {part.animations.length > 0 && exportableCount < part.animations.length && (
          <p className="text-xs text-warning">
            {part.animations.length - exportableCount} animation(s) won’t export yet — each needs a
            joint with attached parts and a pose at t&gt;0.
          </p>
        )}
      </div>

      {active && (
        <div className="min-h-0 flex-1 overflow-auto">
          <AnimationEditor anim={active} />
        </div>
      )}
    </div>
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
        // Re-clicking the open animation collapses it back to the list (deselect).
        onClick={() => (active ? closeAnimation() : $activeAnimationId.set(anim.id))}
        title={active ? 'Click to close' : anim.name}
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
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" aria-label="Back to animation list" onPress={closeAnimation}>
          <ChevronLeft size={16} />
        </Button>
        <TextField
          size="sm"
          aria-label="Animation name"
          className="flex-1"
          value={nameDraft ?? anim.name}
          onFocus={() => setNameDraft(anim.name)}
          onChange={(v) => setNameDraft(v)}
          onBlur={() => {
            if (nameDraft != null) renameAnimation(anim.id, nameDraft)
            setNameDraft(null)
          }}
        />
      </div>

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
  const single = useStore($selectedPlacement)
  const selectedIds = selected.map((s) => s.placement.instanceId)

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-fg-subtle">Joints (pivots)</span>
      <p className="text-xs text-fg-subtle">
        A joint is a hinge — attached parts rotate around its <b>Rest</b> position. Select the
        hinge part and <b>Set pivot</b> to place that anchor on it.
      </p>
      {anim.joints.map((joint) => (
        <JointRow
          key={joint.id}
          anim={anim}
          joint={joint}
          active={joint.id === activeJointId}
          selectedIds={selectedIds}
          singlePlacement={single}
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
  singlePlacement,
}: {
  anim: PartAnimation
  joint: AnimationJoint
  active: boolean
  selectedIds: string[]
  singlePlacement: SubPartPlacement | null
}) {
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const others = anim.joints.filter((j) => j.id !== joint.id)

  return (
    <div className={cn('flex flex-col gap-1 rounded-md border p-1.5', active ? 'border-accent' : 'border-border')}>
      <div className="flex items-center gap-1">
        <button
          className="shrink-0 text-fg-subtle hover:text-fg"
          title={active ? 'Deselect joint' : 'Select joint (edit its pivot/pose)'}
          // Toggle: re-clicking the active joint deselects it (and closes the pose editor).
          onClick={() => {
            if (active) {
              $activeJointId.set(null)
              $editKeyframeId.set(null)
            } else {
              $activeJointId.set(joint.id)
            }
          }}
        >
          <Crosshair size={14} className={active ? 'text-accent' : ''} />
        </button>
        <TextField
          size="sm"
          aria-label="Joint name"
          className="flex-1"
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

      <div className="flex items-center gap-1">
        <Tooltip
          content={
            singlePlacement
              ? `Snap this joint's pivot onto ${singlePlacement.instanceId} (position + orientation)`
              : 'Select exactly one part (the hinge) in the viewport'
          }
        >
          <Button
            size="sm"
            variant="secondary"
            className="min-w-0 flex-1 truncate"
            isDisabled={!singlePlacement}
            onPress={() => singlePlacement && setJointPivot(anim.id, joint.id, singlePlacement, { orientation: true })}
          >
            Set pivot to {singlePlacement ? singlePlacement.instanceId : 'selection'}
          </Button>
        </Tooltip>
        {singlePlacement && (
          <Tooltip content="Set pivot position only — keep the joint's current orientation">
            <Button
              size="sm"
              variant="ghost"
              onPress={() => setJointPivot(anim.id, joint.id, singlePlacement, { orientation: false })}
            >
              pos only
            </Button>
          </Tooltip>
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
        <span className="text-xs text-fg-subtle">No parts attached — use Mesh Picker, or select parts in the viewport then Attach. Then Set pivot to your hinge.</span>
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
        // Selecting a pose auto-picks the gizmo tool (Move pivot for Rest, Rotate for
        // t>0); re-clicking the open pose deselects it (back to free scrub).
        onClick={() => (editing ? $editKeyframeId.set(null) : selectKeyframeForEditing(anim.id, kf.id))}
        title={editing ? 'Click to stop editing' : 'Edit this pose (pins the preview here)'}
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

/** Numeric pose editor for the active joint at the edited keyframe (mirrors the 3D gizmo). */
function PoseEditor({ anim }: { anim: PartAnimation }) {
  const jointId = useStore($activeJointId)
  const kfId = useStore($editKeyframeId)
  const tool = useStore($toolMode)
  const joint = anim.joints.find((j) => j.id === jointId)
  const kf = anim.keyframes.find((k) => k.id === kfId)
  if (!joint || !kf) {
    return (
      <p className="rounded-md bg-panel px-2 py-1.5 text-xs text-fg-subtle">
        Select a joint (◎) and a pose to edit it. The <b>Rest</b> pose is the pivot/rotation
        anchor — move it with the gizmo; later poses are where the joint swings to. Or select
        the hinge part and click <b>Set pivot</b> on the joint to place the anchor in one click.
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
      <div className="flex items-center gap-1 text-xs text-fg-subtle">
        {tool === 'rotate' ? <RotateCcw size={12} /> : <Move3d size={12} />}
        <span>
          Drag the 3D gizmo, or type below.
          {isRest ? ' Rest = pivot/anchor.' : ''}
        </span>
      </div>
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
