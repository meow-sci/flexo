import * as THREE from 'three'

/**
 * Patches a MeshStandardMaterial's shader to match KSA's vessel fragment shader
 * for the texture formats we load:
 *
 *  - **BC5 normal map** stores only R,G. The stock three.js tangent-space path
 *    reads `.xyz` (blue = 0 → broken). We reconstruct Z = sqrt(1 - x² - y²) and
 *    flip X (KSA: `normalMap.x = -normalMap.x`), +Y up. `tbn` comes from the
 *    explicit per-vertex tangent attribute that MeshAtlasCache bakes in with
 *    MikkTSpace (KSA GLBs ship no TANGENT) — that gives a handedness sign matching
 *    the baker and keeps detail consistent across mirrored UV islands. Without it,
 *    `normal_fragment_begin` would fall back to the screen-space derivative frame,
 *    which inverts normal-map detail on those islands (verified against the
 *    installed three r0.184 chunk).
 *  - **BC4 emissive** stores one channel in R; KSA uses it as a mask. We broadcast
 *    `.rrr` (boosted by {@link EMISSIVE_BOOST}) and ADD it to `totalEmissiveRadiance`
 *    rather than multiplying. three initializes `totalEmissiveRadiance` from the
 *    `emissive` uniform, so adding leaves that uniform free to drive the per-instance
 *    selection highlight (a multiply would mask the tint with the black emissive map).
 *
 * Isolated here (like coords.ts for transforms): if normals look inverted, fix it
 * in this file only.
 */
/** KSA's emissive intensity for the BC4 mask (mirrors the original vessel shader). */
const EMISSIVE_BOOST = 1.25
export function applyKsaShaderPatches(
  material: THREE.MeshStandardMaterial,
  opts: { normal: boolean; emissive: boolean },
): void {
  material.onBeforeCompile = (shader) => {
    if (opts.normal) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
          vec3 mapN = vec3( texture2D( normalMap, vNormalMapUv ).rg * 2.0 - 1.0, 0.0 );
          mapN.x = - mapN.x;
          mapN.xy *= normalScale;
          mapN.z = sqrt( max( 0.0, 1.0 - dot( mapN.xy, mapN.xy ) ) );
          normal = normalize( tbn * mapN );
        `,
      )
    }
    if (opts.emissive) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
          vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
          totalEmissiveRadiance += emissiveColor.rrr * ${EMISSIVE_BOOST.toFixed(2)};
        `,
      )
    }
  }
  // Materials with the same patch flags share one compiled program.
  const key = `flexo-ksa-n${opts.normal ? 1 : 0}-e${opts.emissive ? 1 : 0}`
  material.customProgramCacheKey = () => key
}
