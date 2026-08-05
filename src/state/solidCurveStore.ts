import { atom, computed } from 'nanostores';
import {
  loadGrainGeometryCatalog,
  loadSolidPropellantDensities,
  type GrainGeometryTable,
} from '../ksa/grainGeometryCatalog';

/**
 * The two Core libraries the **solid thrust-curve preview** reads — grain profiles and solid
 * storage densities (design: design-data-engine-modes.md D7, §B6).
 *
 * Mirrors `reactionStore`'s contract exactly, because it has the same shape and the same
 * tolerance: lazily loaded ONCE on demand, empty until it resolves, and **legitimately empty
 * forever** in the open-source build where the licensed `/ksa/` tree is not served. An empty
 * catalog is not an error — it is the card's "preview unavailable — the engine still exports
 * correctly" hint.
 *
 * **Layering (constitution)**: zero react / three imports.
 *
 * **Undo enrollment: NONE. Persistence: NONE.** Read-only game data.
 */

export const $grainCatalog = atom<GrainGeometryTable[]>([]);

/** Substance id (`APCP`) → `<StorageDensity KgPerM3>`. */
export const $solidDensities = atom<ReadonlyMap<string, number>>(new Map());

export const $solidCurveLoading = atom<boolean>(true);

/** id → grain profile, for resolving a `<SolidMotor><Grain Id>`. */
export const $grainIndex = computed(
  [$grainCatalog],
  (entries) => new Map(entries.map((e) => [e.id, e])),
);

/**
 * True once BOTH files loaded with usable content. The curve needs a profile AND a density,
 * so one without the other is still "no preview" — saying so in one atom keeps the card from
 * having to know which half is missing.
 */
export const $hasSolidCurveData = computed(
  [$grainCatalog, $solidDensities],
  (grains, densities) => grains.length > 0 && densities.size > 0,
);

let started = false;

/**
 * Loads both libraries once (idempotent). Fired from Engine-mode entry alongside
 * `ensureReactionsLoaded`, so a mode switch is the only place that pays for it.
 */
export async function ensureSolidCurveDataLoaded(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const [grains, densities] = await Promise.all([
      loadGrainGeometryCatalog(),
      loadSolidPropellantDensities(),
    ]);
    $grainCatalog.set(grains);
    $solidDensities.set(densities);
  } catch (err) {
    console.error('flexo: grain geometry catalog load failed', err);
  } finally {
    $solidCurveLoading.set(false);
  }
}
