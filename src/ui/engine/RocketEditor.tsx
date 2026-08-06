import { useStore } from '@nanostores/react';
import { Button, Field, ListBoxItem, Select, TextField, warningBox } from '../kit';
import { ownerOf } from './editorKit';
import { $part, pushUndo, updatePartRocket, updateRocket } from '../../state/editorStore';
import { $engineFindings } from '../../state/engineStore';
import type { EditingPart, Rocket, SubPartIdRef } from '../../ksa/types';

/**
 * **The rocket editor** (design: design-data-engine-modes.md §B4.7) — one `<Rocket>`, the
 * binding that turns a chamber and some nozzles into a firing unit a controller can drive.
 *
 * The core and nozzle pools deliberately MIX the solid and liquid families: a `<Rocket>`'s
 * `<Core Id>` may legally name either, and mixing them is a load error caught by VALIDATION,
 * not hidden by the picker — surfacing it as a finding (echoed inline here) is what tells the
 * user *why* the combination is illegal, where a filtered dropdown would just leave a
 * mysterious gap.
 *
 * At part scope each nozzle ref also picks the SubPart INSTANCE it lives on (with the
 * `'\0root'` "(root part)" sentinel), because a part-level rocket can bind hardware that lives
 * on a placement — the gas-generator case.
 *
 * **Undo enrollment**: the id field streams; ref add/remove/re-pick go through the same
 * streaming `update*Rocket` patch, pushed once at interaction start.
 */
export function RocketEditor({ templateId, index }: { templateId: string | null; index: number }) {
  const part = useStore($part);
  const findings = useStore($engineFindings);

  const rocket = ownerOf(part, templateId)?.rockets[index];
  if (!rocket) return null;

  const isPartScope = templateId === null;
  const update = (patch: Partial<Rocket>) => {
    if (isPartScope) updatePartRocket(index, patch);
    else updateRocket(templateId, index, patch);
  };
  const begin = () => pushUndo('edit rocket', rocket.id);
  const beginAnd = (patch: Partial<Rocket>) => {
    begin();
    update(patch);
  };

  const { coreIds, nozzleIds } = idPools(part, templateId);
  const setNozzleRef = (i: number, ref: SubPartIdRef) =>
    beginAnd({ nozzles: rocket.nozzles.map((n, j) => (j === i ? ref : n)) });

  const echoes = findings.filter(
    (f) =>
      (f.code === 'rocket-mixes-solid-and-liquid' || f.code === 'solid-rocket-needs-nozzle') &&
      f.source?.module === 'rocket' &&
      f.source.index === index &&
      f.source.templateId === templateId,
  );

  return (
    <div className="flex flex-col gap-2">
      {echoes.map((issue) => (
        <p key={issue.code} className={warningBox}>
          {issue.message}
        </p>
      ))}

      <Field label="Rocket id (referenced by the controller)">
        <TextField
          size="sm"
          aria-label="Rocket id"
          inputClassName="font-mono"
          value={rocket.id}
          onFocus={begin}
          onChange={(id) => update({ id })}
        />
      </Field>

      <IdSelect
        label="Core (combustor or solid motor)"
        ids={coreIds}
        value={rocket.core.id || null}
        onChange={(id) => beginAnd({ core: { ...rocket.core, id: id ?? '' } })}
      />
      {isPartScope && (
        <IdSelect
          label="Core lives on (SubPart instance)"
          ids={part.placements.map((p) => p.instanceId)}
          value={rocket.core.subPartInstanceId}
          allowRoot
          onChange={(s) => beginAnd({ core: { ...rocket.core, subPartInstanceId: s } })}
        />
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs text-fg-subtle">Nozzles</span>
        {rocket.nozzles.map((nz, j) => (
          <div key={j} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <IdSelect
                label={`Nozzle ${j + 1}`}
                ids={nozzleIds}
                value={nz.id || null}
                onChange={(id) => setNozzleRef(j, { ...nz, id: id ?? '' })}
              />
            </div>
            {isPartScope && (
              <div className="min-w-0 flex-1">
                <IdSelect
                  label="on instance"
                  ids={part.placements.map((p) => p.instanceId)}
                  value={nz.subPartInstanceId}
                  allowRoot
                  onChange={(s) => setNozzleRef(j, { ...nz, subPartInstanceId: s })}
                />
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              aria-label={`Remove nozzle ${j + 1}`}
              onPress={() => beginAnd({ nozzles: rocket.nozzles.filter((_, k) => k !== j) })}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onPress={() =>
            beginAnd({ nozzles: [...rocket.nozzles, { id: '', subPartInstanceId: null }] })
          }
        >
          + Nozzle ref
        </Button>
      </div>
    </div>
  );
}

/** The id pools a rocket at this scope may bind: both families, both owners at part scope. */
function idPools(
  part: EditingPart,
  templateId: string | null,
): { coreIds: string[]; nozzleIds: string[] } {
  if (templateId !== null) {
    const spd = part.subPartGameData.find((s) => s.subPartTemplateId === templateId);
    return {
      coreIds: [...(spd?.combustors ?? []), ...(spd?.solidMotors ?? [])].map((m) => m.id),
      nozzleIds: [...(spd?.nozzles ?? []), ...(spd?.solidNozzles ?? [])].map((n) => n.id),
    };
  }
  const g = part.gameData;
  return {
    coreIds: [
      ...g.combustors.map((c) => c.id),
      ...g.solidMotors.map((m) => m.id),
      ...part.subPartGameData.flatMap((s) => [
        ...s.combustors.map((c) => c.id),
        ...s.solidMotors.map((m) => m.id),
      ]),
    ],
    nozzleIds: [
      ...g.nozzles.map((n) => n.id),
      ...g.solidNozzles.map((n) => n.id),
      ...part.subPartGameData.flatMap((s) => [
        ...s.nozzles.map((n) => n.id),
        ...s.solidNozzles.map((n) => n.id),
      ]),
    ],
  };
}

const ROOT = '\0root';

/**
 * An id dropdown that keeps the CURRENT value selectable even when the pool no longer
 * contains it (census invariant: a stale reference is preserved and visible, never silently
 * retargeted), with the optional `(root part)` sentinel for instance refs.
 *
 * Exported so `ControllerEditor` uses the identical rules — the two editors' pickers were one
 * component in v1 (`IdSelect`/`InstanceSelect`) and stay one here.
 */
export function IdSelect({
  label,
  ids,
  value,
  allowRoot,
  onChange,
}: {
  label: string;
  ids: readonly string[];
  value: string | null;
  allowRoot?: boolean;
  onChange: (id: string | null) => void;
}) {
  const present = value ?? (allowRoot ? ROOT : '');
  const base = allowRoot ? [ROOT, ...ids] : [...ids];
  const options = value && !ids.includes(value) ? [value, ...base] : base;
  return (
    <Field label={label}>
      <Select
        size="sm"
        aria-label={label}
        placeholder="Select"
        value={present || null}
        onChange={(k) => onChange(k === ROOT ? null : String(k))}
      >
        {options.map((id) => (
          <ListBoxItem key={id} id={id} textValue={id === ROOT ? '(root part)' : id}>
            {id === ROOT ? '(root part)' : id}
          </ListBoxItem>
        ))}
      </Select>
    </Field>
  );
}
