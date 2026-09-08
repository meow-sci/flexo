import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { SectionTitle, Select, ListBoxItem, noteBox } from '../kit';
import { type ThrustCurveSample } from '../../ksa/solidMotorPhysics';
import { $part } from '../../state/editorStore';
import { $allReactionIndex } from '../../state/reactionStore';
import {
  $grainCatalog,
  $grainIndex,
  $solidDensities,
  $solidCurveMetric,
  type SolidCurveMetric,
} from '../../state/solidCurveStore';
import { $activeEngineEntry, $rocketReadoutSel } from '../../state/engineStore';

import { selectSolidCurveTarget, resolveSolidCurve } from './solidCurveResolution';

/**
 * **The solid thrust-curve card** (design: design-data-engine-modes.md D7, §B6) — a solid
 * motor's thrust is a CURVE, because the burning area changes as the flame front eats into
 * the grain, so a single number would be a lie. Rendered under Performance whenever the open
 * selected rocket resolves to a `<SolidMotor>`.
 *
 * The numbers come from `src/ksa/solidMotorPhysics.ts`, the verbatim port of
 * `SolidMotor.TrySampleThrustCurve`. Everything this component does is RESOLVE the motor's
 * inputs out of the document and the two Core catalogs, then draw the polyline.
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

  const selection = useStore($rocketReadoutSel);
  const [chosenInstance, setChosenInstance] = useState<string | null>(null);
  const instances = part.placements.filter(
    (p) => entry?.kind === 'subpart' && p.subPartTemplateId === entry.templateId,
  );
  const instanceId =
    instances.find((p) => p.instanceId === chosenInstance)?.instanceId ??
    instances[0]?.instanceId ??
    null;
  const target = selectSolidCurveTarget(part, entry, selection, instanceId);
  if (!target) return null;
  const resolved = resolveSolidCurve(part, target, reactions, grains, grainIndex, densities);

  return (
    <div className="flex flex-col gap-1 px-1">
      <SectionTitle>Burn preview — {target.motor.id}</SectionTitle>
      {instances.length > 1 && (
        <Select
          aria-label="Solid motor instance"
          size="xs"
          value={instanceId}
          onChange={(key) => setChosenInstance(String(key))}
        >
          {instances.map((p) => (
            <ListBoxItem key={p.instanceId} id={p.instanceId}>
              {p.instanceId}
            </ListBoxItem>
          ))}
        </Select>
      )}
      {resolved.curve ? (
        <CurvePlot curve={resolved.curve} />
      ) : (
        <div className={noteBox}>Thrust-curve preview unavailable — {resolved.reason}</div>
      )}
    </div>
  );
}

/** The sparkline + the three readouts KSA's own `ThrustCurvePreview` carries. */
function CurvePlot({ curve }: { curve: ThrustCurveSample }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const metric = useStore($solidCurveMetric);
  const values =
    metric === 'pressure' ? curve.chamberPressurePa : metric === 'isp' ? curve.ispS : curve.thrustN;
  const unit = metric === 'pressure' ? 'bar' : metric === 'isp' ? 's' : 'kN';
  const divisor = metric === 'pressure' ? 100000 : metric === 'isp' ? 1 : 1000;
  const peak = Math.max(...values);
  const label =
    metric === 'pressure' ? 'Chamber pressure' : metric === 'isp' ? 'Vacuum Isp' : 'Vacuum thrust';

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

    const scale = peak || 1;
    const n = values.length;
    const x = (i: number) => (i / (n - 1)) * (width - 2) + 1;
    const y = (v: number) => height - 1 - (v / scale) * (height - 3);

    // Filled area first, then the stroke on top — a sparkline reads as a shape.
    ctx.beginPath();
    ctx.moveTo(x(0), height);
    for (let i = 0; i < n; i++) ctx.lineTo(x(i), y(values[i]));
    ctx.lineTo(x(n - 1), height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(x(i), y(values[i]));
      else ctx.lineTo(x(i), y(values[i]));
    }
    ctx.strokeStyle = 'rgb(245, 158, 11)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [values, peak]);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-panel-sunken p-2">
      <Select
        aria-label="Burn curve metric"
        size="xs"
        value={metric}
        onChange={(key) => $solidCurveMetric.set(key as SolidCurveMetric)}
      >
        <ListBoxItem id="thrust">Vacuum thrust (kN)</ListBoxItem>
        <ListBoxItem id="pressure">Chamber pressure (bar)</ListBoxItem>
        <ListBoxItem id="isp">Vacuum Isp (s)</ListBoxItem>
      </Select>
      <span className="text-[11px] text-fg-subtle">
        {label}: {(peak / divisor).toFixed(1)} {unit} peak · time 0–{curve.burnSeconds.toFixed(1)} s
      </span>
      <canvas
        ref={canvas}
        className="h-12 w-full"
        role="img"
        aria-label={`${label} curve: peaks at ${(peak / divisor).toFixed(1)} ${unit} over ${curve.burnSeconds.toFixed(1)} seconds`}
      />
      <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
        <span>{(curve.peakThrustN / 1000).toFixed(1)} kN peak</span>
        <span>{curve.burnSeconds.toFixed(1)} s burn</span>
        <span>Isp {curve.vacuumIspS.toFixed(0)} s</span>
      </div>
      <div className="text-[11px] leading-snug text-fg-subtle">
        {label} over the burn, at the area ratio KSA derives for this stack (
        {curve.areaRatio.toFixed(1)}). {(curve.unburnableGrainKg / 1000).toFixed(2)} t of grain
        cannot burn — chamber pressure quenches first.
      </div>
    </div>
  );
}
