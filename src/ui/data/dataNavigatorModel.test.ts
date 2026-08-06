import { describe, it, expect } from 'vitest';
import { buildDataNavigator } from './dataNavigatorModel';
import type { GameDataFinding } from '../../state/gameDataFindings';
import {
  createCombustor,
  createEmptyPart,
  createPartLight,
  createSolarPanel,
  createSubPartGameData,
  createTank,
  DEFAULT_LAYER_ID,
  identityTransform,
  IVA_SEAT_LAYER_ID,
} from '../../ksa/types';
import type { EditingPart } from '../../ksa/types';

function place(part: EditingPart, instanceId: string, subPartTemplateId: string): void {
  part.placements.push({
    instanceId,
    subPartTemplateId,
    ...identityTransform(),
    layerId: DEFAULT_LAYER_ID,
  });
}

function named(): EditingPart {
  const part = createEmptyPart();
  part.partId = 'rover_1';
  return part;
}

describe('buildDataNavigator — Part root', () => {
  it('labels the root with the display name, falling back to the Part Id', () => {
    const part = named();
    expect(buildDataNavigator(part, []).part.label).toBe('rover_1');
    part.gameData.displayName = 'Rover';
    expect(buildDataNavigator(part, []).part.label).toBe('Rover');
  });

  // A multi-part project has to say WHICH part's data the pinned root scopes to; `null` is
  // the single-part case and must reproduce the label above exactly (I8).
  it('appends the registry part name, and falls back to it for an unnamed document', () => {
    const part = named();
    expect(buildDataNavigator(part, [], '', 'Part 2').part.label).toBe('rover_1 — Part 2');
    expect(buildDataNavigator(part, [], '', 'rover_1').part.label).toBe('rover_1');
    part.partId = '';
    expect(buildDataNavigator(part, [], '', 'Part 2').part.label).toBe('Part 2');
    expect(buildDataNavigator(part, [], '', null).part.label).toBe('(unnamed part)');
  });

  it('badges tanks, power, coupling and wiring with the v1 count recipes', () => {
    const part = named();
    part.gameData.tanks.push(createTank(), createTank());
    part.gameData.batteries.push({ capacityWh: 1 });
    part.gameData.generators.push({ outputWatts: 5 });
    part.gameData.powerConsumer = { consumedWatts: 2, lightSwitch: false, lightIsActive: false };
    part.gameData.decoupler = { connectorId: '_c1', force: 500 };

    const sections = Object.fromEntries(
      buildDataNavigator(part, []).part.sections.map((s) => [s.sectionId, s.count]),
    );
    expect(sections.tanks).toBe(2);
    expect(sections.power).toBe(3); // battery + generator + consumer
    expect(sections.coupling).toBe(1);
    expect(sections.wiring).toBe(0);
  });

  it('counts passthrough as children + one synthetic attrs row + customMassExtras', () => {
    const part = named();
    part.gameData.unknownChildren.push({ tag: 'Aligned', attrs: {}, children: [] });
    part.gameData.unknownAttrs = { Something: 'x' };
    part.gameData.customMass = 100;
    part.gameData.customMassExtras.push({ tag: 'MassSpecificInertia', attrs: {}, children: [] });

    const passthrough = buildDataNavigator(part, []).part.sections.find(
      (s) => s.sectionId === 'passthrough',
    )!;
    expect(passthrough.count).toBe(3);
  });

  it('lists the eight Part sections in form order', () => {
    expect(buildDataNavigator(named(), []).part.sections.map((s) => s.sectionId)).toEqual([
      'identity',
      'mass',
      'tanks',
      'power',
      'coupling',
      'wiring',
      'advanced',
      'passthrough',
    ]);
  });
});

describe('buildDataNavigator — template rows', () => {
  it('lists one row per template with a placement, with ×N and content badges', () => {
    const part = named();
    place(part, 'tank_1', 'TankB');
    place(part, 'tank_2', 'TankB');
    place(part, 'nose_1', 'NoseCone');
    part.subPartGameData.push({
      ...createSubPartGameData('TankB'),
      tanks: [createTank(), createTank()],
      solarPanels: [createSolarPanel()],
    });
    part.lights.push(createPartLight('TankB', '_light1'));

    const model = buildDataNavigator(part, []);
    expect(model.templates.map((t) => t.templateId)).toEqual(['TankB', 'NoseCone']);

    const tankRow = model.templates[0];
    expect(tankRow.placementCount).toBe(2);
    expect(tankRow.instanceIds).toEqual(['tank_1', 'tank_2']);
    expect(tankRow.badges.map((b) => [b.icon, b.count])).toEqual([
      ['⛁', 2],
      ['💡', 1],
      ['☀', 1],
    ]);
    expect(tankRow.empty).toBe(false);
  });

  it('flags a capable-but-empty template', () => {
    const part = named();
    place(part, 'nose_1', 'NoseCone');
    const [row] = buildDataNavigator(part, []).templates;
    expect(row.empty).toBe(true);
    expect(row.badges).toEqual([]);
  });

  it('includes a glass template — every SubPart template is data-capable', () => {
    const part = named();
    place(part, 'window_1', 'CoreGlassA_Subpart_Window');
    expect(buildDataNavigator(part, []).templates.map((t) => t.templateId)).toEqual([
      'CoreGlassA_Subpart_Window',
    ]);
  });

  it('badges engine modules and lists the five template sections', () => {
    const part = named();
    place(part, 'thruster_1', 'ThrusterA');
    part.subPartGameData.push({
      ...createSubPartGameData('ThrusterA'),
      combustors: [createCombustor('Chamber')],
    });
    const [row] = buildDataNavigator(part, []).templates;
    expect(row.badges).toEqual([{ icon: '🚀', label: '1 engine modules', count: 1 }]);
    expect(row.sections.map((s) => s.sectionId)).toEqual([
      'tanks',
      'lights',
      'solar',
      'engine',
      'passthrough',
    ]);
  });
});

describe('buildDataNavigator — non-capable inventory', () => {
  it('lists every non-SubPart entity kind, and only PART-level lights', () => {
    const part = named();
    place(part, 'tank_1', 'TankB');
    part.connectors.push({
      id: '_connector1',
      ...identityTransform(),
      flags: [],
      capabilities: [],
      siblingIds: [],
      layerId: DEFAULT_LAYER_ID,
    });
    part.colliders.push({
      id: '_collider1',
      shape: 'Box',
      ownerTemplateId: null,
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    });
    part.ivaSeats.push({
      id: '_seat1',
      ksaId: null,
      ...identityTransform(),
      layerId: IVA_SEAT_LAYER_ID,
    });
    part.lights.push(createPartLight(null, '_light1'), createPartLight('TankB', '_light2'));
    part.kittens.push({
      id: 'kitten_1',
      kind: 'hunter',
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    });

    const rows = buildDataNavigator(part, []).nonCapable;
    expect(rows.map((r) => r.kind)).toEqual([
      'connector',
      'collider',
      'ivaSeat',
      'light',
      'kitten',
    ]);
    // The template-owned light belongs to its template row, not to this list.
    expect(rows.filter((r) => r.kind === 'light').map((r) => r.id)).toEqual(['_light1']);
    expect(rows.find((r) => r.kind === 'ivaSeat')!.label).toBe('Seat 1');
    expect(rows.every((r) => r.explainer.length > 0)).toBe(true);
  });
});

describe('buildDataNavigator — findings and search', () => {
  const finding = (over: Partial<GameDataFinding> = {}): GameDataFinding => ({
    severity: 'warn',
    code: 'x',
    message: 'x',
    target: { scope: { kind: 'part' }, sectionId: 'wiring' },
    ...over,
  });

  it('dots the row and the offending section, worst severity winning', () => {
    const part = named();
    const model = buildDataNavigator(part, [
      finding(),
      finding({ severity: 'block', target: { scope: { kind: 'part' }, sectionId: 'identity' } }),
    ]);
    expect(model.part.issue).toBe('block');
    expect(model.part.sections.find((s) => s.sectionId === 'wiring')!.issue).toBe('warn');
    expect(model.part.sections.find((s) => s.sectionId === 'identity')!.issue).toBe('block');
    expect(model.part.sections.find((s) => s.sectionId === 'mass')!.issue).toBe(null);
  });

  it('scopes a template finding to that template only', () => {
    const part = named();
    place(part, 'thruster_1', 'ThrusterA');
    place(part, 'nose_1', 'NoseCone');
    const model = buildDataNavigator(part, [
      finding({
        target: { scope: { kind: 'template', templateId: 'ThrusterA' }, sectionId: 'engine' },
      }),
    ]);
    expect(model.templates.find((t) => t.templateId === 'ThrusterA')!.issue).toBe('warn');
    expect(model.templates.find((t) => t.templateId === 'NoseCone')!.issue).toBe(null);
    expect(model.part.issue).toBe(null);
  });

  it('filters templates and non-capable rows fuzzily, never the Part root', () => {
    const part = named();
    place(part, 'tank_1', 'TankB');
    place(part, 'nose_1', 'NoseCone');
    part.connectors.push({
      id: '_connector1',
      ...identityTransform(),
      flags: [],
      capabilities: [],
      siblingIds: [],
      layerId: DEFAULT_LAYER_ID,
    });

    const model = buildDataNavigator(part, [], 'nose');
    expect(model.templates.map((t) => t.templateId)).toEqual(['NoseCone']);
    expect(model.nonCapable).toEqual([]);
    expect(model.part.label).toBe('rover_1');
  });

  it('matches a template by one of its SECTION names', () => {
    const part = named();
    place(part, 'tank_1', 'TankB');
    place(part, 'nose_1', 'NoseCone');
    expect(buildDataNavigator(part, [], 'solar').templates.map((t) => t.templateId)).toEqual([
      'TankB',
      'NoseCone',
    ]);
  });
});
