import { useStore } from '@nanostores/react';
import { Field, ListBoxItem, Select, Switch } from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { InstanceScopeChip } from '../data/ScopeChip';
import { $part, pushUndo, removeGimbal, setGimbal } from '../../state/editorStore';
import { focusModule } from '../../state/engineStore';

/**
 * **The gimbal editor** (design: design-data-engine-modes.md §B4.9, §A5) — one `<Gimbal>`, the
 * thrust-vectoring overlay on ONE placed SubPart instance. Always part-level.
 *
 * A gimbal is keyed to its placement, so the **instance chip IS the picker** (§A5): re-homing
 * the gimbal is picking a different instance from the chip, and hovering an option flashes
 * that placement in the viewport. That is why the tree's Gimbals group has no context-free
 * `＋` — an "add" with no instance would be meaningless — and why the add-select lives here,
 * offering only placements that do not already have one (`setGimbal` upserts by instance, so
 * two gimbals can never share a placement).
 *
 * **Undo enrollment**: the angle fields stream; re-homing pushes ONE step (the discrete
 * `removeGimbal` snapshots first, and the following `setGimbal` is streaming), and the
 * "add to instance" select is one discrete push.
 */
export function GimbalEditor({ index, showAdd = true }: { index: number; showAdd?: boolean }) {
  const part = useStore($part);
  const gimbal = part.gameData.gimbals[index];
  if (!gimbal) return null;

  const id = gimbal.subPartInstanceId;
  const begin = () => pushUndo('edit gimbal', id);
  const taken = new Set(part.gameData.gimbals.map((g) => g.subPartInstanceId));
  const free = part.placements.map((p) => p.instanceId).filter((p) => !taken.has(p));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="text-xs text-fg-subtle">Gimbals</span>
        <InstanceScopeChip
          instanceId={id}
          options={[id, ...free]}
          onChange={(next) => {
            if (next === id) return;
            // ONE undo step: the discrete remove snapshots the pre-change document, and the
            // streaming upsert that follows rides in the same step.
            removeGimbal(id);
            setGimbal(next, {
              maxAngleYDeg: gimbal.maxAngleYDeg,
              maxAngleZDeg: gimbal.maxAngleZDeg,
              constrainToCircle: gimbal.constrainToCircle,
            });
          }}
        />
      </div>

      <Field label="Max angle Y (°)">
        <PreciseNumberInput
          aria-label="Gimbal max angle Y in degrees"
          value={gimbal.maxAngleYDeg}
          min={0}
          max={90}
          onInteractionStart={begin}
          onCommit={(deg) => setGimbal(id, { maxAngleYDeg: deg })}
        />
      </Field>
      <Field label="Max angle Z (°)">
        <PreciseNumberInput
          aria-label="Gimbal max angle Z in degrees"
          value={gimbal.maxAngleZDeg}
          min={0}
          max={90}
          onInteractionStart={begin}
          onCommit={(deg) => setGimbal(id, { maxAngleZDeg: deg })}
        />
      </Field>
      <Switch
        isSelected={gimbal.constrainToCircle}
        onChange={(on) => {
          begin();
          setGimbal(id, { constrainToCircle: on });
        }}
      >
        Constrain to circle
      </Switch>

      {showAdd && free.length > 0 && <AddGimbalField instanceIds={free} />}
    </div>
  );
}

/**
 * The "add a gimbal to another placement" select — the only honest way in, since a gimbal has
 * no meaning without an instance. Shared by the editor and the empty state below.
 */
export function AddGimbalField({ instanceIds }: { instanceIds: readonly string[] }) {
  return (
    <Field label="Add gimbal to instance">
      <Select
        size="sm"
        aria-label="Add gimbal to instance"
        placeholder="Select a placement"
        value={null}
        onChange={(k) => {
          pushUndo('add gimbal', String(k));
          setGimbal(String(k), { maxAngleYDeg: 5, maxAngleZDeg: 5 });
          focusModule({
            group: 'gimbal',
            scope: 'part',
            index: $part.get().gameData.gimbals.length - 1,
          });
        }}
      >
        {instanceIds.map((id) => (
          <ListBoxItem key={id} id={id} textValue={id}>
            {id}
          </ListBoxItem>
        ))}
      </Select>
    </Field>
  );
}
