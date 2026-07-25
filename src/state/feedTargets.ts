/**
 * Derivations that answer "what can a `<FeedsFrom>` / `<ConsumerFeedWiring>` point AT on
 * this Part?" — the pickable options behind the plumbing UI (KSA 2026.7.9).
 *
 * Pure functions over {@link EditingPart}, kept out of the component files so React Fast
 * Refresh stays intact (a module that exports both components and helpers loses it).
 */

import type { EditingPart } from '../ksa/types'

/** One selectable feed container: a `<Tank Id>` or a `<SolidGrainSegment Id>`. */
export interface FeedContainerOption {
  /** The container's `Id` (what `<FeedsFrom Container>` names). */
  id: string
  /** Human label, e.g. "Fuel (part)" or "Grain (EngineAssembly1)". */
  label: string
  /** Placement instanceId the container lives on; null ⇒ the owning template. */
  subPartInstanceId: string | null
}

/** One selectable consumer: a combustor / solid motor on the part or on a placed SubPart. */
export interface ConsumerOption {
  /** The consumer's TEMPLATE id (what `<ConsumerFeedWiring Id>` names). */
  consumerId: string
  /** The placement carrying it; null ⇒ the root part. */
  subPartInstanceId: string | null
  label: string
  /** True when it declares `<FeedsFrom Parent="true"/>` and so NEEDS a wiring entry. */
  defersToParent: boolean
}

/**
 * Every target a `<FeedsFrom>` on this Part can name: its connector ids, and every
 * addressable container at the part level or on a placed SubPart.
 *
 * A container with a blank `Id` is skipped — KSA resolves feeds against
 * `PartTemplate.Components[].Id` (`PartTemplate.AddResolvedFeed`), so an unnamed
 * container simply cannot be addressed.
 */
export function feedTargetsOf(part: EditingPart): {
  connectorIds: string[]
  containers: FeedContainerOption[]
} {
  const containers: FeedContainerOption[] = []
  const push = (id: string, subPartInstanceId: string | null, scope: string) => {
    if (id.trim()) containers.push({ id, label: `${id} (${scope})`, subPartInstanceId })
  }
  for (const t of part.gameData.tanks) push(t.id, null, 'part')
  for (const s of part.gameData.solidGrainSegments) push(s.id, null, 'part')
  // A SubPart's containers are addressed THROUGH the placement that carries them
  // (`<FeedsFrom SubPart=… Container=…>`), so one template placed twice yields two
  // distinct feed targets.
  for (const placement of part.placements) {
    const spd = part.subPartGameData.find(
      (s) => s.subPartTemplateId === placement.subPartTemplateId,
    )
    if (!spd) continue
    for (const t of spd.tanks) push(t.id, placement.instanceId, placement.instanceId)
    for (const s of spd.solidGrainSegments) push(s.id, placement.instanceId, placement.instanceId)
  }
  return { connectorIds: part.connectors.map((c) => c.id), containers }
}

/** Every consumer this Part carries, part-level and on each placed SubPart. */
export function consumerOptionsOf(part: EditingPart): ConsumerOption[] {
  const out: ConsumerOption[] = []
  const push = (
    id: string,
    subPartInstanceId: string | null,
    defersToParent: boolean,
    scope: string,
  ) => {
    if (!id.trim()) return
    out.push({ consumerId: id, subPartInstanceId, defersToParent, label: `${id} (${scope})` })
  }
  for (const c of [...part.gameData.combustors, ...part.gameData.solidMotors]) {
    push(
      c.id,
      null,
      c.feeds.some((f) => f.kind === 'parent'),
      'part',
    )
  }
  for (const placement of part.placements) {
    const spd = part.subPartGameData.find(
      (s) => s.subPartTemplateId === placement.subPartTemplateId,
    )
    if (!spd) continue
    for (const c of [...spd.combustors, ...spd.solidMotors]) {
      push(
        c.id,
        placement.instanceId,
        c.feeds.some((f) => f.kind === 'parent'),
        placement.instanceId,
      )
    }
  }
  return out
}

/**
 * SubPart-level consumers that defer to the parent but have NO matching wiring entry —
 * exactly what "Auto-wire unwired consumers" would add. Mirrors
 * `PartTemplate.ResolveConsumerFeeds`'s lookup: an instance-scoped entry wins, an
 * unscoped entry for the same consumer id is the fallback. Each one makes KSA log
 * *"Consumer X feeds from its parent part, but Y has no ConsumerFeedWiring wiring for it"*.
 */
export function unwiredConsumersOf(part: EditingPart): ConsumerOption[] {
  const wiring = part.gameData.consumerFeedWiring
  return consumerOptionsOf(part).filter(
    (c) =>
      c.defersToParent &&
      c.subPartInstanceId !== null &&
      !wiring.some(
        (w) =>
          w.consumerId === c.consumerId &&
          (w.subPartInstanceId === c.subPartInstanceId || w.subPartInstanceId === null),
      ),
  )
}
