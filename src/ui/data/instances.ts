import { useStore } from '@nanostores/react';
import { $part } from '../../state/editorStore';

/**
 * Every placement instance id of `templateId`, in document order — what a `[Template ×N]`
 * chip flashes and selects, and what an `[Instance: … ▾]` picker chooses between
 * (design: design-data-engine-modes.md §A5). An empty `templateId` yields an empty list, so
 * a Part-scope caller can call it unconditionally (Rules of Hooks).
 */
export function useInstanceIds(templateId: string): string[] {
  const part = useStore($part);
  return part.placements.filter((p) => p.subPartTemplateId === templateId).map((p) => p.instanceId);
}
