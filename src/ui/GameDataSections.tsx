import { Button, Checkbox, Select, ListBoxItem, TextField } from './kit'
import { PreciseNumberInput } from './PreciseNumberInput'
import { pushUndo } from '../state/editorStore'
import {
  addBattery,
  addGenerator,
  addPowerConsumer,
  addTank,
  removeBattery,
  removeGenerator,
  removePowerConsumer,
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
  setDockingPortForce,
  setEvaDoorConnector,
  setEvaDoorEnabled,
  setGeneratorOutput,
  setPowerConsumerWatts,
  setTankShape,
  updateTank,
} from '../state/editorStore'
import type { EditingPart, PartGameData, TankShape } from '../ksa/types'

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
      <Checkbox isSelected={enabled} onChange={setCustomMassEnabled}>
        Custom mass override
      </Checkbox>
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

// --- Tanks ---

export function TanksSection({ gameData }: { gameData: PartGameData }) {
  return (
    <div className="flex flex-col gap-2">
      {gameData.tanks.map((tank, i) => (
        <ItemCard key={i} title={`Tank ${i + 1}`} onRemove={() => removeTank(i)}>
          <Field label="Shape">
            <Select
              size="sm"
              aria-label="Tank shape"
              selectedKey={tank.shape}
              onSelectionChange={(k) => setTankShape(i, k as TankShape)}
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
              onChange={(v) => updateTank(i, { wallMaterialId: v })}
            />
          </Field>
          {tank.shape === 'Cylindrical' && (
            <Field label="Length (m)">
              <PreciseNumberInput
                aria-label="Tank length in meters"
                value={tank.lengthM}
                min={0}
                onInteractionStart={() => pushUndo('edit tank', '')}
                onCommit={(n) => updateTank(i, { lengthM: n })}
              />
            </Field>
          )}
          <Field label="Outer Radius (m)">
            <PreciseNumberInput
              aria-label="Tank outer radius in meters"
              value={tank.outerRadiusM}
              min={0}
              onInteractionStart={() => pushUndo('edit tank', '')}
              onCommit={(n) => updateTank(i, { outerRadiusM: n })}
            />
          </Field>
          <Field label="Wall Thickness (mm)">
            <PreciseNumberInput
              aria-label="Tank wall thickness in millimeters"
              value={tank.wallThicknessMm}
              min={0}
              onInteractionStart={() => pushUndo('edit tank', '')}
              onCommit={(n) => updateTank(i, { wallThicknessMm: n })}
            />
          </Field>
        </ItemCard>
      ))}
      <Button size="sm" onPress={addTank} className="self-start">
        + Tank
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
      <span className="text-xs uppercase tracking-wide text-fg-subtle">{label}</span>
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
          <Button size="sm" variant="ghost" onPress={() => onRemove(i)} aria-label={`Remove ${addLabel} ${i + 1}`}>
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

export function PowerSection({ gameData }: { gameData: PartGameData }) {
  return (
    <div className="flex flex-col gap-4">
      <PowerList
        label="Batteries"
        unit="kWh"
        addLabel="Battery"
        values={gameData.batteries.map((b) => b.capacityKWh)}
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
          selectedKey={value || null}
          placeholder="Select a connector"
          onSelectionChange={(k) => onChange(String(k))}
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
        <Checkbox isSelected={decoupler != null} onChange={setDecouplerEnabled}>
          Decoupler
        </Checkbox>
        {decoupler && (
          <>
            <ConnectorSelect connectorIds={ids} value={decoupler.connectorId} onChange={setDecouplerConnector} />
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
        <Checkbox isSelected={dockingPort != null} onChange={setDockingPortEnabled}>
          Docking Port
        </Checkbox>
        {dockingPort && (
          <>
            <ConnectorSelect connectorIds={ids} value={dockingPort.connectorId} onChange={setDockingPortConnector} />
            <Field label="Force (N)">
              <PreciseNumberInput
                aria-label="Docking port force in newtons"
                value={dockingPort.force}
                min={0}
                onInteractionStart={() => pushUndo('edit docking port', '')}
                onCommit={setDockingPortForce}
              />
            </Field>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Checkbox isSelected={evaDoor != null} onChange={setEvaDoorEnabled}>
          EVA Door
        </Checkbox>
        {evaDoor && (
          <ConnectorSelect connectorIds={ids} value={evaDoor.connectorId} onChange={setEvaDoorConnector} />
        )}
      </div>
    </div>
  )
}
