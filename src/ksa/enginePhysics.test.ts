import { readFileSync } from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import {
  areaRatioFromMach,
  areaRatioFromPressure,
  characteristicVelocity,
  criticalPressureRatio,
  deriveAreaRatioForExhaustPressure,
  exhaustVelocity,
  G0,
  inverseNozzlePressureRatioFromMach,
  lutLookup,
  predictPerformance,
  solveMachFromAreaRatio,
  UNIVERSAL_GAS_CONSTANT,
  type CombustionLut,
} from './enginePhysics'
import { parseCombustionFile, type CombustionProcessData } from './combustionCatalog'
import { hasKsaAssets, ksaAsset } from './ksaTestAssets'

/** A flat single-row LUT (constant γ/R/T at any pressure) for closed-form checks. */
function flatLut(gamma: number, R: number, T: number, pressure = 5_000_000): CombustionLut {
  return {
    rows: [
      { lnPressure: Math.log(pressure), pressure, temperature: T, gamma, specificGasConstant: R },
    ],
  }
}

describe('enginePhysics: closed-form identities', () => {
  it('area ratio at the throat (Mach 1) is exactly 1 for any γ', () => {
    for (const g of [1.1, 1.2, 1.4, 1.667]) {
      expect(areaRatioFromMach(1, g)).toBeCloseTo(1, 10)
    }
  })

  it('critical pressure ratio matches the closed form (2/(γ+1))^(γ/(γ−1))', () => {
    const g = 1.2
    expect(criticalPressureRatio(g)).toBeCloseTo(Math.pow(2 / 2.2, 1.2 / 0.2), 12)
  })

  it('the Mach⇄area-ratio solver round-trips', () => {
    const g = 1.22
    for (const ar of [2, 10, 25, 49, 120]) {
      const m = solveMachFromAreaRatio(g, ar)
      expect(m).toBeGreaterThan(1)
      expect(areaRatioFromMach(m, g)).toBeCloseTo(ar, 3)
    }
  })

  it('area-ratio-from-pressure agrees with area-ratio-from-Mach at the same exit Mach', () => {
    // Two independent closed forms must produce the same expansion ratio.
    const g = 1.2
    for (const m of [1.5, 2.5, 4, 6]) {
      const pCoef = inverseNozzlePressureRatioFromMach(m, g) // = P_exit / P_stagnation
      const arFromP = areaRatioFromPressure(pCoef, 1, g) // stagnation pressure 1 ⇒ P_exit = pCoef
      expect(arFromP).toBeCloseTo(areaRatioFromMach(m, g), 4)
    }
  })

  it('exhaust velocity hits 0 at no expansion and the thermodynamic max at full expansion', () => {
    const g = 1.2
    const R = 400
    const stag = { pressure: 5_000_000, temperature: 3000 }
    // No expansion (P_exit = P_stagnation) ⇒ no kinetic energy extracted.
    expect(exhaustVelocity(g, R, stag, stag.pressure)).toBeCloseTo(0, 6)
    // Full expansion to a perfect vacuum (P_exit = 0) ⇒ √(2γ/(γ−1)·R·T).
    const vMax = Math.sqrt(((2 * g) / (g - 1)) * R * stag.temperature)
    expect(exhaustVelocity(g, R, stag, 0)).toBeCloseTo(vMax, 6)
    // A small but non-zero exit pressure stays just below the theoretical max.
    expect(exhaustVelocity(g, R, stag, 1)).toBeLessThan(vMax)
  })
})

describe('enginePhysics: combustion LUT lookup', () => {
  const lut: CombustionLut = {
    rows: [
      {
        lnPressure: Math.log(1e5),
        pressure: 1e5,
        temperature: 2000,
        gamma: 1.25,
        specificGasConstant: 350,
      },
      {
        lnPressure: Math.log(1e6),
        pressure: 1e6,
        temperature: 3000,
        gamma: 1.15,
        specificGasConstant: 450,
      },
      {
        lnPressure: Math.log(1e7),
        pressure: 1e7,
        temperature: 4000,
        gamma: 1.1,
        specificGasConstant: 500,
      },
    ],
  }

  it('interpolates linearly in ln(pressure) within a non-top interval', () => {
    // Geometric mean of rows 0,1 ⇒ exactly halfway in ln space ⇒ midpoint of each property.
    const mid = Math.sqrt(1e5 * 1e6)
    const { props, conditions } = lutLookup(lut, mid)
    expect(conditions.temperature).toBeCloseTo(2500, 6)
    expect(props.gamma).toBeCloseTo(1.2, 6)
    expect(props.specificGasConstant).toBeCloseTo(400, 6)
    expect(conditions.pressure).toBeCloseTo(mid, 3) // queried pressure is preserved
  })

  it('clamps below the lowest and above the highest tabulated pressure', () => {
    expect(lutLookup(lut, 1e3).props.gamma).toBeCloseTo(1.25, 6) // floor row
    expect(lutLookup(lut, 1e9).props.gamma).toBeCloseTo(1.1, 6) // ceiling row
    // Non-positive pressure falls back to the floor row without throwing.
    expect(lutLookup(lut, 0).conditions.temperature).toBeCloseTo(2000, 6)
  })

  it('reproduces the KSA quirk: the TOP interval clamps to the ceiling row (no interpolation)', () => {
    // CombustionTable.Lookup's `idx <= -NumPoints` branch fires for the highest
    // interval, so a pressure between the last two rows returns the ceiling row's
    // gas properties (it keeps the queried pressure). Faithful to the game; only
    // affects pressures near the very top of the table, far above any real engine.
    const inTopInterval = Math.sqrt(1e6 * 1e7)
    const { props, conditions } = lutLookup(lut, inTopInterval)
    expect(props.gamma).toBeCloseTo(1.1, 6) // ceiling row, NOT the 1.125 midpoint
    expect(conditions.temperature).toBeCloseTo(4000, 6)
  })
})

describe('enginePhysics: predictPerformance (synthetic gas)', () => {
  const lut = flatLut(1.2, 400, 3000)
  const perf = predictPerformance({
    lut,
    maxPressurePa: 5_000_000,
    exitDiameterM: 1,
    areaRatio: 25,
    thermalEfficiency: 1,
    flowEfficiency: 1,
    expansionEfficiency: 1,
  })

  it('passes the chamber gas state straight through at full throttle, efficiency 1', () => {
    expect(perf.chamberPressurePa).toBeCloseTo(5_000_000, 0)
    expect(perf.chamberTemperatureK).toBeCloseTo(3000, 6)
    expect(perf.exitPressurePa).toBeCloseTo(5_000_000, 0) // isochoric ×1
    expect(perf.gamma).toBeCloseTo(1.2, 6)
    expect(perf.molarMassGPerMol).toBeCloseTo((UNIVERSAL_GAS_CONSTANT / 400) * 1000, 6)
  })

  it('matches the independently computed choked mass flow ṁ = P·A_throat/c*', () => {
    const exitArea = Math.PI * 0.25
    const throatArea = exitArea / 25
    const cStar = characteristicVelocity(1.2, 400, 3000)
    const expected = (5_000_000 * throatArea) / cStar
    expect(perf.massFlowRate).toBeCloseTo(expected, 3)
  })

  it('produces more thrust and Isp in vacuum than at sea level', () => {
    expect(perf.thrustSLN).toBeGreaterThan(0)
    expect(perf.thrustVacN).toBeGreaterThan(perf.thrustSLN)
    expect(perf.ispVac).toBeGreaterThan(perf.ispSL)
    // Isp ties thrust to mass flow: Isp = thrust / (ṁ·g₀).
    expect(perf.ispVac).toBeCloseTo(perf.thrustVacN / (perf.massFlowRate * G0), 4)
  })

  it('reports zeroed performance for degenerate inputs (no NaNs leak to the UI)', () => {
    const zero = predictPerformance({
      lut,
      maxPressurePa: 0,
      exitDiameterM: 1,
      areaRatio: 25,
      thermalEfficiency: 1,
      flowEfficiency: 1,
      expansionEfficiency: 1,
    })
    expect(zero.thrustVacN).toBe(0)
    expect(zero.ispVac).toBe(0)
    const nan = predictPerformance({
      lut,
      maxPressurePa: 5e6,
      exitDiameterM: 1,
      areaRatio: Number.NaN, // KSA's AreaRatio default — must not crash
      thermalEfficiency: 1,
      flowEfficiency: 1,
      expansionEfficiency: 1,
    })
    expect(Number.isFinite(nan.thrustVacN)).toBe(true)
    expect(nan.thrustVacN).toBe(0)
  })
})

// Real KSA combustion data: skipped in the open-source build (private assets absent).
describe('enginePhysics: real Hydrolox parity', () => {
  function loadProcesses(): CombustionProcessData[] {
    const text = readFileSync(ksaAsset('Combustion.xml'), 'utf-8')
    const doc = new DOMParser().parseFromString(text, 'application/xml') as unknown as Document
    const out: CombustionProcessData[] = []
    parseCombustionFile(doc, out)
    return out
  }

  it.runIf(hasKsaAssets)('parses Hydrolox_5.5 with normalized 5.5:1 O/F mass fractions', () => {
    const hydrolox = loadProcesses().find((p) => p.id === 'Hydrolox_5.5')!
    expect(hydrolox).toBeTruthy()
    expect(hydrolox.reactants).toHaveLength(2)
    const ox = hydrolox.reactants.find((r) => r.phaseId === 'O2(l)')!
    const fuel = hydrolox.reactants.find((r) => r.phaseId === 'H2(l)')!
    expect(ox.massShare / fuel.massShare).toBeCloseTo(5.5, 6)
    expect(ox.massFraction + fuel.massFraction).toBeCloseTo(1, 6)
    expect(hydrolox.lut.rows.length).toBeGreaterThan(10)
  })

  it.runIf(hasKsaAssets)('predicts physically sane LR91-Vac Hydrolox performance', () => {
    const hydrolox = loadProcesses().find((p) => p.id === 'Hydrolox_5.5')!
    // The real LR91 Vac thrust chamber: 49 bar, 2.5 m exit, area ratio 49, efficiency 1.
    const perf = predictPerformance({
      lut: hydrolox.lut,
      maxPressurePa: 49 * 1e5,
      exitDiameterM: 2.5,
      areaRatio: 49,
      thermalEfficiency: 1,
      flowEfficiency: 1,
      expansionEfficiency: 1,
    })
    expect(perf.thrustVacN).toBeGreaterThan(perf.thrustSLN)
    expect(perf.thrustVacN).toBeGreaterThan(0)
    expect(perf.ispVac).toBeGreaterThan(perf.ispSL)
    // Regression snapshot of the faithful port (tolerant of float32-vs-double drift):
    // vacuum Isp ≈ 443.5 s and ≈ 931 kN thrust — textbook LH2/LOX figures, and a
    // heavily over-expanded sea-level nozzle (the AR49 vacuum bell separates at SL).
    expect(perf.ispVac).toBeCloseTo(443.5, 0)
    expect(perf.thrustVacN / 1000).toBeCloseTo(930.9, 0)
    expect(perf.ispSL).toBeCloseTo(340, 0)
    expect(perf.flowSeparationSeveritySL).toBeGreaterThan(0.5)
    expect(perf.gamma).toBeGreaterThan(1.1)
    expect(perf.gamma).toBeLessThan(1.3)
    expect(perf.molarMassGPerMol).toBeGreaterThan(10)
    expect(perf.molarMassGPerMol).toBeLessThan(20)
    expect(perf.massFlowRate).toBeGreaterThan(0)
    expect(perf.throatDiameterM).toBeGreaterThan(0)
    expect(perf.throatDiameterM).toBeLessThan(2.5)
  })

  it.runIf(hasKsaAssets)('derives a sea-level area ratio below the vacuum one', () => {
    const hydrolox = loadProcesses().find((p) => p.id === 'Hydrolox_5.5')!
    const arSeaLevel = deriveAreaRatioForExhaustPressure(hydrolox.lut, 49 * 1e5, 101325, 1, 1, 1)!
    expect(arSeaLevel).toBeGreaterThan(1)
    expect(arSeaLevel).toBeLessThan(49) // optimizing for SL needs less expansion than vacuum
  })
})
