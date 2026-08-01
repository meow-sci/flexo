import { lightIlluminance } from '../ksa/lightFalloff';
import { volumeExposure } from '../three/lightVolume';
import { fmt } from './format';

/**
 * The light inspector's falloff sparkline (plans/LIGHT_MANAGEMENT_PLAN.md §3.11): how
 * bright this light actually is, on its aim axis, from just off the source out to the
 * range boundary.
 *
 * It plots the SAME two things the 3D coverage volume shades with, so the curve and the
 * shells always agree:
 *  - KSA's exact illuminance `E(d)` ({@link lightIlluminance} — the port of
 *    `LightPrePass.comp`), and
 *  - the display Reinhard `E / (E + E₀)` with `E₀` from {@link volumeExposure}, i.e.
 *    whichever exposure mode the viewport is using.
 *
 * The **spot term is deliberately absent, not forgotten**: on the aim axis `cosθ = 1`,
 * which is inside any inner cone, so `spot(θ)` is exactly 1 for a Spot and irrelevant to
 * a Point. One curve is therefore correct for both light types.
 *
 * Sampling starts at 2% of range because `E ∝ 1/d²` is unbounded at the source; the last
 * sample sits exactly on `d = Range`, where the game's distance window is exactly 0 — so
 * the curve provably lands on the baseline rather than trailing off, which is the single
 * most useful thing it says (a light does not "fade out somewhere around" its range).
 *
 * Pure render from props: no state, no effects, no memoization (React Compiler handles
 * it) — a `y` value depends only on the four numbers passed in.
 */

/** Samples across the plotted range. */
const SAMPLES = 48;

/** First sample as a fraction of range (`1/d²` is unbounded at `d = 0`). */
const FIRST_SAMPLE_FRACTION = 0.02;

const VIEW_W = 200;
const VIEW_H = 56;

/** Inset so the 1.5px stroke isn't clipped at the extremes (`y` spans the full 0–1). */
const PAD = 2;

export function LightFalloffCurve({
  rangeM,
  intensity,
  exposureMode,
  vizExposure,
}: {
  rangeM: number;
  intensity: number;
  exposureMode: 'auto' | 'absolute';
  vizExposure: number;
}) {
  // A non-positive or non-finite range draws NOTHING, matching `shellRadii`'s refusal to
  // draw coverage for a light KSA culls CPU-side (ClusteredLightSystem.cs:669,760) — a
  // curve pinned at zero would look like a shape rather than an absence.
  const drawable = Number.isFinite(rangeM) && rangeM > 0 && Number.isFinite(intensity);
  const exposure = volumeExposure(rangeM, intensity, exposureMode, vizExposure);

  const points: string[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    const d = rangeM * (FIRST_SAMPLE_FRACTION + (1 - FIRST_SAMPLE_FRACTION) * t);
    const e = lightIlluminance(d, rangeM, intensity);
    const y = e / (e + exposure);
    const px = PAD + t * (VIEW_W - 2 * PAD);
    const py = VIEW_H - PAD - y * (VIEW_H - 2 * PAD);
    points.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }
  const line = points.join(' ');
  // Closed back along the baseline so the area under the curve can be tinted.
  const area = `${PAD},${VIEW_H - PAD} ${line} ${VIEW_W - PAD},${VIEW_H - PAD}`;

  return (
    <div className="flex flex-col gap-0.5">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full rounded-md border border-border bg-panel-sunken"
        role="img"
        aria-label={
          drawable
            ? `Relative brightness along the light's aim axis, from the source out to ${fmt(rangeM)} meters, where it reaches zero.`
            : 'No falloff curve: this light has no usable range.'
        }
      >
        {/* Half-brightness reference: where illuminance equals the display exposure. */}
        <line
          x1={PAD}
          y1={VIEW_H / 2}
          x2={VIEW_W - PAD}
          y2={VIEW_H / 2}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeDasharray="3 3"
        />
        {drawable && (
          <>
            <polygon points={area} fill="var(--color-accent, #6ab)" fillOpacity={0.15} />
            <polyline
              points={line}
              fill="none"
              stroke="var(--color-accent, #6ab)"
              strokeWidth={1.5}
            />
          </>
        )}
      </svg>
      <div className="flex justify-between text-[10px] leading-none text-fg-subtle">
        <span>0 m</span>
        <span>{drawable ? `${fmt(rangeM)} m — E = 0` : 'no range'}</span>
      </div>
    </div>
  );
}
