import { useState } from 'react';
import { Button, DisclosureSection, ListBoxItem, Select, noteBox, warningBox } from '../../../kit';
import { mixtureRatioBounds, resolveReactionLut } from '../../../../ksa/reactionCatalog';
import { predictPerformance, type EnginePerformance } from '../../../../ksa/enginePhysics';
import { ReactionPicker } from '../../ReactionPicker';
import { PA_PER_BAR } from '../../editorKit';
import { StepSection, WizardNumberField, WizardRow } from '../wizardFields';
import type { LiquidWizardState } from '../wizardModel';
import { LIQUID_PRESETS, WIZARD_BOUNDS } from '../wizardPresets';
import type { WizardStepProps } from './stepProps';

/**
 * **Step 2 — Performance** (`plans/ENGINE_WIZARD_PLAN.md` §7.2): the chamber and nozzle
 * numbers, over a live thrust/Isp readout computed with KSA's own ported math.
 *
 * The readout is the whole point of the step — every field commit re-runs
 * {@link predictPerformance}, so the user sizes an engine by watching kN rather than by
 * guessing and exporting. When the catalog cannot supply a LUT (still loading, unknown
 * reaction, a Mixture with no ratio yet) the card says so in words; it must never render
 * `NaN`.
 */

/** kN for the readout — the unit the tutorial and the Performance card both speak. */
const kN = (n: number) => `${(n / 1000).toFixed(1)} kN`;

function perfOf(
  state: LiquidWizardState,
  reactions: WizardStepProps<LiquidWizardState>['reactions'],
): EnginePerformance | null {
  const reaction = reactions?.get(state.reactionId);
  if (!reaction) return null;
  const lut = resolveReactionLut(reaction, state.mixtureRatio);
  if (!lut) return null;
  return predictPerformance({
    lut,
    maxPressurePa: state.chamberPressureBar * PA_PER_BAR,
    exitDiameterM: state.exitDiameterM,
    areaRatio: state.areaRatio,
    thermalEfficiency: state.thermalEffPct / 100,
    flowEfficiency: state.flowEffPct / 100,
    expansionEfficiency: state.expansionEffPct / 100,
  });
}

export function StepPerformance({ state, patch, reactions }: WizardStepProps<LiquidWizardState>) {
  const [presetKey, setPresetKey] = useState(state.presetKey ?? LIQUID_PRESETS[0].key);
  const [targetKN, setTargetKN] = useState(500);

  const reaction = reactions?.get(state.reactionId);
  const isFixed = reaction?.kind === 'Fixed';
  const bounds = reaction ? mixtureRatioBounds(reaction) : null;
  const perf = perfOf(state, reactions);
  const canSize = perf !== null && perf.thrustVacN > 0 && targetKN > 0;

  const applyPreset = () => {
    const preset = LIQUID_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    patch({
      presetKey: preset.key,
      chamberPressureBar: preset.pressureBar,
      areaRatio: preset.areaRatio,
      exitDiameterM: preset.exitDiameterM,
      minThrottlePct: preset.minThrottlePct,
      thermalEffPct: preset.thermalEffPct,
      flowEffPct: preset.flowEffPct,
      expansionEffPct: preset.expansionEffPct,
      gimbal: { ...state.gimbal, maxYDeg: preset.gimbalYDeg, maxZDeg: preset.gimbalZDeg },
    });
  };

  const sizeExitDiameter = () => {
    if (!canSize || perf === null) return;
    // Thrust scales with exit area at a fixed area ratio, pressure and reaction, so the
    // diameter scales with the square root of the thrust ratio.
    const scaled = state.exitDiameterM * Math.sqrt((targetKN * 1000) / perf.thrustVacN);
    const clamped = Math.min(
      WIZARD_BOUNDS.exitDiameterM.max,
      Math.max(WIZARD_BOUNDS.exitDiameterM.min, scaled),
    );
    patch({ exitDiameterM: clamped });
  };

  return (
    <div className="flex flex-col gap-4">
      <StepSection
        title="Preset"
        description="Applying a preset overwrites the numbers below. It never touches the propellant or the feed."
      >
        <div className="flex items-end gap-2">
          <Select
            size="sm"
            aria-label="Preset"
            className="min-w-0 flex-1"
            selectedKey={presetKey}
            onSelectionChange={(k) => setPresetKey(String(k))}
          >
            {LIQUID_PRESETS.map((preset) => (
              <ListBoxItem key={preset.key} id={preset.key} textValue={preset.label}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{preset.label}</span>
                  <span data-subtitle className="truncate text-[11px] text-fg-subtle">
                    {preset.note}
                  </span>
                </span>
              </ListBoxItem>
            ))}
          </Select>
          <Button size="sm" variant="secondary" onPress={applyPreset}>
            Apply
          </Button>
        </div>
      </StepSection>

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
            label="Chamber pressure"
            suffix="bar"
            value={state.chamberPressureBar}
            onChange={(v) => patch({ chamberPressureBar: v })}
            min={WIZARD_BOUNDS.chamberPressureBar.min}
            max={WIZARD_BOUNDS.chamberPressureBar.max}
          />
          <WizardNumberField
            label="Minimum throttle"
            suffix="%"
            value={state.minThrottlePct}
            onChange={(v) => patch({ minThrottlePct: v })}
            min={WIZARD_BOUNDS.minThrottlePct.min}
            max={WIZARD_BOUNDS.minThrottlePct.max}
            description="100 % = on/off only"
          />
        </WizardRow>
        <WizardNumberField
          label="Thermal efficiency"
          suffix="%"
          value={state.thermalEffPct}
          onChange={(v) => patch({ thermalEffPct: v })}
          min={WIZARD_BOUNDS.efficiencyPct.min}
          max={WIZARD_BOUNDS.efficiencyPct.max}
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
            step={0.1}
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

      <DisclosureSection title="Size for a target thrust">
        <WizardNumberField
          label="Target vacuum thrust"
          suffix="kN"
          value={targetKN}
          onChange={setTargetKN}
          min={0}
          step={10}
        />
        <div className="flex flex-col gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            isDisabled={!canSize}
            onPress={sizeExitDiameter}
          >
            Size exit diameter
          </Button>
          {!canSize && (
            <p className="text-xs leading-snug text-fg-subtle">
              {perf === null || perf.thrustVacN <= 0
                ? 'Needs a live performance preview — pick a propellant the catalog knows.'
                : 'Give a target thrust greater than 0 kN.'}
            </p>
          )}
        </div>
      </DisclosureSection>

      {perf === null ? (
        <div className={noteBox}>
          Performance preview unavailable — the reaction catalog has no data for{' '}
          {state.reactionId || 'this propellant'}
          {reaction?.kind === 'Mixture' ? ' at this mixture ratio' : ''}. The engine still exports
          correctly.
        </div>
      ) : (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-panel-sunken p-2">
          <div className="font-mono text-sm tabular-nums text-fg">
            {kN(perf.thrustVacN)} vac · Isp {perf.ispVac.toFixed(1)} s
          </div>
          <Metric label="Thrust (vacuum)" value={kN(perf.thrustVacN)} />
          <Metric label="Thrust (sea level)" value={kN(perf.thrustSLN)} />
          <Metric label="Isp (vacuum)" value={`${perf.ispVac.toFixed(1)} s`} />
          <Metric label="Isp (sea level)" value={`${perf.ispSL.toFixed(1)} s`} />
          <Metric label="Mass flow" value={`${perf.massFlowRate.toFixed(1)} kg/s`} />
          <Metric label="Throat diameter" value={`${(perf.throatDiameterM * 100).toFixed(1)} cm`} />
        </div>
      )}

      {perf !== null && perf.flowSeparationSeveritySL > 0 && (
        <div className={warningBox}>
          Likely flow separation at sea level — the nozzle is over-expanded for a launch from the
          ground. Lower the area ratio or fly it as an upper stage.
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="text-fg-subtle">{label}</span>
      <span className="font-mono tabular-nums text-fg-muted">{value}</span>
    </div>
  );
}

/** The LUT's ratio bounds are raw table edges — two decimals is all a helper line needs. */
function round2(n: number): string {
  return String(Math.round(n * 100) / 100);
}
