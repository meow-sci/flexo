import { atom } from 'nanostores';
import { loadMassMaterialDensities } from '../ksa/materialDensityCatalog';

/** Read-only session catalog; not project data or undo state. */
export const $massMaterialDensities = atom<ReadonlyMap<string, number>>(new Map());
let loading: Promise<void> | undefined;

export function ensureMassMaterialDensitiesLoaded(): Promise<void> {
  loading ??= loadMassMaterialDensities().then((densities) => {
    $massMaterialDensities.set(densities);
  });
  return loading;
}
