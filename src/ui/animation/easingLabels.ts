import type { EasingChannel, EasingConfig, EasingPreset } from '../../ksa/types';
import { controlPointsOf, matchingPreset } from '../../ksa/easing';

/**
 * The words the two easing surfaces share — the navigator's EASING overview (§6.3) and the
 * left card's `EasingCurveEditor` (§8.3). One table, so a curve can never read "Ease In-Out"
 * in one place and "easeInOut" in the other.
 *
 * The preset list and its order are v1's verbatim (census §1.8): ten presets, linear first.
 */

export const PRESET_ORDER: readonly EasingPreset[] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeInSine',
  'easeOutSine',
  'easeInOutSine',
];

export const PRESET_LABELS: Record<EasingPreset, string> = {
  linear: 'Linear',
  easeIn: 'Ease In',
  easeOut: 'Ease Out',
  easeInOut: 'Ease In-Out',
  easeInCubic: 'Ease In · Cubic',
  easeOutCubic: 'Ease Out · Cubic',
  easeInOutCubic: 'Ease In-Out · Cubic',
  easeInSine: 'Ease In · Sine',
  easeOutSine: 'Ease Out · Sine',
  easeInOutSine: 'Ease In-Out · Sine',
};

/** Tab / row order for the per-channel editor — the sampler's channel order. */
export const CHANNEL_TABS: readonly (EasingChannel | 'uniform')[] = [
  'uniform',
  'position',
  'rotation',
  'scale',
];

export const CHANNEL_LABELS: Record<EasingChannel | 'uniform', string> = {
  uniform: 'Uniform',
  position: 'Position',
  rotation: 'Rotation',
  scale: 'Scale',
};

/**
 * How one channel reads in the overview: an ABSENT config is linear (the storage discipline —
 * a linear channel is never written), an on-preset curve reads as that preset, anything else
 * is a custom curve.
 */
export function describeEasing(cfg: EasingConfig | undefined): string {
  if (!cfg) return 'linear (—)';
  const preset = matchingPreset(controlPointsOf(cfg));
  if (preset === 'linear') return 'linear (—)';
  return preset ? PRESET_LABELS[preset] : 'custom curve';
}
