import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { ChevronRight, Circle, Cylinder, Lock, Plus, Square, Trash2, Unlock } from 'lucide-react';
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  ToggleButton,
  ToggleButtonGroup,
  cn,
} from '../kit';
import {
  $activeMeasurementId,
  $measurements,
  $measurementSettings,
  addReferenceLine,
  removeMeasurement,
  setActiveMeasurement,
  setMeasureTool,
  setMeasurementLocked,
} from '../../state/measurementStore';
import {
  $activeContainerId,
  $containerSettings,
  $containers,
  addContainer,
  removeContainer,
  setActiveContainer,
  setContainerLocked,
  setContainerSettings,
  type ReferenceShape,
  type WarnPrecision,
} from '../../state/containerStore';
import { distance } from '../../measure/bounds';
import { formatLength } from '../../measure/format';

/**
 * The **AIDS** section at the Outliner's bottom (design: design-build-mode.md §2.6;
 * foundation §8.1 S28) — the *collection* of editor-only aids: line measurements and
 * reference containers. Collapsed by default and always present, so aids are discoverable
 * without a menu toggle.
 *
 * Activating a row makes that aid the active one, which is what opens its editor (v1's
 * floating editor panel; P5B.16 rehosts it into the left focus slot).
 *
 * The *display* preferences for aids (bounding-box overlays, units) deliberately do NOT live
 * here — they are View-menu material. The one setting that does is the containment warn
 * precision, because it changes what the container rows themselves report.
 *
 * Undo enrollment: NONE of its own. Every aid mutation it calls is already discrete through
 * `registerEditorAidStores` (measurement/container stores push their own undo step).
 */
export function AidsSection() {
  const measurements = useStore($measurements);
  const containers = useStore($containers);
  const [expanded, setExpanded] = useState(false);
  const count = measurements.length + containers.length;

  return (
    <div className="shrink-0 border-t border-border pt-1">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full items-center gap-1 rounded-md px-1 py-(--density-row-py) text-left text-xs font-medium uppercase tracking-wide text-fg-muted outline-none hover:bg-wash-hover focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform', expanded && 'rotate-90')}
        />
        <span className="flex-1">Aids</span>
        <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">{count}</span>
      </button>

      {expanded && (
        <div className="flex max-h-64 flex-col gap-2 overflow-auto px-1 pb-1 pt-1">
          <Measurements />
          <Containers />
        </div>
      )}
    </div>
  );
}

function Measurements() {
  const measurements = useStore($measurements);
  const activeId = useStore($activeMeasurementId);
  const { unit } = useStore($measurementSettings);

  return (
    <section className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <span className="flex-1 text-[11px] uppercase tracking-wide text-fg-subtle">
          Measurements
        </span>
        <Button size="xs" variant="ghost" onPress={() => setActiveMeasurement(addReferenceLine())}>
          ＋ line
        </Button>
        {/* TODO(P5B.25): arming moves under `$activeTool` with the rest of the transient tools. */}
        <Button size="xs" variant="ghost" onPress={() => setMeasureTool('point')}>
          ＋ p2p
        </Button>
      </div>
      {measurements.length === 0 ? (
        <p className="px-1 py-1 text-[11px] text-fg-subtle">
          Measure with M, or add reference lines and containers here.
        </p>
      ) : (
        measurements.map((m) => (
          <AidRow
            key={m.id}
            isActive={activeId === m.id}
            onActivate={() => setActiveMeasurement(m.id)}
            locked={m.locked}
            onToggleLock={() => setMeasurementLocked(m.id, !m.locked)}
            onDelete={() => removeMeasurement(m.id)}
            label={m.id}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full border border-black/30"
              style={{ background: m.color }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {formatLength(distance(m.a, m.b), unit)}
            </span>
            <span className="shrink-0 text-[10px] uppercase text-fg-subtle">
              {m.source === 'point' ? 'pt' : 'ref'}
            </span>
          </AidRow>
        ))
      )}
    </section>
  );
}

const SHAPE_ICON: Record<ReferenceShape, typeof Square> = {
  rect: Square,
  cylinder: Cylinder,
  sphere: Circle,
};

const SHAPE_LABEL: Record<ReferenceShape, string> = {
  rect: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
};

function Containers() {
  const containers = useStore($containers);
  const activeId = useStore($activeContainerId);
  const { warnPrecision } = useStore($containerSettings);

  return (
    <section className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <span className="flex-1 text-[11px] uppercase tracking-wide text-fg-subtle">
          Reference containers
        </span>
        <MenuTrigger>
          <Button size="xs" variant="ghost" aria-label="Add a reference container">
            <Plus className="size-3" />
          </Button>
          <Popover placement="bottom end" className="w-36">
            <Menu onAction={(key) => setActiveContainer(addContainer(key as ReferenceShape))}>
              <MenuItem id="rect">Box</MenuItem>
              <MenuItem id="cylinder">Cylinder</MenuItem>
              <MenuItem id="sphere">Sphere</MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>
      {containers.length === 0 ? (
        <p className="px-1 py-1 text-[11px] text-fg-subtle">No containers placed.</p>
      ) : (
        containers.map((c) => {
          const Icon = SHAPE_ICON[c.shape];
          return (
            <AidRow
              key={c.id}
              isActive={activeId === c.id}
              onActivate={() => setActiveContainer(c.id)}
              locked={c.locked}
              onToggleLock={() => setContainerLocked(c.id, !c.locked)}
              onDelete={() => removeContainer(c.id)}
              label={SHAPE_LABEL[c.shape]}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full border border-black/30"
                style={{ background: c.color }}
              />
              <Icon className="size-3 shrink-0 text-fg-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs">{SHAPE_LABEL[c.shape]}</span>
              {c.warnEnabled && (
                <span className="shrink-0 text-[10px] uppercase text-fg-subtle">warn</span>
              )}
            </AidRow>
          );
        })
      )}
      <label className="flex items-center gap-1 px-1 pt-1 text-[11px] text-fg-subtle">
        <span className="shrink-0">Warn check</span>
        <ToggleButtonGroup
          size="xs"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[warnPrecision]}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next) setContainerSettings({ warnPrecision: next as WarnPrecision });
          }}
        >
          <ToggleButton id="bbox" size="xs">
            Fast
          </ToggleButton>
          <ToggleButton id="vertex" size="xs">
            Accurate
          </ToggleButton>
        </ToggleButtonGroup>
      </label>
    </section>
  );
}

/** One aid row: activate on click, with a lock toggle and a delete button on the right. */
function AidRow({
  isActive,
  onActivate,
  locked,
  onToggleLock,
  onDelete,
  label,
  children,
}: {
  isActive: boolean;
  onActivate: () => void;
  locked: boolean;
  onToggleLock: () => void;
  onDelete: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-md px-1 py-(--density-row-py)',
        isActive ? 'bg-wash-selected ring-1 ring-inset ring-accent' : 'hover:bg-wash-hover',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
        onClick={onActivate}
      >
        {children}
      </button>
      <Button
        iconOnly
        size="sm"
        variant="ghost"
        className="size-5 shrink-0"
        aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
        onPress={onToggleLock}
      >
        {locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
      </Button>
      <Button
        iconOnly
        size="sm"
        variant="danger-ghost"
        className="size-5 shrink-0"
        aria-label={`Delete ${label}`}
        onPress={onDelete}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}
