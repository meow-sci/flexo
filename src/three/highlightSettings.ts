import * as THREE from 'three';
import { $selectionHighlight, type SelectionHighlightSettings } from '../state/settingsStore';

/**
 * Three.js-side mirror of the persisted {@link SelectionHighlightSettings}: the
 * hex colors parsed once into reusable {@link THREE.Color} instances so the
 * per-frame selection highlight (SubPartObject/KittenObject `setSelected`) reads
 * them without re-parsing. Kept tiny and dependency-light — it just subscribes to
 * the store and updates the live values in place.
 */
export interface ParsedHighlight {
  /** Emissive tint (mutated in place on settings change — do not retain copies). */
  readonly color: THREE.Color;
  /** Tint strength (0–1) → emissive intensity. */
  alpha: number;
}

const mesh: ParsedHighlight = { color: new THREE.Color(), alpha: 1 };
const kitten: ParsedHighlight = { color: new THREE.Color(), alpha: 1 };

function apply(s: SelectionHighlightSettings): void {
  mesh.color.set(s.meshColor);
  mesh.alpha = s.meshAlpha;
  kitten.color.set(s.kittenColor);
  kitten.alpha = s.kittenAlpha;
}

apply($selectionHighlight.get());
$selectionHighlight.subscribe(apply);

/** Current parsed highlight for SubPart meshes. */
export function meshHighlight(): ParsedHighlight {
  return mesh;
}

/** Current parsed highlight for kitten visual aides. */
export function kittenHighlight(): ParsedHighlight {
  return kitten;
}

/**
 * Surface mode's **face** highlight (design-surface-assets.md §1.5/D12). Deliberately a
 * DIFFERENT hue from the user's selection tint rather than a second intensity of it: a
 * picked face and a selected placement are both on screen at once (clicking a custom mesh
 * does both), so one colour family would make them indistinguishable. Not user-configurable
 * — the selection colour is the one the settings own.
 */
const face: ParsedHighlight = { color: new THREE.Color('#ffb454'), alpha: 0.7 };

/** Current parsed highlight for the Surface-mode face tint. */
export function faceHighlight(): ParsedHighlight {
  return face;
}
