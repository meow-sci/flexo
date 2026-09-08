/** Current KSA ThrusterMapFlags values; ThrusterMapFlagsReference parses names case-sensitively. */
export const CONTROL_MAP_FLAGS = [
  { token: 'RollRight', label: 'Roll right', bit: 2 },
  { token: 'RollLeft', label: 'Roll left', bit: 4 },
  { token: 'PitchUp', label: 'Pitch up', bit: 8 },
  { token: 'PitchDown', label: 'Pitch down', bit: 16 },
  { token: 'YawRight', label: 'Yaw right', bit: 32 },
  { token: 'YawLeft', label: 'Yaw left', bit: 64 },
  { token: 'TranslateForward', label: 'Translate forward', bit: 128 },
  { token: 'TranslateBackward', label: 'Translate backward', bit: 256 },
  { token: 'TranslateRight', label: 'Translate right', bit: 512 },
  { token: 'TranslateLeft', label: 'Translate left', bit: 1024 },
  { token: 'TranslateDown', label: 'Translate down', bit: 2048 },
  { token: 'TranslateUp', label: 'Translate up', bit: 4096 },
] as const;

function tokenMask(token: string): number | undefined {
  if (token === 'None') return 0;
  const named = CONTROL_MAP_FLAGS.find((f) => f.token === token);
  if (named) return named.bit;
  if (/^[+-]?\d+$/.test(token)) {
    const value = Number(token);
    if (value >= -2147483648 && value <= 2147483647) return value;
  }
  return undefined;
}

export function controlMapMask(csv: string): number {
  return csv.split(',').reduce((mask, token) => mask | (tokenMask(token.trim()) ?? 0), 0);
}

/** Editing a checkbox rewrites recognized flags, retaining invalid tokens for explicit correction. */
export function toggleControlMapFlag(csv: string, bit: number, selected: boolean): string {
  const before = controlMapMask(csv);
  const mask = selected ? before | bit : before & ~bit;
  const tokens: string[] = CONTROL_MAP_FLAGS.filter((f) => (mask & f.bit) !== 0).map(
    (f) => f.token,
  );
  const knownMask = CONTROL_MAP_FLAGS.reduce((all, f) => all | f.bit, 0);
  const remaining = mask & ~knownMask;
  if (remaining !== 0) tokens.push(String(remaining));
  tokens.push(
    ...csv
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && tokenMask(t) === undefined),
  );
  return tokens.join(',');
}
