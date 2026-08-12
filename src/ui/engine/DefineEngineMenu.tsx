import { useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Selection } from 'react-aria-components';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  Button,
  GridList,
  GridListItem,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  SectionTitle,
  noteBox,
} from '../kit';
import {
  defineTargetsOf,
  engineKindSpec,
  ENGINE_KINDS,
  PART_TARGET_KEY,
  type DefineTarget,
} from './defineEngineModel';
import {
  $part,
  addEngine,
  addRcsEngine,
  addSolidEngine,
  addSrbEngine,
} from '../../state/editorStore';
import {
  activateEngine,
  closeDefineEngineFlow,
  focusModule,
  openDefineEngineFlow,
  type EngineDefineKind,
  type EngineEntry,
} from '../../state/engineStore';
import { openDialog } from '../../state/dialogStore';

/**
 * **"Define new engine ▸"** — the four-kind creation flow (design:
 * design-data-engine-modes.md §B3.1, decisions D12 + D13).
 *
 * Three surfaces over one store atom (`$engineDefineFlow`): the header's `＋▾` menu, the
 * pushed **kind chooser** (what `Add ▸ Define Engine…` lands on, since a cross-mode jump
 * cannot open a react-aria menu without an effect writing state), and the pushed **target
 * picker**. Both pushed views live INSIDE the navigator (D13) — defining an engine is the
 * mode's own job, not a detour into a dialog.
 *
 * **Undo enrollment**: each composite is ONE push in `editorStore` (`'define engine'` /
 * `'define RCS thruster'` / `'define solid motor'` / `'define SRB'`). Nothing here adds a
 * second step, so ⌘Z once removes the whole engine.
 */

/** The `＋▾` trigger in the navigator header, and the empty state's primary action. */
export function DefineEngineMenu({
  label = 'Define new engine',
  variant = 'icon',
}: {
  label?: string;
  variant?: 'icon' | 'button';
}) {
  return (
    <MenuTrigger>
      {variant === 'icon' ? (
        <Button iconOnly size="xs" variant="ghost" className="shrink-0" aria-label={label}>
          <Plus size={13} />
        </Button>
      ) : (
        <Button size="sm" variant="primary" className="shrink-0">
          <Plus size={13} /> {label}
        </Button>
      )}
      {/* The Popover MOUNTS the body, so the items are rebuilt on every open (React Compiler
          would otherwise freeze anything conditional inside them at their first-open value). */}
      <Popover className="w-80">
        <Menu aria-label={label}>
          {ENGINE_KINDS.map((spec) => (
            <MenuItem
              key={spec.kind}
              id={spec.kind}
              density="dense"
              textValue={spec.title}
              onAction={() => openDefineEngineFlow(spec.kind)}
              // The legacy preset is separated by a rule, not hidden: RULE ZERO keeps it,
              // D12 asks it to be labeled.
              className={spec.legacy ? 'border-t border-border' : undefined}
            >
              <KindLabel title={spec.title} description={spec.description} />
            </MenuItem>
          ))}
          {/* The guided alternative to the four quick presets above — additive, it replaces
              nothing (plan: ENGINE_WIZARD_PLAN.md D1). */}
          <MenuSeparator />
          <MenuItem
            id="engine-wizard"
            density="dense"
            textValue="Engine wizard…"
            onAction={() => openDialog({ id: 'engine-wizard' })}
          >
            <KindLabel
              title="Engine wizard…"
              description="Step-by-step: geometry, propellants, thrust, effects."
            />
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

function KindLabel({ title, description }: { title: string; description: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-xs text-fg">{title}</span>
      <span className="text-[11px] leading-snug text-fg-subtle">{description}</span>
    </span>
  );
}

/**
 * The pushed kind CHOOSER — the same four items as the menu, as a list. It is what a
 * cross-mode `{defineNew: true}` jump lands on (`Add ▸ Define Engine…`, Data's "Add engine
 * (thrust chamber) →"), because programmatically opening a menu would need the
 * `useEffect` + `setState` pattern this project bans.
 */
export function DefineEngineKindChooser({ templateId }: { templateId: string | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <Button size="xs" variant="ghost" className="shrink-0" onPress={closeDefineEngineFlow}>
          <ChevronLeft size={12} /> Back
        </Button>
        <SectionTitle className="min-w-0 flex-1 truncate">Define new engine</SectionTitle>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {ENGINE_KINDS.map((spec) => (
          <button
            key={spec.kind}
            type="button"
            className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-border p-2 text-left hover:border-border-strong ${spec.legacy ? 'opacity-80' : ''}`}
            onClick={() => openDefineEngineFlow(spec.kind, templateId)}
          >
            <KindLabel title={spec.title} description={spec.description} />
            <ChevronRight size={12} className="shrink-0 text-fg-subtle" />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The pushed target-picker view. Confirming runs the matching composite, activates the new
 * scope and focuses its first module, so the left editor already has something to edit.
 */
export function DefineEngineTargetPicker({
  kind,
  seedTemplateId,
  engineTemplateIds,
}: {
  kind: EngineDefineKind;
  /** Template the jump payload named (Add ▸ Define Engine…, Data's "add engine"). */
  seedTemplateId: string | null;
  engineTemplateIds: ReadonlySet<string>;
}) {
  const part = useStore($part);
  const spec = engineKindSpec(kind);
  const targets = defineTargetsOf(part, engineTemplateIds);
  const [selected, setSelected] = useState<string | null>(
    seedTemplateId && targets.some((t) => t.templateId === seedTemplateId)
      ? seedTemplateId
      : (targets[0]?.templateId ?? (spec.allowsPartLevel ? PART_TARGET_KEY : null)),
  );
  const [instances, setInstances] = useState<Readonly<Record<string, string>>>({});

  const rows: DefineTarget[] = spec.allowsPartLevel
    ? [{ templateId: PART_TARGET_KEY, instanceIds: [] }, ...targets]
    : targets;

  const confirm = () => {
    if (!selected) return;
    if (selected === PART_TARGET_KEY) {
      const index = part.gameData.combustors.length;
      addRcsEngine(null, null);
      activateEngine({ kind: 'part' });
      focusModule({ group: 'combustor', scope: 'part', index });
      return;
    }
    const target = targets.find((t) => t.templateId === selected);
    if (!target) return;
    const instanceId = instances[selected] ?? target.instanceIds[0] ?? null;
    if (kind === 'liquid') addEngine(target.templateId, instanceId);
    else if (kind === 'rcs') addRcsEngine(target.templateId, instanceId);
    else if (kind === 'solid') addSolidEngine(target.templateId, instanceId);
    else addSrbEngine(target.templateId, instanceId);
    const entry: EngineEntry = { kind: 'subpart', templateId: target.templateId };
    // `activateEngine` closes this flow, so the focus below lands on the tree behind it.
    activateEngine(entry);
    focusModule({ group: kind === 'solid' ? 'solidMotor' : 'combustor', scope: 'sub', index: 0 });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <Button size="xs" variant="ghost" className="shrink-0" onPress={closeDefineEngineFlow}>
          <ChevronLeft size={12} /> Back
        </Button>
        <SectionTitle className="min-w-0 flex-1 truncate">{spec.title}</SectionTitle>
      </div>
      <p className="px-1 text-[11px] leading-snug text-fg-subtle">{spec.description}</p>

      {rows.length === 0 ? (
        <div className={noteBox}>
          Every placed SubPart already carries engine hardware. Place another one in Build mode, or
          open the existing engine from the scope select.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <GridList
            aria-label="Define the engine on"
            selectionMode="single"
            selectionBehavior="replace"
            disallowEmptySelection
            items={rows}
            selectedKeys={selected ? new Set([selected]) : new Set<string>()}
            onSelectionChange={(selection: Selection) => {
              if (selection === 'all') return;
              const key = [...selection][0];
              if (key !== undefined) setSelected(String(key));
            }}
            dependencies={[rows, selected, instances]}
            className="flex flex-col gap-0.5 outline-none"
          >
            {(row: DefineTarget) => (
              <GridListItem id={row.templateId} density="dense" textValue={row.templateId}>
                <div className="flex w-full min-w-0 items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-xs text-fg">
                    {row.templateId === PART_TARGET_KEY
                      ? 'Part-level (the part itself)'
                      : row.templateId}
                  </span>
                  {row.instanceIds.length > 1 ? (
                    <>
                      <span className="shrink-0 text-[11px] text-fg-subtle">
                        ×{row.instanceIds.length}
                      </span>
                      {/* A react-aria Select inside a GridList row crashes; a Menu is the
                          supported embedded control. */}
                      <MenuTrigger>
                        <Button size="xs" variant="ghost" className="shrink-0">
                          controller drives: {instances[row.templateId] ?? row.instanceIds[0]} ▾
                        </Button>
                        <Popover className="w-56">
                          <Menu aria-label="Controller instance">
                            {row.instanceIds.map((id) => (
                              <MenuItem
                                key={id}
                                id={id}
                                density="dense"
                                textValue={id}
                                onAction={() =>
                                  setInstances((current) => ({ ...current, [row.templateId]: id }))
                                }
                              >
                                {id}
                              </MenuItem>
                            ))}
                          </Menu>
                        </Popover>
                      </MenuTrigger>
                    </>
                  ) : (
                    row.instanceIds.length === 1 && (
                      <span className="shrink-0 text-[11px] text-fg-subtle">
                        {row.instanceIds[0]}
                      </span>
                    )
                  )}
                </div>
              </GridListItem>
            )}
          </GridList>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="primary" isDisabled={!selected} onPress={confirm}>
          Define {spec.title.toLowerCase()}
        </Button>
        <Button size="sm" variant="ghost" onPress={closeDefineEngineFlow}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
