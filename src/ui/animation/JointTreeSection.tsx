import { useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { MenuTrigger, SubmenuTrigger } from 'react-aria-components';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreVertical,
  Plus,
} from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  Menu,
  MenuItem,
  MenuSeparator,
  Popover,
  TextField,
  Tooltip,
  cn,
  usePointerDrag,
} from '../kit';
import { revealEntity, select } from '../../state/editorStore';
import { $selectedPlacements } from '../../state/selectors';
import { status, undoStatusAction } from '../../state/statusStore';
import {
  $activeAnimation,
  $activeJointId,
  $jointTreeCollapsed,
  addJoint,
  attachToJoint,
  detachMembers,
  openMembersView,
  removeJoint,
  renameJoint,
  reorderJoint,
  setJointParent,
  armPivotPick,
  setJointPivot,
  setJointPivotToCentroid,
} from '../../state/animationStore';
import type { PartAnimation } from '../../ksa/types';
import { buildDopeSheetModel, type DopeRow } from './dopeSheetModel';
import { AnimSection } from './AnimSection';

/**
 * **The JOINTS section — a real tree** (design-animation-mode.md §6.2; foundation §8.2 item
 * 2). v1 rendered joint chains as a flat list of cards whose only hierarchy affordance was a
 * per-row "under X" Select (census pain 11).
 *
 * Rows come from `buildDopeSheetModel` — the SAME walk the timeline's header column uses — so
 * order, indent and collapse state can never diverge between the two surfaces
 * (`$jointTreeCollapsed` is literally shared).
 *
 * Drag-to-reparent rides the P0 `usePointerDrag` primitive rather than HTML5 DnD: the drop
 * target is resolved from `document.elementFromPoint` against `data-joint-drop` stamps, which
 * is what lets ONE gesture express both "become a child" (drop on a row) and "reorder among
 * siblings" (drop between rows). Own-descendant targets refuse, mirroring `setJointParent`'s
 * cycle guard rather than duplicating it.
 *
 * **Undo enrollment:** every mutation here is a discrete store action that pushes its own step
 * (`addJoint`, `renameJoint`, `setJointParent`, `reorderJoint`, `attachToJoint`,
 * `detachMembers`, `setJointPivot*`, `removeJoint`). Selection and collapse are view state.
 */
export function JointTreeSection() {
  const anim = useStore($activeAnimation);
  const collapsed = useStore($jointTreeCollapsed);
  const activeJointId = useStore($activeJointId);
  const selected = useStore($selectedPlacements);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // The two destructive joint actions (foundation §14.3): deleting a joint always asks, and
  // detaching asks once the member count is large enough to be worth a second look (>5).
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'detach'; jointId: string } | null>(
    null,
  );

  const selectedIds = selected.map((s) => s.placement.instanceId);
  const rows = anim ? buildDopeSheetModel(anim, collapsed).rows : [];

  // The authoritative drag lives in a ref (window listeners outlive the render that made
  // them); `drag` is only the render mirror, so the drop is committed from an EVENT handler
  // and never from inside a state updater — StrictMode double-invokes those.
  const dragRef = useRef<DragState | null>(null);
  const dragHandlers = usePointerDrag({
    onMove: (_dx, _dy, e) => {
      if (!dragRef.current) return;
      dragRef.current = { ...dragRef.current, over: dropTargetAt(e) };
      setDrag(dragRef.current);
    },
    onEnd: () => {
      const released = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (released && anim) commitDrop(anim, released);
    },
    cursor: 'grabbing',
  });

  if (!anim) return null;

  const attachSelected = (jointId: string, jointName: string) => {
    const { attached, skipped } = attachToJoint(anim.id, jointId, selectedIds);
    status(
      skipped > 0
        ? `Attached ${attached} SubParts — ${skipped} skipped (KSA can't animate them)`
        : `Attached ${attached} SubPart${attached === 1 ? '' : 's'} → ${jointName}`,
      { severity: skipped > 0 ? 'warning' : 'success', action: undoStatusAction() },
    );
  };

  return (
    <AnimSection
      title="Joints"
      count={anim.joints.length}
      headerAction={
        <div className="flex shrink-0 items-center gap-0.5">
          <Button size="xs" variant="ghost" onPress={() => addNewJoint(anim, selectedIds)}>
            <Plus className="size-3" /> joint
          </Button>
          <Button size="xs" variant="ghost" onPress={() => openMembersView()}>
            Members…
          </Button>
        </div>
      }
    >
      {/* Dropping on the section body (outside any row) makes the dragged joint a ROOT. */}
      <div data-joint-drop="root" className="flex flex-col gap-0.5">
        {rows.length === 0 && (
          <p className="px-1 text-xs text-fg-subtle">
            No joints yet — a joint is the hinge its members rotate around.
          </p>
        )}
        {rows.map((row) => {
          const isDropTarget = drag?.over?.jointId === row.jointId;
          const refused = isDropTarget && drag ? !canDrop(anim, drag.jointId, drag.over!) : false;
          return (
            <div
              key={row.jointId}
              data-joint-drop={row.jointId}
              className={cn(
                'group flex items-center gap-1 rounded-md px-1 py-0.5 text-xs',
                row.jointId === activeJointId ? 'bg-accent/10 text-fg' : 'text-fg-muted',
                isDropTarget && drag?.over?.mode === 'into' && !refused && 'ring-1 ring-accent',
                isDropTarget &&
                  drag?.over?.mode === 'before' &&
                  !refused &&
                  'border-t border-accent',
                refused && 'cursor-no-drop opacity-50',
              )}
              style={{ marginLeft: row.depth * 10 }}
            >
              <button
                type="button"
                aria-label="Drag to re-parent"
                className="shrink-0 touch-none text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100"
                onPointerDown={(e) => {
                  dragRef.current = { jointId: row.jointId, over: null };
                  setDrag(dragRef.current);
                  dragHandlers.onPointerDown(e);
                }}
              >
                <GripVertical className="size-3" />
              </button>
              {row.hasChildren ? (
                <button
                  type="button"
                  aria-label={row.collapsed ? 'Expand joint' : 'Collapse joint'}
                  className="shrink-0 text-fg-subtle hover:text-fg"
                  onClick={() =>
                    $jointTreeCollapsed.set({ ...collapsed, [row.jointId]: !row.collapsed })
                  }
                >
                  {row.collapsed ? (
                    <ChevronRight className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                </button>
              ) : (
                <span className="w-3 shrink-0" />
              )}
              {renaming === row.jointId ? (
                <RenameField
                  name={row.name}
                  onCommit={(next) => {
                    renameJoint(anim.id, row.jointId, next);
                    setRenaming(null);
                  }}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => $activeJointId.set(row.jointId)}
                  onDoubleClick={() => setRenaming(row.jointId)}
                >
                  {row.name}
                </button>
              )}
              <span className="shrink-0 tabular-nums text-fg-subtle">({row.memberCount})</span>
              {row.memberCount === 0 && (
                <Tooltip content="No members — this joint won't export">
                  <button
                    type="button"
                    aria-label="No members"
                    className="shrink-0 text-warning"
                    onClick={() => openMembersView(row.jointId)}
                  >
                    <AlertTriangle className="size-3" />
                  </button>
                </Tooltip>
              )}
              {row.jointId === activeJointId && selectedIds.length > 0 && (
                <Button
                  size="xs"
                  variant="secondary"
                  className="shrink-0"
                  onPress={() => attachSelected(row.jointId, row.name)}
                >
                  Attach {selectedIds.length} sel
                </Button>
              )}
              <MenuTrigger>
                <Button
                  iconOnly
                  size="xs"
                  variant="ghost"
                  className="size-5 shrink-0"
                  aria-label={`Options for ${row.name}`}
                >
                  <MoreVertical className="size-3.5" />
                </Button>
                <Popover placement="bottom end" className="w-60">
                  <JointMenu
                    anim={anim}
                    row={row}
                    selectedIds={selectedIds}
                    onRename={() => setRenaming(row.jointId)}
                    onAttach={() => attachSelected(row.jointId, row.name)}
                    onConfirm={(kind) => setConfirm({ kind, jointId: row.jointId })}
                  />
                </Popover>
              </MenuTrigger>
            </div>
          );
        })}
      </div>

      <JointConfirm anim={anim} confirm={confirm} onClose={() => setConfirm(null)} />
    </AnimSection>
  );
}

/** The delete-joint / detach-all questions, worded from the live joint (design §6.2). */
function JointConfirm({
  anim,
  confirm,
  onClose,
}: {
  anim: PartAnimation;
  confirm: { kind: 'delete' | 'detach'; jointId: string } | null;
  onClose: () => void;
}) {
  const joint = confirm ? anim.joints.find((j) => j.id === confirm.jointId) : null;
  const parent = joint?.parentJointId
    ? (anim.joints.find((j) => j.id === joint.parentJointId)?.name ?? 'Root')
    : 'Root (Part)';
  return (
    <ConfirmDialog
      isOpen={!!joint}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        confirm?.kind === 'delete'
          ? `Delete joint “${joint?.name ?? ''}”?`
          : `Detach all members of “${joint?.name ?? ''}”?`
      }
      text={
        confirm?.kind === 'delete'
          ? `Children re-parent to ${parent}; its poses are removed.`
          : `${joint?.memberInstanceIds.length ?? 0} SubParts stop being animated by this joint.`
      }
      confirmLabel={confirm?.kind === 'delete' ? 'Delete' : 'Detach all'}
      confirmVariant="danger"
      onConfirm={() => {
        if (!joint || !confirm) return;
        if (confirm.kind === 'delete') removeJoint(anim.id, joint.id);
        else detachMembers(anim.id, joint.memberInstanceIds);
        onClose();
      }}
    />
  );
}

/** Where a drag currently hovers: onto a row (re-parent) or between rows (reorder). */
interface DropTarget {
  jointId: string | null;
  mode: 'into' | 'before' | 'root';
}
interface DragState {
  jointId: string;
  over: DropTarget | null;
}

/** Resolves the element under the pointer to a drop target (top third = "insert before"). */
function dropTargetAt(e: PointerEvent): DropTarget | null {
  const host = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest<HTMLElement>('[data-joint-drop]');
  const id = host?.dataset.jointDrop;
  if (!host || !id) return null;
  if (id === 'root') return { jointId: null, mode: 'root' };
  const rect = host.getBoundingClientRect();
  return { jointId: id, mode: e.clientY - rect.top < rect.height / 3 ? 'before' : 'into' };
}

/** The dragged joint's descendants — the cycle guard, mirroring `wouldCycle`'s walk. */
function descendantsOf(anim: PartAnimation, jointId: string): Set<string> {
  const out = new Set<string>([jointId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const j of anim.joints) {
      if (!out.has(j.id) && j.parentJointId && out.has(j.parentJointId)) {
        out.add(j.id);
        grew = true;
      }
    }
  }
  return out;
}

function canDrop(anim: PartAnimation, jointId: string, target: DropTarget): boolean {
  if (target.mode === 'root') return true;
  if (!target.jointId) return false;
  if (target.mode === 'before') return target.jointId !== jointId;
  return !descendantsOf(anim, jointId).has(target.jointId);
}

/** Applies a released drag: re-parent onto a row, splice before a sibling, or become root. */
function commitDrop(anim: PartAnimation, drag: DragState): void {
  const target = drag.over;
  if (!target) return;
  if (!canDrop(anim, drag.jointId, target)) {
    status("Can't parent a joint under its own descendant", { severity: 'warning' });
    return;
  }
  if (target.mode === 'root') {
    setJointParent(anim.id, drag.jointId, null);
    return;
  }
  if (target.mode === 'into') {
    setJointParent(anim.id, drag.jointId, target.jointId);
    return;
  }
  // "before" = reorder among siblings: adopt the target's parent, then splice ahead of it.
  const target_ = anim.joints.find((j) => j.id === target.jointId);
  const dragged = anim.joints.find((j) => j.id === drag.jointId);
  if (!target_ || !dragged) return;
  if (dragged.parentJointId !== target_.parentJointId)
    setJointParent(anim.id, drag.jointId, target_.parentJointId);
  reorderJoint(anim.id, drag.jointId, target_.id);
}

/** ＋ joint: centroid-seeded root, with the inline "attach what's selected" follow-up. */
function addNewJoint(anim: PartAnimation, selectedIds: readonly string[]): void {
  const id = addJoint(anim.id, 'Joint');
  if (selectedIds.length === 0) return;
  status(`Joint added · ${selectedIds.length} selected`, {
    action: {
      label: `Attach ${selectedIds.length}`,
      run: () => attachToJoint(anim.id, id, selectedIds),
    },
  });
}

/** The row ⋮ menu (design §6.2 — every item). Mounted inside the popover, predicates live. */
function JointMenu({
  anim,
  row,
  selectedIds,
  onRename,
  onAttach,
  onConfirm,
}: {
  anim: PartAnimation;
  row: DopeRow;
  selectedIds: readonly string[];
  onRename: () => void;
  onAttach: () => void;
  onConfirm: (kind: 'delete' | 'detach') => void;
}) {
  const joint = anim.joints.find((j) => j.id === row.jointId);
  const single = useStore($selectedPlacements);
  if (!joint) return null;
  const forbidden = descendantsOf(anim, joint.id);
  const onePlacement = single.length === 1 ? single[0].placement : null;

  return (
    <Menu
      onAction={(key) => {
        switch (key) {
          case 'rename':
            onRename();
            break;
          case 'addChild':
            addJoint(anim.id, 'Joint', joint.id);
            break;
          case 'selectMembers':
            select(joint.memberInstanceIds.map((id) => ({ kind: 'subpart' as const, id })));
            if (joint.memberInstanceIds[0]) revealEntity('subpart', joint.memberInstanceIds[0]);
            break;
          case 'attach':
            onAttach();
            break;
          case 'members':
            openMembersView(joint.id);
            break;
          case 'pivotSelection':
            if (onePlacement) setJointPivot(anim.id, joint.id, onePlacement, { orientation: true });
            break;
          case 'pivotPosOnly':
            if (onePlacement)
              setJointPivot(anim.id, joint.id, onePlacement, { orientation: false });
            break;
          case 'pivotCentroid':
            setJointPivotToCentroid(joint.id);
            break;
          case 'pivotPick':
            // The pick writes to the ACTIVE joint (design §9.4 item 3), so make this row's
            // joint active first — the menu can be opened on a row that is not.
            $activeJointId.set(joint.id);
            armPivotPick('joint');
            break;
          case 'detachAll':
            // ≤5 goes straight through with an [Undo] flash; more raises the question.
            if (joint.memberInstanceIds.length > 5) onConfirm('detach');
            else detachMembers(anim.id, joint.memberInstanceIds);
            break;
          case 'delete':
            onConfirm('delete');
            break;
        }
      }}
    >
      <MenuItem id="rename">Rename</MenuItem>
      <MenuItem id="addChild">Add child joint</MenuItem>
      <SubmenuTrigger>
        <MenuItem id="reparent">Re-parent…</MenuItem>
        <Popover className="w-56">
          <Menu
            selectionMode="single"
            selectedKeys={[joint.parentJointId ?? 'none']}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (typeof next !== 'string') return;
              setJointParent(anim.id, joint.id, next === 'none' ? null : next);
            }}
          >
            <MenuItem id="none">Root (Part)</MenuItem>
            {anim.joints
              .filter((j) => j.id !== joint.id)
              .map((j) => (
                <MenuItem key={j.id} id={j.id} isDisabled={forbidden.has(j.id)}>
                  under {j.name}
                </MenuItem>
              ))}
          </Menu>
        </Popover>
      </SubmenuTrigger>
      <MenuSeparator />
      <MenuItem id="selectMembers" isDisabled={joint.memberInstanceIds.length === 0}>
        Select members
      </MenuItem>
      <MenuItem id="attach" isDisabled={selectedIds.length === 0}>
        Attach selected ({selectedIds.length})
      </MenuItem>
      <MenuItem id="members">Members…</MenuItem>
      <SubmenuTrigger>
        <MenuItem id="pivot">Set pivot…</MenuItem>
        <Popover className="w-60">
          <Menu>
            <MenuItem id="pivotSelection" isDisabled={!onePlacement}>
              To selection (position + orientation)
            </MenuItem>
            <MenuItem id="pivotPosOnly" isDisabled={!onePlacement}>
              To selection (position only)
            </MenuItem>
            <MenuItem id="pivotCentroid" isDisabled={single.length === 0}>
              To selection centroid
            </MenuItem>
            <MenuItem id="pivotPick">Pick in 3D…</MenuItem>
          </Menu>
        </Popover>
      </SubmenuTrigger>
      <MenuSeparator />
      <MenuItem id="detachAll" isDisabled={joint.memberInstanceIds.length === 0}>
        Detach all ({joint.memberInstanceIds.length})
      </MenuItem>
      <MenuItem id="delete">Delete joint…</MenuItem>
    </Menu>
  );
}

/** Inline rename: Enter commits, Escape cancels, blur commits. */
function RenameField({
  name,
  onCommit,
  onCancel,
}: {
  name: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(name);
  return (
    <TextField
      size="sm"
      autoFocus
      aria-label="Joint name"
      className="min-w-0 flex-1"
      value={draft}
      onChange={setDraft}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onCommit(draft);
        else if (e.key === 'Escape') onCancel();
      }}
    />
  );
}
