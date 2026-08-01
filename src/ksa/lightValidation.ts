/**
 * Pre-flight validation for a Part's cast lights.
 *
 * Same exported shape as {@link import('./colliderValidation').validateColliders} and
 * {@link import('./ivaSeatValidation').validateIvaSeats} — one `validate*(part)` entry
 * point returning a flat list of `{ severity, code, message }` — and, like both, it is
 * ADVISORY: `ExportButton` merely DISPLAYS the findings, nothing gates the export.
 *
 * ⚠️ **The severity band is shifted, and deliberately so: a light can never `block`.**
 * `<Light>` has no required element, no id anything resolves against, and every
 * out-of-range value is sanitized at runtime (`Light.CreateSpotLight` swaps and clamps
 * the angles; `ClusteredLightSystem` culls degenerate lights). There is nothing an
 * author can put in a `<Light>` that makes KSA fail to load, so a `block` finding would
 * be a lie and `hasBlockingLightIssue` would be dead code — neither exists here. What
 * IS possible is a light that loads and then does nothing, or points somewhere other
 * than the editor shows, hence two severities:
 *  - **warn** — KSA loads it fine, but the light does not do what the author asked
 *    (it never renders, it is never instantiated, or the in-game aim differs from the
 *    marker flexo draws).
 *  - **info** — deliberate-and-legal, but worth knowing: KSA quietly does something
 *    to the value, or the part behaves differently from what the panel implies. Core's
 *    own data trips two of these, so they must never read as mistakes.
 *
 * The rules (plans/LIGHT_MANAGEMENT_PLAN.md §3.11, in full):
 *  - `light-range-nonpositive` (warn) — `Range ≤ 0`; culled CPU-side, never renders.
 *  - `light-intensity-nonpositive` (warn) — `Intensity ≤ 0`; same cull.
 *  - `light-angles-swapped` (warn) — Spot with inner > outer; the game silently swaps.
 *  - `light-outer-overclamp` (info) — Spot outer above the runtime clamp (Core does this).
 *  - `light-owner-unplaced` (warn) — owner template is not placed, so no light exists.
 *  - `light-owner-nonuniform-scale` (warn) — the in-game aim skews away from the marker.
 *  - `light-owner-mirrored` (warn) — a mirrored owner flips the in-game beam.
 *  - `light-always-on` (info) — lights with no light switch are permanently on.
 *  - `light-color-black` (info) — a light that emits (near) nothing.
 *
 * Every check names the game-side member it mirrors so a future KSA update can be
 * re-verified against the decomp rather than against this file's prose. Pure: no stores,
 * no React, no three (it may import {@link import('./lightFalloff')}, which is the same
 * ported-math layer).
 */

import { MAX_OUTER_ANGLE_RAD } from './lightFalloff';
import type { EditingPart, SubPartPlacement } from './types';

/**
 * `warn` ⇒ it loads but the light misbehaves; `info` ⇒ legal and probably intended, but
 * KSA does something to it worth knowing. There is no `block` — see the module JSDoc.
 */
export type LightIssueSeverity = 'warn' | 'info';

export interface LightIssue {
  severity: LightIssueSeverity;
  /** Stable kebab-case code — the UI and tests match on this, not on the prose. */
  code: string;
  message: string;
  /**
   * The offending light's editor-only `PartLight.id`, so the UI can select/reveal it.
   * `null` for the one PART-wide rule (`light-always-on`), which is a property of the
   * Part's power wiring rather than of any single light.
   */
  lightId: string | null;
}

/**
 * Below this the light emits nothing a player could see. Not zero: an author who dials
 * a channel to 0.005 meant black, and `<Color R="0" G="0" B="0"/>` is only the most
 * obvious spelling of it.
 */
const BLACK_MAX_CHANNEL = 0.01;

/** A placement whose scale is not the same on all three axes (KSA skews the aim). */
function isNonUniform(p: SubPartPlacement): boolean {
  return p.scale.x !== p.scale.y || p.scale.y !== p.scale.z;
}

/** A placement with any negative scale component — a reflection flexo cannot draw. */
function isMirrored(p: SubPartPlacement): boolean {
  return p.scale.x < 0 || p.scale.y < 0 || p.scale.z < 0;
}

export function validateLights(part: EditingPart): LightIssue[] {
  const issues: LightIssue[] = [];
  const warn = (lightId: string | null, code: string, message: string) =>
    issues.push({ severity: 'warn', code, message, lightId });
  const info = (lightId: string | null, code: string, message: string) =>
    issues.push({ severity: 'info', code, message, lightId });

  for (const light of part.lights) {
    // Range ≤ 0 and Intensity ≤ 0 are culled on the CPU, before the light is ever
    // packed for the GPU: `ClusteredLightSystem.cs:669` (`!inLight.Range.IsNearlyZero()`)
    // and `:760` (`!(light.Range <= 0f) && !(light.Intensity <= 0f)`). The SHADER would
    // happily light with either — `step(RANGE_EPSILON, …)` merely drops the distance
    // window (a windowless 1/d²) — so "the shader rejects it" is NOT why these are dark.
    if (light.rangeM <= 0) {
      warn(
        light.id,
        'light-range-nonpositive',
        `Light "${light.id}" has Range ${light.rangeM} m. KSA culls Range ≤ 0 lights ` +
          `CPU-side before they reach the renderer (ClusteredLightSystem.cs:669,760), so it ` +
          `never lights anything — give it a positive range.`,
      );
    }

    if (light.intensity <= 0) {
      warn(
        light.id,
        'light-intensity-nonpositive',
        `Light "${light.id}" has Intensity ${light.intensity}. KSA culls Intensity ≤ 0 ` +
          `lights CPU-side (ClusteredLightSystem.cs:760), so it contributes nothing — it is ` +
          `not a dim light, it is no light at all.`,
      );
    }

    if (light.type === 'Spot' && light.innerAngleRad > light.outerAngleRad) {
      warn(
        light.id,
        'light-angles-swapped',
        `Light "${light.id}" has an inner cone WIDER than its outer cone. KSA silently ` +
          `swaps them (Light.cs:56-61), so it renders as if you had typed them the other way ` +
          `round — almost certainly not what you meant.`,
      );
    }

    // INFO, not warn: Core's own FloodlightA authors OuterAngle=1.57 precisely to sit on
    // this clamp and get a hemisphere. Flagging it as a mistake would be wrong.
    if (light.type === 'Spot' && light.outerAngleRad > MAX_OUTER_ANGLE_RAD) {
      info(
        light.id,
        'light-outer-overclamp',
        `Light "${light.id}" has an outer cone wider than KSA's ceiling, so the game clamps ` +
          `it to ≈89.94° (MAX_OUTER_ANGLE, Light.cs:10). Core's own floodlight does exactly ` +
          `this to get a hemisphere — the cone simply cannot open any further.`,
      );
    }

    const maxChannel = Math.max(light.color.r, light.color.g, light.color.b);
    if (maxChannel < BLACK_MAX_CHANNEL) {
      info(
        light.id,
        'light-color-black',
        `Light "${light.id}" is black (all colour channels below ${BLACK_MAX_CHANNEL}). It ` +
          `still costs a light slot in game but adds no visible illumination.`,
      );
    }

    if (light.ownerTemplateId === null) continue;

    const owners = part.placements.filter((p) => p.subPartTemplateId === light.ownerTemplateId);
    if (owners.length === 0) {
      warn(
        light.id,
        'light-owner-unplaced',
        `Light "${light.id}" is owned by "${light.ownerTemplateId}", which this Part doesn't ` +
          `place. A SubPart light exists once per PLACEMENT of its template, so with no ` +
          `placement it is never instantiated in game — dead data.`,
      );
      continue;
    }

    // KSA aims a Spot by pushing its local +X through the OWNER's upper-3×3 — scale
    // INCLUDED — and normalizing (`LightModule.cs:115-117`), and transforms the position
    // offset by the owner's FULL matrix. flexo's marker composes quaternions instead
    // (`src/three/coords.ts` `lightWorld`), which is exact only for a uniform POSITIVE
    // owner scale. Both remaining cases are reported rather than reproduced.
    const skewed = owners.filter(isNonUniform);
    if (skewed.length > 0) {
      warn(
        light.id,
        'light-owner-nonuniform-scale',
        `Light "${light.id}" is owned by a template placed with a non-uniform scale ` +
          `(${skewed[0].instanceId}). KSA pushes the aim through the owner's scaled ` +
          `upper-3×3 before normalising, so the in-game beam SKEWS off-axis and the offset ` +
          `stretches with the placement; flexo's marker shows the uniform-scale ` +
          `approximation (coords.ts lightWorld).`,
      );
    }

    const mirrored = owners.filter(isMirrored);
    if (mirrored.length > 0) {
      warn(
        light.id,
        'light-owner-mirrored',
        `Light "${light.id}" is owned by a template placed with a MIRRORED (negative) scale ` +
          `(${mirrored[0].instanceId}). The game's aim transform is an improper map that ` +
          `survives its normalize, so a (−1,−1,−1) owner flips the in-game beam a full 180° ` +
          `— while flexo composes quaternions, which can never produce a reflection ` +
          `(coords.ts lightWorld). The marker's aim is not the direction KSA will cast.`,
      );
    }
  }

  // PART-wide, so no single light owns it. Every gate KSA puts on a cast light is
  // `if (FullPart.LightSwitch != null && …)` (LightModule.cs:88,93), and `Part.LightSwitch`
  // is only ever filled from a `<PowerConsumer LightSwitch="true">` — with none, the gate
  // never fires and no checkbox is drawn (analysis/HOW_LIGHT_PARTS_WORK.md §8.1).
  if (part.lights.length > 0 && !part.gameData.powerConsumer?.lightSwitch) {
    info(
      null,
      'light-always-on',
      `This Part's lights are always on: with no <PowerConsumer LightSwitch>, KSA's light ` +
        `gate never fires and no in-game checkbox appears (HOW_LIGHT_PARTS_WORK §8.1). ` +
        `Deliberate for indicator lamps; add a light switch in Part Data ▸ Power for anything ` +
        `the player should be able to turn off.`,
    );
  }

  return issues;
}
