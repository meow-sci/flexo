/**
 * The engine wizard's MODEL — its state shape, its step machine, its per-step validation
 * and the one function that turns a filled-in state into a candidate {@link EditingPart}
 * (`plans/ENGINE_WIZARD_PLAN.md` §4.3, §5, §7).
 *
 * **Pure.** No React, no async, no nanostore reads, no `Math.random`/`Date.now`/
 * `crypto.randomUUID`. Every id that must be unique is either minted through the injected
 * `mint()` or derived from the document, so the same inputs always build the same part —
 * which is what makes the whole flow unit-testable and its Review step trustworthy (the
 * findings the user sees there are computed on exactly the document Finish will commit).
 *
 * The DIALOG owns the state: it holds one {@link WizardState} in `useState`, edits it with
 * the field components, gates Next on {@link validateWizardStep}, and calls
 * {@link buildWizardPart} for the Review preview and again (well, once — the same result) on
 * Finish. This module never touches `$part`.
 *
 * It does import a few PURE helpers from `editorStore` / `customAssetStore` /
 * `feedTargets` (id minting, `getOrCreateSubPartData`, `makePrimitiveCustomMesh`,
 * `feedTargetsOf`). Those are plain functions over a passed-in part — importing them is how
 * the wizard's ids and mesh records provably cannot drift from the ones the ordinary editor
 * actions produce. `currentLayerId` is deliberately NOT among them because it READS
 * `$activeLayerId`; see {@link buildWizardPart}'s `layerId` parameter.
 *
 * All three families are implemented: liquid (Phase W2), SRB (W5) and RCS (W6). The three
 * cores share the §5.1 preamble (identity, generated geometry, attach node) and the §5.5
 * postamble (gimbal, tag, collider, mass) through the small helpers below, so a fix to how
 * the wizard mints a mesh or encodes a collider lands in one place for every family.
 */

import {
  createCombustor,
  createNozzle,
  createRocket,
  createRocketController,
  createSolidGrainSegment,
  createSolidMotor,
  createSolidMotorNozzle,
  createTank,
  DEFAULT_ENGINE_SOUND_ID,
  DEFAULT_LAYER_ID,
  DEFAULT_RCS_SOUND_ID,
  GRAIN_GEOMETRY_IDS,
  isDefaultPartId,
  KNOWN_REACTIONS,
  withDefaultReactionPlume,
} from '../../../ksa/types';
import type {
  Combustor,
  Connector,
  ConnectorCapability,
  ConsumerFeedWiring,
  DeLavalNozzle,
  EditingPart,
  FeedSource,
  Gimbal,
  PartCollider,
  Rocket,
  RocketController,
  SolidGrainSegment,
  SolidMotor,
  SolidMotorNozzle,
  SubPartPlacement,
  Tank,
  TankShape,
  Vec3,
} from '../../../ksa/types';
import type { ReactionData } from '../../../ksa/reactionCatalog';
import { normalizeColliderSize } from '../../../ksa/colliderSize';
import { UNIT_EPSILON } from '../../../ksa/engineValidation';
import {
  allEngineModuleIds,
  getOrCreateSubPartData,
  nextConnectorId,
  uniqueModuleId,
} from '../../../state/editorStore';
import type { EngineModuleRef } from '../../../state/editorStore';
import type { EngineEntry, NozzleRef } from '../../../state/engineStore';
import { makePrimitiveCustomMesh } from '../../../state/customAssetStore';
import { feedTargetsOf } from '../../../state/feedTargets';
// A plain `1e5` constant. editorKit is a UI module, but this import pulls in no behavior —
// it exists so the wizard's bar⇄Pa conversion is literally the module editors' conversion.
import { PA_PER_BAR } from '../editorKit';
import {
  DEFAULT_WALL_MATERIAL_ID,
  LIQUID_PRESETS,
  RCS_PRESETS,
  SRB_NOZZLE_EXPANSION_EFF_PCT,
  SRB_NOZZLE_FLOW_EFF_PCT,
  SRB_PRESETS,
  SRB_WALL_MATERIAL_ID,
  WIZARD_BOUNDS,
  type WizardBound,
} from './wizardPresets';
import {
  colliderExtents,
  liquidGeometry,
  LIQUID_GEN_DEFAULTS,
  RCS_GEN_DEFAULTS,
  rcsGeometry,
  rcsLayout,
  SRB_GEN_DEFAULTS,
  srbGeometry,
} from './wizardGeometry';
import type {
  ColliderExtents,
  GeneratedBox,
  LiquidGen,
  RcsGen,
  RcsNozzleSpec,
  SrbGen,
} from './wizardGeometry';

// ── state ────────────────────────────────────────────────────────────────────

/** Which engine the wizard is building. One dialog hosts all three (decision D1). */
export type WizardFamily = 'liquid' | 'srb' | 'rcs';

/** Where the engine's hardware is hosted: fresh primitives, an existing mesh, or the Part. */
export type WizardGeometrySource =
  | { kind: 'generate' }
  | { kind: 'template'; templateId: string }
  /** RCS only — a part-level engine has no SubPart to hang modules off. */
  | { kind: 'part' };

/**
 * One editable generated-geometry dimension, as the `start` step renders it: which key of the
 * family's `gen` group it writes, what to call it, and its unit chip.
 */
export interface GenFieldDef {
  key: string;
  label: string;
  suffix: string;
}

/**
 * The `gen` fields each family exposes, in render order (§7.1). Declared here rather than in
 * the step so the step stays family-agnostic — it walks this table instead of branching on
 * `state.family` three times. Every key names a member of that family's `Gen` interface in
 * `wizardGeometry.ts`, and every value is metres.
 */
export const GEN_FIELDS: Readonly<Record<WizardFamily, readonly GenFieldDef[]>> = {
  liquid: [
    { key: 'bellWidthM', label: 'Bell length (X)', suffix: 'm' },
    { key: 'bellCrossM', label: 'Bell cross-section', suffix: 'm' },
    { key: 'bodyLengthM', label: 'Body length (X)', suffix: 'm' },
    { key: 'bodyCrossM', label: 'Body cross-section', suffix: 'm' },
  ],
  srb: [
    { key: 'nozzleBlockM', label: 'Nozzle block', suffix: 'm' },
    { key: 'casingLengthM', label: 'Casing length (X)', suffix: 'm' },
    { key: 'casingOuterRadiusM', label: 'Casing outer radius', suffix: 'm' },
  ],
  rcs: [{ key: 'blockSizeM', label: 'Block size', suffix: 'm' }],
};

export interface WizardIdentity {
  /** Applied only when the current part id is unset/default; blank ⇒ leave untouched. */
  partId: string;
  displayName: string;
}

/** Where a liquid chamber draws propellant from. */
export type LiquidFeedChoice =
  | {
      kind: 'tank';
      feedId: string;
      shape: TankShape;
      lengthM: number;
      outerRadiusM: number;
      wallMaterialId: string;
    }
  /** `connectorId: null` ⇒ the attach node the wizard itself creates. */
  | { kind: 'connector'; connectorId: string | null }
  | { kind: 'container'; containerId: string; subPartInstanceId: string | null };

export interface LiquidWizardState {
  family: 'liquid';
  identity: WizardIdentity;
  /** `'part'` is invalid for a liquid engine (a gimbal needs a SubPart to deflect). */
  geometry: WizardGeometrySource;
  gen: LiquidGen;
  /** Last applied preset — display only; editing a field does not clear it. */
  presetKey: string | null;
  reactionId: string;
  mixtureRatio: number | null;
  chamberPressureBar: number;
  minThrottlePct: number;
  thermalEffPct: number;
  exitDiameterM: number;
  areaRatio: number;
  flowEffPct: number;
  expansionEffPct: number;
  feed: LiquidFeedChoice;
  /** Default true when `geometry.kind === 'generate'`; ignored otherwise. */
  addAttachNode: boolean;
  /** Forced on when the feed names the wizard's own node (Bulk plumbing, §2.5 rule 7). */
  attachNodeBulkFluid: boolean;
  gimbal: { enabled: boolean; maxYDeg: number; maxZDeg: number; constrainToCircle: boolean };
  fx: {
    volumetricExhaustId: string | null;
    fxExitDiameterM: number | null;
    exhaustLight: boolean;
    engineSound: boolean;
  };
  structure: { dryMassKg: number | null; autoCollider: boolean };
  review: { armExhaustTool: boolean };
}

/** Phase W5. Declared here so {@link WizardState} is the complete union from the start. */
export interface SrbWizardState {
  family: 'srb';
  identity: WizardIdentity;
  geometry: WizardGeometrySource;
  gen: SrbGen;
  presetKey: string | null;
  /** Solid-category reactions only (KSA throws otherwise). */
  reactionId: string;
  defaultPressureBar: number;
  thermalEffPct: number;
  grainGeometryId: string;
  grain: {
    outerRadiusM: number;
    wallThicknessMm: number;
    lengthM: number;
    wallMaterialId: string;
    /** 1…8. */
    segmentCount: number;
  };
  /** Adds a `SolidMotorCase` connector plus the motor feed that accepts stacked segments. */
  acceptCaseSegmentsViaConnector: boolean;
  nozzle: { exitDiameterM: number; flowEffPct: number; expansionEffPct: number };
  gimbal: { enabled: boolean; maxYDeg: number; maxZDeg: number; constrainToCircle: boolean };
  fx: {
    plumeTrail: boolean;
    volumetricExhaustId: string | null;
    exhaustLight: boolean;
    engineSound: boolean;
  };
  structure: { dryMassKg: number | null; autoCollider: boolean };
  review: { armExhaustTool: boolean };
}

/** Phase W6. Declared here so {@link WizardState} is the complete union from the start. */
export interface RcsWizardState {
  family: 'rcs';
  identity: WizardIdentity;
  /** All three geometry kinds are legal for RCS. */
  geometry: WizardGeometrySource;
  gen: RcsGen;
  presetKey: string | null;
  layout: { preset: 'single' | 'quad' | 'six' | 'custom'; nozzles: RcsNozzleSpec[] };
  /** Non-solid; defaults to `MMH_NTO`. */
  reactionId: string;
  mixtureRatio: number | null;
  maxPressureBar: number;
  thermalEffPct: number;
  minPulseMs: number;
  exitDiameterM: number;
  areaRatio: number;
  flowEffPct: number;
  expansionEffPct: number;
  feed:
    | { kind: 'connector'; connectorId: string | null }
    /** Spherical, `roleAffinity: 'Thruster'`. */
    | { kind: 'tank'; feedId: string; outerRadiusM: number; wallMaterialId: string }
    | { kind: 'container'; containerId: string; subPartInstanceId: string | null };
  addAttachNode: boolean;
  /** `null` ⇒ let KSA derive the control map from the nozzle geometry. */
  controlMapFlags: string[] | null;
  fx: { volumetricExhaustId: string | null; exhaustLight: boolean; rcsSound: boolean };
  structure: { dryMassKg: number | null; autoCollider: boolean };
  review: { armExhaustTool: boolean };
}

export type WizardState = LiquidWizardState | SrbWizardState | RcsWizardState;

// ── steps ────────────────────────────────────────────────────────────────────

export type WizardStepId =
  | 'start'
  | 'performance'
  | 'feed'
  | 'gimbal'
  | 'fx'
  | 'structure'
  | 'srb-propellant'
  | 'srb-grain'
  | 'srb-nozzle'
  | 'rcs-layout'
  | 'rcs-propellant'
  | 'review';

export interface WizardStepDef {
  id: WizardStepId;
  title: string;
}

const STEP_TITLES: Readonly<Record<WizardStepId, string>> = {
  start: 'Start',
  performance: 'Performance',
  feed: 'Feed',
  gimbal: 'Gimbal',
  fx: 'Effects',
  structure: 'Structure',
  'srb-propellant': 'Propellant',
  'srb-grain': 'Grain & casing',
  'srb-nozzle': 'Nozzle',
  'rcs-layout': 'Layout',
  'rcs-propellant': 'Propellant',
  review: 'Review',
};

const LIQUID_STEPS: readonly WizardStepId[] = [
  'start',
  'performance',
  'feed',
  'gimbal',
  'fx',
  'structure',
  'review',
];

const SRB_STEPS: readonly WizardStepId[] = [
  'start',
  'srb-propellant',
  'srb-grain',
  'srb-nozzle',
  'gimbal',
  'fx',
  'structure',
  'review',
];

const RCS_STEPS: readonly WizardStepId[] = [
  'start',
  'rcs-layout',
  'rcs-propellant',
  'feed',
  'fx',
  'structure',
  'review',
];

const STEP_LISTS: Readonly<Record<WizardFamily, readonly WizardStepDef[]>> = {
  liquid: LIQUID_STEPS.map((id) => ({ id, title: STEP_TITLES[id] })),
  srb: SRB_STEPS.map((id) => ({ id, title: STEP_TITLES[id] })),
  rcs: RCS_STEPS.map((id) => ({ id, title: STEP_TITLES[id] })),
};

/** The ordered steps a family walks, left rail top to bottom. */
export function stepsFor(family: WizardFamily): readonly WizardStepDef[] {
  return STEP_LISTS[family];
}

// ── initial state ────────────────────────────────────────────────────────────

/** The `balanced` row — {@link LIQUID_PRESETS} is authored with it first (§3.2). */
const BALANCED = LIQUID_PRESETS[0];

/**
 * The wizard's opening liquid state: the `balanced` preset's numbers, Hydrolox at its
 * default O/F, generated geometry at the §6.1 defaults, and a new `fuel_main` tank sized to
 * the generated body. `part` is read only for the identity fields — nothing else here
 * depends on the document.
 */
export function initLiquidState(part: EditingPart): LiquidWizardState {
  return {
    family: 'liquid',
    identity: {
      partId: isDefaultPartId(part.partId) ? 'flexo_my_engine' : part.partId,
      displayName: part.gameData.displayName,
    },
    geometry: { kind: 'generate' },
    gen: { ...LIQUID_GEN_DEFAULTS },
    presetKey: BALANCED.key,
    reactionId: 'Hydrolox',
    mixtureRatio: 5.5,
    chamberPressureBar: BALANCED.pressureBar,
    minThrottlePct: BALANCED.minThrottlePct,
    thermalEffPct: BALANCED.thermalEffPct,
    exitDiameterM: BALANCED.exitDiameterM,
    areaRatio: BALANCED.areaRatio,
    flowEffPct: BALANCED.flowEffPct,
    expansionEffPct: BALANCED.expansionEffPct,
    feed: {
      kind: 'tank',
      feedId: 'fuel_main',
      shape: 'Cylindrical',
      lengthM: LIQUID_GEN_DEFAULTS.bodyLengthM,
      outerRadiusM: LIQUID_GEN_DEFAULTS.bodyCrossM / 2,
      wallMaterialId: DEFAULT_WALL_MATERIAL_ID,
    },
    addAttachNode: true,
    attachNodeBulkFluid: false,
    gimbal: {
      enabled: true,
      maxYDeg: BALANCED.gimbalYDeg,
      maxZDeg: BALANCED.gimbalZDeg,
      constrainToCircle: true,
    },
    fx: {
      volumetricExhaustId: 'EngineAMed',
      fxExitDiameterM: null,
      exhaustLight: true,
      engineSound: true,
    },
    structure: { dryMassKg: BALANCED.dryMassKg, autoCollider: true },
    review: { armExhaustTool: false },
  };
}

/** The `large` row of {@link SRB_PRESETS} — the wizard's default booster (§3.3). */
const LARGE_BOOSTER = SRB_PRESETS[2];

/**
 * The wizard's opening SRB state: the `large` preset's numbers (DoubleBase at 45 bar with a
 * BoostSustain grain), generated geometry at the §6.2 defaults, one steel-cased grain
 * segment, and no gimbal — stock boosters that size carry none.
 *
 * The two nozzle efficiencies are CONSTANTS rather than preset fields, because every SRB row
 * shares `createSolidMotorNozzle`'s 0.95/0.98 (see {@link SRB_NOZZLE_FLOW_EFF_PCT}).
 */
export function initSrbState(part: EditingPart): SrbWizardState {
  return {
    family: 'srb',
    identity: {
      partId: isDefaultPartId(part.partId) ? 'flexo_my_srb' : part.partId,
      displayName: part.gameData.displayName,
    },
    geometry: { kind: 'generate' },
    gen: { ...SRB_GEN_DEFAULTS },
    presetKey: LARGE_BOOSTER.key,
    reactionId: LARGE_BOOSTER.reactionId,
    defaultPressureBar: LARGE_BOOSTER.pressureBar,
    thermalEffPct: LARGE_BOOSTER.thermalEffPct,
    grainGeometryId: LARGE_BOOSTER.grainGeometryId,
    grain: {
      outerRadiusM: LARGE_BOOSTER.grainOuterRadiusM,
      wallThicknessMm: LARGE_BOOSTER.grainWallThicknessMm,
      lengthM: LARGE_BOOSTER.grainLengthM,
      wallMaterialId: SRB_WALL_MATERIAL_ID,
      segmentCount: LARGE_BOOSTER.segmentCount,
    },
    acceptCaseSegmentsViaConnector: false,
    nozzle: {
      exitDiameterM: LARGE_BOOSTER.exitDiameterM,
      flowEffPct: SRB_NOZZLE_FLOW_EFF_PCT,
      expansionEffPct: SRB_NOZZLE_EXPANSION_EFF_PCT,
    },
    gimbal: {
      enabled: LARGE_BOOSTER.gimbalEnabled,
      maxYDeg: LARGE_BOOSTER.gimbalYDeg,
      maxZDeg: LARGE_BOOSTER.gimbalZDeg,
      constrainToCircle: true,
    },
    // A solid's signature FX is the trail, not a volumetric plume — hence `(none)` there.
    fx: { plumeTrail: true, volumetricExhaustId: null, exhaustLight: true, engineSound: true },
    structure: { dryMassKg: LARGE_BOOSTER.dryMassKg, autoCollider: true },
    review: { armExhaustTool: false },
  };
}

/** The `blockLarge` row of {@link RCS_PRESETS} — authored first, like the liquid default. */
const BLOCK_LARGE = RCS_PRESETS[0];

/**
 * The wizard's opening RCS state: the `blockLarge` preset's numbers (MMH_NTO at O/F 1.6,
 * 7 bar, 5.4 ms minimum pulse), a generated 0.3 m block with the four `quad` nozzles on its
 * faces, and a connector feed through the wizard's own attach node — Service plumbing rides
 * a bare connector's default `Electricity | ServiceFluid` (§2.5 rule 7), so nothing else is
 * needed to make it draw propellant from the vehicle.
 */
export function initRcsState(part: EditingPart): RcsWizardState {
  return {
    family: 'rcs',
    identity: {
      partId: isDefaultPartId(part.partId) ? 'flexo_my_rcs' : part.partId,
      displayName: part.gameData.displayName,
    },
    geometry: { kind: 'generate' },
    gen: { ...RCS_GEN_DEFAULTS },
    presetKey: BLOCK_LARGE.key,
    layout: {
      preset: BLOCK_LARGE.layout,
      nozzles: rcsLayout(BLOCK_LARGE.layout, RCS_GEN_DEFAULTS.blockSizeM / 2),
    },
    reactionId: BLOCK_LARGE.reactionId,
    mixtureRatio: BLOCK_LARGE.mixtureRatio,
    maxPressureBar: BLOCK_LARGE.pressureBar,
    thermalEffPct: BLOCK_LARGE.thermalEffPct,
    minPulseMs: BLOCK_LARGE.minPulseMs,
    exitDiameterM: BLOCK_LARGE.exitDiameterM,
    areaRatio: BLOCK_LARGE.areaRatio,
    flowEffPct: BLOCK_LARGE.flowEffPct,
    expansionEffPct: BLOCK_LARGE.expansionEffPct,
    feed: { kind: 'connector', connectorId: null },
    addAttachNode: true,
    // Null ⇒ KSA derives the control map from where each nozzle points, which is right for
    // every symmetric block; the manual grid is the escape hatch (§7.10).
    controlMapFlags: null,
    fx: { volumetricExhaustId: 'RCS', exhaustLight: true, rcsSound: true },
    structure: { dryMassKg: BLOCK_LARGE.dryMassKg, autoCollider: true },
    review: { armExhaustTool: false },
  };
}

/**
 * Switches the geometry source, repairing the one piece of state the old source was the only
 * reason to hold.
 *
 * A feed of `{kind: 'connector', connectorId: null}` means "the attach node the wizard is
 * about to create", and that node only exists while the wizard is GENERATING geometry. Moving
 * to a mesh template or to part level leaves it naming nothing — and on a fresh part there is
 * no other connector to pick either, so the Feed step would dead-end on its own default. A new
 * tank is the one propellant source that is always available, so that is where it lands.
 *
 * Only that repair happens here: everything else the user typed is theirs to keep.
 */
export function withGeometry<S extends WizardState>(state: S, geometry: WizardGeometrySource): S {
  // The cast is the price of the generic: `repair` only ever rewrites `geometry` and `feed`,
  // both of which it sets to a value valid for the family it was handed, so the result is
  // still an `S`. Callers get their own family's type back, which is what the steps need.
  return repair(state, geometry) as S;
}

function repair(state: WizardState, geometry: WizardGeometrySource): WizardState {
  if (geometry.kind === 'generate') return { ...state, geometry };
  // An SRB has no feed step at all — its motor draws from its own grain segments.
  if (state.family === 'srb') return { ...state, geometry };
  const orphaned = state.feed.kind === 'connector' && state.feed.connectorId === null;
  if (!orphaned) return { ...state, geometry };
  if (state.family === 'liquid') {
    return {
      ...state,
      geometry,
      feed: {
        kind: 'tank',
        feedId: 'fuel_main',
        shape: 'Cylindrical',
        lengthM: LIQUID_GEN_DEFAULTS.bodyLengthM,
        outerRadiusM: LIQUID_GEN_DEFAULTS.bodyCrossM / 2,
        wallMaterialId: DEFAULT_WALL_MATERIAL_ID,
      },
    };
  }
  return {
    ...state,
    geometry,
    feed: {
      kind: 'tank',
      feedId: 'rcs_prop',
      outerRadiusM: RCS_GEN_DEFAULTS.blockSizeM / 2,
      wallMaterialId: DEFAULT_WALL_MATERIAL_ID,
    },
  };
}

// ── validation ───────────────────────────────────────────────────────────────

function inRange(label: string, value: number, bound: WizardBound, unit: string): string | null {
  if (Number.isFinite(value) && value >= bound.min && value <= bound.max) return null;
  return `${label} must be between ${bound.min} and ${bound.max}${unit}.`;
}

/**
 * Whether a reaction id names a `<FixedReaction>` — the question that decides whether a
 * `<MixtureRatio>` is required or forbidden (§2.5 rule 9). Answered WITHOUT the live catalog
 * so `buildWizardPart` stays a pure function of its arguments: a user-authored reaction is
 * always Fixed (that is the only kind flexo exports), and the rest come from the static
 * Core snapshot. `validateWizardStep` grades against the live catalog instead, and skips the
 * check entirely while it is still loading.
 */
function reactionIsFixed(part: EditingPart, reactionId: string): boolean {
  if (part.customReactions.some((r) => r.id === reactionId)) return true;
  return KNOWN_REACTIONS.find((r) => r.id === reactionId)?.kind === 'Fixed';
}

/**
 * Every blocking problem with the current step, as user-facing sentences. Empty ⇒ the step
 * is valid and Next is enabled. `reactions` is the live catalog; `undefined` (or a missing
 * id) means it is still loading, and a loading catalog must never block the user — the
 * reaction-shaped checks are simply skipped.
 */
export function validateWizardStep(
  state: WizardState,
  step: WizardStepId,
  part: EditingPart,
  reactions: ReadonlyMap<string, ReactionData> | undefined,
): string[] {
  if (state.family === 'srb') return validateSrbStep(state, step, reactions);
  if (state.family === 'rcs') return validateRcsStep(state, step, part, reactions);
  return validateLiquidStep(state, step, part, reactions);
}

// ── validation · rules shared by two or three families ────────────────────────

/**
 * The `start` step (§7.1) for any family: the generated dimensions must be inside
 * (0, `genDimM.max`] m, an "existing mesh" choice must actually name a template, and
 * part-level hosting is legal only for the family that passes `partLevelReason: null`.
 */
function validateStartStep(
  geometry: WizardGeometrySource,
  dims: readonly (readonly [string, number])[],
  partLevelReason: string | null,
): string[] {
  const out: string[] = [];
  if (geometry.kind === 'generate') {
    const max = WIZARD_BOUNDS.genDimM.max;
    for (const [label, value] of dims) {
      if (!Number.isFinite(value) || value <= 0 || value > max) {
        out.push(`${label} must be between 0 and ${max} m.`);
      }
    }
  } else if (geometry.kind === 'template') {
    if (!geometry.templateId.trim()) {
      out.push('Choose the mesh template that will host the engine.');
    }
  } else if (partLevelReason) {
    out.push(partLevelReason);
  }
  return out;
}

/**
 * The feed choice the `feed` step grades (§7.3), narrowed to the members liquid and RCS
 * share — the two unions differ only in the tank's geometry fields, which no rule here
 * reads. Widening rather than casting is what keeps a future field from being graded blind.
 */
type WizardFeedChoice =
  | { kind: 'tank'; feedId: string }
  | { kind: 'connector'; connectorId: string | null }
  | { kind: 'container'; containerId: string };

/**
 * The `feed` step for liquid and RCS. `wizardNode` says whether the connector the wizard
 * itself would create is actually going to exist, and what to tell the user when it isn't
 * (the reason differs per family, since RCS can be hosted with no geometry at all).
 */
function validateFeedChoice(
  feed: WizardFeedChoice,
  part: EditingPart,
  wizardNode: { available: boolean; reason: string },
): string[] {
  const out: string[] = [];
  if (feed.kind === 'tank') {
    const feedId = feed.feedId.trim();
    if (!feedId) {
      out.push('Give the new tank a feed id — an engine can only draw from a named container.');
    } else if (feedTargetsOf(part).containers.some((c) => c.id === feedId)) {
      out.push(`Feed id "${feedId}" is already used by another container on this part.`);
    }
  } else if (feed.kind === 'connector') {
    const connectorId = feed.connectorId;
    if (connectorId === null) {
      if (!wizardNode.available) out.push(wizardNode.reason);
    } else if (!part.connectors.some((c) => c.id === connectorId)) {
      out.push(`Connector ${connectorId} no longer exists on this part — pick another feed.`);
    }
  } else if (!feed.containerId.trim()) {
    out.push('Choose the existing container the engine should draw from.');
  }
  return out;
}

/** The `gimbal` step (§7.4) — liquid and SRB. Nothing to grade when it is switched off. */
function validateGimbalStep(gimbal: { enabled: boolean; maxYDeg: number; maxZDeg: number }) {
  const out: string[] = [];
  if (!gimbal.enabled) return out;
  const y = inRange('Max gimbal angle Y', gimbal.maxYDeg, WIZARD_BOUNDS.gimbalDeg, '°');
  if (y) out.push(y);
  const z = inRange('Max gimbal angle Z', gimbal.maxZDeg, WIZARD_BOUNDS.gimbalDeg, '°');
  if (z) out.push(z);
  return out;
}

/** The `structure` step (§7.6) — all families. Blank (null) mass is legal; 0 kg is not. */
function validateStructureStep(dryMassKg: number | null): string[] {
  if (dryMassKg === null) return [];
  if (Number.isFinite(dryMassKg) && dryMassKg > 0) return [];
  return ['Dry mass must be greater than 0 kg — KSA rejects a <CustomMass> of 0.'];
}

/**
 * The `<MixtureRatio>` rule (§2.5 rule 9), graded against the LIVE catalog: required for a
 * Mixture reaction, forbidden for a Fixed one. Silent while the catalog is still loading —
 * a pending fetch must never block Next.
 */
function validateMixtureRatio(
  reaction: ReactionData | undefined,
  mixtureRatio: number | null,
): string[] {
  if (reaction?.kind === 'Mixture') {
    if (mixtureRatio === null || !Number.isFinite(mixtureRatio) || mixtureRatio <= 0) {
      return [
        `${reaction.name} is a mixture reaction — give it an O/F mixture ratio greater than 0.`,
      ];
    }
  } else if (reaction?.kind === 'Fixed' && mixtureRatio !== null) {
    return [`${reaction.name} is a fixed reaction — it takes no mixture ratio.`];
  }
  return [];
}

function validateLiquidStep(
  state: LiquidWizardState,
  step: WizardStepId,
  part: EditingPart,
  reactions: ReadonlyMap<string, ReactionData> | undefined,
): string[] {
  const out: string[] = [];
  const push = (message: string | null) => {
    if (message) out.push(message);
  };

  if (step === 'start') {
    return validateStartStep(
      state.geometry,
      [
        ['Bell width', state.gen.bellWidthM],
        ['Bell cross-section', state.gen.bellCrossM],
        ['Body length', state.gen.bodyLengthM],
        ['Body cross-section', state.gen.bodyCrossM],
      ],
      'A liquid engine needs a SubPart to host its hardware — generate geometry or pick a mesh.',
    );
  }

  if (step === 'performance') {
    push(
      inRange(
        'Chamber pressure',
        state.chamberPressureBar,
        WIZARD_BOUNDS.chamberPressureBar,
        ' bar',
      ),
    );
    push(inRange('Area ratio', state.areaRatio, WIZARD_BOUNDS.areaRatio, ''));
    push(inRange('Exit diameter', state.exitDiameterM, WIZARD_BOUNDS.exitDiameterM, ' m'));
    push(inRange('Thermal efficiency', state.thermalEffPct, WIZARD_BOUNDS.efficiencyPct, ' %'));
    push(inRange('Flow efficiency', state.flowEffPct, WIZARD_BOUNDS.efficiencyPct, ' %'));
    push(inRange('Expansion efficiency', state.expansionEffPct, WIZARD_BOUNDS.efficiencyPct, ' %'));
    push(inRange('Minimum throttle', state.minThrottlePct, WIZARD_BOUNDS.minThrottlePct, ' %'));
    out.push(...validateMixtureRatio(reactions?.get(state.reactionId), state.mixtureRatio));
    return out;
  }

  if (step === 'feed') {
    return validateFeedChoice(state.feed, part, {
      available: state.addAttachNode,
      reason:
        'The feed names the wizard\'s attach node, so turn "Add a forward attach node" back ' +
        'on — or pick an existing connector.',
    });
  }

  if (step === 'gimbal') return validateGimbalStep(state.gimbal);
  if (step === 'structure') return validateStructureStep(state.structure.dryMassKg);

  // 'fx' has nothing that can block, and 'review' is gated on validateEngines by the dialog
  // (a finding there is richer than anything this function could say).
  return out;
}

/**
 * The SRB steps (§7.7–§7.9). The pressure rule is the one that matters: KSA's
 * `SolidMotorTemplate.Create` THROWS when `<DefaultPressure>` sits outside its reaction's
 * `(MinimumBurnPressure, MaxStablePressure]`, so this mirrors `engineValidation`'s
 * `solid-motor-pressure-out-of-range` a step earlier, where the user can still fix it.
 */
function validateSrbStep(
  state: SrbWizardState,
  step: WizardStepId,
  // No `part` argument: the SRB walk has no `feed` step — a solid motor draws from the grain
  // segments the wizard itself creates, so nothing here is graded against the document.
  reactions: ReadonlyMap<string, ReactionData> | undefined,
): string[] {
  const out: string[] = [];
  const push = (message: string | null) => {
    if (message) out.push(message);
  };

  if (step === 'start') {
    return validateStartStep(
      state.geometry,
      [
        ['Nozzle block', state.gen.nozzleBlockM],
        ['Casing length', state.gen.casingLengthM],
        ['Casing outer radius', state.gen.casingOuterRadiusM],
      ],
      'A solid motor needs a SubPart to host its case — generate geometry or pick a mesh.',
    );
  }

  if (step === 'srb-propellant') {
    const pressure = state.defaultPressureBar;
    if (!Number.isFinite(pressure) || pressure <= 0) {
      out.push('Default pressure must be greater than 0 bar.');
    }
    // Skipped entirely while the catalog loads — an unknown reaction is the picker's problem.
    const reaction = reactions?.get(state.reactionId);
    if (reaction) {
      if (reaction.category !== 'Solid') {
        out.push(
          `KSA throws: a solid motor needs a Solid reaction, and ${reaction.name} is ` +
            `${reaction.category}.`,
        );
      }
      const min = reaction.kind === 'Fixed' ? reaction.minimumBurnPressurePa : null;
      const max = reaction.kind === 'Fixed' ? reaction.maxStablePressurePa : null;
      const belowMin = min != null && pressure <= min / PA_PER_BAR;
      const aboveMax = max != null && pressure > max / PA_PER_BAR;
      if (Number.isFinite(pressure) && (belowMin || aboveMax)) {
        out.push(
          `Default pressure must be above ${formatBar(min)} bar and at most ${formatBar(max)} ` +
            `bar for ${reaction.name} — KSA throws at load outside that range.`,
        );
      }
    }
    push(inRange('Thermal efficiency', state.thermalEffPct, WIZARD_BOUNDS.efficiencyPct, ' %'));
    if (!GRAIN_GEOMETRY_IDS.includes(state.grainGeometryId)) {
      out.push(`Grain geometry "${state.grainGeometryId}" is not one of Core's grain shapes.`);
    }
    return out;
  }

  if (step === 'srb-grain') {
    const { segmentCount, outerRadiusM, wallThicknessMm, lengthM } = state.grain;
    const count = WIZARD_BOUNDS.segmentCount;
    if (!Number.isInteger(segmentCount) || segmentCount < count.min || segmentCount > count.max) {
      out.push(`Segment count must be a whole number between ${count.min} and ${count.max}.`);
    }
    if (!(outerRadiusM > 0)) out.push('Grain outer radius must be greater than 0 m.');
    if (!(lengthM > 0)) out.push('Grain segment length must be greater than 0 m.');
    if (!(wallThicknessMm > 0)) {
      out.push('Wall thickness must be greater than 0 mm.');
    } else if (outerRadiusM > 0 && wallThicknessMm >= outerRadiusM * 1000) {
      out.push(
        `Wall thickness must be less than the grain outer radius (${outerRadiusM * 1000} mm) — ` +
          'a wall that thick leaves no propellant.',
      );
    }
    return out;
  }

  if (step === 'srb-nozzle') {
    push(inRange('Exit diameter', state.nozzle.exitDiameterM, WIZARD_BOUNDS.exitDiameterM, ' m'));
    push(inRange('Flow efficiency', state.nozzle.flowEffPct, WIZARD_BOUNDS.efficiencyPct, ' %'));
    push(
      inRange(
        'Expansion efficiency',
        state.nozzle.expansionEffPct,
        WIZARD_BOUNDS.efficiencyPct,
        ' %',
      ),
    );
    return out;
  }

  if (step === 'gimbal') return validateGimbalStep(state.gimbal);
  if (step === 'structure') return validateStructureStep(state.structure.dryMassKg);
  return out;
}

/** `Pa → bar` for a validation message; `null` (the catalog has no limit) reads as `?`. */
function formatBar(pa: number | null): string {
  return pa == null ? '?' : String(Math.round((pa / PA_PER_BAR) * 10) / 10);
}

/**
 * The RCS steps (§7.10–§7.11). Unlike liquid, `{kind:'part'}` geometry is legal here — stock
 * authors the MMU's whole thruster battery on `<PartGameData>` — so the `start` step takes no
 * part-level reason.
 */
function validateRcsStep(
  state: RcsWizardState,
  step: WizardStepId,
  part: EditingPart,
  reactions: ReadonlyMap<string, ReactionData> | undefined,
): string[] {
  const out: string[] = [];
  const push = (message: string | null) => {
    if (message) out.push(message);
  };

  if (step === 'start') {
    return validateStartStep(state.geometry, [['Block size', state.gen.blockSizeM]], null);
  }

  if (step === 'rcs-layout') {
    const nozzles = state.layout.nozzles;
    const max = WIZARD_BOUNDS.rcsNozzleCount.max;
    if (nozzles.length < 1) out.push('An RCS block needs at least one nozzle.');
    if (nozzles.length > max) out.push(`An RCS block can carry at most ${max} nozzles.`);
    // KSA applies thrust as `TotalThrust * ExhaustDirection` WITHOUT normalizing, so a
    // non-unit direction is a silent thrust multiplier (engineValidation's
    // `nozzle-direction-not-unit`). Catch it here, while the row is on screen.
    nozzles.forEach((spec, i) => {
      const len = Math.hypot(spec.direction.x, spec.direction.y, spec.direction.z);
      if (Number.isFinite(len) && Math.abs(len - 1) <= UNIT_EPSILON) return;
      out.push(
        `Nozzle ${i + 1}'s direction is not a unit vector (length ${len.toFixed(3)}) — ` +
          "normalize it, or KSA multiplies that nozzle's thrust by the length.",
      );
    });
    return out;
  }

  if (step === 'rcs-propellant') {
    push(inRange('Max pressure', state.maxPressureBar, WIZARD_BOUNDS.chamberPressureBar, ' bar'));
    push(inRange('Area ratio', state.areaRatio, WIZARD_BOUNDS.areaRatio, ''));
    push(inRange('Exit diameter', state.exitDiameterM, WIZARD_BOUNDS.exitDiameterM, ' m'));
    push(inRange('Thermal efficiency', state.thermalEffPct, WIZARD_BOUNDS.efficiencyPct, ' %'));
    push(inRange('Flow efficiency', state.flowEffPct, WIZARD_BOUNDS.efficiencyPct, ' %'));
    push(inRange('Expansion efficiency', state.expansionEffPct, WIZARD_BOUNDS.efficiencyPct, ' %'));
    push(inRange('Minimum pulse time', state.minPulseMs, WIZARD_BOUNDS.minPulseMs, ' ms'));
    out.push(...validateMixtureRatio(reactions?.get(state.reactionId), state.mixtureRatio));
    return out;
  }

  if (step === 'feed') {
    // The wizard's own node only exists alongside generated geometry — a part-level or
    // template-hosted block has to name a connector the document already carries.
    const generated = state.geometry.kind === 'generate';
    return validateFeedChoice(state.feed, part, {
      available: state.addAttachNode && generated,
      reason: generated
        ? 'The feed names the wizard\'s attach node, so turn "Add a forward attach node" back ' +
          'on — or pick an existing connector.'
        : 'The wizard only adds an attach node alongside generated geometry — pick an existing ' +
          'connector, a container, or a new tank.',
    });
  }

  if (step === 'structure') return validateStructureStep(state.structure.dryMassKg);
  return out;
}

// ── build ────────────────────────────────────────────────────────────────────

/** One created entity, for the Review step's "what you built" tree. */
export interface WizardSummaryRow {
  kind: string;
  id: string;
  note: string;
}

export interface WizardBuildResult {
  /** The full candidate document — `current` is never mutated. */
  part: EditingPart;
  summary: WizardSummaryRow[];
  engineScope: EngineEntry;
  focus: EngineModuleRef;
  createdMeshIds: string[];
  exhaustNozzleRef: NozzleRef | null;
  /** Undo detail, e.g. `liquid · flexo_Bell_ab12`. */
  detail: string;
}

/** `addSubPart`'s instance-id base (`editorStore.ts:741`), replicated (it is module-private). */
function lastSegmentLower(templateId: string): string {
  const seg = templateId.split('.').pop() ?? templateId;
  return seg.toLowerCase();
}

/** `nextColliderId`'s rule (`editorStore.ts:1512`), replicated (it is not exported). */
function nextColliderIdFor(part: EditingPart): string {
  let max = 0;
  for (const c of part.colliders) {
    const m = /^_collider(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `_collider${max + 1}`;
}

// ── build · the preamble and postamble every family shares (§5.1, §5.5) ───────

/** What a family core accumulates as it builds, alongside the part itself. */
interface BuildAccum {
  summary: WizardSummaryRow[];
  createdMeshIds: string[];
}

/**
 * §5.1 step 2. A part id is a free-form document string (the export dialog is what validates
 * it), so it goes in verbatim — sanitizing here would mangle ids KSA accepts. `current` is
 * read rather than `part` so the "only when unset/default" test sees the ORIGINAL id.
 */
function applyIdentity(part: EditingPart, current: EditingPart, identity: WizardIdentity): void {
  const partIdDraft = identity.partId.trim();
  if (partIdDraft && isDefaultPartId(current.partId)) part.partId = partIdDraft;
  const displayName = identity.displayName.trim();
  if (displayName) part.gameData.displayName = displayName;
}

/**
 * §5.1 step 3, generate branch. Mints a `CustomMesh` per box and places each one unrotated —
 * KSA's thrust axis is local X (§2.5 rule 1), so the wizard never emits a placement rotation.
 * Returns the template/instance pair at `hostIndex`, which is the SubPart the engine modules
 * go on (the other boxes are cosmetic).
 */
function pushGeneratedBoxes(
  part: EditingPart,
  boxes: readonly GeneratedBox[],
  hostIndex: number,
  layerId: string,
  mint: () => string,
  out: BuildAccum,
): { hostTemplateId: string; hostInstanceId: string } {
  const templateIds: string[] = [];
  const instanceIds: string[] = [];
  for (const box of boxes) {
    const mesh = makePrimitiveCustomMesh(box.name, box.primitive, mint);
    part.customMeshes.push(mesh);
    out.createdMeshIds.push(mesh.id);
    const count = part.placements.filter((p) => p.subPartTemplateId === mesh.subPartId).length;
    const instanceId = `${lastSegmentLower(mesh.subPartId)}_${count + 1}`;
    const placement: SubPartPlacement = {
      instanceId,
      subPartTemplateId: mesh.subPartId,
      position: { ...box.position },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId,
    };
    part.placements.push(placement);
    templateIds.push(mesh.subPartId);
    instanceIds.push(instanceId);
    out.summary.push({ kind: 'mesh', id: mesh.name, note: `${box.primitive.kind} primitive` });
    out.summary.push({
      kind: 'placement',
      id: instanceId,
      note: `${mesh.name} at x ${box.position.x}`,
    });
  }
  return { hostTemplateId: templateIds[hostIndex], hostInstanceId: instanceIds[hostIndex] };
}

/**
 * §5.1 step 4. One connector on the part's +X axis, unrotated (a connector faces its own +X).
 * `label` names it in the Review tree; the capabilities are appended to that note, since
 * which resources cross a node is the thing a reader most wants to check.
 */
function pushConnector(
  part: EditingPart,
  x: number,
  capabilities: ConnectorCapability[],
  layerId: string,
  label: string,
  out: BuildAccum,
): string {
  const id = nextConnectorId(part);
  const connector: Connector = {
    id,
    position: { x, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    flags: [],
    capabilities,
    siblingIds: [],
    layerId,
  };
  part.connectors.push(connector);
  out.summary.push({
    kind: 'connector',
    id,
    note: capabilities.length ? `${label} · ${capabilities.join(' ')}` : label,
  });
  return id;
}

/** §5.2 step 7 / §5.3 step 6 — the gimbal, which liquid and SRB author identically. */
function pushGimbal(
  part: EditingPart,
  hostInstanceId: string | null,
  gimbal: { enabled: boolean; maxYDeg: number; maxZDeg: number; constrainToCircle: boolean },
  out: BuildAccum,
): void {
  if (!gimbal.enabled || hostInstanceId === null) return;
  // 0°/0° is not even built in-game (`Gimbal.CanActuate()`), so never emit one.
  if (gimbal.maxYDeg <= 0 && gimbal.maxZDeg <= 0) return;
  const entry: Gimbal = {
    subPartInstanceId: hostInstanceId,
    maxAngleYDeg: gimbal.maxYDeg,
    maxAngleZDeg: gimbal.maxZDeg,
    constrainToCircle: gimbal.constrainToCircle,
  };
  part.gameData.gimbals.push(entry);
  out.summary.push({
    kind: 'gimbal',
    id: hostInstanceId,
    note: `${gimbal.maxYDeg}° Y · ${gimbal.maxZDeg}° Z`,
  });
}

/**
 * §5.5 step 2. One part-level collider over the generated union AABB, encoded the way
 * `addCollider` + `setColliderSize` do: `scale` IS the outer size in metres.
 *
 * A Cylinder's barrel is KSA's local **Y**, so an X-axis booster case is a Y cylinder turned
 * −90° about Z — the same rotation `fitCollider`'s `AXIS_ALIGN.x` produces — and its size
 * swaps into `(diameter, length, diameter)`.
 */
function pushAutoCollider(
  part: EditingPart,
  extents: ColliderExtents,
  layerId: string,
  out: BuildAccum,
): void {
  const barrel = extents.shape === 'Cylinder';
  const size = barrel ? { x: extents.size.y, y: extents.size.x, z: extents.size.z } : extents.size;
  const collider: PartCollider = {
    id: nextColliderIdFor(part),
    shape: extents.shape,
    ownerTemplateId: null,
    position: { ...extents.center },
    rotation: { x: 0, y: 0, z: barrel ? -Math.PI / 2 : 0 },
    scale: normalizeColliderSize(extents.shape, size),
    layerId,
  };
  part.colliders.push(collider);
  out.summary.push({
    kind: 'collider',
    id: collider.id,
    note: barrel
      ? `cylinder Ø ${extents.size.y} × ${extents.size.x} m along X`
      : `box ${extents.size.x} × ${extents.size.y} × ${extents.size.z} m`,
  });
}

/** §5.5 step 1 — the `<CustomMass>` override. Blank (null) leaves the part's mass alone. */
function pushCustomMass(part: EditingPart, dryMassKg: number | null, out: BuildAccum): void {
  if (dryMassKg === null) return;
  part.gameData.customMass = dryMassKg;
  out.summary.push({ kind: 'mass', id: 'CustomMass', note: `${dryMassKg} kg` });
}

/** Adds an editor tag if the part does not already carry it. */
function addEditorTag(part: EditingPart, tag: string): void {
  if (!part.editorTags.includes(tag)) part.editorTags.push(tag);
}

/**
 * Turns a finished wizard state into the candidate document, plus everything the dialog
 * needs afterwards (what to select, which nozzle the exhaust tool should arm, what the undo
 * entry is called). Pure: `current` is `structuredClone`d and never touched.
 *
 * `mint` supplies the random-ish segments custom-mesh ids are built from — injected rather
 * than imported so a test can make the whole build deterministic.
 *
 * `layerId` is a PARAMETER rather than a `currentLayerId(part)` call (which the plan's §5.1
 * sketched) because that helper reads the `$activeLayerId` nanostore, and this module must
 * stay free of atom reads to remain a pure function. Production passes
 * `currentLayerId($part.get())`; the default is the built-in Default layer.
 */
export function buildWizardPart(
  current: EditingPart,
  state: WizardState,
  mint: () => string,
  layerId: string = DEFAULT_LAYER_ID,
): WizardBuildResult {
  if (state.family === 'srb') return buildSrbPart(current, state, mint, layerId);
  if (state.family === 'rcs') return buildRcsPart(current, state, mint, layerId);
  return buildLiquidPart(current, state, mint, layerId);
}

function buildLiquidPart(
  current: EditingPart,
  state: LiquidWizardState,
  mint: () => string,
  layerId: string,
): WizardBuildResult {
  const part = structuredClone(current);
  const out: BuildAccum = { summary: [], createdMeshIds: [] };
  const summary = out.summary;

  // 1. Identity.
  applyIdentity(part, current, state.identity);

  // 2. Geometry. The bell (host index 0) carries the modules; the body is cosmetic.
  const generated = state.geometry.kind === 'generate';
  let hostTemplateId: string;
  let hostInstanceId: string | null;
  let exhaustLocation: Vec3 = { x: 0, y: 0, z: 0 };
  let attachNodeX = 0;
  let tankCenterX = 0;

  if (state.geometry.kind === 'generate') {
    const geo = liquidGeometry(state.gen);
    attachNodeX = geo.attachNodeX;
    tankCenterX = geo.tankCenterX;
    exhaustLocation = geo.exhaustLocation;
    const host = pushGeneratedBoxes(part, geo.boxes, geo.hostIndex, layerId, mint, out);
    hostTemplateId = host.hostTemplateId;
    hostInstanceId = host.hostInstanceId;
  } else if (state.geometry.kind === 'template') {
    hostTemplateId = state.geometry.templateId;
    hostInstanceId =
      part.placements.find((p) => p.subPartTemplateId === hostTemplateId)?.instanceId ?? null;
  } else {
    throw new Error('buildWizardPart: a liquid engine cannot be hosted at the part level.');
  }

  // 3. Attach node. Bulk plumbing only crosses a connector that declares BulkFluid
  //    (§2.5 rule 7), so a feed through the wizard's own node forces the capability on.
  let wizardConnectorId: string | null = null;
  const feedsThroughWizardNode = state.feed.kind === 'connector' && state.feed.connectorId === null;
  if (state.addAttachNode && generated) {
    const capabilities: ConnectorCapability[] = [];
    if (state.attachNodeBulkFluid || feedsThroughWizardNode) capabilities.push('BulkFluid');
    wizardConnectorId = pushConnector(
      part,
      attachNodeX,
      capabilities,
      layerId,
      'forward attach node',
      out,
    );
  }
  // An EXISTING connector the engine feeds through gets BulkFluid added (§7.3).
  if (state.feed.kind === 'connector' && state.feed.connectorId !== null) {
    const targetId = state.feed.connectorId;
    const target = part.connectors.find((c) => c.id === targetId);
    if (target && !target.capabilities.includes('BulkFluid')) target.capabilities.push('BulkFluid');
  }

  // 4. Module ids. The pools are read ONCE and grown as ids are claimed, so the four new ids
  //    cannot collide with the document's or with each other.
  const ids = allEngineModuleIds(part);
  const combId = uniqueModuleId('ThrustChamber', ids.combustors);
  ids.combustors.push(combId);
  const nozId = uniqueModuleId('Nozzle', ids.nozzles);
  ids.nozzles.push(nozId);
  const rocketId = uniqueModuleId('Engine', ids.rockets);
  ids.rockets.push(rocketId);
  const ctrlId = uniqueModuleId('Engine', ids.controllers);
  ids.controllers.push(ctrlId);

  const spd = getOrCreateSubPartData(part, hostTemplateId);

  // 5. The tank (created before the modules so the summary reads top-down).
  let feed: FeedSource;
  if (state.feed.kind === 'tank') {
    const feedId = state.feed.feedId.trim();
    const tank: Tank = {
      ...createTank(),
      id: feedId,
      shape: state.feed.shape,
      lengthM: state.feed.lengthM,
      outerRadiusM: state.feed.outerRadiusM,
      wallMaterialId: state.feed.wallMaterialId,
      roleAffinity: 'Engine',
      locationAsmb: { x: generated ? tankCenterX : 0, y: 0, z: 0 },
    };
    part.gameData.tanks.push(tank);
    feed = { kind: 'container', containerId: feedId, subPartInstanceId: null };
    summary.push({
      kind: 'tank',
      id: feedId,
      note: `${tank.shape.toLowerCase()} · ${tank.outerRadiusM} m radius · ${tank.wallMaterialId}`,
    });
  } else if (state.feed.kind === 'connector') {
    feed = { kind: 'connector', connectorId: state.feed.connectorId ?? wizardConnectorId ?? '' };
  } else {
    feed = {
      kind: 'container',
      containerId: state.feed.containerId,
      subPartInstanceId: state.feed.subPartInstanceId,
    };
  }

  // 6. The engine modules themselves.
  const combustor: Combustor = {
    ...createCombustor(combId),
    reactionId: state.reactionId,
    // Required for a Mixture reaction, forbidden for a Fixed one (§2.5 rule 9).
    mixtureRatio: reactionIsFixed(part, state.reactionId) ? null : state.mixtureRatio,
    maxPressurePa: state.chamberPressureBar * PA_PER_BAR,
    thermalEfficiency: state.thermalEffPct / 100,
    minimumThrottle: state.minThrottlePct / 100,
    plumbing: 'Bulk',
    // The chamber defers to the placing Part; the wiring entry below names the real source.
    feeds: [{ kind: 'parent' }],
  };
  spd.combustors.push(combustor);
  summary.push({
    kind: 'combustor',
    id: combId,
    note: `${state.reactionId} · ${state.chamberPressureBar} bar · min throttle ${state.minThrottlePct} %`,
  });

  const nozzle: DeLavalNozzle = {
    ...createNozzle(nozId),
    exitDiameterM: state.exitDiameterM,
    areaRatio: state.areaRatio,
    flowEfficiency: state.flowEffPct / 100,
    expansionEfficiency: state.expansionEffPct / 100,
    fxExitDiameterM: state.fx.fxExitDiameterM,
    exhaustLocation: { ...exhaustLocation },
    exhaustDirection: { x: -1, y: 0, z: 0 },
    exhaustLight: state.fx.exhaustLight,
    sound: state.fx.engineSound ? { action: 'On', soundId: DEFAULT_ENGINE_SOUND_ID } : null,
    // Returns [] when both FX slots are null, which is exactly "no plume".
    reactionPlumes: withDefaultReactionPlume([], {
      volumetricExhaustId: state.fx.volumetricExhaustId,
      plumeTrailId: null,
    }),
  };
  spd.nozzles.push(nozzle);
  summary.push({
    kind: 'nozzle',
    id: nozId,
    note: `Ø ${state.exitDiameterM} m · area ratio ${state.areaRatio}`,
  });

  const rocket: Rocket = createRocket(rocketId, combId, [nozId]);
  spd.rockets.push(rocket);
  summary.push({ kind: 'rocket', id: rocketId, note: `${combId} + ${nozId}` });

  const controller: RocketController = createRocketController(ctrlId, 'engine', [rocketId]);
  if (hostInstanceId !== null) controller.rocketRefs[0].subPartInstanceId = hostInstanceId;
  part.gameData.rocketControllers.push(controller);
  summary.push({ kind: 'controller', id: ctrlId, note: `engine controller driving ${rocketId}` });

  const wiring: ConsumerFeedWiring = {
    consumerId: combId,
    subPartInstanceId: hostInstanceId,
    feeds: [feed],
  };
  part.gameData.consumerFeedWiring.push(wiring);
  summary.push({
    kind: 'wiring',
    id: combId,
    note:
      feed.kind === 'container'
        ? `feeds from container ${feed.containerId}`
        : `feeds from connector ${feed.kind === 'connector' ? feed.connectorId : ''}`,
  });

  pushGimbal(part, hostInstanceId, state.gimbal, out);
  addEditorTag(part, 'Engines');

  // 7. Structure. The collider only exists for generated geometry — the wizard knows nothing
  //    about the bounds of a mesh the user brought.
  if (state.structure.autoCollider && generated) {
    pushAutoCollider(part, colliderExtents('liquid', state.gen), layerId, out);
  }
  pushCustomMass(part, state.structure.dryMassKg, out);

  return {
    part,
    summary,
    engineScope: { kind: 'subpart', templateId: hostTemplateId },
    focus: { group: 'combustor', scope: 'sub', index: spd.combustors.length - 1 },
    createdMeshIds: out.createdMeshIds,
    exhaustNozzleRef: {
      scope: 'subpart',
      templateId: hostTemplateId,
      instanceId: hostInstanceId,
      kind: 'delaval',
      index: spd.nozzles.length - 1,
      channel: 'physics',
    },
    detail: `liquid · ${hostTemplateId}`,
  };
}

/**
 * The SRB core (§5.3 + §6.2). The **casing** hosts the hardware — the solid motor, its grain
 * segments and the nozzle module all live on that SubPart — while the generated nozzle block
 * is only the aft plug the exhaust leaves from.
 *
 * Two KSA rules shape this path and both are load-time crashes, not style points:
 * the controller is a `RocketEngineController` (a `RocketThrusterController` driving a solid
 * motor THROWS, §2.5 rule 4), and `<DefaultPressure>` must sit inside the reaction's stable
 * band (§2.5 rule 5) — which the `srb-propellant` step blocks on before we ever get here.
 */
function buildSrbPart(
  current: EditingPart,
  state: SrbWizardState,
  mint: () => string,
  layerId: string,
): WizardBuildResult {
  const part = structuredClone(current);
  const out: BuildAccum = { summary: [], createdMeshIds: [] };

  // 1. Identity.
  applyIdentity(part, current, state.identity);

  // 2. Geometry.
  const generated = state.geometry.kind === 'generate';
  let hostTemplateId: string;
  let hostInstanceId: string | null;
  let exhaustLocation: Vec3 = { x: 0, y: 0, z: 0 };
  let attachNodeX = 0;
  let grainCenterXs: number[] = [];

  if (state.geometry.kind === 'generate') {
    const geo = srbGeometry(state.gen, state.grain.segmentCount);
    attachNodeX = geo.attachNodeX;
    exhaustLocation = geo.exhaustLocation;
    grainCenterXs = geo.grainCenterXs;
    const host = pushGeneratedBoxes(part, geo.boxes, geo.hostIndex, layerId, mint, out);
    hostTemplateId = host.hostTemplateId;
    hostInstanceId = host.hostInstanceId;
  } else if (state.geometry.kind === 'template') {
    hostTemplateId = state.geometry.templateId;
    hostInstanceId =
      part.placements.find((p) => p.subPartTemplateId === hostTemplateId)?.instanceId ?? null;
  } else {
    throw new Error('buildWizardPart: a solid motor cannot be hosted at the part level.');
  }

  // 3. Nodes. The ordinary forward attach node is how the booster stacks onto a vehicle; the
  //    optional CASE node is a SECOND connector at the same face that lets a user stack more
  //    grain segments onto this motor, and needs the SolidMotorCase capability to carry them
  //    (§2.5 rule 7).
  if (generated) pushConnector(part, attachNodeX, [], layerId, 'forward attach node', out);
  let caseConnectorId: string | null = null;
  if (state.acceptCaseSegmentsViaConnector) {
    caseConnectorId = pushConnector(
      part,
      attachNodeX,
      ['SolidMotorCase'],
      layerId,
      'case segment node',
      out,
    );
  }

  // 4. Module ids. A solid motor shares the COMBUSTOR pool (a `<Core Id>` may name either)
  //    and a grain segment shares the CONTAINER pool with tanks, so each id is claimed
  //    against the same pools the module editors use — and pushed back as it is taken, so the
  //    N grain ids differ from one another.
  const ids = allEngineModuleIds(part);
  const motorId = uniqueModuleId('Motor', ids.combustors);
  ids.combustors.push(motorId);
  const nozId = uniqueModuleId('Nozzle', ids.nozzles);
  ids.nozzles.push(nozId);
  const grainIds: string[] = [];
  for (let i = 0; i < state.grain.segmentCount; i++) {
    const grainId = uniqueModuleId('Grain', ids.containers);
    ids.containers.push(grainId);
    grainIds.push(grainId);
  }
  const rocketId = uniqueModuleId('SRB', ids.rockets);
  ids.rockets.push(rocketId);
  const ctrlId = uniqueModuleId('SRB', ids.controllers);
  ids.controllers.push(ctrlId);

  const spd = getOrCreateSubPartData(part, hostTemplateId);

  // 5. Grain segments — the motor's propellant, stacked aft-to-forward inside the casing.
  grainIds.forEach((grainId, i) => {
    const segment: SolidGrainSegment = {
      ...createSolidGrainSegment(grainId),
      wallMaterialId: state.grain.wallMaterialId,
      outerRadiusM: state.grain.outerRadiusM,
      wallThicknessMm: state.grain.wallThicknessMm,
      lengthM: state.grain.lengthM,
      locationAsmb: { x: generated ? grainCenterXs[i] : 0, y: 0, z: 0 },
    };
    spd.solidGrainSegments.push(segment);
    out.summary.push({
      kind: 'grain',
      id: grainId,
      note:
        `${state.grain.lengthM} m · Ø ${2 * state.grain.outerRadiusM} m · ` +
        `${state.grain.wallThicknessMm} mm ${state.grain.wallMaterialId}`,
    });
  });

  // 6. The motor. Its feeds ARE the grain segments — a solid motor draws from its own case,
  //    not from a wiring entry — plus the case connector when the user opted into stacking.
  const feeds: FeedSource[] = grainIds.map((containerId) => ({
    kind: 'container',
    containerId,
    subPartInstanceId: null,
  }));
  if (caseConnectorId !== null) feeds.push({ kind: 'connector', connectorId: caseConnectorId });
  const motor: SolidMotor = {
    ...createSolidMotor(motorId),
    reactionId: state.reactionId,
    defaultPressurePa: state.defaultPressureBar * PA_PER_BAR,
    thermalEfficiency: state.thermalEffPct / 100,
    grainGeometryId: state.grainGeometryId,
    feeds,
  };
  spd.solidMotors.push(motor);
  out.summary.push({
    kind: 'solid motor',
    id: motorId,
    note:
      `${state.reactionId} · ${state.defaultPressureBar} bar · ${state.grainGeometryId} grain · ` +
      `${grainIds.length} segment${grainIds.length === 1 ? '' : 's'}`,
  });

  // 7. The nozzle. A `<SolidMotorNozzle>` has NO area ratio — KSA derives the throat from the
  //    exit area — which is why this is `createSolidMotorNozzle`, not `createNozzle`.
  const nozzle: SolidMotorNozzle = {
    ...createSolidMotorNozzle(nozId),
    exitDiameterM: state.nozzle.exitDiameterM,
    flowEfficiency: state.nozzle.flowEffPct / 100,
    expansionEfficiency: state.nozzle.expansionEffPct / 100,
    exhaustLocation: { ...exhaustLocation },
    exhaustDirection: { x: -1, y: 0, z: 0 },
    exhaustLight: state.fx.exhaustLight,
    sound: state.fx.engineSound ? { action: 'On', soundId: DEFAULT_ENGINE_SOUND_ID } : null,
    // Returns [] when both FX slots are null, which is exactly "no plume".
    reactionPlumes: withDefaultReactionPlume([], {
      volumetricExhaustId: state.fx.volumetricExhaustId,
      plumeTrailId: state.fx.plumeTrail ? 'DefaultPlumeTrail' : null,
    }),
  };
  spd.solidNozzles.push(nozzle);
  out.summary.push({
    kind: 'solid nozzle',
    id: nozId,
    note: `Ø ${state.nozzle.exitDiameterM} m · no area ratio (KSA sizes the throat)`,
  });

  const rocket: Rocket = createRocket(rocketId, motorId, [nozId]);
  spd.rockets.push(rocket);
  out.summary.push({ kind: 'rocket', id: rocketId, note: `${motorId} + ${nozId}` });

  // ALWAYS 'engine': a RocketThrusterController driving a solid motor throws at load.
  const controller: RocketController = createRocketController(ctrlId, 'engine', [rocketId]);
  if (hostInstanceId !== null) controller.rocketRefs[0].subPartInstanceId = hostInstanceId;
  part.gameData.rocketControllers.push(controller);
  out.summary.push({
    kind: 'controller',
    id: ctrlId,
    note: `engine controller driving ${rocketId}`,
  });

  pushGimbal(part, hostInstanceId, state.gimbal, out);
  // Stock solids are tagged Booster, not Engines.
  addEditorTag(part, 'Booster');

  if (state.structure.autoCollider && generated) {
    pushAutoCollider(part, colliderExtents('srb', state.gen), layerId, out);
  }
  pushCustomMass(part, state.structure.dryMassKg, out);

  return {
    part,
    summary: out.summary,
    engineScope: { kind: 'subpart', templateId: hostTemplateId },
    focus: { group: 'solidMotor', scope: 'sub', index: spd.solidMotors.length - 1 },
    createdMeshIds: out.createdMeshIds,
    exhaustNozzleRef: {
      scope: 'subpart',
      templateId: hostTemplateId,
      instanceId: hostInstanceId,
      kind: 'solid',
      index: spd.solidNozzles.length - 1,
      channel: 'physics',
    },
    detail: `srb · ${hostTemplateId}`,
  };
}

/**
 * The RCS core (§5.4 + §6.3). Two hosting modes, and the difference is the whole point:
 *
 *  - **SubPart host** — the block's modules live on one reusable template, the chamber says
 *    `<FeedsFrom Parent="true"/>`, and a `<ConsumerFeedWiring>` entry on the PART names the
 *    real source. That is how one authored template gets instanced per placement.
 *  - **Part level** (`geometry.kind === 'part'`) — the modules go straight into
 *    `<PartGameData>` and the chamber names its source itself. There is NO wiring entry:
 *    `{kind:'parent'}` at part level would defer to a parent that does not exist, and KSA
 *    forbids a wiring entry that defers to Parent anyway (§2.5 rule 6).
 *
 * Never gimballed: an RCS block's nozzles deliberately point off local X, which is exactly
 * the geometry `gimbal-thrust-axis-not-x` calls out, and stock RCS carries no gimbal.
 */
function buildRcsPart(
  current: EditingPart,
  state: RcsWizardState,
  mint: () => string,
  layerId: string,
): WizardBuildResult {
  const part = structuredClone(current);
  const out: BuildAccum = { summary: [], createdMeshIds: [] };

  // 1. Identity.
  applyIdentity(part, current, state.identity);

  // 2. Geometry. `hostTemplateId === null` ⇒ the part itself hosts the thrusters.
  const generated = state.geometry.kind === 'generate';
  let hostTemplateId: string | null = null;
  let hostInstanceId: string | null = null;
  let attachNodeX = 0;

  if (state.geometry.kind === 'generate') {
    const geo = rcsGeometry(state.gen);
    attachNodeX = geo.attachNodeX;
    const host = pushGeneratedBoxes(part, geo.boxes, geo.hostIndex, layerId, mint, out);
    hostTemplateId = host.hostTemplateId;
    hostInstanceId = host.hostInstanceId;
  } else if (state.geometry.kind === 'template') {
    hostTemplateId = state.geometry.templateId;
    hostInstanceId =
      part.placements.find((p) => p.subPartTemplateId === hostTemplateId)?.instanceId ?? null;
  }

  // 3. Attach node — no capabilities needed. Service plumbing rides the `Electricity |
  //    ServiceFluid` an EMPTY capability list means (§2.5 rule 7), so an RCS feed across a
  //    bare connector already works; BulkFluid is a liquid-engine concern only.
  let wizardConnectorId: string | null = null;
  if (state.addAttachNode && generated) {
    wizardConnectorId = pushConnector(part, attachNodeX, [], layerId, 'forward attach node', out);
  }

  // 4. Module ids — one nozzle id per layout row, each pushed back so they differ.
  const ids = allEngineModuleIds(part);
  const combId = uniqueModuleId('Thruster', ids.combustors);
  ids.combustors.push(combId);
  const nozIds = state.layout.nozzles.map(() => {
    const id = uniqueModuleId('Nozzle', ids.nozzles);
    ids.nozzles.push(id);
    return id;
  });
  const rocketId = uniqueModuleId('Rcs', ids.rockets);
  ids.rockets.push(rocketId);
  const ctrlId = uniqueModuleId('Thruster', ids.controllers);
  ids.controllers.push(ctrlId);

  // Where the hardware lands: the host template's <SubPartGameData>, or <PartGameData>.
  const spd = hostTemplateId === null ? null : getOrCreateSubPartData(part, hostTemplateId);
  const target: {
    combustors: Combustor[];
    nozzles: DeLavalNozzle[];
    rockets: Rocket[];
  } = spd ?? part.gameData;

  // 5. The feed. A new tank is always PART-level: that is the scope both an unscoped wiring
  //    feed and a part-level chamber's own `<FeedsFrom Container>` resolve against.
  let feed: FeedSource;
  if (state.feed.kind === 'tank') {
    const feedId = state.feed.feedId.trim();
    const tank: Tank = {
      ...createTank(),
      id: feedId,
      // Spherical: `lengthM` is left at the factory default because the serializer emits no
      // length for a sphere.
      shape: 'Spherical',
      outerRadiusM: state.feed.outerRadiusM,
      wallMaterialId: state.feed.wallMaterialId,
      roleAffinity: 'Thruster',
      locationAsmb: { x: 0, y: 0, z: 0 },
    };
    part.gameData.tanks.push(tank);
    feed = { kind: 'container', containerId: feedId, subPartInstanceId: null };
    out.summary.push({
      kind: 'tank',
      id: feedId,
      note: `spherical · ${tank.outerRadiusM} m radius · ${tank.wallMaterialId}`,
    });
  } else if (state.feed.kind === 'connector') {
    feed = { kind: 'connector', connectorId: state.feed.connectorId ?? wizardConnectorId ?? '' };
  } else {
    feed = {
      kind: 'container',
      containerId: state.feed.containerId,
      subPartInstanceId: state.feed.subPartInstanceId,
    };
  }

  // 6. The chamber. `minimumThrottle: 1` is on/off — an RCS thruster does not throttle, it
  //    pulses (§2.5 rule 3) — and KSA floors `<MinimumPulseTime>` at 1 ms at load, so the
  //    document stores the floored value rather than a number the game will quietly change.
  const combustor: Combustor = {
    ...createCombustor(combId),
    plumbing: 'Service',
    reactionId: state.reactionId,
    mixtureRatio: reactionIsFixed(part, state.reactionId) ? null : state.mixtureRatio,
    maxPressurePa: state.maxPressureBar * PA_PER_BAR,
    thermalEfficiency: state.thermalEffPct / 100,
    minimumPulseTimeS: Math.max(0.001, state.minPulseMs / 1000),
    minimumThrottle: 1,
    feeds: spd ? [{ kind: 'parent' }] : [feed],
  };
  target.combustors.push(combustor);
  out.summary.push({
    kind: 'combustor',
    id: combId,
    note: `${state.reactionId} · Service · ${state.maxPressureBar} bar · ${state.minPulseMs} ms pulse`,
  });

  // 7. One nozzle per layout row. The directions come straight from the layout presets, which
  //    emit exact unit vectors — KSA applies thrust unnormalized, so length is thrust.
  state.layout.nozzles.forEach((spec, i) => {
    const nozzle: DeLavalNozzle = {
      ...createNozzle(nozIds[i]),
      exitDiameterM: state.exitDiameterM,
      areaRatio: state.areaRatio,
      flowEfficiency: state.flowEffPct / 100,
      expansionEfficiency: state.expansionEffPct / 100,
      exhaustLocation: { ...spec.location },
      exhaustDirection: { ...spec.direction },
      exhaustLight: state.fx.exhaustLight,
      sound: state.fx.rcsSound ? { action: 'On', soundId: DEFAULT_RCS_SOUND_ID } : null,
      reactionPlumes: withDefaultReactionPlume([], {
        volumetricExhaustId: state.fx.volumetricExhaustId,
        plumeTrailId: null,
      }),
    };
    target.nozzles.push(nozzle);
    out.summary.push({
      kind: 'nozzle',
      id: nozIds[i],
      note: `Ø ${state.exitDiameterM} m · fires ${spec.direction.x} ${spec.direction.y} ${spec.direction.z}`,
    });
  });

  const rocket: Rocket = createRocket(rocketId, combId, nozIds);
  target.rockets.push(rocket);
  out.summary.push({ kind: 'rocket', id: rocketId, note: `${combId} + ${nozIds.length} nozzles` });

  // The controller is ALWAYS part-level, in both hosting modes.
  const controller: RocketController = createRocketController(ctrlId, 'thruster', [rocketId]);
  controller.controlMapFlags = state.controlMapFlags;
  if (hostInstanceId !== null) controller.rocketRefs[0].subPartInstanceId = hostInstanceId;
  part.gameData.rocketControllers.push(controller);
  out.summary.push({
    kind: 'controller',
    id: ctrlId,
    note: state.controlMapFlags
      ? `thruster controller · ${state.controlMapFlags.join(' ')}`
      : 'thruster controller · control map derived from geometry',
  });

  // 8. Wiring — only for a SubPart host; a part-level chamber already names its own source.
  if (spd) {
    const wiring: ConsumerFeedWiring = {
      consumerId: combId,
      subPartInstanceId: hostInstanceId,
      feeds: [feed],
    };
    part.gameData.consumerFeedWiring.push(wiring);
  }
  out.summary.push({
    kind: spd ? 'wiring' : 'feed',
    id: combId,
    note:
      feed.kind === 'container'
        ? `feeds from container ${feed.containerId}`
        : `feeds from connector ${feed.kind === 'connector' ? feed.connectorId : ''}`,
  });

  addEditorTag(part, 'RCS');

  if (state.structure.autoCollider && generated) {
    pushAutoCollider(part, colliderExtents('rcs', state.gen), layerId, out);
  }
  pushCustomMass(part, state.structure.dryMassKg, out);

  const nozzleIndex = target.nozzles.length - 1;
  return {
    part,
    summary: out.summary,
    engineScope:
      hostTemplateId === null ? { kind: 'part' } : { kind: 'subpart', templateId: hostTemplateId },
    focus: {
      group: 'combustor',
      scope: hostTemplateId === null ? 'part' : 'sub',
      index: target.combustors.length - 1,
    },
    createdMeshIds: out.createdMeshIds,
    exhaustNozzleRef:
      hostTemplateId === null
        ? { scope: 'part', kind: 'delaval', index: nozzleIndex, channel: 'physics' }
        : {
            scope: 'subpart',
            templateId: hostTemplateId,
            instanceId: hostInstanceId,
            kind: 'delaval',
            index: nozzleIndex,
            channel: 'physics',
          },
    detail: `rcs · ${hostTemplateId ?? 'part'}`,
  };
}
