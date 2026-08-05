import { ArrowRight } from 'lucide-react';
import { Field, Switch } from '../../kit';
import { PreciseNumberInput } from '../../PreciseNumberInput';
import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import { pushUndo, setCustomMass, setCustomMassEnabled } from '../../../state/editorStore';
import { jumpToSection } from '../../../state/dataModeStore';
import type { EditingPart } from '../../../ksa/types';

/**
 * **Mass** — the part's custom mass override (design: §A4.1; census §1.1 Mass).
 *
 * Adds the **preserved-inertia chip** (decision D2): `customMassExtras` holds the
 * `<MassSpecificInertia>` (and the `CustomMass` transform offset) an imported Core part
 * carries inside `<CustomMass>`. flexo re-emits it verbatim but v1 showed no sign it existed,
 * so a user could not tell whether their part had authored inertia. The chip says so and
 * jumps to the read-only Passthrough viewer, which is the only place that data is legible —
 * it stays uneditable by design (D2).
 *
 * **Undo enrollment**: streaming on both fields; the Switch is a discrete editorStore action.
 */
export function MassSection({ part, meta }: { part: EditingPart; meta: SectionMeta }) {
  const g = part.gameData;
  const enabled = g.customMass != null;
  const extras = g.customMassExtras.length;

  return (
    <DataSection sectionId="mass" count={meta.count} issue={meta.issue} defaultExpanded>
      <Switch isSelected={enabled} onChange={setCustomMassEnabled}>
        Custom mass override
      </Switch>
      {enabled && (
        <Field label="Mass (kg)">
          <PreciseNumberInput
            aria-label="Custom mass in kilograms"
            value={g.customMass ?? 0}
            min={0}
            onInteractionStart={() => pushUndo('edit mass', '')}
            onCommit={setCustomMass}
          />
        </Field>
      )}
      {extras > 0 && (
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 self-start rounded border border-border bg-panel-sunken px-1.5 py-0.5 text-[11px] text-fg-muted hover:border-border-strong hover:text-fg"
          onClick={() => jumpToSection('passthrough')}
        >
          <span>
            Carries {extras} preserved element{extras === 1 ? '' : 's'}{' '}
            (&lt;MassSpecificInertia&gt;…)
          </span>
          <ArrowRight size={11} />
          <span>view in Passthrough</span>
        </button>
      )}
    </DataSection>
  );
}
