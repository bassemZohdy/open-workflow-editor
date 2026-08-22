/**
 * Lightweight fuzzy matcher used by the Command Palette and Quick Open.
 * Returns a simple score (higher = better) or -1 when the query does not match.
 */
export interface FuzzyResult {
  score: number;
  /** Indexes of the matched characters inside `text`, for highlighting. */
  positions: number[];
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Subsequence match with a small scoring heuristic:
 * - contiguous runs score higher than scattered characters
 * - matches at word starts (/ - _ . space) score higher
 * - case-insensitive
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return { score: 1, positions: [] };

  let score = 0;
  let qi = 0;
  let prevMatch = -2;
  const positions: number[] = [];

  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] !== q[qi]) continue;
    // Bonus for matching right after a word boundary, or contiguous with the previous match.
    const boundary = ti === 0 || /[\s\-_./:]/.test(t[ti - 1]);
    const contiguous = ti === prevMatch + 1;
    score += 4 + (boundary ? 8 : 0) + (contiguous ? 6 : 0) + (text[ti] !== text[ti].toLowerCase() ? 2 : 0);
    positions.push(ti);
    prevMatch = ti;
    qi += 1;
  }

  if (qi < q.length) return null;
  // Prefer shorter targets when scores tie.
  score += Math.max(0, 24 - t.length);
  return { score, positions };
}

/** Sorts candidate items by fuzzy score descending; unmatched items are dropped. */
export function fuzzyRank<T>(
  query: string,
  items: T[],
  textOf: (item: T) => string,
): Array<{ item: T; score: number; positions: number[] }> {
  const matches: Array<{ item: T; score: number; positions: number[] }> = [];
  for (const item of items) {
    const result = fuzzyMatch(query, textOf(item));
    if (result && result.score > 0) matches.push({ item, score: result.score, positions: result.positions });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

/** Small deterministic position calculator (used for status bar Ln/Col display). */
export function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let column = 1;
  for (let i = 0; i < safeOffset; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

/** Convenience: rebuild a search regex for simple substring highlighting. */
export function substringPattern(query: string): RegExp | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  return new RegExp(escapePattern(trimmed), 'i');
}
