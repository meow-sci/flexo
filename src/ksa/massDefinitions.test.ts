import { describe, expect, it } from 'vitest';
import {
  combinedMassSummary,
  createMassDefinition,
  MASS_SHAPE_DEFS,
  MASS_SHAPES,
  massDefinitionIssues,
  massDefinitionVolumeM3,
  resolveMassDefinitionKg,
  sumMassDefinitions,
} from './massDefinitions';
import { createEmptyPart, createSubPartGameData, identityTransform } from './types';

const DENSITIES = new Map([
  ['Aluminum.2014(s)', 2800],
  ['Steel.300(s)', 8000],
]);

describe('stock mass definitions', () => {
  it('gives every stock shape valid dimensions and an explicit authoring mass', () => {
    for (const shape of MASS_SHAPES) {
      const definition = createMassDefinition(shape, shape);
      expect(definition.id).toBe(shape);
      expect(resolveMassDefinitionKg(definition, DENSITIES)).toBe(1);
      expect(Object.keys(definition.dimensions)).toEqual(
        MASS_SHAPE_DEFS[shape].dimensions.map((field) => field.key),
      );
    }
  });

  it('computes the stock battery cuboid volume and preserves an explicit 52 kg mass', () => {
    const definition = createMassDefinition('SolidCuboidMass', 'battery');
    definition.massKg = 52;
    definition.dimensions = { lengthXM: 0.6721, lengthYM: 0.4828, lengthZM: 0.3549 };
    expect(massDefinitionVolumeM3(definition)).toBeCloseTo(0.115161458412, 12);
    expect(resolveMassDefinitionKg(definition, DENSITIES)).toBe(52);
  });

  it('uses the revolved solid sphere and cylinder volumes', () => {
    const sphere = createMassDefinition('SolidSphereMass', 'sphere');
    sphere.dimensions.radiusM = 0.25;
    expect(massDefinitionVolumeM3(sphere)).toBeCloseTo((4 * Math.PI * 0.25 ** 3) / 3, 12);
    const cylinder = createMassDefinition('SolidCylinderMass', 'cylinder');
    cylinder.dimensions = { radiusM: 0.5, lengthM: 0.2468 };
    expect(massDefinitionVolumeM3(cylinder)).toBeCloseTo(Math.PI * 0.5 ** 2 * 0.2468, 12);
  });

  it('computes an open cylindrical shell rather than a capped tank', () => {
    const definition = createMassDefinition('HollowOpenCylinderMass', 'shell');
    definition.massKg = null;
    definition.materialId = 'Aluminum.2014(s)';
    definition.dimensions = { lengthM: 0.04, outerRadiusM: 0.125, wallThicknessM: 0.006 };
    const volume = Math.PI * (0.125 ** 2 - 0.119 ** 2) * 0.04;
    expect(massDefinitionVolumeM3(definition)).toBeCloseTo(volume, 12);
    expect(resolveMassDefinitionKg(definition, DENSITIES)).toBeCloseTo(volume * 2800, 9);
  });

  it('uses the conical wall normal to the slope and the authored half sweep', () => {
    const definition = createMassDefinition('HollowOpenTruncatedConeMass', 'fairing');
    definition.dimensions = {
      heightM: 0.451,
      radiusBaseM: 0.159,
      radiusTopM: 0.1,
      wallThicknessM: 0.006,
    };
    definition.sweepRad = Math.PI;
    const offset = (0.006 * Math.hypot(0.451, 0.159 - 0.1)) / 0.451;
    const outer = (Math.PI * 0.451 * (0.159 ** 2 + 0.159 * 0.1 + 0.1 ** 2)) / 6;
    const innerBase = 0.159 - offset;
    const innerTop = 0.1 - offset;
    const inner = (Math.PI * 0.451 * (innerBase ** 2 + innerBase * innerTop + innerTop ** 2)) / 6;
    expect(massDefinitionVolumeM3(definition)).toBeCloseTo(outer - inner, 12);
  });

  it('uses KSA semi-ellipsoid wall offset approximation', () => {
    const definition = createMassDefinition('HollowOpenSemiEllipsoidMass', 'hemisphere');
    definition.dimensions = { lengthM: 1, radiusM: 1, wallThicknessM: 0.1 };
    expect(massDefinitionVolumeM3(definition)).toBeCloseTo((2 * Math.PI * (1 - 0.9 ** 3)) / 3, 12);
  });

  it('matches independent integration of the tangent ogive shell profile', () => {
    const definition = createMassDefinition('HollowOpenOgiveMass', 'ogive');
    definition.dimensions = { heightM: 1.4088, radiusM: 0.2498, wallThicknessM: 0.006 };
    const arcRadius = (1.4088 ** 2 + 0.2498 ** 2) / (2 * 0.2498);
    const offset = arcRadius - 0.2498;
    const innerArcRadius = arcRadius - 0.006;
    const innerHeight = Math.sqrt(innerArcRadius ** 2 - offset ** 2);
    const volume = (radius: number, height: number): number => {
      let integral = 0;
      const steps = 2000;
      const dx = height / steps;
      for (let i = 0; i <= steps; i++) {
        const x = i * dx;
        const profile = Math.sqrt(radius * radius - x * x) - offset;
        const weight = i === 0 || i === steps ? 1 : i % 2 === 0 ? 2 : 4;
        integral += weight * profile * profile;
      }
      return (Math.PI * integral * dx) / 3;
    };
    expect(massDefinitionVolumeM3(definition)).toBeCloseTo(
      volume(arcRadius, 1.4088) - volume(innerArcRadius, innerHeight),
      9,
    );
  });

  it('clamps sweep and shell dimensions exactly as the game does', () => {
    const definition = createMassDefinition('HollowOpenCylinderMass', 'shell');
    definition.dimensions = { lengthM: 1, outerRadiusM: 0.5, wallThicknessM: 2 };
    definition.sweepRad = 20;
    expect(massDefinitionVolumeM3(definition)).toBeCloseTo(Math.PI * 0.5 ** 2, 12);
    definition.sweepRad = -1;
    expect(massDefinitionVolumeM3(definition)).toBe(0);
    definition.sweepRad = null;
    definition.dimensions.wallThicknessM = 0;
    expect(massDefinitionVolumeM3(definition)).toBe(0);
  });

  it('resolves Material before Density before explicit Mass without falling back from unknown materials', () => {
    const definition = createMassDefinition('SolidCuboidMass', 'cuboid');
    definition.massKg = 3;
    definition.densityKgM3 = 5;
    definition.materialId = 'Aluminum.2014(s)';
    expect(resolveMassDefinitionKg(definition, DENSITIES)).toBe(2800);
    definition.materialId = 'Missing(s)';
    expect(resolveMassDefinitionKg(definition, DENSITIES)).toBeNull();
    definition.materialId = null;
    expect(resolveMassDefinitionKg(definition, DENSITIES)).toBe(5);
    definition.densityKgM3 = null;
    expect(resolveMassDefinitionKg(definition, DENSITIES)).toBe(3);
  });

  it('uses the CustomMass explicit scalar even with inherited source fields present', () => {
    const definition = createMassDefinition('CustomMass', 'custom');
    definition.massKg = 50;
    definition.densityKgM3 = 5;
    definition.materialId = 'Aluminum.2014(s)';
    expect(resolveMassDefinitionKg(definition, DENSITIES)).toBe(50);
    expect(definition.massSpecificInertia).toEqual({ ixx: 1, iyy: 1, izz: 1 });
  });

  it('marks unresolved definitions without reporting a misleading complete mass', () => {
    const known = createMassDefinition('SolidCuboidMass', 'known');
    known.massKg = 52;
    const unresolved = createMassDefinition('HollowOpenCylinderMass', 'unknown');
    unresolved.materialId = 'Unloaded(s)';
    expect(sumMassDefinitions([known, unresolved], DENSITIES)).toEqual({
      massKg: 52,
      definitionCount: 2,
      unresolvedCount: 1,
    });
    unresolved.materialId = null;
    unresolved.dimensions = {};
    expect(resolveMassDefinitionKg(unresolved, DENSITIES)).toBeNull();
  });
});

describe('combined defined mass', () => {
  it('sums Part definitions, the saved scalar and each placed template using KSA maximum-axis scale cubed', () => {
    const part = createEmptyPart();
    const battery = createMassDefinition('SolidCuboidMass', 'battery');
    battery.massKg = 52;
    part.gameData.massDefinitions = [battery];
    part.gameData.customMass = 10;
    const data = createSubPartGameData('template');
    data.massDefinitionsOverride = true;
    const definition = createMassDefinition('SolidSphereMass', 'templateMass');
    definition.massKg = 10;
    data.massDefinitions = [definition];
    part.subPartGameData = [data];
    part.placements = [
      {
        ...identityTransform(),
        instanceId: 'a',
        subPartTemplateId: 'template',
        layerId: 'default',
      },
      {
        ...identityTransform(),
        scale: { x: 1, y: 2, z: 0.5 },
        instanceId: 'b',
        subPartTemplateId: 'template',
        layerId: 'default',
      },
    ];
    expect(combinedMassSummary(part, DENSITIES)).toEqual({
      massKg: 152,
      definitionCount: 4,
      unresolvedCount: 0,
    });
  });

  it('uses inherited catalog mass until explicitly overridden and preserves an intentional empty override', () => {
    const part = createEmptyPart();
    part.placements = [
      {
        ...identityTransform(),
        instanceId: 'a',
        subPartTemplateId: 'template',
        layerId: 'default',
      },
    ];
    const definition = createMassDefinition('SolidSphereMass', 'catalogMass');
    definition.massKg = 20;
    const catalog = new Map([['template', [definition]]]);
    const data = createSubPartGameData('template');
    part.subPartGameData = [data];
    expect(combinedMassSummary(part, DENSITIES, catalog).massKg).toBe(20);
    data.massDefinitionsOverride = true;
    expect(combinedMassSummary(part, DENSITIES, catalog)).toEqual({
      massKg: 0,
      definitionCount: 0,
      unresolvedCount: 0,
    });
  });

  it('does not count unplaced templates or duplicate old opaque template mass with catalog mass', () => {
    const part = createEmptyPart();
    const definition = createMassDefinition('SolidCuboidMass', 'catalogMass');
    const catalog = new Map([['template', [definition]]]);
    const data = createSubPartGameData('template');
    data.unknownChildren = [{ tag: 'SolidCuboidMass', attrs: {}, children: [] }];
    part.subPartGameData = [data];
    expect(combinedMassSummary(part, DENSITIES, catalog).definitionCount).toBe(0);
    part.placements = [
      {
        ...identityTransform(),
        instanceId: 'a',
        subPartTemplateId: 'template',
        layerId: 'default',
      },
    ];
    part.gameData.unknownChildren = [{ tag: 'CustomMass', attrs: {}, children: [] }];
    expect(combinedMassSummary(part, DENSITIES, catalog)).toEqual({
      massKg: 0,
      definitionCount: 2,
      unresolvedCount: 2,
    });
  });

  it('keeps known catalog mass beside an unsupported preserved shape and reports the missing contribution', () => {
    const part = createEmptyPart();
    const definition = createMassDefinition('SolidCuboidMass', 'catalogMass');
    definition.massKg = 25;
    const catalog = new Map([['template', [definition]]]);
    const data = createSubPartGameData('template');
    data.unknownChildren = [{ tag: 'HollowSphereMass', attrs: {}, children: [] }];
    part.subPartGameData = [data];
    part.placements = [
      {
        ...identityTransform(),
        instanceId: 'a',
        subPartTemplateId: 'template',
        layerId: 'default',
      },
    ];
    expect(combinedMassSummary(part, DENSITIES, catalog)).toEqual({
      massKg: 25,
      definitionCount: 2,
      unresolvedCount: 1,
    });
  });
});

describe('mass definition findings', () => {
  it('requires a valid source and authored dimensions', () => {
    const definition = createMassDefinition('SolidCuboidMass', 'cuboid');
    definition.massKg = null;
    definition.dimensions.lengthXM = 0;
    const issues = massDefinitionIssues(definition, DENSITIES);
    expect(issues.map((issue) => issue.code)).toEqual([
      'mass-source-missing',
      'mass-dimension-invalid',
    ]);
    expect(issues.every((issue) => issue.severity === 'block')).toBe(true);
  });

  it('warns about unavailable material without treating a lower-priority mass as resolved', () => {
    const definition = createMassDefinition('SolidSphereMass', 'sphere');
    definition.materialId = 'MyMod(s)';
    expect(massDefinitionIssues(definition, DENSITIES)).toMatchObject([
      { code: 'mass-material-unresolved', severity: 'warn' },
    ]);
    expect(resolveMassDefinitionKg(definition, DENSITIES)).toBeNull();
  });

  it('permits a cone tip and reports zero sweep as zero volume', () => {
    const definition = createMassDefinition('HollowOpenTruncatedConeMass', 'cone');
    definition.dimensions.radiusTopM = 0;
    expect(massDefinitionIssues(definition, DENSITIES)).toEqual([]);
    definition.sweepRad = 0;
    expect(massDefinitionIssues(definition, DENSITIES)).toMatchObject([
      { code: 'mass-volume-zero', severity: 'warn' },
    ]);
  });

  it('reports KSA principal-moment clamping separately from non-finite values', () => {
    const definition = createMassDefinition('CustomMass', 'custom');
    definition.massSpecificInertia = { ixx: 0, iyy: 1, izz: 1 };
    expect(massDefinitionIssues(definition, DENSITIES)).toMatchObject([
      { code: 'mass-inertia-invalid', severity: 'warn' },
    ]);
    definition.massSpecificInertia.ixx = Number.NaN;
    definition.locationAsmb.x = Number.NaN;
    expect(massDefinitionIssues(definition, DENSITIES)).toMatchObject([
      { code: 'mass-inertia-invalid', severity: 'block' },
      { code: 'mass-frame-invalid', severity: 'block' },
    ]);
  });
});
