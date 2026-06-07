import { describe, it, expect, beforeEach } from 'vitest'
import {
  $layerView,
  DEFAULT_LAYER_STATE,
  isLayerListed,
  isLayerVisible,
  layerViewState,
  revealLayer,
  setLayerLocked,
  toggleLayerListed,
  toggleLayerVisible,
} from './layerStore'
import { $selectedIndices, addSubPart, newPart, setSelectedPlacements } from './editorStore'
import { DEFAULT_LAYER_ID } from '../ksa/types'

beforeEach(() => {
  $layerView.set({})
  newPart()
})

describe('layerStore — listed flag', () => {
  it('defaults to listed for an unset layer', () => {
    expect(DEFAULT_LAYER_STATE.listed).toBe(true)
    expect(isLayerListed('whatever')).toBe(true)
  })

  it('toggleLayerListed flips and persists into $layerView', () => {
    toggleLayerListed('engines')
    expect(isLayerListed('engines')).toBe(false)
    expect($layerView.get().engines?.listed).toBe(false)
    toggleLayerListed('engines')
    expect(isLayerListed('engines')).toBe(true)
  })

  it('back-fills listed=true for legacy entries missing the field', () => {
    // A persisted entry from before the `listed` flag existed.
    $layerView.set({ x: { visible: false, locked: true } as never })
    expect(isLayerListed('x')).toBe(true)
    expect(layerViewState($layerView.get(), 'x')).toEqual({
      visible: false,
      locked: true,
      listed: true,
    })
  })

  it('toggling listed does NOT prune the selection (unlike lock)', () => {
    addSubPart('Core.A') // lands on the active Default layer
    setSelectedPlacements([0])
    expect($selectedIndices.get()).toEqual([0])

    toggleLayerListed(DEFAULT_LAYER_ID)
    expect($selectedIndices.get()).toEqual([0]) // still selected

    setLayerLocked(DEFAULT_LAYER_ID, true)
    expect($selectedIndices.get()).toEqual([]) // lock prunes
  })

  it('revealLayer makes a hidden + unlisted layer visible and listed again', () => {
    toggleLayerVisible('engines') // -> hidden
    toggleLayerListed('engines') // -> unlisted
    expect(isLayerVisible('engines')).toBe(false)
    expect(isLayerListed('engines')).toBe(false)
    revealLayer('engines')
    expect(isLayerVisible('engines')).toBe(true)
    expect(isLayerListed('engines')).toBe(true)
  })
})
