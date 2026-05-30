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

/** Docking port bound to a connector. Serialized as <DockingPort ConnectorId Force/>. */
export interface DockingPort {
  connectorId: string
  /** Docking force in newtons. */
  force: number
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
  tanks: Tank[]
  batteries: Battery[]
  generators: Generator[]
  powerConsumers: PowerConsumer[]
  decoupler: Decoupler | null
  dockingPort: DockingPort | null
  evaDoor: EvaDoor | null
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
    tanks: [],
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
 * A user-created primitive mesh + the texture applied to it. Becomes a custom
 * SubPart template: placements reference {@link subPartId} via subPartTemplateId,
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
  /** The primitive shape + parameters. */
  primitive: PrimitiveSpec
  /** Id of the {@link CustomTexture} applied as diffuse (empty = untextured). */
  textureId: string
}

/** The full Part being assembled in the editor. */
export interface EditingPart {
  /** Part id used in the exported XML (must be unique), e.g. "fixme_part_id". */
  partId: string
  /** Editor tags emitted as <EditorTag Value="..."/> on the <PartGameData>. */
  editorTags: string[]
  /** Optional popup-only GameData (display name, mass, tanks, power, coupling). */
  gameData: PartGameData
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
}

export function createEmptyPart(): EditingPart {
  return {
    partId: 'fixme_part_id',
    editorTags: [],
    gameData: createEmptyGameData(),
    layers: [createDefaultLayer(), createConnectorLayer(), createKittenLayer()],
    placements: [],
    connectors: [],
    kittens: [],
    customTextures: [],
    customMeshes: [],
  }
}
