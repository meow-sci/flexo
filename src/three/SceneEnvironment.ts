import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { loadEquirectHDR } from './envCache'
import { ENVIRONMENT_PRESETS, type LightingSettings, type ToneMappingMode } from '../state/lightingStore'

const TONE_MAPPING: Record<ToneMappingMode, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
  linear: THREE.LinearToneMapping,
}

/** Editor's original dark charcoal, used whenever the HDR sky isn't shown. */
const SOLID_BACKGROUND = 0x16171d

/**
 * Per-viewport owner of environment lighting, tonemapping, and background, driven
 * by the global {@link $lighting} store. One instance per renderer (PMREM output
 * is renderer-specific); the source HDR textures are shared via {@link loadEquirectHDR}.
 */
export class SceneEnvironment {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly pmrem: THREE.PMREMGenerator
  private readonly solidBackground = new THREE.Color(SOLID_BACKGROUND)
  private envTarget: THREE.WebGLRenderTarget | null = null
  /** Bumped per apply so a superseded async HDR load (or disposal) discards its result. */
  private token = 0

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer
    this.scene = scene
    this.pmrem = new THREE.PMREMGenerator(renderer)
  }

  async apply(settings: LightingSettings): Promise<void> {
    // Cheap, synchronous renderer/scene state first so exposure/tonemapping
    // respond instantly even while a large HDR is still loading.
    this.renderer.toneMapping = TONE_MAPPING[settings.toneMapping]
    this.renderer.toneMappingExposure = settings.exposure
    this.scene.environmentIntensity = settings.environmentIntensity
    this.scene.backgroundIntensity = settings.environmentIntensity
    this.scene.backgroundBlurriness = settings.backgroundBlur

    const token = ++this.token
    const preset =
      ENVIRONMENT_PRESETS.find((p) => p.id === settings.environment) ?? ENVIRONMENT_PRESETS[0]

    let equirect: THREE.DataTexture | null = null
    if (preset.file) {
      try {
        equirect = await loadEquirectHDR(`${import.meta.env.BASE_URL}hdr/${preset.file}`)
      } catch (err) {
        console.warn(`SceneEnvironment: failed to load HDR '${preset.file}'`, err)
      }
    }
    if (token !== this.token) return // a newer apply() (or dispose) superseded this one

    const target = equirect ? this.pmrem.fromEquirectangular(equirect) : this.fromRoom()
    this.scene.environment = target.texture
    this.envTarget?.dispose()
    this.envTarget = target

    this.scene.background =
      settings.showEnvironmentBackground && equirect ? equirect : this.solidBackground
  }

  private fromRoom(): THREE.WebGLRenderTarget {
    const room = new RoomEnvironment()
    const target = this.pmrem.fromScene(room, 0.04)
    room.dispose()
    return target
  }

  dispose(): void {
    this.token++ // cancel any in-flight apply
    this.envTarget?.dispose()
    this.pmrem.dispose()
  }
}
