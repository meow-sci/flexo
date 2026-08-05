import type { ReactNode } from 'react';
import { Button, cn } from '../../kit';

/**
 * The phone bottom mode tab bar (foundation §12, §2.2): the five modes as a fixed row of
 * icon-over-label tabs, safe-area padded, pinned below the condensed status bar.
 *
 * Pure presentation — no store imports. The modeStore phase mounts it in the phone frame
 * and wires `$mode` / the Panel-sheet opening; it renders nowhere yet.
 */
export interface ModeTabSpec {
  /** Mode id — a plain string here; the modeStore phase supplies the `Mode` union. */
  id: string;
  label: string;
  /** lucide icon element. */
  icon: ReactNode;
  /** Small attention dot (foundation §2.2: Engine blockers, Animation draft clips). */
  attention?: boolean;
}

export interface ModeTabBarProps {
  tabs: ModeTabSpec[];
  activeId: string;
  onSelect(id: string): void;
  /** Re-tap of the ACTIVE tab (foundation §12: opens that mode's Panel sheet). */
  onReselect(id: string): void;
}

export function ModeTabBar({ tabs, activeId, onSelect, onReselect }: ModeTabBarProps) {
  return (
    <nav
      aria-label="Mode"
      className="flex shrink-0 border-t border-border bg-panel pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <Button
            key={tab.id}
            variant="ghost"
            size="sm"
            onPress={() => (isActive ? onReselect(tab.id) : onSelect(tab.id))}
            className={cn(
              'h-12 flex-1 flex-col gap-0.5 rounded-none px-1 py-1',
              isActive ? 'text-accent' : 'text-fg-muted',
            )}
          >
            <span className="relative flex items-center justify-center">
              {tab.icon}
              {tab.attention && (
                <span className="absolute -right-1.5 -top-0.5 size-1.5 rounded-full bg-warning" />
              )}
            </span>
            <span className="text-[11px] leading-none">{tab.label}</span>
            {isActive && <span className="sr-only">(current mode)</span>}
          </Button>
        );
      })}
    </nav>
  );
}
