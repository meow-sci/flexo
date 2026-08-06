import { useStore } from '@nanostores/react';
import { ChevronUp, X } from 'lucide-react';
import { Button, Dialog, Sheet } from './kit';
import { ModeFocusEditor } from './ModeFocusEditor';
import {
  $inspectorSheetOpen,
  closePhoneSheets,
  openInspectorSheet,
} from './shell/phone/phoneSheets';
import { $selectionCount } from './../state/selectors';
import { $dataScope } from '../state/dataModeStore';
import { $mode } from '../state/modeStore';
import { $activeAnimation, $activeJointId, $editKeyframeId } from '../state/animationStore';

/**
 * The phone **Inspector sheet** (foundation §12 Sheet row; design-build-mode.md §11 item 2)
 * — the LEFT sidebar's content, opened from a selection FAB in the viewport's corner.
 *
 * The split between the two phone sheets mirrors the desktop's two sidebars exactly:
 * the **Panel sheet** (re-tap the active mode tab) hosts the mode primary — the Outliner in
 * Build, the Data navigator in Data — and this one hosts the focus editor. It renders the
 * IDENTICAL desktop component ({@link ModeFocusEditor}), so every per-kind card, the
 * multi-select panel, the aid editors, the tool parameter cards and Data mode's whole scope
 * form arrive with the same rules and no phone fork. The one phone ADDITION is inside the
 * transform card: `TouchNudgeCluster`, which gives touch the nudge and rotate the keyboard
 * gets from the arrows and `W`/`S`.
 *
 * In **Data mode the FAB carries the scope name** rather than the selection count (design
 * §A8): what the sheet will show is the scope, and the selection is not what drives it. In
 * **Animation mode it carries the focus context** — the active joint's name, or `kf @1.2s`
 * for a pinned column (design-animation-mode.md §14 row 4) — for the same reason: the focus
 * editor there answers to the clip, not to the placement selection.
 *
 * The open flag lives in `phoneSheets` rather than in local state because Data mode hands the
 * two sheets back and forth — a navigator row opens this one, `‹ Scopes` goes back, and
 * "Select in 3D" closes it so the highlight is visible.
 *
 * The sheet renders nothing while closed (react-aria's `ModalOverlay`), so each open is a
 * fresh mount — no first-render predicate frozen by React Compiler.
 *
 * Undo enrollment: NONE — sheet visibility is ephemeral view state.
 */
export function MobileInspector() {
  const open = useStore($inspectorSheetOpen);
  const selectedCount = useStore($selectionCount);
  const mode = useStore($mode);
  const scope = useStore($dataScope);
  const anim = useStore($activeAnimation);
  const jointId = useStore($activeJointId);
  const pinId = useStore($editKeyframeId);

  const scopeLabel =
    mode === 'data'
      ? scope.kind === 'part'
        ? 'Part'
        : scope.templateId
      : mode === 'animation'
        ? animationFocusLabel(anim, jointId, pinId)
        : null;

  return (
    <>
      <Button
        size="lg"
        variant="secondary"
        className="absolute bottom-3 right-3 min-h-11 shadow-popover"
        onPress={openInspectorSheet}
        aria-label="Open inspector"
      >
        <ChevronUp className="size-4" />
        <span className="max-w-[14ch] truncate">{scopeLabel ?? 'Inspector'}</span>
        {scopeLabel === null && selectedCount > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-fg">
            {selectedCount}
          </span>
        )}
      </Button>

      <Sheet
        isOpen={open}
        onOpenChange={(next) => (next ? openInspectorSheet() : closePhoneSheets())}
        detent="92"
        ariaLabel="Inspector"
      >
        <Dialog className="min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-end border-b border-border px-2 py-1">
            <Button
              iconOnly
              size="sm"
              variant="ghost"
              className="size-11"
              aria-label="Close inspector"
              onPress={closePhoneSheets}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ModeFocusEditor />
          </div>
        </Dialog>
      </Sheet>
    </>
  );
}

/**
 * The Animation FAB's badge text: the joint being posed, else the pinned column's time, else
 * the clip. Null (⇒ the generic "Inspector") only when no clip is open, which is exactly when
 * the focus editor shows its mode cheat-card.
 */
function animationFocusLabel(
  anim: {
    name: string;
    joints: { id: string; name: string }[];
    keyframes: { id: string; timeSec: number }[];
  } | null,
  jointId: string | null,
  pinId: string | null,
): string | null {
  if (!anim) return null;
  const joint = anim.joints.find((j) => j.id === jointId);
  if (joint) return joint.name;
  const pinned = anim.keyframes.find((k) => k.id === pinId);
  if (pinned) return `kf @${pinned.timeSec.toFixed(2)}s`;
  return anim.name;
}
