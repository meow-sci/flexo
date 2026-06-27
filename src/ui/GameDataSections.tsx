import { Button, Switch, Select, ListBoxItem, TextField, SectionTitle } from './kit'
import { PreciseNumberInput } from './PreciseNumberInput'
import { Vec3Field } from './Vec3Field'
import { DEG2RAD, RAD2DEG } from './format'
import { pushUndo } from '../state/editorStore'
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
  setBatteryCapacity,
  setCustomMass,
  setCustomMassEnabled,
  setDecouplerConnector,
  setDecouplerEnabled,
  setDecouplerForce,
  setDisplayName,
  setDockingPortConnector,
  setDockingPortEnabled,
  setDockingPortLatchingImpulse,
  setDockingPortPushoffForce,
  setEvaDoorConnector,
  setEvaDoorEnabled,
  setGeneratorOutput,
  setLightPosition,
  setLightRayTracing,
  setLightRotation,
  setLightType,
  setPowerConsumerWatts,
  setSolarPanelOutput,
  setSolarPanelRotation,
  setTankShape,
  updateLight,
  updateTank,
} from '../state/editorStore'
import type {
  EditingPart,
  EulerXYZ,
  Light,
  LightType,
  PartGameData,
  SolarPanel,
  Tank,
  TankShape,
} from '../ksa/types'

/** A light's RGB (each 0–1) as a "#rrggbb" hex string for the native color picker. */
function rgb01ToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const h = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Inverse of {@link rgb01ToHex}: "#rrggbb" → RGB floats in 0–1. */
function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

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

const RAD_LABEL = 'text-xs text-fg-subtle'

/** A label above a control (stacks cleanly on narrow/mobile widths). */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={RAD_LABEL}>{label}</span>
      {children}
    </label>
  )
}

/** A removable card wrapping one list item's fields (tank, battery, …). */
function ItemCard({
  title,
  onRemove,
  children,
}: {
  title: string
  onRemove: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-panel-sunken p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-muted">{title}</span>
        <Button size="sm" variant="ghost" onPress={onRemove} aria-label={`Remove ${title}`}>
          Remove
        </Button>
      </div>
      {children}
    </div>
  )
}

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
  )
}

// --- Mass ---

export function MassSection({ gameData }: { gameData: PartGameData }) {
  const enabled = gameData.customMass != null
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
  )
}

// --- Tanks (per SubPart template) ---

export function TanksSection({
  tanks,
  subPartTemplateId,
}: {
  tanks: Tank[]
  subPartTemplateId: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {tanks.map((tank, i) => (
        <ItemCard key={i} title={`Tank ${i + 1}`} onRemove={() => removeTank(subPartTemplateId, i)}>
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
  )
}

// --- Lights (per SubPart template) ---

/**
 * Per-SubPart light editor — full coverage of KSA's <Light> SubPartGameData schema
 * (LightModule.TemplateData). Each card edits one light. Cone angles and the aim
 * rotation are shown in DEGREES (matching the workspace TransformInspector) and
 * converted to the radians KSA stores; Point lights hide the aim rotation + cone
 * angles since KSA ignores them. Mirrors {@link TanksSection}: discrete
 * add/remove/type/raytracing self-record undo, while numeric/color fields focus-push
 * a single undo step (streaming).
 */
export function LightsSection({
  lights,
  subPartTemplateId,
}: {
  lights: Light[]
  subPartTemplateId: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {lights.map((light, i) => {
        const isSpot = light.type === 'Spot'
        return (
          <ItemCard
            key={i}
            title={`Light ${i + 1}`}
            onRemove={() => removeLight(subPartTemplateId, i)}
          >
            <Field label="Type">
              <Select
                size="sm"
                aria-label="Light type"
                value={light.type}
                onChange={(k) => setLightType(subPartTemplateId, i, k as LightType)}
              >
                <ListBoxItem id="Spot">Spot</ListBoxItem>
                <ListBoxItem id="Point">Point</ListBoxItem>
              </Select>
            </Field>
            <div className="flex flex-col gap-1">
              <span className={RAD_LABEL}>Position (m)</span>
              <Vec3Field
                value={light.transform.position}
                onInteractionStart={() => pushUndo('edit light', '')}
                onCommit={(axis, val) =>
                  setLightPosition(subPartTemplateId, i, {
                    ...light.transform.position,
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
                    x: light.transform.rotation.x * RAD2DEG,
                    y: light.transform.rotation.y * RAD2DEG,
                    z: light.transform.rotation.z * RAD2DEG,
                  }}
                  onInteractionStart={() => pushUndo('edit light', '')}
                  onCommit={(axis, deg) =>
                    setLightRotation(subPartTemplateId, i, {
                      ...light.transform.rotation,
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
                onCommit={(n) => updateLight(subPartTemplateId, i, { rangeM: n })}
              />
            </Field>
            <Field label="Intensity">
              <PreciseNumberInput
                aria-label="Light intensity"
                value={light.intensity}
                min={0}
                onInteractionStart={() => pushUndo('edit light', '')}
                onCommit={(n) => updateLight(subPartTemplateId, i, { intensity: n })}
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
                onChange={(e) =>
                  updateLight(subPartTemplateId, i, { color: hexToRgb01(e.target.value) })
                }
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
                    onCommit={(deg) =>
                      updateLight(subPartTemplateId, i, { innerAngleRad: deg * DEG2RAD })
                    }
                  />
                </Field>
                <Field label="Outer Angle (°, half-cone)">
                  <PreciseNumberInput
                    aria-label="Spot outer cone half-angle in degrees"
                    value={light.outerAngleRad * RAD2DEG}
                    min={0}
                    max={90}
                    onInteractionStart={() => pushUndo('edit light', '')}
                    onCommit={(deg) =>
                      updateLight(subPartTemplateId, i, { outerAngleRad: deg * DEG2RAD })
                    }
                  />
                </Field>
              </>
            )}
            <Switch
              isSelected={light.rayTracing}
              onChange={(on) => setLightRayTracing(subPartTemplateId, i, on)}
            >
              Ray tracing (IVA only)
            </Switch>
          </ItemCard>
        )
      })}
      <Button size="sm" onPress={() => addLight(subPartTemplateId)} className="self-start">
        + Light
      </Button>
    </div>
  )
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
  label: string
  unit: string
  values: number[]
  onAdd: () => void
  onRemove: (i: number) => void
  onChange: (i: number, n: number) => void
  addLabel: string
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
  )
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
  solarPanels: SolarPanel[]
  onAdd: () => void
  onRemove: (i: number) => void
  onChangeOutput: (i: number, watts: number) => void
  onChangeRotation: (i: number, rotation: EulerXYZ) => void
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
  )
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
      <PowerList
        label="Power Consumers"
        unit="W"
        addLabel="Consumer"
        values={gameData.powerConsumers.map((c) => c.consumedWatts)}
        onAdd={addPowerConsumer}
        onRemove={removePowerConsumer}
        onChange={setPowerConsumerWatts}
      />
    </div>
  )
}

// --- Coupling (decoupler / docking port / EVA door) ---

/** Connector-id dropdown; keeps a stale/missing id selectable so it still shows. */
function ConnectorSelect({
  connectorIds,
  value,
  onChange,
}: {
  connectorIds: string[]
  value: string
  onChange: (id: string) => void
}) {
  const options = value && !connectorIds.includes(value) ? [value, ...connectorIds] : connectorIds
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
  )
}

export function CouplingSection({ part }: { part: EditingPart }) {
  const ids = part.connectors.map((c) => c.id)
  const { decoupler, dockingPort, evaDoor } = part.gameData
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
            <Field label="Latching Impulse (N·s)">
              <PreciseNumberInput
                aria-label="Docking port latching impulse in newton-seconds"
                value={dockingPort.latchingImpulse}
                min={0}
                onInteractionStart={() => pushUndo('edit docking port', '')}
                onCommit={setDockingPortLatchingImpulse}
              />
            </Field>
            <Field label="Pushoff Force (N)">
              <PreciseNumberInput
                aria-label="Docking port push-off force in newtons"
                value={dockingPort.pushoffForce}
                min={0}
                onInteractionStart={() => pushUndo('edit docking port', '')}
                onCommit={setDockingPortPushoffForce}
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
  )
}
