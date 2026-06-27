import type {
  Battery,
  Connector,
  CustomMesh,
  DockingPort,
  EditingPart,
  KittenInstance,
  KittenMeshSource,
  Layer,
  PartAnimation,
  PartGameData,
  SubPartGameData,
  SubPartPlacement,
  Vec3,
} from '../ksa/types'
import { CONNECTOR_LAYER_ID, KITTEN_LAYER_ID, createEmptyGameData } from '../ksa/types'
import { randomId } from './ids'

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
 * Custom assets that carry uploaded binaries (textures, primitive meshes) are NOT
 * exported — the UI blocks export when a project has any (see {@link hasCustomAssets}).
 * Part-ified KITTEN meshes ARE carried, though: they're pure descriptors referencing
 * built-in game assets (geometry re-bakes from the kitten gltf on load, textures resolve
 * by Content/Core path), so they round-trip as data with no binary bundling.
 */

export const PROJECT_EXPORT_FORMAT = 'flexo-project'
export const PROJECT_EXPORT_VERSION = 1

/** The in-scope workspace data carried by an export (everything but binary-backed assets). */
export interface ProjectExportData {
  editorTags: string[]
  gameData: PartGameData
  subPartGameData: SubPartGameData[]
  layers: Layer[]
  placements: SubPartPlacement[]
  connectors: Connector[]
  kittens: KittenInstance[]
  animations: PartAnimation[]
  /** Part-ified kitten meshes only (descriptors referencing game assets — no binaries). */
  customMeshes: CustomMesh[]
}

/** A versioned export envelope. `sourcePartId` is informational — never applied on import. */
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

/** A part-ified kitten submesh — pure data referencing game assets (no uploaded binary). */
function isKittenMesh(m: CustomMesh): boolean {
  return m.kitten != null
}

/**
 * True when the project has custom assets that JSON export can't carry — uploaded
 * textures or primitive meshes (their binaries live in IndexedDB). Kitten part-meshes
 * DON'T count: they're data-only references to game assets and export fine.
 */
export function hasCustomAssets(part: EditingPart): boolean {
  return part.customTextures.length > 0 || part.customMeshes.some((m) => !isKittenMesh(m))
}

/**
 * Builds a data-only export envelope. Deep-copies the in-scope fields and stamps
 * provenance. Only kitten part-meshes are carried in `customMeshes` (primitive meshes and
 * `customTextures` are binary-backed and omitted — export is gated off when they exist).
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
      kittens: part.kittens,
      animations: part.animations,
      customMeshes: part.customMeshes.filter(isKittenMesh),
    }),
  }
}

/**
 * Parses + validates pasted import text. Returns a discriminated result with a
 * human-readable error on failure, or a normalized envelope (missing optional
 * fields backfilled) on success.
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
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Expected a JSON object.' }
  }

  const obj = raw as Record<string, unknown>
  if (obj.format !== PROJECT_EXPORT_FORMAT) {
    return {
      ok: false,
      error: `Not a flexo project export (format: ${JSON.stringify(obj.format)}).`,
    }
  }
  if (typeof obj.version !== 'number' || obj.version > PROJECT_EXPORT_VERSION) {
    return { ok: false, error: `Unsupported export version: ${JSON.stringify(obj.version)}.` }
  }
  if (typeof obj.data !== 'object' || obj.data === null) {
    return { ok: false, error: 'Export is missing its "data" section.' }
  }

  const d = obj.data as Record<string, unknown>
  for (const key of ['placements', 'connectors', 'kittens', 'animations', 'layers'] as const) {
    if (!Array.isArray(d[key])) {
      return { ok: false, error: `Export "data.${key}" is missing or not an array.` }
    }
  }

  return { ok: true, env: normalizeEnvelope(obj, d) }
}

function normalizeEnvelope(
  obj: Record<string, unknown>,
  d: Record<string, unknown>,
): ProjectExportEnvelope {
  const gameData =
    d.gameData && typeof d.gameData === 'object'
      ? { ...createEmptyGameData(), ...(d.gameData as Partial<PartGameData>) }
      : createEmptyGameData()
  // Migrate legacy docking ports that stored a single `force` instead of the
  // split LatchingImpulse/PushoffForce fields (older project exports).
  if (gameData.dockingPort) {
    const dp = gameData.dockingPort as DockingPort & { force?: number }
    if (dp.latchingImpulse == null) dp.latchingImpulse = dp.force ?? 0
    if (dp.pushoffForce == null) dp.pushoffForce = dp.force ?? 0
    delete dp.force
  }
  // Migrate legacy batteries that stored capacity in kWh (1 kWh = 1000 Wh).
  for (const b of gameData.batteries) {
    const legacy = b as Battery & { capacityKWh?: number }
    if (legacy.capacityWh == null && legacy.capacityKWh != null) {
      legacy.capacityWh = legacy.capacityKWh * 1000
      delete legacy.capacityKWh
    }
  }
  return {
    format: PROJECT_EXPORT_FORMAT,
    version: typeof obj.version === 'number' ? obj.version : PROJECT_EXPORT_VERSION,
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : 0,
    projectName: typeof obj.projectName === 'string' ? obj.projectName : '',
    sourcePartId: typeof obj.sourcePartId === 'string' ? obj.sourcePartId : '',
    data: {
      editorTags: Array.isArray(d.editorTags) ? (d.editorTags as string[]) : [],
      gameData,
      subPartGameData: Array.isArray(d.subPartGameData)
        ? (d.subPartGameData as SubPartGameData[])
        : [],
      layers: d.layers as Layer[],
      placements: d.placements as SubPartPlacement[],
      connectors: d.connectors as Connector[],
      kittens: d.kittens as KittenInstance[],
      animations: d.animations as PartAnimation[],
      // Optional — absent in pre-kitten-mesh exports; only kitten meshes are ever carried.
      customMeshes: Array.isArray(d.customMeshes) ? (d.customMeshes as CustomMesh[]) : [],
    },
  }
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

  const instanceIdMap = new Map<string, string>()
  const connectorIdMap = new Map<string, string>()
  const layerIdMap = new Map<string, string>()
  const subPartIdMap = new Map<string, string>() // imported customMesh subPartId -> fresh id
  const newLayerIds: string[] = []

  // Custom (kitten) meshes — descriptors referencing game assets, no binaries. Give each a
  // fresh id + subPartId so repeated additive imports never collide, and remember the
  // old->new subPartId so placements/SubPartGameData below repoint at the new template.
  // (Primitive/textured meshes never reach here — export is gated off when they exist.)
  for (const src of data.customMeshes ?? []) {
    if (!src.kitten) continue
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

  // Connectors — always on the built-in Connectors layer, fresh _connectorN ids.
  for (const src of data.connectors) {
    const id = nextConnectorId(part)
    part.connectors.push({
      id,
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      scale: vec(src.scale, 1),
      flags: [...(src.flags ?? [])],
      layerId: CONNECTOR_LAYER_ID,
    })
    connectorIdMap.set(src.id, id)
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

  mergeGameData(part.gameData, data.gameData, connectorIdMap)

  // Per-SubPart tanks + solar panels: append to an existing template entry, else add
  // the entry. Repoint the template id if it names an imported custom mesh.
  for (const sg of data.subPartGameData) {
    const templateId = mapTemplateId(sg.subPartTemplateId)
    const tanks = (sg.tanks ?? []).map((t) => ({ ...t }))
    const solarPanels = (sg.solarPanels ?? []).map((sp) => structuredClone(sp))
    const lights = (sg.lights ?? []).map((l) => structuredClone(l))
    const existing = part.subPartGameData.find((x) => x.subPartTemplateId === templateId)
    if (existing) {
      existing.tanks.push(...tanks)
      existing.solarPanels.push(...solarPanels)
      existing.lights.push(...lights)
    } else part.subPartGameData.push({ subPartTemplateId: templateId, tanks, solarPanels, lights })
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

  return {
    part,
    summary: {
      meshes: data.placements.length,
      connectors: data.connectors.length,
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
): void {
  if (!target.displayName.trim() && src.displayName?.trim()) target.displayName = src.displayName
  if (target.customMass == null && src.customMass != null) target.customMass = src.customMass
  target.batteries.push(...(src.batteries ?? []).map((b) => ({ ...b })))
  target.generators.push(...(src.generators ?? []).map((g) => ({ ...g })))
  target.solarPanels.push(...(src.solarPanels ?? []).map((sp) => structuredClone(sp)))
  target.powerConsumers.push(...(src.powerConsumers ?? []).map((p) => ({ ...p })))
  if (target.decoupler == null && src.decoupler) {
    const id = connectorIdMap.get(src.decoupler.connectorId)
    if (id) target.decoupler = { connectorId: id, force: src.decoupler.force }
  }
  if (target.dockingPort == null && src.dockingPort) {
    const id = connectorIdMap.get(src.dockingPort.connectorId)
    if (id)
      target.dockingPort = {
        connectorId: id,
        latchingImpulse: src.dockingPort.latchingImpulse,
        pushoffForce: src.dockingPort.pushoffForce,
      }
  }
  if (target.evaDoor == null && src.evaDoor) {
    const id = connectorIdMap.get(src.evaDoor.connectorId)
    if (id) target.evaDoor = { connectorId: id }
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
