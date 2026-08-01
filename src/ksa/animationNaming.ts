import type { PartAnimation } from './types';

/**
 * Deterministic names shared by the GameData XML emitter ({@link serializeGameData})
 * and the export bundle ({@link buildCustomBundle}) so the `<KeyframeAnimation Path>`
 * always matches the emitted `Animations/*.glb`. Kept dependency-free (no three.js)
 * so the XML serializer can import it.
 */

/** Letters/digits only, collapsing runs to '_'; falls back to "Anim". */
function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Anim';
}

/**
 * A per-animation token that stays human-readable (from the name) but unique
 * (the random id suffix), so two animations named "Deploy" don't collide.
 */
export function animToken(anim: PartAnimation): string {
  const suffix = anim.id.replace(/^anim_/, '');
  return `${sanitize(anim.name)}_${suffix}`;
}

/** The `<KeyframeAnimationModule Id>` (also reused as the `<KeyframeAnimation Id>`). */
export function animModuleId(base: string, anim: PartAnimation): string {
  return `${base}_${animToken(anim)}_Anim`;
}

/** Mod-relative path of the animation glb, e.g. "Animations/MyPart_Deploy_ab12_Anim.glb". */
export function animGlbPath(base: string, anim: PartAnimation): string {
  return `Animations/${animModuleId(base, anim)}.glb`;
}

/**
 * True when an animation has the structure to export meaningfully: at least one
 * joint with attached SubParts, and ≥2 keyframes spanning a non-zero duration
 * (KSA divides by Duration for the Actuate slider, so a zero-duration animation is
 * degenerate). Animations failing this are skipped by the exporter.
 */
export function isAnimationExportable(anim: PartAnimation): boolean {
  const hasMembers = anim.joints.some((j) => j.memberInstanceIds.length > 0);
  const maxTime = Math.max(0, ...anim.keyframes.map((k) => k.timeSec));
  return hasMembers && anim.keyframes.length >= 2 && maxTime > 0;
}
