import type { CatalogPart } from '../../ksa/partCatalog';
import { fuzzyAny } from '../fuzzyMatch';

/** One row per explicit Part family; standalone Parts remain independent. */
export function partBrowserRows(
  catalog: readonly CatalogPart[],
  query: string,
  tags: readonly string[],
): CatalogPart[] {
  const rows = new Map<string, CatalogPart>();
  for (const part of catalog) {
    if (
      !tags.every((tag) => part.editorTags.includes(tag)) ||
      !fuzzyAny(query, part.id, ...part.editorTags)
    )
      continue;
    const key = part.variantHeadId ?? part.id;
    if (!rows.has(key) || part.id.toLowerCase() === query.trim().toLowerCase()) rows.set(key, part);
  }
  return [...rows.values()];
}

export function partBrowserRowId(part: CatalogPart): string {
  return part.variantHeadId ?? part.id;
}

/** Exact ID searches select that concrete member, including hidden family members. */
export function exactCatalogId<T extends { id: string }>(
  catalog: readonly T[],
  query: string,
): string | null {
  const needle = query.trim().toLowerCase();
  return needle ? (catalog.find((entry) => entry.id.toLowerCase() === needle)?.id ?? null) : null;
}
