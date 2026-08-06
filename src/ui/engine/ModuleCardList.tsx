import { useStore } from '@nanostores/react';
import { Button, ItemCard } from '../kit';
import { CombustorEditor } from './CombustorEditor';
import { NozzleEditor, SolidNozzleEditor } from './NozzleEditor';
import { SolidMotorEditor } from './SolidMotorEditor';
import { GrainSegmentEditor } from './GrainSegmentEditor';
import { RocketEditor } from './RocketEditor';
import { addModule, removeModule } from './moduleActions';
import { MODULE_GROUP_LABEL } from './moduleTreeModel';
import { ownerOf } from './editorKit';
import { $part, undo, type EngineModuleGroup } from '../../state/editorStore';
import type { EngineEntry } from '../../state/engineStore';
import { status } from '../../state/statusStore';

/**
 * **Data mode's card list** — every module of one scope, in order, each in its own removable
 * card wrapping the SAME editor Engine mode focuses one at a time (decision D11).
 *
 * Engine mode is the master-detail view (tree right, one editor left); Data mode wants the
 * whole scope on one scrollable form. Both render this file's editors, so a field that exists
 * in one exists in the other by construction — which is the entire reason the v1 modals died
 * rather than being reskinned.
 *
 * `templateId === null` addresses `<PartGameData>`; a template id addresses that template's
 * `<SubPartGameData>`.
 *
 * **Undo enrollment: NONE of its own** — add/remove are the discrete store actions behind
 * `moduleActions`, and the editors own their own streaming pushes.
 */

const EDITORS: Record<
  Exclude<EngineModuleGroup, 'controller' | 'wiring' | 'gimbal' | 'propellant'>,
  (props: { templateId: string | null; index: number }) => React.ReactNode
> = {
  combustor: CombustorEditor,
  nozzle: NozzleEditor,
  solidMotor: SolidMotorEditor,
  grain: GrainSegmentEditor,
  solidNozzle: SolidNozzleEditor,
  rocket: RocketEditor,
};

type CardGroup = keyof typeof EDITORS;

/** The `$part` list a group addresses at this scope (empty when the owner has no data yet). */
function listOf(
  part: ReturnType<typeof $part.get>,
  templateId: string | null,
  group: CardGroup,
): { id: string }[] {
  const owner = ownerOf(part, templateId);
  if (!owner) return [];
  switch (group) {
    case 'combustor':
      return owner.combustors;
    case 'nozzle':
      return owner.nozzles;
    case 'solidMotor':
      return owner.solidMotors;
    case 'grain':
      return owner.solidGrainSegments;
    case 'solidNozzle':
      return owner.solidNozzles;
    default:
      return owner.rockets;
  }
}

export function ModuleCardList({
  templateId,
  groups,
}: {
  templateId: string | null;
  groups: readonly CardGroup[];
}) {
  const part = useStore($part);
  const entry: EngineEntry =
    templateId === null ? { kind: 'part' } : { kind: 'subpart', templateId };
  const scope = templateId === null ? ('part' as const) : ('sub' as const);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const Editor = EDITORS[group];
        const list = listOf(part, templateId, group);
        return (
          <div key={group} className="flex flex-col gap-2">
            {list.map((module, index) => (
              <ItemCard
                key={index}
                title={`${MODULE_GROUP_LABEL[group]} — ${module.id}`}
                onRemove={() => {
                  removeModule({ group, scope, index }, entry);
                  status(`Removed ${MODULE_GROUP_LABEL[group].toLowerCase()} ${module.id}`, {
                    severity: 'info',
                    action: { label: 'Undo', run: undo },
                  });
                }}
              >
                <Editor templateId={templateId} index={index} />
              </ItemCard>
            ))}
            <Button size="sm" className="self-start" onPress={() => addModule(group, entry)}>
              + {MODULE_GROUP_LABEL[group]}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
