/**
 * Reaction facts as the live catalog would supply them, for tests that must run without the
 * private `$KSA_ASSETS_DIR` tree (`Reactions.xml` is licensed content and is not vendored).
 *
 * Identity + solid-propellant limits are transcribed VERBATIM from
 * `Content/Core/Reactions.xml` @ 2026.8.19.5261 so the pressure-bound checks in
 * `engineValidation.ts` and the engine wizard are graded against the real numbers. The gas
 * LUTs are deliberately EMPTY: every consumer here validates structure, not thrust, and a
 * faithful LUT would be thousands of rows. A test that needs real physics must build its own
 * LUT — see `enginePhysics.test.ts`.
 */

import type { ReactionData } from '../reactionCatalog';

/** `<FixedReaction Id="APCP" Category="Solid">` — 15…150 bar, r = 0.0045·p^0.35. */
export const APCP_REACTION: ReactionData = {
  kind: 'Fixed',
  id: 'APCP',
  name: 'APCP',
  category: 'Solid',
  reactants: [],
  lut: { rows: [] },
  burnRate: { coefficientMPerS: 0.0045, exponent: 0.35 },
  minimumBurnPressurePa: 1_500_000,
  maxStablePressurePa: 15_000_000,
  exhaustCondensedFraction: 0.336965,
};

/** `<FixedReaction Id="DoubleBase" Category="Solid">` — 15…100 bar, r = 0.0047·p^0.3. */
export const DOUBLE_BASE_REACTION: ReactionData = {
  kind: 'Fixed',
  id: 'DoubleBase',
  name: 'Double-Base',
  category: 'Solid',
  reactants: [],
  lut: { rows: [] },
  burnRate: { coefficientMPerS: 0.0047, exponent: 0.3 },
  minimumBurnPressurePa: 1_500_000,
  maxStablePressurePa: 10_000_000,
  exhaustCondensedFraction: 0,
};

/** `<MixtureReaction Id="Hydrolox" Category="Bipropellant">` — default O/F 5.5. */
export const HYDROLOX_REACTION: ReactionData = {
  kind: 'Mixture',
  id: 'Hydrolox',
  name: 'Hydrogen + Oxygen',
  category: 'Bipropellant',
  reactants: [],
  mixtureLut: { ratios: [1], slices: [{ rows: [] }] },
  defaultMixtureRatio: 5.5,
};

/** `<MixtureReaction Id="MMH_NTO" Category="Hypergolic">` — default O/F 1.65 (the RCS default). */
export const MMH_NTO_REACTION: ReactionData = {
  kind: 'Mixture',
  id: 'MMH_NTO',
  name: 'MMH + NTO',
  category: 'Hypergolic',
  reactants: [],
  mixtureLut: { ratios: [1], slices: [{ rows: [] }] },
  defaultMixtureRatio: 1.65,
};

/** The index shape `validateEngines` / the engine wizard take as their `reactions` argument. */
export const REACTION_FIXTURES: ReadonlyMap<string, ReactionData> = new Map<string, ReactionData>([
  [APCP_REACTION.id, APCP_REACTION],
  [DOUBLE_BASE_REACTION.id, DOUBLE_BASE_REACTION],
  [HYDROLOX_REACTION.id, HYDROLOX_REACTION],
  [MMH_NTO_REACTION.id, MMH_NTO_REACTION],
]);
