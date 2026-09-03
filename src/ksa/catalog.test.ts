import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { ASSET_FILES, parseAssetsFile, type CatalogSubPart } from './catalog';
import { hasKsaAssets, KSA_ASSETS_DIR, ksaAsset, readVendoredAsset } from './ksaTestAssets';
import { DEFAULT_LAYER_ID } from './types';

function parseFile(name: string): CatalogSubPart[] {
  const text = readFileSync(ksaAsset(name), 'utf-8');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const out: CatalogSubPart[] = [];
  parseAssetsFile(doc as unknown as Document, name, out);
  return out;
}

/** Extracts the node names declared in a GLB's JSON chunk. */
function glbNodeNames(glbPath: string): Set<string> {
  const buf = readFileSync(glbPath);
  // GLB header: magic(4) version(4) length(4); first chunk: length(4) type(4) data.
  const jsonChunkLength = buf.readUInt32LE(12);
  const jsonText = buf.toString('utf-8', 20, 20 + jsonChunkLength);
  const json = JSON.parse(jsonText) as { nodes?: { name?: string }[] };
  return new Set((json.nodes ?? []).map((n) => n.name).filter((n): n is string => !!n));
}

describe('catalog parsing (real Core XML)', () => {
  // Real licensed XML/GLB from the private assets repo; skips without it (open-source CI).
  const structural = hasKsaAssets ? parseFile('CoreStructuralAAssets.xml') : [];

  it.runIf(hasKsaAssets)('extracts SubPart templates with atlas + mesh node + material', () => {
    expect(structural.length).toBeGreaterThan(20);
    const truss = structural.find((s) => s.id === 'CoreStructuralA_Subpart_TrussBarA')!;
    expect(truss).toBeDefined();
    const base = import.meta.env.BASE_URL;
    expect(truss.atlasUrl).toBe(`${base}ksa/Meshes/CoreStructuralA_MeshAtlas.glb`);
    expect(truss.meshNodeName).toBe('CoreStructuralA_Subpart_TrussBarA');
    expect(truss.materialId).toBe('CoreStructuralA_Material');
    expect(truss.diffuseUrl).toContain(`${base}ksa/Textures/`);
  });

  it.runIf(hasKsaAssets)('does not include Part SubPart instances (only templates)', () => {
    // Every entry must have a mesh node (templates), none should be an instance.
    for (const s of structural) {
      expect(s.meshNodeName ?? '').not.toBe('');
    }
  });

  it.runIf(hasKsaAssets)('every resolved mesh node name exists in its GLB atlas', () => {
    const names = glbNodeNames(ksaAsset('Meshes/CoreStructuralA_MeshAtlas.glb'));
    const missing = structural
      .filter((s) => s.meshNodeName && !names.has(s.meshNodeName))
      .map((s) => s.meshNodeName);
    expect(missing).toEqual([]);
  });

  it.runIf(hasKsaAssets)('flags IVA (Internal) SubParts and leaves normal ones unmarked', () => {
    const iva = parseFile('CoreIVAPropAAssets.xml');
    const note = iva.find((s) => s.id === 'CoreIVAPropA_Subpart_WrittenNoteE')!;
    expect(note).toBeDefined();
    expect(note.internal).toBe(true);
    // The built-in Mesh + Material ids an export variant of this template reuses.
    expect(note.meshNodeName).toBe('CoreIVAPropA_Subpart_WrittenNoteE');
    expect(note.materialId).toBe('CoreIVAPropA_Material');
    // A normal structural SubPart carries no Internal flag.
    const truss = structural.find((s) => s.id === 'CoreStructuralA_Subpart_TrussBarA')!;
    expect(truss.internal).toBeUndefined();
  });

  it.runIf(hasKsaAssets)('captures the raw <RayTracing> token, including ShadowProxy', () => {
    const space = parseFile('CoreIVASpaceAAssets.xml');
    const blocker = space.find((s) => s.id === 'CoreIVASpaceA_Subpart_MediumCapsuleARayBlocker')!;
    expect(blocker.rayTracing).toBe('ShadowProxy');
  });

  it.runIf(hasKsaAssets)('leaves shadowCaster undefined across Core, which authors none', () => {
    // Core's only two authored <ShadowCaster>false</ShadowCaster>s were the medium-capsule
    // windows; build 5261 (rev 5200) re-imported the command parts and dropped both, so NO
    // Core template authors the element anymore. The schema is untouched — PartModelModule
    // still declares [XmlElement("ShadowCaster")], default true — so flexo keeps parsing and
    // emitting it; the inline-XML suite below is now the only coverage of the capture itself.
    // If a re-import ever re-authors one, this flips and the anchored assertion comes back.
    const command = parseFile('CoreCommandAAssets.xml');
    expect(command.find((s) => s.id === 'CoreCommandA_Subpart_MediumCapsuleWindowA')).toBeDefined();
    expect(command.filter((s) => s.shadowCaster !== undefined)).toEqual([]);
  });
});

// Inline XML so the <RayTracing> capture is covered without the private asset tree.
describe('<PartModel><RayTracing> capture', () => {
  function parseInline(xml: string): CatalogSubPart[] {
    const out: CatalogSubPart[] = [];
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    parseAssetsFile(doc as unknown as Document, 'InlineAssets.xml', out);
    return out;
  }

  const xml = `<Assets>
    <MeshAtlas Path="Meshes/Inline_MeshAtlas.glb" />
    <SubPart Id="Inline_Subpart_Blocker">
      <PartModel Id="Inline_Subpart_Blocker_Model">
        <Internal>true</Internal>
        <Mesh Id="Inline_Subpart_Blocker" />
        <Material Id="Inline_Material" />
        <RayTracing>ShadowProxy</RayTracing>
      </PartModel>
    </SubPart>
    <SubPart Id="Inline_Subpart_Plain">
      <PartModel Id="Inline_Subpart_Plain_Model">
        <Mesh Id="Inline_Subpart_Plain" />
      </PartModel>
    </SubPart>
  </Assets>`;

  it('keeps the token verbatim (flexo copies it, never interprets it)', () => {
    const out = parseInline(xml);
    const blocker = out.find((s) => s.id === 'Inline_Subpart_Blocker')!;
    expect(blocker.rayTracing).toBe('ShadowProxy');
    expect(blocker.internal).toBe(true);
  });

  it('leaves `rayTracing` undefined for a template that authors none', () => {
    expect(
      parseInline(xml).find((s) => s.id === 'Inline_Subpart_Plain')!.rayTracing,
    ).toBeUndefined();
  });
});

// Inline XML so the <ShadowCaster> capture is covered without the private asset tree.
// Unlike <RayTracing> (an enum token kept verbatim) this is a bool, and "absent" must stay
// distinguishable from "explicitly true" — KSA defaults it to true, so only `false` is
// load-bearing and dropping it on an export variant makes the mesh start casting shadows.
describe('<PartModel><ShadowCaster> capture', () => {
  function parseInline(sourceXml: string): CatalogSubPart[] {
    const out: CatalogSubPart[] = [];
    const doc = new DOMParser().parseFromString(sourceXml, 'application/xml');
    parseAssetsFile(doc as unknown as Document, 'InlineAssets.xml', out);
    return out;
  }

  const xml = `<Assets>
    <MeshAtlas Path="Meshes/Inline_MeshAtlas.glb" />
    <SubPart Id="Inline_Subpart_Window">
      <PartModel Id="Inline_Subpart_Window_Model">
        <Mesh Id="Inline_Subpart_Window" />
        <Material Id="Inline_Material" />
        <ShadowCaster>false</ShadowCaster>
      </PartModel>
    </SubPart>
    <SubPart Id="Inline_Subpart_Caster">
      <PartModel Id="Inline_Subpart_Caster_Model">
        <Mesh Id="Inline_Subpart_Caster" />
        <ShadowCaster>true</ShadowCaster>
      </PartModel>
    </SubPart>
    <SubPart Id="Inline_Subpart_Plain">
      <PartModel Id="Inline_Subpart_Plain_Model">
        <Mesh Id="Inline_Subpart_Plain" />
      </PartModel>
    </SubPart>
  </Assets>`;

  const out = parseInline(xml);
  const find = (id: string) => out.find((s) => s.id === id)!;

  it('captures `false` from <ShadowCaster>false</ShadowCaster>', () => {
    expect(find('Inline_Subpart_Window').shadowCaster).toBe(false);
  });

  it('captures `true` from <ShadowCaster>true</ShadowCaster>', () => {
    expect(find('Inline_Subpart_Caster').shadowCaster).toBe(true);
  });

  it('leaves `shadowCaster` undefined for a template that authors none', () => {
    expect(find('Inline_Subpart_Plain').shadowCaster).toBeUndefined();
  });
});

// Runs against the committed fixtures (src/ksa/__fixtures__/), so it exercises the REAL
// Core data without the private asset tree.
describe('geometry <SubPart><Collider> (gap E — vendored fixtures)', () => {
  const out: CatalogSubPart[] = [];
  const doc = new DOMParser().parseFromString(
    readVendoredAsset('CoreElectricalAAssets.xml'),
    'application/xml',
  );
  parseAssetsFile(doc as unknown as Document, 'CoreElectricalAAssets.xml', out);

  it('reads the solar-cell templates’ own <Box> collider off the geometry <SubPart>', () => {
    const cell = out.find((s) => s.id === 'CoreElectricalA_Subpart_SolarPanelA_CellA')!;
    expect(cell.colliders).toEqual([
      {
        id: 'BoxCollider1',
        shape: 'Box',
        ownerTemplateId: 'CoreElectricalA_Subpart_SolarPanelA_CellA',
        // 2026.7.10.5056 regenerated Core through the in-repo GlbToXmlUtility
        // (rev 5025), which writes 4 significant figures where the old external tool
        // wrote 5–6 — hence 0.7947 rather than 0.79467.
        position: { x: 0, y: 0, z: -0.0089 },
        rotation: { x: 0, y: 0, z: 0 },
        // Box dimensions are FULL extents: the cell's real mesh AABB is
        // 0.800 × 0.600 × 0.025 m. A half-extent reading would make this a 5 cm-thick,
        // 1.6 m panel instead of the 2.5 cm-thick 0.79 × 0.60 m one it is.
        scale: { x: 0.7947, y: 0.596, z: 0.0253 },
        layerId: DEFAULT_LAYER_ID,
      },
    ]);
  });

  it('leaves `colliders` undefined for a template that authors none', () => {
    const battery = out.find((s) => s.id === 'CoreElectricalA_Subpart_RadialBatteryA')!;
    expect(battery.colliders).toBeUndefined();
  });
});

// Catches the failure mode that 2026.8.5.5168 hit: KSA shipped a brand-new Core part
// file (CoreUtilityAAssets.xml, the rev-5161 ladders) and flexo's hand-maintained
// ASSET_FILES silently kept browsing the old set — no test failed, the new parts were
// just absent from the Part/SubPart browsers. Enumerating the live tree makes the NEXT
// such file fail here instead. Skipped without the private tree (open-source CI).
describe.runIf(hasKsaAssets)('ASSET_FILES covers every Core part file in the live KSA tree', () => {
  it('has no un-listed Core*Assets.xml', () => {
    const live = readdirSync(KSA_ASSETS_DIR)
      .filter((f) => /^Core.*Assets\.xml$/.test(f))
      .sort();
    expect(live.length).toBeGreaterThan(0);
    const unlisted = live.filter((f) => !ASSET_FILES.includes(f));
    // A file is legitimately absent from the vessel SubPart catalog only when it
    // declares no <Part>/<SubPart> at all — the static-object catalogs (consumed by
    // apps/icrp's staticCatalog instead). Anything else unlisted is the rev-5161
    // failure mode this guard exists for.
    const wronglyUnlisted = unlisted.filter((f) => {
      const text = readFileSync(ksaAsset(f), 'utf-8');
      return /<(Part|SubPart)[\s>]/.test(text);
    });
    expect(wronglyUnlisted).toEqual([]);
  });
});

// KSA 2026.9.7.5402: Core started authoring geometry <SubPart> TEMPLATES inside a *GameData.xml*
// file (the parachute bay's StandaloneParachuteA/B in CoreUtilityAGameData.xml), referencing the
// sibling Assets file's default atlas + <PbrMaterial> by id. KSA resolves those from one global
// registry; flexo resolves them against the sibling Assets file's tables.
describe('SubPart templates authored in the GameData sibling (KSA 2026.9.7.5402)', () => {
  const xmlDoc = (xml: string) =>
    new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
  const assets = xmlDoc(`<Assets>
    <MeshAtlas Path="Meshes/CoreUtilityA_MeshAtlas.glb" />
    <PbrMaterial Id="CoreUtilityA_Material">
      <Diffuse Path="Textures/CoreUtilityA_Diffuse.ktx2" />
    </PbrMaterial>
    <SubPart Id="CoreUtilityA_Subpart_ParachutePackedA">
      <PartModel Id="CoreUtilityA_Subpart_ParachutePackedA_Model">
        <Mesh Id="CoreUtilityA_Subpart_ParachutePackedA" />
        <Material Id="CoreUtilityA_Material" />
      </PartModel>
    </SubPart>
  </Assets>`);
  const gameData = xmlDoc(`<Assets>
    <SubPart Id="CoreUtilityA_Subpart_StandaloneParachuteA">
      <PartModel Id="CoreUtilityA_Subpart_StandaloneParachuteA_Model">
        <Mesh Id="CoreUtilityA_Subpart_ParachutePackedA" />
        <Material Id="CoreUtilityA_Material" />
      </PartModel>
    </SubPart>
    <SubPartGameData Id="CoreUtilityA_Subpart_StandaloneParachuteA">
      <Parachute Id="DrogueChute" DiameterM="5" />
    </SubPartGameData>
  </Assets>`);

  it('resolves the sibling template against the Assets file’s atlas + materials, under its sourceFile', () => {
    const out: CatalogSubPart[] = [];
    parseAssetsFile(assets, 'CoreUtilityAAssets.xml', out, gameData);
    expect(out.map((s) => s.id)).toEqual([
      'CoreUtilityA_Subpart_ParachutePackedA',
      'CoreUtilityA_Subpart_StandaloneParachuteA',
    ]);
    const [packed, standalone] = out;
    expect(standalone.atlasUrl).toBe(packed.atlasUrl);
    expect(standalone.meshNodeName).toBe('CoreUtilityA_Subpart_ParachutePackedA');
    expect(standalone.diffuseUrl).toBe(packed.diffuseUrl);
    expect(standalone.sourceFile).toBe('CoreUtilityAAssets.xml');
  });

  it('is a no-op without a sibling (the pre-5402 shape)', () => {
    const out: CatalogSubPart[] = [];
    parseAssetsFile(assets, 'CoreUtilityAAssets.xml', out);
    expect(out.map((s) => s.id)).toEqual(['CoreUtilityA_Subpart_ParachutePackedA']);
  });

  it.runIf(hasKsaAssets)(
    'live tree: catalogs the parachute-bay templates from CoreUtilityAGameData.xml',
    () => {
      const read = (name: string) => xmlDoc(readFileSync(ksaAsset(name), 'utf-8'));
      const out: CatalogSubPart[] = [];
      parseAssetsFile(
        read('CoreUtilityAAssets.xml'),
        'CoreUtilityAAssets.xml',
        out,
        read('CoreUtilityAGameData.xml'),
      );
      const ids = out.map((s) => s.id);
      expect(ids).toContain('CoreUtilityA_Subpart_StandaloneParachuteA');
      expect(ids).toContain('CoreUtilityA_Subpart_StandaloneParachuteB');
    },
  );
});
