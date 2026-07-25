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

import { isCustomReactionExportable, KNOWN_REACTIONS } from './types'
import type {
  Combustor,
  EditingPart,
  FeedSource,
  ReactionCategory,
  Rocket,
  SolidMotor,
  SubPartIdRef,
} from './types'
import type { ReactionData } from './reactionCatalog'

/** `block` ⇒ KSA throws at load; `warn` ⇒ it loads but the part misbehaves. */
export type EngineIssueSeverity = 'block' | 'warn'

export interface EngineIssue {
  severity: EngineIssueSeverity
  /** Stable kebab-case code — the UI groups/tests match on this, not on the prose. */
  code: string
  message: string
}

/** What a reaction lookup needs to answer; a subset of {@link ReactionData}. */
interface ReactionFacts {
  category: ReactionCategory
  minimumBurnPressurePa: number | null
  maxStablePressurePa: number | null
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
  const live = reactions?.get(id)
  if (live) {
    return live.kind === 'Fixed'
      ? {
          category: live.category,
          minimumBurnPressurePa: live.minimumBurnPressurePa,
          maxStablePressurePa: live.maxStablePressurePa,
        }
      : { category: live.category, minimumBurnPressurePa: null, maxStablePressurePa: null }
  }
  const custom = part.customReactions.find((r) => r.id === id)
  if (custom) {
    return {
      category: custom.category,
      minimumBurnPressurePa: custom.minimumBurnPressurePa,
      maxStablePressurePa: custom.maxStablePressurePa,
    }
  }
  const known = KNOWN_REACTIONS.find((k) => k.id === id)
  // The static snapshot carries no pressure limits — category-only checks still run.
  return known
    ? { category: known.category, minimumBurnPressurePa: null, maxStablePressurePa: null }
    : null
}

/** A consumer (`RocketCore`) located at a specific scope on the part. */
interface LocatedConsumer {
  id: string
  /** Placement instanceId it lives on; null ⇒ the root part. */
  subPartInstanceId: string | null
  isSolid: boolean
  feeds: FeedSource[]
  /** Combustors only — solid motors have no `<Plumbing>` (they feed from grain). */
  combustor: Combustor | null
  solidMotor: SolidMotor | null
}

/** Every combustor + solid motor on the part, part-level and per placed SubPart. */
function locateConsumers(part: EditingPart): LocatedConsumer[] {
  const out: LocatedConsumer[] = []
  const add = (
    id: string,
    scope: string | null,
    combustor: Combustor | null,
    solidMotor: SolidMotor | null,
  ) => {
    out.push({
      id,
      subPartInstanceId: scope,
      isSolid: solidMotor != null,
      feeds: (combustor ?? solidMotor)!.feeds,
      combustor,
      solidMotor,
    })
  }
  for (const c of part.gameData.combustors) add(c.id, null, c, null)
  for (const m of part.gameData.solidMotors) add(m.id, null, null, m)
  for (const placement of part.placements) {
    const spd = part.subPartGameData.find(
      (s) => s.subPartTemplateId === placement.subPartTemplateId,
    )
    if (!spd) continue
    for (const c of spd.combustors) add(c.id, placement.instanceId, c, null)
    for (const m of spd.solidMotors) add(m.id, placement.instanceId, null, m)
  }
  return out
}

/** Nozzle ids on the part, split by family (a `<Nozzle Id>` may name either). */
function locateNozzles(part: EditingPart): { liquid: Set<string>; solid: Set<string> } {
  const liquid = new Set<string>()
  const solid = new Set<string>()
  for (const n of part.gameData.nozzles) liquid.add(n.id)
  for (const n of part.gameData.solidNozzles) solid.add(n.id)
  for (const spd of part.subPartGameData) {
    for (const n of spd.nozzles) liquid.add(n.id)
    for (const n of spd.solidNozzles) solid.add(n.id)
  }
  return { liquid, solid }
}

/** Container ids addressable within a given scope (null ⇒ the root part's own). */
function containersInScope(part: EditingPart, subPartInstanceId: string | null): Set<string> {
  const ids = new Set<string>()
  if (subPartInstanceId === null) {
    for (const t of part.gameData.tanks) if (t.id.trim()) ids.add(t.id)
    for (const g of part.gameData.solidGrainSegments) if (g.id.trim()) ids.add(g.id)
    return ids
  }
  const placement = part.placements.find((p) => p.instanceId === subPartInstanceId)
  if (!placement) return ids
  const spd = part.subPartGameData.find((s) => s.subPartTemplateId === placement.subPartTemplateId)
  if (!spd) return ids
  for (const t of spd.tanks) if (t.id.trim()) ids.add(t.id)
  for (const g of spd.solidGrainSegments) if (g.id.trim()) ids.add(g.id)
  return ids
}

/** True when the rocket's `<Core Id>` resolves to a solid motor rather than a combustor. */
function coreIsSolid(rocket: Rocket, consumers: LocatedConsumer[]): boolean | null {
  const match = consumers.find((c) => matchesRef(c.id, c.subPartInstanceId, rocket.core))
  return match ? match.isSolid : null
}

/** KSA's `SubPartIdReference` match: same template id, and same scope (empty ⇒ root). */
function matchesRef(id: string, scope: string | null, ref: SubPartIdRef): boolean {
  return id === ref.id && (ref.subPartInstanceId ?? null) === scope
}

/**
 * Validates a part's engine + plumbing data against the rules KSA enforces at load.
 * Returns every issue found, blocking ones first.
 */
export function validateEngines(
  part: EditingPart,
  reactions?: ReadonlyMap<string, ReactionData>,
): EngineIssue[] {
  const issues: EngineIssue[] = []
  const block = (code: string, message: string) => issues.push({ severity: 'block', code, message })
  const warn = (code: string, message: string) => issues.push({ severity: 'warn', code, message })

  const consumers = locateConsumers(part)
  const nozzles = locateNozzles(part)
  const connectors = new Map(part.connectors.map((c) => [c.id, c]))
  const rockets = [...part.gameData.rockets, ...part.subPartGameData.flatMap((s) => s.rockets)]

  // --- Rocket assembly (RocketTemplate.Create — all THROW) ---
  for (const rocket of rockets) {
    const solidCore = coreIsSolid(rocket, consumers)
    if (solidCore === null) continue // unknown core: not a solid/liquid question
    for (const n of rocket.nozzles) {
      const isSolidNozzle = nozzles.solid.has(n.id)
      const isLiquidNozzle = nozzles.liquid.has(n.id)
      if (!isSolidNozzle && !isLiquidNozzle) continue // unresolvable id — a different bug
      if (solidCore !== isSolidNozzle) {
        block(
          'rocket-mixes-solid-and-liquid',
          `KSA throws: Rocket ${rocket.id} mixes solid and liquid components — core ` +
            `${rocket.core.id} is ${solidCore ? 'solid' : 'liquid'} but nozzle ${n.id} is ` +
            `${isSolidNozzle ? 'solid' : 'liquid'}.`,
        )
      }
    }
    if (solidCore && rocket.nozzles.length === 0) {
      block(
        'solid-rocket-needs-nozzle',
        `KSA throws: Solid motor rocket ${rocket.id} needs at least one nozzle.`,
      )
    }
  }

  // --- Thruster controllers may not drive a solid motor (RocketThrusterControllerTemplate.Create) ---
  for (const controller of part.gameData.rocketControllers) {
    if (controller.kind !== 'thruster') continue
    for (const ref of controller.rocketRefs) {
      const rocket = rockets.find((r) => r.id === ref.id)
      if (!rocket || coreIsSolid(rocket, consumers) !== true) continue
      block(
        'solid-motor-on-thruster-controller',
        `KSA throws: Solid motor ${rocket.core.id} cannot be driven by thruster controller ` +
          `${controller.id}.`,
      )
    }
  }

  // --- Solid motor reaction + pressure (SolidMotorTemplate.Create — both THROW) ---
  for (const c of consumers) {
    const motor = c.solidMotor
    if (!motor) continue
    const facts = reactionFacts(motor.reactionId, part, reactions)
    if (facts && facts.category !== 'Solid') {
      block(
        'solid-motor-needs-solid-reaction',
        `KSA throws: Solid motor ${motor.id} requires a solid reaction; got ` +
          `${motor.reactionId} (${facts.category}).`,
      )
    }
    // KSA: throws when pressure <= MinimumBurnPressure or > MaxStablePressure.
    const min = facts?.minimumBurnPressurePa
    const max = facts?.maxStablePressurePa
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
      )
    }
  }

  // --- Solid reactions KSA refuses to load (FixedReactionTemplate.Create) ---
  for (const reaction of part.customReactions) {
    if (isCustomReactionExportable(reaction)) continue
    block(
      'solid-reaction-incomplete',
      `KSA throws: solid reaction ${reaction.id} needs a burn-rate law (a > 0, 0 <= n < 0.95), ` +
        `a minimum burn pressure > 0, a max stable pressure above it, and an exhaust ` +
        `condensed fraction in [0, 1). It will be omitted from the export.`,
    )
  }

  // --- Feed resolution (PartTemplate.AddResolvedFeed / ResolveConsumerFeeds — all LOG) ---
  for (const c of consumers) {
    for (const f of c.feeds) {
      if (f.kind === 'container') {
        // A SubPart= scope re-roots the lookup; otherwise it's the consumer's own owner.
        const scope = f.subPartInstanceId ?? c.subPartInstanceId
        if (!containersInScope(part, scope).has(f.containerId)) {
          warn(
            'feed-unknown-container',
            `KSA logs: consumer ${c.id} feeds from unknown container '${f.containerId}'` +
              `${scope ? ` on ${scope}` : ''} — it will get nothing from it.`,
          )
        }
      } else if (f.kind === 'connector') {
        const connector = connectors.get(f.connectorId)
        if (!connector) {
          warn(
            'feed-unknown-connector',
            `KSA logs: consumer ${c.id} feeds from unknown connector '${f.connectorId}'.`,
          )
          continue
        }
        // A connection carries a resource only when BOTH ends declare the capability
        // (ConnectorCapabilityExtensions.Intersect). Bulk needs BulkFluid; Service rides
        // the implicit default, so only Bulk is checked here.
        if (c.combustor?.plumbing === 'Bulk' && !connector.capabilities.includes('BulkFluid')) {
          warn(
            'feed-connector-missing-bulkfluid',
            `Add BulkFluid to connector ${f.connectorId} or combustor ${c.id} gets no propellant ` +
              `across it (Bulk plumbing needs the BulkFluid capability at both ends).`,
          )
        }
        if (c.solidMotor && !connector.capabilities.includes('SolidMotorCase')) {
          warn(
            'feed-connector-missing-solidmotorcase',
            `Add SolidMotorCase to connector ${f.connectorId} so grain segments can stack onto ` +
              `solid motor ${c.id}.`,
          )
        }
      } else if (c.subPartInstanceId !== null) {
        // <FeedsFrom Parent="true"/> on a placed SubPart needs a matching wiring entry
        // (instance-scoped wins, unscoped is the fallback).
        const wired = part.gameData.consumerFeedWiring.some(
          (w) =>
            w.consumerId === c.id &&
            (w.subPartInstanceId === c.subPartInstanceId || w.subPartInstanceId === null),
        )
        if (!wired) {
          warn(
            'consumer-not-wired',
            `KSA logs: consumer ${c.id} feeds from its parent part, but ${part.partId} has no ` +
              `ConsumerFeedWiring wiring for it — it will reach no propellant.`,
          )
        }
      }
    }
    if (c.feeds.length === 0) {
      warn(
        'consumer-no-feeds',
        `KSA logs: rocket core ${c.id} declares no FeedsFrom feed points; it will reach no ` +
          `propellant (and produce no thrust).`,
      )
    }
  }

  return [
    ...issues.filter((i) => i.severity === 'block'),
    ...issues.filter((i) => i.severity === 'warn'),
  ]
}
