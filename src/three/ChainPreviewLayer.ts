import * as THREE from 'three';
import { $chainEval } from './chainEval';
import { applyPlacement } from './coords';
import type { PlacementTransform } from '../state/editorStore';
import type { SubPartObject } from './SubPartObject';
import type { Viewport } from './Viewport';

/**
 * Ghost cap. An action chain can legally evaluate to {@link MAX_CHAIN_INSTANCES}
 * placements, and cloning every one of them into the scene graph makes the palette
 * feel broken long before Apply would. The preview is a *reading aid*, not the
 * result — showing the first 500 and saying so in the footer keeps the sliders
 * responsive while still describing the shape of the array.
 */
export const PREVIEW_MAX_GHOSTS = 500;

/**
 * The single material every ghost renders with — the accent green as an unlit,
 * translucent silhouette so ghosts read as "not real yet" against the lit part.
 *
 * Module-level and NEVER disposed: `refresh()` runs on every keystroke in the
 * palette, so allocating (or freeing) a material per ghost would churn GPU
 * resources dozens of times a second. Clones get this instance assigned by
 * reference; the source `SubPartObject`'s own materials are left untouched, which
 * also means selection-highlight emissive on a seed never bleeds into its ghosts.
 */
const GHOST_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x2cfa1f,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});

/** Below this, two transforms are the same placement as far as the preview cares. */
const EPSILON = 1e-9;

/** True when any of the 9 transform numbers differ beyond {@link EPSILON}. */
function transformsDiffer(a: PlacementTransform, b: PlacementTransform): boolean {
  return (
    Math.abs(a.position.x - b.position.x) > EPSILON ||
    Math.abs(a.position.y - b.position.y) > EPSILON ||
    Math.abs(a.position.z - b.position.z) > EPSILON ||
    Math.abs(a.rotation.x - b.rotation.x) > EPSILON ||
    Math.abs(a.rotation.y - b.rotation.y) > EPSILON ||
    Math.abs(a.rotation.z - b.rotation.z) > EPSILON ||
    Math.abs(a.scale.x - b.scale.x) > EPSILON ||
    Math.abs(a.scale.y - b.scale.y) > EPSILON ||
    Math.abs(a.scale.z - b.scale.z) > EPSILON
  );
}

/**
 * Draws the live action-chain preview: one translucent ghost per placement the
 * chain would create (or move) if Apply were pressed right now. Owned by
 * {@link EditorScene}, which calls {@link refresh} whenever {@link $chainEval}
 * recomputes — which is every session edit AND every document change, so dragging
 * a seed with the gizmo re-flows the whole array in real time.
 *
 * Like {@link MeasurementLayer}, the group hangs off `viewport.scene` rather than
 * `EditorScene.root`: ghosts are an editor aid, so they must stay out of the
 * exported `flexo-part` hierarchy, out of `applyLayerView`'s visibility/opacity
 * bookkeeping, and out of `SelectionManager`'s pick set (belt and braces — every
 * cloned node also gets a no-op `raycast`).
 *
 * Nothing here is document state and nothing here is undoable; the layer only
 * ever reads.
 */
export class ChainPreviewLayer {
  private readonly viewport: Viewport;
  private readonly getObject: (instanceId: string) => SubPartObject | undefined;
  private readonly group = new THREE.Group();

  constructor(viewport: Viewport, getObject: (instanceId: string) => SubPartObject | undefined) {
    this.viewport = viewport;
    this.getObject = getObject;
    this.group.name = 'chain-preview';
    viewport.scene.add(this.group);
  }

  /**
   * Rebuilds every ghost from the current evaluation. Cheap enough to run
   * wholesale: `group.clear()` drops scene-graph nodes only — the geometry belongs
   * to the shared mesh cache (`Group.clone(true)` shares it by reference) and the
   * material is the module singleton, so a rebuild allocates no GPU resources and
   * must dispose none.
   *
   * One invalidate at the end covers the whole layer on the on-demand loop.
   */
  refresh(): void {
    this.group.clear();

    const state = $chainEval.get();
    // No session, or a chain that can't evaluate (bad params, vanished seeds) —
    // the palette reports the error in text; the scene just shows nothing.
    if (state && !state.result.error) {
      let ghosts = 0;
      for (const instance of state.result.instances) {
        if (ghosts >= PREVIEW_MAX_GHOSTS) break;

        const seedId = state.resolvedSeedIds[instance.seedIndex];
        const seedTransform = state.seedTransforms[instance.seedIndex];
        if (seedId === undefined || seedTransform === undefined) continue;

        // A seed only gets a ghost when the chain MOVES it: the ghost then marks the
        // target while the real object stays where it is, which is what makes a
        // pure-transform chain (no arrays) previewable at all.
        if (!instance.isSeed || transformsDiffer(instance.transform, seedTransform)) {
          // Not built yet (async geometry load still in flight) — skip it; the
          // EditorScene build completion calls back into refresh().
          const src = this.getObject(seedId);
          if (!src) continue;

          const ghost = src.group.clone(true);
          ghost.traverse((o) => {
            o.raycast = () => {}; // never pickable, never a click target
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) mesh.material = GHOST_MATERIAL;
          });
          applyPlacement(ghost, instance.transform);
          ghost.name = 'chain-ghost';
          this.group.add(ghost);
          ghosts++;
        }
      }
    }

    this.viewport.invalidate();
  }

  dispose(): void {
    this.viewport.scene.remove(this.group);
    // Clones only — the geometry is the shared cache's and the material is the
    // module singleton. Disposing either would break every other SubPart.
    this.group.clear();
  }
}
