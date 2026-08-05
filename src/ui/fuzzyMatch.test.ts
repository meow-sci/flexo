import { describe, it, expect } from 'vitest';
import { fuzzyMatch } from './fuzzyMatch';

/** Convenience: the score of a match that is expected to exist. */
function score(query: string, target: string): number {
  const match = fuzzyMatch(query, target);
  if (!match) throw new Error(`expected "${query}" to match "${target}"`);
  return match.score;
}

describe('fuzzyMatch — rejections', () => {
  it('returns null for an empty or whitespace-only query (callers own the empty state)', () => {
    expect(fuzzyMatch('', 'Export to KSA')).toBeNull();
    expect(fuzzyMatch('   ', 'Export to KSA')).toBeNull();
  });

  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyMatch('ba', 'ab')).toBeNull();
    expect(fuzzyMatch('abc', 'ab')).toBeNull();
    expect(fuzzyMatch('xyz', 'Export to KSA')).toBeNull();
  });

  it('returns null for an empty target', () => {
    expect(fuzzyMatch('a', '')).toBeNull();
  });

  it('matches case-insensitively', () => {
    expect(fuzzyMatch('EX', 'Export')).not.toBeNull();
    expect(fuzzyMatch('ex', 'EXPORT')).not.toBeNull();
  });
});

describe('fuzzyMatch — scoring tiers', () => {
  it('scores word-boundary hits above scattered ones (same target length)', () => {
    expect(score('ab', 'xx ax bx yy')).toBeGreaterThan(score('ab', 'xxaxxxbxxyy'));
  });

  it('scores a prefix match above the same match at an interior boundary', () => {
    // Identical raw scores (boundary + consecutive); only the ×1.5 prefix bonus differs.
    expect(score('ab', 'ab cd')).toBeGreaterThan(score('ab', 'cd ab'));
  });

  it('scores a consecutive run above the same characters with a gap', () => {
    expect(score('ab', 'xabxx')).toBeGreaterThan(score('ab', 'xaxbx'));
  });

  it('scores a tight hit in a short label above the same hit in a longer one', () => {
    expect(score('ab', 'ab')).toBeGreaterThan(score('ab', 'ab cdefgh'));
  });

  it('picks the best placement, not the leftmost one', () => {
    // Greedy would take the `a` at index 1 and score 2; the boundary `ab` at 3 scores 5.
    expect(fuzzyMatch('ab', 'za ab')).toEqual({ score: 1, ranges: [[3, 5]] });
  });

  it('treats a camelCase seam as a word boundary', () => {
    expect(score('p', 'fooPart')).toBeGreaterThan(score('p', 'foopart'));
  });
});

describe('fuzzyMatch — ranges', () => {
  it('merges a consecutive run into one half-open span', () => {
    expect(fuzzyMatch('ab', 'xabx')?.ranges).toEqual([[1, 3]]);
  });

  it('reports one span per isolated character', () => {
    expect(fuzzyMatch('ab', 'xaxb')?.ranges).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('covers exactly the matched characters, in order', () => {
    const target = 'Export Project Archive…';
    const match = fuzzyMatch('expa', target);
    expect(match).not.toBeNull();
    const covered = match!.ranges.map(([start, end]) => target.slice(start, end)).join('');
    expect(covered.toLowerCase()).toBe('expa');
    // Ascending and non-overlapping.
    for (let i = 1; i < match!.ranges.length; i++) {
      expect(match!.ranges[i][0]).toBeGreaterThanOrEqual(match!.ranges[i - 1][1]);
    }
  });
});

describe('fuzzyMatch — the caller sort contract', () => {
  it('leaves equal scores in the caller ordering (ties break alphabetically upstream)', () => {
    const candidates = ['Zulu Item', 'Alfa Item'];
    const ranked = candidates
      .map((title) => ({ title, score: score('item', title) }))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    expect(ranked[0].score).toBe(ranked[1].score);
    expect(ranked.map((r) => r.title)).toEqual(['Alfa Item', 'Zulu Item']);
  });
});
