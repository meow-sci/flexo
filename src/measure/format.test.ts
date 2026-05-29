import { describe, it, expect } from 'vitest'
import { formatLength, formatLengthValue, formatVec } from './format'

describe('formatLength', () => {
  it('formats meters with 3 decimals', () => {
    expect(formatLength(1.25, 'm')).toBe('1.250 m')
    expect(formatLength(0.085, 'm')).toBe('0.085 m')
  })

  it('formats centimeters with 1 decimal', () => {
    expect(formatLength(1.25, 'cm')).toBe('125.0 cm')
    expect(formatLength(0.085, 'cm')).toBe('8.5 cm')
  })

  it('formats millimeters with 0 decimals', () => {
    expect(formatLength(1.25, 'mm')).toBe('1250 mm')
    expect(formatLength(0.0085, 'mm')).toBe('9 mm')
  })
})

describe('formatLengthValue', () => {
  it('omits the unit suffix', () => {
    expect(formatLengthValue(1.25, 'm')).toBe('1.250')
    expect(formatLengthValue(1.25, 'cm')).toBe('125.0')
    expect(formatLengthValue(1.25, 'mm')).toBe('1250')
  })
})

describe('formatVec', () => {
  it('formats a vec3 as x × y × z with a unit', () => {
    expect(formatVec({ x: 1, y: 2, z: 0.5 }, 'm')).toBe('1.000 × 2.000 × 0.500 m')
    expect(formatVec({ x: 1, y: 2, z: 0.5 }, 'cm')).toBe('100.0 × 200.0 × 50.0 cm')
  })
})
