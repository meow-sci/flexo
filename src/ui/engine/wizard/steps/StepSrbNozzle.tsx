import { noteBox } from '../../../kit';
import { StepSection, WizardNumberField, WizardRow } from '../wizardFields';
import { WIZARD_BOUNDS } from '../wizardPresets';
import type { SrbWizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **SRB step — Nozzle** (`plans/ENGINE_WIZARD_PLAN.md` §7.9): the three fields a
 * `<SolidMotorNozzle>` actually carries.
 *
 * There is deliberately no area-ratio field. A solid nozzle's throat is SIZED BY KSA
 * (`SolidMotor.ResizeNozzles`) from the grain's burning area and the motor's default
 * pressure, so an authored area ratio would be overwritten at load — the note says so rather
 * than leaving the omission looking like a gap.
 */
export function StepSrbNozzle({ state, patch }: WizardStepProps<SrbWizardState>) {
  const nozzle = state.nozzle;

  return (
    <div className="flex flex-col gap-4">
      <StepSection title="Nozzle">
        <WizardNumberField
          label="Exit diameter"
          suffix="m"
          value={nozzle.exitDiameterM}
          onChange={(v) => patch({ nozzle: { ...nozzle, exitDiameterM: v } })}
          min={WIZARD_BOUNDS.exitDiameterM.min}
          max={WIZARD_BOUNDS.exitDiameterM.max}
          step={0.1}
        />
        <WizardRow>
          <WizardNumberField
            label="Flow efficiency"
            suffix="%"
            value={nozzle.flowEffPct}
            onChange={(v) => patch({ nozzle: { ...nozzle, flowEffPct: v } })}
            min={WIZARD_BOUNDS.efficiencyPct.min}
            max={WIZARD_BOUNDS.efficiencyPct.max}
          />
          <WizardNumberField
            label="Expansion efficiency"
            suffix="%"
            value={nozzle.expansionEffPct}
            onChange={(v) => patch({ nozzle: { ...nozzle, expansionEffPct: v } })}
            min={WIZARD_BOUNDS.efficiencyPct.min}
            max={WIZARD_BOUNDS.efficiencyPct.max}
          />
        </WizardRow>
      </StepSection>

      <div className={noteBox}>
        Throat area is sized by KSA from the grain and the default pressure — a solid nozzle has no
        area-ratio field.
      </div>
    </div>
  );
}
