import { noteBox } from '../../../kit';
import { mixtureRatioBounds } from '../../../../ksa/reactionCatalog';
import { ReactionPicker } from '../../ReactionPicker';
import { StepSection, WizardNumberField, WizardRow } from '../wizardFields';
import { WIZARD_BOUNDS } from '../wizardPresets';
import type { RcsWizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **RCS step — Propellant** (`plans/ENGINE_WIZARD_PLAN.md` §7.11): the thruster chamber and
 * its nozzle — the same numbers a liquid engine carries, plus the minimum pulse time that
 * makes a thruster a thruster.
 *
 * The plumbing note is static because there is nothing to decide: RCS draws **ServiceFluid**,
 * which a bare connector carries by default (§2.5 rule 7), so unlike a Bulk-plumbed liquid
 * engine no capability has to be added anywhere for propellant to reach the block.
 */
export function StepRcsPropellant({ state, patch, reactions }: WizardStepProps<RcsWizardState>) {
  const reaction = reactions?.get(state.reactionId);
  const isFixed = reaction?.kind === 'Fixed';
  const bounds = reaction ? mixtureRatioBounds(reaction) : null;

  return (
    <div className="flex flex-col gap-4">
      <StepSection title="Propellant">
        <ReactionPicker
          label="Reaction"
          value={state.reactionId}
          kind="combustor"
          onPick={(reactionId, defaultMixtureRatio) => {
            // A Fixed reaction takes NO mixture ratio — KSA refuses to load a combustor that
            // carries one (§2.5 rule 9), so the null is a load requirement, not a nicety.
            const picked = reactions?.get(reactionId);
            patch({
              reactionId,
              mixtureRatio: picked?.kind === 'Fixed' ? null : defaultMixtureRatio,
            });
          }}
        />
        {!isFixed && (
          <WizardNumberField
            label="Mixture ratio (O/F)"
            value={state.mixtureRatio ?? 0}
            onChange={(v) => patch({ mixtureRatio: v })}
            step={0.1}
            description={
              bounds
                ? `Tabulated between ${round2(bounds.min)} and ${round2(bounds.max)}; outside that KSA clamps to the table's edge.`
                : undefined
            }
          />
        )}
      </StepSection>

      <StepSection title="Chamber">
        <WizardRow>
          <WizardNumberField
            label="Max pressure"
            suffix="bar"
            value={state.maxPressureBar}
            onChange={(v) => patch({ maxPressureBar: v })}
            min={WIZARD_BOUNDS.chamberPressureBar.min}
            max={WIZARD_BOUNDS.chamberPressureBar.max}
          />
          <WizardNumberField
            label="Thermal efficiency"
            suffix="%"
            value={state.thermalEffPct}
            onChange={(v) => patch({ thermalEffPct: v })}
            min={WIZARD_BOUNDS.efficiencyPct.min}
            max={WIZARD_BOUNDS.efficiencyPct.max}
          />
        </WizardRow>
        <WizardNumberField
          label="Minimum pulse time"
          suffix="ms"
          value={state.minPulseMs}
          onChange={(v) => patch({ minPulseMs: v })}
          min={WIZARD_BOUNDS.minPulseMs.min}
          max={WIZARD_BOUNDS.minPulseMs.max}
          step={0.1}
          description="KSA floors this at 1 ms."
        />
      </StepSection>

      <StepSection title="Nozzle">
        <WizardRow>
          <WizardNumberField
            label="Exit diameter"
            suffix="m"
            value={state.exitDiameterM}
            onChange={(v) => patch({ exitDiameterM: v })}
            min={WIZARD_BOUNDS.exitDiameterM.min}
            max={WIZARD_BOUNDS.exitDiameterM.max}
            step={0.05}
          />
          <WizardNumberField
            label="Area ratio"
            value={state.areaRatio}
            onChange={(v) => patch({ areaRatio: v })}
            min={WIZARD_BOUNDS.areaRatio.min}
            max={WIZARD_BOUNDS.areaRatio.max}
          />
        </WizardRow>
        <WizardRow>
          <WizardNumberField
            label="Flow efficiency"
            suffix="%"
            value={state.flowEffPct}
            onChange={(v) => patch({ flowEffPct: v })}
            min={WIZARD_BOUNDS.efficiencyPct.min}
            max={WIZARD_BOUNDS.efficiencyPct.max}
          />
          <WizardNumberField
            label="Expansion efficiency"
            suffix="%"
            value={state.expansionEffPct}
            onChange={(v) => patch({ expansionEffPct: v })}
            min={WIZARD_BOUNDS.efficiencyPct.min}
            max={WIZARD_BOUNDS.efficiencyPct.max}
          />
        </WizardRow>
      </StepSection>

      <div className={noteBox}>
        Plumbing: Service — RCS draws ServiceFluid, which every connector carries by default.
      </div>
    </div>
  );
}

/** The LUT's ratio bounds are raw table edges — two decimals is all a helper line needs. */
function round2(n: number): string {
  return String(Math.round(n * 100) / 100);
}
