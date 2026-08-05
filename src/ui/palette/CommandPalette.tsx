import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Search } from 'lucide-react';
import { Dialog, inputStyles, Kbd, keyLabel, MenuShortcut, Modal, useIsPhone } from '../kit';
import {
  $paletteOpen,
  $paletteRecents,
  allCommands,
  allDynamicCommands,
  closePalette,
  getCommand,
  recordRecent,
  runCommand,
  type Command,
} from '../../state/commandStore';
import { chordsFor } from '../commands/chords';
import { MODES } from '../../state/modeStore';
import { fuzzyMatch } from '../fuzzyMatch';

/**
 * The ⌘K command palette (design: `plans/flexo_v2/design/foundation.md` §11.3 — LOCKED;
 * `design-system-services.md` §3). One fuzzy search over the WHOLE command registry:
 * every menubar item, the five mode switches, tool arming, and every dynamic provider row
 * (seats, layers, projects, history jumps, custom meshes, mods-folder actions).
 *
 * **Non-goals, restated** (foundation-locked): no free-text math, no document-entity
 * search — the Outliner owns finding things in the document — and no file-content search.
 *
 * **Virtual focus.** The input keeps DOM focus for the whole session and the result list is
 * a plain `aria-activedescendant` listbox, so typing always edits the field. It is
 * deliberately NOT a react-aria Autocomplete/ListBox with real focus: that is the pattern
 * the hotkey typing-guard exists to work around (census: ui-kit-hotkeys.md §1.3). The raw
 * `<input>` (styled with the kit's `inputStyles`) is what lets the combobox roles and
 * `aria-activedescendant` land on the element that actually has focus.
 *
 * **Escape** closes the palette — ladder rung 3 (foundation §11.4) — handled here rather
 * than by react-aria's dismiss because the input owns the key.
 *
 * Undo enrollment: NONE. Running a command dispatches to a mutator that already owns its
 * `pushUndo`; palette open state and recents are never undoable.
 */

interface PaletteRow {
  command: Command;
  /** Half-open spans of the TITLE to highlight; empty when the query only hit keywords. */
  ranges: [number, number][];
  score: number;
  /** Section heading rendered above this row, on the empty-query view only. */
  section?: string;
}

export function CommandPalette() {
  const open = useStore($paletteOpen);
  // Remounts on every open, so query/selection always start fresh and the dynamic
  // providers are re-evaluated from scratch.
  return open ? <PaletteSession /> : null;
}

function PaletteSession() {
  const isPhone = useIsPhone();
  const recents = useStore($paletteRecents);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  // Bumped after every run so a keep-open invocation re-reads the dynamic providers and
  // every enabled/checked predicate (the row list is otherwise a pure function of `query`).
  const [revision, setRevision] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = buildRows(query, recents, revision);
  const index = rows.length === 0 ? -1 : Math.min(selected, rows.length - 1);

  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index, query]);

  function activate(row: PaletteRow | undefined, keepOpen: boolean) {
    if (!row) return;
    if (!runCommand(row.command.id)) return;
    recordRecent(row.command.id);
    if (keepOpen && row.command.keepOpen && !isPhone) setRevision((value) => value + 1);
    else closePalette();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePalette();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rows.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSelected(
        (current) => (Math.min(current, rows.length - 1) + step + rows.length) % rows.length,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activate(rows[index], event.metaKey || event.ctrlKey);
    }
  }

  return (
    <Modal
      variant={isPhone ? 'cover' : 'palette'}
      isOpen
      isDismissable
      onOpenChange={(value) => {
        if (!value) closePalette();
      }}
    >
      <Dialog aria-label="Command palette" className="min-h-0 flex-1">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <Search size={14} className="shrink-0 text-fg-subtle" />
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-activedescendant={index >= 0 ? rowId(index) : undefined}
            aria-label="Search commands"
            placeholder="Search commands…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
            className={inputStyles({
              size: 'sm',
              className: 'border-0 bg-transparent px-0 text-sm focus:outline-none',
            })}
          />
        </div>

        <div
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto p-1"
        >
          {rows.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-fg-subtle">No matching commands</div>
          )}
          {rows.map((row, rowIndex) => (
            <PaletteRowView
              key={row.command.id}
              row={row}
              index={rowIndex}
              isSelected={rowIndex === index}
              onRun={() => activate(row, false)}
            />
          ))}
        </div>

        {!isPhone && (
          <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-1.5 text-[11px] text-fg-subtle">
            <span className="flex items-center gap-1">
              <Kbd>↩</Kbd> run
            </span>
            <span className="flex items-center gap-1">
              <Kbd>{keyLabel('mod')}</Kbd>
              <Kbd>↩</Kbd> run &amp; keep open
            </span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd> close
            </span>
          </div>
        )}
      </Dialog>
    </Modal>
  );
}

function rowId(index: number): string {
  return `command-palette-row-${index}`;
}

function PaletteRowView({
  row,
  index,
  isSelected,
  onRun,
}: {
  row: PaletteRow;
  index: number;
  isSelected: boolean;
  onRun: () => void;
}) {
  const disabled = row.command.enabled?.() === false;
  const subtitle = row.command.menuPath ?? '';
  const reason = disabled ? (row.command.disabledReason ?? 'unavailable') : '';

  return (
    <>
      {row.section && (
        <div
          role="presentation"
          className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
        >
          {row.section}
        </div>
      )}
      <div
        id={rowId(index)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={disabled || undefined}
        data-selected={isSelected}
        onClick={disabled ? undefined : onRun}
        className={`flex cursor-default select-none items-center gap-2 rounded-md px-2 py-(--density-row-py) text-xs ${
          isSelected ? 'bg-wash-selected' : 'hover:bg-wash-hover'
        } ${disabled ? 'opacity-45' : ''}`}
      >
        <span className="min-w-0 flex-1 truncate">
          <Highlighted text={row.command.title} ranges={row.ranges} />
        </span>
        {(subtitle || reason) && (
          <span className="shrink-0 text-fg-subtle">
            {subtitle}
            {reason && ` — ${reason}`}
          </span>
        )}
        <MenuShortcut chords={chordsFor(row.command.id)} />
      </div>
    </>
  );
}

/** Renders `text` with the matched spans emphasized. */
function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className="bg-transparent font-semibold text-accent">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/**
 * The row list.
 *
 * Empty query (design §3.4): **Recent** (the persisted ids that still resolve — a deleted
 * layer's dynamic id is silently skipped) then the five **Modes**, and nothing else.
 *
 * With a query: every static command ∪ every dynamic provider row, matched against
 * `title + ' ' + menuPath + ' ' + keywords`, sorted by score then title. A title hit always
 * beats the same hit inside the longer haystack (the score normalizes by target length), so
 * the title is scored first and the concatenated haystack only decides whether a
 * keyword-only match makes the list at all.
 *
 * `revision` is unused on purpose: it is the argument that forces a re-evaluation of the
 * live providers and predicates after a keep-open run.
 */
function buildRows(query: string, recents: string[], _revision: number): PaletteRow[] {
  if (query.trim().length === 0) {
    const rows: PaletteRow[] = [];
    const seen = new Set<string>();
    for (const id of Array.isArray(recents) ? recents : []) {
      const command = getCommand(id);
      if (!command || seen.has(id)) continue;
      seen.add(id);
      rows.push({
        command,
        ranges: [],
        score: 0,
        section: rows.length === 0 ? 'Recent' : undefined,
      });
    }
    const modeRows: PaletteRow[] = [];
    for (const mode of MODES) {
      const command = getCommand(`mode.${mode.id}`);
      if (!command || seen.has(command.id)) continue;
      seen.add(command.id);
      modeRows.push({
        command,
        ranges: [],
        score: 0,
        section: modeRows.length === 0 ? 'Modes' : undefined,
      });
    }
    return [...rows, ...modeRows];
  }

  const rows: PaletteRow[] = [];
  for (const command of [...allCommands(), ...allDynamicCommands()]) {
    const titleMatch = fuzzyMatch(query, command.title);
    if (titleMatch) {
      rows.push({ command, ranges: titleMatch.ranges, score: titleMatch.score });
      continue;
    }
    const haystack = `${command.title} ${command.menuPath ?? ''} ${command.keywords ?? ''}`;
    const wideMatch = fuzzyMatch(query, haystack);
    if (wideMatch) rows.push({ command, ranges: [], score: wideMatch.score });
  }
  rows.sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title));
  return rows;
}
