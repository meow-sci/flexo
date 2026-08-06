import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Viewport } from './Viewport';
import { AXIS_COLOR_CSS } from './axisColors';
import { jointWorld, restAnchorTime } from '../ksa/animationRig';
import type { PartAnimation } from '../ksa/types';
import { $part } from '../state/editorStore';
import { $activeTool, $mode } from '../state/modeStore';
import {
  $activeAnimationId,
  $activeJointId,
  $pivotEditing,
  $workingPivot,
} from '../state/animationStore';

/**
 * **Joint markers** (design-animation-mode.md §9.3) — every joint of the open clip drawn as a
 * 3D-PICKABLE glyph at its rest frame, plus the `◇` working-pivot marker (§9.4 item 4).
 *
 * This replaces v1's single non-pickable `AxesHelper`, and with it the last of the three
 * disagreeing t=0 sites (census §4.6): a marker sits at `jointWorld(anim, joint,
 * restAnchorTime(anim))`, so on an imported KSA deploy clip — modeled DEPLOYED, anchored at
 * its LAST keyframe — the markers land ON the modeled geometry instead of on the stowed pose
 * nobody can see.
 *
 * - inactive joint → a small screen-constant octahedron (≈10 px), clickable to activate it;
 * - active joint → a 0.4-unit axis triad plus a name label;
 * - while the pivot tool is armed the active marker goes amber, matching the gizmo;
 * - hidden while `member-paint` holds the tool slot (those clicks belong to painting) and
 *   outside Animation mode.
 *
 * **Pickability is by REMOVAL, not by `visible`**: three.js raycasts invisible objects, so a
 * hidden-but-present marker would keep stealing clicks (the nozzle-handle lesson). Every
 * refresh rebuilds the set from scratch.
 *
 * **Rendering**: the layer never runs a loop. It rescales on camera change (the same event
 * that already invalidates) and invalidates itself when a hover changes.
 */

/** Screen radius of an inactive marker's glyph, in CSS pixels. */
const GLYPH_PX = 5;
/** Screen radius of the invisible pick volume — the "within ~12 px" rule of §9.3. */
const PICK_PX = 12;
/** The active joint's axis triad, in world units (design §9.3). */
const TRIAD_LENGTH = 0.4;

const INACTIVE_COLOR = 0x94a3b8;
const HOVER_COLOR = 0x6ee7ff;
const PIVOT_COLOR = 0xff9f0a;
/** The `◇` working pivot — a throwaway anchor, so deliberately not an axis colour. */
const WORKING_COLOR = 0xc084fc;

interface Marker {
  jointId: string;
  group: THREE.Group;
  glyph: THREE.Mesh;
  pick: THREE.Mesh;
  label: { obj: CSS2DObject; el: HTMLDivElement } | null;
}

export class JointMarkerLayer {
  private readonly viewport: Viewport;
  private readonly group = new THREE.Group();
  private readonly markers: Marker[] = [];
  private working: THREE.Mesh | null = null;

  private readonly glyphGeometry = new THREE.OctahedronGeometry(1, 0);
  private readonly pickGeometry = new THREE.SphereGeometry(1, 8, 6);
  private readonly workingGeometry = new THREE.OctahedronGeometry(1, 0);
  private readonly pickMaterial: THREE.MeshBasicMaterial;
  private readonly materials = new Set<THREE.Material>();

  private readonly ray = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private hoveredId: string | null = null;

  constructor(viewport: Viewport, root: THREE.Object3D) {
    this.viewport = viewport;
    this.group.name = 'joint-markers';
    // In the PART root, because that is what `SelectionManager` raycasts — a marker has to
    // resolve to `kind: 'joint'` like any other pick. The root is at identity, so a joint's
    // Part-space world matrix is also its scene-space one.
    root.add(this.group);
    this.pickMaterial = new THREE.MeshBasicMaterial({ visible: false });
    viewport.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    // A camera move changes only how big a screen-constant glyph must be drawn; the event
    // has already invalidated the loop, so this rescales in place and adds no frame.
    viewport.controls.addEventListener('change', this.onCameraChange);
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.hoverAt(e.clientX, e.clientY)) this.viewport.invalidate();
  };

  private readonly onCameraChange = (): void => {
    if (this.markers.length > 0 || this.working) this.rescale();
  };

  /**
   * Rebuilds the marker set from the stores. Called by `EditorScene` from its `sub()`
   * channels, so the on-demand loop is invalidated for us.
   */
  refresh(): void {
    const anim = this.activeAnimation();
    // Painting owns the clicks (§9.3), so the joint affordances step out of the way.
    const painting = $activeTool.get() === 'member-paint';
    if (!anim || painting) {
      this.clear();
      this.applyWorkingPivot();
      return;
    }

    const activeId = $activeJointId.get();
    const anchorT = restAnchorTime(anim);
    const wanted = new Set(anim.joints.map((j) => j.id));
    for (let i = this.markers.length - 1; i >= 0; i--) {
      if (!wanted.has(this.markers[i].jointId)) this.disposeMarker(this.markers.splice(i, 1)[0]);
    }

    for (const joint of anim.joints) {
      let marker = this.markers.find((m) => m.jointId === joint.id);
      if (!marker) {
        marker = this.createMarker(joint.id);
        this.markers.push(marker);
      }
      const m = jointWorld(anim, joint.id, anchorT);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      m.decompose(pos, quat, new THREE.Vector3());
      marker.group.position.copy(pos);
      marker.group.quaternion.copy(quat);
      const active = joint.id === activeId;
      // The active joint reads as a frame (it has an orientation the gizmo rotates about);
      // the others are just points, so they keep the compact octahedron.
      marker.group.children
        .filter((child) => child.userData.triad === true)
        .forEach((child) => (child.visible = active));
      marker.glyph.visible = !active;
      if (marker.label) {
        marker.label.el.textContent = joint.name;
        marker.label.obj.visible = active || this.hoveredId === joint.id;
      }
      this.paint(marker, active);
    }

    this.applyWorkingPivot();
    this.rescale();
  }

  /** Re-sizes the screen-constant glyphs. Cheap enough to run on every camera change. */
  rescale(): void {
    const camera = this.viewport.camera;
    const height = this.viewport.renderer.domElement.clientHeight || 1;
    const k = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / height;
    for (const marker of this.markers) {
      const perPixel = camera.position.distanceTo(marker.group.position) * k;
      marker.glyph.scale.setScalar(Math.max(1e-4, GLYPH_PX * perPixel));
      marker.pick.scale.setScalar(Math.max(1e-4, PICK_PX * perPixel));
    }
    if (this.working) {
      const perPixel = camera.position.distanceTo(this.working.position) * k;
      this.working.scale.setScalar(Math.max(1e-4, (GLYPH_PX + 2) * perPixel));
    }
  }

  /**
   * Hover feedback (§9.3): accent tint + the joint's name. Returns true when the hover
   * CHANGED, so the caller can invalidate exactly once.
   */
  hoverAt(clientX: number, clientY: number): boolean {
    const hit = this.markers.length > 0 ? this.pick(clientX, clientY) : null;
    if (hit === this.hoveredId) return false;
    this.hoveredId = hit;
    const activeId = $activeJointId.get();
    for (const marker of this.markers) {
      this.paint(marker, marker.jointId === activeId);
      if (marker.label)
        marker.label.obj.visible = marker.jointId === activeId || marker.jointId === hit;
    }
    return true;
  }

  dispose(): void {
    this.viewport.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.viewport.controls.removeEventListener('change', this.onCameraChange);
    this.clear();
    this.clearWorking();
    this.group.removeFromParent();
    this.glyphGeometry.dispose();
    this.pickGeometry.dispose();
    this.workingGeometry.dispose();
    this.pickMaterial.dispose();
    for (const material of this.materials) material.dispose();
    this.materials.clear();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private activeAnimation(): PartAnimation | null {
    if ($mode.get() !== 'animation') return null;
    const id = $activeAnimationId.get();
    return (id ? $part.get().animations.find((a) => a.id === id) : null) ?? null;
  }

  private pick(clientX: number, clientY: number): string | null {
    const dom = this.viewport.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.viewport.camera);
    const hits = this.ray.intersectObjects(
      this.markers.map((m) => m.pick),
      false,
    );
    const selectable = hits[0]?.object.userData.selectable as { id?: string } | undefined;
    return selectable?.id ?? null;
  }

  private createMarker(jointId: string): Marker {
    const group = new THREE.Group();
    group.name = `joint-marker:${jointId}`;
    const selectable = { kind: 'joint', id: jointId };
    group.userData.selectable = selectable;

    const glyphMaterial = new THREE.MeshBasicMaterial({
      color: INACTIVE_COLOR,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    });
    this.materials.add(glyphMaterial);
    const glyph = new THREE.Mesh(this.glyphGeometry, glyphMaterial);
    glyph.renderOrder = 20;
    // The glyph itself is never the pick target: the inflated `pick` sphere below is, which
    // is what gives a joint marker its click priority over the mesh behind it.
    glyph.raycast = () => {};
    group.add(glyph);

    const pick = new THREE.Mesh(this.pickGeometry, this.pickMaterial);
    pick.userData.selectable = selectable;
    group.add(pick);

    for (const axis of ['x', 'y', 'z'] as const) {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(AXIS_COLOR_CSS[axis]),
        depthTest: false,
        depthWrite: false,
      });
      this.materials.add(material);
      const geometry = new THREE.CylinderGeometry(0.008, 0.008, TRIAD_LENGTH, 6);
      geometry.translate(0, TRIAD_LENGTH / 2, 0);
      const arm = new THREE.Mesh(geometry, material);
      arm.renderOrder = 20;
      arm.raycast = () => {};
      arm.userData.triad = true;
      if (axis === 'x') arm.rotation.z = -Math.PI / 2;
      else if (axis === 'z') arm.rotation.x = Math.PI / 2;
      arm.visible = false;
      group.add(arm);
    }

    const label = makeLabel();
    label.obj.visible = false;
    label.obj.position.set(0, TRIAD_LENGTH * 1.2, 0);
    group.add(label.obj);

    this.group.add(group);
    return { jointId, group, glyph, pick, label };
  }

  /** Colours one marker: amber while the pivot tool is armed, accent on hover, else muted. */
  private paint(marker: Marker, active: boolean): void {
    const material = marker.glyph.material as THREE.MeshBasicMaterial;
    const hovered = marker.jointId === this.hoveredId;
    const pivot = active && $pivotEditing.get();
    material.color.setHex(pivot ? PIVOT_COLOR : hovered ? HOVER_COLOR : INACTIVE_COLOR);
    material.opacity = hovered || active ? 1 : 0.75;
  }

  /** The `◇` working-pivot glyph (§9.4 item 4) — read-only, never pickable. */
  private applyWorkingPivot(): void {
    const pivot = $mode.get() === 'animation' ? $workingPivot.get() : null;
    if (!pivot) {
      this.clearWorking();
      return;
    }
    if (!this.working) {
      const material = new THREE.MeshBasicMaterial({
        color: WORKING_COLOR,
        depthTest: false,
        depthWrite: false,
        wireframe: true,
      });
      this.materials.add(material);
      this.working = new THREE.Mesh(this.workingGeometry, material);
      this.working.renderOrder = 21;
      this.working.raycast = () => {}; // a posing aid, not an entity
      this.group.add(this.working);
    }
    this.working.position.set(pivot.position.x, pivot.position.y, pivot.position.z);
  }

  private clearWorking(): void {
    if (!this.working) return;
    this.working.removeFromParent();
    const material = this.working.material as THREE.Material;
    this.materials.delete(material);
    material.dispose();
    this.working = null;
  }

  private clear(): void {
    for (const marker of this.markers) this.disposeMarker(marker);
    this.markers.length = 0;
    this.hoveredId = null;
  }

  private disposeMarker(marker: Marker): void {
    marker.group.removeFromParent();
    marker.group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.material !== this.pickMaterial) {
        const material = mesh.material as THREE.Material;
        this.materials.delete(material);
        material.dispose();
        // Only the triad arms own their geometry; the shared glyph/pick ones are the layer's.
        if (mesh.geometry !== this.glyphGeometry && mesh.geometry !== this.pickGeometry)
          mesh.geometry.dispose();
      }
    });
    if (marker.label) {
      marker.label.obj.removeFromParent();
      marker.label.el.remove();
    }
  }
}

/** A styled HTML label wrapped in a CSS2DObject — the `MeasurementLayer` recipe. */
function makeLabel(): { obj: CSS2DObject; el: HTMLDivElement } {
  const el = document.createElement('div');
  el.style.cssText = [
    'padding:1px 5px',
    'border-radius:4px',
    'font:600 11px/1.4 ui-monospace,monospace',
    'color:#e5e7eb',
    'background:rgba(15,17,23,0.78)',
    'border:1px solid rgba(148,163,184,0.35)',
    'white-space:nowrap',
    'user-select:none',
    'transform:translate(-50%,-50%)',
  ].join(';');
  return { obj: new CSS2DObject(el), el };
}
