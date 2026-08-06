import * as THREE from 'three';
import type { CatalogSubPart } from '../ksa/catalog';
import type { CustomMesh, SubPartPlacement } from '../ksa/types';
import { buildMeshRenderData } from '../state/customAssetStore';
import {
  $activePartId,
  $partEntries,
  getInactiveDoc,
  type InactivePartDoc,
} from '../state/partsStore';
import { applyPlacement } from './coords';
import { planGhostItems, type GhostItemPlan } from './ghostPlan';
import { KittenObject } from './KittenObject';
import { applyMaterialOpacity, captureOpacityBase } from './layerOpacity';
import { SubPartObject } from './SubPartObject';

/**
 * The raycast every ghost node wears. Module-scope so the sweep assigns one shared function
 * rather than allocating a closure per node.
 */
const NOOP: THREE.Object3D['raycast'] = () => {};

/** One renderable piece of a ghost part: its scene node plus the two things the layer does to it. */
interface GhostItem {
  /** The subtree to mount under the part's ghost group. */
  node: THREE.Object3D;
  /** The owning layer's opacity from {@link planGhostItems}, multiplied into the part's own. */
  layerFactor: number;
  setOpacity: (factor: number) => void;
  dispose: () => void;
}

interface GhostBuild {
  group: THREE.Group;
  /**
   * Identity key: `parkActive()` builds a FRESH `InactivePartDoc` on every park, so a `===`
   * comparison detects "this part's document changed" without diffing anything.
   */
  doc: InactivePartDoc;
  items: GhostItem[];
  /**
   * At least one placement named a template the catalog did not have yet — see
   * {@link GhostPartsLayer.onCatalogChanged}.
   */
  missingTemplate: boolean;
}

/**
 * Renders every INACTIVE part of the project as a non-interactive "ghost" beside the part being
 * edited (`plans/MULTI_PART_PLAN.md` Phase 5) — real geometry, real materials, a per-part
 * visibility / opacity / workspace offset, and nothing else.
 *
 * **I5 — ghosts live OUTSIDE `EditorScene.root`.** {@link group} is a SIBLING of `root` on
 * `viewport.scene`, exactly like {@link ChainPreviewLayer} and {@link MeasurementLayer}. That one
 * placement is what keeps ghosts out of picking and marquee (`SelectionManager` raycasts
 * `root.children`), out of frame-all (`EditorScene.allEntityGroups()` walks the built ACTIVE
 * objects), out of `pickWorldPoint`, and out of thumbnails (`captureThumbnail` hides every
 * non-light scene sibling of `root`). Every ghost node ALSO gets {@link NOOP} for its raycast and
 * loses `userData.selectable` — belt and braces, and it keeps scene-level picks honest.
 *
 * **D3 — the offset is a GHOST-only transform.** The active part always edits at the origin; a
 * part's `offset` moves it only while it renders here.
 *
 * **I9 — on-demand rendering.** Nothing in this layer runs per frame. Ghosts are static scene
 * nodes; the owner subscribes through `EditorScene.sub()` and every async build ends with the
 * injected {@link invalidate}, so a change draws exactly one frame.
 *
 * PERFORMANCE (P5.05, audited):
 *  1. **Transparency.** Fading a ghost goes through the same {@link applyMaterialOpacity}
 *     primitive as the layer fade, which sets `transparent = true` + `depthWrite = false` below
 *     factor 1 — so a faded ghost inherits the layer fade's sorting caveats (two translucent
 *     surfaces can draw out of order) and nothing worse. At factor 1 the material is restored to
 *     its authored base (a base-transparent one — the kitten visor glass — stays transparent), so
 *     the default costs nothing.
 *  2. **Draw calls.** One mesh + one material clone per ghost placement — the identical cost
 *     model to an active placement (`SubPartObject.create` clones the shared material
 *     per-instance). Catalog, imported and kitten geometry (plus every texture) comes from the
 *     shared, never-disposed caches (`MeshAtlasCache`, `importedMeshCache`, the kitten bake
 *     caches), so a ghost of a template the session has already seen uploads no new geometry.
 *     The exception is a custom PRIMITIVE, whose geometry is rebuilt from its params per ghost —
 *     that is exactly what `geometryOwned` marks — and is freed again with the ghost.
 *  3. **No per-frame work** — see I9 above.
 *  4. **Kitten ghosts need BCn support** exactly like active kittens (`textureSupport.ts`); on a
 *     device without it, `KittenObject`'s existing flat-material fallback applies unchanged, so a
 *     ghost kitten degrades the same way the active one does.
 */
export class GhostPartsLayer {
  /** Scene SIBLING of `EditorScene.root` — see I5 in the class doc. */
  readonly group = new THREE.Group();

  private readonly scene: THREE.Scene;
  private readonly catalogIndex: () => Map<string, CatalogSubPart>;
  private readonly invalidate: () => void;
  /** partEntryId → build */
  private readonly builds = new Map<string, GhostBuild>();
  /** partEntryId → newest build token (the `PartPreviewViewport.setPart` idiom). */
  private readonly buildTokens = new Map<string, number>();
  /** Set by {@link dispose}: the layer is gone, so a build still in flight must not mount. */
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    catalogIndex: () => Map<string, CatalogSubPart>,
    invalidate: () => void,
  ) {
    this.scene = scene;
    this.catalogIndex = catalogIndex;
    this.invalidate = invalidate;
    this.group.name = 'ghost-parts';
    scene.add(this.group);
  }

  /**
   * Diffs the inactive set against what is built: a part whose parked document is the SAME object
   * keeps its meshes, anything else is rebuilt, and a part that vanished (deleted, or promoted to
   * active) is disposed. Driven by `$inactiveRevision`, which bumps on exactly those events.
   */
  refresh(): void {
    const activeId = $activePartId.get();
    const inactive = $partEntries.get().filter((entry) => entry.id !== activeId);
    const wanted = new Set(inactive.map((entry) => entry.id));

    for (const [id, build] of this.builds) {
      if (!wanted.has(id)) this.disposeBuild(id, build);
    }

    for (const entry of inactive) {
      const doc = getInactiveDoc(entry.id);
      const existing = this.builds.get(entry.id);
      if (!doc) {
        if (existing) this.disposeBuild(entry.id, existing);
        continue;
      }
      if (existing?.doc === doc) continue;
      if (existing) this.disposeBuild(entry.id, existing);
      void this.buildPart(entry.id, doc);
    }

    this.applyView();
    this.invalidate();
  }

  /**
   * Rebuilds only the ghosts that came up short of a catalog template, now that the catalog has
   * changed.
   *
   * NEEDED because the Core catalog loads asynchronously and the scene is constructed before it
   * lands: a ghost built at boot resolves NO built-in template and would render empty forever,
   * since `$inactiveRevision` (its only other trigger) does not bump when the catalog arrives.
   * Keyed on {@link GhostBuild.missingTemplate} rather than rebuilding everything, because
   * `$catalogIndex` also changes on every custom-mesh edit and on every part switch — where a
   * complete ghost has nothing to gain from a rebuild.
   */
  onCatalogChanged(): void {
    let stale = false;
    for (const [id, build] of this.builds) {
      if (!build.missingTemplate) continue;
      this.disposeBuild(id, build);
      stale = true;
    }
    if (stale) this.refresh();
  }

  /** Cheap in-place view update: visibility, ghost offset (D3) and opacity from `$partEntries`. */
  applyView(): void {
    const entries = $partEntries.get();
    for (const [id, build] of this.builds) {
      const entry = entries.find((e) => e.id === id);
      if (!entry) continue;
      build.group.visible = entry.visible;
      build.group.position.set(entry.offset.x, entry.offset.y, entry.offset.z);
      for (const item of build.items) item.setOpacity(entry.opacity * item.layerFactor);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const [id, build] of this.builds) this.disposeBuild(id, build);
    this.scene.remove(this.group);
  }

  /**
   * Builds one inactive part's ghost, token-guarded per part id.
   *
   * Geometry loads asynchronously, so a fast part switch (or a delete) can land a build for a part
   * that is no longer a ghost. The token is bumped by every start AND every disposal of this id,
   * and re-checked — together with "is this part still inactive" and {@link disposed} — before
   * anything is mounted; a superseded build disposes what it built and mounts nothing. Without it
   * a switch spree leaks a full part's meshes per switch, and a build in flight when the layer is
   * torn down (project close, a StrictMode double-mount) would mount into the detached group and
   * re-populate {@link builds} with nothing left to free it.
   */
  private async buildPart(partId: string, doc: InactivePartDoc): Promise<void> {
    const token = this.bumpToken(partId);
    const index = this.catalogIndex();
    const plans = planGhostItems(doc);
    // Which placements the catalog cannot resolve YET (see `onCatalogChanged`). A placement whose
    // template is one of the part's OWN custom meshes never needs the catalog.
    const missingTemplate = plans.some((plan) => {
      const templateId = plan.placement?.subPartTemplateId;
      if (templateId === undefined || index.has(templateId)) return false;
      return !doc.part.customMeshes.some((m) => m.subPartId === templateId);
    });

    const built = await Promise.all(
      plans.map((plan) =>
        this.buildItem(doc, plan).catch((err) => {
          console.warn(`GhostPartsLayer: failed to build a ghost item for '${partId}'`, err);
          return null;
        }),
      ),
    );
    const items = built.filter((item): item is GhostItem => item !== null);

    if (this.disposed || token !== this.buildTokens.get(partId) || !this.isInactive(partId)) {
      for (const item of items) item.dispose();
      return;
    }

    const group = new THREE.Group();
    group.name = `ghost-part:${partId}`;
    for (const item of items) group.add(item.node);
    this.group.add(group);
    this.builds.set(partId, { group, doc, items, missingTemplate });
    this.applyView();
    this.invalidate();

    // The catalog can land WHILE this build awaits — the boot race again, just narrower. The
    // computed rebuilds the Map on every write, so an identity change means "a newer catalog
    // exists than the one this build resolved against". Re-runs at most once per catalog write.
    if (missingTemplate && this.catalogIndex() !== index) this.onCatalogChanged();
  }

  /** One planned entity → a mounted-ready ghost item, or null when it cannot be rendered. */
  private async buildItem(doc: InactivePartDoc, plan: GhostItemPlan): Promise<GhostItem | null> {
    if (plan.kitten) {
      const kitten = plan.kitten;
      const obj = await KittenObject.create(kitten.kind, kitten);
      ghostify(obj.group);
      return {
        node: obj.group,
        layerFactor: plan.layerFactor,
        setOpacity: (factor) => obj.setLayerOpacity(factor),
        dispose: () => obj.dispose(),
      };
    }

    const placement = plan.placement;
    if (!placement) return null;

    // The owning part's OWN custom meshes come first: `$catalogIndex` carries the ACTIVE part's
    // custom templates (and `customMeshRenderCache` the active part's render data), so a ghost's
    // custom placement must never route through it — it builds its own render data instead.
    const mesh = doc.part.customMeshes.find((m) => m.subPartId === placement.subPartTemplateId);
    if (mesh) return this.buildCustomItem(doc, mesh, placement, plan.layerFactor);

    const entry = this.catalogIndex().get(placement.subPartTemplateId);
    if (!entry) return null; // unknown template (catalog not ready, or a Core part that moved)
    const obj = await SubPartObject.create(entry, placement);
    ghostify(obj.group);
    return {
      node: obj.group,
      layerFactor: plan.layerFactor,
      setOpacity: (factor) => obj.setLayerOpacity(factor),
      dispose: () => obj.dispose(),
    };
  }

  /**
   * A ghost of the part's own custom mesh, built bespoke from {@link buildMeshRenderData} against
   * the OWNING document (asset ids are project-unique — I4 — so resolving a ghost's `materialId`
   * against the active `$part` would miss and render default gray).
   *
   * DISPOSAL: materials ALWAYS (they are freshly created per call), geometry ONLY when the builder
   * says the caller owns it. Imported and kitten-baked geometry are the very objects the ACTIVE
   * part renders from the shared caches — disposing one here blanks the live scene.
   */
  private async buildCustomItem(
    doc: InactivePartDoc,
    mesh: CustomMesh,
    placement: SubPartPlacement,
    layerFactor: number,
  ): Promise<GhostItem | null> {
    const render = await buildMeshRenderData(mesh, doc.part);
    if (!render) return null; // no resolvable geometry — skip this mesh silently
    const { geometry, geometryOwned, materials } = render;

    // A multi-material mesh renders through the geometry's own groups, exactly as SubPartObject
    // builds a per-face primitive.
    const node = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
    applyPlacement(node, placement);
    ghostify(node);

    const bases = materials.map(captureOpacityBase);
    return {
      node,
      layerFactor,
      setOpacity: (factor) => {
        for (let i = 0; i < materials.length; i++) {
          applyMaterialOpacity(materials[i], bases[i], factor);
        }
      },
      dispose: () => {
        for (const material of materials) material.dispose();
        if (geometryOwned) geometry.dispose();
      },
    };
  }

  private bumpToken(partId: string): number {
    const token = (this.buildTokens.get(partId) ?? 0) + 1;
    this.buildTokens.set(partId, token);
    return token;
  }

  /** True while `partId` is still a part of this project and still NOT the one being edited. */
  private isInactive(partId: string): boolean {
    return (
      partId !== $activePartId.get() && $partEntries.get().some((entry) => entry.id === partId)
    );
  }

  /** Unmounts + frees one part's ghost, orphaning any build still in flight for it. */
  private disposeBuild(partId: string, build: GhostBuild): void {
    this.bumpToken(partId);
    this.group.remove(build.group);
    for (const item of build.items) item.dispose();
    this.builds.delete(partId);
  }
}

/**
 * The {@link ChainPreviewLayer} sweep, MINUS its material swap: a ghost keeps its real materials
 * (that is the whole point — it is a scale/fit reference, not a silhouette), it only stops being
 * clickable. Dropping `userData.selectable` matters because `SubPartObject`/`KittenObject` tag
 * their groups and meshes with it, and a scene-level pick that ever reaches one must not resolve
 * it to a selection in the ACTIVE part (ids are per-part namespaces — I3).
 */
function ghostify(node: THREE.Object3D): void {
  node.traverse((o) => {
    o.raycast = NOOP;
    delete o.userData.selectable;
  });
}
