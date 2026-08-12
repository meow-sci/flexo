import { Checkbox } from '../../../kit';
import { StepSection, WizardOptionalNumberField } from '../wizardFields';
import type { LiquidWizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **Step 6 — Structure** (`plans/ENGINE_WIZARD_PLAN.md` §7.6): the part's dry mass and whether
 * the generated boxes get a collider fitted around them.
 */
export function StepStructure({ state, patch }: WizardStepProps<LiquidWizardState>) {
  return (
    <div className="flex flex-col gap-4">
      <StepSection title="Mass">
        <WizardOptionalNumberField
          label="Dry mass"
          suffix="kg"
          placeholder="none"
          value={state.structure.dryMassKg}
          onChange={(v) => patch({ structure: { ...state.structure, dryMassKg: v } })}
          min={0}
          step={10}
          description="Emitted as <CustomMass>; leave blank to skip — KSA requires a mass greater than 0 when present."
        />
      </StepSection>

      {state.geometry.kind === 'generate' && (
        <Checkbox
          isSelected={state.structure.autoCollider}
          onChange={(v) => patch({ structure: { ...state.structure, autoCollider: v } })}
        >
          Fit a collider around the generated geometry
        </Checkbox>
      )}
    </div>
  );
}
