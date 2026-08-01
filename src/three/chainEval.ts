import { computed } from 'nanostores';
import { $chainSession, type ChainSession } from '../state/chainStore';
import { $part, type PlacementTransform } from '../state/editorStore';
import { evalChain, type ChainEvalResult } from './chainMath';

/**
 * The live action-chain evaluation: the single data path feeding both the ghost
 * preview and the Apply commit.
 *
 * Seeds are frozen as `instanceId`s at session open but resolved against the CURRENT
 * document on every recompute, so nudging a seed with the gizmo (or undoing) re-flows
 * the whole array in real time. Seeds that no longer resolve are dropped; when none
 * survive the result is the `Seeds no longer exist` error rather than an empty chain,
 * so the palette can say so instead of silently offering to apply nothing.
 */
export interface ChainEvalState {
  session: ChainSession;
  /** Seed ids that still resolve, in session order. */
  resolvedSeedIds: string[];
  /** Current transforms, parallel to {@link resolvedSeedIds}. */
  seedTransforms: PlacementTransform[];
  result: ChainEvalResult;
}

export const $chainEval = computed(
  [$part, $chainSession],
  (part, session): ChainEvalState | null => {
    if (!session) return null;

    const resolvedSeedIds: string[] = [];
    const seedTransforms: PlacementTransform[] = [];
    for (const id of session.seedIds) {
      // First match wins: duplicate instanceIds are a pre-existing document quirk and a
      // deterministic pick beats guessing.
      const placement = part.placements.find((p) => p.instanceId === id);
      if (!placement) continue;
      resolvedSeedIds.push(id);
      seedTransforms.push({
        position: { ...placement.position },
        rotation: { ...placement.rotation },
        scale: { ...placement.scale },
      });
    }

    const result =
      seedTransforms.length === 0
        ? { instances: [], totalInstances: 0, newCount: 0, error: 'Seeds no longer exist' }
        : evalChain(seedTransforms, session.ops);

    return { session, resolvedSeedIds, seedTransforms, result };
  },
);
