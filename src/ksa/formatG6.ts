/**
 * Formats a number the way .NET's `double.ToString("G6")` does — 6 significant
 * digits, trailing zeros trimmed, switching to exponential notation only when
 * .NET would (exponent < -4 or >= 6). KSA's PartXmlSerializer uses "G6" for all
 * transform numbers, so flexo must match it for byte-compatible export.
 *
 * Targets the value range a Part editor produces (positions/rotations/scales);
 * the exponential branch matches .NET's `E+NN` style for completeness.
 */
export function formatG6(n: number): string {
  if (n === 0) return '0';
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : Number.isNaN(n) ? 'NaN' : '-Infinity';

  const exp = Math.floor(Math.log10(Math.abs(n)));

  if (exp < -4 || exp >= 6) {
    // Exponential: 6 significant digits -> 5 fractional digits in the mantissa.
    const [mantissaRaw, expRaw] = n.toExponential(5).split('e');
    const mantissa = trimZeros(mantissaRaw);
    const sign = expRaw.startsWith('-') ? '-' : '+';
    let digits = expRaw.replace(/^[+-]/, '');
    if (digits.length < 2) digits = '0' + digits;
    return `${mantissa}E${sign}${digits}`;
  }

  // Fixed notation with 6 significant digits.
  return trimZeros(n.toPrecision(6));
}

function trimZeros(s: string): string {
  if (s.indexOf('.') < 0) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}
