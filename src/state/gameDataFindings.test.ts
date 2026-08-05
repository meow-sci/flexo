import { describe, it, expect } from 'vitest';
import { computeGameDataFindings } from './gameDataFindings';
import {
  createCombustor,
  createEmptyPart,
  createSubPartGameData,
  createTank,
  DEFAULT_LAYER_ID,
  identityTransform,
} from '../ksa/types';
import type { EditingPart } from '../ksa/types';
import type { ReactionData } from '../ksa/reactionCatalog';

const NO_REACTIONS: ReadonlyMap<string, ReactionData> = new Map();

/** A part with a valid id, so `part-id-blank` never masks the case under test. */
function namedPart(): EditingPart {
  const part = createEmptyPart();
  part.partId = 'rover_1';
  return part;
}

function place(part: EditingPart, instanceId: string, subPartTemplateId: string): void {
  part.placements.push({
    instanceId,
    subPartTemplateId,
    ...identityTransform(),
    layerId: DEFAULT_LAYER_ID,
  });
}

describe('computeGameDataFindings', () => {
  it('reports nothing for an empty, named part', () => {
    expect(computeGameDataFindings(namedPart(), NO_REACTIONS)).toEqual([]);
  });

  it('flags a blank Part Id as a blocker targeting Part · Identity', () => {
    const part = createEmptyPart();
    part.partId = '   ';
    const [finding] = computeGameDataFindings(part, NO_REACTIONS);
    expect(finding.severity).toBe('block');
    expect(finding.code).toBe('part-id-blank');
    expect(finding.target).toEqual({ scope: { kind: 'part' }, sectionId: 'identity' });
  });

  it('warns on duplicate tank feed ids within one scope, targeting the offending card', () => {
    const part = namedPart();
    place(part, 'tank_1', 'TankB');
    part.subPartGameData.push({
      ...createSubPartGameData('TankB'),
      tanks: [
        { ...createTank(), id: 'fuel_main' },
        { ...createTank(), id: 'fuel_main' },
      ],
    });

    const dup = computeGameDataFindings(part, NO_REACTIONS).find(
      (f) => f.code === 'tank-feed-id-duplicate',
    )!;
    expect(dup.severity).toBe('warn');
    expect(dup.target).toEqual({
      scope: { kind: 'template', templateId: 'TankB' },
      sectionId: 'tanks',
      cardKey: '1',
    });
  });

  it('ignores blank tank ids (unaddressable in KSA, not a collision)', () => {
    const part = namedPart();
    part.gameData.tanks.push({ ...createTank(), id: '' }, { ...createTank(), id: '' });
    expect(computeGameDataFindings(part, NO_REACTIONS)).toEqual([]);
  });

  it('routes an unwired consumer to Part · Wiring', () => {
    const part = namedPart();
    place(part, 'thruster_1', 'ThrusterA');
    part.subPartGameData.push({
      ...createSubPartGameData('ThrusterA'),
      combustors: [{ ...createCombustor('Chamber'), feeds: [{ kind: 'parent' }] }],
    });

    const finding = computeGameDataFindings(part, NO_REACTIONS).find(
      (f) => f.code === 'consumer-not-wired',
    )!;
    expect(finding.target.scope).toEqual({ kind: 'part' });
    expect(finding.target.sectionId).toBe('wiring');
  });

  it('routes a template-owned engine issue to that template’s Engine section', () => {
    const part = namedPart();
    place(part, 'thruster_1', 'ThrusterA');
    part.subPartGameData.push({
      ...createSubPartGameData('ThrusterA'),
      combustors: [{ ...createCombustor('Chamber'), feeds: [] }],
    });

    const finding = computeGameDataFindings(part, NO_REACTIONS).find(
      (f) => f.code === 'consumer-no-feeds',
    )!;
    expect(finding.target).toEqual({
      scope: { kind: 'template', templateId: 'ThrusterA' },
      sectionId: 'engine',
    });
  });

  it('routes part-level engine hardware to Part · Advanced', () => {
    const part = namedPart();
    part.gameData.combustors.push({ ...createCombustor('GasGen'), feeds: [] });
    const finding = computeGameDataFindings(part, NO_REACTIONS).find(
      (f) => f.code === 'consumer-no-feeds',
    )!;
    expect(finding.target).toEqual({ scope: { kind: 'part' }, sectionId: 'advanced' });
  });

  it('puts every blocker before every warning', () => {
    const part = createEmptyPart();
    part.partId = '';
    part.gameData.combustors.push({ ...createCombustor('GasGen'), feeds: [] });
    const severities = computeGameDataFindings(part, NO_REACTIONS).map((f) => f.severity);
    expect(severities.indexOf('block')).toBeLessThan(severities.indexOf('warn'));
  });
});
