import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Button, Input, Select, Surface } from '@cladd-ui/react'
import {
  $selectedIndices,
  pushUndo,
  setConnectorFlags,
  setSubPartInstanceId,
  updatePlacementTransforms,
  updateSelectedTransform,
} from '../state/editorStore'
import type { PlacementTransform } from '../state/editorStore'
import { $selectedEntity, $selectedPlacements } from '../state/selectors'
import { $layerView, isLayerLocked } from '../state/layerStore'
import {
  centroidOf,
  quatFromEulerDeg,
  rotatedAroundOriginTransform,
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
  disabled?: boolean
}) {
  const { value, onCommit, onInteractionStart, label, disabled } = props
  // `draft` is non-null only while the field is focused; otherwise the field
  // shows the live store value (so gizmo drags / undo update it). This avoids a
  // setState-in-effect sync.
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <label className="flex items-center gap-1">
      <span className="w-3 text-xs text-cladd-fg-softer">{label}</span>
      <Input
        size="sm"
        type="number"
        value={draft ?? fmt(value)}
        inputClassName="font-mono"
        disabled={disabled}
        onChange={(v: string) => {
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
 * Two-way bound with the 3D gizmo: both edit the SAME store
 * (updateSelectedTransform), so typing moves the model live and gizmo drags
 * update these fields live. Rotation is shown in degrees but stored/exported in
 * radians. Connectors additionally expose their connection Flags.
 */
export function TransformInspector() {
  const selectedIndices = useStore($selectedIndices)
  const entity = useStore($selectedEntity)
  useStore($layerView) // re-render when lock state changes
  if (selectedIndices.length > 1) return <BulkTransformPanel />
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

  const posField = (axis: Axis) => (
    <ScalarField
      label={axis.toUpperCase()}
      value={transform.position[axis]}
      disabled={locked}
      onInteractionStart={pushUndo}
      onCommit={(n) => commit((t) => (t.position[axis] = n))}
    />
  )
  const rotField = (axis: Axis) => (
    <ScalarField
      label={axis.toUpperCase()}
      value={transform.rotation[axis] * RAD2DEG}
      disabled={locked}
      onInteractionStart={pushUndo}
      onCommit={(deg) => commit((t) => (t.rotation[axis] = deg * DEG2RAD))}
    />
  )
  const scaleField = (axis: Axis) => (
    <ScalarField
      label={axis.toUpperCase()}
      value={transform.scale[axis]}
      disabled={locked}
      onInteractionStart={pushUndo}
      onCommit={(n) => commit((t) => (t.scale[axis] = n))}
    />
  )

  return (
    <Surface outline className="rounded-xl" contentClassName="flex flex-col gap-2 p-2">
      {entity.kind === 'subpart' ? (
        <SubPartHeader index={entity.index} instanceId={entity.placement.instanceId} templateId={entity.placement.subPartTemplateId} locked={locked} />
      ) : (
        <ConnectorHeader index={entity.index} id={entity.connector.id} flags={entity.connector.flags} locked={locked} />
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
    </Surface>
  )
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-cladd-fg-softer">{props.title}</span>
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
      <Input
        size="sm"
        value={draft ?? instanceId}
        inputClassName="font-mono"
        disabled={locked}
        onFocus={() => {
          setDraft(instanceId)
          pushUndo()
        }}
        onChange={(v: string) => {
          setDraft(v)
          if (v.trim()) setSubPartInstanceId(index, v.trim())
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="truncate text-xs text-cladd-fg-softer" title={templateId}>
        {templateId}
      </span>
    </div>
  )
}

/**
 * Bulk relative-transform panel shown when 2+ SubParts are selected. Each group
 * applies a delta to EVERY selected SubPart: Move adds the same offset, Scale
 * multiplies each one's scale in place, and Rotate spins them around the shared
 * centroid (matching the 3D gizmo). Deltas are committed on Apply (as a single
 * undo step) and the fields reset afterward so they don't accumulate.
 */
function BulkTransformPanel() {
  const selected = useStore($selectedPlacements)
  useStore($layerView) // re-render when lock state changes
  const anyLocked = selected.some(({ placement }) => isLayerLocked(placement.layerId))

  const applyMove = (delta: [number, number, number]) => {
    if (selected.length === 0) return
    pushUndo()
    const d = { x: delta[0], y: delta[1], z: delta[2] }
    updatePlacementTransforms(
      selected.map(({ index, placement }) => ({ index, transform: translatedTransform(placement, d) })),
    )
  }

  const applyRotate = (deg: [number, number, number]) => {
    if (selected.length === 0) return
    pushUndo()
    const deltaQuat = quatFromEulerDeg({ x: deg[0], y: deg[1], z: deg[2] })
    const origin = centroidOf(selected.map(({ placement }) => placement.position))
    updatePlacementTransforms(
      selected.map(({ index, placement }) => ({
        index,
        transform: rotatedAroundOriginTransform(placement, deltaQuat, origin),
      })),
    )
  }

  const applyScale = (factor: [number, number, number]) => {
    if (selected.length === 0) return
    pushUndo()
    const f = { x: factor[0], y: factor[1], z: factor[2] }
    updatePlacementTransforms(
      selected.map(({ index, placement }) => ({ index, transform: scaledInPlaceTransform(placement, f) })),
    )
  }

  return (
    <Surface outline className="rounded-xl" contentClassName="flex flex-col gap-2 p-2">
      <span className="font-mono text-sm">{selected.length} SubParts selected</span>
      <VectorApply title="Move by (m)" defaultValue={[0, 0, 0]} disabled={anyLocked} onApply={applyMove} />
      <VectorApply title="Rotate by (°) around centroid" defaultValue={[0, 0, 0]} disabled={anyLocked} onApply={applyRotate} />
      <VectorApply title="Scale by (×)" defaultValue={[1, 1, 1]} disabled={anyLocked} onApply={applyScale} />
    </Surface>
  )
}

/**
 * Three numeric inputs (X/Y/Z) plus an Apply button. Holds local string drafts
 * so the user can type freely; on Apply it parses each (falling back to the
 * default per axis), invokes `onApply`, then resets the drafts to the default.
 */
function VectorApply(props: {
  title: string
  defaultValue: [number, number, number]
  disabled?: boolean
  onApply: (value: [number, number, number]) => void
}) {
  const { title, defaultValue, disabled, onApply } = props
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
      <span className="text-xs uppercase tracking-wide text-cladd-fg-softer">{title}</span>
      <div className="flex items-center gap-1">
        {(['X', 'Y', 'Z'] as const).map((label, i) => (
          <label key={label} className="flex flex-1 items-center gap-1">
            <span className="w-3 text-xs text-cladd-fg-softer">{label}</span>
            <Input
              size="sm"
              type="number"
              value={drafts[i]}
              inputClassName="font-mono"
              onChange={(v: string) => setAxis(i, v)}
            />
          </label>
        ))}
        <Button size="sm" disabled={disabled} onClick={apply}>
          Apply
        </Button>
      </div>
    </div>
  )
}

function ConnectorHeader({ index, id, flags, locked }: { index: number; id: string; flags: ConnectorFlag; locked: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="truncate font-mono text-sm" title={id}>
        {id}
      </span>
      <label className="flex items-center gap-2">
        <span className="text-xs text-cladd-fg-softer">Flags</span>
        <Select
          size="sm"
          className="flex-1"
          title="Connector flags"
          options={CONNECTOR_FLAGS as ConnectorFlag[]}
          value={flags}
          disabled={locked}
          onChange={(v) => setConnectorFlags(index, v as ConnectorFlag)}
        >
          {flags}
        </Select>
      </label>
    </div>
  )
}
