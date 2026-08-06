import * as THREE from 'three';

/**
 * What a hit object resolves to: a SubPart instance, connector, collider, IVA seat, kitten,
 * light, or an Engine-designer nozzle-exhaust handle (`id` = the nozzle target key).
 */
export interface Selectable {
  kind: 'subpart' | 'connector' | 'collider' | 'ivaSeat' | 'kitten' | 'light' | 'nozzle';
  id: string;
  /**
   * Which VISUAL of a multi-instance entity was hit. Only SubPart-owned colliders and
   * lights have more than one (each is drawn once per placement of its owning template
   * — KSA has no per-instance collider or light), and the caller needs it to know which
   * placement's frame a gizmo drag should write back through.
   */
  instanceIndex?: number;
  /**
   * The `materialIndex` of the triangle the ray actually hit — i.e. WHICH FACE GROUP of a
   * multi-material mesh was clicked. Surface mode maps it back to a face key through
   * `PRIMITIVE_FACE_KEYS` (design-surface-assets.md §1.5 "click-to-pick"); every other
   * consumer ignores it. Undefined for a single-material or group-less hit.
   */
  faceGroupIndex?: number;
}

/**
 * Click-to-select via raycasting. Selection fires on pointerup only when the
 * pointer barely moved (so camera-orbit drags and gizmo drags don't count as
 * clicks). Resolves the hit object's owning entity from `userData.selectable`
 * and reports it (null when empty space is clicked). `additive` is true when a
 * multi-select modifier (Ctrl/Cmd/Shift) was held, so the caller can extend the
 * selection instead of replacing it.
 */
export class SelectionManager {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private downX = 0;
  private downY = 0;
  private suppressed = false;

  private readonly camera: THREE.Camera;
  private readonly domElement: HTMLElement;
  private readonly root: THREE.Object3D;
  private readonly onSelect: (selected: Selectable | null, additive: boolean) => void;

  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    root: THREE.Object3D,
    onSelect: (selected: Selectable | null, additive: boolean) => void,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.root = root;
    this.onSelect = onSelect;
    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.domElement.addEventListener('pointerup', this.handlePointerUp);
  }

  /** Suppress selection while a gizmo drag is in progress. */
  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
  }

  private readonly handlePointerDown = (e: PointerEvent): void => {
    this.downX = e.clientX;
    this.downY = e.clientY;
  };

  private readonly handlePointerUp = (e: PointerEvent): void => {
    if (this.suppressed) return;
    const moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
    if (moved > 4) return; // treat as a drag, not a click

    const additive = e.metaKey || e.ctrlKey || e.shiftKey;
    this.onSelect(this.pickAt(e.clientX, e.clientY), additive);
  };

  /**
   * Resolves the entity under a client-space point, or null for empty space. Shared with the
   * tools that do their OWN click routing while selection is suppressed (member painting,
   * design-animation-mode.md §7.4) — one raycast + resolve rule, so a tool can never disagree
   * with plain selection about what was clicked.
   */
  pickAt(clientX: number, clientY: number): Selectable | null {
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(this.root.children, true);
    // The face group travels WITH the hit, so it has to be read here rather than re-derived:
    // the entity's `userData.selectable` says nothing about which triangle was under the
    // cursor. `face.materialIndex` is undefined on a group-less geometry, which is exactly
    // the "whole mesh" answer Surface mode wants for a sphere/plane/imported mesh.
    const resolved = hits
      .map((hit) => {
        const selectable = findSelectable(hit.object);
        if (!selectable) return null;
        const materialIndex = hit.face?.materialIndex;
        return materialIndex === undefined
          ? selectable
          : { ...selectable, faceGroupIndex: materialIndex };
      })
      .filter((s): s is Selectable => s !== null);
    // Nozzle-exhaust handles win over distance: they are drawn depth-test-free precisely
    // because an exhaust point sits inside the bell that describes it, so honouring depth
    // order here would make a visible handle unclickable (the mesh in front of it wins).
    // They only exist while the Engine designer is placing exhaust, so nothing else is
    // shadowed by this rule.
    const nozzle = resolved.find((s) => s.kind === 'nozzle');
    return nozzle ?? resolved[0] ?? null;
  }

  dispose(): void {
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.domElement.removeEventListener('pointerup', this.handlePointerUp);
  }
}

function findSelectable(object: THREE.Object3D): Selectable | null {
  let node: THREE.Object3D | null = object;
  while (node) {
    const selectable = node.userData?.selectable as Selectable | undefined;
    if (selectable) return selectable;
    node = node.parent;
  }
  return null;
}
