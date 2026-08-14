/**
 * The offscreen thumbnail-capture harness (`capture.html`).
 *
 * Boots the two catalogs and ONE {@link PartPreviewViewport} — the app's own
 * render path, so a thumbnail can never disagree with what the live embed shows —
 * then exposes `window.__flexoCapture` for `scripts/capture-part-thumbs.ts` to
 * drive over Playwright: one page, one WebGL context, one catalog parse for the
 * whole run, with the module-level geometry/material/texture caches making repeat
 * SubParts free. See plans/PART_PREVIEW_THUMBS.md §2.1/§4.
 *
 * The look is fixed to the mini app's default: `$previewLighting` with no query
 * params is exactly `DEFAULT_LIGHTING` + the procedural studio environment + the
 * hidden sky, and connectors, the axis triad and the measurement box are all off,
 * so only the part is in the frame.
 *
 * Debuggable by hand: `pnpm dev:partpreview`, open
 * `/flexo/apps/partpreview/capture.html?w=250&h=250` (add `&dir=1,0.6,1` for a
 * different camera angle, `&rot=0,0,90` to stand the part up), then call
 * `await __flexoCapture.capturePart('<part_id>')` in devtools.
 */
import { $catalogIndex, ensureCatalogLoaded } from '../../../src/state/catalogStore';
import { $partCatalogIndex, ensurePartCatalogLoaded } from '../../../src/state/partCatalogStore';
import { PartPreviewViewport } from '../../../src/three/PartPreviewViewport';
import { $previewLighting } from './settings';
import {
  type CaptureApi,
  DEFAULT_PART_ROTATION_DEG,
  DEFAULT_THUMB_SIZE,
  DEFAULT_VIEW_DIR,
  EMPTY_PART_ERROR,
  parseRotationDeg,
  parseViewDir,
  ROTATION_PARAM,
  type RotationDeg,
  THUMB_COUNT,
  THUMB_STEP_DEG,
  VIEW_DIR_PARAM,
  type ViewDir,
} from './thumbsSpec';

declare global {
  interface Window {
    __flexoCapture?: CaptureApi;
  }
}

const params = new URLSearchParams(location.search);

/** A positive integer query param, falling back to the shared default size. */
function size(name: string): number {
  const raw = Number(params.get(name));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_THUMB_SIZE;
}

const width = size('w');
const height = size('h');

/**
 * Camera direction for angle 0. An unparseable `?dir=` is IGNORED rather than
 * fatal — the driver validates the flag before it ever builds this URL, so a bad
 * value here can only come from someone poking at the page by hand.
 */
const viewDir: ViewDir = parseViewDir(params.get(VIEW_DIR_PARAM) ?? '') ?? DEFAULT_VIEW_DIR;

/** Whole-part orientation, same ignore-if-unparseable rule as `?dir=`. */
const partRotationDeg: RotationDeg =
  parseRotationDeg(params.get(ROTATION_PARAM) ?? '') ?? DEFAULT_PART_ROTATION_DEG;

const host = document.getElementById('host')!;
// Sized BEFORE the viewport is constructed so the very first frame() already sees
// the final aspect — `reframeOnResize` is off, there is no second chance.
host.style.width = `${width}px`;
host.style.height = `${height}px`;

function fail(message: string): void {
  const el = document.getElementById('error');
  if (el) el.textContent = message;
  if (window.__flexoCapture) window.__flexoCapture.error = message;
  console.error(`flexo capture: ${message}`);
}

/** The single viewport, built once by {@link boot}. */
let viewport: PartPreviewViewport | null = null;

const api: CaptureApi = {
  ready: false,
  error: null,
  count: THUMB_COUNT,
  async capturePart(partId: string): Promise<string[]> {
    if (!viewport) throw new Error('capture page is not ready');
    const part = $partCatalogIndex.get().get(partId);
    if (!part) throw new Error(`unknown part_id ${partId}`);
    await viewport.setPart(part, $catalogIndex.get());
    // setPart swallows load failures by design (a live embed degrades rather than
    // breaks); a capture must not silently write ten pictures of nothing. The
    // sentinel lets the driver tell "this part has no mesh" (fine) from "this part
    // failed to load" (a bug) — see EMPTY_PART_ERROR.
    if (!viewport.hasContent()) throw new Error(`${EMPTY_PART_ERROR}: ${partId}`);
    const urls: string[] = [];
    for (let i = 0; i < THUMB_COUNT; i++) {
      viewport.setViewAzimuth((i * THUMB_STEP_DEG * Math.PI) / 180);
      urls.push(viewport.renderToDataURL());
    }
    return urls;
  },
};
window.__flexoCapture = api;

async function boot(): Promise<void> {
  // Both catalogs: the Part catalog to resolve ids, the SubPart catalog to resolve
  // each placement's template to a mesh + material.
  await Promise.all([ensureCatalogLoaded(), ensurePartCatalogLoaded()]);
  if ($partCatalogIndex.get().size === 0) {
    fail('part catalog is empty — is dist/ksa/ present?');
    return;
  }

  try {
    viewport = new PartPreviewViewport(host, {
      // Session-only atom, never the persistent editor stores (see ./settings.ts).
      lighting: $previewLighting,
      // "Only the part": no connector cubes, no orientation triad, no overlays.
      showConnectors: false,
      axisGizmo: false,
      // The same 95% aspect-aware framing the embed uses on load.
      fillFraction: 0.95,
      // Angle 0's camera direction; the turntable spins it about world Y.
      viewDir,
      // The part's own orientation — the only knob that changes which way it faces.
      partRotationDeg,
      // The host is at its final size already; a re-frame could only fight the
      // camera pose the turntable is about to set.
      reframeOnResize: false,
    });
  } catch (err) {
    // Overwhelmingly a missing WebGL2 context (headless Chromium without
    // --enable-unsafe-swiftshader). Fail loudly rather than time out.
    fail(`could not create the WebGL viewport: ${String(err)}`);
    return;
  }

  // The procedural studio IBL is a PMREM bake; rendering before it lands would
  // capture the part under the fallback lights alone.
  await viewport.envApplied();
  api.ready = true;
}

void boot().catch((err: unknown) => fail(`boot failed: ${String(err)}`));
