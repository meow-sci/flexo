import { useStore } from '@nanostores/react';
import { Crosshair } from 'lucide-react';
import {
  Button,
  DisclosureSection,
  Field,
  ListBoxItem,
  Select,
  Switch,
  TextField,
  cn,
  noteBox,
  warningBox,
} from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { Vec3Field } from '../Vec3Field';
import { NONE, clamp01, instanceCountOf, ownerOf } from './editorKit';
import { FlashField, VecLabel } from './FlashField';
import { $part, pushUndo } from '../../state/editorStore';
import {
  updateNozzle,
  updatePartNozzle,
  updatePartSolidNozzle,
  updateReactionPlumes,
  updateSubPartSolidNozzle,
} from '../../state/editorStore';
import {
  activateEngine,
  setActiveNozzleRef,
  setExhaustPlacing,
  type NozzleKind,
} from '../../state/engineStore';
import { setMode } from '../../state/modeStore';
import { $allReactions } from '../../state/reactionStore';
import { UNIT_EPSILON } from '../../ksa/engineValidation';
import {
  DEFAULT_ENGINE_SOUND_ID,
  PLUME_TRAIL_IDS,
  VOLUMETRIC_EXHAUST_IDS,
  defaultReactionPlume,
  withDefaultReactionPlume,
  type DeLavalNozzle,
  type ReactionPlume,
  type RocketSoundAction,
  type SolidMotorNozzle,
  type Vec3,
} from '../../ksa/types';

/**
 * **The nozzle editors** (design: design-data-engine-modes.md §B4.3 / §B4.6) — one
 * `<DeLavalNozzle>` or one `<SolidMotorNozzle>`, at either scope.
 *
 * The two flavors share a body because that IS the schema: a `SolidMotorNozzle` is a
 * `DeLavalNozzle` minus `<AreaRatio>` (KSA sizes a solid throat itself as exit area ÷ 12), so
 * the only difference is that one slot — v1's discipline, kept.
 *
 * Three census invariants live in here and nowhere else:
 *
 * - **`AreaRatio` is honest-NaN.** KSA's default is NaN and `DeLavalNozzle.ComputeThroatArea`
 *   uses ratio 1. An unset ratio renders an empty field and explains that runtime default.
 * - **The physics direction is never auto-rewritten.** KSA applies thrust as
 *   `TotalThrust · -ExhaustDirection` UNNORMALIZED, so a non-unit vector silently scales the
 *   engine — it is warned about, with a one-click Normalize, and left verbatim otherwise
 *   (imports must round-trip).
 * - **The FX overrides inherit independently.** The master switch seeds or resets both;
 *   the location and direction switches can reset either override separately.
 *
 * **Undo enrollment**: field edits stream (push at interaction start); Normalize, the FX
 * override toggle and every plume-entry mutation are discrete pushes (§B11).
 */

export function NozzleEditor({ templateId, index }: { templateId: string | null; index: number }) {
  const part = useStore($part);
  const nozzle = ownerOf(part, templateId)?.nozzles[index];
  if (!nozzle) return null;
  // Typed against the De Laval superset so the AreaRatio slot type-checks; a
  // `Partial<SolidMotorNozzle>` patch is assignable to it, which is what lets the shared body
  // drive both flavors through one callback.
  const update = (patch: Partial<DeLavalNozzle>) =>
    templateId === null ? updatePartNozzle(index, patch) : updateNozzle(templateId, index, patch);
  return (
    <NozzleBody
      nozzle={nozzle}
      kind="delaval"
      templateId={templateId}
      index={index}
      instanceCount={instanceCountOf(part, templateId)}
      onUpdate={update}
      throat={
        <FlashField fieldKey="areaRatio">
          <Field label="Area ratio (exit / throat)">
            <PreciseNumberInput
              aria-label="Nozzle area ratio"
              value={nozzle.areaRatio}
              min={1}
              // KSA defaults to NaN and uses ratio 1; keep the field empty to show it is unset.
              format={(n) => (Number.isFinite(n) ? String(n) : '')}
              onInteractionStart={() => pushUndo('edit nozzle', nozzle.id)}
              onCommit={(ar) => update({ areaRatio: ar })}
            />
          </Field>
          {!Number.isFinite(nozzle.areaRatio) && (
            <p className="text-[11px] leading-snug text-warning">
              Unset — KSA uses an area ratio of 1. Set the ratio to match the intended nozzle.
            </p>
          )}
        </FlashField>
      }
    />
  );
}

/**
 * The solid-motor nozzle: the same body with the area-ratio slot swapped for the note that
 * explains why there is nothing to author there.
 */
export function SolidNozzleEditor({
  templateId,
  index,
}: {
  templateId: string | null;
  index: number;
}) {
  const part = useStore($part);
  const nozzle = ownerOf(part, templateId)?.solidNozzles[index];
  if (!nozzle) return null;
  return (
    <NozzleBody
      nozzle={nozzle}
      kind="solid"
      templateId={templateId}
      index={index}
      instanceCount={instanceCountOf(part, templateId)}
      onUpdate={(patch) =>
        templateId === null
          ? updatePartSolidNozzle(index, patch)
          : updateSubPartSolidNozzle(templateId, index, patch)
      }
      throat={
        <p className="text-[11px] leading-snug text-fg-subtle">
          KSA sizes the throat automatically (exit area ÷ 12) — solid nozzles have no area ratio.
        </p>
      }
    />
  );
}

function NozzleBody({
  nozzle,
  kind,
  templateId,
  index,
  instanceCount,
  onUpdate,
  throat,
}: {
  nozzle: SolidMotorNozzle;
  kind: NozzleKind;
  templateId: string | null;
  index: number;
  instanceCount: number;
  onUpdate: (patch: Partial<SolidMotorNozzle>) => void;
  throat: React.ReactNode;
}) {
  const begin = () => pushUndo('edit nozzle', nozzle.id);
  const fxOverride = nozzle.fxExhaustLocation !== null || nozzle.fxExhaustDirection !== null;
  const fxLocation = nozzle.fxExhaustLocation ?? nozzle.exhaustLocation;
  const fxDirection = nozzle.fxExhaustDirection ?? nozzle.exhaustDirection;

  return (
    <div className="flex flex-col gap-2">
      <Field label="Exit diameter (m)">
        <PreciseNumberInput
          aria-label="Exit diameter in meters"
          value={nozzle.exitDiameterM}
          min={0}
          step={0.1}
          onInteractionStart={begin}
          onCommit={(m) => onUpdate({ exitDiameterM: m })}
        />
      </Field>
      {throat}
      <Field label="Flow efficiency (%)">
        <PreciseNumberInput
          aria-label="Flow efficiency percent"
          value={nozzle.flowEfficiency * 100}
          min={0}
          max={100}
          onInteractionStart={begin}
          onCommit={(pct) => onUpdate({ flowEfficiency: clamp01(pct / 100) })}
        />
      </Field>
      <Field label="Expansion efficiency (%)">
        <PreciseNumberInput
          aria-label="Expansion efficiency percent"
          value={nozzle.expansionEfficiency * 100}
          min={0}
          max={100}
          onInteractionStart={begin}
          onCommit={(pct) => onUpdate({ expansionEfficiency: clamp01(pct / 100) })}
        />
      </Field>

      {instanceCount > 1 && (
        <div className={cn(noteBox, 'text-[11px] leading-snug')}>
          <span>
            These vectors are <b>shared by all {instanceCount} placements</b> of this SubPart — KSA
            instantiates this one nozzle per placement, so the numbers below drive {instanceCount}{' '}
            thrusters at once. They are in each placement&rsquo;s OWN frame, so a rotated instance
            moves the opposite way in world space (that is what aims each thruster outward). To
            place thrusters independently, author a nozzle per thruster at <b>part level</b>{' '}
            instead.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <VecLabel>Exhaust location (m)</VecLabel>
        <Vec3Field
          value={nozzle.exhaustLocation}
          onInteractionStart={begin}
          onCommit={(axis, v) =>
            onUpdate({ exhaustLocation: { ...nozzle.exhaustLocation, [axis]: v } })
          }
        />
      </div>

      <FlashField fieldKey="exhaustDirection">
        <VecLabel>Exhaust direction (unit; default −X)</VecLabel>
        <Vec3Field
          value={nozzle.exhaustDirection}
          onInteractionStart={begin}
          onCommit={(axis, v) =>
            onUpdate({ exhaustDirection: { ...nozzle.exhaustDirection, [axis]: v } })
          }
        />
        <p className="text-[11px] leading-snug text-fg-subtle">
          The direction gas LEAVES; thrust acts along −this. Stock bells point down −X in their own
          SubPart frame. Rotating the SubPart rotates mesh and exhaust together, so only this vector
          can fix a bell whose axis isn&rsquo;t −X.
        </p>
        <DirectionLengthWarning
          direction={nozzle.exhaustDirection}
          onNormalize={(unit) => {
            pushUndo('normalize direction', nozzle.id);
            onUpdate({ exhaustDirection: unit });
          }}
        />
      </FlashField>

      <Switch
        isSelected={fxOverride}
        onChange={(on) => {
          pushUndo('edit nozzle', nozzle.id);
          onUpdate(
            on
              ? {
                  fxExhaustLocation: { ...nozzle.exhaustLocation },
                  fxExhaustDirection: { ...nozzle.exhaustDirection },
                }
              : { fxExhaustLocation: null, fxExhaustDirection: null },
          );
        }}
      >
        Override FX placement (plume ≠ thrust)
      </Switch>
      {fxOverride && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-panel-sunken p-2">
          <p className="text-[11px] leading-snug text-fg-subtle">
            Where the visible plume comes from, independent of where thrust is applied — stock uses
            it to cant an RCS plume off the hull while thrust stays axial. Location and direction
            each inherit their physics value when their override is off. Cyan handle in the 3D
            viewport.
          </p>
          <Switch
            isSelected={nozzle.fxExhaustLocation !== null}
            onChange={(on) => {
              begin();
              onUpdate({ fxExhaustLocation: on ? { ...nozzle.exhaustLocation } : null });
            }}
          >
            Override FX location
          </Switch>
          {nozzle.fxExhaustLocation !== null && (
            <div className="flex flex-col gap-1">
              <VecLabel>FX location (m)</VecLabel>
              <Vec3Field
                value={fxLocation}
                onInteractionStart={begin}
                onCommit={(axis, v) =>
                  onUpdate({ fxExhaustLocation: { ...fxLocation, [axis]: v } })
                }
              />
            </div>
          )}
          <Switch
            isSelected={nozzle.fxExhaustDirection !== null}
            onChange={(on) => {
              begin();
              onUpdate({ fxExhaustDirection: on ? { ...nozzle.exhaustDirection } : null });
            }}
          >
            Override FX direction
          </Switch>
          {nozzle.fxExhaustDirection !== null && (
            <div className="flex flex-col gap-1">
              <VecLabel>FX direction (any length — visual only)</VecLabel>
              <Vec3Field
                value={fxDirection}
                onInteractionStart={begin}
                onCommit={(axis, v) =>
                  onUpdate({ fxExhaustDirection: { ...fxDirection, [axis]: v } })
                }
              />
            </div>
          )}
        </div>
      )}

      <Field label="FX exit diameter (m, 0 = match exit — visual only)">
        <PreciseNumberInput
          aria-label="FX exit diameter in meters"
          value={nozzle.fxExitDiameterM ?? 0}
          min={0}
          step={0.1}
          onInteractionStart={begin}
          onCommit={(m) => onUpdate({ fxExitDiameterM: m > 0 ? m : null })}
        />
      </Field>

      <Field label="Exhaust plume">
        <Select
          size="sm"
          aria-label="Exhaust plume template"
          value={defaultReactionPlume(nozzle.reactionPlumes)?.volumetricExhaustId ?? NONE}
          onChange={(k) =>
            updateReactionPlumes(
              { templateId, kind, index },
              withDefaultReactionPlume(nozzle.reactionPlumes, {
                volumetricExhaustId: k === NONE ? null : String(k),
              }),
            )
          }
        >
          <ListBoxItem id={NONE}>(none)</ListBoxItem>
          {VOLUMETRIC_EXHAUST_IDS.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
      </Field>
      <Field label="Plume trail (volumetric exhaust trail)">
        <Select
          size="sm"
          aria-label="Plume trail template"
          value={defaultReactionPlume(nozzle.reactionPlumes)?.plumeTrailId ?? NONE}
          onChange={(k) =>
            updateReactionPlumes(
              { templateId, kind, index },
              withDefaultReactionPlume(nozzle.reactionPlumes, {
                plumeTrailId: k === NONE ? null : String(k),
              }),
            )
          }
        >
          <ListBoxItem id={NONE}>(none)</ListBoxItem>
          {PLUME_TRAIL_IDS.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
      </Field>

      <PlumeEntries nozzle={nozzle} kind={kind} templateId={templateId} index={index} />

      <Switch
        isSelected={nozzle.sound != null}
        onChange={(on) => {
          pushUndo('edit nozzle', nozzle.id);
          onUpdate({ sound: on ? { action: 'On', soundId: DEFAULT_ENGINE_SOUND_ID } : null });
        }}
      >
        Engine sound
      </Switch>
      {nozzle.sound && (
        <div className="flex flex-col gap-2">
          <Field label="Sound event action">
            <Select
              size="sm"
              aria-label="Sound event action"
              value={nozzle.sound.action}
              onChange={(action) => {
                begin();
                onUpdate({ sound: { ...nozzle.sound!, action: action as RocketSoundAction } });
              }}
            >
              <ListBoxItem id="On">On</ListBoxItem>
              <ListBoxItem id="Off">Off</ListBoxItem>
              <ListBoxItem id="None">None</ListBoxItem>
            </Select>
          </Field>
          <Field label="Sound behavior id">
            <TextField
              size="sm"
              aria-label="Sound behavior id"
              value={nozzle.sound.soundId}
              onFocus={begin}
              onChange={(soundId) => onUpdate({ sound: { ...nozzle.sound!, soundId } })}
            />
          </Field>
        </div>
      )}
      <Switch
        isSelected={nozzle.exhaustLight}
        onChange={(on) => {
          pushUndo('edit nozzle', nozzle.id);
          onUpdate({ exhaustLight: on });
        }}
      >
        Exhaust light
      </Switch>

      <Button
        size="sm"
        variant="secondary"
        className="self-start"
        onPress={() => {
          // Works from Data mode too: switch first (the tool slot is Engine-mode-only), then
          // open the owning scope, target THIS nozzle, and arm.
          setMode('engine');
          activateEngine(templateId === null ? { kind: 'part' } : { kind: 'subpart', templateId });
          const instanceId =
            templateId === null
              ? null
              : ($part.get().placements.find((p) => p.subPartTemplateId === templateId)
                  ?.instanceId ?? null);
          setActiveNozzleRef(
            templateId === null
              ? { scope: 'part', kind, index, channel: 'physics' }
              : { scope: 'subpart', templateId, instanceId, kind, index, channel: 'physics' },
          );
          setExhaustPlacing(true);
        }}
      >
        <Crosshair size={13} /> Place this nozzle&rsquo;s exhaust in 3D
      </Button>
    </div>
  );
}

/**
 * **Plume entries** (decision D15, closing scope gap P1) — the FULL `<ReactionPlume>` list.
 *
 * KSA's `RocketNozzle.TryResolvePlume` picks the FIRST entry whose `Reaction` matches the
 * rocket core's configured reaction, else the FIRST `Default="true"` entry, else no plume at
 * all — which is why a row is either Default or reaction-keyed, never both, and why the order
 * of the list is authored data. The two Selects above stay the fast path: they edit the
 * Default entry exactly as before.
 *
 * Every mutation here is ONE discrete undo step through `updateReactionPlumes`.
 */
function PlumeEntries({
  nozzle,
  kind,
  templateId,
  index,
}: {
  nozzle: SolidMotorNozzle;
  kind: NozzleKind;
  templateId: string | null;
  index: number;
}) {
  const reactions = useStore($allReactions);
  const plumes = nozzle.reactionPlumes;
  const write = (next: ReactionPlume[]) => updateReactionPlumes({ templateId, kind, index }, next);
  const patch = (i: number, part: Partial<ReactionPlume>) =>
    write(plumes.map((p, j) => (j === i ? { ...p, ...part } : p)));
  const move = (index: number, offset: number) => {
    const next = [...plumes];
    const [entry] = next.splice(index, 1);
    next.splice(index + offset, 0, entry);
    write(next);
  };

  return (
    <DisclosureSection title="Plume entries" badge={plumes.length || ''}>
      <p className="text-[11px] leading-snug text-fg-subtle">
        KSA picks the first entry keyed to the rocket&rsquo;s current reaction, else the first
        Default entry. A row is either the default or keyed to one reaction.
      </p>
      {plumes.map((plume, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-md border border-border bg-panel-sunken p-2"
        >
          <div className="flex items-center gap-2">
            <Switch
              isSelected={plume.isDefault}
              onChange={(on) =>
                patch(i, { isDefault: on, reactionId: on ? null : plume.reactionId })
              }
            >
              Default
            </Switch>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto shrink-0"
              aria-label={`Move plume entry ${i + 1} up`}
              isDisabled={i === 0}
              onPress={() => move(i, -1)}
            >
              Up
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Move plume entry ${i + 1} down`}
              isDisabled={i === plumes.length - 1}
              onPress={() => move(i, 1)}
            >
              Down
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove plume entry ${i + 1}`}
              onPress={() => write(plumes.filter((_, j) => j !== i))}
            >
              Remove
            </Button>
          </div>
          {!plume.isDefault && (
            <Field label="Reaction">
              <Select
                size="sm"
                aria-label={`Plume entry ${i + 1} reaction`}
                value={plume.reactionId ?? NONE}
                onChange={(k) => patch(i, { reactionId: k === NONE ? null : String(k) })}
              >
                <ListBoxItem id={NONE}>(unkeyed)</ListBoxItem>
                {(plume.reactionId && !reactions.some((r) => r.id === plume.reactionId)
                  ? [{ id: plume.reactionId, name: `${plume.reactionId} — not in the catalog` }]
                  : []
                )
                  .concat(reactions.map((r) => ({ id: r.id, name: r.name })))
                  .map((r) => (
                    <ListBoxItem key={r.id} id={r.id} textValue={r.name}>
                      {r.name}
                    </ListBoxItem>
                  ))}
              </Select>
            </Field>
          )}
          <Field label="Exhaust plume">
            <Select
              size="sm"
              aria-label={`Plume entry ${i + 1} volumetric exhaust`}
              value={plume.volumetricExhaustId ?? NONE}
              onChange={(k) => patch(i, { volumetricExhaustId: k === NONE ? null : String(k) })}
            >
              <ListBoxItem id={NONE}>(none)</ListBoxItem>
              {VOLUMETRIC_EXHAUST_IDS.map((id) => (
                <ListBoxItem key={id} id={id} textValue={id}>
                  {id}
                </ListBoxItem>
              ))}
            </Select>
          </Field>
          <Field label="Plume trail">
            <Select
              size="sm"
              aria-label={`Plume entry ${i + 1} plume trail`}
              value={plume.plumeTrailId ?? NONE}
              onChange={(k) => patch(i, { plumeTrailId: k === NONE ? null : String(k) })}
            >
              <ListBoxItem id={NONE}>(none)</ListBoxItem>
              {PLUME_TRAIL_IDS.map((id) => (
                <ListBoxItem key={id} id={id} textValue={id}>
                  {id}
                </ListBoxItem>
              ))}
            </Select>
          </Field>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onPress={() =>
          write([
            ...plumes,
            {
              reactionId: null,
              isDefault: plumes.every((p) => !p.isDefault),
              volumetricExhaustId: null,
              plumeTrailId: null,
            },
          ])
        }
      >
        + Entry
      </Button>
    </DisclosureSection>
  );
}

/**
 * Warns when a nozzle's PHYSICS exhaust direction isn't unit-length, with a one-click fix.
 *
 * KSA applies thrust as `TotalThrust * -ExhaustDirection` **unnormalized**
 * (`decomp/KSA/VehicleUpdateState.cs:294`) and `Vector3Reference` does no normalizing at load,
 * so a `(0,0,-2)` direction silently doubles the engine's thrust and a `(0,0,-0.5)` halves it —
 * a bug with no in-game symptom other than wrong numbers. The value is left VERBATIM rather
 * than auto-corrected: that is how the XML is authored, imported content must round-trip
 * unchanged, and a silent rewrite would hide the very mistake being flagged. (The 3D rotate
 * handle always writes unit vectors, so this only ever fires on typed input or an import.)
 */
function DirectionLengthWarning({
  direction,
  onNormalize,
}: {
  direction: Vec3;
  onNormalize: (unit: Vec3) => void;
}) {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (Math.abs(len - 1) <= UNIT_EPSILON) return null;
  const unit: Vec3 =
    len > 0
      ? { x: direction.x / len, y: direction.y / len, z: direction.z / len }
      : { x: -1, y: 0, z: 0 }; // KSA's default axis; a zero vector has no direction to keep
  return (
    <div className={cn(warningBox, 'flex items-start justify-between gap-2')}>
      <span className="min-w-0">
        {len > 0
          ? `Length ${len.toFixed(4)}, not 1 — KSA multiplies thrust by it, so this engine pushes ${len.toFixed(2)}× its rated thrust.`
          : 'Zero length — this nozzle applies no thrust and has no plume axis.'}
      </span>
      <Button size="sm" className="shrink-0" onPress={() => onNormalize(unit)}>
        Normalize
      </Button>
    </div>
  );
}
