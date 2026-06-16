/**
 * Core domain types for the flexo Part editor. These mirror the in-game
 * space-tape editor's state model (PartEditorState.cs / GameDataModels.cs) but
 * are intentionally framework-agnostic — no React, no three.js imports.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * Euler rotation in radians, stored in KSA's "XYZ" convention (matches KSA's
 * serialization). NOTE: KSA's "XYZ" composes to three.js's 'ZYX' order — the
 * conversion to three.js Object3D rotation lives in `three/coords.ts`.
 */
export interface EulerXYZ {
  x: number
  y: number
  z: number
}

export const VEC3_ZERO: Readonly<Vec3> = { x: 0, y: 0, z: 0 }
export const VEC3_ONE: Readonly<Vec3> = { x: 1, y: 1, z: 1 }
export const EULER_ZERO: Readonly<EulerXYZ> = { x: 0, y: 0, z: 0 }

/** A position/rotation/scale triple — the shape both SubParts and Connectors share. */
export interface Transform {
  /** Position relative to the Part origin, in meters. */
  position: Vec3
  /** Rotation in radians (Euler XYZ). */
  rotation: EulerXYZ
  /** Scale, default (1,1,1). */
  scale: Vec3
}

/** One placed SubPart instance within the Part being edited. */
export interface SubPartPlacement extends Transform {
  /** Unique instance id within this Part, e.g. "trussbara_1". */
  instanceId: string
  /** Catalog SubPart template id, e.g. "CoreStructuralA_Subpart_TrussBarA". */
  subPartTemplateId: string
  /** Id of the {@link Layer} this placement belongs to (editor-only grouping). */
  layerId: string
}

/**
 * Connector connection behavior, serialized into the comma-separated <Flags> on
 * the <PartGameData> (and <Part>) <Connector>. These are independent toggles
 * that may combine (matching space-tape's three checkboxes); an empty
 * {@link Connector.flags} array is the default connect-to-anything mode and
 * emits no <Flags>. See docs/ksa-part-connector-notes.md for what each means.
 */
export type ConnectorFlag = 'Internal' | 'ToSurface' | 'FromSurface'

export const CONNECTOR_FLAGS: readonly ConnectorFlag[] = ['Internal', 'ToSurface', 'FromSurface']

/** A connector attachment point within the Part. Faces local +X (its arrow). */
export interface Connector extends Transform {
  /** Connector id used in the exported XML, e.g. "_connector1". */
  id: string
  /** Connection behavior flags (independent, may combine). Empty = default mode. */
  flags: ConnectorFlag[]
  /** Id of the {@link Layer} this connector belongs to (editor-only grouping). */
  layerId: string
}

/**
 * Which of the three default KSA kittens to render. They share the same body mesh
 * and EVA suit; only the head pattern and eye color differ. See src/ksa/kittenAssets.ts.
 */
export type KittenKind = 'hunter' | 'polaris' | 'banjo'

/** All kitten kinds, in menu order. */
export const KITTEN_KINDS: readonly KittenKind[] = ['hunter', 'polaris', 'banjo']

/** Human-facing kitten names (menus, "<Name> Mesh" layer names). */
export const KITTEN_LABELS: Record<KittenKind, string> = {
  hunter: 'Hunter',
  polaris: 'Polaris',
  banjo: 'Banjo',
}

/**
 * A placed kitten EVA character — a purely visual aide (scale/placement reference).
 * Unlike {@link SubPartPlacement}, a kitten has NO catalog template and NO KSA XML
 * representation: it lives only in the editor document ({@link EditingPart.kittens})
 * and is never serialized to export. Always pinned to the built-in
 * {@link KITTEN_LAYER_ID} layer.
 */
export interface KittenInstance extends Transform {
  /** Unique instance id within this Part, e.g. "kitten_1". */
  id: string
  /** Which kitten to render (hunter/polaris/banjo). */
  kind: KittenKind
  /** Always {@link KITTEN_LAYER_ID}; present for parity with other layered entities. */
  layerId: string
}

/**
 * An editor-only grouping of placements/connectors, like a graphics program's
 * layers. Layers organize the workspace (visibility, locking, bulk selection)
 * but have NO representation in KSA XML — they are never serialized to export.
 * Layer *membership* and *definitions* are document state (in {@link EditingPart},
 * undo-tracked); per-layer *visibility/lock* is ephemeral view state persisted to
 * localStorage (see src/state/layerStore.ts).
 */
export interface Layer {
  /** Stable unique id; the built-in layer uses {@link DEFAULT_LAYER_ID}. */
  id: string
  /** User-facing label, e.g. "Default", "Engines". */
  name: string
}

/** Id of the built-in "Default" layer. It always exists and cannot be deleted. */
export const DEFAULT_LAYER_ID = 'default'

/**
 * Id of the built-in "Connectors" layer. Connectors are always added here so they
 * can be hidden/locked/managed separately from SubPart meshes. Cannot be deleted.
 */
export const CONNECTOR_LAYER_ID = 'connectors'

/**
 * Id of the built-in "Kittens" layer. Kitten visual aides ({@link KittenInstance})
 * always live here so they can be hidden/locked separately from the part. They are
 * editor-only and are NEVER serialized to export. Cannot be deleted.
 */
export const KITTEN_LAYER_ID = 'kittens'

/** The built-in Default layer (for SubParts) that every new Part starts with. */
export function createDefaultLayer(): Layer {
  return { id: DEFAULT_LAYER_ID, name: 'Default' }
}

/** The built-in Connectors layer that every new Part starts with. */
export function createConnectorLayer(): Layer {
  return { id: CONNECTOR_LAYER_ID, name: 'Connectors' }
}

/** The built-in Kittens layer that every new Part starts with (editor-only visual aides). */
export function createKittenLayer(): Layer {
  return { id: KITTEN_LAYER_ID, name: 'Kittens' }
}

/** The built-in layers present in every Part (and never deletable). */
export const BUILT_IN_LAYER_IDS: readonly string[] = [
  DEFAULT_LAYER_ID,
  CONNECTOR_LAYER_ID,
  KITTEN_LAYER_ID,
]

/**
 * The editor tags KSA's Core data uses to bucket parts in the in-game part
 * picker. Offered as suggestions in the Part Data dialog, but free-form custom
 * values are also allowed (KSA registers any tag string it sees).
 */
export const KNOWN_EDITOR_TAGS: readonly string[] = [
  'Capsules',
  'Cargo',
  'Coupling',
  'Electrical',
  'Engines',
  'Fuel Tanks',
  'Hidden',
  'Interstage',
  'Lights',
  'Passage',
  'Radial',
  'RCS',
  'Structural',
  'Tanks',
]

/**
 * Tank cross-section shape. Cylindrical tanks have a length; spherical ones are
 * defined by radius alone. Mirrors space-tape's `TankShape`.
 */
export type TankShape = 'Cylindrical' | 'Spherical'

/**
 * A fuel/oxidizer tank definition (a part may have several). Parametric — no 3D
 * workspace geometry; edited as numbers in the Part Data dialog. Serialized as
 * <CylindricalTank>/<SphericalTank> on <PartGameData>. Mirrors `TankState`.
 */
export interface Tank {
  shape: TankShape
  /** Wall material id, e.g. "Aluminum.2014(s)". Blank omits <Material>. */
  wallMaterialId: string
  /** Cylinder length in meters (ignored/omitted for spherical tanks). */
  lengthM: number
  /** Outer radius in meters. */
  outerRadiusM: number
  /** Wall thickness in millimeters. */
  wallThicknessMm: number
}

/** Battery storage (multiple allowed). Serialized as <Battery><MaximumCapacity KWh/>. */
export interface Battery {
  capacityKWh: number
}

/** Power generator (multiple allowed). Serialized as <Generator><Produced W/>. */
export interface Generator {
  outputWatts: number
}

/** Power consumer (multiple allowed). Serialized as <PowerConsumer><Consumed W/>. */
export interface PowerConsumer {
  consumedWatts: number
}

/** Decoupler bound to a connector. Serialized as <Decoupler ConnectorId Force/>. */
export interface Decoupler {
  connectorId: string
  /** Separation force in newtons. */
  force: number
}

/** Docking port bound to a connector. Serialized as <DockingPort ConnectorId LatchingImpulse PushoffForce/>. */
export interface DockingPort {
  connectorId: string
  /** Magnetic latching impulse in newton-seconds (LatchingImpulse attribute). */
  latchingImpulse: number
  /** Undock push-off force in newtons (PushoffForce attribute). */
  pushoffForce: number
}

/** EVA hatch bound to a connector. Serialized as <EVADoor ConnectorId/>. */
export interface EvaDoor {
  connectorId: string
}

/**
 * Per-part GameData carried in the sibling <PartGameData> document — the
 * "popup-only" metadata that has no 3D representation (connectors live on
 * {@link EditingPart.connectors} instead, since they ARE 3D). Mirrors
 * space-tape's `PartGameDataState` (GameDataModels.cs / PartEditorState.cs).
 */
export interface PartGameData {
  /** In-game display name (PartGameData DisplayName attribute). Blank omits it. */
  displayName: string
  /** Mass override in kg, or null for the part's default mass. */
  customMass: number | null
  batteries: Battery[]
  generators: Generator[]
  powerConsumers: PowerConsumer[]
  decoupler: Decoupler | null
  dockingPort: DockingPort | null
  evaDoor: EvaDoor | null
}

/**
 * Per-SubPart-template GameData: tanks that belong to a specific SubPart template.
 * Serialized as <SubPartGameData Id="subPartTemplateId"><Tank>...</Tank></SubPartGameData>
 * inside the <PartGameData> document. Multiple instances of the same template share
 * this data, matching KSA's SubPartGameData model.
 */
export interface SubPartGameData {
  /** The SubPart template id this data belongs to, e.g. "CoreFuelTankA_Subpart_Skin2W1HB". */
  subPartTemplateId: string
  tanks: Tank[]
}

/** Default tank: 2 m cylinder, 0.5 m radius, 2 mm aluminium wall (matches TankState). */
export function createTank(): Tank {
  return {
    shape: 'Cylindrical',
    wallMaterialId: 'Aluminum.2014(s)',
    lengthM: 2.0,
    outerRadiusM: 0.5,
    wallThicknessMm: 2.0,
  }
}

/** An empty GameData block (no display name, default mass, no sub-items). */
export function createEmptyGameData(): PartGameData {
  return {
    displayName: '',
    customMass: null,
    batteries: [],
    generators: [],
    powerConsumers: [],
    decoupler: null,
    dockingPort: null,
    evaDoor: null,
  }
}

/**
 * CUSTOM ASSETS — user-authored textures and primitive meshes (see
 * plans/FLEXO_CUSTOM_ASSETS.md). These descriptors are lightweight and live in
 * the document ({@link EditingPart}) so they persist with the project and are
 * undo-tracked. The heavy binaries (the source image, the encoded .ktx2, and the
 * generated .glb) are NEVER stored here — they live in IndexedDB (see
 * src/state/assetDb.ts) keyed by these ids, and are regenerated/exported on demand.
 */

/** Parametric primitive shape kinds offered by the mesh creator (v1). */
export type PrimitiveKind = 'box' | 'cylinder' | 'sphere' | 'plane'

export interface BoxParams {
  width: number
  height: number
  depth: number
}
export interface CylinderParams {
  radius: number
  height: number
  radialSegments: number
}
export interface SphereParams {
  radius: number
  /** Vertical segments; horizontal = 2× this. */
  segments: number
}
export interface PlaneParams {
  width: number
  height: number
}

/** A primitive shape + its parameters (framework-agnostic; built in three/primitives.ts). */
export type PrimitiveSpec =
  | { kind: 'box'; params: BoxParams }
  | { kind: 'cylinder'; params: CylinderParams }
  | { kind: 'sphere'; params: SphereParams }
  | { kind: 'plane'; params: PlaneParams }

/**
 * A user-uploaded texture. v1 carries a single diffuse image; the raw image bytes
 * and the encoded KTX2 live in IndexedDB under {@link id}.
 */
export interface CustomTexture {
  /** Stable unique id (also the IndexedDB key), e.g. "tex_ab12cd". */
  id: string
  /** User-facing label, also the basis for the exported .ktx2 filename. */
  name: string
  /** Base level dimensions of the encoded texture (post-decode/resize). */
  width: number
  height: number
}

/**
 * Per-face texture + UV configuration for a custom primitive mesh face.
 * Face key names are defined by PRIMITIVE_FACE_KEYS in three/primitives.ts
 * (e.g. 'right'/'left'/'top'/'bottom'/'front'/'back' for box,
 * 'side'/'top'/'bottom' for cylinder, 'all' for sphere/plane).
 */
export interface FaceTextureConfig {
  /** Id of the {@link CustomTexture} to use on this face (empty = untextured). */
  textureId: string
  /**
   * UV scale. { x: 1, y: 1 } = the whole image fills the face (default).
   * Values > 1 tile the image (e.g. 3 → 3×3 repeats, honoring {@link wrap});
   * values < 1 zoom into a sub-region (combine with {@link uvOffset} to pan).
   */
  uvScale: { x: number; y: number }
  /** UV offset (translation), used to pan the sampled region. { x: 0, y: 0 } = no offset (default). */
  uvOffset: { x: number; y: number }
  /**
   * How the texture samples where UVs fall outside 0–1 (scale > 1, or an offset
   * that pushes past an edge): 'repeat' tiles, 'mirror' tiles flipped each tile
   * (seamless), 'clamp' stretches the edge pixels. Defaults to 'repeat' when absent.
   */
  wrap?: TextureWrap
}

/** UV wrap mode for a textured face — how samples outside the 0–1 range behave. */
export type TextureWrap = 'repeat' | 'mirror' | 'clamp'

/**
 * A part-ified kitten submesh's geometry + material source. Present ONLY on a
 * {@link CustomMesh} created by "Make Kitten Mesh" (see makeKittenMeshPart) — it is
 * mutually exclusive with {@link CustomMesh.primitive}. Geometry is CPU-baked from
 * the shared kitten gltf at runtime (cached, regenerated on load — never persisted),
 * keyed by ({@link kind}, {@link specKey}). The texture URLs are Content/Core-relative
 * subpaths (the same paths KSA's CharacterAssets.xml uses); the editor renders them
 * via toUrl(), and export either references them by absolute path or bundles them
 * verbatim (a user setting). All channels are KSA-native .ktx2 (full PBR).
 */
export interface KittenMeshSource {
  /** Which kitten this submesh came from. */
  kind: KittenKind
  /** Stable per-submesh-type token (e.g. 'suit'|'head'|'eye'|'helmet'|'visor'|'pack'|'packLabels'). Drives the bake cache + subPart naming. */
  specKey: string
  /** Diffuse .ktx2 subpath, e.g. "Textures/Characters/Kitten_EMU_A.ktx2" (sRGB). */
  diffuse: string
  /** Tangent-space normal .ktx2 subpath (linear), if any. */
  normal?: string
  /** Packed AO/Rough/Metal .ktx2 subpath (linear), if any. */
  aoRoughMetal?: string
  /**
   * Glass-like transparency (the visor). Drives BOTH the translucent editor material
   * (see kittenBake `buildKittenMaterial`) AND the `<PartModelGlass>` export path (see
   * modExport `planKittenSubPart` → assetsXmlSerializer). A mesh with this set is
   * "glass-capable" and may carry a {@link CustomMesh.surface} mode + {@link GlassConfig}.
   */
  transparent?: boolean
}

/**
 * Emissive (glow) authoring shape for a custom mesh.
 *  - 'whole'   — a uniform glow over the whole mesh (color + strength).
 *  - 'painted' — an RGBA glow bitmap authored in the in-browser paint tool (stored in IndexedDB
 *                under assetKeys.emissivePaint(meshId)); rgb = glow color, a = intensity.
 */
export type EmissiveShape = 'whole' | 'painted'

/**
 * Per-mesh emissive (glow). Absent on a {@link CustomMesh} ⇒ no glow. KSA's glow is WHITE ×
 * mask × 1.25 ADDED after lighting (MeshIndirect.frag), so the COLOR comes from compositing
 * {@link color} into the diffuse by the mask — never from a uniform. {@link strength} (0..1) is the
 * mask's gray value (high washes toward white, matching real KSA parts).
 */
export interface EmissiveConfig {
  shape: EmissiveShape
  /** Glow color 0..255. Used by 'whole'; also the painter's default brush color for 'painted'. */
  color: { r: number; g: number; b: number }
  /** Glow intensity 0..1. 'whole': the uniform mask value. 'painted': default brush intensity. */
  strength: number
}

/**
 * Translucent-glass tint for a glass-capable (visor) mesh — one whose {@link KittenMeshSource}
 * has `transparent: true`. The tint is baked into a solid sRGB diffuse on export; KSA's glass
 * shader derives only ~10% of its color from the diffuse (MeshGlassIndirect.frag), so in-game the
 * tint reads subtle/dark — the editor can preview either the vivid color or that muted look.
 */
export interface GlassConfig {
  /** Glass tint color 0..255. */
  tint: { r: number; g: number; b: number }
  /** Editor-preview opacity 0..1 (default 0.45). In-game opacity is engine-fixed (~0.75). */
  opacity?: number
}

/**
 * Surface mode for a glass-capable (visor) mesh; only meaningful when its
 * {@link KittenMeshSource.transparent} is set. Undefined ⇒ 'glass' (back-compat).
 *  - 'glass'     — translucent, tintable (no glow; KSA glass can't glow).
 *  - 'glow'      — opaque emissive (drops the glass shell so it actually glows in-game).
 *  - 'glassGlow' — layered: a translucent glass shell + an inset opaque emissive layer behind it
 *                  (two SubParts on export; a single approximated material in the editor).
 */
export type VisorSurface = 'glass' | 'glow' | 'glassGlow'

/**
 * A user-created custom SubPart — either a primitive mesh + per-face textures, or a
 * part-ified kitten submesh ({@link kitten} set, {@link primitive} absent). Becomes a
 * custom SubPart template: placements reference {@link subPartId} via subPartTemplateId,
 * exactly like a Core template id. The generated GLB node is named {@link subPartId}.
 */
export interface CustomMesh {
  /** Stable unique id (IndexedDB key for the generated GLB), e.g. "mesh_ab12cd". */
  id: string
  /** User-facing label, also the basis for the SubPart/material names. */
  name: string
  /**
   * Stable SubPart template id (== GLB node name == Assets.xml SubPart Id). Decoupled
   * from {@link name}/project name so renames never break existing placements.
   */
  subPartId: string
  /** The primitive shape + parameters. Absent for kitten submeshes ({@link kitten} set). */
  primitive?: PrimitiveSpec
  /** Part-ified kitten submesh source. When set, this mesh is a kitten submesh and {@link primitive} is absent. */
  kitten?: KittenMeshSource
  /**
   * Per-face texture + UV configuration. Keys are primitive-kind-specific face names
   * from PRIMITIVE_FACE_KEYS ('right'/'left'/… for box, 'side'/'top'/'bottom' for
   * cylinder, 'all' for sphere/plane). Absent keys → untextured face, default UVs.
   * Always empty ({}) for kitten submeshes (they carry their material in {@link kitten}).
   */
  faceTextures: Partial<Record<string, FaceTextureConfig>>
  /**
   * Optional per-mesh emissive glow. For a glass-capable visor it is the glow layer used when
   * {@link surface} ∈ {'glow','glassGlow'}. A 'painted' shape stores its RGBA bitmap in IndexedDB
   * under assetKeys.emissivePaint(id).
   */
  emissive?: EmissiveConfig
  /** Optional translucent-glass tint (visor); used when {@link surface} ∈ {'glass','glassGlow'}. */
  glass?: GlassConfig
  /**
   * Surface mode for a glass-capable (visor) mesh — one whose {@link kitten} has `transparent`.
   * Ignored for non-transparent meshes (their glow is driven by {@link emissive} alone).
   * Undefined ⇒ 'glass'.
   */
  surface?: VisorSurface
}

/**
 * CUSTOM ANIMATIONS — user-authored keyframe animations that drive a Part's
 * SubParts via KSA's built-in `KeyframeAnimationModule` (see
 * plans/FEATURE_ANIMATIONS_PLAN.md). PURE DATA: an animation exports as one
 * `<KeyframeAnimationModule>` on the `<PartGameData>` plus one `Animations/*.glb`
 * joint-skeleton file — no game-code mod.
 *
 * KSA mandate (verified in KeyframeAnimationData.cs): every moving SubPart must be
 * a NON-animated leaf node named === its instance Id, parented under an ANIMATED
 * JOINT node (a directly-animated SubPart node is silently a no-op). So an
 * animation is authored as a small skeleton of {@link AnimationJoint}s + per-joint
 * {@link AnimationKeyframe} poses; the export builds the leaf parenting + offsets.
 */

/** How the in-game part popup exposes the animation. Maps to `ShowDeployRetract`. */
export type AnimationMode =
  /** Deploy/Retract buttons (ShowDeployRetract="true"): binary stowed↔deployed. */
  | 'deployRetract'
  /** "Actuate" 0→1 slider (ShowDeployRetract absent): free manual positioning. */
  | 'actuate'

/**
 * A pivot frame the animation rotates/translates. SubParts in
 * {@link memberInstanceIds} are rigidly attached and follow it. Joints may nest
 * via {@link parentJointId} to form kinematic chains (spider legs, multi-segment
 * landing gear); a root joint (parentJointId=null) is posed in Part space.
 */
export interface AnimationJoint {
  /** Stable unique id within the animation, e.g. "joint_ab12cd". */
  id: string
  /** User-facing label, e.g. "Hinge", "Hip", "Knee". */
  name: string
  /** Parent joint id for a chain, or null when posed directly in Part space. */
  parentJointId: string | null
  /** Instance ids of placements rigidly attached to this joint (become glb leaves). */
  memberInstanceIds: string[]
}

/**
 * A named easing preset. Each maps to a fixed CSS-style cubic-bézier control-point
 * tuple (see EASING_PRESETS in `easing.ts`). `linear` is the identity (no warp).
 */
export type EasingPreset =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInSine'
  | 'easeOutSine'
  | 'easeInOutSine'

/**
 * How a joint's pose interpolates across ONE keyframe segment. The canonical form is
 * a CSS-style cubic-bézier (P0=(0,0), P1=(x1,y1), P2=(x2,y2), P3=(1,1)); presets are
 * just named shortcuts that resolve to control points. Absent/`linear` = no warp.
 * The reverse-fit importer produces `cubicBezier`; the editor offers both.
 */
export type EasingConfig =
  | { kind: 'preset'; preset: EasingPreset }
  | { kind: 'cubicBezier'; x1: number; y1: number; x2: number; y2: number }

/**
 * A snapshot of every joint's LOCAL frame (relative to its parent joint, or Part
 * space for root joints) at one point on the 0→durationSec timeline. The keyframe
 * at timeSec=0 is the rest pose (must equal each SubPart's placement once composed).
 */
export interface AnimationKeyframe {
  /** Stable unique id within the animation, e.g. "kf_ab12cd". */
  id: string
  /** Time in seconds (KSA: 1 s sim = 1 s timeline). The first keyframe is always 0. */
  timeSec: number
  /** jointId → that joint's local frame at this time. Every joint has an entry. */
  poses: Record<string, Transform>
  /**
   * Optional easing for each joint over the OUTGOING segment [this kf → next kf].
   * A missing jointId entry (or `linear`) means linear interpolation for that joint
   * on this segment. Ignored on the final keyframe (it has no outgoing segment).
   * Stored per-joint because keyframe times are global but joints animate in
   * different sub-windows — on one segment joint A may ease while joint B holds.
   */
  easings?: Record<string, EasingConfig>
}

/**
 * Optional passthrough to KSA's built-in `<SolarTracking>` extension — after the
 * animation deploys, the named SubPart continuously rotates to face the sun.
 * Only meaningful for real solar panels; requires {@link AnimationMode} deployRetract.
 */
export interface SolarTrackingSpec {
  /** Tracking rotation speed, degrees per second. */
  degreesPerSecond: number
  /** Instance id of the SubPart that rotates to track the sun (the drive rotor). */
  subPartInstanceId: string
  /** Instance ids excluded from the tracking rotation (e.g. the fixed housing). */
  excludeInstanceIds: string[]
}

/**
 * A user-authored animation on the Part. Becomes one `<KeyframeAnimationModule>`
 * (+ one `Animations/*.glb`). A SubPart should be attached to at most one
 * animation — overlapping modules fight over its transform each frame.
 */
export interface PartAnimation {
  /** Stable unique id (basis for the module Id + glb filename), e.g. "anim_ab12cd". */
  id: string
  /** User-facing label, e.g. "Bay Doors", "Deploy". */
  name: string
  /** Full deploy time in seconds = KSA Duration (the max keyframe time). */
  durationSec: number
  mode: AnimationMode
  /** The pose skeleton. Single-joint for doors/hinges; nested for chains. */
  joints: AnimationJoint[]
  /** Poses over time, sorted by timeSec; keyframes[0].timeSec === 0. */
  keyframes: AnimationKeyframe[]
  /**
   * Id of the keyframe whose composed pose equals each SubPart's static placement —
   * the "modeled rest" the in-editor preview and the GLB export anchor on
   * (`world(leaf,t) = W_J(t)·W_J(rest)⁻¹·placement`). ABSENT ⇒ the earliest keyframe
   * (t=0), the hand-authoring convention where you pose forward from the modeled pose.
   * The built-in-Part importer sets it to the keyframe that matches the part's modeled
   * assembly: a KSA deploy clip is modeled fully-DEPLOYED, which is its LAST keyframe
   * (t=0 is the stowed start), so anchoring at t=0 would re-apply the whole deploy on
   * top of an already-deployed part. Flexo-internal only — never serialized to KSA.
   */
  restKeyframeId?: string
  /** Optional sun-tracking extension, or null. */
  solarTracking: SolarTrackingSpec | null
}

/**
 * A `<KeyframeAnimationModule>` parsed from a built-in Part's GameData XML, before
 * import. References (the solar-tracking SubParts) are in the ORIGINAL KSA instance-id
 * space; {@link import('./animationImport').decodeAnimationGlb} + the importer remap
 * them to the editor's regenerated instance ids. See docs in animationImport.ts.
 */
export interface CatalogAnimationModule {
  /** Module Id attribute (e.g. "SolarPanelAnimation"). */
  moduleId: string
  /** Maps to {@link AnimationMode}: ShowDeployRetract="true" ⇒ deployRetract. */
  showDeployRetract: boolean
  /** Relative path to the animation GLB, e.g. "Animations/..._Anim.glb". */
  glbPath: string
  /** `<KeyframeAnimation Id>` of the GLB (informational). */
  glbId: string
  /** Optional sun-tracking, with SubPart refs in ORIGINAL instance-id space. */
  solarTracking: {
    degreesPerSecond: number
    subPartOriginalId: string
    excludeOriginalIds: string[]
  } | null
}

/** An identity (rest) transform — position 0, rotation 0, scale 1. */
export function identityTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }
}

/** A fresh, empty animation: one rest keyframe at t=0, no joints, 1 s actuate. */
export function createPartAnimation(id: string, name: string): PartAnimation {
  return {
    id,
    name: name.trim() || 'Animation',
    durationSec: 1,
    mode: 'actuate',
    joints: [],
    keyframes: [{ id: `${id}_kf0`, timeSec: 0, poses: {} }],
    solarTracking: null,
  }
}

/** The full Part being assembled in the editor. */
export interface EditingPart {
  /** Part id used in the exported XML (must be unique), e.g. "fixme_part_id". */
  partId: string
  /** Editor tags emitted as <EditorTag Value="..."/> on the <PartGameData>. */
  editorTags: string[]
  /** Optional popup-only GameData (display name, mass, power, coupling). */
  gameData: PartGameData
  /** Per-SubPart-template GameData (tanks). Keyed by subPartTemplateId. */
  subPartGameData: SubPartGameData[]
  /** Editor-only layers; array order is the display order. Always includes Default. */
  layers: Layer[]
  /** All placed SubPart instances. */
  placements: SubPartPlacement[]
  /** All connector attachment points. */
  connectors: Connector[]
  /** Editor-only kitten visual aides (never serialized to export). */
  kittens: KittenInstance[]
  /** User-uploaded textures (descriptors only; binaries in IndexedDB). */
  customTextures: CustomTexture[]
  /** User-created primitive meshes / custom SubPart templates. */
  customMeshes: CustomMesh[]
  /** User-authored keyframe animations (KeyframeAnimationModule + Animations/*.glb). */
  animations: PartAnimation[]
}

export function createEmptyPart(): EditingPart {
  return {
    partId: 'fixme_part_id',
    editorTags: [],
    gameData: createEmptyGameData(),
    subPartGameData: [],
    layers: [createDefaultLayer(), createConnectorLayer(), createKittenLayer()],
    placements: [],
    connectors: [],
    kittens: [],
    customTextures: [],
    customMeshes: [],
    animations: [],
  }
}
