import { describe, expect, it } from 'vitest'
import { createEmptyPart, createPartAnimation, identityTransform } from './types'
import type { EditingPart, PartAnimation } from './types'
import {
  buildCustomBundle,
  buildModContent,
  buildModZip,
  sanitizeBaseName,
  serializeModToml,
  uniqueFileName,
} from './modExport'
import { serializeGameData } from './partXmlSerializer'
import { animGlbPath } from './animationNaming'

describe('sanitizeBaseName', () => {
  it('strips spaces and punctuation', () => {
    expect(sanitizeBaseName('My Part')).toBe('MyPart')
    expect(sanitizeBaseName('Project 1')).toBe('Project1')
    expect(sanitizeBaseName('a-b_c.d')).toBe('abcd')
  })
  it('falls back to "Mod" when empty', () => {
    expect(sanitizeBaseName('   ')).toBe('Mod')
    expect(sanitizeBaseName('???')).toBe('Mod')
  })
})

describe('serializeModToml', () => {
  it('matches the KSA mod.toml format', () => {
    expect(serializeModToml(['Project1Part.xml', 'Project1GameData.xml'])).toBe(
      'name = "flexo-parts"\nassets = [ "Project1Part.xml", "Project1GameData.xml"]\n',
    )
  })
  it('handles an empty asset list', () => {
    expect(serializeModToml([])).toBe('name = "flexo-parts"\nassets = []\n')
  })
})

describe('uniqueFileName', () => {
  it('returns the plain name when free', () => {
    expect(uniqueFileName(new Set(), 'FooPart', 'xml')).toBe('FooPart.xml')
  })
  it('suffixes on collision (case-insensitive)', () => {
    const taken = new Set(['foopart.xml', 'foopart-2.xml'])
    expect(uniqueFileName(taken, 'FooPart', 'xml')).toBe('FooPart-3.xml')
  })
})

describe('buildModContent', () => {
  it('derives Part/GameData filenames from the project name', () => {
    const c = buildModContent(createEmptyPart(), 'My Part')
    expect(c.partFile).toBe('MyPartPart.xml')
    expect(c.gameDataFile).toBe('MyPartGameData.xml')
    expect(c.partXml).toContain('<Part')
    expect(c.gameDataXml).toContain('<PartGameData')
  })
})

function partWithDoorAnimation(): EditingPart {
  const part = createEmptyPart()
  part.partId = 'MyPart'
  part.placements.push({
    instanceId: 'panel_1',
    subPartTemplateId: 'CoreStructuralA_Subpart_X',
    position: { x: 1, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: 'default',
  })
  const anim: PartAnimation = {
    id: 'anim_door',
    name: 'Door',
    durationSec: 1,
    mode: 'deployRetract',
    joints: [{ id: 'j', name: 'Hinge', parentJointId: null, memberInstanceIds: ['panel_1'] }],
    keyframes: [
      { id: 'k0', timeSec: 0, poses: { j: identityTransform() } },
      { id: 'k1', timeSec: 1, poses: { j: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, scale: { x: 1, y: 1, z: 1 } } } },
    ],
    solarTracking: null,
  }
  part.animations.push(anim)
  return part
}

describe('animation export', () => {
  it('GameData XML emits a <KeyframeAnimationModule> with the matching glb Path', () => {
    const part = partWithDoorAnimation()
    const base = sanitizeBaseName('My Part')
    const xml = serializeGameData(part, base)
    expect(xml).toContain('<KeyframeAnimationModule')
    expect(xml).toContain('ShowDeployRetract="true"')
    expect(xml).toContain(`Path="${animGlbPath(base, part.animations[0])}"`)
  })

  it('the bundle ships the Animations/*.glb at the path the XML references', async () => {
    const part = partWithDoorAnimation()
    const base = sanitizeBaseName('My Part')
    const bundle = await buildCustomBundle(part, base)
    const entry = bundle.binaries.find((b) => b.path === animGlbPath(base, part.animations[0]))
    expect(entry).toBeTruthy()
    const dv = new DataView(entry!.data.buffer, entry!.data.byteOffset, entry!.data.byteLength)
    expect(dv.getUint32(0, true)).toBe(0x46546c67) // it's a GLB
  })

  it('exports animations even with no custom meshes (Core-only animated part)', async () => {
    const bundle = await buildCustomBundle(partWithDoorAnimation(), 'MyPart')
    expect(bundle.assetsFile).toBeNull() // no custom SubParts → no Assets XML
    expect(bundle.binaries.length).toBe(1) // …but the animation glb still ships
  })

  it('emits <SolarTracking> with excludes when configured', () => {
    const part = partWithDoorAnimation()
    part.animations[0].solarTracking = { degreesPerSecond: 5, subPartInstanceId: 'panel_1', excludeInstanceIds: ['base_1'] }
    const xml = serializeGameData(part, 'MyPart')
    expect(xml).toContain('<SolarTracking')
    expect(xml).toContain('DegreesPerSecond="5"')
    expect(xml).toContain('SubPart="panel_1"')
    expect(xml).toContain('<ExcludeSubPart>base_1</ExcludeSubPart>')
  })

  it('skips a degenerate animation (no joints / single keyframe)', async () => {
    const part = createEmptyPart()
    part.animations.push(createPartAnimation('anim_x', 'Empty'))
    expect(serializeGameData(part, 'P')).not.toContain('KeyframeAnimationModule')
    expect((await buildCustomBundle(part, 'P')).binaries).toHaveLength(0)
  })
})

describe('buildModZip', () => {
  it('produces a zip archive containing the flexo-parts entries', async () => {
    const blob = await buildModZip(createEmptyPart(), 'Project1')
    expect(blob.type).toBe('application/zip')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text).toContain('flexo-parts/mod.toml')
    expect(text).toContain('flexo-parts/Project1Part.xml')
    expect(text).toContain('flexo-parts/Project1GameData.xml')
    // End-of-central-directory signature (PK\x05\x06).
    const eocd = bytes.subarray(bytes.length - 22)
    const view = new DataView(eocd.buffer, eocd.byteOffset, eocd.byteLength)
    expect(view.getUint32(0, true)).toBe(0x06054b50)
    expect(view.getUint16(10, true)).toBe(3) // total entries
  })

  it('includes the Animations/*.glb entry for an animated part', async () => {
    const blob = await buildModZip(partWithDoorAnimation(), 'My Part')
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()))
    expect(text).toContain(`flexo-parts/${animGlbPath('MyPart', partWithDoorAnimation().animations[0])}`)
  })
})
