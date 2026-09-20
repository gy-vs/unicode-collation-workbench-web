/**
 * Generic LCS-based diff used both for rendering mergeable differences and
 * internally by the three-way merge.
 */

export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffPart {
  op: DiffOp;
  value: string;
}

/** Diff two token sequences via longest-common-subsequence. */
function diffTokens(a: string[], b: string[]): DiffPart[] {
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = length of LCS of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  const push = (op: DiffOp, value: string) => {
    const last = parts[parts.length - 1];
    if (last && last.op === op) last.value += value;
    else parts.push({ op, value });
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('equal', a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('delete', a[i]);
      i++;
    } else {
      push('insert', b[j]);
      j++;
    }
  }
  while (i < n) {
    push('delete', a[i]);
    i++;
  }
  while (j < m) {
    push('insert', b[j]);
    j++;
  }
  return parts;
}

/**
 * Inline (word-level) diff for a single line of text. Whitespace runs and
 * each non-space token are diff units.
 */
export function diffWords(a: string, b: string): DiffPart[] {
  const tokenize = (s: string) => s.match(/\s+|\S+/g) ?? [];
  return diffTokens(tokenize(a), tokenize(b));
}

/** Line-level diff for multi-line content. */
export function diffLines(a: string, b: string): DiffPart[] {
  return diffTokens(a.split('\n'), b.split('\n')).map((p) =>
    p.op === 'equal' ? p : { ...p, value: p.value },
  );
}
