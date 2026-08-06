import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Brush, ChevronDown, ChevronLeft, ChevronRight, Info, Plus, X } from 'lucide-react';
import {
  Button,
  Chip,
  ListBoxItem,
  Popover,
  PopoverDialog,
  SearchField,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  DialogTrigger,
  panelChrome,
  useIsPhone,
} from '../kit';
import { $part } from '../../state/editorStore';
import {
  $activeAnimation,
  $clipIssues,
  $memberHoverId,
  $memberPaintChanges,
  $membersView,
  addJoint,
  attachToJoint,
  closeMembersView,
  detachMembers,
  openMembersView,
} from '../../state/animationStore';
import { $activeTool, armTool, disarmTool } from '../../state/modeStore';
import { closePhoneSheets } from '../shell/phone/phoneSheets';
import { status, undoStatusAction } from '../../state/statusStore';
import { SubPartSetGrid } from '../SubPartSetGrid';
import type { SubPartSetFilter } from '../subPartSetModel';
import type { PartAnimation } from '../../ksa/types';
import { conflictClipsOf, jointOptions, ownershipOf } from './membershipModel';

/**
 * **The Members view** — Animation mode's docked, NON-modal joint-membership editor (design:
 * design-animation-mode.md §7; foundation §10.11 host split D1). While `$membersView.open` it
 * REPLACES the navigator body; the viewport stays live, which is the whole reason it is not a
 * dialog: member painting and the per-layer eye both need to be seen in 3D.
 *
 * It kills census pain 2. The target joint is a control INSIDE the view, so switching targets
 * keeps the checked set, the search, the filters and the scroll — a multi-joint rig (landing
 * legs, bay doors) is built in ONE session instead of N modal round-trips.
 *
 * **Undo enrollment:** the two footer buttons each push exactly one discrete step
 * (`attachToJoint` / `detachMembers`); painting pushes one per click. Everything else here —
 * the checked set, the query, the filter, the layer eyes — is view state.
 */
export function MembersView() {
  const view = useStore($membersView);
  const anim = useStore($activeAnimation);
  const part = useStore($part);
  const issues = useStore($clipIssues);
  const activeTool = useStore($activeTool);
  const isPhone = useIsPhone();
  // Rows changed by the last paint session, flashed once when the grid comes back into view
  // (design §14 row 3 — on the phone the sheet was dismissed while painting).
  const painted = useStore($memberPaintChanges);
  // Host-owned grid state: deliberately NOT keyed on the target joint, so switching targets
  // preserves it (the one-session multi-joint rig requirement, §7.2).
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SubPartSetFilter>('all');
  const [collapsedLayers, setCollapsedLayers] = useState<ReadonlySet<string>>(new Set());

  const target = anim?.joints.find((j) => j.id === view.targetJointId) ?? null;
  const ownership = ownershipOf(anim);
  const conflictClips = conflictClipsOf(part.animations, anim, issues[anim?.id ?? ''] ?? []);
  const painting = activeTool === 'member-paint';

  // Clearing a nanostore, not component state — so this is a legal effect (and the store is
  // what carries the ids across the sheet dismiss/reopen the phone flow performs).
  useEffect(() => {
    if (painted.length === 0) return;
    const timer = window.setTimeout(() => $memberPaintChanges.set([]), 1600);
    return () => window.clearTimeout(timer);
  }, [painted]);

  const checkedList = [...checked].filter((id) => part.placements.some((p) => p.instanceId === id));
  const checkedAssigned = checkedList.filter((id) => ownership.has(id)).length;

  const assign = () => {
    if (!anim || !target || checkedList.length === 0) return;
    const { attached, skipped } = attachToJoint(anim.id, target.id, checkedList);
    setChecked(new Set());
    status(
      skipped > 0
        ? `Attached ${attached} SubParts — ${skipped} skipped (KSA can only animate SubParts)`
        : `Attached ${attached} SubPart${attached === 1 ? '' : 's'} → ${target.name}`,
      { severity: skipped > 0 ? 'warning' : 'success', action: undoStatusAction() },
    );
  };

  const unassign = () => {
    if (!anim || checkedList.length === 0) return;
    const removed = detachMembers(anim.id, checkedList);
    setChecked(new Set());
    if (removed > 0) {
      status(`Unassigned ${removed} SubPart${removed === 1 ? '' : 's'}`, {
        severity: 'success',
        action: undoStatusAction(),
      });
    }
  };

  return (
    // `data-surface="members"` puts the view in the `surface:members` hotkey scope — its own
    // ⌘A (check-all) keeps precedence, and the ⌘C/⌘X/⌘V/⌘D/⌫/⇧⌘I edit mirrors keep reaching
    // the entity selection while rows have focus (foundation §11.1).
    <div
      data-surface="members"
      className={`${panelChrome} flex h-full min-h-0 flex-col gap-1.5 p-(--density-panel-p)`}
    >
      {/* Phone: the view is a PUSHED view inside the Panel sheet, so its header is one
          full-width `‹ Members` back row (foundation §12 "stacked views become pushed sheet
          views"). Desktop keeps the icon + title + ✕ takeover header. */}
      {isPhone ? (
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 justify-start gap-1 px-1 font-medium"
          onPress={closeMembersView}
        >
          <ChevronLeft className="size-4" /> Members
        </Button>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            className="size-6"
            aria-label="Back to joints"
            onPress={closeMembersView}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="flex-1 text-xs font-medium uppercase tracking-wide text-fg-muted">
            Members
          </span>
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            className="size-6"
            aria-label="Close members"
            onPress={closeMembersView}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {!anim ? (
        <p className="px-1 text-xs text-fg-subtle">Open a clip to edit its joint membership.</p>
      ) : anim.joints.length === 0 ? (
        <div className="flex items-center gap-2 px-1 py-2 text-xs text-fg-subtle">
          <span className="min-w-0 flex-1">Create a joint first</span>
          <Button size="xs" variant="secondary" onPress={() => targetNewJoint(anim)}>
            <Plus className="size-3" /> Joint
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-1">
            <Select
              size="xs"
              className="min-w-0 flex-1"
              label="Target joint"
              aria-label="Target joint"
              searchable
              searchPlaceholder="Search joints…"
              placeholder="Pick a joint"
              value={target?.id ?? null}
              onChange={(key) => $membersView.set({ open: true, targetJointId: String(key) })}
            >
              {jointOptions(anim).map((option) => (
                <ListBoxItem key={option.id} id={option.id} textValue={option.name}>
                  <span style={{ paddingLeft: option.depth * 10 }}>{option.name}</span>
                </ListBoxItem>
              ))}
            </Select>
            <Tooltip content="Create a joint at the selection centroid and target it">
              <Button size="xs" variant="ghost" onPress={() => targetNewJoint(anim)}>
                ＋ new joint
              </Button>
            </Tooltip>
          </div>

          <SearchField
            size="sm"
            aria-label="Filter SubParts"
            placeholder="Filter SubParts…"
            value={search}
            onChange={setSearch}
          />

          <ToggleButtonGroup
            size="xs"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[filter]}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (typeof next === 'string') setFilter(next as SubPartSetFilter);
            }}
          >
            {/* `whitespace-nowrap` + the shrinking basis keeps the four chips on ONE row in a
                narrow sidebar; without it "Other joints" wraps and doubles the strip's height. */}
            <ToggleButton size="xs" id="all" className="whitespace-nowrap px-1">
              All
            </ToggleButton>
            <ToggleButton size="xs" id="unassigned" className="whitespace-nowrap px-1">
              Unassigned
            </ToggleButton>
            <ToggleButton size="xs" id="this" className="whitespace-nowrap px-1">
              This joint
            </ToggleButton>
            <ToggleButton size="xs" id="other" className="whitespace-nowrap px-1">
              Other joints
            </ToggleButton>
          </ToggleButtonGroup>

          <div className="flex items-center gap-1">
            <Tooltip
              content={
                target
                  ? 'Click SubParts in the 3D viewport to toggle their membership'
                  : 'Pick a target joint first'
              }
            >
              <Button
                size="xs"
                variant={painting ? 'primary' : 'secondary'}
                isDisabled={!target}
                onPress={() => {
                  if (painting) {
                    disarmTool('member-paint');
                    return;
                  }
                  $memberPaintChanges.set([]);
                  armTool('member-paint');
                  // Phone: painting needs the VIEWPORT, so arming dismisses the sheet and the
                  // pinned `PhonePaintChip` takes over until Done (design §14 row 3).
                  if (isPhone) closePhoneSheets();
                }}
              >
                <Brush className="size-3" /> Paint in 3D
              </Button>
            </Tooltip>
            <span className="min-w-0 flex-1 truncate text-right text-xs text-fg-subtle">
              {checkedList.length}/{part.placements.length} → {target?.name ?? 'no joint'}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <SubPartSetGrid
              checked={checked}
              onCheckedChange={setChecked}
              ownership={ownership}
              targetJointId={target?.id ?? null}
              conflictClips={conflictClips}
              search={search}
              filter={filter}
              collapsedLayers={collapsedLayers}
              onToggleLayerCollapsed={(layerId) => {
                const next = new Set(collapsedLayers);
                if (next.has(layerId)) next.delete(layerId);
                else next.add(layerId);
                setCollapsedLayers(next);
              }}
              flashIds={new Set(painted)}
              onRowHover={(id) => $memberHoverId.set(id)}
              onRowFlash={(id) => flashMember(id)}
              onClearFilters={() => {
                setSearch('');
                setFilter('all');
              }}
            />
            <NotAnimatableSection />
          </div>

          <div className="flex flex-none items-center gap-1 border-t border-border pt-1.5">
            <Button
              size="xs"
              isDisabled={!target || checkedList.length === 0}
              onPress={assign}
              className="min-w-0 flex-1"
            >
              <span className="truncate">
                Assign {checkedList.length || ''} → {target?.name ?? 'joint'}
              </span>
            </Button>
            <Button
              size="xs"
              variant="secondary"
              isDisabled={checkedAssigned === 0}
              onPress={unassign}
            >
              Unassign {checkedAssigned || ''}
            </Button>
            <Button size="xs" variant="ghost" onPress={closeMembersView}>
              Done
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Creates a centroid-seeded joint and targets it without leaving the view (§7.2). */
function targetNewJoint(anim: PartAnimation): void {
  const id = addJoint(anim.id, 'Joint');
  openMembersView(id);
}

/** Pulses a placement for ~600 ms — the touch stand-in for hover (LOCKED #6, §7.3). */
function flashMember(instanceId: string): void {
  $memberHoverId.set(instanceId);
  window.setTimeout(() => {
    if ($memberHoverId.get() === instanceId) $memberHoverId.set(null);
  }, 600);
}

/**
 * The collapsed **"Not animatable"** section (§7.5). Its ⓘ text is the design's verbatim
 * explanation of a real KSA limitation, verified in the decomp: channels target joint nodes,
 * and only SubPart leaves ride under them.
 */
function NotAnimatableSection() {
  const part = useStore($part);
  const [open, setOpen] = useState(false);
  const rows = [
    ...part.connectors.map((c) => ({ id: c.id, kind: 'Connector' })),
    ...part.kittens.map((k) => ({ id: k.id, kind: 'Kitten' })),
    ...part.colliders.map((c) => ({ id: c.id, kind: 'Collider' })),
    ...part.ivaSeats.map((s) => ({ id: s.id, kind: 'IVA seat' })),
    ...part.lights.map((l) => ({ id: l.id, kind: 'Light' })),
  ];
  if (rows.length === 0) return null;
  return (
    <div className="mt-1 flex flex-col overflow-hidden rounded-lg border border-border bg-panel">
      {/* The ⓘ trigger is a SIBLING of the collapse button, never nested inside it: a button
          inside a button is invalid HTML and React refuses to hydrate it. */}
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left text-xs text-fg-muted"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDown className="size-3 shrink-0" />
          ) : (
            <ChevronRight className="size-3 shrink-0" />
          )}
          <span className="min-w-0 truncate">
            Not animatable ({rows.length}) — connectors, kittens…
          </span>
        </button>
        <DialogTrigger>
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            className="size-5 shrink-0"
            aria-label="Why can't these be animated?"
          >
            <Info className="size-3" />
          </Button>
          <Popover placement="left" className="w-72">
            <PopoverDialog>
              <p className="text-xs text-fg-muted">
                KSA can only animate SubParts parented under joints. Connectors and kittens always
                stay static — for a connector on a moving panel, author the part in its deployed
                pose instead. Owned colliders and lights ride along automatically.
              </p>
            </PopoverDialog>
          </Popover>
        </DialogTrigger>
      </div>
      {open && (
        <div className="flex flex-col gap-0.5 border-t border-border px-1.5 py-1.5">
          {rows.map((row) => (
            <div key={`${row.kind}:${row.id}`} className="flex items-center gap-2 opacity-50">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{row.id}</span>
              <Chip className="shrink-0">{row.kind}</Chip>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
