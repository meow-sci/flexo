import { computed } from 'nanostores';
import type { ColliderShape } from '../ksa/types';
import { $layerView, layerViewState } from '../state/layerStore';
import { $chainSession, type ChainSession } from '../state/chainStore';
import { $part, type PlacementTransform } from '../state/editorStore';
import { evalChain, type ChainEvalResult } from './chainMath';

/**
 * The live action-chain evaluation: the single data path feeding both the ghost
 * preview and the Apply commit.
 *
 * Seed ids and kind are frozen at session open but resolved against the CURRENT
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
  [$part, $chainSession, $layerView],
  (part, session, layerView): ChainEvalState | null => {
    if (!session) return null;

    const resolvedSeedIds: string[] = [];
    const seedTransforms: PlacementTransform[] = [];
    const colliderShapes: ColliderShape[] = [];
    const owners = new Set<string | null>();
    let locked = false;
    for (const id of session.seedIds) {
      // First match wins: duplicate instanceIds are a pre-existing document quirk and a
      // deterministic pick beats guessing.
      const placement =
        session.seedKind === 'collider'
          ? part.colliders.find((c) => c.id === id)
          : part.placements.find((p) => p.instanceId === id);
      if (!placement) continue;
      locked ||= layerViewState(layerView, placement.layerId).locked;
      if ('shape' in placement) {
        colliderShapes.push(placement.shape);
        owners.add(placement.ownerTemplateId);
      }
      resolvedSeedIds.push(id);
      seedTransforms.push({
        position: { ...placement.position },
        rotation: { ...placement.rotation },
        scale: { ...placement.scale },
      });
    }

    const error =
      seedTransforms.length === 0
        ? 'Seeds no longer exist'
        : locked
          ? 'Selection is on a locked layer'
          : owners.size > 1
            ? 'Select colliders with the same owner'
            : null;
    const result = error
      ? { instances: [], totalInstances: 0, newCount: 0, error }
      : evalChain(
          seedTransforms,
          session.ops,
          session.seedKind === 'collider' ? colliderShapes : undefined,
        );

    return { session, resolvedSeedIds, seedTransforms, result };
  },
);
