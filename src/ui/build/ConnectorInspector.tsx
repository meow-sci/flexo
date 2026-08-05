import { SectionTitle, Switch } from '../kit';
import { TransformGroups } from './TransformGroups';
import { setConnectorCapabilities, setConnectorFlags } from '../../state/editorStore';
import {
  CONNECTOR_CAPABILITIES,
  CONNECTOR_FLAGS,
  type Connector,
  type ConnectorCapability,
  type ConnectorFlag,
} from '../../ksa/types';

/**
 * The connector focus card (design: design-build-mode.md §3.3) — v1's `ConnectorHeader`
 * verbatim, plus the shared transform groups whose third group is the attach-node **size
 * class** rather than a geometric scale.
 *
 * Flags (how the vehicle editor orients the Part when connecting) and capabilities (what
 * may flow across the joint) are independent axes, and both are re-emitted in KSA's
 * canonical order regardless of click order so the XML stays stable.
 *
 * **Undo enrollment**: `setConnectorFlags` / `setConnectorCapabilities` are discrete and
 * push their own step.
 */
export function ConnectorInspector({
  index,
  connector,
  locked,
}: {
  index: number;
  connector: Connector;
  locked: boolean;
}) {
  const { flags, capabilities } = connector;

  const toggleFlag = (flag: ConnectorFlag, on: boolean) => {
    const next = new Set(flags);
    if (on) next.add(flag);
    else next.delete(flag);
    setConnectorFlags(
      index,
      CONNECTOR_FLAGS.filter((f) => next.has(f)),
    );
  };
  const toggleCapability = (cap: ConnectorCapability, on: boolean) => {
    const next = new Set(capabilities);
    if (on) next.add(cap);
    else next.delete(cap);
    setConnectorCapabilities(
      index,
      CONNECTOR_CAPABILITIES.filter((c) => next.has(c)),
    );
  };

  return (
    <>
      <TransformGroups
        transform={connector}
        entityName={connector.id}
        locked={locked}
        third={{ kind: 'connectorScale' }}
      />

      <div className="flex flex-col gap-1">
        <SectionTitle>Flags</SectionTitle>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {CONNECTOR_FLAGS.map((f) => (
            <Switch
              key={f}
              isSelected={flags.includes(f)}
              isDisabled={locked}
              onChange={(on) => toggleFlag(f, on)}
            >
              {f}
            </Switch>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <SectionTitle>Capabilities</SectionTitle>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {CONNECTOR_CAPABILITIES.map((c) => (
            <Switch
              key={c}
              isSelected={capabilities.includes(c)}
              isDisabled={locked}
              onChange={(on) => toggleCapability(c, on)}
            >
              {c}
            </Switch>
          ))}
        </div>
      </div>

      <p className="text-xs leading-snug text-fg-subtle">
        None = electricity + service fluid only. Add <b>BulkFluid</b> for main-engine propellant,{' '}
        <b>SolidMotorCase</b> to stack SRB segments, <b>DecouplerJoint</b> on a decoupler&rsquo;s
        connector.
      </p>
      {/* Verified in the 4939 decomp: KSA composes connector transforms from the Part's own
          frame, never through an animated joint (AGENTS.md "KSA connectors static"). */}
      <p className="text-xs leading-snug text-fg-subtle">Connectors cannot animate with joints.</p>
    </>
  );
}
