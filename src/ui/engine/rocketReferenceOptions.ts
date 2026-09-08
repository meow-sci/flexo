import type { EditingPart } from '../../ksa/types';
import { ownerOf } from './editorKit';

/** KSA resolves an unqualified reference on its owner; a Part may address a placed child. */
export function referenceModuleIds(
  part: EditingPart,
  templateId: string | null,
  instanceId: string | null,
  kind: 'core' | 'nozzle' | 'rocket',
): string[] {
  if (templateId !== null && instanceId !== null) return [];
  const targetTemplate =
    instanceId === null
      ? templateId
      : part.placements.find((p) => p.instanceId === instanceId)?.subPartTemplateId;
  if (targetTemplate === undefined) return [];
  const owner = ownerOf(part, targetTemplate);
  if (!owner) return [];
  const modules =
    kind === 'core'
      ? [...owner.combustors, ...owner.solidMotors]
      : kind === 'nozzle'
        ? [...owner.nozzles, ...owner.solidNozzles]
        : owner.rockets;
  return [...new Set(modules.map((m) => m.id))];
}
