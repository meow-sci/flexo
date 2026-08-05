import { useStore } from '@nanostores/react';
import { OutlinerPanel } from './outliner/OutlinerPanel';
import { AnimToolbar } from './AnimToolbar';
import { AnimationPanel } from './AnimationPanel';
import { EngineToolbar } from './EngineToolbar';
import { EnginePanel } from './EnginePanel';
import { panelChrome } from './kit';
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
        <EngineToolbar />
        <div className="min-h-0 flex-1">
          <EnginePanel />
        </div>
      </div>
    );
  }

  if (mode === 'data' || mode === 'surface') {
    return <ModePlaceholder mode={mode} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1">
        <OutlinerPanel />
      </div>
    </div>
  );
}

// INTERIM (P4): replaced by DataNavigator (P6) / SurfacePanel (P8).
const PLACEHOLDERS = {
  // The copy names where each surface ACTUALLY lives today (verified), not where the plan
  // text guessed: Part Data is palette-only by design (dataCommands.ts) and SubPart Data is
  // a row menu on the Build-mode asset list.
  data: {
    title: 'Data',
    body: 'Data mode arrives in a later phase — Part Data is in the ⌘K palette, and SubPart Data stays on each SubPart’s row menu in Build mode.',
  },
  surface: {
    title: 'Surface',
    body: 'Surface mode arrives in a later phase — mesh materials and textures stay editable from Window ▸ Asset Manager….',
  },
} as const;

/**
 * INTERIM (P4): the sidebar body for a mode whose real primary has not been built yet.
 * RULE ZERO — nothing is removed: it names where the mode's v1 surfaces still live, so the
 * mode existing never costs the user access to a feature.
 */
function ModePlaceholder({ mode }: { mode: 'data' | 'surface' }) {
  const { title, body } = PLACEHOLDERS[mode];
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className={`${panelChrome} p-3`}>
        <div className="text-xs font-medium text-fg">{title} mode</div>
        <p className="mt-1 text-xs text-fg-muted">{body}</p>
      </div>
    </div>
  );
}
