import type {
  Combustor,
  DeLavalNozzle,
  EditingPart,
  Rocket,
  SubPartGameData,
  SubPartIdRef,
} from '../../ksa/types';
import type { ReactionData } from '../../ksa/reactionCatalog';
import { resolveReactionLut } from '../../ksa/reactionCatalog';
import { predictPerformance, G0, type EnginePerformance } from '../../ksa/enginePhysics';
import { FIRST_PAIR_ROCKET, type EngineEntry } from '../../state/engineStore';

/**
 * **Per-rocket performance aggregation** (design: design-data-engine-modes.md D6, §B6).
 *
 * `predictPerformance` is UNTOUCHED — it is a verbatim port of KSA's engine math and the
 * census marks any drift as breaking. Everything here is presentation-level SUMMATION over
 * the chamber+nozzle pairs one `<Rocket>` binds: Σ thrust, Σ mass flow, and
 * `Isp = ΣF / (g0 · Σṁ)`, which is the only correct way to combine specific impulses.
 *
 * Two modes, and the difference is deliberate:
 *
 * - **A `<Rocket>`** — every pair it binds, multiplied by placements of the ROCKET's
 *   owning template. A part-level rocket's explicit `SubPartId` names exactly one nozzle
 *   instance, even when that nozzle template is placed several times.
 * - **"First pair"** — v1's legacy readout, kept as the fallback for a scope with no
 *   `<Rocket>` at all: the FIRST combustor with the FIRST nozzle, un-multiplied, so the
 *   numbers a returning user knows do not silently change.
 *
 * Pure: no stores, no React. The reaction index is injected.
 */

/** One chamber + nozzle pair inside a rocket, with the numbers it contributes. */
export interface PerformancePair {
  coreId: string;
  nozzleId: string;
  /** How many in-game thrusters this one nozzle becomes (placements of its owner). */
  instanceCount: number;
  /** Per-THRUSTER performance — multiply by {@link instanceCount} for the contribution. */
  performance: EnginePerformance;
}

/** The aggregate the card's metric rows render. */
export interface AggregatedPerformance {
  kind: 'ok';
  /** Display name of the propellant the readout used (the first pair's). */
  reactionName: string;
  pairs: PerformancePair[];
  thrustVacN: number;
  thrustSLN: number;
  ispVac: number;
  ispSL: number;
  massFlowRate: number;
  /** Throat diameter of the FIRST pair — a per-nozzle dimension, not a sum. */
  throatDiameterM: number;
  /** Worst sea-level flow separation across the pairs, 0..1. */
  flowSeparationSeveritySL: number;
  /** Optimum expansion of the first pair (Pa). */
  optimumExpansionPa: number;
}

/**
 * Why there are no numbers. Each maps to one of the card's hint states — the two degradation
 * texts v1 shipped, plus the two structural cases per-rocket aggregation introduces.
 */
export type PerformanceUnavailable =
  | { kind: 'no-modules' }
  | { kind: 'no-catalog'; reactionId: string }
  | { kind: 'no-ratio'; reactionName: string }
  | { kind: 'solid' };

export type PerformanceResult = AggregatedPerformance | PerformanceUnavailable;

/** Every `<Rocket>` the open scope can aggregate, in document order. */
export function rocketsInScope(part: EditingPart, entry: EngineEntry | null): Rocket[] {
  if (!entry) return [];
  if (entry.kind === 'part') return part.gameData.rockets;
  return part.subPartGameData.find((s) => s.subPartTemplateId === entry.templateId)?.rockets ?? [];
}

/** Select the first actual rocket on entry/scope change; first-pair is only for bare hardware. */
export function performanceSelection(rockets: Rocket[], selection: string): string {
  return rockets.some((r) => r.id === selection)
    ? selection
    : (rockets[0]?.id ?? FIRST_PAIR_ROCKET);
}

/**
 * KSA SubPartIdReference.TryGetSubPart: an empty SubPartId means the rocket's owner;
 * an explicit id means one child instance. Never search unrelated owners by module id.
 * flexo's SubPart templates have no nested child placements.
 */
function locate<T extends { id: string }>(
  part: EditingPart,
  entry: EngineEntry,
  ref: SubPartIdRef,
  pick: (owner: SubPartGameData | EditingPart['gameData']) => T[],
): T | null {
  if (ref.subPartInstanceId) {
    if (entry.kind === 'subpart') return null;
    const placement = part.placements.find((p) => p.instanceId === ref.subPartInstanceId);
    const owner = part.subPartGameData.find(
      (s) => s.subPartTemplateId === placement?.subPartTemplateId,
    );
    return owner ? (pick(owner).find((m) => m.id === ref.id) ?? null) : null;
  }
  const owner =
    entry.kind === 'subpart'
      ? part.subPartGameData.find((s) => s.subPartTemplateId === entry.templateId)
      : part.gameData;
  return owner ? (pick(owner).find((m) => m.id === ref.id) ?? null) : null;
}

/** How many in-game instances a module owned by `templateId` becomes (part-level ⇒ 1). */
function instanceCountOf(part: EditingPart, templateId: string | null): number {
  if (templateId === null) return 1;
  const count = part.placements.filter((p) => p.subPartTemplateId === templateId).length;
  return Math.max(count, 1);
}

/** Runs the ported physics for one chamber + nozzle pair, or returns why it could not. */
function predictPair(
  combustor: Combustor,
  nozzle: DeLavalNozzle,
  reactions: ReadonlyMap<string, ReactionData>,
): { performance: EnginePerformance; reactionName: string } | PerformanceUnavailable {
  const reaction = reactions.get(combustor.reactionId);
  if (!reaction) return { kind: 'no-catalog', reactionId: combustor.reactionId };
  const lut = resolveReactionLut(reaction, combustor.mixtureRatio);
  if (!lut) return { kind: 'no-ratio', reactionName: reaction.name };
  return {
    reactionName: reaction.name,
    performance: predictPerformance({
      lut,
      maxPressurePa: combustor.maxPressurePa,
      exitDiameterM: nozzle.exitDiameterM,
      areaRatio: nozzle.areaRatio,
      thermalEfficiency: combustor.thermalEfficiency,
      flowEfficiency: nozzle.flowEfficiency,
      expansionEfficiency: nozzle.expansionEfficiency,
    }),
  };
}

/** Sums a list of already-predicted pairs into the card's metric set. */
function aggregate(reactionName: string, pairs: PerformancePair[]): PerformanceResult {
  if (pairs.length === 0) return { kind: 'no-modules' };
  let thrustVacN = 0;
  let thrustSLN = 0;
  let massFlowRate = 0;
  let flowSeparationSeveritySL = 0;
  for (const pair of pairs) {
    thrustVacN += pair.performance.thrustVacN * pair.instanceCount;
    thrustSLN += pair.performance.thrustSLN * pair.instanceCount;
    massFlowRate += pair.performance.massFlowRate * pair.instanceCount;
    flowSeparationSeveritySL = Math.max(
      flowSeparationSeveritySL,
      pair.performance.flowSeparationSeveritySL,
    );
  }
  // Isp is a ratio, never a sum: ΣF / (g0·Σṁ). Summing the per-pair Isps would report a
  // two-chamber engine as twice as efficient as one chamber.
  const denominator = G0 * massFlowRate;
  return {
    kind: 'ok',
    reactionName,
    pairs,
    thrustVacN,
    thrustSLN,
    massFlowRate,
    ispVac: denominator > 0 ? thrustVacN / denominator : 0,
    ispSL: denominator > 0 ? thrustSLN / denominator : 0,
    throatDiameterM: pairs[0].performance.throatDiameterM,
    flowSeparationSeveritySL,
    optimumExpansionPa: pairs[0].performance.optimumExpansionPa,
  };
}

/**
 * The readout for one selection: a `<Rocket>` id, or {@link FIRST_PAIR_ROCKET} for the legacy
 * first-combustor + first-nozzle numbers.
 */
export function computePerformance(
  part: EditingPart,
  entry: EngineEntry | null,
  selection: string,
  reactions: ReadonlyMap<string, ReactionData>,
): PerformanceResult {
  if (!entry) return { kind: 'no-modules' };

  if (selection === FIRST_PAIR_ROCKET) {
    const owner =
      entry.kind === 'part'
        ? part.gameData
        : part.subPartGameData.find((s) => s.subPartTemplateId === entry.templateId);
    const combustor = owner?.combustors[0];
    const nozzle = owner?.nozzles[0];
    if (!combustor || !nozzle) return { kind: 'no-modules' };
    const predicted = predictPair(combustor, nozzle, reactions);
    if ('kind' in predicted) return predicted;
    return aggregate(predicted.reactionName, [
      {
        coreId: combustor.id,
        nozzleId: nozzle.id,
        // v1 parity: the legacy readout is per-thruster and never multiplied.
        instanceCount: 1,
        performance: predicted.performance,
      },
    ]);
  }

  const rocket = rocketsInScope(part, entry).find((r) => r.id === selection);
  if (!rocket) return { kind: 'no-modules' };

  // A solid core has no `<AreaRatio>` and its thrust is a CURVE, not a number — that is the
  // SolidThrustCurveCard's job (D7), so say so rather than reporting zeros.
  const solidCore = locate(part, entry, rocket.core, (o) => o.solidMotors) !== null;
  if (solidCore) return { kind: 'solid' };

  const core = locate(part, entry, rocket.core, (o) => o.combustors);
  if (!core) return { kind: 'no-modules' };

  const pairs: PerformancePair[] = [];
  let reactionName = '';
  for (const ref of rocket.nozzles) {
    const nozzle = locate(part, entry, ref, (o) => o.nozzles);
    if (!nozzle) return { kind: 'no-modules' };
    const predicted = predictPair(core, nozzle, reactions);
    if ('kind' in predicted) return predicted;
    reactionName = predicted.reactionName;
    pairs.push({
      coreId: core.id,
      nozzleId: nozzle.id,
      instanceCount: instanceCountOf(part, entry.kind === 'subpart' ? entry.templateId : null),
      performance: predicted.performance,
    });
  }
  return aggregate(reactionName, pairs);
}
