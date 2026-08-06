/**
 * Display formatting shared by the project surfaces (manager cards, the archive export
 * summary). Its own module because a file that exports both components and plain functions
 * breaks React Fast Refresh (oxlint `react/only-export-components`).
 */
import type { ProjectMeta } from '../../state/projectDb';

export function totalBytes(meta: ProjectMeta): number {
  return meta.bytes.snapshot + meta.bytes.history + meta.bytes.assets;
}

/** `1.8 MB (+12 MB assets)` — the manager's per-project size line (§2.1). */
export function sizeLine(meta: ProjectMeta): string {
  const document = formatBytes(meta.bytes.snapshot + meta.bytes.history);
  return meta.bytes.assets > 0
    ? `${document} (+${formatBytes(meta.bytes.assets)} assets)`
    : document;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1e6) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

const RELATIVE_STEPS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60_000, 'minute'],
  [3_600_000, 'hour'],
  [86_400_000, 'day'],
  [604_800_000, 'week'],
  [2_592_000_000, 'month'],
  [31_536_000_000, 'year'],
];

/**
 * `2 min ago` / `3d ago`. `now` is REQUIRED and passed in from a mount-time stamp — calling
 * `Date.now()` from a render body is a Rules-of-React violation (the compiler would cache a
 * value that silently ages).
 */
export function relativeTime(ms: number, now: number): string {
  if (!ms) return 'never';
  const delta = now - ms;
  if (delta < 60_000) return 'just now';
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' });
  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let divisor = 60_000;
  for (const [step, name] of RELATIVE_STEPS) {
    if (delta >= step) {
      divisor = step;
      unit = name;
    }
  }
  return formatter.format(-Math.round(delta / divisor), unit);
}
