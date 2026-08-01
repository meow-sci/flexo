/**
 * Hard-coded descriptors for the three default KSA kittens. Mirrors KSA's
 * Content/Core/CharacterAssets.xml — the kitten visuals come from the Character
 * system, not the Part catalog, so these paths are fixed here rather than parsed
 * from the runtime SubPart catalog.
 *
 * Two consumers:
 *  - `KittenObject` renders the kittens as editor-only visual aides (Add → Kitten),
 *    using {@link kittenBodyMaterials}/{@link KITTEN_ATTACHMENTS} (URL specs).
 *  - "Make Kitten Mesh" (see makeKittenMeshPart) part-ifies a kitten into exportable
 *    SubParts, using {@link kittenPartSubMeshes} (Content/Core-relative subpaths so the
 *    textures can be referenced by path or bundled verbatim on export).
 *
 * Body mesh: Characters/Kitten/KSA_Cat.gltf — a skinned mesh whose sub-meshes are
 * grouped by gltf material. The three kittens differ ONLY in head + eye diffuse.
 * Attachments (helmet, visor, MMU backpack) are separate gltfs socketed to skeleton
 * bones (Head_M / Chest_M) — see KittenObject.
 */
import { toUrl } from './catalog';
import type { KittenKind, KittenMeshSource } from './types';

/**
 * One PBR material override, keyed by the gltf material's name. `aoRoughMetalUrl`
 * present → read metalness/roughness from the (linear) ORM map like KSA's vessel
 * shader; absent → a plain non-metallic surface (eyes/head/labels have no ORM map
 * in-game, only a constant "empty" ORM, so metalness 0 is the faithful default).
 */
export interface KittenMaterialSpec {
  /** Diffuse/base-color texture (sRGB). Omit for a flat {@link color} surface. */
  diffuseUrl?: string;
  /** Flat base color (hex) used when {@link diffuseUrl} is absent. Default white. */
  color?: number;
  /** Tangent-space normal map (linear), if any. */
  normalUrl?: string;
  /** Packed AO(r)/Roughness(g)/Metalness(b) map (linear), if any. */
  aoRoughMetalUrl?: string;
  /** Glass-like transparency (the visor). */
  transparent?: boolean;
  /** Glass tint color 0..255, applied to a transparent material's base color (the visor tint). */
  tint?: { r: number; g: number; b: number };
  /** Editor opacity 0..1 for a transparent material (default 0.45; in-game is engine-fixed). */
  opacity?: number;
  /** When tinting a transparent material, mimic KSA's muted in-game glass look (darker + ~0.75 opacity). */
  simulateGlass?: boolean;
  /** 'glassGlow' editor approximation: an emissive-uniform glow color 0..255 shown through the shell. */
  glowColor?: { r: number; g: number; b: number };
  /** Strength 0..1 for {@link glowColor}. */
  glowStrength?: number;
}

/** A bone-socketed attachment gltf with per-gltf-material overrides. */
export interface KittenAttachment {
  /** Human label (helmet/visor/mmu) — for debugging/logging. */
  name: string;
  /** URL of the attachment gltf. */
  gltfUrl: string;
  /** Name of the skeleton bone this attaches to (e.g. "Head_M", "Chest_M"). */
  socketBone: string;
  /** Material overrides keyed by the attachment gltf's material name. */
  materials: Record<string, KittenMaterialSpec>;
}

// ── Content/Core-relative texture subpaths (single source of truth) ──────────
const TEX = 'Textures/Characters';
const ATT = 'Textures/Characters/Attachments';

/** Bare-subpath material source (before {@link toUrl}). */
interface MatSrc {
  diffuse: string;
  normal?: string;
  aoRoughMetal?: string;
  transparent?: boolean;
}

// Shared body suit (identical across all three kittens).
const SUIT_SRC: MatSrc = {
  diffuse: `${TEX}/Kitten_EMU_A.ktx2`,
  normal: `${TEX}/Kitten_EMU_N.ktx2`,
  aoRoughMetal: `${TEX}/Kitten_EMU_ORM.ktx2`,
};
const HEAD_NORMAL_SRC = `${TEX}/KittenHead_N.ktx2`;

// Per-kitten head pattern + eye color (the ONLY visual difference).
const PER_KITTEN_SRC: Record<KittenKind, { headDiffuse: string; eyeDiffuse: string }> = {
  hunter: {
    headDiffuse: `${TEX}/KittenHead_Bengal_A.ktx2`,
    eyeDiffuse: `${TEX}/Kitten_Eye_Green2_A.ktx2`,
  },
  banjo: {
    headDiffuse: `${TEX}/KittenHead_Siamese_A.ktx2`,
    eyeDiffuse: `${TEX}/Kitten_Eye_Blue_A.ktx2`,
  },
  polaris: {
    headDiffuse: `${TEX}/KittenHead_Tuxedo_A.ktx2`,
    eyeDiffuse: `${TEX}/Kitten_Eye_Yellow_A.ktx2`,
  },
};

const HELMET_SRC: MatSrc = {
  diffuse: `${ATT}/Kitty_Helmet_A.ktx2`,
  normal: `${ATT}/Kitty_Helmet_N.ktx2`,
  aoRoughMetal: `${ATT}/Kitty_Helmet_ORM.ktx2`,
};
const VISOR_SRC: MatSrc = {
  diffuse: `${ATT}/Kitty_Helmet_Visor_A.ktx2`,
  normal: `${ATT}/Kitty_Helmet_Visor_N.ktx2`,
  aoRoughMetal: `${ATT}/Kitty_Helmet_Visor_ORM.ktx2`,
  transparent: true,
};
const MMU_BODY_SRC: MatSrc = {
  diffuse: `${ATT}/KSA_MMU_Color.ktx2`,
  normal: `${ATT}/KSA_MMU_Normal.ktx2`,
  aoRoughMetal: `${ATT}/KSA_MMU_ORM.ktx2`,
};
// Labels/decals: KSA uses no normal and a constant empty ORM → plain surface.
const MMU_LABELS_SRC: MatSrc = { diffuse: `${ATT}/KSA_MMU_Texts.ktx2` };

/** URL of the shared skinned kitten body mesh. */
export const KITTEN_BODY_GLTF_URL = toUrl('Characters/Kitten/KSA_Cat.gltf');

/** Builds a runtime (served-URL) material spec from bare subpaths. */
function urlSpec(src: MatSrc): KittenMaterialSpec {
  return {
    diffuseUrl: toUrl(src.diffuse),
    normalUrl: src.normal ? toUrl(src.normal) : undefined,
    aoRoughMetalUrl: src.aoRoughMetal ? toUrl(src.aoRoughMetal) : undefined,
    transparent: src.transparent,
  };
}

/**
 * Builds a runtime (served-URL) material spec for a part-ify {@link KittenMeshSource}, optionally
 * overlaying per-mesh tint / glow / glass-simulation options (the visor surface controls).
 */
export function kittenSpecFromSource(
  src: KittenMeshSource,
  extra?: Partial<
    Pick<KittenMaterialSpec, 'tint' | 'opacity' | 'simulateGlass' | 'glowColor' | 'glowStrength'>
  >,
): KittenMaterialSpec {
  return { ...urlSpec(src), ...extra };
}

/**
 * Body material overrides for `kind`, keyed by the body gltf's material names —
 * covering ALL of the body's meshes (the gltf's embedded textures only point at a
 * missing DefaultORM.png, so every mesh must be re-textured here). The fur shell
 * mesh (`M_CHA_Kitten_Head`) is the visible furry head+ears surface, so it takes
 * the per-kitten head texture; the sclera is plain white.
 */
export function kittenBodyMaterials(kind: KittenKind): Record<string, KittenMaterialSpec> {
  const { headDiffuse, eyeDiffuse } = PER_KITTEN_SRC[kind];
  const head = urlSpec({ diffuse: headDiffuse, normal: HEAD_NORMAL_SRC });
  return {
    'model:Kitty_Suit': urlSpec(SUIT_SRC),
    'model:KittyHead_mt': head,
    'model:M_CHA_Kitten_Head': head, // fur shell over the head/ears
    'model:KittyEye_mt': urlSpec({ diffuse: eyeDiffuse }), // iris (full eye texture)
  };
}

/**
 * Body gltf materials to skip rendering entirely. `Eyes_KittySklera_mt` is the clear
 * corneal dome that sits just in front of the iris — KSA renders it with a special
 * refractive EyeRenderer shader; we have no equivalent, and an opaque stand-in just
 * occludes the iris, so it is hidden (the iris mesh already carries the full eye
 * texture, whites included).
 */
export const HIDDEN_BODY_MATERIALS: ReadonlySet<string> = new Set(['model:Eyes_KittySklera_mt']);

/** The EVA attachments (shared across all kittens), in render order. */
export const KITTEN_ATTACHMENTS: readonly KittenAttachment[] = [
  {
    name: 'helmet',
    gltfUrl: toUrl('Characters/KittenHelmet/KSA_Cat_Helmet.gltf'),
    socketBone: 'Head_M',
    materials: { 'model:lambert4': urlSpec(HELMET_SRC) },
  },
  {
    name: 'visor',
    gltfUrl: toUrl('Characters/KittenVisor/KSA_Cat_Visor.gltf'),
    socketBone: 'Head_M',
    materials: { 'model:KittyHelmet_Visor_Glass_mt.002': urlSpec(VISOR_SRC) },
  },
  {
    name: 'mmu',
    gltfUrl: toUrl('Characters/KittenMMU/KSA_Cat_MMU.gltf'),
    socketBone: 'Chest_M',
    materials: {
      KSA_MMU_labels_mt: urlSpec(MMU_LABELS_SRC),
      KSA_MMU_mt: urlSpec(MMU_BODY_SRC),
    },
  },
];

/**
 * One part-ified kitten submesh: a stable specKey/label, the gltf material names
 * whose baked meshes merge into it, and its {@link KittenMeshSource} (Content/Core
 * texture subpaths). See {@link kittenPartSubMeshes}.
 */
export interface KittenPartSubMesh {
  specKey: string;
  label: string;
  /** gltf material names (across the body + attachment gltfs) that merge into this submesh. */
  materialNames: string[];
  source: KittenMeshSource;
}

/**
 * The full set of submeshes a part-ified kitten exports as SubParts — body (suit,
 * head/fur, eyes) plus the EVA attachments (helmet, visor, MMU). Meshes sharing a
 * material spec merge into one piece (e.g. the face `KittyHead_mt` + fur shell
 * `M_CHA_Kitten_Head`). Pure data (no gltf load) so the add action can build the
 * document descriptors synchronously; geometry is baked later (see kittenBake.ts).
 */
export function kittenPartSubMeshes(kind: KittenKind): KittenPartSubMesh[] {
  const { headDiffuse, eyeDiffuse } = PER_KITTEN_SRC[kind];
  const make = (specKey: string, src: MatSrc): KittenMeshSource => ({
    kind,
    specKey,
    diffuse: src.diffuse,
    normal: src.normal,
    aoRoughMetal: src.aoRoughMetal,
    transparent: src.transparent,
  });
  return [
    {
      specKey: 'suit',
      label: 'Suit',
      materialNames: ['model:Kitty_Suit'],
      source: make('suit', SUIT_SRC),
    },
    {
      specKey: 'head',
      label: 'Head',
      materialNames: ['model:KittyHead_mt', 'model:M_CHA_Kitten_Head'],
      source: make('head', { diffuse: headDiffuse, normal: HEAD_NORMAL_SRC }),
    },
    {
      specKey: 'eye',
      label: 'Eyes',
      materialNames: ['model:KittyEye_mt'],
      source: make('eye', { diffuse: eyeDiffuse }),
    },
    {
      specKey: 'helmet',
      label: 'Helmet',
      materialNames: ['model:lambert4'],
      source: make('helmet', HELMET_SRC),
    },
    {
      specKey: 'visor',
      label: 'Visor',
      materialNames: ['model:KittyHelmet_Visor_Glass_mt.002'],
      source: make('visor', VISOR_SRC),
    },
    {
      specKey: 'pack',
      label: 'MMU Backpack',
      materialNames: ['KSA_MMU_mt'],
      source: make('pack', MMU_BODY_SRC),
    },
    {
      specKey: 'packLabels',
      label: 'MMU Labels',
      materialNames: ['KSA_MMU_labels_mt'],
      source: make('packLabels', MMU_LABELS_SRC),
    },
  ];
}
