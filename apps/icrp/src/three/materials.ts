/**
 * Materials for static pieces (plans/ICRP_PLAN.md P2.02), approximating
 * `Shaders/Mesh/StaticObject.frag`:
 *
 *  - Standard bucket: diffuse (sRGB) + BC5-style RG normal (derivative-free,
 *    X-flipped — same channel packing as the vessel shader, so flexo's normal
 *    patch GLSL applies) + packed AO/rough/metal.
 *  - Blended bucket (`<Alpha>`): a REAL alpha blend, depth-test-no-write, drawn
 *    after opaque (fact F7 — not a cutout). The mask is single-channel; KSA
 *    samples `.r`, while three's stock `alphamap_fragment` samples `.g` — hence
 *    the shader patch below.
 *  - Terrain bucket (`<Terrain>true`): the game ignores the material textures
 *    entirely and samples the planet ground. The editor renders a flat
 *    ground-coloured stand-in.
 *
 * The normal-reconstruction GLSL is a COPY of flexo's `normalMapPatch.ts`
 * (`onBeforeCompile` is a single slot, so the alpha patch cannot chain onto the
 * imported one). Listed under "Copied" in SHARED_IMPORTS.md — keep in sync.
 */
import * as THREE from 'three';
import { loadTexture } from '../../../../src/three/TextureCache';
import type { CatalogStaticPiece } from '../ksa/staticCatalog';

/** Editor stand-in colour for Terrain pieces (user-tunable later; Earth grass). */
export const TERRAIN_STAND_IN_COLOR = 0x5d6b3a;

function applyStaticShaderPatches(
  material: THREE.MeshStandardMaterial,
  opts: { normal: boolean; alpha: boolean },
): void {
  material.onBeforeCompile = (shader) => {
    if (opts.normal) {
      // Copy of flexo src/three/normalMapPatch.ts (BC5 RG normal, X-flip, TBN).
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
          vec3 mapN = vec3( texture2D( normalMap, vNormalMapUv ).rg * 2.0 - 1.0, 0.0 );
          mapN.x = - mapN.x;
          mapN.xy *= normalScale;
          mapN.z = sqrt( max( 0.0, 1.0 - dot( mapN.xy, mapN.xy ) ) );
          normal = normalize( tbn * mapN );
        `,
      );
    }
    if (opts.alpha) {
      // KSA: alpha = alphaTex.r (StaticObject.frag:360-362). three's stock chunk
      // reads .g, which is empty in a single-channel transcode.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphamap_fragment>',
        /* glsl */ `
          #ifdef USE_ALPHAMAP
            diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).r;
          #endif
        `,
      );
    }
  };
  const key = `icrp-static-n${opts.normal ? 1 : 0}-a${opts.alpha ? 1 : 0}`;
  material.customProgramCacheKey = () => key;
}

function makeFlatMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.1, roughness: 0.8 });
}

/** Flat ground-look stand-in for `<Terrain>true</Terrain>` pieces. */
export function makeTerrainMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: TERRAIN_STAND_IN_COLOR,
    metalness: 0,
    roughness: 1,
  });
}

const materialCache = new Map<string, Promise<THREE.MeshStandardMaterial>>();

/**
 * Resolves the SHARED material for a piece (cached by material id + bucket).
 * Callers clone it per instance (selection highlight must not bleed) and re-apply
 * the patches after cloning (`Material.clone()` drops `onBeforeCompile`) via
 * {@link reapplyPatches}.
 */
export function getStaticMaterial(piece: CatalogStaticPiece): Promise<THREE.MeshStandardMaterial> {
  if (piece.terrain) return Promise.resolve(makeTerrainMaterial());
  if (!piece.diffuseUrl) return Promise.resolve(makeFlatMaterial());
  const key = `${piece.materialId ?? piece.diffuseUrl}|${piece.alphaUrl ? 'a' : ''}`;
  let pending = materialCache.get(key);
  if (!pending) {
    pending = buildTextured(piece).catch((err) => {
      console.warn(`icrp materials: textured material failed for ${key}`, err);
      return makeFlatMaterial();
    });
    materialCache.set(key, pending);
  }
  return pending;
}

/** Re-applies the shader patches a `Material.clone()` dropped. */
export function reapplyPatches(mat: THREE.MeshStandardMaterial): void {
  applyStaticShaderPatches(mat, { normal: !!mat.normalMap, alpha: !!mat.alphaMap });
}

async function buildTextured(piece: CatalogStaticPiece): Promise<THREE.MeshStandardMaterial> {
  const [map, pbr, normal, alpha] = await Promise.all([
    loadTexture(piece.diffuseUrl!, 'srgb'),
    piece.aoRoughMetalUrl ? loadTexture(piece.aoRoughMetalUrl, 'linear') : null,
    piece.normalUrl ? loadTexture(piece.normalUrl, 'linear') : null,
    piece.alphaUrl ? loadTexture(piece.alphaUrl, 'linear') : null,
  ]);

  const mat = new THREE.MeshStandardMaterial({
    map,
    metalness: 1, // KSA reads metal/rough straight from the map (no multiplier)
    roughness: 1,
  });

  if (pbr) {
    mat.aoMap = pbr;
    mat.roughnessMap = pbr;
    mat.metalnessMap = pbr;
    mat.aoMap.channel = 0; // KSA uses TEXCOORD_0 for all maps
    mat.aoMapIntensity = 1;
  }

  if (normal) {
    mat.normalMap = normal;
    mat.normalMapType = THREE.TangentSpaceNormalMap;
    mat.normalScale.set(1, 1);
  }

  if (alpha) {
    mat.alphaMap = alpha;
    mat.transparent = true;
    mat.depthWrite = false; // Blended bucket: DepthTestNoWrite (F7)
  }

  applyStaticShaderPatches(mat, { normal: !!normal, alpha: !!alpha });
  return mat;
}
