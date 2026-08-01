/**
 * Core domain types for the flexo Part editor. These mirror the in-game
 * space-tape editor's state model (PartEditorState.cs / GameDataModels.cs) but
 * are intentionally framework-agnostic — no React, no three.js imports.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Euler rotation in radians, stored in KSA's "XYZ" convention (matches KSA's
 * serialization). NOTE: KSA's "XYZ" composes to three.js's 'ZYX' order — the
 * conversion to three.js Object3D rotation lives in `three/coords.ts`.
 */
export interface EulerXYZ {
  x: number;
  y: number;
  z: number;
}

export const VEC3_ZERO: Readonly<Vec3> = { x: 0, y: 0, z: 0 };
export const VEC3_ONE: Readonly<Vec3> = { x: 1, y: 1, z: 1 };
export const EULER_ZERO: Readonly<EulerXYZ> = { x: 0, y: 0, z: 0 };

/** A position/rotation/scale triple — the shape both SubParts and Connectors share. */
export interface Transform {
  /** Position relative to the Part origin, in meters. */
  position: Vec3;
  /** Rotation in radians (Euler XYZ). */
  rotation: EulerXYZ;
  /** Scale, default (1,1,1). */
  scale: Vec3;
}

/** One placed SubPart instance within the Part being edited. */
export interface SubPartPlacement extends Transform {
  /** Unique instance id within this Part, e.g. "trussbara_1". */
  instanceId: string;
  /** Catalog SubPart template id, e.g. "CoreStructuralA_Subpart_TrussBarA". */
  subPartTemplateId: string;
  /** Id of the {@link Layer} this placement belongs to (editor-only grouping). */
  layerId: string;
}

/**
 * Connector connection behavior, serialized into the comma-separated <Flags> on
 * the <PartGameData> (and <Part>) <Connector>. These are independent toggles
 * that may combine (matching space-tape's three checkboxes); an empty
 * {@link Connector.flags} array is the default connect-to-anything mode and
 * emits no <Flags>. See docs/ksa-part-connector-notes.md for what each means.
 */
export type ConnectorFlag = 'Internal' | 'ToSurface' | 'FromSurface';

export const CONNECTOR_FLAGS: readonly ConnectorFlag[] = ['Internal', 'ToSurface', 'FromSurface'];

/**
 * What is allowed to FLOW across a connector, serialized as the whitespace-separated
 * `<Capabilities>` on the `<Connector>` (KSA `ConnectorCapabilityFlags`, a `[Flags]`
 * byte enum — see `decomp/KSA/ConnectorCapabilityFlags.cs`). Added in KSA 2026.7.9
 * (rev 4992) to make propellant plumbing explicit topology rather than a whole-vehicle
 * search: a connection carries a resource only when BOTH endpoints declare it
 * (`Part.Connection.HasCapabilities` → `ConnectorCapabilityExtensions.Intersect`).
 *
 * **An EMPTY list is not "nothing"** — it is KSA's implicit default
 * `Electricity | ServiceFluid`. `NoElectricity` / `NoServiceFluid` are INVERTED at
 * load by `ConnectorCapabilityExtensions.ToCapability()` (they subtract from that
 * default); `BulkFluid` / `SolidMotorCase` / `DecouplerJoint` are opt-in additions.
 * A main-engine propellant path is dead unless every connector along it declares
 * `BulkFluid`; SRB segments stack only across `SolidMotorCase`; and since rev 5007 a
 * decoupler's connector must declare `DecouplerJoint` (it replaced the old
 * `_decouplerConnections` list).
 */
export type ConnectorCapability =
  | 'BulkFluid'
  | 'SolidMotorCase'
  | 'NoElectricity'
  | 'NoServiceFluid'
  | 'DecouplerJoint';

export const CONNECTOR_CAPABILITIES: readonly ConnectorCapability[] = [
  'BulkFluid',
  'SolidMotorCase',
  'NoElectricity',
  'NoServiceFluid',
  'DecouplerJoint',
];

/** A connector attachment point within the Part. Faces local +X (its arrow). */
export interface Connector extends Transform {
  /** Connector id used in the exported XML, e.g. "_connector1". */
  id: string;
  /** Connection behavior flags (independent, may combine). Empty = default mode. */
  flags: ConnectorFlag[];
  /**
   * `<Capabilities>` — what may flow across this connector. KSA merges the geometry
   * `<Part>` and `<PartGameData>` values with `|=` (`PartTemplate.ApplyGameData`), so
   * flexo emits the same list in both documents (idempotent). Empty ⇒ KSA's default
   * `Electricity | ServiceFluid`. See {@link ConnectorCapability}.
   */
  capabilities: ConnectorCapability[];
  /**
   * Ids of sibling connectors, serialized as nested `<Sibling Id/>` children of the
   * geometry `<Connector>`. KSA 2026.7 added this to group the attach nodes of
   * multi-mount prefabs (engine plates, interstage bridges) — the geometry twin of
   * `<PartGameData>`'s `<Aligned>`. flexo doesn't edit these, but preserves them
   * verbatim so importing then re-exporting a prefab keeps its node grouping.
   */
  siblingIds: string[];
  /**
   * Id of the {@link Layer} this connector belongs to (editor-only grouping). An ORDINARY
   * layer, exactly like a placement's — a connector is organized, hidden and locked
   * alongside the SubParts it attaches to.
   */
  layerId: string;
}

/**
 * One KSA collision primitive shape. `ColliderModule.Template`
 * (`decomp/KSA/ColliderModule.cs`) accepts EXACTLY these four child elements, each
 * mapping 1:1 onto a Bepu analytic shape — KSA has NO convex-hull / triangle-mesh
 * part collider, so a collision volume is always a handful of these primitives.
 * See scope/colliders.md.
 */
export type ColliderShape = 'Box' | 'Sphere' | 'Cylinder' | 'Capsule';

/**
 * All collider shapes, in UI order. Cylinder leads because Core uses it 66× vs
 * Box 29 / Sphere 21 / Capsule 0 across the shipped `Content/` tree.
 */
export const COLLIDER_SHAPES: readonly ColliderShape[] = ['Cylinder', 'Box', 'Sphere', 'Capsule'];

/** Human-facing shape labels (menus, inspector). */
export const COLLIDER_SHAPE_LABELS: Record<ColliderShape, string> = {
  Cylinder: 'Cylinder',
  Box: 'Box',
  Sphere: 'Sphere',
  Capsule: 'Capsule',
};

/**
 * One collision primitive of the Part being edited. {@link Transform} is reused with a
 * deliberate reinterpretation of each field:
 *
 *  - `position` → `<LocationAsmb X Y Z>` — the shape centre in the OWNER's assembly
 *    frame, meters (direct, no conversion).
 *  - `rotation` → `<Collider2Asmb X Y Z>` — Euler XYZ radians. KSA builds it with
 *    `QuaternionEx.CreateFromXyzRadians` (`ColliderTemplate.Create`), the identical
 *    function `TransformReference.RotationValue` uses for a placement `<Rotation>`, so
 *    src/three/coords.ts's `EULER_ORDER` mapping applies verbatim.
 *  - `scale` → the collider's OUTER SIZE IN METERS, not a multiplier. KSA colliders have
 *    no scale field; storing size here is what makes every existing transform path
 *    correct for free (the scene object holds unit-box wire geometry, so `group.scale`
 *    IS the size and the scale gizmo natively edits dimensions — exactly how
 *    ContainerLayer drives ReferenceContainer.size). See src/ksa/colliderSize.ts for
 *    the size ↔ `<LengthX|Y|Z>` / `<Radius>` mapping.
 */
export interface PartCollider extends Transform {
  /** Document id, also emitted as the shape element's `Id`, e.g. "_collider1". */
  id: string;
  shape: ColliderShape;
  /**
   * `null` ⇒ part-level: emitted under `<PartGameData>`, transform in the Part's
   * assembly frame. Otherwise a `subPartTemplateId` ⇒ emitted under that template's
   * `<SubPartGameData>`, transform in the SubPart TEMPLATE's local frame. A
   * SubPart-owned collider therefore applies to EVERY placement of that template (KSA
   * has no per-instance collider — `PartInstance.Components` is save-game state, not
   * template data) and follows joint animation
   * (`KeyframeAnimationModule.ApplyAnimationTransforms` flags `NeedsColliderUpdate`).
   */
  ownerTemplateId: string | null;
  /**
   * Id of the {@link Layer} this collider belongs to (editor-only grouping). An ORDINARY
   * layer, exactly like a placement's: colliders are organized, hidden and locked alongside
   * the SubParts whose volume they wrap.
   */
  layerId: string;
}

/**
 * One IVA (interior view) camera vantage point — a "seat". KSA `IVASeat.IVASeatTemplate`
 * (`decomp/KSA/IVASeat.cs`), emitted as an `<IVASeat>` child of `<PartGameData>`.
 *
 * {@link Transform} is reused with a deliberate reinterpretation:
 *  - `position` → `<Position X Y Z>` — the EYE POINT in the Part's assembly frame, meters
 *    (direct, no conversion — the same space as a placement/connector/collider).
 *  - `rotation` → NOT emitted directly. KSA stores the orientation as two vectors
 *    (`<ForwardAxis>` + `<UpAxis>`); flexo stores the equivalent rotation so the seat rides
 *    the normal 3D gizmo, and converts at the XML boundary (src/ksa/ivaSeatAxes.ts).
 *    Identity rotation ⇒ KSA's own schema defaults, forward +X / up −Z.
 *  - `scale` → UNUSED. KSA has no seat size; the writer pins it to (1,1,1) and it is never
 *    emitted (same treatment as `Light.transform.scale`). The marker's on-screen size is a
 *    global view setting, like the connector cube.
 *
 * Order is LOAD-BEARING: the first seat is the one the IVA camera opens on and `C` cycles
 * them in document order (see scope/connectors-coordinates-iva.md).
 */
export interface IvaSeat extends Transform {
  /** Editor-only document id, e.g. "_seat1". NEVER emitted — see plans/IVA_PLAN.md §3.5. */
  id: string;
  /** Always {@link IVA_SEAT_LAYER_ID}; present for parity with the other layered entities. */
  layerId: string;
}

/**
 * One cast light of the Part being edited — a first-class 3D entity (like
 * {@link PartCollider} / {@link IvaSeat}), normalised out of per-template GameData
 * so it can be selected, gizmo-edited and visualized. Mirrors KSA's
 * `LightModule.TemplateData` (`<Light>`, legal under BOTH `<PartGameData>` and
 * `<SubPartGameData>` — Core authors both). See plans/LIGHT_MANAGEMENT_PLAN.md §1.
 *
 * {@link Transform} is reused with a deliberate reinterpretation:
 *  - `position` → `<Transform><Position>` — the emitter point in the OWNER frame
 *    (part assembly frame when {@link ownerTemplateId} is null, else the SubPart
 *    TEMPLATE's local frame), meters.
 *  - `rotation` → `<Transform><Rotation>` — Euler XYZ radians. Aims a Spot along
 *    the rotated local +X (`LightModule.UpdateRenderData` transforms
 *    `double3.UnitX`). Stored + emitted for Point too; KSA ignores it there.
 *  - `scale` → UNUSED. KSA ignores light scale; pinned (1,1,1), never emitted.
 */
export interface PartLight extends Transform {
  /** Editor-only document id, e.g. "_light1". NEVER emitted (Core authors no <Light Id>). */
  id: string;
  type: LightType;
  /**
   * `null` ⇒ part-level: emitted under `<PartGameData>`, transform in the Part's
   * assembly frame (Core: CoreCommandA headlights, CoreIVASpaceA interior light).
   * Otherwise a `subPartTemplateId` ⇒ emitted under that template's
   * `<SubPartGameData>` — the light applies to EVERY placement of the template and
   * rides each instance's transform (Core: CoreElectricalA spotlights). Emitting
   * under a BUILT-IN template id routes through the export-variant remap so Core's
   * shared template is never mutated (modExport.buildExportVariantMap).
   */
  ownerTemplateId: string | null;
  /** Falloff distance in meters (<Range Value/>). Illuminance is EXACTLY 0 at d ≥ range (§1.4). */
  rangeM: number;
  /** Brightness (<Intensity Value/>). Candela-like: E ≈ intensity/d² near the source. */
  intensity: number;
  /** RGB color, channels 0–1 (<Color R G B/>). KSA schema default is Gray (0.5,0.5,0.5). */
  color: { r: number; g: number; b: number };
  /** Spot inner cone half-angle, radians (<InnerAngle Value/>). Full-bright inside. */
  innerAngleRad: number;
  /** Spot outer cone half-angle, radians (<OuterAngle Value/>). Runtime-clamped to ≤ 1.5697963 (§1.4). */
  outerAngleRad: number;
  /** <RayTracing>true</RayTracing> — IVA ray-traced list routing only. */
  rayTracing: boolean;
  /** Always {@link LIGHT_LAYER_ID}; parity with the other layered entities. */
  layerId: string;
}

/**
 * Which of the three default KSA kittens to render. They share the same body mesh
 * and EVA suit; only the head pattern and eye color differ. See src/ksa/kittenAssets.ts.
 */
export type KittenKind = 'hunter' | 'polaris' | 'banjo';

/** All kitten kinds, in menu order. */
export const KITTEN_KINDS: readonly KittenKind[] = ['hunter', 'polaris', 'banjo'];

/** Human-facing kitten names (menus, "<Name> Mesh" layer names). */
export const KITTEN_LABELS: Record<KittenKind, string> = {
  hunter: 'Hunter',
  polaris: 'Polaris',
  banjo: 'Banjo',
};

/**
 * A placed kitten EVA character — a purely visual aide (scale/placement reference).
 * Unlike {@link SubPartPlacement}, a kitten has NO catalog template and NO KSA XML
 * representation: it lives only in the editor document ({@link EditingPart.kittens})
 * and is never serialized to export. Always pinned to the built-in
 * {@link KITTEN_LAYER_ID} layer.
 */
export interface KittenInstance extends Transform {
  /** Unique instance id within this Part, e.g. "kitten_1". */
  id: string;
  /** Which kitten to render (hunter/polaris/banjo). */
  kind: KittenKind;
  /** Always {@link KITTEN_LAYER_ID}; present for parity with other layered entities. */
  layerId: string;
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
  id: string;
  /** User-facing label, e.g. "Default", "Engines". */
  name: string;
}

/**
 * Placeholder Part id every new/empty project starts with — a deliberately ugly
 * sentinel so an unset id is obvious in the inspector and the exported XML. Project
 * import treats a partId still equal to this as "unset" and adopts the imported one.
 */
export const DEFAULT_PART_ID = 'fixme_part_id';

/** Id of the built-in "Default" layer. It always exists and cannot be deleted. */
export const DEFAULT_LAYER_ID = 'default';

/**
 * Id of the built-in "Kittens" layer. Kitten visual aides ({@link KittenInstance})
 * always live here so they can be hidden/locked separately from the part. They are
 * editor-only and are NEVER serialized to export. Cannot be deleted.
 */
export const KITTEN_LAYER_ID = 'kittens';

/**
 * Id of the built-in "IVA Seats" layer. {@link IvaSeat}s always live here so the interior
 * camera vantage points can be hidden/locked separately from the meshes around them.
 * Cannot be deleted.
 */
export const IVA_SEAT_LAYER_ID = 'ivaSeats';

/**
 * Id of the built-in "Lights" layer. {@link PartLight}s always live here so the part's
 * cast lights can be hidden/locked separately from the meshes they sit on. Cannot be
 * deleted.
 */
export const LIGHT_LAYER_ID = 'lights';

/** The built-in Default layer (for SubParts) that every new Part starts with. */
export function createDefaultLayer(): Layer {
  return { id: DEFAULT_LAYER_ID, name: 'Default' };
}

/** The built-in Kittens layer that every new Part starts with (editor-only visual aides). */
export function createKittenLayer(): Layer {
  return { id: KITTEN_LAYER_ID, name: 'Kittens' };
}

/** The built-in IVA Seats layer that every new Part starts with. */
export function createIvaSeatLayer(): Layer {
  return { id: IVA_SEAT_LAYER_ID, name: 'IVA Seats' };
}

/** The built-in Lights layer that every new Part starts with. */
export function createLightLayer(): Layer {
  return { id: LIGHT_LAYER_ID, name: 'Lights' };
}

/** The built-in layers present in every Part (and never deletable). */
export const BUILT_IN_LAYER_IDS: readonly string[] = [
  DEFAULT_LAYER_ID,
  IVA_SEAT_LAYER_ID,
  LIGHT_LAYER_ID,
  KITTEN_LAYER_ID,
];

/**
 * Built-in layers that host their own entity kind EXCLUSIVELY — nothing else can live on
 * (or be moved to) one of these. {@link DEFAULT_LAYER_ID} is deliberately absent: it is the
 * ordinary layer. Every "move to layer" surface (row menu, multi-select toolbar, store
 * guards) filters through this ONE list so a newly added entity layer can't be forgotten at
 * one of the sites.
 *
 * Connectors and colliders are NOT here: they are ordinary layer citizens like placements
 * (they ship as part of the Part, so they belong in the same logical groupings as the
 * geometry). Only the kinds whose identity IS their layer stay pinned — IVA seats and
 * lights, whose rows are ordinals/markers rather than geometry, and kittens, which are
 * editor-only visual aides that never reach the export.
 */
export const ENTITY_ONLY_LAYER_IDS: readonly string[] = [
  IVA_SEAT_LAYER_ID,
  LIGHT_LAYER_ID,
  KITTEN_LAYER_ID,
];

/**
 * Entity kinds that live on ORDINARY layers and can be moved between them — SubPart
 * placements, connectors and colliders. The union the "Change Layer" surfaces and
 * {@link import('../state/editorStore').moveEntitiesToLayer} operate on.
 */
export type LayerableKind = 'subpart' | 'connector' | 'collider';

/**
 * One row of KSA's editor-tag registry (`<EditorTagDef>` in
 * `Content/Core/CoreEditorTagsGameData.xml`, schema `EditorTagDefinition.cs`).
 * {@link notaCategory} mirrors the `NotaCategory` attribute: `false` ⇒ a part-picker
 * **category** button; `true` ⇒ a purely **functional** tag (face-snap / diameter-filter
 * / visibility behavior, not a category). flexo treats all tags as a freeform string list
 * — this registry only drives the autocomplete suggestions and their grouping (see
 * {@link import('../ui/EditorTagsField').EditorTagsField}); it does not constrain entry.
 */
export interface EditorTagDef {
  /** The tag string emitted as `<EditorTag Value>`, e.g. "Fuel Tanks". */
  id: string;
  /** `<EditorTagDef NotaCategory>` — `true` ⇒ a functional tag, not a part-picker category. */
  notaCategory: boolean;
}

/**
 * KSA's editor-tag registry in the game's authored order (= the order of category
 * buttons in the part picker). Mirrors `CoreEditorTagsGameData.xml` as of build
 * **2026.7.6.4939**. This is a static snapshot, not a live parse: flexo only uses it for
 * freeform-entry autocomplete, so a modder-defined tag simply isn't suggested (it can
 * still be typed). Keep in sync with the game file on a registry change.
 */
export const EDITOR_TAG_DEFS: readonly EditorTagDef[] = [
  { id: 'Booster', notaCategory: false },
  { id: 'Capsules', notaCategory: false },
  { id: 'Engines', notaCategory: false },
  { id: 'RCS', notaCategory: false },
  { id: 'Fuel Tanks', notaCategory: false },
  { id: 'Electrical', notaCategory: false },
  { id: 'Coupling', notaCategory: false },
  { id: 'Structural', notaCategory: false },
  { id: 'Landing', notaCategory: false },
  { id: 'Interstage', notaCategory: true },
  { id: 'Passage', notaCategory: false },
  { id: 'Cargo', notaCategory: false },
  { id: 'Lights', notaCategory: false },
  { id: 'Radial', notaCategory: true },
  { id: 'NoFaceSnapping', notaCategory: true },
  { id: 'All', notaCategory: true },
  { id: 'Hidden', notaCategory: true },
];

/**
 * The editor tags KSA's Core data uses to bucket parts in the in-game part picker.
 * Offered as suggestions in the Part Data dialog (free-form custom values are also
 * allowed — KSA registers any tag string it sees). Derived from {@link EDITOR_TAG_DEFS}
 * in registry order.
 */
export const KNOWN_EDITOR_TAGS: readonly string[] = EDITOR_TAG_DEFS.map((d) => d.id);

/**
 * Tank cross-section shape. Cylindrical tanks have a length; spherical ones are
 * defined by radius alone. Mirrors space-tape's `TankShape`.
 */
export type TankShape = 'Cylindrical' | 'Spherical';

/**
 * A fuel/oxidizer tank definition (a part may have several). Parametric — no 3D
 * workspace geometry; edited as numbers in the Part Data dialog. Serialized as
 * <Tank><CylindricalTank>/<SphericalTank> on <SubPartGameData>. (Since KSA 2026.7.6
 * Core authors its prefab tanks at the <PartGameData> level instead — flexo doesn't
 * model those; they survive round-trip via the GameData passthrough.) Mirrors `TankState`.
 */
export interface Tank {
  /**
   * `<Tank Id>` — the container id an engine addresses with
   * `<FeedsFrom Container="…">`. Load-bearing since KSA 2026.7.9: KSA resolves it
   * against `PartTemplate.Components[].Id` (`ModuleBase.TemplateDataBase.Id`, an
   * `[XmlAttribute]`) in `PartTemplate.AddResolvedFeed`, and logs *"feeds from unknown
   * container '…'"* when it misses. `''` ⇒ emit no `Id` (an unaddressable tank).
   */
  id: string;
  shape: TankShape;
  /** Wall material id, e.g. "Aluminum.2014(s)". Blank omits <Material>. */
  wallMaterialId: string;
  /** Cylinder length in meters (ignored/omitted for spherical tanks). */
  lengthM: number;
  /** Outer radius in meters. */
  outerRadiusM: number;
  /** Wall thickness in millimeters. */
  wallThicknessMm: number;
  /**
   * `<RoleAffinity>` — which consumer kind this tank prefers to feed (KSA
   * 2026.7.5's replacement for the old pre-filled `<CombustionProcess Id/>`).
   * Mirrors `AsmbTankTemplate.RoleAffinity` (`ConsumerRole` [Flags] enum): unless
   * overridden by the player, tanks fill themselves with the most sensible
   * propellant mixture for their affinity. Defaults to `Engine` (the element is
   * omitted at the default); Core's RCS spheres declare `Thruster`.
   */
  roleAffinity: TankRoleAffinity;
  /**
   * `<LocationAsmb X Y Z>` inside the shape element — the tank's mass offset in the
   * assembly frame (`AsmbTransformTemplate.LocationAsmb`). Omitted at (0,0,0).
   */
  locationAsmb: Vec3;
}

/**
 * KSA `ConsumerRole` [Flags] enum as its XmlSerializer text form (flags are
 * space-separated). `Engine` is the schema default.
 */
export type TankRoleAffinity = 'None' | 'Engine' | 'Thruster' | 'Engine Thruster';

/**
 * Battery storage (multiple allowed). Serialized as <Battery><MaximumCapacity J/>.
 * Capacity is held in watt-hours (Wh) — KSA's EnergyReference stores Joules, and
 * 1 Wh = 3600 J, so the serializer multiplies by 3600 on the way out and the
 * parser divides by 3600 on the way in. Wh keeps the editable numbers human-sized
 * (a 500 J cell is 0.139 Wh, which the game itself renders as "0.14 Wh").
 */
export interface Battery {
  capacityWh: number;
}

/**
 * Power generator with constant output (multiple allowed). Serialized as
 * <Generator><Produced W/>. Distinct from {@link SolarPanel} in KSA: a
 * generator produces continuously, regardless of orientation or sun exposure.
 */
export interface Generator {
  outputWatts: number;
}

/**
 * Solar panel (multiple allowed). Serialized as <SolarPanel><Produced W/><Transform/>.
 * Unlike a {@link Generator}, its output is sun-dependent and it carries an
 * orientation {@link Transform} (the panel's sun-facing normal), which we round-trip
 * so imported built-in panels keep facing the right way.
 */
export interface SolarPanel {
  outputWatts: number;
  transform: Transform;
}

/**
 * Power consumer — **one per Part** (see {@link PartGameData.powerConsumer}).
 * Mirrors KSA's `PowerConsumerTemplate` (`<PowerConsumer>` under `<PartGameData>`):
 *  - `Consumed` (PowerReference, `W`) → {@link consumedWatts}
 *  - `LightSwitch` (bool attr) → {@link lightSwitch}: when set, the consumer acts
 *    as an in-game on/off light switch (the part can be toggled in flight).
 *  - `LightIsActive` (bool attr) → {@link lightIsActive}: the switch's initial
 *    on/off state. Only meaningful when {@link lightSwitch} is set (KSA only reads
 *    it under `if (LightSwitch)`).
 *
 * Both flags default to `false` in KSA, so we only emit each attribute when true.
 *
 * **Why one per Part:** KSA stores a single `Part.LightSwitch` slot and picks the
 * FIRST `LightSwitch=true` consumer (`ResetModuleProperties` then `break`s); every
 * light + emissive in the part is gated by that one switch. Multiple consumers just
 * draw duplicate dead checkboxes in-game that still drain power. Full reasoning in
 * `analysis/HOW_LIGHT_PARTS_WORK.md`.
 */
export interface PowerConsumer {
  consumedWatts: number;
  /** `LightSwitch` — makes this consumer a flight-toggleable light switch. */
  lightSwitch: boolean;
  /** `LightIsActive` — initial on state when {@link lightSwitch} is set. */
  lightIsActive: boolean;
}

/**
 * Light type. Mirrors KSA's `LightModule.TemplateData.LightType` (the only two
 * values the engine's `ELightType` recognizes): an omnidirectional `Point` or a
 * cone `Spot`. A Spot is aimed by its {@link PartLight.rotation} and adds the
 * inner/outer cone angles.
 */
export type LightType = 'Spot' | 'Point';

/** Decoupler bound to a connector. Serialized as <Decoupler ConnectorId Force/>. */
export interface Decoupler {
  connectorId: string;
  /** Separation force in newtons. */
  force: number;
}

/**
 * Docking port bound to a connector. Serialized as child elements:
 * <DockingPort><ConnectorId Value/><LatchingKineticEnergy J/><PushoffImpulse Ns/></DockingPort>.
 */
export interface DockingPort {
  connectorId: string;
  /** Magnetic latching kinetic-energy budget in joules (<LatchingKineticEnergy J/>; KSA default 50). */
  latchingKineticEnergyJ: number;
  /** Undock push-off impulse in newton-seconds (<PushoffImpulse Ns/>; KSA default 5000). */
  pushoffImpulseNs: number;
}

/** EVA hatch bound to a connector. Serialized as <EVADoor ConnectorId/>. */
export interface EvaDoor {
  connectorId: string;
}

/**
 * PLUMBING TOPOLOGY (KSA 2026.7.9, revs 4992/5002/5007) — where a propellant
 * CONSUMER (a `RocketCore`: a {@link Combustor} or a {@link SolidMotor}) draws from.
 * Before 5018 this was implicit (a combustor searched the whole vehicle for tanks
 * holding its reactants); it is now explicitly authored in three layers:
 *   1. {@link ConnectorCapability} — what each connector is allowed to carry.
 *   2. {@link FeedSource} — the consumer's own `<FeedsFrom>` feed points.
 *   3. {@link ConsumerFeedWiring} — how the Part wires a reusable SubPart's
 *      `<FeedsFrom Parent="true"/>` onto its own containers/connectors.
 */

/**
 * One `<FeedsFrom>` feed point (KSA `FeedsFromReference`, see
 * `decomp/KSA/FeedsFromReference.cs`). The XML carries four attributes —
 * `Container`, `SubPart`, `Connector`, `Parent` — under a strict validity rule
 * (`FeedsFromReference.IsValid`, logged as an Error on load):
 *  - **exactly one** of `Container` / `Connector` / `Parent` may be set, and
 *  - `SubPart` is only legal alongside `Container` (it scopes the container lookup
 *    to a placed SubPart's own `Components` instead of the owning template's).
 * flexo models that rule as a discriminated union so an invalid combination is
 * unrepresentable.
 *
 * `parent` means "whatever the Part that places me wires up" and is resolved through
 * the Part's {@link ConsumerFeedWiring} (`PartTemplate.ResolveConsumerFeeds`); a
 * SubPart-level consumer with no matching wiring entry logs
 * *"feeds from its parent part, but … has no ConsumerFeedWiring wiring for it"*.
 */
export type FeedSource =
  | {
      kind: 'container';
      /** `<FeedsFrom Container>` — a `Components` entry `Id` (a `<Tank>`/`<SolidGrainSegment>`). */
      containerId: string;
      /** `<FeedsFrom SubPart>` — placement instanceId owning the container; null ⇒ the owning template. */
      subPartInstanceId: string | null;
    }
  | { kind: 'connector'; connectorId: string }
  | { kind: 'parent' };

/** True when a feed source names a target KSA can resolve (drop invalid ones on export). */
export function isFeedSourceValid(f: FeedSource): boolean {
  if (f.kind === 'container') return f.containerId.trim().length > 0;
  if (f.kind === 'connector') return f.connectorId.trim().length > 0;
  return true;
}

/**
 * `<Plumbing>` on a `<Combustor>` — which fluid network the chamber draws through
 * (KSA `PlumbingClass`, see `decomp/KSA/PlumbingClass.cs`). Mapped to a connector
 * capability by `ConnectorCapabilityExtensions.ToCapability(PlumbingClass)`:
 * `Bulk ⇒ BulkFluid` (main engines), `Service ⇒ ServiceFluid` (RCS). `Bulk` is the
 * schema default, so a flexo-authored RCS thruster MUST declare `Service` — otherwise
 * it demands `BulkFluid` across connectors that only carry `ServiceFluid` and gets
 * no propellant. Every Core RCS combustor declares `Service`.
 */
export type PlumbingClass = 'Bulk' | 'Service';

/**
 * `<ConsumerFeedWiring>` on a `<PartGameData>` — how the Part that PLACES a reusable
 * thrust chamber satisfies that chamber's `<FeedsFrom Parent="true"/>` (KSA
 * `ConsumerFeedWiring : SubPartIdReference`, see `decomp/KSA/ConsumerFeedWiring.cs`
 * and `PartTemplate.ResolveConsumerFeedPoints`). This is what lets one SubPart mesh
 * be reused by prefabs that plumb it differently.
 */
export interface ConsumerFeedWiring {
  /** `<ConsumerFeedWiring Id>` — the consumer's TEMPLATE id (e.g. "ThrustChamber"). */
  consumerId: string;
  /**
   * `<ConsumerFeedWiring SubPartId>` — the placement instanceId carrying the consumer;
   * null ⇒ the root part. KSA prefers an instance-scoped entry and falls back to an
   * unscoped one (`ResolveConsumerFeeds`).
   */
  subPartInstanceId: string | null;
  /**
   * `<FeedsFrom>` children. MUST NOT contain `{ kind: 'parent' }` — KSA logs
   * *"ConsumerFeedWiring for X cannot itself defer to Parent"*. An entry that wires
   * zero feed points is likewise an error, so the serializer omits it.
   */
  feeds: FeedSource[];
}

/**
 * ENGINES — a rocket engine is a small graph of cooperating GameData modules layered
 * onto a Part and its SubParts (see analysis/KSA_ENGINE_DETAILS.md):
 *  - {@link Combustor}    `<Combustor>`        the chamber: burns a reaction → hot gas
 *  - {@link DeLavalNozzle} `<DeLavalNozzle>`    expands the gas → thrust; owns the plume/light/sound FX
 *  - {@link Rocket}       `<Rocket>`           binds one Core (combustor) to ≥1 Nozzle(s)
 *  - {@link RocketController} `<RocketEngineController>`/`<RocketThrusterController>` groups rockets,
 *                              receives throttle/staging, drives the cores
 *  - {@link Gimbal}       `<SubPart Id><Gimbal>` thrust-vectors a placed SubPart's nozzles
 * Reusable thrust chambers (combustor+nozzle+rocket) live on a {@link SubPartGameData}
 * so every prefab reusing that mesh inherits them; the controller, gimbals, and any
 * gas-generator hardware live on the {@link PartGameData} and reference SubPart
 * *instance ids*. Thrust/Isp are real De Laval physics — see src/ksa/enginePhysics.ts.
 */

/** The KSA default reaction — the most common Core propellant (LH2/LOX). */
export const DEFAULT_REACTION_ID = 'Hydrolox';
/** The O/F mixture ratio Core's Hydrolox engines run (also Hydrolox's `<DefaultMixtureRatio>`). */
export const DEFAULT_MIXTURE_RATIO = 5.5;

/** KSA `ReactionCategory` (the `Category` attribute on every reaction element). */
export type ReactionCategory =
  | 'Bipropellant'
  | 'Hypergolic'
  | 'Monopropellant'
  | 'Solid'
  | 'Thermal';

/** One entry of the static Core-reaction snapshot ({@link KNOWN_REACTIONS}). */
export interface KnownReaction {
  id: string;
  name: string;
  kind: 'Fixed' | 'Mixture';
  category: ReactionCategory;
  /** `<DefaultMixtureRatio>` (mixtures only). */
  defaultMixtureRatio?: number;
  /** The mixture LUT's O/F row range — KSA clamps a combustor's ratio into it. */
  ratioMin?: number;
  ratioMax?: number;
}

/**
 * Static snapshot of the combustor-drivable reactions shipped in Core's
 * `Reactions.xml` (build 2026.7.5.4892) — the fallback suggestions when the live
 * catalog is absent. `ThermalReaction`s are excluded: they need a thermal core,
 * which no part template provides yet (KSA's own designer refuses them).
 */
export const KNOWN_REACTIONS: readonly KnownReaction[] = [
  // prettier-ignore
  { id: 'Kerolox', name: 'Kerosene + Oxygen', kind: 'Mixture', category: 'Bipropellant', defaultMixtureRatio: 2.3, ratioMin: 0.3403148743618607, ratioMax: 68.06297487237215 },
  // prettier-ignore
  { id: 'Hydrolox', name: 'Hydrogen + Oxygen', kind: 'Mixture', category: 'Bipropellant', defaultMixtureRatio: 5.5, ratioMin: 0.7936682739051928, ratioMax: 158.73365478103852 },
  // prettier-ignore
  { id: 'Methalox', name: 'Methane + Oxygen', kind: 'Mixture', category: 'Bipropellant', defaultMixtureRatio: 3.6, ratioMin: 0.3989263492008084, ratioMax: 79.78526984016167 },
  // prettier-ignore
  { id: 'Ethalox', name: 'Ethanol + Oxygen', kind: 'Mixture', category: 'Bipropellant', defaultMixtureRatio: 1.6, ratioMin: 0.2083777961658784, ratioMax: 41.67555923317568 },
  // prettier-ignore
  { id: 'Ethanol_HTP', name: 'Ethanol + HTP', kind: 'Mixture', category: 'Bipropellant', defaultMixtureRatio: 4.5, ratioMin: 0.4922340181984312, ratioMax: 98.44680363968624 },
  // prettier-ignore
  { id: 'MMH_NTO', name: 'MMH + NTO', kind: 'Mixture', category: 'Hypergolic', defaultMixtureRatio: 1.65, ratioMin: 0.249640560569234, ratioMax: 49.92811211384679 },
  { id: 'HTPDecomposition', name: 'HTP', kind: 'Fixed', category: 'Monopropellant' },
  { id: 'HydrazineDecomposition', name: 'Hydrazine', kind: 'Fixed', category: 'Monopropellant' },
  { id: 'APCP', name: 'APCP', kind: 'Fixed', category: 'Solid' },
  { id: 'DoubleBase', name: 'Double-Base', kind: 'Fixed', category: 'Solid' },
];

/** The 7 `<VolumetricExhaust>` plume templates shipped in Core (referenced by id; auto-scale to the nozzle). */
export const VOLUMETRIC_EXHAUST_IDS: readonly string[] = [
  'EngineALarge',
  'EngineAMed',
  'EngineACompact',
  'EngineAVernier',
  'EngineATurbine',
  'RCS',
  'MmuRcsVac',
];

/**
 * The `<PlumeTrailTemplate>` ids shipped in Core (volumetric plume trails, referenced by
 * a nozzle's `<PlumeTrail Id>`). KSA 2026.7.9 moved the template out of
 * `CorePropulsionAGameData.xml` into its own `Content/Core/PlumeTrailAssets.xml`,
 * renamed it `DefaultEngine` → `DefaultPlumeTrail` (it gained an `<EndRadius M>`), and
 * now assigns it ONLY to solid-motor nozzles ("Only use plume trails on SRBs", rev 4996)
 * — every liquid nozzle in Core carries none.
 */
export const PLUME_TRAIL_IDS: readonly string[] = ['DefaultPlumeTrail'];

/**
 * One `<ReactionPlume>` entry on a nozzle — the reaction-keyed exhaust FX bucket KSA
 * 2026.7.10 (rev 5022, "Allow nozzles to change their volumetric exhaust style based on
 * the configured reaction") introduced. `RocketNozzleTemplate` no longer carries
 * `<VolumetricExhaust>` / `<PlumeTrail>` directly; both now live inside a repeatable
 * `<ReactionPlume>` (`decomp/KSA/ReactionPlumeReference.cs`).
 *
 * `RocketNozzle.TryResolvePlume` picks, at FX time: the FIRST entry whose
 * {@link reactionId} hashes to the rocket core's currently-configured reaction, else the
 * FIRST entry with `Default="true"`, else no plume at all. So a nozzle that should always
 * show one plume needs exactly one `Default="true"` entry with no `Reaction`.
 */
export interface ReactionPlume {
  /** `<ReactionPlume Reaction>` — the reaction id this plume is keyed to; null ⇒ unkeyed. */
  reactionId: string | null;
  /** `<ReactionPlume Default>` — the fallback used when no keyed entry matches. */
  isDefault: boolean;
  /** `<VolumetricExhaust Id>` plume template (one of {@link VOLUMETRIC_EXHAUST_IDS}); null ⇒ none. */
  volumetricExhaustId: string | null;
  /** `<PlumeTrail Id>` volumetric trail template (one of {@link PLUME_TRAIL_IDS}); null ⇒ none. */
  plumeTrailId: string | null;
}

/**
 * The nozzle's unkeyed fallback plume — the `Default="true"` entry `TryResolvePlume`
 * lands on when no `Reaction`-keyed entry matches. Null when the nozzle has none.
 */
export function defaultReactionPlume(plumes: readonly ReactionPlume[]): ReactionPlume | null {
  return plumes.find((p) => p.isDefault) ?? null;
}

/**
 * Applies `patch` to the nozzle's default plume, leaving every `Reaction`-keyed entry
 * untouched. Adds the default entry when the nozzle has none, and drops it again once
 * both FX slots are empty (an entry with neither child is inert in-game).
 */
export function withDefaultReactionPlume(
  plumes: readonly ReactionPlume[],
  patch: Partial<Pick<ReactionPlume, 'volumetricExhaustId' | 'plumeTrailId'>>,
): ReactionPlume[] {
  const current = defaultReactionPlume(plumes) ?? {
    reactionId: null,
    isDefault: true,
    volumetricExhaustId: null,
    plumeTrailId: null,
  };
  const next: ReactionPlume = { ...current, ...patch };
  const others = plumes.filter((p) => !p.isDefault);
  if (!next.volumetricExhaustId && !next.plumeTrailId) return others;
  return [next, ...others];
}

/** KSA's default engine sound behavior id (the `<SoundEvent SoundId>` Core engines use). */
export const DEFAULT_ENGINE_SOUND_ID = 'DefaultEngineSoundBehavior';

/** What a `<SoundEvent>` does when the nozzle activates. Mirrors KSA's RocketSoundAction. */
export type RocketSoundAction = 'On' | 'Off' | 'None';

/** A nozzle's engine-audio event. Serialized as <SoundEvent Action SoundId/>. */
export interface RocketSoundEvent {
  action: RocketSoundAction;
  /** Sound behavior id, e.g. "DefaultEngineSoundBehavior". */
  soundId: string;
}

/**
 * A reference to an engine module (Combustor/Nozzle/Rocket) by its template id,
 * optionally scoped to a specific placed SubPart instance. Mirrors KSA's
 * SubPartIdReference: empty {@link subPartInstanceId} ⇒ the root part. The instance
 * id is a literal-string reference into {@link EditingPart.placements} and MUST be
 * remapped on import/paste (like coupling→connectorId, but pointing at a placement).
 */
export interface SubPartIdRef {
  /** The target module's template id (the `<Core Id>` / `<Nozzle Id>` / `<RocketReference Id>`). */
  id: string;
  /** Placement instanceId the module lives on; null/'' ⇒ the root part. */
  subPartInstanceId: string | null;
}

/**
 * A combustion chamber. Serialized as <Combustor>. References a Reaction by
 * {@link reactionId}; the propellant chemistry + gas LUT come from that reaction.
 * Defaults mirror CombustorTemplate.cs.
 */
export interface Combustor {
  /** `<Combustor Id>`, targeted by a Rocket's `<Core Id>`, e.g. "ThrustChamber". */
  id: string;
  /**
   * `<FeedsFrom>` — where this chamber draws propellant. **Required since KSA
   * 2026.7.9**: `RocketCoreTemplate.OnDataLoad` logs *"Rocket core X declares no
   * FeedsFrom feed points; it will reach no propellant"* on an empty list and the
   * engine produces zero thrust. A reusable SubPart chamber normally declares a
   * single `{ kind: 'parent' }` and lets the placing Part's
   * {@link ConsumerFeedWiring} name the real container/connector.
   */
  feeds: FeedSource[];
  /** `<Plumbing>` — which fluid network to draw through. `Bulk` is the schema default. */
  plumbing: PlumbingClass;
  /** `<Reaction Id>` — a Reaction id, e.g. "Hydrolox" / "MMH_NTO" / a custom FixedReaction. */
  reactionId: string;
  /**
   * `<MixtureRatio>` child of `<Reaction>` — the O/F mass ratio fed to the chamber.
   * REQUIRED by KSA when the reaction is a MixtureReaction (load throws without it);
   * meaningless for FixedReactions. null ⇒ omitted. KSA clamps it into the reaction
   * LUT's row range at resolve time (MixtureReaction.AtMixtureRatio).
   */
  mixtureRatio: number | null;
  /** `<MaxPressure>` chamber pressure at full throttle. Stored SI (Pa); emitted as Bar. Default 5e6. */
  maxPressurePa: number;
  /** `<ThermalEfficiency Value>` (0–1). Default 1. */
  thermalEfficiency: number;
  /** `<MinimumThrottle Value>` (clamped [0.01,1]). Default 1 ⇒ non-throttleable (on/off). */
  minimumThrottle: number;
  /** `<MinimumPulseTime Seconds>` minimum firing duration; null ⇒ omit (KSA default 0.001 s). */
  minimumPulseTimeS: number | null;
}

/**
 * A De Laval nozzle. Serialized as <DeLavalNozzle>. Produces thrust and owns the
 * exhaust geometry + plume/light/sound FX. Defaults mirror DeLavalNozzleTemplate.cs /
 * RocketNozzleTemplate.cs. NOTE: {@link areaRatio} is effectively required — KSA's
 * default is NaN (a broken engine) — so flexo defaults it to a usable value and validates.
 */
export interface DeLavalNozzle {
  /** `<DeLavalNozzle Id>`, targeted by a Rocket's `<Nozzle Id>`, e.g. "Nozzle". */
  id: string;
  /** `<ExitDiameter>` exit-plane diameter (m). Emitted as M, or Cm under 1 m. Default 1. */
  exitDiameterM: number;
  /** `<FxExitDiameter>` visual plume width (m); null ⇒ uses {@link exitDiameterM}. VISUAL ONLY. */
  fxExitDiameterM: number | null;
  /** `<AreaRatio Value>` exit/throat area ratio. Required (finite, > 0). */
  areaRatio: number;
  /** `<FlowEfficiency Value>` (0–1) inlet pressure drop; primarily cuts thrust. Default 1. */
  flowEfficiency: number;
  /** `<ExpansionEfficiency Value>` (0–1) stagnation drop; primarily cuts Isp. Default 1. */
  expansionEfficiency: number;
  /** `<ExhaustLocation X Y Z>` thrust application point (assembly frame). Default (0,0,0). */
  exhaustLocation: Vec3;
  /** `<ExhaustDirection X Y Z>` direction exhaust leaves (thrust acts along −this). Default (−1,0,0). */
  exhaustDirection: Vec3;
  /** `<FxExhaustLocation>` plume origin; null ⇒ uses {@link exhaustLocation}. */
  fxExhaustLocation: Vec3 | null;
  /** `<FxExhaustDirection>` plume axis; null ⇒ uses {@link exhaustDirection}. */
  fxExhaustDirection: Vec3 | null;
  /** `<ReactionPlume>` exhaust-FX entries, in document order. Empty ⇒ no plume. */
  reactionPlumes: ReactionPlume[];
  /** `<ExhaustLight Value>` dynamic exhaust point light. Default true. */
  exhaustLight: boolean;
  /** `<SoundEvent>` engine audio, or null. */
  sound: RocketSoundEvent | null;
}

/**
 * A `<Rocket>`: binds one combustor ({@link core}) and one-or-more nozzles into a
 * single firing unit. A controller drives one-or-more rockets. Mirrors RocketTemplate.cs.
 */
export interface Rocket {
  /** `<Rocket Id>`, targeted by a controller's `<RocketReference Id>`, e.g. "Engine". */
  id: string;
  /** `<Core Id [SubPartId]>` — the combustor. */
  core: SubPartIdRef;
  /** `<Nozzle Id [SubPartId]>` (≥1 needed for thrust), repeatable. */
  nozzles: SubPartIdRef[];
}

/** Main engine (throttle + staging) vs RCS thruster (pulsed, control-mapped). */
export type RocketControllerKind = 'engine' | 'thruster';

/**
 * Groups one-or-more {@link Rocket}s under a single command source. Serialized as
 * `<RocketEngineController>` (main) or `<RocketThrusterController>` (RCS). Lives on the
 * PartGameData and is what makes a Part a functioning engine. Mirrors RocketControllerTemplate.cs.
 */
export interface RocketController {
  /** `<… Id>` controller / engine display id, e.g. "LR91-AJ-3". */
  id: string;
  kind: RocketControllerKind;
  /** `<RocketReference Id [SubPartId]>` — the rockets this controller drives. */
  rocketRefs: SubPartIdRef[];
  /** Thruster only: `<ControlMap CSV>` 6-DOF axis flags; null ⇒ auto-computed from geometry. */
  controlMapFlags: string[] | null;
}

/**
 * A thrust-vectoring gimbal overlaid on a placed SubPart instance. Serialized as
 * `<SubPart Id="instanceId"><Gimbal>…</Gimbal></SubPart>` on the PartGameData. It
 * vectors all nozzles on that SubPart. A 0/0 gimbal is a silent no-op (fixed). Mirrors
 * GimbalReference.cs.
 */
export interface Gimbal {
  /** Placement instanceId this gimbal sits on (the `<SubPart Id>` wrapper). */
  subPartInstanceId: string;
  /** `<MaxAngleY Degrees>` max deflection about local Y. 0 ⇒ no Y actuation. */
  maxAngleYDeg: number;
  /** `<MaxAngleZ Degrees>` max deflection about local Z. 0 ⇒ no Z actuation. */
  maxAngleZDeg: number;
  /** `<ConstrainToCircle Value>` clamp combined Y/Z to a circle vs a square. Default true. */
  constrainToCircle: boolean;
}

/**
 * SOLID ROCKET MOTORS (KSA 2026.7.9, rev 4992/5002) — the solid analogue of the
 * combustor/nozzle/rocket trio. A `<Rocket>` may bind ONLY solid parts or ONLY liquid
 * ones (`RocketTemplate.Create` throws *"Rocket X mixes solid and liquid components"*),
 * a solid rocket needs ≥1 nozzle, and a `<RocketThrusterController>` may not drive one.
 *  - {@link SolidMotor}        `<SolidMotor>`        the case: burns a solid grain
 *  - {@link SolidMotorNozzle}  `<SolidMotorNozzle>`  expands the gas → thrust
 *  - {@link SolidGrainSegment} `<SolidGrainSegment>` the "tank": a stackable propellant
 *    grain, addressable as a feed container by its `Id`, stacked across connectors that
 *    declare the `SolidMotorCase` capability.
 */

/**
 * A solid motor case (a `RocketCoreTemplate`, so it carries {@link feeds} like a
 * {@link Combustor}). Defaults mirror `decomp/KSA/SolidMotorTemplate.cs`.
 */
export interface SolidMotor {
  /** `<SolidMotor Id>`, targeted by a Rocket's `<Core Id>`, e.g. "MotorCore". */
  id: string;
  /**
   * `<Reaction Id>` — MUST resolve to a `Category="Solid"` FixedReaction with a burn-rate
   * law, else `SolidMotorTemplate.Create` throws *"Solid motor X requires a solid reaction"*.
   * Core ships `APCP` and `DoubleBase`.
   */
  reactionId: string;
  /** `<ThermalEfficiency Value>` (0–1). Default 1. */
  thermalEfficiency: number;
  /**
   * `<DefaultPressure>` chamber pressure. Stored SI (Pa); emitted as Bar. Default 7e6.
   * KSA throws when it is `<= reaction.MinimumBurnPressure` or `> reaction.MaxStablePressure`.
   */
  defaultPressurePa: number;
  /**
   * `<Grain Id>` — a `<GrainGeometry>` id (the burn-area-vs-depth profile, i.e. the
   * thrust curve shape). `''` ⇒ omit the element and take `GrainGeometryLibrary.Default`.
   * Moved from the segment XML to the motor XML in rev 5002.
   */
  grainGeometryId: string;
  /** `<FeedsFrom>` feed points — see {@link Combustor.feeds}; a motor feeds from grain segments. */
  feeds: FeedSource[];
}

/**
 * A solid-motor nozzle (a `RocketNozzleTemplate`). Identical to {@link DeLavalNozzle}
 * MINUS `<AreaRatio>`: `SolidMotorNozzleTemplate.Create` sizes the throat itself as
 * `exitArea / 12`, so there is deliberately no `areaRatio` field here.
 */
export interface SolidMotorNozzle {
  /** `<SolidMotorNozzle Id>`, targeted by a Rocket's `<Nozzle Id>`, e.g. "Nozzle". */
  id: string;
  /** `<ExitDiameter>` exit-plane diameter (m). Default 1. */
  exitDiameterM: number;
  /** `<FxExitDiameter>` visual plume width (m); null ⇒ uses {@link exitDiameterM}. VISUAL ONLY. */
  fxExitDiameterM: number | null;
  /** `<FlowEfficiency Value>` (0–1). Default 1. */
  flowEfficiency: number;
  /** `<ExpansionEfficiency Value>` (0–1). Default 1. */
  expansionEfficiency: number;
  /** `<ExhaustLocation X Y Z>` thrust application point (assembly frame). Default (0,0,0). */
  exhaustLocation: Vec3;
  /** `<ExhaustDirection X Y Z>` direction exhaust leaves (thrust acts along −this). Default (−1,0,0). */
  exhaustDirection: Vec3;
  /** `<FxExhaustLocation>` plume origin; null ⇒ uses {@link exhaustLocation}. */
  fxExhaustLocation: Vec3 | null;
  /** `<FxExhaustDirection>` plume axis; null ⇒ uses {@link exhaustDirection}. */
  fxExhaustDirection: Vec3 | null;
  /**
   * `<ReactionPlume>` exhaust-FX entries, in document order. Empty ⇒ no plume. Core's
   * SRB nozzle carries two: an unkeyed `Default="true"` trail plus a `Reaction="DoubleBase"`
   * volumetric exhaust.
   */
  reactionPlumes: ReactionPlume[];
  /** `<ExhaustLight Value>` dynamic exhaust point light. Default true. */
  exhaustLight: boolean;
  /** `<SoundEvent>` engine audio, or null. */
  sound: RocketSoundEvent | null;
}

/**
 * A stackable solid-propellant grain segment — the solid analogue of a {@link Tank},
 * and like a Tank a `Components` entry addressable as a feed container by its `Id`.
 * Serialized as `<SolidGrainSegment Id><Grain>…</Grain></SolidGrainSegment>`; the
 * inner `<Grain>` is a `SolidGrainSegmentTemplate` (an `AsmbVolumetricMassTemplate`),
 * so it carries the material + the hollow-cylinder dimensions + a mass offset.
 */
export interface SolidGrainSegment {
  /** `<SolidGrainSegment Id>` — the feed container id, e.g. "Grain". */
  id: string;
  /** `<Grain><Material Id>` propellant/casing material, e.g. "Steel.300(s)". Blank omits it. */
  wallMaterialId: string;
  /** `<Grain><OuterRadius M>` casing outer radius in meters. */
  outerRadiusM: number;
  /** `<Grain><WallThickness Mm>` casing wall thickness in millimeters. */
  wallThicknessMm: number;
  /** `<Grain><Length M>` segment length in meters. */
  lengthM: number;
  /** `<Grain><LocationAsmb X Y Z>` mass offset in the assembly frame. Omitted at (0,0,0). */
  locationAsmb: Vec3;
}

/**
 * Core's shipped `<GrainGeometry>` ids — a static snapshot of
 * `Content/Core/GrainGeometries.xml` @ 2026.7.9.5018 (the new top-level asset element
 * added in rev 4992). Each defines a burn-area-vs-depth curve, i.e. the booster's
 * thrust profile over its burn. `Neutral` is the library default.
 */
export const GRAIN_GEOMETRY_IDS: readonly string[] = [
  'BoostSustain',
  'BoostSustainBoost',
  'Neutral',
  'Progressive',
  'Regressive',
];

/** Default solid motor: APCP at 70 bar with a neutral star grain (matches Core's SRBs). */
export function createSolidMotor(id: string): SolidMotor {
  return {
    id,
    reactionId: 'APCP',
    thermalEfficiency: 0.95,
    defaultPressurePa: 7_000_000,
    grainGeometryId: 'Neutral',
    feeds: [],
  };
}

/** Default solid nozzle: 1 m exit, Core's 0.95/0.98 efficiencies, firing along −X. */
export function createSolidMotorNozzle(id: string): SolidMotorNozzle {
  return {
    id,
    exitDiameterM: 1,
    fxExitDiameterM: null,
    flowEfficiency: 0.95,
    expansionEfficiency: 0.98,
    exhaustLocation: { x: 0, y: 0, z: 0 },
    exhaustDirection: { x: -1, y: 0, z: 0 },
    fxExhaustLocation: null,
    fxExhaustDirection: null,
    reactionPlumes: [
      {
        reactionId: null,
        isDefault: true,
        volumetricExhaustId: null,
        plumeTrailId: 'DefaultPlumeTrail',
      },
    ],
    exhaustLight: true,
    sound: null,
  };
}

/** Default grain segment: a 1 m long, 0.5 m radius steel case with a 6 mm wall. */
export function createSolidGrainSegment(id: string): SolidGrainSegment {
  return {
    id,
    wallMaterialId: 'Steel.300(s)',
    outerRadiusM: 0.5,
    wallThicknessMm: 6,
    lengthM: 1,
    locationAsmb: { x: 0, y: 0, z: 0 },
  };
}

/**
 * A captured XML subtree flexo does NOT model, preserved verbatim so importing a
 * built-in Part and re-exporting never silently drops game data flexo has no field for
 * (e.g. `<AttachedInternal>`, the `SolidSphereMass`/`SolidCylinderMass`… mass family,
 * `<SubstanceStorageVolume>`). Stored as plain JSON (no live DOM handle) so it round-trips
 * through the project codec and localStorage. Built by the parser's `captureUnknownChildren`
 * and re-emitted by the serializer's `buildRawNode`. This is the cure for flexo's
 * "model-faithful re-emitter drops everything it doesn't model" round-trip invariant.
 */
export interface RawXmlNode {
  /** Element tag name, e.g. "Collider". */
  tag: string;
  /** Attributes as a name→value map, in source order. */
  attrs: Record<string, string>;
  /** Child elements (recursive). Empty for a leaf element. */
  children: RawXmlNode[];
  /** Trimmed text content — present only for a childless leaf that carries text. */
  text?: string;
}

/**
 * Per-part GameData carried in the sibling <PartGameData> document — the
 * "popup-only" metadata that has no 3D representation (connectors live on
 * {@link EditingPart.connectors} instead, since they ARE 3D). Mirrors
 * space-tape's `PartGameDataState` (GameDataModels.cs / PartEditorState.cs).
 */
export interface PartGameData {
  /** In-game display name (PartGameData DisplayName attribute). Blank omits it. */
  displayName: string;
  /** Mass override in kg, or null for the part's default mass. */
  customMass: number | null;
  /**
   * Unmodeled children of the modeled `<CustomMass>` element (KSA's `CustomMassTemplate`
   * carries more than `<Mass Kg>`: `<MassSpecificInertia Ixx/Iyy/Izz>` plus the
   * `AsmbTransformTemplate` offset/rotation), preserved verbatim and re-emitted inside
   * `<CustomMass>` so importing a built-in part keeps its inertia. Meaningless (and
   * dropped) when {@link customMass} is null — KSA requires `Mass > 0` on a CustomMass.
   */
  customMassExtras: RawXmlNode[];
  /**
   * Part diameter in meters, serialized as <Diameter M/>. KSA's VAB part-picker
   * size-class filter (the `DiameterFilterlist` editor tags) — no physics effect.
   * null ⇒ no <Diameter> element (the part isn't size-filtered).
   */
  diameterM: number | null;
  /**
   * Additional `<Diameter M/>` size classes beyond {@link diameterM}. KSA 2026.7
   * made `<Diameter>` repeatable so adapter prefabs (interstage bridges, engine
   * plates) list every size they bridge (e.g. a 3 m↔2 m adapter emits both). flexo
   * edits only the first ({@link diameterM}); the rest are preserved verbatim so a
   * round-tripped adapter keeps appearing under all its size-class filters. Empty
   * for the common single-diameter case.
   */
  extraDiametersM: number[];
  /**
   * Command-capability marker, serialized as a bare <Control/>. When true the part
   * can pilot a vehicle (KSA `Vehicle.IsControllable`). KSA's ControlTemplate is an
   * empty marker with no fields, so this is a plain on/off flag.
   */
  controllable: boolean;
  batteries: Battery[];
  generators: Generator[];
  solarPanels: SolarPanel[];
  /**
   * The part's single power consumer / light switch, or null. KSA has exactly one
   * `Part.LightSwitch` slot, so flexo models at most one consumer per part — see
   * {@link PowerConsumer} and `analysis/HOW_LIGHT_PARTS_WORK.md`.
   */
  powerConsumer: PowerConsumer | null;
  decoupler: Decoupler | null;
  dockingPort: DockingPort | null;
  evaDoor: EvaDoor | null;
  /** Engine controllers (what makes a Part fire). Reference rockets by id + SubPart instance. */
  rocketControllers: RocketController[];
  /** Part-level rockets (e.g. a gas-generator stitching a root combustor to a SubPart nozzle). */
  rockets: Rocket[];
  /** Part-level combustors (e.g. a gas-generator chamber on the root part). */
  combustors: Combustor[];
  /** Part-level nozzles (uncommon — nozzles usually live on a SubPart). */
  nozzles: DeLavalNozzle[];
  /**
   * Part-level `<Tank>`s. Core authors its prefab tank data here rather than on the
   * SubPart, and since KSA 2026.7.9 a part-level tank is what an engine addresses with
   * `<FeedsFrom Container="…">` without a `SubPart=` scope.
   */
  tanks: Tank[];
  /** Solid motor cases (the SRB analogue of {@link combustors}). */
  solidMotors: SolidMotor[];
  /** Solid-motor nozzles (the SRB analogue of {@link nozzles}). */
  solidNozzles: SolidMotorNozzle[];
  /** Stackable solid propellant grain segments (the SRB analogue of {@link tanks}). */
  solidGrainSegments: SolidGrainSegment[];
  /** How this Part satisfies its placed SubParts' `<FeedsFrom Parent="true"/>` consumers. */
  consumerFeedWiring: ConsumerFeedWiring[];
  /** Per-instance gimbal overlays (thrust-vectoring), keyed by placement instanceId. */
  gimbals: Gimbal[];
  /** Unmodeled `<PartGameData>` attributes (anything but `Id`/`DisplayName`), preserved verbatim. */
  unknownAttrs: Record<string, string>;
  /** Unmodeled `<PartGameData>` child elements, preserved verbatim (see {@link RawXmlNode}). */
  unknownChildren: RawXmlNode[];
}

/**
 * Per-SubPart-template GameData: tanks and solar panels that belong to a specific
 * SubPart template. Serialized as
 * <SubPartGameData Id="subPartTemplateId"><Tank/>...<SolarPanel/>...</SubPartGameData>
 * inside the <PartGameData> document. Multiple instances of the same template share
 * this data, matching KSA's SubPartGameData model (a SubPartGameDataReference is a
 * PartGameDataReference, so a SubPart can carry the same power modules a Part can;
 * in Core data only tanks and solar panels actually appear on SubParts).
 */
export interface SubPartGameData {
  /** The SubPart template id this data belongs to, e.g. "CoreFuelTankA_Subpart_Skin2W1HB". */
  subPartTemplateId: string;
  tanks: Tank[];
  solarPanels: SolarPanel[];
  /** Reusable thrust-chamber combustors that travel with this mesh. */
  combustors: Combustor[];
  /** Reusable nozzles that travel with this mesh. */
  nozzles: DeLavalNozzle[];
  /** Reusable `<Rocket>` bindings (core + nozzles) that travel with this mesh. */
  rockets: Rocket[];
  /** Reusable solid motor cases that travel with this mesh. */
  solidMotors: SolidMotor[];
  /** Reusable solid-motor nozzles that travel with this mesh. */
  solidNozzles: SolidMotorNozzle[];
  /** Reusable solid propellant grain segments that travel with this mesh (a stackable SRB segment). */
  solidGrainSegments: SolidGrainSegment[];
  /** Unmodeled `<SubPartGameData>` attributes (anything but `Id` — e.g. Core's `DisplayName`), preserved verbatim. */
  unknownAttrs: Record<string, string>;
  /** Unmodeled `<SubPartGameData>` child elements, preserved verbatim (see {@link RawXmlNode}). */
  unknownChildren: RawXmlNode[];
}

/** True when a SubPart's data is empty and the entry can be pruned. */
export function isSubPartGameDataEmpty(spd: SubPartGameData): boolean {
  return (
    spd.tanks.length === 0 &&
    spd.solarPanels.length === 0 &&
    spd.combustors.length === 0 &&
    spd.nozzles.length === 0 &&
    spd.rockets.length === 0 &&
    spd.solidMotors.length === 0 &&
    spd.solidNozzles.length === 0 &&
    spd.solidGrainSegments.length === 0 &&
    spd.unknownChildren.length === 0 &&
    Object.keys(spd.unknownAttrs).length === 0
  );
}

/** Default tank: 2 m cylinder, 0.5 m radius, 2 mm aluminium wall (matches TankState). */
export function createTank(): Tank {
  return {
    id: '',
    shape: 'Cylindrical',
    wallMaterialId: 'Aluminum.2014(s)',
    lengthM: 2.0,
    outerRadiusM: 0.5,
    wallThicknessMm: 2.0,
    roleAffinity: 'Engine',
    locationAsmb: { x: 0, y: 0, z: 0 },
  };
}

/** Default solar panel: 50 W, facing its local axis (identity orientation). */
export function createSolarPanel(): SolarPanel {
  return { outputWatts: 50, transform: identityTransform() };
}

/**
 * Default power consumer: a 60 W light switch (matches KSA's `LightSmallA` draw),
 * off at start. Light parts are the dominant use, so we default {@link PowerConsumer.lightSwitch}
 * on; clear it for a plain always-on draw.
 */
export function createPowerConsumer(): PowerConsumer {
  return { consumedWatts: 60, lightSwitch: true, lightIsActive: false };
}

/**
 * Default light: a white Spot matching KSA's canonical CoreElectricalA spotlight
 * (range 5 m, intensity 10, 22.5°/45° inner/outer half-cone). Aimed along local +X
 * (identity rotation) in the owner frame ({@link PartLight.ownerTemplateId}).
 */
export function createPartLight(ownerTemplateId: string | null, id: string): PartLight {
  return {
    id,
    type: 'Spot',
    ownerTemplateId,
    ...identityTransform(),
    rangeM: 5,
    intensity: 10,
    color: { r: 1, g: 1, b: 1 },
    innerAngleRad: Math.PI / 8,
    outerAngleRad: Math.PI / 4,
    rayTracing: false,
    layerId: LIGHT_LAYER_ID,
  };
}

/** An empty GameData block (no display name, default mass, no sub-items). */
export function createEmptyGameData(): PartGameData {
  return {
    displayName: '',
    customMass: null,
    customMassExtras: [],
    diameterM: null,
    extraDiametersM: [],
    controllable: false,
    batteries: [],
    generators: [],
    solarPanels: [],
    powerConsumer: null,
    decoupler: null,
    dockingPort: null,
    evaDoor: null,
    rocketControllers: [],
    rockets: [],
    combustors: [],
    nozzles: [],
    tanks: [],
    solidMotors: [],
    solidNozzles: [],
    solidGrainSegments: [],
    consumerFeedWiring: [],
    gimbals: [],
    unknownAttrs: {},
    unknownChildren: [],
  };
}

/** A fresh, empty per-SubPart-template GameData entry. */
export function createSubPartGameData(subPartTemplateId: string): SubPartGameData {
  return {
    subPartTemplateId,
    tanks: [],
    solarPanels: [],
    combustors: [],
    nozzles: [],
    rockets: [],
    solidMotors: [],
    solidNozzles: [],
    solidGrainSegments: [],
    unknownAttrs: {},
    unknownChildren: [],
  };
}

/** Default combustor: Hydrolox at its default O/F, 50 bar chamber, fully throttleable, no min-pulse. Mirrors CombustorTemplate. */
export function createCombustor(id: string): Combustor {
  return {
    id,
    reactionId: DEFAULT_REACTION_ID,
    mixtureRatio: DEFAULT_MIXTURE_RATIO,
    maxPressurePa: 5_000_000,
    thermalEfficiency: 1,
    minimumThrottle: 1,
    minimumPulseTimeS: null,
    // A fresh chamber defers to its placing Part (the reusable-SubPart shape Core uses);
    // an empty list would make KSA log "declares no FeedsFrom feed points".
    feeds: [{ kind: 'parent' }],
    plumbing: 'Bulk',
  };
}

/**
 * Default nozzle: 1 m exit, area ratio 25 (a usable vacuum-ish bell — KSA's own NaN
 * default is broken), efficiencies 1, exhaust at the origin firing along −X. Mirrors
 * DeLavalNozzleTemplate / RocketNozzleTemplate, with a real AreaRatio so it works out of the box.
 */
export function createNozzle(id: string): DeLavalNozzle {
  return {
    id,
    exitDiameterM: 1,
    fxExitDiameterM: null,
    areaRatio: 25,
    flowEfficiency: 1,
    expansionEfficiency: 1,
    exhaustLocation: { x: 0, y: 0, z: 0 },
    exhaustDirection: { x: -1, y: 0, z: 0 },
    fxExhaustLocation: null,
    fxExhaustDirection: null,
    reactionPlumes: [],
    exhaustLight: true,
    sound: null,
  };
}

/** A `<Rocket>` binding one core to N nozzles (defaults to the given core/nozzle ids on the same SubPart). */
export function createRocket(id: string, coreId = '', nozzleIds: string[] = []): Rocket {
  return {
    id,
    core: { id: coreId, subPartInstanceId: null },
    nozzles: nozzleIds.map((nid) => ({ id: nid, subPartInstanceId: null })),
  };
}

/** A controller (default: main engine) driving the given rocket ids. */
export function createRocketController(
  id: string,
  kind: RocketControllerKind = 'engine',
  rocketIds: string[] = [],
): RocketController {
  return {
    id,
    kind,
    rocketRefs: rocketIds.map((rid) => ({ id: rid, subPartInstanceId: null })),
    controlMapFlags: null,
  };
}

/** A fixed (0/0) gimbal on a placement; raise the max angles to make it actuate. */
export function createGimbal(subPartInstanceId: string): Gimbal {
  return { subPartInstanceId, maxAngleYDeg: 0, maxAngleZDeg: 0, constrainToCircle: true };
}

/** One reactant in a custom reaction: a substance-phase id + its mixture mass share. */
export interface ReactionReactantSpec {
  /** Substance phase id, e.g. "H2(l)" / "O2(l)". */
  phaseId: string;
  /** `<Reactant MassShare>` — the mixture-ratio numerator (normalized to fractions at load). */
  massShare: number;
}

/**
 * One row of a custom reaction's pressure-indexed gas table, in authored units
 * (the raw `<PressureCondition>` form). The physics derives R from {@link molarMassGPerMol}
 * and indexes rows by {@link lnPressure}; see src/ksa/enginePhysics.ts.
 */
export interface ReactionLutRowSpec {
  /** ln(chamber pressure / Pa). */
  lnPressure: number;
  /** Flame temperature (K). */
  temperatureK: number;
  /** Ratio of specific heats γ. */
  gamma: number;
  /** Mean molar mass of the combustion products (g/mol). */
  molarMassGPerMol: number;
}

/**
 * `<BurnRate CoefficientMPerS Exponent/>` — Vieille's law `r = a · p^n`, the solid
 * grain's regression rate vs chamber pressure (KSA `BurnRateTemplate`/`BurnRateLaw`).
 * `FixedReactionTemplate.Create` throws *"Reaction X has an implausible burn rate law"*
 * unless `a > 0` and `0 <= n < 0.95`.
 */
export interface BurnRateLaw {
  /** `<BurnRate CoefficientMPerS>` — must be > 0. */
  coefficientMPerS: number;
  /** `<BurnRate Exponent>` — must be >= 0 and < 0.95. */
  exponent: number;
}

/**
 * A USER-AUTHORED reaction (propellant chemistry). Lets a designer control the
 * mixture beyond the shipped Core reactions. Exported as a top-level
 * `<FixedReaction>` in the GameData document and referenced by a combustor's
 * {@link Combustor.reactionId} (fixed ⇒ no `<MixtureRatio>` needed). The gas
 * {@link lut} is CEA-style pre-solved thermodynamics — flexo's authoring is
 * clone-and-remix (copy a shipped reaction, then adjust the mixture / rows), NOT a
 * from-scratch solver; cloning a MixtureReaction bakes it at one O/F ratio the way
 * KSA itself does (MixtureReaction.AtMixtureRatio). Pure data: no binaries.
 */
export interface CustomReaction {
  /** Unique reaction id referenced by `<Reaction Id>`, e.g. "MyKerolox_2.6". */
  id: string;
  /** Display name (`<Name Value>`), falling back to {@link id}. */
  name: string;
  /** `Category` attribute (grouping; KSA's FixedReaction fallback is Monopropellant). */
  category: ReactionCategory;
  /** Reactant mixture (≥1). */
  reactants: ReactionReactantSpec[];
  /** Pressure-indexed gas LUT (≥1 `<PressureCondition>` row). */
  lut: ReactionLutRowSpec[];
  /** `<BurnRate>` — REQUIRED when {@link category} is `Solid`; null otherwise. */
  burnRate: BurnRateLaw | null;
  /** `<MinimumBurnPressure>` deflagration limit (Pa). Required for Solid, must be > 0. */
  minimumBurnPressurePa: number | null;
  /** `<MaxStablePressure>` slope-break limit (Pa). Required for Solid, must be > {@link minimumBurnPressurePa}. */
  maxStablePressurePa: number | null;
  /** `<ExhaustCondensedFraction Value>` condensed-phase exhaust mass fraction. Required for Solid, [0, 1). */
  exhaustCondensedFraction: number | null;
}

/** A minimal valid custom reaction (one reactant, one LUT row) — a blank to edit. */
export function createCustomReaction(id: string, name: string): CustomReaction {
  return {
    id,
    name: name.trim() || id,
    category: 'Monopropellant',
    reactants: [{ phaseId: 'H2(l)', massShare: 1 }],
    lut: [
      { lnPressure: Math.log(5_000_000), temperatureK: 3000, gamma: 1.2, molarMassGPerMol: 14 },
    ],
    burnRate: null,
    minimumBurnPressurePa: null,
    maxStablePressurePa: null,
    exhaustCondensedFraction: null,
  };
}

/**
 * KSA REQUIRES burn-rate data on a `Category="Solid"` FixedReaction —
 * `FixedReactionTemplate.Create()` THROWS (the whole mod fails to load) when
 * `<BurnRate>`, `<MinimumBurnPressure>`, `<MaxStablePressure>` or
 * `<ExhaustCondensedFraction>` is missing or implausible. Export therefore SKIPS any
 * solid reaction that fails this check rather than emitting a crash-on-load mod.
 * Reference values from Core's `Reactions.xml` @ 5018:
 *   APCP       — a=0.0045 m/s, n=0.35, min 15 bar, max 150 bar, condensed 0.33696528908145584
 *   DoubleBase — a=0.0024 m/s, n=0.65, min 30 bar, max 100 bar, condensed 0
 */
export function isCustomReactionExportable(r: CustomReaction): boolean {
  if (r.category !== 'Solid') return true;
  return (
    r.burnRate != null &&
    r.burnRate.coefficientMPerS > 0 &&
    r.burnRate.exponent >= 0 &&
    r.burnRate.exponent < 0.95 &&
    r.minimumBurnPressurePa != null &&
    r.minimumBurnPressurePa > 0 &&
    r.maxStablePressurePa != null &&
    r.maxStablePressurePa > r.minimumBurnPressurePa &&
    r.exhaustCondensedFraction != null &&
    r.exhaustCondensedFraction >= 0 &&
    r.exhaustCondensedFraction < 1
  );
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
export type PrimitiveKind = 'box' | 'cylinder' | 'sphere' | 'plane';

export interface BoxParams {
  width: number;
  height: number;
  depth: number;
}
export interface CylinderParams {
  radius: number;
  height: number;
  radialSegments: number;
}
export interface SphereParams {
  radius: number;
  /** Vertical segments; horizontal = 2× this. */
  segments: number;
}
export interface PlaneParams {
  width: number;
  height: number;
}

/** A primitive shape + its parameters (framework-agnostic; built in three/primitives.ts). */
export type PrimitiveSpec =
  | { kind: 'box'; params: BoxParams }
  | { kind: 'cylinder'; params: CylinderParams }
  | { kind: 'sphere'; params: SphereParams }
  | { kind: 'plane'; params: PlaneParams };

/**
 * Which PBR channel an uploaded image was authored for. Drives the encode params
 * (mip filtering space, normal-map transforms) and which material slots the texture
 * can be assigned to. KSA's `<PbrMaterial>` slots: Diffuse (sRGB content),
 * Normal (RG tangent-space, X-flipped by the shader), AoRoughMetal (packed
 * R=AO G=rough B=metal, linear), Emissive (grayscale mask, linear).
 */
export type TextureChannel =
  | 'baseColor' // sRGB content → <Diffuse>
  | 'normal' // tangent-space normal (X-flip + strength baked at encode) → <Normal>
  | 'orm' // pre-packed R=AO G=rough B=metal → <AoRoughMetal>
  | 'roughness' // grayscale → packed into ORM green
  | 'metalness' // grayscale → packed into ORM blue
  | 'occlusion' // grayscale → packed into ORM red
  | 'emissiveMask'; // grayscale glow mask → <Emissive>

/**
 * A user-uploaded texture. Carries a single image authored for one {@link channel};
 * the raw image bytes and the encoded KTX2 live in IndexedDB under {@link id}.
 */
export interface CustomTexture {
  /** Stable unique id (also the IndexedDB key), e.g. "tex_ab12cd". */
  id: string;
  /** User-facing label, also the basis for the exported .ktx2 filename. */
  name: string;
  /** Base level dimensions of the encoded texture (post-decode/resize). */
  width: number;
  height: number;
  /** The PBR channel this image is authored for (decides encode params + valid slots). */
  channel: TextureChannel;
}

/** An sRGB color, 0..255 per channel. */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * How a scalar PBR channel (metalness / roughness) of a {@link CustomMaterial} is
 * sourced: a uniform value (exported as a solid texel — KSA's PbrMaterial has NO
 * scalar parameters, everything is a texture) or a grayscale {@link CustomTexture}.
 */
export type ScalarChannel = { kind: 'value'; value: number } | { kind: 'map'; textureId: string };

/** How a {@link CustomMaterial}'s base color is sourced: a picked color or an image. */
export type BaseColorChannel =
  | { kind: 'color'; color: RgbColor }
  | { kind: 'map'; textureId: string };

/**
 * A tangent-space normal map channel. KSA has no usable per-material normal-strength
 * scalar (`<Normal Power>` is parsed but only consumed by the planet renderer), so
 * {@link strength} is baked into the map's RG values at encode time.
 */
export interface NormalChannel {
  textureId: string;
  /** Bump strength multiplier, baked into RG at encode. 1 = as authored. */
  strength: number;
}

/**
 * A reusable user-authored PBR material. Meshes reference it via
 * {@link CustomMesh.materialId}; export resolves every channel into the
 * `<PbrMaterial>` texture set (uniform values become 1×1 solid KTX2s — KSA's
 * material schema is textures-only, see plans/CUSTOM_TEXTURES_PLAN.md §1).
 * Emissive (glow) deliberately stays per-mesh ({@link CustomMesh.emissive}).
 */
export interface CustomMaterial {
  /** Stable unique id, e.g. "mat_ab12cd". */
  id: string;
  /** User-facing label, also the basis for the exported material id. */
  name: string;
  baseColor: BaseColorChannel;
  /** 0 = dielectric, 1 = metal. KSA reads it from the ORM blue channel. */
  metalness: ScalarChannel;
  /** 0 = mirror-smooth, 1 = fully rough. KSA reads it from the ORM green channel. */
  roughness: ScalarChannel;
  /** Ambient occlusion map (ORM red). Absent = fully unoccluded (255). */
  occlusion?: { textureId: string };
  /** Pre-packed AO/Rough/Metal image; when set it overrides the three channels above. */
  ormPacked?: { textureId: string };
  /** Tangent-space normal map. Absent = flat (the shared synthetic FlatNormal). */
  normal?: NormalChannel;
}

/** The neutral material: matches what an un-materialed custom mesh has always exported
 * (NeutralORM = AO 255 / rough 128 / metal 0 — 0.5 quantizes to the same 128 texel)
 * and the editor's flat-gray base color. */
export function createDefaultMaterial(id: string, name: string): CustomMaterial {
  return {
    id,
    name,
    baseColor: { kind: 'color', color: { r: 191, g: 196, b: 204 } },
    metalness: { kind: 'value', value: 0 },
    roughness: { kind: 'value', value: 0.5 },
  };
}

/**
 * Every {@link CustomTexture} id a material's channels point at (deduped, in slot order).
 * The one place that enumerates the mapped channels — used for usage counts in the UI and for
 * the reference-counted asset GC in `customAssetStore.planImportRemoval()`. A packed ORM
 * counts exactly like the separate channels it overrides, mirroring the export.
 */
export function materialTextureIds(mat: CustomMaterial): string[] {
  const ids: string[] = [];
  if (mat.baseColor.kind === 'map') ids.push(mat.baseColor.textureId);
  if (mat.metalness.kind === 'map') ids.push(mat.metalness.textureId);
  if (mat.roughness.kind === 'map') ids.push(mat.roughness.textureId);
  if (mat.occlusion) ids.push(mat.occlusion.textureId);
  if (mat.ormPacked) ids.push(mat.ormPacked.textureId);
  if (mat.normal) ids.push(mat.normal.textureId);
  return [...new Set(ids)];
}

/**
 * Per-face texture + UV configuration for a custom primitive mesh face.
 * Face key names are defined by PRIMITIVE_FACE_KEYS in three/primitives.ts
 * (e.g. 'right'/'left'/'top'/'bottom'/'front'/'back' for box,
 * 'side'/'top'/'bottom' for cylinder, 'all' for sphere/plane).
 */
export interface FaceTextureConfig {
  /** Id of the {@link CustomTexture} to use on this face (empty = untextured). */
  textureId: string;
  /**
   * UV scale. { x: 1, y: 1 } = the whole image fills the face (default).
   * Values > 1 tile the image (e.g. 3 → 3×3 repeats, honoring {@link wrap});
   * values < 1 zoom into a sub-region (combine with {@link uvOffset} to pan).
   */
  uvScale: { x: number; y: number };
  /** UV offset (translation), used to pan the sampled region. { x: 0, y: 0 } = no offset (default). */
  uvOffset: { x: number; y: number };
  /**
   * How the texture samples where UVs fall outside 0–1 (scale > 1, or an offset
   * that pushes past an edge): 'repeat' tiles, 'mirror' tiles flipped each tile
   * (seamless), 'clamp' stretches the edge pixels. Defaults to 'repeat' when absent.
   */
  wrap?: TextureWrap;
}

/** UV wrap mode for a textured face — how samples outside the 0–1 range behave. */
export type TextureWrap = 'repeat' | 'mirror' | 'clamp';

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
  kind: KittenKind;
  /** Stable per-submesh-type token (e.g. 'suit'|'head'|'eye'|'helmet'|'visor'|'pack'|'packLabels'). Drives the bake cache + subPart naming. */
  specKey: string;
  /** Diffuse .ktx2 subpath, e.g. "Textures/Characters/Kitten_EMU_A.ktx2" (sRGB). */
  diffuse: string;
  /** Tangent-space normal .ktx2 subpath (linear), if any. */
  normal?: string;
  /** Packed AO/Rough/Metal .ktx2 subpath (linear), if any. */
  aoRoughMetal?: string;
  /**
   * Glass-like transparency (the visor). Drives BOTH the translucent editor material
   * (see kittenBake `buildKittenMaterial`) AND the `<PartModelGlass>` export path (see
   * modExport `planKittenSubPart` → assetsXmlSerializer). A mesh with this set is
   * "glass-capable" and may carry a {@link CustomMesh.surface} mode + {@link GlassConfig}.
   */
  transparent?: boolean;
}

/**
 * An IMPORTED (glTF/GLB) SubPart's geometry source. Present ONLY on a {@link CustomMesh}
 * created by the model importer (see `src/ksa/importPlan.ts` + `importNormalize.ts`) — it
 * is mutually exclusive with {@link CustomMesh.primitive} and {@link CustomMesh.kitten}.
 *
 * Unlike a primitive (regenerable from its {@link PrimitiveSpec}) or a kitten submesh
 * (re-baked from the shipped kitten gltf), imported geometry has NO regenerable source:
 * the normalized atlas GLB in IndexedDB under `assetKeys.importGlb(importId)` is the ONLY
 * copy, and this descriptor is just the name pair that resolves a mesh inside it.
 *
 * ONE import batch (one dropped file) produces ONE GLB holding one named mesh per SubPart,
 * so every mesh from the same file shares an {@link importId} and is distinguished by
 * {@link meshName} (== {@link CustomMesh.subPartId} == the glTF node+mesh name, per KSA's
 * MeshAtlasFileReference which registers meshes by `meshes[i].name`).
 */
export interface ImportedMeshSource {
  /** Import batch id — IndexedDB key of the normalized geometry GLB (assetKeys.importGlb). */
  importId: string;
  /** Node/mesh name inside that GLB (== {@link CustomMesh.subPartId}). */
  meshName: string;
  /** Provenance: the original file name, e.g. "rcs_pod.glb". Shown in the UI. */
  sourceFile: string;
  /** Provenance: the glTF node/object name this SubPart was cut from. Also the re-import match key. */
  sourceNode: string;
  /** Provenance: the glTF material name this SubPart was cut from. Also the re-import match key. */
  sourceMaterial: string;
  /** Triangle count of the normalized geometry (budget warnings + the provenance block). */
  triangles: number;
  /** Vertex count of the normalized geometry. */
  vertices: number;
  /**
   * Export through KSA's translucent `<PartModelGlass>` path instead of `<PartModel>`
   * (offered when the glTF material used `alphaMode: BLEND`; opt-in, because KSA glass is a
   * fixed ~0.75-opacity, ~10%-tinted, non-glowing shader — see MeshGlassIndirect.frag).
   */
  transparent?: boolean;
}

/**
 * Emissive (glow) authoring shape for a custom mesh.
 *  - 'whole'   — a uniform glow over the whole mesh (one key value everywhere).
 *  - 'painted' — an RGBA glow bitmap authored in the in-browser paint tool (stored in IndexedDB
 *                under assetKeys.emissivePaint(meshId)); rgb = glow color, a = the GREYSCALE KEY.
 */
export type EmissiveShape = 'whole' | 'painted';

/** One stop of a {@link GlowRamp}: an sRGB color pinned at a key position 0..1. */
export interface GlowRampStop {
  /** Key position 0..1. Stops are kept sorted ascending; duplicates make a hard edge. */
  at: number;
  color: RgbColor;
}

/**
 * A color ramp keyed by the glow's greyscale value — flexo's stand-in for the 1-px gradient LUTs
 * KSA uses for its own keyed effects (`Textures/TemperatureLut.png`, sampled at
 * `vec2(key, 0.5)` in MeshIndirect.frag:297).
 *
 * KSA has NO per-material LUT slot — `PbrMaterialReference` is five texture paths and nothing
 * else — so flexo evaluates the ramp on the CPU at composite time and the game only ever receives
 * the greyscale mask it supports. The authoring model matches KSA's (greyscale map + gradient,
 * smooth color falloff); the color lands in the `<Diffuse>`. See analysis/KSA_EMISSIVE_AND_LUT.md.
 */
export interface GlowRamp {
  /** Ordered ascending by {@link GlowRampStop.at}; at least 2 stops. */
  stops: GlowRampStop[];
}

/**
 * Per-mesh emissive (glow). Absent on a {@link CustomMesh} ⇒ no glow.
 *
 * KSA's emissive is WHITE × mask × 1.25 ADDED after lighting (MeshIndirect.frag:276-287) — there
 * is no colored emission anywhere on that path — so a glow is authored as TWO independent things
 * over one greyscale key (the 'whole' uniform value, or the painted bitmap's alpha):
 *
 *  - {@link coverage} blends the glow COLOR into the diffuse. Visible wherever the surface is lit.
 *  - {@link strength} scales the key into the `<Emissive>` mask = how much WHITE the game adds.
 *    Visible in shadow, and the only thing that shows with the lights off.
 *
 * They used to be one slider, which made the only setting that reads colored in-game (saturated
 * color + gentle white core) impossible to author. For real colored light, pair a modest
 * {@link strength} with a `<Light>` carrying {@link Light.color} — see §5.1 of the analysis.
 */
export interface EmissiveConfig {
  shape: EmissiveShape;
  /** Glow color 0..255. The painter's brush color for 'painted'. Ignored when {@link ramp} is set. */
  color: RgbColor;
  /**
   * Emissive mask scale 0..1 — the `<Emissive>` gray value KSA adds as white. Keep it moderate
   * (~0.2–0.4): 1.0 adds ≈1.63 linear white and swamps any color.
   */
  strength: number;
  /** How much of the base color the glow color replaces at full key, 0..1. */
  coverage: number;
  /**
   * Optional color ramp keyed by the greyscale value, replacing the flat {@link color}. Only
   * meaningful for 'painted' (a 'whole' glow has one key everywhere, so a ramp would resolve to a
   * single color).
   */
  ramp?: GlowRamp;
}

/**
 * Default glow: a moderate cyan whose emissive stays low enough that the color survives the white
 * KSA adds. Also the model template `projectStore.normalizePart` default-fills stored glows
 * from — a snapshot missing a field gets this value, never a migration.
 */
export function createGlow(): EmissiveConfig {
  return {
    shape: 'whole',
    color: { r: 120, g: 220, b: 255 },
    strength: 0.3,
    coverage: 1,
  };
}

/**
 * Translucent-glass tint for a glass-capable (visor) mesh — one whose {@link KittenMeshSource}
 * has `transparent: true`. The tint is baked into a solid sRGB diffuse on export; KSA's glass
 * shader derives only ~10% of its color from the diffuse (MeshGlassIndirect.frag), so in-game the
 * tint reads subtle/dark — the editor can preview either the vivid color or that muted look.
 */
export interface GlassConfig {
  /** Glass tint color 0..255. */
  tint: { r: number; g: number; b: number };
  /** Editor-preview opacity 0..1 (default 0.45). In-game opacity is engine-fixed (~0.75). */
  opacity?: number;
}

/**
 * Surface mode for a glass-capable (visor) mesh; only meaningful when its
 * {@link KittenMeshSource.transparent} is set. Undefined ⇒ 'glass' (back-compat).
 *  - 'glass'     — translucent, tintable (no glow; KSA glass can't glow).
 *  - 'glow'      — opaque emissive (drops the glass shell so it actually glows in-game).
 *  - 'glassGlow' — layered: a translucent glass shell + an inset opaque emissive layer behind it
 *                  (two SubParts on export; a single approximated material in the editor).
 */
export type VisorSurface = 'glass' | 'glow' | 'glassGlow';

/**
 * A user-created custom SubPart — a primitive mesh + per-face textures, a part-ified
 * kitten submesh ({@link kitten} set), or an imported glTF mesh ({@link imported} set).
 * The three sources are MUTUALLY EXCLUSIVE; discriminate with {@link meshKind}, never by
 * asserting `primitive!`. Becomes a custom SubPart template: placements reference
 * {@link subPartId} via subPartTemplateId, exactly like a Core template id. The generated
 * GLB node is named {@link subPartId}.
 */
export interface CustomMesh {
  /** Stable unique id (IndexedDB key for the generated GLB), e.g. "mesh_ab12cd". */
  id: string;
  /** User-facing label, also the basis for the SubPart/material names. */
  name: string;
  /**
   * Stable SubPart template id (== GLB node name == Assets.xml SubPart Id). Decoupled
   * from {@link name}/project name so renames never break existing placements.
   */
  subPartId: string;
  /** The primitive shape + parameters. Absent for kitten ({@link kitten}) and imported ({@link imported}) meshes. */
  primitive?: PrimitiveSpec;
  /** Part-ified kitten submesh source. When set, {@link primitive} and {@link imported} are absent. */
  kitten?: KittenMeshSource;
  /** Imported glTF/GLB mesh source. When set, {@link primitive} and {@link kitten} are absent. */
  imported?: ImportedMeshSource;
  /**
   * Per-face texture + UV configuration. Keys are primitive-kind-specific face names
   * from PRIMITIVE_FACE_KEYS ('right'/'left'/… for box, 'side'/'top'/'bottom' for
   * cylinder, 'all' for sphere/plane). Absent keys → untextured face, default UVs.
   * Always empty ({}) for kitten submeshes (they carry their material in {@link kitten}).
   */
  faceTextures: Partial<Record<string, FaceTextureConfig>>;
  /**
   * The {@link CustomMaterial} for the whole mesh (base color / metal / rough / normal).
   * Absent ⇒ the legacy neutral look (flat gray, NeutralORM on export). A face's
   * {@link FaceTextureConfig.textureId} overrides the material's base color on that face;
   * the scalar/normal channels always come from the material. Never set on kitten
   * submeshes (they carry their own full PBR set in {@link kitten}).
   */
  materialId?: string;
  /**
   * Optional per-mesh emissive glow. For a glass-capable visor it is the glow layer used when
   * {@link surface} ∈ {'glow','glassGlow'}. A 'painted' shape stores its RGBA bitmap in IndexedDB
   * under assetKeys.emissivePaint(id).
   */
  emissive?: EmissiveConfig;
  /** Optional translucent-glass tint (visor); used when {@link surface} ∈ {'glass','glassGlow'}. */
  glass?: GlassConfig;
  /**
   * Surface mode for a glass-capable (visor) mesh — one whose {@link kitten} has `transparent`.
   * Ignored for non-transparent meshes (their glow is driven by {@link emissive} alone).
   * Undefined ⇒ 'glass'.
   */
  surface?: VisorSurface;
}

/** Which geometry source backs a {@link CustomMesh}. See {@link meshKind}. */
export type CustomMeshKind = 'primitive' | 'kitten' | 'imported';

/**
 * The discriminator for {@link CustomMesh}'s three mutually exclusive geometry sources.
 *
 * EVERY consumer must switch on this — resolving geometry, building materials, rebuilding
 * the atlas, encoding the project, exporting the mod. Do NOT test `m.kitten ? … : m.primitive!`:
 * that idiom silently mis-handles a third kind (an imported mesh would be treated as a
 * primitive and crash on the missing spec), which is exactly the trap a third source kind
 * introduces. A mesh with no source at all is reported as 'primitive' — the historical
 * default and the only kind whose absence is recoverable (an empty PrimitiveSpec).
 */
export function meshKind(m: CustomMesh): CustomMeshKind {
  if (m.kitten) return 'kitten';
  if (m.imported) return 'imported';
  return 'primitive';
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
  | 'actuate';

/**
 * A pivot frame the animation rotates/translates. SubParts in
 * {@link memberInstanceIds} are rigidly attached and follow it. Joints may nest
 * via {@link parentJointId} to form kinematic chains (spider legs, multi-segment
 * landing gear); a root joint (parentJointId=null) is posed in Part space.
 */
export interface AnimationJoint {
  /** Stable unique id within the animation, e.g. "joint_ab12cd". */
  id: string;
  /** User-facing label, e.g. "Hinge", "Hip", "Knee". */
  name: string;
  /** Parent joint id for a chain, or null when posed directly in Part space. */
  parentJointId: string | null;
  /** Instance ids of placements rigidly attached to this joint (become glb leaves). */
  memberInstanceIds: string[];
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
  | 'easeInOutSine';

/**
 * How a joint's pose interpolates across ONE keyframe segment. The canonical form is
 * a CSS-style cubic-bézier (P0=(0,0), P1=(x1,y1), P2=(x2,y2), P3=(1,1)); presets are
 * just named shortcuts that resolve to control points. Absent/`linear` = no warp.
 * The reverse-fit importer produces `cubicBezier`; the editor offers both.
 */
export type EasingConfig =
  | { kind: 'preset'; preset: EasingPreset }
  | { kind: 'cubicBezier'; x1: number; y1: number; x2: number; y2: number };

/**
 * A snapshot of every joint's LOCAL frame (relative to its parent joint, or Part
 * space for root joints) at one point on the 0→durationSec timeline. The keyframe
 * at timeSec=0 is the rest pose (must equal each SubPart's placement once composed).
 */
export interface AnimationKeyframe {
  /** Stable unique id within the animation, e.g. "kf_ab12cd". */
  id: string;
  /** Time in seconds (KSA: 1 s sim = 1 s timeline). The first keyframe is always 0. */
  timeSec: number;
  /** jointId → that joint's local frame at this time. Every joint has an entry. */
  poses: Record<string, Transform>;
  /**
   * Optional easing for each joint over the OUTGOING segment [this kf → next kf].
   * A missing jointId entry (or `linear`) means linear interpolation for that joint
   * on this segment. Ignored on the final keyframe (it has no outgoing segment).
   * Stored per-joint because keyframe times are global but joints animate in
   * different sub-windows — on one segment joint A may ease while joint B holds.
   */
  easings?: Record<string, EasingConfig>;
}

/**
 * Optional passthrough to KSA's built-in `<SolarTracking>` extension — after the
 * animation deploys, the named SubPart continuously rotates to face the sun.
 * Only meaningful for real solar panels; requires {@link AnimationMode} deployRetract.
 */
export interface SolarTrackingSpec {
  /** Tracking rotation speed, degrees per second. */
  degreesPerSecond: number;
  /** Instance id of the SubPart that rotates to track the sun (the drive rotor). */
  subPartInstanceId: string;
  /** Instance ids excluded from the tracking rotation (e.g. the fixed housing). */
  excludeInstanceIds: string[];
}

/**
 * A user-authored animation on the Part. Becomes one `<KeyframeAnimationModule>`
 * (+ one `Animations/*.glb`). A SubPart should be attached to at most one
 * animation — overlapping modules fight over its transform each frame.
 */
export interface PartAnimation {
  /** Stable unique id (basis for the module Id + glb filename), e.g. "anim_ab12cd". */
  id: string;
  /** User-facing label, e.g. "Bay Doors", "Deploy". */
  name: string;
  /** Full deploy time in seconds = KSA Duration (the max keyframe time). */
  durationSec: number;
  mode: AnimationMode;
  /** The pose skeleton. Single-joint for doors/hinges; nested for chains. */
  joints: AnimationJoint[];
  /** Poses over time, sorted by timeSec; keyframes[0].timeSec === 0. */
  keyframes: AnimationKeyframe[];
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
  restKeyframeId?: string;
  /** Optional sun-tracking extension, or null. */
  solarTracking: SolarTrackingSpec | null;
}

/**
 * A `<KeyframeAnimationModule>` parsed from a built-in Part's GameData XML, before
 * import. References (the solar-tracking SubParts) are in the ORIGINAL KSA instance-id
 * space; {@link import('./animationImport').decodeAnimationGlb} + the importer remap
 * them to the editor's regenerated instance ids. See docs in animationImport.ts.
 */
export interface CatalogAnimationModule {
  /** Module Id attribute (e.g. "SolarPanelAnimation"). */
  moduleId: string;
  /** Maps to {@link AnimationMode}: ShowDeployRetract="true" ⇒ deployRetract. */
  showDeployRetract: boolean;
  /** Relative path to the animation GLB, e.g. "Animations/..._Anim.glb". */
  glbPath: string;
  /** `<KeyframeAnimation Id>` of the GLB (informational). */
  glbId: string;
  /** Optional sun-tracking, with SubPart refs in ORIGINAL instance-id space. */
  solarTracking: {
    degreesPerSecond: number;
    subPartOriginalId: string;
    excludeOriginalIds: string[];
  } | null;
}

/** An identity (rest) transform — position 0, rotation 0, scale 1. */
export function identityTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
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
  };
}

/** The full Part being assembled in the editor. */
export interface EditingPart {
  /** Part id used in the exported XML (must be unique), e.g. "fixme_part_id". */
  partId: string;
  /** Editor tags emitted as <EditorTag Value="..."/> on the <PartGameData>. */
  editorTags: string[];
  /** Optional popup-only GameData (display name, mass, power, coupling). */
  gameData: PartGameData;
  /** Per-SubPart-template GameData (tanks). Keyed by subPartTemplateId. */
  subPartGameData: SubPartGameData[];
  /**
   * Per-SubPart-template `<Internal>` (interior-only) flag, keyed by `subPartTemplateId`.
   * ABSENT ⇒ inherit the template's own value: a built-in's catalogued `<Internal>`
   * (`CatalogSubPart.internal`), or `false` for a flexo-authored custom mesh.
   *
   * KSA puts `<Internal>` on a `<SubPart>`'s `<PartModel>`, so it is a TEMPLATE property, not a
   * per-placement one — setting it affects every placement of that template (same rule as a
   * SubPart-owned {@link PartCollider}). See docs/iva-seats.md.
   */
  internalFlags: Record<string, boolean>;
  /** Editor-only layers; array order is the display order. Always includes Default. */
  layers: Layer[];
  /** All placed SubPart instances. */
  placements: SubPartPlacement[];
  /** All connector attachment points. */
  connectors: Connector[];
  /** The Part's collision volume — analytic primitives grouped by owner on export. */
  colliders: PartCollider[];
  /** The Part's IVA camera vantage points, in cycle order (index 0 is the default seat). */
  ivaSeats: IvaSeat[];
  /** The Part's cast lights — normalised out of GameData, grouped by owner on export. */
  lights: PartLight[];
  /** Editor-only kitten visual aides (never serialized to export). */
  kittens: KittenInstance[];
  /** User-uploaded textures (descriptors only; binaries in IndexedDB). */
  customTextures: CustomTexture[];
  /** User-authored reusable PBR materials (pure descriptors; see {@link CustomMaterial}). */
  customMaterials: CustomMaterial[];
  /** User-created primitive meshes / custom SubPart templates. */
  customMeshes: CustomMesh[];
  /** User-authored keyframe animations (KeyframeAnimationModule + Animations/*.glb). */
  animations: PartAnimation[];
  /** User-authored reactions (custom propellants), exported as <FixedReaction>. */
  customReactions: CustomReaction[];
}

export function createEmptyPart(): EditingPart {
  return {
    partId: DEFAULT_PART_ID,
    editorTags: [],
    gameData: createEmptyGameData(),
    subPartGameData: [],
    internalFlags: {},
    layers: [createDefaultLayer(), createIvaSeatLayer(), createLightLayer(), createKittenLayer()],
    placements: [],
    connectors: [],
    colliders: [],
    ivaSeats: [],
    lights: [],
    kittens: [],
    customTextures: [],
    customMaterials: [],
    customMeshes: [],
    animations: [],
    customReactions: [],
  };
}
