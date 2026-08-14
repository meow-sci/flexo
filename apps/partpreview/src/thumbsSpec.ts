/**
 * The part-thumbnail contract: how many angles, what the files are called, and
 * what URL each one has in production.
 *
 * Deliberately DEPENDENCY-FREE and erasable-syntax-only (no three, no vite, no
 * `import.meta.env`, no enums/namespaces/parameter properties): three very
 * different runtimes import it and each imposes one of those constraints —
 *
 * - the browser capture page (`./capture.ts`), bundled by Vite;
 * - `scripts/capture-part-thumbs.ts`, executed directly by Node 24's type
 *   stripping, which only ERASES types (it never transpiles);
 * - vitest (`./thumbsSpec.test.ts`).
 *
 * One module so the file names the capture writes, the URLs the manifest
 * advertises, and the angles the turntable renders can never drift apart.
 * See plans/PART_PREVIEW_THUMBS.md §2.6.
 */

// /** Thumbnails per part — a full turntable, evenly spaced. */
export const THUMB_COUNT = 10;

// /** Degrees of camera azimuth between consecutive thumbnails (360 / THUMB_COUNT). */
export const THUMB_STEP_DEG = 36;

/** Default capture size in px (square), overridable with `--width` / `--height`. */
export const DEFAULT_THUMB_SIZE = 400;

/** Three finite numbers — a view direction, or a rotation in degrees. */
export type Vec3 = readonly [number, number, number];

/** A camera view direction, as raw (unnormalized) world-space x/y/z. */
export type ViewDir = Vec3;

/** A whole-part rotation, as world-space XYZ Euler angles in DEGREES. */
export type RotationDeg = Vec3;

/**
 * Direction the camera sits on for angle 0 — a three-quarter view from slightly
 * above, and the same vector `PartPreviewViewport` frames with by default, so a
 * capture with no `--view-dir` matches the live embed's opening pose exactly.
 *
 * Only the DIRECTION matters (it is normalized on use); the distance always comes
 * from the part's own framing. The turntable spins this vector about world Y, so
 * `y` is the elevation knob and the `x`/`z` ratio picks which side angle 0 sees.
 */
export const DEFAULT_VIEW_DIR: ViewDir = [1, 0.8, 1];

/** Query-param name carrying a {@link ViewDir} to `capture.html`. */
export const VIEW_DIR_PARAM = 'dir';

/**
 * The part's own orientation, as world-space XYZ Euler degrees applied to the
 * whole assembled part BEFORE the camera frames it — the knob for standing an
 * upright-in-game part upright in its thumbnail, which no camera direction can
 * do (the turntable orbits about world Y, so a part lying on its side stays on
 * its side from every angle). `90,0,0` tips the part's +Z up, `0,0,90` its +Y.
 *
 * Identity by default, so the capture keeps matching the live embed unless asked
 * otherwise.
 */
export const DEFAULT_PART_ROTATION_DEG: RotationDeg = [0, 0, 90];

/** Query-param name carrying a {@link RotationDeg} to `capture.html`. */
export const ROTATION_PARAM = 'rot';

/** Parses `x,y,z` into three finite numbers, or null. */
export function parseVec3(raw: string): Vec3 | null {
  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length !== 3) return null;
  // `Number('')` is 0, so an empty component would silently read as a zero axis.
  if (parts.some((p) => p === '')) return null;
  const [x, y, z] = parts.map(Number) as [number, number, number];
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

/**
 * Parses an `x,y,z` view direction, or null if it is unusable as one.
 *
 * Rejected on top of {@link parseVec3}: a zero-length vector, and a
 * straight-down/up direction — the turntable rotates about world Y, so a vector
 * with no horizontal component would render {@link THUMB_COUNT} identical frames
 * from a pose whose camera-up is degenerate.
 */
export function parseViewDir(raw: string): ViewDir | null {
  const dir = parseVec3(raw);
  if (!dir) return null;
  const [x, y, z] = dir;
  if (Math.hypot(x, y, z) < 1e-6) return null;
  if (Math.hypot(x, z) < 1e-6) return null;
  return dir;
}

/** Parses `x,y,z` degrees. Any three finite numbers are a legal rotation. */
export function parseRotationDeg(raw: string): RotationDeg | null {
  return parseVec3(raw);
}

/** `x,y,z` — the round-trip partner of {@link parseVec3}. */
export function formatVec3(v: Vec3): string {
  return v.join(',');
}

/** Where the built site lives, absent an explicit `--site-origin`. */
export const DEFAULT_SITE_ORIGIN = 'https://meow.science.fail';

/** Must match `base` in apps/partpreview/vite.config.ts. */
export const PARTPREVIEW_BASE = '/flexo/apps/partpreview/';

/**
 * Thumbnail directory, relative to the mini app's own output/base. Under
 * `assets/` so it rides along with the app's bundle, and so a plain
 * `vite build apps/partpreview` (which empties the whole outDir) is understood
 * to wipe it — see the lifecycle caveat in docs/wiki-part-preview.md.
 */
export const THUMBS_DIR = 'assets/thumbs';

/** Animated-turntable directory, sibling of {@link THUMBS_DIR}, same lifecycle. */
export const GIFS_DIR = 'assets/gifs';

/**
 * Seconds one GIF loop takes, i.e. all {@link THUMB_COUNT} frames — so the frame
 * rate is `THUMB_COUNT / seconds` (10 frames over 4 s = 2.5 fps). Overridable with
 * `--gif-seconds`.
 */
export const DEFAULT_GIF_SECONDS = 4;

/**
 * Marks the one failure the driver must NOT treat as a bug: the part loaded, but
 * has no renderable geometry at all.
 *
 * That is a real state of the Core data, not drift — `KittenBackPackPart`'s only
 * placement instances `<SubPart Id="KittenBackPackSubPart"/>`, which carries no
 * Mesh, so the SubPart catalog has nothing to build. The manifest still lists the
 * part (it has a placement, which is all `part_ids` claims) and the live embed
 * renders it just as empty. So: no thumbnails, no `thumbs` entry, no failure —
 * any OTHER error still fails the run.
 */
export const EMPTY_PART_ERROR = 'flexo-capture: no renderable geometry';

/**
 * What `capture.html` puts on `window.__flexoCapture` and the Node driver calls.
 *
 * Lives here, with the rest of the contract, so the page that implements it and
 * the script that drives it share one definition instead of two hand-kept copies
 * (the driver could not import the page's own module anyway — that pulls in three).
 */
export interface CaptureApi {
  /** False until the catalogs, the viewport and its environment are all ready. */
  ready: boolean;
  /** Non-null when boot failed; the driver aborts on it instead of hanging. */
  error: string | null;
  /** Angles {@link CaptureApi.capturePart} returns — must equal {@link THUMB_COUNT}. */
  readonly count: number;
  /** Loads the part and renders every angle; resolves to PNG data URLs in order. */
  capturePart(partId: string): Promise<string[]>;
}

/** `<part_id>_NN.png` — NN is the 1-based, zero-padded angle index. */
export function thumbFileName(partId: string, angleIndex: number): string {
  if (!Number.isInteger(angleIndex) || angleIndex < 0 || angleIndex >= THUMB_COUNT) {
    throw new RangeError(`angleIndex out of range: ${angleIndex} (expected 0..${THUMB_COUNT - 1})`);
  }
  return `${partId}_${String(angleIndex + 1).padStart(2, '0')}.png`;
}

/** `<part_id>.gif` — the animated turntable built from that part's frames. */
export function gifFileName(partId: string): string {
  return `${partId}.gif`;
}

/** Trailing slashes on the origin are the one plausible caller typo. */
function normalizeOrigin(siteOrigin: string): string {
  return siteOrigin.replace(/\/+$/, '');
}

/** Full production URL of one thumbnail: origin + base + `assets/thumbs/<file>`. */
export function thumbUrl(siteOrigin: string, partId: string, angleIndex: number): string {
  // PARTPREVIEW_BASE already starts with '/'.
  return `${normalizeOrigin(siteOrigin)}${PARTPREVIEW_BASE}${THUMBS_DIR}/${thumbFileName(partId, angleIndex)}`;
}

/**
 * Full production URL of one part's animated turntable — the manifest `partgifs`
 * value for that part.
 */
export function gifUrl(siteOrigin: string, partId: string): string {
  return `${normalizeOrigin(siteOrigin)}${PARTPREVIEW_BASE}${GIFS_DIR}/${gifFileName(partId)}`;
}

/**
 * The manifest `thumbs` value for one part: every URL in angle order, index 0
 * (`_01`) being the viewer's default view.
 */
export function thumbUrls(siteOrigin: string, partId: string): string[] {
  const urls: string[] = [];
  for (let i = 0; i < THUMB_COUNT; i++) urls.push(thumbUrl(siteOrigin, partId, i));
  return urls;
}
