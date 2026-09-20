import { describe, expect, it } from 'vitest';
import { mergeExperiments, resolveMerge } from './merge';
import type { Experiment, ExperimentContent } from '../types';

const baseExperiment = (over: Partial<Experiment> = {}): Experiment => ({
  id: 'e1',
  name: 'base',
  locale: 'en',
  sensitivity: 'variant',
  numeric: false,
  query: '',
  samples: [
    { id: 1, text: 'alpha' },
    { id: 2, text: 'bravo' },
    { id: 3, text: 'charlie' },
  ],
  nextSampleId: 4,
  revision: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const contentOf = (e: Experiment): ExperimentContent => ({
  name: e.name,
  locale: e.locale,
  sensitivity: e.sensitivity,
  numeric: e.numeric,
  query: e.query,
  samples: e.samples,
  nextSampleId: e.nextSampleId,
});

describe('mergeExperiments', () => {
  it('auto-merges non-overlapping edits', () => {
    const base = baseExperiment();
    const local: ExperimentContent = {
      ...contentOf(base),
      name: 'local name',
    };
    const server: Experiment = {
      ...base,
      revision: 2,
      query: 'server query',
    };
    const state = mergeExperiments(base, local, server);
    expect(state.hasConflicts).toBe(false);
    expect(state.scalars.name.value).toBe('local name');
    expect(state.scalars.query.value).toBe('server query');
  });

  it('reports a scalar conflict when both sides edit differently', () => {
    const base = baseExperiment();
    const local = { ...contentOf(base), name: 'LOCAL' };
    const server = { ...base, revision: 2, name: 'SERVER' };
    const state = mergeExperiments(base, local, server);
    expect(state.scalars.name.conflict).not.toBeNull();
    expect(state.scalars.name.conflict).toMatchObject({
      local: 'LOCAL',
      server: 'SERVER',
    });
  });

  it('merges independent row edits and additions without conflict', () => {
    const base = baseExperiment();
    const local: ExperimentContent = {
      ...contentOf(base),
      samples: [
        { id: 1, text: 'alpha-edited-local' },
        { id: 2, text: 'bravo' },
        { id: 3, text: 'charlie' },
        { id: 4, text: 'local add' },
      ],
      nextSampleId: 5,
    };
    const server: Experiment = {
      ...base,
      revision: 2,
      samples: [
        { id: 1, text: 'alpha' },
        { id: 2, text: 'bravo-edit-server' },
        { id: 3, text: 'charlie' },
      ],
    };
    const state = mergeExperiments(base, local, server);
    expect(state.hasConflicts).toBe(false);
    const texts = state.rows.map((r) => r.row?.text).filter(Boolean);
    expect(texts).toContain('alpha-edited-local');
    expect(texts).toContain('bravo-edit-server');
    expect(texts).toContain('local add');
  });

  it('flags edit-vs-edit and delete-vs-edit row conflicts', () => {
    const base = baseExperiment();
    // Local edits id1, deletes id2 (untouched on server → clean delete) and
    // deletes id3 (edited on server → deleteVsEdit conflict).
    const local: ExperimentContent = {
      ...contentOf(base),
      samples: [{ id: 1, text: 'alpha-L' }],
    };
    const server: Experiment = {
      ...base,
      revision: 2,
      samples: [
        { id: 1, text: 'alpha-S' },
        { id: 2, text: 'bravo' },
        { id: 3, text: 'charlie-S' },
      ],
    };
    const state = mergeExperiments(base, local, server);
    const kinds = state.rows.map((r) => r.conflict?.kind);
    expect(kinds).toContain('editVsEdit');
    expect(kinds).toContain('deleteVsEdit');
    // id2 was deleted locally and left alone on server: no row, no conflict.
    expect(state.rows.some((r) => r.row?.id === 2 || r.conflict?.key === 2)).toBe(
      false,
    );
  });

  it('both sides deleting, or one deleting an untouched row, is clean', () => {
    const base = baseExperiment();
    const local: ExperimentContent = {
      ...contentOf(base),
      samples: [{ id: 1, text: 'alpha' }, { id: 2, text: 'bravo' }],
    };
    const server: Experiment = {
      ...base,
      revision: 2,
      // id2 also deleted on server; id3 deleted only on server but untouched locally
      samples: [{ id: 1, text: 'alpha' }],
    };
    const state = mergeExperiments(base, local, server);
    expect(state.hasConflicts).toBe(false);
    expect(state.rows.map((r) => r.row?.text)).toEqual(['alpha']);
  });

  it('keeps consecutive local additions in their local order', () => {
    const base = baseExperiment();
    const local: ExperimentContent = {
      ...contentOf(base),
      samples: [
        { id: 1, text: 'alpha' },
        { id: 2, text: 'bravo' },
        { id: 3, text: 'charlie' },
        { id: 4, text: 'new-one' },
        { id: 5, text: 'new-two' },
        { id: 6, text: 'new-three' },
      ],
      nextSampleId: 7,
    };
    const server: Experiment = { ...base, revision: 2 };
    const state = mergeExperiments(base, local, server);
    expect(state.hasConflicts).toBe(false);
    expect(state.rows.slice(3).map((r) => r.row?.text)).toEqual([
      'new-one',
      'new-two',
      'new-three',
    ]);
  });
});

describe('resolveMerge', () => {
  it('defaults conflicts to server, keeps auto-merged values', () => {
    const base = baseExperiment();
    const local: ExperimentContent = {
      ...contentOf(base),
      name: 'LOCAL',
      samples: [
        { id: 1, text: 'alpha-L' },
        { id: 2, text: 'bravo' },
        { id: 3, text: 'charlie' },
      ],
    };
    const server: Experiment = {
      ...base,
      revision: 2,
      name: 'SERVER',
      samples: [
        { id: 1, text: 'alpha-S' },
        { id: 2, text: 'bravo' },
        { id: 3, text: 'charlie' },
      ],
    };
    const state = mergeExperiments(base, local, server);
    const resolved = resolveMerge(state, { fields: {}, rows: {} });
    expect(resolved.name).toBe('SERVER');
    expect(resolved.samples.find((s) => s.id === 1)?.text).toBe('alpha-S');
  });

  it('local choices win when selected and bothAdded local row is renumbered', () => {
    const base = baseExperiment();
    const local: ExperimentContent = {
      ...contentOf(base),
      samples: [
        { id: 1, text: 'alpha' },
        { id: 2, text: 'bravo' },
        { id: 3, text: 'charlie' },
        { id: 4, text: 'local-row' },
      ],
      nextSampleId: 5,
    };
    const server: Experiment = {
      ...base,
      revision: 2,
      samples: [
        { id: 1, text: 'alpha' },
        { id: 2, text: 'bravo' },
        { id: 3, text: 'charlie' },
        { id: 4, text: 'server-row' },
      ],
      nextSampleId: 5,
    };
    const state = mergeExperiments(base, local, server);
    const conflict = state.rows.find((r) => r.conflict?.kind === 'bothAdded');
    expect(conflict).toBeTruthy();

    // Choosing local keeps only the renumbered local row.
    const localPick = resolveMerge(state, { fields: {}, rows: { 4: 'local' } });
    expect(localPick.samples.find((s) => s.text === 'server-row')).toBeUndefined();
    const renumbered = localPick.samples.find((s) => s.text === 'local-row');
    expect(renumbered?.id).toBe(5); // past server's id 4
    expect(localPick.nextSampleId).toBe(6);

    // Default/server choice keeps the server row at its original id.
    const serverPick = resolveMerge(state, { fields: {}, rows: {} });
    expect(serverPick.samples.map((s) => s.text)).toContain('server-row');
    expect(serverPick.samples.find((s) => s.text === 'local-row')).toBeUndefined();
  });

  it('deleteVsEdit local choice drops the row', () => {
    const base = baseExperiment();
    const local: ExperimentContent = {
      ...contentOf(base),
      samples: [{ id: 1, text: 'alpha' }, { id: 2, text: 'bravo' }],
    };
    const server: Experiment = {
      ...base,
      revision: 2,
      samples: [
        { id: 1, text: 'alpha' },
        { id: 2, text: 'bravo' },
        { id: 3, text: 'charlie-edited' },
      ],
    };
    const state = mergeExperiments(base, local, server);
    const localPick = resolveMerge(state, { fields: {}, rows: { 3: 'local' } });
    expect(localPick.samples.find((s) => s.id === 3)).toBeUndefined();
    const serverPick = resolveMerge(state, { fields: {}, rows: { 3: 'server' } });
    expect(serverPick.samples.find((s) => s.id === 3)?.text).toBe('charlie-edited');
  });
});
