import { useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { useHotkeys } from 'react-hotkeys-hook';
import { X } from 'lucide-react';
import { $chainSession, addChainOp, closeChain, type ChainOpKind } from '../../state/chainStore';
import { applyActionChain, type ChainCommitEntry } from '../../state/editorStore';
import { $chainEval } from '../../three/chainEval';
import { PREVIEW_MAX_GHOSTS } from '../../three/ChainPreviewLayer';
import { Button, GridList, GridListItem, SearchField, cn, toast, useIsPhone } from '../kit';
import { keyLabel } from '../hotkeys/keyDisplay';
import { CHAIN_COMMANDS, type ChainCommandDef } from './chainCommands';
import { ChainStepCard } from './ChainStepCard';

const CHROME =
  'rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md';

/**
 * The action-chain command palette: a floating, NON-MODAL card over the viewport that
 * builds a list of steps and applies them to the frozen seed selection in one undo step.
 *
 * Non-modal on purpose — orbiting, gizmo drags, rotate/nudge keys and undo all stay live
 * while it is open, and because the preview re-evaluates from the CURRENT document,
 * tweaking a seed while watching the array re-flow is the whole point of the feature.
 *
 * The card is left-anchored so it never fights the right-side inspector; on a phone it
 * becomes a bottom sheet above the inspector FAB (the FloatingEditorPanel split).
 *
 * Self-gating: it renders nothing without a session, so `app.tsx` can mount it
 * unconditionally. Nothing here touches the document — the only write is Apply.
 */
export function ChainPalette() {
  const session = useStore($chainSession);
  const evalState = useStore($chainEval);
  const isPhone = useIsPhone();
  const [query, setQuery] = useState('');
  // The kit SearchField owns its <input>, so reach it through the wrapper to restore
  // focus after a command is chosen (keeps type → Enter → type → Enter flowing).
  const searchRef = useRef<HTMLDivElement>(null);

  // Both handlers read the stores fresh instead of closing over render values, so the
  // callbacks react-hotkeys-hook memoises can never go stale — hence no dependency list.
  const apply = () => {
    const state = $chainEval.get();
    if (!state) return;
    const { result, resolvedSeedIds } = state;
    if (result.error !== null || result.instances.length === 0) return;

    const entries: ChainCommitEntry[] = result.instances.map((instance) => ({
      seedInstanceId: resolvedSeedIds[instance.seedIndex],
      transform: instance.transform,
      isSeed: instance.isSeed,
    }));
    const detail =
      result.newCount > 0 ? `+${result.newCount} SubParts` : `${result.totalInstances} transformed`;
    const created = applyActionChain(entries, detail);
    closeChain();
    // -1 means a seed vanished between the last recompute and this click — nothing was
    // committed and no undo entry was pushed, so say so rather than claiming success.
    if (created < 0) {
      toast({ title: 'Chain not applied — seeds no longer exist', variant: 'warning' });
      return;
    }
    toast({ title: `Applied chain · ${created > 0 ? `+${created} SubParts` : detail}` });
  };

  const cancel = () => closeChain();

  useHotkeys('mod+enter', apply, {
    enabled: session !== null,
    enableOnFormTags: true,
    preventDefault: true,
  });
  // No preventDefault: useNumberDraft swallows Escape while a field edit is dirty
  // (revert first, close second), and Escape must still reach dialogs/popovers.
  useHotkeys('escape', cancel, { enabled: session !== null, enableOnFormTags: true });

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
  const seedCount = session.seedIds.length;

  return (
    <div
      className={cn(
        'pointer-events-auto z-30 flex flex-col',
        isPhone
          ? 'absolute inset-x-2 bottom-20 max-h-[45vh]'
          : 'absolute left-3 top-16 max-h-[calc(100vh-8rem)] w-[340px]',
        CHROME,
      )}
    >
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle">Action chain</span>
        <span className="text-[11px] text-fg-muted">
          · {seedCount} {seedCount === 1 ? 'seed' : 'seeds'}
        </span>
        <span className="flex-1" />
        <Button size="sm" aria-label="Close" onPress={cancel}>
          <X size={14} />
        </Button>
      </div>

      <div ref={searchRef} className="shrink-0">
        <SearchField
          size="sm"
          aria-label="Add step"
          placeholder="Add step — translate, radial, grid…"
          value={query}
          onChange={setQuery}
          autoFocus
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
            <ChainStepCard key={op.id} op={op} index={i} total={session.ops.length} />
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
          <Button size="sm" variant="ghost" onPress={cancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            isDisabled={error !== null || totalInstances === 0}
            onPress={apply}
          >
            Apply {keyLabel('mod')}↵
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
