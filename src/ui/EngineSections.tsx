import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  Button,
  cn,
  Field,
  ItemCard,
  ListBoxItem,
  noteBox,
  Select,
  Switch,
  TextField,
  warningBox,
} from './kit';
import { PreciseNumberInput } from './PreciseNumberInput';
import { Vec3Field } from './Vec3Field';
import { FeedsField } from './FeedsField';
import { consumerOptionsOf, feedTargetsOf, unwiredConsumersOf } from '../state/feedTargets';
import { $part, pushUndo } from '../state/editorStore';
import {
  addCombustor,
  addNozzle,
  addPartCombustor,
  addPartNozzle,
  addPartRocket,
  addRocket,
  addRocketController,
  removeCombustor,
  removeGimbal,
  removeNozzle,
  removePartCombustor,
  removePartNozzle,
  removePartRocket,
  removeRocket,
  removeRocketController,
  addConsumerFeedWiring,
  addPartSolidGrainSegment,
  addPartSolidMotor,
  addPartSolidNozzle,
  addSubPartSolidGrainSegment,
  addSubPartSolidMotor,
  addSubPartSolidNozzle,
  autoWireUnwiredConsumers,
  removePartSolidGrainSegment,
  removePartSolidMotor,
  removePartSolidNozzle,
  removeSubPartSolidGrainSegment,
  removeSubPartSolidMotor,
  removeSubPartSolidNozzle,
  setPartSolidMotorFeeds,
  setSubPartSolidMotorFeeds,
  updatePartSolidGrainSegment,
  updatePartSolidMotor,
  updatePartSolidNozzle,
  updateSubPartSolidGrainSegment,
  updateSubPartSolidMotor,
  updateSubPartSolidNozzle,
  removeConsumerFeedWiring,
  setCombustorFeeds,
  setCombustorPlumbing,
  setCombustorReaction,
  setConsumerFeedWiringFeeds,
  setConsumerFeedWiringTarget,
  setGimbal,
  setPartCombustorFeeds,
  setPartCombustorPlumbing,
  setPartCombustorReaction,
  updateCombustor,
  updateNozzle,
  updatePartCombustor,
  updatePartNozzle,
  updatePartRocket,
  updateRocket,
  updateRocketController,
} from '../state/editorStore';
import {
  addCustomReaction,
  removeCustomReaction,
  updateCustomReaction,
} from '../state/editorStore';
import { UNIT_EPSILON } from '../ksa/engineValidation';
import { $allReactionIndex, $allReactions, ensureReactionsLoaded } from '../state/reactionStore';
import {
  mixtureRatioBounds,
  reactionDataToCustom,
  type ReactionData,
} from '../ksa/reactionCatalog';
import {
  createCustomReaction,
  DEFAULT_ENGINE_SOUND_ID,
  defaultReactionPlume,
  GRAIN_GEOMETRY_IDS,
  isCustomReactionExportable,
  KNOWN_REACTIONS,
  PLUME_TRAIL_IDS,
  VOLUMETRIC_EXHAUST_IDS,
  withDefaultReactionPlume,
  type Combustor,
  type CustomReaction,
  type DeLavalNozzle,
  type FeedSource,
  type PlumbingClass,
  type SolidGrainSegment,
  type SolidMotor,
  type SolidMotorNozzle,
  type ReactionCategory,
  type ReactionLutRowSpec,
  type ReactionReactantSpec,
  type EditingPart,
  type Gimbal,
  type Rocket,
  type RocketControllerKind,
  type SubPartGameData,
  type SubPartIdRef,
  type Vec3,
} from '../ksa/types';

const LABEL = 'text-xs text-fg-subtle';

/** Bar ⇄ Pa for the editable chamber-pressure field (stored SI Pa, shown in bar). */
const PA_PER_BAR = 1e5;

// ── shared pickers ───────────────────────────────────────────────────────────

/**
 * The default O/F ratio for a just-picked reaction: its `<DefaultMixtureRatio>`
 * for mixtures (KSA's designer does the same), null for fixed reactions (which
 * take no ratio). Falls back to the static Core snapshot when the live catalog
 * is absent.
 */
function defaultRatioFor(id: string, catalog: ReactionData[]): number | null {
  const live = catalog.find((c) => c.id === id);
  if (live) return live.kind === 'Mixture' ? live.defaultMixtureRatio : null;
  const known = KNOWN_REACTIONS.find((k) => k.id === id);
  return known?.defaultMixtureRatio ?? null;
}

/**
 * Reaction dropdown. Lists the loaded reaction catalog (nice names) when
 * available, falling back to the shipped Core snapshot; always keeps the current
 * value selectable even if it's a custom/unknown id. Picking a reaction also
 * reports its default O/F ratio (null for fixed reactions), the way KSA's own
 * designer resets the ratio on pick. Triggers a catalog load on mount.
 */
function ReactionSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string, mixtureRatio: number | null) => void;
}) {
  useEffect(() => {
    void ensureReactionsLoaded();
  }, []);
  const catalog = useStore($allReactions);
  const ids = catalog.length ? catalog.map((c) => c.id) : KNOWN_REACTIONS.map((k) => k.id);
  const labels = new Map(
    catalog.length
      ? catalog.map((c) => [c.id, c.name] as const)
      : KNOWN_REACTIONS.map((k) => [k.id, k.name] as const),
  );
  const options = value && !ids.includes(value) ? [value, ...ids] : ids;
  return (
    <Field label="Propellant (reaction)">
      <Select
        size="sm"
        aria-label="Reaction"
        placeholder="Select a propellant"
        value={value || null}
        onChange={(k) => onChange(String(k), defaultRatioFor(String(k), catalog))}
      >
        {options.map((id) => (
          <ListBoxItem key={id} id={id} textValue={id}>
            {labels.get(id) ?? id}
          </ListBoxItem>
        ))}
      </Select>
    </Field>
  );
}

/** A generic id dropdown that keeps the current value selectable even if absent. */
function IdSelect({
  label,
  ids,
  value,
  onChange,
  allowRoot,
}: {
  label: string;
  ids: string[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** When true, offers a "(root part)" option mapping to null (for instance refs). */
  allowRoot?: boolean;
}) {
  const ROOT = '\0root';
  const present = value ?? (allowRoot ? ROOT : '');
  const base = allowRoot ? [ROOT, ...ids] : ids;
  const options = value && !ids.includes(value) ? [value, ...base] : base;
  return (
    <Field label={label}>
      <Select
        size="sm"
        aria-label={label}
        placeholder="Select"
        value={present || null}
        onChange={(k) => onChange(k === ROOT ? null : String(k))}
      >
        {options.map((id) => (
          <ListBoxItem key={id} id={id} textValue={id === ROOT ? '(root part)' : id}>
            {id === ROOT ? '(root part)' : id}
          </ListBoxItem>
        ))}
      </Select>
    </Field>
  );
}

/** Instance dropdown over a part's placements (with a "(root part)" option). */
function InstanceSelect({
  label,
  part,
  value,
  onChange,
}: {
  label: string;
  part: EditingPart;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <IdSelect
      label={label}
      ids={part.placements.map((p) => p.instanceId)}
      value={value}
      onChange={onChange}
      allowRoot
    />
  );
}

// ── combustor + nozzle field groups (reused by per-SubPart + part-level) ───────

/** The editable fields of one combustor (feeds + plumbing, propellant + O/F ratio, chamber pressure, efficiencies, throttle). */
function CombustorFields({
  combustor,
  onSetReaction,
  onUpdate,
  onSetFeeds,
  onSetPlumbing,
}: {
  combustor: Combustor;
  onSetReaction: (id: string, mixtureRatio: number | null) => void;
  onUpdate: (patch: Partial<Combustor>) => void;
  onSetFeeds: (feeds: FeedSource[]) => void;
  onSetPlumbing: (plumbing: PlumbingClass) => void;
}) {
  const index = useStore($allReactionIndex);
  const part = useStore($part);
  const targets = feedTargetsOf(part);
  const reaction = index.get(combustor.reactionId);
  const known = KNOWN_REACTIONS.find((k) => k.id === combustor.reactionId);
  // Whether this reaction takes an O/F ratio: prefer the live catalog, then the
  // static snapshot; an unknown id with a ratio already set keeps the field editable.
  const isMixture = reaction
    ? reaction.kind === 'Mixture'
    : known
      ? known.kind === 'Mixture'
      : combustor.mixtureRatio != null;
  const bounds = reaction ? mixtureRatioBounds(reaction) : null;
  const ratioMin = bounds?.min ?? known?.ratioMin;
  const ratioMax = bounds?.max ?? known?.ratioMax;
  return (
    <>
      <Field label="Plumbing (which fluid network it draws through)">
        <Select
          size="sm"
          aria-label="Plumbing class"
          value={combustor.plumbing}
          onChange={(k) => onSetPlumbing(k as PlumbingClass)}
        >
          <ListBoxItem id="Bulk">Bulk (main engine)</ListBoxItem>
          <ListBoxItem id="Service">Service (RCS)</ListBoxItem>
        </Select>
      </Field>
      <p className="text-[11px] leading-snug text-fg-subtle">
        <b>Service</b> draws through connectors that carry ServiceFluid — the default. <b>Bulk</b>{' '}
        needs <code>BulkFluid</code> on every connector in the path.
      </p>
      <FeedsField
        label="Feeds from"
        feeds={combustor.feeds}
        connectorIds={targets.connectorIds}
        containers={targets.containers}
        allowParent
        onChange={onSetFeeds}
      />
      <ReactionSelect value={combustor.reactionId} onChange={onSetReaction} />
      {isMixture && (
        <Field label="Mixture ratio (O/F by mass — required for mixtures)">
          <PreciseNumberInput
            aria-label="Mixture ratio"
            value={combustor.mixtureRatio ?? 0}
            min={ratioMin}
            max={ratioMax}
            onInteractionStart={() => pushUndo('edit combustor', '')}
            onCommit={(n) => onUpdate({ mixtureRatio: n > 0 ? n : null })}
          />
        </Field>
      )}
      {isMixture && combustor.mixtureRatio == null && (
        <p className="text-[11px] leading-snug text-warning">
          A mixture reaction needs an O/F ratio — KSA refuses to load the engine without one.
        </p>
      )}
      <Field label="Chamber pressure (bar)">
        <PreciseNumberInput
          aria-label="Chamber pressure in bar"
          value={combustor.maxPressurePa / PA_PER_BAR}
          min={0}
          onInteractionStart={() => pushUndo('edit combustor', '')}
          onCommit={(bar) => onUpdate({ maxPressurePa: bar * PA_PER_BAR })}
        />
      </Field>
      <Field label="Thermal efficiency (%)">
        <PreciseNumberInput
          aria-label="Thermal efficiency percent"
          value={combustor.thermalEfficiency * 100}
          min={0}
          max={100}
          onInteractionStart={() => pushUndo('edit combustor', '')}
          onCommit={(pct) => onUpdate({ thermalEfficiency: clamp01(pct / 100) })}
        />
      </Field>
      <Field label="Minimum throttle (%, 100 = on/off only)">
        <PreciseNumberInput
          aria-label="Minimum throttle percent"
          value={combustor.minimumThrottle * 100}
          min={1}
          max={100}
          onInteractionStart={() => pushUndo('edit combustor', '')}
          onCommit={(pct) => onUpdate({ minimumThrottle: clampThrottle(pct / 100) })}
        />
      </Field>
      <Field label="Min pulse time (s, 0 = none — for RCS)">
        <PreciseNumberInput
          aria-label="Minimum pulse time in seconds"
          value={combustor.minimumPulseTimeS ?? 0}
          min={0}
          onInteractionStart={() => pushUndo('edit combustor', '')}
          onCommit={(s) => onUpdate({ minimumPulseTimeS: s > 0 ? s : null })}
        />
      </Field>
    </>
  );
}

/** The editable fields of one De Laval nozzle (geometry, efficiencies, exhaust placement, FX). */
function NozzleFields({
  nozzle,
  onUpdate,
  instanceCount,
}: {
  nozzle: DeLavalNozzle;
  onUpdate: (patch: Partial<DeLavalNozzle>) => void;
  instanceCount?: number;
}) {
  return (
    <RocketNozzleFields
      nozzle={nozzle}
      onUpdate={onUpdate}
      instanceCount={instanceCount}
      throat={
        <Field label="Area ratio (exit / throat)">
          <PreciseNumberInput
            aria-label="Nozzle area ratio"
            value={Number.isFinite(nozzle.areaRatio) ? nozzle.areaRatio : 0}
            min={1}
            onInteractionStart={() => pushUndo('edit nozzle', '')}
            onCommit={(ar) => onUpdate({ areaRatio: ar })}
          />
        </Field>
      }
    />
  );
}

/**
 * The editable fields of one solid-motor nozzle — identical to a De Laval nozzle MINUS
 * the area ratio: `SolidMotorNozzleTemplate.Create` sizes the throat itself as
 * `exitArea / 12`, and the schema has no AreaRatio slot to author.
 */
function SolidNozzleFields({
  nozzle,
  onUpdate,
  instanceCount,
}: {
  nozzle: SolidMotorNozzle;
  onUpdate: (patch: Partial<SolidMotorNozzle>) => void;
  instanceCount?: number;
}) {
  return (
    <RocketNozzleFields
      nozzle={nozzle}
      onUpdate={onUpdate}
      instanceCount={instanceCount}
      throat={
        <p className="text-[11px] leading-snug text-fg-subtle">
          KSA sizes the throat automatically (exit area ÷ 12) — solid nozzles have no area ratio.
        </p>
      }
    />
  );
}

/**
 * The nozzle fields both flavors share (`RocketNozzleTemplate` + exit geometry and
 * efficiencies). `throat` is the one slot they differ in.
 */
function RocketNozzleFields({
  nozzle,
  onUpdate,
  throat,
  instanceCount,
}: {
  nozzle: SolidMotorNozzle;
  onUpdate: (patch: Partial<SolidMotorNozzle>) => void;
  throat: React.ReactNode;
  /**
   * How many times this nozzle's owning SubPart template is placed — i.e. how many real
   * thrusters these ONE set of numbers drives. Omitted (or 1) for part-level nozzles and
   * template-scoped editing where there is nothing to disambiguate.
   */
  instanceCount?: number;
}) {
  const begin = () => pushUndo('edit nozzle', '');
  // The FX pair is ONE authoring decision (KSA nulls fall back to the physics pair
  // independently, but authoring them independently is a trap: the fields would read as
  // live while one of them changed nothing). Either field being set means "overridden";
  // the switch seeds both from the physics pair and clears both.
  const fxOverride = nozzle.fxExhaustLocation !== null || nozzle.fxExhaustDirection !== null;
  const fxLocation = nozzle.fxExhaustLocation ?? nozzle.exhaustLocation;
  const fxDirection = nozzle.fxExhaustDirection ?? nozzle.exhaustDirection;
  return (
    <>
      <Field label="Exit diameter (m)">
        <PreciseNumberInput
          aria-label="Exit diameter in meters"
          value={nozzle.exitDiameterM}
          min={0}
          onInteractionStart={begin}
          onCommit={(m) => onUpdate({ exitDiameterM: m })}
        />
      </Field>
      {throat}
      <Field label="Flow efficiency (%)">
        <PreciseNumberInput
          aria-label="Flow efficiency percent"
          value={nozzle.flowEfficiency * 100}
          min={0}
          max={100}
          onInteractionStart={begin}
          onCommit={(pct) => onUpdate({ flowEfficiency: clamp01(pct / 100) })}
        />
      </Field>
      <Field label="Expansion efficiency (%)">
        <PreciseNumberInput
          aria-label="Expansion efficiency percent"
          value={nozzle.expansionEfficiency * 100}
          min={0}
          max={100}
          onInteractionStart={begin}
          onCommit={(pct) => onUpdate({ expansionEfficiency: clamp01(pct / 100) })}
        />
      </Field>
      {instanceCount != null && instanceCount > 1 && (
        <div className={cn(noteBox, 'text-[11px] leading-snug')}>
          <span>
            These vectors are <b>shared by all {instanceCount} placements</b> of this SubPart — KSA
            instantiates this one <code>&lt;DeLavalNozzle&gt;</code> per placement, so the numbers
            below drive {instanceCount} thrusters at once. They are in each placement's OWN frame,
            so a rotated instance moves the opposite way in world space (that is what aims each
            thruster outward). To place thrusters independently, author a nozzle per thruster at{' '}
            <b>part level</b> instead.
          </span>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Exhaust location (m)</span>
        <Vec3Field
          value={nozzle.exhaustLocation}
          onInteractionStart={begin}
          onCommit={(axis, v) =>
            onUpdate({ exhaustLocation: { ...nozzle.exhaustLocation, [axis]: v } })
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Exhaust direction (unit; default −X)</span>
        <Vec3Field
          value={nozzle.exhaustDirection}
          onInteractionStart={begin}
          onCommit={(axis, v) =>
            onUpdate({ exhaustDirection: { ...nozzle.exhaustDirection, [axis]: v } })
          }
        />
        <p className="text-[11px] leading-snug text-fg-subtle">
          The direction gas LEAVES; thrust acts along −this. Stock bells point down −X in their own
          SubPart frame. Rotating the SubPart rotates mesh and exhaust together, so only this vector
          can fix a bell whose axis isn't −X.
        </p>
        <DirectionLengthWarning
          direction={nozzle.exhaustDirection}
          onNormalize={(unit) => {
            pushUndo('normalize direction', nozzle.id);
            onUpdate({ exhaustDirection: unit });
          }}
        />
      </div>
      <Switch
        isSelected={fxOverride}
        onChange={(on) => {
          pushUndo('edit nozzle', nozzle.id);
          onUpdate(
            on
              ? {
                  fxExhaustLocation: { ...nozzle.exhaustLocation },
                  fxExhaustDirection: { ...nozzle.exhaustDirection },
                }
              : { fxExhaustLocation: null, fxExhaustDirection: null },
          );
        }}
      >
        Override FX placement (plume ≠ thrust)
      </Switch>
      {fxOverride && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-panel-sunken p-2">
          <p className="text-[11px] leading-snug text-fg-subtle">
            Where the visible plume comes from, independent of where thrust is applied — stock uses
            it to cant an RCS plume off the hull while thrust stays axial. Off ⇒ both inherit the
            physics pair (KSA's own fallback). Cyan handle in the 3D viewport.
          </p>
          <div className="flex flex-col gap-1">
            <span className={LABEL}>FX location (m)</span>
            <Vec3Field
              value={fxLocation}
              onInteractionStart={begin}
              onCommit={(axis, v) => onUpdate({ fxExhaustLocation: { ...fxLocation, [axis]: v } })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={LABEL}>FX direction (any length — visual only)</span>
            <Vec3Field
              value={fxDirection}
              onInteractionStart={begin}
              onCommit={(axis, v) =>
                onUpdate({ fxExhaustDirection: { ...fxDirection, [axis]: v } })
              }
            />
          </div>
        </div>
      )}
      <Field label="FX exit diameter (m, 0 = match exit — visual only)">
        <PreciseNumberInput
          aria-label="FX exit diameter in meters"
          value={nozzle.fxExitDiameterM ?? 0}
          min={0}
          onInteractionStart={begin}
          onCommit={(m) => onUpdate({ fxExitDiameterM: m > 0 ? m : null })}
        />
      </Field>
      <Field label="Exhaust plume">
        <Select
          size="sm"
          aria-label="Exhaust plume template"
          value={defaultReactionPlume(nozzle.reactionPlumes)?.volumetricExhaustId ?? NONE}
          onChange={(k) =>
            onUpdate({
              reactionPlumes: withDefaultReactionPlume(nozzle.reactionPlumes, {
                volumetricExhaustId: k === NONE ? null : String(k),
              }),
            })
          }
        >
          <ListBoxItem id={NONE}>(none)</ListBoxItem>
          {VOLUMETRIC_EXHAUST_IDS.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
      </Field>
      <Field label="Plume trail (volumetric exhaust trail)">
        <Select
          size="sm"
          aria-label="Plume trail template"
          value={defaultReactionPlume(nozzle.reactionPlumes)?.plumeTrailId ?? NONE}
          onChange={(k) =>
            onUpdate({
              reactionPlumes: withDefaultReactionPlume(nozzle.reactionPlumes, {
                plumeTrailId: k === NONE ? null : String(k),
              }),
            })
          }
        >
          <ListBoxItem id={NONE}>(none)</ListBoxItem>
          {PLUME_TRAIL_IDS.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
      </Field>
      <Switch
        isSelected={nozzle.sound != null}
        onChange={(on) => {
          pushUndo('edit nozzle', '');
          onUpdate({ sound: on ? { action: 'On', soundId: DEFAULT_ENGINE_SOUND_ID } : null });
        }}
      >
        Engine sound
      </Switch>
      <Switch
        isSelected={nozzle.exhaustLight}
        onChange={(on) => {
          pushUndo('edit nozzle', '');
          onUpdate({ exhaustLight: on });
        }}
      >
        Exhaust light
      </Switch>
    </>
  );
}

/**
 * Warns when a nozzle's PHYSICS exhaust direction isn't unit-length, with a one-click fix.
 *
 * KSA applies thrust as `TotalThrust * -ExhaustDirection` **unnormalized**
 * (`decomp/KSA/VehicleUpdateState.cs:294`) and `Vector3Reference` does no normalizing at
 * load, so a `(0,0,-2)` direction silently doubles the engine's thrust and a `(0,0,-0.5)`
 * halves it — a bug with no in-game symptom other than wrong numbers. The value is left
 * VERBATIM rather than auto-corrected: that is how the XML is authored, imported content
 * must round-trip unchanged, and a silent rewrite would hide the very mistake being flagged.
 * (The 3D rotate handle always writes unit vectors, so this only ever fires on typed input
 * or an import.) Renders nothing when the length is already 1 within {@link UNIT_EPSILON}.
 */
function DirectionLengthWarning({
  direction,
  onNormalize,
}: {
  direction: Vec3;
  onNormalize: (unit: Vec3) => void;
}) {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (Math.abs(len - 1) <= UNIT_EPSILON) return null;
  const unit: Vec3 =
    len > 0
      ? { x: direction.x / len, y: direction.y / len, z: direction.z / len }
      : { x: -1, y: 0, z: 0 }; // KSA's default axis; a zero vector has no direction to keep
  return (
    <div className={cn(warningBox, 'flex items-start justify-between gap-2')}>
      <span className="min-w-0">
        {len > 0
          ? `Length ${len.toFixed(4)}, not 1 — KSA multiplies thrust by it, so this engine pushes ${len.toFixed(2)}× its rated thrust.`
          : 'Zero length — this nozzle applies no thrust and has no plume axis.'}
      </span>
      <Button size="sm" className="shrink-0" onPress={() => onNormalize(unit)}>
        Normalize
      </Button>
    </div>
  );
}

/**
 * The editable fields of one `<SolidMotor>` — an SRB case. The reaction must be a
 * `Category="Solid"` FixedReaction (`SolidMotorTemplate.Create` throws otherwise), and
 * the default chamber pressure must sit inside that reaction's stable range.
 */
function SolidMotorFields({
  motor,
  onUpdate,
  onSetFeeds,
}: {
  motor: SolidMotor;
  onUpdate: (patch: Partial<SolidMotor>) => void;
  onSetFeeds: (feeds: FeedSource[]) => void;
}) {
  const part = useStore($part);
  const catalog = useStore($allReactions);
  const targets = feedTargetsOf(part);
  const begin = () => pushUndo('edit solid motor', '');
  // Only solid reactions are offered — a liquid one is a hard load error, not a choice.
  const solidIds = (
    catalog.length
      ? catalog.filter((c) => c.category === 'Solid').map((c) => c.id)
      : KNOWN_REACTIONS.filter((k) => k.category === 'Solid').map((k) => k.id)
  ).concat(part.customReactions.filter((r) => r.category === 'Solid').map((r) => r.id));
  const options =
    motor.reactionId && !solidIds.includes(motor.reactionId)
      ? [motor.reactionId, ...solidIds]
      : solidIds;
  return (
    <>
      <Field label="Solid propellant (reaction)">
        <Select
          size="sm"
          aria-label="Solid motor reaction"
          placeholder="Select a solid propellant"
          value={motor.reactionId || null}
          onChange={(k) => {
            pushUndo('solid motor reaction', String(k));
            onUpdate({ reactionId: String(k) });
          }}
        >
          {options.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
      </Field>
      <Field label="Grain profile (the thrust curve over the burn)">
        <Select
          size="sm"
          aria-label="Grain geometry"
          value={motor.grainGeometryId || NONE}
          onChange={(k) => {
            pushUndo('grain profile', String(k));
            onUpdate({ grainGeometryId: k === NONE ? '' : String(k) });
          }}
        >
          <ListBoxItem id={NONE}>(library default)</ListBoxItem>
          {GRAIN_GEOMETRY_IDS.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
      </Field>
      <Field label="Default chamber pressure (bar)">
        <PreciseNumberInput
          aria-label="Default chamber pressure in bar"
          value={motor.defaultPressurePa / PA_PER_BAR}
          min={0}
          onInteractionStart={begin}
          onCommit={(bar) => onUpdate({ defaultPressurePa: bar * PA_PER_BAR })}
        />
      </Field>
      <Field label="Thermal efficiency (%)">
        <PreciseNumberInput
          aria-label="Thermal efficiency percent"
          value={motor.thermalEfficiency * 100}
          min={0}
          max={100}
          onInteractionStart={begin}
          onCommit={(pct) => onUpdate({ thermalEfficiency: clamp01(pct / 100) })}
        />
      </Field>
      <FeedsField
        label="Feeds from (grain segments + SolidMotorCase connectors)"
        feeds={motor.feeds}
        connectorIds={targets.connectorIds}
        containers={targets.containers}
        allowParent
        onChange={onSetFeeds}
      />
    </>
  );
}

/**
 * The editable fields of one `<SolidGrainSegment>` — a stackable propellant grain, and
 * the container an SRB's `<FeedsFrom Container>` addresses. Segments stack in the vehicle
 * editor across connectors that declare the `SolidMotorCase` capability.
 */
function SolidGrainSegmentFields({
  segment,
  onUpdate,
  onSetId,
}: {
  segment: SolidGrainSegment;
  onUpdate: (patch: Partial<SolidGrainSegment>) => void;
  onSetId: (id: string) => void;
}) {
  const begin = () => pushUndo('edit grain segment', '');
  return (
    <>
      <Field label="Feed id (reference it from a motor's Feeds from → Container)">
        <TextField
          size="sm"
          aria-label="Grain segment feed id"
          inputClassName="font-mono"
          value={segment.id}
          onFocus={begin}
          onChange={onSetId}
        />
      </Field>
      <Field label="Casing material id">
        <TextField
          size="sm"
          aria-label="Grain casing material id"
          inputClassName="font-mono"
          value={segment.wallMaterialId}
          onFocus={begin}
          onChange={(v) => onUpdate({ wallMaterialId: v })}
        />
      </Field>
      <Field label="Outer radius (m)">
        <PreciseNumberInput
          aria-label="Grain outer radius in meters"
          value={segment.outerRadiusM}
          min={0}
          onInteractionStart={begin}
          onCommit={(n) => onUpdate({ outerRadiusM: n })}
        />
      </Field>
      <Field label="Wall thickness (mm)">
        <PreciseNumberInput
          aria-label="Grain wall thickness in millimeters"
          value={segment.wallThicknessMm}
          min={0}
          onInteractionStart={begin}
          onCommit={(n) => onUpdate({ wallThicknessMm: n })}
        />
      </Field>
      <Field label="Length (m)">
        <PreciseNumberInput
          aria-label="Grain length in meters"
          value={segment.lengthM}
          min={0}
          onInteractionStart={begin}
          onCommit={(n) => onUpdate({ lengthM: n })}
        />
      </Field>
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Location offset (m, assembly frame)</span>
        <Vec3Field
          value={segment.locationAsmb}
          onInteractionStart={begin}
          onCommit={(axis, v) => onUpdate({ locationAsmb: { ...segment.locationAsmb, [axis]: v } })}
        />
      </div>
    </>
  );
}

const NONE = '\0none';
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clampThrottle = (n: number) => Math.min(1, Math.max(0.01, n));

// ── per-SubPart engine sections (used in the SubPart Data modal) ──────────────

/**
 * The reusable thrust-chamber editors for one SubPart template: its combustors,
 * nozzles, and the `<Rocket>` bindings that wire them. These travel with the mesh, so
 * every prefab reusing it inherits the engine (the controller + gimbals are per-part).
 */
export function SubPartEngineSection({ spd }: { spd: SubPartGameData }) {
  const part = useStore($part);
  const tid = spd.subPartTemplateId;
  // A <Rocket>'s <Core Id>/<Nozzle Id> may name either family, so both are offered
  // (mixing them is a load error, which engineValidation flags).
  const combustorIds = [...spd.combustors.map((c) => c.id), ...spd.solidMotors.map((m) => m.id)];
  const nozzleIds = [...spd.nozzles.map((n) => n.id), ...spd.solidNozzles.map((n) => n.id)];
  // How many real thrusters each nozzle here drives: KSA instantiates a SubPart-owned nozzle
  // once per placement of its template, so ONE set of exhaust vectors serves them all.
  const instanceCount = part.placements.filter((p) => p.subPartTemplateId === tid).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {spd.combustors.map((c, i) => (
          <ItemCard key={i} title={`Combustor — ${c.id}`} onRemove={() => removeCombustor(tid, i)}>
            <CombustorFields
              combustor={c}
              onSetReaction={(id, ratio) => setCombustorReaction(tid, i, id, ratio)}
              onUpdate={(patch) => updateCombustor(tid, i, patch)}
              onSetFeeds={(feeds) => setCombustorFeeds(tid, i, feeds)}
              onSetPlumbing={(p) => setCombustorPlumbing(tid, i, p)}
            />
          </ItemCard>
        ))}
        <Button size="sm" onPress={() => addCombustor(tid)} className="self-start">
          + Combustor
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {spd.nozzles.map((n, i) => (
          <ItemCard key={i} title={`Nozzle — ${n.id}`} onRemove={() => removeNozzle(tid, i)}>
            <NozzleFields
              nozzle={n}
              instanceCount={instanceCount}
              onUpdate={(patch) => updateNozzle(tid, i, patch)}
            />
          </ItemCard>
        ))}
        <Button size="sm" onPress={() => addNozzle(tid)} className="self-start">
          + Nozzle
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {spd.solidMotors.map((m, i) => (
          <ItemCard
            key={i}
            title={`Solid motor — ${m.id}`}
            onRemove={() => removeSubPartSolidMotor(tid, i)}
          >
            <SolidMotorFields
              motor={m}
              onUpdate={(patch) => updateSubPartSolidMotor(tid, i, patch)}
              onSetFeeds={(feeds) => setSubPartSolidMotorFeeds(tid, i, feeds)}
            />
          </ItemCard>
        ))}
        {spd.solidNozzles.map((n, i) => (
          <ItemCard
            key={i}
            title={`Solid nozzle — ${n.id}`}
            onRemove={() => removeSubPartSolidNozzle(tid, i)}
          >
            <SolidNozzleFields
              nozzle={n}
              instanceCount={instanceCount}
              onUpdate={(patch) => updateSubPartSolidNozzle(tid, i, patch)}
            />
          </ItemCard>
        ))}
        {spd.solidGrainSegments.map((g, i) => (
          <ItemCard
            key={i}
            title={`Grain segment — ${g.id}`}
            onRemove={() => removeSubPartSolidGrainSegment(tid, i)}
          >
            <SolidGrainSegmentFields
              segment={g}
              onUpdate={(patch) => updateSubPartSolidGrainSegment(tid, i, patch)}
              onSetId={(id) => updateSubPartSolidGrainSegment(tid, i, { id })}
            />
          </ItemCard>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onPress={() => addSubPartSolidMotor(tid)}>
            + Solid motor
          </Button>
          <Button size="sm" onPress={() => addSubPartSolidNozzle(tid)}>
            + Solid nozzle
          </Button>
          <Button size="sm" onPress={() => addSubPartSolidGrainSegment(tid)}>
            + Grain segment
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {spd.rockets.map((r, i) => (
          <ItemCard key={i} title={`Rocket — ${r.id}`} onRemove={() => removeRocket(tid, i)}>
            <RocketFields
              rocket={r}
              combustorIds={combustorIds}
              nozzleIds={nozzleIds}
              onUpdate={(patch) => updateRocket(tid, i, patch)}
            />
          </ItemCard>
        ))}
        <Button size="sm" onPress={() => addRocket(tid)} className="self-start">
          + Rocket
        </Button>
      </div>
    </div>
  );
}

/** Editor for one `<Rocket>`'s wiring: its id, core combustor, and nozzle list. */
function RocketFields({
  rocket,
  combustorIds,
  nozzleIds,
  onUpdate,
  part,
}: {
  rocket: Rocket;
  combustorIds: string[];
  nozzleIds: string[];
  onUpdate: (patch: Partial<Rocket>) => void;
  /** When present, nozzle/core refs can target other SubPart instances (gas-generator case). */
  part?: EditingPart;
}) {
  const setNozzleRef = (idx: number, ref: SubPartIdRef) => {
    const nozzles = rocket.nozzles.map((n, j) => (j === idx ? ref : n));
    onUpdate({ nozzles });
  };
  return (
    <>
      <Field label="Rocket id (referenced by the controller)">
        <TextField
          size="sm"
          aria-label="Rocket id"
          inputClassName="font-mono"
          value={rocket.id}
          onFocus={() => pushUndo('edit rocket', '')}
          onChange={(v) => onUpdate({ id: v })}
        />
      </Field>
      <IdSelect
        label="Core (combustor)"
        ids={combustorIds}
        value={rocket.core.id || null}
        onChange={(id) => onUpdate({ core: { ...rocket.core, id: id ?? '' } })}
      />
      {part && (
        <InstanceSelect
          label="Core lives on (SubPart instance)"
          part={part}
          value={rocket.core.subPartInstanceId}
          onChange={(s) => onUpdate({ core: { ...rocket.core, subPartInstanceId: s } })}
        />
      )}
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Nozzles</span>
        {rocket.nozzles.map((nz, j) => (
          <div key={j} className="flex items-end gap-2">
            <div className="flex-1">
              <IdSelect
                label={`Nozzle ${j + 1}`}
                ids={nozzleIds}
                value={nz.id || null}
                onChange={(id) => setNozzleRef(j, { ...nz, id: id ?? '' })}
              />
            </div>
            {part && (
              <div className="flex-1">
                <InstanceSelect
                  label="on instance"
                  part={part}
                  value={nz.subPartInstanceId}
                  onChange={(s) => setNozzleRef(j, { ...nz, subPartInstanceId: s })}
                />
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              onPress={() => onUpdate({ nozzles: rocket.nozzles.filter((_, k) => k !== j) })}
              aria-label={`Remove nozzle ${j + 1}`}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onPress={() =>
            onUpdate({ nozzles: [...rocket.nozzles, { id: '', subPartInstanceId: null }] })
          }
        >
          + Nozzle ref
        </Button>
      </div>
    </>
  );
}

// ── part-level engine sections (used in the Part Data modal) ──────────────────

/** All rocket ids in the part (per-SubPart + part-level) — what a controller can reference. */
function allRocketIds(part: EditingPart): string[] {
  const ids: string[] = [];
  for (const s of part.subPartGameData) for (const r of s.rockets) ids.push(r.id);
  for (const r of part.gameData.rockets) ids.push(r.id);
  return ids;
}

/** Part-level engine controllers — the modules that make the part fire. */
export function RocketControllersSection({ part }: { part: EditingPart }) {
  const controllers = part.gameData.rocketControllers;
  const rocketIds = allRocketIds(part);
  return (
    <div className="flex flex-col gap-2">
      {controllers.map((c, i) => (
        <ItemCard
          key={i}
          title={`${c.kind === 'thruster' ? 'Thruster' : 'Engine'} — ${c.id}`}
          onRemove={() => removeRocketController(i)}
        >
          <Field label="Controller id">
            <TextField
              size="sm"
              aria-label="Controller id"
              inputClassName="font-mono"
              value={c.id}
              onFocus={() => pushUndo('edit controller', '')}
              onChange={(v) => updateRocketController(i, { id: v })}
            />
          </Field>
          <Field label="Type">
            <Select
              size="sm"
              aria-label="Controller type"
              value={c.kind}
              onChange={(k) => updateRocketController(i, { kind: k as RocketControllerKind })}
            >
              <ListBoxItem id="engine">Engine (throttle + staging)</ListBoxItem>
              <ListBoxItem id="thruster">Thruster (RCS, pulsed)</ListBoxItem>
            </Select>
          </Field>
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Rockets driven</span>
            {c.rocketRefs.map((ref, j) => (
              <div key={j} className="flex items-end gap-2">
                <div className="flex-1">
                  <IdSelect
                    label={`Rocket ${j + 1}`}
                    ids={rocketIds}
                    value={ref.id || null}
                    onChange={(id) =>
                      updateRocketController(i, {
                        rocketRefs: c.rocketRefs.map((r, k) =>
                          k === j ? { ...r, id: id ?? '' } : r,
                        ),
                      })
                    }
                  />
                </div>
                <div className="flex-1">
                  <InstanceSelect
                    label="on instance"
                    part={part}
                    value={ref.subPartInstanceId}
                    onChange={(s) =>
                      updateRocketController(i, {
                        rocketRefs: c.rocketRefs.map((r, k) =>
                          k === j ? { ...r, subPartInstanceId: s } : r,
                        ),
                      })
                    }
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    updateRocketController(i, {
                      rocketRefs: c.rocketRefs.filter((_, k) => k !== j),
                    })
                  }
                  aria-label={`Remove rocket ref ${j + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onPress={() =>
                updateRocketController(i, {
                  rocketRefs: [...c.rocketRefs, { id: '', subPartInstanceId: null }],
                })
              }
            >
              + Rocket ref
            </Button>
          </div>
        </ItemCard>
      ))}
      <div className="flex gap-2">
        <Button size="sm" onPress={() => addRocketController('engine')} className="self-start">
          + Engine controller
        </Button>
        <Button size="sm" onPress={() => addRocketController('thruster')} className="self-start">
          + RCS controller
        </Button>
      </div>
    </div>
  );
}

/** Per-instance gimbal overlays (thrust-vectoring). */
/** Encodes a consumer choice as one Select key (a consumer id repeats across placements). */
function consumerKey(consumerId: string, subPartInstanceId: string | null): string {
  return `${subPartInstanceId ?? ''} ${consumerId}`;
}

/**
 * `<ConsumerFeedWiring>` editor — how this Part satisfies a placed SubPart's
 * `<FeedsFrom Parent="true"/>`. A reusable thrust chamber says "feed me from whatever
 * places me"; this section is where the Part answers with a real connector or container.
 * Without a matching entry KSA logs *"Consumer X feeds from its parent part, but Y has no
 * ConsumerFeedWiring wiring for it"* and the engine reaches no propellant.
 */
export function ConsumerFeedWiringSection({ part }: { part: EditingPart }) {
  const wiring = part.gameData.consumerFeedWiring;
  const consumers = consumerOptionsOf(part);
  const targets = feedTargetsOf(part);
  const unwired = unwiredConsumersOf(part);
  return (
    <div className="flex flex-col gap-2">
      {wiring.map((w, i) => (
        <ItemCard
          key={i}
          title={`Wiring — ${w.consumerId || '(no consumer)'}`}
          onRemove={() => removeConsumerFeedWiring(i)}
        >
          <Field label="Consumer (combustor / solid motor)">
            <Select
              size="sm"
              aria-label="Wired consumer"
              placeholder="Select a consumer"
              value={consumerKey(w.consumerId, w.subPartInstanceId) || null}
              onChange={(k) => {
                const opt = consumers.find(
                  (c) => consumerKey(c.consumerId, c.subPartInstanceId) === String(k),
                );
                if (opt) setConsumerFeedWiringTarget(i, opt.consumerId, opt.subPartInstanceId);
              }}
            >
              {/* Keep a consumer the part no longer carries selectable, so re-picking is
                  an explicit act rather than a silent retarget. */}
              {(consumers.some(
                (c) =>
                  consumerKey(c.consumerId, c.subPartInstanceId) ===
                  consumerKey(w.consumerId, w.subPartInstanceId),
              )
                ? consumers
                : [
                    {
                      consumerId: w.consumerId,
                      subPartInstanceId: w.subPartInstanceId,
                      defersToParent: false,
                      label: `${w.consumerId || '(none)'} — not found`,
                    },
                    ...consumers,
                  ]
              ).map((c) => (
                <ListBoxItem
                  key={consumerKey(c.consumerId, c.subPartInstanceId)}
                  id={consumerKey(c.consumerId, c.subPartInstanceId)}
                  textValue={c.label}
                >
                  {c.label}
                </ListBoxItem>
              ))}
            </Select>
          </Field>
          {/* A wiring entry may NOT itself defer to Parent (ConsumerFeedWiring.OnDataLoad). */}
          <FeedsField
            label="Feeds from"
            feeds={w.feeds}
            connectorIds={targets.connectorIds}
            containers={targets.containers}
            allowParent={false}
            onChange={(feeds) => setConsumerFeedWiringFeeds(i, feeds)}
          />
        </ItemCard>
      ))}
      {unwired.length > 0 && (
        <p className="text-[11px] leading-snug text-warning">
          {unwired.length} consumer{unwired.length === 1 ? '' : 's'} feed from the parent part with
          no wiring — KSA will log <i>&ldquo;has no ConsumerFeedWiring wiring for it&rdquo;</i> and
          they will reach no propellant.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onPress={() => addConsumerFeedWiring()}>
          + Feed wiring
        </Button>
        {unwired.length > 0 && (
          <Button size="sm" onPress={autoWireUnwiredConsumers}>
            Auto-wire unwired consumers
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Part-level solid rocket motor hardware — the SRB analogue of the gas-generator
 * section. A booster prefab authors its `<SolidMotor>` + `<SolidGrainSegment>` here and
 * (usually) reuses a shared thrust-assembly SubPart for the `<SolidMotorNozzle>`.
 */
export function PartSolidMotorSection({ part }: { part: EditingPart }) {
  const g = part.gameData;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-fg-subtle">
        A <code>&lt;Rocket&gt;</code> may bind ONLY solid parts or ONLY liquid ones, and a solid
        rocket needs at least one nozzle — KSA throws at load otherwise. Grain segments stack across
        connectors that declare <b>SolidMotorCase</b>.
      </p>
      <div className="flex flex-col gap-2">
        {g.solidMotors.map((m, i) => (
          <ItemCard
            key={i}
            title={`Solid motor — ${m.id}`}
            onRemove={() => removePartSolidMotor(i)}
          >
            <SolidMotorFields
              motor={m}
              onUpdate={(patch) => updatePartSolidMotor(i, patch)}
              onSetFeeds={(feeds) => setPartSolidMotorFeeds(i, feeds)}
            />
          </ItemCard>
        ))}
        {g.solidGrainSegments.map((seg, i) => (
          <ItemCard
            key={i}
            title={`Grain segment — ${seg.id}`}
            onRemove={() => removePartSolidGrainSegment(i)}
          >
            <SolidGrainSegmentFields
              segment={seg}
              onUpdate={(patch) => updatePartSolidGrainSegment(i, patch)}
              onSetId={(id) => updatePartSolidGrainSegment(i, { id })}
            />
          </ItemCard>
        ))}
        {g.solidNozzles.map((n, i) => (
          <ItemCard
            key={i}
            title={`Solid nozzle — ${n.id}`}
            onRemove={() => removePartSolidNozzle(i)}
          >
            <SolidNozzleFields nozzle={n} onUpdate={(patch) => updatePartSolidNozzle(i, patch)} />
          </ItemCard>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onPress={addPartSolidMotor}>
            + Solid motor
          </Button>
          <Button size="sm" onPress={addPartSolidGrainSegment}>
            + Grain segment
          </Button>
          <Button size="sm" onPress={addPartSolidNozzle}>
            + Solid nozzle
          </Button>
        </div>
      </div>
    </div>
  );
}

export function GimbalsSection({ part }: { part: EditingPart }) {
  const gimbals = part.gameData.gimbals;
  // Instances that don't yet have a gimbal — candidates to add one to.
  const used = new Set(gimbals.map((g) => g.subPartInstanceId));
  const free = part.placements.map((p) => p.instanceId).filter((id) => !used.has(id));
  return (
    <div className="flex flex-col gap-2">
      {gimbals.map((g) => (
        <GimbalCard key={g.subPartInstanceId} gimbal={g} />
      ))}
      {free.length > 0 && (
        <Field label="Add gimbal to instance">
          <Select
            size="sm"
            aria-label="Add gimbal to instance"
            placeholder="Select a placement"
            value={null}
            onChange={(k) => setGimbal(String(k), { maxAngleYDeg: 5, maxAngleZDeg: 5 })}
          >
            {free.map((id) => (
              <ListBoxItem key={id} id={id} textValue={id}>
                {id}
              </ListBoxItem>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}

function GimbalCard({ gimbal }: { gimbal: Gimbal }) {
  const id = gimbal.subPartInstanceId;
  return (
    <ItemCard title={`Gimbal — ${id}`} onRemove={() => removeGimbal(id)}>
      <Field label="Max angle Y (°)">
        <PreciseNumberInput
          aria-label="Gimbal max angle Y in degrees"
          value={gimbal.maxAngleYDeg}
          min={0}
          max={90}
          onInteractionStart={() => pushUndo('edit gimbal', '')}
          onCommit={(deg) => setGimbal(id, { maxAngleYDeg: deg })}
        />
      </Field>
      <Field label="Max angle Z (°)">
        <PreciseNumberInput
          aria-label="Gimbal max angle Z in degrees"
          value={gimbal.maxAngleZDeg}
          min={0}
          max={90}
          onInteractionStart={() => pushUndo('edit gimbal', '')}
          onCommit={(deg) => setGimbal(id, { maxAngleZDeg: deg })}
        />
      </Field>
      <Switch
        isSelected={gimbal.constrainToCircle}
        onChange={(on) => {
          pushUndo('edit gimbal', '');
          setGimbal(id, { constrainToCircle: on });
        }}
      >
        Constrain to circle
      </Switch>
    </ItemCard>
  );
}

/** Advanced: part-level rockets/combustors/nozzles for gas-generator cycles. */
export function PartGasGeneratorSection({ part }: { part: EditingPart }) {
  const g = part.gameData;
  const combustorIds = g.combustors.map((c) => c.id);
  const partNozzleIds = g.nozzles.map((n) => n.id);
  // Nozzles can also live on a SubPart, so offer those ids too for part-level rocket refs.
  const allNozzleIds = [
    ...partNozzleIds,
    ...part.subPartGameData.flatMap((s) => s.nozzles.map((n) => n.id)),
  ];
  const allCombustorIds = [
    ...combustorIds,
    ...part.subPartGameData.flatMap((s) => s.combustors.map((c) => c.id)),
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {g.combustors.map((c, i) => (
          <ItemCard key={i} title={`Combustor — ${c.id}`} onRemove={() => removePartCombustor(i)}>
            <CombustorFields
              combustor={c}
              onSetReaction={(id, ratio) => setPartCombustorReaction(i, id, ratio)}
              onUpdate={(patch) => updatePartCombustor(i, patch)}
              onSetFeeds={(feeds) => setPartCombustorFeeds(i, feeds)}
              onSetPlumbing={(p) => setPartCombustorPlumbing(i, p)}
            />
          </ItemCard>
        ))}
        <Button size="sm" onPress={addPartCombustor} className="self-start">
          + Part combustor
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {g.nozzles.map((n, i) => (
          <ItemCard key={i} title={`Nozzle — ${n.id}`} onRemove={() => removePartNozzle(i)}>
            <NozzleFields nozzle={n} onUpdate={(patch) => updatePartNozzle(i, patch)} />
          </ItemCard>
        ))}
        <Button size="sm" onPress={addPartNozzle} className="self-start">
          + Part nozzle
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {g.rockets.map((r, i) => (
          <ItemCard key={i} title={`Rocket — ${r.id}`} onRemove={() => removePartRocket(i)}>
            <RocketFields
              rocket={r}
              combustorIds={allCombustorIds}
              nozzleIds={allNozzleIds}
              part={part}
              onUpdate={(patch) => updatePartRocket(i, patch)}
            />
          </ItemCard>
        ))}
        <Button size="sm" onPress={addPartRocket} className="self-start">
          + Part rocket (gas generator)
        </Button>
      </div>
    </div>
  );
}

// ── custom propellants (user-authored FixedReactions) ─────────────────────────

/** A url-safe-ish id from a name, deduped against taken ids (for a new custom process). */
function uniquePropellantId(name: string, taken: Iterable<string>): string {
  const base =
    name
      .trim()
      .replace(/[^A-Za-z0-9_.]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Propellant';
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/**
 * Manager for user-authored reactions (custom propellants). You control the
 * mixture (reactant mass shares) and the pressure-indexed gas table. The gas table is
 * CEA-style pre-solved thermodynamics, so the practical workflow is clone-and-remix: copy
 * a shipped propellant, rename it, then adjust the mixture / rows (cloning a mixture
 * reaction bakes it at its default O/F ratio, exactly as KSA's combustor would). A
 * custom reaction is referenced by a combustor's propellant dropdown and exported as
 * a top-level <FixedReaction>.
 */
export function CustomPropellantsSection({ part }: { part: EditingPart }) {
  useEffect(() => {
    void ensureReactionsLoaded();
  }, []);
  const catalog = useStore($allReactions);
  const custom = part.customReactions;
  const takenIds = () => [...catalog.map((c) => c.id), ...custom.map((c) => c.id)];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-subtle">
        Author a propellant by cloning a shipped one and remixing it. The gas table is pre-solved
        thermodynamics — changing the mixture without recomputing it is an approximation (clearly
        outside flexo's data-only reach to solve exactly).
      </p>
      {custom.map((cp) => (
        <CustomPropellantCard key={cp.id} process={cp} />
      ))}
      <div className="flex flex-col gap-2">
        <Field label="Clone a shipped/known propellant">
          <Select
            size="sm"
            aria-label="Clone propellant"
            placeholder="Pick one to clone…"
            value={null}
            onChange={(k) => {
              const src = catalog.find((c) => c.id === String(k));
              if (!src) return;
              const id = uniquePropellantId(`${src.id}_custom`, takenIds());
              addCustomReaction(reactionDataToCustom(src, id, `${src.name} (custom)`));
            }}
          >
            {catalog.map((c) => (
              <ListBoxItem key={c.id} id={c.id} textValue={c.name}>
                {c.name}
              </ListBoxItem>
            ))}
          </Select>
        </Field>
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onPress={() =>
            addCustomReaction(
              createCustomReaction(uniquePropellantId('Propellant', takenIds()), 'New Propellant'),
            )
          }
        >
          + Blank propellant
        </Button>
      </div>
    </div>
  );
}

const REACTION_CATEGORIES: readonly ReactionCategory[] = [
  'Bipropellant',
  'Hypergolic',
  'Monopropellant',
  'Solid',
  'Thermal',
];

function CustomPropellantCard({ process }: { process: CustomReaction }) {
  const id = process.id;
  const setReactants = (reactants: ReactionReactantSpec[]) =>
    updateCustomReaction(id, { reactants });
  const setLut = (lut: ReactionLutRowSpec[]) => updateCustomReaction(id, { lut });
  return (
    <ItemCard title={`Propellant — ${id}`} onRemove={() => removeCustomReaction(id)}>
      <Field label="Name">
        <TextField
          size="sm"
          aria-label="Propellant name"
          value={process.name}
          onFocus={() => pushUndo('edit propellant', '')}
          onChange={(v) => updateCustomReaction(id, { name: v })}
        />
      </Field>
      <Field label="Category">
        <Select
          size="sm"
          aria-label="Reaction category"
          value={process.category}
          onChange={(k) => {
            pushUndo('edit propellant', '');
            updateCustomReaction(id, { category: k as ReactionCategory });
          }}
        >
          {REACTION_CATEGORIES.map((c) => (
            <ListBoxItem key={c} id={c} textValue={c}>
              {c}
            </ListBoxItem>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Reactants (mixture by mass share)</span>
        {process.reactants.map((r, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Substance phase id">
                <TextField
                  size="sm"
                  aria-label={`Reactant ${i + 1} phase id`}
                  inputClassName="font-mono"
                  value={r.phaseId}
                  onFocus={() => pushUndo('edit propellant', '')}
                  onChange={(v) =>
                    setReactants(
                      process.reactants.map((x, j) => (j === i ? { ...x, phaseId: v } : x)),
                    )
                  }
                />
              </Field>
            </div>
            <div className="w-24">
              <Field label="Mass share">
                <PreciseNumberInput
                  aria-label={`Reactant ${i + 1} mass share`}
                  value={r.massShare}
                  min={0}
                  onInteractionStart={() => pushUndo('edit propellant', '')}
                  onCommit={(n) =>
                    setReactants(
                      process.reactants.map((x, j) => (j === i ? { ...x, massShare: n } : x)),
                    )
                  }
                />
              </Field>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => setReactants(process.reactants.filter((_, j) => j !== i))}
              aria-label={`Remove reactant ${i + 1}`}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onPress={() => setReactants([...process.reactants, { phaseId: '', massShare: 1 }])}
        >
          + Reactant
        </Button>
      </div>
      {process.category === 'Solid' && <SolidPropellantFields process={process} />}
      <CustomPropellantLut process={process} setLut={setLut} />
    </ItemCard>
  );
}

/**
 * The four fields KSA REQUIRES on a `Category="Solid"` FixedReaction. Without all four
 * `FixedReactionTemplate.Create()` throws and the whole mod fails to load, so export
 * omits an incomplete one (see {@link isCustomReactionExportable}) — hence the hard
 * error banner rather than a soft warning. Cloning APCP/DoubleBase fills these in.
 */
function SolidPropellantFields({ process }: { process: CustomReaction }) {
  const id = process.id;
  const begin = () => pushUndo('edit propellant', '');
  const br = process.burnRate;
  const setBurnRate = (patch: Partial<NonNullable<CustomReaction['burnRate']>>) =>
    updateCustomReaction(id, {
      burnRate: { coefficientMPerS: 0, exponent: 0, ...br, ...patch },
    });
  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>Solid propellant (required — burn-rate law r = a·pⁿ)</span>
      <Field label="Burn-rate coefficient a (m/s at 1 Pa — must be > 0)">
        <PreciseNumberInput
          aria-label="Burn rate coefficient in meters per second"
          value={br?.coefficientMPerS ?? 0}
          min={0}
          onInteractionStart={begin}
          onCommit={(n) => setBurnRate({ coefficientMPerS: n })}
        />
      </Field>
      <Field label="Burn-rate exponent n (0 ≤ n < 0.95)">
        <PreciseNumberInput
          aria-label="Burn rate exponent"
          value={br?.exponent ?? 0}
          min={0}
          max={0.95}
          onInteractionStart={begin}
          onCommit={(n) => setBurnRate({ exponent: n })}
        />
      </Field>
      <Field label="Minimum burn pressure (bar — the deflagration limit)">
        <PreciseNumberInput
          aria-label="Minimum burn pressure in bar"
          value={(process.minimumBurnPressurePa ?? 0) / PA_PER_BAR}
          min={0}
          onInteractionStart={begin}
          onCommit={(bar) =>
            updateCustomReaction(id, { minimumBurnPressurePa: bar > 0 ? bar * PA_PER_BAR : null })
          }
        />
      </Field>
      <Field label="Max stable pressure (bar — the slope-break limit)">
        <PreciseNumberInput
          aria-label="Max stable pressure in bar"
          value={(process.maxStablePressurePa ?? 0) / PA_PER_BAR}
          min={0}
          onInteractionStart={begin}
          onCommit={(bar) =>
            updateCustomReaction(id, { maxStablePressurePa: bar > 0 ? bar * PA_PER_BAR : null })
          }
        />
      </Field>
      <Field label="Exhaust condensed fraction (0 to < 1)">
        <PreciseNumberInput
          aria-label="Exhaust condensed fraction"
          value={process.exhaustCondensedFraction ?? 0}
          min={0}
          max={0.999999}
          onInteractionStart={begin}
          onCommit={(n) => updateCustomReaction(id, { exhaustCondensedFraction: n })}
        />
      </Field>
      {!isCustomReactionExportable(process) && (
        <p className="text-[11px] leading-snug text-danger">
          KSA refuses to load a solid reaction without a burn-rate law and pressure limits — this
          propellant will be omitted from the export.
        </p>
      )}
    </div>
  );
}

function CustomPropellantLut({
  process,
  setLut,
}: {
  process: CustomReaction;
  setLut: (lut: ReactionLutRowSpec[]) => void;
}) {
  const patchRow = (i: number, patch: Partial<ReactionLutRowSpec>) =>
    setLut(process.lut.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const begin = () => pushUndo('edit propellant', '');
  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>Gas table — {process.lut.length} row(s) (ln P, T·K, γ, g/mol)</span>
      {process.lut.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-1">
          <PreciseNumberInput
            aria-label={`Row ${i + 1} ln pressure`}
            value={row.lnPressure}
            onInteractionStart={begin}
            onCommit={(n) => patchRow(i, { lnPressure: n })}
          />
          <PreciseNumberInput
            aria-label={`Row ${i + 1} temperature K`}
            value={row.temperatureK}
            min={0}
            onInteractionStart={begin}
            onCommit={(n) => patchRow(i, { temperatureK: n })}
          />
          <PreciseNumberInput
            aria-label={`Row ${i + 1} gamma`}
            value={row.gamma}
            min={1}
            onInteractionStart={begin}
            onCommit={(n) => patchRow(i, { gamma: n })}
          />
          <PreciseNumberInput
            aria-label={`Row ${i + 1} molar mass g/mol`}
            value={row.molarMassGPerMol}
            min={0}
            onInteractionStart={begin}
            onCommit={(n) => patchRow(i, { molarMassGPerMol: n })}
          />
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setLut(process.lut.filter((_, j) => j !== i))}
            aria-label={`Remove row ${i + 1}`}
          >
            ✕
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onPress={() => {
          const last = process.lut[process.lut.length - 1];
          setLut([
            ...process.lut,
            last
              ? { ...last, lnPressure: last.lnPressure + 0.5 }
              : {
                  lnPressure: Math.log(5_000_000),
                  temperatureK: 3000,
                  gamma: 1.2,
                  molarMassGPerMol: 14,
                },
          ]);
        }}
      >
        + Row
      </Button>
    </div>
  );
}

export { CombustorFields, NozzleFields };
