/**
 * Loads KSA's reaction library (`Reactions.xml`) — the propellant chemistry an
 * engine's `<Combustor><Reaction Id="…"/>` references. Each reaction carries its
 * reactant mixture and the pressure-indexed gas lookup table the De Laval physics
 * (see {@link import('./enginePhysics')}) reads γ / R / flame-T from. KSA
 * 2026.7.5 (rev 4884) replaced the old flat `<CombustionProcess>` library
 * (`Combustion.xml`) with three reaction flavors:
 *
 *  - `<FixedReaction>`    — one 1-D pressure LUT (monopropellants, solids).
 *  - `<MixtureReaction>`  — a 2-D O/F-ratio × pressure LUT; the combustor picks
 *    the ratio (`<MixtureRatio>`) and KSA bakes a 1-D slice at load
 *    (`MixtureReaction.AtMixtureRatio` → `MixtureReactionTable.SliceAt`).
 *  - `<ThermalReaction>`  — needs a thermal core, which no part template provides
 *    yet (KSA's own designer refuses them) — flexo skips them.
 *
 * Mirrors `ReactionTemplate.Create()` (decomp): reactant mass shares are
 * normalized to mass fractions, and each `<PressureCondition>` becomes one LUT row
 * with `pressure = exp(lnPressure)` and `specificGasConstant = Ru / molarMass(kg/mol)`.
 *
 * `Reactions.xml` is Core game data served under `/ksa/` alongside the catalog
 * files (see {@link import('./catalog').fetchXmlFile}). It is licensed content kept
 * in the private asset tree, so it may be absent in the open-source build — callers
 * must treat an empty catalog as "live physics preview unavailable", not an error.
 */

import { fetchXmlFile } from './catalog';
import type { CombustionLut, CombustionLutRow, MixtureLut } from './enginePhysics';
import { sliceLutAtMixtureRatio, UNIVERSAL_GAS_CONSTANT } from './enginePhysics';
import { directChildren } from './partXmlParser';
import type {
  BurnRateLaw,
  CustomReaction,
  ReactionCategory,
  ReactionLutRowSpec,
  ReactionReactantSpec,
} from './types';

/** One reactant of a reaction (a substance phase id + its mixture share). */
export interface ReactionReactant {
  /** Substance phase id, e.g. "H2(l)" / "O2(l)" / "Kerosene(l)". */
  phaseId: string;
  /** Raw `<Reactant MassShare>` value (the mixture-ratio numerator). */
  massShare: number;
  /** Normalized mass fraction (all reactants sum to 1). */
  massFraction: number;
}

/** A parsed reaction: identity, mixture, and its gas LUT(s) for the physics. */
export type ReactionData = FixedReactionData | MixtureReactionData;

interface ReactionDataBase {
  /** Reaction element `Id`, e.g. "Hydrolox" / "HTPDecomposition". */
  id: string;
  /** `<Name Value>`, falling back to {@link id}. */
  name: string;
  /** `Category` attribute (Bipropellant/Hypergolic/Monopropellant/Solid/Thermal). */
  category: ReactionCategory;
  reactants: ReactionReactant[];
}

/**
 * A `<FixedReaction>` — a single 1-D pressure LUT (also what custom reactions become).
 * The four solid-propellant fields are MANDATORY on a `Category="Solid"` reaction
 * (`FixedReactionTemplate.Create()` throws without them) and absent on every other
 * category; carrying them here is what lets "clone a shipped propellant" produce a
 * custom solid reaction KSA will actually load.
 */
export interface FixedReactionData extends ReactionDataBase {
  kind: 'Fixed';
  lut: CombustionLut;
  /** `<BurnRate CoefficientMPerS Exponent>` — Vieille's law `r = a·p^n`. */
  burnRate: BurnRateLaw | null;
  /** `<MinimumBurnPressure>` deflagration limit, Pa. */
  minimumBurnPressurePa: number | null;
  /** `<MaxStablePressure>` slope-break limit, Pa — a solid motor's `<DefaultPressure>` ceiling. */
  maxStablePressurePa: number | null;
  /** `<ExhaustCondensedFraction Value>` condensed-phase exhaust mass fraction, [0, 1). */
  exhaustCondensedFraction: number | null;
}

/** A `<MixtureReaction>` — a 2-D O/F × pressure LUT plus its default ratio. */
export interface MixtureReactionData extends ReactionDataBase {
  kind: 'Mixture';
  mixtureLut: MixtureLut;
  /** `<DefaultMixtureRatio>` — REQUIRED by KSA (load throws without it). */
  defaultMixtureRatio: number;
}

/** The reaction data file name served under `/ksa/` (sibling of the catalog `*Assets.xml`). */
export const REACTIONS_FILE = 'Reactions.xml';

function readAttrNum(el: Element | null | undefined, attr: string): number {
  const raw = el?.getAttribute(attr);
  if (raw == null) return Number.NaN;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Sums the set unit attributes of a unit-bearing reference element (NaN-skipped, like KSA). */
function sumUnits(el: Element | null | undefined, units: Record<string, number>): number {
  if (!el) return Number.NaN;
  let value = Number.NaN;
  for (const [attr, scale] of Object.entries(units)) {
    const n = readAttrNum(el, attr);
    if (Number.isFinite(n)) value = (Number.isNaN(value) ? 0 : value) + n * scale;
  }
  return value;
}

/** Reads a numeric element text content (`<DefaultMixtureRatio>2.3</…>`), NaN when absent. */
function readTextNum(el: Element | null | undefined): number {
  const raw = el?.textContent?.trim();
  if (!raw) return Number.NaN;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Sums a `PressureReference`'s unit attributes into Pa; null when none are set. */
function readPressurePa(el: Element | null | undefined): number | null {
  const pa = sumUnits(el, { Pa: 1, KPa: 1e3, MPa: 1e6, MBar: 100, Bar: 1e5, Atm: 101325 });
  return Number.isFinite(pa) ? pa : null;
}

const REACTION_CATEGORIES: ReadonlySet<string> = new Set([
  'Bipropellant',
  'Hypergolic',
  'Monopropellant',
  'Solid',
  'Thermal',
]);

/** The `Category` attribute, with the per-flavor fallback `ReactionTemplate.ResolveCategory` applies. */
function readCategory(el: Element, fallback: ReactionCategory): ReactionCategory {
  const raw = el.getAttribute('Category');
  return raw && REACTION_CATEGORIES.has(raw) ? (raw as ReactionCategory) : fallback;
}

/** Reactants → normalized mass fractions (ReactionTemplate.CreateReactants). */
function readReactants(el: Element): ReactionReactant[] {
  const raw = directChildren(el, 'Reactant')
    .map((r) => ({
      phaseId: r.getAttribute('Id') ?? '',
      massShare: readAttrNum(r, 'MassShare'),
    }))
    .filter((r) => r.phaseId && Number.isFinite(r.massShare) && r.massShare > 0);
  const totalShare = raw.reduce((s, r) => s + r.massShare, 0);
  return raw.map((r) => ({
    phaseId: r.phaseId,
    massShare: r.massShare,
    massFraction: totalShare > 0 ? r.massShare / totalShare : 0,
  }));
}

/** `<PressureCondition>` children → sorted 1-D LUT rows (ReactionTemplate.FillRow units). */
function readPressureConditions(el: Element): CombustionLutRow[] {
  const rows: CombustionLutRow[] = [];
  for (const cond of directChildren(el, 'PressureCondition')) {
    const lnPressure = readAttrNum(directChildren(cond, 'LnPressure')[0], 'Value');
    const temperature = sumUnits(directChildren(cond, 'Temperature')[0], { K: 1 });
    const gamma = readAttrNum(directChildren(cond, 'Gamma')[0], 'Value');
    // MolarMassReference: GPerMol×0.001 + KgPerMol×1 → kg/mol.
    const molarMassKgPerMol = sumUnits(directChildren(cond, 'MolarMass')[0], {
      GPerMol: 0.001,
      KgPerMol: 1,
    });
    if (
      !Number.isFinite(lnPressure) ||
      !Number.isFinite(temperature) ||
      !Number.isFinite(gamma) ||
      !(molarMassKgPerMol > 0)
    ) {
      continue;
    }
    rows.push({
      lnPressure,
      pressure: Math.exp(lnPressure),
      temperature,
      gamma,
      specificGasConstant: UNIVERSAL_GAS_CONSTANT / molarMassKgPerMol,
    });
  }
  // KSA sorts + validates the axis at load; sort defensively so a hand-authored
  // reaction can't break the binary search.
  rows.sort((a, b) => a.lnPressure - b.lnPressure);
  return rows;
}

/**
 * Parses every `<FixedReaction>` / `<MixtureReaction>` in a Reactions.xml document,
 * appending to `out`. `<ThermalReaction>`s are skipped (no thermal core exists to
 * burn them — see the module doc).
 */
export function parseReactionsFile(doc: Document, out: ReactionData[]): void {
  const root = doc.documentElement;
  if (!root) return;

  for (const el of directChildren(root, 'FixedReaction')) {
    const id = el.getAttribute('Id');
    if (!id) continue;
    const rows = readPressureConditions(el);
    if (rows.length === 0) continue;
    // Solid-propellant data (mandatory for Category="Solid", absent otherwise).
    const brEl = directChildren(el, 'BurnRate')[0];
    const a = readAttrNum(brEl, 'CoefficientMPerS');
    const n = readAttrNum(brEl, 'Exponent');
    const condensed = readAttrNum(directChildren(el, 'ExhaustCondensedFraction')[0], 'Value');
    out.push({
      kind: 'Fixed',
      id,
      name: directChildren(el, 'Name')[0]?.getAttribute('Value')?.trim() || id,
      category: readCategory(el, 'Monopropellant'),
      reactants: readReactants(el),
      lut: { rows },
      burnRate:
        Number.isFinite(a) && Number.isFinite(n) ? { coefficientMPerS: a, exponent: n } : null,
      minimumBurnPressurePa: readPressurePa(directChildren(el, 'MinimumBurnPressure')[0]),
      maxStablePressurePa: readPressurePa(directChildren(el, 'MaxStablePressure')[0]),
      exhaustCondensedFraction: Number.isFinite(condensed) ? condensed : null,
    });
  }

  for (const el of directChildren(root, 'MixtureReaction')) {
    const id = el.getAttribute('Id');
    if (!id) continue;
    const defaultMixtureRatio = readTextNum(directChildren(el, 'DefaultMixtureRatio')[0]);
    // Rows sorted by their O/F ratio (MixtureReactionTemplate.Create sorts, then
    // rejects non-rectangular tables — we drop rows that don't match the first
    // row's pressure-axis length instead of throwing).
    const rowEls = directChildren(el, 'MixtureRatioCondition')
      .map((rowEl) => ({ ratio: readAttrNum(rowEl, 'Value'), rows: readPressureConditions(rowEl) }))
      .filter((r) => Number.isFinite(r.ratio) && r.rows.length > 0)
      .sort((a, b) => a.ratio - b.ratio);
    const cols = rowEls[0]?.rows.length ?? 0;
    const rectangular = rowEls.filter((r) => r.rows.length === cols);
    if (rectangular.length === 0 || !Number.isFinite(defaultMixtureRatio)) continue;
    out.push({
      kind: 'Mixture',
      id,
      name: directChildren(el, 'Name')[0]?.getAttribute('Value')?.trim() || id,
      category: readCategory(el, 'Bipropellant'),
      reactants: readReactants(el),
      mixtureLut: {
        ratios: rectangular.map((r) => r.ratio),
        slices: rectangular.map((r) => ({ rows: r.rows })),
      },
      defaultMixtureRatio,
    });
  }
}

/**
 * Fetches and parses the Core reaction catalog. Returns an empty array (not an
 * error) when `Reactions.xml` is absent — the open-source build without the private
 * asset tree falls back to "no live physics preview", still able to author engines.
 */
export async function loadReactionCatalog(): Promise<ReactionData[]> {
  const r = await fetchXmlFile(REACTIONS_FILE);
  if (r.kind !== 'ok') {
    if (r.kind === 'missing') {
      console.info(`flexo reaction catalog: ${REACTIONS_FILE} not served — live physics disabled`);
    }
    return [];
  }
  const out: ReactionData[] = [];
  parseReactionsFile(r.doc, out);
  out.sort((a, b) => a.id.localeCompare(b.id));
  console.info(`flexo reaction catalog: ${out.length} reactions loaded`);
  return out;
}

/** Builds an id→reaction index for O(1) lookups by `<Reaction Id>`. */
export function indexReactionCatalog(entries: ReactionData[]): Map<string, ReactionData> {
  return new Map(entries.map((e) => [e.id, e]));
}

/**
 * Resolves the 1-D gas LUT a combustor referencing `reaction` actually burns —
 * what `CombustorTemplate.ResolveReaction` does at load. Fixed reactions are their
 * own LUT; mixture reactions REQUIRE a mixture ratio (KSA throws without one) and
 * bake a slice at it. Returns null when the ratio is missing/invalid.
 */
export function resolveReactionLut(
  reaction: ReactionData,
  mixtureRatio: number | null,
): CombustionLut | null {
  if (reaction.kind === 'Fixed') return reaction.lut;
  if (mixtureRatio == null || !Number.isFinite(mixtureRatio)) return null;
  return sliceLutAtMixtureRatio(reaction.mixtureLut, mixtureRatio);
}

/**
 * Converts a user-authored {@link CustomReaction} (raw `<PressureCondition>` units)
 * into the computed {@link ReactionData} the physics reads — the same transform
 * `FixedReactionTemplate.Create()` does: normalize reactant shares to fractions,
 * `pressure = exp(lnPressure)`, `R = Ru / molarMass(kg/mol)`, rows sorted by
 * lnPressure. Rows with non-finite/invalid values are dropped.
 */
export function customToReactionData(custom: CustomReaction): FixedReactionData {
  const valid = custom.reactants.filter((r) => r.phaseId && r.massShare > 0);
  const total = valid.reduce((s, r) => s + r.massShare, 0);
  const reactants: ReactionReactant[] = valid.map((r) => ({
    phaseId: r.phaseId,
    massShare: r.massShare,
    massFraction: total > 0 ? r.massShare / total : 0,
  }));
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
    .sort((a, b) => a.lnPressure - b.lnPressure);
  return {
    kind: 'Fixed',
    id: custom.id,
    name: custom.name || custom.id,
    category: custom.category,
    reactants,
    lut: { rows },
    burnRate: custom.burnRate,
    minimumBurnPressurePa: custom.minimumBurnPressurePa,
    maxStablePressurePa: custom.maxStablePressurePa,
    exhaustCondensedFraction: custom.exhaustCondensedFraction,
  };
}

/**
 * Reverse of {@link customToReactionData}: turns a catalog reaction back into the
 * editable authored form, so the designer can "clone & remix" a shipped propellant
 * (molar mass recovered as `Ru / R`, in g/mol). A MixtureReaction is baked at its
 * `<DefaultMixtureRatio>` — the same 1-D slice KSA's combustor would burn — since
 * the authored form is always a `<FixedReaction>`. Used by the custom-propellant editor.
 */
export function reactionDataToCustom(
  data: ReactionData,
  newId: string,
  newName: string,
): CustomReaction {
  const lutSource =
    data.kind === 'Fixed'
      ? data.lut
      : sliceLutAtMixtureRatio(data.mixtureLut, data.defaultMixtureRatio);
  const reactants: ReactionReactantSpec[] = data.reactants.map((r) => ({
    phaseId: r.phaseId,
    massShare: r.massShare,
  }));
  const lut: ReactionLutRowSpec[] = lutSource.rows.map((row) => ({
    lnPressure: row.lnPressure,
    temperatureK: row.temperature,
    gamma: row.gamma,
    molarMassGPerMol: (UNIVERSAL_GAS_CONSTANT / row.specificGasConstant) * 1000,
  }));
  return {
    id: newId,
    name: newName || newId,
    category: data.category,
    reactants,
    lut,
    // Carry the solid-propellant data through so cloning APCP/DoubleBase (or any
    // modded solid) yields a reaction KSA will load — without these four,
    // FixedReactionTemplate.Create() throws on a Category="Solid" reaction.
    burnRate: data.kind === 'Fixed' ? data.burnRate : null,
    minimumBurnPressurePa: data.kind === 'Fixed' ? data.minimumBurnPressurePa : null,
    maxStablePressurePa: data.kind === 'Fixed' ? data.maxStablePressurePa : null,
    exhaustCondensedFraction: data.kind === 'Fixed' ? data.exhaustCondensedFraction : null,
  };
}

/** The O/F row range a mixture reaction's ratio is clamped into; null for fixed reactions. */
export function mixtureRatioBounds(reaction: ReactionData): { min: number; max: number } | null {
  if (reaction.kind !== 'Mixture') return null;
  const ratios = reaction.mixtureLut.ratios;
  return { min: ratios[0], max: ratios[ratios.length - 1] };
}
