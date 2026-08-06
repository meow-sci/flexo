import { atom } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';
import { loadThumb } from './projectIndexStore';
import type { ProjectId } from './projectDb';

/**
 * **Project Manager view preferences + its lazy thumbnail cache** (design:
 * `plans/flexo_v2/design/design-projects-export.md` §2.1; foundation §10.2).
 *
 * The grid/list choice and the sort order are VIEW state, so they persist to localStorage
 * (repository default) and never enter the document or undo history. The search query is
 * deliberately per-session — a manager that reopened pre-filtered to a forgotten query reads
 * as an empty library.
 *
 * The thumbnail cache lives here rather than in component state for a Rules-of-React reason:
 * a card cannot `useEffect` its way to a blob URL without `setState`, so the cards read a
 * STORE and ask {@link ensureProjectThumb} to fill it. Object URLs are revoked wholesale by
 * {@link releaseProjectThumbs} when the manager closes.
 *
 * **Layering (constitution)**: zero react imports. **Undo enrollment: NONE.**
 */

export type ProjectManagerView = 'grid' | 'list';
/** Sort orders, in the §2.1 menu order. `saved` is the default. */
export type ProjectManagerSort = 'saved' | 'created' | 'name' | 'size';

export interface ProjectManagerPrefs {
  view: ProjectManagerView;
  sort: ProjectManagerSort;
}

export const $projectManagerView = persistentJSON<ProjectManagerPrefs>('flexo:projectManagerView', {
  view: 'grid',
  sort: 'saved',
});

export function setProjectManagerView(patch: Partial<ProjectManagerPrefs>): void {
  $projectManagerView.set({ ...$projectManagerView.get(), ...patch });
}

/** `projectId → object URL` for every thumbnail resolved so far this session. */
export const $projectThumbUrls = atom<Record<ProjectId, string>>({});

/** Ids whose read is in flight or finished (so a re-render never re-reads). */
const requested = new Set<ProjectId>();

/**
 * Reads one project's thumbnail into {@link $projectThumbUrls}, once. Safe to call on every
 * render of every card: a project with no thumbnail is remembered as "asked" and simply never
 * gains a URL, so the placeholder glyph stays.
 */
export function ensureProjectThumb(id: ProjectId): void {
  if (!id || requested.has(id)) return;
  requested.add(id);
  void loadThumb(id)
    .then((blob) => {
      if (!blob) return;
      $projectThumbUrls.set({ ...$projectThumbUrls.get(), [id]: URL.createObjectURL(blob) });
    })
    .catch(() => requested.delete(id));
}

/**
 * Project ids whose write lock another tab currently holds — the `● open in another tab`
 * badge (design §2.3). A SNAPSHOT, refreshed when the manager opens: Web Locks has no change
 * event, and polling a lock table is not worth a render loop.
 */
export const $lockedElsewhere = atom<ReadonlySet<ProjectId>>(new Set());

const LOCK_PREFIX = 'flexo:project:';

/** Re-reads `navigator.locks.query()`. A no-op where Web Locks is unsupported. */
export async function refreshProjectLocks(): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks?.query) return;
  try {
    const snapshot = await locks.query();
    const held = new Set<ProjectId>();
    for (const lock of snapshot.held ?? []) {
      if (lock.name?.startsWith(LOCK_PREFIX)) held.add(lock.name.slice(LOCK_PREFIX.length));
    }
    $lockedElsewhere.set(held);
  } catch {
    // A browser that rejects the query simply shows no badges.
  }
}

/** Revokes every cached thumbnail URL (the manager closing, or a capture invalidating one). */
export function releaseProjectThumbs(): void {
  for (const url of Object.values($projectThumbUrls.get())) URL.revokeObjectURL(url);
  requested.clear();
  $projectThumbUrls.set({});
}
