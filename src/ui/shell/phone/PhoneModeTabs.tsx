import { useStore } from '@nanostores/react';
import { ModeTabBar, type ModeTabSpec } from './ModeTabBar';
import { PanelSheet } from './PanelSheet';
import { $panelSheetOpen, openPanelSheet } from './phoneSheets';
import { MODE_ICONS } from '../../status/statusTokens';
import { runCommand } from '../../../state/commandStore';
import { $mode, MODES } from '../../../state/modeStore';
import { $engineBlockerCount } from '../../../state/engineStore';

/**
 * The phone's bottom **mode tab bar**, wired (design: foundation §12 — phone parity is
 * LOCKED, not a fallback; §2.2 mode switcher).
 *
 * Five tabs, one per mode, pinned below the condensed status strip as the last flex child of
 * the phone frame. Tapping a tab switches mode; **re-tapping the active tab opens that
 * mode's Panel sheet** — which is how the phone reaches the right-sidebar content the
 * desktop shows permanently.
 *
 * Like the desktop switcher it runs the `mode.*` COMMANDS rather than calling `setMode`, so
 * the tabs, the menubar switcher, the status chip, the palette and the digit chords can
 * never disagree about what a switch does. Icons and labels come from the shared
 * {@link MODE_ICONS} / `MODES` datasets for the same reason.
 *
 * Undo enrollment: NONE — mode and sheet visibility are view state (foundation §13).
 */
export function PhoneModeTabs() {
  const mode = useStore($mode);
  const panelOpen = useStore($panelSheetOpen);
  const engineBlockers = useStore($engineBlockerCount);

  const tabs: ModeTabSpec[] = MODES.map((entry) => {
    const Icon = MODE_ICONS[entry.id];
    return {
      id: entry.id,
      label: entry.label,
      icon: <Icon size={18} />,
      // Foundation §2.2's attention dot, same data as the desktop switcher's.
      attention: entry.id === 'engine' && engineBlockers > 0,
    };
  });

  return (
    <>
      <ModeTabBar
        tabs={tabs}
        activeId={mode}
        onSelect={(id) => runCommand(`mode.${id}`)}
        onReselect={openPanelSheet}
      />
      <PanelSheet isOpen={panelOpen} onOpenChange={(open) => $panelSheetOpen.set(open)} />
    </>
  );
}
