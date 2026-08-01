import * as THREE from 'three';
import { clampSpotAngles } from '../ksa/lightFalloff';
import type { LightType, PartLight, Transform } from '../ksa/types';
import { applyPlacement } from './coords';
import { applyMaterialOpacity, captureOpacityBase, type MaterialOpacityBase } from './layerOpacity';
import {
  SHELL_COUNT,
  SHELL_MAX_ALPHA,
  shellRadii,
  spotPreviewCone,
  volumeExposure,
} from './lightVolume';
import { ring } from './wireShapes';

/** The shared selection green (matches ConnectorObject/ColliderObject/IvaSeatObject). */
const COLOR_SELECTED = 0x22dd44;

/**
 * Fallback marker size in meters. Mirrors `$lightSettings.markerSize`'s default
 * (which is what the scene actually passes in).
 */
const DEFAULT_MARKER_SIZE = 0.12;

/**
 * Below this max-channel value the marker tint is floored (lerped 50% toward
 * mid-gray) so a near-black light's marker doesn't vanish into the viewport. The
 * LIGHT keeps its authored color — only the marker display is floored.
 */
const TINT_FLOOR_THRESHOLD = 0.25;

/** Chords per drawn boundary circle (the rims and the Point light's three great circles). */
const RIM_SEGMENTS = 48;
const POINT_CIRCLE_SEGMENTS = 64;

/** Segments per range-sphere cap arc (the two meridians closing a Spot's boundary). */
const CAP_ARC_SEGMENTS = 32;

/**
 * Rays drawn from a Spot's apex to its outer rim. **12 is KSA's own**
 * `SPOT_BASE_SEGMENTS` (`decomp/KSA.Rendering.Lighting/LightUtils.cs:9`) — flexo keeps
 * the game debug draw's visual language and changes only where the rims sit (§1.6).
 */
const SPOT_RAYS = 12;

/** Below this inner half-angle the inner rim is skipped (it would collapse onto the axis). */
const MIN_INNER_ANGLE_RAD = 0.01;

/**
 * Fallback aim distance for a preview Spot's target when the light's range is degenerate.
 * three derives the beam direction from `position → target` and NORMALIZES it, so the
 * magnitude is irrelevant — but a zero-length vector normalizes to `NaN` and takes the
 * whole spot (and every material's spot loop) with it.
 */
const MIN_PREVIEW_AIM_M = 1;

/** Boundary wireframe opacity — present enough to read as the edge, quiet enough to see through. */
const WIRE_OPACITY = 0.55;

/** Coverage viz knobs a light needs from `$lightSettings` (structurally compatible with it). */
export interface LightVolumeViz {
  exposureMode: 'auto' | 'absolute';
  vizExposure: number;
}

const DEFAULT_VIZ: LightVolumeViz = { exposureMode: 'auto', vizExposure: 1 };

/**
 * The ONE shell geometry, shared by every light in the scene (each shell is an
 * INSTANCE of it, scaled to its radius). Module-level and program-cached: it must
 * NEVER be disposed per object — {@link LightObject.dispose} only releases per-object
 * resources.
 */
const UNIT_SPHERE = new THREE.SphereGeometry(1, 32, 16);

/**
 * Falloff-volume vertex shader (plan §3.6). `instanceMatrix` is the shell's uniform
 * scale, so `vLocal` is the fragment's position in LIGHT-LOCAL METERS with **+X = aim**
 * — exactly the frame KSA's attenuation is expressed in. three declares
 * `attribute mat4 instanceMatrix` for us because this is a `ShaderMaterial` on an
 * `InstancedMesh` (a `RawShaderMaterial` would have to declare it by hand).
 */
const VOLUME_VERTEX_GLSL = /* glsl */ `
varying vec3 vLocal;
void main() {
  vec4 p = instanceMatrix * vec4(position, 1.0);
  vLocal = p.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * p;
}
`;

/**
 * Falloff-volume fragment shader: KSA's `LightPrePass.comp:281-296` evaluated per
 * fragment — the distance window `1 − (d/R)⁴`, the inverse square, and the SQUARED
 * spot edge — then a display-only Reinhard curve `E / (E + uExposure)` (the knee comes
 * from {@link volumeExposure}). Everything up to `E` is the game's math verbatim; only
 * the last two lines are presentation.
 */
const VOLUME_FRAGMENT_GLSL = /* glsl */ `
uniform float uRange;
uniform float uIntensity;
uniform float uCosInner;
uniform float uCosOuter;
uniform float uIsSpot;
uniform float uExposure;
uniform float uMaxAlpha;
uniform vec3 uColor;
varying vec3 vLocal;
void main() {
  float d = length(vLocal);
  float x2 = (d * d) / (uRange * uRange);
  float win = clamp(1.0 - x2 * x2, 0.0, 1.0);
  float E = uIntensity * win / max(d * d, 1e-4);
  float cosT = vLocal.x / max(d, 1e-6);
  float s = clamp((cosT - uCosOuter) / max(uCosInner - uCosOuter, 1e-4), 0.0, 1.0);
  E *= mix(1.0, s * s, uIsSpot);
  float a = uMaxAlpha * (E / (E + uExposure));
  gl_FragColor = vec4(uColor * a, 1.0);
}
`;

/**
 * One light's shell material. A FRESH material (and a fresh uniforms object — three
 * shares uniforms by reference on `clone()`) per light, because every uniform here is
 * per-light; three's program cache still compiles the shader once.
 *
 * `BackSide` draws exactly ONE face per shell whether the camera is outside the volume
 * or inside it (FrontSide vanishes on entry, DoubleSide double-counts). Additive +
 * `depthWrite: false` makes the stack order-independent; `depthTest: true` keeps part
 * geometry occluding the glow, which is what makes the coverage read as 3D.
 */
function createVolumeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRange: { value: 1 },
      uIntensity: { value: 1 },
      uCosInner: { value: 0 },
      uCosOuter: { value: 0 },
      uIsSpot: { value: 0 },
      uExposure: { value: 1 },
      uMaxAlpha: { value: SHELL_MAX_ALPHA },
      uColor: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: VOLUME_VERTEX_GLSL,
    fragmentShader: VOLUME_FRAGMENT_GLSL,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
}

/**
 * The hard boundary of a light's reach, in the light's local frame (+X = aim), as
 * line-segment pairs — plan §3.5/§1.6.
 *
 * - **Point:** three great circles of the range sphere (XY / XZ / YZ).
 * - **Spot:** KSA's own debug-draw language — {@link SPOT_RAYS} rays from the apex plus
 *   inner/outer rim circles — but with the rims placed **on the range sphere** (center
 *   `x = R·cos θ`, radius `R·sin θ`) instead of KSA's `Range · tan θ` flat discs, and
 *   closed by two cap arcs. That deviation is deliberate: `tan` explodes for wide cones
 *   (Core's FloodlightA authors `Outer = 1.57`, where the game's own draw would put a
 *   ~3.4 km rim on a 3 m light), and the true extinction surface IS the sphere `d = R`,
 *   so a Spot's boundary is a spherical cap, not a disc.
 *
 * Angles run through {@link clampSpotAngles} first, so the wireframe shows the cone the
 * game will actually render (flexo still stores/emits what the user authored).
 */
function lightWireGeometry(light: PartLight): THREE.BufferGeometry {
  const R = Math.max(light.rangeM, 0);
  const pts: number[] = [];
  if (R > 0) {
    if (light.type === 'Point') {
      pts.push(...ring(POINT_CIRCLE_SEGMENTS, (c, s) => [c * R, s * R, 0]));
      pts.push(...ring(POINT_CIRCLE_SEGMENTS, (c, s) => [c * R, 0, s * R]));
      pts.push(...ring(POINT_CIRCLE_SEGMENTS, (c, s) => [0, c * R, s * R]));
    } else {
      const { innerRad, outerRad } = clampSpotAngles(light.innerAngleRad, light.outerAngleRad);
      const axialOuter = R * Math.cos(outerRad);
      const radiusOuter = R * Math.sin(outerRad);

      for (let k = 0; k < SPOT_RAYS; k++) {
        const phi = (2 * Math.PI * k) / SPOT_RAYS;
        pts.push(0, 0, 0);
        pts.push(axialOuter, radiusOuter * Math.cos(phi), radiusOuter * Math.sin(phi));
      }
      pts.push(...ring(RIM_SEGMENTS, (c, s) => [axialOuter, radiusOuter * c, radiusOuter * s]));
      if (innerRad >= MIN_INNER_ANGLE_RAD) {
        const axialInner = R * Math.cos(innerRad);
        const radiusInner = R * Math.sin(innerRad);
        pts.push(...ring(RIM_SEGMENTS, (c, s) => [axialInner, radiusInner * c, radiusInner * s]));
      }
      for (let j = 0; j < CAP_ARC_SEGMENTS; j++) {
        const t0 = -outerRad + (2 * outerRad * j) / CAP_ARC_SEGMENTS;
        const t1 = -outerRad + (2 * outerRad * (j + 1)) / CAP_ARC_SEGMENTS;
        pts.push(R * Math.cos(t0), R * Math.sin(t0), 0, R * Math.cos(t1), R * Math.sin(t1), 0);
        pts.push(R * Math.cos(t0), 0, R * Math.sin(t0), R * Math.cos(t1), 0, R * Math.sin(t1));
      }
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geom;
}

/** The shape inputs of {@link lightWireGeometry} — a change here (and only here) rebuilds it. */
function wireKeyOf(light: PartLight): string {
  return `${light.type}|${light.rangeM}|${light.innerAngleRad}|${light.outerAngleRad}`;
}

/**
 * One cast-light marker in the scene: a small "bulb" sphere at the emitter point,
 * tinted with the light's own color, plus — for a `Spot` — an aim cone along the
 * light's local **+X** (KSA aims a Spot along `double3.UnitX.Transform(rotation)`,
 * `LightModule.cs` — the same "facing = local +X" convention as every flexo marker).
 * A `Point` light gets no cone; retyping a light rebuilds the cone's presence.
 *
 * Plus the optional COVERAGE visualization ({@link setCoverageVisible}): the hard
 * boundary wireframe ({@link lightWireGeometry}) and the falloff shell stack — an
 * `InstancedMesh` of {@link SHELL_COUNT} spheres shaded with KSA's exact attenuation
 * ({@link VOLUME_FRAGMENT_GLSL}). Neither is ever a raycast target.
 *
 * Plus the optional LIVE PREVIEW ({@link setPreview}): a real `THREE.PointLight` /
 * `SpotLight` that actually illuminates the part meshes. Unlike the coverage children it
 * is created and destroyed on demand — three re-links shader programs when the scene's
 * light count changes, so an always-present-but-hidden light would cost the same as no
 * light at all only while invisible, and the toggle has to add/remove either way.
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
 * meters regardless of owner scale (§1.3 #5) and the falloff volume must not inherit
 * a placement scale.
 *
 * The marker's size is a global editor setting (`$lightSettings.markerSize`), NOT
 * document data — the object does not subscribe to stores itself; `EditorScene`
 * rebuilds every marker (dispose + recreate) when the setting changes, exactly as it
 * does for connectors and seats, so there is no in-place resize path and
 * {@link dispose} is what has to be correct.
 */
export class LightObject {
  readonly group = new THREE.Group();
  readonly id: string;
  /**
   * Which visual of this light we are — a SubPart-owned light is drawn once per
   * placement of its template (KSA has no per-instance light), and a click must
   * report WHICH one so the gizmo writes back through that placement's frame
   * (`$lightEditContext` → `EditorScene.lightGizmoFrame`). Always 0 for a part-level
   * light. Kept current by {@link setLight}; the same value rides the shared
   * `userData.selectable` stamp.
   */
  instanceIndex: number;

  private readonly markerSize: number;
  private type: LightType;
  private selected = false;
  /** Last layer-fade factor, re-applied when the aim cone is rebuilt mid-life. */
  private opacityFactor = 1;
  /** The floored display tint (see {@link markerTint}) — restored on deselect. */
  private readonly tint = new THREE.Color(1, 1, 1);
  /** ONE stamp shared by the group and every solid child, so re-indexing propagates. */
  private readonly selectable: { kind: 'light'; id: string; instanceIndex: number };

  /** Exposure knobs from `$lightSettings`; {@link setViz} re-shades without a rebuild. */
  private viz: LightVolumeViz;
  /** The last light applied — lets a settings-only change re-derive uniforms in place. */
  private lightState: PartLight;
  /** Shape inputs the current wire geometry was built for ({@link wireKeyOf}). */
  private wireKey: string;
  /** Range the current shell instance matrices were built for. */
  private shellRange: number;

  // Marker geometry/materials are PER OBJECT (the IvaSeatObject discipline): the sizes
  // are settings-driven and the markers rebuild wholesale on a settings change. The
  // shell geometry ({@link UNIT_SPHERE}) is the one module-level singleton and must NOT
  // be disposed here; the shell MATERIAL is per object (every uniform in it is).
  private readonly bulbGeometry: THREE.SphereGeometry;
  private readonly bulbMaterial: THREE.MeshBasicMaterial;
  private readonly bulbBase: MaterialOpacityBase;
  private cone: THREE.Mesh | null = null;
  private coneGeometry: THREE.ConeGeometry | null = null;
  private coneMaterial: THREE.MeshBasicMaterial | null = null;
  private coneBase: MaterialOpacityBase | null = null;
  private wireGeometry: THREE.BufferGeometry;
  private readonly wireMaterial: THREE.LineBasicMaterial;
  private readonly wireBase: MaterialOpacityBase;
  private readonly wire: THREE.LineSegments;
  private readonly volume: THREE.InstancedMesh;
  private readonly volumeMaterial: THREE.ShaderMaterial;

  // ── Live preview (§3.10) — a per-object resource that exists ONLY while enabled ────
  /** Whether {@link setPreview} has been asked for a real light. */
  private previewEnabled = false;
  /** The real light, when enabled. Its TYPE follows the document (retype swaps it). */
  private previewLight: THREE.PointLight | THREE.SpotLight | null = null;
  /** A Spot's aim target — a child of {@link group} at local (range, 0, 0). */
  private previewTarget: THREE.Object3D | null = null;

  constructor(
    light: PartLight,
    markerSize = DEFAULT_MARKER_SIZE,
    instanceIndex = 0,
    viz: LightVolumeViz = DEFAULT_VIZ,
  ) {
    this.id = light.id;
    this.instanceIndex = instanceIndex;
    this.markerSize = markerSize;
    this.type = light.type;
    this.viz = viz;
    this.lightState = light;
    this.group.name =
      instanceIndex > 0 ? `light:${light.id}#${instanceIndex}` : `light:${light.id}`;
    this.selectable = { kind: 'light', id: light.id, instanceIndex };
    this.group.userData.selectable = this.selectable;

    // The emitter point itself — and the click target. MeshBasicMaterial (unlit) so
    // the marker reads as a self-lit bulb rather than a lit surface.
    this.bulbGeometry = new THREE.SphereGeometry(0.4 * markerSize, 16, 12);
    this.bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const bulb = new THREE.Mesh(this.bulbGeometry, this.bulbMaterial);
    bulb.userData.selectable = this.selectable;
    this.group.add(bulb);
    this.bulbBase = captureOpacityBase(this.bulbMaterial);

    // ── Coverage visualization (plans/LIGHT_MANAGEMENT_PLAN.md §3.5/§3.6) ────────
    // BEFORE the aim cone: building the cone re-applies the current tint, which now
    // covers the boundary wire too, so the wire material has to exist by then.
    // Both children are DECORATION and never raycast targets — only the bulb and the
    // aim cone are clickable — and both start hidden: `EditorScene.applyLightCoverage`
    // owns their visibility (`$lightSettings.showVolumes`, default "selected").
    this.wireKey = wireKeyOf(light);
    this.wireGeometry = lightWireGeometry(light);
    this.wireMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: WIRE_OPACITY,
      depthWrite: false,
    });
    this.wire = new THREE.LineSegments(this.wireGeometry, this.wireMaterial);
    this.wire.raycast = () => {};
    this.wire.visible = false;
    this.group.add(this.wire);
    this.wireBase = captureOpacityBase(this.wireMaterial);

    this.volumeMaterial = createVolumeMaterial();
    this.volume = new THREE.InstancedMesh(UNIT_SPHERE, this.volumeMaterial, SHELL_COUNT);
    this.volume.raycast = () => {};
    // Instance scaling invalidates the unit sphere's bounding volume, so three's
    // frustum test would cull shells that are on screen.
    this.volume.frustumCulled = false;
    this.volume.visible = false;
    this.shellRange = Number.NaN; // forces the first setLight to lay out the shells
    this.group.add(this.volume);
    // ────────────────────────────────────────────────────────────────────────────

    if (light.type === 'Spot') this.buildCone();

    // `light` extends Transform, so its own transform doubles as the default world
    // pose (exact for a part-level light; EditorScene.positionLights immediately
    // overrides a SubPart-owned one with its placement frame).
    this.setLight(light, light, instanceIndex);
  }

  /** Builds the Spot aim cone along local +X (the ConnectorObject.ts convention). */
  private buildCone(): void {
    const size = this.markerSize;
    this.coneGeometry = new THREE.ConeGeometry(0.25 * size, 1.2 * size, 12);
    this.coneMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cone = new THREE.Mesh(this.coneGeometry, this.coneMaterial);
    cone.userData.selectable = this.selectable;
    cone.rotation.z = -Math.PI / 2; // cone's default +Y axis -> +X
    cone.position.x = 0.9 * size;
    this.group.add(cone);
    this.cone = cone;
    this.coneBase = captureOpacityBase(this.coneMaterial);
    // A cone built mid-life (Point → Spot retype) must pick up the CURRENT view
    // state — the layer fade and selection tint — not construction defaults.
    applyMaterialOpacity(this.coneMaterial, this.coneBase, this.opacityFactor);
    this.applyTint();
  }

  /** Removes + disposes the aim cone (Spot → Point retype, and dispose()). */
  private removeCone(): void {
    if (!this.cone) return;
    this.group.remove(this.cone);
    this.coneGeometry?.dispose();
    this.coneMaterial?.dispose();
    this.cone = null;
    this.coneGeometry = null;
    this.coneMaterial = null;
    this.coneBase = null;
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
      this.instanceIndex = instanceIndex;
      this.selectable.instanceIndex = instanceIndex; // shared stamp — updates every mesh
      this.group.name =
        instanceIndex > 0 ? `light:${this.id}#${instanceIndex}` : `light:${this.id}`;
    }

    if (light.type !== this.type) {
      this.type = light.type;
      if (light.type === 'Spot') this.buildCone();
      else this.removeCone();
    }

    this.lightState = light;
    this.tint.copy(markerTint(light));
    this.applyTint();

    // Geometry only rebuilds on a SHAPE change (type / range / cone angles) — dragging
    // the position, rotation, color or intensity must not churn buffers every frame.
    const key = wireKeyOf(light);
    if (key !== this.wireKey) {
      this.wireKey = key;
      const geom = lightWireGeometry(light);
      this.wire.geometry = geom;
      this.wireGeometry.dispose();
      this.wireGeometry = geom;
    }
    if (light.rangeM !== this.shellRange) this.layoutShells(light.rangeM);
    this.applyVolumeUniforms();
    // Color / intensity / range / angles all feed the preview light too (and a retype
    // swaps Point ⇄ Spot) — a no-op when the preview is off.
    this.syncPreview();

    applyPlacement(this.group, { ...world, scale: { x: 1, y: 1, z: 1 } });
  }

  /** Applies changed viz settings (exposure) without rebuilding anything. */
  setViz(viz: LightVolumeViz): void {
    this.viz = viz;
    this.applyVolumeUniforms();
  }

  /**
   * Shows/hides the coverage children (boundary wire + falloff shells).
   * `EditorScene` composes `$lightSettings.showVolumes` with the Lights layer's own
   * visibility and calls this — it never touches `group.visible`, which `applyLayerView`
   * owns exclusively.
   */
  setCoverageVisible(visible: boolean): void {
    this.wire.visible = visible;
    this.volume.visible = visible;
  }

  /**
   * Adds/removes the LIVE PREVIEW light — a real `THREE.PointLight`/`SpotLight` that
   * actually illuminates the part meshes (plans/LIGHT_MANAGEMENT_PLAN.md §3.10).
   *
   * A per-object resource, created and released here rather than by an `EditorScene`
   * rebuild: only `markerSize` has no in-place path, and rebuilding every marker to flip
   * a global toggle would churn every geometry in the scene. `EditorScene` composes the
   * `$lightSettings.livePreview` toggle with the Lights layer's visibility and the
   * {@link import('./lightVolume').MAX_PREVIEW_LIGHTS} budget and calls this.
   *
   * Nothing else in the class touches it: {@link setLayerOpacity} and {@link applyTint}
   * enumerate the marker MATERIALS by name, so a fade or a selection tint can never
   * dim/recolor the actual illumination (a light has no opacity, and tinting the light
   * green on selection would be a lie about the part's appearance).
   */
  setPreview(enabled: boolean): void {
    if (enabled === this.previewEnabled) return;
    this.previewEnabled = enabled;
    if (enabled) this.syncPreview();
    else this.disposePreview();
  }

  /**
   * Builds the preview light for the CURRENT type and pushes every parameter into it —
   * the §3.10 mapping table:
   *
   * | KSA | three.js |
   * | --- | --- |
   * | `Color` | `color` (read as sRGB, matching the bulb + the inspector swatch) |
   * | `Intensity` | `intensity` (candela — both laws are `I/d²`) |
   * | `Range` | `distance` + `decay = 2` (three's own window is SQUARED — docs/lights.md) |
   * | `OuterAngle` | `angle` (KSA-clamped) |
   * | `InnerAngle` | `penumbra = 1 − inner/outer` ({@link spotPreviewCone}) |
   * | aim = local +X | `target` at local `(range, 0, 0)`, parented INTO the group |
   *
   * The target must be part of the scene graph — three reads `target.matrixWorld`, which
   * only the renderer's traversal updates — so it is a child of {@link group}, which also
   * makes the beam inherit the marker's world pose for free.
   *
   * Shadows stay off (perf; KSA's shadow config is out of scope), and a light KSA would
   * cull CPU-side (`Range ≤ 0` or `Intensity ≤ 0`, `ClusteredLightSystem.cs:669,760`) is
   * left `visible = false` — three treats `distance = 0` as INFINITE range, which would
   * otherwise flood the whole scene from a light the game never renders.
   */
  private syncPreview(): void {
    if (!this.previewEnabled) return;
    const light = this.lightState;
    const wantSpot = light.type === 'Spot';
    if (this.previewLight && this.previewLight instanceof THREE.SpotLight !== wantSpot) {
      this.disposePreview();
    }
    if (!this.previewLight) {
      if (wantSpot) {
        const target = new THREE.Object3D();
        // Lights are never raycast (Object3D's own raycast is a no-op), but the target IS
        // a plain Object3D sitting under a group that carries `userData.selectable` — an
        // explicit opt-out keeps it out of picking no matter what three does later.
        target.raycast = () => {};
        this.group.add(target);
        const spot = new THREE.SpotLight(0xffffff, 1, 1, 1, 0, 2);
        // three's SpotLight constructor copies Object3D.DEFAULT_UP into its position, so a
        // fresh spot sits at local (0,1,0) — 1 m ABOVE the emitter, which both offsets the
        // beam and tilts its aim (the target is at local (range,0,0), so the direction came
        // out (range,−1,0) — a ~9.5° error at range 6). Pin it to the marker origin.
        spot.position.set(0, 0, 0);
        spot.target = target;
        this.group.add(spot);
        this.previewTarget = target;
        this.previewLight = spot;
      } else {
        const point = new THREE.PointLight(0xffffff, 1, 1, 2);
        this.group.add(point);
        this.previewLight = point;
      }
      this.previewLight.castShadow = false;
    }

    const preview = this.previewLight;
    preview.color.setRGB(light.color.r, light.color.g, light.color.b, THREE.SRGBColorSpace);
    preview.intensity = Math.max(light.intensity, 0);
    preview.distance = Math.max(light.rangeM, 0);
    preview.visible = light.rangeM > 0 && light.intensity > 0;
    if (preview instanceof THREE.SpotLight) {
      const { angleRad, penumbra } = spotPreviewCone(light.innerAngleRad, light.outerAngleRad);
      preview.angle = angleRad;
      preview.penumbra = penumbra;
      this.previewTarget?.position.set(Math.max(light.rangeM, MIN_PREVIEW_AIM_M), 0, 0);
    }
  }

  /** Removes + releases the preview light (toggle off, retype, and dispose()). */
  private disposePreview(): void {
    if (this.previewLight) {
      this.group.remove(this.previewLight);
      this.previewLight.dispose();
      this.previewLight = null;
    }
    if (this.previewTarget) {
      this.group.remove(this.previewTarget);
      this.previewTarget = null;
    }
  }

  /**
   * Lays the shells out at {@link shellRadii} as uniform-scale instances. `count` (not
   * a hidden mesh) is what a degenerate range yields: a light KSA culls CPU-side draws
   * NO shells rather than a misleading pinpoint.
   */
  private layoutShells(rangeM: number): void {
    const radii = shellRadii(rangeM);
    const m = new THREE.Matrix4();
    for (let i = 0; i < radii.length; i++) {
      m.makeScale(radii[i], radii[i], radii[i]);
      this.volume.setMatrixAt(i, m);
    }
    this.volume.count = radii.length;
    this.volume.instanceMatrix.needsUpdate = true;
    this.shellRange = rangeM;
  }

  /**
   * Pushes the light's falloff parameters into the shell shader, so editing Range /
   * Intensity / the cone angles / Color re-shades live (no rebuild). The cone angles go
   * through {@link clampSpotAngles} and are packed as COSINES — exactly what the game
   * uploads (`Light.CreateLightData`, `LightData.glsl:23,26`); a Point light gets the
   * game's own `0` sentinels plus `uIsSpot = 0`, which makes the shader's `mix` ignore
   * them entirely.
   */
  private applyVolumeUniforms(): void {
    const light = this.lightState;
    const u = this.volumeMaterial.uniforms;
    u.uRange.value = Math.max(light.rangeM, 1e-6);
    u.uIntensity.value = light.intensity;
    if (light.type === 'Spot') {
      const { innerRad, outerRad } = clampSpotAngles(light.innerAngleRad, light.outerAngleRad);
      u.uCosInner.value = Math.cos(innerRad);
      u.uCosOuter.value = Math.cos(outerRad);
      u.uIsSpot.value = 1;
    } else {
      u.uCosInner.value = 0;
      u.uCosOuter.value = 0;
      u.uIsSpot.value = 0;
    }
    // The glow is written straight to the framebuffer (no `<colorspace_fragment>`), so
    // the authored 0–1 channels ARE the display values — the same reading the color
    // swatch in the inspector shows.
    (u.uColor.value as THREE.Color).setRGB(light.color.r, light.color.g, light.color.b);
    u.uExposure.value = volumeExposure(
      light.rangeM,
      light.intensity,
      this.viz.exposureMode,
      this.viz.vizExposure,
    );
    u.uMaxAlpha.value = SHELL_MAX_ALPHA * this.opacityFactor;
  }

  /** Bright green when selected, the light's own (floored) color otherwise. */
  setSelected(selected: boolean): void {
    this.selected = selected;
    this.applyTint();
  }

  /** Dims this light marker to `factor` (0–1) of its base opacity for the layer fade. */
  setLayerOpacity(factor: number): void {
    this.opacityFactor = factor;
    applyMaterialOpacity(this.bulbMaterial, this.bulbBase, factor);
    if (this.coneMaterial && this.coneBase) {
      applyMaterialOpacity(this.coneMaterial, this.coneBase, factor);
    }
    applyMaterialOpacity(this.wireMaterial, this.wireBase, factor);
    // The shells are additive, so `opacity` does nothing to them — the fade has to
    // scale their per-shell alpha ceiling instead.
    this.volumeMaterial.uniforms.uMaxAlpha.value = SHELL_MAX_ALPHA * factor;
  }

  private applyTint(): void {
    if (this.selected) {
      this.bulbMaterial.color.setHex(COLOR_SELECTED);
      this.coneMaterial?.color.setHex(COLOR_SELECTED);
      this.wireMaterial.color.setHex(COLOR_SELECTED);
    } else {
      this.bulbMaterial.color.copy(this.tint);
      this.coneMaterial?.color.copy(this.tint);
      this.wireMaterial.color.copy(this.tint);
    }
  }

  dispose(): void {
    this.bulbGeometry.dispose();
    this.bulbMaterial.dispose();
    this.removeCone();
    this.disposePreview();
    this.wireGeometry.dispose();
    this.wireMaterial.dispose();
    // The shell MATERIAL is per object (its uniforms are), so it is disposed; the shared
    // UNIT_SPHERE geometry is a module-level singleton and MUST NOT be. `InstancedMesh`
    // .dispose() only releases the instance attribute buffers.
    this.volume.dispose();
    this.volumeMaterial.dispose();
  }
}

/**
 * The marker tint for a light: its own color, floored toward mid-gray when near
 * black ({@link TINT_FLOOR_THRESHOLD}) so the marker stays visible. Channels are
 * interpreted as sRGB — the same reading the UI's hex color swatch uses — so the
 * bulb matches the picker.
 */
function markerTint(light: PartLight): THREE.Color {
  let { r, g, b } = light.color;
  if (Math.max(r, g, b) < TINT_FLOOR_THRESHOLD) {
    r = r * 0.5 + 0.25;
    g = g * 0.5 + 0.25;
    b = b * 0.5 + 0.25;
  }
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}
