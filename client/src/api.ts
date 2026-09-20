import type {
  Experiment,
  ExperimentPayload,
  ExperimentResults,
  ExperimentSummary,
} from '../../shared/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export function listExperiments(): Promise<{ experiments: ExperimentSummary[] }> {
  return request('/api/experiments');
}

export function createExperiment(): Promise<{ experiment: Experiment }> {
  return request('/api/experiments', { method: 'POST', body: '{}' });
}

export function getExperiment(id: string): Promise<{ experiment: Experiment }> {
  return request(`/api/experiments/${id}`);
}

export type SaveOutcome =
  | { ok: true; experiment: Experiment }
  | { ok: false; current: Experiment };

export async function saveExperiment(
  id: string,
  baseRevision: number,
  payload: ExperimentPayload,
): Promise<SaveOutcome> {
  const res = await fetch(`/api/experiments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision, ...payload }),
  });
  if (res.status === 409) {
    const body = (await res.json()) as { current: Experiment };
    return { ok: false, current: body.current };
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = (await res.json()) as { experiment: Experiment };
  return { ok: true, experiment: body.experiment };
}

export function previewResults(payload: ExperimentPayload): Promise<{ results: ExperimentResults }> {
  return request('/api/results/preview', { method: 'POST', body: JSON.stringify(payload) });
}
