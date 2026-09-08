import { useStore } from '@nanostores/react';
import { Button, Checkbox, Field, ListBoxItem, Select, TextField } from '../kit';
import { IdSelect } from './RocketEditor';
import { referenceModuleIds } from './rocketReferenceOptions';
import { $part, pushUndo, updateRocketController } from '../../state/editorStore';
import { ownerOf } from './editorKit';
import { CONTROL_MAP_FLAGS, controlMapMask, toggleControlMapFlag } from './controlMapModel';
import type { RocketController, RocketControllerKind } from '../../ksa/types';

/** Edits controllers on either KSA container; unqualified rocket refs resolve on that owner. */
export function ControllerEditor({
  index,
  templateId = null,
}: {
  index: number;
  templateId?: string | null;
}) {
  const part = useStore($part);
  const controller = ownerOf(part, templateId)?.rocketControllers[index];
  if (!controller) return null;

  const begin = () => pushUndo('edit controller', controller.id);
  const update = (patch: Partial<RocketController>) =>
    updateRocketController(index, patch, templateId ?? undefined);
  const setRefs = (refs: typeof controller.rocketRefs) => {
    begin();
    update({ rocketRefs: refs });
  };

  return (
    <div className="flex flex-col gap-2">
      <Field label="Controller id">
        <TextField
          size="sm"
          aria-label="Controller id"
          inputClassName="font-mono"
          value={controller.id}
          onFocus={begin}
          onChange={(id) => update({ id })}
        />
      </Field>
      <Field label="Type">
        <Select
          size="sm"
          aria-label="Controller type"
          value={controller.kind}
          onChange={(k) => {
            begin();
            update({ kind: k as RocketControllerKind });
          }}
        >
          <ListBoxItem id="engine">Engine (throttle + staging)</ListBoxItem>
          <ListBoxItem id="thruster">Thruster (RCS, pulsed)</ListBoxItem>
        </Select>
      </Field>

      {controller.kind === 'thruster' && (
        <div className="flex flex-col gap-2">
          <Checkbox
            isSelected={controller.controlMapFlags !== null}
            onChange={(manual) => {
              begin();
              update({ controlMapFlags: manual ? [] : null });
            }}
          >
            Manual control map
          </Checkbox>
          <p className="text-[11px] text-fg-subtle">
            Automatic mapping uses thruster geometry. A manual map fires for the selected control
            directions; selecting none disables all directions.
          </p>
          {controller.controlMapFlags !== null && (
            <>
              <div className="grid grid-cols-2 gap-1">
                {CONTROL_MAP_FLAGS.map(({ token, label, bit }) => (
                  <Checkbox
                    key={token}
                    isSelected={(controlMapMask(controller.controlMapFlags!.join(',')) & bit) !== 0}
                    onChange={(selected) => {
                      begin();
                      update({
                        controlMapFlags: toggleControlMapFlag(
                          controller.controlMapFlags!.join(','),
                          bit,
                          selected,
                        )
                          .split(',')
                          .filter(Boolean),
                      });
                    }}
                  >
                    {label}
                  </Checkbox>
                ))}
              </div>
              <Field label="Control map CSV">
                <TextField
                  size="sm"
                  aria-label="Control map CSV"
                  value={controller.controlMapFlags.join(',')}
                  onFocus={begin}
                  onChange={(controlMap) =>
                    update({
                      controlMapFlags: controlMap.split(','),
                    })
                  }
                />
              </Field>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs text-fg-subtle">Rockets driven</span>
        {controller.rocketRefs.map((ref, j) => (
          <div key={j} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <IdSelect
                label={`Rocket ${j + 1}`}
                ids={referenceModuleIds(part, templateId, ref.subPartInstanceId, 'rocket')}
                value={ref.id || null}
                onChange={(id) =>
                  setRefs(
                    controller.rocketRefs.map((r, k) => (k === j ? { ...r, id: id ?? '' } : r)),
                  )
                }
              />
            </div>
            {templateId === null && (
              <div className="min-w-0 flex-1">
                <IdSelect
                  label="on instance"
                  ids={part.placements.map((p) => p.instanceId)}
                  value={ref.subPartInstanceId}
                  allowRoot
                  onChange={(s) =>
                    setRefs(
                      controller.rocketRefs.map((r, k) =>
                        k === j ? { ...r, subPartInstanceId: s } : r,
                      ),
                    )
                  }
                />
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              aria-label={`Remove rocket ref ${j + 1}`}
              onPress={() => setRefs(controller.rocketRefs.filter((_, k) => k !== j))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onPress={() => setRefs([...controller.rocketRefs, { id: '', subPartInstanceId: null }])}
        >
          + Rocket ref
        </Button>
      </div>
    </div>
  );
}
