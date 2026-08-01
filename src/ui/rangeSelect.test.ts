import { describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { shiftRangeSelection, useShiftRangeSelect, type ShiftRangeSelect } from './rangeSelect'

const ROWS = ['a', 'b', 'c', 'd', 'e', 'f']
const range = (clicked: string, selected: string[], isSelectable?: (key: string) => boolean) =>
  [
    ...shiftRangeSelection(clicked, {
      orderedKeys: ROWS,
      selectedKeys: new Set(selected),
      isSelectable,
    }),
  ]
    .sort()
    .join('')

describe('shiftRangeSelection', () => {
  it('extends from a single selected row, in either direction', () => {
    expect(range('e', ['b'])).toBe('bcde')
    expect(range('a', ['d'])).toBe('abcd')
  })

  it('extends a contiguous selection from whichever edge is nearer', () => {
    // Selection c–d: clicking below extends down, clicking above extends up, and in
    // both cases the whole span ends up selected.
    expect(range('f', ['c', 'd'])).toBe('cdef')
    expect(range('a', ['c', 'd'])).toBe('abcd')
  })

  it('clicking the selection itself changes nothing', () => {
    expect(range('c', ['c', 'd'])).toBe('cd')
  })

  it('never shrinks: a click inside the selection fills the nearest gap', () => {
    // Cmd-clicked b and f, then Shift+clicked e: only e's side of the hole fills in.
    expect(range('e', ['b', 'f'])).toBe('bef')
    // …and the far side stays untouched, holes and all.
    expect(range('c', ['b', 'f'])).toBe('bcf')
  })

  it('resolves an exact tie to the earlier row', () => {
    // c is equidistant from b and d — fill upward (b–c), not downward.
    expect(range('c', ['b', 'd'])).toBe('bcd')
  })

  it('is a plain click when nothing is selected yet', () => {
    expect(range('c', [])).toBe('c')
  })

  it('skips unselectable rows but still spans past them', () => {
    // c and d sit on a locked/hidden layer: the range reaches e without selecting them.
    expect(range('e', ['b'], (k) => k !== 'c' && k !== 'd')).toBe('be')
    // An unselectable click target is likewise filled up to, but not included.
    expect(range('c', ['a'], (k) => k !== 'c')).toBe('ab')
    // With nothing selected, an unselectable click selects nothing at all.
    expect(range('c', [], (k) => k !== 'c')).toBe('')
  })

  it('keeps selected rows that are not currently listed (filtered out by a search)', () => {
    const keys = shiftRangeSelection('c', {
      orderedKeys: ['a', 'b', 'c'],
      selectedKeys: new Set(['a', 'zz']),
    })
    expect([...keys].sort().join(' ')).toBe('a b c zz')
  })

  it('ignores a click on a row that is not in the list', () => {
    expect(range('zz', ['b'])).toBe('b')
  })
})

describe('useShiftRangeSelect', () => {
  // Minimal mounted-hook harness (no component-test infra in this repo): a probe
  // component captures the hook's return value so the test can drive the gesture.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  const pointer = (init: { shiftKey?: boolean; button?: number }) =>
    ({ shiftKey: false, button: 0, ...init }) as unknown as React.PointerEvent

  async function mountProbe(selected: string[]) {
    let api: ShiftRangeSelect | null = null
    function Probe() {
      api = useShiftRangeSelect({ orderedKeys: ROWS, selectedKeys: new Set(selected) })
      return null
    }
    const root = createRoot(document.createElement('div'))
    await act(async () => root.render(createElement(Probe)))
    return {
      api: () => api as unknown as ShiftRangeSelect,
      unmount: () => act(async () => root.unmount()),
    }
  }

  /** What react-aria reports for an anchorless Shift+click: just the clicked row added. */
  const reported = (keys: string[]) => new Set(keys)

  it('replaces the anchorless keys react-aria reports with the range', async () => {
    const probe = await mountProbe(['b'])
    probe
      .api()
      .rowProps('e')
      .onPointerDown(pointer({ shiftKey: true }))
    const keys = probe.api().resolveSelection(reported(['b', 'e']))
    expect([...(keys as Set<string>)].sort().join('')).toBe('bcde')
    await probe.unmount()
  })

  it('passes every other gesture straight through', async () => {
    const probe = await mountProbe(['b'])
    // Plain click.
    probe.api().rowProps('e').onPointerDown(pointer({}))
    expect(probe.api().resolveSelection(reported(['e']))).toEqual(reported(['e']))
    // Shift + secondary button — that is the row's context menu, not a range.
    probe
      .api()
      .rowProps('e')
      .onPointerDown(pointer({ shiftKey: true, button: 2 }))
    expect(probe.api().resolveSelection(reported(['e']))).toEqual(reported(['e']))
    // Cmd/Ctrl+A.
    probe
      .api()
      .rowProps('e')
      .onPointerDown(pointer({ shiftKey: true }))
    expect(probe.api().resolveSelection('all')).toBe('all')
    await probe.unmount()
  })

  it('consumes the Shift+click once, so the next selection change is untouched', async () => {
    const probe = await mountProbe(['b'])
    probe
      .api()
      .rowProps('d')
      .onPointerDown(pointer({ shiftKey: true }))
    probe.api().resolveSelection(reported(['b', 'd']))
    // e.g. a later keyboard-driven change with no pointer gesture behind it.
    expect(probe.api().resolveSelection(reported(['f']))).toEqual(reported(['f']))
    await probe.unmount()
  })

  it('drops a Shift+click that produced no selection change (a disabled row)', async () => {
    const probe = await mountProbe(['b'])
    probe
      .api()
      .rowProps('e')
      .onPointerDown(pointer({ shiftKey: true }))
    await Promise.resolve() // the pending click is cleaned up on the microtask queue
    expect(probe.api().resolveSelection(reported(['f']))).toEqual(reported(['f']))
    await probe.unmount()
  })
})
