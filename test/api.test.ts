// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { app } from '../server/index';
import type { Experiment, ExperimentContent } from '../src/types';

let server: Server;
let origin: string;

const validContent = (e: Experiment): ExperimentContent => ({
  name: e.name,
  locale: e.locale,
  sensitivity: e.sensitivity,
  numeric: e.numeric,
  query: e.query,
  samples: e.samples,
  nextSampleId: e.nextSampleId,
});

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  origin = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => server.close());

const j = async (path: string, init?: RequestInit) => {
  const res = await fetch(`${origin}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json();
  return { status: res.status, body };
};

describe('experiment API', () => {
  it('lists and reads the seeded demo with stable results', async () => {
    const list = await j('/api/experiments');
    expect(list.status).toBe(200);
    expect(list.body.experiments.some((e: any) => e.id === 'demo')).toBe(true);

    const got = await j('/api/experiments/demo');
    expect(got.status).toBe(200);
    expect(got.body.experiment.revision).toBe(1);
    expect(Array.isArray(got.body.results.ranked)).toBe(true);
    // base sensitivity + query "cafe" must hit café variants with ranges
    const cafeHits = got.body.results.hits.filter((h: any) =>
      h.ranges.some((r: any) => got.body.experiment.samples.find((s: any) => s.id === h.sampleId)
        ?.text.slice(r.start, r.end)
        .includes('caf')),
    );
    expect(cafeHits.length).toBeGreaterThan(0);
  });

  it('creates an experiment', async () => {
    const res = await j('/api/experiments', {
      method: 'POST',
      body: JSON.stringify({ name: 'concurrent test' }),
    });
    expect(res.status).toBe(201);
    expect(res.body.experiment.revision).toBe(1);
  });

  it('bumps revision on save and rejects stale revision with 409 + server doc', async () => {
    const created = await j('/api/experiments', {
      method: 'POST',
      body: JSON.stringify({ name: 'rev' }),
    });
    const id = created.body.experiment.id;
    const content = validContent(created.body.experiment);

    const first = await j(`/api/experiments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ baseRevision: 1, content }),
    });
    expect(first.status).toBe(200);
    expect(first.body.experiment.revision).toBe(2);

    // Stale client retries revision 1.
    const stale = await j(`/api/experiments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ baseRevision: 1, content }),
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('REVISION_CONFLICT');
    expect(stale.body.server.revision).toBe(2);

    // Fresh revision accepted.
    const fresh = await j(`/api/experiments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ baseRevision: 2, content }),
    });
    expect(fresh.status).toBe(200);
    expect(fresh.body.experiment.revision).toBe(3);
  });

  it('rejects malformed content', async () => {
    const res = await j('/api/experiments/demo', {
      method: 'PUT',
      body: JSON.stringify({ baseRevision: 1, content: { nope: true } }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate sample ids', async () => {
    const got = await j('/api/experiments', {
      method: 'POST',
      body: JSON.stringify({ name: 'dup' }),
    });
    const content: ExperimentContent = {
      ...validContent(got.body.experiment),
      samples: [
        { id: 1, text: 'a' },
        { id: 1, text: 'b' },
      ],
      nextSampleId: 2,
    };
    const res = await j(`/api/experiments/${got.body.experiment.id}`, {
      method: 'PUT',
      body: JSON.stringify({ baseRevision: 1, content }),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/重复/);
  });

  it('returns 404 for unknown experiments', async () => {
    const res = await j('/api/experiments/does-not-exist');
    expect(res.status).toBe(404);
  });
});
