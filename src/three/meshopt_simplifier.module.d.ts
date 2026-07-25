// The bundled meshoptimizer simplifier WASM module ships no type declarations.
// Only the surface flexo uses is declared: `ready` + `simplify` (see exportGlb's
// view-mesh decimation). `simplify` returns [indices, error] — the index buffer is a
// REDUCTION over the caller's original vertex arrays, which is why attributes ride along.
declare module 'three/addons/libs/meshopt_simplifier.module.js' {
  export const MeshoptSimplifier: {
    ready: Promise<void>
    supported: boolean
    simplify(
      indices: Uint32Array,
      vertexPositions: Float32Array,
      vertexPositionsStride: number,
      targetIndexCount: number,
      targetError: number,
      flags?: string[],
    ): [Uint32Array, number]
  }
}
