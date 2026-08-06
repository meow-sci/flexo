import { $part, addCustomReaction } from '../../state/editorStore';
import { focusModule } from '../../state/engineStore';
import { reactionDataToCustom, type ReactionData } from '../../ksa/reactionCatalog';
import { createCustomReaction } from '../../ksa/types';

/**
 * The two creation paths for a custom propellant (design: design-data-engine-modes.md §B4.10,
 * decision D8), lifted out of the tree so the menu stays presentation.
 *
 * **Clone-and-remix is the real workflow**: the gas table is pre-solved thermodynamics, so
 * starting from a shipped propellant is the only way to get a physically sane one. Cloning a
 * MIXTURE bakes it at its default O/F ratio — exactly what a KSA combustor does with it — so
 * the clone is a `<FixedReaction>` from the start.
 *
 * Both paths are ONE discrete undo step (`addCustomReaction` pushes) and focus the new module.
 */

/** A url-safe-ish id from a name, deduped against taken ids. */
export function uniquePropellantId(name: string, taken: Iterable<string>): string {
  const base =
    name
      .trim()
      .replace(/[^A-Za-z0-9_.]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Propellant';
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** Every id a new propellant must not collide with: the catalog plus the project's own. */
function takenIds(catalog: readonly ReactionData[]): string[] {
  return [...catalog.map((c) => c.id), ...$part.get().customReactions.map((c) => c.id)];
}

/** Focuses the propellant that was just appended. */
function focusLast(): void {
  focusModule({
    group: 'propellant',
    scope: 'part',
    index: $part.get().customReactions.length - 1,
  });
}

export function cloneShippedPropellant(
  source: ReactionData,
  catalog: readonly ReactionData[],
): void {
  const id = uniquePropellantId(`${source.id}_custom`, takenIds(catalog));
  addCustomReaction(reactionDataToCustom(source, id, `${source.name} (custom)`));
  focusLast();
}

export function addBlankPropellant(catalog: readonly ReactionData[]): void {
  const id = uniquePropellantId('Propellant', takenIds(catalog));
  addCustomReaction(createCustomReaction(id, 'New Propellant'));
  focusLast();
}
