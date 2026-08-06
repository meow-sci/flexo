import { useStore } from '@nanostores/react';
import { Button, Kbd, keyLabel } from '../kit';
import { focusCard, FocusCardHeader } from '../build/FocusCardHeader';
import { EntityMenu } from '../outliner/EntityRow';
import { KIND_ICONS } from '../outliner/kindIcons';
import { SurfaceFaceCard } from './SurfaceFaceCard';
import { BuiltInSurfaceCard } from './BuiltInSurfaceCard';
import { SubPartInspector } from '../build/SubPartInspector';
import { $surfaceFace, $surfaceMeshId, revealSurfaceMesh } from '../../state/surfaceModeStore';
import { $part, refLayerId } from '../../state/editorStore';
import { $selectedEntity } from '../../state/selectors';
import { $layerView, isLayerLocked } from '../../state/layerStore';
import { runCommand } from '../../state/commandStore';
import type { OutlinerRow } from '../outliner/outlinerTree';

/**
 * **Surface mode's focus editor** — the left sidebar (design: design-surface-assets.md §1.4;
 * foundation §7.5). Stacked top→bottom, exactly as the design's wireframe reads:
 *
 * 1. the **Face card** when a face is picked on a primitive (the editor half of the LOCKED
 *    right-selector / left-editor split);
 * 2. the standard **Build selection inspector** whenever a placement is selected — selection
 *    survives mode switches on purpose, so transforms stay tweakable while texturing;
 * 3. the read-only **Built-in surface card** when the selection is a Core SubPart (D7);
 * 4. the mode **cheat card** when none of the above applies.
 *
 * **Undo enrollment: NONE of its own.**
 */
export function SurfaceLeftPanel() {
  const part = useStore($part);
  const meshId = useStore($surfaceMeshId);
  const faceKey = useStore($surfaceFace);
  const entity = useStore($selectedEntity);
  useStore($layerView); // re-render when a layer's lock flips (every field is lock-gated)

  const mesh = meshId ? part.customMeshes.find((m) => m.id === meshId) : undefined;
  const showFace = !!mesh?.primitive && faceKey !== null;

  const placement = entity?.kind === 'subpart' ? entity : undefined;
  const selectedTemplateId = placement?.placement.subPartTemplateId;
  const selectedIsCustom =
    !!selectedTemplateId && part.customMeshes.some((m) => m.subPartId === selectedTemplateId);

  const nothing = !showFace && !placement;

  return (
    <div className="flex flex-col gap-2 p-(--density-panel-p)">
      {showFace && mesh && faceKey && <SurfaceFaceCard mesh={mesh} faceKey={faceKey} />}

      {placement && (
        <div className={focusCard}>
          <FocusCardHeader
            icon={KIND_ICONS.subpart}
            title={placement.placement.instanceId}
            titleTooltip={placement.id}
            subtitle={placement.placement.subPartTemplateId}
            menu={<EntityMenu row={menuRow(placement.id, placement.placement.instanceId)} />}
          />
          <SubPartInspector
            index={placement.index}
            placement={placement.placement}
            locked={isLayerLocked(refLayerId(part, { kind: 'subpart', id: placement.id }))}
          />
        </div>
      )}

      {placement && selectedTemplateId && !selectedIsCustom && (
        <BuiltInSurfaceCard templateId={selectedTemplateId} />
      )}

      {nothing && <EmptyState />}
    </div>
  );
}

/**
 * The minimal {@link OutlinerRow} the shared {@link EntityMenu} needs — the same synthesis
 * `BuildFocusEditor` makes, so the ⋮ here runs the SAME commands as an Outliner row's.
 */
function menuRow(id: string, name: string): OutlinerRow {
  return {
    key: `subpart:${id}`,
    kind: 'subpart',
    id,
    name,
    sub: '',
    badges: {},
    hidden: false,
    matchRanges: [],
  };
}

const CHEATS: { keys: string; what: string }[] = [
  { keys: '5', what: 'Surface mode' },
  { keys: `${keyLabel('mod')}${keyLabel('shift')}A`, what: 'Asset Manager' },
  { keys: 'F', what: 'frame selection' },
];

/** Nothing picked, nothing selected — the mode cheat-card (design §1.4 "Empty state"). */
function EmptyState() {
  return (
    <div className={focusCard}>
      <p className="text-xs text-fg">
        Surface mode edits custom meshes&rsquo; materials, glow and UVs.
      </p>
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
        <Button size="sm" variant="secondary" onPress={() => revealSurfaceMesh(null)}>
          Pick a mesh →
        </Button>
        <Button size="sm" variant="secondary" onPress={() => runCommand('add.primitiveMesh')}>
          New Primitive Mesh…
        </Button>
        <Button size="sm" variant="ghost" onPress={() => runCommand('add.importModel')}>
          Import Model…
        </Button>
      </div>
    </div>
  );
}
