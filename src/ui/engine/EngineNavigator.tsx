import { useStore } from '@nanostores/react';
import { Button, ListBoxItem, Select, panelChrome, useIsPhone } from '../kit';
import { ModuleTree } from './ModuleTree';
import { PerformanceCard, PerformanceHeadline } from './PerformanceCard';
import { IssuesSection } from './IssuesSection';
import { ExhaustSection } from './ExhaustSection';
import {
  DefineEngineKindChooser,
  DefineEngineMenu,
  DefineEngineTargetPicker,
} from './DefineEngineMenu';
import { totalModuleCount } from './moduleTreeModel';
import { $part } from '../../state/editorStore';
import { setMode } from '../../state/modeStore';
import {
  $activeEngineEntry,
  $engineDefineFlow,
  $engineEntries,
  activateEngine,
  engineEntryFromKey,
  engineEntryKey,
  engineEntryLabel,
} from '../../state/engineStore';
import { $partScopeName } from '../../state/partsStore';

/**
 * **The Engine Navigator** — Engine mode's right sidebar (design:
 * design-data-engine-modes.md §B3; foundation §8.4, §15.4).
 *
 * Five stacked blocks, in the order the wireframe fixes them: the scope select + define-new
 * menu, the module tree, the live Performance card, the always-visible ISSUES section, and
 * the Exhaust chips. Together they are the whole answer to *what is this engine made of, is
 * it any good, and is it going to load* — which is what makes the mode SELF-SUFFICIENT
 * (LOCKED #1): finishing an engine, plumbing included, never forces leaving it.
 *
 * The define-new flow pushes its target picker INTO this panel (D13), replacing the four
 * lower blocks rather than opening a dialog over them.
 *
 * **Undo enrollment: NONE of its own.** Scope selection and the picker are ephemeral designer
 * state (§B11); the composites the picker runs each push exactly one step.
 */
export function EngineNavigator() {
  const part = useStore($part);
  const isPhone = useIsPhone();
  const entries = useStore($engineEntries);
  const active = useStore($activeEngineEntry);
  // The define-new flow is STORE state, so a cross-mode jump (`Add ▸ Define Engine…`, Data's
  // "Add engine (thrust chamber) →") can open it from outside React without an effect
  // copying an intent into component state.
  const flow = useStore($engineDefineFlow);
  // Null in a single-part project, so the labels below stay exactly as they were (I8).
  const partScopeName = useStore($partScopeName);

  const engineTemplateIds = new Set(
    entries.flatMap((e) => (e.kind === 'subpart' ? [e.templateId] : [])),
  );
  const activeKey = active ? engineEntryKey(active) : null;

  return (
    <div className={`${panelChrome} flex h-full min-h-0 flex-col gap-1.5 p-(--density-panel-p)`}>
      <div className="flex items-center gap-1 px-1">
        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Engine
        </span>
        <div className="min-w-0 flex-1">
          <Select
            size="xs"
            aria-label="Active engine scope"
            placeholder={entries.length > 0 ? 'Select an engine' : 'No engines yet'}
            value={activeKey}
            onChange={(k) => activateEngine(engineEntryFromKey(String(k)))}
          >
            {entries.map((entry) => {
              const key = engineEntryKey(entry);
              const label = engineEntryLabel(entry, part, partScopeName);
              return (
                <ListBoxItem key={key} id={key} textValue={label}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{label}</span>
                    <span className="text-[11px] text-fg-subtle">
                      {totalModuleCount(part, entry)} modules
                    </span>
                  </span>
                </ListBoxItem>
              );
            })}
          </Select>
        </div>
        <DefineEngineMenu />
      </div>

      {flow ? (
        flow.kind === null ? (
          <DefineEngineKindChooser templateId={flow.templateId} />
        ) : (
          <DefineEngineTargetPicker
            kind={flow.kind}
            seedTemplateId={flow.templateId}
            engineTemplateIds={engineTemplateIds}
          />
        )
      ) : entries.length === 0 ? (
        <EmptyState hasPlacements={part.placements.length > 0} />
      ) : (
        <>
          <ModuleTree />
          {/* Phone: the headline is the sheet's sticky footer so thrust and Isp stay visible
              while scrolling the tree (§B8); the full card stays where it is on desktop. */}
          {!isPhone && <PerformanceCard />}
          <IssuesSection />
          <ExhaustSection />
          {isPhone && (
            <>
              <PerformanceCard />
              <PerformanceHeadline className="sticky bottom-0" />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** The two empty states (design §B3.1 last bullet). */
function EmptyState({ hasPlacements }: { hasPlacements: boolean }) {
  if (!hasPlacements) {
    return (
      <div className="flex flex-col items-start gap-2 px-2 py-4">
        <p className="text-xs text-fg-subtle">
          Place a SubPart in Build mode first — an engine decorates a reused mesh, it adds no
          geometry of its own.
        </p>
        <Button size="sm" variant="secondary" onPress={() => setMode('build')}>
          Go to Build
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-4">
      <p className="text-xs leading-snug text-fg-subtle">
        No engines on this part yet. An engine is a combustor (or solid motor) plus a nozzle, bound
        by a <span className="font-mono">&lt;Rocket&gt;</span> and driven by a controller — defining
        one authors all of it in a single undoable step.
      </p>
      <DefineEngineMenu variant="button" label="Define new engine" />
    </div>
  );
}
