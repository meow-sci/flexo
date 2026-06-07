import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Button, TextField, Switch } from './kit'
import {
  $bulkScaleMode,
  pushUndo,
  setConnectorFlags,
  setSubPartInstanceId,
  updateSelectedTransform,
  updateSelectedTransforms,
} from '../state/editorStore'
import type { PlacementTransform } from '../state/editorStore'
import { $selectedEntity, $selectionCount, $selectedRefs } from '../state/selectors'
import { $layerView, isLayerLocked } from '../state/layerStore'
import {
  centroidOf,
  quatFromEulerDeg,
  rotatedAroundOriginTransform,
  scaledAroundOriginTransform,
  scaledInPlaceTransform,
  translatedTransform,
} from '../three/bulkTransform'
import { CONNECTOR_FLAGS, type ConnectorFlag } from '../ksa/types'

const RAD2DEG = 180 / Math.PI
const DEG2RAD = Math.PI / 180

/** Format a number for display: trim to ~5 decimals, no trailing zeros. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 1e5) / 1e5)
}

const panelClass = 'flex flex-col gap-2 rounded-xl border border-border bg-panel p-2'

/**
 * A single numeric field. Free-types while focused (local string state), and
 * reflects external store changes (e.g. gizmo drags) when not focused. Commits a
 * parsed number on every valid keystroke; calls `onInteractionStart` once on
 * focus so a typing session collapses into a single undo step.
 */
function ScalarField(props: {
  value: number
  onCommit: (n: number) => void
  onInteractionStart: () => void
  label: string
  isDisabled?: boolean
}) {
  const { value, onCommit, onInteractionStart, label, isDisabled } = props
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <label className="flex items-center gap-1">
      <span className="w-3 text-xs text-fg-subtle">{label}</span>
      <TextField
        size="sm"
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={draft ?? fmt(value)}
        inputClassName="font-mono"
        isDisabled={isDisabled}
        onChange={(v) => {
          setDraft(v)
          const n = Number.parseFloat(v)
          if (Number.isFinite(n)) onCommit(n)
        }}
        onFocus={() => {
          setDraft(fmt(value))
          onInteractionStart()
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}

type Axis = 'x' | 'y' | 'z'

/**
 * Numeric transform inspector for the selected entity (SubPart or connector).
 * Two-way bound with the 3D gizmo: both edit the SAME store, so typing moves the
 * model live and gizmo drags update these fields live. Rotation is shown in
 * degrees but stored/exported in radians. Connectors expose their connection Flags.
 */
export function TransformInspector() {
  const count = useStore($selectionCount)
  const entity = useStore($selectedEntity)
  useStore($layerView) // re-render when lock state changes
  if (count > 1) return <BulkTransformPanel />
  if (!entity) return null

  const layerId = entity.kind === 'subpart' ? entity.placement.layerId : entity.connector.layerId
  const locked = isLayerLocked(layerId)
  const transform = entity.kind === 'subpart' ? entity.placement : entity.connector

  const commit = (mutate: (t: PlacementTransform) => void) => {
    const next: PlacementTransform = {
      position: { ...transform.position },
      rotation: { ...transform.rotation },
      scale: { ...transform.scale },
    }
    mutate(next)
    updateSelectedTransform(next)
  }

  const entityName = entity.kind === 'subpart' ? entity.placement.instanceId : entity.connector.id

  const posField = (axis: Axis) => (
    <ScalarField
      label={axis.toUpperCase()}
      value={transform.position[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('move', entityName)}
      onCommit={(n) => commit((t) => (t.position[axis] = n))}
    />
  )
  const rotField = (axis: Axis) => (
    <ScalarField
      label={axis.toUpperCase()}
      value={transform.rotation[axis] * RAD2DEG}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('rotate', entityName)}
      onCommit={(deg) => commit((t) => (t.rotation[axis] = deg * DEG2RAD))}
    />
  )
  const scaleField = (axis: Axis) => (
    <ScalarField
      label={axis.toUpperCase()}
      value={transform.scale[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('scale', entityName)}
      onCommit={(n) => commit((t) => (t.scale[axis] = n))}
    />
  )

  return (
    <div className={panelClass}>
      {entity.kind === 'subpart' ? (
        <SubPartHeader
          index={entity.index}
          instanceId={entity.placement.instanceId}
          templateId={entity.placement.subPartTemplateId}
          locked={locked}
        />
      ) : (
        <ConnectorHeader
          index={entity.index}
          id={entity.connector.id}
          flags={entity.connector.flags}
          locked={locked}
        />
      )}
      <Section title="Position (m)">
        {posField('x')}
        {posField('y')}
        {posField('z')}
      </Section>
      <Section title="Rotation (°)">
        {rotField('x')}
        {rotField('y')}
        {rotField('z')}
      </Section>
      <Section title="Scale">
        {scaleField('x')}
        {scaleField('y')}
        {scaleField('z')}
      </Section>
    </div>
  )
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-fg-subtle">{props.title}</span>
      <div className="grid grid-cols-3 gap-1">{props.children}</div>
    </div>
  )
}

function SubPartHeader({
  index,
  instanceId,
  templateId,
  locked,
}: {
  index: number
  instanceId: string
  templateId: string
  locked: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-0.5">
      <TextField
        size="sm"
        aria-label="Instance ID"
        value={draft ?? instanceId}
        inputClassName="font-mono"
        isDisabled={locked}
        onFocus={() => {
          setDraft(instanceId)
          pushUndo('edit instance ID', instanceId)
        }}
        onChange={(v) => {
          setDraft(v)
          if (v.trim()) setSubPartInstanceId(index, v.trim())
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="truncate text-xs text-fg-subtle" title={templateId}>
        {templateId}
      </span>
    </div>
  )
}

/**
 * Bulk relative-transform panel shown when 2+ entities are selected (SubParts,
 * connectors, kittens — any mix). Each group applies a delta to EVERY selected
 * entity: Move adds the same offset, Scale multiplies each one's scale in place,
 * and Rotate spins them around the shared centroid. Deltas are committed on Apply
 * (single undo step) and reset afterward.
 */
function BulkTransformPanel() {
  const refs = useStore($selectedRefs)
  const scaleMode = useStore($bulkScaleMode)
  useStore($layerView) // re-render when lock state changes
  const anyLocked = refs.some((r) => isLayerLocked(r.layerId))

  const bulkDetail = refs.length === 1 ? refs[0].name : `${refs.length} items`

  const applyMove = (delta: [number, number, number]) => {
    if (refs.length === 0) return
    pushUndo('move', bulkDetail)
    const d = { x: delta[0], y: delta[1], z: delta[2] }
    updateSelectedTransforms(
      refs.map((r) => ({
        kind: r.kind,
        index: r.index,
        transform: translatedTransform(r.transform, d),
      })),
    )
  }

  const applyRotate = (deg: [number, number, number]) => {
    if (refs.length === 0) return
    pushUndo('rotate', bulkDetail)
    const deltaQuat = quatFromEulerDeg({ x: deg[0], y: deg[1], z: deg[2] })
    const origin = centroidOf(refs.map((r) => r.transform.position))
    updateSelectedTransforms(
      refs.map((r) => ({
        kind: r.kind,
        index: r.index,
        transform: rotatedAroundOriginTransform(r.transform, deltaQuat, origin),
      })),
    )
  }

  const applyScale = (factor: [number, number, number]) => {
    if (refs.length === 0) return
    pushUndo('scale', bulkDetail)
    const f = { x: factor[0], y: factor[1], z: factor[2] }
    const origin = scaleMode === 'smart' ? centroidOf(refs.map((r) => r.transform.position)) : null
    updateSelectedTransforms(
      refs.map((r) => ({
        kind: r.kind,
        index: r.index,
        transform: origin
          ? scaledAroundOriginTransform(r.transform, f, origin)
          : scaledInPlaceTransform(r.transform, f),
      })),
    )
  }

  return (
    <div className={panelClass}>
      <span className="font-mono text-sm">{refs.length} items selected</span>
      <VectorApply
        title="Move by (m)"
        defaultValue={[0, 0, 0]}
        isDisabled={anyLocked}
        onApply={applyMove}
      />
      <VectorApply
        title="Rotate by (°) around centroid"
        defaultValue={[0, 0, 0]}
        isDisabled={anyLocked}
        onApply={applyRotate}
      />
      <div className="flex flex-col gap-1">
        <VectorApply
          title={scaleMode === 'smart' ? 'Scale by (×) around centroid' : 'Scale by (×) in place'}
          defaultValue={[1, 1, 1]}
          isDisabled={anyLocked}
          onApply={applyScale}
        />
        <Switch
          isSelected={scaleMode === 'smart'}
          isDisabled={anyLocked}
          onChange={(on) => $bulkScaleMode.set(on ? 'smart' : 'inPlace')}
        >
          Scale positions too (smart)
        </Switch>
      </div>
    </div>
  )
}

/**
 * Three numeric inputs (X/Y/Z) plus an Apply button. Holds local string drafts so
 * the user can type freely; on Apply it parses each (falling back to the default
 * per axis), invokes `onApply`, then resets the drafts to the default.
 */
function VectorApply(props: {
  title: string
  defaultValue: [number, number, number]
  isDisabled?: boolean
  onApply: (value: [number, number, number]) => void
}) {
  const { title, defaultValue, isDisabled, onApply } = props
  const initial = defaultValue.map(fmt) as [string, string, string]
  const [drafts, setDrafts] = useState<[string, string, string]>(initial)

  const setAxis = (axis: number, value: string) => {
    setDrafts((prev) => {
      const next = [...prev] as [string, string, string]
      next[axis] = value
      return next
    })
  }

  const apply = () => {
    const parsed = drafts.map((s, i) => {
      const n = Number.parseFloat(s)
      return Number.isFinite(n) ? n : defaultValue[i]
    }) as [number, number, number]
    onApply(parsed)
    setDrafts(initial)
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-fg-subtle">{title}</span>
      <div className="flex items-center gap-1">
        {(['X', 'Y', 'Z'] as const).map((label, i) => (
          <label key={label} className="flex flex-1 items-center gap-1">
            <span className="w-3 text-xs text-fg-subtle">{label}</span>
            <TextField
              size="sm"
              type="number"
              inputMode="decimal"
              aria-label={`${title} ${label}`}
              value={drafts[i]}
              inputClassName="font-mono"
              onChange={(v) => setAxis(i, v)}
            />
          </label>
        ))}
        <Button size="sm" isDisabled={isDisabled} onPress={apply}>
          Apply
        </Button>
      </div>
    </div>
  )
}

function ConnectorHeader({
  index,
  id,
  flags,
  locked,
}: {
  index: number
  id: string
  flags: ConnectorFlag[]
  locked: boolean
}) {
  // Toggle one flag, re-emitting the full set in canonical order so the XML and
  // the inspector stay stable regardless of click order.
  const toggle = (flag: ConnectorFlag, on: boolean) => {
    const next = new Set(flags)
    if (on) next.add(flag)
    else next.delete(flag)
    setConnectorFlags(
      index,
      CONNECTOR_FLAGS.filter((f) => next.has(f)),
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="truncate font-mono text-sm" title={id}>
        {id}
      </span>
      <span className="text-xs uppercase tracking-wide text-fg-subtle">Flags</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {CONNECTOR_FLAGS.map((f) => (
          <Switch
            key={f}
            isSelected={flags.includes(f)}
            isDisabled={locked}
            onChange={(on) => toggle(f, on)}
          >
            {f}
          </Switch>
        ))}
      </div>
    </div>
  )
}
