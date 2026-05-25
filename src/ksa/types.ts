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

/** Euler rotation in radians, applied in XYZ order (matches KSA's serialization). */
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
}

/** The full Part being assembled in the editor. */
export interface EditingPart {
  /** Part id used in the exported XML (must be unique), e.g. "fixme_part_id". */
  partId: string
  /** Optional editor tags emitted as <EditorTag Value="..."/> in the Assets <Part>. */
  editorTags: string[]
  /** All placed SubPart instances. */
  placements: SubPartPlacement[]
  /** All connector attachment points. */
  connectors: Connector[]
}

export function createEmptyPart(): EditingPart {
  return { partId: 'fixme_part_id', editorTags: [], placements: [], connectors: [] }
}
