import { useStore } from '@nanostores/react';
import { cn, Kbd, keyLabel } from '../kit';
import { StatusChip, StatusDivider } from './StatusChip';
import { $heldModifiers, $modifierHints } from '../../state/modifierStore';

/**
 * Status-bar segment 7 — the **modifier hints** (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.4; foundation §5).
 *
 * flexo's power gestures are invisible in v1: nothing on screen says that ⇧-click adds to
 * the selection. This segment says what the keys you could hold — or ARE holding — would do
 * for the surface under the pointer, and it is pure data: providers registered in
 * `modifierHintProviders.ts` answer the question, `$modifierHints` sorts and gates them, and
 * this component only draws.
 *
 * Two render rules from §1.4:
 * - At most **3** hints, ascending priority.
 * - A hint whose modifier is CURRENTLY HELD renders accent-bright; the rest stay
 *   `text-fg-muted`. That is the "this one is live right now" affordance, and it is the only
 *   reason `$heldModifiers` is read here at all — the hint LIST never depends on it.
 *
 * Desktop only (it is a keyboard feature), and it hides below 860px together with the
 * rotate/nudge chips (§1.1 overflow rule) — keyboard affordances degrade first.
 *
 * Undo enrollment: NONE. Persistence: NONE.
 */
export function ModifierHints() {
  const hints = useStore($modifierHints);
  const held = useStore($heldModifiers);

  if (hints.length === 0) return null;

  return (
    // The whole segment, divider included, is one responsive unit (§1.1).
    <span className="hidden items-center min-[860px]:flex">
      <StatusDivider />
      <StatusChip className="gap-1.5">
        {hints.slice(0, 3).map((hint, index) => (
          <span key={`${hint.mod}:${hint.label}`} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-fg-subtle">·</span>}
            <span
              className={cn(
                'flex items-center gap-1',
                hint.mod !== 'none' && held[hint.mod] ? 'text-accent' : 'text-fg-muted',
              )}
            >
              {(hint.keys ?? [keyLabel(hint.mod as keyof typeof held)]).map((token) => (
                <Kbd key={token}>{token}</Kbd>
              ))}
              <span>{hint.label}</span>
            </span>
          </span>
        ))}
      </StatusChip>
    </span>
  );
}
