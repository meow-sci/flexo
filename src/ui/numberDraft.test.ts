import { describe, expect, it } from 'vitest'
import { clampNumber, isPartialNumber, parseNumericDraft, trimFloatNoise } from './numberDraft'

describe('isPartialNumber', () => {
  it('keeps entries the user is still typing', () => {
    // The whole point of the draft model: none of these are numbers *yet*, but every one
    // of them is on the way to being one, so the field must not reject the keystroke.
    for (const text of ['', '-', '+', '.', '-.', '0.', '.5', '-0.', '12.', '1e', '1e-', '1E+']) {
      expect(isPartialNumber(text), text).toBe(true)
    }
  })

  it('keeps complete numbers', () => {
    for (const text of ['0', '-1.5', '.25', '1e-7', '-2.5E+3', '00.50']) {
      expect(isPartialNumber(text), text).toBe(true)
    }
  })

  it('rejects text that cannot become a number', () => {
    for (const text of ['abc', '1.2.3', '--1', '1-', '1,5', '5 ', 'e5', '-e5', '1px', '0x10']) {
      expect(isPartialNumber(text), text).toBe(false)
    }
  })
})

describe('parseNumericDraft', () => {
  it('parses complete and trailing-point entries', () => {
    expect(parseNumericDraft('0.')).toBe(0)
    expect(parseNumericDraft('-.5')).toBe(-0.5)
    expect(parseNumericDraft('1e-7')).toBe(1e-7)
    expect(parseNumericDraft('-12.25')).toBe(-12.25)
  })

  it('returns null for entries that are not a number', () => {
    for (const text of ['', '   ', '-', '.', '+', '1e', 'abc']) {
      expect(parseNumericDraft(text), text).toBeNull()
    }
  })
})

describe('clampNumber', () => {
  it('applies only the bounds that are given', () => {
    expect(clampNumber(-1, 0)).toBe(0)
    expect(clampNumber(150, 0, 100)).toBe(100)
    expect(clampNumber(-1)).toBe(-1)
    expect(clampNumber(0.5, 0.0001)).toBe(0.5)
  })
})

describe('trimFloatNoise', () => {
  it('removes binary-float dust from stepping', () => {
    expect(trimFloatNoise(0.1 + 0.2)).toBe(0.3)
    expect(trimFloatNoise(1.005 - 1)).toBe(0.005)
  })

  it('preserves tiny and large magnitudes', () => {
    expect(trimFloatNoise(1e-7)).toBe(1e-7)
    expect(trimFloatNoise(123456.789)).toBe(123456.789)
  })
})
