import { useStore } from '@nanostores/react';
import { Button, Field, ListBoxItem, Select, TextField } from '../kit';
import { IdSelect } from './RocketEditor';
import { $part, pushUndo, updateRocketController } from '../../state/editorStore';
import type { EditingPart, RocketControllerKind } from '../../ksa/types';

/**
 * **The controller editor** (design: design-data-engine-modes.md §B4.9) — one
 * `<RocketEngineController>` / `<RocketThrusterController>`. Always part-level: KSA authors
 * controllers on `<PartGameData>` only, whatever scope the designer has open, which is why the
 * tree group carries the `[Part]` chip.
 *
 * The controller is what makes a part FIRE: an Engine controller gives throttle + staging, a
 * Thruster controller gives RCS pulses (and may never drive a solid motor — validation says
 * so). Its rocket refs may name a rocket on ANY SubPart instance, hence the instance select
 * with the `'\0root'` "(root part)" sentinel.
 *
 * `ControlMap` stays verbatim passthrough with no UI — it is a CSV string KSA does not
 * validate, and inventing an editor for it would be inventing a schema (census invariant).
 *
 * **Undo enrollment**: the id field and the ref lists stream through `updateRocketController`,
 * pushed once at interaction start.
 */
export function ControllerEditor({ index }: { index: number }) {
  const part = useStore($part);
  const controller = part.gameData.rocketControllers[index];
  if (!controller) return null;

  const begin = () => pushUndo('edit controller', controller.id);
  const rocketIds = allRocketIds(part);
  const setRefs = (refs: typeof controller.rocketRefs) => {
    begin();
    updateRocketController(index, { rocketRefs: refs });
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
          onChange={(id) => updateRocketController(index, { id })}
        />
      </Field>
      <Field label="Type">
        <Select
          size="sm"
          aria-label="Controller type"
          value={controller.kind}
          onChange={(k) => {
            begin();
            updateRocketController(index, { kind: k as RocketControllerKind });
          }}
        >
          <ListBoxItem id="engine">Engine (throttle + staging)</ListBoxItem>
          <ListBoxItem id="thruster">Thruster (RCS, pulsed)</ListBoxItem>
        </Select>
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-fg-subtle">Rockets driven</span>
        {controller.rocketRefs.map((ref, j) => (
          <div key={j} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <IdSelect
                label={`Rocket ${j + 1}`}
                ids={rocketIds}
                value={ref.id || null}
                onChange={(id) =>
                  setRefs(
                    controller.rocketRefs.map((r, k) => (k === j ? { ...r, id: id ?? '' } : r)),
                  )
                }
              />
            </div>
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

/** Every rocket id in the part (per-SubPart + part-level) — what a controller may reference. */
function allRocketIds(part: EditingPart): string[] {
  const ids: string[] = [];
  for (const s of part.subPartGameData) for (const r of s.rockets) ids.push(r.id);
  for (const r of part.gameData.rockets) ids.push(r.id);
  return ids;
}
