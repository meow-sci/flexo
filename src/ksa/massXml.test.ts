import { DOMParser } from '@xmldom/xmldom';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  gameDataFromAssets,
  massDefinitionsFromElement,
  readDensityKgM3,
  readMassKg,
  parseGameDataElement,
  subPartGameDataFromDoc,
} from './partXmlParser';
import { serializeGameDataXml } from './partXmlSerializer';
import { resolveContent } from './contentXml';
import { catalogPartsFromContent } from './partCatalog';
import { buildMultiCustomBundle, buildMultiModContent } from './modExport';
import { createEmptyPart, createSubPartGameData, identityTransform } from './types';
import {
  createMassDefinition,
  MASS_SHAPES,
  combinedMassSummary,
  resolveMassDefinitionKg,
} from './massDefinitions';
import { buildProjectExport } from '../state/projectTransfer';
import { encodeProject, decodeProject } from '../state/projectCodec';
import type { CatalogSubPart } from './catalog';
import { hasKsaAssets, KSA_ASSETS_DIR, readVendoredAsset } from './ksaTestAssets';

function doc(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
}

function parseMasses(xml: string) {
  return massDefinitionsFromElement(
    doc(`<Part Id="Test"><InertMasses>${xml}</InertMasses></Part>`).documentElement,
  );
}

function roundTripMasses(xml: string) {
  const part = createEmptyPart();
  part.partId = 'Test';
  part.gameData.massDefinitions = parseMasses(xml);
  const output = serializeGameDataXml([{ part, remap: new Map() }], '');
  return { output, masses: gameDataFromAssets(output, 'Test')!.gameData.massDefinitions };
}

const STOCK_SHAPES = [
  '<CustomMass><LocationAsmb Z="-0.49792"/><Mass Kg="50"/><MassSpecificInertia Ixx="0.0256970833" Iyy="0.0231508333" Izz="0.0099664166"/></CustomMass>',
  '<SolidCuboidMass><Mass Kg="52"/><LengthX M="0.6721"/><LengthY M="0.4828"/><LengthZ M="0.3549"/></SolidCuboidMass>',
  '<SolidSphereMass><Mass Kg="400"/><Radius M="0.25"/></SolidSphereMass>',
  '<HollowSphereMass><LocationAsmb Y="0.19878" Z="0.184124"/><Material Ref="Aluminum.2014" Phase="Solid"/><Radius M="0.175"/><WallThickness Mm="2"/></HollowSphereMass>',
  '<SolidCylinderMass><Mass Kg="87"/><Length M="0.2468"/><Radius M="0.5"/></SolidCylinderMass>',
  '<HollowOpenCylinderMass><Material Ref="Aluminum.2014" Phase="Solid"/><Length M="0.04"/><OuterRadius M="0.125"/><WallThickness Mm="6"/></HollowOpenCylinderMass>',
  '<HollowOpenTruncatedConeMass><LocationAsmb X="-0.2253"/><Material Ref="Aluminum.2014" Phase="Solid"/><Height M="0.451"/><RadiusBase M="0.159"/><RadiusTop M="0.1"/><Sweep Degrees="180"/><WallThickness Mm="6"/></HollowOpenTruncatedConeMass>',
  '<HollowOpenSemiEllipsoidMass><LocationAsmb X="-0.0995"/><Material Ref="Aluminum.2014" Phase="Solid"/><Length M="0.199"/><Radius M="0.2498"/><WallThickness Mm="6"/></HollowOpenSemiEllipsoidMass>',
  '<HollowOpenOgiveMass><LocationAsmb X="-0.7044"/><Material Ref="Aluminum.2014" Phase="Solid"/><Height M="1.4088"/><Radius M="0.2498"/><WallThickness Mm="6"/></HollowOpenOgiveMass>',
];

describe('editable mass XML', () => {
  it('models every current stock shape with G6 import/export fidelity', () => {
    expect(STOCK_SHAPES).toHaveLength(MASS_SHAPES.length);
    for (const xml of STOCK_SHAPES) {
      const before = parseMasses(xml)[0];
      const { masses } = roundTripMasses(xml);
      const after = masses[0];
      expect(after.shape).toBe(before.shape);
      expect(after.massKg).toBe(before.massKg);
      expect(after.densityKgM3).toBe(before.densityKgM3);
      expect(after.materialId).toBe(before.materialId);
      expect(after.dimensions).toEqual(before.dimensions);
      expect(after.locationAsmb).toEqual(before.locationAsmb);
      expect(after.paf2Asmb).toEqual(before.paf2Asmb);
      if (before.sweepRad != null) expect(after.sweepRad).toBeCloseTo(before.sweepRad, 5);
      else expect(after.sweepRad).toBeNull();
      if (before.massSpecificInertia) {
        expect(after.massSpecificInertia!.ixx).toBeCloseTo(before.massSpecificInertia.ixx, 7);
        expect(after.massSpecificInertia!.iyy).toBeCloseTo(before.massSpecificInertia.iyy, 7);
        expect(after.massSpecificInertia!.izz).toBeCloseTo(before.massSpecificInertia.izz, 7);
      } else expect(after.massSpecificInertia).toBeNull();
    }
  });

  it('keeps repeatable definitions, coauthored mass sources and opaque children', () => {
    const { output, masses } = roundTripMasses(`
      <SolidCuboidMass Author="kept">
        <Mass Kg="2" G="500"/><Density TonnePerM3="1" KgPerM3="20"/>
        <Material Ref="Aluminum.2014" Phase="Solid"/>
        <LengthX Cm="10" Mm="5"/><LengthY M="0.2"/><LengthZ M="0.3"/>
        <LocationAsmb X="1" Y="2" Z="3"/><Paf2Asmb Y="0.25"/>
        <Opaque MassId="external"><Preserve Value="yes"/></Opaque>
      </SolidCuboidMass>
      <SolidCuboidMass><Mass Kg="10"/><LengthX M="1"/><LengthY M="2"/><LengthZ M="3"/></SolidCuboidMass>`);
    expect(masses).toHaveLength(2);
    expect(masses[0]).toMatchObject({
      massKg: 2.5,
      densityKgM3: 1020,
      materialId: 'Aluminum.2014(s)',
      dimensions: { lengthXM: 0.105, lengthYM: 0.2, lengthZM: 0.3 },
      locationAsmb: { x: 1, y: 2, z: 3 },
      paf2Asmb: { x: 0, y: 0.25, z: 0 },
      unknownAttrs: { Author: 'kept' },
      unknownChildren: [{ tag: 'Opaque', attrs: { MassId: 'external' } }],
    });
    expect(output).toContain('<Mass Kg="2.5"/>');
    expect(output).toContain('<Density KgPerM3="1020"/>');
    expect(output).toContain('<Preserve Value="yes"/>');
  });

  it('imports both stock supply locker shells and preserves them in export and project data', () => {
    const content = resolveContent([
      {
        file: 'CoreLifeSupportAAssets.xml',
        doc: doc(readVendoredAsset('CoreLifeSupportAAssets.xml')),
      },
      {
        file: 'CoreLifeSupportAGameData.xml',
        doc: doc(readVendoredAsset('CoreLifeSupportAGameData.xml')),
      },
    ]);
    const row = Array.from(content.doc.getElementsByTagName('Part')).find(
      (el) => el.getAttribute('Id') === 'CoreLifeSupportA_Prefab_SupplyLockerA',
    )!;
    const masses = parseGameDataElement(row).gameData.massDefinitions;
    expect(masses).toHaveLength(2);
    for (const [index, mass] of masses.entries()) {
      expect(mass).toMatchObject({
        shape: 'HollowSphereMass',
        materialId: 'Aluminum.2014(s)',
        dimensions: { radiusM: 0.175, wallThicknessM: 0.002 },
        locationAsmb: { x: 0, y: 0.19878, z: index ? -0.184124 : 0.184124 },
      });
      expect(resolveMassDefinitionKg(mass, new Map([['Aluminum.2014(s)', 2800]]))).toBeCloseTo(
        ((4 * Math.PI) / 3) * (0.175 ** 3 - 0.173 ** 3) * 2800,
        10,
      );
    }
    const part = createEmptyPart();
    part.partId = 'Test';
    part.gameData.massDefinitions = masses;
    const xml = serializeGameDataXml([{ part, remap: new Map() }], 'Test');
    expect(doc(xml).getElementsByTagName('HollowSphereMass')).toHaveLength(2);
    expect(gameDataFromAssets(xml, 'Test')!.gameData.massDefinitions).toEqual(masses);
    const envelope = buildProjectExport(
      [
        {
          name: 'Test',
          part,
          visible: true,
          opacity: 1,
          offset: { x: 0, y: 0, z: 0 },
          includeInExport: true,
        },
      ],
      'Test',
    );
    expect(decodeProject(encodeProject(envelope)).parts[0].data.gameData.massDefinitions).toEqual(
      masses,
    );
  });

  it('retains current unmodeled inert-mass items at both owner scopes', () => {
    const data = doc(
      `<Assets><Part Id="Test"><InertMasses><SolidSphereMass><Mass Kg="4"/><Radius M="1"/></SolidSphereMass><SolidConeMass><Mass Kg="5"/><Height M="2"/><Radius M="1"/></SolidConeMass></InertMasses></Part><SubPart Id="Template"><InertMasses><SolidConeMass><Mass Kg="6"/><Height M="2"/><Radius M="1"/></SolidConeMass></InertMasses></SubPart></Assets>`,
    );
    const part = createEmptyPart();
    part.partId = 'Test';
    part.gameData = parseGameDataElement(data.getElementsByTagName('Part')[0]).gameData;
    part.subPartGameData = subPartGameDataFromDoc(data);
    part.placements = [
      {
        ...identityTransform(),
        instanceId: 'placement',
        subPartTemplateId: 'Template',
        layerId: 'default',
      },
    ];
    expect(part.subPartGameData[0].massDefinitionsOverride).toBe(true);
    expect(combinedMassSummary(part, new Map())).toMatchObject({
      massKg: 4,
      definitionCount: 3,
      unresolvedCount: 2,
    });
    const xml = serializeGameDataXml([{ part, remap: new Map() }], 'Test');
    const output = doc(xml);
    expect(output.getElementsByTagName('InertMasses')).toHaveLength(2);
    expect(output.getElementsByTagName('SolidConeMass')).toHaveLength(2);
    expect(output.getElementsByTagName('SolidSphereMass')).toHaveLength(1);
    expect(
      parseGameDataElement(output.getElementsByTagName('Part')[0]).gameData.unknownChildren.map(
        (n) => n.tag,
      ),
    ).toEqual(['SolidConeMass']);
    expect(subPartGameDataFromDoc(output)[0].unknownChildren.map((n) => n.tag)).toEqual([
      'SolidConeMass',
    ]);
  });

  it('uses the actual defaults of a partially authored InertiaTemplate', () => {
    const { masses } = roundTripMasses(
      '<CustomMass><Mass Kg="50"/><MassSpecificInertia Ixx="0.5"/></CustomMass>',
    );
    expect(masses[0].massSpecificInertia).toEqual({ ixx: 0.5, iyy: 1, izz: 1 });
    expect(
      parseMasses('<CustomMass><Mass Kg="50"/></CustomMass>')[0].massSpecificInertia,
    ).toBeNull();
  });

  it('normalizes all current MassReference and DensityReference units additively', () => {
    expect(readMassKg(doc('<Mass Kg="2" G="250" Tonnes="1" Mg="2"/>').documentElement)).toBe(
      3002.25,
    );
    expect(readMassKg(doc('<Mass Earths="1"/>').documentElement)).toBe(5.97219e24);
    expect(readMassKg(doc('<Mass Suns="1"/>').documentElement)).toBe(1.98841e30);
    expect(readDensityKgM3(doc('<Density GPerCm3="1" KgPerM3="20"/>').documentElement)).toBe(1020);
    expect(
      readDensityKgM3(doc('<Density GPerM3="1" MgPerM3="1" UgPerM3="1"/>').documentElement),
    ).toBeCloseTo(0.001001001, 12);
  });

  it('merges geometry and GameData mass at both owner scopes instead of dropping or doubling it', () => {
    const geometry = doc(`<Assets>
      <SubPart Id="Template"><InertMasses><SolidSphereMass><Mass Kg="10"/><Radius M="0.1"/></SolidSphereMass></InertMasses></SubPart>
      <Part Id="Test"><InertMasses><SolidCuboidMass><Mass Kg="20"/><LengthX M="1"/><LengthY M="1"/><LengthZ M="1"/></SolidCuboidMass></InertMasses>
        <SubParts><SubPart Key="placed" Ref="Template"/></SubParts>
      </Part></Assets>`);
    const game = doc(`<Assets>
      <Part Id="Test" Modify="Patch"><InertMasses Modify="Extend"><SolidCylinderMass><Mass Kg="30"/><Radius M="0.1"/><Length M="1"/></SolidCylinderMass></InertMasses></Part>
      <SubPart Id="Template" Modify="Patch"><InertMasses Modify="Extend"><CustomMass><Mass Kg="40"/></CustomMass></InertMasses></SubPart>
    </Assets>`);
    const parts = catalogPartsFromContent(
      resolveContent([
        { file: 'Geometry.xml', doc: geometry },
        { file: 'Game.xml', doc: game },
      ]),
    );
    expect(parts[0].massDefinitions.map((mass) => mass.massKg)).toEqual([20, 30]);
    expect(parts[0].subPartGameData[0].massDefinitions.map((mass) => mass.massKg)).toEqual([
      10, 40,
    ]);
    expect(parts[0].subPartGameData[0].massDefinitionsOverride).toBe(true);
  });
});

describe('mass export variants', () => {
  function fixture() {
    const part = createEmptyPart();
    part.partId = 'Test';
    part.placements = [
      {
        ...identityTransform(),
        instanceId: 'placed',
        subPartTemplateId: 'Template',
        layerId: 'default',
      },
    ];
    const inherited = createSubPartGameData('Template');
    inherited.massDefinitions = [createMassDefinition('SolidSphereMass', 'inherited')];
    inherited.massDefinitions[0].massKg = 25;
    inherited.massDefinitionsOverride = true;
    const catalog: ReadonlyMap<string, CatalogSubPart> = new Map([
      [
        'Template',
        {
          id: 'Template',
          atlasUrl: '/ksa/mesh.glb',
          meshNodeName: 'Mesh',
          materialId: 'Material',
          sourceFile: 'Core.xml',
          raw: {
            tag: 'SubPart',
            attrs: { Id: 'Template' },
            children: [
              {
                tag: 'InertMasses',
                attrs: {},
                children: [
                  {
                    tag: 'SolidSphereMass',
                    attrs: {},
                    children: [
                      { tag: 'Mass', attrs: { Kg: '25' }, children: [] },
                      { tag: 'Radius', attrs: { M: '0.1' }, children: [] },
                    ],
                  },
                ],
              },
            ],
          } as NonNullable<CatalogSubPart['raw']>,
          data: { gameData: inherited, colliders: [], lights: [] },
        },
      ],
    ]);
    return { part, catalog };
  }

  it('carries inherited mass into a fresh variant created for another property', async () => {
    const { part, catalog } = fixture();
    part.internalFlags.Template = true;
    const content = buildMultiModContent(
      [{ entryId: 'p', name: 'Test', ns: 'test', part }],
      'Test',
      catalog,
    );
    const bundle = await buildMultiCustomBundle(content);
    const xml = doc(bundle.assetsXml!);
    const variant = xml.getElementsByTagName('SubPart')[0];
    expect(massDefinitionsFromElement(variant).map((mass) => mass.massKg)).toEqual([25]);
    expect(content.gameDataXml).not.toContain('<SolidSphereMass>');
  });

  it('exports explicit mass solely in GameData and an empty override removes inherited mass', async () => {
    const { part, catalog } = fixture();
    const override = createSubPartGameData('Template');
    override.massDefinitionsOverride = true;
    override.massDefinitions = [createMassDefinition('SolidSphereMass', 'edited')];
    override.massDefinitions[0].massKg = 60;
    part.subPartGameData = [override];
    const withMass = buildMultiModContent(
      [{ entryId: 'p', name: 'Test', ns: 'test', part }],
      'Test',
      catalog,
    );
    const bundle = await buildMultiCustomBundle(withMass);
    expect(bundle.assetsXml).not.toContain('<SolidSphereMass>');
    expect(withMass.gameDataXml).toContain('<Mass Kg="60"/>');
    override.massDefinitions = [];
    const withoutMass = buildMultiModContent(
      [{ entryId: 'p', name: 'Test', ns: 'test', part }],
      'Test',
      catalog,
    );
    expect(withoutMass.perPart[0].variants.has('Template')).toBe(true);
    expect((await buildMultiCustomBundle(withoutMass)).assetsXml).not.toContain(
      '<SolidSphereMass>',
    );
    expect(withoutMass.gameDataXml).not.toContain('<SolidSphereMass>');
  });
});

describe.runIf(hasKsaAssets)('live stock mass forms', () => {
  it('parses each mass definition in the complete current Core XML catalog', () => {
    const seen = new Set<string>();
    let count = 0;
    for (const name of readdirSync(KSA_ASSETS_DIR).filter((name) => name.endsWith('.xml'))) {
      const xml = doc(readFileSync(join(KSA_ASSETS_DIR, name), 'utf8').replace(/^\uFEFF/, ''));
      for (const shape of MASS_SHAPES) {
        for (const element of Array.from(xml.getElementsByTagName(shape))) {
          const owner = element.parentNode?.parentNode as Element;
          const definitions = massDefinitionsFromElement(owner);
          const matching = definitions.filter((definition) => definition.shape === shape);
          expect(matching.length).toBeGreaterThan(0);
          expect(
            matching.some(
              (definition) =>
                definition.massKg != null ||
                definition.materialId != null ||
                definition.densityKgM3 != null,
            ),
          ).toBe(true);
          seen.add(shape);
          count++;
        }
      }
    }
    expect([...seen].sort()).toEqual([...MASS_SHAPES].sort());
    expect(count).toBeGreaterThan(100);
  });
});
