import type { ReactNode } from 'react';
import { Check, Circle } from 'lucide-react';
import { Menu, MenuItem, MenuSeparator, MenuShortcut, Popover, SubmenuTrigger } from '../kit';
import { getCommand, providerCommands, runCommand, type Command } from '../../state/commandStore';
import { chordsFor } from '../commands/chords';
import type { MenuEntry } from './menuSpec';

/**
 * The ONE renderer that turns `MenuEntry[]` (design: foundation §3/§4, Law 4 "menus are
 * data") into kit `Menu` children. The desktop menubar, its narrow-width `☰` collapse and
 * the phone bar's overflow menu all render through here, so a menu can never drift from
 * the command registry or from the hotkey bindings.
 *
 * Everything is resolved AT RENDER TIME, and a menu's children only render while its
 * popover is open: titles (`dynamicTitle` first), `enabled()`, `checked()`, provider rows
 * and chord chips are therefore re-evaluated on every open, exactly as §4 requires.
 *
 * Conventions this file implements:
 * - **Disabled items stay VISIBLE** (foundation §3 discoverability), with the command's
 *   `disabledReason` as a hover tooltip. It is a native `title` attribute rather than the
 *   kit `Tooltip` because a disabled react-aria menu item is not focusable/hoverable, so a
 *   TooltipTrigger would never fire on precisely the rows that need the explanation.
 * - **`checkbox` / `radio`** get a leading glyph column driven by `checked()`; the menu's
 *   `selectionMode` stays `'none'` (the state lives in stores, not in the collection). Any
 *   level containing one reserves the column on ALL of its rows so labels stay aligned.
 * - **An empty submenu disappears** — that is how `Add ▸ Custom Mesh Instances` hides
 *   itself when the project has no custom meshes (foundation §3 "capability-dependent
 *   dynamic items may hide").
 *
 * The recursive helpers below are plain element factories, not components: react-aria
 * collections read their children as a static element tree, so the items must be produced
 * directly rather than wrapped in an intermediate component.
 */

export interface MenuSpecMenuProps {
  entries: MenuEntry[];
  /** Popover placement for the top-level menu (submenus position themselves). */
  placement?: 'bottom start' | 'bottom end' | 'bottom';
  /** Width class for the popover — menus size to their longest label. */
  widthClass?: string;
  ariaLabel?: string;
}

/** A top-level menu: the `<Popover><Menu>…</Menu></Popover>` a MenuTrigger expects. */
export function MenuSpecMenu({
  entries,
  placement = 'bottom start',
  widthClass = 'w-64',
  ariaLabel,
}: MenuSpecMenuProps) {
  return (
    <Popover placement={placement} className={widthClass}>
      <MenuSpecBody entries={entries} ariaLabel={ariaLabel} />
    </Popover>
  );
}

/**
 * The rows, as a component the Popover MOUNTS — which is the whole point.
 *
 * react-aria's Popover renders `null` while closed, so this body unmounts on close and
 * re-mounts on open, and its render is therefore the moment every `enabled` / `checked` /
 * `dynamicTitle` / provider row is evaluated. Building the items directly inside
 * {@link MenuSpecMenu} instead would bake the predicate results into elements created by
 * whatever rendered the menubar — which, under React Compiler's memoization, is a render
 * that need never happen again, leaving permanently stale ✓ glyphs and step labels.
 */
function MenuSpecBody({ entries, ariaLabel }: { entries: MenuEntry[]; ariaLabel?: string }) {
  return <Menu aria-label={ariaLabel ?? 'Menu'}>{renderEntries(entries)}</Menu>;
}

/** One rendered row, tagged so leading/trailing/doubled rules can be dropped. */
interface Row {
  node: ReactNode;
  separator: boolean;
}

/** One menu level. Returns `[]` when nothing in it resolves (an empty submenu is hidden). */
function renderEntries(entries: MenuEntry[]): ReactNode[] {
  const glyphColumn = entries.some((e) => e.kind === 'checkbox' || e.kind === 'radio');
  const rows: Row[] = [];

  for (const [index, entry] of entries.entries()) {
    switch (entry.kind) {
      case 'separator':
        rows.push({ node: <MenuSeparator key={`separator-${index}`} />, separator: true });
        break;

      case 'command':
      case 'checkbox':
      case 'radio': {
        const command = getCommand(entry.commandId);
        if (!command) break;
        const title = (entry.kind === 'command' && entry.dynamicTitle?.()) || command.title;
        rows.push({ node: commandItem(command, title, entry.kind, glyphColumn), separator: false });
        break;
      }

      case 'provider': {
        for (const command of providerCommands(entry.providerId)) {
          rows.push({
            node: commandItem(command, command.title, 'command', glyphColumn),
            separator: false,
          });
        }
        break;
      }

      case 'submenu': {
        const children = renderEntries(entry.entries);
        if (children.length === 0) break;
        rows.push({
          node: submenuItem(entry.id, entry.label, children, glyphColumn),
          separator: false,
        });
        break;
      }
    }
  }

  return collapseSeparators(rows);
}

/** Drops leading, trailing and doubled rules left behind by hidden or empty entries. */
function collapseSeparators(rows: Row[]): ReactNode[] {
  const kept: ReactNode[] = [];
  let pendingSeparator: ReactNode | null = null;
  for (const row of rows) {
    if (row.separator) {
      if (kept.length > 0) pendingSeparator = row.node;
      continue;
    }
    if (pendingSeparator) {
      kept.push(pendingSeparator);
      pendingSeparator = null;
    }
    kept.push(row.node);
  }
  return kept;
}

function submenuItem(
  id: string,
  label: string,
  children: ReactNode[],
  glyphColumn: boolean,
): ReactNode {
  return (
    <SubmenuTrigger key={id}>
      <MenuItem density="dense" textValue={label}>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {glyphColumn && <span className="w-3.5 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </span>
      </MenuItem>
      {/* A submenu can only open while its parent body is mounted, so its rows were built
          in the same fresh pass — no second mount boundary is needed here. */}
      <Popover className="w-60">
        <Menu aria-label={label}>{children}</Menu>
      </Popover>
    </SubmenuTrigger>
  );
}

function commandItem(
  command: Command,
  title: string,
  kind: 'command' | 'checkbox' | 'radio',
  glyphColumn: boolean,
): ReactNode {
  const disabled = command.enabled?.() === false;
  const checked = command.checked?.() === true;
  return (
    <MenuItem
      key={command.id}
      id={command.id}
      density="dense"
      textValue={title}
      isDisabled={disabled}
      onAction={() => {
        runCommand(command.id);
      }}
    >
      <span
        className="flex min-w-0 flex-1 items-center gap-2"
        title={disabled ? command.disabledReason : undefined}
      >
        {glyphColumn && (
          <span className="flex w-3.5 shrink-0 justify-center text-accent">
            {checked &&
              (kind === 'radio' ? (
                <Circle size={7} className="fill-current" />
              ) : (
                <Check size={13} />
              ))}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <MenuShortcut chords={chordsFor(command.id)} />
      </span>
    </MenuItem>
  );
}
