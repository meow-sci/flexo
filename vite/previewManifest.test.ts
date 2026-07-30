import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { buildPreviewManifest } from './previewManifest'
import { ASSET_FILES } from '../src/ksa/catalog'
import { parsePartsFile, type CatalogPart } from '../src/ksa/partCatalog'
import { ENVIRONMENT_PRESETS } from '../src/state/environmentPresets'
import { hasKsaAssets, KSA_ASSETS_DIR } from '../src/ksa/ksaTestAssets'

describe.runIf(hasKsaAssets)('buildPreviewManifest against the real KSA asset tree', () => {
  const manifest = hasKsaAssets
    ? buildPreviewManifest(KSA_ASSETS_DIR)
    : { part_ids: [], skybox_ids: [], ksa_build: null }

  it('collects a plausible number of parts, sorted and deduplicated', () => {
    expect(manifest.part_ids.length).toBeGreaterThan(100)
    expect(new Set(manifest.part_ids).size).toBe(manifest.part_ids.length)
    expect(manifest.part_ids).toEqual([...manifest.part_ids].sort((a, b) => a.localeCompare(b)))
    for (const id of manifest.part_ids) expect(id).toBeTypeOf('string')
    for (const id of manifest.part_ids) expect(id.length).toBeGreaterThan(0)
  })

  it('contains known Core prefab ids', () => {
    expect(manifest.part_ids).toContain('CoreStructuralA_Prefab_EnginePlateLowProfile2WA')
    expect(manifest.part_ids).toContain('CoreStructuralA_Prefab_RadialDecouplerLargeA')
    expect(manifest.part_ids).toContain('CoreCommandA_Prefab_MediumCapsuleVariantA')
  })

  it('lists every environment preset id, including the procedural studio', () => {
    expect(manifest.skybox_ids).toEqual(ENVIRONMENT_PRESETS.map((p) => p.id))
    expect(manifest.skybox_ids).toHaveLength(9)
    expect(manifest.skybox_ids).toContain('room')
  })

  it('records the KSA build the assets came from', () => {
    expect(manifest.ksa_build).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
  })

  // The anti-drift guard: the manifest is built through @xmldom/xmldom from Node, while
  // the app parses the same files with the BROWSER DOMParser. If the two parsers ever
  // disagreed about `<Part Id>` / renderable placements, the manifest would advertise
  // parts the viewer rejects (or hide ones it accepts). vitest runs under happy-dom, so
  // this is a genuinely independent, non-xmldom parse of the same bytes.
  it('matches what the browser DOMParser produces for the same files', () => {
    const parts: CatalogPart[] = []
    for (const file of ASSET_FILES) {
      const abs = join(KSA_ASSETS_DIR, file)
      if (!existsSync(abs)) continue
      const xml = readFileSync(abs, 'utf-8')
        .replace(/^﻿/, '')
        // happy-dom's XML parser rejects a SINGLE-quoted XML declaration ("Malformed
        // declaration expecting version") — KSA writes `<?xml version='1.0'?>`, which is
        // valid XML that every real browser accepts. Normalising the declaration is purely
        // a happy-dom workaround; it touches nothing the parser under test reads.
        .replace(/^<\?xml[^?]*\?>/, '<?xml version="1.0" encoding="UTF-8"?>')
      parsePartsFile(new DOMParser().parseFromString(xml, 'application/xml'), file, parts)
    }
    const ids = [...new Set(parts.map((p) => p.id))].sort((a, b) => a.localeCompare(b))
    expect(manifest.part_ids).toEqual(ids)
  })
})
