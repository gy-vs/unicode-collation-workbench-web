import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Experiment, ExperimentPayload, ExperimentSummary } from '../../shared/types';
import { sanitizePayload } from '../../shared/validate';

export class ConflictError extends Error {
  constructor(public readonly current: Experiment) {
    super(`revision conflict: current is r${current.revision}`);
    this.name = 'ConflictError';
  }
}

/**
 * 实验存储：内存 Map + 可选 JSON 文件持久化。
 * revision 单调递增，update 采用乐观并发：baseRevision 不匹配即拒绝。
 */
export class Store {
  private experiments = new Map<string, Experiment>();

  constructor(private readonly file?: string) {
    if (file) this.load(file);
  }

  private load(file: string) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as Experiment[];
      for (const e of data) this.experiments.set(e.id, e);
    } catch {
      // 文件不存在或损坏：以空库启动
    }
  }

  private persist() {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify([...this.experiments.values()], null, 2));
    } catch {
      // 持久化失败不影响内存态
    }
  }

  list(): ExperimentSummary[] {
    return [...this.experiments.values()]
      .map(({ id, name, revision, updatedAt }) => ({ id, name, revision, updatedAt }))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  }

  get(id: string): Experiment | undefined {
    return this.experiments.get(id);
  }

  create(payload: ExperimentPayload): Experiment {
    const now = new Date().toISOString();
    const exp: Experiment = { ...payload, id: randomUUID(), revision: 1, updatedAt: now };
    this.experiments.set(exp.id, exp);
    this.persist();
    return exp;
  }

  /** @throws ConflictError 当 baseRevision 与当前 revision 不一致 */
  update(id: string, baseRevision: number, payload: ExperimentPayload): Experiment {
    const cur = this.experiments.get(id);
    if (!cur) throw new Error('not found');
    if (cur.revision !== baseRevision) throw new ConflictError(cur);
    const next: Experiment = {
      ...payload,
      id,
      revision: cur.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.experiments.set(id, next);
    this.persist();
    return next;
  }

  remove(id: string): boolean {
    const ok = this.experiments.delete(id);
    if (ok) this.persist();
    return ok;
  }
}

export function parsePayload(body: unknown): ExperimentPayload {
  return sanitizePayload(body);
}
