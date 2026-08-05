import { useStore } from '@nanostores/react';
import { ProgressBar } from 'react-aria-components';
import {
  $loadProgress,
  type DownloadInfo,
  type LoadProgressState,
} from '../state/loadProgressStore';

/**
 * {@link PreviewLoadProgress} — a backdrop overlay centered over a preview pane, for the
 * GLB/KTX2 downloads triggered by the Add Part / Add SubPart popups. It shows a
 * `Loading N…` header (N = in-flight downloads) above one bar per file, each determinate
 * whenever the download reports a Content-Length.
 *
 * The workspace-wide sibling that used to live here is gone: global asset progress is a
 * status-bar segment now (`src/ui/status/ProgressSegment.tsx`), which also killed the
 * hide-while-a-browser-is-open swap the two surfaces used to negotiate — both may show
 * (design-system-services §1.2 #6).
 */
function FileBar({ download }: { download: DownloadInfo }) {
  return (
    <ProgressBar
      aria-label={`Downloading ${download.label}`}
      value={download.determinate ? download.percent : undefined}
      isIndeterminate={!download.determinate}
      className="block"
    >
      {({ percentage, isIndeterminate }) => (
        <div className="relative h-2 overflow-hidden rounded-full bg-panel-sunken outline outline-1 -outline-offset-1 outline-border">
          <div
            className={`h-full rounded-full bg-accent ${isIndeterminate ? 'animate-pulse' : ''}`}
            style={{ width: `${isIndeterminate ? 40 : percentage}%` }}
          />
        </div>
      )}
    </ProgressBar>
  );
}

/** Bytes → "1.1" MB string (single-decimal, SI megabytes). */
function mb(bytes: number): string {
  return (bytes / 1e6).toFixed(1);
}

function Panel({ state }: { state: LoadProgressState }) {
  const count = state.downloads.length;
  let loaded = 0;
  let total = 0;
  for (const d of state.downloads) {
    loaded += d.loaded;
    if (d.total > 0) total += d.total;
  }
  const size = total > 0 ? ` (${mb(loaded)} of ${mb(total)} MB)` : '';
  return (
    <div className="flex w-72 max-w-full flex-col gap-0.5">
      <div className="text-xs tabular-nums text-fg-muted">
        Loading {count} asset{count === 1 ? '' : 's'}…{size}
      </div>
      {state.downloads.map((download) => (
        <FileBar key={download.id} download={download} />
      ))}
    </div>
  );
}

/** Backdrop overlay centered over a preview pane (the parent must be positioned). */
export function PreviewLoadProgress() {
  const state = useStore($loadProgress);
  if (!state.active) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-overlay/60 backdrop-blur-sm">
      <div className="rounded-lg border border-border bg-panel px-4 py-3 shadow-lg">
        <Panel state={state} />
      </div>
    </div>
  );
}
