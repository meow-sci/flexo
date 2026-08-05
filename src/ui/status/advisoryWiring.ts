import { clearAdvisory, setAdvisory } from '../../state/statusStore';
import { $lightPreviewCount, $lightSettings, lightSettings } from '../../state/settingsStore';
import { $modFolder } from '../../state/modFolderStore';
import { MAX_PREVIEW_LIGHTS } from '../../three/lightVolume';

/**
 * Raises and lowers the status bar's advisory chips (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.8; segment 6b).
 *
 * An advisory is a **condition** — true until something is fixed — as opposed to the events
 * that flow through the message channel. There are exactly TWO, and the slot is explicitly
 * not a dumping ground: a new advisory needs design review (§1.8).
 *
 * The subscriptions live here rather than inside the owning stores so `settingsStore` and
 * `modFolderStore` stay ignorant of the status bar; both are plain nanostores listeners, so
 * a chip is correct from the first paint and stays correct without any component being
 * mounted.
 *
 * Undo enrollment: NONE. Persistence: NONE (`$advisories` is ephemeral).
 */

/**
 * The live light preview only ever lights {@link MAX_PREVIEW_LIGHTS} instances. v1 buried
 * that fact in the View popover, where it was invisible unless the popover happened to be
 * open; the chip deep-links Settings ▸ Scene instead.
 */
function syncLightCap(): void {
  const { total, enabled } = $lightPreviewCount.get();
  if (lightSettings().livePreview && total > MAX_PREVIEW_LIGHTS) {
    setAdvisory({
      id: 'light-cap',
      text: `💡 ${enabled}/${total}`,
      severity: 'warning',
      priority: 10,
      commandId: 'view.sceneLighting',
    });
  } else {
    clearAdvisory('light-cap');
  }
}

/**
 * A stored mods-folder handle whose write permission has lapsed (browser restart,
 * revocation). Re-granting needs a user gesture, so the chip runs the same
 * `File ▸ Mods Folder ▸ Re-grant Access` command the menu does — and an export that would
 * otherwise fail with a permission error now has a visible fix ahead of time.
 */
function syncModFolder(): void {
  if ($modFolder.get().status === 'needs-permission') {
    setAdvisory({
      id: 'mods-regrant',
      text: '📁 re-grant',
      severity: 'warning',
      priority: 20,
      commandId: 'modsFolder.regrant',
    });
  } else {
    clearAdvisory('mods-regrant');
  }
}

let started = false;

/**
 * Starts the advisory subscriptions. Idempotent, like every other `init*` in this folder
 * (StrictMode double-invocation and hot reloads are both harmless). Never unsubscribed: the
 * conditions outlive every component that could show them.
 */
export function initAdvisoryWiring(): void {
  if (started) return;
  started = true;
  // `subscribe` fires immediately, so a condition that is already true on boot — a lapsed
  // folder grant, a restored project over the light cap — raises its chip without waiting
  // for a change.
  $lightPreviewCount.subscribe(syncLightCap);
  $lightSettings.subscribe(syncLightCap);
  $modFolder.subscribe(syncModFolder);
}
