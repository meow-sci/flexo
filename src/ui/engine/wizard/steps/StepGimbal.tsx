import { Checkbox, Switch, noteBox } from '../../../kit';
import { StepSection, WizardNumberField, WizardRow } from '../wizardFields';
import { WIZARD_BOUNDS } from '../wizardPresets';
import type { LiquidWizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **Step 4 — Gimbal** (`plans/ENGINE_WIZARD_PLAN.md` §7.4): thrust vectoring.
 *
 * A `<Gimbal>` names a PLACEMENT, so a template with no placement cannot be gimballed at all —
 * the step disables itself and says why rather than letting the user author an entry
 * `buildWizardPart` would have to drop.
 */
export function StepGimbal({ state, patch, part }: WizardStepProps<LiquidWizardState>) {
  // Generated geometry always brings its own placement; only an existing template can be
  // unplaced. (`part` geometry is not reachable for a liquid engine, but it is equally hostless.)
  const geometry = state.geometry;
  const hostable =
    geometry.kind === 'generate' ||
    (geometry.kind === 'template' &&
      part.placements.some((p) => p.subPartTemplateId === geometry.templateId));

  if (!hostable) {
    return (
      <div className={noteBox}>
        This engine has no placed SubPart to deflect, so it cannot gimbal. Go back and generate
        geometry or pick a mesh template that is actually placed.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StepSection title="Thrust vectoring">
        <Switch
          isSelected={state.gimbal.enabled}
          onChange={(v) => patch({ gimbal: { ...state.gimbal, enabled: v } })}
        >
          Thrust vectoring
        </Switch>
        <WizardRow>
          <WizardNumberField
            label="Max angle Y"
            suffix="°"
            value={state.gimbal.maxYDeg}
            onChange={(v) => patch({ gimbal: { ...state.gimbal, maxYDeg: v } })}
            min={WIZARD_BOUNDS.gimbalDeg.min}
            max={WIZARD_BOUNDS.gimbalDeg.max}
            isDisabled={!state.gimbal.enabled}
          />
          <WizardNumberField
            label="Max angle Z"
            suffix="°"
            value={state.gimbal.maxZDeg}
            onChange={(v) => patch({ gimbal: { ...state.gimbal, maxZDeg: v } })}
            min={WIZARD_BOUNDS.gimbalDeg.min}
            max={WIZARD_BOUNDS.gimbalDeg.max}
            isDisabled={!state.gimbal.enabled}
          />
        </WizardRow>
        <Checkbox
          isSelected={state.gimbal.constrainToCircle}
          onChange={(v) => patch({ gimbal: { ...state.gimbal, constrainToCircle: v } })}
          isDisabled={!state.gimbal.enabled}
        >
          Constrain to circle
        </Checkbox>
        <p className="text-xs leading-snug text-fg-subtle">
          The gimbal deflects the whole SubPart; thrust must run along its local X — the wizard
          guarantees this for generated geometry.
        </p>
      </StepSection>
    </div>
  );
}
