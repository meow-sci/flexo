// The bundled MikkTSpace WASM module ships no type declarations.
declare module 'three/addons/libs/mikktspace.module.js' {
  export const ready: Promise<void>
  export const isReady: boolean
  export function generateTangents(
    position: Float32Array,
    normal: Float32Array,
    texcoord: Float32Array,
  ): Float32Array
}
