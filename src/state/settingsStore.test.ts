import { describe, it, expect, beforeEach } from 'vitest'
import {
  $ivaSeatSettings,
  $lightPreviewCount,
  $lightSettings,
  $modelImportSettings,
  lightSettings,
  setIvaSeatSettings,
  setLightPreviewCount,
  setLightSettings,
  setModelImportSettings,
  type LightVizSettings,
} from './settingsStore'

/**
 * The model-import preferences are the sticky half of the import dialog's options (the
 * per-import half — scale, name prefix, double-sided, bake-transforms, merge — is dialog
 * state by design; see the store's doc comment). Their DEFAULTS are load-bearing: 2048 caps
 * imported textures at ~22 MB of VRAM each, and view-mesh decimation is what keeps KSA's
 * CPU hover-picking cheap on an imported model.
 */
beforeEach(() => {
  localStorage.clear()
  $modelImportSettings.set({
    maxTextureSize: 2048,
    upAxis: 'y',
    bakeScale: true,
    decimateViewMeshes: true,
  })
  $ivaSeatSettings.set({ markerSize: 0.12, showGazeCone: false })
  $lightSettings.set({
    markerSize: 0.12,
    showVolumes: 'selected',
    exposureMode: 'auto',
    vizExposure: 1,
    livePreview: false,
  })
  $lightPreviewCount.set({ enabled: 0, total: 0 })
})

describe('$modelImportSettings', () => {
  it('defaults to a 2048 cap, Y-up, baked scale and decimated view meshes', () => {
    localStorage.clear()
    expect($modelImportSettings.get()).toEqual({
      maxTextureSize: 2048,
      upAxis: 'y',
      bakeScale: true,
      decimateViewMeshes: true,
    })
  })

  it('patches one field at a time, leaving the rest alone', () => {
    setModelImportSettings({ maxTextureSize: 4096 })
    expect($modelImportSettings.get()).toMatchObject({ maxTextureSize: 4096, upAxis: 'y' })
    setModelImportSettings({ upAxis: 'z', decimateViewMeshes: false })
    expect($modelImportSettings.get()).toEqual({
      maxTextureSize: 4096,
      upAxis: 'z',
      bakeScale: true,
      decimateViewMeshes: false,
    })
  })

  it('persists to localStorage under its flexo: key', () => {
    setModelImportSettings({ upAxis: 'z' })
    expect(JSON.parse(localStorage.getItem('flexo:modelImport') ?? '{}')).toMatchObject({
      upAxis: 'z',
    })
  })
})

/**
 * The IVA seat marker is a pure VIEW setting — KSA has no seat size, so nothing here ever
 * reaches the exported XML. The 0.12 m default mirrors the connector cube's 0.125 m so the
 * two markers read at the same scale, and the gaze cone is off by default because it is
 * indicative only (the real in-game limit is a 90° hemisphere, not a 45° cone).
 */
describe('$ivaSeatSettings', () => {
  it('defaults to a 0.12 m marker with the gaze cone off', () => {
    localStorage.clear()
    expect($ivaSeatSettings.get()).toEqual({ markerSize: 0.12, showGazeCone: false })
  })

  it('patches one field at a time, leaving the rest alone', () => {
    setIvaSeatSettings({ markerSize: 0.25 })
    expect($ivaSeatSettings.get()).toEqual({ markerSize: 0.25, showGazeCone: false })
    setIvaSeatSettings({ showGazeCone: true })
    expect($ivaSeatSettings.get()).toEqual({ markerSize: 0.25, showGazeCone: true })
  })

  it('persists to localStorage under its flexo: key', () => {
    setIvaSeatSettings({ markerSize: 0.3, showGazeCone: true })
    expect(JSON.parse(localStorage.getItem('flexo:ivaSeatSettings') ?? '{}')).toEqual({
      markerSize: 0.3,
      showGazeCone: true,
    })
  })
})

/**
 * Light appearance is a pure VIEW setting like the seat marker — KSA ignores a light's
 * scale, so nothing here ever reaches the exported XML. The 0.12 m default keeps light
 * and seat markers at the same on-screen scale, and the DEFAULTS of the coverage
 * controls are load-bearing: coverage on `'selected'` only is what keeps a part with a
 * dozen lights from becoming an unreadable glow, `'auto'` exposure is what makes
 * Core's I=0.05 interior point light visible at all while it is being edited
 * (plans/LIGHT_MANAGEMENT_PLAN.md §3.6), and the live preview is OFF because it is an
 * approximation of the game (§3.10) whose every toggle re-links the scene's shaders.
 */
describe('$lightSettings', () => {
  it('defaults to a 0.12 m marker, coverage on the selection, auto exposure, no preview', () => {
    localStorage.clear()
    expect($lightSettings.get()).toEqual({
      markerSize: 0.12,
      showVolumes: 'selected',
      exposureMode: 'auto',
      vizExposure: 1,
      livePreview: false,
    })
  })

  it('resolves fields missing from a previously-stored object to their defaults', () => {
    // persistentJSON replays a stored object VERBATIM (no merge with the initial
    // value), so a settings object written before `showVolumes` existed would read it
    // as undefined and silently never draw coverage. Every consumer reads through
    // lightSettings() instead. NOT migration: no old key is read, no shape converted.
    $lightSettings.set({ markerSize: 0.2 } as unknown as LightVizSettings)
    expect(lightSettings()).toEqual({
      markerSize: 0.2,
      showVolumes: 'selected',
      exposureMode: 'auto',
      vizExposure: 1,
      livePreview: false,
    })
    // A patch on top of a partial object writes back a COMPLETE one.
    setLightSettings({ showVolumes: 'all' })
    expect($lightSettings.get()).toEqual({
      markerSize: 0.2,
      showVolumes: 'all',
      exposureMode: 'auto',
      vizExposure: 1,
      livePreview: false,
    })
  })

  it('patches one field at a time, leaving the rest alone', () => {
    setLightSettings({ markerSize: 0.25 })
    expect($lightSettings.get()).toMatchObject({ markerSize: 0.25, showVolumes: 'selected' })
    setLightSettings({ showVolumes: 'all' })
    expect($lightSettings.get()).toMatchObject({ markerSize: 0.25, showVolumes: 'all' })
    setLightSettings({ exposureMode: 'absolute', vizExposure: 2.5 })
    expect($lightSettings.get()).toEqual({
      markerSize: 0.25,
      showVolumes: 'all',
      exposureMode: 'absolute',
      vizExposure: 2.5,
      livePreview: false,
    })
    setLightSettings({ livePreview: true })
    expect($lightSettings.get()).toMatchObject({ vizExposure: 2.5, livePreview: true })
  })

  it('persists to localStorage under its flexo: key', () => {
    setLightSettings({ markerSize: 0.3, showVolumes: 'off' })
    expect(JSON.parse(localStorage.getItem('flexo:lightSettings') ?? '{}')).toEqual({
      markerSize: 0.3,
      showVolumes: 'off',
      exposureMode: 'auto',
      vizExposure: 1,
      livePreview: false,
    })
  })
})

/**
 * The preview cap report is the one EPHEMERAL store in this module: EditorScene publishes
 * how many light instances the preview actually lights and how many exist, and the View
 * menu reads it to explain a truncated preview. It describes the current document, so it
 * must never be persisted — a replayed count would describe a project that isn't open.
 */
describe('$lightPreviewCount', () => {
  it('starts empty and never touches localStorage', () => {
    localStorage.clear()
    expect($lightPreviewCount.get()).toEqual({ enabled: 0, total: 0 })
    setLightPreviewCount({ enabled: 16, total: 20 })
    expect($lightPreviewCount.get()).toEqual({ enabled: 16, total: 20 })
    expect(Object.keys(localStorage)).not.toContain('flexo:lightPreviewCount')
  })

  it('no-ops (same object identity) when nothing changed, so idle passes cause no re-render', () => {
    setLightPreviewCount({ enabled: 3, total: 5 })
    const first = $lightPreviewCount.get()
    setLightPreviewCount({ enabled: 3, total: 5 })
    expect($lightPreviewCount.get()).toBe(first)
    setLightPreviewCount({ enabled: 3, total: 6 })
    expect($lightPreviewCount.get()).not.toBe(first)
  })
})
