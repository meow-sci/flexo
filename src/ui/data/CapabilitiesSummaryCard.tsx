import { ArrowRight } from 'lucide-react';
import { Button, SectionTitle, Tooltip } from '../kit';
import { revealEntity, select } from '../../state/editorStore';
import { setMode } from '../../state/modeStore';
import type { ConnectorCapability, EditingPart } from '../../ksa/types';

/**
 * **Connector capabilities summary** (decision D10) — READ-ONLY.
 *
 * Plumbing needs the capability list co-visible with the feed wiring that depends on it (a
 * main-engine propellant path is dead unless every connector along it declares `BulkFluid`),
 * but two editors for one field is exactly the dual-route problem this phase exists to kill.
 * So capabilities stay editable ONLY in Build's connector inspector, and this card mirrors
 * them with a per-row jump that switches modes with the connector selected.
 *
 * An EMPTY list is not "nothing" — it is KSA's implicit default `Electricity | ServiceFluid`
 * (`ConnectorCapabilityExtensions.ToCapability`), and `No*` entries SUBTRACT from that
 * default, which is why they render as `¬Electricity` / `¬ServiceFluid` rather than as plain
 * additions (semantics: `src/ksa/types.ts` `ConnectorCapability`).
 *
 * **Undo enrollment: NONE.** Nothing here mutates the document.
 */

const CAPABILITY_CHIP: Record<ConnectorCapability, string> = {
  BulkFluid: 'BulkFluid',
  SolidMotorCase: 'SolidMotorCase',
  NoElectricity: '¬Electricity',
  NoServiceFluid: '¬ServiceFluid',
  DecouplerJoint: 'DecouplerJoint',
};

export function CapabilitiesSummaryCard({ part }: { part: EditingPart }) {
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Connector capabilities</SectionTitle>
      {part.connectors.length === 0 ? (
        <span className="text-xs text-fg-subtle">
          No connectors — add them in Build mode. Nothing can flow into or out of the part without
          one.
        </span>
      ) : (
        <>
          {part.connectors.map((connector) => (
            <div
              key={connector.id}
              className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-panel-sunken px-1.5 py-1"
            >
              <span className="min-w-0 shrink-0 truncate font-mono text-[11px] text-fg">
                {connector.id}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                {connector.capabilities.length === 0 ? (
                  <span className="text-[11px] text-fg-subtle">
                    default: Electricity + ServiceFluid
                  </span>
                ) : (
                  connector.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded border border-border px-1 text-[11px] text-fg-muted"
                    >
                      {CAPABILITY_CHIP[capability]}
                    </span>
                  ))
                )}
              </span>
              <Tooltip content="Edit capabilities on the connector in Build mode">
                <Button
                  iconOnly
                  size="xs"
                  variant="ghost"
                  className="size-5 shrink-0"
                  aria-label={`Edit ${connector.id} in Build mode`}
                  onPress={() => {
                    setMode('build');
                    select([{ kind: 'connector', id: connector.id }]);
                    revealEntity('connector', connector.id);
                  }}
                >
                  <ArrowRight size={11} />
                </Button>
              </Tooltip>
            </div>
          ))}
          <span className="text-xs text-fg-subtle">
            Read-only here — capabilities are edited on the connector itself, so there is only ever
            one editor for the field.
          </span>
        </>
      )}
    </div>
  );
}
