import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Experiment,
  ExperimentPayload,
  ExperimentResults,
  ExperimentSummary,
} from '../../shared/types';
import * as api from './api';
import { mergeExperiments } from './diff';
import { ConfigPanel } from './components/ConfigPanel';
import { RowsEditor } from './components/RowsEditor';
import { SortResults } from './components/SortResults';
import { SearchResults } from './components/SearchResults';
import { ConflictDialog } from './components/ConflictDialog';

function payloadOf(e: ExperimentPayload): ExperimentPayload {
  return { name: e.name, config: e.config, samples: e.samples, queries: e.queries };
}

export default function App() {
  const [list, setList] = useState<ExperimentSummary[]>([]);
  const [exp, setExp] = useState<Experiment | null>(null);
  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<Experiment | null>(null);
  const [view, setView] = useState<'edit' | 'results'>('edit');
  const [status, setStatus] = useState('');
  const statusTimer = useRef<ReturnType<typeof setTimeout>>();

  const flash = useCallback((msg: string) => {
    setStatus(msg);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), 4000);
  }, []);

  // 初始加载：无实验则创建带种子数据的一个
  useEffect(() => {
    (async () => {
      const { experiments } = await api.listExperiments();
      if (experiments.length === 0) {
        const { experiment } = await api.createExperiment();
        setList([{ id: experiment.id, name: experiment.name, revision: experiment.revision, updatedAt: experiment.updatedAt }]);
        setExp(experiment);
      } else {
        setList(experiments);
        const { experiment } = await api.getExperiment(experiments[experiments.length - 1]!.id);
        setExp(experiment);
      }
    })().catch((e) => flash(`加载失败：${e.message}`));
  }, [flash]);

  const openExperiment = useCallback(
    async (id: string) => {
      const { experiment } = await api.getExperiment(id);
      setExp(experiment);
      setDirty(false);
      setConflict(null);
      setSelected(new Set());
    },
    [],
  );

  const createExperiment = useCallback(async () => {
    const { experiment } = await api.createExperiment();
    setList((l) => [...l, { id: experiment.id, name: experiment.name, revision: experiment.revision, updatedAt: experiment.updatedAt }]);
    setExp(experiment);
    setDirty(false);
    setConflict(null);
    setSelected(new Set());
    flash(`已创建实验 r${experiment.revision}`);
  }, [flash]);

  // 编辑内容变化 → 防抖调用服务端预览，结果始终由服务端稳定生成
  const payloadKey = exp ? JSON.stringify(payloadOf(exp)) : '';
  useEffect(() => {
    if (!exp) return;
    const t = setTimeout(() => {
      api
        .previewResults(payloadOf(exp))
        .then(({ results }) => setResults(results))
        .catch((e) => flash(`结果生成失败：${e.message}`));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  // 样本被删除后清理对应选中项
  useEffect(() => {
    if (!exp) return;
    setSelected((prev) => {
      const ids = new Set(exp.samples.map((s) => s.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [exp]);

  const edit = useCallback((patch: Partial<ExperimentPayload>) => {
    setExp((e) => (e ? { ...e, ...patch } : e));
    setDirty(true);
  }, []);

  const doSave = useCallback(
    async (baseRevision: number, payload: ExperimentPayload) => {
      if (!exp) return;
      try {
        const outcome = await api.saveExperiment(exp.id, baseRevision, payload);
        if (outcome.ok) {
          setExp(outcome.experiment);
          setDirty(false);
          setConflict(null);
          setList((l) =>
            l.map((s) =>
              s.id === exp.id
                ? { ...s, name: outcome.experiment.name, revision: outcome.experiment.revision, updatedAt: outcome.experiment.updatedAt }
                : s,
            ),
          );
          flash(`已保存 r${outcome.experiment.revision}`);
        } else {
          // 409：保留本地更改，仅记录服务端版本以展示差异
          setConflict(outcome.current);
          flash(`冲突：服务端已是 r${outcome.current.revision}`);
        }
      } catch (e) {
        flash(`保存失败：${(e as Error).message}`);
      }
    },
    [exp, flash],
  );

  const save = useCallback(() => {
    if (exp) void doSave(exp.revision, payloadOf(exp));
  }, [exp, doSave]);

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const sortedIds = results?.sorted ?? [];
  const selectAll = useCallback(
    () => setSelected((prev) => new Set([...prev, ...sortedIds])),
    [sortedIds],
  );

  const samplesById = useMemo(
    () => new Map((exp?.samples ?? []).map((s) => [s.id, s])),
    [exp?.samples],
  );

  if (!exp) return <div className="loading">加载中…</div>;

  return (
    <div className="app">
      <header>
        <h1>Unicode 排序与检索工作台</h1>
        <div className="bar">
          <select value={exp.id} onChange={(e) => void openExperiment(e.target.value)}>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（r{s.revision}）
              </option>
            ))}
          </select>
          <button onClick={() => void createExperiment()}>新建实验</button>
          <input
            className="name"
            value={exp.name}
            onChange={(e) => edit({ name: e.target.value })}
            placeholder="实验名称"
          />
          <span className="rev">r{exp.revision}</span>
          {dirty && <span className="dirty">●未保存</span>}
          {conflict && <span className="conflict-flag">⚠ 冲突</span>}
          <button className="primary" onClick={save} disabled={!dirty && !conflict}>
            保存
          </button>
          <span className="status">{status}</span>
        </div>
        <nav className="tabs">
          <button className={view === 'edit' ? 'active' : ''} onClick={() => setView('edit')}>
            编辑
          </button>
          <button className={view === 'results' ? 'active' : ''} onClick={() => setView('results')}>
            结果
          </button>
        </nav>
      </header>

      <main>
        {/* 两个面板始终挂载，窄屏下仅切换可见性，状态不重置 */}
        <div className={`pane edit ${view === 'edit' ? 'active' : ''}`}>
          <ConfigPanel config={exp.config} onChange={(config) => edit({ config })} />
          <RowsEditor
            title="样本"
            rows={exp.samples}
            placeholder="输入样本字符串"
            onChange={(samples) => edit({ samples })}
          />
          <RowsEditor
            title="查询"
            rows={exp.queries}
            placeholder="输入查询串"
            onChange={(queries) => edit({ queries })}
          />
        </div>
        <div className={`pane results ${view === 'results' ? 'active' : ''}`}>
          <SortResults
            results={results}
            samples={exp.samples}
            selected={selected}
            onToggle={toggleSelect}
            onSelectAll={selectAll}
            onClear={() => setSelected(new Set())}
          />
          <SearchResults results={results} queries={exp.queries} samples={exp.samples} />
          {selected.size > 0 && (
            <section className="card">
              <h3>当前选中（{selected.size}）</h3>
              <p className="selected-list">
                {[...selected]
                  .sort((a, b) => a - b)
                  .map((id) => (
                    <span key={id} className="badge" title={samplesById.get(id)?.text}>
                      #{id}
                    </span>
                  ))}
              </p>
            </section>
          )}
        </div>
      </main>

      {conflict && (
        <ConflictDialog
          local={payloadOf(exp)}
          server={conflict}
          onClose={() => setConflict(null)}
          onUseServer={() => {
            setExp(conflict);
            setDirty(false);
            setConflict(null);
            flash(`已加载服务端 r${conflict.revision}`);
          }}
          onForceLocal={() => void doSave(conflict.revision, payloadOf(exp))}
          onMerge={() => void doSave(conflict.revision, mergeExperiments(payloadOf(exp), conflict))}
        />
      )}
    </div>
  );
}
