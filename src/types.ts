/**
 * Shared data model used by both the Express server and the React client.
 * Keeping one source of truth guarantees that "live" client evaluation and
 * the server-generated stable results are produced from identical structures.
 */

/**
 * Search sensitivity. Mirrors the semantics of Intl.Collator's
 * sensitivity option so that sorting and searching interpret folds
 * consistently:
 *  - base:   case- and accent-insensitive ("a" = "A" = "á")
 *  - accent: accent-sensitive, case-insensitive
 *  - case:   case-sensitive, accent-insensitive
 *  - variant: case- and accent-sensitive (default)
 */
export type Sensitivity = 'base' | 'accent' | 'case' | 'variant';

export interface CollationConfig {
  /** BCP-47 tag, e.g. "en", "tr", "de-DE-u-co-phonebk". */
  locale: string;
  sensitivity: Sensitivity;
  /** When true, runs of digits compare by numeric value (co=kn). */
  numeric: boolean;
}

/** A single editable row. Ids are stable across text edits. */
export interface Sample {
  id: number;
  text: string;
}

export interface Experiment extends CollationConfig {
  id: string;
  name: string;
  query: string;
  samples: Sample[];
  /** Next unused sample id; the server authoritative owns allocation. */
  nextSampleId: number;
  /** Monotonic revision; bumped on every accepted save. */
  revision: number;
  updatedAt: string;
}

/** Experiment document without server-managed bookkeeping. */
export type ExperimentContent = Pick<
  Experiment,
  'name' | 'locale' | 'sensitivity' | 'numeric' | 'query' | 'samples' | 'nextSampleId'
>;

export interface SearchHit {
  sampleId: number;
  /** UTF-16 offsets into the *original* sample text. */
  ranges: Array<{ start: number; end: number }>;
}

export interface RankedSample {
  sampleId: number;
  text: string;
  /** 0-based sort position among the full sample list. */
  rank: number;
  /**
   * 0-based index of the tie group: samples with equal collation keys share
   * a group, and within a group they are ordered by sample id (stable
   * tie-break). -1 means the row participates in no tie.
   */
  tieGroup: number;
  /** Match ranges, empty when there is no query or no hit. */
  ranges: Array<{ start: number; end: number }>;
}

export interface EvaluationResult {
  ranked: RankedSample[];
  hits: SearchHit[];
  /** Config echoed back so stale results can be detected. */
  config: CollationConfig;
  evaluatedAt: string;
}

export interface ExperimentListEntry {
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
}

/** Error body returned for 4xx responses. */
export interface ApiErrorBody {
  error: string;
}

/** 409 payload for a stale revision: carries the winning server document. */
export interface ConflictBody extends ApiErrorBody {
  server: Experiment;
}

export function isConflictBody(value: unknown): value is ConflictBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ConflictBody).error === 'string' &&
    typeof (value as ConflictBody).server === 'object'
  );
}

export const DEFAULT_CONFIG: CollationConfig = {
  locale: 'en',
  sensitivity: 'variant',
  numeric: false,
};
