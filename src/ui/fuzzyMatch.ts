/**
 * THE fuzzy matcher (design: `plans/flexo_v2/design/design-system-services.md` §3.3).
 *
 * One subsequence matcher, dependency-free, shared by every search surface: the ⌘K command
 * palette today, and the Outliner / catalog-browser / asset-list searches as they are
 * upgraded from substring matching (design: foundation §8). **Do not fork it** — a later
 * phase EXTENDS this module with boolean adapters (`fuzzyFind` / `fuzzyAny`) for plain list
 * filtering, which is why {@link fuzzyMatch}'s scored signature is treated as stable API
 * and why this file has no imports.
 *
 * ## Scoring
 *
 * Every matched character earns exactly one tier, best first:
 * - **+3** the character sits on a word boundary (string start, after a non-alphanumeric,
 *   or the lowercase→uppercase seam of a camelCase word);
 * - **+2** it directly follows the previously matched character (a consecutive run);
 * - **+1** otherwise.
 *
 * The total is then multiplied by **1.5** when the match starts at index 0 (prefix bonus)
 * and divided by the target's length, so a tight hit in a short label outranks the same
 * hit buried in a long one. Matching is case-insensitive.
 *
 * The placement is **optimal, not greedy**: `fuzzyMatch('ab', 'za ab')` scores the
 * word-boundary `ab` at the end rather than the leftmost `a`.
 *
 * ## Contracts callers rely on
 *
 * - An empty (or whitespace-only) query returns `null` — the caller owns the empty state.
 * - A non-subsequence returns `null`.
 * - `ranges` are **half-open** `[start, end)` index pairs into the ORIGINAL `target`,
 *   ascending and non-overlapping, covering exactly the matched characters — pass them
 *   straight to `slice()` to highlight.
 * - **Ties break at the caller.** This function only scores; a caller that wants stable
 *   ordering sorts by `score` descending and then by its own label ascending.
 */

export interface FuzzyMatchResult {
  /** Higher is better. Only comparable between candidates scored by the same call site. */
  score: number;
  /** Half-open `[start, end)` spans of `target` that the query matched. */
  ranges: [number, number][];
}

const SCORE_BOUNDARY = 3;
const SCORE_CONSECUTIVE = 2;
const SCORE_PLAIN = 1;
const PREFIX_MULTIPLIER = 1.5;

export function fuzzyMatch(query: string, target: string): FuzzyMatchResult | null {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0 || target.length === 0) return null;
  const haystack = target.toLowerCase();
  if (needle.length > haystack.length) return null;

  // Candidate positions per query character. Empty for any character ⇒ not a subsequence.
  const positions: number[][] = [];
  for (let qi = 0; qi < needle.length; qi++) {
    const spots: number[] = [];
    // A character can never match before its own index, nor so late that the remaining
    // characters no longer fit.
    const last = haystack.length - (needle.length - qi);
    for (let ti = qi; ti <= last; ti++) if (haystack[ti] === needle[qi]) spots.push(ti);
    if (spots.length === 0) return null;
    positions.push(spots);
  }

  // best[qi][k]  = best total for query[qi..] with query[qi] at positions[qi][k], where
  //                query[qi] is NOT consecutive with its predecessor;
  // bestRun[qi][k] = the same, but it IS. `next` records the winning successor so the
  // matched indices can be replayed afterwards.
  const best: Float64Array[] = [];
  const bestRun: Float64Array[] = [];
  const next: Int32Array[] = [];

  for (let qi = needle.length - 1; qi >= 0; qi--) {
    const spots = positions[qi];
    const scores = new Float64Array(spots.length);
    const runScores = new Float64Array(spots.length);
    const choice = new Int32Array(spots.length).fill(-1);
    const isLast = qi === needle.length - 1;

    for (let k = 0; k < spots.length; k++) {
      const ti = spots[k];
      const boundary = isWordBoundary(target, ti);
      const plain = boundary ? SCORE_BOUNDARY : SCORE_PLAIN;
      const run = boundary ? SCORE_BOUNDARY : SCORE_CONSECUTIVE;

      if (isLast) {
        scores[k] = plain;
        runScores[k] = run;
        continue;
      }

      const successors = positions[qi + 1];
      const successorScores = best[qi + 1];
      const successorRunScores = bestRun[qi + 1];
      let bestTail = Number.NEGATIVE_INFINITY;
      let bestIndex = -1;
      for (let k2 = 0; k2 < successors.length; k2++) {
        const tj = successors[k2];
        if (tj <= ti) continue;
        const tail = tj === ti + 1 ? successorRunScores[k2] : successorScores[k2];
        if (tail > bestTail) {
          bestTail = tail;
          bestIndex = k2;
        }
      }
      if (bestIndex === -1) {
        scores[k] = Number.NEGATIVE_INFINITY;
        runScores[k] = Number.NEGATIVE_INFINITY;
        continue;
      }
      scores[k] = plain + bestTail;
      runScores[k] = run + bestTail;
      choice[k] = bestIndex;
    }

    // Written back-to-front, so index qi is filled before qi-1 reads qi+1.
    best[qi] = scores;
    bestRun[qi] = runScores;
    next[qi] = choice;
  }

  let topScore = Number.NEGATIVE_INFINITY;
  let topIndex = -1;
  for (let k = 0; k < positions[0].length; k++) {
    const raw = best[0][k];
    if (raw === Number.NEGATIVE_INFINITY) continue;
    const score = positions[0][k] === 0 ? raw * PREFIX_MULTIPLIER : raw;
    if (score > topScore) {
      topScore = score;
      topIndex = k;
    }
  }
  if (topIndex === -1) return null;

  const matched: number[] = [];
  let k = topIndex;
  for (let qi = 0; qi < needle.length; qi++) {
    matched.push(positions[qi][k]);
    if (qi < needle.length - 1) k = next[qi][k];
  }

  return { score: topScore / target.length, ranges: toRanges(matched) };
}

/** String start, after a non-alphanumeric, or the lowercase→uppercase camelCase seam. */
function isWordBoundary(target: string, index: number): boolean {
  if (index === 0) return true;
  const previous = target[index - 1];
  if (!/[a-z0-9]/i.test(previous)) return true;
  return previous === previous.toLowerCase() && target[index] !== target[index].toLowerCase();
}

/** Ascending matched indices → merged half-open spans. */
function toRanges(indices: number[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const index of indices) {
    const last = ranges.at(-1);
    if (last && last[1] === index) last[1] = index + 1;
    else ranges.push([index, index + 1]);
  }
  return ranges;
}
