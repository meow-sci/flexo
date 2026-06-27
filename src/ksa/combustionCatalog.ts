/**
 * Loads KSA's combustion-process library (`Combustion.xml`) — the propellant
 * chemistry an engine's `<Combustor><Combustion Id="…"/>` references. Each process
 * carries its reactant mixture and the pressure-indexed gas lookup table the De
 * Laval physics (see {@link import('./enginePhysics')}) reads γ / R / flame-T from.
 *
 * Mirrors `CombustionProcessTemplate.Create()` (decomp): reactant mass shares are
 * normalized to mass fractions, and each `<CombustionCondition>` becomes one LUT row
 * with `pressure = exp(lnPressure)` and `specificGasConstant = Ru / molarMass(kg/mol)`.
 *
 * `Combustion.xml` is Core game data served under `/ksa/` alongside the catalog
 * files (see {@link import('./catalog').fetchXmlFile}). It is licensed content kept
 * in the private asset tree, so it may be absent in the open-source build — callers
 * must treat an empty catalog as "live physics preview unavailable", not an error.
 */

import { fetchXmlFile } from './catalog'
import type { CombustionLut, CombustionLutRow } from './enginePhysics'
import { UNIVERSAL_GAS_CONSTANT } from './enginePhysics'
import { directChildren } from './partXmlParser'
import type { CombustionLutRowSpec, CombustionReactantSpec, CustomCombustionProcess } from './types'

/** One reactant of a combustion process (a substance phase id + its mixture share). */
export interface CombustionReactant {
  /** Substance phase id, e.g. "H2(l)" / "O2(l)" / "Kerosene(l)". */
  phaseId: string
  /** Raw `<Reactant MassShare>` value (the mixture ratio numerator). */
  massShare: number
  /** Normalized mass fraction (all reactants sum to 1). */
  massFraction: number
}

/** A parsed combustion process: identity, mixture, and its gas LUT for the physics. */
export interface CombustionProcessData {
  /** `<CombustionProcess Id>`, e.g. "Hydrolox_5.5". */
  id: string
  /** `<Name Value>`, falling back to {@link id}. */
  name: string
  reactants: CombustionReactant[]
  lut: CombustionLut
}

/** The combustion data file name served under `/ksa/` (sibling of the catalog `*Assets.xml`). */
export const COMBUSTION_FILE = 'Combustion.xml'

function readAttrNum(el: Element | null | undefined, attr: string): number {
  const raw = el?.getAttribute(attr)
  if (raw == null) return Number.NaN
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : Number.NaN
}

/** Sums the set unit attributes of a unit-bearing reference element (NaN-skipped, like KSA). */
function sumUnits(el: Element | null | undefined, units: Record<string, number>): number {
  if (!el) return Number.NaN
  let value = Number.NaN
  for (const [attr, scale] of Object.entries(units)) {
    const n = readAttrNum(el, attr)
    if (Number.isFinite(n)) value = (Number.isNaN(value) ? 0 : value) + n * scale
  }
  return value
}

/** Parses every `<CombustionProcess>` in a Combustion.xml document, appending to `out`. */
export function parseCombustionFile(doc: Document, out: CombustionProcessData[]): void {
  const root = doc.documentElement
  if (!root) return
  for (const proc of directChildren(root, 'CombustionProcess')) {
    const id = proc.getAttribute('Id')
    if (!id) continue

    const nameEl = directChildren(proc, 'Name')[0]
    const name = nameEl?.getAttribute('Value')?.trim() || id

    // Reactants → normalized mass fractions (CombustionProcessTemplate.Create).
    const rawReactants = directChildren(proc, 'Reactant')
      .map((r) => ({
        phaseId: r.getAttribute('Id') ?? '',
        massShare: readAttrNum(r, 'MassShare'),
      }))
      .filter((r) => r.phaseId && Number.isFinite(r.massShare) && r.massShare > 0)
    const totalShare = rawReactants.reduce((s, r) => s + r.massShare, 0)
    const reactants: CombustionReactant[] = rawReactants.map((r) => ({
      phaseId: r.phaseId,
      massShare: r.massShare,
      massFraction: totalShare > 0 ? r.massShare / totalShare : 0,
    }))

    const rows: CombustionLutRow[] = []
    for (const cond of directChildren(proc, 'CombustionCondition')) {
      const lnPressure = readAttrNum(directChildren(cond, 'LnPressure')[0], 'Value')
      const temperature = sumUnits(directChildren(cond, 'Temperature')[0], { K: 1 })
      const gamma = readAttrNum(directChildren(cond, 'Gamma')[0], 'Value')
      // MolarMassReference: GPerMol×0.001 + KgPerMol×1 → kg/mol.
      const molarMassKgPerMol = sumUnits(directChildren(cond, 'MolarMass')[0], {
        GPerMol: 0.001,
        KgPerMol: 1,
      })
      if (
        !Number.isFinite(lnPressure) ||
        !Number.isFinite(temperature) ||
        !Number.isFinite(gamma) ||
        !(molarMassKgPerMol > 0)
      ) {
        continue
      }
      rows.push({
        lnPressure,
        pressure: Math.exp(lnPressure),
        temperature,
        gamma,
        specificGasConstant: UNIVERSAL_GAS_CONSTANT / molarMassKgPerMol,
      })
    }
    if (rows.length === 0) continue
    // The LUT lookup assumes ascending lnPressure; shipped data is already sorted,
    // but sort defensively so a hand-authored process can't break the binary search.
    rows.sort((a, b) => a.lnPressure - b.lnPressure)

    out.push({ id, name, reactants, lut: { rows } })
  }
}

/**
 * Fetches and parses the Core combustion catalog. Returns an empty array (not an
 * error) when `Combustion.xml` is absent — the open-source build without the private
 * asset tree falls back to "no live physics preview", still able to author engines.
 */
export async function loadCombustionCatalog(): Promise<CombustionProcessData[]> {
  const r = await fetchXmlFile(COMBUSTION_FILE)
  if (r.kind !== 'ok') {
    if (r.kind === 'missing') {
      console.info(
        `flexo combustion catalog: ${COMBUSTION_FILE} not served — live physics disabled`,
      )
    }
    return []
  }
  const out: CombustionProcessData[] = []
  parseCombustionFile(r.doc, out)
  out.sort((a, b) => a.id.localeCompare(b.id))
  console.info(`flexo combustion catalog: ${out.length} combustion processes loaded`)
  return out
}

/** Builds an id→process index for O(1) lookups by combustion id. */
export function indexCombustionCatalog(
  entries: CombustionProcessData[],
): Map<string, CombustionProcessData> {
  return new Map(entries.map((e) => [e.id, e]))
}

/**
 * Converts a user-authored {@link CustomCombustionProcess} (raw `<CombustionCondition>`
 * units) into the computed {@link CombustionProcessData} the physics reads — the same
 * transform `CombustionProcessTemplate.Create()` does: normalize reactant shares to
 * fractions, `pressure = exp(lnPressure)`, `R = Ru / molarMass(kg/mol)`, rows sorted by
 * lnPressure. Rows with non-finite/invalid values are dropped.
 */
export function customToProcessData(custom: CustomCombustionProcess): CombustionProcessData {
  const valid = custom.reactants.filter((r) => r.phaseId && r.massShare > 0)
  const total = valid.reduce((s, r) => s + r.massShare, 0)
  const reactants: CombustionReactant[] = valid.map((r) => ({
    phaseId: r.phaseId,
    massShare: r.massShare,
    massFraction: total > 0 ? r.massShare / total : 0,
  }))
  const rows: CombustionLutRow[] = custom.lut
    .filter(
      (r) =>
        Number.isFinite(r.lnPressure) &&
        Number.isFinite(r.temperatureK) &&
        Number.isFinite(r.gamma) &&
        r.molarMassGPerMol > 0,
    )
    .map((r) => ({
      lnPressure: r.lnPressure,
      pressure: Math.exp(r.lnPressure),
      temperature: r.temperatureK,
      gamma: r.gamma,
      specificGasConstant: UNIVERSAL_GAS_CONSTANT / (r.molarMassGPerMol * 0.001),
    }))
    .sort((a, b) => a.lnPressure - b.lnPressure)
  return { id: custom.id, name: custom.name || custom.id, reactants, lut: { rows } }
}

/**
 * Reverse of {@link customToProcessData}: turns a computed catalog process back into the
 * editable authored form, so the designer can "clone & remix" a shipped propellant
 * (molar mass recovered as `Ru / R`, in g/mol). Used by the custom-propellant editor.
 */
export function processDataToCustom(
  data: CombustionProcessData,
  newId: string,
  newName: string,
): CustomCombustionProcess {
  const reactants: CombustionReactantSpec[] = data.reactants.map((r) => ({
    phaseId: r.phaseId,
    massShare: r.massShare,
  }))
  const lut: CombustionLutRowSpec[] = data.lut.rows.map((row) => ({
    lnPressure: row.lnPressure,
    temperatureK: row.temperature,
    gamma: row.gamma,
    molarMassGPerMol: (UNIVERSAL_GAS_CONSTANT / row.specificGasConstant) * 1000,
  }))
  return { id: newId, name: newName || newId, reactants, lut }
}
