import * as THREE from 'three'
import type { LightType, PartLight, Transform } from '../ksa/types'
import { applyPlacement } from './coords'
import { applyMaterialOpacity, captureOpacityBase, type MaterialOpacityBase } from './layerOpacity'

/** The shared selection green (matches ConnectorObject/ColliderObject/IvaSeatObject). */
const COLOR_SELECTED = 0x22dd44

/**
 * Fallback marker size in meters. Mirrors `$lightSettings.markerSize`'s default
 * (which is what the scene actually passes in).
 */
const DEFAULT_MARKER_SIZE = 0.12

/**
 * Below this max-channel value the marker tint is floored (lerped 50% toward
 * mid-gray) so a near-black light's marker doesn't vanish into the viewport. The
 * LIGHT keeps its authored color — only the marker display is floored.
 */
const TINT_FLOOR_THRESHOLD = 0.25

/**
 * One cast-light marker in the scene: a small "bulb" sphere at the emitter point,
 * tinted with the light's own color, plus — for a `Spot` — an aim cone along the
 * light's local **+X** (KSA aims a Spot along `double3.UnitX.Transform(rotation)`,
 * `LightModule.cs` — the same "facing = local +X" convention as every flexo marker).
 * A `Point` light gets no cone; retyping a light rebuilds the cone's presence.
 *
 * One `LightObject` per light INSTANCE: a part-level light has exactly one, while a
 * SubPart-owned light is drawn once per placement of its owning template (KSA
 * instantiates the template's `<Light>` per SubPart instance — see
 * plans/LIGHT_MANAGEMENT_PLAN.md §1.3), so like {@link ColliderObject} it carries an
 * {@link instanceIndex} identifying WHICH placement's visual it is.
 *
 * The Group and every SOLID child mesh carry the light id for raycast selection (the
 * ray hits a mesh, never the group). World pose comes from `coords.lightWorld` via
 * {@link setLight} — the object is a direct child of the identity `flexo-part` root,
 * never parented under a (scaled) placement group, because KSA's `Range` is world
 * meters regardless of owner scale (§1.3 #5) and the Phase-5 falloff volume must not
 * inherit a placement scale.
 *
 * The marker's size is a global editor setting (`$lightSettings.markerSize`), NOT
 * document data — the object does not subscribe to stores itself; `EditorScene`
 * rebuilds every marker (dispose + recreate) when the setting changes, exactly as it
 * does for connectors and seats, so there is no in-place resize path and
 * {@link dispose} is what has to be correct.
 */
export class LightObject {
  readonly group = new THREE.Group()
  readonly id: string
  /**
   * Which visual of this light we are — a SubPart-owned light is drawn once per
   * placement of its template (KSA has no per-instance light), and a click must
   * report WHICH one so the gizmo writes back through that placement's frame
   * (`$lightEditContext` → `EditorScene.lightGizmoFrame`). Always 0 for a part-level
   * light. Kept current by {@link setLight}; the same value rides the shared
   * `userData.selectable` stamp.
   */
  instanceIndex: number

  private readonly markerSize: number
  private type: LightType
  private selected = false
  /** Last layer-fade factor, re-applied when the aim cone is rebuilt mid-life. */
  private opacityFactor = 1
  /** The floored display tint (see {@link markerTint}) — restored on deselect. */
  private readonly tint = new THREE.Color(1, 1, 1)
  /** ONE stamp shared by the group and every solid child, so re-indexing propagates. */
  private readonly selectable: { kind: 'light'; id: string; instanceIndex: number }

  // Geometry/materials are PER OBJECT (the IvaSeatObject discipline): the sizes are
  // settings-driven and the markers rebuild wholesale on a settings change, so there
  // is nothing module-level to share yet. Phase 5's unit-sphere shell geometry and
  // volume shader WILL be module-level singletons — those must NOT be disposed here.
  private readonly bulbGeometry: THREE.SphereGeometry
  private readonly bulbMaterial: THREE.MeshBasicMaterial
  private readonly bulbBase: MaterialOpacityBase
  private cone: THREE.Mesh | null = null
  private coneGeometry: THREE.ConeGeometry | null = null
  private coneMaterial: THREE.MeshBasicMaterial | null = null
  private coneBase: MaterialOpacityBase | null = null

  constructor(light: PartLight, markerSize = DEFAULT_MARKER_SIZE, instanceIndex = 0) {
    this.id = light.id
    this.instanceIndex = instanceIndex
    this.markerSize = markerSize
    this.type = light.type
    this.group.name = instanceIndex > 0 ? `light:${light.id}#${instanceIndex}` : `light:${light.id}`
    this.selectable = { kind: 'light', id: light.id, instanceIndex }
    this.group.userData.selectable = this.selectable

    // The emitter point itself — and the click target. MeshBasicMaterial (unlit) so
    // the marker reads as a self-lit bulb rather than a lit surface.
    this.bulbGeometry = new THREE.SphereGeometry(0.4 * markerSize, 16, 12)
    this.bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const bulb = new THREE.Mesh(this.bulbGeometry, this.bulbMaterial)
    bulb.userData.selectable = this.selectable
    this.group.add(bulb)
    this.bulbBase = captureOpacityBase(this.bulbMaterial)

    if (light.type === 'Spot') this.buildCone()

    // ── Phase 5 seam ────────────────────────────────────────────────────────────
    // The coverage visualization children land here (plans/LIGHT_MANAGEMENT_PLAN.md
    // §3.5/§3.6):
    //   wire:   LineSegments boundary wireframe on the range sphere
    //           — wire.raycast = () => {}
    //   volume: InstancedMesh falloff shell stack with LightVolumeMaterial
    //           — volume.raycast = () => {}; volume.frustumCulled = false
    // Both are decoration and NEVER raycast targets; only the bulb and the aim cone
    // are clickable. Their geometry rebuilds on range/angle changes inside setLight.
    // ────────────────────────────────────────────────────────────────────────────

    // `light` extends Transform, so its own transform doubles as the default world
    // pose (exact for a part-level light; EditorScene.positionLights immediately
    // overrides a SubPart-owned one with its placement frame).
    this.setLight(light, light, instanceIndex)
  }

  /** Builds the Spot aim cone along local +X (the ConnectorObject.ts convention). */
  private buildCone(): void {
    const size = this.markerSize
    this.coneGeometry = new THREE.ConeGeometry(0.25 * size, 1.2 * size, 12)
    this.coneMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const cone = new THREE.Mesh(this.coneGeometry, this.coneMaterial)
    cone.userData.selectable = this.selectable
    cone.rotation.z = -Math.PI / 2 // cone's default +Y axis -> +X
    cone.position.x = 0.9 * size
    this.group.add(cone)
    this.cone = cone
    this.coneBase = captureOpacityBase(this.coneMaterial)
    // A cone built mid-life (Point → Spot retype) must pick up the CURRENT view
    // state — the layer fade and selection tint — not construction defaults.
    applyMaterialOpacity(this.coneMaterial, this.coneBase, this.opacityFactor)
    this.applyTint()
  }

  /** Removes + disposes the aim cone (Spot → Point retype, and dispose()). */
  private removeCone(): void {
    if (!this.cone) return
    this.group.remove(this.cone)
    this.coneGeometry?.dispose()
    this.coneMaterial?.dispose()
    this.cone = null
    this.coneGeometry = null
    this.coneMaterial = null
    this.coneBase = null
  }

  /**
   * Applies a light's current state to this visual: the PART-SPACE pose computed by
   * the caller via `coords.lightWorld(light, ownerOrPosedFrame)` (NEVER
   * `colliderWorld` — the owner's scale applies to a light's position offset, unlike
   * a collider's), the marker tint, the aim cone's presence (rebuilt when the type
   * changed), and which owner-placement instance this visual represents.
   *
   * `scale` is pinned to 1: KSA ignores light scale ({@link PartLight}'s `scale` is
   * unused and never emitted) and `Range` is world meters regardless of owner scale,
   * so the marker must never scale with the document. Only the global `markerSize`
   * changes how big it draws (via an EditorScene rebuild).
   */
  setLight(light: PartLight, world: Transform, instanceIndex: number): void {
    if (instanceIndex !== this.instanceIndex) {
      this.instanceIndex = instanceIndex
      this.selectable.instanceIndex = instanceIndex // shared stamp — updates every mesh
      this.group.name = instanceIndex > 0 ? `light:${this.id}#${instanceIndex}` : `light:${this.id}`
    }

    if (light.type !== this.type) {
      this.type = light.type
      if (light.type === 'Spot') this.buildCone()
      else this.removeCone()
    }

    this.tint.copy(markerTint(light))
    this.applyTint()

    applyPlacement(this.group, { ...world, scale: { x: 1, y: 1, z: 1 } })
  }

  /** Bright green when selected, the light's own (floored) color otherwise. */
  setSelected(selected: boolean): void {
    this.selected = selected
    this.applyTint()
  }

  /** Dims this light marker to `factor` (0–1) of its base opacity for the layer fade. */
  setLayerOpacity(factor: number): void {
    this.opacityFactor = factor
    applyMaterialOpacity(this.bulbMaterial, this.bulbBase, factor)
    if (this.coneMaterial && this.coneBase) {
      applyMaterialOpacity(this.coneMaterial, this.coneBase, factor)
    }
  }

  private applyTint(): void {
    if (this.selected) {
      this.bulbMaterial.color.setHex(COLOR_SELECTED)
      this.coneMaterial?.color.setHex(COLOR_SELECTED)
    } else {
      this.bulbMaterial.color.copy(this.tint)
      this.coneMaterial?.color.copy(this.tint)
    }
  }

  dispose(): void {
    this.bulbGeometry.dispose()
    this.bulbMaterial.dispose()
    this.removeCone()
    // Phase 5: dispose per-object wire geometry + cloned volume material here; the
    // shared unit-sphere geometry and program-cached shader are module-level
    // singletons and MUST NOT be disposed per object.
  }
}

/**
 * The marker tint for a light: its own color, floored toward mid-gray when near
 * black ({@link TINT_FLOOR_THRESHOLD}) so the marker stays visible. Channels are
 * interpreted as sRGB — the same reading the UI's hex color swatch uses — so the
 * bulb matches the picker.
 */
function markerTint(light: PartLight): THREE.Color {
  let { r, g, b } = light.color
  if (Math.max(r, g, b) < TINT_FLOOR_THRESHOLD) {
    r = r * 0.5 + 0.25
    g = g * 0.5 + 0.25
    b = b * 0.5 + 0.25
  }
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace)
}
