import * as THREE from 'three'
import { loadCoreCatalog, indexCatalog, toUrl } from '../ksa/catalog'
import { parsePartPlacements } from '../ksa/partXmlParser'
import { SubPartObject } from './SubPartObject'

/**
 * Coordinate-calibration aid. Loads the Core part
 * `CoreCouplingA_Prefab_DockingPort1WA` and renders it from its authored Part
 * XML so the result can be eyeballed for correctness (it should look like a
 * coherent, radially-symmetric docking port). Triggered by `?debug=dockingport`.
 *
 * If it looks scrambled, fix the Euler order / axis mapping in three/coords.ts.
 */
const DOCKING_PORT_FILE = toUrl('CoreCouplingAAssets.xml')
const DOCKING_PORT_ID = 'CoreCouplingA_Prefab_DockingPort1WA'

export async function loadDockingPortCalibration(scene: THREE.Scene): Promise<void> {
  const [xmlText, catalog] = await Promise.all([
    fetch(DOCKING_PORT_FILE).then((r) => r.text()),
    loadCoreCatalog(),
  ])
  const index = indexCatalog(catalog)
  const placements = parsePartPlacements(xmlText, DOCKING_PORT_ID)

  const root = new THREE.Group()
  root.name = 'debug-dockingport'

  let ok = 0
  for (const placement of placements) {
    const entry = index.get(placement.subPartTemplateId)
    if (!entry) {
      console.warn(`calibration: missing catalog entry ${placement.subPartTemplateId}`)
      continue
    }
    try {
      const obj = await SubPartObject.create(entry, placement)
      root.add(obj.group)
      ok++
    } catch (err) {
      console.warn(`calibration: failed to build ${placement.instanceId}`, err)
    }
  }
  scene.add(root)
  console.info(`calibration: docking port rendered ${ok}/${placements.length} subparts`)
}
