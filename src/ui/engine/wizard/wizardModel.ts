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
 * Phase W2 implements the LIQUID family only. The SRB/RCS state shapes and step lists are
 * declared (so the dialog can be written against the full union), but their `init*` and
 * their build/validate paths land in Phases W5/W6 — until then both entry points throw.
 */

import {
  createCombustor,
  createNozzle,
  createRocket,
  createRocketController,
  createTank,
  DEFAULT_ENGINE_SOUND_ID,
  DEFAULT_LAYER_ID,
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
  SubPartPlacement,
  Tank,
  TankShape,
  Vec3,
} from '../../../ksa/types';
import type { ReactionData } from '../../../ksa/reactionCatalog';
import { normalizeColliderSize } from '../../../ksa/colliderSize';
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
  WIZARD_BOUNDS,
  type WizardBound,
} from './wizardPresets';
import { colliderExtents, liquidGeometry, LIQUID_GEN_DEFAULTS } from './wizardGeometry';
import type { LiquidGen, RcsGen, RcsNozzleSpec, SrbGen } from './wizardGeometry';

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
  if (state.family !== 'liquid') {
    throw new Error(`validateWizardStep: the ${state.family} family is not implemented yet.`);
  }
  return validateLiquidStep(state, step, part, reactions);
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
    if (state.geometry.kind === 'generate') {
      const dims: [string, number][] = [
        ['Bell width', state.gen.bellWidthM],
        ['Bell cross-section', state.gen.bellCrossM],
        ['Body length', state.gen.bodyLengthM],
        ['Body cross-section', state.gen.bodyCrossM],
      ];
      const max = WIZARD_BOUNDS.genDimM.max;
      for (const [label, value] of dims) {
        if (!Number.isFinite(value) || value <= 0 || value > max) {
          out.push(`${label} must be between 0 and ${max} m.`);
        }
      }
    } else if (state.geometry.kind === 'template') {
      if (!state.geometry.templateId.trim()) {
        out.push('Choose the mesh template that will host the engine.');
      }
    } else {
      out.push(
        'A liquid engine needs a SubPart to host its hardware — generate geometry or pick a mesh.',
      );
    }
    return out;
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

    const reaction = reactions?.get(state.reactionId);
    if (reaction?.kind === 'Mixture') {
      const ratio = state.mixtureRatio;
      if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) {
        out.push(
          `${reaction.name} is a mixture reaction — give it an O/F mixture ratio greater than 0.`,
        );
      }
    } else if (reaction?.kind === 'Fixed' && state.mixtureRatio !== null) {
      out.push(`${reaction.name} is a fixed reaction — it takes no mixture ratio.`);
    }
    return out;
  }

  if (step === 'feed') {
    if (state.feed.kind === 'tank') {
      const feedId = state.feed.feedId.trim();
      if (!feedId) {
        out.push('Give the new tank a feed id — an engine can only draw from a named container.');
      } else if (feedTargetsOf(part).containers.some((c) => c.id === feedId)) {
        out.push(`Feed id "${feedId}" is already used by another container on this part.`);
      }
    } else if (state.feed.kind === 'connector') {
      const connectorId = state.feed.connectorId;
      if (connectorId === null) {
        if (!state.addAttachNode) {
          out.push(
            'The feed names the wizard\'s attach node, so turn "Add a forward attach node" back ' +
              'on — or pick an existing connector.',
          );
        }
      } else if (!part.connectors.some((c) => c.id === connectorId)) {
        out.push(`Connector ${connectorId} no longer exists on this part — pick another feed.`);
      }
    } else if (!state.feed.containerId.trim()) {
      out.push('Choose the existing container the engine should draw from.');
    }
    return out;
  }

  if (step === 'gimbal') {
    if (state.gimbal.enabled) {
      push(inRange('Max gimbal angle Y', state.gimbal.maxYDeg, WIZARD_BOUNDS.gimbalDeg, '°'));
      push(inRange('Max gimbal angle Z', state.gimbal.maxZDeg, WIZARD_BOUNDS.gimbalDeg, '°'));
    }
    return out;
  }

  if (step === 'structure') {
    const mass = state.structure.dryMassKg;
    if (mass !== null && (!Number.isFinite(mass) || mass <= 0)) {
      out.push('Dry mass must be greater than 0 kg — KSA rejects a <CustomMass> of 0.');
    }
    return out;
  }

  // 'fx' has nothing that can block, and 'review' is gated on validateEngines by the dialog
  // (a finding there is richer than anything this function could say).
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
  if (state.family !== 'liquid') {
    throw new Error(`buildWizardPart: the ${state.family} family is not implemented yet.`);
  }
  return buildLiquidPart(current, state, mint, layerId);
}

function buildLiquidPart(
  current: EditingPart,
  state: LiquidWizardState,
  mint: () => string,
  layerId: string,
): WizardBuildResult {
  const part = structuredClone(current);
  const summary: WizardSummaryRow[] = [];
  const createdMeshIds: string[] = [];

  // 1. Identity. A part id is a free-form document string (the export dialog is what
  //    validates it), so it goes in verbatim — sanitizing here would mangle ids KSA accepts.
  const partIdDraft = state.identity.partId.trim();
  if (partIdDraft && isDefaultPartId(current.partId)) part.partId = partIdDraft;
  const displayName = state.identity.displayName.trim();
  if (displayName) part.gameData.displayName = displayName;

  // 2. Geometry. Every generated box is unrotated and laid along local X — KSA's thrust axis
  //    (§2.5 rule 1) — so the wizard never emits a placement rotation.
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
    const templateIds: string[] = [];
    const instanceIds: string[] = [];
    for (const box of geo.boxes) {
      const mesh = makePrimitiveCustomMesh(box.name, box.primitive, mint);
      part.customMeshes.push(mesh);
      createdMeshIds.push(mesh.id);
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
      summary.push({ kind: 'mesh', id: mesh.name, note: `${box.primitive.kind} primitive` });
      summary.push({
        kind: 'placement',
        id: instanceId,
        note: `${mesh.name} at x ${box.position.x}`,
      });
    }
    hostTemplateId = templateIds[geo.hostIndex];
    hostInstanceId = instanceIds[geo.hostIndex];
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
    wizardConnectorId = nextConnectorId(part);
    const connector: Connector = {
      id: wizardConnectorId,
      position: { x: attachNodeX, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      flags: [],
      capabilities,
      siblingIds: [],
      layerId,
    };
    part.connectors.push(connector);
    summary.push({
      kind: 'connector',
      id: wizardConnectorId,
      note: capabilities.length
        ? `forward attach node · ${capabilities.join(' ')}`
        : 'forward attach node',
    });
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

  if (
    state.gimbal.enabled &&
    hostInstanceId !== null &&
    (state.gimbal.maxYDeg > 0 || state.gimbal.maxZDeg > 0)
  ) {
    const gimbal: Gimbal = {
      subPartInstanceId: hostInstanceId,
      maxAngleYDeg: state.gimbal.maxYDeg,
      maxAngleZDeg: state.gimbal.maxZDeg,
      constrainToCircle: state.gimbal.constrainToCircle,
    };
    part.gameData.gimbals.push(gimbal);
    summary.push({
      kind: 'gimbal',
      id: hostInstanceId,
      note: `${state.gimbal.maxYDeg}° Y · ${state.gimbal.maxZDeg}° Z`,
    });
  }

  if (!part.editorTags.includes('Engines')) part.editorTags.push('Engines');

  // 7. Structure. The collider only exists for generated geometry — the wizard knows nothing
  //    about the bounds of a mesh the user brought.
  if (state.structure.autoCollider && generated) {
    const extents = colliderExtents('liquid', state.gen);
    const collider: PartCollider = {
      id: nextColliderIdFor(part),
      shape: 'Box',
      ownerTemplateId: null,
      position: { ...extents.center },
      rotation: { x: 0, y: 0, z: 0 },
      // `scale` IS the outer size in metres (see PartCollider) — same encoding as addCollider.
      scale: normalizeColliderSize('Box', extents.size),
      layerId,
    };
    part.colliders.push(collider);
    summary.push({
      kind: 'collider',
      id: collider.id,
      note: `box ${extents.size.x} × ${extents.size.y} × ${extents.size.z} m`,
    });
  }

  if (state.structure.dryMassKg !== null) {
    part.gameData.customMass = state.structure.dryMassKg;
    summary.push({ kind: 'mass', id: 'CustomMass', note: `${state.structure.dryMassKg} kg` });
  }

  return {
    part,
    summary,
    engineScope: { kind: 'subpart', templateId: hostTemplateId },
    focus: { group: 'combustor', scope: 'sub', index: spd.combustors.length - 1 },
    createdMeshIds,
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
