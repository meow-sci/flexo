/**
 * ICRP app shell (plans/ICRP_PLAN.md P2/P9 seed): toolbar (tools/snap/undo),
 * piece library on the left, viewport centre, inspector on the right.
 * Built on flexo's ui/kit primitives; grows a full menubar/palette in P9.
 */
import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  Frame,
  Grid3x3,
  Magnet,
  Move,
  MousePointer2,
  Redo2,
  RotateCw,
  Scaling,
  Trash2,
  Copy,
} from 'lucide-react';
import { Button, ToggleButton, cn } from '../../../src/ui/kit';
import { NumberField } from '../../../src/ui/NumberField';
import { Vec3Field } from '../../../src/ui/Vec3Field';
import {
  $activeObject,
  $historyDepth,
  $project,
  $selection,
  addPlacement,
  beginGesture,
  duplicatePlacements,
  endGesture,
  getPlacement,
  redo,
  removePlacements,
  resetProject,
  setObjectMeters,
  setPlacementTransform,
  undo,
  ICRP_PROJECT_SCHEMA_VERSION,
} from './state/docStore';
import {
  $catalogReady,
  $staticObjects,
  $staticPieces,
  ensureStaticCatalogLoaded,
} from './state/catalogStore';
import { $groundLock, $snap, $tool, setTool, toggleSnap, type Tool } from './state/toolStore';
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

function Toolbar() {
  const depth = useStore($historyDepth);
  const snap = useStore($snap);
  const groundLock = useStore($groundLock);
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
  const objects = useStore($staticObjects);
  const ready = useStore($catalogReady);
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
    </div>
  );
}

function SelectionInspector() {
  const selection = useStore($selection);
  useStore($activeObject); // re-render on transform writes
  if (selection.length !== 1) {
    return (
      <div className="px-3 py-2 text-sm text-fg-muted">
        {selection.length === 0 ? 'Nothing selected' : `${selection.length} selected`}
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
    </div>
  );
}

function ObjectInspector() {
  const obj = useStore($activeObject);
  const meters: Array<{
    key: 'groundOffsetM' | 'surfaceHeightM' | 'footprintRadiusM';
    label: string;
    aria: string;
  }> = [
    { key: 'groundOffsetM', label: 'G', aria: 'Ground offset (m)' },
    { key: 'surfaceHeightM', label: 'S', aria: 'Surface height (m)' },
    { key: 'footprintRadiusM', label: 'F', aria: 'Footprint radius (m)' },
  ];
  return (
    <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {obj.name} · {obj.placements.length} placements
      </div>
      {meters.map((m) => (
        <NumberField
          key={m.key}
          label={m.label}
          ariaLabel={m.aria}
          value={obj[m.key] ?? 0}
          step={0.1}
          onInteractionStart={() => beginGesture(`Edit ${m.aria}`)}
          onCommit={(v) => setObjectMeters(m.key, v)}
        />
      ))}
      <div className="text-[11px] text-fg-subtle">
        Ground offset lifts the whole object; surface height is where vessels spawn; footprint
        radius gates the spawn bump + clutter clearing (max 4 pads/body).
      </div>
    </div>
  );
}

export function App() {
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
      <Toolbar />
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
        </div>
      </div>
    </div>
  );
}
