import type { CatalogRenderModel, CatalogSubPart } from '../ksa/catalog';

/** Synthetic entries use scalar mesh fields; Core entries retain every native model. */
export function catalogRenderModels(
  entry: CatalogSubPart,
): readonly (CatalogRenderModel | CatalogSubPart)[] {
  return entry.models ?? [entry];
}
