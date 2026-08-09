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

import { isCustomReactionExportable, KNOWN_REACTIONS } from './types';
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
          category: live.category,
          minimumBurnPressurePa: live.minimumBurnPressurePa,
          maxStablePressurePa: live.maxStablePressurePa,
        }
      : { category: live.category, minimumBurnPressurePa: null, maxStablePressurePa: null };
  }
  const custom = part.customReactions.find((r) => r.id === id);
  if (custom) {
    return {
      category: custom.category,
      minimumBurnPressurePa: custom.minimumBurnPressurePa,
      maxStablePressurePa: custom.maxStablePressurePa,
    };
  }
  const known = KNOWN_REACTIONS.find((k) => k.id === id);
  // The static snapshot carries no pressure limits — category-only checks still run.
  return known
    ? { category: known.category, minimumBurnPressurePa: null, maxStablePressurePa: null }
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

/** Nozzle ids on the part, split by family (a `<Nozzle Id>` may name either). */
function locateNozzles(part: EditingPart): { liquid: Set<string>; solid: Set<string> } {
  const liquid = new Set<string>();
  const solid = new Set<string>();
  for (const n of part.gameData.nozzles) liquid.add(n.id);
  for (const n of part.gameData.solidNozzles) solid.add(n.id);
  for (const spd of part.subPartGameData) {
    for (const n of spd.nozzles) liquid.add(n.id);
    for (const n of spd.solidNozzles) solid.add(n.id);
  }
  return { liquid, solid };
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

/** True when the rocket's `<Core Id>` resolves to a solid motor rather than a combustor. */
function coreIsSolid(rocket: Rocket, consumers: LocatedConsumer[]): boolean | null {
  const match = consumers.find((c) => matchesRef(c.id, c.subPartInstanceId, rocket.core));
  return match ? match.isSolid : null;
}

/** KSA's `SubPartIdReference` match: same template id, and same scope (empty ⇒ root). */
function matchesRef(id: string, scope: string | null, ref: SubPartIdRef): boolean {
  return id === ref.id && (ref.subPartInstanceId ?? null) === scope;
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
  const nozzles = locateNozzles(part);
  const connectors = new Map(part.connectors.map((c) => [c.id, c]));
  const rockets: { rocket: Rocket; source: EngineIssueSource }[] = [
    ...part.gameData.rockets.map((rocket, index) => ({
      rocket,
      source: { templateId: null, module: 'rocket' as const, index },
    })),
    ...part.subPartGameData.flatMap((s) =>
      s.rockets.map((rocket, index) => ({
        rocket,
        source: { templateId: s.subPartTemplateId, module: 'rocket' as const, index },
      })),
    ),
  ];

  // --- Rocket assembly (RocketTemplate.Create — all THROW) ---
  for (const { rocket, source } of rockets) {
    const solidCore = coreIsSolid(rocket, consumers);
    if (solidCore === null) continue; // unknown core: not a solid/liquid question
    for (const n of rocket.nozzles) {
      const isSolidNozzle = nozzles.solid.has(n.id);
      const isLiquidNozzle = nozzles.liquid.has(n.id);
      if (!isSolidNozzle && !isLiquidNozzle) continue; // unresolvable id — a different bug
      if (solidCore !== isSolidNozzle) {
        block(
          'rocket-mixes-solid-and-liquid',
          `KSA throws: Rocket ${rocket.id} mixes solid and liquid components — core ` +
            `${rocket.core.id} is ${solidCore ? 'solid' : 'liquid'} but nozzle ${n.id} is ` +
            `${isSolidNozzle ? 'solid' : 'liquid'}.`,
          source,
        );
      }
    }
    if (solidCore && rocket.nozzles.length === 0) {
      block(
        'solid-rocket-needs-nozzle',
        `KSA throws: Solid motor rocket ${rocket.id} needs at least one nozzle.`,
        source,
      );
    }
  }

  // --- Wiring parity with KSA rev 5091 (all LOG at Warning; scope/engines.md "5117") ---
  //
  // Five "wired up wrong" checks the game added in 5091. Every one of them LOADS and then
  // silently produces no thrust — exactly the class this validator exists for — so they are
  // `warn`, not `block`.

  // A `<Rocket>` may be named by many controllers, and a nozzle/core by one rocket; build the
  // reverse indexes once. Matching is by ID only: KSA matches a full `SubPartIdReference`
  // (id + scope), but a scope mismatch is a DIFFERENT authoring mistake, and reporting
  // "referenced by nothing" for a nozzle that is plainly named would read as a false alarm.
  const nozzleIdsNamedByRockets = new Set(
    rockets.flatMap((r) => r.rocket.nozzles.map((n) => n.id)),
  );
  const coreIdsNamedByRockets = new Set(rockets.map((r) => r.rocket.core.id));
  const rocketIdsNamedByControllers = new Set(
    part.gameData.rocketControllers.flatMap((c) => c.rocketRefs.map((r) => r.id)),
  );

  // RocketControllerTemplate.OnDataLoad — "references no Rockets; it will drive nothing".
  part.gameData.rocketControllers.forEach((controller, index) => {
    if (controller.rocketRefs.length > 0) return;
    warn(
      'controller-no-rockets',
      `KSA logs: rocket controller ${controller.id} references no Rockets; it will drive nothing.`,
      { templateId: null, module: 'controller', index },
    );
  });

  // Rocket.OnFullPartCreated — "has core '…' but no nozzles; it will produce no thrust".
  // A SOLID core with no nozzle is already a `block` above (RocketTemplate.Create throws), so
  // this covers the liquid/unresolved case only.
  for (const { rocket, source } of rockets) {
    if (rocket.nozzles.length > 0 || coreIsSolid(rocket, consumers) === true) continue;
    warn(
      'rocket-no-nozzles',
      `KSA logs: Rocket ${rocket.id} has core ${rocket.core.id} but no nozzles; it will ` +
        `produce no thrust.`,
      source,
    );
  }

  // RocketNozzle.OnFullPartCreated — "is referenced by no Rocket … will produce no thrust".
  for (const { nozzle, scope, source } of locateNozzleModules(part)) {
    if (nozzleIdsNamedByRockets.has(nozzle.id)) continue;
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
    if (!coreIdsNamedByRockets.has(c.id)) {
      warn(
        'core-not-referenced',
        `KSA logs: rocket core ${c.id} is referenced by no Rocket (no Rocket names it as its ` +
          `Core); it will produce no thrust.`,
        source,
      );
      continue;
    }
    const driven = rockets.some(
      (r) => r.rocket.core.id === c.id && rocketIdsNamedByControllers.has(r.rocket.id),
    );
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

  // --- Thruster controllers may not drive a solid motor (RocketThrusterControllerTemplate.Create) ---
  part.gameData.rocketControllers.forEach((controller, index) => {
    if (controller.kind !== 'thruster') return;
    for (const ref of controller.rocketRefs) {
      const rocket = rockets.find((r) => r.rocket.id === ref.id)?.rocket;
      if (!rocket || coreIsSolid(rocket, consumers) !== true) continue;
      block(
        'solid-motor-on-thruster-controller',
        `KSA throws: Solid motor ${rocket.core.id} cannot be driven by thruster controller ` +
          `${controller.id}.`,
        { templateId: null, module: 'controller', index },
      );
    }
  });

  // --- Solid motor reaction + pressure (SolidMotorTemplate.Create — both THROW) ---
  for (const c of consumers) {
    const motor = c.solidMotor;
    if (!motor) continue;
    const motorSource: EngineIssueSource = {
      templateId: c.subPartTemplateId,
      module: 'solidMotor',
    };
    const facts = reactionFacts(motor.reactionId, part, reactions);
    if (facts && facts.category !== 'Solid') {
      block(
        'solid-motor-needs-solid-reaction',
        `KSA throws: Solid motor ${motor.id} requires a solid reaction; got ` +
          `${motor.reactionId} (${facts.category}).`,
        motorSource,
      );
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
