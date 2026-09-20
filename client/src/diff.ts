import type { ExperimentPayload, Query, Sample } from '../../shared/types';

export interface RowChange<T> {
  id: number;
  local: T;
  server: T;
}

export interface ListDiff<T> {
  added: T[]; // 仅本地有
  removed: T[]; // 仅服务端有（相对本地）
  changed: RowChange<T>[];
}

export interface ExperimentDiff {
  name?: { local: string; server: string };
  collation: string[];
  search: string[];
  samples: ListDiff<Sample>;
  queries: ListDiff<Query>;
}

function diffList<T extends { id: number; text: string }>(local: T[], server: T[]): ListDiff<T> {
  const serverById = new Map(server.map((r) => [r.id, r]));
  const localById = new Map(local.map((r) => [r.id, r]));
  return {
    added: local.filter((r) => !serverById.has(r.id)),
    removed: server.filter((r) => !localById.has(r.id)),
    changed: local
      .filter((r) => serverById.has(r.id) && serverById.get(r.id)!.text !== r.text)
      .map((r) => ({ id: r.id, local: r, server: serverById.get(r.id)! })),
  };
}

function diffConfig(local: Record<string, unknown>, server: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(local), ...Object.keys(server)]);
  const out: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(local[k]) !== JSON.stringify(server[k])) {
      out.push(`${k}: 本地=${JSON.stringify(local[k])} / 服务端=${JSON.stringify(server[k])}`);
    }
  }
  return out;
}

export function diffExperiments(
  local: ExperimentPayload,
  server: ExperimentPayload,
): ExperimentDiff {
  return {
    name: local.name !== server.name ? { local: local.name, server: server.name } : undefined,
    collation: diffConfig(
      local.config.collation as unknown as Record<string, unknown>,
      server.config.collation as unknown as Record<string, unknown>,
    ),
    search: diffConfig(
      local.config.search as unknown as Record<string, unknown>,
      server.config.search as unknown as Record<string, unknown>,
    ),
    samples: diffList(local.samples, server.samples),
    queries: diffList(local.queries, server.queries),
  };
}

export function isEmptyDiff(d: ExperimentDiff): boolean {
  return (
    !d.name &&
    d.collation.length === 0 &&
    d.search.length === 0 &&
    d.samples.added.length === 0 &&
    d.samples.removed.length === 0 &&
    d.samples.changed.length === 0 &&
    d.queries.added.length === 0 &&
    d.queries.removed.length === 0 &&
    d.queries.changed.length === 0
  );
}

/** 按 id 求并集：保留服务端顺序，本地修改覆盖同名 id，本地新增追加在末尾 */
function mergeList<T extends { id: number }>(server: T[], local: T[]): T[] {
  const localById = new Map(local.map((r) => [r.id, r]));
  const merged = server.map((r) => localById.get(r.id) ?? r);
  for (const r of local) if (!server.some((s) => s.id === r.id)) merged.push(r);
  return merged;
}

/** 自动合并：名称与配置取本地，样本/查询按 id 取并集（冲突时本地优先） */
export function mergeExperiments(
  local: ExperimentPayload,
  server: ExperimentPayload,
): ExperimentPayload {
  return {
    name: local.name,
    config: local.config,
    samples: mergeList(server.samples, local.samples),
    queries: mergeList(server.queries, local.queries),
  };
}
