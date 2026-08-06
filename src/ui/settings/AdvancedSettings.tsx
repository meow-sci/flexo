import { useStore } from '@nanostores/react';
import { Button, SectionTitle, Switch } from '../kit';
import { $storageEstimate } from '../../state/projectIndexStore';
import { formatBytes } from '../projects/projectFormat';

/**
 * **Settings ▸ Advanced** — the danger zone (design: design-projects-export.md §9.2, §9.4;
 * foundation §10.7, S12).
 *
 * Build id, storage usage, and the SINGLE home of **Reset Everything**. v1 had three entry
 * points for that command (the settings modal, the burger menu, the build-mismatch dialog) and
 * only two of them offered the folder-grant switch; there is now exactly one, and its switch
 * is present on every platform including phones.
 */
export function AdvancedSettings({ onReset }: { onReset: () => void }) {
  const estimate = useStore($storageEstimate);
  return (
    <>
      <SectionTitle>About this build</SectionTitle>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Build id</span>
        <span className="font-mono text-xs text-fg-subtle">
          {import.meta.env.VITE_BUILD_ID ?? 'dev'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Storage used</span>
        <span className="text-xs tabular-nums text-fg-subtle">
          {estimate
            ? `${formatBytes(estimate.usage)} of ~${formatBytes(estimate.quota)}`
            : 'unavailable'}
        </span>
      </div>

      <SectionTitle>Danger zone</SectionTitle>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs leading-snug text-fg-subtle">
          Deletes every saved project and all locally-stored data, then reloads.
        </span>
        <Button size="sm" variant="danger" className="shrink-0" onPress={onReset}>
          Reset Everything 🔥
        </Button>
      </div>
    </>
  );
}

/**
 * The pushed confirm VIEW (never a nested modal — foundation §10.1). Reset is destructive and
 * not undoable at all, so §14.3 requires the consequences spelled out; the folder-grant switch
 * defaults OFF so `flexo-fs` survives unless the user says otherwise.
 */
export function ResetEverythingView({
  resetFsGrants,
  onResetFsGrants,
  onCancel,
  onConfirm,
}: {
  resetFsGrants: boolean;
  onResetFsGrants: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-sm text-fg">This permanently deletes, in this browser only:</p>
      <ul className="list-disc pl-5 text-xs leading-relaxed text-fg-muted">
        <li>every saved project, its undo history and its thumbnails</li>
        <li>every stored asset binary — uploaded textures, meshes and imported models</li>
        <li>every setting and preference, and the notification list</li>
      </ul>
      <p className="text-xs leading-snug text-fg-subtle">
        There is no undo, and nothing is recoverable afterwards. Export archives first if you want
        any of it back. The page reloads when it finishes.
      </p>
      <Switch isSelected={resetFsGrants} onChange={onResetFsGrants}>
        Reset folder access grants (if any)
      </Switch>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="danger" onPress={onConfirm}>
          RESET EVERYTHING 🔥
        </Button>
      </div>
    </div>
  );
}
