/**
 * Loads the KSA "Core" SubPart catalog at runtime by fetching and parsing the
 * Core *Assets.xml files (served under /ksa/ in dev). Uses the browser DOMParser
 * — no third-party XML lib, no build step.
 *
 * Each catalog entry resolves a SubPart template id to the GLB mesh-atlas node
 * and PbrMaterial texture atlases needed to render it (see Domain Reference in
 * plans/FLEXO_INITIAL_PLAN.md). Mesh node names equal the value of the SubPart's
 * <PartModel><Mesh Id="..."/> and exist as named nodes inside the atlas GLB.
 */

import { assetBase } from '../assetBase';
import {
  captureUnknownChildren,
  collidersFromElement,
  subPartGameDataFromDoc,
  subPartLightsFromRoot,
} from './partXmlParser';
import type { PartCollider, PartLight, SubPartGameData, RawXmlNode } from './types';
import { createSubPartGameData } from './types';
import { loadCoreContent } from './coreContent';
import { CORE_CONTENT_FILES } from './coreFiles';
import { contentSource, type ResolvedContent } from './contentXml';
import { catalogPartsFromContent } from './partCatalog';
import { familyAppearanceGroups } from './appearanceGroups';

export interface CatalogRenderModel {
  kind: 'PartModel' | 'PartModelDynamic' | 'PartModelGlass';
  atlasUrl: string;
  meshNodeName: string;
  materialId?: string;
  diffuseUrl?: string;
  normalUrl?: string;
  aoRoughMetalUrl?: string;
  emissiveUrl?: string;
  internal?: boolean;
  rayTracing?: string;
  shadowCaster?: boolean;
  raw: RawXmlNode;
}

export interface CatalogSubPart {
  /** SubPart template id, e.g. "CoreStructuralA_Subpart_TrussBarA". */
  id: string;
  /** URL of the first model atlas; empty for a metadata-only template. */
  atlasUrl: string;
  /**
   * Name of the node to extract from the atlas. null means "use the whole atlas
   * scene" (the rare named-MeshAtlas case, e.g. circle_light.glb).
   */
  meshNodeName: string | null;
  materialId?: string;
  diffuseUrl?: string;
  normalUrl?: string;
  aoRoughMetalUrl?: string;
  emissiveUrl?: string;
  /**
   * True when the SubPart's <PartModel> carries <Internal>true</Internal> — "interior-only":
   * KSA renders the mesh in IVA camera mode and NOT outside it (the render gate in
   * PartModel.cs:387). flexo always renders it in the editor, and on mod export copies the
   * flag through FAITHFULLY unless the user overrides it for this template via
   * `EditingPart.internalFlags` (see resolveInternal in modExport.ts).
   */
  internal?: boolean;
  /**
   * Raw `<PartModel><RayTracing>` token, e.g. "Disabled" / "Enabled" / "ShadowProxy"
   * (`PartModelModule.RaytracingMode`). flexo never INTERPRETS it, it only copies it onto an
   * export variant so a redeclared template keeps the built-in's ray-tracing behaviour — a
   * `ShadowProxy` mesh (an invisible ray occluder) would otherwise become a visible one.
   */
  rayTracing?: string;
  /**
   * The `<PartModel><ShadowCaster>` bool, when the built-in authors one at all (undefined =
   * absent). KSA defaults it to `true`, so `false` is the meaningful case and it MUST stay
   * distinguishable from "absent": Core authors `<ShadowCaster>false</ShadowCaster>` on the
   * medium-capsule windows, and an export variant that dropped it would default back to
   * `true` and make the window start casting shadows the built-in never cast. Never
   * user-editable — flexo only copies it forward.
   */
  shadowCaster?: boolean;
  /**
   * Collision primitives authored on the geometry `<SubPart>` template itself (Core does
   * this for e.g. the solar-panel cells). flexo does NOT copy these into the document
   * when you merely PLACE the template — the placement references the built-in id and the
   * built-in collider applies in-game for free. They exist so that when mod export is
   * forced to redeclare the template as an export VARIANT (see buildExportVariantMap),
   * the variant can carry the built-in collision volume forward instead of silently
   * losing it.
   */
  colliders?: PartCollider[];
  /** Editable template metadata copied into the document when this SubPart is added. */
  data?: {
    gameData?: SubPartGameData;
    colliders: PartCollider[];
    lights: PartLight[];
  };
  /** All native render models; scalar fields above mirror the first for existing consumers. */
  models?: CatalogRenderModel[];
  /** Native model and MeshView XML retained for faithful export. */
  renderComponents?: RawXmlNode[];
  /** All flattened native Components, in source order. */
  components?: RawXmlNode[];
  /** Full flattened template row for export overrides. */
  raw?: RawXmlNode;
  appearanceGroupId?: string;
  appearanceIds?: string[];
  /** Originating XML file (for debugging). */
  sourceFile: string;
}

/** Part/SubPart files in Core manifest order. */
export const ASSET_FILES = CORE_CONTENT_FILES.filter((f) => f.endsWith('Assets.xml'));

/**
 * Absolute URL of a KSA asset. Respects the shared-asset base (Vite's `base`, or
 * `VITE_ASSET_BASE` for a mini app) so /ksa/ URLs resolve under a sub-path deploy.
 * Computed per call, NOT at module scope — see {@link assetBase}.
 */
export function toUrl(relPath: string): string {
  return assetBase() + 'ksa/' + relPath.replace(/^\/+/, '');
}

/** Result of fetching+parsing a /ksa/ XML file. 'missing' = file genuinely absent (real 404, or vite's SPA index.html fallback served with 200 for an unknown path). */
export type XmlFetchResult =
  | { kind: 'ok'; doc: Document }
  | { kind: 'missing' }
  | { kind: 'error' };

function looksLikeHtmlFallback(text: string): boolean {
  const head = text.slice(0, 256).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

/**
 * Fetches and parses a /ksa/ XML file. Returns 'missing' for absent files (404,
 * or the dev server's index.html SPA fallback) so optional siblings can be skipped
 * silently. On a genuine XML parse error — which indicates a real bug — logs the
 * file, parser message, content-type, and full body before returning 'error'.
 */
export async function fetchXmlFile(file: string): Promise<XmlFetchResult> {
  let res: Response;
  try {
    res = await fetch(toUrl(file));
  } catch (err) {
    console.error(`ksa catalog: network error fetching ${file}`, err);
    return { kind: 'error' };
  }
  if (res.status === 404) return { kind: 'missing' };
  if (!res.ok) {
    console.error(`ksa catalog: failed to fetch ${file}: ${res.status} ${res.statusText}`);
    return { kind: 'error' };
  }
  const text = await res.text();
  if (looksLikeHtmlFallback(text)) return { kind: 'missing' };
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const parseErr = doc.getElementsByTagName('parsererror')[0];
  if (parseErr) {
    console.error(
      `ksa catalog: XML parse error in ${file}\n` +
        `  url: ${res.url}\n` +
        `  content-type: ${res.headers.get('content-type') ?? '(none)'}\n` +
        `  parser message: ${(parseErr.textContent ?? '').trim()}\n` +
        `  --- ${file} contents (${text.length} chars) ---\n${text}`,
    );
    return { kind: 'error' };
  }
  return { kind: 'ok', doc };
}

function firstChildByTag(parent: Element, tag: string): Element | null {
  return (
    (Array.from(parent.childNodes).find(
      (n) => n.nodeType === 1 && (n as Element).tagName === tag,
    ) as Element | null) ?? null
  );
}

const appearanceGroups = [
  ['CoreUtilityA_Subpart_ParachuteBayRadialCoverB', 'A', 'B'],
  ['CorePropulsionB_Subpart_RCSSetACoverSmall', 'A', 'B'],
  ['CoreIVAPropA_Subpart_WrittenNote', 'B', 'C', 'D'],
  ['CoreIVAPropA_Subpart_Photo', 'B', 'F'],
  ['CorePropulsionA_Subpart_SRBSizeASmallSegment', 'A', 'B'],
  ['CorePropulsionA_Subpart_SRBSizeBMediumSegment', 'A', 'B'],
  ['CorePropulsionA_Subpart_SRBSizeBSmallSegment', 'A', 'B'],
  ['CoreCouplingA_Subpart_Decoupler2WSkin', 'A', 'B'],
  ['CoreCouplingA_Subpart_Decoupler3WSkin', 'A', 'B'],
  ['CoreCouplingA_Subpart_DecouplerHalfWSkin', 'A', 'B'],
];

/** Resolve globally registered material and mesh references in already flattened content. */
export function catalogFromContent(
  content: ResolvedContent,
  meshIndex: Record<string, string>,
): CatalogSubPart[] {
  const root = content.doc.documentElement;
  const rows = Array.from(root.childNodes).filter((n): n is Element => n.nodeType === 1);
  const textures = new Map(
    rows
      .filter((e) => e.tagName === 'Texture')
      .map((e) => [e.getAttribute('Id')!.toLowerCase(), e.getAttribute('Path')]),
  );
  const materials = new Map(
    rows
      .filter((e) => e.tagName === 'PbrMaterial')
      .map((e) => [e.getAttribute('Id')!.toLowerCase(), e]),
  );
  const metadata = new Map(
    subPartGameDataFromDoc(content.doc).map((d) => [d.subPartTemplateId.toLowerCase(), d]),
  );
  const lights = subPartLightsFromRoot(root);
  const rawRows = new Map(
    captureUnknownChildren(root, new Set())
      .filter((r) => r.tag === 'SubPart')
      .map((r) => [r.attrs.Id, r]),
  );
  const appearances = familyAppearanceGroups(catalogPartsFromContent(content));
  for (const [stem, ...suffixes] of appearanceGroups) {
    const ids = new Set([
      ...(appearances.get(stem) ?? []),
      ...suffixes.map((suffix) => stem + suffix),
    ]);
    appearances.set(stem, [...ids].sort());
  }
  const out: CatalogSubPart[] = [];
  for (const sub of rows.filter(
    (e) => e.tagName === 'SubPart' && e.getAttribute('Test') !== 'true',
  )) {
    const id = sub.getAttribute('Id')!;
    const components = firstChildByTag(sub, 'Components');
    const raw = components ? captureUnknownChildren(components, new Set()) : [];
    const renderComponents = raw.filter((r) =>
      ['PartModel', 'PartModelDynamic', 'PartModelGlass', 'MeshView'].includes(r.tag),
    );
    const models: CatalogRenderModel[] = [];
    for (const model of Array.from(components?.childNodes ?? []).filter(
      (n): n is Element =>
        n.nodeType === 1 &&
        ['PartModel', 'PartModelDynamic', 'PartModelGlass'].includes((n as Element).tagName),
    )) {
      const mesh = firstChildByTag(model, 'Mesh')?.getAttribute('Ref');
      if (!mesh) continue;
      const atlasPath = meshIndex[mesh.toLowerCase()];
      if (!atlasPath) throw new Error(`Unresolved mesh ${mesh} on ${id}`);
      const materialId = firstChildByTag(model, 'Material')?.getAttribute('Ref') ?? undefined;
      const material = materialId ? materials.get(materialId.toLowerCase()) : undefined;
      if (materialId && !material) throw new Error(`Unresolved material ${materialId} on ${id}`);
      const texture = (name: string) => {
        const ref = material && firstChildByTag(material, name)?.getAttribute('Ref');
        if (!ref) return undefined;
        const path = textures.get(ref.toLowerCase());
        if (!path) throw new Error(`Unresolved texture ${ref} on ${id}`);
        return toUrl(path);
      };
      const shadow = firstChildByTag(model, 'ShadowCaster')?.textContent?.trim();
      models.push({
        kind: model.tagName as CatalogRenderModel['kind'],
        atlasUrl: toUrl(atlasPath),
        meshNodeName: mesh,
        materialId,
        diffuseUrl: texture('Diffuse'),
        normalUrl: texture('Normal'),
        aoRoughMetalUrl: texture('AoRoughMetal'),
        emissiveUrl: texture('Emissive'),
        internal:
          firstChildByTag(model, 'Internal')?.textContent?.trim().toLowerCase() === 'true' ||
          undefined,
        rayTracing: firstChildByTag(model, 'RayTracing')?.textContent?.trim() || undefined,
        shadowCaster: shadow === undefined ? undefined : shadow.toLowerCase() === 'true',
        raw: raw.find(
          (r) =>
            r.tag === model.tagName && (r.attrs.Key ?? '') === (model.getAttribute('Key') ?? ''),
        )!,
      });
    }
    const colliders = collidersFromElement(sub, id);
    const ownedLights = lights.filter((l) => l.ownerTemplateId?.toLowerCase() === id.toLowerCase());
    const gameData =
      metadata.get(id.toLowerCase()) ??
      (colliders.length || ownedLights.length ? createSubPartGameData(id) : undefined);
    const group = [...appearances].find(([, ids]) => ids.includes(id));
    out.push({
      id,
      ...models[0],
      atlasUrl: models[0]?.atlasUrl ?? '',
      meshNodeName: models[0]?.meshNodeName ?? null,
      models,
      renderComponents,
      components: raw,
      raw: rawRows.get(id),
      appearanceGroupId: group?.[0],
      appearanceIds: group?.[1],
      colliders: colliders.length ? colliders : undefined,
      data:
        gameData || colliders.length || ownedLights.length
          ? { gameData, colliders, lights: ownedLights }
          : undefined,
      sourceFile: contentSource(content, 'SubPart', id),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Fetch the shared resolved content and the Vite-generated GLB mesh-name index. */
export async function loadCoreCatalog(): Promise<CatalogSubPart[]> {
  const [content, response] = await Promise.all([
    loadCoreContent(),
    fetch(toUrl('mesh-index.json')),
  ]);
  if (!response.ok) throw new Error('Unable to load KSA mesh index');
  return catalogFromContent(content, (await response.json()) as Record<string, string>);
}

export function indexCatalog(entries: CatalogSubPart[]): Map<string, CatalogSubPart> {
  return new Map(entries.map((e) => [e.id, e]));
}
