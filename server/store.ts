/**
 * In-memory experiment store with optimistic concurrency control.
 *
 * A document is replaced only when the client presents the revision it read;
 * any other save is rejected with 409 and the current document. Restarting
 * the process re-seeds the demo experiment — persistence beyond the process
 * is intentionally out of scope.
 */

import type { Experiment, ExperimentContent } from '../src/types';
import { DEFAULT_CONFIG } from '../src/types';

const STORE = new Map<string, Experiment>();

export class StaleRevisionError extends Error {
  constructor(public server: Experiment) {
    super('REVISION_CONFLICT');
    this.name = 'StaleRevisionError';
  }
}

export class NotFoundError extends Error {
  constructor(public id: string) {
    super(`实验 ${id} 不存在`);
    this.name = 'NotFoundError';
  }
}

function randomId(): string {
  return (
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36).slice(-4)
  );
}

function seedDemo(): Experiment {
  // Covers every scenario the workbench is meant to compare.
  const samples = [
    { id: 1, text: 'café' },
    { id: 2, text: 'café' }, // cafe + combining acute (NFD form of café)
    { id: 3, text: 'CAFÉ' },
    { id: 4, text: 'CAFE' },
    { id: 5, text: 'İstanbul' }, // capital dotted I, Turkish fold → istanbul
    { id: 6, text: 'Istanbul' }, // ASCII capital I, Turkish fold → ıstanbul
    { id: 7, text: 'istanbul' },
    { id: 8, text: 'Straße' }, // Straße
    { id: 9, text: 'strasse' },
    { id: 10, text: 'ﬁle' }, // U+FB01 LATIN SMALL LIGATURE FI
    { id: 11, text: 'file' },
    { id: 12, text: '𝕦𝕟𝕚𝕔𝕠𝕕𝕖' }, // mathematical bold (surrogate pairs)
    { id: 13, text: '😀 smile' },
    { id: 14, text: 'File 2' },
    { id: 15, text: 'File 10' },
    { id: 16, text: 'file 1' },
  ];
  return {
    id: 'demo',
    name: 'Unicode 演示实验',
    query: 'cafe',
    samples,
    nextSampleId: 17,
    revision: 1,
    updatedAt: new Date().toISOString(),
    ...DEFAULT_CONFIG,
    sensitivity: 'base',
    numeric: true,
  };
}

STORE.set('demo', seedDemo());

export function listExperiments() {
  return [...STORE.values()]
    .map((e) => ({
      id: e.id,
      name: e.name,
      revision: e.revision,
      updatedAt: e.updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getExperiment(id: string): Experiment {
  const doc = STORE.get(id);
  if (!doc) throw new NotFoundError(id);
  return doc;
}

export function createExperiment(name: string): Experiment {
  const id = randomId();
  const now = new Date().toISOString();
  const doc: Experiment = {
    id,
    name: name.trim() || '未命名实验',
    query: '',
    samples: [],
    nextSampleId: 1,
    revision: 1,
    updatedAt: now,
    ...DEFAULT_CONFIG,
  };
  STORE.set(id, doc);
  return doc;
}

/**
 * Conditional replace. `baseRevision` must equal the stored revision; the
 * base document is returned alongside the winner on mismatch so the client
 * can perform a three-way merge without an extra round trip.
 */
export function saveExperiment(
  id: string,
  baseRevision: number,
  content: ExperimentContent,
): Experiment {
  const current = STORE.get(id);
  if (!current) throw new NotFoundError(id);
  if (current.revision !== baseRevision) {
    throw new StaleRevisionError(current);
  }
  const next: Experiment = {
    ...content,
    id,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  STORE.set(id, next);
  return next;
}
