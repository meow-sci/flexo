import { DisclosureSection, ListBoxItem, Select, Switch } from '../../../kit';
import { VOLUMETRIC_EXHAUST_IDS } from '../../../../ksa/types';
import { NONE } from '../../editorKit';
import { StepSection, WizardOptionalNumberField } from '../wizardFields';
import type { LiquidWizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **Step 5 — Effects** (`plans/ENGINE_WIZARD_PLAN.md` §7.5): the plume, the exhaust light and
 * the engine sound. Nothing here changes what the engine does — it changes what it looks and
 * sounds like doing it.
 */
export function StepFx({ state, patch }: WizardStepProps<LiquidWizardState>) {
  return (
    <div className="flex flex-col gap-4">
      <StepSection title="Plume">
        <Select
          size="sm"
          label="Volumetric exhaust"
          selectedKey={state.fx.volumetricExhaustId ?? NONE}
          onSelectionChange={(k) => {
            const key = String(k);
            patch({ fx: { ...state.fx, volumetricExhaustId: key === NONE ? null : key } });
          }}
        >
          <ListBoxItem id={NONE} textValue="(none)">
            (none)
          </ListBoxItem>
          {VOLUMETRIC_EXHAUST_IDS.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
      </StepSection>

      <StepSection title="Light & sound">
        <Switch
          isSelected={state.fx.exhaustLight}
          onChange={(v) => patch({ fx: { ...state.fx, exhaustLight: v } })}
        >
          Exhaust light
        </Switch>
        <Switch
          isSelected={state.fx.engineSound}
          onChange={(v) => patch({ fx: { ...state.fx, engineSound: v } })}
        >
          Engine sound
        </Switch>
      </StepSection>

      <DisclosureSection title="Advanced">
        <WizardOptionalNumberField
          label="FX exit diameter"
          suffix="m"
          placeholder="auto"
          value={state.fx.fxExitDiameterM}
          onChange={(v) => patch({ fx: { ...state.fx, fxExitDiameterM: v } })}
          min={0}
          step={0.1}
          description="Visual only — KSA sizes the plume from the exit diameter when blank."
        />
      </DisclosureSection>
    </div>
  );
}
