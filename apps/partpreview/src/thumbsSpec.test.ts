import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GIF_SECONDS,
  DEFAULT_SITE_ORIGIN,
  GIFS_DIR,
  PARTPREVIEW_BASE,
  THUMB_COUNT,
  THUMB_STEP_DEG,
  THUMBS_DIR,
  gifFileName,
  gifUrl,
  thumbFileName,
  thumbUrl,
  thumbUrls,
} from './thumbsSpec';

const PART = 'CoreCommandA_Prefab_MediumCapsuleVariantA';

describe('thumb angle invariants', () => {
  it('covers exactly one turntable revolution', () => {
    expect(THUMB_COUNT * THUMB_STEP_DEG).toBe(360);
  });
});

describe('thumbFileName', () => {
  it('zero-pads the 1-based angle index', () => {
    expect(thumbFileName(PART, 0)).toBe(`${PART}_01.png`);
    expect(thumbFileName(PART, 8)).toBe(`${PART}_09.png`);
    expect(thumbFileName(PART, THUMB_COUNT - 1)).toBe(`${PART}_10.png`);
  });

  it('rejects out-of-range and non-integer indices', () => {
    expect(() => thumbFileName(PART, -1)).toThrow(RangeError);
    expect(() => thumbFileName(PART, THUMB_COUNT)).toThrow(RangeError);
    expect(() => thumbFileName(PART, 1.5)).toThrow(RangeError);
  });
});

describe('thumbUrl', () => {
  it('composes origin + app base + thumbs dir + file name', () => {
    expect(thumbUrl(DEFAULT_SITE_ORIGIN, PART, 0)).toBe(
      `https://meow.science.fail${PARTPREVIEW_BASE}${THUMBS_DIR}/${PART}_01.png`,
    );
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(thumbUrl('https://meow.science.fail/', PART, 0)).toBe(
      thumbUrl('https://meow.science.fail', PART, 0),
    );
  });

  it('works for a local preview origin', () => {
    expect(thumbUrl('http://localhost:4173', PART, 5)).toBe(
      `http://localhost:4173${PARTPREVIEW_BASE}${THUMBS_DIR}/${PART}_06.png`,
    );
  });
});

describe('gif naming', () => {
  it('is one file per part, no angle suffix', () => {
    expect(gifFileName(PART)).toBe(`${PART}.gif`);
  });

  it('composes the manifest `partgifs` URL from its own directory', () => {
    expect(gifUrl(DEFAULT_SITE_ORIGIN, PART)).toBe(
      `https://meow.science.fail${PARTPREVIEW_BASE}${GIFS_DIR}/${PART}.gif`,
    );
    expect(gifUrl('https://meow.science.fail/', PART)).toBe(gifUrl(DEFAULT_SITE_ORIGIN, PART));
  });

  it('keeps GIFs out of the thumbnail directory', () => {
    expect(GIFS_DIR).not.toBe(THUMBS_DIR);
  });

  it('defaults to a loop long enough to read as motion', () => {
    // Deliberately not pinned to a specific value — the default is a taste call.
    // What must hold is that it yields a usable frame rate for THUMB_COUNT frames.
    expect(DEFAULT_GIF_SECONDS).toBeGreaterThan(0);
    const fps = THUMB_COUNT / DEFAULT_GIF_SECONDS;
    expect(fps).toBeGreaterThanOrEqual(1);
    expect(fps).toBeLessThanOrEqual(30);
  });
});

describe('thumbUrls', () => {
  it('returns THUMB_COUNT urls in angle order', () => {
    const urls = thumbUrls(DEFAULT_SITE_ORIGIN, PART);
    expect(urls).toHaveLength(THUMB_COUNT);
    expect(urls[0]).toBe(thumbUrl(DEFAULT_SITE_ORIGIN, PART, 0));
    expect(urls.at(-1)).toBe(thumbUrl(DEFAULT_SITE_ORIGIN, PART, THUMB_COUNT - 1));
    expect(new Set(urls).size).toBe(THUMB_COUNT);
  });
});
