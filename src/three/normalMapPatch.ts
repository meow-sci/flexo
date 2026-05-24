import * as THREE from 'three'

/**
 * Patches a MeshStandardMaterial's shader to match KSA's vessel fragment shader
 * for the texture formats we load:
 *
 *  - **BC5 normal map** stores only R,G. The stock three.js tangent-space path
 *    reads `.xyz` (blue = 0 → broken). We reconstruct Z = sqrt(1 - x² - y²) and
 *    flip X (KSA: `normalMap.x = -normalMap.x`), +Y up. `tbn` comes from the
 *    derivative tangent frame computed in `normal_fragment_begin` (verified against
 *    the installed three r0.184 chunk).
 *  - **BC4 emissive** stores one channel in R; KSA uses it as a mask. We broadcast
 *    `.rrr` so it isn't tinted red by three's RGB emissive multiply.
 *
 * Isolated here (like coords.ts for transforms): if normals look inverted, fix it
 * in this file only.
 */
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
          totalEmissiveRadiance *= emissiveColor.rrr;
        `,
      )
    }
  }
  // Materials with the same patch flags share one compiled program.
  const key = `flexo-ksa-n${opts.normal ? 1 : 0}-e${opts.emissive ? 1 : 0}`
  material.customProgramCacheKey = () => key
}
