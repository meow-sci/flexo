import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { ListBoxItem } from 'react-aria-components'
import { Cat, ChevronDown, ChevronUp, Eye } from 'lucide-react'
import { Button, Chip, TextField, Switch, SectionTitle, Select } from './kit'
import { NumberField } from './NumberField'
import { isPartialNumber, parseNumericDraft } from './numberDraft'
import {
  $bulkScaleMode,
  addKittenAtSeat,
  aimIvaSeat,
  moveIvaSeat,
  pushUndo,
  $part,
  setColliderOwner,
  setColliderShape,
  setConnectorCapabilities,
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
import {
  COLLIDER_SHAPES,
  CONNECTOR_CAPABILITIES,
  CONNECTOR_FLAGS,
  type ColliderShape,
  type ConnectorCapability,
  type ConnectorFlag,
  type IvaSeat,
  type PartCollider,
  type Vec3,
} from '../ksa/types'
import { colliderSizeLabels, type ColliderSizeLabel } from '../ksa/colliderSize'
import { colliderLocalFromWorld, colliderWorld } from '../three/coords'
import {
  $colliderSettings,
  $coverageReport,
  clearCoverageReport,
  requestColliderFit,
  requestCoverageCheck,
  setColliderSettings,
} from '../state/colliderStore'
import { requestIvaSeatAim } from '../state/ivaSeatStore'
import { enterSeatView } from '../state/ivaStore'
import { SEAT_LOCAL_UP, seatAxesFromRotation, seatRotationFromAxes } from '../ksa/ivaSeatAxes'
import { formatG6 } from '../ksa/formatG6'
import { $catalogIndex } from '../state/catalogStore'
import { resolveInternal } from '../ksa/modExport'
import { DEG2RAD, RAD2DEG, fmt } from './format'

const panelClass = 'flex flex-col gap-2 rounded-xl border border-border bg-panel p-2'

type Axis = 'x' | 'y' | 'z'

/**
 * Numeric transform inspector for the selected entity (SubPart, connector, collider or
 * IVA seat). Two-way bound with the 3D gizmo: both edit the SAME store, so typing moves
 * the model live and gizmo drags update these fields live. Rotation is shown in degrees
 * but stored/exported in radians. Connectors expose their connection Flags.
 *
 * Two kinds read differently in the third numeric group:
 *  - a **collider**'s `scale` IS its outer size in METERS (KSA colliders have no scale
 *    field — see {@link PartCollider}), so the group is labelled "Size (m)" with per-shape
 *    labels, and only the axes that shape can independently control are shown;
 *  - an **IVA seat** has no size at all (`<IVASeat>` is position + two axes, and the store
 *    pins `scale` to (1,1,1)), so the group is omitted entirely rather than shown inert.
 */
export function TransformInspector() {
  const count = useStore($selectionCount)
  const entity = useStore($selectedEntity)
  useStore($layerView) // re-render when lock state changes
  if (count > 1) return <BulkTransformPanel />
  if (!entity) return null

  const target =
    entity.kind === 'subpart'
      ? entity.placement
      : entity.kind === 'connector'
        ? entity.connector
        : entity.kind === 'collider'
          ? entity.collider
          : entity.seat
  const locked = isLayerLocked(target.layerId)
  const transform = target

  const commit = (mutate: (t: PlacementTransform) => void) => {
    const next: PlacementTransform = {
      position: { ...transform.position },
      rotation: { ...transform.rotation },
      scale: { ...transform.scale },
    }
    mutate(next)
    updateSelectedTransform(next)
  }

  const entityName =
    entity.kind === 'subpart'
      ? entity.placement.instanceId
      : entity.kind === 'connector'
        ? entity.connector.id
        : entity.kind === 'collider'
          ? entity.collider.id
          : entity.seat.id

  const posField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={transform.position[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('move', entityName)}
      onCommit={(n) => commit((t) => (t.position[axis] = n))}
    />
  )
  const rotField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={transform.rotation[axis] * RAD2DEG}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('rotate', entityName)}
      onCommit={(deg) => commit((t) => (t.rotation[axis] = deg * DEG2RAD))}
    />
  )
  const scaleField = (axis: Axis, label?: ColliderSizeLabel) => (
    <NumberField
      label={label?.short ?? axis.toUpperCase()}
      ariaLabel={label?.full}
      value={transform.scale[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('scale', entityName)}
      onCommit={(n) => commit((t) => (t.scale[axis] = n))}
    />
  )
  // A collider's size is normalized per shape on write (a cylinder's X and Z are one
  // diameter), so only the independently-editable axes get a field.
  const sizeLabels = entity.kind === 'collider' ? colliderSizeLabels(entity.collider.shape) : null

  return (
    <div className={panelClass}>
      {entity.kind === 'subpart' ? (
        <SubPartHeader
          index={entity.index}
          instanceId={entity.placement.instanceId}
          templateId={entity.placement.subPartTemplateId}
          locked={locked}
        />
      ) : entity.kind === 'connector' ? (
        <ConnectorHeader
          index={entity.index}
          id={entity.connector.id}
          flags={entity.connector.flags}
          capabilities={entity.connector.capabilities}
          locked={locked}
        />
      ) : entity.kind === 'collider' ? (
        <ColliderHeader index={entity.index} collider={entity.collider} locked={locked} />
      ) : (
        <IvaSeatHeader index={entity.index} seat={entity.seat} locked={locked} />
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
      {/* An IVA seat has no third group at all: KSA's `<IVASeat>` carries no size, and the
          store pins the seat's scale to (1,1,1), so any field here would be a no-op. */}
      {entity.kind === 'ivaSeat' ? null : sizeLabels ? (
        <Section title="Size (m)">
          {sizeLabels[0] && scaleField('x', sizeLabels[0])}
          {sizeLabels[1] && scaleField('y', sizeLabels[1])}
          {sizeLabels[2] && scaleField('z', sizeLabels[2])}
        </Section>
      ) : (
        <Section title="Scale">
          {scaleField('x')}
          {scaleField('y')}
          {scaleField('z')}
        </Section>
      )}
    </div>
  )
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <SectionTitle>{props.title}</SectionTitle>
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
    // Drop keystrokes that can't become a number, but keep partial entries ('-', '0.').
    if (!isPartialNumber(value)) return
    setDrafts((prev) => {
      const next = [...prev] as [string, string, string]
      next[axis] = value
      return next
    })
  }

  const apply = () => {
    const parsed = drafts.map((s, i) => parseNumericDraft(s) ?? defaultValue[i]) as [
      number,
      number,
      number,
    ]
    onApply(parsed)
    setDrafts(initial)
  }

  return (
    <div className="flex flex-col gap-1">
      <SectionTitle>{title}</SectionTitle>
      <div className="flex items-center gap-1">
        {(['X', 'Y', 'Z'] as const).map((label, i) => (
          <label key={label} className="flex flex-1 items-center gap-1">
            <span className="w-3 text-xs text-fg-subtle">{label}</span>
            <TextField
              size="sm"
              // must inputMode="url" so negative numbers can be managed on mobile devices, numeric/decimal/integer dont show "-" key
              inputMode="url"
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
  capabilities,
  locked,
}: {
  index: number
  id: string
  flags: ConnectorFlag[]
  capabilities: ConnectorCapability[]
  locked: boolean
}) {
  // Toggle one flag, re-emitting the full set in canonical order so the XML and
  // the inspector stay stable regardless of click order.
  const toggleFlag = (flag: ConnectorFlag, on: boolean) => {
    const next = new Set(flags)
    if (on) next.add(flag)
    else next.delete(flag)
    setConnectorFlags(
      index,
      CONNECTOR_FLAGS.filter((f) => next.has(f)),
    )
  }
  const toggleCapability = (cap: ConnectorCapability, on: boolean) => {
    const next = new Set(capabilities)
    if (on) next.add(cap)
    else next.delete(cap)
    setConnectorCapabilities(
      index,
      CONNECTOR_CAPABILITIES.filter((c) => next.has(c)),
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="truncate font-mono text-sm" title={id}>
        {id}
      </span>
      <SectionTitle>Flags</SectionTitle>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {CONNECTOR_FLAGS.map((f) => (
          <Switch
            key={f}
            isSelected={flags.includes(f)}
            isDisabled={locked}
            onChange={(on) => toggleFlag(f, on)}
          >
            {f}
          </Switch>
        ))}
      </div>
      <SectionTitle>Capabilities</SectionTitle>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {CONNECTOR_CAPABILITIES.map((c) => (
          <Switch
            key={c}
            isSelected={capabilities.includes(c)}
            isDisabled={locked}
            onChange={(on) => toggleCapability(c, on)}
          >
            {c}
          </Switch>
        ))}
      </div>
      <p className="text-xs leading-snug text-fg-subtle">
        None = electricity + service fluid only. Add <b>BulkFluid</b> for main-engine propellant,{' '}
        <b>SolidMotorCase</b> to stack SRB segments, <b>DecouplerJoint</b> on a decoupler&rsquo;s
        connector.
      </p>
    </div>
  )
}

/**
 * Header for a selected collider: its id, the primitive shape, the owner it travels with,
 * and a one-click refit.
 *
 * **Owner** is the load-bearing control. `Part (assembly)` emits the shape under
 * `<PartGameData>` in the Part's own frame; picking a SubPart template emits it under that
 * template's `<SubPartGameData>`, where it applies to EVERY placement of that template and
 * follows joint animation. KSA has no per-instance collider, so the wording says so
 * explicitly rather than letting the user assume it attaches to the one they clicked.
 */
function ColliderHeader({
  index,
  collider,
  locked,
}: {
  index: number
  collider: PartCollider
  locked: boolean
}) {
  const part = useStore($part)
  // Every DISTINCT template actually placed in the part is a candidate owner.
  const templates = [...new Set(part.placements.map((p) => p.subPartTemplateId))].sort()
  const owner = collider.ownerTemplateId
  const instances = owner ? part.placements.filter((p) => p.subPartTemplateId === owner).length : 0
  // KSA composes only position + rotation, so a non-unit placement scale silently halves
  // (or doubles) the collider relative to what you see — warn rather than compensate.
  /**
   * Re-homes the collider, CONVERTING its transform through the old and new owners'
   * placements so it stays where the user last saw it. Without this, switching owner
   * would reinterpret the same numbers in a different frame and the shape would jump.
   * Falls back to a plain re-home when a frame is unavailable (an unplaced template).
   */
  const changeOwner = (next: string | null) => {
    const from = owner ? part.placements.find((p) => p.subPartTemplateId === owner) : null
    const to = next ? part.placements.find((p) => p.subPartTemplateId === next) : null
    const world = from ? colliderWorld(collider, from) : collider
    setColliderOwner(index, next, to ? colliderLocalFromWorld(world, to) : world)
  }

  const scaledOwner =
    owner != null &&
    part.placements.some(
      (p) =>
        p.subPartTemplateId === owner && (p.scale.x !== 1 || p.scale.y !== 1 || p.scale.z !== 1),
    )

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-sm">{collider.id}</span>
        <Button
          size="sm"
          variant="ghost"
          isDisabled={locked}
          onPress={() => requestColliderFit(collider.shape, { kind: 'existing', index })}
        >
          Fit to selection
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Select
          size="sm"
          aria-label="Collider shape"
          value={collider.shape}
          isDisabled={locked}
          onChange={(key) => setColliderShape(index, key as ColliderShape)}
        >
          {COLLIDER_SHAPES.map((shape) => (
            <ListBoxItem key={shape} id={shape}>
              {shape}
            </ListBoxItem>
          ))}
        </Select>
        <Select
          size="sm"
          aria-label="Collider owner"
          value={owner ?? PART_OWNER_KEY}
          isDisabled={locked}
          onChange={(key) => changeOwner(key === PART_OWNER_KEY ? null : String(key))}
        >
          <ListBoxItem id={PART_OWNER_KEY}>Part (assembly)</ListBoxItem>
          <>
            {templates.map((t) => (
              <ListBoxItem key={t} id={t}>
                {t.split('_').pop() || t}
              </ListBoxItem>
            ))}
          </>
        </Select>
      </div>
      {owner != null && (
        <span className="text-xs text-fg-subtle">
          {instances === 0
            ? 'Owner template is not placed — this collider is dead data.'
            : `Applies to all ${instances} placement${instances === 1 ? '' : 's'} of this template; follows joint animation.`}
        </span>
      )}
      {scaledOwner && (
        <span className="text-xs text-warn">
          KSA ignores placement scale for colliders — this owner has a non-unit scale, so the
          in-game size will not match the mesh.
        </span>
      )}
      <CoveragePanel />
    </div>
  )
}

/**
 * On-demand "how good is my approximation?" readout for the WHOLE collision volume (not
 * just the selected shape). Manual rather than live: a vertex-precision sample of a real
 * part is tens of thousands of points tested against every collider.
 *
 * Gaps and bloat pull in opposite directions — geometry outside every collider clips
 * through the world, while collider volume far beyond the mesh is an invisible wall AND
 * inflates the vehicle bounding box KSA derives from the collider compound.
 */
function CoveragePanel() {
  const report = useStore($coverageReport)
  const settings = useStore($colliderSettings)
  const pct = report ? Math.round(report.fraction * 1000) / 10 : 0
  const missing = report ? report.sampled - report.covered : 0

  return (
    <div className="flex flex-col gap-0.5 border-t border-border pt-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-fg-subtle">Coverage</span>
        <div className="flex items-center gap-1">
          {report && (
            <Button size="sm" variant="ghost" onPress={() => clearCoverageReport()}>
              Clear
            </Button>
          )}
          <Button size="sm" variant="ghost" onPress={() => requestCoverageCheck()}>
            Check
          </Button>
        </div>
      </div>
      {report && (
        <>
          <span className={missing === 0 ? 'text-xs text-fg-subtle' : 'text-xs text-warn'}>
            {pct}% of {report.sampled} sample points covered
            {missing > 0 && ` — ${missing} outside every collider`}
          </span>
          {report.bloat != null && (
            <span className="text-xs text-fg-subtle">
              Collider volume {report.bloat.toFixed(2)}× the mesh bounds
            </span>
          )}
          {report.uncovered.length > 0 && (
            <span className="text-xs text-fg-subtle">Gaps marked in red in the viewport.</span>
          )}
        </>
      )}
      {/* Bounding-box corners are 8 points per mesh — fast, but far too coarse to trust a
          coverage number from. Per-vertex walks the whole buffer and is the honest answer.
          Also drives fitting, where it matters for rotated/irregular geometry. */}
      <Switch
        isSelected={settings.precision === 'vertex'}
        onChange={(on) => setColliderSettings({ precision: on ? 'vertex' : 'bbox' })}
      >
        <span className="text-xs text-fg-subtle">Sample every vertex (slower, accurate)</span>
      </Switch>
    </div>
  )
}

/**
 * The six axis-aligned aim presets. `+X` is called out as the nose because that is
 * KSA's own `<ForwardAxis>` default and the direction Core's capsule seats look.
 */
const AIM_PRESETS: readonly { id: string; label: string; forward: Vec3 }[] = [
  { id: '+x', label: '+X (nose)', forward: { x: 1, y: 0, z: 0 } },
  { id: '-x', label: '−X (tail)', forward: { x: -1, y: 0, z: 0 } },
  { id: '+y', label: '+Y', forward: { x: 0, y: 1, z: 0 } },
  { id: '-y', label: '−Y', forward: { x: 0, y: -1, z: 0 } },
  { id: '+z', label: '+Z', forward: { x: 0, y: 0, z: 1 } },
  { id: '-z', label: '−Z', forward: { x: 0, y: 0, z: -1 } },
]

/** `x, y, z` through the SAME G6 formatter the exporter writes the seat axes with. */
const fmtVec = (v: Vec3) => `${formatG6(v.x)}, ${formatG6(v.y)}, ${formatG6(v.z)}`

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

/** Cosine beyond which two unit axes count as parallel (KSA would NaN the camera). */
const PARALLEL_DOT = 0.999

/**
 * Header for a selected IVA seat — where KSA's `<IVASeat>` contract becomes visible.
 *
 * The element carries a position and a `<ForwardAxis>`/`<UpAxis>` PAIR, but flexo edits
 * seats with the same rotation gizmo as everything else, so the two vectors are shown
 * read-only: they are what actually ships, derived through `seatAxesFromRotation`.
 *
 * Seat ORDER is authored data, not an implementation detail — the game cycles seats in
 * document order with `C` and opens IVA on the first one (`IVAController.OnSwitchOn`) —
 * hence the reorder buttons and the badge on index 0.
 */
function IvaSeatHeader({ index, seat, locked }: { index: number; seat: IvaSeat; locked: boolean }) {
  const part = useStore($part)
  const catalogIndex = useStore($catalogIndex)
  const total = part.ivaSeats.length
  const { forward, up } = seatAxesFromRotation(seat.rotation)
  // KSA culls back faces unconditionally, so from a seat the surrounding hull is simply
  // not there: without interior-only geometry the seat looks straight out at space.
  const hasInterior = part.placements.some((p) =>
    resolveInternal(part, p.subPartTemplateId, catalogIndex.get(p.subPartTemplateId)),
  )

  /**
   * Re-aims the seat along `nextForward`, KEEPING the current up axis so a re-aim never
   * silently rolls the camera — except where that up would be (near) parallel to the new
   * forward, which `Camera.LookAtRotation` turns into NaN; then fall back to a
   * perpendicular default. A degenerate pair is never written: a null rotation is a no-op.
   */
  const aim = (nextForward: Vec3) => {
    const nextUp =
      Math.abs(dot(nextForward, up)) < PARALLEL_DOT
        ? up
        : Math.abs(dot(nextForward, SEAT_LOCAL_UP)) < PARALLEL_DOT
          ? SEAT_LOCAL_UP
          : { x: 0, y: 1, z: 0 }
    const rotation = seatRotationFromAxes(nextForward, nextUp)
    if (rotation) aimIvaSeat(index, rotation)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm">
          Seat {index + 1} of {total}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            aria-label="Move seat earlier in the cycle"
            isDisabled={locked || index === 0}
            onPress={() => moveIvaSeat(index, -1)}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            aria-label="Move seat later in the cycle"
            isDisabled={locked || index >= total - 1}
            onPress={() => moveIvaSeat(index, 1)}
          >
            <ChevronDown className="size-4" />
          </Button>
        </div>
      </div>
      {index === 0 && <Chip className="self-start text-accent">IVA opens on this seat</Chip>}
      {/* The game's editor has NO IVA preview, so this is the only way to check a seat
          before launching: sit in it and look around under the real clamps. Allowed even
          on a locked layer — it moves the camera, never the document. */}
      <Button size="sm" variant="secondary" onPress={() => enterSeatView(seat.id)}>
        <Eye className="size-4" />
        Sit in this seat
      </Button>
      {/* Editor-only aide (never exported) — a body at the seat makes eye height and head
          clearance judgeable. Placed with the seat's yaw only; a kitten stands upright.
          Allowed on a locked layer: it adds a kitten, it never touches the seat. */}
      <Button size="sm" variant="secondary" onPress={() => addKittenAtSeat(index)}>
        <Cat className="size-4" />
        Add kitten at this seat
      </Button>
      <p className="text-xs leading-snug text-fg-subtle">
        Lands at the seat position facing the same way — but a kitten&apos;s origin is{' '}
        <b>not its eye point</b>, so expect to nudge it into place. Kittens are an editor aide and
        are never exported.
      </p>
      <p className="text-xs leading-snug text-fg-subtle">
        Seat order is exported data, not a list order: <b>C</b> cycles seats in this order in game,
        and the first one is where IVA opens.
      </p>
      <SectionTitle>Axes (exported)</SectionTitle>
      <span className="font-mono text-xs text-fg-subtle">
        Forward ({fmtVec(forward)}) · Up ({fmtVec(up)})
      </span>
      <SectionTitle>Aim</SectionTitle>
      <div className="flex flex-wrap gap-1">
        {AIM_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            size="sm"
            variant="ghost"
            isDisabled={locked}
            onPress={() => aim(preset.forward)}
          >
            {preset.label}
          </Button>
        ))}
        {/* Aiming at the selection needs its world-space centroid, which only the 3D scene
            has — publish an intent the way a collider fit request does. */}
        <Button
          size="sm"
          variant="ghost"
          isDisabled={locked}
          onPress={() => requestIvaSeatAim(index)}
        >
          Aim at selection
        </Button>
      </div>
      <p className="text-xs leading-snug text-fg-subtle">
        A seat can never look more than 90° away from its forward axis — two directions means two
        seats.
      </p>
      {!hasInterior && (
        <p className="text-xs leading-snug text-warning">
          No <code className="font-mono">&lt;Internal&gt;</code> geometry in this part — a seat here
          looks out at space. Mark interior SubParts with <b>Interior (IVA only)</b> in the Assets
          list.
        </p>
      )}
    </div>
  )
}

/** Select key standing in for `ownerTemplateId: null` (a Select can't carry null). */
const PART_OWNER_KEY = '\u0000part'
