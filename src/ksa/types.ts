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
 * Connector connection behavior, serialized as <Flags> on the <PartGameData>
 * <Connector>. "None" emits no <Flags> (the default connect-to-anything mode).
 * See docs/ksa-part-connector-notes.md for what each flag means in-game.
 */
export type ConnectorFlag = 'None' | 'Internal' | 'ToSurface' | 'FromSurface'

export const CONNECTOR_FLAGS: readonly ConnectorFlag[] = [
  'None',
  'Internal',
  'ToSurface',
  'FromSurface',
]

/** A connector attachment point within the Part. Faces local +X (its arrow). */
export interface Connector extends Transform {
  /** Connector id used in the exported XML, e.g. "_connector1". */
  id: string
  /** Connection behavior flag. */
  flags: ConnectorFlag
  /** Id of the {@link Layer} this connector belongs to (editor-only grouping). */
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

/** The built-in Default layer (for SubParts) that every new Part starts with. */
export function createDefaultLayer(): Layer {
  return { id: DEFAULT_LAYER_ID, name: 'Default' }
}

/** The built-in Connectors layer that every new Part starts with. */
export function createConnectorLayer(): Layer {
  return { id: CONNECTOR_LAYER_ID, name: 'Connectors' }
}

/** The built-in layers present in every Part (and never deletable). */
export const BUILT_IN_LAYER_IDS: readonly string[] = [DEFAULT_LAYER_ID, CONNECTOR_LAYER_ID]

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

/** The full Part being assembled in the editor. */
export interface EditingPart {
  /** Part id used in the exported XML (must be unique), e.g. "fixme_part_id". */
  partId: string
  /** Optional editor tags emitted as <EditorTag Value="..."/> in the Assets <Part>. */
  editorTags: string[]
  /** Editor-only layers; array order is the display order. Always includes Default. */
  layers: Layer[]
  /** All placed SubPart instances. */
  placements: SubPartPlacement[]
  /** All connector attachment points. */
  connectors: Connector[]
}

export function createEmptyPart(): EditingPart {
  return {
    partId: 'fixme_part_id',
    editorTags: [],
    layers: [createDefaultLayer(), createConnectorLayer()],
    placements: [],
    connectors: [],
  }
}
