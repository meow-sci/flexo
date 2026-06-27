import { atom, computed } from 'nanostores'
import {
  customToProcessData,
  indexCombustionCatalog,
  loadCombustionCatalog,
  type CombustionProcessData,
} from '../ksa/combustionCatalog'
import { $part } from './editorStore'

/**
 * The loaded KSA combustion-process catalog (propellant chemistry + gas LUTs), used
 * by the Engine Designer's live thrust/Isp preview. Empty until
 * {@link ensureCombustionLoaded} resolves — and stays empty in the open-source build
 * where `Combustion.xml` isn't served (the editor still authors engines, just without
 * the physics readout). Parallel to {@link import('./catalogStore').$catalog}.
 */
export const $combustionCatalog = atom<CombustionProcessData[]>([])
export const $combustionLoading = atom<boolean>(true)

/** id → combustion process index for O(1) lookup by `<Combustion Id>`. */
export const $combustionIndex = computed([$combustionCatalog], (entries) =>
  indexCombustionCatalog(entries),
)

/**
 * The Core catalog merged with the project's user-authored custom processes (custom
 * wins on an id clash) — what the Engine designer's dropdown + live readout use, so a
 * just-authored propellant shows up immediately. Custom processes are converted from
 * their authored units to the computed LUT form here.
 */
export const $allCombustionProcesses = computed(
  [$combustionCatalog, $part],
  (core, part): CombustionProcessData[] => {
    const custom = part.customCombustionProcesses.map(customToProcessData)
    const customIds = new Set(custom.map((c) => c.id))
    return [...core.filter((c) => !customIds.has(c.id)), ...custom]
  },
)

/** id → process index over Core ∪ custom processes. */
export const $allCombustionIndex = computed([$allCombustionProcesses], (entries) =>
  indexCombustionCatalog(entries),
)

/** True once the catalog has loaded with at least one process (live preview available). */
export const $hasCombustionData = computed([$combustionCatalog], (entries) => entries.length > 0)

let started = false

/** Loads the combustion catalog once (idempotent). Safe to call from multiple mounts. */
export async function ensureCombustionLoaded(): Promise<void> {
  if (started) return
  started = true
  try {
    const entries = await loadCombustionCatalog()
    $combustionCatalog.set(entries)
  } catch (err) {
    console.error('flexo: combustion catalog load failed', err)
  } finally {
    $combustionLoading.set(false)
  }
}
