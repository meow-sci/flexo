import { describe, it, expect } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { mergeGameData, parseGameDataFile, parsePartsFile, type CatalogPart } from './partCatalog'

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
        <DockingPort ConnectorId="_connector6" LatchingImpulse="6000" PushoffForce="7000" />
      </PartGameData></Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)

    expect(parts[0].dockingPort).toEqual({
      connectorId: '_connector6',
      latchingImpulse: 6000,
      pushoffForce: 7000,
    })
  })

  it('carries part-level battery (Joules→Wh) and the SubPart solar panel onto the Part', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS_XML), 'CoreElectricalAAssets.xml', parts)
    expect(parts[0].batteries).toEqual([]) // not on the geometry <Part>

    const gameData = emptyGameData()
    parseGameDataFile(
      parse(`<Assets>
        <PartGameData Id="CoreElectricalA_Prefab_SolarPanelB">
          <Battery HasStatusLight="true"><MaximumCapacity Joules="500" /></Battery>
        </PartGameData>
        <SubPartGameData Id="CoreElectricalA_Subpart_SolarPanelB_CellA">
          <SolarPanel><Produced Watts="50" /><Transform><Rotation Y="1.5708" /></Transform></SolarPanel>
        </SubPartGameData>
        <SubPartGameData Id="SomeOtherTemplate">
          <SolarPanel><Produced Watts="999" /></SolarPanel>
        </SubPartGameData>
      </Assets>`),
      gameData,
    )
    mergeGameData(parts, gameData)

    // Battery imported with Joules→Wh conversion (500 J = 0.1389 Wh).
    expect(parts[0].batteries[0].capacityWh).toBeCloseTo(500 / 3600, 6)
    // Only the SubPart this Part actually places is carried (not SomeOtherTemplate).
    expect(parts[0].subPartGameData.map((s) => s.subPartTemplateId)).toEqual([
      'CoreElectricalA_Subpart_SolarPanelB_CellA',
    ])
    expect(parts[0].subPartGameData[0].solarPanels[0].outputWatts).toBe(50)
    expect(parts[0].subPartGameData[0].solarPanels[0].transform.rotation.y).toBeCloseTo(1.5708, 4)
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
