import { useStore } from '@nanostores/react';
import { Brush } from 'lucide-react';
import { Button } from '../kit';
import { $activeTool, disarmTool } from '../../state/modeStore';
import { $activeAnimation, $memberPaintTarget } from '../../state/animationStore';
import { openPanelSheet } from '../shell/phone/phoneSheets';

/**
 * **The phone member-paint chip** (design-animation-mode.md §14 row 3) — `🖌 → HingeL · Done`,
 * docked above the condensed status bar while `member-paint` is armed.
 *
 * It exists because painting needs the VIEWPORT: arming 🖌 from the Members view dismisses
 * the Panel sheet, and this chip is then the only thing on screen that says which joint the
 * taps are writing to and how to get back. `Done` disarms the tool and re-opens the sheet,
 * where the rows changed during the session flash (`$memberPaintChanges`).
 *
 * The routing itself is input-agnostic (P11C.03): a tap in the viewport goes through the same
 * `paintMemberOnTarget` a desktop click does, so this is chrome, not a second paint mode.
 *
 * It takes the transport chip's slot while armed — one docked chip at a time, and the one
 * that matters during a paint session is this one.
 *
 * Undo enrollment: NONE of its own — each painted tap pushes its own discrete step.
 */
export function PhonePaintChip() {
  const tool = useStore($activeTool);
  const anim = useStore($activeAnimation);
  const targetId = useStore($memberPaintTarget);

  if (tool !== 'member-paint') return null;
  const joint = anim?.joints.find((j) => j.id === targetId) ?? null;

  return (
    <div className="flex min-h-11 flex-none items-center gap-1 border-t border-border bg-accent/10 px-2 text-xs">
      <Brush className="size-4 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-fg-subtle">→ </span>
        <span className="text-fg">{joint?.name ?? 'no joint'}</span>
        <span className="text-fg-subtle"> · tap SubParts to assign</span>
      </span>
      <Button
        size="sm"
        variant="secondary"
        className="min-h-11 shrink-0"
        onPress={() => {
          disarmTool('member-paint');
          openPanelSheet();
        }}
      >
        Done
      </Button>
    </div>
  );
}
