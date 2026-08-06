import {
  materialTextureIds,
  meshKind,
  type CustomMesh,
  type CustomTexture,
  type EditingPart,
  type ImportedMeshSource,
} from '../../ksa/types';
import type { AssetUsage } from '../../state/customAssetStore';
import type { AssetManagerSort } from '../../state/assetManagerStore';
import { fuzzyAny } from '../fuzzyMatch';

/**
 * The Asset Manager's PURE model layer (design: design-surface-assets.md §2.1/§2.5): what
 * the library contains, how one import batch groups, what "unused" means, and the search /
 * sort rules. No react, no stores — the dialog passes `$part` + `$assetUsage` in.
 *
 * Usage counts are always READ from {@link AssetUsage}, never recounted here: v1 recomputed
 * them inline per render in three different closures (census pain #12), which is exactly how
 * a delete confirm and a card chip come to disagree.
 */

export type AssetItemKind = 'texture' | 'material' | 'mesh';

/** One library entry, normalized across the three kinds for search + sort. */
export interface AssetItem {
  kind: AssetItemKind;
  /** The descriptor id (`CustomTexture.id` / `CustomMaterial.id` / `CustomMesh.id`). */
  id: string;
  name: string;
  /** Fuzzy-search haystack: name + subPartId + channel + provenance (§2.1). */
  haystack: string[];
  /** Position in its document array — descriptors append, so higher = more recent. */
  order: number;
  /** Total references, for the "usage" sort (faces + material slots / meshes / placements). */
  usage: number;
}

/** One import batch (one dropped glTF file) as the Imported models category shows it. */
export interface ImportBatch {
  importId: string;
  sourceFile: string;
  meshes: (CustomMesh & { imported: ImportedMeshSource })[];
  placements: number;
  triangles: number;
  /** The textures this batch's SubParts are dressed in TODAY (resolved, not tagged). */
  textures: CustomTexture[];
  /** Distinct materials worn by its SubParts. */
  materials: number;
}

/**
 * Groups imported SubParts by their batch, in first-appearance order — ported verbatim from
 * the v1 custom-assets modal's `groupImports`, which is why it lives here rather than being
 * imported out of a surface that no longer exists.
 *
 * The batch's textures are RESOLVED, not tagged: whatever its meshes' materials point at
 * today, which is what the user actually sees on them and stays truthful after a material
 * re-assignment (the same reference-counting stance as `planImportRemoval`).
 */
export function groupImports(part: EditingPart): ImportBatch[] {
  const byId = new Map<string, ImportBatch>();
  const materialIds = new Map<string, Set<string>>();
  for (const m of part.customMeshes) {
    if (meshKind(m) !== 'imported' || !m.imported) continue;
    const imported = m.imported;
    let batch = byId.get(imported.importId);
    if (!batch) {
      batch = {
        importId: imported.importId,
        sourceFile: imported.sourceFile,
        meshes: [],
        placements: 0,
        triangles: 0,
        textures: [],
        materials: 0,
      };
      byId.set(imported.importId, batch);
      materialIds.set(imported.importId, new Set());
    }
    batch.meshes.push({ ...m, imported });
    batch.triangles += imported.triangles;
    batch.placements += part.placements.filter((pl) => pl.subPartTemplateId === m.subPartId).length;
    if (m.materialId) materialIds.get(imported.importId)?.add(m.materialId);
  }
  for (const batch of byId.values()) {
    const texIds = new Set<string>();
    const mats = materialIds.get(batch.importId) ?? new Set<string>();
    for (const matId of mats) {
      const mat = part.customMaterials.find((x) => x.id === matId);
      if (mat) for (const id of materialTextureIds(mat)) texIds.add(id);
    }
    batch.textures = part.customTextures.filter((t) => texIds.has(t.id));
    batch.materials = mats.size;
  }
  return [...byId.values()];
}

/** Textures + materials + every mesh, as search/sort-ready items. */
export function buildItems(part: EditingPart, usage: AssetUsage): AssetItem[] {
  const items: AssetItem[] = [];
  part.customTextures.forEach((t, order) => {
    const use = usage.texture.get(t.id);
    items.push({
      kind: 'texture',
      id: t.id,
      name: t.name,
      haystack: [t.name, t.channel],
      order,
      usage: (use?.faces.length ?? 0) + (use?.materials.length ?? 0),
    });
  });
  part.customMaterials.forEach((m, order) => {
    items.push({
      kind: 'material',
      id: m.id,
      name: m.name,
      haystack: [m.name],
      order,
      usage: usage.material.get(m.id)?.meshes.length ?? 0,
    });
  });
  part.customMeshes.forEach((m, order) => {
    items.push({
      kind: 'mesh',
      id: m.id,
      name: m.name,
      haystack: [
        m.name,
        m.subPartId,
        meshKind(m),
        m.imported?.sourceFile ?? '',
        m.imported?.sourceNode ?? '',
        m.imported?.sourceMaterial ?? '',
      ].filter(Boolean),
      order,
      usage: usage.mesh.get(m.id)?.placements ?? 0,
    });
  });
  return items;
}

/** Fuzzy search over the whole haystack (shared matcher — never a second implementation). */
export function filterItems(items: AssetItem[], query: string): AssetItem[] {
  const q = query.trim();
  if (!q) return items;
  return items.filter((item) => fuzzyAny(q, ...item.haystack));
}

const KIND_RANK: Record<AssetItemKind, number> = { texture: 0, material: 1, mesh: 2 };

/** Name (locale) / kind / recently added (array order, newest first) / usage (desc). */
export function sortItems(items: AssetItem[], sort: AssetManagerSort): AssetItem[] {
  const byName = (a: AssetItem, b: AssetItem) => a.name.localeCompare(b.name);
  const sorted = [...items];
  switch (sort) {
    case 'name':
      return sorted.sort(byName);
    case 'kind':
      return sorted.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || byName(a, b));
    case 'recent':
      return sorted.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.order - a.order);
    case 'usage':
      return sorted.sort((a, b) => b.usage - a.usage || byName(a, b));
  }
}

/**
 * The ⚠ Unused set (§2.5): textures referenced by no face AND no material channel, and
 * materials assigned to no mesh.
 *
 * **Zero-placement MESHES are deliberately absent.** They are templates, not orphans — they
 * carry the "not exported" chip instead (D10), because deleting one is a very different
 * action from reclaiming an image nothing points at.
 */
export function unusedAssets(
  part: EditingPart,
  usage: AssetUsage,
): { textures: CustomTexture[]; materials: EditingPart['customMaterials'] } {
  const textures = part.customTextures.filter((t) => {
    const use = usage.texture.get(t.id);
    return !use || (use.faces.length === 0 && use.materials.length === 0);
  });
  const materials = part.customMaterials.filter(
    (m) => (usage.material.get(m.id)?.meshes.length ?? 0) === 0,
  );
  return { textures, materials };
}

/** `3 SubParts, 5 placements, 2 materials, 4 textures` — the removal-inventory sentence. */
export function removalSummary(counts: {
  meshes: number;
  placements: number;
  materials: number;
  textures: number;
}): string {
  return [
    plural(counts.meshes, 'SubPart'),
    plural(counts.placements, 'placement'),
    plural(counts.materials, 'material'),
    plural(counts.textures, 'texture'),
  ].join(', ');
}

/** `1 face` / `3 faces` — the one pluralizer the manager's counts go through. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
