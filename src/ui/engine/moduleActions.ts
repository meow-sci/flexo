import {
  $part,
  addCombustor,
  addConsumerFeedWiring,
  addNozzle,
  addPartCombustor,
  addPartNozzle,
  addPartRocket,
  addPartSolidGrainSegment,
  addPartSolidMotor,
  addPartSolidNozzle,
  addRocket,
  addRocketController,
  addSubPartSolidGrainSegment,
  addSubPartSolidMotor,
  addSubPartSolidNozzle,
  removeCombustor,
  removeConsumerFeedWiring,
  removeCustomReaction,
  removeGimbal,
  removeNozzle,
  removePartCombustor,
  removePartNozzle,
  removePartRocket,
  removePartSolidGrainSegment,
  removePartSolidMotor,
  removePartSolidNozzle,
  removeRocket,
  removeRocketController,
  removeSubPartSolidGrainSegment,
  removeSubPartSolidMotor,
  removeSubPartSolidNozzle,
  type EngineModuleGroup,
  type EngineModuleRef,
} from '../../state/editorStore';
import type { EditingPart } from '../../ksa/types';
import { engineModuleCount, focusModule, type EngineEntry } from '../../state/engineStore';
import { scopeOfGroup } from './moduleTreeModel';

/**
 * The add / remove dispatch tables for engine modules — the ONE place that maps a
 * `(group, scope)` pair onto the matching editorStore action.
 *
 * It lives outside both surfaces because BOTH need it: the module tree's group `＋` and row ⋮,
 * and the module editor's header ⋮. Two copies would be two chances for "Remove" to mean
 * different things in the two menus.
 *
 * **Undo enrollment: NONE of its own** — every branch is an existing discrete action that
 * pushes its own single step (foundation §14.3's "≤5 undoable ⇒ no confirm" is what the
 * callers rely on).
 */

const SUB_ADD: Partial<Record<EngineModuleGroup, (templateId: string) => void>> = {
  combustor: addCombustor,
  nozzle: addNozzle,
  rocket: addRocket,
  solidMotor: addSubPartSolidMotor,
  grain: addSubPartSolidGrainSegment,
  solidNozzle: addSubPartSolidNozzle,
};

const PART_ADD: Partial<Record<EngineModuleGroup, () => void>> = {
  combustor: addPartCombustor,
  nozzle: addPartNozzle,
  rocket: addPartRocket,
  solidMotor: addPartSolidMotor,
  grain: addPartSolidGrainSegment,
  solidNozzle: addPartSolidNozzle,
};

const SUB_REMOVE: Partial<Record<EngineModuleGroup, (templateId: string, index: number) => void>> =
  {
    combustor: removeCombustor,
    nozzle: removeNozzle,
    rocket: removeRocket,
    solidMotor: removeSubPartSolidMotor,
    grain: removeSubPartSolidGrainSegment,
    solidNozzle: removeSubPartSolidNozzle,
  };

const PART_REMOVE: Partial<Record<EngineModuleGroup, (index: number) => void>> = {
  combustor: removePartCombustor,
  nozzle: removePartNozzle,
  rocket: removePartRocket,
  solidMotor: removePartSolidMotor,
  grain: removePartSolidGrainSegment,
  solidNozzle: removePartSolidNozzle,
};

/** Adds a default module of `group` at the open scope and focuses it. */
export function addModule(
  group: EngineModuleGroup,
  entry: EngineEntry | null,
  kind: 'engine' | 'thruster' = 'engine',
): void {
  const templateId = entry?.kind === 'subpart' ? entry.templateId : null;
  const scope = scopeOfGroup(group, entry);
  const before = engineModuleCount($part.get(), entry, group, scope);
  if (group === 'controller') addRocketController(kind);
  else if (group === 'wiring') addConsumerFeedWiring();
  else if (templateId) SUB_ADD[group]?.(templateId);
  else PART_ADD[group]?.();
  focusModule({ group, scope, index: before });
}

/** Removes the module a ref names, through the action family its scope belongs to. */
export function removeModule(ref: EngineModuleRef, entry: EngineEntry | null): void {
  const part = $part.get();
  if (ref.group === 'controller') return removeRocketController(ref.index);
  if (ref.group === 'wiring') return removeConsumerFeedWiring(ref.index);
  if (ref.group === 'gimbal') {
    const gimbal = part.gameData.gimbals[ref.index];
    if (gimbal) removeGimbal(gimbal.subPartInstanceId);
    return;
  }
  if (ref.group === 'propellant') {
    const reaction = part.customReactions[ref.index];
    if (reaction) removeCustomReaction(reaction.id);
    return;
  }
  if (ref.scope === 'sub' && entry?.kind === 'subpart') {
    SUB_REMOVE[ref.group]?.(entry.templateId, ref.index);
    return;
  }
  PART_REMOVE[ref.group]?.(ref.index);
}

/** How many `<SolidMotor>`s the open scope carries — gates the "solid nozzle" add option. */
export function solidMotorCount(part: EditingPart, entry: EngineEntry | null): number {
  if (entry?.kind === 'part') return part.gameData.solidMotors.length;
  if (entry?.kind === 'subpart') {
    return (
      part.subPartGameData.find((s) => s.subPartTemplateId === entry.templateId)?.solidMotors
        .length ?? 0
    );
  }
  return 0;
}
