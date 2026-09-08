import type {
  EditingPart,
  FeedSource,
  Rocket,
  SolidMotor,
  SolidGrainSegment,
  SolidMotorNozzle,
  SubPartIdRef,
} from '../../ksa/types';
import type { ReactionData } from '../../ksa/reactionCatalog';
import { substanceIdOfPhase, type GrainGeometryTable } from '../../ksa/grainGeometryCatalog';
import { sampleThrustCurve, type ThrustCurveSample } from '../../ksa/solidMotorPhysics';
import type { EngineEntry } from '../../state/engineStore';
import { performanceSelection, rocketsInScope } from './performanceAggregation';

type Owner = EditingPart['gameData'] | EditingPart['subPartGameData'][number];
interface Location {
  owner: Owner;
  instanceId: string | null;
}
export interface SolidCurveTarget {
  motor: SolidMotor;
  location: Location;
  rocket: Rocket | null;
  rocketLocation: Location;
}

function locate(part: EditingPart, from: Location, ref: SubPartIdRef): Location | null {
  if (!ref.subPartInstanceId) return from;
  if (from.owner !== part.gameData) return null;
  const placement = part.placements.find((p) => p.instanceId === ref.subPartInstanceId);
  const owner = part.subPartGameData.find(
    (s) => s.subPartTemplateId === placement?.subPartTemplateId,
  );
  return owner ? { owner, instanceId: ref.subPartInstanceId } : null;
}

/** Selected rocket and concrete placement, using KSA's owner-relative SubPartIdReference. */
export function selectSolidCurveTarget(
  part: EditingPart,
  entry: EngineEntry | null,
  selection: string,
  instanceId: string | null,
): SolidCurveTarget | null {
  const owner =
    entry?.kind === 'part'
      ? part.gameData
      : part.subPartGameData.find(
          (s) => entry?.kind === 'subpart' && s.subPartTemplateId === entry.templateId,
        );
  if (!owner) return null;
  const rocketLocation = { owner, instanceId: entry?.kind === 'subpart' ? instanceId : null };
  const rockets = rocketsInScope(part, entry);
  const rocket = rockets.find((r) => r.id === performanceSelection(rockets, selection)) ?? null;
  const location = rocket ? locate(part, rocketLocation, rocket.core) : rocketLocation;
  const motor = rocket
    ? location?.owner.solidMotors.find((m) => m.id === rocket.core.id)
    : owner.solidMotors[0];
  return motor && location ? { motor, location, rocket, rocketLocation } : null;
}

/** PartTemplate.ResolveConsumerFeeds: instance wiring takes precedence over unscoped wiring. */
export function resolveSolidHardware(
  part: EditingPart,
  target: SolidCurveTarget,
):
  | {
      segments: SolidGrainSegment[];
      nozzles: { nozzle: SolidMotorNozzle; areaRatioMultiplier: number }[];
    }
  | { reason: string } {
  const segments = new Map<string, SolidGrainSegment>();
  let reason = '';
  function feed(source: FeedSource, location: Location) {
    if (source.kind === 'connector') {
      reason =
        'connector-fed grain stacks require an assembled vehicle; this Part alone cannot determine the burn.';
      return;
    }
    if (source.kind === 'parent') {
      reason = 'parent feed wiring is missing or recursively refers to Parent.';
      return;
    }
    const resolved = locate(part, location, {
      id: source.containerId,
      subPartInstanceId: source.subPartInstanceId,
    });
    const segment = resolved?.owner.solidGrainSegments.find((g) => g.id === source.containerId);
    if (!segment || !resolved) {
      reason = `grain container '${source.containerId}' cannot be resolved in its referenced scope.`;
      return;
    }
    segments.set(JSON.stringify([resolved.instanceId, segment.id]), segment);
  }
  for (const source of target.motor.feeds) {
    if (source.kind !== 'parent') {
      feed(source, target.location);
      continue;
    }
    const matching = part.gameData.consumerFeedWiring.filter(
      (w) => w.consumerId === target.motor.id,
    );
    const scoped = matching.filter(
      (w) => w.subPartInstanceId !== null && w.subPartInstanceId === target.location.instanceId,
    );
    const wiring = scoped.length ? scoped : matching.filter((w) => !w.subPartInstanceId);
    if (!wiring.length || !wiring.some((w) => w.feeds.length))
      reason = 'the motor has no matching ConsumerFeedWiring for its Parent feed.';
    for (const w of wiring)
      for (const source of w.feeds) feed(source, { owner: part.gameData, instanceId: null });
  }
  if (reason) return { reason };
  if (!segments.size) return { reason: 'the motor feeds from no grain segments.' };
  const nozzles: { nozzle: SolidMotorNozzle; areaRatioMultiplier: number }[] = [];
  for (const ref of target.rocket?.nozzles ?? []) {
    const location = locate(part, target.rocketLocation, ref);
    const nozzle = location?.owner.solidNozzles.find((n) => n.id === ref.id);
    if (!nozzle)
      return { reason: `solid nozzle '${ref.id}' cannot be resolved in its referenced scope.` };
    nozzles.push({ nozzle, areaRatioMultiplier: ref.areaRatioMultiplier });
  }
  if (!nozzles.length) return { reason: 'no Rocket binds this motor to a solid nozzle yet.' };
  return { segments: [...segments.values()], nozzles };
}

export function resolveSolidCurve(
  part: EditingPart,
  target: SolidCurveTarget,
  reactions: ReadonlyMap<string, ReactionData>,
  grains: readonly GrainGeometryTable[],
  grainIndex: ReadonlyMap<string, GrainGeometryTable>,
  densities: ReadonlyMap<string, number>,
): { curve: ThrustCurveSample | null; reason: string } {
  const { motor } = target;
  if (grains.length === 0) {
    return {
      curve: null,
      reason: 'the grain-profile library (GrainGeometries.xml) is not served in this build.',
    };
  }

  const reaction = reactions.get(motor.reactionId);
  if (!reaction || reaction.kind !== 'Fixed' || reaction.category !== 'Solid') {
    return { curve: null, reason: `'${motor.reactionId}' is not a known solid reaction.` };
  }
  if (
    !reaction.burnRate ||
    reaction.minimumBurnPressurePa == null ||
    reaction.maxStablePressurePa == null
  ) {
    return { curve: null, reason: `${reaction.name} has no burn-rate law to integrate.` };
  }

  // A custom propellant is authored as a `<FixedReaction>` and has no `<StorageDensity>`
  // anywhere — there is nothing to look up, and guessing one would produce a curve that
  // looks authoritative and is wrong.
  const phaseId = reaction.reactants[0]?.phaseId ?? '';
  const density = densities.get(substanceIdOfPhase(phaseId));
  if (!density) {
    return {
      curve: null,
      reason: `solid storage density for '${phaseId}' is unavailable.`,
    };
  }

  // `GrainGeometryLibrary.Default` is the first profile by name — what an omitted `<Grain Id>`
  // resolves to in game.
  const geometry = motor.grainGeometryId ? grainIndex.get(motor.grainGeometryId) : grains[0];
  if (!geometry) {
    return { curve: null, reason: `grain profile '${motor.grainGeometryId}' is unknown.` };
  }

  const hardware = resolveSolidHardware(part, target);
  if ('reason' in hardware) return { curve: null, reason: hardware.reason };
  const segments = hardware.segments.map((segment) => ({
    outerRadiusM: segment.outerRadiusM,
    wallThicknessMm: segment.wallThicknessMm,
    lengthM: segment.lengthM,
    geometry,
  }));
  const nozzles = hardware.nozzles;

  const curve = sampleThrustCurve({
    lut: reaction.lut,
    thermalEfficiency: motor.thermalEfficiency,
    authoredChamberPressurePa: motor.defaultPressurePa,
    burnRate: reaction.burnRate,
    minimumBurnPressurePa: reaction.minimumBurnPressurePa,
    maxStablePressurePa: reaction.maxStablePressurePa,
    exhaustCondensedFraction: reaction.exhaustCondensedFraction ?? 0,
    storageDensityKgPerM3: density,
    segments,
    nozzles: nozzles.map(({ nozzle, areaRatioMultiplier }) => ({
      exitDiameterM: nozzle.exitDiameterM,
      flowEfficiency: nozzle.flowEfficiency,
      expansionEfficiency: nozzle.expansionEfficiency,
      areaRatioMultiplier,
    })),
  });
  return {
    curve,
    reason: curve
      ? ''
      : 'this stack never reaches its ignition pressure (try a bigger grain or a smaller nozzle).',
  };
}
