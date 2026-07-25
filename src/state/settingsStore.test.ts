import { describe, it, expect, beforeEach } from 'vitest'
import { $modelImportSettings, setModelImportSettings } from './settingsStore'

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
