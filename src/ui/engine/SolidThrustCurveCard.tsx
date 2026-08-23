import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { SectionTitle, noteBox } from '../kit';
import { sampleThrustCurve, type ThrustCurveSample } from '../../ksa/solidMotorPhysics';
import { substanceIdOfPhase, type GrainGeometryTable } from '../../ksa/grainGeometryCatalog';
import type { EditingPart, SolidMotor, SolidMotorNozzle } from '../../ksa/types';
import type { ReactionData } from '../../ksa/reactionCatalog';
import { $part } from '../../state/editorStore';
import { $allReactionIndex } from '../../state/reactionStore';
import { $grainCatalog, $grainIndex, $solidDensities } from '../../state/solidCurveStore';
import { $activeEngineEntry, type EngineEntry } from '../../state/engineStore';

/**
 * **The solid thrust-curve card** (design: design-data-engine-modes.md D7, §B6) — a solid
 * motor's thrust is a CURVE, because the burning area changes as the flame front eats into
 * the grain, so a single number would be a lie. Rendered under Performance whenever the open
 * scope carries a `<SolidMotor>`.
 *
 * The numbers come from `src/ksa/solidMotorPhysics.ts`, the verbatim port of
 * `SolidMotor.TrySampleThrustCurve`. Everything this component does is RESOLVE the motor's
 * inputs out of the document and the two Core catalogs, then draw the polyline.
 *
 * Every failure lands on the same hint pattern the missing reaction catalog uses — *"preview
 * unavailable — the engine still exports correctly"* — with the reason named, because the two
 * reasons a user can act on are very different: a missing licensed data file (nothing to do)
 * versus a CUSTOM propellant, which has no `<StorageDensity>` to read at all. flexo never
 * invents a density.
 *
 * **Undo enrollment: NONE.** A read-only preview.
 */
export function SolidThrustCurveCard() {
  const part = useStore($part);
  const entry = useStore($activeEngineEntry);
  const reactions = useStore($allReactionIndex);
  const grains = useStore($grainCatalog);
  const grainIndex = useStore($grainIndex);
  const densities = useStore($solidDensities);

  const motor = firstSolidMotor(part, entry);
  if (!motor) return null;

  const resolved = resolveCurve(part, entry, motor, reactions, grains, grainIndex, densities);

  return (
    <div className="flex flex-col gap-1 px-1">
      <SectionTitle>Burn preview — {motor.id}</SectionTitle>
      {resolved.curve ? (
        <CurvePlot curve={resolved.curve} />
      ) : (
        <div className={noteBox}>
          Thrust-curve preview unavailable — {resolved.reason} The engine still exports correctly.
        </div>
      )}
    </div>
  );
}

/** The sparkline + the three readouts KSA's own `ThrustCurvePreview` carries. */
function CurvePlot({ curve }: { curve: ThrustCurveSample }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  // Canvas drawing is a DOM side effect, so it belongs in an effect, never in the render body
  // (Rules of React). It touches no store and no three.js loop — the on-demand renderer is
  // untouched.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = el.clientWidth || 240;
    const height = el.clientHeight || 48;
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const peak = curve.peakThrustN || 1;
    const n = curve.thrustN.length;
    const x = (i: number) => (i / (n - 1)) * (width - 2) + 1;
    const y = (v: number) => height - 1 - (v / peak) * (height - 3);

    // Filled area first, then the stroke on top — a sparkline reads as a shape.
    ctx.beginPath();
    ctx.moveTo(x(0), height);
    for (let i = 0; i < n; i++) ctx.lineTo(x(i), y(curve.thrustN[i]));
    ctx.lineTo(x(n - 1), height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(x(i), y(curve.thrustN[i]));
      else ctx.lineTo(x(i), y(curve.thrustN[i]));
    }
    ctx.strokeStyle = 'rgb(245, 158, 11)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [curve]);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-panel-sunken p-2">
      <canvas
        ref={canvas}
        className="h-12 w-full"
        role="img"
        aria-label={`Thrust curve: peaks at ${(curve.peakThrustN / 1000).toFixed(1)} kN over ${curve.burnSeconds.toFixed(1)} seconds`}
      />
      <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
        <span>{(curve.peakThrustN / 1000).toFixed(1)} kN peak</span>
        <span>{curve.burnSeconds.toFixed(1)} s burn</span>
        <span>Isp {curve.vacuumIspS.toFixed(0)} s</span>
      </div>
      <div className="text-[11px] leading-snug text-fg-subtle">
        Vacuum thrust over the burn, at the area ratio KSA derives for this stack (
        {curve.areaRatio.toFixed(1)}). {(curve.unburnableGrainKg / 1000).toFixed(2)} t of grain
        cannot burn — chamber pressure quenches first.
      </div>
    </div>
  );
}

// ── resolving the motor's inputs out of the document + catalogs ─────────────

/** The `<SubPartGameData>` / `<PartGameData>` of the open scope. */
function scopeOwner(part: EditingPart, entry: EngineEntry | null) {
  if (entry?.kind === 'part') return part.gameData;
  if (entry?.kind === 'subpart') {
    return part.subPartGameData.find((s) => s.subPartTemplateId === entry.templateId) ?? null;
  }
  return null;
}

function firstSolidMotor(part: EditingPart, entry: EngineEntry | null): SolidMotor | null {
  return scopeOwner(part, entry)?.solidMotors[0] ?? null;
}

interface ResolvedCurve {
  curve: ThrustCurveSample | null;
  /** A sentence fragment naming why, following "preview unavailable — ". */
  reason: string;
}

function resolveCurve(
  part: EditingPart,
  entry: EngineEntry | null,
  motor: SolidMotor,
  reactions: ReadonlyMap<string, ReactionData>,
  grains: readonly GrainGeometryTable[],
  grainIndex: ReadonlyMap<string, GrainGeometryTable>,
  densities: ReadonlyMap<string, number>,
): ResolvedCurve {
  const owner = scopeOwner(part, entry);
  if (!owner) return { curve: null, reason: 'no engine scope is open.' };

  if (grains.length === 0) {
    return {
      curve: null,
      reason: 'the grain-profile library (GrainGeometries.xml) is not served in this build.',
    };
  }

  const reaction = reactions.get(motor.reactionId);
  if (!reaction || reaction.kind !== 'Fixed' || reaction.category !== 'Solid') {
    return { curve: null, reason: `'${motor.reactionId}' is not a known solid reaction.` };
  }
  if (
    !reaction.burnRate ||
    reaction.minimumBurnPressurePa == null ||
    reaction.maxStablePressurePa == null
  ) {
    return { curve: null, reason: `${reaction.name} has no burn-rate law to integrate.` };
  }

  // A custom propellant is authored as a `<FixedReaction>` and has no `<StorageDensity>`
  // anywhere — there is nothing to look up, and guessing one would produce a curve that
  // looks authoritative and is wrong.
  const phaseId = reaction.reactants[0]?.phaseId ?? '';
  const density = densities.get(substanceIdOfPhase(phaseId));
  if (!density) {
    return {
      curve: null,
      reason: 'there is no density data for custom propellants (only shipped solids carry one).',
    };
  }

  // `GrainGeometryLibrary.Default` is the first profile by name — what an omitted `<Grain Id>`
  // resolves to in game.
  const geometry = motor.grainGeometryId ? grainIndex.get(motor.grainGeometryId) : grains[0];
  if (!geometry) {
    return { curve: null, reason: `grain profile '${motor.grainGeometryId}' is unknown.` };
  }

  const segments = motor.feeds
    .flatMap((feed) => (feed.kind === 'container' ? [feed.containerId] : []))
    .flatMap((id) => owner.solidGrainSegments.filter((g) => g.id === id))
    .map((segment) => ({
      outerRadiusM: segment.outerRadiusM,
      wallThicknessMm: segment.wallThicknessMm,
      lengthM: segment.lengthM,
      geometry,
    }));
  if (segments.length === 0) {
    return {
      curve: null,
      reason: 'the motor feeds from no grain segment on this part (add one to Feeds from).',
    };
  }

  const rocket = owner.rockets.find((r) => r.core.id === motor.id);
  // Each binding `<Nozzle>` is kept alongside its template: `AreaRatioMultiplier` lives on the
  // REFERENCE, not the `<SolidMotorNozzle>`, and the throat solve needs it.
  const nozzles: { nozzle: SolidMotorNozzle; areaRatioMultiplier: number }[] = (
    rocket?.nozzles ?? []
  ).flatMap((ref) =>
    owner.solidNozzles
      .filter((n) => n.id === ref.id)
      .map((nozzle) => ({ nozzle, areaRatioMultiplier: ref.areaRatioMultiplier })),
  );
  if (nozzles.length === 0) {
    return { curve: null, reason: 'no <Rocket> binds this motor to a solid nozzle yet.' };
  }

  const curve = sampleThrustCurve({
    lut: reaction.lut,
    thermalEfficiency: motor.thermalEfficiency,
    authoredChamberPressurePa: motor.defaultPressurePa,
    burnRate: reaction.burnRate,
    minimumBurnPressurePa: reaction.minimumBurnPressurePa,
    maxStablePressurePa: reaction.maxStablePressurePa,
    exhaustCondensedFraction: reaction.exhaustCondensedFraction ?? 0,
    storageDensityKgPerM3: density,
    segments,
    nozzles: nozzles.map(({ nozzle, areaRatioMultiplier }) => ({
      exitDiameterM: nozzle.exitDiameterM,
      flowEfficiency: nozzle.flowEfficiency,
      expansionEfficiency: nozzle.expansionEfficiency,
      areaRatioMultiplier,
    })),
  });
  return {
    curve,
    reason: curve
      ? ''
      : 'this stack never reaches its ignition pressure (try a bigger grain or a smaller nozzle).',
  };
}
