import { describe, it, expect } from 'vitest';
import {
  addGroupOf,
  buildModuleTree,
  gimbalCandidates,
  MODULE_TREE_GROUP_ORDER,
  scopeOfGroup,
  totalModuleCount,
} from './moduleTreeModel';
import {
  createCombustor,
  createEmptyPart,
  createGimbal,
  createNozzle,
  createRocket,
  createRocketController,
  createSolidGrainSegment,
  createSolidMotor,
  createSolidMotorNozzle,
  createSubPartGameData,
  DEFAULT_LAYER_ID,
  identityTransform,
} from '../../ksa/types';
import type { EditingPart } from '../../ksa/types';
import type { EngineIssue } from '../../ksa/engineValidation';
import type { EngineEntry } from '../../state/engineStore';

const TMPL = 'Core.Subpart.Chamber';

function placement(instanceId: string, subPartTemplateId = TMPL) {
  return { instanceId, subPartTemplateId, ...identityTransform(), layerId: DEFAULT_LAYER_ID };
}

/** A SubPart-scope engine: one chamber + one nozzle + a rocket, placed once. */
function subPartEngine(): EditingPart {
  const part = createEmptyPart();
  part.placements.push(placement('chamber_1'));
  const spd = createSubPartGameData(TMPL);
  spd.combustors.push(createCombustor('ThrustChamber'));
  spd.nozzles.push(createNozzle('Nozzle'));
  spd.rockets.push(createRocket('Engine', 'ThrustChamber', ['Nozzle']));
  part.subPartGameData.push(spd);
  part.gameData.rocketControllers.push(createRocketController('Main', 'engine', ['Engine']));
  return part;
}

const SUB: EngineEntry = { kind: 'subpart', templateId: TMPL };
const groupOf = (part: EditingPart, id: string, entry: EngineEntry | null = SUB) =>
  buildModuleTree(part, entry).find((g) => g.id === id)!;

describe('buildModuleTree — group order + presence', () => {
  it('always renders all eight groups, in the fixed order', () => {
    const tree = buildModuleTree(createEmptyPart(), null);
    expect(tree.map((g) => g.id)).toEqual(MODULE_TREE_GROUP_ORDER);
    expect(tree.every((g) => g.rows.length === 0)).toBe(true);
  });

  it('keeps the order with a full engine open', () => {
    expect(buildModuleTree(subPartEngine(), SUB).map((g) => g.id)).toEqual(MODULE_TREE_GROUP_ORDER);
  });

  it('flags the four always-part-level groups', () => {
    const tree = buildModuleTree(subPartEngine(), SUB);
    expect(tree.filter((g) => g.partLevel).map((g) => g.id)).toEqual([
      'controllers',
      'wiring',
      'gimbals',
      'propellants',
    ]);
  });

  it('shows part-level groups under a SubPart scope, with the part-level scope on the ref', () => {
    const controllers = groupOf(subPartEngine(), 'controllers');
    expect(controllers.rows).toHaveLength(1);
    expect(controllers.rows[0].ref).toEqual({ group: 'controller', scope: 'part', index: 0 });
    expect(controllers.partLevel).toBe(true);
  });

  it('indexes a SubPart scope against the template and the part scope against gameData', () => {
    const part = subPartEngine();
    part.gameData.combustors.push(createCombustor('GasGen'));
    expect(groupOf(part, 'combustors', SUB).rows.map((r) => r.label)).toEqual(['ThrustChamber']);
    expect(groupOf(part, 'combustors', { kind: 'part' }).rows.map((r) => r.label)).toEqual([
      'GasGen',
    ]);
  });

  it('folds the solid trio into one group, motor → grain → nozzle', () => {
    const part = subPartEngine();
    const spd = part.subPartGameData[0];
    spd.solidMotors.push(createSolidMotor('MotorCore'));
    spd.solidGrainSegments.push(createSolidGrainSegment('Grain'));
    spd.solidNozzles.push(createSolidMotorNozzle('SolidNozzle'));
    const solid = groupOf(part, 'solid');
    expect(solid.rows.map((r) => r.ref.group)).toEqual(['solidMotor', 'grain', 'solidNozzle']);
    expect(solid.rows.map((r) => r.label)).toEqual(['MotorCore', 'Grain', 'SolidNozzle']);
  });
});

describe('buildModuleTree — captions', () => {
  it('names a combustor by its reaction display name, falling back to the id', () => {
    const part = subPartEngine();
    expect(groupOf(part, 'combustors').rows[0].caption).toBe('Hydrolox');
    const named = buildModuleTree(part, SUB, [], new Map([['Hydrolox', 'Hydrogen + Oxygen']]));
    expect(named.find((g) => g.id === 'combustors')!.rows[0].caption).toBe('Hydrogen + Oxygen');
  });

  it('names a nozzle by exit diameter and a rocket by its core', () => {
    const part = subPartEngine();
    expect(groupOf(part, 'nozzles').rows[0].caption).toBe('⌀1 m');
    expect(groupOf(part, 'rockets').rows[0].caption).toBe('core: ThrustChamber');
  });

  it('names a controller by type, a gimbal by its limits and a propellant by category', () => {
    const part = subPartEngine();
    part.gameData.rocketControllers.push(createRocketController('Rcs', 'thruster', []));
    part.gameData.gimbals.push({ ...createGimbal('chamber_1'), maxAngleYDeg: 5, maxAngleZDeg: 3 });
    part.customReactions.push({
      id: 'Mine',
      name: 'My Fuel',
      category: 'Monopropellant',
      reactants: [],
      lut: [],
      burnRate: null,
      minimumBurnPressurePa: null,
      maxStablePressurePa: null,
      exhaustCondensedFraction: null,
    });
    expect(groupOf(part, 'controllers').rows.map((r) => r.caption)).toEqual([
      'engine (throttle + staging)',
      'RCS (pulsed)',
    ]);
    const gimbal = groupOf(part, 'gimbals').rows[0];
    expect(gimbal.label).toBe('chamber_1');
    expect(gimbal.caption).toBe('5° / 3°');
    const propellant = groupOf(part, 'propellants').rows[0];
    expect(propellant.label).toBe('My Fuel');
    expect(propellant.caption).toBe('Monopropellant');
  });

  it('names a wiring entry consumer ← first feed, counting the rest', () => {
    const part = subPartEngine();
    part.gameData.consumerFeedWiring.push({
      consumerId: 'ThrustChamber',
      subPartInstanceId: 'chamber_1',
      feeds: [
        { kind: 'container', containerId: 'Fuel', subPartInstanceId: null },
        { kind: 'connector', connectorId: '_connector1' },
      ],
    });
    expect(groupOf(part, 'wiring').rows[0].caption).toBe('ThrustChamber ← Fuel +1');
  });
});

describe('buildModuleTree — issue dots and unwired rows', () => {
  const issue = (source: EngineIssue['source']): EngineIssue => ({
    severity: 'warn',
    code: 'nozzle-not-referenced',
    message: 'x',
    source,
  });

  it('puts a dot on the row a finding addresses, and raises the group header', () => {
    const part = subPartEngine();
    const tree = buildModuleTree(part, SUB, [
      issue({ templateId: TMPL, module: 'nozzle', index: 0 }),
    ]);
    const nozzles = tree.find((g) => g.id === 'nozzles')!;
    expect(nozzles.rows[0].issue).toBe('warn');
    expect(nozzles.issue).toBe('warn');
    expect(tree.find((g) => g.id === 'combustors')!.issue).toBeNull();
  });

  it('lets a blocking finding win over a warning on the same row', () => {
    const part = subPartEngine();
    const tree = buildModuleTree(part, SUB, [
      issue({ templateId: TMPL, module: 'nozzle', index: 0 }),
      { ...issue({ templateId: TMPL, module: 'nozzle', index: 0 }), severity: 'block' },
    ]);
    expect(tree.find((g) => g.id === 'nozzles')!.rows[0].issue).toBe('block');
  });

  it('adds a synthetic unwired row per parent-deferring consumer with no wiring', () => {
    const part = subPartEngine();
    // `createCombustor` already defers to Parent, so the placed chamber is unwired.
    const wiring = groupOf(part, 'wiring');
    expect(wiring.unwired.map((u) => u.consumer.consumerId)).toEqual(['ThrustChamber']);
    expect(wiring.issue).toBe('warn');

    part.gameData.consumerFeedWiring.push({
      consumerId: 'ThrustChamber',
      subPartInstanceId: 'chamber_1',
      feeds: [],
    });
    expect(groupOf(part, 'wiring').unwired).toEqual([]);
  });

  it('offers Duplicate everywhere except wiring and gimbals', () => {
    const part = subPartEngine();
    part.gameData.gimbals.push(createGimbal('chamber_1'));
    part.gameData.consumerFeedWiring.push({
      consumerId: 'ThrustChamber',
      subPartInstanceId: null,
      feeds: [],
    });
    expect(groupOf(part, 'combustors').rows[0].canDuplicate).toBe(true);
    expect(groupOf(part, 'wiring').rows[0].canDuplicate).toBe(false);
    expect(groupOf(part, 'gimbals').rows[0].canDuplicate).toBe(false);
  });
});

describe('moduleTreeModel helpers', () => {
  it('scopes part-only groups to the part whatever the open scope', () => {
    expect(scopeOfGroup('controller', SUB)).toBe('part');
    expect(scopeOfGroup('combustor', SUB)).toBe('sub');
    expect(scopeOfGroup('combustor', { kind: 'part' })).toBe('part');
    expect(scopeOfGroup('combustor', null)).toBe('sub');
  });

  it('names each group’s add target', () => {
    expect(addGroupOf('nozzles')).toBe('nozzle');
    expect(addGroupOf('solid')).toBe('solidMotor');
    expect(addGroupOf('propellants')).toBe('propellant');
  });

  it('counts every module reachable from the open scope', () => {
    // chamber + nozzle + rocket (sub) + one part-level controller.
    expect(totalModuleCount(subPartEngine(), SUB)).toBe(4);
    expect(totalModuleCount(createEmptyPart(), null)).toBe(0);
  });
});

describe('gimbalCandidates', () => {
  it('offers the open template’s placements, and only those', () => {
    const part = subPartEngine();
    part.placements.push(placement('chamber_2'));
    // A placement of a DIFFERENT template is not this engine's business.
    part.placements.push(placement('tank_1', 'Core.Subpart.Tank'));
    expect(gimbalCandidates(part, SUB)).toEqual({
      instanceIds: ['chamber_1', 'chamber_2'],
      blocker: null,
    });
  });

  it('offers every placement at the part scope, which names no template', () => {
    const part = subPartEngine();
    part.placements.push(placement('tank_1', 'Core.Subpart.Tank'));
    expect(gimbalCandidates(part, { kind: 'part' }).instanceIds).toEqual(['chamber_1', 'tank_1']);
  });

  it('skips placements that already have a gimbal', () => {
    const part = subPartEngine();
    part.placements.push(placement('chamber_2'));
    part.gameData.gimbals.push(createGimbal('chamber_1'));
    expect(gimbalCandidates(part, SUB).instanceIds).toEqual(['chamber_2']);
  });

  it('names WHY it is empty rather than just going quiet', () => {
    const part = subPartEngine();
    expect(gimbalCandidates(part, null).blocker).toBe('no-scope');
    expect(
      gimbalCandidates(part, { kind: 'subpart', templateId: 'Core.Subpart.Tank' }).blocker,
    ).toBe('no-placements');
    part.gameData.gimbals.push(createGimbal('chamber_1'));
    expect(gimbalCandidates(part, SUB)).toEqual({ instanceIds: [], blocker: 'all-taken' });
  });
});
