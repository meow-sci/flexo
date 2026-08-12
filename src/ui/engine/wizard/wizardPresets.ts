/**
 * Stock-derived preset tables for the engine wizard — pure data, no imports beyond types.
 *
 * Every number here was read off KSA's own content and transcribed verbatim from
 * `plans/ENGINE_WIZARD_PLAN.md` §3 (which cites
 * `ksa-game-assemblies/current/Content/Core/CorePropulsion{A,B,C}GameData.xml` and
 * `decomp/KSA/EngineDesigner.cs`). Treat the plan as the source of truth: change a value
 * here only alongside the table there.
 */

// ── bounds (§3.1 — KSA's in-game Engine Designer) ─────────────────────────────

/** An inclusive numeric range for a wizard field. */
export interface WizardBound {
  min: number;
  max: number;
}

/**
 * Field bounds the wizard clamps/validates against. The first seven come from KSA's own
 * Engine Designer (§3.1); `genDimM` is the generated-geometry limit from §7.1
 * ("generate dims within (0, 50] m"), and the two counts are wizard-imposed UI caps.
 */
export const WIZARD_BOUNDS = {
  chamberPressureBar: { min: 1, max: 500 },
  areaRatio: { min: 1.1, max: 300 },
  exitDiameterM: { min: 0.01, max: 10 },
  efficiencyPct: { min: 1, max: 100 },
  minThrottlePct: { min: 1, max: 100 },
  gimbalDeg: { min: 0, max: 45 },
  minPulseMs: { min: 0, max: 10000 },
  genDimM: { min: 0.001, max: 50 },
  segmentCount: { min: 1, max: 8 },
  rcsNozzleCount: { min: 1, max: 12 },
} as const satisfies Record<string, WizardBound>;

// ── liquid (§3.2) ─────────────────────────────────────────────────────────────

/** One row of {@link LIQUID_PRESETS}. Presets set numbers only — never the reaction. */
export interface LiquidPreset {
  key: string;
  label: string;
  pressureBar: number;
  areaRatio: number;
  exitDiameterM: number;
  minThrottlePct: number;
  thermalEffPct: number;
  flowEffPct: number;
  expansionEffPct: number;
  gimbalYDeg: number;
  gimbalZDeg: number;
  /** Seeds the `structure` step's `<CustomMass>` field, in kg (§7.6). */
  dryMassKg: number;
  note: string;
}

export const LIQUID_PRESETS = [
  {
    key: 'balanced',
    label: 'Balanced (default)',
    pressureBar: 75,
    areaRatio: 25,
    exitDiameterM: 1.1,
    minThrottlePct: 40,
    thermalEffPct: 100,
    flowEffPct: 100,
    expansionEffPct: 100,
    gimbalYDeg: 8,
    gimbalZDeg: 8,
    dryMassKg: 500,
    note: 'the tutorial engine, ~525 kN vac',
  },
  {
    key: 'sealevel',
    label: 'Sea-level booster',
    pressureBar: 150,
    areaRatio: 21,
    exitDiameterM: 2.5,
    minThrottlePct: 20,
    thermalEffPct: 100,
    flowEffPct: 100,
    expansionEffPct: 100,
    gimbalYDeg: 5,
    gimbalZDeg: 5,
    dryMassKg: 1500,
    note: 'LR91 Sea',
  },
  {
    key: 'vacuum',
    label: 'Vacuum stage',
    pressureBar: 49,
    areaRatio: 49,
    exitDiameterM: 2.5,
    minThrottlePct: 10,
    thermalEffPct: 100,
    flowEffPct: 100,
    expansionEffPct: 100,
    gimbalYDeg: 2,
    gimbalZDeg: 2,
    dryMassKg: 300,
    note: 'LR91 Vac',
  },
  {
    key: 'lander',
    label: 'Deep-throttle lander',
    pressureBar: 7,
    areaRatio: 47,
    exitDiameterM: 2.2,
    minThrottlePct: 1,
    thermalEffPct: 100,
    flowEffPct: 100,
    expansionEffPct: 100,
    gimbalYDeg: 10,
    gimbalZDeg: 10,
    dryMassKg: 100,
    note: 'VTR-10',
  },
] as const satisfies readonly LiquidPreset[];

// ── SRB (§3.3) ────────────────────────────────────────────────────────────────

/**
 * Nozzle efficiencies shared by every SRB preset (matches `createSolidMotorNozzle`'s
 * defaults), so they are constants rather than per-row fields.
 */
export const SRB_NOZZLE_FLOW_EFF_PCT = 95;
export const SRB_NOZZLE_EXPANSION_EFF_PCT = 98;

/** One row of {@link SRB_PRESETS}. */
export interface SrbPreset {
  key: string;
  label: string;
  /** Solid-category `<Reaction Id>` — must be Fixed, single-reactant, burn-rate-bearing. */
  reactionId: string;
  /** `DefaultPressure`; must sit in the reaction's (MinimumBurnPressure, MaxStablePressure]. */
  pressureBar: number;
  thermalEffPct: number;
  grainGeometryId: string;
  exitDiameterM: number;
  grainOuterRadiusM: number;
  grainWallThicknessMm: number;
  /** Length of ONE grain segment, in metres. */
  grainLengthM: number;
  segmentCount: number;
  gimbalEnabled: boolean;
  gimbalYDeg: number;
  gimbalZDeg: number;
  dryMassKg: number;
}

export const SRB_PRESETS = [
  {
    key: 'small',
    label: 'Small booster',
    reactionId: 'DoubleBase',
    pressureBar: 45,
    thermalEffPct: 90,
    grainGeometryId: 'BoostSustain',
    exitDiameterM: 0.15,
    grainOuterRadiusM: 0.125,
    grainWallThicknessMm: 3,
    grainLengthM: 0.25,
    segmentCount: 1,
    gimbalEnabled: false,
    gimbalYDeg: 0,
    gimbalZDeg: 0,
    dryMassKg: 20,
  },
  {
    key: 'medium',
    label: 'Medium booster',
    reactionId: 'DoubleBase',
    pressureBar: 45,
    thermalEffPct: 90,
    grainGeometryId: 'BoostSustain',
    exitDiameterM: 0.32,
    grainOuterRadiusM: 0.25,
    grainWallThicknessMm: 4,
    grainLengthM: 0.5,
    segmentCount: 1,
    gimbalEnabled: false,
    gimbalYDeg: 0,
    gimbalZDeg: 0,
    dryMassKg: 60,
  },
  {
    key: 'large',
    label: 'Large booster (default)',
    reactionId: 'DoubleBase',
    pressureBar: 45,
    thermalEffPct: 90,
    grainGeometryId: 'BoostSustain',
    exitDiameterM: 0.64,
    grainOuterRadiusM: 0.5,
    grainWallThicknessMm: 6,
    grainLengthM: 2,
    segmentCount: 1,
    gimbalEnabled: false,
    gimbalYDeg: 0,
    gimbalZDeg: 0,
    dryMassKg: 300,
  },
  {
    key: 'heavy',
    label: 'Heavy segmented',
    reactionId: 'APCP',
    pressureBar: 70,
    thermalEffPct: 95,
    grainGeometryId: 'Neutral',
    exitDiameterM: 1.2,
    grainOuterRadiusM: 1,
    grainWallThicknessMm: 8,
    grainLengthM: 2,
    segmentCount: 2,
    gimbalEnabled: true,
    gimbalYDeg: 6,
    gimbalZDeg: 6,
    dryMassKg: 2000,
  },
  {
    key: 'superheavy',
    label: 'Super-heavy',
    reactionId: 'APCP',
    pressureBar: 63,
    thermalEffPct: 95,
    grainGeometryId: 'Neutral',
    exitDiameterM: 3.5,
    grainOuterRadiusM: 2,
    grainWallThicknessMm: 10,
    grainLengthM: 3,
    segmentCount: 3,
    gimbalEnabled: true,
    gimbalYDeg: 6,
    gimbalZDeg: 6,
    dryMassKg: 9000,
  },
] as const satisfies readonly SrbPreset[];

// ── RCS (§3.4) ────────────────────────────────────────────────────────────────

/** Nozzle arrangement a thruster block ships with; `custom` is user-edited, so not a preset. */
export type RcsLayoutPreset = 'single' | 'quad' | 'six';

/** One row of {@link RCS_PRESETS}. */
export interface RcsPreset {
  key: string;
  label: string;
  reactionId: string;
  /** MMH_NTO is a Mixture reaction, so a `MixtureRatio` is mandatory (§2.5 rule 9). */
  mixtureRatio: number;
  pressureBar: number;
  thermalEffPct: number;
  minPulseMs: number;
  exitDiameterM: number;
  areaRatio: number;
  flowEffPct: number;
  expansionEffPct: number;
  layout: RcsLayoutPreset;
  dryMassKg: number;
}

export const RCS_PRESETS = [
  {
    key: 'blockLarge',
    label: 'Thruster block, large (default)',
    reactionId: 'MMH_NTO',
    mixtureRatio: 1.6,
    pressureBar: 7,
    thermalEffPct: 95,
    minPulseMs: 5.4,
    exitDiameterM: 0.8,
    areaRatio: 40,
    flowEffPct: 100,
    expansionEffPct: 70,
    layout: 'quad',
    dryMassKg: 40,
  },
  {
    key: 'blockSmall',
    label: 'Thruster block, small',
    reactionId: 'MMH_NTO',
    mixtureRatio: 1.6,
    pressureBar: 7,
    thermalEffPct: 95,
    minPulseMs: 5.4,
    exitDiameterM: 0.4,
    areaRatio: 40,
    flowEffPct: 100,
    expansionEffPct: 70,
    layout: 'quad',
    dryMassKg: 40,
  },
  {
    key: 'micro',
    label: 'Micro (MMU-class)',
    reactionId: 'MMH_NTO',
    mixtureRatio: 1.6,
    pressureBar: 21,
    thermalEffPct: 75,
    minPulseMs: 1,
    exitDiameterM: 0.03,
    areaRatio: 50,
    flowEffPct: 72,
    expansionEffPct: 50,
    layout: 'six',
    dryMassKg: 5,
  },
] as const satisfies readonly RcsPreset[];

// ── materials, flags, descriptions ────────────────────────────────────────────

/**
 * Solid-phase material ids offered for tank/case walls (stock `Content/Core/Materials.xml`,
 * `(s)` = the solid phase KSA resolves a wall against).
 */
export const WALL_MATERIAL_IDS: readonly string[] = [
  'Aluminum.2014(s)',
  'Aluminum.8090(s)',
  'Aluminum.7075(s)',
  'Titanium.64(s)',
  'Steel.300(s)',
  'Steel.304L(s)',
  'Inconel.718(s)',
  'CarbonFiber(s)',
  'Fiberglass(s)',
];

/** Wall material the wizard seeds for liquid/RCS tanks. */
export const DEFAULT_WALL_MATERIAL_ID = 'Aluminum.2014(s)';

/** Wall material the wizard seeds for solid grain segments (§3.3). */
export const SRB_WALL_MATERIAL_ID = 'Steel.300(s)';

/**
 * The 12 `RcsThrusterController` control-map flags, in the order the manual control-map
 * grid renders them (§7.10).
 */
export const RCS_CONTROL_FLAGS: readonly string[] = [
  'RollRight',
  'RollLeft',
  'PitchUp',
  'PitchDown',
  'YawRight',
  'YawLeft',
  'TranslateForward',
  'TranslateBackward',
  'TranslateRight',
  'TranslateLeft',
  'TranslateDown',
  'TranslateUp',
];

/**
 * The stock grain-shape name behind each `<GrainGeometry>` id, shown as the picker's
 * description so the id reads as a shape rather than a burn profile (§7.7).
 */
export const GRAIN_GEOMETRY_DESCRIPTIONS: Record<string, string> = {
  Progressive: 'Tubular',
  Neutral: 'Star',
  Regressive: 'Wagon Wheel',
  BoostSustain: 'Double Anchor',
  BoostSustainBoost: 'Slotted Tube',
};
