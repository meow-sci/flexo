import { atom } from 'nanostores';
import {
  getMeta,
  getThumb,
  listMeta,
  putMeta,
  type ProjectId,
  type ProjectMeta,
} from './projectDb';
import { notify } from './notificationStore';

/**
 * The reactive project INDEX (design: `plans/flexo_v2/design/design-projects-export.md` §1.1,
 * §1.3, §1.4, §11; foundation §13 `projectIndexStore` row; LOCKED #3).
 *
 * This is what killed v1's `listProjects()` + `setTick` pair: the Project Manager renders from
 * a store that every mutation refreshes — including mutations made in ANOTHER TAB, which
 * arrive over a BroadcastChannel — instead of re-parsing localStorage on dialog open and
 * poking React with a counter when it looked stale.
 *
 * **Deliberately document-agnostic.** Everything here is metadata or session posture: the
 * index rows, the current-project pointer, the write lock, autosave health, the storage
 * estimate. The lifecycle actions that touch live editor stores (`createProject`,
 * `openProject`, `duplicateProject`, `deleteProject`, `flushAutosave`, `requestThumbnail`)
 * live in `projectStore`, which imports THIS module — a one-way dependency, so neither module
 * needs a lazy-registration dance (the design sketch lists them under this store's heading;
 * the plan's P9.03 spec resolves that by delegating, and the import direction is the
 * mechanical consequence).
 *
 * **Undo enrollment: NONE** for every action here — project lifecycle and metadata are never
 * document mutations (design §1.8). **Persistence**: exactly one localStorage key,
 * `flexo:currentProjectId` (a raw id string — the only project key left in localStorage).
 *
 * No react / three imports; notifications go through the imperative `notify()`.
 */

/** localStorage pointer to the project this tab has open. Raw id, no JSON wrapper. */
const CURRENT_PROJECT_ID_KEY = 'flexo:currentProjectId';

/** The default display name a fresh project gets (uniquified against the index). */
export const DEFAULT_PROJECT_NAME = 'Untitled';

/** Every project's metadata, sorted most-recently-saved first. */
export const $projectIndex = atom<ProjectMeta[]>([]);

/** The open project's id. `''` before the first hydrate. */
export const $currentProjectId = atom<ProjectId>('');

/**
 * The open project's display NAME — a mirror of the current meta row, kept as its own atom so
 * the autosave subscription set and the export-filename consumers stay exactly as they were in
 * v1. Storage never keys on it (D1).
 */
export const $projectName = atom<string>(DEFAULT_PROJECT_NAME);

/**
 * This tab's write posture for the open project (D5):
 * - `owner` — we hold the Web Lock and autosave writes.
 * - `readonly` — another tab holds it; autosave is suspended until **Take over**.
 * - `unsupported` — no Web Locks API: degrade to v1 behavior (we DO write) plus a one-time
 *   notification documenting the single-tab constraint.
 */
export const $projectLock = atom<'owner' | 'readonly' | 'unsupported'>('unsupported');

/** Whether the last autosave write succeeded. Drives the danger status + notification. */
export const $autosaveHealth = atom<'ok' | 'failing'>('ok');

/** `navigator.storage.estimate()` for the manager footer and the autosave-failure body. */
export const $storageEstimate = atom<{ usage: number; quota: number } | null>(null);

/** True while this tab may write — everything except an actively-robbed lock. */
export function canWriteProject(): boolean {
  return $projectLock.get() !== 'readonly';
}

// ── the current-project pointer ───────────────────────────────────────────────

export function readStoredProjectId(): ProjectId | null {
  try {
    return localStorage.getItem(CURRENT_PROJECT_ID_KEY);
  } catch {
    return null;
  }
}

/** Points this tab (and the next reload) at `id`. */
export function setCurrentProjectId(id: ProjectId): void {
  $currentProjectId.set(id);
  try {
    localStorage.setItem(CURRENT_PROJECT_ID_KEY, id);
  } catch {
    // A full/blocked localStorage costs us the reload pointer, not the project — boot then
    // falls back to the newest savedAt row, which is nearly always the same project.
  }
}

// ── the index ────────────────────────────────────────────────────────────────

/** Re-reads `meta` into {@link $projectIndex}, newest save first. */
export async function reloadIndex(): Promise<void> {
  const rows = await listMeta();
  $projectIndex.set(rows.sort((a, b) => b.savedAt - a.savedAt));
  const current = rows.find((row) => row.id === $currentProjectId.get());
  if (current) $projectName.set(current.name);
}

/** The current project's metadata row, or undefined before the first index load. */
export function currentProjectMeta(): ProjectMeta | undefined {
  return $projectIndex.get().find((row) => row.id === $currentProjectId.get());
}

// ── cross-tab index sync (design §1.4) ───────────────────────────────────────

const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('flexo:projects') : null;

if (channel) {
  channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
    if (event.data?.type === 'index-changed') void reloadIndex();
  };
}

/** Tells every other tab that a project row changed. Paired with a local `reloadIndex()`. */
export function broadcastIndexChanged(): void {
  channel?.postMessage({ type: 'index-changed' });
}

// ── the per-project write lock (design §1.4, D5) ──────────────────────────────

/** Resolving this releases the held Web Lock. Null when we hold none. */
let releaseHeldLock: (() => void) | null = null;
let lockedProjectId: ProjectId | null = null;
let warnedUnsupported = false;

function lockName(id: ProjectId): string {
  return `flexo:project:${id}`;
}

function locksApi(): LockManager | null {
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
}

/**
 * Takes the exclusive write lock for `id`, or falls back to read-only with a sticky warning
 * offering **Take over**.
 *
 * The holder callback returns a promise that stays pending for as long as we hold the lock, so
 * the `request()` promise itself must NOT be awaited (it would only settle on release). What
 * this awaits is the callback FIRING — which is when we know whether the lock was granted.
 * When another tab steals it, the `request()` promise rejects with an AbortError, and that
 * rejection is how the robbed tab learns it lost.
 */
export async function acquireProjectLock(id: ProjectId, steal = false): Promise<void> {
  const locks = locksApi();
  if (!locks) {
    $projectLock.set('unsupported');
    if (!warnedUnsupported) {
      warnedUnsupported = true;
      notify({
        severity: 'warning',
        title: 'Multi-tab protection unavailable',
        body: 'This browser has no Web Locks API, so flexo cannot tell when the same project is open in another tab. Keep flexo open in ONE tab — two tabs on one project overwrite each other.',
      });
    }
    return;
  }
  releaseProjectLock();
  lockedProjectId = id;
  let granted = false;
  await new Promise<void>((settled) => {
    const request = locks.request(
      lockName(id),
      steal ? { mode: 'exclusive', steal: true } : { mode: 'exclusive', ifAvailable: true },
      (lock) => {
        if (!lock) {
          settled();
          return Promise.resolve();
        }
        granted = true;
        settled();
        return new Promise<void>((release) => {
          releaseHeldLock = release;
        });
      },
    );
    request.catch(() => {
      // Stolen (or the request errored) — either way this tab no longer autosaves.
      releaseHeldLock = null;
      settled();
      if ($projectLock.get() === 'readonly') return;
      $projectLock.set('readonly');
      notify({
        severity: 'warning',
        title: 'Another tab took over autosave',
        body: 'Changes made here are no longer saved. Reload to pick up the other tab’s changes.',
        sticky: true,
        actions: [{ label: 'Reload', commandId: 'app.reload' }],
      });
    });
  });
  if (granted) {
    $projectLock.set('owner');
    return;
  }
  $projectLock.set('readonly');
  notify({
    severity: 'warning',
    title: 'This project is open in another tab',
    body: 'Changes here are NOT saved. Take over to make this tab the one that autosaves.',
    sticky: true,
    actions: [{ label: 'Take over', commandId: 'project.takeOver' }],
  });
}

/** Drops the held lock (project switch / close). Safe to call when holding none. */
export function releaseProjectLock(): void {
  releaseHeldLock?.();
  releaseHeldLock = null;
  lockedProjectId = null;
}

/** Steals the lock for the open project — the **Take over** action's target. */
export async function takeOverLock(): Promise<void> {
  const id = lockedProjectId ?? $currentProjectId.get();
  if (!id) return;
  await acquireProjectLock(id, true);
}

// ── storage estimate ─────────────────────────────────────────────────────────

export async function refreshStorageEstimate(): Promise<void> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!storage?.estimate) return;
  const { usage, quota } = await storage.estimate();
  $storageEstimate.set({ usage: usage ?? 0, quota: quota ?? 0 });
}

// ── names (design §1.1 — display metadata, never a storage key) ───────────────

/** Returns `base`, or `base 2`, `base 3`, … — the first name not already in the index. */
export function uniqueProjectName(
  base: string = DEFAULT_PROJECT_NAME,
  exceptId?: ProjectId,
): string {
  const taken = new Set(
    $projectIndex
      .get()
      .filter((row) => row.id !== exceptId)
      .map((row) => row.name),
  );
  const trimmed = base.trim() || DEFAULT_PROJECT_NAME;
  if (!taken.has(trimmed)) return trimmed;
  for (let n = 2; ; n++) {
    const candidate = `${trimmed} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Renames a project. The name is auto-suffixed when taken, so a rename can NEVER touch
 * another project's row — the structural fix for v1's silent clobber (census pm §1.1, D1).
 * Returns the name actually applied so the caller can report the suffix.
 */
export async function renameProject(id: ProjectId, name: string): Promise<string | null> {
  const meta = await getMeta(id);
  if (!meta) return null;
  const applied = uniqueProjectName(name, id);
  if (applied === meta.name) return applied;
  await putMeta({ ...meta, name: applied });
  if (id === $currentProjectId.get()) $projectName.set(applied);
  await reloadIndex();
  broadcastIndexChanged();
  return applied;
}

/** Sets a project's description (plain text; the 500-char soft cap is a UI counter). */
export async function setProjectDescription(id: ProjectId, text: string): Promise<void> {
  const meta = await getMeta(id);
  if (!meta) return;
  await putMeta({ ...meta, description: text });
  await reloadIndex();
  broadcastIndexChanged();
}

// ── thumbnails ───────────────────────────────────────────────────────────────

/** Small LRU so a scrolling manager grid does not re-read the same blobs. */
const THUMB_CACHE_MAX = 24;
const thumbCache = new Map<ProjectId, Blob | null>();

/** Reads a project's thumbnail, LRU-cached. `null` when it has none. */
export async function loadThumb(id: ProjectId): Promise<Blob | null> {
  if (thumbCache.has(id)) {
    const hit = thumbCache.get(id) ?? null;
    thumbCache.delete(id);
    thumbCache.set(id, hit);
    return hit;
  }
  const blob = (await getThumb(id)) ?? null;
  thumbCache.set(id, blob);
  if (thumbCache.size > THUMB_CACHE_MAX) {
    const oldest = thumbCache.keys().next();
    if (!oldest.done) thumbCache.delete(oldest.value);
  }
  return blob;
}

/** Drops a project's cached thumbnail (after a capture or a delete). */
export function invalidateThumb(id: ProjectId): void {
  thumbCache.delete(id);
}
