import { readdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { mergeGameData, parseGameDataFile, parsePartsFile, type CatalogPart } from './partCatalog'
import { COLLIDER_LAYER_ID, createTank, IVA_SEAT_LAYER_ID, LIGHT_LAYER_ID } from './types'
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
  return {
    parts: new Map(),
    subParts: new Map(),
    subPartColliders: new Map(),
    subPartLights: new Map(),
  }
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

  it('merges <CustomMass> (Kg + preserved inertia children) from GameData onto the Part', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS_XML), 'CoreCommandAAssets.xml', parts)
    expect(parts[0].customMass).toBeNull() // not present on the geometry <Part>

    const gameData = emptyGameData()
    parseGameDataFile(
      parse(`<Assets><PartGameData Id="CoreElectricalA_Prefab_SolarPanelB">
        <CustomMass>
          <Mass Kg="1800" />
          <MassSpecificInertia Ixx="0.325" Iyy="0.668" Izz="0.668" />
        </CustomMass>
      </PartGameData></Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)

    expect(parts[0].customMass).toBe(1800)
    expect(parts[0].customMassExtras).toEqual([
      {
        tag: 'MassSpecificInertia',
        attrs: { Ixx: '0.325', Iyy: '0.668', Izz: '0.668' },
        children: [],
      },
    ])
  })

  it('merges unmodeled <PartGameData> children onto the Part verbatim', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS_XML), 'CoreFuelTankAAssets.xml', parts)
    expect(parts[0].unknownChildren).toEqual([]) // nothing on the geometry <Part>

    const gameData = emptyGameData()
    parseGameDataFile(
      parse(`<Assets><PartGameData Id="CoreElectricalA_Prefab_SolarPanelB">
        <SubstanceStorageVolume Id="Vol1" />
      </PartGameData></Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)

    expect(parts[0].unknownChildren.map((n) => n.tag)).toEqual(['SubstanceStorageVolume'])
    expect(parts[0].unknownChildren[0].attrs).toEqual({ Id: 'Vol1' })
  })

  it('merges a <PartGameData><Collider> onto the Part as a typed part-level collider', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS_XML), 'CoreFuelTankAAssets.xml', parts)
    expect(parts[0].colliders).toEqual([]) // nothing on the geometry <Part>

    const gameData = emptyGameData()
    parseGameDataFile(
      parse(`<Assets><PartGameData Id="CoreElectricalA_Prefab_SolarPanelB">
        <Collider Id="Collider1"><Cylinder Id="Cyl1"><Radius M="0.5" /><LengthY M="2" /></Cylinder></Collider>
      </PartGameData></Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)

    expect(parts[0].colliders).toEqual([
      {
        id: 'Cyl1',
        shape: 'Cylinder',
        ownerTemplateId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 2, z: 1 },
        layerId: COLLIDER_LAYER_ID,
      },
    ])
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
          <Combustor Id="ThrustChamber"><Reaction Id="Hydrolox"><MixtureRatio>5.5</MixtureRatio></Reaction><MaxPressure Bar="49" /></Combustor>
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
    expect(spd.combustors[0].reactionId).toBe('Hydrolox')
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
      expect(chamber.combustors[0].reactionId).toBe('Hydrolox')
      expect(chamber.combustors[0].mixtureRatio).toBe(5.5)
      // 2026.7.10.5056 (rev 5022) moved the exhaust FX inside a repeatable
      // `<ReactionPlume>`; a liquid chamber carries exactly one unkeyed Default entry.
      expect(chamber.nozzles[0].reactionPlumes).toEqual([
        {
          reactionId: null,
          isDefault: true,
          volumetricExhaustId: 'EngineALarge',
          plumeTrailId: null,
        },
      ])
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
      ...createTank(),
      shape: 'Cylindrical',
      wallMaterialId: 'Aluminum.2014(s)',
      lengthM: 0.5,
      outerRadiusM: 1,
      wallThicknessMm: 2,
      roleAffinity: 'Engine',
    })
    // The later entry's unmodeled child is still carried (round-trip), alongside the tank.
    expect(skin.unknownChildren.map((n) => n.tag)).toEqual(['SubstanceStorageVolume'])
  })

  // Runs against the committed fixtures (src/ksa/__fixtures__/), so it exercises the REAL
  // Core data without the private asset tree. Since KSA 2026.7.6 Core authors its fuel-tank
  // data as Part-LEVEL <Tank> entries in CoreFuelTankAGameData.xml (no SubPartGameData);
  // 2026.7.9 made those tanks addressable feed containers, so flexo now MODELS them — and
  // since the collider work its <Collider> is modeled too, leaving NO passthrough at all.
  it('imports the real CoreFuelTankA_Prefab_LF1WHalfHA part-level <Tank> + <Collider> (vendored fixtures)', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(
      parse(readVendoredAsset('CoreFuelTankAAssets.xml')),
      'CoreFuelTankAAssets.xml',
      parts,
    )
    const gameData = emptyGameData()
    parseGameDataFile(parse(readVendoredAsset('CoreFuelTankAGameData.xml')), gameData)
    mergeGameData(parts, gameData)

    const part = parts.find((p) => p.id === 'CoreFuelTankA_Prefab_LF1WHalfHA')!
    expect(part).toBeTruthy()
    expect(part.editorTags).toContain('Fuel Tanks')
    expect(part.diameterM).toBe(1)
    // Nothing is passthrough any more — both the <Tank> and the <Collider> are modeled.
    expect(part.unknownChildren.map((n) => n.tag)).toEqual([])
    expect(part.colliders.map((c) => c.shape)).toEqual(['Cylinder'])
    expect(part.colliders.every((c) => c.ownerTemplateId === null)).toBe(true)
    expect(part.tanks).toEqual([
      {
        ...createTank(),
        id: '', // this prefab's tank is unnamed, so no engine can address it
        shape: 'Cylindrical',
        wallMaterialId: 'Aluminum.2014(s)',
        lengthM: 0.5,
        outerRadiusM: 1,
        wallThicknessMm: 4,
      },
    ])
    // The relocated SubPart entries are gone: no typed SubPart tank data anymore.
    expect(part.subPartGameData.every((s) => s.tanks.length === 0)).toBe(true)
    // Core 5018 declares BulkFluid on both of this prefab's connectors — without it no
    // main-engine propellant can cross, so it must survive the merge.
    expect(part.connectors.map((c) => c.capabilities)).toEqual([['BulkFluid'], ['BulkFluid']])
  })

  // The electrical solar panel exercises the typed SubPart-module path: the SubPart's
  // <SolarPanel> data lives in the same GameData file as its <PartGameData>.
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
  // Lights are first-class part entities now, so the light lands on CatalogPart.lights
  // tagged with its owning template id — NOT inside the subPartGameData entry.
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
    expect(light.lights).toHaveLength(1)
    const l = light.lights[0]
    expect(l.id).toBe('_light1')
    expect(l.ownerTemplateId).toBe('CoreElectricalA_Subpart_SpotlightA')
    expect(l.layerId).toBe(LIGHT_LAYER_ID)
    expect(l.type).toBe('Spot')
    expect(l.rangeM).toBe(5)
    expect(l.intensity).toBe(10)
    expect(l.color).toEqual({ r: 1, g: 1, b: 1 })
    expect(l.innerAngleRad).toBeCloseTo(0.392599, 6)
    expect(l.outerAngleRad).toBeCloseTo(0.785398, 6)
    expect(l.position).toEqual({ x: 0.38, y: 0.21, z: 0 })
    expect(l.scale).toEqual({ x: 1, y: 1, z: 1 }) // pinned — KSA ignores light scale
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

// Gap E (was: flexo dropped every collider authored on a geometry template). Runs against
// the committed fixtures so it exercises the REAL Core data without the private tree.
describe('geometry <Part><Collider> (gap E — vendored fixtures)', () => {
  it('imports CoreElectricalA_Prefab_BayFuelcellSmall’s geometry collider', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(
      parse(readVendoredAsset('CoreElectricalAAssets.xml')),
      'CoreElectricalAAssets.xml',
      parts,
    )
    const part = parts.find((p) => p.id === 'CoreElectricalA_Prefab_BayFuelcellSmall')!
    expect(part).toBeTruthy()
    expect(part.colliders).toEqual([
      {
        id: 'CylinderCollider1',
        shape: 'Cylinder',
        ownerTemplateId: null,
        // 4-significant-figure values: 2026.7.10.5056 regenerated Core through the
        // in-repo GlbToXmlUtility (rev 5025), which rounds harder than the old tool.
        position: { x: 0.0064, y: 0, z: -0.1695 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.387, y: 0.6, z: 0.387 }, // (2R, LengthY, 2R)
        layerId: COLLIDER_LAYER_ID,
      },
    ])
  })

  it('APPENDS the <PartGameData> collider to the geometry one (KSA merges Components additively)', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(
      parse(readVendoredAsset('CoreElectricalAAssets.xml')),
      'CoreElectricalAAssets.xml',
      parts,
    )
    const gameData = emptyGameData()
    parseGameDataFile(parse(readVendoredAsset('CoreElectricalAGameData.xml')), gameData)
    mergeGameData(parts, gameData)

    const light = parts.find((p) => p.id === 'CoreElectricalA_Prefab_LightSmallB')!
    expect(light.colliders.map((c) => c.shape)).toEqual(['Box'])
    expect(light.unknownChildren.map((n) => n.tag)).toEqual([])
  })
})

// `<IVASeat>` is schema-legal on the geometry `<Part>` AND on `<PartGameData>`, and KSA merges
// `Components` additively with no dedupe — so both land on the catalog part, geometry first.
// SubPart-level seats are deliberately not gathered (plans/IVA_PLAN.md §6).
describe('IVA seats merge both Part-level authoring sites', () => {
  const ASSETS = `<Assets>
    <Part Id="P">
      <SubPart Id="s_1" InstanceOf="Tmpl" />
      <IVASeat><Position X="1" /><ForwardAxis X="1" /><UpAxis Z="-1" /></IVASeat>
    </Part>
  </Assets>`
  const GAMEDATA = `<Assets>
    <PartGameData Id="P">
      <IVASeat><Position X="2" /><ForwardAxis X="1" /><UpAxis Z="-1" /></IVASeat>
    </PartGameData>
  </Assets>`

  it('appends the GameData seats to the geometry ones and re-numbers _seatN in document order', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS), 'A.xml', parts)
    expect(parts[0].ivaSeats.map((s) => [s.id, s.position.x])).toEqual([['_seat1', 1]])

    const gameData = emptyGameData()
    parseGameDataFile(parse(GAMEDATA), gameData)
    mergeGameData(parts, gameData)

    expect(parts[0].ivaSeats.map((s) => [s.id, s.position.x, s.layerId])).toEqual([
      ['_seat1', 1, IVA_SEAT_LAYER_ID],
      ['_seat2', 2, IVA_SEAT_LAYER_ID],
    ])
  })
})
