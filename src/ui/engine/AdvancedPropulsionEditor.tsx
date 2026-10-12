import { useStore } from '@nanostores/react';
import { Field, ListBoxItem, Select, TextField } from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { FeedsField } from '../FeedsField';
import { ReactionPicker } from './ReactionPicker';
import { ownerOf } from './editorKit';
import { $part, pushUndo, updateAdvancedEngineModule } from '../../state/editorStore';
import { feedTargetsOf } from '../../state/feedTargets';
import type { ThermalCore, AntimatterRamCore } from '../../ksa/types';

type Props = { templateId: string | null; index: number };

export function ThermalCoreEditor(props: Props) {
  return <CoreEditor {...props} kind="thermalCore" />;
}

export function AntimatterRamCoreEditor(props: Props) {
  return <CoreEditor {...props} kind="antimatterRamCore" />;
}

/** Numeric/text edits stream; structural picks push exactly one undo step. */
function CoreEditor({
  templateId,
  index,
  kind,
}: Props & { kind: 'thermalCore' | 'antimatterRamCore' }) {
  const part = useStore($part);
  const owner = ownerOf(part, templateId);
  const thermal = kind === 'thermalCore' ? owner?.thermalCores[index] : undefined;
  const ram = kind === 'antimatterRamCore' ? owner?.antimatterRamCores[index] : undefined;
  const core = thermal ?? ram;
  if (!core) return null;
  const begin = () => pushUndo('edit propulsion core', core.id);
  const update = (patch: Partial<ThermalCore & AntimatterRamCore>) =>
    updateAdvancedEngineModule(kind, templateId, index, patch);
  const targets = feedTargetsOf(part);
  const numbers = thermal
    ? [
        {
          key: 'coreTemperatureK',
          label: 'Core temperature (K)',
          value: thermal.coreTemperatureK,
          scale: 1,
        },
        {
          key: 'maxPressurePa',
          label: 'Chamber pressure (bar)',
          value: thermal.maxPressurePa / 1e5,
          scale: 1e5,
        },
        {
          key: 'thermalEfficiency',
          label: 'Thermal efficiency',
          value: thermal.thermalEfficiency,
          scale: 1,
        },
      ]
    : [
        { key: 'jetPowerW', label: 'Jet power (TW)', value: ram!.jetPowerW / 1e12, scale: 1e12 },
        {
          key: 'annihilationEfficiency',
          label: 'Annihilation efficiency',
          value: ram!.annihilationEfficiency,
          scale: 1,
        },
        {
          key: 'carriedExhaustFractionOfLight',
          label: 'Carried exhaust velocity (fraction of light)',
          value: ram!.carriedExhaustFractionOfLight,
          scale: 1,
        },
      ];
  return (
    <div className="flex flex-col gap-2">
      <Field label="Module id">
        <TextField
          aria-label="Core module id"
          value={core.id}
          onFocus={begin}
          onChange={(id) => update({ id })}
        />
      </Field>
      <FeedsField
        label="Feeds from"
        feeds={core.feeds}
        connectorIds={targets.connectorIds}
        containers={targets.containers}
        allowParent={templateId !== null}
        onChange={(feeds) => {
          begin();
          update({ feeds: [...feeds] });
        }}
      />
      {thermal && (
        <>
          <ReactionPicker
            label="Thermal working fluid"
            kind="thermal"
            value={thermal.reactionId}
            onPick={(reactionId) => {
              begin();
              update({ reactionId });
            }}
          />
          <Field label="Plumbing">
            <Select
              aria-label="Thermal core plumbing"
              value={thermal.plumbing}
              onChange={(plumbing) => {
                begin();
                update({ plumbing: plumbing === 'Service' ? 'Service' : 'Bulk' });
              }}
            >
              <ListBoxItem id="Bulk">Bulk</ListBoxItem>
              <ListBoxItem id="Service">Service</ListBoxItem>
            </Select>
          </Field>
        </>
      )}
      {ram && (
        <>
          <Field label="Antimatter phase id">
            <TextField
              aria-label="Antimatter phase id"
              value={ram.antimatterId}
              onFocus={begin}
              onChange={(antimatterId) => update({ antimatterId })}
            />
          </Field>
          <Field label="Reaction mass phase id">
            <TextField
              aria-label="Reaction mass phase id"
              value={ram.reactionMassId}
              onFocus={begin}
              onChange={(reactionMassId) => update({ reactionMassId })}
            />
          </Field>
          <p className="text-[11px] text-fg-subtle">
            The performance preview uses carried propellant. Scoop flow and relative velocity are
            supplied by the assembled vehicle in KSA.
          </p>
        </>
      )}
      {numbers.map((field) => (
        <Field key={field.key} label={field.label}>
          <PreciseNumberInput
            aria-label={field.label}
            value={field.value}
            min={0}
            onInteractionStart={begin}
            onCommit={(value) => update({ [field.key]: value * field.scale })}
          />
        </Field>
      ))}
      <Field label="Minimum throttle (%)">
        <PreciseNumberInput
          aria-label="Core minimum throttle percent"
          value={core.minimumThrottle * 100}
          min={1}
          max={100}
          onInteractionStart={begin}
          onCommit={(value) => update({ minimumThrottle: value / 100 })}
        />
      </Field>
      <Field label="Minimum pulse time (s; 0 uses 0.001)">
        <PreciseNumberInput
          aria-label="Core minimum pulse time seconds"
          value={core.minimumPulseTimeS ?? 0}
          min={0}
          onInteractionStart={begin}
          onCommit={(value) => update({ minimumPulseTimeS: value > 0 ? value : null })}
        />
      </Field>
    </div>
  );
}

export function MagneticScoopEditor({ templateId, index }: Props) {
  const part = useStore($part);
  const scoop = ownerOf(part, templateId)?.magneticScoops[index];
  if (!scoop) return null;
  const begin = () => pushUndo('edit magnetic scoop', scoop.id);
  return (
    <div className="flex flex-col gap-2">
      <Field label="Module id">
        <TextField
          aria-label="Scoop module id"
          value={scoop.id}
          onFocus={begin}
          onChange={(id) => updateAdvancedEngineModule('magneticScoop', templateId, index, { id })}
        />
      </Field>
      <Field label="Capture radius (m)">
        <PreciseNumberInput
          aria-label="Scoop capture radius meters"
          value={scoop.captureRadiusM}
          min={0}
          onInteractionStart={begin}
          onCommit={(captureRadiusM) =>
            updateAdvancedEngineModule('magneticScoop', templateId, index, { captureRadiusM })
          }
        />
      </Field>
      <Field label="Collected substance phase id">
        <TextField
          aria-label="Scoop collects phase id"
          value={scoop.collectsId}
          onFocus={begin}
          onChange={(collectsId) =>
            updateAdvancedEngineModule('magneticScoop', templateId, index, { collectsId })
          }
        />
      </Field>
      <p className="text-[11px] text-fg-subtle">
        Collection depends on the vehicle's interstellar environment and velocity; a single Part has
        no collection-rate preview.
      </p>
    </div>
  );
}
