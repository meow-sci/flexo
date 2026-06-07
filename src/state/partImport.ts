import { addPart } from './editorStore'
import { toUrl } from '../ksa/catalog'
import { decodeAnimationGlb, remapImportedAnimation, type ImportedAnimation } from '../ksa/animationImport'
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
export async function importBuiltInPart(part: CatalogPart, targetLayerId?: string): Promise<string> {
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
      const imp = decodeAnimationGlb(await res.arrayBuffer(), { instanceIds, module: mod, placements })
      if (imp) decoded.push(imp)
    } catch (err) {
      console.error(`flexo: failed to import animation ${mod.glbPath}`, err)
    }
  }
  return addPart(
    part.placements,
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
  )
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}
