/**
 * **Solid-motor thrust-curve port** — the grain-regression math behind Engine mode's
 * `SolidThrustCurveCard` (design: design-data-engine-modes.md D7).
 *
 * A verbatim port, on the same terms as {@link import('./enginePhysics')}: identical
 * formulae, constants, iteration counts and clamps, so the curve flexo draws is the curve
 * KSA's own vehicle editor draws. Ported from the decompiled C# at build **2026.8.3.5117**
 * (`ksa-game-assemblies/current/decomp/KSA/`):
 *
 * | Game-side member                                    | Here                              |
 * | --------------------------------------------------- | --------------------------------- |
 * | `GrainGeometryTable.Lookup` / `MaxDepth`            | {@link grainLookup} + catalog     |
 * | `SolidGrainSegment.ComputeBurningAreaAtDepth`       | {@link burningAreaAtDepth}        |
 * | `SolidGrainSegment.ComputeGrainMassAtDepth`         | {@link grainMassAtDepth}          |
 * | `BurnRateLaw.Evaluate`                              | {@link evaluateBurnRate}          |
 * | `SolidMotorNozzle.RefreshTwoPhaseEfficiency`        | {@link twoPhaseEfficiency}        |
 * | `SolidMotor.SolveConditionsForArea`                 | {@link solveConditionsForArea}    |
 * | `SolidMotor.ComputeTotalThroatArea` / `ResizeNozzles` | {@link resizeNozzles}           |
 * | `SolidMotor.TrySampleThrustCurve`                   | {@link sampleThrustCurve}         |
 *
 * The nozzle chain itself is NOT re-implemented: a `<SolidMotorNozzle>` is a
 * `DeLavalNozzleConfig` underneath, so this module composes `enginePhysics`' exported
 * building blocks (`combustorConditions`, `nozzleConditions`, `nozzlePerformance`,
 * `characteristicVelocity`) and adds only the two things that are
 * genuinely solid-specific: the two-phase (condensed exhaust) efficiency on exhaust velocity,
 * and the throat area KSA derives rather than authors.
 *
 * ## Two documented deviations from a naive reading of the design
 *
 * 1. **The throat is NOT fixed at `exitArea / 12`.** That value is only
 *    `SolidMotorNozzleTemplate.Create`'s seed. `PartTree` calls `SolidMotor.ResizeNozzles()`
 *    whenever a motor's grain stack resolves, and that re-derives the area ratio from the
 *    PEAK burning area, clamped between bounds set by the reaction's stable-pressure window
 *    (`SolidMotor.cs:397-455`). Sampling the curve at the seed ratio would systematically
 *    misreport thrust, so {@link resizeNozzles} is ported too and runs first.
 * 2. **The grain "stack" is the motor's own feed segments.** In game, a stack also grows
 *    across `SolidMotorCase` connectors into neighbouring PARTS
 *    (`PartTree.ResolveSolidMotorStack`) — which is a vehicle-assembly fact a single-part
 *    editor cannot know. flexo previews the part in isolation: the stack is exactly the grain
 *    segments the motor's `<FeedsFrom Container>` names.
 *
 * Pure: no stores, no React, no three.js. Everything the curve needs is injected.
 */

import {
  characteristicVelocity,
  combustorConditions,
  nozzleConditions,
  nozzlePerformance,
  G0,
  type CombustionLut,
  type NozzlePerformanceResult,
  type RocketCoreConditions,
} from './enginePhysics';
import {
  grainInitialArea,
  grainInitialPortArea,
  grainMaxDepth,
  type GrainGeometryTable,
} from './grainGeometryCatalog';

/** `SolidMotor.QUENCH_PRESSURE_FRACTION` — the burn survives down to half the ignition limit. */
export const QUENCH_PRESSURE_FRACTION = 0.5;

/** `SolidMotor.BOUND_PRESSURE_MARGIN` — the headroom the min-area-ratio bound is solved at. */
const BOUND_PRESSURE_MARGIN = 1.02;

/** `SolidMotorNozzle.MINIMUM_AREA_RATIO` / `DEFAULT_AREA_RATIO`. */
export const SOLID_NOZZLE_MIN_AREA_RATIO = 1.2;
export const SOLID_NOZZLE_DEFAULT_AREA_RATIO = 12;

/** `SolidMotorNozzle` two-phase loss coefficients. */
const TWO_PHASE_LOSS_BASE = 0.076;
const TWO_PHASE_LOSS_PER_LN_AREA_RATIO = 0.046;

/** How many depth steps `TrySampleThrustCurve` walks (`stackalloc float[256]`). */
const DEPTH_STEPS = 256;

/** How many samples `ComputePeakBurningArea` / `ComputeValleyBurningArea` take. */
const AREA_SAMPLES = 128;

// ---------------------------------------------------------------------------
// GrainGeometryTable.Lookup — FixedReactionTable.FindSegment + lerp
// ---------------------------------------------------------------------------

/** .NET `Array.BinarySearch` semantics (see enginePhysics' identical private copy). */
function binarySearchAscending(values: readonly number[], target: number): number {
  let lo = 0;
  let hi = values.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const v = values[mid];
    if (v === target) return mid;
    if (v < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return ~lo;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * `FixedReactionTable.FindSegment` — re-implemented here because enginePhysics' copy is
 * module-private and that file is untouchable (its `git diff` is a phase assertion).
 */
function findSegment(
  axis: readonly number[],
  value: number,
): { lower: number; upper: number; interp: number } {
  const idx = binarySearchAscending(axis, value);
  if (idx >= 0) return { lower: idx, upper: idx, interp: 0 };
  const upper = Math.min(Math.max(~idx, 0), axis.length - 1);
  const lower = Math.max(upper - 1, 0);
  if (lower === upper) return { lower, upper, interp: 0 };
  const interp = Math.min(1, Math.max(0, (value - axis[lower]) / (axis[upper] - axis[lower])));
  return { lower, upper, interp };
}

/** `GrainGeometryTable.Lookup(depth)` — interpolated perimeter + port area at a NORMALIZED depth. */
export function grainLookup(
  table: GrainGeometryTable,
  depth: number,
): { perimeter: number; portArea: number } {
  const { lower, upper, interp } = findSegment(table.depth, depth);
  return {
    perimeter: lerp(table.perimeter[lower], table.perimeter[upper], interp),
    portArea: lerp(table.portArea[lower], table.portArea[upper], interp),
  };
}

// ---------------------------------------------------------------------------
// SolidGrainSegment — one segment's geometry, in meters
// ---------------------------------------------------------------------------

/** The authored dimensions of one `<SolidGrainSegment>`, plus its resolved grain profile. */
export interface SolidSegmentInput {
  outerRadiusM: number;
  wallThicknessMm: number;
  lengthM: number;
  geometry: GrainGeometryTable;
}

/** A segment with its derived quantities cached — the shape the sampler walks. */
interface ResolvedSegment {
  geometry: GrainGeometryTable;
  /** `CasingInnerRadius = max(outerRadius − wallThickness, 0)` (SolidGrainSegment.cs:150). */
  innerRadiusM: number;
  lengthM: number;
  /** `GrainVolume = InitialGrainArea · r² · L`. */
  grainVolumeM3: number;
  /** `InitialGrainMass = Propellant.ComputeMass(GrainVolume)` = volume × storage density. */
  initialGrainMassKg: number;
}

function resolveSegment(input: SolidSegmentInput, densityKgPerM3: number): ResolvedSegment {
  const innerRadiusM = Math.max(input.outerRadiusM - input.wallThicknessMm * 0.001, 0);
  const grainVolumeM3 =
    grainInitialArea(input.geometry) * innerRadiusM * innerRadiusM * input.lengthM;
  return {
    geometry: input.geometry,
    innerRadiusM,
    lengthM: input.lengthM,
    grainVolumeM3,
    initialGrainMassKg: grainVolumeM3 * densityKgPerM3,
  };
}

/**
 * `SolidGrainSegment.ComputeBurningAreaAtDepth(depth)` — `depth` is in METERS and normalizes
 * by the casing inner radius; past `MaxDepth` the grain is spent and the area is zero.
 */
function burningAreaAtDepth(segment: ResolvedSegment, depthM: number): number {
  const normalized = depthM / segment.innerRadiusM;
  if (!(normalized < grainMaxDepth(segment.geometry))) return 0;
  const { perimeter } = grainLookup(segment.geometry, normalized);
  return perimeter * segment.innerRadiusM * segment.lengthM;
}

/**
 * `SolidGrainSegment.ComputeGrainMassAtDepth(depth)` — the propellant mass still unburnt once
 * the flame front has receded `depthM`; the port area's GROWTH is what has been consumed.
 */
function grainMassAtDepth(
  segment: ResolvedSegment,
  depthM: number,
  densityKgPerM3: number,
): number {
  const normalized = Math.min(
    Math.max(depthM / segment.innerRadiusM, 0),
    grainMaxDepth(segment.geometry),
  );
  const { portArea } = grainLookup(segment.geometry, normalized);
  const burntVolume =
    (portArea - grainInitialPortArea(segment.geometry)) *
    segment.innerRadiusM *
    segment.innerRadiusM *
    segment.lengthM;
  return Math.max(segment.initialGrainMassKg - densityKgPerM3 * burntVolume, 0);
}

// ---------------------------------------------------------------------------
// BurnRateLaw / SolidMotorNozzle
// ---------------------------------------------------------------------------

/** `BurnRateLaw.Evaluate(p)` = `a · (p · 1e−6)^n` — Vieille's law, pressure in Pa. */
export function evaluateBurnRate(
  law: { coefficientMPerS: number; exponent: number },
  pressurePa: number,
): number {
  return law.coefficientMPerS * Math.pow(pressurePa * 1e-6, law.exponent);
}

/**
 * `SolidMotorNozzle.RefreshTwoPhaseEfficiency()` — condensed exhaust products do not expand,
 * so they cost exhaust VELOCITY, and the loss grows with the area ratio. Clamped to [0.5, 1].
 */
export function twoPhaseEfficiency(condensedFraction: number, areaRatio: number): number {
  const loss =
    condensedFraction *
    (TWO_PHASE_LOSS_BASE + TWO_PHASE_LOSS_PER_LN_AREA_RATIO * Math.log(areaRatio));
  return Math.min(1, Math.max(0.5, 1 - loss));
}

/** The authored fields of one `<SolidMotorNozzle>` the curve reads. */
export interface SolidNozzleInput {
  exitDiameterM: number;
  flowEfficiency: number;
  expansionEfficiency: number;
  /**
   * The binding `<Nozzle AreaRatioMultiplier>` (KSA 5348), default 1 — see
   * {@link RocketNozzleRef.areaRatioMultiplier}. It scales ONLY the nozzle's share of the
   * stack's throat, never its exit area.
   */
  areaRatioMultiplier: number;
}

interface ResolvedNozzle {
  exitAreaM2: number;
  /**
   * `SolidMotorNozzle.ThroatSizingArea` = `ExitArea / AreaRatioMultiplier` — the area the
   * stack-wide throat solve apportions by. Identical to {@link exitAreaM2} at the default
   * multiplier of 1, which is what every nozzle authored before KSA 5348 uses.
   */
  throatSizingAreaM2: number;
  flowEfficiency: number;
  expansionEfficiency: number;
  /** Set by {@link resizeNozzles}; seeded at `exitArea / 12` like the template's `Create`. */
  throatAreaM2: number;
  /** Set by {@link resizeNozzles} alongside the throat. */
  twoPhaseEfficiency: number;
}

function resolveNozzle(input: SolidNozzleInput): ResolvedNozzle {
  const r = 0.5 * input.exitDiameterM;
  const exitAreaM2 = Math.PI * r * r;
  const multiplier = input.areaRatioMultiplier > 0 ? input.areaRatioMultiplier : 1;
  return {
    exitAreaM2,
    throatSizingAreaM2: exitAreaM2 / multiplier,
    flowEfficiency: input.flowEfficiency,
    expansionEfficiency: input.expansionEfficiency,
    // `SolidMotorNozzleTemplate.Create` seeds the throat off the RAW exit area (the
    // multiplier reaches the nozzle later, in `RocketTemplate.CreateComponents`).
    throatAreaM2: exitAreaM2 / SOLID_NOZZLE_DEFAULT_AREA_RATIO,
    twoPhaseEfficiency: 1,
  };
}

/**
 * `SolidMotorNozzle.ComputePerformance(in RocketCoreConditions, ambient)`: the De Laval chain
 * with the two-phase factor applied to the exhaust velocity AFTERWARDS (which is exactly
 * where KSA applies it — mass flow is untouched, so chamber-pressure convergence is unaffected).
 */
function solidNozzlePerformance(
  nozzle: ResolvedNozzle,
  combustion: RocketCoreConditions,
  ambientPressurePa: number,
): NozzlePerformanceResult {
  const conditions = nozzleConditions(
    combustion.gas,
    combustion.exit,
    nozzle.flowEfficiency,
    nozzle.expansionEfficiency,
  );
  const perf = nozzlePerformance(
    nozzle.throatAreaM2,
    nozzle.exitAreaM2,
    conditions,
    ambientPressurePa,
  );
  // Never mutate: `nozzlePerformance` returns a SHARED frozen-by-convention zero result on a
  // degenerate input, and writing through it would corrupt every later call.
  return { ...perf, actualExhaustVelocity: perf.actualExhaustVelocity * nozzle.twoPhaseEfficiency };
}

/**
 * `NozzlePerformance.GetTotalThrust()` = momentum thrust + pressure thrust, deliberately
 * WITHOUT the `max(pressure, −momentum)` clamp `GetRocketPerformance()` applies (decomp:
 * `KSA/NozzlePerformance.cs:43-46` vs `:48-68`). The thrust curve is sampled in vacuum, where
 * the pressure term is never negative and the two agree — but porting the member the game
 * actually calls means the two can never drift apart if that ever changes.
 */
function totalThrust(perf: NozzlePerformanceResult): number {
  const momentum = perf.massFlowRate * perf.actualExhaustVelocity;
  const pressure = (perf.exhaust.pressure - perf.ambientPressure) * perf.exhaustArea;
  return momentum + pressure;
}

// ---------------------------------------------------------------------------
// The motor
// ---------------------------------------------------------------------------

/** Everything `sampleThrustCurve` needs, already resolved against the document + catalogs. */
export interface SolidMotorInput {
  /** The solid reaction's 1-D gas LUT (`FixedReactionData.lut`). */
  lut: CombustionLut;
  /** `<ThermalEfficiency Value>` (0–1). */
  thermalEfficiency: number;
  /** `<DefaultPressure>` as authored, in Pa (clamped into the reaction's window internally). */
  authoredChamberPressurePa: number;
  /** The reaction's `<BurnRate CoefficientMPerS Exponent>`. */
  burnRate: { coefficientMPerS: number; exponent: number };
  /** The reaction's `<MinimumBurnPressure>` in Pa. */
  minimumBurnPressurePa: number;
  /** The reaction's `<MaxStablePressure>` in Pa. */
  maxStablePressurePa: number;
  /** The reaction's `<ExhaustCondensedFraction Value>` in [0, 1). */
  exhaustCondensedFraction: number;
  /** The solid propellant's `<StorageDensity KgPerM3>`. */
  storageDensityKgPerM3: number;
  /** The grain segments the motor feeds from, in document order. */
  segments: SolidSegmentInput[];
  /** The `<SolidMotorNozzle>`s the motor's `<Rocket>` binds. */
  nozzles: SolidNozzleInput[];
}

/** The sampled curve plus the four readouts `SolidMotor.ThrustCurvePreview` carries. */
export interface ThrustCurveSample {
  /** Seconds since ignition, ascending, `sampleCount` long. */
  times: Float32Array;
  /** Vacuum thrust (N) at each time. */
  thrustN: Float32Array;
  peakThrustN: number;
  burnSeconds: number;
  ignitionThrustN: number;
  vacuumIspS: number;
  /** Propellant the motor can never burn (pressure falls below the quench limit first), kg. */
  unburnableGrainKg: number;
  /** The area ratio `ResizeNozzles` settled on — what the nozzles actually run at. */
  areaRatio: number;
}

/** Why a curve could not be sampled — rendered as the card's "preview unavailable" reason. */
export type ThrustCurveFailure =
  | 'no-segments'
  | 'no-nozzles'
  | 'no-burnable-grain'
  | 'no-ignition'
  | 'degenerate';

interface MotorState {
  input: SolidMotorInput;
  segments: ResolvedSegment[];
  nozzles: ResolvedNozzle[];
  /** `SolidMotor.DefaultChamberPressure` — the authored pressure, clamped into the window. */
  defaultChamberPressurePa: number;
  /** `SolidMotor.PeakChamberPressure`, set by {@link resizeNozzles}. */
  peakChamberPressurePa: number;
  /** `min`/`max` of the reaction LUT's pressure axis — every solve is clamped into it. */
  lutMinPressurePa: number;
  lutMaxPressurePa: number;
}

/** `SolidMotor.MaxChamberPressure` — the peak once resized, else the authored default. */
function maxChamberPressure(motor: MotorState): number {
  return motor.peakChamberPressurePa > 0
    ? motor.peakChamberPressurePa
    : motor.defaultChamberPressurePa;
}

/** `SolidMotor.ComputeConditionsAtPressure` — LUT lookup + `CombustorConfig.ComputeConditions`. */
function conditionsAtPressure(motor: MotorState, pressurePa: number): RocketCoreConditions | null {
  return combustorConditions(motor.input.lut, pressurePa, 1, motor.input.thermalEfficiency);
}

/**
 * `SolidMotor.SolveConditionsForArea` — the 8-iteration fixed point that finds the chamber
 * pressure at which the grain's mass GENERATION (density × burning area × burn rate, itself
 * pressure-dependent) equals what the nozzles can pass. Warm-started from the previous step's
 * pressure, LUT-clamped at both ends, converged at `|Δp| ≤ 1e-4·p`.
 */
function solveConditionsForArea(
  motor: MotorState,
  burnAreaM2: number,
  warmStartPressurePa: number,
): RocketCoreConditions | null {
  if (burnAreaM2 <= 0) return null;
  const { lutMinPressurePa: min, lutMaxPressurePa: max } = motor;
  const exponent = motor.input.burnRate.exponent;
  let pressure = Math.min(
    Math.max(warmStartPressurePa > 0 ? warmStartPressurePa : motor.defaultChamberPressurePa, min),
    max,
  );
  const generation =
    motor.input.storageDensityKgPerM3 *
    burnAreaM2 *
    motor.input.burnRate.coefficientMPerS *
    Math.pow(1e-6, exponent);

  let combustion = conditionsAtPressure(motor, pressure);
  for (let i = 0; i < 8; i++) {
    if (!combustion) return null;
    let massFlow = 0;
    for (const nozzle of motor.nozzles) {
      massFlow += solidNozzlePerformance(nozzle, combustion, 0).massFlowRate;
    }
    if (massFlow <= 0) return null;
    const perPressure = massFlow / pressure;
    const next = Math.min(
      Math.max(Math.pow(generation / perPressure, 1 / (1 - exponent)), min),
      max,
    );
    const converged = Math.abs(next - pressure) <= 1e-4 * pressure;
    pressure = next;
    combustion = conditionsAtPressure(motor, pressure);
    if (converged) break;
  }
  return combustion;
}

/** `SolidMotor.ComputeTotalThroatArea(burningArea, pressure, totalSizingArea)`. */
function computeTotalThroatArea(
  motor: MotorState,
  burningAreaM2: number,
  pressurePa: number,
  totalSizingAreaM2: number,
): number {
  if (burningAreaM2 <= 0 || pressurePa <= 0) return 0;
  const conditions = conditionsAtPressure(motor, pressurePa);
  if (!conditions) return 0;
  const generation =
    motor.input.storageDensityKgPerM3 *
    burningAreaM2 *
    evaluateBurnRate(motor.input.burnRate, pressurePa);
  const cStar = characteristicVelocity(
    conditions.gas.gamma,
    conditions.gas.specificGasConstant,
    conditions.exit.temperature,
  );
  let total = 0;
  for (const nozzle of motor.nozzles) {
    const inletPressure = conditions.exit.pressure * nozzle.flowEfficiency;
    if (inletPressure <= 0) continue;
    total +=
      (nozzle.throatSizingAreaM2 / totalSizingAreaM2) * ((generation * cStar) / inletPressure);
  }
  return total;
}

/** Total burning area of the whole stack at one absolute depth (meters). */
function stackBurningArea(motor: MotorState, depthM: number): number {
  let total = 0;
  for (const segment of motor.segments) total += burningAreaAtDepth(segment, depthM);
  return total;
}

/** The deepest the flame front can go before every segment is spent, in METERS. */
function stackMaxDepthM(motor: MotorState): number {
  let max = 0;
  for (const segment of motor.segments) {
    max = Math.max(max, grainMaxDepth(segment.geometry) * segment.innerRadiusM);
  }
  return max;
}

/** `SolidMotor.ComputePeakBurningArea` — 128 samples across the whole regression. */
function peakBurningArea(motor: MotorState): number {
  const maxDepth = stackMaxDepthM(motor);
  if (maxDepth <= 0) return 0;
  let peak = 0;
  for (let j = 0; j < AREA_SAMPLES; j++) {
    peak = Math.max(peak, stackBurningArea(motor, (maxDepth * j) / (AREA_SAMPLES - 1)));
  }
  return peak;
}

/**
 * `SolidMotor.ComputeValleyBurningArea` — the LOWEST burning area before the final monotone
 * decay (the dip a boost–sustain grain makes). It sets the min area-ratio bound, so a
 * sustain phase cannot fall below the quench pressure.
 */
function valleyBurningArea(motor: MotorState): number {
  const maxDepth = stackMaxDepthM(motor);
  if (maxDepth <= 0) return 0;
  const areas: number[] = [];
  for (let j = 0; j < AREA_SAMPLES; j++) {
    areas.push(stackBurningArea(motor, (maxDepth * j) / (AREA_SAMPLES - 1)));
  }
  let last = AREA_SAMPLES - 1;
  while (last > 0 && areas[last - 1] >= areas[last]) last--;
  let valley = areas[0];
  for (let i = 1; i <= last; i++) valley = Math.min(valley, areas[i]);
  return valley;
}

/**
 * `SolidMotor.ResizeNozzles()` — derives the area ratio every solid nozzle actually runs at
 * (the template's `exitArea / 12` is only a seed) and the resulting peak chamber pressure.
 * Writes `throatAreaM2` + `twoPhaseEfficiency` onto the resolved nozzles, as the game writes
 * them onto its live modules. Returns the failure reason, or null on success.
 */
function resizeNozzles(motor: MotorState): ThrustCurveFailure | null {
  const peak = peakBurningArea(motor);
  if (peak <= 0) return 'no-burnable-grain';
  if (motor.nozzles.length === 0) return 'no-nozzles';

  // Since 5348 the stack apportions by `ThroatSizingArea`, not raw exit area — identical
  // wherever every `<Nozzle AreaRatioMultiplier>` is its default 1.
  let totalSizingArea = 0;
  for (const nozzle of motor.nozzles) totalSizingArea += nozzle.throatSizingAreaM2;
  if (totalSizingArea <= 0) return 'degenerate';

  const peakThroat = computeTotalThroatArea(
    motor,
    peak,
    motor.input.maxStablePressurePa,
    totalSizingArea,
  );
  if (peakThroat <= 0) return 'degenerate';

  const ignitionArea = stackBurningArea(motor, 0);
  const ignitionThroat = computeTotalThroatArea(
    motor,
    ignitionArea,
    motor.input.minimumBurnPressurePa * BOUND_PRESSURE_MARGIN,
    totalSizingArea,
  );
  const valleyThroat = computeTotalThroatArea(
    motor,
    valleyBurningArea(motor),
    motor.input.minimumBurnPressurePa * QUENCH_PRESSURE_FRACTION * BOUND_PRESSURE_MARGIN,
    totalSizingArea,
  );
  const smallestThroat = Math.min(
    ignitionThroat > 0 ? ignitionThroat : Number.MAX_VALUE,
    valleyThroat > 0 ? valleyThroat : Number.MAX_VALUE,
  );
  // Since 5261 the LOW bound wins when the two cross: `MinAreaRatioBound` is derived on its
  // own (floored at 1.2, and 1.2 flat when neither ignition nor valley throat is finite), then
  // `MaxAreaRatioBound` is raised to meet it. Before 5261 the order was inverted — Max was
  // computed first and Min clamped up to it, and a stack whose peak burning area needed a
  // ratio under 1.2 was rejected outright ("Stack too large for the nozzle"). That rejection
  // no longer exists: such a stack now simply runs at the 1.2 floor.
  const minAreaRatioBound =
    smallestThroat < Number.MAX_VALUE
      ? Math.max(totalSizingArea / smallestThroat, SOLID_NOZZLE_MIN_AREA_RATIO)
      : SOLID_NOZZLE_MIN_AREA_RATIO;
  const maxAreaRatioBound = Math.max(totalSizingArea / peakThroat, minAreaRatioBound);

  const designThroat = computeTotalThroatArea(
    motor,
    peak,
    motor.defaultChamberPressurePa,
    totalSizingArea,
  );
  if (designThroat <= 0) return 'degenerate';
  const areaRatio = Math.min(
    Math.max(totalSizingArea / designThroat, minAreaRatioBound),
    maxAreaRatioBound,
  );

  for (const nozzle of motor.nozzles) {
    nozzle.throatAreaM2 = nozzle.throatSizingAreaM2 / areaRatio;
    nozzle.twoPhaseEfficiency = twoPhaseEfficiency(
      motor.input.exhaustCondensedFraction,
      nozzle.exitAreaM2 / nozzle.throatAreaM2,
    );
  }
  motor.peakChamberPressurePa =
    motor.input.maxStablePressurePa *
    Math.pow(peakThroat / (totalSizingArea / areaRatio), 1 / (1 - motor.input.burnRate.exponent));
  return null;
}

/** Builds the resolved motor state, or null when the authored input is degenerate. */
function buildMotor(input: SolidMotorInput): MotorState | null {
  if (input.lut.rows.length === 0) return null;
  if (!(input.storageDensityKgPerM3 > 0)) return null;
  if (!(input.burnRate.coefficientMPerS > 0)) return null;
  if (!(input.minimumBurnPressurePa > 0) || !(input.maxStablePressurePa > 0)) return null;
  if (!(input.burnRate.exponent >= 0) || input.burnRate.exponent >= 1) return null;

  const segments = input.segments
    .map((s) => resolveSegment(s, input.storageDensityKgPerM3))
    .filter((s) => s.innerRadiusM > 0 && s.lengthM > 0);
  const rows = input.lut.rows;
  return {
    input,
    segments,
    nozzles: input.nozzles.map(resolveNozzle),
    // `SolidMotor.DefaultChamberPressure` — the authored value clamped into the window.
    defaultChamberPressurePa: Math.min(
      Math.max(
        input.authoredChamberPressurePa,
        input.minimumBurnPressurePa * BOUND_PRESSURE_MARGIN,
      ),
      input.maxStablePressurePa,
    ),
    peakChamberPressurePa: 0,
    lutMinPressurePa: Math.exp(rows[0].lnPressure),
    lutMaxPressurePa: Math.exp(rows[rows.length - 1].lnPressure),
  };
}

/**
 * `SolidMotor.TrySampleThrustCurve` — the whole preview.
 *
 * Walks 256 equal depth steps to the stack's max regression depth, solving the chamber
 * pressure at each (warm-started from the last), stopping when pressure falls below the
 * ignition limit (or, after ignition, half of it — the quench fraction). Time accumulates as
 * `Σ Δdepth / burnRate(p)`, and the irregular time base is finally resampled onto
 * `sampleCount` evenly-spaced points by linear interpolation, exactly as the game does for
 * its editor graph.
 *
 * Returns `null` in every case KSA returns `false`, plus the degradation cases a data-only
 * editor has and the game does not: no grain catalog, no burn-rate law, and — the one worth
 * naming in the UI — **no storage density**, which is what a CUSTOM propellant has (there is
 * no `<StorageDensity>` to author). Densities are never invented.
 */
export function sampleThrustCurve(
  input: SolidMotorInput,
  sampleCount = 128,
): ThrustCurveSample | null {
  if (sampleCount < 2) return null;
  const motor = buildMotor(input);
  if (!motor || motor.segments.length === 0 || motor.nozzles.length === 0) return null;
  if (resizeNozzles(motor) !== null) return null;

  const maxDepthM = stackMaxDepthM(motor);
  if (maxDepthM <= 0) return null;

  const step = maxDepthM / (DEPTH_STEPS - 1);
  const times: number[] = [];
  const thrusts: number[] = [];
  let elapsed = 0;
  let peakThrustN = 0;
  let massFlowAtPeak = 0;
  let warmStart = maxChamberPressure(motor);

  for (let j = 0; j < DEPTH_STEPS; j++) {
    const area = stackBurningArea(motor, step * j);
    if (area <= 0 && j > 0) break;
    const combustion = solveConditionsForArea(motor, area, warmStart);
    const pressure = combustion?.core.pressure ?? 0;
    const quench =
      j === 0
        ? motor.input.minimumBurnPressurePa
        : motor.input.minimumBurnPressurePa * QUENCH_PRESSURE_FRACTION;
    if (!combustion || pressure < quench) {
      if (j === 0) return null; // never lit
      break;
    }
    warmStart = pressure;

    let thrust = 0;
    let massFlow = 0;
    for (const nozzle of motor.nozzles) {
      const perf = solidNozzlePerformance(nozzle, combustion, 0);
      thrust += totalThrust(perf);
      massFlow += perf.massFlowRate;
    }
    if (thrust > peakThrustN) {
      peakThrustN = thrust;
      massFlowAtPeak = massFlow;
    }
    if (j > 0) elapsed += step / Math.max(evaluateBurnRate(motor.input.burnRate, pressure), 1e-6);
    times.push(elapsed);
    thrusts.push(thrust);
  }

  const count = times.length;
  if (count < 2 || elapsed <= 0 || peakThrustN <= 0 || massFlowAtPeak <= 0) return null;

  const finalDepthM = step * count;
  let unburnableGrainKg = 0;
  for (const segment of motor.segments) {
    unburnableGrainKg += grainMassAtDepth(segment, finalDepthM, motor.input.storageDensityKgPerM3);
  }

  const outTimes = new Float32Array(sampleCount);
  const outThrust = new Float32Array(sampleCount);
  let n = 0;
  for (let i = 0; i < sampleCount; i++) {
    const t = (elapsed * i) / (sampleCount - 1);
    while (n < count - 2 && times[n + 1] < t) n++;
    const span = times[n + 1] - times[n];
    const amount = span > 0 ? Math.min(Math.max((t - times[n]) / span, 0), 1) : 0;
    outTimes[i] = t;
    outThrust[i] = lerp(thrusts[n], thrusts[n + 1], amount);
  }

  return {
    times: outTimes,
    thrustN: outThrust,
    peakThrustN,
    burnSeconds: elapsed,
    ignitionThrustN: thrusts[0],
    vacuumIspS: peakThrustN / (massFlowAtPeak * G0),
    unburnableGrainKg,
    areaRatio: motor.nozzles[0].exitAreaM2 / motor.nozzles[0].throatAreaM2,
  };
}
