import { useStore } from '@nanostores/react';
import { Field, ListBoxItem, Select } from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { FeedsField } from '../FeedsField';
import { ReactionPicker } from './ReactionPicker';
import { NONE, PA_PER_BAR, clamp01, ownerOf } from './editorKit';
import { FlashField } from './FlashField';
import { $part, pushUndo } from '../../state/editorStore';
import {
  setPartSolidMotorFeeds,
  setSubPartSolidMotorFeeds,
  updatePartSolidMotor,
  updateSubPartSolidMotor,
} from '../../state/editorStore';
import { feedTargetsOf } from '../../state/feedTargets';
import { GRAIN_GEOMETRY_IDS, type SolidMotor } from '../../ksa/types';

/**
 * **The solid motor editor** (design: design-data-engine-modes.md §B4.4) — one
 * `<SolidMotor>`, the SRB case, at either scope.
 *
 * Two KSA rules shape it: the reaction **must** be `Category="Solid"` (a liquid one makes
 * `SolidMotorTemplate.Create` throw, which is why the picker is Solid-only rather than
 * validated afterwards), and the default chamber pressure must sit inside that propellant's
 * `(minimumBurn, maxStable]` band — validation echoes the out-of-range case onto the pressure
 * field through the `defaultPressure` flash key.
 *
 * **Undo enrollment**: field edits stream; the propellant pick and the grain-profile pick are
 * discrete pushes; `setFeeds` is discrete inside the store action.
 */
export function SolidMotorEditor({
  templateId,
  index,
}: {
  templateId: string | null;
  index: number;
}) {
  const part = useStore($part);
  const motor = ownerOf(part, templateId)?.solidMotors[index];
  if (!motor) return null;

  const isSub = templateId !== null;
  const begin = () => pushUndo('edit solid motor', motor.id);
  const update = (patch: Partial<SolidMotor>) =>
    isSub ? updateSubPartSolidMotor(templateId, index, patch) : updatePartSolidMotor(index, patch);
  const targets = feedTargetsOf(part);

  return (
    <div className="flex flex-col gap-2">
      <FlashField fieldKey="reactionId">
        <ReactionPicker
          label="Solid propellant (reaction)"
          kind="solid"
          value={motor.reactionId}
          onPick={(id) => {
            pushUndo('solid motor reaction', id);
            update({ reactionId: id });
          }}
        />
      </FlashField>

      <Field label="Grain profile (the thrust curve over the burn)">
        <Select
          size="sm"
          aria-label="Grain geometry"
          value={motor.grainGeometryId || NONE}
          onChange={(k) => {
            pushUndo('grain profile', String(k));
            update({ grainGeometryId: k === NONE ? '' : String(k) });
          }}
        >
          <ListBoxItem id={NONE}>(library default)</ListBoxItem>
          {GRAIN_GEOMETRY_IDS.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
      </Field>

      <FlashField fieldKey="defaultPressure">
        <Field label="Default chamber pressure (bar)">
          <PreciseNumberInput
            aria-label="Default chamber pressure in bar"
            value={motor.defaultPressurePa / PA_PER_BAR}
            min={0}
            onInteractionStart={begin}
            onCommit={(bar) => update({ defaultPressurePa: bar * PA_PER_BAR })}
          />
        </Field>
      </FlashField>

      <Field label="Thermal efficiency (%)">
        <PreciseNumberInput
          aria-label="Thermal efficiency percent"
          value={motor.thermalEfficiency * 100}
          min={0}
          max={100}
          onInteractionStart={begin}
          onCommit={(pct) => update({ thermalEfficiency: clamp01(pct / 100) })}
        />
      </Field>

      <FeedsField
        label="Feeds from (grain segments + SolidMotorCase connectors)"
        feeds={motor.feeds}
        connectorIds={targets.connectorIds}
        containers={targets.containers}
        allowParent
        onChange={(feeds) =>
          isSub
            ? setSubPartSolidMotorFeeds(templateId, index, feeds)
            : setPartSolidMotorFeeds(index, feeds)
        }
      />
    </div>
  );
}
