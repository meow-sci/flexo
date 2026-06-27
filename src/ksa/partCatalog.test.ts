import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { mergeGameData, parseGameDataFile, parsePartsFile, type CatalogPart } from './partCatalog'
import { hasKsaAssets, ksaAsset } from './ksaTestAssets'

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
