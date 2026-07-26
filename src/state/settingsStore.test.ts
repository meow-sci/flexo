import { describe, it, expect, beforeEach } from 'vitest'
import {
  $ivaSeatSettings,
  $lightSettings,
  $modelImportSettings,
  setIvaSeatSettings,
  setLightSettings,
  setModelImportSettings,
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
  $lightSettings.set({ markerSize: 0.12 })
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
 * The light marker is a pure VIEW setting like the seat marker — KSA ignores a light's
 * scale, so nothing here ever reaches the exported XML. The 0.12 m default keeps light
 * and seat markers at the same on-screen scale. markerSize is deliberately the ONLY
 * field this phase; the coverage-visualization settings widen the interface later
 * (plans/LIGHT_MANAGEMENT_PLAN.md §3.6).
 */
describe('$lightSettings', () => {
  it('defaults to a 0.12 m marker (parity with the seat marker)', () => {
    localStorage.clear()
    expect($lightSettings.get()).toEqual({ markerSize: 0.12 })
  })

  it('patches via setLightSettings, merging over the current value', () => {
    setLightSettings({ markerSize: 0.25 })
    expect($lightSettings.get()).toEqual({ markerSize: 0.25 })
  })

  it('persists to localStorage under its flexo: key', () => {
    setLightSettings({ markerSize: 0.3 })
    expect(JSON.parse(localStorage.getItem('flexo:lightSettings') ?? '{}')).toEqual({
      markerSize: 0.3,
    })
  })
})
