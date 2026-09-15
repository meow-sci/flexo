/**
 * Pre-flight validation for the engine + plumbing data flexo exports (KSA 2026.7.9).
 *
 * Two severities, and the difference is what KSA does with the mod:
 *  - **block** — KSA THROWS at load. The whole mod fails, so flexo must not ship it.
 *  - **warn**  — KSA loads but logs an error, and the part misbehaves in-game (usually
 *    "reaches no propellant", i.e. an engine that silently makes no thrust).
 *
 * Every check names the game-side member it mirrors, so a future KSA update can be
 * re-verified against the decomp rather than against this file's prose.
 *
 * Pure: no stores, no React. `reactions` is injected so the module stays testable
 * without the private asset tree (and so a modded reaction library validates too).
 */

import { isCustomReactionExportable, KNOWN_REACTIONS, VOLUMETRIC_EXHAUST_IDS } from './types';
import type {
  Combustor,
  EditingPart,
  FeedSource,
  ReactionCategory,
  Rocket,
  SolidMotor,
  SolidMotorNozzle,
  SubPartIdRef,
} from './types';
import type { ReactionData } from './reactionCatalog';

/**
 * How far `|ExhaustDirection|` may drift from 1 before it is called out. Generous enough to
 * absorb the rounding in `formatG6`-serialized unit vectors, tight enough to catch a real
 * mis-scaled axis. Shared with the nozzle editor's inline warning so the two can't disagree.
 */
export const UNIT_EPSILON = 1e-3;

/** `block` ⇒ KSA throws at load; `warn` ⇒ it loads but the part misbehaves. */
export type EngineIssueSeverity = 'block' | 'warn';

/**
 * Which authoring surface an issue belongs to. **Editor metadata only** — it exists so the
 * Data/Engine findings pipeline can scope + scroll to the offending card (design
 * design-data-engine-modes.md §A7, D4). It is NOT part of the game contract: no code,
 * message or severity depends on it.
 */
export interface EngineIssueSource {
  /** The SubPart template that owns the module; `null` ⇒ part-level (`<PartGameData>`). */
  templateId: string | null;
  module?:
    | 'combustor'
    | 'nozzle'
    | 'solidMotor'
    | 'solidNozzle'
    | 'grain'
    | 'rocket'
    | 'controller'
    | 'wiring'
    | 'gimbal'
    | 'propellant';
  /** Index within that module list, when the surface can address one card. */
  index?: number;
}

export interface EngineIssue {
  severity: EngineIssueSeverity;
  /** Stable kebab-case code — the UI groups/tests match on this, not on the prose. */
  code: string;
  message: string;
  /** Editor-targeting metadata; see {@link EngineIssueSource}. */
  source?: EngineIssueSource;
}

/** What a reaction lookup needs to answer; a subset of {@link ReactionData}. */
interface ReactionFacts {
  kind: 'Fixed' | 'Mixture';
  reactantPhaseIds?: string[];
  hasBurnRate?: boolean;
  category: ReactionCategory;
  minimumBurnPressurePa: number | null;
  maxStablePressurePa: number | null;
}

/**
 * Resolves a reaction id to the facts the solid-motor checks need. Prefers the live
 * catalog, falls back to the part's own custom reactions, then to the static Core
 * snapshot. Returns null when nothing knows the id (checks then stay silent rather
 * than guessing — an unknown id is the reaction picker's problem, not ours).
 */
function reactionFacts(
  id: string,
  part: EditingPart,
  reactions: ReadonlyMap<string, ReactionData> | undefined,
): ReactionFacts | null {
  const live = reactions?.get(id);
  if (live) {
    return live.kind === 'Fixed'
      ? {
          kind: live.kind,
          reactantPhaseIds: live.reactants.map((r) => r.phaseId),
          hasBurnRate: live.burnRate !== null,
          category: live.category,
          minimumBurnPressurePa: live.minimumBurnPressurePa,
          maxStablePressurePa: live.maxStablePressurePa,
        }
      : {
          kind: live.kind,
          category: live.category,
          minimumBurnPressurePa: null,
          maxStablePressurePa: null,
        };
  }
  const custom = part.customReactions.find((r) => r.id === id);
  if (custom) {
    return {
      kind: 'Fixed',
      reactantPhaseIds: custom.reactants.map((r) => r.phaseId),
      hasBurnRate: custom.burnRate !== null,
      category: custom.category,
      minimumBurnPressurePa: custom.minimumBurnPressurePa,
      maxStablePressurePa: custom.maxStablePressurePa,
    };
  }
  const known = KNOWN_REACTIONS.find((k) => k.id === id);
  // The static snapshot carries no pressure limits — category-only checks still run.
  return known
    ? {
        kind: known.kind,
        category: known.category,
        minimumBurnPressurePa: null,
        maxStablePressurePa: null,
      }
    : null;
}

/** A consumer (`RocketCore`) located at a specific scope on the part. */
interface LocatedConsumer {
  id: string;
  /** Placement instanceId it lives on; null ⇒ the root part. */
  subPartInstanceId: string | null;
  /** The template whose `<SubPartGameData>` authors it; null ⇒ `<PartGameData>`. */
  subPartTemplateId: string | null;
  isSolid: boolean;
  feeds: FeedSource[];
  /** Combustors only — solid motors have no `<Plumbing>` (they feed from grain). */
  combustor: Combustor | null;
  solidMotor: SolidMotor | null;
}

/** Every combustor + solid motor on the part, part-level and per placed SubPart. */
function locateConsumers(part: EditingPart): LocatedConsumer[] {
  const out: LocatedConsumer[] = [];
  const add = (
    id: string,
    scope: string | null,
    templateId: string | null,
    combustor: Combustor | null,
    solidMotor: SolidMotor | null,
  ) => {
    out.push({
      id,
      subPartInstanceId: scope,
      subPartTemplateId: templateId,
      isSolid: solidMotor != null,
      feeds: (combustor ?? solidMotor)!.feeds,
      combustor,
      solidMotor,
    });
  };
  for (const c of part.gameData.combustors) add(c.id, null, null, c, null);
  for (const m of part.gameData.solidMotors) add(m.id, null, null, null, m);
  for (const placement of part.placements) {
    const spd = part.subPartGameData.find(
      (s) => s.subPartTemplateId === placement.subPartTemplateId,
    );
    if (!spd) continue;
    for (const c of spd.combustors) add(c.id, placement.instanceId, spd.subPartTemplateId, c, null);
    for (const m of spd.solidMotors)
      add(m.id, placement.instanceId, spd.subPartTemplateId, null, m);
  }
  return out;
}

/**
 * Every nozzle on the part with a human-readable scope, both flavors, both scopes. Typed as
 * {@link SolidMotorNozzle} because that IS the shared shape — a `DeLavalNozzle` is
 * structurally this plus `<AreaRatio>` — so one walk covers `RocketNozzleTemplate`'s fields.
 */
function locateNozzleModules(
  part: EditingPart,
): { nozzle: SolidMotorNozzle; scope: string; source: EngineIssueSource }[] {
  const out: { nozzle: SolidMotorNozzle; scope: string; source: EngineIssueSource }[] = [];
  part.gameData.nozzles.forEach((n, index) =>
    out.push({
      nozzle: n,
      scope: part.partId,
      source: { templateId: null, module: 'nozzle', index },
    }),
  );
  part.gameData.solidNozzles.forEach((n, index) =>
    out.push({
      nozzle: n,
      scope: part.partId,
      source: { templateId: null, module: 'solidNozzle', index },
    }),
  );
  for (const spd of part.subPartGameData) {
    spd.nozzles.forEach((n, index) =>
      out.push({
        nozzle: n,
        scope: spd.subPartTemplateId,
        source: { templateId: spd.subPartTemplateId, module: 'nozzle', index },
      }),
    );
    spd.solidNozzles.forEach((n, index) =>
      out.push({
        nozzle: n,
        scope: spd.subPartTemplateId,
        source: { templateId: spd.subPartTemplateId, module: 'solidNozzle', index },
      }),
    );
  }
  return out;
}

/** Container ids addressable within a given scope (null ⇒ the root part's own). */
function containersInScope(part: EditingPart, subPartInstanceId: string | null): Set<string> {
  const ids = new Set<string>();
  if (subPartInstanceId === null) {
    for (const t of part.gameData.tanks) if (t.id.trim()) ids.add(t.id);
    for (const g of part.gameData.solidGrainSegments) if (g.id.trim()) ids.add(g.id);
    return ids;
  }
  const placement = part.placements.find((p) => p.instanceId === subPartInstanceId);
  if (!placement) return ids;
  const spd = part.subPartGameData.find((s) => s.subPartTemplateId === placement.subPartTemplateId);
  if (!spd) return ids;
  for (const t of spd.tanks) if (t.id.trim()) ids.add(t.id);
  for (const g of spd.solidGrainSegments) if (g.id.trim()) ids.add(g.id);
  return ids;
}

/**
 * Whether a wiring entry's own feed point resolves — the `<ConsumerFeedWiring>` half of
 * `PartTemplate.AddResolvedFeed` (decomp: `KSA/PartTemplate.cs:494-580`). A wiring entry's
 * feeds are resolved against the PART (`AddResolvedFeed(item2, this, "", …)`), so an
 * unscoped container feed looks at `<PartGameData>`'s own containers and a `SubPart=`-scoped
 * one re-roots to that placement's template.
 */
function wiringFeedResolves(part: EditingPart, feed: FeedSource): boolean {
  if (feed.kind === 'parent') return false; // KSA forbids a wiring entry deferring to Parent
  if (feed.kind === 'connector') return part.connectors.some((c) => c.id === feed.connectorId);
  return containersInScope(part, feed.subPartInstanceId ?? null).has(feed.containerId);
}

/** One Rocket instance, with references relative to its owning Part/SubPart. */
interface LocatedRocket {
  rocket: Rocket;
  subPartInstanceId: string | null;
  source: EngineIssueSource;
}

/** KSA SubPartIdReference resolves an empty scope on the owner, otherwise its child. */
function matchesRef(
  id: string,
  scope: string | null,
  ref: SubPartIdRef,
  ownerScope: string | null = null,
): boolean {
  // flexo SubParts are flat: a SubPart has no nested children to resolve a scoped ref on.
  if (ownerScope !== null && ref.subPartInstanceId) return false;
  return id === ref.id && scope === (ref.subPartInstanceId || ownerScope);
}

function resolveCore(located: LocatedRocket, consumers: LocatedConsumer[]) {
  return consumers.find((c) =>
    matchesRef(c.id, c.subPartInstanceId, located.rocket.core, located.subPartInstanceId),
  );
}

/**
 * Validates a part's engine + plumbing data against the rules KSA enforces at load.
 * Returns every issue found, blocking ones first.
 */
export function validateEngines(
  part: EditingPart,
  reactions?: ReadonlyMap<string, ReactionData>,
): EngineIssue[] {
  const issues: EngineIssue[] = [];
  const block = (code: string, message: string, source?: EngineIssueSource) =>
    issues.push({ severity: 'block', code, message, source });
  const warn = (code: string, message: string, source?: EngineIssueSource) =>
    issues.push({ severity: 'warn', code, message, source });

  const consumers = locateConsumers(part);
  const nozzles = locateNozzleModules(part).flatMap((located) => {
    const scopes =
      located.source.templateId === null
        ? [null]
        : part.placements
            .filter((p) => p.subPartTemplateId === located.source.templateId)
            .map((p) => p.instanceId);
    return scopes.map((subPartInstanceId) => ({
      ...located,
      subPartInstanceId,
      isSolid: located.source.module === 'solidNozzle',
    }));
  });
  const connectors = new Map(part.connectors.map((c) => [c.id, c]));
  const rockets: LocatedRocket[] = [
    ...part.gameData.rockets.map((rocket, index) => ({
      rocket,
      subPartInstanceId: null,
      source: { templateId: null, module: 'rocket' as const, index },
    })),
    ...part.placements.flatMap((placement) => {
      const data = part.subPartGameData.find(
        (s) => s.subPartTemplateId === placement.subPartTemplateId,
      );
      return (data?.rockets ?? []).map((rocket, index) => ({
        rocket,
        subPartInstanceId: placement.instanceId,
        source: { templateId: placement.subPartTemplateId, module: 'rocket' as const, index },
      }));
    }),
  ];
  // Older saved documents can retain controllers as preserved XML. Include those
  // without converting them, alongside newly modeled controllers.
  const controllers = [
    ...part.gameData.rocketControllers.map((controller, index) => ({
      controller,
      subPartInstanceId: null as string | null,
      source: { templateId: null, module: 'controller', index } as EngineIssueSource,
    })),
    ...part.placements.flatMap((placement) => {
      const data = part.subPartGameData.find(
        (s) => s.subPartTemplateId === placement.subPartTemplateId,
      );
      return [
        ...(data?.rocketControllers ?? []).map((controller, index) => ({
          controller,
          subPartInstanceId: placement.instanceId,
          source: {
            templateId: placement.subPartTemplateId,
            module: 'controller',
            index,
          } as EngineIssueSource,
        })),
        ...(data?.unknownChildren ?? [])
          .filter(
            (node) =>
              node.tag === 'RocketEngineController' || node.tag === 'RocketThrusterController',
          )
          .map((node) => ({
            controller: {
              id: node.attrs.Id ?? '',
              kind: node.tag === 'RocketThrusterController' ? 'thruster' : 'engine',
              rocketRefs: node.children
                .filter((child) => child.tag === 'RocketReference')
                .map((ref) => ({
                  id: ref.attrs.Id ?? '',
                  subPartInstanceId: ref.attrs.SubPartId || null,
                })),
            },
            subPartInstanceId: placement.instanceId,
            // Passthrough controllers have no editable controller row in the module tree.
            source: { templateId: placement.subPartTemplateId } as EngineIssueSource,
          })),
      ];
    }),
  ];
  const controllerIds = new Set<string>();
  for (const { controller, subPartInstanceId, source } of controllers) {
    const key = JSON.stringify([subPartInstanceId, controller.id]);
    if (controllerIds.has(key)) {
      block(
        'duplicate-controller-id',
        `Controller ${controller.id} appears more than once in the same scope.`,
        source,
      );
    }
    controllerIds.add(key);
  }
  const referencedCores = new Set<LocatedConsumer>();
  const referencedNozzles = new Set<(typeof nozzles)[number]>();
  const drivenRockets = new Set<LocatedRocket>();

  // RocketTemplate.Create and SubPartIdReference.FindModuleById: all THROW.
  for (const located of rockets) {
    const { rocket, source } = located;
    const core = resolveCore(located, consumers);
    if (!core) {
      block(
        'rocket-core-unresolvable',
        `KSA throws: Rocket ${rocket.id} references unknown core ${rocket.core.id} in its declared scope.`,
        source,
      );
    } else {
      if (referencedCores.has(core)) {
        block(
          'core-used-by-multiple-rockets',
          `KSA throws: core ${core.id} is referenced by more than one Rocket.`,
          source,
        );
      }
      referencedCores.add(core);
    }
    for (const ref of rocket.nozzles) {
      const nozzle = nozzles.find((n) =>
        matchesRef(n.nozzle.id, n.subPartInstanceId, ref, located.subPartInstanceId),
      );
      if (!nozzle) {
        block(
          'rocket-nozzle-unresolvable',
          `KSA throws: Rocket ${rocket.id} references unknown nozzle ${ref.id} in its declared scope.`,
          source,
        );
        continue;
      }
      if (referencedNozzles.has(nozzle)) {
        block(
          'nozzle-used-by-multiple-rockets',
          `KSA throws: nozzle ${ref.id} is referenced by more than one Rocket.`,
          source,
        );
      }
      referencedNozzles.add(nozzle);
      if (core && core.isSolid !== nozzle.isSolid) {
        block(
          'rocket-mixes-solid-and-liquid',
          `KSA throws: Rocket ${rocket.id} mixes solid and liquid components — core ` +
            `${rocket.core.id} is ${core.isSolid ? 'solid' : 'liquid'} but nozzle ${ref.id} is ` +
            `${nozzle.isSolid ? 'solid' : 'liquid'}.`,
          source,
        );
      }
    }
    if (core?.isSolid && rocket.nozzles.length === 0) {
      block(
        'solid-rocket-needs-nozzle',
        `KSA throws: Solid motor rocket ${rocket.id} needs at least one nozzle.`,
        source,
      );
    }
  }

  controllers.forEach(({ controller, subPartInstanceId, source }) => {
    for (const ref of controller.rocketRefs) {
      const located = rockets.find((r) =>
        matchesRef(r.rocket.id, r.subPartInstanceId, ref, subPartInstanceId),
      );
      if (!located) {
        block(
          'controller-rocket-unresolvable',
          `KSA throws: controller ${controller.id} references unknown Rocket ${ref.id} in its declared scope.`,
          source,
        );
        continue;
      }
      drivenRockets.add(located);
      if (controller.kind === 'thruster' && resolveCore(located, consumers)?.isSolid) {
        block(
          'solid-motor-on-thruster-controller',
          `KSA throws: Solid motor ${located.rocket.core.id} cannot be driven by thruster controller ${controller.id}.`,
          source,
        );
      }
    }
  });

  // --- Wiring parity with KSA rev 5091 (all LOG at Warning; scope/engines.md "5117") ---
  //
  // Five "wired up wrong" checks the game added in 5091. Every one of them LOADS and then
  // silently produces no thrust — exactly the class this validator exists for — so they are
  // `warn`, not `block`.

  // RocketControllerTemplate.OnDataLoad — "references no Rockets; it will drive nothing".
  controllers.forEach(({ controller, source }) => {
    if (controller.rocketRefs.length > 0) return;
    warn(
      'controller-no-rockets',
      `KSA logs: rocket controller ${controller.id} references no Rockets; it will drive nothing.`,
      source,
    );
  });

  // Rocket.OnFullPartCreated — "has core '…' but no nozzles; it will produce no thrust".
  // A SOLID core with no nozzle is already a `block` above (RocketTemplate.Create throws), so
  // this covers the liquid/unresolved case only.
  for (const located of rockets) {
    const { rocket, source } = located;
    if (rocket.nozzles.length > 0 || resolveCore(located, consumers)?.isSolid) continue;
    warn(
      'rocket-no-nozzles',
      `KSA logs: Rocket ${rocket.id} has core ${rocket.core.id} but no nozzles; it will ` +
        `produce no thrust.`,
      source,
    );
  }

  // RocketNozzle.OnFullPartCreated — "is referenced by no Rocket … will produce no thrust".
  for (const located of nozzles) {
    const { nozzle, scope, source } = located;
    if (referencedNozzles.has(located)) continue;
    warn(
      'nozzle-not-referenced',
      `KSA logs: nozzle ${nozzle.id} on ${scope} is referenced by no Rocket (no Rocket names ` +
        `it as a Nozzle); it will produce no thrust.`,
      source,
    );
  }

  // RocketCore.OnFullPartCreated — the two halves of the same check: a core no Rocket names,
  // and a core whose Rocket no controller drives ("it cannot be activated").
  for (const c of consumers) {
    const source: EngineIssueSource = {
      templateId: c.subPartTemplateId,
      module: c.isSolid ? 'solidMotor' : 'combustor',
    };
    if (!referencedCores.has(c)) {
      warn(
        'core-not-referenced',
        `KSA logs: rocket core ${c.id} is referenced by no Rocket (no Rocket names it as its ` +
          `Core); it will produce no thrust.`,
        source,
      );
      continue;
    }
    const driven = rockets.some((r) => resolveCore(r, consumers) === c && drivenRockets.has(r));
    if (driven) continue;
    warn(
      'core-not-referenced',
      `KSA logs: rocket core ${c.id} has no controller driving its Rocket (no ` +
        `RocketEngineController / RocketThrusterController references it); it cannot be activated.`,
      source,
    );
  }

  // PartTemplate.AddResolvedFeed, reached through a `<ConsumerFeedWiring>` entry — the wiring
  // side of "feeds from unknown container/connector". The consumer-side codes below cover a
  // consumer's OWN <FeedsFrom>; this covers the entries the Part answers `Parent="true"` with.
  part.gameData.consumerFeedWiring.forEach((entry, index) => {
    // An entry with NO feed points is the silent one: `consumer-not-wired` below is satisfied
    // by its mere existence, but `buildConsumerFeedWiringElement` drops it from the export
    // (KSA logs "wires no feed points" for one that reaches it), so the consumer ships
    // unwired and reaches no propellant. Without this the whole part validated clean.
    if (entry.feeds.length === 0) {
      warn(
        'wiring-entry-no-feeds',
        `The ConsumerFeedWiring entry for ${entry.consumerId || '(no consumer)'} wires no feed ` +
          `points — flexo omits it from the export, so ${entry.consumerId || 'that consumer'} ` +
          `still reaches no propellant. Add a feed point (a tank/grain container or a connector).`,
        { templateId: null, module: 'wiring', index },
      );
      return;
    }
    for (const feed of entry.feeds) {
      if (wiringFeedResolves(part, feed)) continue;
      const what =
        feed.kind === 'parent'
          ? 'a Parent feed (KSA forbids wiring that defers to Parent again)'
          : feed.kind === 'connector'
            ? `unknown connector '${feed.connectorId}'`
            : `unknown container '${feed.containerId}'`;
      warn(
        'wiring-feed-unresolvable',
        `KSA logs: the ConsumerFeedWiring entry for ${entry.consumerId || '(no consumer)'} ` +
          `feeds from ${what} — that feed point resolves to nothing, so it delivers no propellant.`,
        { templateId: null, module: 'wiring', index },
      );
    }
  });

  // CombustorTemplate.ResolveReaction requires an explicit ratio for mixture reactions.
  for (const consumer of consumers) {
    const combustor = consumer.combustor;
    if (!combustor || combustor.mixtureRatio !== null) continue;
    // Project-authored reactions are FixedReaction, including clones of mixtures.
    if (part.customReactions.some((r) => r.id === combustor.reactionId)) continue;
    const reaction =
      reactions?.get(combustor.reactionId) ??
      KNOWN_REACTIONS.find((r) => r.id === combustor.reactionId);
    if (reaction?.kind !== 'Mixture') continue;
    block(
      'combustor-mixture-ratio-required',
      `KSA throws: combustor ${combustor.id} must specify a MixtureRatio for mixture reaction ${combustor.reactionId}.`,
      { templateId: consumer.subPartTemplateId, module: 'combustor' },
    );
  }

  // --- Solid motor reaction + pressure (SolidMotorTemplate.Create — both THROW) ---
  for (const c of consumers) {
    const motor = c.solidMotor;
    if (!motor) continue;
    const motorSource: EngineIssueSource = {
      templateId: c.subPartTemplateId,
      module: 'solidMotor',
    };
    const facts = reactionFacts(motor.reactionId, part, reactions);
    if (facts && (facts.category !== 'Solid' || facts.kind !== 'Fixed')) {
      block(
        'solid-motor-needs-solid-reaction',
        `KSA throws: Solid motor ${motor.id} requires a solid reaction; got ` +
          `${motor.reactionId} (${facts.category}).`,
        motorSource,
      );
    }
    if (facts?.kind === 'Fixed' && facts.category === 'Solid') {
      if (facts.hasBurnRate === false) {
        block(
          'solid-motor-needs-burn-rate',
          `KSA throws: solid reaction ${motor.reactionId} driving motor ${motor.id} has no burn rate law.`,
          motorSource,
        );
      }
      // SubstanceTemplate.Create names every solid phase `${Id}(s)`; other phases
      // cannot be the single Solid instance required by SolidMotorTemplate.Create.
      const phases = facts.reactantPhaseIds;
      if (phases && (phases.length !== 1 || !phases[0].endsWith('(s)'))) {
        block(
          'solid-motor-needs-one-solid-reactant',
          `KSA throws: solid reaction ${motor.reactionId} driving motor ${motor.id} must have exactly one solid reactant.`,
          motorSource,
        );
      }
    }
    // KSA: throws when pressure <= MinimumBurnPressure or > MaxStablePressure.
    const min = facts?.minimumBurnPressurePa;
    const max = facts?.maxStablePressurePa;
    if (
      (min != null && motor.defaultPressurePa <= min) ||
      (max != null && motor.defaultPressurePa > max)
    ) {
      block(
        'solid-motor-pressure-out-of-range',
        `KSA throws: Solid motor ${motor.id} default pressure ` +
          `${(motor.defaultPressurePa / 1e5).toFixed(1)} bar is outside ${motor.reactionId}'s ` +
          `stable range (${min != null ? (min / 1e5).toFixed(1) : '?'} to ` +
          `${max != null ? (max / 1e5).toFixed(1) : '?'} bar).`,
        motorSource,
      );
    }
  }

  // AsmbVolumetricMassTemplate.GetMassFromVolume uses material, then positive density,
  // then positive mass, and throws when none is supplied. A material must be incompressible.
  for (const [templateId, grains] of [
    [null, part.gameData.solidGrainSegments],
    ...part.subPartGameData.map((s) => [s.subPartTemplateId, s.solidGrainSegments] as const),
  ] as const) {
    grains.forEach((grain, index) => {
      const source: EngineIssueSource = { templateId, module: 'grain', index };
      if (grain.wallMaterialId) {
        if (!grain.wallMaterialId.endsWith('(s)') && !grain.wallMaterialId.endsWith('(l)'))
          block(
            'grain-material-not-incompressible',
            `KSA throws: grain ${grain.id} casing material must be a solid or liquid phase.`,
            source,
          );
      } else if (
        !(grain.densityKgM3 != null && grain.densityKgM3 > 0) &&
        !(grain.massKg != null && grain.massKg > 0)
      ) {
        block(
          'grain-mass-unspecified',
          `KSA throws: grain ${grain.id} casing needs a material, positive density, or positive mass.`,
          source,
        );
      }
    });
  }

  // DeLavalNozzle.ComputeThroatArea substitutes exitArea when AreaRatio is NaN or <= 0.
  for (const { nozzle, source } of locateNozzleModules(part)) {
    if (!('areaRatio' in nozzle) || (nozzle.areaRatio as number) > 0) continue;
    warn(
      'nozzle-area-ratio-default',
      `Nozzle ${nozzle.id} has no positive area ratio — KSA uses 1, so its throat is as wide as its exit. Set the intended nozzle ratio.`,
      source,
    );
  }

  // --- Exhaust direction magnitude (RocketNozzle.ResetState + VehicleUpdateState) ---
  // KSA loads any Vector3Reference verbatim (no normalizing in RocketNozzleTemplate) and
  // then applies thrust as `TotalThrust * ThrustDirectionVehicleAsmb` — so the vector's
  // LENGTH is a silent thrust multiplier. It loads and runs, hence `warn`. Only the physics
  // vector: the FX pair is NormalizeOrZero()d by every consumer and stock ships non-unit
  // FX vectors deliberately.
  for (const { nozzle, scope, source } of locateNozzleModules(part)) {
    const len = Math.hypot(
      nozzle.exhaustDirection.x,
      nozzle.exhaustDirection.y,
      nozzle.exhaustDirection.z,
    );
    if (Math.abs(len - 1) <= UNIT_EPSILON) continue;
    warn(
      'nozzle-direction-not-unit',
      len > 0
        ? `Nozzle ${nozzle.id} on ${scope} has a non-unit ExhaustDirection (length ` +
            `${len.toFixed(4)}) — KSA applies thrust unnormalized, so it will produce ` +
            `${len.toFixed(2)}× its rated thrust.`
        : `Nozzle ${nozzle.id} on ${scope} has a zero-length ExhaustDirection — it will ` +
            `apply no thrust.`,
      source,
    );
  }

  // --- Volumetric exhaust references (VolumetricExhaustReference.Load) ---
  // The current Core asset `ExhaustAssets.xml` owns this id catalog. KSA leaves an unknown
  // reference unresolved (the part still loads, but its plume is absent), so this is a warning
  // and accepts mod-provided ids by keeping the check limited to the current Core snapshot.
  const volumetricExhaustIds = new Set(VOLUMETRIC_EXHAUST_IDS);
  for (const { nozzle, source } of locateNozzleModules(part)) {
    for (const plume of nozzle.reactionPlumes) {
      const id = plume.volumetricExhaustId;
      if (!id || volumetricExhaustIds.has(id)) continue;
      warn(
        'nozzle-volumetric-exhaust-unknown',
        `Nozzle ${nozzle.id} references volumetric exhaust '${id}', which is not in current ` +
          `Core ExhaustAssets.xml. Without a mod that defines it, KSA cannot render this plume; ` +
          `choose one of the current Core templates.`,
        source,
      );
    }
  }

  // --- Gimbals (Gimbal.cs / GimbalController.RecomputeStaticData, decomp 2026.7.9) ---
  //
  // A `<Gimbal>` deflects the SubPart INSTANCE it sits on, and vectors only the nozzles that
  // same SubPart carries (`RecomputeStaticData` walks `Gimbal.Parent.Modules.Get<RocketNozzle>()`).
  // Both checks below LOAD fine and then vector nothing, which is the whole point of warning.
  part.gameData.gimbals.forEach((gimbal, index) => {
    const gimbalSource: EngineIssueSource = { templateId: null, module: 'gimbal', index };
    if (gimbal.maxAngleYDeg === 0 && gimbal.maxAngleZDeg === 0) {
      warn(
        'gimbal-cannot-actuate',
        `Gimbal on ${gimbal.subPartInstanceId} has both max angles at 0° — KSA's ` +
          `Gimbal.CanActuate() is false, so it is not even built. Give it a max angle.`,
        gimbalSource,
      );
      return;
    }
    const placement = part.placements.find((p) => p.instanceId === gimbal.subPartInstanceId);
    if (!placement) return; // a dangling instance id is a different bug
    const spd = part.subPartGameData.find(
      (sp) => sp.subPartTemplateId === placement.subPartTemplateId,
    );
    const nozzles = [...(spd?.nozzles ?? []), ...(spd?.solidNozzles ?? [])];
    if (nozzles.length === 0) {
      warn(
        'gimbal-vectors-nothing',
        `Gimbal on ${gimbal.subPartInstanceId} sits on a SubPart that carries no nozzles, so it ` +
          `vectors nothing (KSA collects a gimbal's nozzles from its OWN SubPart). Move it to ` +
          `the placement the engine's nozzle lives on, or remove it.`,
        gimbalSource,
      );
      return;
    }
    // KSA deflects about the SubPart's local Y and Z, and sizes the TVC authority with
    // `new float3(0, sin(MaxAngleY), sin(MaxAngleZ))` — a zero X component, i.e. the model
    // assumes thrust runs along the SubPart's local X. A thrust axis along local Y or Z makes
    // one of the two rotations a roll about the thrust vector, which vectors nothing.
    for (const nozzle of nozzles) {
      const d = nozzle.exhaustDirection;
      const len = Math.hypot(d.x, d.y, d.z);
      if (len < UNIT_EPSILON) continue; // the zero-length case has its own finding
      if (Math.abs(d.x) / len >= 0.5) continue;
      warn(
        'gimbal-thrust-axis-not-x',
        `Gimbal on ${gimbal.subPartInstanceId} vectors nozzle ${nozzle.id}, whose ` +
          `ExhaustDirection is not along the SubPart's local X — KSA deflects about local Y and ` +
          `Z and sizes gimbal authority assuming thrust runs along local X, so at least one ` +
          `axis of this gimbal will do nothing. Aim the nozzle along ±X in the SubPart's own ` +
          `frame and rotate the PLACEMENT to point the engine.`,
        gimbalSource,
      );
      break;
    }
  });

  // --- Solid reactions KSA refuses to load (FixedReactionTemplate.Create) ---
  part.customReactions.forEach((reaction, index) => {
    if (isCustomReactionExportable(reaction)) return;
    block(
      'solid-reaction-incomplete',
      `KSA throws: solid reaction ${reaction.id} needs a burn-rate law (a > 0, 0 <= n < 0.95), ` +
        `a minimum burn pressure > 0, a max stable pressure above it, and an exhaust ` +
        `condensed fraction in [0, 1). It will be omitted from the export.`,
      { templateId: null, module: 'propellant', index },
    );
  });

  // --- Feed resolution (PartTemplate.AddResolvedFeed / ResolveConsumerFeeds — all LOG) ---
  for (const c of consumers) {
    // The card the finding belongs to: the consumer's own editor (combustor or solid motor)
    // in its owning scope. `consumer-not-wired` is the exception — the fix lives on the
    // PART's `<ConsumerFeedWiring>` list, so it points there instead.
    const feedSource: EngineIssueSource = {
      templateId: c.subPartTemplateId,
      module: c.isSolid ? 'solidMotor' : 'combustor',
    };
    for (const f of c.feeds) {
      if (f.kind === 'container') {
        // A SubPart= scope re-roots the lookup; otherwise it's the consumer's own owner.
        const scope = f.subPartInstanceId ?? c.subPartInstanceId;
        if (!containersInScope(part, scope).has(f.containerId)) {
          warn(
            'feed-unknown-container',
            `KSA logs: consumer ${c.id} feeds from unknown container '${f.containerId}'` +
              `${scope ? ` on ${scope}` : ''} — it will get nothing from it.`,
            feedSource,
          );
        }
      } else if (f.kind === 'connector') {
        const connector = connectors.get(f.connectorId);
        if (!connector) {
          warn(
            'feed-unknown-connector',
            `KSA logs: consumer ${c.id} feeds from unknown connector '${f.connectorId}'.`,
            feedSource,
          );
          continue;
        }
        // A connection carries a resource only when BOTH ends declare the capability
        // (ConnectorCapabilityExtensions.Intersect). Bulk needs BulkFluid; Service rides
        // the implicit default, so only Bulk is checked here.
        if (c.combustor?.plumbing === 'Bulk' && !connector.capabilities.includes('BulkFluid')) {
          warn(
            'feed-connector-missing-bulkfluid',
            `Add BulkFluid to connector ${f.connectorId} or combustor ${c.id} gets no propellant ` +
              `across it (Bulk plumbing needs the BulkFluid capability at both ends).`,
            feedSource,
          );
        }
        if (c.solidMotor && !connector.capabilities.includes('SolidMotorCase')) {
          warn(
            'feed-connector-missing-solidmotorcase',
            `Add SolidMotorCase to connector ${f.connectorId} so grain segments can stack onto ` +
              `solid motor ${c.id}.`,
            feedSource,
          );
        }
      } else if (c.subPartInstanceId !== null) {
        // <FeedsFrom Parent="true"/> on a placed SubPart needs a matching wiring entry
        // (instance-scoped wins, unscoped is the fallback).
        const wired = part.gameData.consumerFeedWiring.some(
          (w) =>
            w.consumerId === c.id &&
            (w.subPartInstanceId === c.subPartInstanceId || w.subPartInstanceId === null),
        );
        if (!wired) {
          warn(
            'consumer-not-wired',
            `KSA logs: consumer ${c.id} feeds from its parent part, but ${part.partId} has no ` +
              `ConsumerFeedWiring wiring for it — it will reach no propellant.`,
            { templateId: null, module: 'wiring' },
          );
        }
      }
    }
    if (c.feeds.length === 0) {
      warn(
        'consumer-no-feeds',
        `KSA logs: rocket core ${c.id} declares no FeedsFrom feed points; it will reach no ` +
          `propellant (and produce no thrust).`,
        feedSource,
      );
    }
  }

  return [
    ...issues.filter((i) => i.severity === 'block'),
    ...issues.filter((i) => i.severity === 'warn'),
  ];
}
