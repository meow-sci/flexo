import { useStore } from '@nanostores/react';
import { Tooltip } from '../kit';
import { StatusChipButton, StatusDivider } from './StatusChip';
import { $advisories, type Advisory } from '../../state/statusStore';
import { runCommand } from '../../state/commandStore';

/**
 * Status-bar segment 6b — the **advisory chips** (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.8; foundation §5).
 *
 * The condition tier of feedback: an advisory is true until it is FIXED, which is exactly
 * why it cannot be a status message (those expire) or a notification (those are read once).
 * `advisoryWiring.ts` raises them; this draws them, amber, and clicking one runs the command
 * that resolves it.
 *
 * At most TWO render; anything past that collapses into the first chip's tooltip, so the
 * segment can never push the bar around. The slot is deliberately small — new advisories
 * need design review (§1.8).
 *
 * Undo enrollment: NONE.
 */
export function AdvisoryChips() {
  const advisories = useStore($advisories);

  if (advisories.length === 0) return null;

  const shown = advisories.slice(0, 2);
  const overflow = advisories.slice(2);

  return (
    <>
      <StatusDivider />
      {shown.map((advisory, index) => (
        <AdvisoryChip
          key={advisory.id}
          advisory={advisory}
          overflow={index === 0 ? overflow : []}
        />
      ))}
    </>
  );
}

function AdvisoryChip({ advisory, overflow }: { advisory: Advisory; overflow: Advisory[] }) {
  const commandId = advisory.commandId;

  return (
    <Tooltip
      content={
        <div className="flex flex-col gap-1">
          <span>{advisory.text}</span>
          {/* The extras beyond the two rendered chips — visible, just not occupying the bar. */}
          {overflow.map((extra) => (
            <span key={extra.id}>{extra.text}</span>
          ))}
          {commandId && <span className="text-fg-subtle">Click to fix</span>}
        </div>
      }
    >
      {/* Never `isDisabled`, even for the (unshipped) command-less advisory: a disabled
          react-aria button is not hoverable, and the tooltip is where the overflow lives. */}
      <StatusChipButton
        aria-label={advisory.text}
        className="text-warning"
        onPress={() => {
          if (commandId) runCommand(commandId);
        }}
      >
        <span>{advisory.text}</span>
        {overflow.length > 0 && (
          <span className="font-mono tabular-nums text-fg-subtle">+{overflow.length}</span>
        )}
      </StatusChipButton>
    </Tooltip>
  );
}
