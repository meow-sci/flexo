import { useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Circle } from 'lucide-react';
import { Button, cn, MenuShortcut } from '../kit';
import { getCommand, providerCommands, runCommand, type Command } from '../../state/commandStore';
import { chordsFor } from '../commands/chords';
import { MENU_SPEC, type MenuEntry } from './menuSpec';

/**
 * The whole menubar as ONE drill-down list: level 0 is the eight menu labels, tapping one
 * pushes its entries, and a `‹ Back · <label>` header pops. It renders the same
 * `MENU_SPEC` the desktop menubar does — the phone has zero parallel menu wiring (design:
 * `plans/flexo_v2/design/foundation.md` §12 "MenuSheet"), and neither does the
 * narrow-desktop `☰` collapse (§3).
 *
 * Two hosts share it, which is why it is neither a Sheet nor a Popover itself:
 * - {@link MenuSheet} (`src/ui/shell/phone/MenuSheet.tsx`) — the phone, `size="sm"`.
 * - `MenuBar`'s `☰` popover below ~900px — `size="xs"`.
 *
 * ## Freshness — the reason this is a component and not a render helper
 *
 * `enabled()`, `checked()`, `dynamicTitle()` and provider rows must be re-evaluated every
 * time the surface opens. Both hosts unmount their children while closed (react-aria's
 * Popover and ModalOverlay both render `null`), so mounting THIS component is the moment
 * they are read. Building the rows in the host's own render instead would bake them into
 * elements created by a render React Compiler need never repeat — the same trap
 * {@link MenuSpecMenu} documents, caught in the browser as permanently stale ✓ glyphs.
 *
 * Within one open session, a `checkbox` / `radio` row keeps the surface open and bumps
 * `revision`, which is the argument that forces the row list to be recomputed (menu-toggle
 * ergonomics: flip several View switches without re-opening). Every other row runs its
 * command and dismisses.
 *
 * Undo enrollment: NONE — every row is a `runCommand` into the registry, and the local
 * level stack is sheet-page navigation, not document state.
 */

export interface MenuDrillDownProps {
  /**
   * Row density tier (foundation §14.4: `xs` in chrome, `sm` on phone). `sm` rows are also
   * given a 44px touch height — the tier sets typography, the height sets the target.
   */
  size: 'xs' | 'sm';
  /** Closes the host surface. Called after any row that is not a menu toggle runs. */
  onDismiss(): void;
  /** Host-supplied sizing (`flex-1` in a sheet, a max-height in a popover). */
  className?: string;
}

/** Level 0: the eight top-level menus, as pushable submenus. */
const ROOT_ENTRIES: MenuEntry[] = MENU_SPEC.map((menu) => ({
  kind: 'submenu',
  id: menu.id,
  label: menu.label,
  entries: menu.entries,
}));

interface Level {
  id: string;
  label: string;
  entries: MenuEntry[];
}

export function MenuDrillDown({ size, onDismiss, className }: MenuDrillDownProps) {
  const [stack, setStack] = useState<Level[]>([]);
  // Bumped after a toggle row runs, so the level's `checked()` predicates are re-read.
  const [revision, setRevision] = useState(0);

  const level = stack.at(-1);
  const rows = resolveRows(level?.entries ?? ROOT_ENTRIES, revision);
  // Any level containing a toggle reserves the glyph column on ALL of its rows, so labels
  // stay aligned (same rule as the desktop menu renderer).
  const glyphColumn = rows.some((row) => row.kind === 'command' && row.glyph !== null);
  const iconSize = size === 'sm' ? 16 : 13;

  function activate(row: CommandRow) {
    if (!runCommand(row.command.id)) return;
    if (row.glyph) setRevision((value) => value + 1);
    else onDismiss();
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {level && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-1 py-1">
          <Button
            size={size}
            variant="ghost"
            className="shrink-0 gap-1 px-2"
            // Named for its destination: "Back" is also a View ▸ Camera Snap row label, and
            // a screen reader would otherwise announce two identical buttons.
            aria-label={`Back to ${stack.at(-2)?.label ?? 'Menu'}`}
            onPress={() => setStack((current) => current.slice(0, -1))}
          >
            <ChevronLeft size={iconSize} />
            Back
          </Button>
          <span className="min-w-0 flex-1 truncate px-1 font-semibold">{level.label}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {rows.map((row) => {
          if (row.kind === 'separator') {
            return <div key={row.key} role="separator" className="my-1 h-px bg-border" />;
          }
          if (row.kind === 'submenu') {
            return (
              <Button
                key={row.key}
                size={size}
                variant="ghost"
                className={rowClass(size)}
                onPress={() =>
                  setStack((current) => [
                    ...current,
                    { id: row.key, label: row.label, entries: row.entries },
                  ])
                }
              >
                {glyphColumn && <span className="w-3.5 shrink-0" />}
                <span className="min-w-0 flex-1 truncate text-left">{row.label}</span>
                <ChevronRight size={iconSize} className="shrink-0 text-fg-subtle" />
              </Button>
            );
          }
          return (
            <Button
              key={row.key}
              size={size}
              variant="ghost"
              isDisabled={row.disabled}
              className={rowClass(size)}
              onPress={() => activate(row)}
            >
              {glyphColumn && (
                <span className="flex w-3.5 shrink-0 justify-center text-accent">
                  {row.checked && glyph(row.glyph)}
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col items-start">
                <span className="w-full truncate text-left">{row.title}</span>
                {/* A disabled reason is a SECOND LINE, not trailing text: a disabled button
                    is `pointer-events-none` (so the desktop menu's hover title never fires)
                    and a phone has no hover at all — while sharing one line would eat the
                    title, which is the part the user is looking for. */}
                {row.disabled && row.reason && (
                  <span className="w-full truncate text-left text-[11px] text-fg-subtle">
                    {row.reason}
                  </span>
                )}
              </span>
              <MenuShortcut chords={chordsFor(row.command.id)} />
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Full-width left-aligned row. Height is a MINIMUM so a disabled row's reason line can grow
 * it; `sm` gets a 44px touch target (foundation §12).
 */
function rowClass(size: 'xs' | 'sm'): string {
  return cn(
    'w-full justify-start gap-2 py-1 font-normal',
    size === 'sm' ? 'h-auto min-h-11' : 'h-auto min-h-6',
  );
}

function glyph(kind: 'checkbox' | 'radio' | null): ReactNode {
  return kind === 'radio' ? <Circle size={7} className="fill-current" /> : <Check size={13} />;
}

interface CommandRow {
  kind: 'command';
  key: string;
  command: Command;
  title: string;
  /** `null` for a plain command row; a toggle row keeps the surface open when run. */
  glyph: 'checkbox' | 'radio' | null;
  checked: boolean;
  disabled: boolean;
  reason?: string;
}

type DrillRow =
  | { kind: 'separator'; key: string }
  | { kind: 'submenu'; key: string; label: string; entries: MenuEntry[] }
  | CommandRow;

/**
 * One level's rows, resolved against the live registry. Mirrors the desktop renderer's
 * rules exactly: an unresolvable command is dropped, a provider expands in place, an empty
 * submenu disappears (that is how `Add ▸ Custom Mesh Instances` hides itself), and leading
 * / trailing / doubled separators are collapsed.
 *
 * `_revision` is unused on purpose — it is the argument that forces a fresh evaluation of
 * every predicate and provider after a toggle row runs.
 */
function resolveRows(entries: MenuEntry[], _revision: number): DrillRow[] {
  const rows: DrillRow[] = [];

  for (const [index, entry] of entries.entries()) {
    switch (entry.kind) {
      case 'separator':
        rows.push({ kind: 'separator', key: `separator-${index}` });
        break;

      case 'command':
      case 'checkbox':
      case 'radio': {
        const command = getCommand(entry.commandId);
        if (!command) break;
        const title = (entry.kind === 'command' && entry.dynamicTitle?.()) || command.title;
        rows.push(commandRow(command, title, entry.kind === 'command' ? null : entry.kind));
        break;
      }

      case 'provider':
        for (const command of providerCommands(entry.providerId)) {
          rows.push(commandRow(command, command.title, null));
        }
        break;

      case 'submenu':
        if (!hasRows(entry.entries)) break;
        rows.push({ kind: 'submenu', key: entry.id, label: entry.label, entries: entry.entries });
        break;
    }
  }

  return collapseSeparators(rows);
}

/** Whether a level would render anything — the empty-submenu hide rule, one level deeper. */
function hasRows(entries: MenuEntry[]): boolean {
  return entries.some((entry) => {
    switch (entry.kind) {
      case 'separator':
        return false;
      case 'provider':
        return providerCommands(entry.providerId).length > 0;
      case 'submenu':
        return hasRows(entry.entries);
      default:
        return getCommand(entry.commandId) !== undefined;
    }
  });
}

function commandRow(
  command: Command,
  title: string,
  kind: 'checkbox' | 'radio' | null,
): CommandRow {
  const disabled = command.enabled?.() === false;
  return {
    kind: 'command',
    key: command.id,
    command,
    title,
    glyph: kind,
    checked: command.checked?.() === true,
    disabled,
    reason: disabled ? command.disabledReason : undefined,
  };
}

function collapseSeparators(rows: DrillRow[]): DrillRow[] {
  const kept: DrillRow[] = [];
  let pending: DrillRow | null = null;
  for (const row of rows) {
    if (row.kind === 'separator') {
      if (kept.length > 0) pending = row;
      continue;
    }
    if (pending) {
      kept.push(pending);
      pending = null;
    }
    kept.push(row);
  }
  return kept;
}
