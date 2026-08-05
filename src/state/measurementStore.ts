import { atom } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';
import { randomId } from './ids';
import type { Vec3 } from '../ksa/types';
import { pushUndo } from './editorStore';
import { armTool, disarmTool, registerTool } from './modeStore';

/**
 * Measurement state (nanostores). Like {@link editorStore} this has no React /
 * three.js imports: the three.js layer ({@link MeasurementLayer}) subscribes and
 * renders, React reads via `useStore`.
 *
 * Measurements are an EDITOR AID only — they are never written to the exported
 * KSA XML (that serializes `EditingPart`). Placed line measurements persist with
 * the project (see projectStore); display settings are a global user pref.
 */

export type MeasurementUnit = 'm' | 'cm' | 'mm';
export type BoundsMode = 'world' | 'oriented';
export type AxisLock = 'none' | 'x' | 'y' | 'z';
/** Active click-to-create interaction (ephemeral). */
export type MeasureTool = 'none' | 'point' | 'meshDistance';

/** A placed line measurement (reference line or point-to-point). Persisted, never exported. */
export interface LineMeasurement {
  id: string;
  /** Endpoint A in world/part meters. */
  a: Vec3;
  /** Endpoint B in world/part meters. */
  b: Vec3;
  /** Constrains the line direction to an axis when not 'none'. */
  axisLock: AxisLock;
  /** Hex color, e.g. '#38bdf8'. */
  color: string;
  /** Line opacity 0..1. */
  lineOpacity: number;
  /** Line thickness in px (fat-line linewidth). */
  lineWidth: number;
  /** When locked, editing gizmos/inputs are hidden and the line is read-only. */
  locked: boolean;
  /** Creation method; rendering is identical. */
  source: 'reference' | 'point';
}

export interface MeasurementSettings {
  unit: MeasurementUnit;
  boundsMode: BoundsMode;
  showSelectionBounds: boolean;
  showPerMesh: boolean;
  /** When on and exactly two meshes are selected, show the gap between them. */
  showMeshDistance: boolean;
}

/** Computed AABB/OBB of the current selection, written by {@link MeasurementLayer}. */
export interface SelectionBounds {
  size: Vec3;
  min: Vec3;
  max: Vec3;
  mode: BoundsMode;
}

const DEFAULT_COLOR = '#38bdf8';
const DEFAULT_LINE_OPACITY = 0.5;
const DEFAULT_LINE_WIDTH = 2;

/** Placed line measurements (persisted with the project, never exported). */
export const $measurements = atom<LineMeasurement[]>([]);

/** Global display settings (localStorage, not per-project — like $grids). */
export const $measurementSettings = persistentJSON<MeasurementSettings>('flexo:measure', {
  unit: 'm',
  boundsMode: 'world',
  showSelectionBounds: false,
  showPerMesh: false,
  showMeshDistance: false,
});

/**
 * Active click-to-create tool (ephemeral).
 *
 * **Read-only from outside this module** — it mirrors the `'measure'` tenancy of
 * `modeStore.$activeTool` and is only ever written by {@link setMeasureTool} (or by the
 * slot's own cancel hook below). The atom survives the move into the slot because
 * `EditorScene` and the aid UI both key off the KIND of pick in flight, which the slot
 * does not model.
 */
export const $measureTool = atom<MeasureTool>('none');

/**
 * The first point of a point-to-point measure, once placed — the half-placed pick state
 * (design-build-mode.md §8.1). `null` means "no point yet", which is what makes the status
 * segment's two-step instruction (`click first point` → `…second point`) and the tool
 * parameter card's `A placed at (x, y, z)` possible; v1 kept this entirely inside
 * `EditorScene` and the armed state was invisible.
 *
 * Written by `EditorScene`'s pick handler, cleared by the tool's cancel hook. Ephemeral:
 * never persisted, never in undo.
 */
export const $measurePending = atom<Vec3 | null>(null);

/**
 * The measure tool's tenancy of the single `$activeTool` slot (foundation §2.6 row 1):
 * allowed in every mode, cancelled by a mode switch, and cancelled when any other tool
 * arms.
 *
 * `onCancel` writes the mirror atom DIRECTLY rather than calling {@link setMeasureTool} —
 * routing back through the setter would re-enter `disarmTool` and, when the cancel came
 * from `armTool`, stomp the successor that already holds the slot. `EditorScene`'s
 * `$activeTool` subscription does the rest of the teardown (crosshair off, half-placed
 * pick removed).
 */
registerTool('measure', {
  onCancel: () => {
    $measureTool.set('none');
    $measurePending.set(null);
  },
});

/** Currently-edited measurement id (ephemeral). */
export const $activeMeasurementId = atom<string | null>(null);

/** Which endpoint the editing gizmo controls (ephemeral). */
export const $activeEndpoint = atom<'a' | 'b'>('b');

/** Selection bounds, written by the three layer; read by the React info display. */
export const $selectionBounds = atom<SelectionBounds | null>(null);

function newId(): string {
  return randomId();
}

/** Adds a measurement and makes it the active (editable) one. Returns its id. */
export function addMeasurement(
  m: Omit<LineMeasurement, 'id' | 'color' | 'locked' | 'axisLock' | 'lineOpacity' | 'lineWidth'> &
    Partial<Pick<LineMeasurement, 'color' | 'locked' | 'axisLock' | 'lineOpacity' | 'lineWidth'>>,
): string {
  pushUndo(m.source === 'reference' ? 'add reference line' : 'add measurement');
  const id = newId();
  const measurement: LineMeasurement = {
    id,
    a: m.a,
    b: m.b,
    source: m.source,
    axisLock: m.axisLock ?? 'none',
    color: m.color ?? DEFAULT_COLOR,
    lineOpacity: m.lineOpacity ?? DEFAULT_LINE_OPACITY,
    lineWidth: m.lineWidth ?? DEFAULT_LINE_WIDTH,
    locked: m.locked ?? false,
  };
  $measurements.set([...$measurements.get(), measurement]);
  $activeMeasurementId.set(id);
  return id;
}

/** Streaming mutation: no undo push — the caller pushes once at interaction start. */
export function updateMeasurement(id: string, patch: Partial<Omit<LineMeasurement, 'id'>>): void {
  $measurements.set($measurements.get().map((m) => (m.id === id ? { ...m, ...patch } : m)));
}

export function removeMeasurement(id: string): void {
  pushUndo('delete line');
  $measurements.set($measurements.get().filter((m) => m.id !== id));
  if ($activeMeasurementId.get() === id) $activeMeasurementId.set(null);
}

export function setMeasurementLocked(id: string, locked: boolean): void {
  pushUndo(locked ? 'lock line' : 'unlock line');
  updateMeasurement(id, { locked });
}

export function setMeasurementSettings(patch: Partial<MeasurementSettings>): void {
  $measurementSettings.set({ ...$measurementSettings.get(), ...patch });
}

/**
 * Arms (`'point'`) or disarms (`'none'`) the measure tool THROUGH the `$activeTool` slot,
 * so arming it cancels whatever else was armed and a mode switch cancels it (foundation
 * §2.6). Every v1 entry point keeps calling this — the `M` binding, Tools ▸ Measure
 * Point-to-Point, the Outliner's Aids `＋ p2p`, the palette — so they can never disagree
 * about what "armed" means.
 */
export function setMeasureTool(tool: MeasureTool): void {
  if ($measureTool.get() === tool) return;
  $measureTool.set(tool);
  if (tool === 'none') disarmTool('measure');
  else armTool('measure');
}

/** `EditorScene` reports the half-placed first point (or `null` once the pick completes). */
export function setMeasurePending(point: Vec3 | null): void {
  $measurePending.set(point);
}

export function setActiveMeasurement(id: string | null): void {
  $activeMeasurementId.set(id);
}

export function setActiveEndpoint(end: 'a' | 'b'): void {
  $activeEndpoint.set(end);
}

/** Adds a 1m reference line centered on `center` (defaults to the origin), along X. */
export function addReferenceLine(center: Vec3 = { x: 0, y: 0, z: 0 }): string {
  return addMeasurement({
    source: 'reference',
    a: { x: center.x - 0.5, y: center.y, z: center.z },
    b: { x: center.x + 0.5, y: center.y, z: center.z },
  });
}

/** Re-aligns endpoint `b` so the segment is parallel to `axis` (keeps b's axis component). */
export function snappedToAxis(a: Vec3, b: Vec3, axis: AxisLock): Vec3 {
  if (axis === 'none') return b;
  return {
    x: axis === 'x' ? b.x : a.x,
    y: axis === 'y' ? b.y : a.y,
    z: axis === 'z' ? b.z : a.z,
  };
}
