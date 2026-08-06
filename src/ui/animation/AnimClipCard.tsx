import { useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { MenuTrigger } from 'react-aria-components';
import { Anchor, Check, ChevronDown, Film, Sun, X } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  ListBoxItem,
  Menu,
  MenuItem,
  Popover,
  SectionTitle,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  cn,
} from '../kit';
import { NumberField } from '../NumberField';
import { FocusCardHeader, focusCard } from '../build/FocusCardHeader';
import { pushUndo } from '../../state/editorStore';
import { $projectName } from '../../state/projectStore';
import {
  $animDurationMode,
  $clipIssues,
  openMembersView,
  removeAnimation,
  renameAnimation,
  setAnimationDuration,
  setAnimationMode,
  setRestAnchor,
} from '../../state/animationStore';
import { animGlbPath } from '../../ksa/animationNaming';
import { sanitizeBaseName } from '../../ksa/modExport';
import type { AnimationMode, PartAnimation } from '../../ksa/types';
import { anchorColumnId } from './dopeSheetModel';
import { ClipMenu } from './ClipsSection';
import { fmt } from '../format';

/**
 * **The Clip card** — the left focus editor's answer when a clip is open and no joint is
 * active (design-animation-mode.md §8.2; foundation §7.2 row 2).
 *
 * Three things v1 could not do live here: the duration edit chooses between **Rescale keys**
 * (v1's only behaviour) and **Keep times** (census pain 19), the REST ANCHOR is visible and
 * changeable (census §1.11 — `restKeyframeId` had no UI at all), and the EXPORT block is a
 * live ✓/✗ checklist whose failing rows are JUMPS to the thing that would fix them
 * (census pain 20).
 *
 * **Undo enrollment:** name / mode / re-anchor / delete are discrete store actions; the
 * Duration field is STREAMING and pushes one step at focus (`onInteractionStart`).
 */
export function AnimClipCard({ anim }: { anim: PartAnimation }) {
  const issues = useStore($clipIssues)[anim.id] ?? [];
  const durationMode = useStore($animDurationMode);
  const projectName = useStore($projectName);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const durationRef = useRef<HTMLDivElement>(null);

  const sorted = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec);
  const anchorId = anchorColumnId(anim);
  const anchor = sorted.find((k) => k.id === anchorId) ?? null;
  const lastTime = sorted.at(-1)?.timeSec ?? 0;
  const blockers = issues.filter((i) => i.severity === 'blocker');

  return (
    <div className={focusCard}>
      <FocusCardHeader
        icon={Film}
        title={`Clip: ${anim.name}`}
        titleTooltip={anim.name}
        menu={
          <ClipMenu
            anim={anim}
            issues={issues}
            onRename={() => setRenaming(true)}
            onDelete={() => setConfirmDelete(true)}
          />
        }
      />

      <TextField
        size="sm"
        label="Name"
        aria-label="Clip name"
        autoFocus={renaming}
        value={nameDraft ?? anim.name}
        onFocus={() => setNameDraft(anim.name)}
        onChange={setNameDraft}
        onBlur={() => {
          if (nameDraft != null) renameAnimation(anim.id, nameDraft);
          setNameDraft(null);
          setRenaming(false);
        }}
      />

      <Select
        size="sm"
        label="Mode"
        value={anim.mode}
        onChange={(k) => setAnimationMode(anim.id, k as AnimationMode)}
      >
        <ListBoxItem id="actuate">Actuate (0→1 slider)</ListBoxItem>
        <ListBoxItem id="deployRetract">Deploy / Retract</ListBoxItem>
      </Select>
      {anim.mode !== 'deployRetract' && anim.solarTracking && (
        <p className="rounded-md bg-warning/10 px-1.5 py-1 text-[11px] text-warning">
          Solar tracking requires Deploy/Retract — it will be kept but won’t export.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <SectionTitle>Duration</SectionTitle>
        <div ref={durationRef} className="w-24">
          <NumberField
            label="s"
            ariaLabel="Clip duration (seconds)"
            value={anim.durationSec}
            min={0.01}
            onInteractionStart={() => pushUndo('animation duration', anim.name)}
            onCommit={(n) => setAnimationDuration(anim.id, n, $animDurationMode.get())}
          />
        </div>
        <ToggleButtonGroup
          size="xs"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[durationMode]}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next === 'rescale' || next === 'keepTimes') $animDurationMode.set(next);
          }}
        >
          <ToggleButton size="xs" id="rescale">
            Rescale keys
          </ToggleButton>
          <ToggleButton size="xs" id="keepTimes">
            Keep times
          </ToggleButton>
        </ToggleButtonGroup>
        {durationMode === 'keepTimes' && lastTime > 0 && (
          <span className="text-[11px] text-fg-subtle">min {fmt(lastTime)}s — last keyframe</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <SectionTitle>Rest anchor</SectionTitle>
        <span className="ml-auto flex items-center gap-1 text-xs text-fg-muted">
          <Anchor className="size-3" aria-hidden />
          {anchor ? `@${fmt(anchor.timeSec)}s` : '—'}
          {anchor && anchor.id === sorted.at(-1)?.id && sorted.length > 1 && ' (final keyframe)'}
        </span>
        <MenuTrigger>
          <Button size="xs" variant="ghost" className="shrink-0">
            change <ChevronDown className="size-3" />
          </Button>
          <Popover className="w-48">
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
        </MenuTrigger>
      </div>

      <div className="flex flex-col gap-1">
        <SectionTitle>Export</SectionTitle>
        <ExportRow
          ok={!blockers.some((i) => i.id === 'no-member-joint')}
          label="has joint with members"
          onFix={() => openMembersView()}
        />
        <ExportRow
          ok={!blockers.some((i) => i.id === 'needs-second-keyframe')}
          label="≥ 2 keyframes"
          onFix={() => focusTimeline()}
        />
        <ExportRow
          ok={!blockers.some((i) => i.id === 'zero-duration')}
          label="duration > 0"
          onFix={() => durationRef.current?.querySelector('input')?.focus()}
        />
        <span className="truncate text-[11px] text-fg-subtle" title={anim.name}>
          {blockers.length > 0
            ? `draft — ${blockers.length} blocker${blockers.length === 1 ? '' : 's'}`
            : `exports as ${animGlbPath(sanitizeBaseName(projectName), anim)}`}
        </span>
      </div>

      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-1 py-0.5 text-left text-xs text-fg-muted hover:bg-wash-hover"
        onClick={() =>
          document
            .querySelector('[data-anim-section="solar"]')
            ?.scrollIntoView({ block: 'nearest' })
        }
      >
        <Sun className="size-3 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {anim.solarTracking
            ? `Solar tracking ON · ${anim.solarTracking.subPartInstanceId || '—'} · ${fmt(anim.solarTracking.degreesPerSecond)}°/s`
            : 'Solar tracking off'}
        </span>
        <span aria-hidden>→</span>
      </button>

      <ConfirmDialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete clip “${anim.name}”?`}
        text={`${anim.joints.length} joint${anim.joints.length === 1 ? '' : 's'}, ${anim.keyframes.length} keyframe${anim.keyframes.length === 1 ? '' : 's'}.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => removeAnimation(anim.id)}
      />
    </div>
  );
}

/** One ✓/✗ checklist row; a FAILING row is a link to the surface that fixes it (§8.2). */
function ExportRow({ ok, label, onFix }: { ok: boolean; label: string; onFix: () => void }) {
  const Icon = ok ? Check : X;
  return (
    <button
      type="button"
      disabled={ok}
      onClick={onFix}
      className={cn(
        'flex items-center gap-1 rounded px-1 text-left text-xs',
        ok ? 'text-fg-muted' : 'text-danger hover:bg-wash-hover hover:underline',
      )}
    >
      <Icon className={cn('size-3 shrink-0', ok ? 'text-accent' : 'text-danger')} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

/** Hands focus to the timeline dock — which is also what turns its hotkey scope on. */
function focusTimeline(): void {
  document.querySelector<HTMLElement>('[data-surface="timeline"]')?.focus();
}
