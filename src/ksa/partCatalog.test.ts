import { readdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { mergeGameData, parseGameDataFile, parsePartsFile, type CatalogPart } from './partCatalog'
import {
  hasKsaAssets,
  ksaAsset,
  readVendoredAsset,
  VENDORED_ASSETS_DIR,
  vendoredAsset,
} from './ksaTestAssets'

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document
}

/** An empty parsed-GameData accumulator (part-keyed + subpart-template-keyed maps). */
function emptyGameData() {
  return { parts: new Map(), subParts: new Map() }
}

// Mirrors the real KSA Core split: <Part> geometry in the Assets file (no flags),
// connector <Flags> + <EditorTag> in the sibling GameData file.
const ASSETS_XML = `<Assets>
  <Part Id="CoreElectricalA_Prefab_SolarPanelB">
    <SubPart Id="cell_1" InstanceOf="CoreElectricalA_Subpart_SolarPanelB_CellA" />
    <Connector Id="_connector6">
      <Transform><Position X="-0.04988" /></Transform>
    </Connector>
  </Part>
</Assets>`

const GAMEDATA_XML = `<Assets>
  <PartGameData Id="CoreElectricalA_Prefab_SolarPanelB">
    <EditorTag Value="Electrical" />
    <KeyframeAnimationModule Id="SolarPanelAnimation" />
    <Connector Id="_connector6">
      <Flags>ToSurface</Flags>
    </Connector>
  </PartGameData>
</Assets>`

describe('parseGameDataFile + mergeGameData', () => {
  it('merges ToSurface connector flag and EditorTag from GameData into the Part', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS_XML), 'CoreElectricalAAssets.xml', parts)

    // From the Assets <Part> alone there are no flags and no editor tags.
    expect(parts).toHaveLength(1)
    expect(parts[0].connectors[0].flags).toEqual([])
    expect(parts[0].editorTags).toEqual([])

    const gameData = emptyGameData()
    parseGameDataFile(parse(GAMEDATA_XML), gameData)
    mergeGameData(parts, gameData)

    expect(parts[0].connectors[0].flags).toEqual(['ToSurface'])
    expect(parts[0].editorTags).toEqual(['Electrical'])
  })

  it('parses the docking port from GameData and merges it onto the Part (original connector id space)', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS_XML), 'CoreCouplingAAssets.xml', parts)
    expect(parts[0].dockingPort).toBeNull() // not present on the geometry <Part>

    const gameData = emptyGameData()
    parseGameDataFile(
      parse(`<Assets><PartGameData Id="CoreElectricalA_Prefab_SolarPanelB">
        <DockingPort>
          <ConnectorId Value="_connector6" />
          <LatchingKineticEnergy J="50" />
          <PushoffImpulse Ns="7000" />
        </DockingPort>
      </PartGameData></Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)

    expect(parts[0].dockingPort).toEqual({
      connectorId: '_connector6',
      latchingKineticEnergyJ: 50,
      pushoffImpulseNs: 7000,
    })
  })

  it('merges <Diameter> (size class) and <Control/> from GameData onto the Part', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS_XML), 'CoreCommandAAssets.xml', parts)
    // Neither lives on the geometry <Part>; both default until the GameData merge.
    expect(parts[0].diameterM).toBeNull()
    expect(parts[0].controllable).toBe(false)

    const gameData = emptyGameData()
    parseGameDataFile(
      parse(`<Assets><PartGameData Id="CoreElectricalA_Prefab_SolarPanelB">
        <Diameter M="1" />
        <Control />
      </PartGameData></Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)

    expect(parts[0].diameterM).toBe(1)
    expect(parts[0].controllable).toBe(true)
  })

  it('merges unmodeled <PartGameData> children (e.g. <Collider>) onto the Part verbatim', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS_XML), 'CoreFuelTankAAssets.xml', parts)
    expect(parts[0].unknownChildren).toEqual([]) // nothing on the geometry <Part>

    const gameData = emptyGameData()
    parseGameDataFile(
      parse(`<Assets><PartGameData Id="CoreElectricalA_Prefab_SolarPanelB">
        <Collider Id="Collider1"><Cylinder Id="Cyl1"><Radius M="0.5" /></Cylinder></Collider>
      </PartGameData></Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)

    expect(parts[0].unknownChildren.map((n) => n.tag)).toEqual(['Collider'])
    expect(parts[0].unknownChildren[0].children[0].children[0]).toEqual({
      tag: 'Radius',
      attrs: { M: '0.5' },
      children: [],
    })
  })

  it('carries part-level battery (J→Wh) and the SubPart solar panel onto the Part', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS_XML), 'CoreElectricalAAssets.xml', parts)
    expect(parts[0].batteries).toEqual([]) // not on the geometry <Part>

    const gameData = emptyGameData()
    parseGameDataFile(
      parse(`<Assets>
        <PartGameData Id="CoreElectricalA_Prefab_SolarPanelB">
          <Battery HasStatusLight="true"><MaximumCapacity J="500" /></Battery>
        </PartGameData>
        <SubPartGameData Id="CoreElectricalA_Subpart_SolarPanelB_CellA">
          <SolarPanel><Produced W="50" /><Transform><Rotation Y="1.5708" /></Transform></SolarPanel>
        </SubPartGameData>
        <SubPartGameData Id="SomeOtherTemplate">
          <SolarPanel><Produced W="999" /></SolarPanel>
        </SubPartGameData>
      </Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)

    // Battery imported with J→Wh conversion (500 J = 0.1389 Wh).
    expect(parts[0].batteries[0].capacityWh).toBeCloseTo(500 / 3600, 6)
    // Only the SubPart this Part actually places is carried (not SomeOtherTemplate).
    expect(parts[0].subPartGameData.map((s) => s.subPartTemplateId)).toEqual([
      'CoreElectricalA_Subpart_SolarPanelB_CellA',
    ])
    expect(parts[0].subPartGameData[0].solarPanels[0].outputWatts).toBe(50)
    expect(parts[0].subPartGameData[0].solarPanels[0].transform.rotation.y).toBeCloseTo(1.5708, 4)
  })

  it('merges a part-level controller + gimbal and the SubPart thrust chamber onto an engine part', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(
      parse(`<Assets><Part Id="Eng">
        <SubPart Id="chamber_1" InstanceOf="ThrustChamberMesh" />
      </Part></Assets>`),
      'CorePropulsionAAssets.xml',
      parts,
    )
    const gameData = emptyGameData()
    parseGameDataFile(
      parse(`<Assets>
        <PartGameData Id="Eng">
          <EditorTag Value="Engines" />
          <RocketEngineController Id="MyEngine">
            <RocketReference Id="Engine" SubPartId="chamber_1" />
          </RocketEngineController>
          <SubPart Id="chamber_1"><Gimbal><MaxAngleY Degrees="5" /></Gimbal></SubPart>
        </PartGameData>
        <SubPartGameData Id="ThrustChamberMesh">
          <Rocket Id="Engine"><Core Id="ThrustChamber" /><Nozzle Id="Nozzle" /></Rocket>
          <Combustor Id="ThrustChamber"><Combustion Id="Hydrolox_5.5" /><MaxPressure Bar="49" /></Combustor>
          <DeLavalNozzle Id="Nozzle"><AreaRatio Value="49" /><ExitDiameter M="2.5" /></DeLavalNozzle>
        </SubPartGameData>
      </Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)

    expect(parts[0].rocketControllers[0].id).toBe('MyEngine')
    expect(parts[0].rocketControllers[0].rocketRefs[0].subPartInstanceId).toBe('chamber_1')
    expect(parts[0].gimbals[0].maxAngleYDeg).toBe(5)
    const spd = parts[0].subPartGameData.find((s) => s.subPartTemplateId === 'ThrustChamberMesh')!
    expect(spd.combustors[0].combustionId).toBe('Hydrolox_5.5')
    expect(spd.nozzles[0].areaRatio).toBe(49)
    expect(spd.rockets[0].core.id).toBe('ThrustChamber')
  })

  it.runIf(hasKsaAssets)(
    'imports the real LR91 Vac engine (controller + gimbals + thrust chamber)',
    () => {
      const parts: CatalogPart[] = []
      parsePartsFile(
        parse(readFileSync(ksaAsset('CorePropulsionAAssets.xml'), 'utf-8')),
        'CorePropulsionAAssets.xml',
        parts,
      )
      const gameData = emptyGameData()
      parseGameDataFile(
        parse(readFileSync(ksaAsset('CorePropulsionAGameData.xml'), 'utf-8')),
        gameData,
      )
      mergeGameData(parts, gameData)

      const lr91 = parts.find((p) => p.id === 'CorePropulsionA_Prefab_EngineA3')!
      expect(lr91).toBeTruthy()
      expect(lr91.editorTags).toContain('Engines')
      // The engine controller drives the main Engine rocket + the gas-generator.
      expect(lr91.rocketControllers[0].id).toBe('LR91-AJ-3')
      expect(lr91.rocketControllers[0].rocketRefs.map((r) => r.id)).toEqual([
        'Engine',
        'GasGenerator',
      ])
      // The gas-generator is a part-level rocket + combustor.
      expect(lr91.rockets.find((r) => r.id === 'GasGenerator')).toBeTruthy()
      expect(lr91.combustors.find((c) => c.id === 'GasGeneratorChamber')).toBeTruthy()
      // Two gimbals (main chamber ±2°, turbine exhaust 70° Y).
      expect(lr91.gimbals.length).toBeGreaterThanOrEqual(2)
      // The reusable thrust chamber's modules ride along via the placed SubPart's data.
      const chamber = lr91.subPartGameData.find(
        (s) => s.subPartTemplateId === 'CorePropulsionA_Subpart_EngineALargeVacAssembly',
      )!
      expect(chamber.combustors[0].combustionId).toBe('Hydrolox_5.5')
      expect(chamber.nozzles[0].volumetricExhaustId).toBe('EngineALarge')
    },
  )

  it('merges a duplicate-Id SubPartGameData so the fuel-tank <Tank> survives a later tank-less entry', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(
      parse(`<Assets><Part Id="CoreFuelTankA_Prefab_LF1WHalfHA">
        <SubPart Id="skin" InstanceOf="CoreFuelTankA_Subpart_Skin1WHalfHA" />
      </Part></Assets>`),
      'CoreFuelTankAAssets.xml',
      parts,
    )

    // KSA authors this skin's game-data as TWO same-Id <SubPartGameData> entries: the
    // first carries the <Tank>; a later "quad" variant carries only an unmodeled child.
    // KSA registers-then-merges by Id, so a naive last-wins would drop the tank.
    const gameData = emptyGameData()
    parseGameDataFile(
      parse(`<Assets>
        <SubPartGameData Id="CoreFuelTankA_Subpart_Skin1WHalfHA" DisplayName="Fuel Tank 1m x .5m A">
          <Tank><CylindricalTank>
            <Material Id="Aluminum.2014(s)" /><Length M=".5" /><OuterRadius M="1" /><WallThickness Mm="2" />
          </CylindricalTank></Tank>
        </SubPartGameData>
        <SubPartGameData Id="CoreFuelTankA_Subpart_Skin1WHalfHA" DisplayName="Quad Fuel Tank 1m x .5m A">
          <SubstanceStorageVolume M3="0.30" />
        </SubPartGameData>
      </Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)

    const skin = parts[0].subPartGameData.find(
      (s) => s.subPartTemplateId === 'CoreFuelTankA_Subpart_Skin1WHalfHA',
    )!
    expect(skin).toBeTruthy()
    expect(skin.tanks).toHaveLength(1)
    expect(skin.tanks[0]).toEqual({
      shape: 'Cylindrical',
      wallMaterialId: 'Aluminum.2014(s)',
      lengthM: 0.5,
      outerRadiusM: 1,
      wallThicknessMm: 2,
      combustionProcessId: null,
    })
    // The later entry's unmodeled child is still carried (round-trip), alongside the tank.
    expect(skin.unknownChildren.map((n) => n.tag)).toEqual(['SubstanceStorageVolume'])
  })

  // Runs against the committed fixtures (src/ksa/__fixtures__/), so it exercises the REAL
  // Core data without the private asset tree. CoreFuelTankAAssets.xml holds the geometry;
  // the tank <SubPartGameData> lives in the shared PartGameData.xml.
  it('imports the real CoreFuelTankA_Prefab_LF1WHalfHA SubPart <Tank> (vendored fixtures)', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(
      parse(readVendoredAsset('CoreFuelTankAAssets.xml')),
      'CoreFuelTankAAssets.xml',
      parts,
    )
    const gameData = emptyGameData()
    parseGameDataFile(parse(readVendoredAsset('PartGameData.xml')), gameData)
    mergeGameData(parts, gameData)

    const part = parts.find((p) => p.id === 'CoreFuelTankA_Prefab_LF1WHalfHA')!
    expect(part).toBeTruthy()
    const skin = part.subPartGameData.find(
      (s) => s.subPartTemplateId === 'CoreFuelTankA_Subpart_Skin1WHalfHA',
    )!
    expect(skin).toBeTruthy()
    // Skin1WHalfHA is declared twice in PartGameData.xml (a normal + a "quad" variant);
    // the tank must survive the merge.
    expect(skin.tanks).toHaveLength(1)
    expect(skin.tanks[0].shape).toBe('Cylindrical')
    expect(skin.tanks[0].wallMaterialId).toBe('Aluminum.2014(s)')
    expect(skin.tanks[0].lengthM).toBe(0.5)
    expect(skin.tanks[0].outerRadiusM).toBe(1)
    expect(skin.tanks[0].wallThicknessMm).toBe(2)
  })

  // The electrical solar panel exercises the OTHER real-data path: the SubPart's
  // <SolarPanel> data lives in the same GameData file as its <PartGameData> (unlike the
  // fuel tank, whose tank data is off in the shared PartGameData.xml).
  it('imports the real CoreElectricalA_Prefab_SolarPanelB tags/flags + SubPart solar panel (vendored fixtures)', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(
      parse(readVendoredAsset('CoreElectricalAAssets.xml')),
      'CoreElectricalAAssets.xml',
      parts,
    )
    const gameData = emptyGameData()
    parseGameDataFile(parse(readVendoredAsset('CoreElectricalAGameData.xml')), gameData)
    mergeGameData(parts, gameData)

    const panel = parts.find((p) => p.id === 'CoreElectricalA_Prefab_SolarPanelB')!
    expect(panel).toBeTruthy()
    // Editor tag + the ToSurface connector flag come from <PartGameData>, not the geometry.
    expect(panel.editorTags).toContain('Electrical')
    expect(panel.connectors.find((c) => c.id === '_connector6')?.flags).toEqual(['ToSurface'])
    // The solar cell's per-template data (50 W, rotated Y=\u03C0/2) is attached to the placed SubPart.
    const cell = panel.subPartGameData.find(
      (s) => s.subPartTemplateId === 'CoreElectricalA_Subpart_SolarPanelB_CellA',
    )!
    expect(cell).toBeTruthy()
    expect(cell.solarPanels).toHaveLength(1)
    // KSA 2026.7 (build 4826) bumped this cell's <Produced W> from 50 → 100.
    expect(cell.solarPanels[0].outputWatts).toBe(100)
    expect(cell.solarPanels[0].transform.rotation.y).toBeCloseTo(1.5708, 4)
  })

  // Light coverage from real data: the small spotlight Part places SpotlightA, whose
  // <SubPartGameData> carries a spot <Light> (type/transform/range/intensity/color/cone).
  it('imports the real CoreElectricalA_Prefab_LightSmallA SubPart <Light> (vendored fixtures)', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(
      parse(readVendoredAsset('CoreElectricalAAssets.xml')),
      'CoreElectricalAAssets.xml',
      parts,
    )
    const gameData = emptyGameData()
    parseGameDataFile(parse(readVendoredAsset('CoreElectricalAGameData.xml')), gameData)
    mergeGameData(parts, gameData)

    const light = parts.find((p) => p.id === 'CoreElectricalA_Prefab_LightSmallA')!
    expect(light).toBeTruthy()
    const spotlight = light.subPartGameData.find(
      (s) => s.subPartTemplateId === 'CoreElectricalA_Subpart_SpotlightA',
    )!
    expect(spotlight).toBeTruthy()
    expect(spotlight.lights).toHaveLength(1)
    const l = spotlight.lights[0]
    expect(l.type).toBe('Spot')
    expect(l.rangeM).toBe(5)
    expect(l.intensity).toBe(10)
    expect(l.color).toEqual({ r: 1, g: 1, b: 1 })
    expect(l.innerAngleRad).toBeCloseTo(0.392599, 6)
    expect(l.outerAngleRad).toBeCloseTo(0.785398, 6)
    expect(l.transform.position).toEqual({ x: 0.38, y: 0.21, z: 0 })
    expect(l.rayTracing).toBe(false) // no <RayTracing> child → KSA default
  })

  it('ignores unknown / None flags and connectors with no geometry counterpart', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS_XML), 'f.xml', parts)
    const gameData = emptyGameData()
    parseGameDataFile(
      parse(`<Assets><PartGameData Id="CoreElectricalA_Prefab_SolarPanelB">
        <Connector Id="_connector6"><Flags>Bogus</Flags></Connector>
        <Connector Id="_connectorX"><Flags>Internal</Flags></Connector>
      </PartGameData></Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)
    // Bogus flag ignored -> stays empty; _connectorX has no geometry connector -> skipped.
    expect(parts[0].connectors.map((c) => c.id)).toEqual(['_connector6'])
    expect(parts[0].connectors[0].flags).toEqual([])
  })
})

// Guards the tests above: the vendored fixtures are hand-copied and CAN silently drift
// from the live KSA assets. When the private tree is present (locally / private CI) this
// fails the moment any fixture diverges — re-sync with `bun scripts/sync-test-fixtures.ts`
// and update the parser/catalog code + tests to match. Skipped when the private tree is
// absent (open-source CI), where the vendored copies are all we have to test against.
describe.runIf(hasKsaAssets)('vendored fixtures stay byte-identical to the live KSA assets', () => {
  const fixtures = readdirSync(VENDORED_ASSETS_DIR).filter((f) => f.endsWith('.xml'))

  it('has at least one vendored fixture to check', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  it.each(fixtures)('%s matches $KSA_ASSETS_DIR', (name) => {
    expect(readFileSync(vendoredAsset(name), 'utf-8')).toBe(readFileSync(ksaAsset(name), 'utf-8'))
  })
})
