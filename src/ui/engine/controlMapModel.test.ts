import { describe, expect, it } from 'vitest';
import { CONTROL_MAP_FLAGS, controlMapMask, toggleControlMapFlag } from './controlMapModel';

describe('KSA thruster control map', () => {
  it('covers all twelve independent directional flags and preserves explicit empty maps', () => {
    expect(CONTROL_MAP_FLAGS).toHaveLength(12);
    expect(controlMapMask('')).toBe(0);
    expect(controlMapMask('None, PitchUp, TranslateForward')).toBe(136);
    expect(controlMapMask('pitchup')).toBe(0);
  });
  it('edits named and numeric flags without losing other directions or unknown tokens', () => {
    expect(toggleControlMapFlag('136,Unknown', 8, false)).toBe('TranslateForward,Unknown');
    expect(toggleControlMapFlag('TranslateForward', 8, true)).toBe('PitchUp,TranslateForward');
    expect(toggleControlMapFlag('PitchUp', 8, false)).toBe('');
  });
});
