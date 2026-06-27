import { readFileSync } from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import {
  indexCombustionCatalog,
  parseCombustionFile,
  type CombustionProcessData,
} from './combustionCatalog'
import { UNIVERSAL_GAS_CONSTANT } from './enginePhysics'
import { hasKsaAssets, ksaAsset } from './ksaTestAssets'

function parse(xml: string): CombustionProcessData[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document
  const out: CombustionProcessData[] = []
  parseCombustionFile(doc, out)
  return out
}

describe('combustionCatalog: parseCombustionFile (synthetic)', () => {
  it('normalizes reactant mass shares, builds the LUT, and derives R from molar mass', () => {
    const [proc] = parse(`<Assets>
      <CombustionProcess Id="Test_3">
        <Name Value="Test Propellant" />
        <Reactant Id="Fuel(l)" MassShare="1" />
        <Reactant Id="Ox(l)" MassShare="3" />
        <CombustionCondition>
          <LnPressure Value="13.815510557964274" />
          <Temperature K="3000" />
          <Gamma Value="1.2" />
          <MolarMass GPerMol="20" />
        </CombustionCondition>
      </CombustionProcess>
    </Assets>`)

    expect(proc.id).toBe('Test_3')
    expect(proc.name).toBe('Test Propellant')
    const fuel = proc.reactants.find((r) => r.phaseId === 'Fuel(l)')!
    const ox = proc.reactants.find((r) => r.phaseId === 'Ox(l)')!
    expect(fuel.massFraction).toBeCloseTo(0.25, 9)
    expect(ox.massFraction).toBeCloseTo(0.75, 9)
    expect(proc.lut.rows).toHaveLength(1)
    const row = proc.lut.rows[0]
    expect(row.pressure).toBeCloseTo(Math.exp(13.815510557964274), 0) // ≈ 1e6 Pa
    // R = Ru / molarMass(kg/mol); 20 g/mol = 0.02 kg/mol.
    expect(row.specificGasConstant).toBeCloseTo(UNIVERSAL_GAS_CONSTANT / 0.02, 6)
  })

  it('falls back to the Id for a missing Name and sorts rows by ascending lnPressure', () => {
    const [proc] = parse(`<Assets>
      <CombustionProcess Id="Unnamed">
        <Reactant Id="X(l)" MassShare="1" />
        <CombustionCondition><LnPressure Value="12" /><Temperature K="2000" /><Gamma Value="1.3" /><MolarMass GPerMol="18" /></CombustionCondition>
        <CombustionCondition><LnPressure Value="10" /><Temperature K="1800" /><Gamma Value="1.3" /><MolarMass GPerMol="18" /></CombustionCondition>
      </CombustionProcess>
    </Assets>`)
    expect(proc.name).toBe('Unnamed')
    expect(proc.lut.rows.map((r) => r.lnPressure)).toEqual([10, 12])
  })

  it('skips processes with no usable combustion conditions', () => {
    const procs = parse(`<Assets>
      <CombustionProcess Id="Empty"><Reactant Id="X(l)" MassShare="1" /></CombustionProcess>
    </Assets>`)
    expect(procs).toHaveLength(0)
  })
})

describe('combustionCatalog: real Combustion.xml', () => {
  it.runIf(hasKsaAssets)('loads all four shipped combustion processes', () => {
    const text = readFileSync(ksaAsset('Combustion.xml'), 'utf-8')
    const procs = parse(text)
    const index = indexCombustionCatalog(procs)
    for (const id of ['Hydrolox_5.5', 'Kerolox_2.4', 'MMH_NTO_1.6']) {
      const p = index.get(id)
      expect(p, id).toBeTruthy()
      expect(p!.reactants.length).toBeGreaterThan(0)
      expect(p!.lut.rows.length).toBeGreaterThan(0)
    }
  })
})
