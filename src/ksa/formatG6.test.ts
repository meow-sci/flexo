import { describe, it, expect } from 'vitest';
import { formatG6 } from './formatG6';

describe('formatG6', () => {
  it('trims trailing zeros and keeps 6 significant digits', () => {
    expect(formatG6(1.5)).toBe('1.5');
    expect(formatG6(0.1427)).toBe('0.1427');
    expect(formatG6(-2.0944)).toBe('-2.0944');
    expect(formatG6(3.14159)).toBe('3.14159');
    expect(formatG6(1)).toBe('1');
    expect(formatG6(0)).toBe('0');
    expect(formatG6(-0.0601)).toBe('-0.0601');
  });

  it('rounds to 6 significant digits', () => {
    expect(formatG6(0.30000001)).toBe('0.3');
    expect(formatG6(1.2345678)).toBe('1.23457');
  });

  it('uses .NET-style exponential notation outside the fixed range', () => {
    expect(formatG6(1234567)).toBe('1.23457E+06');
    expect(formatG6(0.00001234)).toBe('1.234E-05');
  });
});
