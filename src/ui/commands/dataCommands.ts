import type { Command } from '../../state/commandStore';
import { $dataScope, jumpToSection, sectionsFor, setDataScope } from '../../state/dataModeStore';
import { $part, setCustomMassEnabled, setIvaEnabled } from '../../state/editorStore';
import {
  addMassDefinition,
  massDefinitionsFor,
  removeMassDefinition,
  type MassOwner,
} from '../../state/massStore';
import { setMode } from '../../state/modeStore';
import { MASS_SHAPES, MASS_SHAPE_DEFS } from '../../ksa/massDefinitions';

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
 * Scope and jumps are ephemeral view state; the IVA toggle records one document undo step.
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
    id: 'data.massRemovePreservedCustom',
    title: 'Remove preserved custom part mass',
    keywords: 'gamedata mass inertia custom',
    enabled: () => $part.get().gameData.customMass != null,
    run: () => setCustomMassEnabled(false),
  },
  ...MASS_SHAPES.map(
    (shape): Command => ({
      id: `data.massAdd:${shape}`,
      title:
        shape === 'CustomMass'
          ? 'Add custom mass'
          : `Add ${MASS_SHAPE_DEFS[shape].label.toLowerCase()} mass`,
      keywords: 'gamedata mass inertia distribution shape density material',
      run: (params) => {
        const scope = $dataScope.get();
        const owner =
          params === undefined
            ? scope.kind === 'part'
              ? null
              : scope.templateId
            : (params as { owner: MassOwner }).owner;
        addMassDefinition(owner, shape);
        if (owner == null) scopePart();
        else scopeTemplate(owner);
        jumpToSection('mass');
      },
    }),
  ),
  {
    id: 'data.toggleIva',
    title: 'Toggle part IVA mode',
    keywords: 'gamedata interior camera seat enable disable attached internal',
    checked: () => $part.get().gameData.ivaEnabled,
    run: () => setIvaEnabled(!$part.get().gameData.ivaEnabled),
  },
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
      keywords: 'gamedata subpart template mass tanks lights solar engine',
      run: () => scopeTemplate(templateId),
    });
  }
  return out;
}

/** A definition's editor id keeps the remove command stable when another card is deleted. */
export function massRemoveCommandId(owner: MassOwner, id: string): string {
  return `data.massRemove:${owner == null ? 'part' : `template:${encodeURIComponent(owner)}`}:${id}`;
}

/** Palette actions for definitions in the currently focused Data scope. */
export function massDefinitionCommands(): Command[] {
  const scope = $dataScope.get();
  const owner = scope.kind === 'part' ? null : scope.templateId;
  return massDefinitionsFor($part.get(), owner).map((definition, index) => ({
    id: massRemoveCommandId(owner, definition.id),
    title: `Remove mass ${index + 1}: ${MASS_SHAPE_DEFS[definition.shape].label}`,
    keywords: 'gamedata mass inertia distribution remove delete',
    run: () => removeMassDefinition(owner, index),
  }));
}
