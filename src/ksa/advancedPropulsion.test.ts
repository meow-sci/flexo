import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { engineModulesFromElement, gameDataFromAssets } from './partXmlParser';
import { serializeGameDataXml } from './partXmlSerializer';
import { computeRamDrive, predictMagneticPerformance } from './enginePhysics';
import {
  parseReactionsFile,
  resolveThermalReactionLut,
  type ReactionData,
} from './reactionCatalog';
import {
  createEmptyPart,
  createThermalCore,
  createNozzle,
  createRocket,
  createSubPartGameData,
  DEFAULT_LAYER_ID,
  identityTransform,
} from './types';
import { validateEngines } from './engineValidation';
import { computePerformance } from '../ui/engine/performanceAggregation';
import { parsePartsFile, mergeGameData, parseGameDataFile, type CatalogPart } from './partCatalog';
import { buildMultiModContent } from './modExport';

const parser = new DOMParser();
const xml = (value: string) =>
  parser.parseFromString(value, 'application/xml') as unknown as Document;
// Current 5554 CorePropulsionAGameData.xml fields, including TW power and magnetic-only diameter.
const MODULES = `
  <ThermalCore Id="FusionCore"><FeedsFrom Parent="true"/><Reaction Id="FusionH2"/><CoreTemperature K="3000000"/><MaxPressure Bar="1000"/><ThermalEfficiency Value="0.95"/><MinimumThrottle Value="0.01"/></ThermalCore>
  <AntimatterRamCore Id="RamCore"><FeedsFrom Parent="true"/><JetPower TW="30"/><AnnihilationEfficiency Value="0.5"/><CarriedExhaustFractionOfLight Value="0.4"/><Antimatter Id="AntiH2(l)"/><ReactionMass Id="H2(l)"/><MinimumThrottle Value="0.01"/></AntimatterRamCore>
  <MagneticNozzle Id="Nozzle"><FxExitDiameter M="4.605"/><ExhaustLocation X="-1.23"/><ExhaustDirection X="-1"/><SoundEvent Action="On" SoundId="DefaultEngineSoundBehavior"/></MagneticNozzle>
  <MagneticScoop Id="Scoop"><CaptureRadius Km="1000"/><Collects Id="H2(l)"/></MagneticScoop>`;

describe('5554 propulsion modules', () => {
  it('carries geometry SubPart propulsion into Parts across asset files and merges overlays additively', () => {
    const geometry = new Map();
    const parts: CatalogPart[] = [];
    // The Part's pack can arrive before the pack defining its reusable template.
    parsePartsFile(
      xml(
        '<Assets><Part Id="P"><SubPart Id="placed" InstanceOf="T"/><MagneticScoop Id="GeometryScoop"/></Part></Assets>',
      ),
      'Parts.xml',
      parts,
      geometry,
    );
    parsePartsFile(
      xml(`<Assets><SubPart Id="T">${MODULES}</SubPart></Assets>`),
      'Templates.xml',
      parts,
      geometry,
    );
    const game = {
      parts: new Map(),
      subParts: new Map(),
      subPartColliders: new Map(),
      subPartLights: new Map(),
    };
    parseGameDataFile(
      xml(
        '<Assets><PartGameData Id="P"><MagneticScoop Id="OverlayScoop"/></PartGameData><SubPartGameData Id="T"><ThermalCore Id="OverlayCore"><CoreTemperature K="2000"/></ThermalCore></SubPartGameData></Assets>',
      ),
      game,
    );
    mergeGameData(parts, game, geometry);
    expect(parts[0].magneticScoops.map((scoop) => scoop.id)).toEqual([
      'GeometryScoop',
      'OverlayScoop',
    ]);
    expect(parts[0].subPartGameData[0].thermalCores.map((core) => core.id)).toEqual([
      'FusionCore',
      'OverlayCore',
    ]);
    expect(parts[0].subPartGameData[0].antimatterRamCores[0].jetPowerW).toBe(30e12);
    expect(parts[0].subPartGameData[0].magneticNozzles[0].fxExitDiameterM).toBe(4.605);
    const part = createEmptyPart();
    part.partId = 'P';
    part.placements = parts[0].placements;
    part.subPartGameData = parts[0].subPartGameData;
    const content = buildMultiModContent(
      [{ entryId: 'P', name: 'P', ns: 'P', part }],
      'Geometry',
      new Map([
        [
          'T',
          {
            id: 'T',
            atlasUrl: '/ksa/T.glb',
            meshNodeName: 'T',
            materialId: 'Material',
            sourceFile: 'Templates.xml',
          },
        ],
      ]),
    );
    const output = content.gameDataXml;
    const variantId = content.perPart[0].remap.get('T');
    expect(variantId).toBeTruthy();
    expect(output).toContain(`<SubPartGameData Id="${variantId}">`);
    expect(output).toContain('<ThermalCore Id="FusionCore">');
    expect(output).toContain('<MagneticNozzle Id="Nozzle">');
  });
  it('normalizes geometry Part/SubPart modules and round-trips them through GameData', () => {
    const geometry = xml(`<Part Id="P">${MODULES}</Part>`).documentElement;
    const game = engineModulesFromElement(geometry);
    expect(game.thermalCores[0]).toMatchObject({
      reactionId: 'FusionH2',
      coreTemperatureK: 3e6,
      maxPressurePa: 1e8,
    });
    expect(game.antimatterRamCores[0]).toMatchObject({
      jetPowerW: 30e12,
      antimatterId: 'AntiH2(l)',
      carriedExhaustFractionOfLight: 0.4,
    });
    expect(game.magneticScoops[0].captureRadiusM).toBe(1e6);
    const part = createEmptyPart();
    part.partId = 'P';
    part.gameData = game;
    const template = createSubPartGameData('T');
    const subGeometry = engineModulesFromElement(
      xml(`<SubPart Id="T">${MODULES}</SubPart>`).documentElement,
    );
    template.thermalCores = subGeometry.thermalCores;
    template.antimatterRamCores = subGeometry.antimatterRamCores;
    template.magneticNozzles = subGeometry.magneticNozzles;
    template.magneticScoops = subGeometry.magneticScoops;
    part.subPartGameData.push(template);
    part.placements.push({
      instanceId: 'T1',
      subPartTemplateId: 'T',
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    });
    const output = serializeGameDataXml([{ part, remap: new Map() }], '');
    const doc = xml(output);
    for (const nozzle of Array.from(doc.getElementsByTagName('MagneticNozzle'))) {
      expect(nozzle.getElementsByTagName('ExitDiameter')).toHaveLength(0);
      expect(nozzle.getElementsByTagName('FlowEfficiency')).toHaveLength(0);
      expect(nozzle.getElementsByTagName('AreaRatio')).toHaveLength(0);
    }
    const decoded = gameDataFromAssets(output, 'P', parser)!;
    expect(decoded.gameData.thermalCores).toEqual(game.thermalCores);
    expect(decoded.gameData.antimatterRamCores).toEqual(game.antimatterRamCores);
    expect(decoded.gameData.magneticNozzles).toEqual(game.magneticNozzles);
    expect(decoded.gameData.magneticScoops).toEqual(game.magneticScoops);
    expect(decoded.subPartGameData[0].thermalCores).toEqual(game.thermalCores);
    expect(decoded.subPartGameData[0].antimatterRamCores).toEqual(game.antimatterRamCores);
  });

  it('slices thermal gas properties linearly in temperature and clamps the requested temperature', () => {
    const reactions: ReactionData[] = [];
    const condition = (gamma: number, molarMass: number) =>
      `<PressureCondition><LnPressure Value="10"/><Gamma Value="${gamma}"/><MolarMass GPerMol="${molarMass}"/></PressureCondition>`;
    parseReactionsFile(
      xml(
        `<Assets><ThermalReaction Id="Heated"><Reactant Id="H2(l)" MassShare="1"/><TemperatureCondition K="1000">${condition(1.4, 2)}</TemperatureCondition><TemperatureCondition K="3000">${condition(1.6, 1)}</TemperatureCondition></ThermalReaction></Assets>`,
      ),
      reactions,
    );
    const reaction = reactions[0];
    expect(reaction.kind).toBe('Thermal');
    if (reaction.kind !== 'Thermal') return;
    const slice = resolveThermalReactionLut(reaction, 2000);
    expect(slice.rows[0].temperature).toBe(2000);
    expect(slice.rows[0].gamma).toBeCloseTo(1.5, 12);
    expect(slice.rows[0].specificGasConstant).toBeCloseTo(8.31446261815324 * 750, 8);
    expect(resolveThermalReactionLut(reaction, 500).rows[0].temperature).toBe(1000);
    expect(resolveThermalReactionLut(reaction, 5000).rows[0].temperature).toBe(3000);
    const part = createEmptyPart();
    part.gameData.thermalCores.push({
      ...createThermalCore('Core'),
      reactionId: 'Heated',
      coreTemperatureK: 2000,
    });
    part.gameData.nozzles.push(createNozzle('N'));
    part.gameData.rockets.push(createRocket('R', 'Core', ['N']));
    const result = computePerformance(part, { kind: 'part' }, 'R', new Map([['Heated', reaction]]));
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.thrustVacN).toBeGreaterThan(0);
    expect(
      validateEngines(part, new Map([['Heated', reaction]])).filter(
        (issue) => issue.severity === 'block',
      ),
    ).toEqual([]);
    part.gameData.thermalCores[0].reactionId = 'Hydrolox';
    expect(
      validateEngines(part).some((issue) => issue.code === 'thermal-core-needs-thermal-reaction'),
    ).toBe(true);
  });

  it('matches the carried and scooped branches of AntimatterRamCore.ComputeDrive', () => {
    const speedOfLight = 299792458;
    const drive = computeRamDrive(1, 30e12, 0.5, 0.4 * speedOfLight);
    expect(drive.thrustN).toBeCloseTo((2 * 30e12) / (0.4 * speedOfLight), 8);
    expect(drive.antimatterMassFlowRate).toBeCloseTo(30e12 / speedOfLight ** 2, 12);
    expect(drive.carriedMassFlowRate).toBeCloseTo((2 * 30e12) / (0.4 * speedOfLight) ** 2, 12);
    const nozzle = predictMagneticPerformance(30e12, 0.5, 0.4, 2);
    expect(nozzle.thrustVacN * 2).toBeCloseTo(drive.thrustN, 8);
    expect(nozzle.massFlowRate * 2).toBeCloseTo(drive.carriedMassFlowRate, 12);
    expect(nozzle.thrustSLN).toBe(nozzle.thrustVacN);
    const scooped = computeRamDrive(1, 1e6, 0.5, 1000, 100, 0, 0);
    expect(scooped.carriedMassFlowRate).toBe(0);
    expect(scooped.thrustN).toBe(2000);
    expect(scooped.antimatterMassFlowRate).toBeCloseTo(20000 / speedOfLight ** 2, 20);
    const mixed = computeRamDrive(1, 1e6, 0.5, 1000, 0.1, 0, 0);
    expect(mixed.carriedMassFlowRate).toBeGreaterThan(0);
    expect(mixed.carriedMassFlowRate).toBeLessThan(2);
    // KSA throttles the thrust target but retains nominal jet power in the ram branches.
    const half = computeRamDrive(0.5, 1e6, 0.5, 1000, 0.1, 0, 0);
    expect(half.thrustN).toBe(1000);
    expect(half.antimatterMassFlowRate).toBeCloseTo(1e6 / speedOfLight ** 2, 20);
    const ramPower = 1e6 - 0.5 * half.carriedMassFlowRate * 1000 ** 2;
    expect(0.1 * Math.sqrt((2 * ramPower) / 0.1) + half.carriedMassFlowRate * 1000).toBeCloseTo(
      1000,
      6,
    );
    expect(computeRamDrive(0, 30e12, 0.5, speedOfLight).thrustN).toBe(0);
  });
});
