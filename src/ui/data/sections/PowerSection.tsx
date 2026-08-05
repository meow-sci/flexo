import { Button, Field, ItemCard, SectionTitle, Switch, Tooltip } from '../../kit';
import { PreciseNumberInput } from '../../PreciseNumberInput';
import { Vec3Field } from '../../Vec3Field';
import { DEG2RAD, RAD2DEG } from '../../format';
import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import {
  addBattery,
  addGenerator,
  addPowerConsumer,
  addSolarPanel,
  pushUndo,
  removeBattery,
  removeGenerator,
  removePowerConsumer,
  removeSolarPanel,
  setBatteryCapacity,
  setGeneratorOutput,
  setPowerConsumerLightIsActive,
  setPowerConsumerLightSwitch,
  setPowerConsumerWatts,
  setSolarPanelOutput,
  setSolarPanelRotation,
} from '../../../state/editorStore';
import type { EditingPart, EulerXYZ, SolarPanel } from '../../../ksa/types';

/**
 * **Power** — batteries, generators, solar panels and the single power consumer / light
 * switch (design: §A4.1 Power, decision D14; census §1.1 Power).
 *
 * The one presentation change from v1 is D14: solar-panel **orientation displays in degrees**
 * like every other angle in the app. Storage is unchanged radians — the conversion happens at
 * the field boundary exactly as the light aim-rotation fields do, so export output is
 * byte-identical. v1 labelled this one field "(radians)" while lights and gimbals used
 * degrees, which is census pain 10.
 *
 * **Undo enrollment** (§A10): add/remove buttons and both consumer Switches are discrete
 * editorStore actions; every number field streams one push at interaction start.
 */
export function PowerSection({ part, meta }: { part: EditingPart; meta: SectionMeta }) {
  const g = part.gameData;

  return (
    <DataSection sectionId="power" count={meta.count} issue={meta.issue}>
      <NumberList
        label="Batteries"
        unit="Wh"
        addLabel="Battery"
        values={g.batteries.map((b) => b.capacityWh)}
        onAdd={addBattery}
        onRemove={removeBattery}
        onChange={setBatteryCapacity}
      />
      <NumberList
        label="Generators"
        unit="W"
        addLabel="Generator"
        values={g.generators.map((generator) => generator.outputWatts)}
        onAdd={addGenerator}
        onRemove={removeGenerator}
        onChange={setGeneratorOutput}
      />
      <SolarPanelsList
        solarPanels={g.solarPanels}
        onAdd={addSolarPanel}
        onRemove={removeSolarPanel}
        onChangeOutput={setSolarPanelOutput}
        onChangeRotation={setSolarPanelRotation}
      />
      <PowerConsumerCard part={part} />
    </DataSection>
  );
}

/** A generic single-number list (battery Wh, generator W). */
function NumberList({
  label,
  unit,
  values,
  onAdd,
  onRemove,
  onChange,
  addLabel,
}: {
  label: string;
  unit: string;
  values: readonly number[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, n: number) => void;
  addLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>{label}</SectionTitle>
      {values.map((value, i) => (
        <div key={i} className="flex items-end gap-2">
          <Field label={`#${i + 1} (${unit})`}>
            <PreciseNumberInput
              aria-label={`${label} ${i + 1} in ${unit}`}
              value={value}
              min={0}
              onInteractionStart={() => pushUndo(`edit ${addLabel}`, '')}
              onCommit={(n) => onChange(i, n)}
            />
          </Field>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => onRemove(i)}
            aria-label={`Remove ${addLabel} ${i + 1}`}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button size="sm" className="self-start" onPress={onAdd}>
        + {addLabel}
      </Button>
    </div>
  );
}

/**
 * The solar-panel card list, callback-driven so the identical component serves the Part
 * scope's Power section and the template scope's own Solar section (design §A4.2).
 *
 * Orientation is stored as Euler XYZ **radians** and shown in **degrees** (D14); the
 * `onChangeRotation` callback still receives radians, so the store and the serializer see
 * exactly what v1 wrote.
 */
export function SolarPanelsList({
  solarPanels,
  onAdd,
  onRemove,
  onChangeOutput,
  onChangeRotation,
  heading = true,
}: {
  solarPanels: readonly SolarPanel[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChangeOutput: (i: number, watts: number) => void;
  onChangeRotation: (i: number, rotation: EulerXYZ) => void;
  /** Suppressed when the list IS the section (template scope), where the header says it. */
  heading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {heading && <SectionTitle>Solar Panels</SectionTitle>}
      {solarPanels.map((panel, i) => (
        <ItemCard key={i} title={`Solar Panel ${i + 1}`} onRemove={() => onRemove(i)}>
          <Field label="Produced (W)">
            <PreciseNumberInput
              aria-label={`Solar panel ${i + 1} produced watts`}
              value={panel.outputWatts}
              min={0}
              onInteractionStart={() => pushUndo('edit solar panel', '')}
              onCommit={(n) => onChangeOutput(i, n)}
            />
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-fg-subtle">Orientation (°)</span>
            <Vec3Field
              value={{
                x: panel.transform.rotation.x * RAD2DEG,
                y: panel.transform.rotation.y * RAD2DEG,
                z: panel.transform.rotation.z * RAD2DEG,
              }}
              onInteractionStart={() => pushUndo('edit solar panel', '')}
              onCommit={(axis, deg) =>
                onChangeRotation(i, { ...panel.transform.rotation, [axis]: deg * DEG2RAD })
              }
            />
          </div>
        </ItemCard>
      ))}
      <Button size="sm" className="self-start" onPress={onAdd}>
        + Solar Panel
      </Button>
    </div>
  );
}

/**
 * The part's **single** power consumer / light switch — KSA has exactly one
 * `Part.LightSwitch` slot, so the add button is disabled (with the reason in a tooltip) once
 * one exists. Both v1 contextual hints are preserved verbatim: the "switch controls nothing"
 * warning and the "lights always on" hint.
 */
function PowerConsumerCard({ part }: { part: EditingPart }) {
  const consumer = part.gameData.powerConsumer;
  const placed = new Set(part.placements.map((p) => p.subPartTemplateId));
  // A light counts only when it will actually exist in-game: part-level always, a
  // SubPart-owned one only while its owner template is placed at least once.
  const hasLights = part.lights.some(
    (l) => l.ownerTemplateId === null || placed.has(l.ownerTemplateId),
  );
  const hasGlow = part.customMeshes.some((m) => placed.has(m.subPartId) && m.emissive);
  const switchControlsNothing = !!consumer?.lightSwitch && !hasLights && !hasGlow;
  const lightsAlwaysOn = hasLights && !consumer?.lightSwitch;

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Power &amp; Light Switch</SectionTitle>
      {consumer ? (
        <ItemCard title="Power consumer" onRemove={removePowerConsumer}>
          <Field label="Consumed (W)">
            <PreciseNumberInput
              aria-label="Consumed watts"
              value={consumer.consumedWatts}
              min={0}
              onInteractionStart={() => pushUndo('edit consumer', '')}
              onCommit={setPowerConsumerWatts}
            />
          </Field>
          <Switch isSelected={consumer.lightSwitch} onChange={setPowerConsumerLightSwitch}>
            Light switch (toggles all of this part&rsquo;s lights in-game)
          </Switch>
          <Switch
            isSelected={consumer.lightIsActive}
            isDisabled={!consumer.lightSwitch}
            onChange={setPowerConsumerLightIsActive}
          >
            Starts on (initial state)
          </Switch>
          {switchControlsNothing && (
            <span className="text-xs text-warning">
              This light switch controls nothing — the part has no lights or glowing meshes.
            </span>
          )}
        </ItemCard>
      ) : (
        <Button size="sm" className="self-start" onPress={addPowerConsumer}>
          + Power consumer / light switch
        </Button>
      )}
      {consumer && (
        <Tooltip content="KSA has a single Part.LightSwitch slot — one consumer per part.">
          <span className="self-start text-[11px] text-fg-subtle">
            One consumer per part (KSA limit).
          </span>
        </Tooltip>
      )}
      {lightsAlwaysOn && (
        <span className="text-xs text-fg-subtle">
          This part&rsquo;s lights are always on in flight — add a light switch to toggle them.
        </span>
      )}
    </div>
  );
}
