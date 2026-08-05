import { useStore } from '@nanostores/react';
import { FindingsList } from './data/FindingsList';
import { $allReactionIndex } from '../state/reactionStore';
import { validateEngines } from '../ksa/engineValidation';
import type { EditingPart } from '../ksa/types';

/**
 * Surfaces {@link validateEngines}'s findings inline in the Engine panel and the export
 * pre-flight.
 *
 * The rendering moved to the shared {@link FindingsList} in P6.08 — Data mode's validation
 * strip and the status-bar chip show the SAME two groups, and the block/warn wording is a
 * census invariant, so there is exactly one copy of it. This file survives as the thin
 * wrapper its v1 call sites already import; P7 deletes it with the last of them.
 *
 * Renders nothing when the part is clean, so it stays out of the way while authoring.
 */
export function EngineIssuesPanel({ part }: { part: EditingPart }) {
  const reactions = useStore($allReactionIndex);
  return <FindingsList findings={validateEngines(part, reactions)} />;
}
