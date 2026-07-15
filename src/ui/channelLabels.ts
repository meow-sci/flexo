import type { TextureChannel } from '../ksa/types'

/** User-facing labels for what an uploaded image is authored as. */
export const CHANNEL_LABELS: Record<TextureChannel, string> = {
  baseColor: 'Base color (image)',
  normal: 'Normal map',
  roughness: 'Roughness (grayscale)',
  metalness: 'Metalness (grayscale)',
  occlusion: 'Ambient occlusion (grayscale)',
  orm: 'Packed ORM (AO/Rough/Metal)',
  emissiveMask: 'Emissive mask (grayscale)',
}

/** Display/select order for the channel picker. */
export const CHANNEL_ORDER: TextureChannel[] = [
  'baseColor',
  'normal',
  'roughness',
  'metalness',
  'occlusion',
  'orm',
  'emissiveMask',
]
