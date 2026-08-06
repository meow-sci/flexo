import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { GridList, GridListItem, MenuTrigger, SubmenuTrigger } from 'react-aria-components';
import { Check, Circle, CircleDot, MoreVertical, Plus, X } from 'lucide-react';
import {
  Button,
  Chip,
  ConfirmDialog,
  Menu,
  MenuItem,
  MenuSeparator,
  Popover,
  TextField,
  Tooltip,
  cn,
  gridRowClass,
} from '../kit';
import { $part } from '../../state/editorStore';
import { $projectName } from '../../state/projectStore';
import {
  $activeAnimationId,
  $clipIssues,
  addAnimation,
  duplicateAnimation,
  removeAnimation,
  renameAnimation,
  setRestAnchor,
} from '../../state/animationStore';
import { animGlbPath } from '../../ksa/animationNaming';
import { sanitizeBaseName } from '../../ksa/modExport';
import type { ClipIssue } from '../../ksa/clipIssues';
import type { PartAnimation } from '../../ksa/types';
import { anchorColumnId } from './dopeSheetModel';
import { refitForClip } from './timelineActions';
import { AnimSection } from './AnimSection';
import { fmt } from '../format';

/**
 * **The CLIPS section** — the Animation navigator's first block (design-animation-mode.md
 * §6.1; foundation §8.2 item 1).
 *
 * Two behaviours the v1 clip list did not have: the draft chip's tooltip is the per-clip
 * BLOCKER CHECKLIST (census pain 20 — "which requirement is missing?" was previously
 * unanswerable), and an `⚓end` micro-chip marks a clip whose rest anchor is not its earliest
 * keyframe, which is exactly what an imported deploy clip looks like.
 *
 * **D3 (logged deviation)**: re-clicking the open clip no longer CLOSES it. "Stop preview" is
 * the transport's job (⏹ / Esc / ⏮⚓) and a mode with clips always has one open.
 *
 * **Undo enrollment:** every mutation reached from here pushes its own discrete step
 * (`addAnimation`, `renameAnimation`, `duplicateAnimation`, `setRestAnchor`,
 * `removeAnimation`). Opening a clip is view state.
 */
export function ClipsSection() {
  const part = useStore($part);
  const activeId = useStore($activeAnimationId);
  const issues = useStore($clipIssues);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const pendingDelete = part.animations.find((a) => a.id === confirmDelete) ?? null;

  const open = (id: string) => {
    if ($activeAnimationId.get() === id) return; // D3: re-click does NOT close
    $activeAnimationId.set(id);
    refitForClip();
  };

  return (
    <AnimSection
      title="Clips"
      count={part.animations.length}
      headerAction={
        <Button
          iconOnly
          size="xs"
          variant="ghost"
          className="size-5"
          aria-label="New animation clip"
          onPress={() => addAnimation()}
        >
          <Plus className="size-3.5" />
        </Button>
      }
    >
      {part.animations.length === 0 ? (
        <p className="px-1 text-xs text-fg-subtle">No clips yet.</p>
      ) : (
        <GridList
          aria-label="Animation clips"
          selectionMode="none"
          items={part.animations}
          dependencies={[activeId, issues, renaming]}
          className="flex flex-col gap-0.5 outline-none"
        >
          {(anim: PartAnimation) => (
            <GridListItem
              id={anim.id}
              textValue={anim.name}
              onAction={() => open(anim.id)}
              className={(rp) => cn(gridRowClass(rp), 'gap-1 py-(--density-row-py)')}
            >
              {anim.id === activeId ? (
                <CircleDot className="size-3 shrink-0 text-accent" aria-label="Open clip" />
              ) : (
                <Circle className="size-3 shrink-0 text-fg-subtle" aria-hidden />
              )}
              {renaming === anim.id ? (
                <RenameField
                  name={anim.name}
                  onCommit={(next) => {
                    renameAnimation(anim.id, next);
                    setRenaming(null);
                  }}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  onDoubleClick={() => setRenaming(anim.id)}
                >
                  {anim.name}
                </span>
              )}
              <Chip className="shrink-0">{fmt(anim.durationSec)}s</Chip>
              <Chip className="shrink-0">
                {anim.mode === 'deployRetract' ? 'deploy' : 'actuate'}
              </Chip>
              <DraftChip issues={issues[anim.id] ?? []} />
              <AnchorChip anim={anim} />
              <MenuTrigger>
                <Button
                  iconOnly
                  size="xs"
                  variant="ghost"
                  className="size-5 shrink-0"
                  aria-label={`Options for ${anim.name}`}
                >
                  <MoreVertical className="size-3.5" />
                </Button>
                {/* Mounted only while open, so every predicate below re-evaluates per open
                    (React Compiler freeze rule — the Outliner row menus' contract). */}
                <Popover placement="bottom end" className="w-64">
                  <ClipMenu
                    anim={anim}
                    issues={issues[anim.id] ?? []}
                    onRename={() => setRenaming(anim.id)}
                    onDelete={() => setConfirmDelete(anim.id)}
                  />
                </Popover>
              </MenuTrigger>
            </GridListItem>
          )}
        </GridList>
      )}

      {/* Deleting a whole clip is a container delete — always confirmed (foundation §14.3). */}
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
        title={`Delete clip “${pendingDelete?.name ?? ''}”?`}
        text={
          pendingDelete
            ? `${pendingDelete.joints.length} joint${pendingDelete.joints.length === 1 ? '' : 's'}, ${pendingDelete.keyframes.length} keyframe${pendingDelete.keyframes.length === 1 ? '' : 's'}.`
            : undefined
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDelete) removeAnimation(pendingDelete.id);
          setConfirmDelete(null);
        }}
      />
    </AnimSection>
  );
}

/** The `(draft)` chip — its tooltip is the ✓/✗ export checklist (design §11.1). */
function DraftChip({ issues }: { issues: readonly ClipIssue[] }) {
  const blockers = issues.filter((i) => i.severity === 'blocker');
  if (blockers.length === 0) return null;
  return (
    <Tooltip content={<ExportChecklist issues={issues} />}>
      <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] text-warning">
        draft
      </span>
    </Tooltip>
  );
}

/** The three blocker predicates as ✓/✗ rows — the same list the Clip card renders. */
export function ExportChecklist({ issues }: { issues: readonly ClipIssue[] }) {
  const failed = new Set(issues.filter((i) => i.severity === 'blocker').map((i) => i.id));
  const rows: { id: ClipIssue['id']; label: string }[] = [
    { id: 'no-member-joint', label: 'has joint with members' },
    { id: 'needs-second-keyframe', label: '≥ 2 keyframes' },
    { id: 'zero-duration', label: 'duration > 0' },
  ];
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-1">
          {failed.has(row.id) ? (
            <X className="size-3 shrink-0 text-danger" aria-hidden />
          ) : (
            <Check className="size-3 shrink-0 text-accent" aria-hidden />
          )}
          <span>{row.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** `⚓end` — the anchor is not the earliest column, i.e. the part is modeled DEPLOYED. */
function AnchorChip({ anim }: { anim: PartAnimation }) {
  const anchorId = anchorColumnId(anim);
  const earliest = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec)[0];
  if (!anchorId || !earliest || anchorId === earliest.id) return null;
  return (
    <Tooltip content="Rest anchor is a later keyframe — this part is modeled in its END pose (KSA deploy clips import this way).">
      <span className="shrink-0 text-[11px] text-fg-muted">⚓end</span>
    </Tooltip>
  );
}

/**
 * The clip ⋮ menu (design §6.1) — shared verbatim by the navigator row and the left Clip
 * card's header overflow (foundation §8: "the ⋮ mirrors the right-sidebar row menu").
 * Mounted INSIDE a `Popover`, so every predicate below re-evaluates on each open.
 */
export function ClipMenu({
  anim,
  issues,
  onRename,
  onDelete,
}: {
  anim: PartAnimation;
  issues: readonly ClipIssue[];
  onRename: () => void;
  onDelete: () => void;
}) {
  const projectName = useStore($projectName);
  const anchorId = anchorColumnId(anim);
  const blockers = issues.filter((i) => i.severity === 'blocker').length;
  const sorted = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec);

  return (
    <Menu
      onAction={(key) => {
        if (key === 'rename') onRename();
        else if (key === 'duplicate') duplicateAnimation(anim.id);
        else if (key === 'delete') onDelete();
      }}
    >
      <MenuItem id="rename">Rename</MenuItem>
      <MenuItem id="duplicate">Duplicate clip</MenuItem>
      <SubmenuTrigger>
        <MenuItem id="reanchor">Re-anchor…</MenuItem>
        <Popover className="w-56">
          <Menu
            selectionMode="single"
            selectedKeys={anchorId ? [anchorId] : []}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (typeof next === 'string') setRestAnchor(anim.id, next);
            }}
          >
            {sorted.map((kf) => (
              <MenuItem key={kf.id} id={kf.id}>
                @{fmt(kf.timeSec)}s
              </MenuItem>
            ))}
          </Menu>
        </Popover>
      </SubmenuTrigger>
      <MenuSeparator />
      <MenuItem id="exportStatus" isDisabled>
        {blockers > 0
          ? `draft — ${blockers} blocker${blockers === 1 ? '' : 's'}`
          : `exports as ${animGlbPath(sanitizeBaseName(projectName), anim)}`}
      </MenuItem>
      <MenuSeparator />
      <MenuItem id="delete">Delete…</MenuItem>
    </Menu>
  );
}

/** Inline rename: Enter commits, Escape cancels, blur commits (the Outliner's contract). */
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
      aria-label="Clip name"
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
