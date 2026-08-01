import { atom, computed } from 'nanostores';
import {
  customToReactionData,
  indexReactionCatalog,
  loadReactionCatalog,
  type ReactionData,
} from '../ksa/reactionCatalog';
import { $part } from './editorStore';

/**
 * The loaded KSA reaction catalog (propellant chemistry + gas LUTs), used by the
 * Engine Designer's live thrust/Isp preview. Empty until
 * {@link ensureReactionsLoaded} resolves — and stays empty in the open-source build
 * where `Reactions.xml` isn't served (the editor still authors engines, just without
 * the physics readout). Parallel to {@link import('./catalogStore').$catalog}.
 */
export const $reactionCatalog = atom<ReactionData[]>([]);
export const $reactionLoading = atom<boolean>(true);

/** id → reaction index for O(1) lookup by `<Reaction Id>`. */
export const $reactionIndex = computed([$reactionCatalog], (entries) =>
  indexReactionCatalog(entries),
);

/**
 * The Core catalog merged with the project's user-authored custom reactions (custom
 * wins on an id clash) — what the Engine designer's dropdown + live readout use, so a
 * just-authored propellant shows up immediately. Custom reactions are converted from
 * their authored units to the computed LUT form here.
 */
export const $allReactions = computed([$reactionCatalog, $part], (core, part): ReactionData[] => {
  const custom = part.customReactions.map(customToReactionData);
  const customIds = new Set(custom.map((c) => c.id));
  return [...core.filter((c) => !customIds.has(c.id)), ...custom];
});

/** id → reaction index over Core ∪ custom reactions. */
export const $allReactionIndex = computed([$allReactions], (entries) =>
  indexReactionCatalog(entries),
);

/** True once the catalog has loaded with at least one reaction (live preview available). */
export const $hasReactionData = computed([$reactionCatalog], (entries) => entries.length > 0);

let started = false;

/** Loads the reaction catalog once (idempotent). Safe to call from multiple mounts. */
export async function ensureReactionsLoaded(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const entries = await loadReactionCatalog();
    $reactionCatalog.set(entries);
  } catch (err) {
    console.error('flexo: reaction catalog load failed', err);
  } finally {
    $reactionLoading.set(false);
  }
}
