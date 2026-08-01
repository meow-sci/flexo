import type * as THREE from 'three';

/**
 * Per-layer opacity dimming (see {@link LayerViewState.opacity}). A layer can be
 * faded in the viewport so parts behind it show through while you reposition them.
 * The fade is editor-only presentation — it never touches the exported document.
 *
 * Each scene-object class (SubPart/Connector/Kitten) owns per-instance materials,
 * so it captures their base render state once and re-derives the dimmed state from
 * the base whenever the layer's opacity changes — never reading the live (already
 * dimmed) values.
 */

/** Render state of a material before any layer-opacity dimming is applied. */
export interface MaterialOpacityBase {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

/** Snapshots a material's base opacity/transparency so dimming stays reversible. */
export function captureOpacityBase(mat: THREE.Material): MaterialOpacityBase {
  return { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite };
}

/**
 * Dims `mat` to `factor` (0–1) of its base opacity. At factor 1 it is restored to
 * its captured base state; below 1 it renders transparent with depth-write off so
 * geometry behind shows through. `needsUpdate` flips only when `transparent` actually
 * crosses, so dragging the slider within (0,1) doesn't trigger shader recompiles.
 */
export function applyMaterialOpacity(
  mat: THREE.Material,
  base: MaterialOpacityBase,
  factor: number,
): void {
  const transparent = base.transparent || factor < 1;
  if (mat.transparent !== transparent) {
    mat.transparent = transparent;
    mat.needsUpdate = true;
  }
  mat.opacity = base.opacity * factor;
  mat.depthWrite = factor < 1 ? false : base.depthWrite;
}
