import { closeChain } from '../../state/chainStore';
import { applyActionChain, type ChainCommitEntry } from '../../state/editorStore';
import { $chainEval } from '../../three/chainEval';
import { toast } from '../toast';

/**
 * Commits the open action-chain session in ONE undo step, then closes it.
 *
 * Lifted out of `ChainPalette` so the `⌘↩` binding can live in the scoped hotkey registry
 * (`surface:chain`) instead of being a component-local `useHotkeys` invisible to Help
 * (design: `design-system-services.md` §4.4 "migrated INTO the registry"). It only ever
 * reads stores — never render values — which is exactly why the component could hand it
 * over unchanged; the footer button and the binding now call the same function.
 *
 * Undo enrollment: `applyActionChain` pushes the single step (see editorStore); nothing is
 * pushed when there is nothing to commit.
 */
export function applyChainSession(): void {
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
}
