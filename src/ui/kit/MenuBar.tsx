import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MenuTrigger } from 'react-aria-components';
import { Button } from './Button';
import { Kbd } from './Kbd';
import { keyLabel } from './keyDisplay';
import { cn } from './styles';

/**
 * The horizontal menubar primitive (design: `plans/flexo_v2/design/foundation.md` §3 —
 * "Built from react-aria MenuTrigger/Menu via a new kit MenuBar wrapper"). It owns exactly
 * two behaviors and knows nothing about commands or the MenuSpec:
 *
 * 1. **One menu open at a time**, tracked here so every `MenuTrigger` is controlled.
 * 2. **Hover-slide** — the classic desktop menubar rule: hovering a trigger opens it ONLY
 *    when some menu is already open. Hovering with everything closed does nothing.
 *
 * The hover-slide is implemented with a document-level `pointermove` hit-test rather than
 * the triggers' own `onHoverStart`, because react-aria's open popover renders a
 * `position: fixed; inset: 0` underlay over the whole page (react-aria-components
 * `Popover.mjs` — the `data-testid="underlay"` element), so the triggers themselves never
 * see a pointer event while a menu is open. A capture-phase document listener still does.
 * The listener only exists while a menu is open, so it costs nothing at rest.
 */

export interface MenuBarMenu {
  id: string;
  label: string;
  /**
   * Builds this menu's `<Popover><Menu>…</Menu></Popover>`. Called on every render, and
   * its elements only mount while the popover is open — which is what re-evaluates every
   * `enabled` / `checked` predicate per open (design: foundation §4). Never hand this a
   * cached element.
   */
  renderMenu: () => ReactNode;
}

export interface MenuBarProps {
  menus: MenuBarMenu[];
  ariaLabel?: string;
  className?: string;
}

export function MenuBar({ menus, ariaLabel = 'Main menu', className }: MenuBarProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openId === null) return;
    const onPointerMove = (event: PointerEvent) => {
      const bar = barRef.current;
      if (!bar) return;
      // The popovers portal to <body>, so the bar's own buttons ARE the triggers, in
      // menu order.
      const triggers = bar.querySelectorAll<HTMLElement>('button');
      for (const [index, trigger] of triggers.entries()) {
        const box = trigger.getBoundingClientRect();
        if (
          event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom
        ) {
          const id = menus[index]?.id;
          if (id) setOpenId((current) => (current === null ? current : id));
          return;
        }
      }
    };
    document.addEventListener('pointermove', onPointerMove, true);
    return () => document.removeEventListener('pointermove', onPointerMove, true);
  }, [openId, menus]);

  return (
    <div ref={barRef} aria-label={ariaLabel} className={cn('flex items-center gap-px', className)}>
      {menus.map((menu) => (
        <MenuTrigger
          key={menu.id}
          isOpen={openId === menu.id}
          onOpenChange={(open) => setOpenId(open ? menu.id : null)}
        >
          <Button size="xs" variant="ghost" className="px-2">
            {menu.label}
          </Button>
          {menu.renderMenu()}
        </MenuTrigger>
      ))}
    </div>
  );
}

/**
 * The trailing shortcut chips of a menu row. Takes the chords rather than a command id so
 * the kit stays free of any dependency on the command registry / hotkey tables — call it
 * as `<MenuShortcut chords={chordsFor(commandId)} />`, which is the ONE lookup path
 * (design: foundation §4 "labels can never drift from bindings").
 *
 * Only the first chord renders: a menu row shows one shortcut, while the Help dialog is
 * the surface that lists every alternative.
 */
export function MenuShortcut({ chords }: { chords: string[][] | null }) {
  const chord = chords?.[0];
  if (!chord || chord.length === 0) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-4">
      {chord.map((token) => (
        <Kbd key={token}>{keyLabel(token)}</Kbd>
      ))}
    </span>
  );
}
