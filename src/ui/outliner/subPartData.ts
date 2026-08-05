import { atom } from 'nanostores';

/**
 * The SubPart template whose Data editor the Outliner has open, or null.
 *
 * An atom rather than row-local state because BOTH surfaces that open it — a row's ⋮ menu and
 * the panel's context menu — unmount the instant the item is chosen, so there is nowhere in a
 * row for the "which template" answer to live. `OutlinerPanel` renders the modal off it.
 *
 * Ephemeral view state: never persisted, never an undo step.
 *
 * TODO(P6): delete with the v1 `ManageTanksModal` when SubPart Data becomes a Data-mode jump
 * command with template scope. It exists so the row action does not regress in the meantime.
 */
export const $subPartDataTemplateId = atom<string | null>(null);

/** Opens the (interim) SubPart Data editor for a template. */
export function openSubPartData(subPartTemplateId: string): void {
  $subPartDataTemplateId.set(subPartTemplateId);
}
