import { ENTITY_ONLY_LAYER_IDS } from '../../ksa/types';

/**
 * Pure layer-reorder math for the Outliner's drag grip and its Move Up / Move Down menu
 * items (design: design-build-mode.md §2.2, §2.3.4).
 *
 * Reordering is defined over the **ordinary** partition only — the three pinned entity-only
 * layers always sort last in the DISPLAY and are neither drag sources nor drop targets — but
 * `reorderLayers` takes a permutation of the WHOLE `part.layers` array. These two functions
 * are the bridge, and they live outside the component because the off-by-one cases (drop on
 * yourself, drop past the end, a pinned layer sitting between two ordinary ones in document
 * order) are exactly what a unit test should own.
 */

/** Moves `movingKeys` to before/after `targetId` within `ids`, preserving relative order. */
export function computeReorder(
  ids: readonly string[],
  movingKeys: ReadonlySet<string>,
  targetId: string,
  position: 'before' | 'after',
): string[] {
  const moving = ids.filter((id) => movingKeys.has(id));
  const rest = ids.filter((id) => !movingKeys.has(id));
  const idx = rest.indexOf(targetId);
  if (idx < 0) return [...ids];
  const insertAt = position === 'before' ? idx : idx + 1;
  return [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
}

/**
 * Rewrites the full layer order so the ordinary layers appear in `orderedOrdinary`, leaving
 * every pinned layer exactly where the document already had it. The result is a permutation
 * of `ids`, which is what `reorderLayers` validates.
 */
export function withOrdinaryOrder(
  ids: readonly string[],
  orderedOrdinary: readonly string[],
): string[] {
  let next = 0;
  return ids.map((id) =>
    ENTITY_ONLY_LAYER_IDS.includes(id) ? id : (orderedOrdinary[next++] ?? id),
  );
}

/** The ordinary (non-pinned) layer ids of `ids`, in document order. */
export function ordinaryIds(ids: readonly string[]): string[] {
  return ids.filter((id) => !ENTITY_ONLY_LAYER_IDS.includes(id));
}

/**
 * The full layer order with `id` moved one slot `delta` through the ORDINARY partition.
 * Returns null at either end (and for a pinned or unknown layer), which is what disables the
 * Move Up / Move Down menu items.
 */
export function movedOrdinary(ids: readonly string[], id: string, delta: 1 | -1): string[] | null {
  const ordinary = ordinaryIds(ids);
  const from = ordinary.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ordinary.length) return null;
  const swapped = [...ordinary];
  swapped[from] = ordinary[to];
  swapped[to] = ordinary[from];
  return withOrdinaryOrder(ids, swapped);
}
