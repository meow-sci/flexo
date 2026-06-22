import { addPart } from './editorStore'
import { toUrl } from '../ksa/catalog'
import {
  decodeAnimationGlb,
  remapImportedAnimation,
  type ImportedAnimation,
} from '../ksa/animationImport'
import { fitAnimationEasing } from '../ksa/easingFit'
import type { PartAnimation, Transform } from '../ksa/types'
import type { CatalogPart } from '../ksa/partCatalog'

/**
 * Imports a built-in catalog Part INCLUDING its keyframe animations. The three.js
 * GLB decode lives here (not in editorStore, which stays three-free): each
 * `<KeyframeAnimationModule>`'s `_Anim.glb` is fetched + decoded into an
 * {@link ImportedAnimation} (refs in original instance-id space), then handed to
 * {@link addPart}, which regenerates instance ids and lets us remap the animations
 * through its old→new map in the same undo step. Returns the layer the Part landed on.
 */
export async function importBuiltInPart(
  part: CatalogPart,
  targetLayerId?: string,
): Promise<string> {
  const instanceIds = new Set(part.placements.map((p) => p.instanceId))
  const placements = new Map<string, Transform>(part.placements.map((p) => [p.instanceId, p]))
  const decoded: ImportedAnimation[] = []
  for (const mod of part.animationModules ?? []) {
    try {
      const res = await fetch(toUrl(mod.glbPath))
      if (!res.ok) {
        console.error(`flexo: animation GLB ${mod.glbPath} not found (${res.status})`)
        continue
      }
      const imp = decodeAnimationGlb(await res.arrayBuffer(), {
        instanceIds,
        module: mod,
        placements,
      })
      if (imp) decoded.push(imp)
    } catch (err) {
      console.error(`flexo: failed to import animation ${mod.glbPath}`, err)
    }
  }

  // KSA positions animated SubParts SOLELY from the GLB and ignores their geometry
  // `<Position>` (it's overwritten on spawn), so override each animated SubPart's
  // placement with the GLB-faithful rest pose the decoder captured. For correctly
  // authored clips this equals the geometry placement (a no-op); when they disagree
  // (a stale/rotated geometry placement) it's what keeps the imported animation
  // matching the game instead of anchoring the joint motion to the wrong spot.
  const restPlacements = new Map<string, Transform>()
  for (const d of decoded) for (const [id, t] of d.memberRestPlacements) restPlacements.set(id, t)
  const importedPlacements = part.placements.map((p) => {
    const t = restPlacements.get(p.instanceId)
    return t
      ? { ...p, position: { ...t.position }, rotation: { ...t.rotation }, scale: { ...t.scale } }
      : p
  })

  return addPart(
    importedPlacements,
    part.connectors,
    part.editorTags,
    targetLayerId,
    (idMap): PartAnimation[] =>
      decoded.map((d) => {
        const fitted = fitAnimationEasing(remapImportedAnimation(d, idMap, makeId))
        // KSA deploy clips are modeled fully-deployed (their LAST keyframe), so anchor
        // the preview/export there instead of the stowed t=0 (see restKeyframeId docs).
        if (!d.restAtLastKeyframe || fitted.keyframes.length === 0) return fitted
        const last = fitted.keyframes.reduce((a, b) => (b.timeSec > a.timeSec ? b : a))
        return { ...fitted, restKeyframeId: last.id }
      }),
    // Deep-clone so later edits to the imported part's GameData never mutate the
    // cached catalog entry (which can be imported again).
    structuredClone({
      decoupler: part.decoupler,
      dockingPort: part.dockingPort,
      evaDoor: part.evaDoor,
      batteries: part.batteries,
      generators: part.generators,
      solarPanels: part.solarPanels,
      powerConsumers: part.powerConsumers,
      subPartGameData: part.subPartGameData,
    }),
  )
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}
