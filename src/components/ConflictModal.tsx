import { useMemo, useState } from 'react';
import type { Experiment, ExperimentContent } from '../types';
import { diffWords, type DiffPart } from '../lib/diff';
import {
  mergeExperiments,
  resolveMerge,
  SCALAR_FIELDS,
  type MergeChoice,
  type MergeState,
  type Resolutions,
  type ScalarField,
} from '../lib/merge';

export interface ConflictModalProps {
  base: Experiment;
  local: ExperimentContent;
  server: Experiment;
  onCancel: () => void;
  onResolved: (content: ExperimentContent) => void;
}

const FIELD_LABELS: Record<ScalarField, string> = {
  name: '名称',
  locale: 'Locale',
  sensitivity: '灵敏度',
  numeric: '数字排序',
  query: '查询',
};

function format(v: string | boolean): string {
  return typeof v === 'boolean' ? (v ? '开' : '关') : v;
}

function InlineDiff({ before, after }: { before: string; after: string }) {
  const parts: DiffPart[] = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <>
      {parts.map((p, i) =>
        p.op === 'equal' ? (
          <span key={i}>{p.value}</span>
        ) : p.op === 'insert' ? (
          <span key={i} className="diff-ins">
            {p.value}
          </span>
        ) : (
          <span key={i} className="diff-del">
            {p.value}
          </span>
        ),
      )}
    </>
  );
}

export function ConflictModal({ base, local, server, onCancel, onResolved }: ConflictModalProps) {
  const state: MergeState = useMemo(
    () => mergeExperiments(base, local, server),
    [base, local, server],
  );
  const [resolutions, setResolutions] = useState<Resolutions>({ fields: {}, rows: {} });

  const setField = (field: ScalarField, choice: MergeChoice) =>
    setResolutions((r) => ({ ...r, fields: { ...r.fields, [field]: choice } }));
  const setRow = (key: number, choice: MergeChoice) =>
    setResolutions((r) => ({ ...r, rows: { ...r.rows, [key]: choice } }));

  const conflictRows = state.rows.filter((e) => e.conflict);
  const fieldConflicts = SCALAR_FIELDS.filter((f) => state.scalars[f].conflict);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="版本冲突">
      <div className="modal">
        <header>
          <h3>检测到并发修改（revision {base.revision} → {server.revision}）</h3>
          <p>
            另一个标签页已先保存。你本地的更改已保留，下面只列出真正冲突的部分；
            互不影响的更改已自动合并。为每项选择保留本地或采用服务器版本。
          </p>
        </header>
        <div className="modal-body">
          {!state.hasConflicts && (
            <p style={{ color: 'var(--ok)' }}>
              没有实际冲突，所有更改可以直接合并，点击“合并并保存”即可。
            </p>
          )}

          {fieldConflicts.length > 0 && (
            <>
              <div className="conflict-section-title">字段冲突</div>
              {fieldConflicts.map((f) => {
                const c = state.scalars[f].conflict!;
                const choice = resolutions.fields[f] ?? 'server';
                return (
                  <div className="conflict-item" key={f}>
                    <strong>{FIELD_LABELS[f]}</strong>
                    <div className="choices">
                      <button
                        type="button"
                        className={`choice ${choice === 'local' ? 'applied-local' : ''}`}
                        onClick={() => setField(f, 'local')}
                      >
                        <span className="choice-label">本地（相对基线）</span>
                        <span className="choice-value">
                          <InlineDiff before={format(c.base)} after={format(c.local)} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`choice ${choice === 'server' ? 'applied-server' : ''}`}
                        onClick={() => setField(f, 'server')}
                      >
                        <span className="choice-label">服务器版本 r{server.revision}</span>
                        <span className="choice-value">{format(c.server)}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {conflictRows.length > 0 && (
            <>
              <div className="conflict-section-title">
                样本冲突（{conflictRows.length}）
              </div>
              {conflictRows.map((entry) => {
                const c = entry.conflict!;
                const choice = resolutions.rows[c.key] ?? 'server';
                return (
                  <div className="conflict-item" key={c.key}>
                    <strong>
                      样本 #{c.key}
                      {c.kind === 'editVsEdit' && ' · 双方都编辑了'}
                      {c.kind === 'deleteVsEdit' && ' · 一方删除，一方编辑'}
                      {c.kind === 'bothAdded' && ' · 双方都新增（id 相同）'}
                    </strong>
                    <div className="choices">
                      {c.local !== undefined ? (
                        <button
                          type="button"
                          className={`choice ${choice === 'local' ? 'applied-local' : ''}`}
                          onClick={() => setRow(c.key, 'local')}
                        >
                          <span className="choice-label">
                            {c.kind === 'deleteVsEdit' ? '保留本地编辑' : '本地版本'}
                          </span>
                          <span className="choice-value">
                            {c.baseText !== undefined ? (
                              <InlineDiff before={c.baseText} after={c.local.text} />
                            ) : (
                              c.local.text
                            )}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`choice ${choice === 'local' ? 'applied-local' : ''}`}
                          onClick={() => setRow(c.key, 'local')}
                        >
                          <span className="choice-label">本地版本（删除）</span>
                          <span className="choice-value" style={{ color: 'var(--danger)' }}>
                            删除该行
                          </span>
                        </button>
                      )}
                      {c.server !== undefined ? (
                        <button
                          type="button"
                          className={`choice ${choice === 'server' ? 'applied-server' : ''}`}
                          onClick={() => setRow(c.key, 'server')}
                        >
                          <span className="choice-label">服务器版本 r{server.revision}</span>
                          <span className="choice-value">{c.server.text}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`choice ${choice === 'server' ? 'applied-server' : ''}`}
                          onClick={() => setRow(c.key, 'server')}
                        >
                          <span className="choice-label">服务器版本（删除）</span>
                          <span className="choice-value" style={{ color: 'var(--danger)' }}>
                            删除该行
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <footer>
          <button className="btn" onClick={onCancel}>
            取消（继续保留本地更改）
          </button>
          <button
            className="btn primary"
            onClick={() => onResolved(resolveMerge(state, resolutions))}
          >
            合并并保存
          </button>
        </footer>
      </div>
    </div>
  );
}
