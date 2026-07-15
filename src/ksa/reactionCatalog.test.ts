import { readFileSync } from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import {
  indexReactionCatalog,
  mixtureRatioBounds,
  parseReactionsFile,
  resolveReactionLut,
  type MixtureReactionData,
  type ReactionData,
} from './reactionCatalog'
import { UNIVERSAL_GAS_CONSTANT } from './enginePhysics'
import { hasKsaAssets, ksaAsset } from './ksaTestAssets'

function parse(xml: string): ReactionData[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document
  const out: ReactionData[] = []
  parseReactionsFile(doc, out)
  return out
}

const PRESSURE_CONDITION = (lnP: number, tK: number, gamma = 1.2, gPerMol = 20) => `
  <PressureCondition>
    <LnPressure Value="${lnP}" />
    <Temperature K="${tK}" />
    <Gamma Value="${gamma}" />
    <MolarMass GPerMol="${gPerMol}" />
  </PressureCondition>`

describe('reactionCatalog: parseReactionsFile (synthetic)', () => {
  it('parses a FixedReaction: normalizes mass shares, builds the LUT, derives R from molar mass', () => {
    const [reaction] = parse(`<Assets>
      <FixedReaction Id="Test" Category="Solid">
        <Name Value="Test Propellant" />
        <Reactant Id="Fuel(s)" MassShare="1" />
        <Reactant Id="Ox(s)" MassShare="3" />
        ${PRESSURE_CONDITION(13.815510557964274, 3000)}
      </FixedReaction>
    </Assets>`)

    expect(reaction.kind).toBe('Fixed')
    expect(reaction.id).toBe('Test')
    expect(reaction.name).toBe('Test Propellant')
    expect(reaction.category).toBe('Solid')
    const fuel = reaction.reactants.find((r) => r.phaseId === 'Fuel(s)')!
    const ox = reaction.reactants.find((r) => r.phaseId === 'Ox(s)')!
    expect(fuel.massFraction).toBeCloseTo(0.25, 9)
    expect(ox.massFraction).toBeCloseTo(0.75, 9)
    if (reaction.kind !== 'Fixed') throw new Error('unreachable')
    expect(reaction.lut.rows).toHaveLength(1)
    const row = reaction.lut.rows[0]
    expect(row.pressure).toBeCloseTo(Math.exp(13.815510557964274), 0) // ≈ 1e6 Pa
    // R = Ru / molarMass(kg/mol); 20 g/mol = 0.02 kg/mol.
    expect(row.specificGasConstant).toBeCloseTo(UNIVERSAL_GAS_CONSTANT / 0.02, 6)
  })

  it('defaults a FixedReaction category to Monopropellant and falls back to the Id for a missing Name', () => {
    const [reaction] = parse(`<Assets>
      <FixedReaction Id="Unnamed">
        <Reactant Id="X(l)" MassShare="1" />
        ${PRESSURE_CONDITION(12, 2000)}
        ${PRESSURE_CONDITION(10, 1800)}
      </FixedReaction>
    </Assets>`)
    expect(reaction.name).toBe('Unnamed')
    expect(reaction.category).toBe('Monopropellant')
    if (reaction.kind !== 'Fixed') throw new Error('unreachable')
    // Rows sorted by ascending lnPressure.
    expect(reaction.lut.rows.map((r) => r.lnPressure)).toEqual([10, 12])
  })

  it('parses a MixtureReaction: sorted ratio rows, shared pressure axis, default ratio', () => {
    const [reaction] = parse(`<Assets>
      <MixtureReaction Id="TestMix" Category="Bipropellant">
        <Name Value="Test Mix" />
        <Reactant Id="Fuel(l)" MassShare="1" />
        <Reactant Id="Ox(l)" MassShare="1" />
        <DefaultMixtureRatio>2.5</DefaultMixtureRatio>
        <MixtureRatioCondition Value="4">
          ${PRESSURE_CONDITION(10, 2400)}
          ${PRESSURE_CONDITION(12, 2600)}
        </MixtureRatioCondition>
        <MixtureRatioCondition Value="2">
          ${PRESSURE_CONDITION(10, 2000)}
          ${PRESSURE_CONDITION(12, 2200)}
        </MixtureRatioCondition>
      </MixtureReaction>
    </Assets>`)

    expect(reaction.kind).toBe('Mixture')
    if (reaction.kind !== 'Mixture') throw new Error('unreachable')
    expect(reaction.defaultMixtureRatio).toBe(2.5)
    expect(reaction.mixtureLut.ratios).toEqual([2, 4]) // sorted ascending
    expect(reaction.mixtureLut.slices[0].rows.map((r) => r.temperature)).toEqual([2000, 2200])
    expect(reaction.mixtureLut.slices[1].rows.map((r) => r.temperature)).toEqual([2400, 2600])
    expect(mixtureRatioBounds(reaction)).toEqual({ min: 2, max: 4 })
  })

  it('resolveReactionLut: slices a mixture at the ratio, refuses a missing ratio', () => {
    const [reaction] = parse(`<Assets>
      <MixtureReaction Id="TestMix">
        <Reactant Id="Fuel(l)" MassShare="1" />
        <Reactant Id="Ox(l)" MassShare="1" />
        <DefaultMixtureRatio>3</DefaultMixtureRatio>
        <MixtureRatioCondition Value="2">${PRESSURE_CONDITION(10, 2000)}</MixtureRatioCondition>
        <MixtureRatioCondition Value="4">${PRESSURE_CONDITION(10, 3000)}</MixtureRatioCondition>
      </MixtureReaction>
    </Assets>`)

    expect(resolveReactionLut(reaction, null)).toBeNull()
    // Midpoint ratio lerps the rows; out-of-range clamps (AtMixtureRatio).
    expect(resolveReactionLut(reaction, 3)!.rows[0].temperature).toBeCloseTo(2500, 9)
    expect(resolveReactionLut(reaction, 100)!.rows[0].temperature).toBeCloseTo(3000, 9)
    expect(resolveReactionLut(reaction, 0.1)!.rows[0].temperature).toBeCloseTo(2000, 9)
  })

  it('skips thermal reactions and reactions with no usable conditions', () => {
    const reactions = parse(`<Assets>
      <FixedReaction Id="Empty"><Reactant Id="X(l)" MassShare="1" /></FixedReaction>
      <ThermalReaction Id="ThermalH2" Category="Thermal">
        <Reactant Id="H2(l)" MassShare="1" />
        <TemperatureCondition K="2000">${PRESSURE_CONDITION(10, 2000)}</TemperatureCondition>
      </ThermalReaction>
      <MixtureReaction Id="NoDefault">
        <Reactant Id="F(l)" MassShare="1" />
        <Reactant Id="O(l)" MassShare="1" />
        <MixtureRatioCondition Value="2">${PRESSURE_CONDITION(10, 2000)}</MixtureRatioCondition>
      </MixtureReaction>
    </Assets>`)
    expect(reactions).toHaveLength(0)
  })
})

describe('reactionCatalog: real Reactions.xml', () => {
  it.runIf(hasKsaAssets)('loads the shipped combustor-drivable reactions', () => {
    const text = readFileSync(ksaAsset('Reactions.xml'), 'utf-8')
    const reactions = parse(text)
    const index = indexReactionCatalog(reactions)

    // The 6 mixtures + 2 monoprops + 2 solids; the 6 thermals are skipped.
    expect(reactions).toHaveLength(10)

    for (const id of ['Kerolox', 'Hydrolox', 'Methalox', 'Ethalox', 'Ethanol_HTP', 'MMH_NTO']) {
      const r = index.get(id)
      expect(r?.kind, id).toBe('Mixture')
      const mix = r as MixtureReactionData
      expect(mix.mixtureLut.ratios.length).toBeGreaterThan(1)
      expect(mix.mixtureLut.slices[0].rows.length).toBeGreaterThan(0)
    }
    expect(index.get('Hydrolox')!.kind === 'Mixture').toBe(true)
    expect((index.get('Hydrolox') as MixtureReactionData).defaultMixtureRatio).toBeCloseTo(5.5, 9)

    for (const id of ['HTPDecomposition', 'HydrazineDecomposition', 'APCP', 'DoubleBase']) {
      expect(index.get(id)?.kind, id).toBe('Fixed')
    }
    expect(index.get('APCP')!.category).toBe('Solid')

    // Core engines burn Hydrolox at 5.5 / MMH_NTO at 1.6 — both must resolve to a usable LUT.
    expect(resolveReactionLut(index.get('Hydrolox')!, 5.5)!.rows.length).toBeGreaterThan(0)
    expect(resolveReactionLut(index.get('MMH_NTO')!, 1.6)!.rows.length).toBeGreaterThan(0)
  })
})
