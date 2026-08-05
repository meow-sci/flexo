import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { ListBoxItem } from 'react-aria-components';
import { Cat, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { Button, Chip, TextField, Switch, SectionTitle, Select } from './kit';
import { NumberField } from './NumberField';
import { isPartialNumber, parseNumericDraft } from './numberDraft';
import {
  $bulkScaleMode,
  $lightEditContext,
  addKittenAtSeat,
  aimIvaSeat,
  moveIvaSeat,
  pushUndo,
  $part,
  setColliderOwner,
  setColliderShape,
  setConnectorCapabilities,
  setConnectorFlags,
  setLightOwner,
  setLightPosition,
  setLightRayTracing,
  setLightRotation,
  setLightType,
  setSubPartInstanceId,
  updateLight,
  updateLightTransform,
  updateSelectedTransform,
  updateSelectedTransforms,
} from '../state/editorStore';
import type { PlacementTransform } from '../state/editorStore';
import { $selectedEntity, $selectionCount, $selectedRefs } from '../state/selectors';
import { $layerView, isLayerLocked } from '../state/layerStore';
import {
  centroidOf,
  groupScaledTransform,
  quatFromEulerDeg,
  rotatedAroundOriginTransform,
  translatedTransform,
} from '../three/bulkTransform';
import {
  COLLIDER_SHAPES,
  CONNECTOR_CAPABILITIES,
  CONNECTOR_FLAGS,
  type ColliderShape,
  type ConnectorCapability,
  type ConnectorFlag,
  type IvaSeat,
  type LightType,
  type PartCollider,
  type PartLight,
  type Vec3,
} from '../ksa/types';
import { colliderSizeLabels, type ColliderSizeLabel } from '../ksa/colliderSize';
import {
  colliderLocalFromWorld,
  colliderWorld,
  lightAimRotation,
  lightLocalFromWorld,
  lightWorld,
  lightWorldAim,
} from '../three/coords';
import { Field } from './GameDataSections';
import { LightFalloffCurve } from './LightFalloffCurve';
import { hexToRgb01, rgb01ToHex } from './colorHex';
import { PreciseNumberInput } from './PreciseNumberInput';
import { $lightSettings, DEFAULT_LIGHT_SETTINGS } from '../state/settingsStore';
import {
  $colliderSettings,
  $coverageReport,
  clearCoverageReport,
  requestColliderFit,
  requestCoverageCheck,
  setColliderSettings,
} from '../state/colliderStore';
import { requestIvaSeatAim } from '../state/ivaSeatStore';
import { enterSeatView } from '../state/ivaStore';
import { SEAT_LOCAL_UP, seatAxesFromRotation, seatRotationFromAxes } from '../ksa/ivaSeatAxes';
import { formatG6 } from '../ksa/formatG6';
import { $catalogIndex } from '../state/catalogStore';
import { resolveInternal } from '../ksa/modExport';
import { DEG2RAD, RAD2DEG, fmt } from './format';

const panelClass = 'flex flex-col gap-2 rounded-xl border border-border bg-panel p-2';

type Axis = 'x' | 'y' | 'z';

/**
 * Numeric transform inspector for the selected entity (SubPart, connector, collider,
 * IVA seat or light). Two-way bound with the 3D gizmo: both edit the SAME store, so
 * typing moves the model live and gizmo drags update these fields live. Rotation is
 * shown in degrees but stored/exported in radians. Connectors expose their connection
 * Flags.
 *
 * A **light** gets a wholly dedicated panel ({@link LightHeader}, plan §3.9) instead of
 * the generic groups: its position/aim live in TWO frames (owner + part, converted
 * through `coords.lightWorld`/`lightLocalFromWorld`), its aim fields are Spot-only, and
 * it carries the `<Light>` scalar editors — none of which the shared groups can express.
 *
 * Two remaining kinds read differently in the third numeric group:
 *  - a **collider**'s `scale` IS its outer size in METERS (KSA colliders have no scale
 *    field — see {@link PartCollider}), so the group is labelled "Size (m)" with per-shape
 *    labels, and only the axes that shape can independently control are shown;
 *  - an **IVA seat** has no size at all (`<IVASeat>` is position + two axes, and the store
 *    pins `scale` to (1,1,1)), so the group is omitted entirely rather than shown inert.
 */
export function TransformInspector() {
  const count = useStore($selectionCount);
  const entity = useStore($selectedEntity);
  useStore($layerView); // re-render when lock state changes
  if (count > 1) return <BulkTransformPanel />;
  if (!entity) return null;

  // Lights: the whole panel is the LightHeader — its owner-frame/part-frame groups
  // replace the generic Position/Rotation ones (and a light has no size, so nothing
  // from the shared groups below applies).
  if (entity.kind === 'light') {
    return (
      <div className={panelClass}>
        <LightHeader
          index={entity.index}
          light={entity.light}
          locked={isLayerLocked(entity.light.layerId)}
        />
      </div>
    );
  }

  const target =
    entity.kind === 'subpart'
      ? entity.placement
      : entity.kind === 'connector'
        ? entity.connector
        : entity.kind === 'collider'
          ? entity.collider
          : entity.seat;
  const locked = isLayerLocked(target.layerId);
  const transform = target;

  const commit = (mutate: (t: PlacementTransform) => void) => {
    const next: PlacementTransform = {
      position: { ...transform.position },
      rotation: { ...transform.rotation },
      scale: { ...transform.scale },
    };
    mutate(next);
    updateSelectedTransform(next);
  };

  const entityName =
    entity.kind === 'subpart'
      ? entity.placement.instanceId
      : entity.kind === 'connector'
        ? entity.connector.id
        : entity.kind === 'collider'
          ? entity.collider.id
          : entity.seat.id;

  const posField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={transform.position[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('move', entityName)}
      onCommit={(n) => commit((t) => (t.position[axis] = n))}
    />
  );
  const rotField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={transform.rotation[axis] * RAD2DEG}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('rotate', entityName)}
      onCommit={(deg) => commit((t) => (t.rotation[axis] = deg * DEG2RAD))}
    />
  );
  const scaleField = (axis: Axis, label?: ColliderSizeLabel) => (
    <NumberField
      label={label?.short ?? axis.toUpperCase()}
      ariaLabel={label?.full}
      value={transform.scale[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('scale', entityName)}
      onCommit={(n) => commit((t) => (t.scale[axis] = n))}
    />
  );
  // A collider's size is normalized per shape on write (a cylinder's X and Z are one
  // diameter), so only the independently-editable axes get a field.
  const sizeLabels = entity.kind === 'collider' ? colliderSizeLabels(entity.collider.shape) : null;

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
      {/* An IVA seat has no third group at all: KSA's `<IVASeat>` carries no size —
          the store pins its scale to (1,1,1), so any field here would be a no-op. */}
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
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <SectionTitle>{props.title}</SectionTitle>
      <div className="grid grid-cols-3 gap-1">{props.children}</div>
    </div>
  );
}

function SubPartHeader({
  index,
  instanceId,
  templateId,
  locked,
}: {
  index: number;
  instanceId: string;
  templateId: string;
  locked: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-0.5">
      <TextField
        size="sm"
        aria-label="Instance ID"
        value={draft ?? instanceId}
        inputClassName="font-mono"
        isDisabled={locked}
        onFocus={() => {
          setDraft(instanceId);
          pushUndo('edit instance ID', instanceId);
        }}
        onChange={(v) => {
          setDraft(v);
          if (v.trim()) setSubPartInstanceId(index, v.trim());
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="truncate text-xs text-fg-subtle" title={templateId}>
        {templateId}
      </span>
    </div>
  );
}

/**
 * Bulk relative-transform panel shown when 2+ entities are selected (SubParts,
 * connectors, kittens — any mix). Each group applies a delta to EVERY selected
 * entity: Move adds the same offset, Scale multiplies each one's scale in place,
 * and Rotate spins them around the shared centroid. Deltas are committed on Apply
 * (single undo step) and reset afterward.
 */
function BulkTransformPanel() {
  const refs = useStore($selectedRefs);
  const scaleMode = useStore($bulkScaleMode);
  useStore($layerView); // re-render when lock state changes
  const anyLocked = refs.some((r) => isLayerLocked(r.layerId));

  const bulkDetail = refs.length === 1 ? refs[0].name : `${refs.length} items`;

  const applyMove = (delta: [number, number, number]) => {
    if (refs.length === 0) return;
    pushUndo('move', bulkDetail);
    const d = { x: delta[0], y: delta[1], z: delta[2] };
    updateSelectedTransforms(
      refs.map((r) => ({
        kind: r.kind,
        id: r.id,
        transform: translatedTransform(r.transform, d),
      })),
    );
  };

  const applyRotate = (deg: [number, number, number]) => {
    if (refs.length === 0) return;
    pushUndo('rotate', bulkDetail);
    const deltaQuat = quatFromEulerDeg({ x: deg[0], y: deg[1], z: deg[2] });
    const origin = centroidOf(refs.map((r) => r.transform.position));
    updateSelectedTransforms(
      refs.map((r) => ({
        kind: r.kind,
        id: r.id,
        transform: rotatedAroundOriginTransform(r.transform, deltaQuat, origin),
      })),
    );
  };

  const applyScale = (factor: [number, number, number]) => {
    if (refs.length === 0) return;
    pushUndo('scale', bulkDetail);
    const f = { x: factor[0], y: factor[1], z: factor[2] };
    const origin = scaleMode === 'smart' ? centroidOf(refs.map((r) => r.transform.position)) : null;
    updateSelectedTransforms(
      refs.map((r) => ({
        kind: r.kind,
        id: r.id,
        transform: groupScaledTransform(r.kind, r.transform, f, origin),
      })),
    );
  };

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
  );
}

/**
 * Three numeric inputs (X/Y/Z) plus an Apply button. Holds local string drafts so
 * the user can type freely; on Apply it parses each (falling back to the default
 * per axis), invokes `onApply`, then resets the drafts to the default.
 */
function VectorApply(props: {
  title: string;
  defaultValue: [number, number, number];
  isDisabled?: boolean;
  onApply: (value: [number, number, number]) => void;
}) {
  const { title, defaultValue, isDisabled, onApply } = props;
  const initial = defaultValue.map(fmt) as [string, string, string];
  const [drafts, setDrafts] = useState<[string, string, string]>(initial);

  const setAxis = (axis: number, value: string) => {
    // Drop keystrokes that can't become a number, but keep partial entries ('-', '0.').
    if (!isPartialNumber(value)) return;
    setDrafts((prev) => {
      const next = [...prev] as [string, string, string];
      next[axis] = value;
      return next;
    });
  };

  const apply = () => {
    const parsed = drafts.map((s, i) => parseNumericDraft(s) ?? defaultValue[i]) as [
      number,
      number,
      number,
    ];
    onApply(parsed);
    setDrafts(initial);
  };

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
  );
}

function ConnectorHeader({
  index,
  id,
  flags,
  capabilities,
  locked,
}: {
  index: number;
  id: string;
  flags: ConnectorFlag[];
  capabilities: ConnectorCapability[];
  locked: boolean;
}) {
  // Toggle one flag, re-emitting the full set in canonical order so the XML and
  // the inspector stay stable regardless of click order.
  const toggleFlag = (flag: ConnectorFlag, on: boolean) => {
    const next = new Set(flags);
    if (on) next.add(flag);
    else next.delete(flag);
    setConnectorFlags(
      index,
      CONNECTOR_FLAGS.filter((f) => next.has(f)),
    );
  };
  const toggleCapability = (cap: ConnectorCapability, on: boolean) => {
    const next = new Set(capabilities);
    if (on) next.add(cap);
    else next.delete(cap);
    setConnectorCapabilities(
      index,
      CONNECTOR_CAPABILITIES.filter((c) => next.has(c)),
    );
  };
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
  );
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
  index: number;
  collider: PartCollider;
  locked: boolean;
}) {
  const part = useStore($part);
  // Every DISTINCT template actually placed in the part is a candidate owner.
  const templates = [...new Set(part.placements.map((p) => p.subPartTemplateId))].sort();
  const owner = collider.ownerTemplateId;
  const instances = owner ? part.placements.filter((p) => p.subPartTemplateId === owner).length : 0;
  // KSA composes only position + rotation, so a non-unit placement scale silently halves
  // (or doubles) the collider relative to what you see — warn rather than compensate.
  /**
   * Re-homes the collider, CONVERTING its transform through the old and new owners'
   * placements so it stays where the user last saw it. Without this, switching owner
   * would reinterpret the same numbers in a different frame and the shape would jump.
   * Falls back to a plain re-home when a frame is unavailable (an unplaced template).
   */
  const changeOwner = (next: string | null) => {
    const from = owner ? part.placements.find((p) => p.subPartTemplateId === owner) : null;
    const to = next ? part.placements.find((p) => p.subPartTemplateId === next) : null;
    const world = from ? colliderWorld(collider, from) : collider;
    setColliderOwner(index, next, to ? colliderLocalFromWorld(world, to) : world);
  };

  const scaledOwner =
    owner != null &&
    part.placements.some(
      (p) =>
        p.subPartTemplateId === owner && (p.scale.x !== 1 || p.scale.y !== 1 || p.scale.z !== 1),
    );

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
  );
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
  const report = useStore($coverageReport);
  const settings = useStore($colliderSettings);
  const pct = report ? Math.round(report.fraction * 1000) / 10 : 0;
  const missing = report ? report.sampled - report.covered : 0;

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
  );
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
];

/** `x, y, z` through the SAME G6 formatter the exporter writes the seat axes with. */
const fmtVec = (v: Vec3) => `${formatG6(v.x)}, ${formatG6(v.y)}, ${formatG6(v.z)}`;

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Cosine beyond which two unit axes count as parallel (KSA would NaN the camera). */
const PARALLEL_DOT = 0.999;

/**
 * The full inspector panel for a selected light (plan §3.9 — this replaces the generic
 * Position/Rotation groups entirely, see {@link TransformInspector}).
 *
 * A light's stored transform is in its OWNER frame (the Part assembly frame when
 * part-level), but the user works in the viewport — so position and aim are editable in
 * BOTH frames, converted through `coords.lightWorld`/`lightLocalFromWorld` using the
 * **context instance**: the placement whose marker was last clicked
 * (`$lightEditContext` — the SAME atom the gizmo's write-back frame comes from, which
 * is what keeps these fields and the gizmo in exact agreement). For a part-level light
 * the two frames coincide and only one position group is shown.
 *
 * The part-frame **aim vector** re-aims the Spot without wild rolling: the commit goes
 * through {@link lightAimRotation} (ΔQ = minimal rotation current→new aim, composed on
 * top of the current rotation — roll continuity, plan §3.9-7); a degenerate (≈zero)
 * vector is rejected by keeping the prior rotation. Aim fields are Spot-only — KSA
 * ignores a Point light's rotation (it still round-trips).
 *
 * **Owner** re-homes the light between `<PartGameData>` and a template's
 * `<SubPartGameData>`. The transform is converted through the old and new owners'
 * FIRST placements so the world pose doesn't jump ({@link setLightOwner} keeps the
 * store three.js-free, so the conversion lives here — the ColliderHeader precedent);
 * an unplaced NEW owner keeps the local numbers verbatim (the light renders in the
 * Part frame either way). Scalar fields mirror the SubPart-Data dialog's LightsSection
 * (which stays for template-scoped editing).
 */
function LightHeader({
  index,
  light,
  locked,
}: {
  index: number;
  light: PartLight;
  locked: boolean;
}) {
  const part = useStore($part);
  const editContext = useStore($lightEditContext);
  // Defaulted the way `settingsStore.lightSettings()` does — `persistentJSON` replays a
  // stored object verbatim, so a settings blob written before a field existed would read
  // it as `undefined` and the curve would silently pick a different exposure than the
  // viewport's shells.
  const storedViz = useStore($lightSettings);
  const viz = { ...DEFAULT_LIGHT_SETTINGS, ...storedViz };

  const isSpot = light.type === 'Spot';
  const owners = light.ownerTemplateId
    ? part.placements.filter((p) => p.subPartTemplateId === light.ownerTemplateId)
    : [];
  // The scene's context rule verbatim (last clicked, default 0, clamped) — one atom,
  // one rule, so the part-frame fields below and the gizmo can never disagree.
  const contextIndex = Math.max(0, Math.min(editContext[light.id] ?? 0, owners.length - 1));
  const contextOwner = owners[contextIndex] ?? null;
  const world = lightWorld(light, contextOwner);
  const worldAim = lightWorldAim(world.rotation);
  // Every DISTINCT template actually placed in the part is a candidate owner.
  const templates = [...new Set(part.placements.map((p) => p.subPartTemplateId))].sort();

  /**
   * Re-homes the light, CONVERTING its transform through the old and new owners' first
   * placements so the world pose the user sees doesn't jump (plan §3.8: instance 0 of
   * each). No `converted` for an unplaced NEW owner — the local numbers stay verbatim.
   */
  const changeOwner = (next: string | null) => {
    const from = light.ownerTemplateId
      ? part.placements.find((p) => p.subPartTemplateId === light.ownerTemplateId)
      : null;
    const to = next ? part.placements.find((p) => p.subPartTemplateId === next) : null;
    // The pose currently RENDERED: an unplaced/old-owner-less light draws in the Part
    // frame, which lightWorld(light, null) returns verbatim.
    const worldPose = lightWorld(light, from ?? null);
    setLightOwner(
      index,
      next,
      to ? lightLocalFromWorld(worldPose, to) : next === null ? worldPose : undefined,
    );
  };

  const localPosField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={light.position[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('move', light.id)}
      onCommit={(n) => setLightPosition(index, { ...light.position, [axis]: n })}
    />
  );
  const aimRotField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={light.rotation[axis] * RAD2DEG}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('rotate', light.id)}
      onCommit={(deg) => setLightRotation(index, { ...light.rotation, [axis]: deg * DEG2RAD })}
    />
  );
  const partPosField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={world.position[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('move', light.id)}
      onCommit={(n) =>
        updateLightTransform(
          index,
          lightLocalFromWorld(
            { ...world, position: { ...world.position, [axis]: n } },
            contextOwner,
          ),
        )
      }
    />
  );
  const aimField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={worldAim[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('rotate', light.id)}
      onCommit={(n) => {
        // Normalized on entry; a degenerate (≈zero) aim returns null — keep the prior
        // rotation rather than writing a NaN pose.
        const rotation = lightAimRotation(world.rotation, { ...worldAim, [axis]: n });
        if (!rotation) return;
        updateLightTransform(index, lightLocalFromWorld({ ...world, rotation }, contextOwner));
      }}
    />
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm">Light — {light.type}</span>
        <span className="truncate font-mono text-xs text-fg-subtle" title={light.id}>
          {light.id}
        </span>
      </div>
      <span className="truncate text-xs text-fg-subtle">
        {light.ownerTemplateId
          ? `via ${light.ownerTemplateId} · ${owners.length} instance${owners.length === 1 ? '' : 's'}`
          : 'part-level'}
      </span>
      {owners.length > 1 && (
        <span className="text-xs leading-snug text-fg-subtle">
          Editing through <span className="font-mono">{contextOwner?.instanceId}</span> — one light
          per template; edits affect every instance.
        </span>
      )}
      {light.ownerTemplateId != null && owners.length === 0 && (
        <span className="text-xs text-fg-subtle">
          Owner template is not placed — this light is dead data.
        </span>
      )}
      <div className="grid grid-cols-2 gap-1">
        <Select
          size="sm"
          aria-label="Light owner"
          value={light.ownerTemplateId ?? PART_OWNER_KEY}
          isDisabled={locked}
          onChange={(key) => changeOwner(key === PART_OWNER_KEY ? null : String(key))}
        >
          <ListBoxItem id={PART_OWNER_KEY}>Part level</ListBoxItem>
          <>
            {templates.map((t) => (
              <ListBoxItem key={t} id={t}>
                {t.split('_').pop() || t}
              </ListBoxItem>
            ))}
          </>
        </Select>
        <Select
          size="sm"
          aria-label="Light type"
          value={light.type}
          isDisabled={locked}
          onChange={(key) => setLightType(index, key as LightType)}
        >
          <ListBoxItem id="Spot">Spot</ListBoxItem>
          <ListBoxItem id="Point">Point</ListBoxItem>
        </Select>
      </div>
      {/* Owner-frame position — only when a placed owner gives it a distinct frame;
          part-level (and unplaced-owner) lights get the single group below instead. */}
      {contextOwner !== null && (
        <Section title="Position (m, owner frame)">
          {localPosField('x')}
          {localPosField('y')}
          {localPosField('z')}
        </Section>
      )}
      {isSpot && (
        <Section title={contextOwner ? 'Aim rotation (°, owner frame)' : 'Aim rotation (°)'}>
          {aimRotField('x')}
          {aimRotField('y')}
          {aimRotField('z')}
        </Section>
      )}
      {/* Part-frame position (== the stored numbers when no placed owner: for a
          part-level light the owner frame IS the part frame; an unplaced owner's light
          renders in the Part frame but its numbers stay owner-frame, hence the label). */}
      <Section
        title={
          light.ownerTemplateId && !contextOwner
            ? 'Position (m, owner frame)'
            : 'Position (m, part frame)'
        }
      >
        {partPosField('x')}
        {partPosField('y')}
        {partPosField('z')}
      </Section>
      {isSpot && (
        <Section title="Aim (part frame, unit vector)">
          {aimField('x')}
          {aimField('y')}
          {aimField('z')}
        </Section>
      )}
      <Field label="Range (m)">
        <PreciseNumberInput
          aria-label="Light range in meters"
          value={light.rangeM}
          min={0}
          isDisabled={locked}
          onInteractionStart={() => pushUndo('edit light', light.id)}
          onCommit={(n) => updateLight(index, { rangeM: n })}
        />
      </Field>
      <Field label="Intensity">
        <PreciseNumberInput
          aria-label="Light intensity"
          value={light.intensity}
          min={0}
          isDisabled={locked}
          onInteractionStart={() => pushUndo('edit light', light.id)}
          onCommit={(n) => updateLight(index, { intensity: n })}
        />
      </Field>
      <div className="flex items-center gap-2">
        <span className="text-xs text-fg-subtle">Color</span>
        <input
          type="color"
          aria-label="Light color"
          className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border bg-transparent"
          value={rgb01ToHex(light.color)}
          disabled={locked}
          onPointerDown={() => pushUndo('edit light', light.id)}
          onChange={(e) => updateLight(index, { color: hexToRgb01(e.target.value) })}
        />
      </div>
      {isSpot && (
        <>
          <Field label="Inner Angle (°, half-cone)">
            <PreciseNumberInput
              aria-label="Spot inner cone half-angle in degrees"
              value={light.innerAngleRad * RAD2DEG}
              min={0}
              max={90}
              isDisabled={locked}
              onInteractionStart={() => pushUndo('edit light', light.id)}
              onCommit={(deg) => updateLight(index, { innerAngleRad: deg * DEG2RAD })}
            />
          </Field>
          <Field label="Outer Angle (°, half-cone)">
            <PreciseNumberInput
              aria-label="Spot outer cone half-angle in degrees"
              value={light.outerAngleRad * RAD2DEG}
              min={0}
              max={90}
              isDisabled={locked}
              onInteractionStart={() => pushUndo('edit light', light.id)}
              onCommit={(deg) => updateLight(index, { outerAngleRad: deg * DEG2RAD })}
            />
          </Field>
        </>
      )}
      {/* What Range + Intensity actually mean, on the same exposure the viewport's
          coverage shells use — so the panel and the 3D volume agree by construction. */}
      <div className="flex flex-col gap-1">
        <SectionTitle>Falloff along the aim axis</SectionTitle>
        <LightFalloffCurve
          rangeM={light.rangeM}
          intensity={light.intensity}
          exposureMode={viz.exposureMode}
          vizExposure={viz.vizExposure}
        />
      </div>
      <Switch
        isSelected={light.rayTracing}
        isDisabled={locked}
        onChange={(on) => setLightRayTracing(index, on)}
      >
        Ray tracing (IVA only)
      </Switch>
    </div>
  );
}

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
  const part = useStore($part);
  const catalogIndex = useStore($catalogIndex);
  const total = part.ivaSeats.length;
  const { forward, up } = seatAxesFromRotation(seat.rotation);
  // KSA culls back faces unconditionally, so from a seat the surrounding hull is simply
  // not there: without interior-only geometry the seat looks straight out at space.
  const hasInterior = part.placements.some((p) =>
    resolveInternal(part, p.subPartTemplateId, catalogIndex.get(p.subPartTemplateId)),
  );

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
          : { x: 0, y: 1, z: 0 };
    const rotation = seatRotationFromAxes(nextForward, nextUp);
    if (rotation) aimIvaSeat(index, rotation);
  };

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
  );
}

/** Select key standing in for `ownerTemplateId: null` (a Select can't carry null). */
const PART_OWNER_KEY = '\u0000part';
