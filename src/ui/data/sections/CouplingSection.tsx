import { Eye } from 'lucide-react';
import { Button, Field, ListBoxItem, Select, Switch, Tooltip, useIsPhone } from '../../kit';
import { PreciseNumberInput } from '../../PreciseNumberInput';
import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import { flashConnector } from '../../../state/dataModeStore';
import {
  pushUndo,
  setDecouplerConnector,
  setDecouplerEnabled,
  setDecouplerForce,
  setDockingPortConnector,
  setDockingPortEnabled,
  setDockingPortLatchingKineticEnergy,
  setDockingPortPushoffImpulse,
  setEvaDoorEnabled,
  setEvaDoorSeat,
} from '../../../state/editorStore';
import { status } from '../../../state/statusStore';
import { closePhoneSheets } from '../../shell/phone/phoneSheets';
import type { EditingPart } from '../../../ksa/types';

/**
 * **Coupling** — the decoupler, docking port and EVA door (design: §A4.1 Coupling, decision
 * D17; census §1.1 Coupling).
 *
 * Two additions over v1:
 *
 * - a **"Show →" eye** beside every connector select, flash-highlighting the picked connector
 *   in the viewport. It is only useful because Data mode never covers the 3D view — the v1
 *   fullscreen modal made spatial feedback impossible (census pain 4);
 * - the **Seat select** (D17): `<EVADoor SeatId>` aligns the kitten to one `<IVASeat>` on the
 *   way out. Picking a seat is ONE undo step that authors both halves of the link (the seat's
 *   `<IVASeat Id>` is minted if it has none) — a door pointing at an id no seat carries ships
 *   a hatch with no EVA button in-game.
 *
 * The EVA door has NO connector select: `EVADoorTemplate` carries only `SeatId`
 * (decomp/KSA/EVADoorTemplate.cs, verified at 5117 + 5168), so unlike the decoupler and the
 * docking port a hatch is not bound to a connector. flexo used to render one and emit a
 * `ConnectorId` attribute the game never reads; both were removed in P12.16.
 *
 * `ConnectorSelect` semantics are preserved verbatim (census invariant 4): a stale or deleted
 * connector id stays selectable and labelled, never silently retargeted.
 *
 * **Undo enrollment** (§A10): every Switch and every Select is a discrete editorStore action;
 * the numeric fields stream one push at interaction start.
 */
export function CouplingSection({ part, meta }: { part: EditingPart; meta: SectionMeta }) {
  const connectorIds = part.connectors.map((c) => c.id);
  const { decoupler, dockingPort, evaDoor } = part.gameData;

  return (
    <DataSection sectionId="coupling" count={meta.count} issue={meta.issue}>
      <div className="flex flex-col gap-2">
        <Switch isSelected={decoupler != null} onChange={setDecouplerEnabled}>
          Decoupler
        </Switch>
        {decoupler && (
          <>
            <ConnectorSelect
              connectorIds={connectorIds}
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
              connectorIds={connectorIds}
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
        {evaDoor && <SeatSelect part={part} seatId={evaDoor.seatId} />}
      </div>
    </DataSection>
  );
}

/**
 * Connector-id dropdown + the "Show →" eye. A stale/missing id is prepended to the options so
 * it stays selectable and visible rather than reading as "nothing picked".
 */
function ConnectorSelect({
  connectorIds,
  value,
  onChange,
}: {
  connectorIds: readonly string[];
  value: string;
  onChange: (id: string) => void;
}) {
  const isPhone = useIsPhone();
  const options = value && !connectorIds.includes(value) ? [value, ...connectorIds] : connectorIds;

  if (options.length === 0) {
    return (
      <Field label="Connector">
        <span className="text-xs text-warning">Add a connector in the workspace first.</span>
      </Field>
    );
  }

  return (
    <div className="flex items-end gap-1">
      <Field label="Connector">
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
      </Field>
      <Tooltip content="Show this connector in the viewport">
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="mb-0.5 size-7 shrink-0"
          isDisabled={!value}
          aria-label="Show the connector in the viewport"
          onPress={() => {
            flashConnector(value);
            // Phone: close the sheet so the flash it just fired is actually on screen (§A8).
            if (isPhone) {
              closePhoneSheets();
              status(`${value} shown in the viewport`);
            }
          }}
        >
          <Eye size={13} />
        </Button>
      </Tooltip>
    </div>
  );
}

const NO_SEAT = '__default';

/**
 * The D17 seat picker: document-order seats (which IS KSA's `C`-cycle order) plus the
 * "(default)" sentinel that clears `SeatId`. A `seatId` matching no seat stays selectable and
 * labelled "— not found", the same stale-reference philosophy every other picker follows.
 */
function SeatSelect({ part, seatId }: { part: EditingPart; seatId: string | null }) {
  const seats = part.ivaSeats;
  const matched = seatId === null ? -1 : seats.findIndex((s) => s.ksaId === seatId);
  const stale = seatId !== null && matched < 0;

  if (seats.length === 0 && !stale) {
    return (
      <Field label="Aligned seat (EVA exit)">
        <span className="text-xs text-fg-subtle">
          Add an IVA seat in Build mode to align the hatch to one.
        </span>
      </Field>
    );
  }

  return (
    <Field label="Aligned seat (EVA exit)">
      <Select
        size="sm"
        aria-label="EVA door aligned seat"
        value={stale ? `stale:${seatId}` : matched >= 0 ? String(matched) : NO_SEAT}
        onChange={(k) => {
          const key = String(k);
          if (key.startsWith('stale:')) return;
          setEvaDoorSeat(key === NO_SEAT ? null : Number(key));
        }}
      >
        {[
          <ListBoxItem key={NO_SEAT} id={NO_SEAT} textValue="(default)">
            (default)
          </ListBoxItem>,
          ...seats.map((seat, i) => (
            <ListBoxItem key={seat.id} id={String(i)} textValue={`Seat ${i + 1}`}>
              <span>Seat {i + 1}</span>
              {seat.ksaId && <span className="ml-1 font-mono text-fg-subtle">{seat.ksaId}</span>}
            </ListBoxItem>
          )),
          ...(stale
            ? [
                <ListBoxItem key="stale" id={`stale:${seatId}`} textValue={`${seatId} — not found`}>
                  {seatId} — not found
                </ListBoxItem>,
              ]
            : []),
        ]}
      </Select>
    </Field>
  );
}
