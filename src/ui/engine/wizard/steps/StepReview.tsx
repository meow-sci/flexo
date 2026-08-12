import { Checkbox, dangerBox, noteBox } from '../../../kit';
import { FindingsList } from '../../../data/FindingsList';
import type { EngineIssue } from '../../../../ksa/engineValidation';
import { StepSection } from '../wizardFields';
import type { WizardBuildResult, WizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **Step 7 — Review** (`plans/ENGINE_WIZARD_PLAN.md` §7.12): what Finish is about to commit.
 *
 * Everything shown here is computed on the SAME candidate document Finish commits — the dialog
 * builds it once and hands it down — so a green Review can never disagree with what lands in
 * the part. The performance headline arrives the same way, for the same reason: the dialog
 * computes it once and quotes the very same figures in the Finish toast.
 */

/**
 * The headline figures for a family, or `null` (the dialog's `wizardPerformance`) when they
 * cannot be computed HONESTLY — the reaction catalog is still loading, the reaction is
 * unknown, a mixture reaction has no ratio, the solid data files are not served, or the
 * inputs never reach a choked flow. On `null` the section is not rendered at all; nothing
 * here ever renders `NaN`.
 */
export type WizardPerformance =
  | { family: 'liquid'; thrustVacN: number; thrustSLN: number; ispVacS: number }
  /** Per nozzle — every nozzle in a block runs the same chamber, so total = ×`nozzleCount`. */
  | { family: 'rcs'; thrustVacN: number; ispVacS: number; nozzleCount: number }
  | { family: 'srb'; peakThrustN: number; burnSeconds: number; ispVacS: number };

export function StepReview({
  state,
  patch,
  performance,
  result,
  findings,
  buildError,
}: WizardStepProps<WizardState> & {
  performance: WizardPerformance | null;
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

      {performance !== null && (
        <StepSection title="Performance">
          <div className="font-mono text-sm tabular-nums text-fg">{headlineOf(performance)}</div>
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

/** The Performance section's one line — a solid burns, so it reads as a curve, not a number. */
function headlineOf(perf: WizardPerformance): string {
  if (perf.family === 'srb') {
    return (
      `${(perf.peakThrustN / 1000).toFixed(1)} kN peak · ` +
      `${perf.burnSeconds.toFixed(1)} s burn · Isp ${perf.ispVacS.toFixed(1)} s (vac)`
    );
  }
  if (perf.family === 'rcs') {
    const nozzles = `${perf.nozzleCount} ${perf.nozzleCount === 1 ? 'nozzle' : 'nozzles'}`;
    return (
      `${perf.thrustVacN.toFixed(0)} N vac per nozzle · Isp ${perf.ispVacS.toFixed(1)} s · ` +
      `${(perf.thrustVacN * perf.nozzleCount).toFixed(0)} N over ${nozzles}`
    );
  }
  return (
    `${(perf.thrustVacN / 1000).toFixed(1)} kN vac · Isp ${perf.ispVacS.toFixed(1)} s · ` +
    `${(perf.thrustSLN / 1000).toFixed(1)} kN at sea level`
  );
}
