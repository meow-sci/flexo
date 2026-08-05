import type { Command } from '../../state/commandStore';
import { jumpToSection, sectionsFor, setDataScope } from '../../state/dataModeStore';
import { $part } from '../../state/editorStore';
import { setMode } from '../../state/modeStore';

/**
 * Data-mode commands (design: design-data-engine-modes.md §A9).
 *
 * **Palette-only, deliberately** — `MENU_SPEC` is the authoritative menubar tree and has no
 * Data-scope items; inventing placements it does not have would be a tree change, not a
 * parity fix. The discoverable route to the mode is the mode switcher, `3` and `mode.data`;
 * these are the *scope* shortcuts on top of it.
 *
 * They replace the v1 `data.partData` command, which opened the fullscreen Part Data dialog
 * that this phase deletes (design D11 "the modals die"). The dialog has no successor to
 * re-point at — its content is now a mode — so the id retires with it rather than becoming a
 * synonym that would put two identical rows in the palette.
 *
 * `data.jumpSection:*` rows are unbound by design: the section chips and the navigator's
 * child rows fire the same `jumpToSection` intent directly, and these entries exist so a
 * section is reachable by name without hunting for its chip.
 *
 * **Undo enrollment: NONE** — scope and jumps are ephemeral view state (§A10), and a mode
 * switch is never an undo step (foundation §2.3).
 */

/** Enters Data mode (if needed) and scopes the left form to the Part. */
function scopePart(): void {
  setDataScope({ kind: 'part' });
  setMode('data', { scope: { kind: 'part' } });
}

/** Enters Data mode (if needed) and scopes the left form to one SubPart template. */
function scopeTemplate(templateId: string): void {
  setDataScope({ kind: 'template', templateId });
  setMode('data', { scope: { kind: 'template', templateId } });
}

export const DATA_COMMANDS: Command[] = [
  {
    id: 'data.scopePart',
    title: 'Edit part data',
    keywords: 'gamedata part data identity mass tanks power coupling wiring passthrough',
    run: scopePart,
  },
  ...sectionsFor({ kind: 'part' }).map(
    (def): Command => ({
      id: `data.jumpSection:${def.id}`,
      title: `Edit part data: ${def.label}`,
      keywords: 'gamedata section jump part data',
      run: () => {
        scopePart();
        jumpToSection(def.id);
      },
    }),
  ),
];

/**
 * Dynamic provider: "Edit data: TankB" per SubPart template with at least one placement —
 * every one of them is data-capable (census §1.2), so the row set is the placed-template set.
 * Re-evaluated on every palette keystroke, so it always describes the live document.
 */
export function dataScopeCommands(): Command[] {
  const seen = new Set<string>();
  const out: Command[] = [];
  for (const placement of $part.get().placements) {
    const templateId = placement.subPartTemplateId;
    if (seen.has(templateId)) continue;
    seen.add(templateId);
    out.push({
      id: `data.scopeTemplate:${templateId}`,
      title: `Edit data: ${templateId}`,
      keywords: 'gamedata subpart template tanks lights solar engine',
      run: () => scopeTemplate(templateId),
    });
  }
  return out;
}
