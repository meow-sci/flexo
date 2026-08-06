import { compressZstd, decompressZstd } from '../ktx/zstd';
import { base64UrlToBytes, bytesToBase64Url } from '../util/base64url';
import {
  buildProjectExport,
  parseProjectImport,
  serializeProjectJson,
  type ParseResult,
  type ProjectPartSource,
} from './projectTransfer';

/**
 * STATELESS SHARE LINKS — encodes an entire project into a single URL so it can be
 * shared with no server/storage. The pipeline:
 *
 *   every part (partsStore.snapshotParts())
 *               → compact JSON (projectCodec, short keys + dropped defaults)
 *               → Zstd compress (the JSON is highly repetitive → big win)
 *               → URL-safe Base64 → `?load=<payload>`
 *
 * and the exact reverse on load. Compression + the compact codec together keep even
 * fairly large projects inside a practical URL length. Loading a link is handled at
 * boot (main.tsx) → projectStore.loadSharedProject, which opens it as a NEW project.
 *
 * **ALL parts travel, including the ones excluded from KSA export**: a share is a transfer of
 * the whole project, not a KSA export, so `includeInExport` rides along as data rather than
 * filtering anything out.
 */

/** The query-string parameter that carries a shared project payload. */
export const SHARE_PARAM = 'load';

/**
 * Zstd level for share links. Higher than the texture default — the payload is tiny,
 * so we spend the extra CPU for the shortest possible URL. 19 is the max "standard"
 * level (20–22 are "ultra" and need a larger window than this data warrants).
 */
const SHARE_ZSTD_LEVEL = 19;

/** Encodes an export envelope's worth of project state into a `?load=` payload string. */
export async function encodeSharePayload(
  parts: readonly ProjectPartSource[],
  projectName: string,
  activePartIndex = 0,
): Promise<string> {
  const json = serializeProjectJson(buildProjectExport(parts, projectName, { activePartIndex }));
  const bytes = new TextEncoder().encode(json);
  const compressed = await compressZstd(bytes, SHARE_ZSTD_LEVEL);
  return bytesToBase64Url(compressed);
}

/** Decodes a `?load=` payload back into a parsed/validated project envelope. */
export async function decodeSharePayload(payload: string): Promise<ParseResult> {
  let json: string;
  try {
    const compressed = base64UrlToBytes(payload.trim());
    const bytes = await decompressZstd(compressed);
    json = new TextDecoder().decode(bytes);
  } catch (err) {
    return { ok: false, error: `Could not read shared link: ${(err as Error).message}` };
  }
  return parseProjectImport(json);
}

/** Builds the full shareable URL (origin + app base path + `?load=`) for a payload. */
export function buildShareUrl(payload: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base}?${SHARE_PARAM}=${payload}`;
}

/** Convenience: the full shareable URL for a project's parts. */
export async function createShareLink(
  parts: readonly ProjectPartSource[],
  projectName: string,
  activePartIndex = 0,
): Promise<string> {
  return buildShareUrl(await encodeSharePayload(parts, projectName, activePartIndex));
}

/** Reads the `?load=` payload from the current URL, or null when absent. */
export function readShareParam(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(SHARE_PARAM);
  return value && value.trim() ? value : null;
}

/**
 * Strips the `?load=` param from the address bar (after a link has been consumed) so
 * a reload doesn't re-open the shared project over the user's work. Uses
 * replaceState — no navigation, no history entry.
 */
export function clearShareParam(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SHARE_PARAM)) return;
  url.searchParams.delete(SHARE_PARAM);
  window.history.replaceState(null, '', url.toString());
}
