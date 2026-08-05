import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { persistentJSON } from '@nanostores/persistent';
import {
  Dialog,
  DialogHeader,
  DisclosureSection,
  Kbd,
  keyLabel,
  Modal,
  noteBox,
  SectionTitle,
  useIsPhone,
} from '../kit';
import { ALL_BINDINGS, type HotkeyBinding, type KeyChord } from './registry';
import {
  escLadderRows,
  NUMERIC_FIELD_SECTION,
  OUTLINER_SECTION,
  PALETTE_SECTION,
  POINTER_SECTION,
  type HelpStaticSection,
} from './helpStatics';
import { MODES, TOOLS, type Tool } from '../../state/modeStore';
import { SURFACE_IDS, type SurfaceId } from '../../state/hotkeyStore';

/**
 * **Keyboard Shortcuts** (design: `design-system-services.md` §5.1; foundation §11.5) —
 * root-hosted by `DialogRoot` under the dialog id `'help'`, opened by `?`, the Help menu or
 * the palette.
 *
 * ## It is GENERATED, not written
 *
 * Every shortcut row comes from the scoped registry (`registry.ts`), grouped by the
 * binding's `scope` with a human title. v1's help was a hand-maintained parallel table and
 * it drifted the moment a binding moved (census: ui-kit-hotkeys.md §4 pain 2). Now a rebind
 * is a one-line registry edit that moves the menu chip, the palette chip and this row
 * together.
 *
 * Only the four things the registry genuinely cannot describe are hand-authored, and they
 * live in `helpStatics.ts` beside it: pointer gestures, the numeric fields' own keys, the
 * Escape ladder as an ordered list, and the palette's component-local navigation keys.
 *
 * ## Scope-INACTIVE groups still render
 *
 * Help is documentation, not a live readout: it never reads `$activeScopes`, `$mode` or the
 * armed tool, so "Animation mode" and "Chain window" are listed while you are standing in
 * Build mode with no chain open. Groups with no bindings at all are skipped instead of
 * showing placeholder rows — a deferred surface appears the phase its keys land.
 *
 * That purity is also what keeps the dialog safe under React Compiler: there are no
 * predicates to re-evaluate per open, so nothing can freeze into a stale first render (the
 * trap the menus solve by rendering their body inside a react-aria Popover).
 *
 * Undo enrollment: NONE.
 */

/** Human titles for the tool scopes. Exhaustive by type — a new `Tool` must name itself. */
const TOOL_TITLES: Record<Tool, string> = {
  measure: 'While measuring',
  'seat-view': 'Seat view',
  exhaust: 'Placing exhaust',
  marquee: 'Box select',
  'member-paint': 'Painting members',
  'pivot-pick': 'Picking a pivot',
};

/** Human titles for the focusable surfaces. Exhaustive by type. */
const SURFACE_TITLES: Record<SurfaceId, string> = {
  chain: 'Chain window',
  palette: 'Command palette',
  timeline: 'Timeline',
  outliner: 'Outliner',
  'data-navigator': 'Data navigator',
  'engine-tree': 'Engine module tree',
  members: 'Members view',
  'glow-paint': 'Glow paint',
};

/**
 * Every scope Help knows how to title, in display order: the two ambient scopes, then the
 * five modes, the six tools and the eight surfaces. Built from `MODES` / `TOOLS` /
 * `SURFACE_IDS` so a scope can never exist without a home here.
 */
const GROUP_ORDER: readonly { scope: string; title: string }[] = [
  { scope: 'global', title: 'Everywhere' },
  { scope: 'viewport', title: 'In the viewport' },
  ...MODES.map((mode) => ({ scope: `mode:${mode.id}`, title: `${mode.label} mode` })),
  ...TOOLS.map((tool) => ({ scope: `tool:${tool}`, title: TOOL_TITLES[tool] })),
  ...SURFACE_IDS.map((surface) => ({
    scope: `surface:${surface}`,
    title: SURFACE_TITLES[surface],
  })),
];

interface HelpGroup {
  title: string;
  bindings: HotkeyBinding[];
}

/** The registry, bucketed by scope in {@link GROUP_ORDER}. Empty groups are dropped. */
function helpGroups(): HelpGroup[] {
  const groups: HelpGroup[] = [];
  for (const { scope, title } of GROUP_ORDER) {
    const bindings = ALL_BINDINGS.filter((binding) => binding.scope === scope);
    if (bindings.length > 0) groups.push({ title, bindings });
  }
  return groups;
}

/** The rebind notice stays prominent for this long after the user first sees it (design §5.1). */
const REBIND_NOTICE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * When the user first opened a v2 Help, as epoch ms (`0` = never). Dialog-local preference
 * state, so it lives with the dialog rather than in `src/state/` — nothing else reads it.
 */
const $rebindNoticeSeen = persistentJSON<number>('flexo:rebindNoticeSeen', 0);

/** Read once at module init: `Date.now()` may never be called from a render body. */
const LOADED_AT = Date.now();

export function HelpDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isPhone = useIsPhone();
  const close = () => onOpenChange(false);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      variant={isPhone ? 'cover' : 'fullscreen'}
    >
      <Dialog aria-label="Keyboard shortcuts">
        <DialogHeader title="Keyboard Shortcuts" onClose={close} />
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          <RebindNotice />
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            {helpGroups().map((group) => (
              <section key={group.title} className="flex flex-col gap-2">
                <SectionTitle>{group.title}</SectionTitle>
                <Rows>
                  {group.bindings.map((binding) => (
                    <Row key={binding.id} text={binding.label} chords={binding.chords} />
                  ))}
                </Rows>
              </section>
            ))}

            <StaticSection section={POINTER_SECTION} />
            <StaticSection section={NUMERIC_FIELD_SECTION} />
            <EscSection />
            <StaticSection section={PALETTE_SECTION} />
            <StaticSection section={OUTLINER_SECTION} />
          </div>
        </div>
        <p className="shrink-0 border-t border-border px-4 py-2.5 text-xs text-fg-subtle">
          Shortcuts are disabled while typing in a text field. Press <Kbd>?</Kbd> any time to open
          this panel.
        </p>
      </Dialog>
    </Modal>
  );
}

/** The v1 → v2 rebind diff (design §5.1): loud for 30 days, then folded away. */
function RebindNotice() {
  const seen = useStore($rebindNoticeSeen);

  // Stamping is a side effect, so it belongs in an effect and not the render body. The
  // dialog only mounts while open, which is exactly "first seen".
  useEffect(() => {
    if ($rebindNoticeSeen.get() === 0) $rebindNoticeSeen.set(Date.now());
  }, []);

  const fresh = seen === 0 || LOADED_AT - seen < REBIND_NOTICE_MS;

  if (fresh) {
    return (
      <div className={`${noteBox} mb-6 text-xs`}>
        <div className="mb-1 font-medium text-fg">Two keys moved</div>
        <RebindDiff />
      </div>
    );
  }
  return (
    <div className="mb-6">
      <DisclosureSection title="Keys that moved from the old layout">
        <div className="text-xs text-fg-muted">
          <RebindDiff />
        </div>
      </DisclosureSection>
    </div>
  );
}

function RebindDiff() {
  return (
    <ul className="flex flex-col gap-1">
      <li>
        <Kbd>F</Kbd> now frames the selection — the rotation step moved to <Kbd>[</Kbd> <Kbd>]</Kbd>
        .
      </li>
      <li>
        <Kbd>{keyLabel('mod')}</Kbd>
        <Kbd>K</Kbd> now opens the command palette — the action chain moved to{' '}
        <Kbd>{keyLabel('mod')}</Kbd>
        <Kbd>{keyLabel('shift')}</Kbd>
        <Kbd>K</Kbd>.
      </li>
    </ul>
  );
}

function StaticSection({ section }: { section: HelpStaticSection }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>{section.title}</SectionTitle>
      <Rows>
        {section.rows.map((row, i) => (
          <Row key={i} text={row.text} chords={row.chords} />
        ))}
      </Rows>
      {section.note && <p className="text-xs text-fg-subtle">{section.note}</p>}
    </section>
  );
}

/** "What Esc does" — the ladder, in order, with the rung numbers visible. */
function EscSection() {
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>What Esc does, in order</SectionTitle>
      <div className="overflow-hidden rounded-lg border border-border/60">
        {escLadderRows().map((row) => (
          <div
            key={row.rung}
            className="flex items-baseline gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
          >
            <span className="w-4 shrink-0 text-right text-xs tabular-nums text-fg-subtle">
              {row.rung}
            </span>
            <span className="min-w-0 flex-1 text-sm text-fg">{row.label}</span>
            <span className="shrink-0 text-xs text-fg-subtle">{row.owner}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-fg-subtle">
        The first rung that applies wins; the rest are left alone.
      </p>
    </section>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-lg border border-border/60">{children}</div>;
}

function Row({ text, chords }: { text: string; chords: KeyChord[] }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 px-3 py-2 last:border-b-0">
      <span className="text-sm text-fg">{text}</span>
      <Chords chords={chords} />
    </div>
  );
}

/** Renders one or more chords as <kbd> chips, alternatives joined by "or". */
function Chords({ chords }: { chords: KeyChord[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {chords.map((chord, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-xs text-fg-subtle">or</span>}
          <span className="flex items-center gap-1">
            {chord.map((token, j) => (
              <Kbd key={j}>{keyLabel(token)}</Kbd>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
