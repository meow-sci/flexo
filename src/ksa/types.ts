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
  /**
   * Ids of sibling connectors, serialized as nested `<Sibling Id/>` children of the
   * geometry `<Connector>`. KSA 2026.7 added this to group the attach nodes of
   * multi-mount prefabs (engine plates, interstage bridges) — the geometry twin of
   * `<PartGameData>`'s `<Aligned>`. flexo doesn't edit these, but preserves them
   * verbatim so importing then re-exporting a prefab keeps its node grouping.
   */
  siblingIds: string[]
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

/**
 * Placeholder Part id every new/empty project starts with — a deliberately ugly
 * sentinel so an unset id is obvious in the inspector and the exported XML. Project
 * import treats a partId still equal to this as "unset" and adopts the imported one.
 */
export const DEFAULT_PART_ID = 'fixme_part_id'

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
  id: string
  /** `<EditorTagDef NotaCategory>` — `true` ⇒ a functional tag, not a part-picker category. */
  notaCategory: boolean
}

/**
 * KSA's editor-tag registry in the game's authored order (= the order of category
 * buttons in the part picker). Mirrors `CoreEditorTagsGameData.xml` as of build
 * **2026.6.9.4750**. This is a static snapshot, not a live parse: flexo only uses it for
 * freeform-entry autocomplete, so a modder-defined tag simply isn't suggested (it can
 * still be typed). Keep in sync with the game file on a registry change.
 */
export const EDITOR_TAG_DEFS: readonly EditorTagDef[] = [
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
]

/**
 * The editor tags KSA's Core data uses to bucket parts in the in-game part picker.
 * Offered as suggestions in the Part Data dialog (free-form custom values are also
 * allowed — KSA registers any tag string it sees). Derived from {@link EDITOR_TAG_DEFS}
 * in registry order.
 */
export const KNOWN_EDITOR_TAGS: readonly string[] = EDITOR_TAG_DEFS.map((d) => d.id)

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
  /**
   * `<RoleAffinity>` — which consumer kind this tank prefers to feed (KSA
   * 2026.7.5's replacement for the old pre-filled `<CombustionProcess Id/>`).
   * Mirrors `AsmbTankTemplate.RoleAffinity` (`ConsumerRole` [Flags] enum): unless
   * overridden by the player, tanks fill themselves with the most sensible
   * propellant mixture for their affinity. Defaults to `Engine` (the element is
   * omitted at the default); Core's RCS spheres declare `Thruster`.
   */
  roleAffinity: TankRoleAffinity
}

/**
 * KSA `ConsumerRole` [Flags] enum as its XmlSerializer text form (flags are
 * space-separated). `Engine` is the schema default.
 */
export type TankRoleAffinity = 'None' | 'Engine' | 'Thruster' | 'Engine Thruster'

/**
 * Battery storage (multiple allowed). Serialized as <Battery><MaximumCapacity J/>.
 * Capacity is held in watt-hours (Wh) — KSA's EnergyReference stores Joules, and
 * 1 Wh = 3600 J, so the serializer multiplies by 3600 on the way out and the
 * parser divides by 3600 on the way in. Wh keeps the editable numbers human-sized
 * (a 500 J cell is 0.139 Wh, which the game itself renders as "0.14 Wh").
 */
export interface Battery {
  capacityWh: number
}

/**
 * Power generator with constant output (multiple allowed). Serialized as
 * <Generator><Produced W/>. Distinct from {@link SolarPanel} in KSA: a
 * generator produces continuously, regardless of orientation or sun exposure.
 */
export interface Generator {
  outputWatts: number
}

/**
 * Solar panel (multiple allowed). Serialized as <SolarPanel><Produced W/><Transform/>.
 * Unlike a {@link Generator}, its output is sun-dependent and it carries an
 * orientation {@link Transform} (the panel's sun-facing normal), which we round-trip
 * so imported built-in panels keep facing the right way.
 */
export interface SolarPanel {
  outputWatts: number
  transform: Transform
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
  consumedWatts: number
  /** `LightSwitch` — makes this consumer a flight-toggleable light switch. */
  lightSwitch: boolean
  /** `LightIsActive` — initial on state when {@link lightSwitch} is set. */
  lightIsActive: boolean
}

/**
 * Light type. Mirrors KSA's `LightModule.TemplateData.LightType` (the only two
 * values the engine's `ELightType` recognizes): an omnidirectional `Point` or a
 * cone `Spot`. A Spot is aimed by its {@link Light.transform} rotation and adds
 * the inner/outer cone angles.
 */
export type LightType = 'Spot' | 'Point'

/**
 * A light attached to a SubPart (multiple allowed). Mirrors KSA's
 * `LightModule.TemplateData` (`<Light>` under `<SubPartGameData>`) field-for-field:
 *  - `Type` → {@link type}
 *  - `Transform` → {@link transform} (Position places the light; Rotation aims a
 *    Spot's cone along its local +X. KSA ignores Scale for lights, so we never
 *    emit it.)
 *  - `Range`/`Intensity` → {@link rangeM}/{@link intensity}
 *  - `Color` (R/G/B floats 0–1, no alpha) → {@link color}
 *  - `InnerAngle`/`OuterAngle` (radians; Spot only) → {@link innerAngleRad}/{@link outerAngleRad}
 *  - `RayTracing` (bool; only affects IVA ray tracing) → {@link rayTracing}
 */
export interface Light {
  type: LightType
  /** Local position (m) + aim rotation (Euler XYZ radians). Scale is unused by KSA lights. */
  transform: Transform
  /** Falloff distance in meters (<Range Value/>). */
  rangeM: number
  /** Brightness multiplier (<Intensity Value/>). */
  intensity: number
  /** RGB color, each channel 0–1 (<Color R G B/>; KSA lights carry no alpha). */
  color: { r: number; g: number; b: number }
  /** Spot inner-cone half-angle in radians (<InnerAngle Value/>). Spot only. */
  innerAngleRad: number
  /** Spot outer-cone half-angle in radians (<OuterAngle Value/>). Spot only; KSA clamps to ~90°. */
  outerAngleRad: number
  /** Ray-traced light (<RayTracing>true</RayTracing>); only meaningful for IVA ray tracing. */
  rayTracing: boolean
}

/** Decoupler bound to a connector. Serialized as <Decoupler ConnectorId Force/>. */
export interface Decoupler {
  connectorId: string
  /** Separation force in newtons. */
  force: number
}

/**
 * Docking port bound to a connector. Serialized as child elements:
 * <DockingPort><ConnectorId Value/><LatchingKineticEnergy J/><PushoffImpulse Ns/></DockingPort>.
 */
export interface DockingPort {
  connectorId: string
  /** Magnetic latching kinetic-energy budget in joules (<LatchingKineticEnergy J/>; KSA default 50). */
  latchingKineticEnergyJ: number
  /** Undock push-off impulse in newton-seconds (<PushoffImpulse Ns/>; KSA default 5000). */
  pushoffImpulseNs: number
}

/** EVA hatch bound to a connector. Serialized as <EVADoor ConnectorId/>. */
export interface EvaDoor {
  connectorId: string
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
export const DEFAULT_REACTION_ID = 'Hydrolox'
/** The O/F mixture ratio Core's Hydrolox engines run (also Hydrolox's `<DefaultMixtureRatio>`). */
export const DEFAULT_MIXTURE_RATIO = 5.5

/** KSA `ReactionCategory` (the `Category` attribute on every reaction element). */
export type ReactionCategory =
  | 'Bipropellant'
  | 'Hypergolic'
  | 'Monopropellant'
  | 'Solid'
  | 'Thermal'

/** One entry of the static Core-reaction snapshot ({@link KNOWN_REACTIONS}). */
export interface KnownReaction {
  id: string
  name: string
  kind: 'Fixed' | 'Mixture'
  category: ReactionCategory
  /** `<DefaultMixtureRatio>` (mixtures only). */
  defaultMixtureRatio?: number
  /** The mixture LUT's O/F row range — KSA clamps a combustor's ratio into it. */
  ratioMin?: number
  ratioMax?: number
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
]

/** The 7 `<VolumetricExhaust>` plume templates shipped in Core (referenced by id; auto-scale to the nozzle). */
export const VOLUMETRIC_EXHAUST_IDS: readonly string[] = [
  'EngineALarge',
  'EngineAMed',
  'EngineACompact',
  'EngineAVernier',
  'EngineATurbine',
  'RCS',
  'MmuRcsVac',
]

/** KSA's default engine sound behavior id (the `<SoundEvent SoundId>` Core engines use). */
export const DEFAULT_ENGINE_SOUND_ID = 'DefaultEngineSoundBehavior'

/** What a `<SoundEvent>` does when the nozzle activates. Mirrors KSA's RocketSoundAction. */
export type RocketSoundAction = 'On' | 'Off' | 'None'

/** A nozzle's engine-audio event. Serialized as <SoundEvent Action SoundId/>. */
export interface RocketSoundEvent {
  action: RocketSoundAction
  /** Sound behavior id, e.g. "DefaultEngineSoundBehavior". */
  soundId: string
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
  id: string
  /** Placement instanceId the module lives on; null/'' ⇒ the root part. */
  subPartInstanceId: string | null
}

/**
 * A combustion chamber. Serialized as <Combustor>. References a Reaction by
 * {@link reactionId}; the propellant chemistry + gas LUT come from that reaction.
 * Defaults mirror CombustorTemplate.cs.
 */
export interface Combustor {
  /** `<Combustor Id>`, targeted by a Rocket's `<Core Id>`, e.g. "ThrustChamber". */
  id: string
  /** `<Reaction Id>` — a Reaction id, e.g. "Hydrolox" / "MMH_NTO" / a custom FixedReaction. */
  reactionId: string
  /**
   * `<MixtureRatio>` child of `<Reaction>` — the O/F mass ratio fed to the chamber.
   * REQUIRED by KSA when the reaction is a MixtureReaction (load throws without it);
   * meaningless for FixedReactions. null ⇒ omitted. KSA clamps it into the reaction
   * LUT's row range at resolve time (MixtureReaction.AtMixtureRatio).
   */
  mixtureRatio: number | null
  /** `<MaxPressure>` chamber pressure at full throttle. Stored SI (Pa); emitted as Bar. Default 5e6. */
  maxPressurePa: number
  /** `<ThermalEfficiency Value>` (0–1). Default 1. */
  thermalEfficiency: number
  /** `<MinimumThrottle Value>` (clamped [0.01,1]). Default 1 ⇒ non-throttleable (on/off). */
  minimumThrottle: number
  /** `<MinimumPulseTime Seconds>` minimum firing duration; null ⇒ omit (KSA default 0.001 s). */
  minimumPulseTimeS: number | null
}

/**
 * A De Laval nozzle. Serialized as <DeLavalNozzle>. Produces thrust and owns the
 * exhaust geometry + plume/light/sound FX. Defaults mirror DeLavalNozzleTemplate.cs /
 * RocketNozzleTemplate.cs. NOTE: {@link areaRatio} is effectively required — KSA's
 * default is NaN (a broken engine) — so flexo defaults it to a usable value and validates.
 */
export interface DeLavalNozzle {
  /** `<DeLavalNozzle Id>`, targeted by a Rocket's `<Nozzle Id>`, e.g. "Nozzle". */
  id: string
  /** `<ExitDiameter>` exit-plane diameter (m). Emitted as M, or Cm under 1 m. Default 1. */
  exitDiameterM: number
  /** `<FxExitDiameter>` visual plume width (m); null ⇒ uses {@link exitDiameterM}. VISUAL ONLY. */
  fxExitDiameterM: number | null
  /** `<AreaRatio Value>` exit/throat area ratio. Required (finite, > 0). */
  areaRatio: number
  /** `<FlowEfficiency Value>` (0–1) inlet pressure drop; primarily cuts thrust. Default 1. */
  flowEfficiency: number
  /** `<ExpansionEfficiency Value>` (0–1) stagnation drop; primarily cuts Isp. Default 1. */
  expansionEfficiency: number
  /** `<ExhaustLocation X Y Z>` thrust application point (assembly frame). Default (0,0,0). */
  exhaustLocation: Vec3
  /** `<ExhaustDirection X Y Z>` direction exhaust leaves (thrust acts along −this). Default (−1,0,0). */
  exhaustDirection: Vec3
  /** `<FxExhaustLocation>` plume origin; null ⇒ uses {@link exhaustLocation}. */
  fxExhaustLocation: Vec3 | null
  /** `<FxExhaustDirection>` plume axis; null ⇒ uses {@link exhaustDirection}. */
  fxExhaustDirection: Vec3 | null
  /** `<VolumetricExhaust Id>` plume template id (one of {@link VOLUMETRIC_EXHAUST_IDS}); null ⇒ none. */
  volumetricExhaustId: string | null
  /** `<ExhaustLight Value>` dynamic exhaust point light. Default true. */
  exhaustLight: boolean
  /** `<SoundEvent>` engine audio, or null. */
  sound: RocketSoundEvent | null
}

/**
 * A `<Rocket>`: binds one combustor ({@link core}) and one-or-more nozzles into a
 * single firing unit. A controller drives one-or-more rockets. Mirrors RocketTemplate.cs.
 */
export interface Rocket {
  /** `<Rocket Id>`, targeted by a controller's `<RocketReference Id>`, e.g. "Engine". */
  id: string
  /** `<Core Id [SubPartId]>` — the combustor. */
  core: SubPartIdRef
  /** `<Nozzle Id [SubPartId]>` (≥1 needed for thrust), repeatable. */
  nozzles: SubPartIdRef[]
}

/** Main engine (throttle + staging) vs RCS thruster (pulsed, control-mapped). */
export type RocketControllerKind = 'engine' | 'thruster'

/**
 * Groups one-or-more {@link Rocket}s under a single command source. Serialized as
 * `<RocketEngineController>` (main) or `<RocketThrusterController>` (RCS). Lives on the
 * PartGameData and is what makes a Part a functioning engine. Mirrors RocketControllerTemplate.cs.
 */
export interface RocketController {
  /** `<… Id>` controller / engine display id, e.g. "LR91-AJ-3". */
  id: string
  kind: RocketControllerKind
  /** `<RocketReference Id [SubPartId]>` — the rockets this controller drives. */
  rocketRefs: SubPartIdRef[]
  /** Thruster only: `<ControlMap CSV>` 6-DOF axis flags; null ⇒ auto-computed from geometry. */
  controlMapFlags: string[] | null
}

/**
 * A thrust-vectoring gimbal overlaid on a placed SubPart instance. Serialized as
 * `<SubPart Id="instanceId"><Gimbal>…</Gimbal></SubPart>` on the PartGameData. It
 * vectors all nozzles on that SubPart. A 0/0 gimbal is a silent no-op (fixed). Mirrors
 * GimbalReference.cs.
 */
export interface Gimbal {
  /** Placement instanceId this gimbal sits on (the `<SubPart Id>` wrapper). */
  subPartInstanceId: string
  /** `<MaxAngleY Degrees>` max deflection about local Y. 0 ⇒ no Y actuation. */
  maxAngleYDeg: number
  /** `<MaxAngleZ Degrees>` max deflection about local Z. 0 ⇒ no Z actuation. */
  maxAngleZDeg: number
  /** `<ConstrainToCircle Value>` clamp combined Y/Z to a circle vs a square. Default true. */
  constrainToCircle: boolean
}

/**
 * A captured XML subtree flexo does NOT model, preserved verbatim so importing a
 * built-in Part and re-exporting never silently drops game data flexo has no field for
 * (e.g. `<Collider>`, the `SolidSphereMass`/`SolidCylinderMass`… mass family, `<IVASeat>`,
 * `<SubstanceStorageVolume>`). Stored as plain JSON (no live DOM handle) so it round-trips
 * through the project codec and localStorage. Built by the parser's `captureUnknownChildren`
 * and re-emitted by the serializer's `buildRawNode`. This is the cure for flexo's
 * "model-faithful re-emitter drops everything it doesn't model" round-trip invariant.
 */
export interface RawXmlNode {
  /** Element tag name, e.g. "Collider". */
  tag: string
  /** Attributes as a name→value map, in source order. */
  attrs: Record<string, string>
  /** Child elements (recursive). Empty for a leaf element. */
  children: RawXmlNode[]
  /** Trimmed text content — present only for a childless leaf that carries text. */
  text?: string
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
  /**
   * Part diameter in meters, serialized as <Diameter M/>. KSA's VAB part-picker
   * size-class filter (the `DiameterFilterlist` editor tags) — no physics effect.
   * null ⇒ no <Diameter> element (the part isn't size-filtered).
   */
  diameterM: number | null
  /**
   * Additional `<Diameter M/>` size classes beyond {@link diameterM}. KSA 2026.7
   * made `<Diameter>` repeatable so adapter prefabs (interstage bridges, engine
   * plates) list every size they bridge (e.g. a 3 m↔2 m adapter emits both). flexo
   * edits only the first ({@link diameterM}); the rest are preserved verbatim so a
   * round-tripped adapter keeps appearing under all its size-class filters. Empty
   * for the common single-diameter case.
   */
  extraDiametersM: number[]
  /**
   * Command-capability marker, serialized as a bare <Control/>. When true the part
   * can pilot a vehicle (KSA `Vehicle.IsControllable`). KSA's ControlTemplate is an
   * empty marker with no fields, so this is a plain on/off flag.
   */
  controllable: boolean
  batteries: Battery[]
  generators: Generator[]
  solarPanels: SolarPanel[]
  /**
   * The part's single power consumer / light switch, or null. KSA has exactly one
   * `Part.LightSwitch` slot, so flexo models at most one consumer per part — see
   * {@link PowerConsumer} and `analysis/HOW_LIGHT_PARTS_WORK.md`.
   */
  powerConsumer: PowerConsumer | null
  decoupler: Decoupler | null
  dockingPort: DockingPort | null
  evaDoor: EvaDoor | null
  /** Engine controllers (what makes a Part fire). Reference rockets by id + SubPart instance. */
  rocketControllers: RocketController[]
  /** Part-level rockets (e.g. a gas-generator stitching a root combustor to a SubPart nozzle). */
  rockets: Rocket[]
  /** Part-level combustors (e.g. a gas-generator chamber on the root part). */
  combustors: Combustor[]
  /** Part-level nozzles (uncommon — nozzles usually live on a SubPart). */
  nozzles: DeLavalNozzle[]
  /** Per-instance gimbal overlays (thrust-vectoring), keyed by placement instanceId. */
  gimbals: Gimbal[]
  /** Unmodeled `<PartGameData>` attributes (anything but `Id`/`DisplayName`), preserved verbatim. */
  unknownAttrs: Record<string, string>
  /** Unmodeled `<PartGameData>` child elements, preserved verbatim (see {@link RawXmlNode}). */
  unknownChildren: RawXmlNode[]
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
  subPartTemplateId: string
  tanks: Tank[]
  solarPanels: SolarPanel[]
  lights: Light[]
  /** Reusable thrust-chamber combustors that travel with this mesh. */
  combustors: Combustor[]
  /** Reusable nozzles that travel with this mesh. */
  nozzles: DeLavalNozzle[]
  /** Reusable `<Rocket>` bindings (core + nozzles) that travel with this mesh. */
  rockets: Rocket[]
  /** Unmodeled `<SubPartGameData>` attributes (anything but `Id` — e.g. Core's `DisplayName`), preserved verbatim. */
  unknownAttrs: Record<string, string>
  /** Unmodeled `<SubPartGameData>` child elements, preserved verbatim (see {@link RawXmlNode}). */
  unknownChildren: RawXmlNode[]
}

/** True when a SubPart's data is empty and the entry can be pruned. */
export function isSubPartGameDataEmpty(spd: SubPartGameData): boolean {
  return (
    spd.tanks.length === 0 &&
    spd.solarPanels.length === 0 &&
    spd.lights.length === 0 &&
    spd.combustors.length === 0 &&
    spd.nozzles.length === 0 &&
    spd.rockets.length === 0 &&
    spd.unknownChildren.length === 0 &&
    Object.keys(spd.unknownAttrs).length === 0
  )
}

/** Default tank: 2 m cylinder, 0.5 m radius, 2 mm aluminium wall (matches TankState). */
export function createTank(): Tank {
  return {
    shape: 'Cylindrical',
    wallMaterialId: 'Aluminum.2014(s)',
    lengthM: 2.0,
    outerRadiusM: 0.5,
    wallThicknessMm: 2.0,
    roleAffinity: 'Engine',
  }
}

/** Default solar panel: 50 W, facing its local axis (identity orientation). */
export function createSolarPanel(): SolarPanel {
  return { outputWatts: 50, transform: identityTransform() }
}

/**
 * Default power consumer: a 60 W light switch (matches KSA's `LightSmallA` draw),
 * off at start. Light parts are the dominant use, so we default {@link PowerConsumer.lightSwitch}
 * on; clear it for a plain always-on draw.
 */
export function createPowerConsumer(): PowerConsumer {
  return { consumedWatts: 60, lightSwitch: true, lightIsActive: false }
}

/**
 * Default light: a white Spot matching KSA's canonical CoreElectricalA spotlight
 * (range 5 m, intensity 10, 22.5°/45° inner/outer half-cone). Aimed along local +X
 * (identity rotation); the user repositions/re-aims it from the SubPart Data dialog.
 */
export function createLight(): Light {
  return {
    type: 'Spot',
    transform: identityTransform(),
    rangeM: 5,
    intensity: 10,
    color: { r: 1, g: 1, b: 1 },
    innerAngleRad: Math.PI / 8,
    outerAngleRad: Math.PI / 4,
    rayTracing: false,
  }
}

/** An empty GameData block (no display name, default mass, no sub-items). */
export function createEmptyGameData(): PartGameData {
  return {
    displayName: '',
    customMass: null,
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
    gimbals: [],
    unknownAttrs: {},
    unknownChildren: [],
  }
}

/** A fresh, empty per-SubPart-template GameData entry. */
export function createSubPartGameData(subPartTemplateId: string): SubPartGameData {
  return {
    subPartTemplateId,
    tanks: [],
    solarPanels: [],
    lights: [],
    combustors: [],
    nozzles: [],
    rockets: [],
    unknownAttrs: {},
    unknownChildren: [],
  }
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
  }
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
    volumetricExhaustId: null,
    exhaustLight: true,
    sound: null,
  }
}

/** A `<Rocket>` binding one core to N nozzles (defaults to the given core/nozzle ids on the same SubPart). */
export function createRocket(id: string, coreId = '', nozzleIds: string[] = []): Rocket {
  return {
    id,
    core: { id: coreId, subPartInstanceId: null },
    nozzles: nozzleIds.map((nid) => ({ id: nid, subPartInstanceId: null })),
  }
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
  }
}

/** A fixed (0/0) gimbal on a placement; raise the max angles to make it actuate. */
export function createGimbal(subPartInstanceId: string): Gimbal {
  return { subPartInstanceId, maxAngleYDeg: 0, maxAngleZDeg: 0, constrainToCircle: true }
}

/** One reactant in a custom reaction: a substance-phase id + its mixture mass share. */
export interface ReactionReactantSpec {
  /** Substance phase id, e.g. "H2(l)" / "O2(l)". */
  phaseId: string
  /** `<Reactant MassShare>` — the mixture-ratio numerator (normalized to fractions at load). */
  massShare: number
}

/**
 * One row of a custom reaction's pressure-indexed gas table, in authored units
 * (the raw `<PressureCondition>` form). The physics derives R from {@link molarMassGPerMol}
 * and indexes rows by {@link lnPressure}; see src/ksa/enginePhysics.ts.
 */
export interface ReactionLutRowSpec {
  /** ln(chamber pressure / Pa). */
  lnPressure: number
  /** Flame temperature (K). */
  temperatureK: number
  /** Ratio of specific heats γ. */
  gamma: number
  /** Mean molar mass of the combustion products (g/mol). */
  molarMassGPerMol: number
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
  id: string
  /** Display name (`<Name Value>`), falling back to {@link id}. */
  name: string
  /** `Category` attribute (grouping; KSA's FixedReaction fallback is Monopropellant). */
  category: ReactionCategory
  /** Reactant mixture (≥1). */
  reactants: ReactionReactantSpec[]
  /** Pressure-indexed gas LUT (≥1 `<PressureCondition>` row). */
  lut: ReactionLutRowSpec[]
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
  | 'emissiveMask' // grayscale glow mask → <Emissive>

/**
 * A user-uploaded texture. Carries a single image authored for one {@link channel};
 * the raw image bytes and the encoded KTX2 live in IndexedDB under {@link id}.
 */
export interface CustomTexture {
  /** Stable unique id (also the IndexedDB key), e.g. "tex_ab12cd". */
  id: string
  /** User-facing label, also the basis for the exported .ktx2 filename. */
  name: string
  /** Base level dimensions of the encoded texture (post-decode/resize). */
  width: number
  height: number
  /** The PBR channel this image is authored for (decides encode params + valid slots). */
  channel: TextureChannel
}

/** An sRGB color, 0..255 per channel. */
export interface RgbColor {
  r: number
  g: number
  b: number
}

/**
 * How a scalar PBR channel (metalness / roughness) of a {@link CustomMaterial} is
 * sourced: a uniform value (exported as a solid texel — KSA's PbrMaterial has NO
 * scalar parameters, everything is a texture) or a grayscale {@link CustomTexture}.
 */
export type ScalarChannel = { kind: 'value'; value: number } | { kind: 'map'; textureId: string }

/** How a {@link CustomMaterial}'s base color is sourced: a picked color or an image. */
export type BaseColorChannel =
  | { kind: 'color'; color: RgbColor }
  | { kind: 'map'; textureId: string }

/**
 * A tangent-space normal map channel. KSA has no usable per-material normal-strength
 * scalar (`<Normal Power>` is parsed but only consumed by the planet renderer), so
 * {@link strength} is baked into the map's RG values at encode time.
 */
export interface NormalChannel {
  textureId: string
  /** Bump strength multiplier, baked into RG at encode. 1 = as authored. */
  strength: number
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
  id: string
  /** User-facing label, also the basis for the exported material id. */
  name: string
  baseColor: BaseColorChannel
  /** 0 = dielectric, 1 = metal. KSA reads it from the ORM blue channel. */
  metalness: ScalarChannel
  /** 0 = mirror-smooth, 1 = fully rough. KSA reads it from the ORM green channel. */
  roughness: ScalarChannel
  /** Ambient occlusion map (ORM red). Absent = fully unoccluded (255). */
  occlusion?: { textureId: string }
  /** Pre-packed AO/Rough/Metal image; when set it overrides the three channels above. */
  ormPacked?: { textureId: string }
  /** Tangent-space normal map. Absent = flat (the shared synthetic FlatNormal). */
  normal?: NormalChannel
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
  }
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
   * The {@link CustomMaterial} for the whole mesh (base color / metal / rough / normal).
   * Absent ⇒ the legacy neutral look (flat gray, NeutralORM on export). A face's
   * {@link FaceTextureConfig.textureId} overrides the material's base color on that face;
   * the scalar/normal channels always come from the material. Never set on kitten
   * submeshes (they carry their own full PBR set in {@link kitten}).
   */
  materialId?: string
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
  /** User-authored reusable PBR materials (pure descriptors; see {@link CustomMaterial}). */
  customMaterials: CustomMaterial[]
  /** User-created primitive meshes / custom SubPart templates. */
  customMeshes: CustomMesh[]
  /** User-authored keyframe animations (KeyframeAnimationModule + Animations/*.glb). */
  animations: PartAnimation[]
  /** User-authored reactions (custom propellants), exported as <FixedReaction>. */
  customReactions: CustomReaction[]
}

export function createEmptyPart(): EditingPart {
  return {
    partId: DEFAULT_PART_ID,
    editorTags: [],
    gameData: createEmptyGameData(),
    subPartGameData: [],
    layers: [createDefaultLayer(), createConnectorLayer(), createKittenLayer()],
    placements: [],
    connectors: [],
    kittens: [],
    customTextures: [],
    customMaterials: [],
    customMeshes: [],
    animations: [],
    customReactions: [],
  }
}
