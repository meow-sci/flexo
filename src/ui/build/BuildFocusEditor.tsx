import { useStore } from '@nanostores/react';
import { Boxes, Lock, Ruler, Trash2, Unlock, X } from 'lucide-react';
import { Button, Kbd, Menu, MenuItem, MenuSeparator, keyLabel } from '../kit';
import { FocusCardHeader, focusCard } from './FocusCardHeader';
import { SubPartInspector } from './SubPartInspector';
import { ConnectorInspector } from './ConnectorInspector';
import { ColliderInspector } from './ColliderInspector';
import { SeatInspector } from './SeatInspector';
import { KittenInspector } from './KittenInspector';
import { LightInspector } from './LightInspector';
import { MultiSelectPanel } from './MultiSelectPanel';
import { MeasurementEditorCard } from './MeasurementEditorCard';
import { ContainerEditorCard } from './ContainerEditorCard';
import { CoveragePanel } from './CoveragePanel';
import { EntityMenu } from '../outliner/EntityRow';
import { KIND_ICONS } from '../outliner/kindIcons';
import type { OutlinerRow } from '../outliner/outlinerTree';
import { $part, refLayerId, type EntityKind } from '../../state/editorStore';
import {
  $hasMultiSelection,
  $selectedEntity,
  $selectionByKind,
  type SelectedEntity,
} from '../../state/selectors';
import { $layerView, isLayerLocked } from '../../state/layerStore';
import { $coverageReport } from '../../state/colliderStore';
import {
  $activeMeasurementId,
  $measurements,
  removeMeasurement,
  setActiveMeasurement,
  setMeasurementLocked,
} from '../../state/measurementStore';
import {
  $activeContainerId,
  $containers,
  removeContainer,
  setActiveContainer,
  setContainerLocked,
} from '../../state/containerStore';
import { runCommand } from '../../state/commandStore';
import { KITTEN_LABELS } from '../../ksa/types';
import { seatAxesFromRotation } from '../../ksa/ivaSeatAxes';
import { formatG6 } from '../../ksa/formatG6';

/**
 * **Build mode's focus editor** — the left sidebar (design: `foundation.md` §7, §7.1;
 * design-build-mode.md §3). One component that renders
 * `(tool parameter card?) → (focus card) → (empty cheat-card)` as a pure function of
 * `(mode, focus)`, where focus = selection ∪ active aid ∪ armed tool.
 *
 * **Dispatch order** (design §3 intro; the ONE focus slot is what structurally ends v1's
 * left-centre triple-booking of inspector / measurement editor / container editor):
 *
 * 1. **Tool parameter card** — a coverage report produced by a selection-free
 *    `Tools ▸ Collider Coverage Check`. It is suppressed while a collider is focused,
 *    because that card already carries the same panel as a section (§3.4).
 * 2. **Aid editor card** — an active measurement or reference container takes the slot.
 * 3. **Multi-select panel** — 2+ entities of any kinds.
 * 4. **Per-kind inspector** — exactly one entity (all six kinds).
 * 5. **Empty state** — the Build cheat-card (§3.11).
 *
 * Every card is `FocusCardHeader` + a body; the header's ⋮ runs the SAME `EntityMenu` the
 * Outliner rows use, so Duplicate / Fit / Sit / Change Layer / Delete exist once.
 *
 * `$layerView` is subscribed so the cards re-render when a layer's lock flips (v1's
 * `TransformInspector` did the same) — every field below is `isDisabled` while locked.
 *
 * **Undo enrollment: NONE of its own.** Cards push their own steps (discrete mutators
 * internally; numeric fields once per typing session).
 */
export function BuildFocusEditor() {
  const part = useStore($part);
  const entity = useStore($selectedEntity);
  const hasMulti = useStore($hasMultiSelection);
  const byKind = useStore($selectionByKind);
  const coverage = useStore($coverageReport);
  const measurementId = useStore($activeMeasurementId);
  const measurements = useStore($measurements);
  const containerId = useStore($activeContainerId);
  const containers = useStore($containers);
  useStore($layerView); // re-render when lock state changes

  const measurement = measurementId ? measurements.find((m) => m.id === measurementId) : undefined;
  const container = containerId ? containers.find((c) => c.id === containerId) : undefined;

  // (1) Tool parameter card. The collider card owns its own copy of this panel.
  const toolCard =
    coverage && entity?.kind !== 'collider' ? (
      <div className={focusCard}>
        <CoveragePanel standalone />
      </div>
    ) : null;

  let card: React.ReactNode;

  if (measurement) {
    card = (
      <div className={focusCard}>
        <FocusCardHeader
          icon={Ruler}
          title={measurement.source === 'point' ? 'Point measurement' : 'Reference line'}
          subtitle={measurement.id}
          actions={
            <AidActions
              locked={measurement.locked}
              onToggleLock={() => setMeasurementLocked(measurement.id, !measurement.locked)}
              onClose={() => setActiveMeasurement(null)}
              onDelete={() => removeMeasurement(measurement.id)}
              label="measurement"
            />
          }
        />
        <MeasurementEditorCard measurement={measurement} />
      </div>
    );
  } else if (container) {
    card = (
      <div className={focusCard}>
        <FocusCardHeader
          icon={Boxes}
          title={CONTAINER_LABEL[container.shape]}
          subtitle={container.id}
          actions={
            <AidActions
              locked={container.locked}
              onToggleLock={() => setContainerLocked(container.id, !container.locked)}
              onClose={() => setActiveContainer(null)}
              onDelete={() => removeContainer(container.id)}
              label="container"
            />
          }
        />
        <ContainerEditorCard container={container} />
      </div>
    );
  } else if (hasMulti) {
    const kinds = (Object.keys(byKind) as EntityKind[]).filter((k) => byKind[k].length > 0);
    const total = kinds.reduce((n, k) => n + byKind[k].length, 0);
    const counts = kinds.map(
      (k) => `${byKind[k].length} ${KIND_NOUN[k]}${byKind[k].length === 1 ? '' : 's'}`,
    );
    card = (
      <div className={focusCard}>
        <FocusCardHeader
          icon={Boxes}
          title={`${total} items`}
          subtitle={counts.join(' · ')}
          menu={<SelectionMenu />}
        />
        <MultiSelectPanel />
      </div>
    );
  } else if (entity) {
    const locked = isLayerLocked(refLayerId(part, { kind: entity.kind, id: entity.id }));
    const name = entityName(entity);
    card = (
      <div className={focusCard}>
        <FocusCardHeader
          icon={KIND_ICONS[entity.kind]}
          title={name}
          titleTooltip={entity.id}
          titleClassName={entity.kind === 'connector' ? 'font-mono' : undefined}
          subtitle={entitySubtitle(entity)}
          menu={<EntityMenu row={menuRow(entity.kind, entity.id, name)} />}
        />
        <EntityBody entity={entity} locked={locked} />
      </div>
    );
  } else {
    card = <EmptyState firstRun={isEmptyDocument(part)} />;
  }

  return (
    <div className="flex flex-col gap-2 p-(--density-panel-p)">
      {toolCard}
      {card}
    </div>
  );
}

const CONTAINER_LABEL = {
  rect: 'Box container',
  cylinder: 'Cylinder container',
  sphere: 'Sphere container',
} as const;

/** Singular nouns for the multi-select breakdown caption ("3 SubParts · 1 light"). */
const KIND_NOUN: Record<EntityKind, string> = {
  subpart: 'SubPart',
  connector: 'connector',
  collider: 'collider',
  ivaSeat: 'seat',
  light: 'light',
  kitten: 'kitten',
};

/** The name the header (and the ⋮ menu's status flashes) reads — the Outliner's wording. */
function entityName(entity: SelectedEntity): string {
  switch (entity.kind) {
    case 'subpart':
      return entity.placement.instanceId;
    // Seats have no user-facing name of their own; their ORDINAL is the identity (and the
    // game's `C`-cycle order), exactly as the Outliner rows read.
    case 'ivaSeat':
      return `Seat ${entity.index + 1}`;
    case 'kitten':
      return KITTEN_LABELS[entity.kitten.kind];
    default:
      return entity.id;
  }
}

/** The dim second line — the SAME strings the Outliner's rows carry (Law 4: one wording). */
function entitySubtitle(entity: SelectedEntity): string {
  switch (entity.kind) {
    case 'subpart':
      return entity.placement.subPartTemplateId;
    case 'connector':
      // Flags (how it orients) and capabilities (what may flow) are independent axes.
      return (
        [...entity.connector.flags, ...entity.connector.capabilities].join(' · ') || 'no flags'
      );
    case 'collider':
      return `${entity.collider.shape} · ${
        entity.collider.ownerTemplateId ? lastSegment(entity.collider.ownerTemplateId) : 'Part'
      }`;
    case 'ivaSeat': {
      // The derived <ForwardAxis> — the vector that actually ships in the XML.
      const { forward } = seatAxesFromRotation(entity.seat.rotation);
      return `→ ${formatG6(forward.x)}, ${formatG6(forward.y)}, ${formatG6(forward.z)}`;
    }
    case 'light':
      return entity.light.ownerTemplateId
        ? `${entity.light.type} · via ${lastSegment(entity.light.ownerTemplateId)}`
        : entity.light.type;
    case 'kitten':
      return entity.kitten.id;
  }
}

/** Trailing `_Subpart_Foo` segment of a template id — the part users actually read. */
function lastSegment(id: string): string {
  return id.split('_').pop() || id;
}

/**
 * The minimal {@link OutlinerRow} the shared {@link EntityMenu} needs. The menu reads only
 * `kind` / `id` / `name`; the display fields exist for the row renderer, which is not in play
 * here. Synthesising it is what lets the focus header run the SAME commands as the Outliner
 * row menu instead of a second copy (plan P5B.10: "do not duplicate logic").
 */
function menuRow(kind: EntityKind, id: string, name: string): OutlinerRow {
  return {
    key: `${kind}:${id}`,
    kind,
    id,
    name,
    sub: '',
    badges: {},
    hidden: false,
    matchRanges: [],
  };
}

function EntityBody({ entity, locked }: { entity: SelectedEntity; locked: boolean }) {
  switch (entity.kind) {
    case 'subpart':
      return <SubPartInspector index={entity.index} placement={entity.placement} locked={locked} />;
    case 'connector':
      return (
        <ConnectorInspector index={entity.index} connector={entity.connector} locked={locked} />
      );
    case 'collider':
      return <ColliderInspector index={entity.index} collider={entity.collider} locked={locked} />;
    case 'ivaSeat':
      return <SeatInspector index={entity.index} seat={entity.seat} locked={locked} />;
    case 'light':
      return <LightInspector index={entity.index} light={entity.light} locked={locked} />;
    case 'kitten':
      return <KittenInspector kitten={entity.kitten} locked={locked} />;
  }
}

/**
 * The multi-selection ⋮. There is no per-entity `EntityMenu` to borrow, so it runs the
 * registered Edit commands — the same ones the menubar, ⌘K and the chords fire. Mounted by
 * the header's Popover, so `enabled()` is re-evaluated on every open.
 */
function SelectionMenu() {
  return (
    <Menu aria-label="Selection options" onAction={(key) => runCommand(String(key))}>
      <MenuItem id="edit.duplicate">Duplicate</MenuItem>
      <MenuItem id="edit.copy">Copy</MenuItem>
      <MenuItem id="edit.cut">Cut</MenuItem>
      <MenuSeparator />
      <MenuItem id="chain.begin">Begin Action Chain…</MenuItem>
      <MenuSeparator />
      <MenuItem id="edit.delete" variant="danger">
        Delete
      </MenuItem>
    </Menu>
  );
}

/** Lock / close / delete for an aid card — v1's `FloatingEditorPanel` header, in the slot. */
function AidActions({
  locked,
  onToggleLock,
  onClose,
  onDelete,
  label,
}: {
  locked: boolean;
  onToggleLock: () => void;
  onClose: () => void;
  onDelete: () => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        iconOnly
        size="sm"
        variant="ghost"
        className="size-5"
        aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
        onPress={onToggleLock}
      >
        {locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
      </Button>
      <Button
        iconOnly
        size="sm"
        variant="danger-ghost"
        className="size-5"
        aria-label={`Delete ${label}`}
        onPress={onDelete}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <Button
        iconOnly
        size="sm"
        variant="ghost"
        className="size-5"
        aria-label={`Close ${label} editor`}
        onPress={onClose}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

/** Nothing authored yet — the proxy for "first run" the cheat-card's third button uses. */
function isEmptyDocument(part: ReturnType<typeof $part.get>): boolean {
  return (
    part.placements.length === 0 &&
    part.connectors.length === 0 &&
    part.colliders.length === 0 &&
    part.ivaSeats.length === 0 &&
    part.lights.length === 0 &&
    part.kittens.length === 0
  );
}

const CHEATS: { keys: string; what: string }[] = [
  { keys: 'F', what: 'frame selection' },
  { keys: 'T', what: 'cycle gizmo tool' },
  { keys: 'B', what: 'box select' },
  { keys: 'M', what: 'measure' },
  { keys: `${keyLabel('mod')}D`, what: 'duplicate' },
  { keys: '1–5', what: 'switch mode' },
];

/** The Build cheat-card shown when nothing is focused (design §3.11). */
function EmptyState({ firstRun }: { firstRun: boolean }) {
  return (
    <div className={focusCard}>
      <p className="text-xs text-fg">Build — place and arrange entities.</p>
      <dl className="flex flex-col gap-0.5">
        {CHEATS.map((cheat) => (
          <div key={cheat.keys} className="flex items-baseline gap-2">
            <dt className="w-12 shrink-0">
              <Kbd>{cheat.keys}</Kbd>
            </dt>
            <dd className="min-w-0 flex-1 truncate text-xs text-fg-subtle">{cheat.what}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1">
        <Button size="sm" variant="secondary" onPress={() => runCommand('add.subpart')}>
          Add SubPart…
        </Button>
        <Button size="sm" variant="secondary" onPress={() => runCommand('add.importModel')}>
          Import Model…
        </Button>
        {firstRun && (
          <Button size="sm" variant="ghost" onPress={() => runCommand('file.projects')}>
            Open Projects…
          </Button>
        )}
      </div>
    </div>
  );
}
