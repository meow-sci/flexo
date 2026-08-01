import { describe, it, expect, beforeEach } from 'vitest';
import { $part, importHistory, pushUndo, undo } from './editorStore';
import { setInspectorMode } from './uiStore';
import {
  createEmptyPart,
  createNozzle,
  createSolidMotorNozzle,
  createSubPartGameData,
  DEFAULT_LAYER_ID,
  identityTransform,
} from '../ksa/types';
import type { EditingPart, SubPartPlacement } from '../ksa/types';
import {
  $activeEngineEntry,
  $activeNozzleRef,
  $activeNozzleTarget,
  $effectiveToolMode,
  $engineEntries,
  $engineExhaustGizmo,
  $isExhaustPlacing,
  $resolvedNozzleTargets,
  nozzleRefKey,
  setActiveEngine,
  setActiveNozzleRef,
  setEngineExhaustGizmo,
  updateNozzleAt,
  type NozzleRef,
} from './engineStore';
import { $toolMode, setToolMode } from './editorStore';

const TMPL = 'CorePropulsionA_Subpart_ThrustChamber';

const placement = (instanceId: string, subPartTemplateId: string): SubPartPlacement => ({
  instanceId,
  subPartTemplateId,
  ...identityTransform(),
  layerId: DEFAULT_LAYER_ID,
});

/** A part with N De Laval + M solid nozzles on the SubPart template, placed once. */
function subPartEnginePart(delaval: string[], solid: string[] = []): EditingPart {
  const part = createEmptyPart();
  part.placements.push(placement('chamber_1', TMPL));
  const spd = createSubPartGameData(TMPL);
  for (const id of delaval) spd.nozzles.push(createNozzle(id));
  for (const id of solid) spd.solidNozzles.push(createSolidMotorNozzle(id));
  part.subPartGameData.push(spd);
  return part;
}

const keys = () => $resolvedNozzleTargets.get().map((t) => t.key);

beforeEach(() => {
  $part.set(createEmptyPart());
  importHistory({ undo: [], redo: [] });
  setActiveEngine(null);
  setToolMode('translate');
  setInspectorMode('assets');
});

describe('engineStore — $engineEntries', () => {
  it('is empty for a part with no engine hardware', () => {
    expect($engineEntries.get()).toEqual([]);
  });

  it('lists a SubPart template that carries only nozzles (no combustor)', () => {
    // Reachability matters: a bare `<SolidMotorNozzle>` on a reused thrust assembly is real
    // stock authoring, and if the designer skipped it its handles would be unreachable.
    $part.set(subPartEnginePart([], ['Nozzle']));
    expect($engineEntries.get()).toEqual([{ kind: 'subpart', templateId: TMPL }]);
  });

  it('adds the part entry when <PartGameData> carries engine hardware itself', () => {
    // The stock RCS pattern: the whole battery of nozzles lives on the part.
    const part = createEmptyPart();
    part.gameData.nozzles.push(createNozzle('Thruster'));
    $part.set(part);
    expect($engineEntries.get()).toEqual([{ kind: 'part' }]);
  });

  it('lists both scopes when both carry hardware, SubParts first', () => {
    const part = subPartEnginePart(['Nozzle']);
    part.gameData.nozzles.push(createNozzle('GasGen'));
    $part.set(part);
    expect($engineEntries.get()).toEqual([{ kind: 'subpart', templateId: TMPL }, { kind: 'part' }]);
  });
});

describe('engineStore — $resolvedNozzleTargets', () => {
  it('is empty with no engine open', () => {
    $part.set(subPartEnginePart(['A', 'B']));
    expect($resolvedNozzleTargets.get()).toEqual([]);
  });

  it('emits one target per nozzle across BOTH flavors (not just the first De Laval)', () => {
    $part.set(subPartEnginePart(['A', 'B'], ['S']));
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    expect($resolvedNozzleTargets.get().map((t) => [t.nozzle.id, t.ref.kind])).toEqual([
      ['A', 'delaval'],
      ['B', 'delaval'],
      ['S', 'solid'],
    ]);
  });

  it('anchors a SubPart target to its own placement frame', () => {
    const part = subPartEnginePart(['A']);
    part.placements[0].position = { x: 4, y: 0, z: 0 };
    $part.set(part);
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    const targets = $resolvedNozzleTargets.get();
    expect(targets).toHaveLength(1);
    expect(targets[0].frame?.position).toEqual({ x: 4, y: 0, z: 0 });
    expect(targets[0].instanceCount).toBe(1);
  });

  // THE built-in-RCS shape: `CorePropulsionB_Prefab_RCSALargeA` places ONE thruster SubPart
  // (carrying ONE `<DeLavalNozzle Id="Nozzle">`) four times at four rotations. KSA makes each
  // placement its own child Part with its own RocketNozzle module, so all four are real
  // thrusters — drawing only the first placement left three of them with no handle at all.
  it('emits one target per PLACEMENT of the owning template (the stock RCS block)', () => {
    const part = subPartEnginePart(['Nozzle']);
    for (const [i, pos] of [
      { x: 0.3512, y: 0, z: 0 },
      { x: 0, y: 0.207, z: 0 },
      { x: 0, y: -0.207, z: 0 },
    ].entries()) {
      part.placements.push({ ...placement(`thruster_${i + 2}`, TMPL), position: pos });
    }
    $part.set(part);
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    const targets = $resolvedNozzleTargets.get();
    expect(targets).toHaveLength(4);
    expect(targets.map((t) => t.ref.scope === 'subpart' && t.ref.instanceId)).toEqual([
      'chamber_1',
      'thruster_2',
      'thruster_3',
      'thruster_4',
    ]);
    // All four are views of ONE document nozzle, each in its own frame.
    expect(new Set(targets.map((t) => t.nozzle)).size).toBe(1);
    expect(targets.map((t) => t.frame?.position.y)).toEqual([0, 0, 0.207, -0.207]);
    expect(targets.map((t) => t.instanceIndex)).toEqual([0, 1, 2, 3]);
    expect(targets.every((t) => t.instanceCount === 4)).toBe(true);
    expect(new Set(targets.map((t) => t.key)).size).toBe(4); // distinct handles
    expect(targets.filter((t) => t.isActive)).toHaveLength(1);
  });

  it('fans an FX override out across placements too, keeping channels paired', () => {
    const part = subPartEnginePart(['Nozzle']);
    part.placements.push(placement('thruster_2', TMPL));
    part.subPartGameData[0].nozzles[0].fxExhaustLocation = { x: -0.15, y: -0.23, z: 0 };
    $part.set(part);
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    expect(
      $resolvedNozzleTargets
        .get()
        .map((t) => [t.ref.scope === 'subpart' ? t.ref.instanceId : 'part', t.ref.channel]),
    ).toEqual([
      ['chamber_1', 'physics'],
      ['chamber_1', 'fx'],
      ['thruster_2', 'physics'],
      ['thruster_2', 'fx'],
    ]);
  });

  it('lets the gizmo target a specific PLACEMENT of a shared nozzle', () => {
    const part = subPartEnginePart(['Nozzle']);
    part.placements.push({ ...placement('thruster_2', TMPL), position: { x: 0, y: 2, z: 0 } });
    $part.set(part);
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    setActiveNozzleRef({
      scope: 'subpart',
      templateId: TMPL,
      instanceId: 'thruster_2',
      kind: 'delaval',
      index: 0,
      channel: 'physics',
    });
    const active = $activeNozzleTarget.get()!;
    expect(active.frame?.position).toEqual({ x: 0, y: 2, z: 0 });
    expect(active.instanceIndex).toBe(1);
  });

  it('degrades a ref naming a REMOVED placement to the first handle', () => {
    const part = subPartEnginePart(['Nozzle']);
    part.placements.push(placement('thruster_2', TMPL));
    $part.set(part);
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    setActiveNozzleRef({
      scope: 'subpart',
      templateId: TMPL,
      instanceId: 'thruster_2',
      kind: 'delaval',
      index: 0,
      channel: 'physics',
    });
    const cur = $part.get();
    $part.set({ ...cur, placements: cur.placements.filter((p) => p.instanceId !== 'thruster_2') });
    expect($resolvedNozzleTargets.get()).toHaveLength(1);
    expect($activeNozzleTarget.get()?.ref).toMatchObject({ instanceId: 'chamber_1' });
  });

  it('gives part-level nozzles a null frame (they are already Part space)', () => {
    const part = createEmptyPart();
    part.gameData.nozzles.push(createNozzle('Thruster'));
    $part.set(part);
    setActiveEngine({ kind: 'part' });
    const targets = $resolvedNozzleTargets.get();
    expect(targets).toHaveLength(1);
    expect(targets[0].frame).toBeNull();
    expect(targets[0].instanceCount).toBe(1);
  });

  it('falls back to a null frame when the engine template is not placed', () => {
    const part = subPartEnginePart(['A']);
    part.placements.length = 0;
    $part.set(part);
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    expect($resolvedNozzleTargets.get()[0].frame).toBeNull();
  });

  it('adds a second fx target only for a nozzle that overrides its FX placement', () => {
    const part = subPartEnginePart(['A', 'B']);
    part.subPartGameData[0].nozzles[1].fxExhaustLocation = { x: -0.16, y: 0.23, z: 0.312 };
    $part.set(part);
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    expect($resolvedNozzleTargets.get().map((t) => [t.nozzle.id, t.ref.channel])).toEqual([
      ['A', 'physics'],
      ['B', 'physics'],
      ['B', 'fx'],
    ]);
  });

  it('inherits the physics pair for whichever fx field is still null (KSA OnDataLoad)', () => {
    const part = subPartEnginePart(['A']);
    const n = part.subPartGameData[0].nozzles[0];
    n.exhaustLocation = { x: 1, y: 2, z: 3 };
    n.exhaustDirection = { x: 0, y: 0, z: -1 };
    n.fxExhaustLocation = { x: -0.05, y: 0.22, z: 0.315 };
    n.fxExhaustDirection = null; // stock does exactly this
    $part.set(part);
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    const fx = $resolvedNozzleTargets.get().find((t) => t.ref.channel === 'fx')!;
    expect(fx.location).toEqual({ x: -0.05, y: 0.22, z: 0.315 });
    expect(fx.direction).toEqual({ x: 0, y: 0, z: -1 });
  });

  it('marks exactly one target active — the first by default', () => {
    $part.set(subPartEnginePart(['A', 'B', 'C']));
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    const targets = $resolvedNozzleTargets.get();
    expect(targets.filter((t) => t.isActive).map((t) => t.nozzle.id)).toEqual(['A']);
    expect($activeNozzleTarget.get()?.nozzle.id).toBe('A');
  });

  it('honours an explicit ref, and any nozzle can be targeted (not only index 0)', () => {
    $part.set(subPartEnginePart(['A', 'B', 'C']));
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    setActiveNozzleRef({
      scope: 'subpart',
      templateId: TMPL,
      instanceId: 'chamber_1',
      kind: 'delaval',
      index: 2,
      channel: 'physics',
    });
    expect($activeNozzleTarget.get()?.nozzle.id).toBe('C');
  });

  it('degrades a STALE ref (its nozzle was removed) to the first target, not a wrong one', () => {
    $part.set(subPartEnginePart(['A', 'B', 'C']));
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    setActiveNozzleRef({
      scope: 'subpart',
      templateId: TMPL,
      instanceId: 'chamber_1',
      kind: 'delaval',
      index: 2,
      channel: 'physics',
    });
    const part = $part.get();
    $part.set({
      ...part,
      subPartGameData: [{ ...part.subPartGameData[0], nozzles: [createNozzle('A')] }],
    });
    expect($resolvedNozzleTargets.get()).toHaveLength(1);
    expect($activeNozzleTarget.get()?.nozzle.id).toBe('A');
  });

  it('resolves nothing (and no active target) once the open engine is gone', () => {
    $part.set(subPartEnginePart(['A']));
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    $part.set(createEmptyPart());
    expect($resolvedNozzleTargets.get()).toEqual([]);
    expect($activeNozzleTarget.get()).toBeNull();
  });
});

describe('engineStore — NozzleRef identity', () => {
  const base: NozzleRef = {
    scope: 'subpart',
    templateId: TMPL,
    instanceId: 'chamber_1',
    kind: 'delaval',
    index: 0,
    channel: 'physics',
  };

  it('distinguishes every field of a ref', () => {
    const k = nozzleRefKey(base);
    expect(nozzleRefKey({ ...base, index: 1 })).not.toBe(k);
    expect(nozzleRefKey({ ...base, kind: 'solid' })).not.toBe(k);
    expect(nozzleRefKey({ ...base, channel: 'fx' })).not.toBe(k);
    expect(nozzleRefKey({ ...base, templateId: 'Other' })).not.toBe(k);
    expect(nozzleRefKey({ ...base, instanceId: 'chamber_2' })).not.toBe(k);
    expect(nozzleRefKey({ scope: 'part', kind: 'delaval', index: 0, channel: 'physics' })).not.toBe(
      k,
    );
  });

  it('is value-based, so a rebuilt ref still names the same nozzle', () => {
    expect(nozzleRefKey({ ...base })).toBe(nozzleRefKey(base));
  });
});

describe('engineStore — updateNozzleAt dispatch', () => {
  it('patches a SubPart De Laval nozzle at an index > 0', () => {
    $part.set(subPartEnginePart(['A', 'B']));
    updateNozzleAt(
      {
        scope: 'subpart',
        templateId: TMPL,
        instanceId: 'chamber_1',
        kind: 'delaval',
        index: 1,
        channel: 'physics',
      },
      { exhaustLocation: { x: 1, y: 2, z: 3 } },
    );
    const nozzles = $part.get().subPartGameData[0].nozzles;
    expect(nozzles[0].exhaustLocation).toEqual({ x: 0, y: 0, z: 0 });
    expect(nozzles[1].exhaustLocation).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('patches a SubPart SOLID nozzle (its own list, not the De Laval one)', () => {
    $part.set(subPartEnginePart(['A'], ['S']));
    updateNozzleAt(
      {
        scope: 'subpart',
        templateId: TMPL,
        instanceId: 'chamber_1',
        kind: 'solid',
        index: 0,
        channel: 'physics',
      },
      { exhaustDirection: { x: 0, y: 1, z: 0 } },
    );
    expect($part.get().subPartGameData[0].solidNozzles[0].exhaustDirection).toEqual({
      x: 0,
      y: 1,
      z: 0,
    });
    expect($part.get().subPartGameData[0].nozzles[0].exhaustDirection).toEqual({
      x: -1,
      y: 0,
      z: 0,
    });
  });

  it('patches part-level nozzles of both flavors', () => {
    const part = createEmptyPart();
    part.gameData.nozzles.push(createNozzle('P'));
    part.gameData.solidNozzles.push(createSolidMotorNozzle('PS'));
    $part.set(part);
    updateNozzleAt(
      { scope: 'part', kind: 'delaval', index: 0, channel: 'physics' },
      {
        fxExhaustLocation: { x: 1, y: 0, z: 0 },
      },
    );
    updateNozzleAt(
      { scope: 'part', kind: 'solid', index: 0, channel: 'physics' },
      {
        fxExhaustDirection: { x: 0, y: 0.55, z: -1 },
      },
    );
    expect($part.get().gameData.nozzles[0].fxExhaustLocation).toEqual({ x: 1, y: 0, z: 0 });
    expect($part.get().gameData.solidNozzles[0].fxExhaustDirection).toEqual({
      x: 0,
      y: 0.55,
      z: -1,
    });
  });

  // `updateNozzleAt` is STREAMING: it dispatches to the existing streaming actions, so the
  // caller owns the undo step (EditorScene pushes one on gizmo drag-start, the FX/Normalize
  // switches push one per toggle). This locks in that the pair really is undoable.
  it('is undoable when the caller pushes one step per interaction', () => {
    $part.set(subPartEnginePart(['A']));
    const ref: NozzleRef = {
      scope: 'subpart',
      templateId: TMPL,
      instanceId: 'chamber_1',
      kind: 'delaval',
      index: 0,
      channel: 'physics',
    };
    const dir = () => $part.get().subPartGameData[0].nozzles[0].exhaustDirection;
    pushUndo('exhaust', 'A');
    // Several streaming writes inside ONE interaction, as a drag produces.
    updateNozzleAt(ref, { exhaustDirection: { x: 0, y: 0, z: -1 } });
    updateNozzleAt(ref, { exhaustDirection: { x: 0, y: 1, z: 0 } });
    expect(dir()).toEqual({ x: 0, y: 1, z: 0 });
    undo();
    expect(dir()).toEqual({ x: -1, y: 0, z: 0 }); // one step, back to the default axis
  });

  it('is a no-op for a stale index rather than throwing or writing elsewhere', () => {
    $part.set(subPartEnginePart(['A']));
    const before = $part.get();
    updateNozzleAt(
      {
        scope: 'subpart',
        templateId: TMPL,
        instanceId: 'chamber_1',
        kind: 'delaval',
        index: 7,
        channel: 'physics',
      },
      { exhaustLocation: { x: 9, y: 9, z: 9 } },
    );
    updateNozzleAt(
      { scope: 'part', kind: 'delaval', index: 0, channel: 'physics' },
      { exhaustLocation: { x: 9, y: 9, z: 9 } },
    );
    expect($part.get()).toBe(before);
  });
});

describe('engineStore — exhaust placement mode discipline', () => {
  beforeEach(() => {
    $part.set(subPartEnginePart(['A']));
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    setInspectorMode('engine');
  });

  it('is not placing until the gizmo is on AND a nozzle resolves', () => {
    expect($isExhaustPlacing.get()).toBe(false);
    setEngineExhaustGizmo(true);
    expect($isExhaustPlacing.get()).toBe(true);
    $part.set(createEmptyPart()); // nozzle gone ⇒ nothing to place
    expect($isExhaustPlacing.get()).toBe(false);
  });

  it('stops placing when the designer is left, without forgetting the toggle', () => {
    setEngineExhaustGizmo(true);
    setInspectorMode('assets');
    expect($isExhaustPlacing.get()).toBe(false);
    setInspectorMode('engine');
    expect($isExhaustPlacing.get()).toBe(true);
  });

  it('clamps Scale to Move while placing, and leaves $toolMode itself untouched', () => {
    setToolMode('scale');
    expect($effectiveToolMode.get()).toBe('scale');
    setEngineExhaustGizmo(true);
    expect($effectiveToolMode.get()).toBe('translate');
    expect($toolMode.get()).toBe('scale'); // the user's tool choice is theirs to keep
    setEngineExhaustGizmo(false);
    expect($effectiveToolMode.get()).toBe('scale');
  });

  it('passes translate and rotate through unchanged', () => {
    setEngineExhaustGizmo(true);
    setToolMode('translate');
    expect($effectiveToolMode.get()).toBe('translate');
    setToolMode('rotate');
    expect($effectiveToolMode.get()).toBe('rotate');
  });
});

describe('engineStore — setActiveEngine resets sub-selection', () => {
  it('clears the targeted nozzle and the gizmo when the engine changes', () => {
    $part.set(subPartEnginePart(['A', 'B']));
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    setActiveNozzleRef({
      scope: 'subpart',
      templateId: TMPL,
      instanceId: 'chamber_1',
      kind: 'delaval',
      index: 1,
      channel: 'physics',
    });
    setEngineExhaustGizmo(true);

    setActiveEngine({ kind: 'part' });
    expect($activeEngineEntry.get()).toEqual({ kind: 'part' });
    expect($activeNozzleRef.get()).toBeNull();
    expect($engineExhaustGizmo.get()).toBe(false);
  });
});

describe('engineStore — target keys are stable and unique', () => {
  it('keys every handle of a multi-nozzle, multi-channel engine distinctly', () => {
    const part = subPartEnginePart(['A', 'B'], ['S']);
    part.subPartGameData[0].nozzles[0].fxExhaustDirection = { x: 0, y: 0.55, z: -1 };
    $part.set(part);
    setActiveEngine({ kind: 'subpart', templateId: TMPL });
    const all = keys();
    expect(all).toHaveLength(4);
    expect(new Set(all).size).toBe(4);
  });
});
