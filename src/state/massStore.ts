import type { EditingPart, MassDefinition, MassShape } from '../ksa/types';
import { isSubPartGameDataEmpty } from '../ksa/types';
import { createMassDefinition, MASS_SHAPES } from '../ksa/massDefinitions';
import { $part, getOrCreateSubPartData, pushUndo } from './editorStore';
import { randomId } from './ids';
import { $catalogIndex } from './catalogStore';
import type { CatalogSubPart } from '../ksa/catalog';

/** null addresses the Part; a template id addresses its shared SubPart GameData. */
export type MassOwner = string | null;

export function massDefinitionsFor(
  part: EditingPart,
  owner: MassOwner,
  catalog: ReadonlyMap<string, CatalogSubPart> = $catalogIndex.get(),
): readonly MassDefinition[] {
  if (owner == null) return part.gameData.massDefinitions;
  const data = part.subPartGameData.find((entry) => entry.subPartTemplateId === owner);
  // Earlier saved documents keep their raw mass XML. Reading the live catalog as well
  // would present the same inherited definition twice; no conversion is needed to leave
  // that authored data visible in the passthrough section.
  if (
    !data?.massDefinitionsOverride &&
    data?.unknownChildren.some((node) => MASS_SHAPES.some((shape) => shape === node.tag))
  )
    return [];
  return data?.massDefinitionsOverride
    ? data.massDefinitions
    : (catalog.get(owner)?.data?.gameData?.massDefinitions ?? []);
}

function mutateDefinitions(
  owner: MassOwner,
  mutate: (definitions: MassDefinition[]) => void,
): void {
  const current = $part.get();
  const part = structuredClone(current);
  const data = owner == null ? part.gameData : getOrCreateSubPartData(part, owner);
  if (owner != null && !getOrCreateSubPartData(part, owner).massDefinitionsOverride) {
    data.massDefinitions = structuredClone([...massDefinitionsFor(current, owner)]);
  }
  mutate(data.massDefinitions);
  if (owner != null) {
    getOrCreateSubPartData(part, owner).massDefinitionsOverride = true;
    part.subPartGameData = part.subPartGameData.filter((entry) => !isSubPartGameDataEmpty(entry));
  }
  $part.set(part);
}

/** Discrete creation: one undo step for the definition and its owning GameData entry. */
export function addMassDefinition(owner: MassOwner, shape: MassShape): void {
  pushUndo('add mass definition', shape);
  mutateDefinitions(owner, (definitions) => {
    definitions.push(createMassDefinition(shape, `mass_${randomId()}`));
  });
}

/** Discrete deletion; an empty template override deliberately suppresses inherited stock mass. */
export function removeMassDefinition(owner: MassOwner, index: number): void {
  if (!massDefinitionsFor($part.get(), owner)[index]) return;
  pushUndo('remove mass definition');
  mutateDefinitions(owner, (definitions) => definitions.splice(index, 1));
}

/** Streaming numeric/text edit: the caller pushes undo once when the field gains focus. */
export function updateMassDefinition(
  owner: MassOwner,
  index: number,
  patch: Partial<Omit<MassDefinition, 'id' | 'shape'>>,
): void {
  if (!massDefinitionsFor($part.get(), owner)[index]) return;
  mutateDefinitions(owner, (definitions) => {
    definitions[index] = { ...definitions[index], ...structuredClone(patch) };
  });
}

/** Shape changes preserve the mass source and placement, and start with the new geometry defaults. */
export function setMassDefinitionShape(owner: MassOwner, index: number, shape: MassShape): void {
  const current = massDefinitionsFor($part.get(), owner)[index];
  if (!current || current.shape === shape) return;
  pushUndo('mass definition shape', shape);
  mutateDefinitions(owner, (definitions) => {
    definitions[index] = {
      ...createMassDefinition(shape, current.id),
      massKg: shape === 'CustomMass' ? (current.massKg ?? 1) : current.massKg,
      densityKgM3: shape === 'CustomMass' ? null : current.densityKgM3,
      materialId: shape === 'CustomMass' ? null : current.materialId,
      locationAsmb: { ...current.locationAsmb },
      paf2Asmb: { ...current.paf2Asmb },
    };
  });
}
