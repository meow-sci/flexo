import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { CORE_CONTENT_FILES } from './coreFiles';
import { resolveContent } from './contentXml';
import { catalogFromContent, indexCatalog } from './catalog';
import { catalogPartsFromContent } from './partCatalog';
import { parseGameDataElement } from './partXmlParser';
import { createEmptyPart } from './types';
import { buildMultiCustomBundle, buildMultiModContent } from './modExport';
import { buildMeshIndex } from '../../vite/meshIndex';

const parse = (xml: string) =>
  new DOMParser().parseFromString(
    xml.replace(/^\uFEFF/, ''),
    'application/xml',
  ) as unknown as Document;

describe.skipIf(!process.env.KSA_ASSETS_DIR)('current stock export corpus', () => {
  it('exports every concrete catalog composition with its current gameplay and resolves all copies', async () => {
    const root = process.env.KSA_ASSETS_DIR!;
    const files = CORE_CONTENT_FILES.map((file) => ({
      file,
      doc: parse(readFileSync(join(root, file), 'utf8')),
    }));
    const core = resolveContent(files);
    const catalog = indexCatalog(catalogFromContent(core, buildMeshIndex(root)));
    const catalogParts = catalogPartsFromContent(core);
    const unsupported = catalogParts.filter((entry) =>
      entry.placements.some((placement) => !catalog.has(placement.subPartTemplateId)),
    );
    expect(unsupported.map((entry) => entry.id)).toEqual([]);
    const parts = catalogParts.map((entry, i) => {
      const row = Array.from(core.doc.documentElement.children).find(
        (element) => element.tagName === 'Part' && element.getAttribute('Id') === entry.id,
      )!;
      const parsed = parseGameDataElement(row);
      const part = createEmptyPart();
      part.partId = `ValidationPart${i}`;
      part.gameData = parsed.gameData;
      part.gameData.crashTolerancePa = entry.crashTolerancePa;
      part.editorTags = entry.editorTags;
      part.placements = entry.placements;
      part.connectors = entry.connectors;
      part.subPartGameData = entry.subPartGameData;
      part.colliders = entry.colliders;
      part.lights = entry.lights;
      part.ivaSeats = entry.ivaSeats;
      return { entryId: part.partId, name: entry.id, ns: part.partId, part };
    });
    const content = buildMultiModContent(parts, 'SchemaValidation', catalog);
    const bundle = await buildMultiCustomBundle(content);
    const exportFiles = [
      ...files,
      ...(bundle.assetsXml ? [{ file: bundle.assetsFile!, doc: parse(bundle.assetsXml) }] : []),
      { file: content.partFile, doc: parse(content.partXml) },
      { file: content.gameDataFile, doc: parse(content.gameDataXml) },
    ];
    const output = resolveContent(exportFiles);
    expect(parts.length).toBe(256);
    expect(
      Array.from(output.doc.getElementsByTagName('Part')).filter((row) =>
        row.getAttribute('Id')?.startsWith('ValidationPart'),
      ).length,
    ).toBe(parts.length);
    const lockerId = parts.find((p) => p.name === 'CoreLifeSupportA_Prefab_SupplyLockerA')!.entryId;
    const locker = Array.from(output.doc.getElementsByTagName('Part')).find(
      (row) => row.getAttribute('Id') === lockerId,
    )!;
    const shells = parseGameDataElement(locker).gameData.massDefinitions;
    expect(shells.map((m) => m.shape)).toEqual(['HollowSphereMass', 'HollowSphereMass']);
    expect(shells.map((m) => m.locationAsmb.z)).toEqual([0.184124, -0.184124]);
    const backpackId = parts.find((p) => p.name === 'KittenBackPackPart')!.entryId;
    const backpack = catalogPartsFromContent(output).find((part) => part.id === backpackId)!;
    expect(backpack.subPartGameData.flatMap((s) => s.rocketControllers).length).toBeGreaterThan(0);
    // Animation clips require GLB decoding and are not reconstructed by this corpus harness.
    // Optional artifact for validation with KSA's managed ContentDeserializer. This
    // does not run GPU/file loading and does not replace actual in-game validation.
    if (process.env.FLEXO_SCHEMA_OUTPUT_PATH) {
      writeFileSync(
        process.env.FLEXO_SCHEMA_OUTPUT_PATH + '.sources.json',
        JSON.stringify(
          exportFiles.map(({ file, doc }) => ({
            file,
            xml: new XMLSerializer().serializeToString(doc as never),
          })),
        ),
      );
      writeFileSync(
        process.env.FLEXO_SCHEMA_OUTPUT_PATH,
        new XMLSerializer().serializeToString(output.doc as never),
      );
      writeFileSync(process.env.FLEXO_SCHEMA_OUTPUT_PATH + '.parts.xml', content.partXml);
      writeFileSync(process.env.FLEXO_SCHEMA_OUTPUT_PATH + '.game.xml', content.gameDataXml);
      if (bundle.assetsXml)
        writeFileSync(process.env.FLEXO_SCHEMA_OUTPUT_PATH + '.assets.xml', bundle.assetsXml);
    }
  }, 30000);
});
