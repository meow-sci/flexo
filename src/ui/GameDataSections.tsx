import { useStore } from '@nanostores/react';
import {
  Button,
  Field,
  ItemCard,
  ListBoxItem,
  SectionTitle,
  Select,
  Switch,
  TextField,
} from './kit';
import { PreciseNumberInput } from './PreciseNumberInput';
import { Vec3Field } from './Vec3Field';
import { DEG2RAD, RAD2DEG } from './format';
import { hexToRgb01, rgb01ToHex } from './colorHex';
import { $part, pushUndo } from '../state/editorStore';
import {
  addBattery,
  addGenerator,
  addLight,
  addPowerConsumer,
  addSolarPanel,
  addTank,
  removeBattery,
  removeGenerator,
  removeLight,
  removePowerConsumer,
  removeSolarPanel,
  removeTank,
  revealEntity,
  select,
  setBatteryCapacity,
  setControllable,
  setCustomMass,
  setCustomMassEnabled,
  setDecouplerConnector,
  setDecouplerEnabled,
  setDecouplerForce,
  setDiameter,
  setDiameterEnabled,
  setDisplayName,
  setDockingPortConnector,
  setDockingPortEnabled,
  setDockingPortLatchingKineticEnergy,
  setDockingPortPushoffImpulse,
  setEvaDoorConnector,
  setEvaDoorEnabled,
  setGeneratorOutput,
  setLightPosition,
  setLightRayTracing,
  setLightRotation,
  setLightType,
  setPowerConsumerLightIsActive,
  setPowerConsumerLightSwitch,
  setPowerConsumerWatts,
  setSolarPanelOutput,
  setSolarPanelRotation,
  setTankShape,
  updateLight,
  updateTank,
} from '../state/editorStore';
import type {
  EditingPart,
  EulerXYZ,
  LightType,
  PartGameData,
  PowerConsumer,
  SolarPanel,
  Tank,
  TankShape,
} from '../ksa/types';

/**
 * The "popup-only" GameData editors used inside the Part Data dialog — every
 * field that has no 3D representation (connectors are edited in the workspace
 * instead). Mirrors space-tape's GameDataEditorUi.cs sections. Each control
 * calls an editorStore action directly; numeric/text fields focus-push a single
 * undo step (streaming), list add/remove + checkboxes self-record (discrete).
 *
 * Layout is plain stacked rows so the same components work in the desktop modal
 * and the mobile scroll sheet.
 */

// `Field` and `ItemCard` moved to `src/ui/kit/Field.tsx` in P6.06 — they are primitives, and
// this file is a feature file. This module keeps no copy.

/** Dim caption style for the inline notes below a control. */
const RAD_LABEL = 'text-xs text-fg-subtle';

// --- Identity (display name) ---

export function IdentityFields({ gameData }: { gameData: PartGameData }) {
  return (
    <Field label="Display Name (in-game name; blank uses the Part Id)">
      <TextField
        size="sm"
        aria-label="Display name"
        value={gameData.displayName}
        onFocus={() => pushUndo('edit display name', gameData.displayName)}
        onChange={setDisplayName}
        placeholder="(uses Part Id)"
      />
    </Field>
  );
}

// --- Size class (diameter) + command capability ---

/**
 * Part-level catalog/capability markers that have no 3D representation: the
 * `<Diameter M/>` VAB size-class filter (a numeric size class — no physics effect)
 * and the bare `<Control/>` command marker that makes the part vehicle-controllable.
 * Both are optional; diameter toggles between absent (null) and a value.
 */
export function SizeControlFields({ gameData }: { gameData: PartGameData }) {
  const diameterEnabled = gameData.diameterM != null;
  return (
    <div className="flex flex-col gap-2">
      <Switch isSelected={diameterEnabled} onChange={setDiameterEnabled}>
        Diameter size class
      </Switch>
      {diameterEnabled && (
        <Field label="Diameter (m, VAB size-class filter)">
          <PreciseNumberInput
            aria-label="Part diameter in meters"
            value={gameData.diameterM ?? 0}
            min={0}
            onInteractionStart={() => pushUndo('edit diameter', '')}
            onCommit={setDiameter}
          />
        </Field>
      )}
      <Switch isSelected={gameData.controllable} onChange={setControllable}>
        Command capable (controllable)
      </Switch>
    </div>
  );
}

// --- Mass ---

export function MassSection({ gameData }: { gameData: PartGameData }) {
  const enabled = gameData.customMass != null;
  return (
    <div className="flex flex-col gap-2">
      <Switch isSelected={enabled} onChange={setCustomMassEnabled}>
        Custom mass override
      </Switch>
      {enabled && (
        <Field label="Mass (kg)">
          <PreciseNumberInput
            aria-label="Custom mass in kilograms"
            value={gameData.customMass ?? 0}
            min={0}
            onInteractionStart={() => pushUndo('edit mass', '')}
            onCommit={setCustomMass}
          />
        </Field>
      )}
    </div>
  );
}

// --- Tanks (per SubPart template) ---

export function TanksSection({
  tanks,
  subPartTemplateId,
}: {
  tanks: Tank[];
  /**
   * The tank owner: a SubPart template id, or `null` for the `<PartGameData>` itself.
   * Part-level is where Core authors its prefab tank data, and the only level a
   * `<FeedsFrom Container>` can address without a `SubPart=` scope.
   */
  subPartTemplateId: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      {tanks.map((tank, i) => (
        <ItemCard key={i} title={`Tank ${i + 1}`} onRemove={() => removeTank(subPartTemplateId, i)}>
          <Field label="Feed id (reference it from an engine's Feeds from → Container)">
            <TextField
              size="sm"
              aria-label="Tank feed id"
              inputClassName="font-mono"
              placeholder="e.g. Fuel"
              value={tank.id}
              onFocus={() => pushUndo('edit tank', '')}
              onChange={(v) => updateTank(subPartTemplateId, i, { id: v })}
            />
          </Field>
          <Field label="Shape">
            <Select
              size="sm"
              aria-label="Tank shape"
              value={tank.shape}
              onChange={(k) => setTankShape(subPartTemplateId, i, k as TankShape)}
            >
              <ListBoxItem id="Cylindrical">Cylindrical</ListBoxItem>
              <ListBoxItem id="Spherical">Spherical</ListBoxItem>
            </Select>
          </Field>
          <Field label="Wall Material Id">
            <TextField
              size="sm"
              aria-label="Wall material id"
              inputClassName="font-mono"
              value={tank.wallMaterialId}
              onFocus={() => pushUndo('edit tank', '')}
              onChange={(v) => updateTank(subPartTemplateId, i, { wallMaterialId: v })}
            />
          </Field>
          {tank.shape === 'Cylindrical' && (
            <Field label="Length (m)">
              <PreciseNumberInput
                aria-label="Tank length in meters"
                value={tank.lengthM}
                min={0}
                onInteractionStart={() => pushUndo('edit tank', '')}
                onCommit={(n) => updateTank(subPartTemplateId, i, { lengthM: n })}
              />
            </Field>
          )}
          <Field label="Outer Radius (m)">
            <PreciseNumberInput
              aria-label="Tank outer radius in meters"
              value={tank.outerRadiusM}
              min={0}
              onInteractionStart={() => pushUndo('edit tank', '')}
              onCommit={(n) => updateTank(subPartTemplateId, i, { outerRadiusM: n })}
            />
          </Field>
          <Field label="Wall Thickness (mm)">
            <PreciseNumberInput
              aria-label="Tank wall thickness in millimeters"
              value={tank.wallThicknessMm}
              min={0}
              onInteractionStart={() => pushUndo('edit tank', '')}
              onCommit={(n) => updateTank(subPartTemplateId, i, { wallThicknessMm: n })}
            />
          </Field>
        </ItemCard>
      ))}
      <Button size="sm" onPress={() => addTank(subPartTemplateId)} className="self-start">
        + Tank
      </Button>
    </div>
  );
}

// --- Lights (owned by one SubPart template) ---

/**
 * Per-SubPart light editor — full coverage of KSA's <Light> schema
 * (LightModule.TemplateData). An owner-filtered view over `part.lights`
 * ({@link PartLight.ownerTemplateId} === `subPartTemplateId`); each card edits one
 * light, and the store indices passed to every mutator are into `part.lights`, NOT
 * this filtered view. Cone angles and the aim rotation are shown in DEGREES
 * (matching the workspace focus editor) and converted to the radians KSA
 * stores; Point lights hide the aim rotation + cone angles since KSA ignores them.
 * Mirrors {@link TanksSection}: discrete add/remove/type/raytracing self-record
 * undo, while numeric/color fields focus-push a single undo step (streaming).
 */
export function LightsSection({ subPartTemplateId }: { subPartTemplateId: string }) {
  const part = useStore($part);
  const owned = part.lights
    .map((light, index) => ({ light, index }))
    .filter(({ light }) => light.ownerTemplateId === subPartTemplateId);
  return (
    <div className="flex flex-col gap-2">
      {owned.length > 0 && (
        <span className="text-xs text-fg-subtle">
          Applies to every placed instance of this SubPart; each instance aims the light by its own
          rotation. Toggled in-game by the part's light switch.
        </span>
      )}
      {owned.map(({ light, index }, i) => {
        const isSpot = light.type === 'Spot';
        return (
          <ItemCard key={light.id} title={`Light ${i + 1}`} onRemove={() => removeLight(index)}>
            {/* Lights are first-class 3D entities: hand off to the workspace marker
                (the index passed is into part.lights, not this filtered view). */}
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onPress={() => {
                select([{ kind: 'light', id: light.id }]);
                revealEntity('light', light.id);
              }}
            >
              Select in 3D
            </Button>
            <Field label="Type">
              <Select
                size="sm"
                aria-label="Light type"
                value={light.type}
                onChange={(k) => setLightType(index, k as LightType)}
              >
                <ListBoxItem id="Spot">Spot</ListBoxItem>
                <ListBoxItem id="Point">Point</ListBoxItem>
              </Select>
            </Field>
            <div className="flex flex-col gap-1">
              <span className={RAD_LABEL}>Position (m)</span>
              <Vec3Field
                value={light.position}
                onInteractionStart={() => pushUndo('edit light', '')}
                onCommit={(axis, val) =>
                  setLightPosition(index, {
                    ...light.position,
                    [axis]: val,
                  })
                }
              />
            </div>
            {isSpot && (
              <div className="flex flex-col gap-1">
                <span className={RAD_LABEL}>Aim Rotation (°)</span>
                <Vec3Field
                  value={{
                    x: light.rotation.x * RAD2DEG,
                    y: light.rotation.y * RAD2DEG,
                    z: light.rotation.z * RAD2DEG,
                  }}
                  onInteractionStart={() => pushUndo('edit light', '')}
                  onCommit={(axis, deg) =>
                    setLightRotation(index, {
                      ...light.rotation,
                      [axis]: deg * DEG2RAD,
                    })
                  }
                />
              </div>
            )}
            <Field label="Range (m)">
              <PreciseNumberInput
                aria-label="Light range in meters"
                value={light.rangeM}
                min={0}
                onInteractionStart={() => pushUndo('edit light', '')}
                onCommit={(n) => updateLight(index, { rangeM: n })}
              />
            </Field>
            <Field label="Intensity">
              <PreciseNumberInput
                aria-label="Light intensity"
                value={light.intensity}
                min={0}
                onInteractionStart={() => pushUndo('edit light', '')}
                onCommit={(n) => updateLight(index, { intensity: n })}
              />
            </Field>
            <div className="flex items-center gap-2">
              <span className={RAD_LABEL}>Color</span>
              <input
                type="color"
                aria-label="Light color"
                className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border bg-transparent"
                value={rgb01ToHex(light.color)}
                onPointerDown={() => pushUndo('edit light', '')}
                onChange={(e) => updateLight(index, { color: hexToRgb01(e.target.value) })}
              />
            </div>
            {isSpot && (
              <>
                <Field label="Inner Angle (°, half-cone)">
                  <PreciseNumberInput
                    aria-label="Spot inner cone half-angle in degrees"
                    value={light.innerAngleRad * RAD2DEG}
                    min={0}
                    max={90}
                    onInteractionStart={() => pushUndo('edit light', '')}
                    onCommit={(deg) => updateLight(index, { innerAngleRad: deg * DEG2RAD })}
                  />
                </Field>
                <Field label="Outer Angle (°, half-cone)">
                  <PreciseNumberInput
                    aria-label="Spot outer cone half-angle in degrees"
                    value={light.outerAngleRad * RAD2DEG}
                    min={0}
                    max={90}
                    onInteractionStart={() => pushUndo('edit light', '')}
                    onCommit={(deg) => updateLight(index, { outerAngleRad: deg * DEG2RAD })}
                  />
                </Field>
              </>
            )}
            <Switch isSelected={light.rayTracing} onChange={(on) => setLightRayTracing(index, on)}>
              Ray tracing (IVA only)
            </Switch>
          </ItemCard>
        );
      })}
      <Button size="sm" onPress={() => addLight(subPartTemplateId)} className="self-start">
        + Light
      </Button>
    </div>
  );
}

// --- Power (batteries / generators / consumers) ---

/** A generic single-number list (battery kWh, generator W, consumer W). */
function PowerList({
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
  values: number[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, n: number) => void;
  addLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>{label}</SectionTitle>
      {values.map((v, i) => (
        <div key={i} className="flex items-end gap-2">
          <Field label={`#${i + 1} (${unit})`}>
            <PreciseNumberInput
              aria-label={`${label} ${i + 1} in ${unit}`}
              value={v}
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
      <Button size="sm" onPress={onAdd} className="self-start">
        + {addLabel}
      </Button>
    </div>
  );
}

/**
 * Power / light-switch editor — **one consumer per part** (KSA has a single
 * `Part.LightSwitch` slot; see `analysis/HOW_LIGHT_PARTS_WORK.md`). The consumer has
 * a draw (Consumed, W) plus `LightSwitch` (makes it a flight-toggleable switch that
 * gates ALL of the part's lights + emissive glow) and `LightIsActive` (the switch's
 * initial on/off state, only read by KSA when `LightSwitch` is set). Surfaces hints
 * when a switch controls nothing, or when lights exist with no switch (always on).
 */
function PowerConsumerSection({ powerConsumer }: { powerConsumer: PowerConsumer | null }) {
  const part = useStore($part);
  const placed = new Set(part.placements.map((p) => p.subPartTemplateId));
  // A light counts only when it will actually exist in-game: part-level always, a
  // SubPart-owned one only while its owner template is placed at least once.
  const hasLights = part.lights.some(
    (l) => l.ownerTemplateId === null || placed.has(l.ownerTemplateId),
  );
  const hasGlow = part.customMeshes.some((m) => placed.has(m.subPartId) && m.emissive);
  const switchControlsNothing = !!powerConsumer?.lightSwitch && !hasLights && !hasGlow;
  const lightsAlwaysOn = hasLights && !powerConsumer?.lightSwitch;

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Power & Light Switch</SectionTitle>
      {powerConsumer ? (
        <ItemCard title="Power consumer" onRemove={removePowerConsumer}>
          <Field label="Consumed (W)">
            <PreciseNumberInput
              aria-label="Consumed watts"
              value={powerConsumer.consumedWatts}
              min={0}
              onInteractionStart={() => pushUndo('edit consumer', '')}
              onCommit={(n) => setPowerConsumerWatts(n)}
            />
          </Field>
          <Switch
            isSelected={powerConsumer.lightSwitch}
            onChange={(on) => setPowerConsumerLightSwitch(on)}
          >
            Light switch (toggles all of this part's lights in-game)
          </Switch>
          <Switch
            isSelected={powerConsumer.lightIsActive}
            isDisabled={!powerConsumer.lightSwitch}
            onChange={(on) => setPowerConsumerLightIsActive(on)}
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
        <Button size="sm" onPress={addPowerConsumer} className="self-start">
          + Power consumer / light switch
        </Button>
      )}
      {lightsAlwaysOn && (
        <span className="text-xs text-fg-subtle">
          This part's lights are always on in flight — add a light switch to toggle them.
        </span>
      )}
    </div>
  );
}

/**
 * Solar-panel list editor: each panel has a Produced (W) output and an orientation
 * (Euler XYZ radians, the sun-facing normal). Callback-driven so the same component
 * serves both the part-level Power section and the per-SubPart modal.
 */
export function SolarPanelsSection({
  solarPanels,
  onAdd,
  onRemove,
  onChangeOutput,
  onChangeRotation,
}: {
  solarPanels: SolarPanel[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChangeOutput: (i: number, watts: number) => void;
  onChangeRotation: (i: number, rotation: EulerXYZ) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Solar Panels</SectionTitle>
      {solarPanels.map((sp, i) => (
        <ItemCard key={i} title={`Solar Panel ${i + 1}`} onRemove={() => onRemove(i)}>
          <Field label="Produced (W)">
            <PreciseNumberInput
              aria-label={`Solar panel ${i + 1} produced watts`}
              value={sp.outputWatts}
              min={0}
              onInteractionStart={() => pushUndo('edit solar panel', '')}
              onCommit={(n) => onChangeOutput(i, n)}
            />
          </Field>
          <div className="flex flex-col gap-1">
            <span className={RAD_LABEL}>Orientation (radians)</span>
            <Vec3Field
              value={sp.transform.rotation}
              onInteractionStart={() => pushUndo('edit solar panel', '')}
              onCommit={(axis, val) =>
                onChangeRotation(i, { ...sp.transform.rotation, [axis]: val })
              }
            />
          </div>
        </ItemCard>
      ))}
      <Button size="sm" onPress={onAdd} className="self-start">
        + Solar Panel
      </Button>
    </div>
  );
}

export function PowerSection({ gameData }: { gameData: PartGameData }) {
  return (
    <div className="flex flex-col gap-4">
      <PowerList
        label="Batteries"
        unit="Wh"
        addLabel="Battery"
        values={gameData.batteries.map((b) => b.capacityWh)}
        onAdd={addBattery}
        onRemove={removeBattery}
        onChange={setBatteryCapacity}
      />
      <PowerList
        label="Generators"
        unit="W"
        addLabel="Generator"
        values={gameData.generators.map((g) => g.outputWatts)}
        onAdd={addGenerator}
        onRemove={removeGenerator}
        onChange={setGeneratorOutput}
      />
      <SolarPanelsSection
        solarPanels={gameData.solarPanels}
        onAdd={addSolarPanel}
        onRemove={removeSolarPanel}
        onChangeOutput={setSolarPanelOutput}
        onChangeRotation={setSolarPanelRotation}
      />
      <PowerConsumerSection powerConsumer={gameData.powerConsumer} />
    </div>
  );
}

// --- Coupling (decoupler / docking port / EVA door) ---

/** Connector-id dropdown; keeps a stale/missing id selectable so it still shows. */
function ConnectorSelect({
  connectorIds,
  value,
  onChange,
}: {
  connectorIds: string[];
  value: string;
  onChange: (id: string) => void;
}) {
  const options = value && !connectorIds.includes(value) ? [value, ...connectorIds] : connectorIds;
  return (
    <Field label="Connector">
      {options.length === 0 ? (
        <span className="text-xs text-warning">Add a connector in the workspace first.</span>
      ) : (
        <Select
          size="sm"
          aria-label="Connector"
          placeholder="Select a connector"
          value={value || null}
          onChange={(k) => onChange(String(k))}
        >
          {options.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function CouplingSection({ part }: { part: EditingPart }) {
  const ids = part.connectors.map((c) => c.id);
  const { decoupler, dockingPort, evaDoor } = part.gameData;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Switch isSelected={decoupler != null} onChange={setDecouplerEnabled}>
          Decoupler
        </Switch>
        {decoupler && (
          <>
            <ConnectorSelect
              connectorIds={ids}
              value={decoupler.connectorId}
              onChange={setDecouplerConnector}
            />
            <Field label="Force (N)">
              <PreciseNumberInput
                aria-label="Decoupler force in newtons"
                value={decoupler.force}
                min={0}
                onInteractionStart={() => pushUndo('edit decoupler', '')}
                onCommit={setDecouplerForce}
              />
            </Field>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Switch isSelected={dockingPort != null} onChange={setDockingPortEnabled}>
          Docking Port
        </Switch>
        {dockingPort && (
          <>
            <ConnectorSelect
              connectorIds={ids}
              value={dockingPort.connectorId}
              onChange={setDockingPortConnector}
            />
            <Field label="Latching Kinetic Energy (J)">
              <PreciseNumberInput
                aria-label="Docking port latching kinetic energy in joules"
                value={dockingPort.latchingKineticEnergyJ}
                min={0}
                onInteractionStart={() => pushUndo('edit docking port', '')}
                onCommit={setDockingPortLatchingKineticEnergy}
              />
            </Field>
            <Field label="Pushoff Impulse (N·s)">
              <PreciseNumberInput
                aria-label="Docking port push-off impulse in newton-seconds"
                value={dockingPort.pushoffImpulseNs}
                min={0}
                onInteractionStart={() => pushUndo('edit docking port', '')}
                onCommit={setDockingPortPushoffImpulse}
              />
            </Field>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Switch isSelected={evaDoor != null} onChange={setEvaDoorEnabled}>
          EVA Door
        </Switch>
        {evaDoor && (
          <ConnectorSelect
            connectorIds={ids}
            value={evaDoor.connectorId}
            onChange={setEvaDoorConnector}
          />
        )}
      </div>
    </div>
  );
}
