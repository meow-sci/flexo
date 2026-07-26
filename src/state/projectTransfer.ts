import type {
  Connector,
  CustomMaterial,
  CustomReaction,
  CustomMesh,
  EditingPart,
  IvaSeat,
  KittenInstance,
  KittenMeshSource,
  Layer,
  PartAnimation,
  PartCollider,
  PartGameData,
  Rocket,
  SubPartGameData,
  SubPartIdRef,
  SubPartPlacement,
  Vec3,
} from '../ksa/types'
import {
  COLLIDER_LAYER_ID,
  CONNECTOR_LAYER_ID,
  DEFAULT_LAYER_ID,
  DEFAULT_PART_ID,
  IVA_SEAT_LAYER_ID,
  KITTEN_LAYER_ID,
  createColliderLayer,
  createConnectorLayer,
  createDefaultLayer,
  createIvaSeatLayer,
  createKittenLayer,
  createSubPartGameData,
  meshKind,
} from '../ksa/types'
import { remapRawConnectorRefs } from '../ksa/partXmlParser'
import { remapConsumerFeedWiring, remapConsumerFeeds } from '../ksa/idRemap'
import { randomId } from './ids'
import {
  PROJECT_EXPORT_FORMAT,
  PROJECT_EXPORT_VERSION,
  decodeProject,
  encodeProject,
  isCompactProject,
} from './projectCodec'

export { PROJECT_EXPORT_FORMAT, PROJECT_EXPORT_VERSION }

/**
 * Project Export / Import — a portable, data-only JSON snapshot of a project's
 * workspace (meshes, layers, connectors, kittens, animations, GameData) that can be
 * pasted into ANOTHER project, ADDITIVELY. This module is pure (no store imports) so
 * the id-remapping merge is unit-testable; the store wrapper that mutates `$part`
 * lives in editorStore (`importProjectData`).
 *
 * The hard part is id remapping: imported placements get fresh `instanceId`s and
 * connectors fresh `_connectorN` ids, while animations reference placements by
 * `instanceId` and GameData couplings reference connectors by id — so the merge
 * carries old→new maps and rewrites every reference through them.
 *
 * Custom assets that carry binaries (uploaded textures, primitive meshes, imported glTF
 * models) are NOT exported — the UI blocks export when a project has any (see
 * {@link hasCustomAssets}).
 * Part-ified KITTEN meshes ARE carried, though: they're pure descriptors referencing
 * built-in game assets (geometry re-bakes from the kitten gltf on load, textures resolve
 * by Content/Core path), so they round-trip as data with no binary bundling.
 */

/** The in-scope workspace data carried by an export (everything but binary-backed assets). */
export interface ProjectExportData {
  editorTags: string[]
  gameData: PartGameData
  subPartGameData: SubPartGameData[]
  layers: Layer[]
  placements: SubPartPlacement[]
  connectors: Connector[]
  /** The Part's collision volume (analytic primitives; owner-grouped only on XML export). */
  colliders: PartCollider[]
  /**
   * IVA seats. ORDER IS LOAD-BEARING: index 0 is the seat IVA opens on and `C` cycles
   * them in this order, so the wire form preserves the document order exactly.
   */
  ivaSeats: IvaSeat[]
  /** Per-SubPart-template `<Internal>` (interior-only) overrides, keyed by template id. */
  internalFlags: Record<string, boolean>
  kittens: KittenInstance[]
  animations: PartAnimation[]
  /** Part-ified kitten meshes only (descriptors referencing game assets — no binaries). */
  customMeshes: CustomMesh[]
  /**
   * User-authored materials. Always carried: with the {@link hasCustomAssets} gate in
   * place, any exportable project's materials are uniform-value-only (a 'map' channel
   * requires an uploaded texture, which gates the export).
   */
  customMaterials: CustomMaterial[]
  /** User-authored reactions (custom propellants — pure data). */
  customReactions: CustomReaction[]
}

/**
 * A versioned export envelope. `sourcePartId` carries the source's Part Id: it's
 * restored verbatim by {@link envelopeToPart} (share-link load) and adopted by
 * {@link mergeProjectImport} only when the destination has no Part Id of its own.
 */
export interface ProjectExportEnvelope {
  format: typeof PROJECT_EXPORT_FORMAT
  version: number
  exportedAt: number
  projectName: string
  sourcePartId: string
  data: ProjectExportData
}

/** Counts surfaced after an additive import (for the success toast). */
export interface ImportSummary {
  meshes: number
  connectors: number
  colliders: number
  ivaSeats: number
  kittens: number
  newLayers: number
  animations: number
}

export interface MergeResult {
  part: EditingPart
  summary: ImportSummary
  newLayerIds: string[]
}

export type ParseResult = { ok: true; env: ProjectExportEnvelope } | { ok: false; error: string }

/**
 * True for the ONE mesh kind a data-only payload can carry: a part-ified kitten submesh,
 * which is pure data referencing game assets (geometry re-bakes from the shipped kitten gltf,
 * textures resolve by Content/Core path). A primitive mesh needs its generated GLB and an
 * IMPORTED mesh needs its import batch's GLB — both live in IndexedDB, neither is on the wire.
 */
function isDataOnlyMesh(m: CustomMesh): boolean {
  return meshKind(m) === 'kitten'
}

/**
 * True when the project has custom assets that JSON export can't carry — uploaded textures,
 * primitive meshes, or IMPORTED glTF models (all binary-backed: their bytes live in IndexedDB,
 * never in the payload). Kitten part-meshes DON'T count: they're data-only references to game
 * assets and export fine.
 *
 * This is the gate the Export-Project and Share-Link dialogs disable themselves on, and it is
 * what keeps {@link buildProjectExport}'s kitten-only filter from ever being the only line of
 * defence: an imported mesh descriptor on the wire would decode into a SubPart pointing at an
 * `importId` the receiving browser has no geometry for — an invisible, unfixable placement.
 */
export function hasCustomAssets(part: EditingPart): boolean {
  return part.customTextures.length > 0 || part.customMeshes.some((m) => !isDataOnlyMesh(m))
}

/**
 * Builds a data-only export envelope. Deep-copies the in-scope fields and stamps
 * provenance. Only kitten part-meshes are carried in `customMeshes` (primitive meshes,
 * IMPORTED meshes and `customTextures` are binary-backed and omitted — export is gated off
 * when they exist, see {@link hasCustomAssets}).
 */
export function buildProjectExport(part: EditingPart, projectName: string): ProjectExportEnvelope {
  return {
    format: PROJECT_EXPORT_FORMAT,
    version: PROJECT_EXPORT_VERSION,
    exportedAt: Date.now(),
    projectName,
    sourcePartId: part.partId,
    data: structuredClone({
      editorTags: part.editorTags,
      gameData: part.gameData,
      subPartGameData: part.subPartGameData,
      layers: part.layers,
      placements: part.placements,
      connectors: part.connectors,
      colliders: part.colliders,
      ivaSeats: part.ivaSeats,
      internalFlags: part.internalFlags,
      kittens: part.kittens,
      animations: part.animations,
      customMeshes: part.customMeshes.filter(isDataOnlyMesh),
      customMaterials: part.customMaterials,
      customReactions: part.customReactions,
    }),
  }
}

/** Serializes an export envelope to the minified compact-JSON wire string. */
export function serializeProjectJson(env: ProjectExportEnvelope): string {
  return JSON.stringify(encodeProject(env))
}

/**
 * Parses + validates a compact project JSON string (from the Import dialog or a
 * decompressed share-link payload). Returns a discriminated result with a
 * human-readable error on failure, or the decoded envelope on success.
 */
export function parseProjectImport(text: string): ParseResult {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'Paste exported project JSON to import.' }

  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${(err as Error).message}` }
  }
  return parseProjectObject(raw)
}

/** Validates an already-parsed compact object and decodes it to an envelope. */
export function parseProjectObject(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Expected a JSON object.' }
  }
  if (!isCompactProject(raw)) {
    return {
      ok: false,
      error: `Not a flexo project (format: ${JSON.stringify((raw as { f?: unknown }).f)}).`,
    }
  }
  // Exact-version match only: older payloads carry pre-rename keys that would decode
  // silently wrong (no migration, per the constitution), newer ones are unknown.
  if (typeof raw.v !== 'number' || raw.v !== PROJECT_EXPORT_VERSION) {
    return { ok: false, error: `Unsupported project version: ${JSON.stringify(raw.v)}.` }
  }
  return { ok: true, env: decodeProject(raw) }
}

/**
 * Faithfully reconstructs a standalone {@link EditingPart} from an export envelope —
 * NO id remapping (the payload's ids are already internally consistent). Used by the
 * share-link "load as a new project" path (see projectStore.loadSharedProject); the
 * paste-Import path uses {@link mergeProjectImport} instead, which merges additively.
 * Custom textures / primitive meshes are never carried, so they start empty.
 */
export function envelopeToPart(env: ProjectExportEnvelope): EditingPart {
  const d = env.data
  const part: EditingPart = {
    partId: env.sourcePartId || DEFAULT_PART_ID,
    editorTags: [...d.editorTags],
    gameData: d.gameData,
    subPartGameData: d.subPartGameData,
    layers: [...d.layers],
    placements: d.placements,
    connectors: d.connectors,
    colliders: d.colliders,
    ivaSeats: d.ivaSeats,
    internalFlags: { ...d.internalFlags },
    kittens: d.kittens,
    customTextures: [],
    customMaterials: d.customMaterials,
    customMeshes: d.customMeshes,
    animations: d.animations,
    customReactions: d.customReactions ?? [],
  }
  ensureBuiltInLayers(part)
  return part
}

/** Guarantees the five undeletable built-in layers exist (in case a payload omitted any). */
function ensureBuiltInLayers(part: EditingPart): void {
  const has = (id: string) => part.layers.some((l) => l.id === id)
  if (!has(DEFAULT_LAYER_ID)) part.layers.unshift(createDefaultLayer())
  if (!has(CONNECTOR_LAYER_ID)) part.layers.push(createConnectorLayer())
  if (!has(COLLIDER_LAYER_ID)) part.layers.push(createColliderLayer())
  if (!has(IVA_SEAT_LAYER_ID)) part.layers.push(createIvaSeatLayer())
  if (!has(KITTEN_LAYER_ID)) part.layers.push(createKittenLayer())
}

/**
 * Additively merges an export envelope into `current`, returning a fresh part plus a
 * summary. Imported entities get collision-free ids; every cross-reference (animation
 * members, solar-tracking subparts, GameData couplings, and placements pointing at an
 * imported kitten custom mesh) is rewritten through the new ids. Layer mapping: each
 * source layer that holds meshes — INCLUDING the source's Default — becomes a NEW layer
 * (keeping its name) so imported content never merges into the user's existing Default;
 * connectors reuse the built-in Connectors layer and kittens the Kittens layer.
 */
export function mergeProjectImport(current: EditingPart, env: ProjectExportEnvelope): MergeResult {
  const part = structuredClone(current)
  const { data } = env

  // Part Id: adopt the source's only when the destination still carries the placeholder
  // (i.e. importing into a fresh project) — so an Export→Import round-trip preserves it.
  // A destination that already has a real Part Id keeps it; additive paste never renames.
  if ((!part.partId.trim() || part.partId === DEFAULT_PART_ID) && env.sourcePartId.trim()) {
    part.partId = env.sourcePartId
  }

  const instanceIdMap = new Map<string, string>()
  const connectorIdMap = new Map<string, string>()
  const layerIdMap = new Map<string, string>()
  const subPartIdMap = new Map<string, string>() // imported customMesh subPartId -> fresh id
  const newLayerIds: string[] = []

  // Custom (kitten) meshes — descriptors referencing game assets, no binaries. Give each a
  // fresh id + subPartId so repeated additive imports never collide, and remember the
  // old->new subPartId so placements/SubPartGameData below repoint at the new template.
  // Primitive/imported/textured meshes never reach here (export is gated off when they exist,
  // see hasCustomAssets); a hand-edited payload that smuggles one in is dropped rather than
  // materialized as a SubPart whose geometry this browser doesn't have.
  for (const src of data.customMeshes ?? []) {
    if (!isDataOnlyMesh(src) || !src.kitten) continue
    const subPartId = newKittenSubPartId(src.kitten)
    subPartIdMap.set(src.subPartId, subPartId)
    part.customMeshes.push({
      id: newMeshId(),
      name: src.name,
      subPartId,
      kitten: { ...src.kitten },
      faceTextures: {},
    })
  }
  const mapTemplateId = (id: string): string => subPartIdMap.get(id) ?? id

  const sourceLayerName = new Map<string, string>()
  for (const l of data.layers) sourceLayerName.set(l.id, l.name)

  // Connectors/Kittens reuse their built-in layers; every other source layer (custom
  // OR Default) is mirrored as a fresh layer, lazily, the first time it's referenced.
  const getOrCreateImportLayer = (oldLayerId: string): string => {
    if (oldLayerId === CONNECTOR_LAYER_ID || oldLayerId === KITTEN_LAYER_ID) return oldLayerId
    const existing = layerIdMap.get(oldLayerId)
    if (existing) return existing
    const id = nextLayerId(part)
    part.layers.push({ id, name: sourceLayerName.get(oldLayerId) ?? 'Imported' })
    layerIdMap.set(oldLayerId, id)
    newLayerIds.push(id)
    return id
  }

  // Meshes — regenerate instanceId against the growing list (matches addSubPart/addPart).
  // Template id is repointed when it names an imported (kitten) custom mesh.
  for (const src of data.placements) {
    const templateId = mapTemplateId(src.subPartTemplateId)
    const base = lastSegmentLower(templateId)
    const count = part.placements.filter((p) => p.subPartTemplateId === templateId).length
    const instanceId = `${base}_${count + 1}`
    part.placements.push({
      instanceId,
      subPartTemplateId: templateId,
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      scale: vec(src.scale, 1),
      layerId: getOrCreateImportLayer(src.layerId),
    })
    instanceIdMap.set(src.instanceId, instanceId)
  }

  // Per-template `<Internal>` (interior-only) overrides. The key is a SubPart TEMPLATE id, so
  // it goes through the SAME mapTemplateId the placements above use — an imported kitten mesh
  // gets a fresh subPartId, and a raw key copy would flag a template that no longer exists.
  // Incoming keys win ONLY for templates this paste actually brings in (plans/IVA_PLAN.md
  // §3.7): a payload carrying a flag for a template it never places must not silently re-flag
  // the destination's own copy of it.
  const importedTemplates = new Set(data.placements.map((p) => mapTemplateId(p.subPartTemplateId)))
  for (const [key, internal] of Object.entries(data.internalFlags)) {
    const templateId = mapTemplateId(key)
    if (importedTemplates.has(templateId)) part.internalFlags[templateId] = internal
  }

  // Connectors — always on the built-in Connectors layer, fresh _connectorN ids.
  const connectorStart = part.connectors.length
  for (const src of data.connectors) {
    const id = nextConnectorId(part)
    part.connectors.push({
      id,
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      scale: vec(src.scale, 1),
      flags: [...(src.flags ?? [])],
      capabilities: [...(src.capabilities ?? [])],
      siblingIds: [...(src.siblingIds ?? [])],
      layerId: CONNECTOR_LAYER_ID,
    })
    connectorIdMap.set(src.id, id)
  }
  // Rewire sibling refs to the regenerated ids (drop any pointing outside the pasted set).
  for (let i = connectorStart; i < part.connectors.length; i++) {
    part.connectors[i].siblingIds = part.connectors[i].siblingIds
      .map((s) => connectorIdMap.get(s))
      .filter((s): s is string => s != null)
  }

  // Colliders — always on the built-in Colliders layer, fresh _colliderN ids. Nothing
  // references a collider by id (it is not in the feed-container namespace — only the
  // `<Collider>` COMPONENT id is, and flexo generates that at serialize time), so unlike
  // connectors there is no ref map to thread through. `ownerTemplateId` IS a reference
  // though: it names a SubPart TEMPLATE, and an imported kitten mesh gets a fresh
  // template id, so route it through the same map the placements use.
  for (const src of data.colliders ?? []) {
    part.colliders.push({
      id: nextColliderId(part),
      shape: src.shape,
      ownerTemplateId: src.ownerTemplateId ? mapTemplateId(src.ownerTemplateId) : null,
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      scale: vec(src.scale, 1),
      layerId: COLLIDER_LAYER_ID,
    })
  }

  // IVA seats — always on the built-in IVA Seats layer, fresh _seatN ids. Nothing
  // references a seat by id (the id is editor-only and never emitted to XML), so there is
  // no ref map to thread through. Order matters, though: the incoming seats keep their
  // relative document order and are APPENDED after the existing ones, so the destination's
  // seat 0 — the one IVA opens on — stays the default.
  for (const src of data.ivaSeats) {
    part.ivaSeats.push({
      id: nextIvaSeatId(part),
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      scale: vec(src.scale, 1),
      layerId: IVA_SEAT_LAYER_ID,
    })
  }

  // Kittens — always on the built-in Kittens layer, fresh kitten_N ids.
  for (const src of data.kittens) {
    part.kittens.push({
      id: nextKittenId(part),
      kind: src.kind,
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      scale: vec(src.scale, 1),
      layerId: KITTEN_LAYER_ID,
    })
  }

  for (const tag of data.editorTags) {
    if (!part.editorTags.includes(tag)) part.editorTags.push(tag)
  }

  mergeGameData(part.gameData, data.gameData, connectorIdMap, instanceIdMap)

  // Per-SubPart tanks / solar panels / engine modules: append to an existing template
  // entry, else add the entry. Repoint the template id if it names an imported custom
  // mesh; remap any rocket SubPart-instance refs onto the freshly-generated ids.
  for (const sg of data.subPartGameData) {
    const templateId = mapTemplateId(sg.subPartTemplateId)
    const tanks = (sg.tanks ?? []).map((t) => ({ ...t }))
    const solarPanels = (sg.solarPanels ?? []).map((sp) => structuredClone(sp))
    const lights = (sg.lights ?? []).map((l) => structuredClone(l))
    // A consumer's feed points name connectors/placements in the SOURCE id space.
    const combustors = (sg.combustors ?? []).map((c) =>
      remapConsumerFeeds(structuredClone(c), connectorIdMap, instanceIdMap),
    )
    const nozzles = (sg.nozzles ?? []).map((n) => structuredClone(n))
    const rockets = (sg.rockets ?? []).map((r) => remapRocket(r, instanceIdMap))
    const solidMotors = (sg.solidMotors ?? []).map((m) =>
      remapConsumerFeeds(structuredClone(m), connectorIdMap, instanceIdMap),
    )
    const solidNozzles = (sg.solidNozzles ?? []).map((n) => structuredClone(n))
    const solidGrainSegments = (sg.solidGrainSegments ?? []).map((s) => structuredClone(s))
    const existing = part.subPartGameData.find((x) => x.subPartTemplateId === templateId)
    if (existing) {
      existing.tanks.push(...tanks)
      existing.solarPanels.push(...solarPanels)
      existing.lights.push(...lights)
      existing.combustors.push(...combustors)
      existing.nozzles.push(...nozzles)
      existing.rockets.push(...rockets)
      existing.solidMotors.push(...solidMotors)
      existing.solidNozzles.push(...solidNozzles)
      existing.solidGrainSegments.push(...solidGrainSegments)
    } else {
      const entry = createSubPartGameData(templateId)
      entry.tanks = tanks
      entry.solarPanels = solarPanels
      entry.lights = lights
      entry.combustors = combustors
      entry.nozzles = nozzles
      entry.rockets = rockets
      entry.solidMotors = solidMotors
      entry.solidNozzles = solidNozzles
      entry.solidGrainSegments = solidGrainSegments
      part.subPartGameData.push(entry)
    }
  }

  // Animations: fresh id (so re-pasting the same export can't collide), members +
  // solar-tracking refs remapped to the new instanceIds (danglers dropped).
  for (const srcAnim of data.animations) {
    const anim = structuredClone(srcAnim)
    anim.id = newAnimId()
    for (const joint of anim.joints) {
      joint.memberInstanceIds = remapIds(joint.memberInstanceIds, instanceIdMap)
    }
    if (anim.solarTracking) {
      const driven = instanceIdMap.get(anim.solarTracking.subPartInstanceId)
      if (!driven) {
        anim.solarTracking = null
      } else {
        anim.solarTracking.subPartInstanceId = driven
        anim.solarTracking.excludeInstanceIds = remapIds(
          anim.solarTracking.excludeInstanceIds,
          instanceIdMap,
        )
      }
    }
    part.animations.push(anim)
  }

  // Custom materials are pure descriptors (uniform-only in any exportable project — see
  // ProjectExportData.customMaterials): add those not already present by id, so pasting
  // the same export twice never duplicates the library.
  for (const cm of data.customMaterials ?? []) {
    if (!part.customMaterials.some((m) => m.id === cm.id)) {
      part.customMaterials.push(structuredClone(cm))
    }
  }

  // Custom propellants are pure data with no instance refs: add those the project
  // doesn't already have (by id), so a combustor referencing one keeps resolving.
  for (const cp of data.customReactions ?? []) {
    if (!part.customReactions.some((p) => p.id === cp.id)) {
      part.customReactions.push(structuredClone(cp))
    }
  }

  return {
    part,
    summary: {
      meshes: data.placements.length,
      connectors: data.connectors.length,
      colliders: data.colliders?.length ?? 0,
      ivaSeats: data.ivaSeats.length,
      kittens: data.kittens.length,
      newLayers: newLayerIds.length,
      animations: data.animations.length,
    },
    newLayerIds,
  }
}

function mergeGameData(
  target: PartGameData,
  src: PartGameData,
  connectorIdMap: Map<string, string>,
  instanceIdMap: Map<string, string>,
): void {
  if (!target.displayName.trim() && src.displayName?.trim()) target.displayName = src.displayName
  if (target.customMass == null && src.customMass != null) {
    target.customMass = src.customMass
    target.customMassExtras = structuredClone(src.customMassExtras ?? [])
  }
  if (target.diameterM == null && src.diameterM != null) target.diameterM = src.diameterM
  if (!target.controllable && src.controllable) target.controllable = true
  // Unmodeled passthrough XML: fill only when the target has none (first part's leftover wins).
  // Connector refs inside the raw XML (<Aligned>/<SymmetryGroup> <ConnectorRef>s) are in the
  // source's original id space — rewrite them onto the regenerated connector ids.
  if (
    Object.keys(target.unknownAttrs).length === 0 &&
    Object.keys(src.unknownAttrs ?? {}).length > 0
  )
    target.unknownAttrs = { ...src.unknownAttrs }
  if (target.unknownChildren.length === 0 && (src.unknownChildren ?? []).length > 0)
    target.unknownChildren = remapRawConnectorRefs(src.unknownChildren, connectorIdMap)
  target.batteries.push(...(src.batteries ?? []).map((b) => ({ ...b })))
  target.generators.push(...(src.generators ?? []).map((g) => ({ ...g })))
  target.solarPanels.push(...(src.solarPanels ?? []).map((sp) => structuredClone(sp)))
  // Single consumer per part: keep the target's, adopt the source's only when empty.
  if (!target.powerConsumer && src.powerConsumer) target.powerConsumer = { ...src.powerConsumer }
  if (target.decoupler == null && src.decoupler) {
    const id = connectorIdMap.get(src.decoupler.connectorId)
    if (id) target.decoupler = { connectorId: id, force: src.decoupler.force }
  }
  if (target.dockingPort == null && src.dockingPort) {
    const id = connectorIdMap.get(src.dockingPort.connectorId)
    if (id)
      target.dockingPort = {
        connectorId: id,
        latchingKineticEnergyJ: src.dockingPort.latchingKineticEnergyJ,
        pushoffImpulseNs: src.dockingPort.pushoffImpulseNs,
      }
  }
  if (target.evaDoor == null && src.evaDoor) {
    const id = connectorIdMap.get(src.evaDoor.connectorId)
    if (id) target.evaDoor = { connectorId: id }
  }
  // Engine modules: append with every SubPart-instance reference remapped to the
  // freshly-generated instance ids (mirrors applyImportedGameData in editorStore).
  target.rocketControllers.push(
    ...(src.rocketControllers ?? []).map((c) => ({
      ...c,
      rocketRefs: c.rocketRefs.map((r) => remapRef(r, instanceIdMap)),
    })),
  )
  target.rockets.push(...(src.rockets ?? []).map((r) => remapRocket(r, instanceIdMap)))
  target.combustors.push(
    ...(src.combustors ?? []).map((c) =>
      remapConsumerFeeds(structuredClone(c), connectorIdMap, instanceIdMap),
    ),
  )
  target.nozzles.push(...(src.nozzles ?? []).map((n) => structuredClone(n)))
  target.gimbals.push(
    ...(src.gimbals ?? []).map((g) => ({
      ...g,
      subPartInstanceId: instanceIdMap.get(g.subPartInstanceId) ?? g.subPartInstanceId,
    })),
  )
  // Plumbing topology (KSA 2026.7.9): tanks are plain containers; solid motors and the
  // wiring entries carry feed points / placement scopes in the SOURCE id space.
  target.tanks.push(...(src.tanks ?? []).map((t) => structuredClone(t)))
  target.solidMotors.push(
    ...(src.solidMotors ?? []).map((m) =>
      remapConsumerFeeds(structuredClone(m), connectorIdMap, instanceIdMap),
    ),
  )
  target.solidNozzles.push(...(src.solidNozzles ?? []).map((n) => structuredClone(n)))
  target.solidGrainSegments.push(...(src.solidGrainSegments ?? []).map((s) => structuredClone(s)))
  target.consumerFeedWiring.push(
    ...(src.consumerFeedWiring ?? []).map((w) =>
      remapConsumerFeedWiring(structuredClone(w), connectorIdMap, instanceIdMap),
    ),
  )
}

/** Remaps a module→SubPart-instance ref through the import id map (null ⇒ root, unchanged). */
function remapRef(ref: SubPartIdRef, map: Map<string, string>): SubPartIdRef {
  if (!ref.subPartInstanceId) return { id: ref.id, subPartInstanceId: ref.subPartInstanceId }
  return { id: ref.id, subPartInstanceId: map.get(ref.subPartInstanceId) ?? ref.subPartInstanceId }
}

/** Remaps a rocket's core + nozzle SubPart-instance refs through the import id map. */
function remapRocket(rocket: Rocket, map: Map<string, string>): Rocket {
  return {
    id: rocket.id,
    core: remapRef(rocket.core, map),
    nozzles: rocket.nozzles.map((n) => remapRef(n, map)),
  }
}

function remapIds(ids: string[], map: Map<string, string>): string[] {
  return ids.map((id) => map.get(id)).filter((id): id is string => id != null)
}

// ── local id allocators (pure copies of the editorStore versions; kept here to
//    avoid a circular import on the store) ────────────────────────────────────

function vec(v: Partial<Vec3> | undefined, def: number): Vec3 {
  return { x: v?.x ?? def, y: v?.y ?? def, z: v?.z ?? def }
}

function lastSegmentLower(templateId: string): string {
  const seg = templateId.split('.').pop() ?? templateId
  return seg.toLowerCase()
}

function nextLayerId(part: EditingPart): string {
  let max = 0
  for (const l of part.layers) {
    const m = /^layer(\d+)$/.exec(l.id)
    if (m) max = Math.max(max, Number.parseInt(m[1], 10))
  }
  return `layer${max + 1}`
}

function nextConnectorId(part: EditingPart): string {
  let max = 0
  for (const c of part.connectors) {
    const m = /^_connector(\d+)$/.exec(c.id)
    if (m) max = Math.max(max, Number.parseInt(m[1], 10))
  }
  return `_connector${max + 1}`
}

function nextColliderId(part: EditingPart): string {
  let max = 0
  for (const c of part.colliders) {
    const m = /^_collider(\d+)$/.exec(c.id)
    if (m) max = Math.max(max, Number.parseInt(m[1], 10))
  }
  return `_collider${max + 1}`
}

function nextIvaSeatId(part: EditingPart): string {
  let max = 0
  for (const s of part.ivaSeats) {
    const m = /^_seat(\d+)$/.exec(s.id)
    if (m) max = Math.max(max, Number.parseInt(m[1], 10))
  }
  return `_seat${max + 1}`
}

function nextKittenId(part: EditingPart): string {
  let max = 0
  for (const k of part.kittens) {
    const m = /^kitten_(\d+)$/.exec(k.id)
    if (m) max = Math.max(max, Number.parseInt(m[1], 10))
  }
  return `kitten_${max + 1}`
}

/** An 8-char random token (mirrors customAssetStore's shortId). */
function shortHash(): string {
  return randomId().replace(/-/g, '').slice(0, 8)
}

function newAnimId(): string {
  return `anim_${shortHash()}`
}

/** Fresh customMesh descriptor id (IndexedDB key shape; kitten meshes store no binary). */
function newMeshId(): string {
  return `mesh_${shortHash()}`
}

/** Fresh kitten SubPart template id, matching customAssetStore's `flexo_<kind>_<spec>_<rand>`. */
function newKittenSubPartId(kitten: KittenMeshSource): string {
  return `flexo_${kitten.kind}_${kitten.specKey}_${shortHash()}`
}
