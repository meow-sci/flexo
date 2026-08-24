/**
 * ICRP app shell (plans/ICRP_PLAN.md P2/P9 seed): toolbar (tools/snap/undo),
 * piece library on the left, viewport centre, inspector on the right.
 * Built on flexo's ui/kit primitives; grows a full menubar/palette in P9.
 */
import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  ArrowDownToLine,
  Circle,
  Frame,
  Grid3x3,
  Layers,
  Magnet,
  Move,
  MousePointer2,
  Redo2,
  RotateCw,
  Scaling,
  Trash2,
  Copy,
} from 'lucide-react';
import { useState } from 'react';
import { Button, SearchField, ToggleButton, cn } from '../../../src/ui/kit';
import { NumberField } from '../../../src/ui/NumberField';
import { Vec3Field } from '../../../src/ui/Vec3Field';
import {
  $activeObject,
  $historyDepth,
  $project,
  $selection,
  addObject,
  addPlacement,
  beginGesture,
  duplicatePlacements,
  endGesture,
  getPlacement,
  redo,
  removeObject,
  removePlacements,
  renameObject,
  resetProject,
  setObjectMeters,
  switchObject,
  setPlacementTransform,
  undo,
  ICRP_PROJECT_SCHEMA_VERSION,
} from './state/docStore';
import {
  $catalogReady,
  $staticObjects,
  $staticPieces,
  $vesselPieces,
  ensureStaticCatalogLoaded,
} from './state/catalogStore';
import {
  $groundLock,
  $overlaysVisible,
  $snap,
  $tool,
  setTool,
  toggleSnap,
  type Tool,
} from './state/toolStore';
import { addArrayCopies } from './state/docStore';
import { gridArray, linearArray, radialArray } from './three/arrays';
import { ExportDialog } from './ui/ExportDialog';
import { SceneCanvas } from './three/SceneCanvas';
import { getScene } from './three/sceneHandle';
import type { CatalogStaticObject } from './ksa/staticCatalog';
import { randomId } from '../../../src/state/ids';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

function ToolButton(props: { tool: Tool; icon: React.ReactNode; label: string }) {
  const tool = useStore($tool);
  return (
    <ToggleButton
      size="sm"
      aria-label={props.label}
      isSelected={tool === props.tool}
      onChange={() => setTool(props.tool)}
    >
      {props.icon}
    </ToggleButton>
  );
}

function Toolbar({ onExport }: { onExport: () => void }) {
  const depth = useStore($historyDepth);
  const snap = useStore($snap);
  const groundLock = useStore($groundLock);
  const overlays = useStore($overlaysVisible);
  const selection = useStore($selection);
  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-panel px-2 py-1">
      <span className="mr-2 text-sm font-semibold text-fg">ICRP</span>
      <ToolButton tool="select" icon={<MousePointer2 size={14} />} label="Select" />
      <ToolButton tool="translate" icon={<Move size={14} />} label="Move" />
      <ToolButton tool="rotate" icon={<RotateCw size={14} />} label="Rotate" />
      <ToolButton tool="scale" icon={<Scaling size={14} />} label="Scale" />
      <div className="mx-1 h-4 w-px bg-border" />
      <ToggleButton
        size="sm"
        aria-label="Snap"
        isSelected={snap.enabled}
        onChange={() => toggleSnap()}
      >
        <Magnet size={14} />
      </ToggleButton>
      <ToggleButton
        size="sm"
        aria-label="Ground lock"
        isSelected={groundLock}
        onChange={() => $groundLock.set(!groundLock)}
      >
        <Grid3x3 size={14} />
      </ToggleButton>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        size="sm"
        variant="ghost"
        aria-label="Undo"
        isDisabled={depth.undo === 0}
        onPress={() => undo()}
      >
        <Redo2 size={14} className="-scale-x-100" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Redo"
        isDisabled={depth.redo === 0}
        onPress={() => redo()}
      >
        <Redo2 size={14} />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        size="sm"
        variant="ghost"
        aria-label="Frame all"
        onPress={() => getScene()?.frameAll()}
      >
        <Frame size={14} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Duplicate selection"
        isDisabled={selection.length === 0}
        onPress={() => duplicatePlacements(selection)}
      >
        <Copy size={14} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Delete selection"
        isDisabled={selection.length === 0}
        onPress={() => removePlacements(selection)}
      >
        <Trash2 size={14} />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        size="sm"
        variant="ghost"
        aria-label="Drop to ground"
        isDisabled={selection.length === 0}
        onPress={() => getScene()?.dropToGround(selection)}
      >
        <ArrowDownToLine size={14} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Rest on top"
        isDisabled={selection.length === 0}
        onPress={() => getScene()?.restOnTop(selection)}
      >
        <Layers size={14} />
      </Button>
      <ToggleButton
        size="sm"
        aria-label="Site overlays"
        isSelected={overlays}
        onChange={() => $overlaysVisible.set(!overlays)}
      >
        <Circle size={14} />
      </ToggleButton>
      <div className="flex-1" />
      <Button size="sm" onPress={onExport}>
        Export mod…
      </Button>
    </div>
  );
}

/** Imports a Core `<StaticObject>` prefab as the project's active object. */
function importCatalogObject(obj: CatalogStaticObject): void {
  resetProject({
    schemaVersion: ICRP_PROJECT_SCHEMA_VERSION,
    modName: 'my-complex',
    objects: [
      {
        id: `icrp_object_${randomId().slice(0, 8)}`,
        name: obj.id,
        placements: obj.placements.map((pl) => ({
          instanceId: pl.instanceId,
          pieceId: pl.instanceOf,
          transform: structuredClone(pl.transform),
          layerId: 'default',
        })),
        objectColliders: structuredClone(obj.colliders),
        groundOffsetM: obj.groundOffsetM,
        surfaceHeightM: obj.surfaceHeightM,
        footprintRadiusM: obj.footprintRadiusM,
      },
    ],
    activeObjectId: '', // fixed below
  });
  const p = $project.get();
  $project.set({ ...p, activeObjectId: p.objects[0].id });
  setTimeout(() => getScene()?.frameAll(), 300);
}

function Library() {
  const pieces = useStore($staticPieces);
  const vessel = useStore($vesselPieces);
  const objects = useStore($staticObjects);
  const ready = useStore($catalogReady);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const vesselFiltered = q
    ? vessel.filter((p) => p.id.toLowerCase().includes(q)).slice(0, 60)
    : vessel.slice(0, 30);
  return (
    <div className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-panel">
      <div className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
        Core prefabs
      </div>
      {objects.map((obj) => (
        <button
          key={obj.id}
          type="button"
          className="mx-2 rounded px-2 py-1 text-left text-sm text-fg hover:bg-wash-hover"
          onClick={() => importCatalogObject(obj)}
        >
          {obj.id}
          <span className="block text-xs text-fg-subtle">
            {obj.placements.length} placements · open as object
          </span>
        </button>
      ))}
      <div className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
        Pieces
      </div>
      {!ready && <div className="px-3 py-2 text-sm text-fg-muted">Loading catalog…</div>}
      {pieces.map((piece) => (
        <button
          key={piece.id}
          type="button"
          className="mx-2 rounded px-2 py-1 text-left text-sm text-fg hover:bg-wash-hover"
          onClick={() => addPlacement(piece.id)}
        >
          {piece.id.replace(/^Core.*_Subpart_/, '')}
          <span className="block text-xs text-fg-subtle">
            {piece.terrain ? 'terrain · ' : ''}
            {piece.alphaUrl ? 'alpha · ' : ''}
            {piece.colliders.length} colliders
          </span>
        </button>
      ))}
      <div className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
        Vessel parts ({vessel.length})
      </div>
      <div className="px-2 pb-1">
        <SearchField
          size="sm"
          aria-label="Search vessel parts"
          placeholder="Search…"
          value={query}
          onChange={setQuery}
        />
      </div>
      {vesselFiltered.map((piece) => (
        <button
          key={piece.id}
          type="button"
          className="mx-2 rounded px-2 py-1 text-left text-sm text-fg hover:bg-wash-hover"
          onClick={() => addPlacement(piece.id)}
        >
          {piece.id.replace(/^Core[^_]*_Subpart_/, '')}
          <span className="block text-xs text-fg-subtle">
            {piece.id.split('_')[0].replace(/^Core/, '')} · {piece.colliders.length} colliders
          </span>
        </button>
      ))}
      {q === '' && vessel.length > 30 && (
        <div className="px-3 py-1 text-[11px] text-fg-subtle">Search to see all…</div>
      )}
    </div>
  );
}

function AlignPanel() {
  const axes: Array<{ axis: 'east' | 'north' | 'up'; label: string }> = [
    { axis: 'east', label: 'East' },
    { axis: 'north', label: 'North' },
    { axis: 'up', label: 'Up' },
  ];
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Align</div>
      {axes.map(({ axis, label }) => (
        <div key={axis} className="flex items-center gap-1">
          <span className="w-10 text-xs text-fg-muted">{label}</span>
          {(['min', 'center', 'max'] as const).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant="ghost"
              onPress={() => getScene()?.alignSelection(axis, mode)}
            >
              {mode}
            </Button>
          ))}
        </div>
      ))}
      <div className="flex items-center gap-1">
        <span className="w-10 text-xs text-fg-muted">Spread</span>
        <Button size="sm" variant="ghost" onPress={() => getScene()?.distributeSelection('east')}>
          east
        </Button>
        <Button size="sm" variant="ghost" onPress={() => getScene()?.distributeSelection('north')}>
          north
        </Button>
      </div>
    </div>
  );
}

function ArrayPanel({ instanceId }: { instanceId: string }) {
  const [kind, setKind] = useState<'linear' | 'radial' | 'grid'>('linear');
  const [count, setCount] = useState(4);
  const [dEast, setDEast] = useState(5);
  const [dNorth, setDNorth] = useState(0);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);

  const apply = () => {
    const seed = getPlacement(instanceId);
    if (!seed) return;
    const transforms =
      kind === 'linear'
        ? linearArray(seed.transform, count, { x: 0, y: dEast, z: dNorth })
        : kind === 'radial'
          ? radialArray(seed.transform, count, { y: 0, z: 0 })
          : gridArray(seed.transform, rows, cols, dEast || 5, dNorth || 5);
    addArrayCopies(instanceId, transforms);
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Array</div>
      <div className="flex items-center gap-1">
        {(['linear', 'radial', 'grid'] as const).map((k) => (
          <ToggleButton key={k} size="sm" isSelected={kind === k} onChange={() => setKind(k)}>
            {k}
          </ToggleButton>
        ))}
      </div>
      {kind !== 'grid' && (
        <NumberField
          label="N"
          ariaLabel="Total count"
          value={count}
          min={2}
          max={64}
          step={1}
          onCommit={(v) => setCount(Math.round(v))}
        />
      )}
      {kind === 'linear' && (
        <>
          <NumberField
            label="E"
            ariaLabel="East step (m)"
            value={dEast}
            step={0.5}
            onCommit={setDEast}
          />
          <NumberField
            label="N"
            ariaLabel="North step (m)"
            value={dNorth}
            step={0.5}
            onCommit={setDNorth}
          />
        </>
      )}
      {kind === 'radial' && (
        <div className="text-[11px] text-fg-subtle">
          Copies spin about the object origin (up axis); the seed's offset is the ring radius.
        </div>
      )}
      {kind === 'grid' && (
        <>
          <NumberField
            label="R"
            ariaLabel="Rows"
            value={rows}
            min={1}
            max={32}
            step={1}
            onCommit={(v) => setRows(Math.round(v))}
          />
          <NumberField
            label="C"
            ariaLabel="Columns"
            value={cols}
            min={1}
            max={32}
            step={1}
            onCommit={(v) => setCols(Math.round(v))}
          />
          <NumberField
            label="E"
            ariaLabel="East spacing (m)"
            value={dEast}
            step={0.5}
            onCommit={setDEast}
          />
          <NumberField
            label="N"
            ariaLabel="North spacing (m)"
            value={dNorth}
            step={0.5}
            onCommit={setDNorth}
          />
        </>
      )}
      <Button size="sm" onPress={apply}>
        Apply array
      </Button>
    </div>
  );
}

function SelectionInspector() {
  const selection = useStore($selection);
  useStore($activeObject); // re-render on transform writes
  if (selection.length !== 1) {
    return (
      <div>
        <div className="px-3 py-2 text-sm text-fg-muted">
          {selection.length === 0 ? 'Nothing selected' : `${selection.length} selected`}
        </div>
        {selection.length >= 2 && <AlignPanel />}
      </div>
    );
  }
  const placement = getPlacement(selection[0]);
  if (!placement) return null;
  const t = placement.transform;
  const commit = (
    part: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    value: number,
  ) => {
    setPlacementTransform(placement.instanceId, {
      ...t,
      [part]: { ...t[part], [axis]: value },
    });
  };
  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="truncate text-xs text-fg-muted" title={placement.instanceId}>
        {placement.pieceId}
      </div>
      <Vec3Field
        label="Pos m"
        value={t.position}
        step={0.1}
        onInteractionStart={() => beginGesture('Edit position')}
        onCommit={(axis, v) => commit('position', axis, v)}
      />
      <Vec3Field
        label="Rot °"
        value={{ x: t.rotation.x * RAD2DEG, y: t.rotation.y * RAD2DEG, z: t.rotation.z * RAD2DEG }}
        step={5}
        onInteractionStart={() => beginGesture('Edit rotation')}
        onCommit={(axis, v) => commit('rotation', axis, v * DEG2RAD)}
      />
      <Vec3Field
        label="Scale"
        value={t.scale}
        step={0.1}
        onInteractionStart={() => beginGesture('Edit scale')}
        onCommit={(axis, v) => commit('scale', axis, v)}
      />
      <div className="text-[11px] text-fg-subtle">
        Pos axes: X=up · Y=east · Z=north (KSA frame). Scale never affects colliders.
      </div>
      <ArrayPanel instanceId={placement.instanceId} />
    </div>
  );
}

function ObjectSwitcher() {
  const project = useStore($project);
  const active = useStore($activeObject);
  return (
    <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Objects</div>
      {project.objects.map((o) => (
        <div key={o.id} className="flex items-center gap-1">
          <button
            type="button"
            className={cn(
              'flex-1 truncate rounded px-2 py-0.5 text-left text-sm hover:bg-wash-hover',
              o.id === active.id ? 'bg-wash-selected text-fg' : 'text-fg-muted',
            )}
            onClick={() => switchObject(o.id)}
            onDoubleClick={() => {
              const name = prompt('Object name', o.name);
              if (name) renameObject(o.id, name);
            }}
          >
            {o.name}
            <span className="ml-1 text-[11px] text-fg-subtle">{o.placements.length}</span>
          </button>
          {project.objects.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete ${o.name}`}
              onPress={() => removeObject(o.id)}
            >
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      ))}
      <Button size="sm" variant="ghost" onPress={() => addObject()}>
        + New object
      </Button>
      <div className="text-[11px] text-fg-subtle">
        Each object exports as one &lt;StaticObject&gt;; a launch site points at exactly one.
      </div>
    </div>
  );
}

function ObjectInspector() {
  const obj = useStore($activeObject);
  const meters: Array<{
    key: 'groundOffsetM' | 'surfaceHeightM' | 'footprintRadiusM';
    label: string;
    aria: string;
    suggest?: () => number | null;
  }> = [
    { key: 'groundOffsetM', label: 'G', aria: 'Ground offset (m)' },
    {
      key: 'surfaceHeightM',
      label: 'S',
      aria: 'Surface height (m)',
      suggest: () => getScene()?.suggestSurfaceHeightM() ?? null,
    },
    {
      key: 'footprintRadiusM',
      label: 'F',
      aria: 'Footprint radius (m)',
      suggest: () => getScene()?.suggestFootprintRadiusM() ?? null,
    },
  ];
  return (
    <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {obj.name} · {obj.placements.length} placements
      </div>
      {meters.map((m) => (
        <div key={m.key} className="flex items-center gap-1">
          <div className="flex-1">
            <NumberField
              label={m.label}
              ariaLabel={m.aria}
              value={obj[m.key] ?? 0}
              step={0.1}
              onInteractionStart={() => beginGesture(`Edit ${m.aria}`)}
              onCommit={(v) => setObjectMeters(m.key, v)}
            />
          </div>
          {m.suggest && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Auto ${m.aria}`}
              onPress={() => {
                const v = m.suggest!();
                if (v !== null) {
                  beginGesture(`Auto ${m.aria}`);
                  setObjectMeters(m.key, v);
                  endGesture();
                }
              }}
            >
              auto
            </Button>
          )}
        </div>
      ))}
      <div className="text-[11px] text-fg-subtle">
        Ground offset lifts the whole object; surface height is where vessels spawn; footprint
        radius gates the spawn bump + clutter clearing (max 4 pads/body).
      </div>
    </div>
  );
}

export function App() {
  const [exportOpen, setExportOpen] = useState(false);
  useEffect(() => {
    void ensureStaticCatalogLoaded();
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (mod && e.key === 'd') {
        e.preventDefault();
        duplicatePlacements($selection.get());
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        removePlacements($selection.get());
      } else if (e.key === 'f') {
        getScene()?.frameSelection();
      } else if (e.key === 'g') {
        $groundLock.set(!$groundLock.get());
      } else if (mod && e.key === 'ArrowDown' && e.shiftKey) {
        e.preventDefault();
        getScene()?.restOnTop($selection.get());
      } else if (mod && e.key === 'ArrowDown') {
        e.preventDefault();
        getScene()?.dropToGround($selection.get());
      } else if (e.key === 'Escape') {
        if (!getScene()?.cancelDrag()) $selection.set([]);
      } else if (e.key === 'q') {
        setTool('select');
      } else if (e.key === 'w') {
        setTool('translate');
      } else if (e.key === 'e') {
        setTool('rotate');
      } else if (e.key === 'r') {
        setTool('scale');
      }
    };
    window.addEventListener('keydown', onKey);
    // A numeric-field typing session is one streaming gesture (beginGesture on
    // focus, streamed commits per keystroke); leaving the field closes it so the
    // NEXT session gets its own undo step.
    document.addEventListener('focusout', endGesture);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusout', endGesture);
    };
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-canvas text-fg">
      <Toolbar onExport={() => setExportOpen(true)} />
      <ExportDialog isOpen={exportOpen} onClose={() => setExportOpen(false)} />
      <div className="flex min-h-0 flex-1">
        <Library />
        <div className={cn('relative min-w-0 flex-1')}>
          <SceneCanvas />
        </div>
        <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-panel">
          <div className="px-3 pt-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            Selection
          </div>
          <SelectionInspector />
          <ObjectInspector />
          <ObjectSwitcher />
        </div>
      </div>
    </div>
  );
}
