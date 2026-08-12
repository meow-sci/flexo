import { useStore } from '@nanostores/react';
import { Checkbox, ListBoxItem, Select, noteBox } from '../../../kit';
import {
  grainInitialArea,
  substanceIdOfPhase,
  type GrainGeometryTable,
} from '../../../../ksa/grainGeometryCatalog';
import { sampleThrustCurve, type ThrustCurveSample } from '../../../../ksa/solidMotorPhysics';
import type { ReactionData } from '../../../../ksa/reactionCatalog';
// The grain profiles + solid densities the burn preview integrates are a LAZILY FETCHED Core
// catalog, not wizard state — there is nothing in `state` for them to come from, and the
// dialog already fires `ensureSolidCurveDataLoaded()` on mount. That is why this one step is
// allowed to read stores: everything else it draws still comes from `state`/`patch`.
import { $grainIndex, $solidDensities } from '../../../../state/solidCurveStore';
import { PA_PER_BAR } from '../../editorKit';
import { StepSection, WizardNumberField, WizardRow } from '../wizardFields';
import { WALL_MATERIAL_IDS, WIZARD_BOUNDS } from '../wizardPresets';
import type { SrbWizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **SRB step — Grain & casing** (`plans/ENGINE_WIZARD_PLAN.md` §7.8): the propellant charge
 * itself — how many segments, how big, how thick a case wall — over a live burn preview.
 *
 * The preview is the reason the step is worth a screen: a solid's thrust is a CURVE, so the
 * only honest way to size a booster is to watch the burn time and peak thrust move as the
 * grain changes. It is computed with `sampleThrustCurve`, the verbatim port of
 * `SolidMotor.TrySampleThrustCurve`, and it is **display-only** — nothing here writes a
 * field back into the wizard state.
 *
 * Every unavailable case (catalog still loading, custom propellant with no `<StorageDensity>`,
 * a stack that never reaches its ignition pressure) lands on a sentence rather than a number:
 * this card must never render `NaN`.
 */

/** What the preview card draws, once every input has been satisfied. */
interface BurnPreview {
  curve: ThrustCurveSample;
  /** Total propellant in the stack, kg — `resolveSegment`'s mass, summed over the segments. */
  propellantMassKg: number;
}

/** A guard for every number the card prints: an unsatisfiable solve must read as a sentence. */
const finite = (n: number) => Number.isFinite(n);

/** kN for the readout — the unit the Performance card and the tutorial both speak. */
const kN = (n: number) => (finite(n) ? `${(n / 1000).toFixed(1)} kN` : '—');

/**
 * The burn preview for the CURRENT wizard state, or `null` when some input is missing.
 *
 * Every input except the two catalogs comes straight out of `state`: the reaction (with its
 * burn-rate law and pressure window), the grain segments the wizard is about to create, and
 * the single solid nozzle it will bind. So the card is a true preview of the part Finish
 * commits — no invented dimensions, no placeholder nozzle.
 */
function burnPreview(
  state: SrbWizardState,
  reaction: ReactionData | undefined,
  grainIndex: ReadonlyMap<string, GrainGeometryTable>,
  densities: ReadonlyMap<string, number>,
): BurnPreview | null {
  if (!reaction || reaction.kind !== 'Fixed' || reaction.category !== 'Solid') return null;
  const { burnRate, minimumBurnPressurePa, maxStablePressurePa } = reaction;
  if (!burnRate || minimumBurnPressurePa == null || maxStablePressurePa == null) return null;

  // A CUSTOM propellant has no `<StorageDensity>` anywhere — flexo never invents one.
  const density = densities.get(substanceIdOfPhase(reaction.reactants[0]?.phaseId ?? ''));
  if (!density) return null;

  const geometry = grainIndex.get(state.grainGeometryId);
  if (!geometry) return null;

  const { segmentCount, outerRadiusM, wallThicknessMm, lengthM } = state.grain;
  if (!Number.isInteger(segmentCount) || segmentCount < 1) return null;
  if (!(outerRadiusM > 0) || !(lengthM > 0) || !(wallThicknessMm > 0)) return null;

  const segment = { outerRadiusM, wallThicknessMm, lengthM, geometry };
  const curve = sampleThrustCurve({
    lut: reaction.lut,
    thermalEfficiency: state.thermalEffPct / 100,
    authoredChamberPressurePa: state.defaultPressureBar * PA_PER_BAR,
    burnRate,
    minimumBurnPressurePa,
    maxStablePressurePa,
    exhaustCondensedFraction: reaction.exhaustCondensedFraction ?? 0,
    storageDensityKgPerM3: density,
    segments: Array.from({ length: segmentCount }, () => segment),
    nozzles: [
      {
        exitDiameterM: state.nozzle.exitDiameterM,
        flowEfficiency: state.nozzle.flowEffPct / 100,
        expansionEfficiency: state.nozzle.expansionEffPct / 100,
      },
    ],
  });
  if (!curve) return null;

  // `SolidGrainSegment`'s own mass: initial grain area × inner radius² × length × density
  // (solidMotorPhysics' `resolveSegment`, which is not exported — the two lines below are it).
  const innerRadiusM = Math.max(outerRadiusM - wallThicknessMm * 0.001, 0);
  const propellantMassKg =
    grainInitialArea(geometry) * innerRadiusM * innerRadiusM * lengthM * density * segmentCount;

  if (!finite(curve.burnSeconds) || !finite(curve.peakThrustN) || !finite(propellantMassKg)) {
    return null;
  }
  return { curve, propellantMassKg };
}

export function StepSrbGrain({ state, patch, reactions }: WizardStepProps<SrbWizardState>) {
  const grainIndex = useStore($grainIndex);
  const densities = useStore($solidDensities);

  const grain = state.grain;
  const catalogReady = grainIndex.size > 0 && densities.size > 0;
  const preview = catalogReady
    ? burnPreview(state, reactions?.get(state.reactionId), grainIndex, densities)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <StepSection
        title="Grain segments"
        description="One charge per segment, stacked along the case. KSA burns them as one motor."
      >
        <WizardRow>
          <WizardNumberField
            label="Segment count"
            value={grain.segmentCount}
            onChange={(v) => patch({ grain: { ...grain, segmentCount: v } })}
            min={WIZARD_BOUNDS.segmentCount.min}
            max={WIZARD_BOUNDS.segmentCount.max}
            step={1}
          />
          <WizardNumberField
            label="Outer radius"
            suffix="m"
            value={grain.outerRadiusM}
            onChange={(v) => patch({ grain: { ...grain, outerRadiusM: v } })}
            min={0}
            step={0.1}
          />
        </WizardRow>
        <WizardRow>
          <WizardNumberField
            label="Wall thickness"
            suffix="mm"
            value={grain.wallThicknessMm}
            onChange={(v) => patch({ grain: { ...grain, wallThicknessMm: v } })}
            min={0}
            description="Case wall, subtracted from the outer radius to leave the propellant."
          />
          <WizardNumberField
            label="Length per segment"
            suffix="m"
            value={grain.lengthM}
            onChange={(v) => patch({ grain: { ...grain, lengthM: v } })}
            min={0}
            step={0.1}
          />
        </WizardRow>
        <Select
          size="sm"
          label="Wall material"
          selectedKey={grain.wallMaterialId}
          onSelectionChange={(k) => patch({ grain: { ...grain, wallMaterialId: String(k) } })}
        >
          {WALL_MATERIAL_IDS.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
        <Checkbox
          isSelected={state.acceptCaseSegmentsViaConnector}
          onChange={(v) => patch({ acceptCaseSegmentsViaConnector: v })}
        >
          Accept extra case segments via connector (SolidMotorCase)
        </Checkbox>
        <p className="text-xs leading-snug text-fg-subtle">
          Lets stacked case parts feed this motor: the wizard adds a SolidMotorCase connector, so a
          segment attached to it burns as part of the same booster.
        </p>
      </StepSection>

      <StepSection title="Burn preview">
        {preview ? (
          <div className="flex flex-col gap-1 rounded-md border border-border bg-panel-sunken p-2">
            <div className="font-mono text-sm tabular-nums text-fg">
              {kN(preview.curve.peakThrustN)} peak · {preview.curve.burnSeconds.toFixed(1)} s burn
            </div>
            <Metric label="Burn time" value={`${preview.curve.burnSeconds.toFixed(1)} s`} />
            <Metric label="Ignition thrust" value={kN(preview.curve.ignitionThrustN)} />
            <Metric label="Peak thrust" value={kN(preview.curve.peakThrustN)} />
            <Metric
              label="Isp (vacuum)"
              value={
                finite(preview.curve.vacuumIspS) ? `${preview.curve.vacuumIspS.toFixed(0)} s` : '—'
              }
            />
            <Metric label="Propellant mass" value={`${preview.propellantMassKg.toFixed(0)} kg`} />
          </div>
        ) : (
          <div className={noteBox}>
            {catalogReady
              ? 'Burn preview unavailable — this propellant or this grain has no curve to ' +
                'integrate (a custom solid carries no storage density, and a stack that never ' +
                'reaches its ignition pressure has no burn). The motor still exports correctly.'
              : 'Solid curve data loading…'}
          </div>
        )}
      </StepSection>
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
