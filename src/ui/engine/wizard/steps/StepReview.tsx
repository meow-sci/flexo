import { Checkbox, dangerBox, noteBox } from '../../../kit';
import { FindingsList } from '../../../data/FindingsList';
import { resolveReactionLut } from '../../../../ksa/reactionCatalog';
import { predictPerformance } from '../../../../ksa/enginePhysics';
import type { EngineIssue } from '../../../../ksa/engineValidation';
import { PA_PER_BAR } from '../../editorKit';
import { StepSection } from '../wizardFields';
import type { WizardBuildResult, WizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **Step 7 — Review** (`plans/ENGINE_WIZARD_PLAN.md` §7.12): what Finish is about to commit.
 *
 * Everything shown here is computed on the SAME candidate document Finish commits — the dialog
 * builds it once and hands it down — so a green Review can never disagree with what lands in
 * the part.
 */

/** The vacuum headline, or null when the catalog cannot supply a LUT for this reaction. */
function headlineFor(
  state: WizardState,
  reactions: WizardStepProps<WizardState>['reactions'],
): string | null {
  if (state.family !== 'liquid') return null;
  const reaction = reactions?.get(state.reactionId);
  if (!reaction) return null;
  const lut = resolveReactionLut(reaction, state.mixtureRatio);
  if (!lut) return null;
  const perf = predictPerformance({
    lut,
    maxPressurePa: state.chamberPressureBar * PA_PER_BAR,
    exitDiameterM: state.exitDiameterM,
    areaRatio: state.areaRatio,
    thermalEfficiency: state.thermalEffPct / 100,
    flowEfficiency: state.flowEffPct / 100,
    expansionEfficiency: state.expansionEffPct / 100,
  });
  return `${(perf.thrustVacN / 1000).toFixed(1)} kN vac · Isp ${perf.ispVac.toFixed(1)} s · ${(
    perf.thrustSLN / 1000
  ).toFixed(1)} kN at sea level`;
}

export function StepReview({
  state,
  patch,
  reactions,
  result,
  findings,
  buildError,
}: WizardStepProps<WizardState> & {
  result: WizardBuildResult | null;
  findings: EngineIssue[];
  buildError: string | null;
}) {
  if (buildError !== null) {
    return (
      <div className={dangerBox}>
        <span className="font-medium">The engine could not be built.</span>
        <span>{buildError}</span>
      </div>
    );
  }

  if (!result) {
    return <div className={noteBox}>Nothing to review yet — go back and finish the steps.</div>;
  }

  const headline = headlineFor(state, reactions);

  return (
    <div className="flex flex-col gap-4">
      <StepSection title="What you built">
        <div className="flex flex-col gap-0.5 rounded-md border border-border bg-panel-sunken p-2 font-mono text-xs">
          <div className="text-fg">{result.part.partId}</div>
          {result.summary.map((row, i) => (
            <div key={`${row.kind}-${row.id}-${i}`} className="flex min-w-0 gap-2 pl-4">
              <span className="w-20 shrink-0 text-fg-subtle">{row.kind}</span>
              <span className="shrink-0 text-fg">{row.id}</span>
              <span className="min-w-0 truncate text-fg-subtle">{row.note}</span>
            </div>
          ))}
        </div>
      </StepSection>

      {headline !== null && (
        <StepSection title="Performance">
          <div className="font-mono text-sm tabular-nums text-fg">{headline}</div>
        </StepSection>
      )}

      <StepSection title="Findings">
        {findings.length === 0 ? (
          <p className="text-xs text-fg-muted">✓ no issues</p>
        ) : (
          <FindingsList findings={findings} />
        )}
      </StepSection>

      {result.exhaustNozzleRef !== null && (
        <Checkbox
          isSelected={state.review.armExhaustTool}
          onChange={(v) => patch({ review: { ...state.review, armExhaustTool: v } })}
        >
          Open the exhaust placement tool after finishing
        </Checkbox>
      )}
    </div>
  );
}
