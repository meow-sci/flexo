import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { attachSubPartGameData, parseAssetsFile, type CatalogSubPart } from './catalog';
import { mergeGameData, parseGameDataFile, parsePartsFile, type CatalogPart } from './partCatalog';
import { readVendoredAsset } from './ksaTestAssets';

const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;

function stockPack(pack: string) {
  const assets = parse(readVendoredAsset(`CorePropulsion${pack}Assets.xml`));
  const gameData = parse(readVendoredAsset(`CorePropulsion${pack}GameData.xml`));
  return { assets, gameData };
}

describe('stock engine catalog metadata', () => {
  it('carries the real liquid chamber, RCS and solid hardware on direct SubPart entries', () => {
    const entries: CatalogSubPart[] = [];
    const docs: Document[] = [];
    for (const pack of ['A', 'B', 'C']) {
      const { assets, gameData } = stockPack(pack);
      parseAssetsFile(assets, `CorePropulsion${pack}Assets.xml`, entries, gameData);
      docs.push(gameData);
    }
    attachSubPartGameData(entries, docs);
    const chamber = entries.find(
      (e) => e.id === 'CorePropulsionA_Subpart_EngineALargeVacAssembly',
    )!;
    expect(chamber.data?.gameData?.combustors[0]).toMatchObject({
      id: 'ThrustChamber',
      reactionId: 'Hydrolox',
      mixtureRatio: 5.5,
    });
    expect(chamber.data?.gameData?.nozzles).toHaveLength(1);
    expect(chamber.data?.gameData?.rockets).toHaveLength(1);
    const rcs = entries.find((e) => e.id === 'CorePropulsionB_Subpart_RCSSetAThrusterLargeA')!;
    expect(rcs.data?.gameData?.combustors[0].plumbing).toBe('Service');
    expect(rcs.data?.gameData?.rocketControllers.some((c) => c.kind === 'thruster')).toBe(true);
    const solid = entries.find((e) => e.id === 'CorePropulsionA_Subpart_SRBSizeANozzleA')!;
    expect(solid.data?.gameData?.solidNozzles).toHaveLength(1);
  });

  it('combines metadata across files without losing earlier modules', () => {
    const entries: CatalogSubPart[] = [
      { id: 'Chamber', atlasUrl: '', meshNodeName: null, sourceFile: '' },
    ];
    const docs = [
      parse(
        '<Assets><SubPartGameData Id="Chamber"><Combustor Id="Burner"/></SubPartGameData></Assets>',
      ),
      parse(
        '<Assets><SubPartGameData Id="Chamber"><DeLavalNozzle Id="Bell"><AreaRatio Value="10"/></DeLavalNozzle></SubPartGameData></Assets>',
      ),
    ];
    attachSubPartGameData(entries, docs);
    expect(entries[0].data?.gameData?.combustors).toHaveLength(1);
    expect(entries[0].data?.gameData?.nozzles).toHaveLength(1);
    const acc = {
      parts: new Map(),
      subParts: new Map(),
      subPartColliders: new Map(),
      subPartLights: new Map(),
    };
    for (const doc of docs) parseGameDataFile(doc, acc);
    expect(acc.subParts.get('Chamber').combustors).toHaveLength(1);
    expect(acc.subParts.get('Chamber').nozzles).toHaveLength(1);
  });

  it('merges geometry gimbal pivots with the real LR91 GameData angle limits', () => {
    const { assets, gameData } = stockPack('A');
    const parts: CatalogPart[] = [];
    parsePartsFile(assets, 'CorePropulsionAAssets.xml', parts);
    const acc = {
      parts: new Map(),
      subParts: new Map(),
      subPartColliders: new Map(),
      subPartLights: new Map(),
    };
    parseGameDataFile(gameData, acc);
    mergeGameData(parts, acc);
    const lr91 = parts.find((p) => p.id === 'CorePropulsionA_Prefab_EngineA3')!;
    const main = lr91.gimbals.find(
      (g) => g.subPartInstanceId === 'CorePropulsionA_Subpart_EngineALargeVacAssembly2',
    )!;
    expect(main.maxAngleYDeg).toBe(2);
    expect(main.transform.position.x).toBe(1.1575);
    const turbine = lr91.gimbals.find(
      (g) => g.subPartInstanceId === 'CorePropulsionA_Subpart_EngineATurbopumpNozzle3',
    )!;
    expect(turbine.maxAngleYDeg).toBe(70);
    expect(turbine.transform.position).toEqual({ x: 0.1156, y: -0.0001, z: 0.0968 });
    expect(turbine.transform.rotation.x).toBe(-1.5708);
  });
});
