import type { CatalogPart } from './partCatalog';

type FamilyPart = Pick<CatalogPart, 'variantHeadId' | 'placements'>;

/** Infer alternatives only from mutually exclusive placements in explicit Part families. */
export function familyAppearanceGroups(parts: readonly FamilyPart[]): Map<string, string[]> {
  const families = new Map<string, FamilyPart[]>();
  for (const part of parts) {
    if (!part.variantHeadId) continue;
    const family = families.get(part.variantHeadId) ?? [];
    family.push(part);
    families.set(part.variantHeadId, family);
  }
  const groups = new Map<string, Set<string>>();
  const conflicts = new Set<string>();
  for (const family of families.values()) {
    const members = family.map((part) => {
      const stems = new Map<string, Set<string>>();
      for (const placement of part.placements) {
        const id = placement.subPartTemplateId;
        if (!/[A-Z]$/.test(id)) continue;
        const stem = id.slice(0, -1);
        const ids = stems.get(stem) ?? new Set<string>();
        ids.add(id);
        stems.set(stem, ids);
      }
      return stems;
    });
    const stems = new Set(members.flatMap((member) => [...member.keys()]));
    for (const stem of stems) {
      const perMember = members.map((member) => member.get(stem) ?? new Set<string>());
      if (perMember.some((ids) => ids.size > 1)) {
        conflicts.add(stem);
        continue;
      }
      const ids = new Set(perMember.flatMap((value) => [...value]));
      if (ids.size < 2) continue;
      const group = groups.get(stem) ?? new Set<string>();
      for (const id of ids) group.add(id);
      groups.set(stem, group);
    }
  }
  return new Map(
    [...groups]
      .filter(([stem]) => !conflicts.has(stem))
      .map(([stem, ids]) => [stem, [...ids].sort()]),
  );
}
