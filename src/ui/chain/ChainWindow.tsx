import { useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $chainSession, addChainOp, type ChainOpKind } from '../../state/chainStore';
import { $chainEval } from '../../three/chainEval';
import { PREVIEW_MAX_GHOSTS } from '../../three/ChainPreviewLayer';
import {
  Button,
  Dialog,
  FloatingWindow,
  GridList,
  GridListItem,
  SearchField,
  Sheet,
  cn,
  keyLabel,
  useIsPhone,
} from '../kit';
import { CHAIN_COMMANDS, type ChainCommandDef } from './chainCommands';
import { ChainStepCard } from './ChainStepCard';
import { applyChainSession } from './applyChainSession';
import { cancelChainSession } from './openChainPalette';

/**
 * The **Chain window** — one of exactly two floating windows v2 ships (foundation §6.2;
 * design-build-mode.md §9.2). It replaces v1's fixed-position `ChainPalette` card; the
 * guts (search + command list, step cards, footer counts) are the same, rehosted.
 *
 * **NON-MODAL by constitution** (DECISIONS.md standing constraints): orbiting, gizmo
 * drags, the W/S rotate keys, arrow nudge, undo and the measure tool all stay live while
 * it is open, and because `$chainEval` re-evaluates against the CURRENT document, nudging
 * a seed and watching the array re-flow is the whole point of the feature. There is
 * deliberately no focus trap, no overlay and no backdrop — on the phone too, which is why
 * the sheet below is `blocking={false}`.
 *
 * What the window ADDS over v1: a drag strip (position persisted in `flexo:layout` →
 * `float.chain`), a 300–420px resize handle, drag-reorder of steps by their ⠿ grip, and a
 * ✕ that asks before discarding a session with steps.
 *
 * **Its two keys are registry bindings, not component-local hooks** (design:
 * design-system-services §4.4): `⌘↩` is `chain.apply` at `surface:chain` scope (which is
 * active whenever a SESSION exists, regardless of focus), and Escape is rung 6 of the
 * Escape ladder — registered WITHOUT preventDefault so `useNumberDraft`'s dirty-field
 * revert still wins (v1 contract, verbatim).
 *
 * Self-gating: renders nothing without a session, so `app.tsx` mounts it unconditionally.
 * Nothing here touches the document — the only write is Apply.
 *
 * **Undo enrollment: NONE.** The session is ephemeral; `applyActionChain` pushes the ONE
 * step, from `applyChainSession`.
 */
export function ChainWindow() {
  const session = useStore($chainSession);
  const isPhone = useIsPhone();

  if (!session) return null;

  const seedCount = session.seedIds.length;

  // Phone: a 50% NON-blocking sheet (foundation §12 "Floating windows"). The session
  // survives dismiss/reopen because it lives in the store, not in this component.
  if (isPhone) {
    return (
      <Sheet
        isOpen
        onOpenChange={(open) => {
          if (!open) cancelChainSession();
        }}
        detent="50"
        blocking={false}
        ariaLabel="Action chain"
      >
        <Dialog className="min-h-0 flex-1 overflow-y-auto p-2">
          <ChainBody phone />
        </Dialog>
      </Sheet>
    );
  }

  return (
    <FloatingWindow
      id="chain"
      title={`Action Chain — ${seedCount} ${seedCount === 1 ? 'seed' : 'seeds'}`}
      defaultAnchor={{ h: 'left', v: 'top', dx: 8, dy: 8 }}
      minSize={{ w: 300, h: 120 }}
      resizable={{ minW: 300, maxW: 420 }}
      onClose={cancelChainSession}
    >
      <div className="max-h-[70vh] p-2">
        <ChainBody />
      </div>
    </FloatingWindow>
  );
}

/**
 * The palette guts, shared verbatim by both hosts. Split out of {@link ChainWindow} so the
 * desktop window and the phone sheet mount the SAME component rather than two forks
 * (foundation §12: "no bespoke phone forks").
 */
function ChainBody({ phone = false }: { phone?: boolean }) {
  const session = useStore($chainSession);
  const evalState = useStore($chainEval);
  const [query, setQuery] = useState('');
  // The kit SearchField owns its <input>, so reach it through the wrapper to restore
  // focus after a command is chosen (keeps type → Enter → type → Enter flowing).
  const searchRef = useRef<HTMLDivElement>(null);

  if (!session) return null;

  const addStep = (kind: ChainOpKind) => {
    addChainOp(kind);
    setQuery('');
    searchRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  };

  const q = query.trim().toLowerCase();
  const commands = CHAIN_COMMANDS.filter(
    (c) => q === '' || c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q)),
  );
  // The command list is the palette's empty state: it stays up until there is at least
  // one step, then hides itself unless the user starts searching again.
  const showCommands = q !== '' || session.ops.length === 0;

  const result = evalState?.result;
  const error = result?.error ?? null;
  const totalInstances = result?.totalInstances ?? 0;
  const newCount = result?.newCount ?? 0;

  return (
    <div className="flex min-h-0 flex-col">
      <div ref={searchRef} className="shrink-0">
        <SearchField
          size="sm"
          aria-label="Add step"
          placeholder="Add step — translate, radial, grid…"
          value={query}
          onChange={setQuery}
          // Never on touch: an autofocused field raises the software keyboard over the
          // viewport the session exists to keep visible (the browsers' phone rule, §11.5).
          autoFocus={!phone}
        />
      </div>

      {showCommands && (
        <div className="mt-2 shrink-0 rounded-lg border border-border bg-panel-sunken">
          <GridList
            aria-label="Chain commands"
            selectionMode="none"
            items={commands}
            dependencies={[query]}
            onAction={(key) => addStep(key as ChainOpKind)}
            renderEmptyState={() => (
              <span className="block px-2 py-2 text-xs text-fg-subtle">No matching steps</span>
            )}
          >
            {(command: ChainCommandDef) => (
              <GridListItem id={command.kind} textValue={command.label} className="items-start">
                <CommandRow command={command} />
              </GridListItem>
            )}
          </GridList>
        </div>
      )}

      {session.ops.length > 0 && (
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {session.ops.map((op, i) => (
            <ChainStepCard
              key={op.id}
              op={op}
              index={i}
              total={session.ops.length}
              // Touch drag between sheet rows is unreliable, so the phone reorders with the
              // ▲▼ chevrons only (design-build-mode.md §11 item 5).
              reorderable={!phone}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex shrink-0 flex-col gap-2">
        <span className={cn('text-xs', error ? 'text-danger' : 'text-fg-muted')}>
          {error ?? (
            <>
              {totalInstances} instances · +{newCount} new
              {/* Ghosts are capped; the chain still APPLIES in full, so say which one the
                  user is looking at. Instance count is the ceiling on ghosts, so this can
                  read one instance early — cheaper than tracking the layer's real tally. */}
              {totalInstances > PREVIEW_MAX_GHOSTS && (
                <span className="text-fg-subtle"> · preview capped at {PREVIEW_MAX_GHOSTS}</span>
              )}
            </>
          )}
        </span>
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onPress={cancelChainSession}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            isDisabled={error !== null || totalInstances === 0}
            onPress={applyChainSession}
          >
            {/* No ⌘↩ on touch — the chord does not exist there (design §11 item 5). */}
            Apply {phone ? '' : `${keyLabel('mod')}↵`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Icon + label + one-line description, the body of a command row. */
function CommandRow({ command }: { command: ChainCommandDef }) {
  const Icon = command.icon;
  return (
    <>
      <Icon size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs">{command.label}</span>
        <span className="truncate text-[11px] text-fg-subtle">{command.description}</span>
      </div>
    </>
  );
}
