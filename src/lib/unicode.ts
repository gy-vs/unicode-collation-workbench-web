/**
 * Unicode folding + range-preserving search engine.
 *
 * The platform Intl APIs (Intl.Collator) compare strings but do not tell us
 * *which* original characters matched, so naive highlighting after
 * lowercasing/stripping diacritics drifts across combining marks and
 * surrogate pairs. This module folds text one grapheme cluster at a time and
 * records, for every UTF-16 code unit of the folded output, which original
 * grapheme cluster produced it. Match offsets in folded space can then be
 * mapped back to original offsets without ever splitting a cluster.
 *
 *   original text
 *     └─ grapheme clusters (Intl.Segmenter, extended grapheme clusters,
 *        so surrogate pairs and combining sequences stay indivisible)
 *          └─ NFC → locale case fold → NFD + strip marks → NFC
 *               └─ folded code units tagged with their source cluster
 */

import type {
  CollationConfig,
  EvaluationResult,
  RankedSample,
  Sample,
  SearchHit,
  Sensitivity,
} from '../types';

export class InvalidLocaleError extends Error {
  constructor(public readonly locale: string) {
    super(`无效的 locale: ${locale}`);
    this.name = 'InvalidLocaleError';
  }
}

interface GraphemeSpan {
  /** UTF-16 offsets into the original text. */
  start: number;
  end: number;
}

interface Folded {
  text: string;
  /**
   * owner[i] is the index of the grapheme cluster that produced the i-th
   * UTF-16 code unit of the folded text.
   */
  owner: number[];
  spans: GraphemeSpan[];
}

/** Combining marks that are dropped by accent-insensitive folding. */
const COMBINING_MARK = /^[\p{M}]+$/u;

let segmenterCache: { locale: string; segmenter: Intl.Segmenter } | null = null;

function getSegmenter(locale: string): Intl.Segmenter {
  if (segmenterCache && segmenterCache.locale === locale) {
    return segmenterCache.segmenter;
  }
  const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
  segmenterCache = { locale, segmenter };
  return segmenter;
}

/** Validate a BCP-47 tag the same way the Intl constructors see it. */
export function assertValidLocale(locale: string): void {
  try {
    // eslint-disable-next-line no-new
    new Intl.Collator(locale);
  } catch {
    throw new InvalidLocaleError(locale);
  }
}

function stripAccents(cluster: string): string {
  // NFD decomposes "å" into "a" + U+030A and "é" into "e" + U+0301; remove
  // every combining-mark code point, then recompose what remains.
  const decomposed = cluster.normalize('NFD');
  let kept = '';
  for (const ch of decomposed) {
    if (!COMBINING_MARK.test(ch)) kept += ch;
  }
  return kept.normalize('NFC');
}

/** Fold one already-NFC'd grapheme cluster according to the sensitivity. */
function foldCluster(nfcCluster: string, locale: string, sensitivity: Sensitivity): string {
  let s = nfcCluster;
  // Case folding first (on composed text), then accent stripping: Turkish
  // "İ" folds to "i", and accents attached to that i are removed afterwards.
  if (sensitivity === 'base' || sensitivity === 'accent') {
    s = s.toLocaleLowerCase(locale);
  }
  if (sensitivity === 'base' || sensitivity === 'case') {
    s = stripAccents(s);
  }
  return s;
}

function fold(text: string, locale: string, sensitivity: Sensitivity, needOwners: true): Folded;
function fold(text: string, locale: string, sensitivity: Sensitivity, needOwners?: false): string;
function fold(
  text: string,
  locale: string,
  sensitivity: Sensitivity,
  needOwners = false,
): Folded | string {
  const segmenter = getSegmenter(locale);
  const spans: GraphemeSpan[] = [];
  let foldedText = '';
  let owner: number[] = [];

  for (const data of segmenter.segment(text)) {
    const clusterIndex = spans.length;
    const original = data.segment;
    const nfcCluster = original.normalize('NFC');
    const foldedCluster = foldCluster(nfcCluster, locale, sensitivity);
    if (needOwners) {
      spans.push({ start: data.index, end: data.index + original.length });
      for (let i = 0; i < foldedCluster.length; i++) owner.push(clusterIndex);
    }
    foldedText += foldedCluster;
  }

  if (needOwners) return { text: foldedText, owner, spans };
  return foldedText;
}

/** Fold a query string (no offset bookkeeping needed). */
export function foldNeedle(needle: string, locale: string, sensitivity: Sensitivity): string {
  return fold(needle, locale, sensitivity, false);
}

/**
 * Map a [start, end) range in folded space back to [start, end) UTF-16
 * offsets in the ORIGINAL text. Owners point at grapheme clusters; we take
 * from the start of the first touched cluster to the end of the last one,
 * so combining marks / surrogate halves are never cut in half.
 */
function mapRange(folded: Folded, foldedStart: number, foldedEnd: number): {
  start: number;
  end: number;
} {
  const firstCluster = folded.owner[foldedStart];
  const lastCluster = folded.owner[foldedEnd - 1];
  const start = folded.spans[firstCluster].start;
  const end = folded.spans[lastCluster].end;
  return { start, end };
}

/** All non-overlapping occurrences of needle in haystack, left to right. */
function findAll(haystack: string, needle: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  if (needle.length === 0) return ranges;
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    ranges.push({ start: at, end: at + needle.length });
    from = at + needle.length;
  }
  return ranges;
}

export interface SearchOutcome {
  hits: SearchHit[];
  /** Ranges keyed by sample id for fast lookup during ranking. */
  byId: Map<number, Array<{ start: number; end: number }>>;
}

/**
 * Search every sample. Ranges are always expressed against the original
 * sample text. Empty query yields no hits (ranking then shows every row).
 */
export function searchSamples(
  samples: Sample[],
  query: string,
  locale: string,
  sensitivity: Sensitivity,
): SearchOutcome {
  const byId = new Map<number, Array<{ start: number; end: number }>>();
  const hits: SearchHit[] = [];
  const needle = foldNeedle(query, locale, sensitivity);
  if (needle.length === 0) return { hits, byId };

  for (const sample of samples) {
    const folded = fold(sample.text, locale, sensitivity, true);
    const foldedRanges = findAll(folded.text, needle);
    if (foldedRanges.length === 0) continue;
    const ranges = foldedRanges.map((r) => mapRange(folded, r.start, r.end));
    byId.set(sample.id, ranges);
    hits.push({ sampleId: sample.id, ranges });
  }
  return { hits, byId };
}

/**
 * Full evaluation: stable locale collation + range-preserving search.
 *
 * Tie semantics: rows whose collation comparison is zero share a tie group;
 * within each group rows are ordered by their original sample id. Rows not
 * tied with anyone get tieGroup = -1.
 */
export function evaluate(
  samples: Sample[],
  query: string,
  config: CollationConfig,
): EvaluationResult {
  assertValidLocale(config.locale);
  const collator = new Intl.Collator(config.locale, {
    sensitivity: config.sensitivity,
    numeric: config.numeric,
    usage: 'sort',
  });

  const { hits, byId } = searchSamples(
    samples,
    query,
    config.locale,
    config.sensitivity,
  );

  // Stable sort: comparator breaks ties by id so re-sorting never shuffles
  // equal rows (and matches the documented tie-break rule).
  const order = samples.map((_, i) => i);
  order.sort((ai, bi) => {
    const cmp = collator.compare(samples[ai].text, samples[bi].text);
    if (cmp !== 0) return cmp;
    return samples[ai].id - samples[bi].id;
  });

  const ranked: RankedSample[] = order.map((sampleIndex, pos) => {
    const sample = samples[sampleIndex];
    return {
      sampleId: sample.id,
      text: sample.text,
      rank: pos,
      tieGroup: -1, // assigned by the run pass below
      ranges: byId.get(sample.id) ?? [],
    };
  });

  // Walk the sorted order in maximal equal-runs: a run longer than one row
  // is a tie group; all other rows keep tieGroup = -1.
  let group = -1;
  let pos = 0;
  while (pos < order.length) {
    const len = runLengthAt(order, samples, collator, pos);
    if (len > 1) {
      group += 1;
      for (let k = 0; k < len; k++) ranked[pos + k].tieGroup = group;
    }
    pos += len;
  }

  return {
    ranked,
    hits,
    config: { ...config },
    evaluatedAt: new Date().toISOString(),
  };
}

function runLengthAt(
  order: number[],
  samples: Sample[],
  collator: Intl.Collator,
  head: number,
): number {
  let len = 1;
  while (
    head + len < order.length &&
    collator.compare(samples[order[head]].text, samples[order[head + len]].text) === 0
  ) {
    len++;
  }
  return len;
}
