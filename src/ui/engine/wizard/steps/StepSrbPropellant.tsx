import { ListBoxItem, Select } from '../../../kit';
import { GRAIN_GEOMETRY_IDS } from '../../../../ksa/types';
import type { ReactionData } from '../../../../ksa/reactionCatalog';
import { ReactionPicker } from '../../ReactionPicker';
import { PA_PER_BAR } from '../../editorKit';
import { StepSection, WizardNumberField } from '../wizardFields';
import { GRAIN_GEOMETRY_DESCRIPTIONS, WIZARD_BOUNDS } from '../wizardPresets';
import type { SrbWizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **SRB step — Propellant** (`plans/ENGINE_WIZARD_PLAN.md` §7.7): which solid burns in the
 * case, at what chamber pressure, and what shape the grain is cored to.
 *
 * The pressure field is the one that can refuse to load: `SolidMotorTemplate.Create` THROWS
 * when `<DefaultPressure>` sits outside its reaction's
 * `(MinimumBurnPressure, MaxStablePressure]`, so the field's helper line reads that window
 * off the LIVE catalog rather than stating a generic range. While the catalog is still
 * loading (or the reaction is unknown) the line falls back to a neutral hint — it never
 * renders a computed `NaN`, because a bogus window is worse than no window.
 */

/** Pa → bar for a helper line, at one decimal. */
const bar = (pa: number) => Math.round((pa / PA_PER_BAR) * 10) / 10;

/**
 * The pressure field's helper text: the reaction's own burn window when the catalog can
 * supply both limits, a neutral sentence otherwise.
 */
function pressureHint(reaction: ReactionData | undefined): string {
  if (!reaction) {
    return 'Pick a solid propellant to see the pressure window KSA will accept for it.';
  }
  const min = reaction.kind === 'Fixed' ? reaction.minimumBurnPressurePa : null;
  const max = reaction.kind === 'Fixed' ? reaction.maxStablePressurePa : null;
  if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) {
    return `The catalog lists no burn-pressure window for ${reaction.name}.`;
  }
  return `${reaction.name} burns between ${bar(min)} and ${bar(max)} bar — outside that KSA throws at load.`;
}

export function StepSrbPropellant({ state, patch, reactions }: WizardStepProps<SrbWizardState>) {
  const reaction = reactions?.get(state.reactionId);

  return (
    <div className="flex flex-col gap-4">
      <StepSection title="Propellant">
        <ReactionPicker
          label="Reaction"
          value={state.reactionId}
          kind="solid"
          // A solid motor's reaction is always Fixed, and a Fixed reaction takes no mixture
          // ratio — so the picker's second argument has nothing to write here.
          onPick={(reactionId) => patch({ reactionId })}
        />
        <WizardNumberField
          label="Default pressure"
          suffix="bar"
          value={state.defaultPressureBar}
          onChange={(v) => patch({ defaultPressureBar: v })}
          min={WIZARD_BOUNDS.chamberPressureBar.min}
          max={WIZARD_BOUNDS.chamberPressureBar.max}
          description={pressureHint(reaction)}
        />
        <WizardNumberField
          label="Thermal efficiency"
          suffix="%"
          value={state.thermalEffPct}
          onChange={(v) => patch({ thermalEffPct: v })}
          min={WIZARD_BOUNDS.efficiencyPct.min}
          max={WIZARD_BOUNDS.efficiencyPct.max}
        />
      </StepSection>

      <StepSection
        title="Grain geometry"
        description="How the grain is cored — it sets the burning-area profile, and with it the shape of the thrust curve."
      >
        <Select
          size="sm"
          label="Grain shape"
          selectedKey={state.grainGeometryId}
          onSelectionChange={(k) => patch({ grainGeometryId: String(k) })}
        >
          {GRAIN_GEOMETRY_IDS.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{id}</span>
                <span data-subtitle className="truncate text-[11px] text-fg-subtle">
                  {GRAIN_GEOMETRY_DESCRIPTIONS[id] ?? 'stock grain profile'}
                </span>
              </span>
            </ListBoxItem>
          ))}
        </Select>
      </StepSection>
    </div>
  );
}
