/**
 * Color ramps for the emissive (glow) authoring model — flexo's stand-in for the 1-px gradient
 * LUTs KSA keys its own greyscale effects through (`temperatureLut`, sampled at `vec2(key, 0.5)`
 * in MeshIndirect.frag:297).
 *
 * KSA's `<PbrMaterial>` has no LUT slot and its emissive path emits a literal `vec3(mask)`, so a
 * ramp can never ship to the game — flexo evaluates it here, at composite time, and bakes the
 * result into the `<Diffuse>` while the `<Emissive>` stays the greyscale mask KSA supports.
 * See analysis/KSA_EMISSIVE_AND_LUT.md §3 and §6.
 *
 * Ramp stops interpolate in sRGB BYTE space, which is what an image editor's gradient tool does —
 * so importing a gradient PNG and re-sampling it round-trips.
 */
import type { GlowRamp, GlowRampStop, RgbColor } from '../ksa/types';
import type { ImageLevel } from './decodeImage';

/** Samples taken across an imported gradient before stop reduction. */
const IMPORT_SAMPLES = 256;
/** Max per-channel byte deviation a reduced ramp may have from the imported gradient. */
const IMPORT_TOLERANCE = 4;
/** Upper bound on stops from an import, so a noisy screenshot can't explode the descriptor. */
const IMPORT_MAX_STOPS = 24;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerpByte(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * Sorts stops ascending and clamps every position to 0..1. Ramps are edited by hand (drag a stop
 * past its neighbour) and imported, so every producer funnels through this.
 */
export function normalizeGlowRamp(stops: GlowRampStop[]): GlowRamp {
  return {
    stops: stops
      .map((s) => ({ at: clamp01(s.at), color: { ...s.color } }))
      .sort((a, b) => a.at - b.at),
  };
}

/**
 * The ramp color at a greyscale key 0..1. Clamps outside the first/last stop (matching a LUT
 * texture's clamp-to-edge sampling) and returns black for an empty ramp.
 */
export function sampleGlowRamp(ramp: GlowRamp, key: number): RgbColor {
  const stops = ramp.stops;
  if (stops.length === 0) return { r: 0, g: 0, b: 0 };
  const k = clamp01(key);
  if (k <= stops[0].at) return { ...stops[0].color };
  const last = stops[stops.length - 1];
  if (k >= last.at) return { ...last.color };
  let i = 1;
  while (i < stops.length && stops[i].at < k) i++;
  const lo = stops[i - 1];
  const hi = stops[i];
  const span = hi.at - lo.at;
  // Coincident stops are a deliberate hard edge: take the upper color rather than divide by zero.
  const t = span <= 0 ? 1 : (k - lo.at) / span;
  return {
    r: lerpByte(lo.color.r, hi.color.r, t),
    g: lerpByte(lo.color.g, hi.color.g, t),
    b: lerpByte(lo.color.b, hi.color.b, t),
  };
}

/** A `linear-gradient(...)` value that renders the ramp exactly as {@link sampleGlowRamp} reads it. */
export function glowRampCss(ramp: GlowRamp): string {
  if (ramp.stops.length === 0) return '#000';
  const parts = ramp.stops.map((s) => `${rgbToHex(s.color)} ${(s.at * 100).toFixed(2)}%`);
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

/** `{r,g,b}` (0..255) → `#rrggbb`. */
export function rgbToHex(c: RgbColor): string {
  return `#${[c.r, c.g, c.b]
    .map((n) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** `#rrggbb` → `{r,g,b}` (0..255). */
export function hexToRgb(hex: string): RgbColor {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/**
 * Reads a gradient image into a ramp: the MIDDLE row is sampled left→right (so a 1-px LUT and a
 * zoomed screenshot of one both work), resampled to {@link IMPORT_SAMPLES}, then reduced to the
 * fewest stops that stay within {@link IMPORT_TOLERANCE} of the original.
 *
 * The full width is used as-is — flexo does not guess where a gradient starts, so an image with
 * background margins imports those margins too (the UI says to crop; the stops stay editable).
 */
export function glowRampFromImage(level: ImageLevel): GlowRamp {
  const samples = sampleImageRow(level, IMPORT_SAMPLES);
  return { stops: reduceToStops(samples, IMPORT_TOLERANCE, IMPORT_MAX_STOPS) };
}

/** `count` evenly spaced nearest-neighbour samples across the image's middle row. */
function sampleImageRow(level: ImageLevel, count: number): RgbColor[] {
  const y = Math.floor(level.height / 2);
  const out: RgbColor[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.min(level.width - 1, Math.floor((i * level.width) / count));
    const o = (y * level.width + x) * 4;
    out.push({ r: level.rgba[o], g: level.rgba[o + 1], b: level.rgba[o + 2] });
  }
  return out;
}

/**
 * Greedy polyline simplification over the sampled colors: start with the two endpoints, then
 * repeatedly split whichever segment deviates most from its straight-line interpolation, until
 * every segment is within `tolerance` or `maxStops` is reached. Taking the worst segment first
 * means a stop budget is spent on the sharpest features.
 */
function reduceToStops(samples: RgbColor[], tolerance: number, maxStops: number): GlowRampStop[] {
  const n = samples.length;
  if (n === 0) return [];
  if (n === 1)
    return [
      { at: 0, color: samples[0] },
      { at: 1, color: samples[0] },
    ];
  const keep = [0, n - 1];
  while (keep.length < maxStops) {
    let worstErr = -1;
    let worstIndex = -1;
    let worstSlot = -1;
    for (let s = 0; s < keep.length - 1; s++) {
      const [index, err] = worstInSegment(samples, keep[s], keep[s + 1]);
      if (err > worstErr) {
        worstErr = err;
        worstIndex = index;
        worstSlot = s + 1;
      }
    }
    if (worstErr <= tolerance || worstIndex < 0) break;
    keep.splice(worstSlot, 0, worstIndex);
  }
  return keep.map((i) => ({ at: i / (n - 1), color: samples[i] }));
}

/** The sample between `lo` and `hi` furthest (max channel delta) from their linear blend. */
function worstInSegment(samples: RgbColor[], lo: number, hi: number): [index: number, err: number] {
  let bestIndex = -1;
  let bestErr = -1;
  for (let i = lo + 1; i < hi; i++) {
    const t = (i - lo) / (hi - lo);
    const err = Math.max(
      Math.abs(samples[i].r - lerpByte(samples[lo].r, samples[hi].r, t)),
      Math.abs(samples[i].g - lerpByte(samples[lo].g, samples[hi].g, t)),
      Math.abs(samples[i].b - lerpByte(samples[lo].b, samples[hi].b, t)),
    );
    if (err > bestErr) {
      bestErr = err;
      bestIndex = i;
    }
  }
  return [bestIndex, bestErr];
}

/**
 * Starting ramps offered in the glow panel. 'heat' mirrors the blackbody gradient KSA ships as
 * `Textures/TemperatureLut.png` (the shape KSA's own asset author points modders at); 'status'
 * mirrors the battery status light's red→amber→green charge ramp (PartModelModule.cs:110-140).
 */
export const GLOW_RAMP_PRESETS: { id: string; label: string; ramp: GlowRamp }[] = [
  {
    id: 'heat',
    label: 'Heat (blackbody)',
    ramp: {
      stops: [
        { at: 0, color: { r: 0, g: 0, b: 0 } },
        { at: 0.2, color: { r: 42, g: 4, b: 0 } },
        { at: 0.45, color: { r: 180, g: 29, b: 5 } },
        { at: 0.7, color: { r: 232, g: 114, b: 26 } },
        { at: 0.88, color: { r: 242, g: 196, b: 106 } },
        { at: 1, color: { r: 253, g: 244, b: 216 } },
      ],
    },
  },
  {
    id: 'status',
    label: 'Status (red → green)',
    ramp: {
      stops: [
        { at: 0, color: { r: 32, g: 0, b: 0 } },
        { at: 0.35, color: { r: 214, g: 31, b: 20 } },
        { at: 0.65, color: { r: 240, g: 168, b: 30 } },
        { at: 1, color: { r: 70, g: 255, b: 100 } },
      ],
    },
  },
  {
    id: 'ember',
    label: 'Ember (dark → cyan core)',
    ramp: {
      stops: [
        { at: 0, color: { r: 4, g: 12, b: 20 } },
        { at: 0.5, color: { r: 24, g: 130, b: 180 } },
        { at: 1, color: { r: 190, g: 246, b: 255 } },
      ],
    },
  },
];

/** A sensible ramp to seed the editor with when the user switches a glow to ramp mode. */
export function defaultGlowRamp(): GlowRamp {
  return {
    stops: GLOW_RAMP_PRESETS[0].ramp.stops.map((s) => ({ at: s.at, color: { ...s.color } })),
  };
}
