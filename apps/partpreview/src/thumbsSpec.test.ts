import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GIF_SECONDS,
  DEFAULT_THUMB_SIZE,
  DEFAULT_SITE_ORIGIN,
  DEFAULT_PART_ROTATION_DEG,
  DEFAULT_VIEW_DIR,
  GIFS_DIR,
  PARTPREVIEW_BASE,
  THUMB_COUNT,
  THUMB_PIXEL_RATIO,
  THUMB_STEP_DEG,
  THUMBS_DIR,
  formatVec3,
  gifFileName,
  gifUrl,
  parseRotationDeg,
  parseViewDir,
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

describe('thumbnail resolution', () => {
  it('supersamples a 400px output at the live viewport maximum device scale', () => {
    expect(DEFAULT_THUMB_SIZE).toBe(400);
    expect(DEFAULT_THUMB_SIZE * THUMB_PIXEL_RATIO).toBe(800);
  });
});

describe('thumbFileName', () => {
  it('zero-pads the 1-based angle index', () => {
    // Derived from THUMB_COUNT, never hard-coded: the turntable length is a taste
    // call that gets retuned, and that must not break the naming contract's test.
    expect(thumbFileName(PART, 0)).toBe(`${PART}_01.png`);
    expect(thumbFileName(PART, 1)).toBe(`${PART}_02.png`);
    expect(thumbFileName(PART, THUMB_COUNT - 1)).toBe(
      `${PART}_${String(THUMB_COUNT).padStart(2, '0')}.png`,
    );
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

describe('parseViewDir', () => {
  it('reads three numbers, whitespace and negatives included', () => {
    expect(parseViewDir('1,0.6,1')).toEqual([1, 0.6, 1]);
    expect(parseViewDir(' -2 , 1 , 0 ')).toEqual([-2, 1, 0]);
  });

  it('round-trips the default', () => {
    expect(parseViewDir(formatVec3(DEFAULT_VIEW_DIR))).toEqual([...DEFAULT_VIEW_DIR]);
  });

  it('rejects anything that is not three finite numbers', () => {
    expect(parseViewDir('')).toBeNull();
    expect(parseViewDir('1,1')).toBeNull();
    expect(parseViewDir('1,1,1,1')).toBeNull();
    expect(parseViewDir('1,up,1')).toBeNull();
    expect(parseViewDir('1,,1')).toBeNull();
    expect(parseViewDir('1,Infinity,1')).toBeNull();
  });

  it('rejects directions the turntable cannot spin', () => {
    // Zero length: the camera would sit on the orbit target.
    expect(parseViewDir('0,0,0')).toBeNull();
    // Straight down / straight up: every angle would render the same frame.
    expect(parseViewDir('0,1,0')).toBeNull();
    expect(parseViewDir('0,-1,0')).toBeNull();
  });
});

describe('parseRotationDeg', () => {
  it('accepts any three finite numbers, including negatives and > 360', () => {
    expect(parseRotationDeg('0,0,90')).toEqual([0, 0, 90]);
    expect(parseRotationDeg('-90, 0 , 450')).toEqual([-90, 0, 450]);
    // Identity is meaningful here (unlike a view direction), so it must parse.
    expect(parseRotationDeg('0,0,0')).toEqual([0, 0, 0]);
    // Whatever the current default is, it survives the round trip the capture URL makes.
    expect(parseRotationDeg(formatVec3(DEFAULT_PART_ROTATION_DEG))).toEqual([
      ...DEFAULT_PART_ROTATION_DEG,
    ]);
  });

  it('rejects the same malformed input parseVec3 does', () => {
    expect(parseRotationDeg('90,0')).toBeNull();
    expect(parseRotationDeg('90,,0')).toBeNull();
    expect(parseRotationDeg('90,deg,0')).toBeNull();
  });
});
