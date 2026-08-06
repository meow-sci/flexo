import {
  ASSET_KINDS,
  assetKeyFor,
  getAsset,
  listProjectBlobs,
  parseAssetKey,
  putAsset,
  type AssetKind,
} from './assetDb';
import { getMeta, getSnapshot, getThumb, type ProjectCounts, type ProjectId } from './projectDb';
import { gunzip, gzip, gzipSupported, tarPack, tarUnpack } from './tarArchive';
import {
  buildProjectExport,
  emptyAdoption,
  parseProjectImport,
  serializeProjectJson,
  type AssetAdoption,
  type ProjectExportEnvelope,
} from './projectTransfer';
import { PROJECT_EXPORT_VERSION } from './projectCodec';
import { meshKind, type CustomMesh, type CustomTexture, type EditingPart } from '../ksa/types';

/**
 * The `.flexo.tar.gz` PROJECT ARCHIVE — flexo's portable, complete project container
 * (design: `plans/flexo_v2/design/design-projects-export.md` §4, decisions D8/D9;
 * DECISIONS.md #3, LOCKED: *"export a `.tar.gz` archive containing `project.json` plus any
 * binary files needed … This replaces the JSON-snippet export and removes the
 * hasCustomAssets gate"*).
 *
 * ```
 * <Name>.flexo.tar.gz            gzip over a USTAR tar
 * ├── manifest.json              MUST be the first entry
 * ├── project.json               the wire envelope — the SAME one the codec already produces
 * ├── thumbnail.webp             optional
 * └── assets/<kind>/<assetId>    one entry per blob, kinds straight from assetDb
 * ```
 *
 * **One serializer, no archive-only dialect**: `project.json` is byte-for-byte what
 * `serializeProjectJson(buildProjectExport(...))` writes for any other transfer path. What
 * the archive changes is not the format but the CONTAINER's promise — it carries the bytes,
 * so `buildProjectExport` is called with `includeBinaryBacked` and the import boundary is
 * handed the asset table that lets the descriptors through.
 *
 * **Versioning is exact-match, both numbers, per the no-migration constitution**: see
 * {@link ARCHIVE_VERSION}. There is no conversion path here and none may be added.
 *
 * **Layering**: no react / three imports. The only I/O is IndexedDB (the two project stores)
 * and the Web Streams gzip; `gzipSupported()` is surfaced by the DIALOG, not thrown from
 * here.
 */

/**
 * The container LAYOUT version — which entries exist and what they are called.
 *
 * Import requires an exact match, exactly like `PROJECT_EXPORT_VERSION` does for
 * `project.json`, and for the same reason: flexo never converts formats (AGENTS.md "project
 * constitution"). The two numbers are independent — a manifest field added additively bumps
 * NEITHER (an older reader ignores it, a newer reader defaults it), a layout break bumps this
 * one, and the wire rules for `exportVersion` remain the codec's own contract.
 */
export const ARCHIVE_VERSION = 1;

/** The `format` marker — the first thing parse checks, so a random .tar.gz fails fast. */
export const ARCHIVE_FORMAT = 'flexo-project-archive';

export const MANIFEST_PATH = 'manifest.json';
export const PROJECT_PATH = 'project.json';
export const THUMBNAIL_PATH = 'thumbnail.webp';

/** One blob, as the manifest lists it. */
export interface ArchiveAssetManifestEntry {
  kind: AssetKind;
  id: string;
  /** `assets/<kind>/<id>` — the tar entry that holds the bytes. */
  path: string;
  bytes: number;
  mime: string;
  /** Lowercase hex SHA-256 of the bytes; also what import dedup compares. */
  sha256: string;
}

export interface ArchiveManifest {
  format: typeof ARCHIVE_FORMAT;
  archiveVersion: number;
  exportVersion: number;
  name: string;
  description: string;
  savedAt: number;
  appBuildId: string;
  counts: ProjectCounts;
  assets: ArchiveAssetManifestEntry[];
}

/** One blob with its bytes — what parse hands back and import copies from. */
export interface ArchiveAssetEntry {
  kind: AssetKind;
  id: string;
  bytes: Uint8Array;
  mime: string;
  sha256: string;
}

export type AssetTable = ArchiveAssetEntry[];

export type ArchiveParseResult =
  | {
      ok: true;
      manifest: ArchiveManifest;
      envelope: ProjectExportEnvelope;
      assets: AssetTable;
      thumbnail: Blob | null;
    }
  | { ok: false; error: string };

export type ArchivePhase = 'collect' | 'pack' | 'compress';

export interface BuildArchiveOptions {
  signal?: AbortSignal;
  onProgress?: (phase: ArchivePhase, done: number, total: number) => void;
}

// ── hashing ──────────────────────────────────────────────────────────────────

const HEX = '0123456789abcdef';

/** Lowercase hex SHA-256. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  let out = '';
  for (const byte of new Uint8Array(digest)) out += HEX[byte >> 4] + HEX[byte & 15];
  return out;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function abortIfRequested(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('The archive build was cancelled.', 'AbortError');
}

// ── build ────────────────────────────────────────────────────────────────────

/**
 * Builds one project's archive from its STORED records — never from live editor state, which
 * is what lets the Project Manager export any row without opening it. The current project's
 * caller flushes autosave first (design §4.2).
 *
 * Rejects with an `AbortError` `DOMException` when `signal` fires; no partial Blob escapes.
 */
export async function buildProjectArchive(
  id: ProjectId,
  opts: BuildArchiveOptions = {},
): Promise<Blob> {
  const { signal, onProgress } = opts;
  abortIfRequested(signal);
  const meta = await getMeta(id);
  const snapshot = await getSnapshot(id);
  if (!meta || !snapshot) throw new Error('That project could not be read from storage.');

  const keys = await listProjectBlobs(id);
  const total = keys.length;
  onProgress?.('collect', 0, total);

  const manifestAssets: ArchiveAssetManifestEntry[] = [];
  const entries: { name: string; bytes: Uint8Array }[] = [];
  let done = 0;
  for (const key of keys) {
    abortIfRequested(signal);
    const parsed = parseAssetKey(key);
    const blob = parsed ? await getAsset(key) : undefined;
    if (parsed && blob) {
      const bytes = await blobBytes(blob);
      const path = `assets/${parsed.kind}/${parsed.id}`;
      manifestAssets.push({
        kind: parsed.kind,
        id: parsed.id,
        path,
        bytes: bytes.length,
        mime: blob.type || 'application/octet-stream',
        sha256: await sha256Hex(bytes),
      });
      entries.push({ name: path, bytes });
    }
    onProgress?.('collect', ++done, total);
  }

  abortIfRequested(signal);
  // Every part of the stored snapshot rides in the envelope, the active one flagged by index.
  // P2.06 (MULTI_PART_PLAN) adds the manifest's per-part list + summed counts on top of this.
  const activeIndex = snapshot.parts.findIndex((p) => p.id === snapshot.activePartId);
  const envelope = buildProjectExport(snapshot.parts, meta.name, {
    includeBinaryBacked: true,
    activePartIndex: Math.max(activeIndex, 0),
  });
  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    archiveVersion: ARCHIVE_VERSION,
    exportVersion: PROJECT_EXPORT_VERSION,
    name: meta.name,
    description: meta.description,
    savedAt: meta.savedAt,
    appBuildId: import.meta.env.VITE_BUILD_ID ?? 'dev',
    counts: meta.counts,
    assets: manifestAssets,
  };

  const encoder = new TextEncoder();
  // Order is load-bearing: the manifest MUST be the first tar entry (§4.1), so a reader can
  // learn what it is holding without inflating the whole archive.
  const packed: { name: string; bytes: Uint8Array }[] = [
    { name: MANIFEST_PATH, bytes: encoder.encode(JSON.stringify(manifest)) },
    { name: PROJECT_PATH, bytes: encoder.encode(serializeProjectJson(envelope)) },
  ];
  const thumb = meta.hasThumb ? await getThumb(id) : undefined;
  if (thumb) packed.push({ name: THUMBNAIL_PATH, bytes: await blobBytes(thumb) });
  packed.push(...entries);

  abortIfRequested(signal);
  onProgress?.('pack', 0, packed.length);
  const tar = tarPack(packed);
  onProgress?.('pack', packed.length, packed.length);

  abortIfRequested(signal);
  onProgress?.('compress', 0, 1);
  const compressed = await gzip(tar);
  abortIfRequested(signal);
  onProgress?.('compress', 1, 1);
  return new Blob([compressed.slice() as unknown as BlobPart], { type: 'application/gzip' });
}

/** `<sanitized project name>.flexo.tar.gz`. */
export function archiveFileName(name: string): string {
  const cleaned =
    name
      .trim()
      .replace(/[^A-Za-z0-9 _-]+/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'project';
  return `${cleaned}.flexo.tar.gz`;
}

// ── parse ────────────────────────────────────────────────────────────────────

const NOT_AN_ARCHIVE = 'Not a flexo archive.';

/**
 * Reads an archive back. Total and tolerant at the container level, EXACT at the two version
 * gates — every failure is a message the dialog renders verbatim (§4.3), and nothing is
 * applied to the workspace from here.
 */
export async function parseProjectArchive(
  file: Blob,
  opts: { signal?: AbortSignal } = {},
): Promise<ArchiveParseResult> {
  abortIfRequested(opts.signal);
  let tar: Uint8Array;
  try {
    tar = await gunzip(await blobBytes(file));
  } catch {
    return { ok: false, error: NOT_AN_ARCHIVE };
  }
  let entries: { name: string; bytes: Uint8Array }[];
  try {
    entries = tarUnpack(tar);
  } catch {
    return { ok: false, error: NOT_AN_ARCHIVE };
  }
  const byName = new Map(entries.map((entry) => [entry.name, entry.bytes]));
  const decoder = new TextDecoder();

  const manifestBytes = byName.get(MANIFEST_PATH);
  if (!manifestBytes) return { ok: false, error: NOT_AN_ARCHIVE };
  let manifest: ArchiveManifest;
  try {
    manifest = JSON.parse(decoder.decode(manifestBytes)) as ArchiveManifest;
  } catch {
    return { ok: false, error: NOT_AN_ARCHIVE };
  }
  if (manifest?.format !== ARCHIVE_FORMAT) return { ok: false, error: NOT_AN_ARCHIVE };

  // Both versions are exact-match. flexo never converts formats — a mismatch is reported with
  // both numbers so the user knows which flexo to re-export from (design §4.1).
  if (manifest.archiveVersion !== ARCHIVE_VERSION) {
    return {
      ok: false,
      error: `This archive uses container format v${manifest.archiveVersion}; this flexo reads v${ARCHIVE_VERSION}. flexo never converts formats — re-export it from a matching flexo version.`,
    };
  }
  if (manifest.exportVersion !== PROJECT_EXPORT_VERSION) {
    return {
      ok: false,
      error: `This archive uses format v${manifest.exportVersion}; this flexo reads v${PROJECT_EXPORT_VERSION}. flexo never converts formats — re-export it from a matching flexo version.`,
    };
  }

  const assets: AssetTable = [];
  for (const entry of manifest.assets ?? []) {
    const bytes = byName.get(entry.path);
    if (!bytes) {
      return {
        ok: false,
        error: `Archive is incomplete (missing ${entry.path}). Nothing was imported.`,
      };
    }
    if (!ASSET_KINDS.includes(entry.kind)) continue;
    assets.push({
      kind: entry.kind,
      id: entry.id,
      bytes,
      mime: entry.mime || 'application/octet-stream',
      sha256: entry.sha256,
    });
  }

  const projectBytes = byName.get(PROJECT_PATH);
  if (!projectBytes) return { ok: false, error: NOT_AN_ARCHIVE };
  const parsed = parseProjectImport(decoder.decode(projectBytes), { binaryAssets: assets });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const thumbBytes = byName.get(THUMBNAIL_PATH);
  return {
    ok: true,
    manifest,
    envelope: parsed.env,
    assets,
    thumbnail: thumbBytes
      ? new Blob([thumbBytes.slice() as unknown as BlobPart], { type: 'image/webp' })
      : null,
  };
}

// ── import ───────────────────────────────────────────────────────────────────

/** A fresh 8-char token, matching `customAssetStore.shortId`'s shape. */
function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

function tableEntry(assets: AssetTable, kind: AssetKind, id: string): ArchiveAssetEntry | null {
  return assets.find((entry) => entry.kind === kind && entry.id === id) ?? null;
}

/**
 * Decides what each incoming binary-backed asset becomes in the DESTINATION project
 * (design §4.3).
 *
 * - **Textures dedup.** Candidates are the destination's textures of the same CHANNEL whose
 *   stored source blob has the same byte length; a matching SHA-256 means the same image, so
 *   the incoming id simply resolves onto the incumbent and no blob is copied. Destination
 *   hashes are computed lazily here and cached back onto the descriptor by the merge.
 * - **Meshes and imports never dedup** — identity is load-bearing (two identical boxes are
 *   two SubParts). They always get fresh ids; an import BATCH gets one fresh id shared by
 *   every mesh that came from that file, so the one copy of its geometry stays one copy.
 * - A PRIMITIVE mesh carries no geometry blob at all (it is rebuilt from its `PrimitiveSpec`),
 *   so it is adopted unconditionally; only an IMPORTED mesh is gated on its GLB being in the
 *   table.
 */
export async function planAssetAdoption(
  destinationProjectId: ProjectId,
  destination: EditingPart,
  incoming: { textures: readonly CustomTexture[]; meshes: readonly CustomMesh[] },
  assets: AssetTable,
): Promise<AssetAdoption> {
  const adoption = emptyAdoption();

  const candidates = new Map<string, CustomTexture[]>();
  for (const texture of destination.customTextures) {
    const list = candidates.get(texture.channel);
    if (list) list.push(texture);
    else candidates.set(texture.channel, [texture]);
  }
  const sizeCache = new Map<string, number>();
  const hashCache = new Map<string, string>();
  for (const texture of destination.customTextures) {
    if (texture.sha256) hashCache.set(texture.id, texture.sha256);
  }

  for (const texture of incoming.textures) {
    const source = tableEntry(assets, 'tex-src', texture.id);
    if (!source) continue; // unbacked descriptors were dropped at the parse boundary
    let matched: string | null = null;
    for (const candidate of candidates.get(texture.channel) ?? []) {
      let size = sizeCache.get(candidate.id);
      if (size === undefined) {
        const blob = await getAsset(assetKeyFor(destinationProjectId, 'tex-src', candidate.id));
        size = blob?.size ?? -1;
        sizeCache.set(candidate.id, size);
      }
      if (size !== source.bytes.length) continue;
      let hash = hashCache.get(candidate.id);
      if (hash === undefined) {
        const blob = await getAsset(assetKeyFor(destinationProjectId, 'tex-src', candidate.id));
        if (!blob) continue;
        hash = await sha256Hex(await blobBytes(blob));
        hashCache.set(candidate.id, hash);
        adoption.hashes.set(candidate.id, hash);
      }
      if (hash === source.sha256) {
        matched = candidate.id;
        break;
      }
    }
    if (matched) {
      adoption.textures.set(texture.id, matched);
      continue;
    }
    const fresh = `tex_${shortId()}`;
    adoption.textures.set(texture.id, fresh);
    adoption.copiedTextures.set(texture.id, fresh);
  }

  for (const mesh of incoming.meshes) {
    switch (meshKind(mesh)) {
      case 'kitten':
        break; // pure data — the merge mints its own ids
      case 'primitive':
        // No binary to check: a primitive is rebuilt from its `PrimitiveSpec`. It still gets
        // a fresh id, because that id keys its painted-glow bitmap.
        adoption.meshes.set(mesh.id, `mesh_${shortId()}`);
        break;
      case 'imported': {
        const importId = mesh.imported?.importId ?? '';
        if (!tableEntry(assets, 'import-glb', importId)) break;
        if (!adoption.imports.has(importId)) adoption.imports.set(importId, `imp_${shortId()}`);
        adoption.meshes.set(mesh.id, `mesh_${shortId()}`);
        break;
      }
    }
  }
  return adoption;
}

/**
 * Copies every adopted blob into `projectId`'s namespace under its NEW id. Runs BEFORE the
 * document merge, so the synchronous mutation that follows is one undo step over a project
 * whose bytes are already in place.
 */
async function copyAdoptedBlobs(
  projectId: ProjectId,
  incomingMeshes: readonly CustomMesh[],
  assets: AssetTable,
  adoption: AssetAdoption,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const writes: { kind: AssetKind; oldId: string; newId: string }[] = [];
  for (const [oldId, newId] of adoption.copiedTextures) {
    writes.push({ kind: 'tex-src', oldId, newId }, { kind: 'tex-ktx2', oldId, newId });
  }
  for (const mesh of incomingMeshes) {
    const newId = adoption.meshes.get(mesh.id);
    if (!newId) continue;
    if (meshKind(mesh) === 'primitive') {
      writes.push({ kind: 'mesh-glb', oldId: mesh.id, newId });
    }
    if (mesh.emissive?.shape === 'painted') {
      writes.push({ kind: 'emissive-paint', oldId: mesh.id, newId });
    }
  }
  for (const [oldId, newId] of adoption.imports) {
    writes.push({ kind: 'import-glb', oldId, newId });
  }

  let done = 0;
  onProgress?.(0, writes.length);
  for (const write of writes) {
    const entry = tableEntry(assets, write.kind, write.oldId);
    // A tier that simply is not in this archive (an unpainted mesh's glow bitmap, a texture
    // whose .ktx2 was never encoded) is not an error — it regenerates on demand.
    if (entry) {
      await putAsset(
        assetKeyFor(projectId, write.kind, write.newId),
        entry.bytes.slice(),
        entry.mime,
      );
    }
    onProgress?.(++done, writes.length);
  }
}

/** Adopts an archive's blobs VERBATIM (ids unchanged) into a brand-new project's namespace. */
async function copyBlobsVerbatim(projectId: ProjectId, assets: AssetTable): Promise<void> {
  for (const entry of assets) {
    await putAsset(assetKeyFor(projectId, entry.kind, entry.id), entry.bytes.slice(), entry.mime);
  }
}

export interface ImportArchiveOptions {
  mode: 'merge' | 'new';
  parsed: Extract<ArchiveParseResult, { ok: true }>;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Applies a parsed archive (design §4.3).
 *
 * - `merge` — additive into the CURRENT project as **one undo step**, with binary assets
 *   adopted under fresh ids and byte-identical textures deduped onto the ones already there.
 * - `new` — a faithful reconstruction as a fresh saved project, switched to, with the blobs
 *   adopted verbatim (the new namespace makes their ids collision-free). Not an undo step:
 *   it arrives as a project, not as an edit.
 *
 * The store imports are deliberately dynamic: this module is otherwise pure enough to unit
 * test against fake IndexedDB, and `editorStore`/`projectStore` drag the whole editor in.
 */
export async function importArchive(
  opts: ImportArchiveOptions,
): Promise<{ mode: 'merge' | 'new'; name: string }> {
  const { mode, parsed, onProgress } = opts;
  const { $currentProjectId } = await import('./projectIndexStore');
  const { hydrateCustomAssets } = await import('./customAssetStore');

  if (mode === 'new') {
    const { loadProjectAsNew } = await import('./projectStore');
    onProgress?.(0, parsed.assets.length);
    const result = await loadProjectAsNew(parsed.envelope, {
      fallbackName: parsed.manifest.name,
      thumbnail: parsed.thumbnail,
      adoptAssets: async (id) => {
        await copyBlobsVerbatim(id, parsed.assets);
        onProgress?.(parsed.assets.length, parsed.assets.length);
      },
    });
    return { mode, name: result.name };
  }

  const { $part, importProjectData } = await import('./editorStore');
  const projectId = $currentProjectId.get();
  // P2.06 (MULTI_PART_PLAN) replaces this branch with the real mode set ('add-parts' +
  // 'merge-into-active'). Until then the merge is single-entry: only the envelope's FIRST
  // part is merged into the active one.
  const entry = parsed.envelope.parts[0];
  const adoption = await planAssetAdoption(
    projectId,
    $part.get(),
    { textures: entry.data.customTextures, meshes: entry.data.customMeshes },
    parsed.assets,
  );
  await copyAdoptedBlobs(projectId, entry.data.customMeshes, parsed.assets, adoption, onProgress);
  importProjectData(entry, { adoption });
  // Re-publish blob URLs / re-register import atlases for the adopted descriptors. The
  // `$part` subscription rebuilds geometry, but texture and glow URLs are hydration's job.
  await hydrateCustomAssets();
  return { mode, name: parsed.manifest.name };
}

export { gzipSupported };
