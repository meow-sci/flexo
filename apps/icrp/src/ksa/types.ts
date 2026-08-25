/**
 * ICRP domain types (plans/ICRP_PLAN.md §0.5).
 *
 * Geometry primitives (`Vec3`, `Transform`, `PartCollider`, …) are flexo's —
 * static objects share the vessel `TransformReference` / `ColliderModule`
 * schema verbatim (plan facts F4/F6). Everything document-shaped is ICRP's own.
 *
 * INVARIANT I1: the document never contains three.js axes. All numbers are
 * KSA-frame metres / XYZ radians in the static-object assembly frame
 * (+X up, +Y east, +Z north). Only `three/basis.ts` knows the frame change.
 */
import type { EulerXYZ, PartCollider, Transform, Vec3 } from '../../../../src/ksa/types';

export type { EulerXYZ, PartCollider, Transform, Vec3 };

/** The identity transform (fresh object each call — callers mutate). */
export function identityTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

/** Where a piece's mesh/material come from (plan D6). */
export type PieceSource =
  /** A Core `<StaticSubObject>` (referenced by id; nothing shipped). */
  | { kind: 'core-static'; subObjectId: string }
  /**
   * A Core vessel `<SubPart>`: exported as a NEW `<StaticSubObject>` that
   * references the Core mesh/material by id (global first-wins registries,
   * plan fact F12) and carries the SubPart's own colliders.
   */
  | { kind: 'core-subpart'; subPartId: string }
  /** A user-imported GLB mesh + material bundled into the mod (P5). */
  | { kind: 'custom'; customMeshId: string; materialId: string };

/** An editor-only grouping layer (never exported — KSA XML has no layers). */
export interface LayerDef {
  id: string;
  name: string;
  /** Hidden layers render nothing and are unpickable (view state, not undo-enrolled). */
  visible: boolean;
  /** Locked layers render but are unpickable/undraggable (view state, additive field). */
  locked?: boolean;
}

export const DEFAULT_LAYER_ID = 'default';

export function defaultLayer(): LayerDef {
  return { id: DEFAULT_LAYER_ID, name: 'Default', visible: true };
}

/**
 * A magnetic snap point (EDITOR-ONLY, never exported — KSA statics have no
 * connectors). Harvested from the stock `<Part><Connector>`s at import time
 * (localized into the anchor placement's frame, like the part-level colliders)
 * so imported tanks/parts stack and dock like they do in KSA's vehicle editor.
 * Faces local +X, exactly like the vessel connector it came from.
 */
export interface SnapConnector {
  id: string;
  /** Position in the owning placement's local frame (metres). */
  position: Vec3;
  /** Rotation in the owning placement's local frame (XYZ radians; +X = facing). */
  rotation: EulerXYZ;
}

/**
 * One placement of a piece inside a static object — exported as
 * `<SubObject Id InstanceOf><Transform/></SubObject>` (plan fact F3).
 */
export interface Placement {
  /** Editor id, also the exported `Id` attribute (unused by KSA at runtime). */
  instanceId: string;
  /** The piece template this instances (a catalog piece id). */
  pieceId: string;
  /** KSA-frame transform. NOTE: `scale` applies to visuals only, never colliders (F4). */
  transform: Transform;
  layerId: string;
  /**
   * Placement-owned colliders, LOCAL to this placement's frame (scale = size in
   * metres). Used by stock-part imports whose collision volume is authored
   * PART-level (tanks!): the part colliders are localized onto one anchor
   * placement so they follow it, and export composes them into the object-level
   * `<Collider>` (a StaticSubObject template is shared — per-placement shapes
   * cannot live there).
   */
  colliders?: PartCollider[];
  /**
   * Magnetic snap points local to this placement (editor-only, additive field
   * — see {@link SnapConnector}). Stamped onto a stock-part import's anchor
   * placement; drag-snapping composes them with the CURRENT transform.
   */
  connectors?: SnapConnector[];
}

/** One `<StaticObject>` (+ its `<StaticObjectGameData>` metres) — plan §0.5. */
export interface StaticObjectDoc {
  /** The exported `<StaticObject Id>`. */
  id: string;
  /** Editor display name (never exported). */
  name: string;
  /** Grouping layers (always ≥ 1: the Default layer). */
  layers: LayerDef[];
  placements: Placement[];
  /** Object-level colliders (Core's prefab-level `<Collider Id="Collider1">`). */
  objectColliders: PartCollider[];
  /** GameData metres; null = unset (KSA reads NaN→0). See plan fact F8. */
  groundOffsetM: number | null;
  surfaceHeightM: number | null;
  footprintRadiusM: number | null;
}

/** Creates an empty static-object document. */
export function createStaticObjectDoc(id: string, name: string): StaticObjectDoc {
  return {
    id,
    name,
    layers: [defaultLayer()],
    placements: [],
    objectColliders: [],
    groundOffsetM: null,
    surfaceHeightM: null,
    footprintRadiusM: null,
  };
}
