import type {
  ConflictBody,
  EvaluationResult,
  Experiment,
  ExperimentContent,
  ExperimentListEntry,
} from '../types';
import { isConflictBody } from '../types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface LoadedExperiment {
  experiment: Experiment;
  results: EvaluationResult;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && typeof (body as any).error === 'string'
        ? (body as any).error
        : `请求失败 (${res.status})`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export const api = {
  list: () =>
    request<{ experiments: ExperimentListEntry[] }>('/api/experiments'),

  get: (id: string) => request<LoadedExperiment>(`/api/experiments/${id}`),

  create: (name: string) =>
    request<LoadedExperiment>('/api/experiments', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  save: (id: string, baseRevision: number, content: ExperimentContent) =>
    request<LoadedExperiment>(`/api/experiments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ baseRevision, content }),
    }),
};

export { isConflictBody };
export type { ConflictBody };
