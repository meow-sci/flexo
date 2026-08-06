import { createContext, use, useEffect, useState } from 'react';
import {
  Dialog,
  DialogViewStack,
  Modal,
  ToggleButton,
  ToggleButtonGroup,
  cn,
  useDialogViewStack,
  type DialogView,
} from './kit';
import { openDialog, type DialogId } from '../state/dialogStore';
import { GeneralSettings } from './settings/GeneralSettings';
import { ViewportSettings } from './settings/ViewportSettings';
import { SceneSettings } from './settings/SceneSettings';
import { ImportExportSettings } from './settings/ImportExportSettings';
import { AdvancedSettings, ResetEverythingView } from './settings/AdvancedSettings';
import { nukeAndReload } from './nukeAndReload';

/**
 * **Settings** (dialog id `'settings'`, size M, `⌘,` — design: foundation §10.7;
 * design-projects-export.md §9.4).
 *
 * Five tabs, and Law 1 applied without exception: **every persistent preference has exactly
 * one home**. What used to be a single scrolling modal (plus a burger menu, plus a second
 * reset button on the phone bar, plus fields that had no UI at all) is now
 * General · Viewport · Scene · Import & Export · Advanced, and each tab owns its fields.
 *
 * Two frame behaviours are the dialog's own rather than a tab's:
 *
 * - **Deep links.** `openDialog({id: 'settings', params: {tab: 'scene'}})` opens on that tab —
 *   the View menu's Grid/Scene rows, the export dialog's chips and Import Review's caption all
 *   land somewhere true.
 * - **Look-dev anchoring.** While the Scene tab is active the dialog narrows and anchors
 *   right-of-centre, leaving ≥50% of the canvas visible, because those sliders live-commit and
 *   are worthless behind a covering modal.
 *
 * Reset Everything is a pushed VIEW of the same `DialogViewStack`, never a modal over a modal.
 *
 * Nothing here is document state, so nothing enrolls in undo.
 */
export type SettingsTab = 'general' | 'viewport' | 'scene' | 'import-export' | 'advanced';

export interface SettingsDialogParams {
  tab?: string;
  /**
   * `'reset'` opens straight onto the Reset Everything confirm view — the target of the
   * build-mismatch notification's `[Reset everything…]` action (design §9.1).
   */
  confirm?: 'reset';
  /**
   * Dialog to RE-OPEN when this one closes. Stacking is banned (§10.1), so a deep-link out
   * of another dialog necessarily dismisses it; this is the return leg. Import Review's
   * "affects export — Settings →" caption is the first caller — without it, glancing at a
   * preference would throw away a model the user had already parsed and configured.
   */
  returnTo?: DialogId;
}

const TAB_LABELS: Record<SettingsTab, string> = {
  general: 'General',
  viewport: 'Viewport',
  scene: 'Scene',
  'import-export': 'Import & Export',
  advanced: 'Advanced',
};

const TABS = Object.keys(TAB_LABELS) as SettingsTab[];

function resolveTab(raw: string | undefined): SettingsTab {
  return TABS.includes(raw as SettingsTab) ? (raw as SettingsTab) : 'general';
}

interface SettingsNav {
  tab: SettingsTab;
  setTab: (tab: SettingsTab) => void;
  askReset: () => void;
}

const SettingsNavContext = createContext<SettingsNav>({
  tab: 'general',
  setTab: () => {},
  askReset: () => {},
});

/** A module const, so the stack's root element is one stable descriptor. */
const TABS_VIEW: DialogView = { id: 'tabs', title: 'Settings', element: <SettingsTabs /> };

export function SettingsDialog({
  isOpen,
  onOpenChange,
  params,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  params?: SettingsDialogParams;
}) {
  const [tab, setTab] = useState<SettingsTab>(() => resolveTab(params?.tab));
  const [resetFsGrants, setResetFsGrants] = useState(false);
  const stack = useDialogViewStack(TABS_VIEW);

  /** Close, or hand the slot back to whoever deep-linked here (see `returnTo`). */
  const returnTo = params?.returnTo;
  const close = () => {
    if (returnTo) openDialog({ id: returnTo });
    else onOpenChange(false);
  };

  const askReset = () =>
    stack.push({
      id: 'reset',
      title: 'Reset everything?',
      element: (
        <ResetEverythingView
          resetFsGrants={resetFsGrants}
          onResetFsGrants={setResetFsGrants}
          onCancel={stack.pop}
          onConfirm={() => void nukeAndReload({ resetFsGrants })}
        />
      ),
    });

  const nav: SettingsNav = { tab, setTab, askReset };

  // A deep-link may ask for the confirm view itself. Pushing it is NAVIGATION, so it runs
  // once after mount rather than during render; `stack.pop` takes the user back to the tabs.
  const wantsReset = params?.confirm === 'reset';
  useEffect(() => {
    if (wantsReset) askReset();
    // Mount-only: re-pushing the confirm on every render would trap the Cancel button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsReset]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && close()}
      isDismissable
      variant="center"
      // Scene is a look-dev surface: the scrim goes with the anchoring, because exposure
      // cannot be judged through 60% black and a backdrop blur.
      overlayClassName={tab === 'scene' ? 'bg-transparent backdrop-blur-none' : undefined}
      className={cn(
        'max-h-[85vh] w-full',
        // Look-dev anchoring: narrow and pushed to the right edge, so the canvas keeps more
        // than half the width while Scene's live-committing sliders are in reach.
        tab === 'scene' ? 'max-w-md sm:mr-2 sm:ml-auto' : 'max-w-2xl',
      )}
    >
      <Dialog className="min-h-0">
        <SettingsNavContext value={nav}>
          <DialogViewStack stack={stack} onClose={close} />
        </SettingsNavContext>
      </Dialog>
    </Modal>
  );
}

function SettingsTabs() {
  const nav = use(SettingsNavContext);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 overflow-x-auto border-b border-border px-3 py-2">
        <ToggleButtonGroup
          size="xs"
          className="w-auto"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[nav.tab]}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (typeof next === 'string' && TABS.includes(next as SettingsTab)) {
              nav.setTab(next as SettingsTab);
            }
          }}
        >
          {TABS.map((tab) => (
            <ToggleButton key={tab} id={tab} size="sm" className="flex-none px-2">
              {TAB_LABELS[tab]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        {nav.tab === 'general' && <GeneralSettings />}
        {nav.tab === 'viewport' && <ViewportSettings />}
        {nav.tab === 'scene' && <SceneSettings />}
        {nav.tab === 'import-export' && <ImportExportSettings />}
        {nav.tab === 'advanced' && <AdvancedSettings onReset={nav.askReset} />}
      </div>
    </div>
  );
}
