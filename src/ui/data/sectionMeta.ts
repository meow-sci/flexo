import type { IssueLevel } from './dataNavigatorModel';

/**
 * The per-section badge + issue level a `DataSection` wears, lifted out of the navigator's own
 * row model so a count can never mean one thing in the tree and another in the form
 * (foundation Law 4 — one dataset).
 *
 * Its own module because `DataSection.tsx` may only export components (fast-refresh rule).
 */
export interface SectionMeta {
  count: number;
  issue: IssueLevel;
}

/** A scope with no data yet still renders every section, so a missing row means zeroes. */
export const EMPTY_SECTION_META: SectionMeta = { count: 0, issue: null };
