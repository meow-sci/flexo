import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { expect, it } from 'vitest';
import { CORE_CONTENT_FILES } from './coreFiles';
import { resolveContent } from './contentXml';
import { catalogPartsFromContent } from './partCatalog';
import { hasKsaAssets, KSA_ASSETS_DIR } from './ksaTestAssets';

const fixtureDir = 'src/ksa/__fixtures__';
function content() {
  return resolveContent(
    CORE_CONTENT_FILES.map((file) => {
      const xml = readFileSync(join(fixtureDir, file), 'utf8').replace(/^\uFEFF/, '');
      return {
        file,
        doc: new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document,
      };
    }),
  );
}
it('resolves every concrete Part and explicit ordered family from vendored Core', () => {
  const parts = catalogPartsFromContent(content());
  expect(parts.length).toBeGreaterThanOrEqual(256);
  const lander = parts.find((p) => p.id === 'CoreCommandB_Prefab_SmallLanderB')!;
  expect(lander.variantIds).toEqual([
    'CoreCommandB_Prefab_SmallLanderA',
    'CoreCommandB_Prefab_SmallLanderB',
  ]);
  expect(lander.variantIndex).toBe(1);
  expect(
    lander.placements.some(
      (p) => p.subPartTemplateId === 'CoreSurfacesA_Subpart_SmallLanderClothA',
    ),
  ).toBe(true);
  expect(lander.connectors.length).toBeGreaterThan(0);
  expect(parts.find((p) => p.id === 'CoreLifeSupportA_Prefab_SupplyLockerA')?.variantIds).toEqual(
    [],
  );
});
it.runIf(hasKsaAssets)('keeps vendored fixtures byte-identical to the current mirror', () => {
  for (const file of readdirSync(fixtureDir).filter((f) => f.endsWith('.xml'))) {
    expect(existsSync(join(KSA_ASSETS_DIR, file)), file).toBe(true);
    expect(readFileSync(join(fixtureDir, file))).toEqual(readFileSync(join(KSA_ASSETS_DIR, file)));
  }
});

it('rejects a gameplay-drifting member from a cosmetic family', () => {
  const xml = `<Assets><Part Id="a"><Variants><Part Ref="a"/><Part Ref="b"/></Variants><Components><Control/></Components></Part><Part Id="b" Parent="a"><Components><Battery/></Components></Part></Assets>`;
  const doc = new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
  const parts = catalogPartsFromContent(resolveContent([{ file: 'a', doc }]));
  expect(parts.map((p) => p.variantIds)).toEqual([[], []]);
});
