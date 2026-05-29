import { describe, it, expect } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import {
  mergeGameData,
  parseGameDataFile,
  parsePartsFile,
  type CatalogPart,
  type PartGameData,
} from './partCatalog'

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document
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

    const gameData = new Map<string, PartGameData>()
    parseGameDataFile(parse(GAMEDATA_XML), gameData)
    mergeGameData(parts, gameData)

    expect(parts[0].connectors[0].flags).toEqual(['ToSurface'])
    expect(parts[0].editorTags).toEqual(['Electrical'])
  })

  it('ignores unknown / None flags and connectors with no geometry counterpart', () => {
    const parts: CatalogPart[] = []
    parsePartsFile(parse(ASSETS_XML), 'f.xml', parts)
    const gameData = new Map<string, PartGameData>()
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
