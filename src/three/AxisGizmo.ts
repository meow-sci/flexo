import * as THREE from 'three'
import { AXIS_COLOR_CSS, type AxisKey } from './axisColors'

/**
 * A world-orientation triad (three labelled arrows) drawn in a corner of the
 * viewport, on top of the rendered scene.
 *
 * It is NOT part of the scene: it owns a private scene + orthographic camera and
 * is drawn in a second, viewport-scissored pass after the main render, so it can
 * never influence framing, bounds, picking or the environment. Each frame the
 * triad takes the INVERSE of the host camera's rotation, which is what makes it
 * spin with the workspace and always point along the true world axes.
 *
 * Compare `three/addons/helpers/ViewHelper.js`, which does the same trick but
 * hardcodes a 128px square — over half the width of a 200×200 wiki embed — and
 * costs an interactive click/animation path this has no use for. Here the size
 * scales with the host element instead.
 */

/** Fraction of the viewport's SMALLER side the gizmo square occupies. */
const SIZE_FRACTION = 0.2
const MIN_SIZE_PX = 44
const MAX_SIZE_PX = 84
/** Inset from the top-left corner, in CSS pixels. */
const MARGIN_PX = 6

/** Arrow proportions, in the gizmo's own units (the frustum spans ±1.55). */
const SHAFT_RADIUS = 0.035
const SHAFT_LENGTH = 0.72
const HEAD_RADIUS = 0.1
const HEAD_LENGTH = 0.26
const LABEL_DISTANCE = 1.2
const LABEL_SCALE = 0.44

/** Rotation applied to the +X-aligned arrow to point it down each axis. */
const AXIS_ROTATION: Record<AxisKey, THREE.Euler> = {
  x: new THREE.Euler(0, 0, 0),
  y: new THREE.Euler(0, 0, Math.PI / 2),
  z: new THREE.Euler(0, -Math.PI / 2, 0),
}

/** A 64² canvas texture of one letter, drawn in the axis color. */
function makeLabelTexture(letter: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = 'bold 44px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.fillText(letter, 32, 34)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export class AxisGizmo {
  private readonly scene = new THREE.Scene()
  /** Fixed head-on camera; the TRIAD rotates, never this. */
  private readonly camera = new THREE.OrthographicCamera(-1.55, 1.55, 1.55, -1.55, 0, 4)
  private readonly triad = new THREE.Group()
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly textures: THREE.Texture[] = []
  /** Scratch for save/restore around the corner pass (avoids a per-frame alloc). */
  private readonly savedViewport = new THREE.Vector4()

  constructor() {
    this.camera.position.set(0, 0, 2)
    this.scene.add(this.triad)

    // One +X-aligned shaft + head, shared by all three arrows; each instance is
    // rotated into place. Both are built already translated so the arrow starts
    // at the origin rather than being centered on it.
    const shaft = new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 8)
      .rotateZ(-Math.PI / 2)
      .translate(SHAFT_LENGTH / 2, 0, 0)
    const head = new THREE.ConeGeometry(HEAD_RADIUS, HEAD_LENGTH, 12)
      .rotateZ(-Math.PI / 2)
      .translate(SHAFT_LENGTH + HEAD_LENGTH / 2, 0, 0)
    this.geometries.push(shaft, head)

    for (const axis of ['x', 'y', 'z'] as const) {
      const color = AXIS_COLOR_CSS[axis]
      // Unlit and NOT tone-mapped: the gizmo is chrome, so it must read as exactly
      // AXIS_COLOR_CSS under any exposure/tone-mapping/sky the user picks — which
      // is also what lets the HTML readout match it hex for hex.
      const material = new THREE.MeshBasicMaterial({ color, toneMapped: false })
      this.materials.push(material)

      const arrow = new THREE.Group()
      arrow.add(new THREE.Mesh(shaft, material))
      arrow.add(new THREE.Mesh(head, material))
      arrow.rotation.copy(AXIS_ROTATION[axis])
      this.triad.add(arrow)

      const texture = makeLabelTexture(axis.toUpperCase(), color)
      this.textures.push(texture)
      // Labels ignore depth so the letter behind the origin still reads.
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        toneMapped: false,
        depthTest: false,
        transparent: true,
      })
      this.materials.push(spriteMaterial)
      const label = new THREE.Sprite(spriteMaterial)
      label.scale.setScalar(LABEL_SCALE)
      label.position[axis] = LABEL_DISTANCE
      label.renderOrder = 1
      this.triad.add(label)
    }
  }

  /**
   * Draws the triad over the top-left corner of `renderer`'s canvas, oriented to
   * `camera`. Call AFTER the scene render of the same frame.
   *
   * Clears only depth and forces `autoClear` off for the pass: a full clear would
   * wipe the frame that was just rendered, leaving nothing but the gizmo.
   */
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const canvas = renderer.domElement
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    const size = THREE.MathUtils.clamp(Math.min(w, h) * SIZE_FRACTION, MIN_SIZE_PX, MAX_SIZE_PX)
    // Nothing legible is left once the gizmo would eat half the frame.
    if (size + MARGIN_PX * 2 > Math.min(w, h)) return

    this.triad.quaternion.copy(camera.quaternion).invert()

    const previousAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.getViewport(this.savedViewport)
    // WebGL viewport coordinates start at the BOTTOM-left, so "top" is h - size.
    renderer.setViewport(MARGIN_PX, h - size - MARGIN_PX, size, size)
    renderer.render(this.scene, this.camera)
    renderer.setViewport(this.savedViewport)
    renderer.autoClear = previousAutoClear
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
    for (const texture of this.textures) texture.dispose()
    this.geometries.length = 0
    this.materials.length = 0
    this.textures.length = 0
    this.scene.clear()
  }
}
