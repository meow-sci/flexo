/**
 * Hard-coded descriptors for rendering the three default KSA kittens as editor-only
 * visual aides. Mirrors KSA's Content/Core/CharacterAssets.xml — the kitten visuals
 * come from the Character system, not the Part catalog, so these paths are fixed
 * here rather than parsed from the runtime SubPart catalog.
 *
 * Body mesh: Characters/Kitten/KSA_Cat.gltf — a skinned mesh whose 9 sub-meshes are
 * grouped by 5 gltf materials. We override the meaningful ones by gltf material name
 * (eyes/head per kitten, the shared EVA suit); the sclera (`Eyes_KittySklera_mt`) and
 * fur shell (`M_CHA_Kitten_Head`) keep their embedded gltf materials (fur shells are
 * out of scope). The three kittens differ ONLY in head + eye diffuse.
 *
 * Attachments (helmet, visor, MMU backpack) are separate gltfs socketed to skeleton
 * bones (Head_M / Chest_M) — see KittenObject.
 */
import { toUrl } from './catalog'
import type { KittenKind } from './types'

/**
 * One PBR material override, keyed by the gltf material's name. `aoRoughMetalUrl`
 * present → read metalness/roughness from the (linear) ORM map like KSA's vessel
 * shader; absent → a plain non-metallic surface (eyes/head/labels have no ORM map
 * in-game, only a constant "empty" ORM, so metalness 0 is the faithful default).
 */
export interface KittenMaterialSpec {
  /** Diffuse/base-color texture (sRGB). Omit for a flat {@link color} surface. */
  diffuseUrl?: string
  /** Flat base color (hex) used when {@link diffuseUrl} is absent. Default white. */
  color?: number
  /** Tangent-space normal map (linear), if any. */
  normalUrl?: string
  /** Packed AO(r)/Roughness(g)/Metalness(b) map (linear), if any. */
  aoRoughMetalUrl?: string
  /** Glass-like transparency (the visor). */
  transparent?: boolean
}

/** A bone-socketed attachment gltf with per-gltf-material overrides. */
export interface KittenAttachment {
  /** Human label (helmet/visor/mmu) — for debugging/logging. */
  name: string
  /** URL of the attachment gltf. */
  gltfUrl: string
  /** Name of the skeleton bone this attaches to (e.g. "Head_M", "Chest_M"). */
  socketBone: string
  /** Material overrides keyed by the attachment gltf's material name. */
  materials: Record<string, KittenMaterialSpec>
}

const TEX = 'Textures/Characters'
const ATT = 'Textures/Characters/Attachments'

/** URL of the shared skinned kitten body mesh. */
export const KITTEN_BODY_GLTF_URL = toUrl('Characters/Kitten/KSA_Cat.gltf')

// Shared body suit (identical across all three kittens).
const SUIT: KittenMaterialSpec = {
  diffuseUrl: toUrl(`${TEX}/Kitten_EMU_A.ktx2`),
  normalUrl: toUrl(`${TEX}/Kitten_EMU_N.ktx2`),
  aoRoughMetalUrl: toUrl(`${TEX}/Kitten_EMU_ORM.ktx2`),
}
const HEAD_NORMAL_URL = toUrl(`${TEX}/KittenHead_N.ktx2`)

// Per-kitten head pattern + eye color (the ONLY visual difference).
const PER_KITTEN: Record<KittenKind, { headDiffuse: string; eyeDiffuse: string }> = {
  hunter: {
    headDiffuse: toUrl(`${TEX}/KittenHead_Bengal_A.ktx2`),
    eyeDiffuse: toUrl(`${TEX}/Kitten_Eye_Green2_A.ktx2`),
  },
  banjo: {
    headDiffuse: toUrl(`${TEX}/KittenHead_Siamese_A.ktx2`),
    eyeDiffuse: toUrl(`${TEX}/Kitten_Eye_Blue_A.ktx2`),
  },
  polaris: {
    headDiffuse: toUrl(`${TEX}/KittenHead_Tuxedo_A.ktx2`),
    eyeDiffuse: toUrl(`${TEX}/Kitten_Eye_Yellow_A.ktx2`),
  },
}

/**
 * Body material overrides for `kind`, keyed by the body gltf's material names —
 * covering ALL of the body's meshes (the gltf's embedded textures only point at a
 * missing DefaultORM.png, so every mesh must be re-textured here). The fur shell
 * mesh (`M_CHA_Kitten_Head`) is the visible furry head+ears surface, so it takes
 * the per-kitten head texture; the sclera is plain white.
 */
export function kittenBodyMaterials(kind: KittenKind): Record<string, KittenMaterialSpec> {
  const { headDiffuse, eyeDiffuse } = PER_KITTEN[kind]
  const head: KittenMaterialSpec = { diffuseUrl: headDiffuse, normalUrl: HEAD_NORMAL_URL }
  return {
    'model:Kitty_Suit': SUIT,
    'model:KittyHead_mt': head,
    'model:M_CHA_Kitten_Head': head, // fur shell over the head/ears
    'model:KittyEye_mt': { diffuseUrl: eyeDiffuse }, // iris (full eye texture)
  }
}

/**
 * Body gltf materials to skip rendering entirely. `Eyes_KittySklera_mt` is the clear
 * corneal dome that sits just in front of the iris — KSA renders it with a special
 * refractive EyeRenderer shader; we have no equivalent, and an opaque stand-in just
 * occludes the iris, so it is hidden (the iris mesh already carries the full eye
 * texture, whites included).
 */
export const HIDDEN_BODY_MATERIALS: ReadonlySet<string> = new Set(['model:Eyes_KittySklera_mt'])

/** The EVA attachments (shared across all kittens), in render order. */
export const KITTEN_ATTACHMENTS: readonly KittenAttachment[] = [
  {
    name: 'helmet',
    gltfUrl: toUrl('Characters/KittenHelmet/KSA_Cat_Helmet.gltf'),
    socketBone: 'Head_M',
    materials: {
      'model:lambert4': {
        diffuseUrl: toUrl(`${ATT}/Kitty_Helmet_A.ktx2`),
        normalUrl: toUrl(`${ATT}/Kitty_Helmet_N.ktx2`),
        aoRoughMetalUrl: toUrl(`${ATT}/Kitty_Helmet_ORM.ktx2`),
      },
    },
  },
  {
    name: 'visor',
    gltfUrl: toUrl('Characters/KittenVisor/KSA_Cat_Visor.gltf'),
    socketBone: 'Head_M',
    materials: {
      'model:KittyHelmet_Visor_Glass_mt.002': {
        diffuseUrl: toUrl(`${ATT}/Kitty_Helmet_Visor_A.ktx2`),
        normalUrl: toUrl(`${ATT}/Kitty_Helmet_Visor_N.ktx2`),
        aoRoughMetalUrl: toUrl(`${ATT}/Kitty_Helmet_Visor_ORM.ktx2`),
        transparent: true,
      },
    },
  },
  {
    name: 'mmu',
    gltfUrl: toUrl('Characters/KittenMMU/KSA_Cat_MMU.gltf'),
    socketBone: 'Chest_M',
    materials: {
      // Labels/decals: KSA uses no normal and a constant empty ORM → plain surface.
      'KSA_MMU_labels_mt': { diffuseUrl: toUrl(`${ATT}/KSA_MMU_Texts.ktx2`) },
      'KSA_MMU_mt': {
        diffuseUrl: toUrl(`${ATT}/KSA_MMU_Color.ktx2`),
        normalUrl: toUrl(`${ATT}/KSA_MMU_Normal.ktx2`),
        aoRoughMetalUrl: toUrl(`${ATT}/KSA_MMU_ORM.ktx2`),
      },
    },
  },
]
