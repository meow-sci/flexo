import { describe, it, expect } from 'vitest';
import {
  createEmptyPart,
  createSubPartGameData,
  createSolidMotor,
  createSolidMotorNozzle,
  createSolidGrainSegment,
  createRocket,
  identityTransform,
  DEFAULT_LAYER_ID,
} from '../../ksa/types';
import { resolveSolidHardware, selectSolidCurveTarget } from './solidCurveResolution';

function fixture() {
  const part = createEmptyPart();
  const owner = createSubPartGameData('MotorTemplate');
  owner.solidMotors.push(createSolidMotor('Motor'));
  owner.solidNozzles.push(createSolidMotorNozzle('Nozzle'));
  owner.solidGrainSegments.push(createSolidGrainSegment('Grain'));
  owner.solidMotors[0].feeds = [
    { kind: 'container', containerId: 'Grain', subPartInstanceId: null },
  ];
  owner.rockets.push(createRocket('Rocket', 'Motor', ['Nozzle']));
  part.subPartGameData.push(owner);
  for (const instanceId of ['one', 'two'])
    part.placements.push({
      instanceId,
      subPartTemplateId: 'MotorTemplate',
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    });
  return { part, owner };
}
const entry = { kind: 'subpart', templateId: 'MotorTemplate' } as const;

describe('solid burn preview resolves the selected rocket and instance', () => {
  it('selects a second solid rocket and does not show a solid curve for a selected liquid rocket', () => {
    const { part, owner } = fixture();
    owner.solidMotors.push(createSolidMotor('Second'));
    owner.rockets.push(
      createRocket('SecondRocket', 'Second', ['Nozzle']),
      createRocket('Liquid', 'Combustor', []),
    );
    expect(selectSolidCurveTarget(part, entry, 'SecondRocket', 'one')?.motor.id).toBe('Second');
    expect(selectSolidCurveTarget(part, entry, 'Liquid', 'one')).toBeNull();
  });

  it('resolves a Part rocket core and nozzle on different SubPart instances', () => {
    const { part, owner } = fixture();
    const rocket = createRocket('PartRocket', 'Motor', ['Nozzle']);
    rocket.core.subPartInstanceId = 'one';
    rocket.nozzles[0].subPartInstanceId = 'two';
    rocket.nozzles[0].areaRatioMultiplier = 1.7;
    part.gameData.rockets.push(rocket);
    const target = selectSolidCurveTarget(part, { kind: 'part' }, 'PartRocket', null)!;
    const result = resolveSolidHardware(part, target);
    expect(result).toEqual({
      segments: [owner.solidGrainSegments[0]],
      nozzles: [{ nozzle: owner.solidNozzles[0], areaRatioMultiplier: 1.7 }],
    });
    rocket.nozzles[0].subPartInstanceId = null;
    expect(resolveSolidHardware(part, target)).toEqual({
      reason: expect.stringContaining('cannot be resolved'),
    });
  });

  it('prefers instance-specific parent wiring, falls back to unscoped wiring, and deduplicates grain references', () => {
    const { part, owner } = fixture();
    owner.solidMotors[0].feeds = [{ kind: 'parent' }];
    const rootGrain = createSolidGrainSegment('RootGrain');
    part.gameData.solidGrainSegments.push(rootGrain);
    const localFeed = {
      kind: 'container',
      containerId: 'Grain',
      subPartInstanceId: 'two',
    } as const;
    part.gameData.consumerFeedWiring = [
      {
        consumerId: 'Motor',
        subPartInstanceId: null,
        feeds: [{ kind: 'container', containerId: 'RootGrain', subPartInstanceId: null }],
      },
      { consumerId: 'Motor', subPartInstanceId: 'one', feeds: [localFeed, localFeed] },
    ];
    const one = resolveSolidHardware(part, selectSolidCurveTarget(part, entry, 'Rocket', 'one')!);
    const two = resolveSolidHardware(part, selectSolidCurveTarget(part, entry, 'Rocket', 'two')!);
    expect('segments' in one && one.segments).toEqual([owner.solidGrainSegments[0]]);
    expect('segments' in two && two.segments).toEqual([rootGrain]);
  });

  it('does not report a partial local curve for connector-fed stacks or unresolved parent wiring', () => {
    const { part, owner } = fixture();
    owner.solidMotors[0].feeds.push({ kind: 'connector', connectorId: 'Bottom' });
    const target = selectSolidCurveTarget(part, entry, 'Rocket', 'one')!;
    expect(resolveSolidHardware(part, target)).toEqual({
      reason: expect.stringContaining('assembled vehicle'),
    });
    owner.solidMotors[0].feeds = [{ kind: 'parent' }];
    expect(resolveSolidHardware(part, target)).toEqual({
      reason: expect.stringContaining('ConsumerFeedWiring'),
    });
  });
});
