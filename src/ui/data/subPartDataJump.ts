import { setDataScope } from '../../state/dataModeStore';
import { setMode } from '../../state/modeStore';

/**
 * Build's **"SubPart Data →"** jump: the SubPart inspector's button and the Outliner row's ⋮
 * item both land in Data mode scoped to that template (design: §A2 entry table, D11 "from
 * Build, selection/Outliner expose jumps only — never editors").
 *
 * It replaces the interim atom plus the v1 SubPart Data modal this phase deletes — there is
 * no dialog left to open.
 *
 * The scope is set BEFORE the mode switch as well as through the payload, because `setMode`
 * early-returns when the mode is already current: a jump fired from inside Data mode must
 * still retarget the form.
 *
 * **Undo enrollment: NONE** — a mode switch is never an undo step (foundation §2.3).
 */
export function openSubPartData(subPartTemplateId: string): void {
  const scope = { kind: 'template', templateId: subPartTemplateId } as const;
  setDataScope(scope);
  setMode('data', { scope });
}
