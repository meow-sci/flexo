/**
 * Id-space remapping for KSA 2026.7.9 plumbing topology.
 *
 * Importing a built-in Part (or pasting a project) REGENERATES every instance id and
 * connector id so they can't collide with what's already in the project. Anything that
 * references those ids by literal string must be rewritten in the same pass or it silently
 * points at nothing — or, worse, at a DIFFERENT entity that happens to have taken the id.
 *
 * `<FeedsFrom>` and `<ConsumerFeedWiring>` are exactly that kind of reference, so these
 * helpers are shared by both import paths (`editorStore.applyImportedGameData` and
 * `projectTransfer.mergeGameData`). They live here rather than in either caller because
 * `editorStore` already imports `projectTransfer` — the reverse edge would be a cycle.
 *
 * The unmapped-id policy matches {@link import('./partXmlParser').remapRawConnectorRefs}:
 * an id with no mapping is LEFT AS-IS. A partial import can't be pruned safely, and a
 * whole-Part import maps every id the references can legitimately name.
 */

import type { ConsumerFeedWiring, FeedSource } from './types'

/**
 * Remaps one feed point: a connector feed's `connectorId` through `connectorIdMap`, a
 * container feed's `subPartInstanceId` through `idMap`. The `containerId` is a
 * template-local `Components` id (`<Tank Id>` / `<SolidGrainSegment Id>`) that import
 * never regenerates, so it passes through untouched. `{ kind: 'parent' }` names nothing.
 */
export function remapFeed(
  f: FeedSource,
  connectorIdMap: ReadonlyMap<string, string>,
  idMap: ReadonlyMap<string, string>,
): FeedSource {
  if (f.kind === 'connector') {
    return { kind: 'connector', connectorId: connectorIdMap.get(f.connectorId) ?? f.connectorId }
  }
  if (f.kind === 'container') {
    return {
      kind: 'container',
      containerId: f.containerId,
      subPartInstanceId: f.subPartInstanceId
        ? (idMap.get(f.subPartInstanceId) ?? f.subPartInstanceId)
        : null,
    }
  }
  return f
}

/** Remaps every feed point of a consumer (a `Combustor` or a `SolidMotor`). */
export function remapConsumerFeeds<T extends { feeds: FeedSource[] }>(
  consumer: T,
  connectorIdMap: ReadonlyMap<string, string>,
  idMap: ReadonlyMap<string, string>,
): T {
  return { ...consumer, feeds: consumer.feeds.map((f) => remapFeed(f, connectorIdMap, idMap)) }
}

/**
 * Remaps a `<ConsumerFeedWiring>`: its `SubPartId` placement scope AND its feed points.
 * Both are in the source's id space — this is the reference the 5018 review flagged as
 * silently stale, since the entry used to ride the unmodeled-XML passthrough (which only
 * rewrites `<ConnectorRef>`/`<Sibling>`).
 */
export function remapConsumerFeedWiring(
  w: ConsumerFeedWiring,
  connectorIdMap: ReadonlyMap<string, string>,
  idMap: ReadonlyMap<string, string>,
): ConsumerFeedWiring {
  return {
    consumerId: w.consumerId,
    subPartInstanceId: w.subPartInstanceId
      ? (idMap.get(w.subPartInstanceId) ?? w.subPartInstanceId)
      : null,
    feeds: w.feeds.map((f) => remapFeed(f, connectorIdMap, idMap)),
  }
}
