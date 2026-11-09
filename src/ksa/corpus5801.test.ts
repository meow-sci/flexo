import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser, type Element as XmlElement } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { CORE_CONTENT_FILES } from './coreContent';
import { resolveContent } from './contentXml';
import { catalogFromContent } from './catalog';
import { catalogPartsFromContent } from './partCatalog';
import { buildMeshIndex } from '../../vite/meshIndex';

const dir = process.env.KSA_ASSETS_DIR ?? '../flexo-private-assets/assets';
describe.skipIf(!existsSync(dir))('current Core corpus', () => {
  it('covers every active top-level Part and SubPart pack', () => {
    for (const file of readdirSync(dir).filter(
      (f) => f.endsWith('.xml') && f !== 'TestContent.xml',
    )) {
      const xml = readFileSync(join(dir, file), 'utf8').replace(/^\uFEFF/, '');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.documentElement?.tagName !== 'Assets') continue;
      const rows = Array.from(doc.documentElement.childNodes)
        .filter((n) => n.nodeType === 1)
        .map((n) => n as unknown as XmlElement);
      if (
        rows.some(
          (r) => ['Part', 'SubPart'].includes(r.tagName) && r.getAttribute('Test') !== 'true',
        )
      ) {
        expect(CORE_CONTENT_FILES, file).toContain(file);
      }
    }
  });
  it('resolves every current Part and render mesh across packs', () => {
    const files = CORE_CONTENT_FILES.flatMap((file) => {
      const path = join(dir, file);
      if (!existsSync(path)) return [];
      const doc = new DOMParser().parseFromString(
        readFileSync(path, 'utf8').replace(/^\uFEFF/, ''),
        'application/xml',
      ) as unknown as Document;
      return [{ file, doc }];
    });
    const content = resolveContent(files);
    const subparts = catalogFromContent(content, buildMeshIndex(dir));
    const parts = catalogPartsFromContent(content);
    expect(subparts.length).toBe(571);
    expect(parts.length).toBe(256);
    const rows = Array.from(content.doc.documentElement.childNodes)
      .filter((n) => n.nodeType === 1)
      .map((n) => n as unknown as XmlElement);
    const templateIds = new Map(
      rows
        .filter((r) => r.tagName === 'SubPart')
        .map((r) => [r.getAttribute('Id')!.toLowerCase(), r.getAttribute('Id')!]),
    );
    const partIds = new Set(parts.map((p) => p.id.toLowerCase()));
    const heads = new Set(parts.filter((p) => p.variantHeadId).map((p) => p.variantHeadId));
    expect(heads.size).toBe(50);
    expect(parts.filter((p) => p.variantIds.length).length).toBe(128);
    const rendered = rows.filter(
      (r) =>
        r.tagName === 'SubPart' &&
        Array.from(r.getElementsByTagName('Components')).some((c) =>
          Array.from(c.childNodes).some(
            (n) =>
              n.nodeType === 1 &&
              ['PartModel', 'PartModelDynamic', 'PartModelGlass'].includes(
                (n as unknown as XmlElement).tagName,
              ),
          ),
        ),
    );
    const allTemplates = rows.filter(
      (r) => r.tagName === 'SubPart' && r.getAttribute('Test') !== 'true',
    );
    expect(rendered).toHaveLength(570);
    expect(subparts.length).toBe(allTemplates.length);
    expect(subparts.filter((s) => (s.models?.length ?? 0) > 0)).toHaveLength(rendered.length);
    const backpack = subparts.find((s) => s.id === 'KittenBackPackSubPart');
    expect(backpack?.models).toEqual([]);
    expect(backpack?.raw).toBeDefined();
    expect(backpack?.data?.gameData?.rocketControllers.length).toBeGreaterThan(0);
    for (const part of parts) {
      for (const placement of part.placements) {
        expect(
          templateIds.get(placement.subPartTemplateId.toLowerCase()),
          `${part.id}: ${placement.subPartTemplateId}`,
        ).toBe(placement.subPartTemplateId);
      }
      for (const id of part.variantIds)
        expect(partIds.has(id.toLowerCase()), `${part.id}: ${id}`).toBe(true);
    }
    for (const subpart of subparts)
      for (const model of subpart.models ?? []) {
        expect(model.diffuseUrl, subpart.id).toBeTruthy();
        expect(model.normalUrl, subpart.id).toBeTruthy();
        expect(model.aoRoughMetalUrl, subpart.id).toBeTruthy();
      }

    expect(subparts.find((p) => p.id === 'CoreSurfacesB_Subpart_TrussAFoilA')?.atlasUrl).toContain(
      'CoreSurfacesB_MeshAtlas.glb',
    );
    expect(subparts.find((p) => p.id === 'CoreFuelTankA_Subpart_Skin1W1HA')?.appearanceIds).toEqual(
      [
        'CoreFuelTankA_Subpart_Skin1W1HA',
        'CoreFuelTankA_Subpart_Skin1W1HB',
        'CoreFuelTankA_Subpart_Skin1W1HC',
      ],
    );
    expect(parts.find((p) => p.id === 'CoreCommandB_Prefab_SmallLanderB')?.variantIds).toHaveLength(
      2,
    );
  });
});
