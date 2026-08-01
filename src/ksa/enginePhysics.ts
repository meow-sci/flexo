/**
 * De Laval nozzle / combustor physics, ported verbatim from KSA's decompiled
 * engine math so flexo can show the SAME sea-level / vacuum thrust + Isp the
 * in-game "Engine Designer" (EngineDesigner.cs) previews. Pure numeric code — no
 * react, no three, no DOM — so it runs identically in the browser and in vitest.
 *
 * Source of every formula (decomp `KSA/`):
 *  - FixedReactionTable.cs     — pressure→{γ,R,T} lookup (binary search + lerp in ln P)
 *  - MixtureReactionTable.cs   — O/F-ratio × pressure 2-D LUT; SliceAt bakes a 1-D slice
 *  - GasProperties.cs          — c*, critical pressure ratio, isochoric/isothermal/isentropic
 *  - CombustorConfig.cs        — chamber pressure = throttle·MaxPressure, isochoric exit
 *  - DeLavalNozzleConfig.cs    — mass flow, exit Mach, flow separation, exhaust velocity
 *  - NozzlePerformance.cs      — momentum + pressure thrust, effective exhaust velocity
 *  - RocketDesign.cs           — Newton solvers, atmospheric/vacuum design, ConstrainCoefficient
 *  - RocketCoreConditions.cs / GasConditions.cs / NozzleConditions.cs / RocketPerformance.cs
 *
 * KSA computes most of this in 32-bit `float`; flexo computes in JS `double`. The
 * algorithms are reproduced exactly (same iteration counts, tolerances, clamps), so
 * results match the game to well within readout precision (sub-0.1%).
 */

/** Standard gravity used to convert effective exhaust velocity → Isp (s). */
export const G0 = 9.80665;
/** Universal gas constant Ru (J/mol·K); specific R = Ru / molarMass(kg/mol). */
export const UNIVERSAL_GAS_CONSTANT = 8.31446261815324;
/** Sea-level ambient pressure (Pa) — the SL evaluation point, matching EngineDesigner. */
export const SEA_LEVEL_PRESSURE = 101325;

/** Bulk gas properties at a chamber pressure: ratio of specific heats + specific gas constant. */
export interface GasProps {
  gamma: number;
  /** Specific gas constant R = Ru / molarMass(kg/mol), in J/(kg·K). */
  specificGasConstant: number;
}

/** A thermodynamic state: static pressure (Pa) + temperature (K). */
export interface GasConditions {
  pressure: number;
  temperature: number;
}

/**
 * One row of a combustion process's pressure-indexed gas lookup table. `pressure`
 * is exp(lnPressure) (Pa); `gamma`/`specificGasConstant` are the gas properties and
 * `temperature` the flame temperature at that chamber pressure. Rows are sorted by
 * ascending `lnPressure` (== ascending `pressure`).
 */
export interface CombustionLutRow {
  lnPressure: number;
  pressure: number;
  temperature: number;
  gamma: number;
  specificGasConstant: number;
}

/** A reaction's 1-D gas LUT (≥1 row, ascending lnPressure). See FixedReactionTable.cs. */
export interface CombustionLut {
  rows: CombustionLutRow[];
}

/**
 * A MixtureReaction's 2-D gas LUT (MixtureReactionTable.cs): one 1-D slice per
 * O/F mass-ratio row, all sharing the same lnPressure column axis (KSA rejects
 * non-rectangular tables at load). `ratios` is ascending and index-parallel with
 * `slices`.
 */
export interface MixtureLut {
  ratios: number[];
  slices: CombustionLut[];
}

/** Resolved combustor state at a given throttle: gas props + chamber + post-thermal-efficiency exit. */
export interface RocketCoreConditions {
  gas: GasProps;
  core: GasConditions;
  exit: GasConditions;
}

/** Nozzle inlet/stagnation conditions feeding the expansion. */
export interface NozzleConditions {
  gas: GasProps;
  inlet: GasConditions;
  stagnation: GasConditions;
}

/** Per-evaluation nozzle performance at one ambient pressure (NozzlePerformance.cs). */
export interface NozzlePerformanceResult {
  massFlowRate: number;
  exhaust: GasConditions;
  exhaustArea: number;
  ambientPressure: number;
  actualExhaustVelocity: number;
  flowSeparationSeverity: number;
}

/** Thrust / effective exhaust velocity derived from a NozzlePerformanceResult (RocketPerformance.cs). */
export interface RocketPerformanceResult {
  massFlowRate: number;
  effectiveExhaustVelocity: number;
  /** Total thrust (N) = massFlowRate · effectiveExhaustVelocity. */
  totalThrust: number;
}

// ---------------------------------------------------------------------------
// FixedReactionTable.cs — pressure → gas LUT lookup (binary search + lerp in ln P)
// ---------------------------------------------------------------------------

/**
 * .NET `Array.BinarySearch` semantics: returns the index of an exact match, else
 * the bitwise complement (`~`) of the index of the first element greater than the
 * value (i.e. the insertion point). Mirrors the search FixedReactionTable uses.
 */
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

/** Linear interpolation a→b by t (== C# float.Lerp). */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Looks up gas properties + conditions at a chamber pressure, interpolating in
 * ln(pressure). Below the lowest / above the highest tabulated pressure it clamps to
 * the end row's gas properties but keeps the queried pressure (FixedReactionTable.Lookup —
 * behavior-identical to the pre-4892 CombustionTable.Lookup this was ported from).
 */
export function lutLookup(
  lut: CombustionLut,
  pressure: number,
): {
  props: GasProps;
  conditions: GasConditions;
} {
  const rows = lut.rows;
  const n = rows.length;
  const lnP = pressure <= 0 ? rows[0].lnPressure : Math.log(pressure);
  // Build/scan the lnPressure column. (n is tiny — ≤ ~24 rows — so this is cheap.)
  const idx = binarySearchAscending(
    rows.map((r) => r.lnPressure),
    lnP,
  );
  if (idx <= -n) {
    const last = rows[Math.max(n, 1) - 1];
    return {
      props: { gamma: last.gamma, specificGasConstant: last.specificGasConstant },
      conditions: { pressure, temperature: last.temperature },
    };
  }
  if (idx >= 0) {
    const r = rows[idx];
    return {
      props: { gamma: r.gamma, specificGasConstant: r.specificGasConstant },
      conditions: { pressure: r.pressure, temperature: r.temperature },
    };
  }
  const upper = ~idx;
  if (upper === 0) {
    const r = rows[0];
    return {
      props: { gamma: r.gamma, specificGasConstant: r.specificGasConstant },
      conditions: { pressure, temperature: r.temperature },
    };
  }
  const lowerIdx = upper - 1;
  const a = rows[lowerIdx];
  const b = rows[upper];
  let t = (lnP - a.lnPressure) / (b.lnPressure - a.lnPressure);
  t = Math.min(1, Math.max(0, t));
  return {
    props: {
      gamma: lerp(a.gamma, b.gamma, t),
      specificGasConstant: lerp(a.specificGasConstant, b.specificGasConstant, t),
    },
    conditions: { pressure, temperature: lerp(a.temperature, b.temperature, t) },
  };
}

/**
 * `FixedReactionTable.FindSegment`: locates the interpolation segment of `value`
 * on an ascending axis — (i, i, 0) on an exact hit, end-clamped otherwise, with
 * the interpolant clamped to [0, 1].
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

/**
 * Bakes a MixtureReaction's 2-D LUT down to the 1-D gas LUT at one O/F mass
 * ratio, reproducing `MixtureReaction.AtMixtureRatio` → `MixtureReactionTable.SliceAt`:
 * the ratio is clamped into the row range, then temperature / γ / R are lerped
 * between the two neighbouring ratio rows per pressure column. The result feeds
 * {@link lutLookup} / {@link predictPerformance} exactly like a FixedReaction's LUT
 * (which is precisely what KSA's combustor does at load).
 */
export function sliceLutAtMixtureRatio(mix: MixtureLut, mixtureRatio: number): CombustionLut {
  const ratios = mix.ratios;
  const ratio = Math.min(Math.max(mixtureRatio, ratios[0]), ratios[ratios.length - 1]);
  const { lower, upper, interp } = findSegment(ratios, ratio);
  const a = mix.slices[lower].rows;
  const b = mix.slices[upper].rows;
  const rows: CombustionLutRow[] = a.map((rowA, i) => {
    const rowB = b[i];
    return {
      lnPressure: rowA.lnPressure,
      pressure: rowA.pressure,
      temperature: lerp(rowA.temperature, rowB.temperature, interp),
      gamma: lerp(rowA.gamma, rowB.gamma, interp),
      specificGasConstant: lerp(rowA.specificGasConstant, rowB.specificGasConstant, interp),
    };
  });
  return { rows };
}

// ---------------------------------------------------------------------------
// GasProperties.cs — thermodynamic helpers
// ---------------------------------------------------------------------------

/** (2/(γ+1))^(γ/(γ−1)) — exit/chamber pressure ratio at the choked throat. */
export function criticalPressureRatio(gamma: number): number {
  return Math.pow(2 / (gamma + 1), gamma / (gamma - 1));
}

/** Characteristic velocity c* = √(γRT) / (γ·√((2/(γ+1))^((γ+1)/(γ−1)))). */
export function characteristicVelocity(gamma: number, R: number, temperature: number): number {
  const num2 = gamma + 1;
  const num = gamma - 1;
  return Math.sqrt(gamma * R * temperature) / (gamma * Math.sqrt(Math.pow(2 / num2, num2 / num)));
}

/** Isochoric (constant-volume) scale of P and T by a coefficient (combustor exit). */
function isochoricProcess(c: GasConditions, coef: number): GasConditions {
  return { pressure: c.pressure * coef, temperature: c.temperature * coef };
}

/** Isothermal pressure scale (constant T) — nozzle inlet flow-efficiency drop. */
function isothermalByPressure(c: GasConditions, pressureCoef: number): GasConditions {
  return { pressure: c.pressure * pressureCoef, temperature: c.temperature };
}

/** Isentropic pressure scale: P×coef, T×coef^((γ−1)/γ) — nozzle stagnation expansion-efficiency drop. */
function isentropicByPressure(
  gamma: number,
  c: GasConditions,
  pressureCoef: number,
): GasConditions {
  const tCoef = Math.pow(pressureCoef, (gamma - 1) / gamma);
  return { pressure: c.pressure * pressureCoef, temperature: c.temperature * tCoef };
}

// ---------------------------------------------------------------------------
// RocketDesign.cs — area-ratio ⇄ Mach ⇄ pressure solvers
// ---------------------------------------------------------------------------

/** Area ratio (exit/throat) as a function of exit Mach number and γ. */
export function areaRatioFromMach(machNumber: number, k: number): number {
  const num = machNumber * machNumber;
  const num2 = k - 1;
  const num3 = k + 1;
  const y = num3 / (2 * num2);
  const x = (0.5 * num * num2 + 1) / num3;
  return (Math.pow(x, y) * Math.pow(2, y)) / machNumber;
}

/** ∂(areaRatio)/∂(Mach) — the Newton-iteration derivative used by the Mach solver. */
function areaRatioPartialMach(machNumber: number, k: number): number {
  const num = machNumber * machNumber;
  const num2 = k - 1;
  const num3 = k + 1;
  const num4 = 0.5 * num * num2 + 1;
  const num5 = (0.5 * num3) / num2;
  const num6 = Math.pow(num4 / num3, num5);
  return (num3 * num6 * Math.pow(2, num5 - 1)) / num4 - (num6 * Math.pow(2, num5)) / num;
}

/** Solves the supersonic exit Mach number for a given area ratio (Newton, 20 iters, tol 1e-4). */
export function solveMachFromAreaRatio(gamma: number, areaRatio: number): number {
  let m = 2;
  for (let i = 20; i > 0; i--) {
    const ar = areaRatioFromMach(m, gamma);
    const diff = ar - areaRatio;
    if (Math.abs(diff) <= 0.0001) return m;
    const deriv = areaRatioPartialMach(m, gamma);
    const step = -diff / deriv;
    m += Math.min(1, Math.max(-1, step));
    m = Math.max(1, m);
  }
  return m;
}

/** Area ratio from an exhaust/stagnation pressure pair and γ (closed form). */
export function areaRatioFromPressure(
  exhaustPressure: number,
  stagnationPressure: number,
  k: number,
): number {
  const num = k - 1;
  const num2 = k + 1;
  const num3 = 1 / num;
  const num4 = 0.5 * num3 * num2;
  const num5 = Math.pow(stagnationPressure / exhaustPressure, num / k);
  const num6 = Math.pow(2, num4 - 0.5);
  const num7 = Math.pow(num5 / num2, num4);
  const num8 = Math.sqrt(num3 * (num5 - 1));
  return (num6 * num7) / num8;
}

/** P_exit/P_stagnation = 1/(1+½(γ−1)M²)^(γ/(γ−1)). */
export function inverseNozzlePressureRatioFromMach(machNumber: number, gamma: number): number {
  const num = gamma - 1;
  const num2 = machNumber * machNumber;
  return 1 / Math.pow(1 + 0.5 * num * num2, gamma / num);
}

/** Exhaust velocity Vₑ = √(2γ/(γ−1)·R·T_stag·(1−(P_exit/P_stag)^((γ−1)/γ))). */
export function exhaustVelocity(
  gamma: number,
  R: number,
  stagnation: GasConditions,
  exhaustPressure: number,
): number {
  const num = gamma - 1;
  const num2 = Math.pow(exhaustPressure / stagnation.pressure, num / gamma);
  const x = ((2 * gamma) / num) * R * stagnation.temperature * (1 - num2);
  // Guard the sqrt: physically x ≥ 0 for any real expansion (P_exit < P_stag); a
  // tiny negative from rounding (or a degenerate input) would otherwise yield NaN.
  return Math.sqrt(Math.max(x, 0));
}

/**
 * Raises an efficiency coefficient so the resulting pressure stays ≥ a floor, then
 * clamps to ≤ 1 (RocketDesign.ConstrainCoefficient). Only used by the design helpers,
 * not the runtime evaluation path.
 */
export function constrainCoefficient(coefficient: number, value: number, valueMin: number): number {
  const num = valueMin / value;
  if (Number.isFinite(num)) return Math.min(1, Math.max(coefficient, num));
  return coefficient;
}

// ---------------------------------------------------------------------------
// CombustorConfig.cs / DeLavalNozzleConfig.cs — the runtime evaluation path
// ---------------------------------------------------------------------------

/** Chamber + isochoric-exit conditions at a throttle (CombustorConfig.ComputeConditions). */
export function combustorConditions(
  lut: CombustionLut,
  combustionPressureMax: number,
  throttle: number,
  thermalEfficiency: number,
): RocketCoreConditions | null {
  const t = Math.min(1, Math.max(0, throttle));
  const pc = t * combustionPressureMax;
  if (pc <= 0) return null;
  const { props, conditions } = lutLookup(lut, pc);
  return { gas: props, core: conditions, exit: isochoricProcess(conditions, thermalEfficiency) };
}

/** Nozzle inlet (isothermal) + stagnation (isentropic) from the combustor exit. */
export function nozzleConditions(
  gas: GasProps,
  upstream: GasConditions,
  flowEfficiency: number,
  expansionEfficiency: number,
): NozzleConditions {
  const inlet = isothermalByPressure(upstream, flowEfficiency);
  const stagnation = isentropicByPressure(gas.gamma, inlet, expansionEfficiency);
  return { gas, inlet, stagnation };
}

const ZERO_PERFORMANCE: NozzlePerformanceResult = {
  massFlowRate: 0,
  exhaust: { pressure: 0, temperature: 0 },
  exhaustArea: 0,
  ambientPressure: 0,
  actualExhaustVelocity: 0,
  flowSeparationSeverity: 0,
};

/** Choked mass flow ṁ = P_inlet·A_throat / c*. */
function massFlowRate(throatArea: number, gas: GasProps, inlet: GasConditions): number {
  const cStar = characteristicVelocity(gas.gamma, gas.specificGasConstant, inlet.temperature);
  if (cStar <= 0) return 0;
  return (inlet.pressure * throatArea) / cStar;
}

/**
 * Full nozzle performance at one ambient pressure, including the over-expansion
 * flow-separation clamp (DeLavalNozzleConfig.ComputePerformance).
 */
export function nozzlePerformance(
  throatArea: number,
  exitArea: number,
  conditions: NozzleConditions,
  ambientPressure: number,
): NozzlePerformanceResult {
  const { gas, stagnation } = conditions;
  const mDot = massFlowRate(throatArea, gas, conditions.inlet);
  if (mDot <= 0) return ZERO_PERFORMANCE;

  const ar = exitArea / throatArea;
  const mach = solveMachFromAreaRatio(gas.gamma, ar);
  let pCoef = inverseNozzlePressureRatioFromMach(mach, gas.gamma);
  let exhaustArea = exitArea;
  let exhaust = isentropicByPressure(gas.gamma, stagnation, pCoef);
  let flowSeparationSeverity = 0;

  const sepThreshold =
    ambientPressure * (2 / 3) * Math.pow(stagnation.pressure / ambientPressure, -0.2);
  if (exhaust.pressure < sepThreshold) {
    const critical = criticalPressureRatio(gas.gamma) * stagnation.pressure;
    const sepPressure = Math.min(sepThreshold, critical);
    pCoef = sepPressure / stagnation.pressure;
    exhaust = isentropicByPressure(gas.gamma, stagnation, pCoef);
    const sepAr = areaRatioFromPressure(exhaust.pressure, stagnation.pressure, gas.gamma);
    flowSeparationSeverity = Math.min(1, Math.max(0, 1 - sepAr / ar));
    exhaustArea = sepAr * throatArea;
  }

  return {
    massFlowRate: mDot,
    exhaust,
    exhaustArea,
    ambientPressure,
    actualExhaustVelocity: exhaustVelocity(
      gas.gamma,
      gas.specificGasConstant,
      stagnation,
      exhaust.pressure,
    ),
    flowSeparationSeverity,
  };
}

/** Thrust + effective exhaust velocity from a nozzle performance (NozzlePerformance.GetRocketPerformance). */
export function rocketPerformance(perf: NozzlePerformanceResult): RocketPerformanceResult {
  if (perf.massFlowRate <= 0) {
    return { massFlowRate: 0, effectiveExhaustVelocity: 0, totalThrust: 0 };
  }
  const momentum = perf.massFlowRate * perf.actualExhaustVelocity;
  let pressure = (perf.exhaust.pressure - perf.ambientPressure) * perf.exhaustArea;
  pressure = Math.max(pressure, -momentum);
  const eev = Math.max(perf.actualExhaustVelocity + pressure / perf.massFlowRate, 0);
  return {
    massFlowRate: perf.massFlowRate,
    effectiveExhaustVelocity: eev,
    totalThrust: perf.massFlowRate * eev,
  };
}

// ---------------------------------------------------------------------------
// Headline API — predict an engine's SL/vacuum thrust + Isp (what the UI shows)
// ---------------------------------------------------------------------------

/** The combustor + nozzle knobs needed to predict performance (SI units). */
export interface EnginePredictionInput {
  lut: CombustionLut;
  /** Combustor MaxPressure at full throttle (Pa). */
  maxPressurePa: number;
  /** Nozzle exit diameter (m). */
  exitDiameterM: number;
  /** Exit/throat area ratio (must be finite & > 0). */
  areaRatio: number;
  thermalEfficiency: number;
  flowEfficiency: number;
  expansionEfficiency: number;
}

/** The performance readout the Engine Designer shows live. */
export interface EnginePerformance {
  thrustSLN: number;
  thrustVacN: number;
  ispSL: number;
  ispVac: number;
  /** Choked mass flow at full throttle (kg/s). */
  massFlowRate: number;
  throatDiameterM: number;
  /** Over-expansion flow separation at sea level, 0..1 (0 = none). */
  flowSeparationSeveritySL: number;
  /** Ambient pressure at which the vacuum-evaluated exhaust is optimally expanded (Pa). */
  optimumExpansionPa: number;
  chamberPressurePa: number;
  chamberTemperatureK: number;
  exitPressurePa: number;
  exitTemperatureK: number;
  gamma: number;
  molarMassGPerMol: number;
  characteristicVelocity: number;
  exhaustVelocityVac: number;
  areaRatio: number;
}

/** Zeroed performance (degenerate input: zero pressure / area / no mass flow). */
const ZERO_ENGINE_PERFORMANCE: EnginePerformance = {
  thrustSLN: 0,
  thrustVacN: 0,
  ispSL: 0,
  ispVac: 0,
  massFlowRate: 0,
  throatDiameterM: 0,
  flowSeparationSeveritySL: 0,
  optimumExpansionPa: 0,
  chamberPressurePa: 0,
  chamberTemperatureK: 0,
  exitPressurePa: 0,
  exitTemperatureK: 0,
  gamma: 0,
  molarMassGPerMol: 0,
  characteristicVelocity: 0,
  exhaustVelocityVac: 0,
  areaRatio: 0,
};

/**
 * Predicts sea-level + vacuum thrust and Isp for an engine, reproducing the exact
 * evaluation EngineDesigner.cs performs: build the combustor/nozzle conditions at
 * full throttle, then evaluate the nozzle at sea level (101325 Pa) and vacuum (0 Pa).
 * Returns zeroed performance when the inputs can't sustain a choked flow.
 */
export function predictPerformance(input: EnginePredictionInput): EnginePerformance {
  const { lut, maxPressurePa, exitDiameterM, areaRatio } = input;
  if (
    !(maxPressurePa > 0) ||
    !(exitDiameterM > 0) ||
    !(areaRatio > 0) ||
    !Number.isFinite(areaRatio) ||
    lut.rows.length === 0
  ) {
    return ZERO_ENGINE_PERFORMANCE;
  }

  const r = 0.5 * exitDiameterM;
  const exitArea = Math.PI * r * r;
  const throatArea = exitArea / areaRatio;

  const core = combustorConditions(lut, maxPressurePa, 1, input.thermalEfficiency);
  if (!core) return ZERO_ENGINE_PERFORMANCE;
  const nozzle = nozzleConditions(
    core.gas,
    core.exit,
    input.flowEfficiency,
    input.expansionEfficiency,
  );

  const perfSL = nozzlePerformance(throatArea, exitArea, nozzle, SEA_LEVEL_PRESSURE);
  const perfVac = nozzlePerformance(throatArea, exitArea, nozzle, 0);
  const rocketSL = rocketPerformance(perfSL);
  const rocketVac = rocketPerformance(perfVac);

  return {
    thrustSLN: rocketSL.totalThrust,
    thrustVacN: rocketVac.totalThrust,
    ispSL: rocketSL.effectiveExhaustVelocity / G0,
    ispVac: rocketVac.effectiveExhaustVelocity / G0,
    massFlowRate: perfVac.massFlowRate,
    throatDiameterM: 2 * Math.sqrt(throatArea / Math.PI),
    flowSeparationSeveritySL: perfSL.flowSeparationSeverity,
    optimumExpansionPa: perfVac.exhaust.pressure,
    chamberPressurePa: core.core.pressure,
    chamberTemperatureK: core.core.temperature,
    exitPressurePa: core.exit.pressure,
    exitTemperatureK: core.exit.temperature,
    gamma: core.gas.gamma,
    molarMassGPerMol: (UNIVERSAL_GAS_CONSTANT / core.gas.specificGasConstant) * 1000,
    characteristicVelocity: characteristicVelocity(
      core.gas.gamma,
      core.gas.specificGasConstant,
      core.exit.temperature,
    ),
    exhaustVelocityVac: perfVac.actualExhaustVelocity,
    areaRatio,
  };
}

/**
 * Back-solves the nozzle area ratio that makes the exhaust optimally expanded at a
 * target ambient pressure, mirroring RocketDesign.ComputeAtmosphericEngineDesign.
 * Used by the designer's "Atmospheric" mode to turn a target altitude pressure into
 * a concrete AreaRatio. Returns null if inputs are degenerate.
 */
export function deriveAreaRatioForExhaustPressure(
  lut: CombustionLut,
  chamberPressurePa: number,
  exhaustPressurePa: number,
  thermalEfficiency: number,
  flowEfficiency: number,
  expansionEfficiency: number,
): number | null {
  if (!(chamberPressurePa > 0) || lut.rows.length === 0) return null;
  let exhaustP = Math.max(exhaustPressurePa, 1);
  let thermal = Math.min(thermalEfficiency, 1);
  let flow = Math.min(flowEfficiency, 1);
  let expansion = Math.min(expansionEfficiency, 1);

  const { props, conditions } = lutLookup(lut, chamberPressurePa);
  const critical = criticalPressureRatio(props.gamma);
  exhaustP = Math.min(exhaustP, chamberPressurePa * critical);
  const exitPressureMin = exhaustP / critical;

  thermal = constrainCoefficient(thermal, conditions.pressure, exitPressureMin);
  const exit = isochoricProcess(conditions, thermal);
  flow = constrainCoefficient(flow, exit.pressure, exitPressureMin);
  const inlet = isothermalByPressure(exit, flow);
  expansion = constrainCoefficient(expansion, inlet.pressure, exitPressureMin);
  const stagnation = isentropicByPressure(props.gamma, inlet, expansion);

  return areaRatioFromPressure(exhaustP, stagnation.pressure, props.gamma);
}
