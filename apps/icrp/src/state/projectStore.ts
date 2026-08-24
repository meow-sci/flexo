/**
 * Autosave + boot hydration around {@link projectDb} (plans/ICRP_PLAN.md P3.03).
 * Debounced 500 ms after any document change; failures surface once via a
 * console error and the `$autosaveHealth` atom (a status chip can read it).
 */
import { atom } from 'nanostores';
import { $project, resetProject } from './docStore';
import { loadProjectSnapshot, saveProjectSnapshot } from './projectDb';

export const $autosaveHealth = atom<'ok' | 'failing'>('ok');

const AUTOSAVE_DEBOUNCE_MS = 500;
let timer: ReturnType<typeof setTimeout> | null = null;
let hydrated = false;

/** Restores the saved project (if any) — call BEFORE first render. */
export async function hydrateProjectOnBoot(): Promise<void> {
  try {
    const saved = await loadProjectSnapshot();
    if (saved) resetProject(saved);
  } catch (err) {
    console.error('icrp: project hydration failed — starting fresh', err);
  }
  hydrated = true;
}

/** Wires the autosave subscription (idempotent; call once at boot). */
export function initAutosave(): void {
  $project.subscribe(() => {
    if (!hydrated) return; // never autosave the placeholder over a real snapshot
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void saveProjectSnapshot($project.get()).then(
        () => $autosaveHealth.set('ok'),
        (err) => {
          if ($autosaveHealth.get() !== 'failing') {
            console.error('icrp: autosave failed', err);
          }
          $autosaveHealth.set('failing');
        },
      );
    }, AUTOSAVE_DEBOUNCE_MS);
  });
}
