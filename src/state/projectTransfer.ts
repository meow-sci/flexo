import type {
  Connector,
  CustomMaterial,
  CustomReaction,
  CustomMesh,
  EditingPart,
  IvaSeat,
  KittenInstance,
  KittenMeshSource,
  Layer,
  PartAnimation,
  PartCollider,
  PartGameData,
  PartLight,
  Rocket,
  SubPartGameData,
  SubPartIdRef,
  SubPartPlacement,
  CustomTexture,
  FaceTextureConfig,
  Vec3,
} from '../ksa/types';
import {
  DEFAULT_LAYER_ID,
  DEFAULT_PART_ID,
  IVA_SEAT_LAYER_ID,
  KITTEN_LAYER_ID,
  createDefaultLayer,
  createIvaSeatLayer,
  createKittenLayer,
  createDefaultMaterial,
  createSubPartGameData,
  clampLayerIds,
  meshKind,
} from '../ksa/types';
import { remapRawConnectorRefs } from '../ksa/partXmlParser';
import { remapConsumerFeedWiring, remapConsumerFeeds } from '../ksa/idRemap';
import { randomId } from './ids';
import {
  PROJECT_EXPORT_FORMAT,
  PROJECT_EXPORT_VERSION,
  decodeProject,
  encodeProject,
  isCompactProject,
} from './projectCodec';

export { PROJECT_EXPORT_FORMAT, PROJECT_EXPORT_VERSION };

/**
 * Project Export / Import — a portable, data-only JSON snapshot of a project's
 * workspace (meshes, layers, connectors, kittens, animations, GameData) that can be
 * pasted into ANOTHER project, ADDITIVELY. This module is pure (no store imports) so
 * the id-remapping merge is unit-testable; the store wrapper that mutates `$part`
 * lives in editorStore (`importProjectData`).
 *
 * The hard part is id remapping: imported placements get fresh `instanceId`s and
 * connectors fresh `_connectorN` ids, while animations reference placements by
 * `instanceId` and GameData couplings reference connectors by id — so the merge
 * carries old→new maps and rewrites every reference through them.
 *
 * **Binary-backed assets and the two containers.** Uploaded textures, primitive meshes and
 * imported glTF models keep their bytes in `assetDb`, never in this JSON. Whether their
 * DESCRIPTORS may ride the wire is therefore the container's call, not the payload's
 * (design-projects-export.md §4.1):
 *
 * - a `.flexo.tar.gz` archive ships the bytes alongside, so it opts in with
 *   `buildProjectExport(part, name, {includeBinaryBacked: true})` and imports with a
 *   `binaryAssets` table — {@link parseProjectImport} then keeps exactly the descriptors
 *   that table backs;
 * - bare JSON and share links carry nothing binary, so they export without the opt-in and
 *   import with `binaryAssets: null`, which DROPS any smuggled binary-backed descriptor
 *   (v1 behavior, verbatim) rather than materializing a SubPart whose geometry this browser
 *   does not have. {@link hasCustomAssets} still gates the share-link dialog (D10).
 *
 * Part-ified KITTEN meshes are exempt from all of that: they're pure descriptors referencing
 * built-in game assets (geometry re-bakes from the kitten gltf on load, textures resolve by
 * Content/Core path), so they round-trip as data with no binary bundling.
 */

/** The in-scope workspace data carried by an export (everything but binary-backed assets). */
export interface ProjectExportData {
  editorTags: string[];
  gameData: PartGameData;
  subPartGameData: SubPartGameData[];
  layers: Layer[];
  placements: SubPartPlacement[];
  connectors: Connector[];
  /** The Part's collision volume (analytic primitives; owner-grouped only on XML export). */
  colliders: PartCollider[];
  /**
   * IVA seats. ORDER IS LOAD-BEARING: index 0 is the seat IVA opens on and `C` cycles
   * them in this order, so the wire form preserves the document order exactly.
   */
  ivaSeats: IvaSeat[];
  /** The Part's cast lights (owner-grouped only on XML export). */
  lights: PartLight[];
  /** Per-SubPart-template `<Internal>` (interior-only) overrides, keyed by template id. */
  internalFlags: Record<string, boolean>;
  kittens: KittenInstance[];
  animations: PartAnimation[];
  /**
   * Custom mesh descriptors. Kitten submeshes always; primitive and imported meshes only
   * when the container carries their binaries (`includeBinaryBacked`).
   */
  customMeshes: CustomMesh[];
  /**
   * Uploaded-texture DESCRIPTORS. Only ever non-empty inside an archive, whose
   * `assets/tex-src/<id>` entries carry the pixels.
   */
  customTextures: CustomTexture[];
  /** User-authored materials (pure descriptors; their maps name textures by id). */
  customMaterials: CustomMaterial[];
  /** User-authored reactions (custom propellants — pure data). */
  customReactions: CustomReaction[];
}

/**
 * A versioned export envelope. `sourcePartId` carries the source's Part Id: it's
 * restored verbatim by {@link envelopeToPart} (share-link load) and adopted by
 * {@link mergeProjectImport} only when the destination has no Part Id of its own.
 */
export interface ProjectExportEnvelope {
  format: typeof PROJECT_EXPORT_FORMAT;
  version: number;
  exportedAt: number;
  projectName: string;
  sourcePartId: string;
  data: ProjectExportData;
}

/** Counts surfaced after an additive import (for the success toast). */
export interface ImportSummary {
  meshes: number;
  connectors: number;
  colliders: number;
  ivaSeats: number;
  lights: number;
  kittens: number;
  newLayers: number;
  animations: number;
}

export interface MergeResult {
  part: EditingPart;
  summary: ImportSummary;
  newLayerIds: string[];
  /** The asset id remapping the merge applied (empty maps when nothing binary was adopted). */
  adoption: AssetAdoption;
}

/**
 * How an archive's binary-backed assets land in the DESTINATION project's id space
 * (design-projects-export.md §4.3 "binary asset adoption" + "Dedup").
 *
 * Built by `projectArchive.planAssetAdoption` (which is where the async IndexedDB reads and
 * the SHA-256 comparisons live) and applied here, so this module stays pure. Splitting
 * "what id does it become" from "whose bytes must be copied" is what makes dedup expressible:
 * a texture that matched an existing one appears in {@link textures} pointing at the
 * INCUMBENT's id and is absent from {@link copiedTextures}.
 */
export interface AssetAdoption {
  /** incoming texture id → the destination texture id it becomes. */
  textures: Map<string, string>;
  /** The subset of {@link textures} that is genuinely new (its blobs get copied). */
  copiedTextures: Map<string, string>;
  /** incoming mesh id → fresh mesh id (primitive + imported meshes). */
  meshes: Map<string, string>;
  /** incoming importId → fresh importId — one per import BATCH, not per mesh. */
  imports: Map<string, string>;
  /** destination texture id → sha256 learned while deduping, cached onto the descriptor. */
  hashes: Map<string, string>;
}

/** An adoption that adopts nothing — the shape every non-archive import merges with. */
export function emptyAdoption(): AssetAdoption {
  return {
    textures: new Map(),
    copiedTextures: new Map(),
    meshes: new Map(),
    imports: new Map(),
    hashes: new Map(),
  };
}

export type ParseResult = { ok: true; env: ProjectExportEnvelope } | { ok: false; error: string };

/**
 * True for the ONE mesh kind a data-only payload can carry: a part-ified kitten submesh,
 * which is pure data referencing game assets (geometry re-bakes from the shipped kitten gltf,
 * textures resolve by Content/Core path). A primitive mesh needs its generated GLB and an
 * IMPORTED mesh needs its import batch's GLB — both live in IndexedDB, neither is on the wire.
 */
function isDataOnlyMesh(m: CustomMesh): boolean {
  return meshKind(m) === 'kitten';
}

/**
 * True when the project has custom assets that JSON export can't carry — uploaded textures,
 * primitive meshes, or IMPORTED glTF models (all binary-backed: their bytes live in IndexedDB,
 * never in the payload). Kitten part-meshes DON'T count: they're data-only references to game
 * assets and export fine.
 *
 * This is the gate the Export-Project and Share-Link dialogs disable themselves on, and it is
 * what keeps {@link buildProjectExport}'s kitten-only filter from ever being the only line of
 * defence: an imported mesh descriptor on the wire would decode into a SubPart pointing at an
 * `importId` the receiving browser has no geometry for — an invisible, unfixable placement.
 */
export function hasCustomAssets(part: EditingPart): boolean {
  return part.customTextures.length > 0 || part.customMeshes.some((m) => !isDataOnlyMesh(m));
}

/** Options for {@link buildProjectExport}. */
export interface ProjectExportOptions {
  /**
   * Include descriptors whose bytes live in `assetDb` — uploaded textures, primitive meshes
   * and imported glTF meshes. ONLY the `.flexo.tar.gz` builder may set this, because only it
   * puts the matching bytes in the container (design §4.1). Default `false` keeps the
   * data-only wire byte-identical to v1.
   */
  includeBinaryBacked?: boolean;
}

/**
 * Builds an export envelope. Deep-copies the in-scope fields and stamps provenance.
 *
 * By default only kitten part-meshes ride in `customMeshes` and `customTextures` is empty —
 * everything else is binary-backed. With `includeBinaryBacked` the container has promised to
 * carry those bytes, so the descriptors go too.
 */
export function buildProjectExport(
  part: EditingPart,
  projectName: string,
  opts: ProjectExportOptions = {},
): ProjectExportEnvelope {
  const binary = opts.includeBinaryBacked === true;
  return {
    format: PROJECT_EXPORT_FORMAT,
    version: PROJECT_EXPORT_VERSION,
    exportedAt: Date.now(),
    projectName,
    sourcePartId: part.partId,
    data: structuredClone({
      editorTags: part.editorTags,
      gameData: part.gameData,
      subPartGameData: part.subPartGameData,
      layers: part.layers,
      placements: part.placements,
      connectors: part.connectors,
      colliders: part.colliders,
      ivaSeats: part.ivaSeats,
      lights: part.lights,
      internalFlags: part.internalFlags,
      kittens: part.kittens,
      animations: part.animations,
      customMeshes: binary ? part.customMeshes : part.customMeshes.filter(isDataOnlyMesh),
      customTextures: binary ? part.customTextures : [],
      customMaterials: part.customMaterials,
      customReactions: part.customReactions,
    }),
  };
}

/** Serializes an export envelope to the minified compact-JSON wire string. */
export function serializeProjectJson(env: ProjectExportEnvelope): string {
  return JSON.stringify(encodeProject(env));
}

/**
 * What backing bytes the CONTAINER brings with a payload (design §4.1): `null` for bare JSON,
 * a pasted snippet or a share link — none of which can carry a byte — and the archive's asset
 * table for a `.flexo.tar.gz`. The one argument that decides whether a binary-backed
 * descriptor survives the wire.
 */
export interface ProjectImportOptions {
  binaryAssets?: BackingAssetTable | null;
}

/**
 * The structural slice of the archive's `AssetTable` this module needs. Declared here rather
 * than imported so the pure merge layer keeps no dependency on the container format.
 */
export type BackingAssetTable = readonly { kind: string; id: string }[];

/**
 * Parses + validates a compact project JSON string (from the Import dialog, an archive's
 * `project.json`, or a decompressed share-link payload). Returns a discriminated result with
 * a human-readable error on failure, or the decoded envelope on success.
 */
export function parseProjectImport(text: string, opts?: ProjectImportOptions): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Paste exported project JSON to import.' };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${(err as Error).message}` };
  }
  return parseProjectObject(raw, opts);
}

/** Validates an already-parsed compact object and decodes it to an envelope. */
export function parseProjectObject(raw: unknown, opts?: ProjectImportOptions): ParseResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Expected a JSON object.' };
  }
  if (!isCompactProject(raw)) {
    return {
      ok: false,
      error: `Not a flexo project (format: ${JSON.stringify((raw as { f?: unknown }).f)}).`,
    };
  }
  // Exact-version match only. PROJECT_EXPORT_VERSION is the compatibility contract: a
  // backwards-compatible additive change never bumps it (decode is tolerant and fills the
  // new field's default), so a mismatch means a genuinely incompatible payload — older ones
  // carry pre-rename keys that would decode silently wrong (no migration, per the
  // constitution), newer ones are unknown. Rejected, never converted.
  if (typeof raw.v !== 'number' || raw.v !== PROJECT_EXPORT_VERSION) {
    return { ok: false, error: `Unsupported project version: ${JSON.stringify(raw.v)}.` };
  }
  return { ok: true, env: dropUnbackedAssets(decodeProject(raw), opts?.binaryAssets ?? null) };
}

/**
 * What a mesh descriptor NEEDS from the container to be usable on the other side:
 *
 * - `'none'` — nothing. A kitten submesh re-bakes from the shipped kitten gltf, and a
 *   primitive is regenerated from its own `PrimitiveSpec` (which the codec carries; the
 *   `mesh-glb` asset tier is reserved but unwritten — no primitive GLB is ever stored).
 * - a key — the blob that IS its only copy. Only imported glTF geometry qualifies: nothing
 *   can reconstruct it, which is exactly why the archive exists.
 * - `'unusable'` — the descriptor is incoherent (an imported mesh with no `importId`, a
 *   primitive with no spec). Dropped rather than materialized as an empty SubPart.
 */
function meshBacking(mesh: CustomMesh): { kind: string; id: string } | 'none' | 'unusable' {
  switch (meshKind(mesh)) {
    case 'kitten':
      return 'none';
    case 'imported':
      return mesh.imported?.importId
        ? { kind: 'import-glb', id: mesh.imported.importId }
        : 'unusable';
    case 'primitive':
      return mesh.primitive ? 'none' : 'unusable';
  }
}

/**
 * Removes every descriptor whose bytes the container did NOT bring, and every reference to
 * one. This is the single enforcement point for the rule the two containers differ on: with
 * `table === null` (paste / bare JSON / share link) it strips ALL binary-backed assets — the
 * v1 drop-smuggled-meshes rule, now also covering textures — and with a table it strips only
 * what that table fails to back (a truncated or hand-edited archive).
 *
 * A kept material or face may name a texture that just went: those references are reset to
 * their constructor defaults rather than left dangling, because a channel pointing at a
 * texture id nothing owns is exactly the "silently wrong" state the constitution rejects.
 */
function dropUnbackedAssets(
  env: ProjectExportEnvelope,
  table: BackingAssetTable | null,
): ProjectExportEnvelope {
  const backs = (kind: string, id: string): boolean =>
    table != null && id !== '' && table.some((entry) => entry.kind === kind && entry.id === id);

  const meshes = env.data.customMeshes.filter((mesh) => {
    const backing = meshBacking(mesh);
    if (backing === 'unusable') return false;
    return backing === 'none' || backs(backing.kind, backing.id);
  });
  const textures = env.data.customTextures.filter(
    (t) => backs('tex-src', t.id) || backs('tex-ktx2', t.id),
  );
  if (
    meshes.length === env.data.customMeshes.length &&
    textures.length === env.data.customTextures.length
  ) {
    return env;
  }

  const liveTextures = new Set(textures.map((t) => t.id));
  const keepTexture = (id: string | undefined): boolean => !!id && liveTextures.has(id);

  // A dropped mesh's SubPart TEMPLATE goes with it. Otherwise its placements would merge as
  // SubParts pointing at a template nothing owns — invisible, unselectable and unfixable,
  // which is worse than the honest partial import (this completes the v1 rule, which dropped
  // only the descriptor).
  const deadTemplates = new Set(
    env.data.customMeshes
      .filter((mesh) => !meshes.includes(mesh))
      .map((mesh) => mesh.subPartId)
      .filter(Boolean),
  );
  const live = (templateId: string | null | undefined): boolean =>
    !templateId || !deadTemplates.has(templateId);

  return {
    ...env,
    data: {
      ...env.data,
      customMeshes: meshes.map((mesh) => ({
        ...mesh,
        faceTextures: Object.fromEntries(
          Object.entries(mesh.faceTextures).filter(([, cfg]) => keepTexture(cfg?.textureId)),
        ),
      })),
      customTextures: textures,
      customMaterials: env.data.customMaterials.map((mat) =>
        stripDeadTextureRefs(mat, keepTexture),
      ),
      placements: env.data.placements.filter((p) => live(p.subPartTemplateId)),
      colliders: env.data.colliders.filter((c) => live(c.ownerTemplateId)),
      lights: env.data.lights.filter((l) => live(l.ownerTemplateId)),
      subPartGameData: env.data.subPartGameData.filter((s) => live(s.subPartTemplateId)),
      internalFlags: Object.fromEntries(
        Object.entries(env.data.internalFlags).filter(([templateId]) => live(templateId)),
      ),
    },
  };
}

/** Resets any material channel pointing at a texture that did not survive the wire. */
function stripDeadTextureRefs(
  mat: CustomMaterial,
  alive: (id: string | undefined) => boolean,
): CustomMaterial {
  const out = createDefaultMaterial(mat.id, mat.name);
  out.baseColor =
    mat.baseColor.kind === 'map' && !alive(mat.baseColor.textureId)
      ? createDefaultMaterial(mat.id, mat.name).baseColor
      : mat.baseColor;
  out.metalness =
    mat.metalness.kind === 'map' && !alive(mat.metalness.textureId)
      ? { kind: 'value', value: 0 }
      : mat.metalness;
  out.roughness =
    mat.roughness.kind === 'map' && !alive(mat.roughness.textureId)
      ? { kind: 'value', value: 0.5 }
      : mat.roughness;
  if (mat.occlusion && alive(mat.occlusion.textureId)) out.occlusion = mat.occlusion;
  if (mat.ormPacked && alive(mat.ormPacked.textureId)) out.ormPacked = mat.ormPacked;
  if (mat.normal && alive(mat.normal.textureId)) out.normal = mat.normal;
  return out;
}

/**
 * Faithfully reconstructs a standalone {@link EditingPart} from an export envelope —
 * NO id remapping (the payload's ids are already internally consistent). Used by the
 * share-link "load as a new project" path (see projectStore.loadSharedProject); the
 * paste-Import path uses {@link mergeProjectImport} instead, which merges additively.
 * Custom textures / primitive meshes are never carried, so they start empty.
 */
export function envelopeToPart(env: ProjectExportEnvelope): EditingPart {
  const d = env.data;
  const part: EditingPart = {
    partId: env.sourcePartId || DEFAULT_PART_ID,
    editorTags: [...d.editorTags],
    gameData: d.gameData,
    subPartGameData: d.subPartGameData,
    layers: [...d.layers],
    placements: d.placements,
    connectors: d.connectors,
    colliders: d.colliders,
    ivaSeats: d.ivaSeats,
    lights: d.lights,
    internalFlags: { ...d.internalFlags },
    kittens: d.kittens,
    // Whatever survived the import boundary's backing check: empty for a share link, the
    // archive's textures for a `.flexo.tar.gz` opened as a NEW project (its blobs are
    // adopted verbatim under the new project's namespace, ids unchanged — design §4.3).
    customTextures: d.customTextures ?? [],
    customMaterials: d.customMaterials,
    customMeshes: d.customMeshes,
    animations: d.animations,
    customReactions: d.customReactions ?? [],
  };
  ensureBuiltInLayers(part);
  // A payload is only as trustworthy as whoever wrote it: an entity naming a layer the
  // payload never carried would load invisible-but-live (see {@link clampLayerIds}).
  return clampLayerIds(part);
}

/** Guarantees the undeletable built-in layers exist (in case a payload omitted any). */
function ensureBuiltInLayers(part: EditingPart): void {
  const has = (id: string) => part.layers.some((l) => l.id === id);
  if (!has(DEFAULT_LAYER_ID)) part.layers.unshift(createDefaultLayer());
  if (!has(IVA_SEAT_LAYER_ID)) part.layers.push(createIvaSeatLayer());
  if (!has(KITTEN_LAYER_ID)) part.layers.push(createKittenLayer());
}

/**
 * Additively merges an export envelope into `current`, returning a fresh part plus a
 * summary. Imported entities get collision-free ids; every cross-reference (animation
 * members, solar-tracking subparts, GameData couplings, and placements pointing at an
 * imported kitten custom mesh) is rewritten through the new ids. Layer mapping: each
 * source layer that holds meshes — INCLUDING the source's Default — becomes a NEW layer
 * (keeping its name) so imported content never merges into the user's existing Default;
 * connectors, colliders and lights follow their own source layer through the same mapping,
 * and kittens reuse the built-in Kittens layer.
 */
export function mergeProjectImport(
  current: EditingPart,
  env: ProjectExportEnvelope,
  opts: { adoption?: AssetAdoption } = {},
): MergeResult {
  const part = structuredClone(current);
  const { data } = env;
  const adoption = opts.adoption ?? emptyAdoption();

  // Part Id: adopt the source's only when the destination still carries the placeholder
  // (i.e. importing into a fresh project) — so an Export→Import round-trip preserves it.
  // A destination that already has a real Part Id keeps it; additive paste never renames.
  if ((!part.partId.trim() || part.partId === DEFAULT_PART_ID) && env.sourcePartId.trim()) {
    part.partId = env.sourcePartId;
  }

  const instanceIdMap = new Map<string, string>();
  const connectorIdMap = new Map<string, string>();
  const layerIdMap = new Map<string, string>();
  const subPartIdMap = new Map<string, string>(); // imported customMesh subPartId -> fresh id
  /**
   * SubPart templates whose custom mesh did NOT come across (an unbacked binary asset). Every
   * entity that names one is skipped below rather than merged as a reference into the void —
   * the same completion of the v1 drop rule the parse boundary applies.
   */
  const droppedTemplateIds = new Set<string>();
  const newLayerIds: string[] = [];

  // ── binary-backed textures (design §4.3) ──────────────────────────────────
  // An archive's textures arrive with an ADOPTION plan: each incoming id either resolves to
  // an existing byte-identical texture (dedup — nothing is added) or to a fresh id whose
  // blobs the caller has already copied into this project's namespace. Without a plan the
  // list is empty, because the import boundary dropped every unbacked descriptor.
  const mapTextureId = (id: string): string => adoption.textures.get(id) ?? id;
  /**
   * Which texture ids will actually EXIST in the merged part: the destination's own plus
   * every id the adoption plan resolves to. A reference to anything else — a texture whose
   * pixels the container never brought — is stripped rather than merged as a dangling id.
   */
  const liveTextureIds = new Set([
    ...part.customTextures.map((t) => t.id),
    ...adoption.textures.values(),
  ]);
  const textureAlive = (id: string | undefined): boolean => !!id && liveTextureIds.has(id);
  for (const src of data.customTextures ?? []) {
    const adopted = adoption.copiedTextures.get(src.id);
    if (!adopted) continue; // deduped onto an existing texture, or never backed
    part.customTextures.push({ ...src, id: adopted });
  }
  // Hashes learned while deduping are cached onto the DESTINATION descriptors so a second
  // import of the same archive compares without re-reading every blob. Additive field, so no
  // schema/export version moves (constitution case 1).
  if (adoption.hashes.size > 0) {
    part.customTextures = part.customTextures.map((t) => {
      const sha256 = adoption.hashes.get(t.id);
      return sha256 && t.sha256 !== sha256 ? { ...t, sha256 } : t;
    });
  }

  // Custom meshes. A KITTEN submesh is pure data and always merges (fresh id + subPartId so
  // repeated additive imports never collide). A PRIMITIVE or IMPORTED mesh merges only when
  // the adoption plan carries its geometry: an import batch's GLB is copied once under a
  // fresh importId that every mesh from that batch shares, while `meshName` — the node name
  // INSIDE that GLB — is untouched, because it is the key the geometry resolves by.
  // Everything else remembers its old->new subPartId so placements / colliders / lights /
  // SubPartGameData below repoint at the new template.
  for (const src of data.customMeshes ?? []) {
    if (isDataOnlyMesh(src) && src.kitten) {
      const subPartId = newKittenSubPartId(src.kitten);
      subPartIdMap.set(src.subPartId, subPartId);
      part.customMeshes.push({
        id: newMeshId(),
        name: src.name,
        subPartId,
        kitten: { ...src.kitten },
        faceTextures: {},
      });
      continue;
    }
    // An IMPORTED mesh only comes across when the plan says its GLB was copied; a PRIMITIVE
    // needs no bytes at all, so it mints its own fresh id whenever the plan is silent (a
    // pasted archive payload, say) — the adoption map still wins when one exists, because
    // its emissive-paint blob was copied under that id.
    const meshId =
      adoption.meshes.get(src.id) ?? (meshKind(src) === 'primitive' ? newMeshId() : null);
    if (!meshId) {
      droppedTemplateIds.add(src.subPartId);
      continue;
    }
    const subPartId = newCustomSubPartId(src.name);
    subPartIdMap.set(src.subPartId, subPartId);
    const mesh: CustomMesh = structuredClone(src);
    mesh.id = meshId;
    mesh.subPartId = subPartId;
    if (mesh.imported) {
      mesh.imported.importId =
        adoption.imports.get(mesh.imported.importId) ?? mesh.imported.importId;
    }
    mesh.faceTextures = Object.fromEntries(
      Object.entries(mesh.faceTextures)
        .map(([face, cfg]) => {
          const config = cfg as FaceTextureConfig;
          return [face, { ...config, textureId: mapTextureId(config.textureId) }] as const;
        })
        // A face pointing at a texture the container never brought is dropped, not merged:
        // an id nothing owns would render as an untextured face with a broken reference.
        .filter(([, config]) => textureAlive(config.textureId)),
    );
    part.customMeshes.push(mesh);
  }
  const mapTemplateId = (id: string): string => subPartIdMap.get(id) ?? id;

  const sourceLayerName = new Map<string, string>();
  for (const l of data.layers) sourceLayerName.set(l.id, l.name);

  // Kittens (and the other pinned kinds) reuse their built-in layer; every other source
  // layer — the ordinary ones holding placements, connectors and colliders, INCLUDING the
  // source's Default — is mirrored as a fresh layer, lazily, the first time it's
  // referenced, so imported content never merges into the destination's own Default.
  const getOrCreateImportLayer = (oldLayerId: string): string => {
    if (oldLayerId === KITTEN_LAYER_ID) return oldLayerId;
    const existing = layerIdMap.get(oldLayerId);
    if (existing) return existing;
    const id = nextLayerId(part);
    part.layers.push({ id, name: sourceLayerName.get(oldLayerId) ?? 'Imported' });
    layerIdMap.set(oldLayerId, id);
    newLayerIds.push(id);
    return id;
  };

  // Meshes — regenerate instanceId against the growing list (matches addSubPart/addPart).
  // Template id is repointed when it names an imported (kitten) custom mesh.
  for (const src of data.placements) {
    if (droppedTemplateIds.has(src.subPartTemplateId)) continue;
    const templateId = mapTemplateId(src.subPartTemplateId);
    const base = lastSegmentLower(templateId);
    const count = part.placements.filter((p) => p.subPartTemplateId === templateId).length;
    const instanceId = `${base}_${count + 1}`;
    part.placements.push({
      instanceId,
      subPartTemplateId: templateId,
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      scale: vec(src.scale, 1),
      layerId: getOrCreateImportLayer(src.layerId),
    });
    instanceIdMap.set(src.instanceId, instanceId);
  }

  // Per-template `<Internal>` (interior-only) overrides. The key is a SubPart TEMPLATE id, so
  // it goes through the SAME mapTemplateId the placements above use — an imported kitten mesh
  // gets a fresh subPartId, and a raw key copy would flag a template that no longer exists.
  // Incoming keys win ONLY for templates this paste actually brings in (plans/IVA_PLAN.md
  // §3.7): a payload carrying a flag for a template it never places must not silently re-flag
  // the destination's own copy of it.
  const importedTemplates = new Set(data.placements.map((p) => mapTemplateId(p.subPartTemplateId)));
  for (const [key, internal] of Object.entries(data.internalFlags)) {
    if (droppedTemplateIds.has(key)) continue;
    const templateId = mapTemplateId(key);
    if (importedTemplates.has(templateId)) part.internalFlags[templateId] = internal;
  }

  // Connectors — mirrored onto the same imported layer their source layer maps to, fresh
  // _connectorN ids.
  const connectorStart = part.connectors.length;
  for (const src of data.connectors) {
    const id = nextConnectorId(part);
    part.connectors.push({
      id,
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      scale: vec(src.scale, 1),
      flags: [...(src.flags ?? [])],
      capabilities: [...(src.capabilities ?? [])],
      siblingIds: [...(src.siblingIds ?? [])],
      layerId: getOrCreateImportLayer(src.layerId),
    });
    connectorIdMap.set(src.id, id);
  }
  // Rewire sibling refs to the regenerated ids (drop any pointing outside the pasted set).
  for (let i = connectorStart; i < part.connectors.length; i++) {
    part.connectors[i].siblingIds = part.connectors[i].siblingIds
      .map((s) => connectorIdMap.get(s))
      .filter((s): s is string => s != null);
  }

  // Colliders — mirrored onto their source layer's imported twin, fresh _colliderN ids. Nothing
  // references a collider by id (it is not in the feed-container namespace — only the
  // `<Collider>` COMPONENT id is, and flexo generates that at serialize time), so unlike
  // connectors there is no ref map to thread through. `ownerTemplateId` IS a reference
  // though: it names a SubPart TEMPLATE, and an imported kitten mesh gets a fresh
  // template id, so route it through the same map the placements use.
  for (const src of data.colliders ?? []) {
    if (src.ownerTemplateId && droppedTemplateIds.has(src.ownerTemplateId)) continue;
    part.colliders.push({
      id: nextColliderId(part),
      shape: src.shape,
      ownerTemplateId: src.ownerTemplateId ? mapTemplateId(src.ownerTemplateId) : null,
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      scale: vec(src.scale, 1),
      layerId: getOrCreateImportLayer(src.layerId),
    });
  }

  // Lights — mirrored onto their source layer's imported twin, fresh _lightN ids. Nothing
  // references a light by id (it is editor-only and never emitted to XML), so there is no
  // ref map to thread through. `ownerTemplateId` IS a reference though: it names a SubPart
  // TEMPLATE, and an imported kitten mesh gets a fresh template id, so route it through the
  // same map the placements (and colliders) use.
  for (const src of data.lights ?? []) {
    if (src.ownerTemplateId && droppedTemplateIds.has(src.ownerTemplateId)) continue;
    part.lights.push({
      id: nextLightId(part),
      type: src.type === 'Point' ? 'Point' : 'Spot',
      ownerTemplateId: src.ownerTemplateId ? mapTemplateId(src.ownerTemplateId) : null,
      rangeM: src.rangeM,
      intensity: src.intensity,
      color: { r: src.color?.r ?? 1, g: src.color?.g ?? 1, b: src.color?.b ?? 1 },
      innerAngleRad: src.innerAngleRad,
      outerAngleRad: src.outerAngleRad,
      rayTracing: !!src.rayTracing,
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      // Pinned, not copied: KSA ignores light scale and the model invariant is "always
      // (1,1,1)" — a hand-edited payload must not be able to smuggle one in.
      scale: { x: 1, y: 1, z: 1 },
      layerId: getOrCreateImportLayer(src.layerId),
    });
  }

  // IVA seats — always on the built-in IVA Seats layer, fresh _seatN ids. Nothing
  // references a seat by id (the id is editor-only and never emitted to XML), so there is
  // no ref map to thread through. Order matters, though: the incoming seats keep their
  // relative document order and are APPENDED after the existing ones, so the destination's
  // seat 0 — the one IVA opens on — stays the default.
  for (const src of data.ivaSeats) {
    part.ivaSeats.push({
      id: nextIvaSeatId(part),
      // The AUTHORED `<IVASeat Id>` rides along (an <EVADoor SeatId> may name it); the
      // editor-only `_seatN` is regenerated above.
      ksaId: src.ksaId ?? null,
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      scale: vec(src.scale, 1),
      layerId: IVA_SEAT_LAYER_ID,
    });
  }

  // Kittens — always on the built-in Kittens layer, fresh kitten_N ids.
  for (const src of data.kittens) {
    part.kittens.push({
      id: nextKittenId(part),
      kind: src.kind,
      position: vec(src.position, 0),
      rotation: vec(src.rotation, 0),
      scale: vec(src.scale, 1),
      layerId: KITTEN_LAYER_ID,
    });
  }

  for (const tag of data.editorTags) {
    if (!part.editorTags.includes(tag)) part.editorTags.push(tag);
  }

  mergeGameData(part.gameData, data.gameData, connectorIdMap, instanceIdMap);

  // Per-SubPart tanks / solar panels / engine modules: append to an existing template
  // entry, else add the entry. Repoint the template id if it names an imported custom
  // mesh; remap any rocket SubPart-instance refs onto the freshly-generated ids.
  for (const sg of data.subPartGameData) {
    if (droppedTemplateIds.has(sg.subPartTemplateId)) continue;
    const templateId = mapTemplateId(sg.subPartTemplateId);
    const tanks = (sg.tanks ?? []).map((t) => ({ ...t }));
    const solarPanels = (sg.solarPanels ?? []).map((sp) => structuredClone(sp));
    // A consumer's feed points name connectors/placements in the SOURCE id space.
    const combustors = (sg.combustors ?? []).map((c) =>
      remapConsumerFeeds(structuredClone(c), connectorIdMap, instanceIdMap),
    );
    const nozzles = (sg.nozzles ?? []).map((n) => structuredClone(n));
    const rockets = (sg.rockets ?? []).map((r) => remapRocket(r, instanceIdMap));
    const solidMotors = (sg.solidMotors ?? []).map((m) =>
      remapConsumerFeeds(structuredClone(m), connectorIdMap, instanceIdMap),
    );
    const solidNozzles = (sg.solidNozzles ?? []).map((n) => structuredClone(n));
    const solidGrainSegments = (sg.solidGrainSegments ?? []).map((s) => structuredClone(s));
    const existing = part.subPartGameData.find((x) => x.subPartTemplateId === templateId);
    if (existing) {
      existing.tanks.push(...tanks);
      existing.solarPanels.push(...solarPanels);
      existing.combustors.push(...combustors);
      existing.nozzles.push(...nozzles);
      existing.rockets.push(...rockets);
      existing.solidMotors.push(...solidMotors);
      existing.solidNozzles.push(...solidNozzles);
      existing.solidGrainSegments.push(...solidGrainSegments);
    } else {
      const entry = createSubPartGameData(templateId);
      entry.tanks = tanks;
      entry.solarPanels = solarPanels;
      entry.combustors = combustors;
      entry.nozzles = nozzles;
      entry.rockets = rockets;
      entry.solidMotors = solidMotors;
      entry.solidNozzles = solidNozzles;
      entry.solidGrainSegments = solidGrainSegments;
      part.subPartGameData.push(entry);
    }
  }

  // Animations: fresh id (so re-pasting the same export can't collide), members +
  // solar-tracking refs remapped to the new instanceIds (danglers dropped).
  for (const srcAnim of data.animations) {
    const anim = structuredClone(srcAnim);
    anim.id = newAnimId();
    for (const joint of anim.joints) {
      joint.memberInstanceIds = remapIds(joint.memberInstanceIds, instanceIdMap);
    }
    if (anim.solarTracking) {
      const driven = instanceIdMap.get(anim.solarTracking.subPartInstanceId);
      if (!driven) {
        anim.solarTracking = null;
      } else {
        anim.solarTracking.subPartInstanceId = driven;
        anim.solarTracking.excludeInstanceIds = remapIds(
          anim.solarTracking.excludeInstanceIds,
          instanceIdMap,
        );
      }
    }
    part.animations.push(anim);
  }

  // Custom materials are pure descriptors: add those not already present by id, so pasting
  // the same export twice never duplicates the library. Their map channels name TEXTURES, so
  // each one goes through the adoption map — a channel left on the source's texture id would
  // point at a texture this project does not own (or, worse, at an unrelated one that
  // happened to reuse the id).
  for (const cm of data.customMaterials ?? []) {
    if (!part.customMaterials.some((m) => m.id === cm.id)) {
      const remapped = remapMaterialTextures(structuredClone(cm), mapTextureId);
      part.customMaterials.push(stripDeadTextureRefs(remapped, textureAlive));
    }
  }

  // Custom propellants are pure data with no instance refs: add those the project
  // doesn't already have (by id), so a combustor referencing one keeps resolving.
  for (const cp of data.customReactions ?? []) {
    if (!part.customReactions.some((p) => p.id === cp.id)) {
      part.customReactions.push(structuredClone(cp));
    }
  }

  return {
    part,
    summary: {
      meshes: part.placements.length - current.placements.length,
      connectors: data.connectors.length,
      colliders: data.colliders?.length ?? 0,
      ivaSeats: data.ivaSeats.length,
      lights: data.lights?.length ?? 0,
      kittens: data.kittens.length,
      newLayers: newLayerIds.length,
      animations: data.animations.length,
    },
    newLayerIds,
    adoption,
  };
}

/** Rewrites every texture reference in a material through the adoption map. */
function remapMaterialTextures(mat: CustomMaterial, map: (id: string) => string): CustomMaterial {
  if (mat.baseColor.kind === 'map') mat.baseColor.textureId = map(mat.baseColor.textureId);
  if (mat.metalness.kind === 'map') mat.metalness.textureId = map(mat.metalness.textureId);
  if (mat.roughness.kind === 'map') mat.roughness.textureId = map(mat.roughness.textureId);
  if (mat.occlusion) mat.occlusion.textureId = map(mat.occlusion.textureId);
  if (mat.ormPacked) mat.ormPacked.textureId = map(mat.ormPacked.textureId);
  if (mat.normal) mat.normal.textureId = map(mat.normal.textureId);
  return mat;
}

function mergeGameData(
  target: PartGameData,
  src: PartGameData,
  connectorIdMap: Map<string, string>,
  instanceIdMap: Map<string, string>,
): void {
  if (!target.displayName.trim() && src.displayName?.trim()) target.displayName = src.displayName;
  if (target.customMass == null && src.customMass != null) {
    target.customMass = src.customMass;
    target.customMassExtras = structuredClone(src.customMassExtras ?? []);
  }
  if (target.diameterM == null && src.diameterM != null) target.diameterM = src.diameterM;
  if (!target.controllable && src.controllable) target.controllable = true;
  // Unmodeled passthrough XML: fill only when the target has none (first part's leftover wins).
  // Connector refs inside the raw XML (<Aligned>/<SymmetryGroup> <ConnectorRef>s) are in the
  // source's original id space — rewrite them onto the regenerated connector ids.
  if (
    Object.keys(target.unknownAttrs).length === 0 &&
    Object.keys(src.unknownAttrs ?? {}).length > 0
  )
    target.unknownAttrs = { ...src.unknownAttrs };
  if (target.unknownChildren.length === 0 && (src.unknownChildren ?? []).length > 0)
    target.unknownChildren = remapRawConnectorRefs(src.unknownChildren, connectorIdMap);
  target.batteries.push(...(src.batteries ?? []).map((b) => ({ ...b })));
  target.generators.push(...(src.generators ?? []).map((g) => ({ ...g })));
  target.solarPanels.push(...(src.solarPanels ?? []).map((sp) => structuredClone(sp)));
  // Single consumer per part: keep the target's, adopt the source's only when empty.
  if (!target.powerConsumer && src.powerConsumer) target.powerConsumer = { ...src.powerConsumer };
  if (target.decoupler == null && src.decoupler) {
    const id = connectorIdMap.get(src.decoupler.connectorId);
    if (id) target.decoupler = { connectorId: id, force: src.decoupler.force };
  }
  if (target.dockingPort == null && src.dockingPort) {
    const id = connectorIdMap.get(src.dockingPort.connectorId);
    if (id)
      target.dockingPort = {
        connectorId: id,
        latchingKineticEnergyJ: src.dockingPort.latchingKineticEnergyJ,
        pushoffImpulseNs: src.dockingPort.pushoffImpulseNs,
      };
  }
  if (target.evaDoor == null && src.evaDoor) {
    // Not connector-bound (`EVADoorTemplate` has only `SeatId`), so nothing to remap.
    target.evaDoor = { seatId: src.evaDoor.seatId ?? null };
  }
  // Engine modules: append with every SubPart-instance reference remapped to the
  // freshly-generated instance ids (mirrors applyImportedGameData in editorStore).
  target.rocketControllers.push(
    ...(src.rocketControllers ?? []).map((c) => ({
      ...c,
      rocketRefs: c.rocketRefs.map((r) => remapRef(r, instanceIdMap)),
    })),
  );
  target.rockets.push(...(src.rockets ?? []).map((r) => remapRocket(r, instanceIdMap)));
  target.combustors.push(
    ...(src.combustors ?? []).map((c) =>
      remapConsumerFeeds(structuredClone(c), connectorIdMap, instanceIdMap),
    ),
  );
  target.nozzles.push(...(src.nozzles ?? []).map((n) => structuredClone(n)));
  target.gimbals.push(
    ...(src.gimbals ?? []).map((g) => ({
      ...g,
      subPartInstanceId: instanceIdMap.get(g.subPartInstanceId) ?? g.subPartInstanceId,
    })),
  );
  // Plumbing topology (KSA 2026.7.9): tanks are plain containers; solid motors and the
  // wiring entries carry feed points / placement scopes in the SOURCE id space.
  target.tanks.push(...(src.tanks ?? []).map((t) => structuredClone(t)));
  target.solidMotors.push(
    ...(src.solidMotors ?? []).map((m) =>
      remapConsumerFeeds(structuredClone(m), connectorIdMap, instanceIdMap),
    ),
  );
  target.solidNozzles.push(...(src.solidNozzles ?? []).map((n) => structuredClone(n)));
  target.solidGrainSegments.push(...(src.solidGrainSegments ?? []).map((s) => structuredClone(s)));
  target.consumerFeedWiring.push(
    ...(src.consumerFeedWiring ?? []).map((w) =>
      remapConsumerFeedWiring(structuredClone(w), connectorIdMap, instanceIdMap),
    ),
  );
}

/** Remaps a module→SubPart-instance ref through the import id map (null ⇒ root, unchanged). */
function remapRef(ref: SubPartIdRef, map: Map<string, string>): SubPartIdRef {
  if (!ref.subPartInstanceId) return { id: ref.id, subPartInstanceId: ref.subPartInstanceId };
  return { id: ref.id, subPartInstanceId: map.get(ref.subPartInstanceId) ?? ref.subPartInstanceId };
}

/** Remaps a rocket's core + nozzle SubPart-instance refs through the import id map. */
function remapRocket(rocket: Rocket, map: Map<string, string>): Rocket {
  return {
    id: rocket.id,
    core: remapRef(rocket.core, map),
    nozzles: rocket.nozzles.map((n) => remapRef(n, map)),
  };
}

function remapIds(ids: string[], map: Map<string, string>): string[] {
  return ids.map((id) => map.get(id)).filter((id): id is string => id != null);
}

// ── local id allocators (pure copies of the editorStore versions; kept here to
//    avoid a circular import on the store) ────────────────────────────────────

function vec(v: Partial<Vec3> | undefined, def: number): Vec3 {
  return { x: v?.x ?? def, y: v?.y ?? def, z: v?.z ?? def };
}

function lastSegmentLower(templateId: string): string {
  const seg = templateId.split('.').pop() ?? templateId;
  return seg.toLowerCase();
}

function nextLayerId(part: EditingPart): string {
  let max = 0;
  for (const l of part.layers) {
    const m = /^layer(\d+)$/.exec(l.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `layer${max + 1}`;
}

function nextConnectorId(part: EditingPart): string {
  let max = 0;
  for (const c of part.connectors) {
    const m = /^_connector(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `_connector${max + 1}`;
}

function nextColliderId(part: EditingPart): string {
  let max = 0;
  for (const c of part.colliders) {
    const m = /^_collider(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `_collider${max + 1}`;
}

function nextIvaSeatId(part: EditingPart): string {
  let max = 0;
  for (const s of part.ivaSeats) {
    const m = /^_seat(\d+)$/.exec(s.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `_seat${max + 1}`;
}

function nextLightId(part: EditingPart): string {
  let max = 0;
  for (const l of part.lights) {
    const m = /^_light(\d+)$/.exec(l.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `_light${max + 1}`;
}

function nextKittenId(part: EditingPart): string {
  let max = 0;
  for (const k of part.kittens) {
    const m = /^kitten_(\d+)$/.exec(k.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `kitten_${max + 1}`;
}

/** An 8-char random token (mirrors customAssetStore's shortId). */
function shortHash(): string {
  return randomId().replace(/-/g, '').slice(0, 8);
}

function newAnimId(): string {
  return `anim_${shortHash()}`;
}

/** Fresh customMesh descriptor id (IndexedDB key shape; kitten meshes store no binary). */
function newMeshId(): string {
  return `mesh_${shortHash()}`;
}

/** Fresh kitten SubPart template id, matching customAssetStore's `flexo_<kind>_<spec>_<rand>`. */
function newKittenSubPartId(kitten: KittenMeshSource): string {
  return `flexo_${kitten.kind}_${kitten.specKey}_${shortHash()}`;
}

/**
 * Fresh SubPart template id for an adopted primitive/imported mesh, matching
 * customAssetStore's / importNormalize's `flexo_<Sanitized Name>_<rand>` shape.
 */
function newCustomSubPartId(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Asset';
  return `flexo_${cleaned}_${shortHash()}`;
}
