import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { loadEnv, type Plugin } from 'vite';
import { ASSET_FILES } from '../src/ksa/catalog';
import { parsePartsFile, type CatalogPart } from '../src/ksa/partCatalog';
import { ENVIRONMENT_PRESETS } from '../src/state/environmentPresets';

/**
 * Emits `manifest.json` next to the part-preview mini app's bundle: the complete
 * list of `part_id`s the viewer accepts, the `skybox_id`s it understands, and the
 * KSA build the catalog data came from. A wiki reads it to enumerate every part it
 * can embed a preview for.
 *
 * The part list is NOT re-derived from the XML with a bespoke rule — it is produced
 * by running the app's OWN `parsePartsFile` (via `@xmldom/xmldom`, which is DOM-core
 * compatible for the APIs the parser uses) over the same `ASSET_FILES` the browser
 * fetches. That is the whole point: the manifest and the viewer share one definition
 * of "a part exists" (`<Part Id>` present AND ≥1 renderable placement), so they can
 * never drift. GameData siblings are irrelevant here — they merge data into existing
 * entries but never add parts.
 *
 * Source data comes entirely from `KSA_ASSETS_DIR` (same resolution as
 * {@link import('./ksaAssets').ksaAssets}); unset or missing ⇒ warn and skip, so the
 * open-source CI without the private asset repo still builds.
 *
 * Registered only by `apps/partpreview/vite.config.ts`. See
 * plans/WIKI_PART_PREVIEW_PLAN.md §2.6.
 */

export interface PreviewManifest {
  part_ids: string[];
  skybox_ids: string[];
  ksa_build: string | null;
  /**
   * Part id -> the full URLs of its turntable thumbnails, in angle order.
   *
   * OPTIONAL and never written by this plugin: the static WebPs are produced after the
   * build by `pnpm thumbs:partpreview`, which patches this file in place (a plain
   * build therefore has no `thumbs`, and rebuilding the mini app wipes both the
   * images and the field). See plans/PART_PREVIEW_THUMBS.md §2.5.
   */
  thumbs?: Record<string, string[]>;
  /**
   * Part id -> the full URL of its animated WebP turntable. Same optionality,
   * lifecycle and producer as {@link PreviewManifest.thumbs}; a part only appears
   * here once img2webp has actually muxed its frames.
   */
  turntables?: Record<string, string>;
}

/**
 * Builds the manifest by parsing the real Core asset XML out of `assetsDir` with
 * the SAME parser the app uses, so the two can never disagree about which parts
 * the viewer accepts.
 */
export function buildPreviewManifest(assetsDir: string): PreviewManifest {
  const parts: CatalogPart[] = [];
  for (const file of ASSET_FILES) {
    const abs = join(assetsDir, file);
    // A pruned asset tree may legitimately lack a file; the app tolerates that too.
    if (!existsSync(abs)) continue;
    // KSA ships some XML BOM-prefixed; the browser's fetch drops it, but @xmldom
    // rejects a BOM that precedes the `<?xml?>` declaration.
    const xml = readFileSync(abs, 'utf-8').replace(/^﻿/, '');
    const doc = new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
    parsePartsFile(doc, file, parts);
  }

  // Defensive de-dupe: nothing in Core repeats a `<Part Id>`, but a manifest with a
  // duplicated id would make a wiki render the same entry twice, and the cost is nil.
  const part_ids = [...new Set(parts.map((p) => p.id))].sort((a, b) => a.localeCompare(b));

  return {
    part_ids,
    // ALL nine presets, `'room'` included. `'room'` is the procedural studio — it is
    // what the viewer shows when no `skybox_id` is given, and accepting it explicitly
    // means a wiki can round-trip whichever value it read out of this manifest.
    skybox_ids: ENVIRONMENT_PRESETS.map((p) => p.id),
    ksa_build: readKsaBuild(assetsDir),
  };
}

/** The `build` string from `<assetsDir>/version.json`, or null when absent/unparseable. */
function readKsaBuild(assetsDir: string): string | null {
  try {
    const raw = readFileSync(join(assetsDir, 'version.json'), 'utf-8');
    const build: unknown = JSON.parse(raw).build;
    return typeof build === 'string' && build !== '' ? build : null;
  } catch {
    // A missing or malformed sidecar must never fail the build.
    return null;
  }
}

export function previewManifest(): Plugin {
  let root = process.cwd();
  let assetsDir = '';
  // URL the manifest is served at in dev, including Vite's `base`.
  let url = '/manifest.json';
  return {
    name: 'flexo-preview-manifest',
    configResolved(config) {
      root = config.root;
      url = `${config.base}manifest.json`;
      // Identical resolution to ksaAssets: loadEnv with an empty prefix reads
      // unprefixed vars, and `envDir` (not `root`) is where the mini app points back
      // at the repo-root .env that defines KSA_ASSETS_DIR.
      const dir = loadEnv(config.mode, config.envDir, '').KSA_ASSETS_DIR;
      if (dir) assetsDir = resolve(config.root, dir);
    },
    // Plain write (not this.emitFile) so the file lands AFTER emptyOutDir has run.
    writeBundle(options) {
      if (!assetsDir || !existsSync(assetsDir)) {
        this.warn(
          `KSA_ASSETS_DIR is unset or missing (${assetsDir || 'unset'}); no manifest.json emitted`,
        );
        return;
      }
      const outDir = options.dir ?? join(root, 'dist');
      const manifest = buildPreviewManifest(assetsDir);
      writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    },
    // Serve it in dev too, so the manifest can be exercised without a build. Built
    // per request — a dev convenience, not a hot path.
    configureServer(server) {
      const baseDir = assetsDir;
      server.middlewares.use((req, res, next) => {
        if (!baseDir || !req.url || req.url.split('?')[0] !== url) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(`${JSON.stringify(buildPreviewManifest(baseDir), null, 2)}\n`);
      });
    },
  };
}
