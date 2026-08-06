import { useStore } from '@nanostores/react';
import { OutlinerPanel } from './outliner/OutlinerPanel';
import { DataNavigator } from './data/DataNavigator';
import { AnimToolbar } from './AnimToolbar';
import { AnimationPanel } from './AnimationPanel';
import { EngineNavigator } from './engine/EngineNavigator';
import { SurfaceSidebar } from './surface/SurfaceSidebar';
import { $mode } from '../state/modeStore';

/**
 * The right sidebar's body — the **mode primary** (design:
 * `plans/flexo_v2/design/foundation.md` §8). One switch on `$mode`, replacing v1's
 * three-way inspector atom: the mode machine's sidebar contribution now has a visible
 * switcher (menubar + status chip) instead of per-toolbar Close buttons.
 *
 * Shared between the desktop right sidebar and the phone **Panel sheet** (re-tap the active
 * mode tab). The focus editor is NOT part of this stack on either platform — it is the LEFT
 * sidebar (`ModeFocusEditor`) on desktop and the **Inspector sheet** (`MobileInspector`) on
 * phone, which is the same two-surface split.
 *
 * Undo enrollment: NONE — the mode is view state (foundation §13).
 */
export function ModeSidebar() {
  const mode = useStore($mode);

  if (mode === 'animation') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <AnimToolbar />
        <div className="min-h-0 flex-1">
          <AnimationPanel />
        </div>
      </div>
    );
  }

  if (mode === 'engine') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="min-h-0 flex-1">
          <EngineNavigator />
        </div>
      </div>
    );
  }

  if (mode === 'data') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="min-h-0 flex-1">
          <DataNavigator />
        </div>
      </div>
    );
  }

  if (mode === 'surface') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="min-h-0 flex-1">
          <SurfaceSidebar />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1">
        <OutlinerPanel />
      </div>
    </div>
  );
}

// Every mode's primary now exists — the P4 placeholder is gone (Surface was the last one).
