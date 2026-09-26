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
  pushUndo,
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
  setGimbal,
  type EngineModuleGroup,
  type EngineModuleRef,
} from '../../state/editorStore';
import { identityTransform, type EditingPart, type EulerXYZ, type Vec3 } from '../../ksa/types';
import { lightAimRotation } from '../../three/coords';
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
 * callers rely on). {@link addGimbals} is the ONE exception, and says why.
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
  if (group === 'controller') addRocketController(kind, templateId ?? undefined);
  else if (group === 'wiring') addConsumerFeedWiring();
  else if (templateId) SUB_ADD[group]?.(templateId);
  else PART_ADD[group]?.();
  focusModule({ group, scope, index: before });
}

/**
 * The angle a gimbal added through the UI gets. `createGimbal`'s 0° is the XML default, but
 * authoring a 0° gimbal produces hardware that cannot vector — never what "add a gimbal" meant.
 */
export const DEFAULT_GIMBAL_ANGLE_DEG = 5;

/**
 * Adds a `<Gimbal>` to each placement that lacks one and focuses the first new row. Returns
 * how many were actually added, for the caller's toast.
 *
 * **Undo enrollment: ONE step for the whole batch** — the exception to this module's rule,
 * because `setGimbal` is a streaming upsert with no push of its own, and because a bulk add
 * that cost N undos to take back would be worse than no bulk add. The single-placement path
 * goes through here too, so both surfaces open a gimbal with the same angles.
 */
export function addGimbals(instanceIds: readonly string[]): number {
  const part = $part.get();
  const taken = new Set(part.gameData.gimbals.map((g) => g.subPartInstanceId));
  const fresh = instanceIds.filter((id) => id && !taken.has(id));
  if (fresh.length === 0) return 0;
  pushUndo('add gimbal', fresh.length === 1 ? fresh[0] : `${fresh.length} placements`);
  // Captured BEFORE the upserts: every one appends, so this is the first new row.
  const index = part.gameData.gimbals.length;
  for (const id of fresh) {
    // Born aligned: a stock −X bell yields the identity frame; an imported bell modelled down
    // any other local axis gets its gimbal X put on the thrust axis from the start, so the
    // `gimbal-thrust-axis-not-x` finding never fires for a gimbal flexo itself created.
    const thrust = nozzleThrustAxisOn(part, id);
    const rotation = thrust ? lightAimRotation({ x: 0, y: 0, z: 0 }, thrust) : null;
    setGimbal(id, {
      maxAngleYDeg: DEFAULT_GIMBAL_ANGLE_DEG,
      maxAngleZDeg: DEFAULT_GIMBAL_ANGLE_DEG,
      ...(rotation ? { transform: { ...identityTransform(), rotation } } : {}),
    });
  }
  focusModule({ group: 'gimbal', scope: 'part', index });
  return fresh.length;
}

/**
 * The THRUST axis (−`ExhaustDirection`, in the SubPart's frame) of the first nozzle the
 * SubPart under `instanceId` carries — what a gimbal on that instance vectors. Null when the
 * placement is unknown, carries no nozzle, or its direction is degenerate.
 */
export function nozzleThrustAxisOn(part: EditingPart, instanceId: string): Vec3 | null {
  const placement = part.placements.find((p) => p.instanceId === instanceId);
  if (!placement) return null;
  const spd = part.subPartGameData.find(
    (sp) => sp.subPartTemplateId === placement.subPartTemplateId,
  );
  const nozzle = spd?.nozzles[0] ?? spd?.solidNozzles[0];
  if (!nozzle) return null;
  const d = nozzle.exhaustDirection;
  if (Math.hypot(d.x, d.y, d.z) < 1e-6) return null;
  return { x: -d.x, y: -d.y, z: -d.z };
}

/**
 * The gimbal `<Transform><Rotation>` that puts the gimbal frame's X on `thrust` while
 * disturbing the current rotation as little as possible — KSA deflects about the gimbal
 * frame's Y and Z and sizes authority assuming thrust runs along its X
 * (`GimbalReference.Create` → `Gimbal2Asmb`, `GimbalController.RecomputeStaticData`), so
 * this is the one rotation that makes both deflection axes real. Null for a zero thrust axis.
 */
export function gimbalRotationAlignedTo(current: EulerXYZ, thrust: Vec3): EulerXYZ | null {
  const aimed = lightAimRotation(current, thrust);
  if (!aimed) return null;
  // A cardinal thrust axis lands on a ±90° Euler — the ZYX decomposition's singularity — with
  // ~1e-9 rad of float noise, which the editor would print as −89.99999879°. Snap to the exact
  // right angle when within 1e-6 rad; anything further off is a genuinely oblique axis.
  const snap = (rad: number) => {
    const quarter = Math.round(rad / (Math.PI / 2)) * (Math.PI / 2);
    return Math.abs(rad - quarter) < 1e-6 ? quarter || 0 : rad; // `|| 0` drops a −0
  };
  return { x: snap(aimed.x), y: snap(aimed.y), z: snap(aimed.z) };
}

/** Removes the module a ref names, through the action family its scope belongs to. */
export function removeModule(ref: EngineModuleRef, entry: EngineEntry | null): void {
  const part = $part.get();
  if (ref.group === 'controller')
    return removeRocketController(
      ref.index,
      ref.scope === 'sub' && entry?.kind === 'subpart' ? entry.templateId : undefined,
    );
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
